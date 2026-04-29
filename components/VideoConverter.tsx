'use client';

import { useState } from 'react';
import BatchDropZone from './BatchDropZone';
import FFmpegLoader from './FFmpegLoader';
import { loadFFmpeg, fetchFile, formatBytes, getFileExtension, fileDataToBlob } from '@/lib/ffmpeg';
import { type BatchItem, createBatchItems, makeOutputName } from '@/lib/batch';
import { downloadAsZip } from '@/lib/zip';

const OUTPUT_FORMATS = ['mp4', 'webm', 'mov', 'avi', 'mkv'] as const;
type OutputFormat = typeof OUTPUT_FORMATS[number];

const FORMAT_ARGS: Record<OutputFormat, string[]> = {
  mp4:  ['-c:v', 'libx264', '-c:a', 'aac', '-movflags', '+faststart'],
  webm: ['-c:v', 'libvpx-vp9', '-crf', '30', '-b:v', '0', '-c:a', 'libopus'],
  mov:  ['-c:v', 'libx264', '-c:a', 'aac'],
  avi:  ['-c:v', 'libxvid', '-c:a', 'mp3'],
  mkv:  ['-c:v', 'libx264', '-c:a', 'aac'],
};

type RunStatus = 'idle' | 'loading' | 'running' | 'done';

export default function VideoConverter() {
  const [items, setItems]           = useState<BatchItem[]>([]);
  const [outputFormat, setFormat]   = useState<OutputFormat>('mp4');
  const [runStatus, setRunStatus]   = useState<RunStatus>('idle');
  const [error, setError]           = useState<string | null>(null);

  const addFiles  = (files: File[]) => setItems((p) => [...p, ...createBatchItems(files)]);
  const removeItem = (id: string)  => setItems((p) => p.filter((i) => i.id !== id));

  const updateItem = (id: string, patch: Partial<BatchItem>) =>
    setItems((p) => p.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const run = async () => {
    const pending = items.filter((i) => i.status === 'pending');
    if (pending.length === 0) return;
    setError(null);

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
          const outputName = `output.${outputFormat}`;

          await ffmpeg.writeFile(inputName, await fetchFile(item.file));
          await ffmpeg.exec(['-i', inputName, ...FORMAT_ARGS[outputFormat], outputName]);

          const data = await ffmpeg.readFile(outputName);
          const blob = fileDataToBlob(data, `video/${outputFormat}`);

          await ffmpeg.deleteFile(inputName);
          await ffmpeg.deleteFile(outputName);

          const outName = makeOutputName(item.file.name, '_convrt', outputFormat, usedNames);
          updateItem(item.id, { status: 'done', progress: 1, outputBlob: blob, outputName: outName });
        } catch (err) {
          updateItem(item.id, {
            status: 'error',
            error: err instanceof Error ? err.message : 'Failed',
          });
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

  const doneItems   = items.filter((i) => i.status === 'done');
  const isRunning   = runStatus === 'loading' || runStatus === 'running';
  const pendingCount = items.filter((i) => i.status === 'pending').length;
  const totalSaved  = doneItems.reduce(
    (acc, i) => acc + (i.file.size - (i.outputBlob?.size ?? i.file.size)), 0
  );

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
        <div className="space-y-5">
          {/* Format picker */}
          <div>
            <label className="block text-sm text-zinc-400 mb-2">Output Format</label>
            <div className="flex flex-wrap gap-2">
              {OUTPUT_FORMATS.map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => setFormat(fmt)}
                  disabled={isRunning}
                  className={`px-4 py-2 rounded-lg text-sm font-medium uppercase transition-all ${
                    outputFormat === fmt
                      ? 'bg-[#E85D20] text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 disabled:opacity-40'
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>
          </div>

          {runStatus === 'loading' && <FFmpegLoader />}

          {!isRunning && pendingCount > 0 && (
            <button
              onClick={run}
              className="w-full py-3 rounded-xl bg-[#E85D20] hover:bg-[#d94f14] text-white font-semibold transition-colors"
            >
              Convert {pendingCount} file{pendingCount !== 1 ? 's' : ''} → {outputFormat.toUpperCase()}
            </button>
          )}

          {/* Summary + download all */}
          {doneItems.length > 0 && !isRunning && (
            <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-sm text-zinc-400 space-y-0.5">
                  <p className="text-white font-medium">
                    {doneItems.length}/{items.length} converted
                  </p>
                  {totalSaved > 0 && (
                    <p className="text-green-400 text-xs">{formatBytes(totalSaved)} saved total</p>
                  )}
                </div>
                <div className="flex gap-2">
                  {doneItems.length >= 2 && (
                    <button
                      onClick={() => downloadAsZip(items, `convrt-${outputFormat}.zip`)}
                      className="px-4 py-2 rounded-lg bg-[#E85D20] hover:bg-[#d94f14] text-white text-sm font-semibold transition-colors"
                    >
                      Download All (ZIP)
                    </button>
                  )}
                  <button
                    onClick={reset}
                    className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm transition-colors"
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>
          )}

          {error && (
            <p className="text-red-400 text-sm rounded-xl bg-red-950/40 border border-red-900/50 px-4 py-3">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
