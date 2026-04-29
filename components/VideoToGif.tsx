'use client';

import { useState } from 'react';
import BatchDropZone from './BatchDropZone';
import FFmpegLoader from './FFmpegLoader';
import { loadFFmpeg, fetchFile, formatBytes, getFileExtension, fileDataToBlob } from '@/lib/ffmpeg';
import { type BatchItem, createBatchItems, makeOutputName } from '@/lib/batch';
import { downloadAsZip } from '@/lib/zip';

type Dither = 'bayer' | 'floyd_steinberg' | 'sierra2_4a' | 'none';
type RunStatus = 'idle' | 'loading' | 'running' | 'done';

const DITHER_OPTIONS: { value: Dither; label: string; hint: string }[] = [
  { value: 'bayer',            label: 'Bayer',           hint: 'Fast, good size reduction' },
  { value: 'floyd_steinberg',  label: 'Floyd-Steinberg', hint: 'Smoother gradients' },
  { value: 'sierra2_4a',       label: 'Sierra',          hint: 'Best quality, slower' },
  { value: 'none',             label: 'None',            hint: 'Smallest file, banding' },
];

export default function VideoToGif() {
  const [items, setItems]       = useState<BatchItem[]>([]);
  const [runStatus, setRunStatus] = useState<RunStatus>('idle');
  const [error, setError]       = useState<string | null>(null);

  // GIF Options
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd]     = useState(5);
  const [width, setWidth]         = useState(480);
  const [loopCount, setLoopCount] = useState(0);

  // Optimize GIF
  const [fps, setFps]             = useState(15);
  const [dither, setDither]       = useState<Dither>('bayer');
  const [bayerScale, setBayerScale] = useState(2);
  const [optimizeBg, setOptimizeBg] = useState(false);

  const duration = Math.max(1, trimEnd - trimStart);

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
      ? `dither=bayer:bayer_scale=${bayerScale}`
      : `dither=${dither}`;
    const vf = [
      `fps=${fps}`,
      `scale=${width}:-1:flags=lanczos`,
      `split[s0][s1];[s0]palettegen=stats_mode=${statsMode}[p];[s1][p]paletteuse=${ditheringArg}`,
    ].join(',');

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
          const inputExt  = getFileExtension(item.file.name);
          const inputName = `input.${inputExt}`;

          await ffmpeg.writeFile(inputName, await fetchFile(item.file));
          await ffmpeg.exec([
            '-ss', String(trimStart), '-t', String(duration),
            '-i', inputName, '-vf', vf,
            '-loop', String(loopCount), 'output.gif',
          ]);

          const data = await ffmpeg.readFile('output.gif');
          const blob = fileDataToBlob(data, 'image/gif');

          await ffmpeg.deleteFile(inputName);
          await ffmpeg.deleteFile('output.gif');

          const outName = makeOutputName(item.file.name, '', 'gif', usedNames);
          updateItem(item.id, { status: 'done', progress: 1, outputBlob: blob, outputName: outName });
        } catch (err) {
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

  const reset = () => { setItems([]); setRunStatus('idle'); setError(null); };

  const doneItems    = items.filter((i) => i.status === 'done');
  const isRunning    = runStatus === 'loading' || runStatus === 'running';
  const pendingCount = items.filter((i) => i.status === 'pending').length;

  return (
    <div className="space-y-6">
      <BatchDropZone
        items={items}
        onAddFiles={addFiles}
        onRemove={removeItem}
        accept="video/*"
        disabled={isRunning}
      />

      {items.length > 0 && (
        <div className="space-y-6">
          {/* GIF Options */}
          <Section title="GIF Options">
            <div className="grid grid-cols-2 gap-4">
              <SliderField label="Trim Start (s)" value={trimStart} min={0} max={300} step={1}
                onChange={(v) => { setTrimStart(v); if (v >= trimEnd) setTrimEnd(v + 1); }} />
              <SliderField label="Trim End (s)" value={trimEnd} min={1} max={301} step={1}
                onChange={(v) => { setTrimEnd(v); if (v <= trimStart) setTrimStart(Math.max(0, v - 1)); }} />
            </div>
            <p className="text-xs text-zinc-600">Duration: <span className="text-zinc-400">{duration}s</span></p>
            <SliderField label="Width (px)" value={width} min={100} max={1280} step={10}
              hint="Height scales automatically" onChange={setWidth} />
            <div className="space-y-1">
              <label className="text-sm text-zinc-400">Loop Count</label>
              <div className="flex items-center gap-3">
                <input type="number" min={0} max={10000} value={loopCount}
                  onChange={(e) => setLoopCount(Math.max(0, Math.min(10000, Number(e.target.value))))}
                  className="w-28 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 focus:outline-none focus:border-[#E85D20]"
                />
                <span className="text-xs text-zinc-600">0 = loop infinitely</span>
              </div>
            </div>
          </Section>

          {/* Optimize GIF */}
          <Section title="Optimize GIF">
            <SliderField label="FPS" value={fps} min={1} max={30} step={1}
              hint="Lower FPS = fewer frames = smaller file. 15 recommended." onChange={setFps} />
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
              <SliderField label="Bayer Scale" value={bayerScale} min={0} max={5} step={1}
                hint="0 = fine pattern, 5 = coarse." onChange={setBayerScale} />
            )}
            <Toggle label="Optimize for Static Background"
              hint="Assigns more palette colors to moving parts."
              checked={optimizeBg} onChange={setOptimizeBg} />
          </Section>

          {runStatus === 'loading' && <FFmpegLoader />}

          {!isRunning && pendingCount > 0 && (
            <button onClick={run}
              className="w-full py-3 rounded-xl bg-[#E85D20] hover:bg-[#d94f14] text-white font-semibold transition-colors">
              Convert {pendingCount} file{pendingCount !== 1 ? 's' : ''} to GIF
            </button>
          )}

          {doneItems.length > 0 && !isRunning && (
            <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4 flex items-center justify-between flex-wrap gap-3">
              <p className="text-sm text-white font-medium">{doneItems.length}/{items.length} converted</p>
              <div className="flex gap-2">
                {doneItems.length >= 2 && (
                  <button onClick={() => downloadAsZip(items, 'convrt-gifs.zip')}
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
          )}

          {error && (
            <p className="text-red-400 text-sm rounded-xl bg-red-950/40 border border-red-900/50 px-4 py-3">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Shared sub-components ── */
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

function SliderField({ label, value, min, max, step, hint, onChange }: {
  label: string; value: number; min: number; max: number; step: number; hint?: string; onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="text-zinc-400">{label}</span>
        <span className="text-white font-medium">{value}</span>
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
