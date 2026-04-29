'use client';

import { useState } from 'react';
import DropZone from './DropZone';
import ProgressBar from './ProgressBar';
import FFmpegLoader from './FFmpegLoader';
import { loadFFmpeg, fetchFile, formatBytes, getFileExtension, fileDataToBlob } from '@/lib/ffmpeg';

const RESOLUTIONS = [
  { label: 'Original', value: '' },
  { label: '1080p', value: 'scale=-2:1080' },
  { label: '720p', value: 'scale=-2:720' },
  { label: '480p', value: 'scale=-2:480' },
  { label: '360p', value: 'scale=-2:360' },
] as const;

export default function VideoCompressor() {
  const [file, setFile] = useState<File | null>(null);
  const [crf, setCrf] = useState(28);
  const [resolution, setResolution] = useState('');
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'loading' | 'converting' | 'done' | 'error'>('idle');
  const [outputURL, setOutputURL] = useState<string | null>(null);
  const [outputSize, setOutputSize] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const compress = async () => {
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

      await ffmpeg.writeFile(inputName, await fetchFile(file));

      const vfFilters: string[] = [];
      if (resolution) vfFilters.push(resolution);

      const args = [
        '-i', inputName,
        '-c:v', 'libx264',
        '-crf', String(crf),
        '-preset', 'fast',
        '-c:a', 'aac',
        '-movflags', '+faststart',
      ];

      if (vfFilters.length > 0) {
        args.push('-vf', vfFilters.join(','));
      }

      args.push('output.mp4');

      await ffmpeg.exec(args);

      const data = await ffmpeg.readFile('output.mp4');
      const blob = fileDataToBlob(data, 'video/mp4');
      setOutputURL(URL.createObjectURL(blob));
      setOutputSize(blob.size);

      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile('output.mp4');
      setStatus('done');
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Compression failed');
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

  const qualityLabel = crf <= 18 ? 'Lossless' : crf <= 23 ? 'High' : crf <= 28 ? 'Medium' : crf <= 35 ? 'Low' : 'Very Low';

  return (
    <div className="space-y-6">
      <DropZone file={file} onFile={setFile} accept="video/*" />

      {file && status === 'idle' && (
        <div className="space-y-5">
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Quality (CRF)</span>
                <span className="text-white font-medium">{crf} — {qualityLabel}</span>
              </div>
              <input
                type="range" min={0} max={51} step={1} value={crf}
                onChange={(e) => setCrf(Number(e.target.value))}
                className="w-full accent-[#E85D20] cursor-pointer"
              />
              <div className="flex justify-between text-xs text-zinc-600">
                <span>Best quality</span>
                <span>Smallest file</span>
              </div>
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-2">Resolution</label>
              <div className="flex flex-wrap gap-2">
                {RESOLUTIONS.map((r) => (
                  <button
                    key={r.label}
                    onClick={() => setResolution(r.value)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      resolution === r.value
                        ? 'bg-[#E85D20] text-white'
                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={compress}
            className="w-full py-3 rounded-xl bg-[#E85D20] hover:bg-[#d94f14] text-white font-semibold transition-colors"
          >
            Compress Video
          </button>
        </div>
      )}

      {(status === 'loading' || status === 'converting') && (
        <div className="space-y-4">
          {status === 'loading' && <FFmpegLoader />}
          {status === 'converting' && (
            <ProgressBar progress={progress} label="Compressing…" />
          )}
        </div>
      )}

      {status === 'done' && outputURL && (
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-zinc-400 space-y-0.5">
              <p>Input: <span className="text-zinc-300">{formatBytes(file?.size ?? 0)}</span></p>
              <p>Output: <span className="text-white font-medium">{formatBytes(outputSize)}</span></p>
              {file && outputSize < file.size && (
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
              download="convrt-compressed.mp4"
              className="flex-1 text-center py-3 rounded-xl bg-[#E85D20] hover:bg-[#d94f14] text-white font-semibold transition-colors"
            >
              Download MP4
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
