'use client';

import { useState } from 'react';
import BatchDropZone from './BatchDropZone';
import FFmpegLoader from './FFmpegLoader';
import { loadFFmpeg, fetchFile, formatBytes, getFileExtension, fileDataToBlob } from '@/lib/ffmpeg';
import { type BatchItem, createBatchItems, makeOutputName } from '@/lib/batch';
import { downloadAsZip } from '@/lib/zip';

const RESOLUTIONS = [
  { label: 'Original', value: '' },
  { label: '1080p',    value: 'scale=-2:1080' },
  { label: '720p',     value: 'scale=-2:720' },
  { label: '480p',     value: 'scale=-2:480' },
  { label: '360p',     value: 'scale=-2:360' },
] as const;

type RunStatus = 'idle' | 'loading' | 'running' | 'done';

export default function VideoCompressor() {
  const [items, setItems]         = useState<BatchItem[]>([]);
  const [runStatus, setRunStatus] = useState<RunStatus>('idle');
  const [error, setError]         = useState<string | null>(null);

  const [crf, setCrf]             = useState(28);
  const [resolution, setRes]      = useState('');

  const addFiles   = (files: File[]) => setItems((p) => [...p, ...createBatchItems(files)]);
  const removeItem = (id: string)    => setItems((p) => p.filter((i) => i.id !== id));
  const updateItem = (id: string, patch: Partial<BatchItem>) =>
    setItems((p) => p.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const run = async () => {
    const pending = items.filter((i) => i.status === 'pending');
    if (pending.length === 0) return;
    setError(null);

    const args = [
      '-c:v', 'libx264', '-crf', String(crf),
      '-preset', 'fast', '-c:a', 'aac', '-movflags', '+faststart',
      ...(resolution ? ['-vf', resolution] : []),
    ];

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
          await ffmpeg.exec(['-i', inputName, ...args, 'output.mp4']);

          const data = await ffmpeg.readFile('output.mp4');
          const blob = fileDataToBlob(data, 'video/mp4');

          await ffmpeg.deleteFile(inputName);
          await ffmpeg.deleteFile('output.mp4');

          const outName = makeOutputName(item.file.name, '_compressed', 'mp4', usedNames);
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
  const totalSaved   = doneItems.reduce(
    (acc, i) => acc + (i.file.size - (i.outputBlob?.size ?? i.file.size)), 0
  );

  const qualityLabel =
    crf <= 18 ? 'Lossless' : crf <= 23 ? 'High' : crf <= 28 ? 'Medium' : crf <= 35 ? 'Low' : 'Very Low';

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
          {/* CRF */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">Quality (CRF)</span>
              <span className="text-white font-medium">{crf} — {qualityLabel}</span>
            </div>
            <input type="range" min={0} max={51} step={1} value={crf}
              onChange={(e) => setCrf(Number(e.target.value))}
              className="w-full accent-[#E85D20] cursor-pointer" />
            <div className="flex justify-between text-xs text-zinc-600">
              <span>Best quality (larger)</span>
              <span>Smallest file</span>
            </div>
          </div>

          {/* Resolution */}
          <div>
            <label className="block text-sm text-zinc-400 mb-2">Resolution</label>
            <div className="flex flex-wrap gap-2">
              {RESOLUTIONS.map((r) => (
                <button key={r.label} onClick={() => setRes(r.value)} disabled={isRunning}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    resolution === r.value
                      ? 'bg-[#E85D20] text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 disabled:opacity-40'
                  }`}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {runStatus === 'loading' && <FFmpegLoader />}

          {!isRunning && pendingCount > 0 && (
            <button onClick={run}
              className="w-full py-3 rounded-xl bg-[#E85D20] hover:bg-[#d94f14] text-white font-semibold transition-colors">
              Compress {pendingCount} file{pendingCount !== 1 ? 's' : ''}
            </button>
          )}

          {doneItems.length > 0 && !isRunning && (
            <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4 space-y-1">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-sm text-white font-medium">{doneItems.length}/{items.length} compressed</p>
                  {totalSaved > 0 && (
                    <p className="text-xs text-green-400">{formatBytes(totalSaved)} saved total</p>
                  )}
                </div>
                <div className="flex gap-2">
                  {doneItems.length >= 2 && (
                    <button onClick={() => downloadAsZip(items, 'convrt-compressed.zip')}
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
