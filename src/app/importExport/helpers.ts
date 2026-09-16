/**
 * Pure helpers for molecule import / export / clipboard paste detection.
 * Kept out of App.tsx so I/O logic can move into hooks without dragging UI.
 */
import type { CanvasImage } from '@moldraw/domain';

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

export const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image'));
    reader.readAsDataURL(blob);
  });

export const loadImageSize = (dataUrl: string): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth || img.width || 260;
      const height = img.naturalHeight || img.height || 200;
      resolve({ width, height });
    };
    img.onerror = () => reject(new Error('Unsupported image data'));
    img.src = dataUrl;
  });

const ILLUSTRATION_EXTS = new Set(['svg', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp']);

export function isIllustrationFile(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (ILLUSTRATION_EXTS.has(ext)) return true;
  const t = (file.type || '').toLowerCase();
  return t.startsWith('image/') || t === 'image/svg+xml';
}

export function illustrationMimeType(file: File): string {
  const t = (file.type || '').toLowerCase();
  if (t.startsWith('image/') || t === 'image/svg+xml') return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'svg') return 'image/svg+xml';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'image/png';
}

export async function blobAsIllustration(file: File): Promise<Blob> {
  const mime = illustrationMimeType(file);
  if (file.type === mime) return file;
  return new Blob([await file.arrayBuffer()], { type: mime });
}

const newCanvasAssetId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 11);

export const canvasImageFromBlob = async (
  blob: Blob,
  target: { x: number; y: number },
  name?: string,
): Promise<CanvasImage> => {
  const dataUrl = await blobToDataUrl(blob);
  const size = await loadImageSize(dataUrl);
  const maxSide = 260;
  const scale = Math.min(1, maxSide / Math.max(size.width, size.height, 1));
  const width = Math.max(1, size.width * scale);
  const height = Math.max(1, size.height * scale);
  return {
    id: newCanvasAssetId(),
    dataUrl,
    mimeType: blob.type || 'image/png',
    x: target.x - width / 2,
    y: target.y - height / 2,
    width,
    height,
    name,
  };
};

/**
 * Excel / Sheets wrap a single SMILES cell in quotes, a trailing newline, or
 * TSV. Molfiles and CDXML must stay intact.
 */
export const normalizeClipboardStructureText = (text: string): string => {
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return '';
  if (
    /^InChI=/i.test(trimmed) ||
    /<CDXML|<cdxml/i.test(trimmed) ||
    /\$RXN/i.test(trimmed) ||
    /V2000|V3000|M\s+END|\$\$\$\$/i.test(trimmed) ||
    /<cml[\s>]|<molecule[\s>]/i.test(trimmed)
  ) {
    return trimmed;
  }
  const firstLine = trimmed.split(/\r?\n/).map(line => line.trim()).find(Boolean) ?? '';
  let cell = firstLine.split(/\t/)[0]?.trim() ?? '';
  if (cell.length >= 2) {
    const quote = cell[0];
    if ((quote === '"' || quote === "'") && cell.endsWith(quote)) {
      cell = cell.slice(1, -1).replace(/""/g, '"').trim();
    }
  }
  return cell || trimmed;
};

/** Plain text, XML, or Excel HTML table from a native `paste` event. */
export const clipboardEventStructureText = (clipboard: DataTransfer): string => {
  const plain = clipboard.getData('text/plain') || clipboard.getData('text/xml');
  const html = clipboard.getData('text/html');
  const fromHtml = html ? textFromHtmlTable(html) : null;
  return normalizeClipboardStructureText(plain || fromHtml || '');
};

/** Extract tab-separated rows from an HTML table (Excel / Sheets clipboard). */
export const textFromHtmlTable = (html: string): string | null => {
  if (!/<table[\s>]/i.test(html)) return null;
  const rows: string[] = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr: RegExpExecArray | null;
  while ((tr = trRe.exec(html))) {
    const cells: string[] = [];
    const cellRe = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
    let cell: RegExpExecArray | null;
    while ((cell = cellRe.exec(tr[1]!))) {
      const text = cell[1]!
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      cells.push(text);
    }
    if (cells.length > 0) rows.push(cells.join('\t'));
  }
  return rows.length > 0 ? rows.join('\n') : null;
};

export type SystemClipboardPayload = {
  text: string;
  imageBlob: Blob | null;
};

/** Read plain text from the system clipboard, including Excel HTML tables. */
export const readSystemClipboardPayload = async (): Promise<SystemClipboardPayload> => {
  let text = '';
  let imageBlob: Blob | null = null;
  try {
    if ('read' in navigator.clipboard) {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find(type => type.startsWith('image/'));
        if (imageType && !imageBlob) {
          imageBlob = await item.getType(imageType);
        }
        if (!text.trim() && item.types.includes('text/plain')) {
          text = await (await item.getType('text/plain')).text();
        }
      }
      if (!text.trim()) {
        for (const item of items) {
          if (!item.types.includes('text/html')) continue;
          const html = await (await item.getType('text/html')).text();
          const fromHtml = textFromHtmlTable(html);
          if (fromHtml?.trim()) {
            text = fromHtml;
            break;
          }
        }
      }
    }
  } catch {
    /* fall through to readText */
  }
  if (!text.trim()) {
    try {
      text = await navigator.clipboard.readText();
    } catch {
      text = '';
    }
  }
  text = normalizeClipboardStructureText(text);
  // Excel copies a cell bitmap plus the SMILES. Prefer the chemical text.
  if (looksLikeStructureClipboardText(text)) {
    imageBlob = null;
  }
  return { text, imageBlob };
};

export const looksLikeStructureClipboardText = (text: string): boolean => {
  const trimmed = normalizeClipboardStructureText(text);
  if (!trimmed) return false;
  // Copy SVG writes a picture (PNG/HTML). If an OS still exposes SVG markup as
  // text, do not treat Ctrl+V as a chemical import (Excel-style double-paste).
  if (/<svg[\s>]/i.test(trimmed)) return false;
  if (/^InChI=/i.test(trimmed)) return true;
  if (/<CDXML|<cdxml/i.test(trimmed)) return true;
  if (/\$RXN/i.test(trimmed)) return true;
  if (/<cml[\s>]|<molecule[\s>]/i.test(trimmed) && !/<cdxml/i.test(trimmed)) return true;
  if (/V2000|V3000|M\s+END|\$\$\$\$/i.test(trimmed)) return true;
  const lines = trimmed.split(/\r?\n/).filter(Boolean);
  if (lines.length === 1) {
    const line = lines[0] ?? '';
    if (/^[A-Za-z0-9@+\-[\]()=#\\/.$:%]+(?:\s+\S+)?$/.test(line)) return true;
    return false;
  }
  if (/^\d+\s*$/m.test(lines[0] ?? '') && /^[A-Za-z]{1,3}\s+[-\d.]/m.test(lines[1] ?? '')) {
    return true;
  }
  return /^\s*\d+\s+\d+/m.test(trimmed);
};

/** @deprecated Prefer `computeExportBounds` from `@moldraw/canvas` (includes arrows/text). */
export { computeExportBounds as exportBoundsForMolecule } from '@moldraw/canvas';
