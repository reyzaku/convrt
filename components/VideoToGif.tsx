'use client';

import { useState } from 'react';
import DropZone from './DropZone';
import ProgressBar from './ProgressBar';
import FFmpegLoader from './FFmpegLoader';
import { loadFFmpeg, fetchFile, formatBytes, getFileExtension, fileDataToBlob } from '@/lib/ffmpeg';

export default function VideoToGif() {
  const [file, setFile] = useState<File | null>(null);
  const [fps, setFps] = useState(10);
  const [width, setWidth] = useState(480);
  const [startTime, setStartTime] = useState(0);
  const [duration, setDuration] = useState(5);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'loading' | 'converting' | 'done' | 'error'>('idle');
  const [outputURL, setOutputURL] = useState<string | null>(null);
  const [outputSize, setOutputSize] = useState(0);
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

      await ffmpeg.writeFile(inputName, await fetchFile(file));
      await ffmpeg.exec([
        '-ss', String(startTime),
        '-t', String(duration),
        '-i', inputName,
        '-vf', `fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
        '-loop', '0',
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
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <SliderField
              label="FPS"
              value={fps}
              min={1} max={30} step={1}
              onChange={setFps}
            />
            <SliderField
              label="Width (px)"
              value={width}
              min={100} max={1280} step={10}
              onChange={setWidth}
            />
            <SliderField
              label="Start Time (s)"
              value={startTime}
              min={0} max={300} step={1}
              onChange={setStartTime}
            />
            <SliderField
              label="Duration (s)"
              value={duration}
              min={1} max={60} step={1}
              onChange={setDuration}
            />
          </div>

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

function SliderField({
  label, value, min, max, step, onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-zinc-400">{label}</span>
        <span className="text-white font-medium">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#E85D20] cursor-pointer"
      />
    </div>
  );
}
