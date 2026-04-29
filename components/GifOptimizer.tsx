'use client';

import { useState } from 'react';
import BatchDropZone from './BatchDropZone';
import FFmpegLoader from './FFmpegLoader';
import { loadFFmpeg, fetchFile, formatBytes, fileDataToBlob } from '@/lib/ffmpeg';
import { type BatchItem, createBatchItems, makeOutputName } from '@/lib/batch';
import { downloadAsZip } from '@/lib/zip';

type Dither = 'bayer' | 'floyd_steinberg' | 'sierra2_4a' | 'none';
type RunStatus = 'idle' | 'loading' | 'running' | 'done';

const DITHER_OPTIONS: { value: Dither; label: string; hint: string }[] = [
  { value: 'bayer',           label: 'Bayer',           hint: 'Fast, good size reduction' },
  { value: 'floyd_steinberg', label: 'Floyd-Steinberg', hint: 'Smoother gradients' },
  { value: 'sierra2_4a',      label: 'Sierra',          hint: 'Best quality, slower' },
  { value: 'none',            label: 'None',            hint: 'Smallest file, banding' },
];

export default function GifOptimizer() {
  const [items, setItems]         = useState<BatchItem[]>([]);
  const [runStatus, setRunStatus] = useState<RunStatus>('idle');
  const [gifsicleActive, setGifsicleActive] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  // FFmpeg options
  const [colors, setColors]         = useState(128);
  const [width, setWidth]           = useState(0);
  const [fps, setFps]               = useState(0);
  const [dither, setDither]         = useState<Dither>('bayer');
  const [bayerScale, setBayerScale] = useState(2);
  const [optimizeBg, setOptimizeBg] = useState(false);

  // Gifsicle lossy
  const [lossyEnabled, setLossyEnabled] = useState(false);
  const [lossy, setLossy]               = useState(45);

  const addFiles   = (files: File[]) => setItems((p) => [...p, ...createBatchItems(files)]);
  const removeItem = (id: string)    => setItems((p) => p.filter((i) => i.id !== id));
  const updateItem = (id: string, patch: Partial<BatchItem>) =>
    setItems((p) => p.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const run = async () => {
    const pending = items.filter((i) => i.status === 'pending');
    if (pending.length === 0) return;
    setError(null);

    const statsMode    = optimizeBg ? 'diff' : 'full';
    const ditheringArg = dither === 'bayer'
      ? `dither=bayer:bayer_scale=${bayerScale}` : `dither=${dither}`;
    const prefixFilters = [
      fps > 0   ? `fps=${fps}`                         : '',
      width > 0 ? `scale=${width}:-1:flags=lanczos`   : '',
    ].filter(Boolean).join(',');
    const vf = `${prefixFilters ? prefixFilters + ',' : ''}split[s0][s1];[s0]palettegen=max_colors=${colors}:stats_mode=${statsMode}[p];[s1][p]paletteuse=${ditheringArg}`;

    try {
      setRunStatus('loading');
      const ffmpeg = await loadFFmpeg();
      setRunStatus('running');

      const usedNames = new Set<string>();

      for (const item of pending) {
        updateItem(item.id, { status: 'processing', progress: 0 });
        const handler = ({ progress: p }: { progress: number }) =>
          updateItem(item.id, { progress: p });
        ffmpeg.on('progress', handler);

        try {
          await ffmpeg.writeFile('input.gif', await fetchFile(item.file));
          await ffmpeg.exec(['-i', 'input.gif', '-vf', vf, '-loop', '0', 'output.gif']);

          const data = await ffmpeg.readFile('output.gif');
          let blob = fileDataToBlob(data, 'image/gif');

          await ffmpeg.deleteFile('input.gif');
          await ffmpeg.deleteFile('output.gif');

          // Gifsicle lossy pass
          if (lossyEnabled && lossy > 0) {
            ffmpeg.off('progress', handler);
            setGifsicleActive(true);
            const gifsicle = (await import('gifsicle-wasm-browser')).default;
            const inputFile = new File([blob], '1.gif', { type: 'image/gif' });
            const results = await gifsicle.run({
              input: [{ file: inputFile, name: '1.gif' }],
              command: [`-O1 --lossy=${lossy} 1.gif -o /out/out.gif`],
            });
            setGifsicleActive(false);
            if (results?.length > 0) blob = results[0];
          }

          const outName = makeOutputName(item.file.name, '_optimized', 'gif', usedNames);
          updateItem(item.id, { status: 'done', progress: 1, outputBlob: blob, outputName: outName });
        } catch (err) {
          setGifsicleActive(false);
          updateItem(item.id, { status: 'error', error: err instanceof Error ? err.message : 'Failed' });
        } finally {
          ffmpeg.off('progress', handler);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load FFmpeg');
    }

    setRunStatus('done');
  };

  const reset = () => { setItems([]); setRunStatus('idle'); setError(null); setGifsicleActive(false); };

  const doneItems    = items.filter((i) => i.status === 'done');
  const isRunning    = runStatus === 'loading' || runStatus === 'running';
  const pendingCount = items.filter((i) => i.status === 'pending').length;
  const totalSaved   = doneItems.reduce(
    (acc, i) => acc + (i.file.size - (i.outputBlob?.size ?? i.file.size)), 0
  );

  return (
    <div className="space-y-6">
      <BatchDropZone
        items={items}
        onAddFiles={addFiles}
        onRemove={removeItem}
        accept=".gif,image/gif"
        label="Drop GIF files here, or click to browse"
        disabled={isRunning}
      />

      {items.length > 0 && (
        <div className="space-y-6">
          {/* GIF Options */}
          <Section title="GIF Options">
            <SliderField label="Palette Colors" value={colors} displayValue={String(colors)}
              min={2} max={256} step={2}
              hint="Fewer colors = smaller file. 256 = full palette." onChange={setColors} />
            <SliderField label="Max FPS" value={fps} displayValue={fps === 0 ? 'Original' : String(fps)}
              min={0} max={30} step={1} hint="0 = keep original. Lower = smaller." onChange={setFps} />
            <SliderField label="Resize Width (px)" value={width} displayValue={width === 0 ? 'Original' : String(width)}
              min={0} max={1280} step={10} hint="0 = keep original dimensions." onChange={setWidth} />
          </Section>

          {/* Optimize GIF */}
          <Section title="Optimize GIF">
            <div className="space-y-2">
              <label className="text-sm text-zinc-400">Dithering Algorithm</label>
              <div className="grid grid-cols-2 gap-2">
                {DITHER_OPTIONS.map((d) => (
                  <button key={d.value} onClick={() => setDither(d.value)}
                    className={`text-left px-3 py-2 rounded-lg border text-sm transition-all ${
                      dither === d.value
                        ? 'border-[#E85D20] bg-[#E85D20]/10 text-white'
                        : 'border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600'
                    }`}>
                    <span className="font-medium block">{d.label}</span>
                    <span className="text-xs text-zinc-600">{d.hint}</span>
                  </button>
                ))}
              </div>
            </div>
            {dither === 'bayer' && (
              <SliderField label="Bayer Scale" value={bayerScale} displayValue={String(bayerScale)}
                min={0} max={5} step={1} hint="0 = fine, 5 = coarse." onChange={setBayerScale} />
            )}
            <Toggle label="Optimize for Static Background"
              hint="Assigns more palette colors to moving parts."
              checked={optimizeBg} onChange={setOptimizeBg} />
          </Section>

          {/* Lossy Compression */}
          <Section title="Lossy Compression">
            <div className="flex items-start gap-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50 px-3 py-2.5">
              <span className="text-lg leading-none mt-0.5">⚡</span>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Powered by <span className="text-white font-medium">gifsicle</span> — can reduce
                a 30 MB GIF to under 6 MB with minimal visible quality loss.
              </p>
            </div>
            <Toggle label="Enable Lossy Compression"
              hint="Runs gifsicle after FFmpeg. Adds a few seconds per file for large GIFs."
              checked={lossyEnabled} onChange={setLossyEnabled} />
            {lossyEnabled && (
              <SliderField label="Compression Level" value={lossy} displayValue={String(lossy)}
                min={1} max={200} step={1}
                hint={
                  lossy <= 30  ? `${lossy} — Light: barely noticeable` :
                  lossy <= 60  ? `${lossy} — Balanced: best trade-off ✓` :
                  lossy <= 100 ? `${lossy} — Aggressive: visible noise on gradients` :
                                 `${lossy} — Heavy: significant noise, extreme compression`
                }
                onChange={setLossy} />
            )}
          </Section>

          {runStatus === 'loading' && <FFmpegLoader />}

          {runStatus === 'running' && gifsicleActive && (
            <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4 flex items-center gap-3">
              <div className="h-4 w-4 rounded-full border-2 border-[#E85D20] border-t-transparent animate-spin flex-shrink-0" />
              <div>
                <p className="text-sm text-white font-medium">Gifsicle lossy pass…</p>
                <p className="text-xs text-zinc-500 mt-0.5">Applying lossy LZW compression</p>
              </div>
            </div>
          )}

          {!isRunning && pendingCount > 0 && (
            <button onClick={run}
              className="w-full py-3 rounded-xl bg-[#E85D20] hover:bg-[#d94f14] text-white font-semibold transition-colors">
              Optimize {pendingCount} GIF{pendingCount !== 1 ? 's' : ''}
            </button>
          )}

          {doneItems.length > 0 && !isRunning && (
            <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4 space-y-1">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-sm text-white font-medium">{doneItems.length}/{items.length} optimized</p>
                  {totalSaved > 0 && (
                    <p className="text-xs text-green-400">{formatBytes(totalSaved)} saved total</p>
                  )}
                </div>
                <div className="flex gap-2">
                  {doneItems.length >= 2 && (
                    <button onClick={() => downloadAsZip(items, 'convrt-optimized-gifs.zip')}
                      className="px-4 py-2 rounded-lg bg-[#E85D20] hover:bg-[#d94f14] text-white text-sm font-semibold transition-colors">
                      Download All (ZIP)
                    </button>
                  )}
                  <button onClick={reset}
                    className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm transition-colors">
                    Reset
                  </button>
                </div>
              </div>
            </div>
          )}

          {error && (
            <p className="text-red-400 text-sm rounded-xl bg-red-950/40 border border-red-900/50 px-4 py-3">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ── */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/60">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{title}</span>
      </div>
      <div className="p-4 space-y-4">{children}</div>
    </div>
  );
}

function SliderField({ label, value, displayValue, min, max, step, hint, onChange }: {
  label: string; value: number; displayValue: string; min: number; max: number; step: number; hint?: string; onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="text-zinc-400">{label}</span>
        <span className="text-white font-medium">{displayValue}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#E85D20] cursor-pointer" />
      {hint && <p className="text-xs text-zinc-600">{hint}</p>}
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: {
  label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div onClick={() => onChange(!checked)}
        className={`mt-0.5 w-5 h-5 rounded flex-shrink-0 border-2 flex items-center justify-center transition-all ${
          checked ? 'bg-[#E85D20] border-[#E85D20]' : 'border-zinc-600 group-hover:border-zinc-400'
        }`}>
        {checked && <span className="text-white text-xs leading-none">✓</span>}
      </div>
      <div>
        <p className="text-sm text-zinc-300">{label}</p>
        {hint && <p className="text-xs text-zinc-600 mt-0.5">{hint}</p>}
      </div>
    </label>
  );
}
