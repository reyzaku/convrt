'use client';

import { useCallback, useRef, useState } from 'react';
import { formatBytes } from '@/lib/ffmpeg';

interface DropZoneProps {
  onFile: (file: File) => void;
  accept?: string;
  file: File | null;
  label?: string;
}

export default function DropZone({ onFile, accept, file, label }: DropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped) onFile(dropped);
    },
    [onFile]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) onFile(selected);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`
        relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed
        cursor-pointer transition-all duration-200 p-8 min-h-[180px]
        ${dragging
          ? 'border-[#E85D20] bg-[#E85D20]/5'
          : file
            ? 'border-zinc-600 bg-zinc-900/60'
            : 'border-zinc-700 bg-zinc-900/40 hover:border-zinc-500 hover:bg-zinc-900/60'
        }
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        className="hidden"
      />

      {file ? (
        <div className="text-center space-y-1">
          <div className="text-3xl">🎬</div>
          <p className="font-medium text-white text-sm truncate max-w-[240px]">{file.name}</p>
          <p className="text-xs text-zinc-500">
            {formatBytes(file.size)} · {file.name.split('.').pop()?.toUpperCase()}
          </p>
          <p className="text-xs text-[#E85D20] mt-2">Click or drag to replace</p>
        </div>
      ) : (
        <div className="text-center space-y-2">
          <div className="text-3xl opacity-60">📁</div>
          <p className="text-zinc-300 text-sm font-medium">
            {label ?? 'Drop a file here, or click to browse'}
          </p>
          <p className="text-xs text-zinc-600">
            {accept ? `Accepted: ${accept}` : 'Any video format supported'}
          </p>
        </div>
      )}
    </div>
  );
}
