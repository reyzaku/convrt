'use client';

import { useState } from 'react';
import DropZone from './DropZone';
import ProgressBar from './ProgressBar';
import FFmpegLoader from './FFmpegLoader';
import { loadFFmpeg, fetchFile, formatBytes, fileDataToBlob } from '@/lib/ffmpeg';

type Dither = 'bayer' | 'floyd_steinberg' | 'sierra2_4a' | 'none';

const DITHER_OPTIONS: { value: Dither; label: string; hint: string }[] = [
  { value: 'bayer',           label: 'Bayer',           hint: 'Fast, good size reduction' },
  { value: 'floyd_steinberg', label: 'Floyd-Steinberg', hint: 'Smoother gradients' },
  { value: 'sierra2_4a',      label: 'Sierra',          hint: 'Best quality, slower' },
  { value: 'none',            label: 'None',            hint: 'Smallest file, banding' },
];

export default function GifOptimizer() {
  const [file, setFile] = useState<File | null>(null);

  // Color reduction
  const [colors, setColors]         = useState(128);
  // Resize
  const [width, setWidth]           = useState(0);    // 0 = keep original
  // Frame-rate reduction
  const [fps, setFps]               = useState(0);    // 0 = keep original
  // Dithering
  const [dither, setDither]         = useState<Dither>('bayer');
  const [bayerScale, setBayerScale] = useState(2);
  // Background / diff-mode optimization
  const [optimizeBg, setOptimizeBg] = useState(false);

  const [progress, setProgress]     = useState(0);
  const [status, setStatus]         = useState<'idle' | 'loading' | 'converting' | 'done' | 'error'>('idle');
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

      setStatus('converting');
      await ffmpeg.writeFile('input.gif', await fetchFile(file));

      const parts: string[] = [];
      if (fps > 0)   parts.push(`fps=${fps}`);
      if (width > 0) parts.push(`scale=${width}:-1:flags=lanczos`);

      const statsMode     = optimizeBg ? 'diff' : 'full';
      const ditheringArg  = dither === 'bayer'
        ? `dither=bayer:bayer_scale=${bayerScale}`
        : `dither=${dither}`;

      const palettegenStr = `palettegen=max_colors=${colors}:stats_mode=${statsMode}`;
      const paletteuseStr = `paletteuse=${ditheringArg}`;

      // Build filtergraph — prefix scale/fps before split if present
      const prefixFilters = parts.length > 0 ? parts.join(',') + ',' : '';
      const vf = `${prefixFilters}split[s0][s1];[s0]${palettegenStr}[p];[s1][p]${paletteuseStr}`;

      await ffmpeg.exec([
        '-i', 'input.gif',
        '-vf', vf,
        '-loop', '0',
        'output.gif',
      ]);

      const data = await ffmpeg.readFile('output.gif');
      const blob = fileDataToBlob(data, 'image/gif');
      setOutputURL(URL.createObjectURL(blob));
      setOutputSize(blob.size);

      await ffmpeg.deleteFile('input.gif');
      await ffmpeg.deleteFile('output.gif');
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
            {/* Colors */}
            <SliderField
              label="Palette Colors"
              value={colors}
              displayValue={String(colors)}
              min={2} max={256} step={2}
              hint="Fewer colors = smaller file, less quality. 256 = lossless palette."
              onChange={setColors}
            />

            {/* FPS */}
            <SliderField
              label="Max FPS"
              value={fps}
              displayValue={fps === 0 ? 'Original' : String(fps)}
              min={0} max={30} step={1}
              hint="0 = keep original frame rate. Lower = smaller file."
              onChange={setFps}
            />

            {/* Resize */}
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

            {/* Bayer scale */}
            {dither === 'bayer' && (
              <SliderField
                label="Bayer Scale"
                value={bayerScale}
                displayValue={String(bayerScale)}
                min={0} max={5} step={1}
                hint="0 = fine dithering pattern, 5 = coarse. Affects quality vs size."
                onChange={setBayerScale}
              />
            )}

            {/* Background optimization */}
            <Toggle
              label="Optimize for Static Background"
              hint="Assigns more palette colors to moving parts — ideal for animations with a fixed background."
              checked={optimizeBg}
              onChange={setOptimizeBg}
            />
          </Section>

          <button
            onClick={optimize}
            className="w-full py-3 rounded-xl bg-[#E85D20] hover:bg-[#d94f14] text-white font-semibold transition-colors"
          >
            Optimize GIF
          </button>
        </div>
      )}

      {(status === 'loading' || status === 'converting') && (
        <div className="space-y-4">
          {status === 'loading' && <FFmpegLoader />}
          {status === 'converting' && (
            <ProgressBar progress={progress} label="Optimizing GIF…" />
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
                <p className="text-green-400">
                  Saved {Math.round((1 - outputSize / file.size) * 100)}%
                </p>
              )}
              {file && outputSize >= file.size && (
                <p className="text-yellow-500 text-xs">File grew — try fewer colors or lower FPS</p>
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
