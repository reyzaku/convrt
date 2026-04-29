export interface BatchItem {
  id: string;
  file: File;
  status: 'pending' | 'processing' | 'done' | 'error';
  progress: number;
  outputBlob?: Blob;
  outputName?: string;
  error?: string;
}

export function createBatchItems(files: File[]): BatchItem[] {
  return files.map((file) => ({
    id: Math.random().toString(36).slice(2),
    file,
    status: 'pending',
    progress: 0,
  }));
}

/** Derive a deduplicated output filename for the ZIP */
export function makeOutputName(
  originalName: string,
  suffix: string,
  ext: string,
  usedNames: Set<string>
): string {
  const base = originalName.replace(/\.[^.]+$/, '');
  let candidate = `${base}${suffix}.${ext}`;
  let n = 2;
  while (usedNames.has(candidate)) {
    candidate = `${base}${suffix}_${n}.${ext}`;
    n++;
  }
  usedNames.add(candidate);
  return candidate;
}
