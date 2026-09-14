import { downloadBlob } from './helpers';

export type SavePickerType = {
  description: string;
  mimeType: string;
  extensions: string[];
};

export type PickedSaveFile = {
  handle: FileSystemFileHandle;
  name: string;
  /** Lowercase extension including the leading dot (e.g. `.mol`). */
  ext: string;
};

const pickerWindow = (): Window & {
  showSaveFilePicker?: (options: {
    suggestedName?: string;
    id?: string;
    startIn?: string;
    types?: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<FileSystemFileHandle>;
} => window as Window & {
  showSaveFilePicker?: (options: {
    suggestedName?: string;
    id?: string;
    startIn?: string;
    types?: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<FileSystemFileHandle>;
};

export function canPickSaveLocation(): boolean {
  return typeof window !== 'undefined' && typeof pickerWindow().showSaveFilePicker === 'function';
}

const fileExt = (name: string): string => {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
};

/** Native Save as types shown in the File menu picker. Native design is first (default). */
export const FILE_SAVE_AS_TYPES: readonly SavePickerType[] = [
  { description: 'Moldraw design (entire canvas)', mimeType: 'application/json', extensions: ['.moldraw'] },
  { description: 'MDL Molfile (structures only)', mimeType: 'chemical/x-mdl-molfile', extensions: ['.mol'] },
  { description: 'ChemDraw CDXML', mimeType: 'chemical/x-cdxml', extensions: ['.cdxml'] },
  { description: 'PNG image', mimeType: 'image/png', extensions: ['.png'] },
  { description: 'SVG image', mimeType: 'image/svg+xml', extensions: ['.svg'] },
  { description: 'PDF', mimeType: 'application/pdf', extensions: ['.pdf'] },
];

export type SaveTextFileOptions = {
  suggestedName: string;
  contents: string;
  mimeType: string;
  description: string;
  extensions: string[];
};

export async function writeBlobToHandle(handle: FileSystemFileHandle, blob: Blob): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

/** Open the OS Save as dialog (folder + filename). `null` = cancelled. */
export async function pickSaveLocation(opts: {
  suggestedName: string;
  types: readonly SavePickerType[];
}): Promise<PickedSaveFile | null> {
  const showSaveFilePicker = pickerWindow().showSaveFilePicker;
  if (!showSaveFilePicker) return null;
  try {
    const handle = await showSaveFilePicker({
      suggestedName: opts.suggestedName,
      id: 'moldraw-save',
      startIn: 'documents',
      types: opts.types.map(t => ({
        description: t.description,
        accept: { [t.mimeType]: [...t.extensions] },
      })),
    });
    const name = handle.name || opts.suggestedName;
    return { handle, name, ext: fileExt(name) };
  } catch (err) {
    if ((err as DOMException)?.name === 'AbortError') return null;
    return null;
  }
}

/** Save a blob via native picker (folder + name), or download as fallback. */
export async function saveBlobToDisk(opts: {
  suggestedName: string;
  blob: Blob;
  mimeType: string;
  description: string;
  extensions: string[];
}): Promise<boolean> {
  const picked = canPickSaveLocation()
    ? await pickSaveLocation({
        suggestedName: opts.suggestedName,
        types: [
          {
            description: opts.description,
            mimeType: opts.mimeType,
            extensions: opts.extensions,
          },
        ],
      })
    : null;

  if (picked) {
    try {
      await writeBlobToHandle(picked.handle, opts.blob);
      return true;
    } catch {
      downloadBlob(opts.blob, picked.name || opts.suggestedName);
      return true;
    }
  }

  if (canPickSaveLocation()) return false;
  downloadBlob(opts.blob, opts.suggestedName);
  return true;
}

/** Save text via native file picker (folder + name), or download as fallback. */
export async function saveTextFileToDisk(opts: SaveTextFileOptions): Promise<boolean> {
  const blob = new Blob([opts.contents], { type: opts.mimeType });
  return saveBlobToDisk({
    suggestedName: opts.suggestedName,
    blob,
    mimeType: opts.mimeType,
    description: opts.description,
    extensions: opts.extensions,
  });
}
