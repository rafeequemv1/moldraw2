/**
 * Clipboard writes for structure pictures (Copy SVG / Copy PNG).
 *
 * Office, Google Sheets/Docs, and PowerPoint treat `text/plain` SVG markup as
 * source code. They paste a picture when `image/png` (and often `text/html`
 * with an `<img>`) is on the clipboard. SVG is kept as `image/svg+xml` for
 * ChemDraw-like tools — never as `text/plain`.
 */
import { blobToDataUrl } from './helpers';

export const CLIPBOARD_PNG = 'image/png';
export const CLIPBOARD_SVG = 'image/svg+xml';
export const CLIPBOARD_HTML = 'text/html';

type ClipboardBlob = Blob | Promise<Blob>;
type ClipboardPayload = Record<string, ClipboardBlob>;

const htmlFromPngDataUrl = (pngDataUrl: string): string =>
  `<html><body><!--StartFragment--><img src="${pngDataUrl}" alt="MolDraw structure" /><!--EndFragment--></body></html>`;

const clipboardItemSupports = (type: string): boolean | null => {
  const Ctor = globalThis.ClipboardItem as
    | (typeof ClipboardItem & { supports?: (mime: string) => boolean })
    | undefined;
  if (!Ctor || typeof Ctor.supports !== 'function') return null;
  try {
    return Ctor.supports(type);
  } catch {
    return false;
  }
};

/** Drop types the UA advertises as unwritable so one bad MIME does not fail the whole write. */
export const filterWritableClipboardTypes = (types: readonly string[]): string[] => {
  const kept = types.filter(type => clipboardItemSupports(type) !== false);
  return kept.length > 0 ? kept : [...types];
};

/**
 * MIME combinations to try, richest first. Never includes `text/plain`
 * (that is what made Word/Sheets paste SVG source).
 */
export const structurePictureClipboardAttempts = (includeSvg: boolean): string[][] => {
  const attempts: string[][] = [];
  if (includeSvg) attempts.push([CLIPBOARD_PNG, CLIPBOARD_SVG, CLIPBOARD_HTML]);
  attempts.push([CLIPBOARD_PNG, CLIPBOARD_HTML]);
  attempts.push([CLIPBOARD_PNG]);
  attempts.push([CLIPBOARD_HTML]);
  return attempts;
};

const writePayload = async (payload: ClipboardPayload): Promise<void> => {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    throw new Error('Clipboard API unavailable');
  }
  await navigator.clipboard.write([new ClipboardItem(payload)]);
};

/** Last-resort Windows/Office path: selecting an <img> often yields CF_HTML + a bitmap. */
const copyPngViaDomSelection = async (png: Blob): Promise<void> => {
  const dataUrl = await blobToDataUrl(png);
  const host = document.createElement('div');
  host.contentEditable = 'true';
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
  const img = document.createElement('img');
  img.src = dataUrl;
  img.alt = 'MolDraw structure';
  host.appendChild(img);
  document.body.appendChild(host);
  try {
    if (!img.complete) {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Image copy failed'));
      });
    }
    const selection = window.getSelection();
    if (!selection) throw new Error('Clipboard API unavailable');
    const range = document.createRange();
    range.selectNodeContents(host);
    selection.removeAllRanges();
    selection.addRange(range);
    const ok = document.execCommand('copy');
    selection.removeAllRanges();
    if (!ok) throw new Error('Copy failed');
  } finally {
    host.remove();
  }
};

export type WriteStructurePictureResult = {
  types: string[];
};

/**
 * Write a structure picture. Prefer `image/png` (Word/Sheets), then HTML `<img>`,
 * and `image/svg+xml` when provided. Never writes SVG markup as `text/plain`.
 */
export async function writeStructurePictureToClipboard(opts: {
  png: ClipboardBlob;
  svgText?: string | null;
}): Promise<WriteStructurePictureResult> {
  const png = Promise.resolve(opts.png);
  const html = png.then(async blob => {
    const dataUrl = await blobToDataUrl(blob);
    return new Blob([htmlFromPngDataUrl(dataUrl)], { type: CLIPBOARD_HTML });
  });
  const svg =
    opts.svgText && opts.svgText.length > 0
      ? new Blob([opts.svgText], { type: CLIPBOARD_SVG })
      : null;

  const resolveType = (type: string): ClipboardBlob => {
    if (type === CLIPBOARD_PNG) return png;
    if (type === CLIPBOARD_HTML) return html;
    if (type === CLIPBOARD_SVG && svg) return svg;
    throw new Error(`Unknown clipboard type ${type}`);
  };

  const canWrite =
    typeof ClipboardItem !== 'undefined' && typeof navigator.clipboard?.write === 'function';

  if (canWrite) {
    const seen = new Set<string>();
    for (const types of structurePictureClipboardAttempts(!!svg)) {
      const filtered = filterWritableClipboardTypes(types);
      const key = filtered.slice().sort().join('\0');
      if (seen.has(key)) continue;
      seen.add(key);
      const payload: ClipboardPayload = {};
      // Promises keep the user-activation token on Safari while blobs encode.
      for (const type of filtered) payload[type] = Promise.resolve(resolveType(type));
      try {
        await writePayload(payload);
        return { types: filtered };
      } catch {
        /* Safari/Firefox reject unsupported MIME sets — try a slimmer payload. */
      }
    }
  }

  try {
    await copyPngViaDomSelection(await png);
    return { types: [CLIPBOARD_PNG] };
  } catch {
    throw new Error('Clipboard is blocked or images cannot be copied in this browser');
  }
}
