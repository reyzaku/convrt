'use client';

import { useState } from 'react';
import DropZone from './DropZone';
import ProgressBar from './ProgressBar';
import FFmpegLoader from './FFmpegLoader';
import { loadFFmpeg, fetchFile, formatBytes, fileDataToBlob } from '@/lib/ffmpeg';

type Dither = 'bayer' | 'floyd_steinberg' | 'sierra2_4a' | 'none';
type Status = 'idle' | 'loading' | 'ffmpeg' | 'gifsicle' | 'done' | 'error';

const DITHER_OPTIONS: { value: Dither; label: string; hint: string }[] = [
  { value: 'bayer',           label: 'Bayer',           hint: 'Fast, good size reduction' },
  { value: 'floyd_steinberg', label: 'Floyd-Steinberg', hint: 'Smoother gradients' },
  { value: 'sierra2_4a',      label: 'Sierra',          hint: 'Best quality, slower' },
  { value: 'none',            label: 'None',            hint: 'Smallest file, banding' },
];

export default function GifOptimizer() {
  const [file, setFile]             = useState<File | null>(null);

  // FFmpeg options
  const [colors, setColors]         = useState(128);
  const [width, setWidth]           = useState(0);       // 0 = keep original
  const [fps, setFps]               = useState(0);       // 0 = keep original
  const [dither, setDither]         = useState<Dither>('bayer');
  const [bayerScale, setBayerScale] = useState(2);
  const [optimizeBg, setOptimizeBg] = useState(false);

  // Gifsicle lossy option
  const [lossyEnabled, setLossyEnabled] = useState(false);
  const [lossy, setLossy]               = useState(45);  // 1–200, recommended 30–60

  const [progress, setProgress]     = useState(0);
  const [status, setStatus]         = useState<Status>('idle');
  const [outputURL, setOutputURL]   = useState<string | null>(null);
  const [outputSize, setOutputSize] = useState(0);
  const [error, setError]           = useState<string | null>(null);

  const optimize = async () => {
    if (!file) return;
    setError(null);
    setOutputURL(null);
    setProgress(0);

    try {
      setStatus('loading');
      const ffmpeg = await loadFFmpeg();
      ffmpeg.on('progress', ({ progress: p }) => setProgress(p));

      setStatus('ffmpeg');
      await ffmpeg.writeFile('input.gif', await fetchFile(file));

      // Build FFmpeg filtergraph
      const parts: string[] = [];
      if (fps > 0)   parts.push(`fps=${fps}`);
      if (width > 0) parts.push(`scale=${width}:-1:flags=lanczos`);

      const statsMode    = optimizeBg ? 'diff' : 'full';
      const ditheringArg = dither === 'bayer'
        ? `dither=bayer:bayer_scale=${bayerScale}`
        : `dither=${dither}`;

      const prefix = parts.length > 0 ? parts.join(',') + ',' : '';
      const vf = `${prefix}split[s0][s1];[s0]palettegen=max_colors=${colors}:stats_mode=${statsMode}[p];[s1][p]paletteuse=${ditheringArg}`;

      await ffmpeg.exec(['-i', 'input.gif', '-vf', vf, '-loop', '0', 'output.gif']);

      const data = await ffmpeg.readFile('output.gif');
      let outputBlob = fileDataToBlob(data, 'image/gif');

      await ffmpeg.deleteFile('input.gif');
      await ffmpeg.deleteFile('output.gif');

      // ── Gifsicle lossy pass (second pass) ──────────────────────────────
      if (lossyEnabled && lossy > 0) {
        setStatus('gifsicle');
        setProgress(0);

        // Dynamic import keeps gifsicle out of the initial bundle
        const gifsicle = (await import('gifsicle-wasm-browser')).default;
        const inputForGifsicle = new File([outputBlob], '1.gif', { type: 'image/gif' });

        // -O1 is recommended for large files; -O2/-O3 are exponentially slower
        const results = await gifsicle.run({
          input: [{ file: inputForGifsicle, name: '1.gif' }],
          command: [`-O1 --lossy=${lossy} 1.gif -o /out/out.gif`],
        });

        if (results && results.length > 0) {
          outputBlob = results[0];
        }
      }

      setOutputURL(URL.createObjectURL(outputBlob));
      setOutputSize(outputBlob.size);
      setStatus('done');
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Optimization failed');
      setStatus('error');
    }
  };

  const reset = () => {
    setFile(null);
    setStatus('idle');
    setOutputURL(null);
    setProgress(0);
    setError(null);
  };

  const isProcessing = status === 'loading' || status === 'ffmpeg' || status === 'gifsicle';

  return (
    <div className="space-y-6">
      <DropZone
        file={file}
        onFile={setFile}
        accept=".gif,image/gif"
        label="Drop a GIF here, or click to browse"
      />

      {file && status === 'idle' && (
        <div className="space-y-6">

          {/* ── GIF Options ── */}
          <Section title="GIF Options">
            <SliderField
              label="Palette Colors"
              value={colors}
              displayValue={String(colors)}
              min={2} max={256} step={2}
              hint="Fewer colors = smaller file. 256 = full palette (lossless re-encode)."
              onChange={setColors}
            />
            <SliderField
              label="Max FPS"
              value={fps}
              displayValue={fps === 0 ? 'Original' : String(fps)}
              min={0} max={30} step={1}
              hint="0 = keep original frame rate. Lower = smaller file."
              onChange={setFps}
            />
            <SliderField
              label="Resize Width (px)"
              value={width}
              displayValue={width === 0 ? 'Original' : String(width)}
              min={0} max={1280} step={10}
              hint="0 = keep original dimensions. Height scales automatically."
              onChange={setWidth}
            />
          </Section>

          {/* ── Optimize GIF ── */}
          <Section title="Optimize GIF">
            {/* Dithering */}
            <div className="space-y-2">
              <label className="text-sm text-zinc-400">Dithering Algorithm</label>
              <div className="grid grid-cols-2 gap-2">
                {DITHER_OPTIONS.map((d) => (
                  <button
                    key={d.value}
                    onClick={() => setDither(d.value)}
                    className={`text-left px-3 py-2 rounded-lg border text-sm transition-all ${
                      dither === d.value
                        ? 'border-[#E85D20] bg-[#E85D20]/10 text-white'
                        : 'border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600'
                    }`}
                  >
                    <span className="font-medium block">{d.label}</span>
                    <span className="text-xs text-zinc-600">{d.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            {dither === 'bayer' && (
              <SliderField
                label="Bayer Scale"
                value={bayerScale}
                displayValue={String(bayerScale)}
                min={0} max={5} step={1}
                hint="0 = fine dithering pattern, 5 = coarse."
                onChange={setBayerScale}
              />
            )}

            <Toggle
              label="Optimize for Static Background"
              hint="Assigns more palette colors to moving parts — ideal for animations with a fixed background."
              checked={optimizeBg}
              onChange={setOptimizeBg}
            />
          </Section>

          {/* ── Lossy Compression (gifsicle) ── */}
          <Section title="Lossy Compression">
            {/* info badge */}
            <div className="flex items-start gap-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50 px-3 py-2.5">
              <span className="text-lg leading-none mt-0.5">⚡</span>
              <div className="text-xs text-zinc-400 leading-relaxed">
                Powered by <span className="text-white font-medium">gifsicle</span> — the same engine
                used by freeconvert, ezgif, and Squoosh. Can reduce a 30 MB GIF to under 6 MB
                with minimal visible quality loss.
              </div>
            </div>

            <Toggle
              label="Enable Lossy Compression"
              hint="Runs a second pass with gifsicle after FFmpeg. Adds a few seconds for large files."
              checked={lossyEnabled}
              onChange={setLossyEnabled}
            />

            {lossyEnabled && (
              <SliderField
                label="Compression Level"
                value={lossy}
                displayValue={String(lossy)}
                min={1} max={200} step={1}
                hint={
                  lossy <= 30  ? `${lossy} — Light: barely noticeable quality loss` :
                  lossy <= 60  ? `${lossy} — Balanced: best size/quality trade-off ✓` :
                  lossy <= 100 ? `${lossy} — Aggressive: visible noise on gradients` :
                                 `${lossy} — Heavy: significant noise, extreme compression`
                }
                onChange={setLossy}
              />
            )}
          </Section>

          <button
            onClick={optimize}
            className="w-full py-3 rounded-xl bg-[#E85D20] hover:bg-[#d94f14] text-white font-semibold transition-colors"
          >
            Optimize GIF
          </button>
        </div>
      )}

      {isProcessing && (
        <div className="space-y-5">
          {status === 'loading' && <FFmpegLoader />}

          {status === 'ffmpeg' && (
            <div className="space-y-2">
              <ProgressBar progress={progress} label="Step 1 of 2 — FFmpeg palette optimization…" />
            </div>
          )}

          {status === 'gifsicle' && (
            <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-4 w-4 rounded-full border-2 border-[#E85D20] border-t-transparent animate-spin flex-shrink-0" />
                <div>
                  <p className="text-sm text-white font-medium">Step 2 of 2 — Gifsicle lossy pass</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Applying lossy LZW compression — this is where the big size savings happen</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {status === 'done' && outputURL && (
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-5 space-y-4">
          <img src={outputURL} alt="Optimized GIF" className="w-full rounded-lg max-h-60 object-contain" />
          <div className="flex items-center justify-between">
            <div className="text-sm text-zinc-400 space-y-0.5">
              <p>Input:  <span className="text-zinc-300">{formatBytes(file?.size ?? 0)}</span></p>
              <p>Output: <span className="text-white font-medium">{formatBytes(outputSize)}</span></p>
              {file && outputSize < file.size && (
                <p className="text-green-400 font-medium">
                  Saved {Math.round((1 - outputSize / file.size) * 100)}%
                  <span className="text-zinc-600 font-normal ml-1">
                    ({formatBytes(file.size - outputSize)} smaller)
                  </span>
                </p>
              )}
              {file && outputSize >= file.size && (
                <p className="text-yellow-500 text-xs">File grew — try fewer colors, lower FPS, or enable lossy compression</p>
              )}
            </div>
            <span className="text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded-full">Done</span>
          </div>
          <div className="flex gap-3">
            <a
              href={outputURL}
              download="convrt-optimized.gif"
              className="flex-1 text-center py-3 rounded-xl bg-[#E85D20] hover:bg-[#d94f14] text-white font-semibold transition-colors"
            >
              Download GIF
            </a>
            <button
              onClick={reset}
              className="px-4 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
            >
              Reset
            </button>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="rounded-xl bg-red-950/40 border border-red-900/50 p-4 space-y-3">
          <p className="text-red-400 text-sm">{error}</p>
          <button onClick={reset} className="text-sm text-zinc-400 hover:text-white transition-colors">
            Try again
          </button>
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

function SliderField({
  label, value, displayValue, min, max, step, hint, onChange,
}: {
  label: string;
  value: number;
  displayValue: string;
  min: number;
  max: number;
  step: number;
  hint?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="text-zinc-400">{label}</span>
        <span className="text-white font-medium">{displayValue}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#E85D20] cursor-pointer"
      />
      {hint && <p className="text-xs text-zinc-600">{hint}</p>}
    </div>
  );
}

function Toggle({
  label, hint, checked, onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div
        onClick={() => onChange(!checked)}
        className={`mt-0.5 w-5 h-5 rounded flex-shrink-0 border-2 flex items-center justify-center transition-all ${
          checked ? 'bg-[#E85D20] border-[#E85D20]' : 'border-zinc-600 group-hover:border-zinc-400'
        }`}
      >
        {checked && <span className="text-white text-xs leading-none">✓</span>}
      </div>
      <div>
        <p className="text-sm text-zinc-300">{label}</p>
        {hint && <p className="text-xs text-zinc-600 mt-0.5">{hint}</p>}
      </div>
    </label>
  );
}
