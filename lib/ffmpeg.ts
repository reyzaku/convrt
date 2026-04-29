'use client';

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

export function getFFmpeg(): FFmpeg {
  if (!ffmpegInstance) {
    ffmpegInstance = new FFmpeg();
  }
  return ffmpegInstance;
}

export async function loadFFmpeg(
  onProgress?: (progress: number) => void
): Promise<FFmpeg> {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const ffmpeg = getFFmpeg();
    if (ffmpeg.loaded) return ffmpeg;

    // jsDelivr reliably serves Access-Control-Allow-Origin: * on every file,
    // unlike unpkg which can return responses without CORS headers on the
    // worker file — causing failures under our require-corp COEP policy.
    const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm';

    const [coreURL, wasmURL, workerURL] = await Promise.all([
      toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript'),
    ]);

    await ffmpeg.load({ coreURL, wasmURL, workerURL });
    return ffmpeg;
  })();

  return loadPromise;
}

export { fetchFile };

// FFmpeg's readFile returns Uint8Array<ArrayBufferLike> which TypeScript refuses
// as a Blob constructor arg because SharedArrayBuffer ≠ ArrayBuffer. Copying the
// bytes into a fresh Uint8Array<ArrayBuffer> satisfies the type checker at zero cost.
export function fileDataToBlob(data: unknown, mimeType: string): Blob {
  const u8 = data as Uint8Array;
  const copy = new Uint8Array(u8.byteLength);
  copy.set(u8);
  return new Blob([copy], { type: mimeType });
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? '';
}
