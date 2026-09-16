/** Shared font lists for canvas text, atom labels, and Style settings. */

export const CANVAS_FONT_FAMILIES = [
  'Times New Roman',
  'Arial',
  'Inter',
  'Helvetica',
  'Georgia',
  'system-ui',
  'Noto Sans',
  'Noto Sans Mono',
  'Source Sans 3',
  'IBM Plex Sans',
  'Atkinson Hyperlegible',
  'Nunito Sans',
  'Fira Sans',
] as const;

export type CanvasFontFamily = (typeof CANVAS_FONT_FAMILIES)[number];

/**
 * Webfonts fetched via Google Fonts (OFL). Chosen so I / l / 1 stay distinct
 * on atom labels (iodine vs lookalikes). Inter was already the UI webfont.
 */
export const CANVAS_WEBFONT_FAMILIES = [
  'Inter',
  'Noto Sans',
  'Noto Sans Mono',
  'Source Sans 3',
  'IBM Plex Sans',
  'Atkinson Hyperlegible',
  'Nunito Sans',
  'Fira Sans',
] as const;

/** CSS `font-family` value for picker previews and canvas 2D preload. */
export function canvasFontCssFamily(name: string): string {
  const t = name.trim();
  if (!t || t === 'system-ui') return 'system-ui, sans-serif';
  return `"${t.replace(/"/g, '\\"')}"`;
}

/** Warm canvas 2D so the first label paint is not a fallback face. */
export function preloadCanvasWebfonts(): void {
  if (typeof document === 'undefined' || !document.fonts?.load) return;
  const loads = CANVAS_WEBFONT_FAMILIES.flatMap(family => [
    document.fonts.load(`400 16px "${family}"`),
    document.fonts.load(`700 16px "${family}"`),
  ]);
  void Promise.all(loads);
}
