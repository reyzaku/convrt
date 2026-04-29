'use client';

import { useState } from 'react';
import DropZone from './DropZone';
import ProgressBar from './ProgressBar';
import FFmpegLoader from './FFmpegLoader';
import { loadFFmpeg, fetchFile, formatBytes, getFileExtension, fileDataToBlob } from '@/lib/ffmpeg';

type Dither = 'bayer' | 'floyd_steinberg' | 'sierra2_4a' | 'none';

const DITHER_OPTIONS: { value: Dither; label: string; hint: string }[] = [
  { value: 'bayer',          label: 'Bayer',           hint: 'Fast, cross-hatch pattern, good for most GIFs' },
  { value: 'floyd_steinberg', label: 'Floyd-Steinberg', hint: 'Smoother gradients, slightly larger file' },
  { value: 'sierra2_4a',     label: 'Sierra',          hint: 'Best quality, slowest' },
  { value: 'none',           label: 'None',            hint: 'Smallest file, visible banding' },
];

export default function VideoToGif() {
  const [file, setFile] = useState<File | null>(null);

  // GIF Options
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(5);
  const [width, setWidth] = useState(480);
  const [loopCount, setLoopCount] = useState(0); // 0 = infinite

  // Optimize GIF
  const [fps, setFps] = useState(15);
  const [dither, setDither] = useState<Dither>('bayer');
  const [bayerScale, setBayerScale] = useState(2);
  const [optimizeBg, setOptimizeBg] = useState(false); // stats_mode=diff

  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'loading' | 'converting' | 'done' | 'error'>('idle');
  const [outputURL, setOutputURL] = useState<string | null>(null);
  const [outputSize, setOutputSize] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const duration = Math.max(1, trimEnd - trimStart);

  const convert = async () => {
    if (!file) return;
    setError(null);
    setOutputURL(null);
    setProgress(0);

    try {
      setStatus('loading');
      const ffmpeg = await loadFFmpeg();
      ffmpeg.on('progress', ({ progress: p }) => setProgress(p));

      setStatus('converting');
      const inputExt = getFileExtension(file.name);
      const inputName = `input.${inputExt}`;

      const statsMode = optimizeBg ? 'diff' : 'full';
      const ditheringArg = dither === 'bayer'
        ? `dither=bayer:bayer_scale=${bayerScale}`
        : `dither=${dither}`;
      const palettegenFilter = `palettegen=stats_mode=${statsMode}`;
      const paletteuseFilter = `paletteuse=${ditheringArg}`;
      const vf = [
        `fps=${fps}`,
        `scale=${width}:-1:flags=lanczos`,
        `split[s0][s1];[s0]${palettegenFilter}[p];[s1][p]${paletteuseFilter}`,
      ].join(',');

      await ffmpeg.writeFile(inputName, await fetchFile(file));
      await ffmpeg.exec([
        '-ss', String(trimStart),
        '-t',  String(duration),
        '-i',  inputName,
        '-vf', vf,
        '-loop', String(loopCount),
        'output.gif',
      ]);

      const data = await ffmpeg.readFile('output.gif');
      const blob = fileDataToBlob(data, 'image/gif');
      setOutputURL(URL.createObjectURL(blob));
      setOutputSize(blob.size);

      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile('output.gif');
      setStatus('done');
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Conversion failed');
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
      <DropZone file={file} onFile={setFile} accept="video/*" />

      {file && status === 'idle' && (
        <div className="space-y-6">

          {/* ── GIF Options ── */}
          <Section title="GIF Options">
            {/* Trim */}
            <div className="grid grid-cols-2 gap-4">
              <SliderField
                label="Trim Start (s)"
                value={trimStart}
                min={0} max={300} step={1}
                hint="Start of clip"
                onChange={(v) => { setTrimStart(v); if (v >= trimEnd) setTrimEnd(v + 1); }}
              />
              <SliderField
                label="Trim End (s)"
                value={trimEnd}
                min={1} max={301} step={1}
                hint="End of clip"
                onChange={(v) => { setTrimEnd(v); if (v <= trimStart) setTrimStart(Math.max(0, v - 1)); }}
              />
            </div>
            <p className="text-xs text-zinc-600">
              Duration: <span className="text-zinc-400">{duration}s</span>
            </p>

            {/* Width */}
            <SliderField
              label="Width (px)"
              value={width}
              min={100} max={1280} step={10}
              hint="Height scales automatically"
              onChange={setWidth}
            />

            {/* Loop Count */}
            <div className="space-y-1">
              <label className="text-sm text-zinc-400">Loop Count</label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={0} max={10000}
                  value={loopCount}
                  onChange={(e) => setLoopCount(Math.max(0, Math.min(10000, Number(e.target.value))))}
                  className="w-28 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 focus:outline-none focus:border-[#E85D20]"
                />
                <span className="text-xs text-zinc-600">0 = loop infinitely</span>
              </div>
            </div>
          </Section>

          {/* ── Optimize GIF ── */}
          <Section title="Optimize GIF">
            {/* FPS */}
            <SliderField
              label="FPS"
              value={fps}
              min={1} max={30} step={1}
              hint="Lower FPS = fewer frames = smaller file. 15 recommended."
              onChange={setFps}
            />

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

            {/* Bayer scale — only shown when bayer is selected */}
            {dither === 'bayer' && (
              <SliderField
                label="Bayer Scale"
                value={bayerScale}
                min={0} max={5} step={1}
                hint="0 = fine pattern, 5 = coarse. Affects size vs quality trade-off."
                onChange={setBayerScale}
              />
            )}

            {/* Background optimization */}
            <Toggle
              label="Optimize for Static Background"
              hint="Assigns more palette colors to moving parts — best for animations with a fixed background."
              checked={optimizeBg}
              onChange={setOptimizeBg}
            />
          </Section>

          <button
            onClick={convert}
            className="w-full py-3 rounded-xl bg-[#E85D20] hover:bg-[#d94f14] text-white font-semibold transition-colors"
          >
            Convert to GIF
          </button>
        </div>
      )}

      {(status === 'loading' || status === 'converting') && (
        <div className="space-y-4">
          {status === 'loading' && <FFmpegLoader />}
          {status === 'converting' && (
            <ProgressBar progress={progress} label="Generating GIF…" />
          )}
        </div>
      )}

      {status === 'done' && outputURL && (
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-5 space-y-4">
          <img src={outputURL} alt="Output GIF" className="w-full rounded-lg max-h-60 object-contain" />
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-400">
              Size: <span className="text-white font-medium">{formatBytes(outputSize)}</span>
            </p>
            <span className="text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded-full">Done</span>
          </div>
          <div className="flex gap-3">
            <a
              href={outputURL}
              download="convrt-output.gif"
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
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800 bg-zinc-900/60">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{title}</span>
      </div>
      <div className="p-4 space-y-4">{children}</div>
    </div>
  );
}

function SliderField({
  label, value, min, max, step, hint, onChange,
}: {
  label: string;
  value: number;
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
        <span className="text-white font-medium">{value}</span>
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
        {checked && <span className="text-white text-xs">✓</span>}
      </div>
      <div>
        <p className="text-sm text-zinc-300">{label}</p>
        {hint && <p className="text-xs text-zinc-600 mt-0.5">{hint}</p>}
      </div>
    </label>
  );
}
