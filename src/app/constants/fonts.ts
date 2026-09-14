/** Shared font lists for canvas text and app settings. */
export const CANVAS_FONT_FAMILIES = [
  'Times New Roman',
  'Arial',
  'Inter',
  'Helvetica',
  'Georgia',
  'system-ui',
] as const;

export type CanvasFontFamily = (typeof CANVAS_FONT_FAMILIES)[number];
