'use client';

import { useState } from 'react';
import DropZone from './DropZone';
import ProgressBar from './ProgressBar';
import FFmpegLoader from './FFmpegLoader';
import { loadFFmpeg, fetchFile, formatBytes, fileDataToBlob } from '@/lib/ffmpeg';

export default function GifOptimizer() {
  const [file, setFile] = useState<File | null>(null);
  const [colors, setColors] = useState(128);
  const [width, setWidth] = useState(0); // 0 = no resize
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'loading' | 'converting' | 'done' | 'error'>('idle');
  const [outputURL, setOutputURL] = useState<string | null>(null);
  const [outputSize, setOutputSize] = useState(0);
  const [error, setError] = useState<string | null>(null);

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

      const scaleFilter = width > 0 ? `scale=${width}:-1:flags=lanczos,` : '';
      const vf = `${scaleFilter}split[s0][s1];[s0]palettegen=max_colors=${colors}[p];[s1][p]paletteuse=dither=bayer`;

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
        <div className="space-y-5">
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Colors (palette size)</span>
                <span className="text-white font-medium">{colors}</span>
              </div>
              <input
                type="range" min={2} max={256} step={2} value={colors}
                onChange={(e) => setColors(Number(e.target.value))}
                className="w-full accent-[#E85D20] cursor-pointer"
              />
              <p className="text-xs text-zinc-600">Fewer colors = smaller file, less quality</p>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Resize Width (px)</span>
                <span className="text-white font-medium">{width === 0 ? 'Original' : width}</span>
              </div>
              <input
                type="range" min={0} max={1280} step={10} value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
                className="w-full accent-[#E85D20] cursor-pointer"
              />
              <p className="text-xs text-zinc-600">0 = keep original dimensions</p>
            </div>
          </div>

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
              <p>Input: <span className="text-zinc-300">{formatBytes(file?.size ?? 0)}</span></p>
              <p>Output: <span className="text-white font-medium">{formatBytes(outputSize)}</span></p>
              {file && (
                <p className="text-green-400">
                  Saved {Math.round((1 - outputSize / file.size) * 100)}%
                </p>
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
