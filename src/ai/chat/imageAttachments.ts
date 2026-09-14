/**
 * Chat image attachments — resize/compress for Gemini vision + UI previews.
 */
import type { ChatImageAttachment } from '@moldraw/ai/chat';
import { blobToDataUrl } from '../../app/importExport/helpers';

export const MAX_CHAT_IMAGES = 6;
/** Longest edge after resize (keeps payloads reasonable). */
export const MAX_CHAT_IMAGE_EDGE = 1280;
const JPEG_QUALITY = 0.85;

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']);

export function isChatImageMime(mime: string): boolean {
  return ALLOWED_MIME.has(mime.toLowerCase());
}

function newAttachmentId(): string {
  return `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function resizeImageBlob(blob: Blob): Promise<{ dataUrl: string; mimeType: string }> {
  const srcUrl = await blobToDataUrl(blob);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Failed to decode image'));
    el.src = srcUrl;
  });

  const w0 = img.naturalWidth || img.width;
  const h0 = img.naturalHeight || img.height;
  if (!w0 || !h0) {
    return { dataUrl: srcUrl, mimeType: blob.type || 'image/png' };
  }

  const scale = Math.min(1, MAX_CHAT_IMAGE_EDGE / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));

  // Tiny / already-small PNGs: keep original when no resize needed and under ~1.2MB.
  if (scale === 1 && blob.size < 1_200_000 && (blob.type === 'image/png' || blob.type === 'image/webp')) {
    return { dataUrl: srcUrl, mimeType: blob.type };
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { dataUrl: srcUrl, mimeType: blob.type || 'image/png' };
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const mimeType = 'image/jpeg';
  const dataUrl = canvas.toDataURL(mimeType, JPEG_QUALITY);
  return { dataUrl, mimeType };
}

/** Convert a File/Blob into a chat attachment (resized). */
export async function blobToChatAttachment(blob: Blob): Promise<ChatImageAttachment> {
  const mime = (blob.type || 'image/png').toLowerCase();
  if (!isChatImageMime(mime)) {
    throw new Error(`Unsupported image type: ${mime || 'unknown'}`);
  }
  const { dataUrl, mimeType } = await resizeImageBlob(blob);
  return {
    id: newAttachmentId(),
    mimeType,
    dataUrl,
  };
}

/** Collect image File/Blob items from a paste or drop event. */
export function imageBlobsFromDataTransfer(dt: DataTransfer | null): Blob[] {
  if (!dt) return [];
  const out: Blob[] = [];
  if (dt.files?.length) {
    for (const f of Array.from(dt.files)) {
      if (f.type.startsWith('image/') && isChatImageMime(f.type)) out.push(f);
    }
  }
  if (out.length) return out;
  for (const item of Array.from(dt.items ?? [])) {
    if (item.kind === 'file' && item.type.startsWith('image/') && isChatImageMime(item.type)) {
      const f = item.getAsFile();
      if (f) out.push(f);
    }
  }
  return out;
}
