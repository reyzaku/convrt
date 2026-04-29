import { zipSync } from 'fflate';
import type { BatchItem } from './batch';

export async function downloadAsZip(
  items: BatchItem[],
  zipName = 'convrt-batch.zip'
): Promise<void> {
  const done = items.filter((i) => i.status === 'done' && i.outputBlob && i.outputName);
  if (done.length === 0) return;

  const files: Record<string, Uint8Array> = {};
  for (const item of done) {
    const buf = await item.outputBlob!.arrayBuffer();
    files[item.outputName!] = new Uint8Array(buf);
  }

  const zipped = zipSync(files, { level: 0 }); // level 0 = store only (media already compressed)
  // Copy to plain ArrayBuffer — same SharedArrayBuffer ↔ ArrayBuffer resolution as fileDataToBlob
  const copy = new Uint8Array(zipped.byteLength);
  copy.set(zipped);
  const blob = new Blob([copy], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = zipName;
  a.click();
  URL.revokeObjectURL(url);
}
