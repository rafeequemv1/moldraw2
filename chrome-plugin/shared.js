/** Shared helpers for the MolDraw Chrome plugin (popup, options, service worker). */

export const MATHPIX_TEXT_URL = 'https://api.mathpix.com/v3/text';

export const MOLDRAW_PRODUCTION = 'https://moldraw.com';
export const MOLDRAW_LOCAL = 'http://127.0.0.1:5173';

export const DEFAULTS = {
  openTarget: 'production',
  autoOpen: true,
};

const KEY_FIELDS = ['mathpixAppId', 'mathpixAppKey', 'openTarget', 'autoOpen'];

export async function loadSettings() {
  const stored = await chrome.storage.sync.get(KEY_FIELDS);
  return {
    mathpixAppId: String(stored.mathpixAppId || '').trim(),
    mathpixAppKey: String(stored.mathpixAppKey || '').trim(),
    openTarget: stored.openTarget === 'local' || stored.openTarget === 'both'
      ? stored.openTarget
      : DEFAULTS.openTarget,
    autoOpen: stored.autoOpen !== false,
  };
}

export async function saveSettings(patch) {
  const next = {};
  if (patch.mathpixAppId != null) next.mathpixAppId = String(patch.mathpixAppId).trim();
  if (patch.mathpixAppKey != null) next.mathpixAppKey = String(patch.mathpixAppKey).trim();
  if (patch.openTarget != null) next.openTarget = patch.openTarget;
  if (patch.autoOpen != null) next.autoOpen = Boolean(patch.autoOpen);
  await chrome.storage.sync.set(next);
}

export function hasMathpixKeys(settings) {
  return Boolean(settings?.mathpixAppId && settings?.mathpixAppKey);
}

export function isRestrictedUrl(url) {
  if (!url) return true;
  return /^(chrome|edge|brave|opera|about|devtools|chrome-extension):/i.test(url)
    || /^https?:\/\/chrome(webstore)?\.google\.com\//i.test(url)
    || /^https?:\/\/chromewebstore\.google\.com\//i.test(url);
}

/**
 * Mathpix chemistry diagrams are returned as Mathpix Markdown
 * `<smiles>…</smiles>` (optional `inchi` attribute) when include_smiles is true.
 */
export function extractSmilesList(text) {
  const src = String(text || '');
  const found = [];
  const tagRe = /<smiles\b([^>]*)>([\s\S]*?)<\/smiles>/gi;
  let match;
  while ((match = tagRe.exec(src))) {
    const attrs = match[1] || '';
    const value = decodeXml(match[2]).trim();
    const inchi = /inchi\s*=\s*"([^"]+)"/i.exec(attrs)?.[1] || null;
    if (value) found.push({ smiles: value, inchi });
  }
  return found;
}

function decodeXml(value) {
  return String(value)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

export function looksLikeSmiles(value) {
  const s = String(value || '').trim();
  if (!s || s.length > 20000) return false;
  if (/\s/.test(s)) return false;
  if (/<smiles\b/i.test(s)) return false;
  if (!/[A-Za-z]/.test(s)) return false;
  if (!/[0-9=#()\[\]+\-@%/\\.]/.test(s) && s.length > 8) return false;
  return /^[A-Za-z0-9@+\-\[\]()\\/=#$:.%>~]+$/.test(s);
}

export function parseMathpixChemistry(payload) {
  const text = String(payload?.text || '');
  const tagged = extractSmilesList(text);
  let smilesList = tagged.map((item) => item.smiles);

  if (!smilesList.length && looksLikeSmiles(text)) {
    smilesList = [text.trim()];
  }

  const unique = [];
  for (const smiles of smilesList) {
    if (!unique.includes(smiles)) unique.push(smiles);
  }

  const joined = unique.length > 1 ? unique.join('.') : (unique[0] || '');
  const isReaction = unique.some((s) => s.includes('>>')) || joined.includes('>>');

  return {
    smiles: unique.length === 1 ? unique[0] : joined,
    smilesList: unique,
    isReaction,
    inchi: tagged[0]?.inchi || null,
    confidence: typeof payload?.confidence === 'number' ? payload.confidence : null,
    rawText: text,
  };
}

export function buildMolDrawUrl(base, smiles) {
  const root = String(base || MOLDRAW_PRODUCTION).replace(/\/$/, '');
  const trimmed = String(smiles || '').trim();
  const param = trimmed.includes('>>') ? 'reaction' : 'smiles';
  return `${root}/?${param}=${encodeURIComponent(trimmed)}`;
}

export function editorUrlsFor(smiles, target) {
  const urls = [];
  if (target === 'local') urls.push(buildMolDrawUrl(MOLDRAW_LOCAL, smiles));
  else if (target === 'both') {
    urls.push(buildMolDrawUrl(MOLDRAW_PRODUCTION, smiles));
    urls.push(buildMolDrawUrl(MOLDRAW_LOCAL, smiles));
  } else {
    urls.push(buildMolDrawUrl(MOLDRAW_PRODUCTION, smiles));
  }
  return urls;
}

export async function convertImageWithMathpix(dataUrl, settings) {
  const body = {
    src: dataUrl,
    include_smiles: true,
    include_inchi: true,
    formats: ['text'],
    metadata: { improve_mathpix: false },
  };

  const response = await fetch(MATHPIX_TEXT_URL, {
    method: 'POST',
    headers: {
      app_id: settings.mathpixAppId,
      app_key: settings.mathpixAppKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = payload?.error
      || payload?.error_info?.message
      || `Mathpix request failed (${response.status})`;
    throw new Error(message);
  }

  if (payload?.error) {
    throw new Error(String(payload.error));
  }

  const parsed = parseMathpixChemistry(payload);
  if (!parsed.smiles) {
    throw new Error('No chemical structure found. Try a tighter crop of the molecule.');
  }
  return parsed;
}

export async function blobToDataUrl(blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const mime = blob.type || 'image/png';
  return `data:${mime};base64,${btoa(binary)}`;
}

export async function cropVisibleTab(dataUrl, rect, viewport) {
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  const scaleX = bitmap.width / Math.max(1, viewport.width);
  const scaleY = bitmap.height / Math.max(1, viewport.height);
  const sx = Math.max(0, Math.round(rect.x * scaleX));
  const sy = Math.max(0, Math.round(rect.y * scaleY));
  const sw = Math.max(1, Math.min(bitmap.width - sx, Math.round(rect.w * scaleX)));
  const sh = Math.max(1, Math.min(bitmap.height - sy, Math.round(rect.h * scaleY)));
  const canvas = new OffscreenCanvas(sw, sh);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
  bitmap.close();

  let out = await canvas.convertToBlob({ type: 'image/png' });
  if (out.size > 1_400_000) {
    out = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.86 });
  }
  return blobToDataUrl(out);
}

export async function makeThumbnail(dataUrl, maxWidth = 240) {
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, maxWidth / Math.max(1, bitmap.width));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const out = await canvas.convertToBlob({ type: 'image/png' });
  return blobToDataUrl(out);
}
