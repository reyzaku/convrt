'use client';

import { useState } from 'react';
import DropZone from './DropZone';
import ProgressBar from './ProgressBar';
import FFmpegLoader from './FFmpegLoader';
import { loadFFmpeg, fetchFile, formatBytes, getFileExtension, fileDataToBlob } from '@/lib/ffmpeg';

const OUTPUT_FORMATS = ['mp4', 'webm', 'mov', 'avi', 'mkv'] as const;
type OutputFormat = typeof OUTPUT_FORMATS[number];

const FORMAT_ARGS: Record<OutputFormat, string[]> = {
  mp4: ['-c:v', 'libx264', '-c:a', 'aac', '-movflags', '+faststart'],
  webm: ['-c:v', 'libvpx-vp9', '-crf', '30', '-b:v', '0', '-c:a', 'libopus'],
  mov: ['-c:v', 'libx264', '-c:a', 'aac'],
  avi: ['-c:v', 'libxvid', '-c:a', 'mp3'],
  mkv: ['-c:v', 'libx264', '-c:a', 'aac'],
};

export default function VideoConverter() {
  const [file, setFile] = useState<File | null>(null);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('mp4');
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'loading' | 'converting' | 'done' | 'error'>('idle');
  const [outputURL, setOutputURL] = useState<string | null>(null);
  const [outputSize, setOutputSize] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

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
      const outputName = `output.${outputFormat}`;

      await ffmpeg.writeFile(inputName, await fetchFile(file));
      await ffmpeg.exec([
        '-i', inputName,
        ...FORMAT_ARGS[outputFormat],
        outputName,
      ]);

      const data = await ffmpeg.readFile(outputName);
      const blob = fileDataToBlob(data, `video/${outputFormat}`);
      setOutputURL(URL.createObjectURL(blob));
      setOutputSize(blob.size);

      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);

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
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-2">Output Format</label>
            <div className="flex flex-wrap gap-2">
              {OUTPUT_FORMATS.map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => setOutputFormat(fmt)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium uppercase transition-all ${
                    outputFormat === fmt
                      ? 'bg-[#E85D20] text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={convert}
            className="w-full py-3 rounded-xl bg-[#E85D20] hover:bg-[#d94f14] text-white font-semibold transition-colors"
          >
            Convert to {outputFormat.toUpperCase()}
          </button>
        </div>
      )}

      {(status === 'loading' || status === 'converting') && (
        <div className="space-y-4">
          {status === 'loading' && <FFmpegLoader />}
          {status === 'converting' && (
            <ProgressBar progress={progress} label="Converting…" />
          )}
        </div>
      )}

      {status === 'done' && outputURL && (
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-400">
              Output size: <span className="text-white font-medium">{formatBytes(outputSize)}</span>
            </p>
            <span className="text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded-full">Done</span>
          </div>
          <div className="flex gap-3">
            <a
              href={outputURL}
              download={`convrt-output.${outputFormat}`}
              className="flex-1 text-center py-3 rounded-xl bg-[#E85D20] hover:bg-[#d94f14] text-white font-semibold transition-colors"
            >
              Download {outputFormat.toUpperCase()}
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
