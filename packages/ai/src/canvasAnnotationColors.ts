/** Canvas annotation text colors that follow `document.documentElement.dataset.theme`. */

const readTheme = (): string => {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.dataset.theme ?? 'light';
};

export const canvasTitleInk = (): string => {
  const t = readTheme();
  if (t === 'elegant-dark') return '#ececec';
  if (t === 'ink-dark') return '#ffffff';
  return '#0f172a';
};

export const canvasLabelInk = (): string => {
  const t = readTheme();
  if (t === 'elegant-dark') return '#ececec';
  if (t === 'ink-dark') return '#f4f4f5';
  return '#334155';
};

export const canvasMutedAnnotationInk = (): string => {
  const t = readTheme();
  if (t === 'elegant-dark' || t === 'ink-dark') return '#9b9b9b';
  return '#64748b';
};
