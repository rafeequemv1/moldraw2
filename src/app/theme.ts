/**
 * UI theme ids + structure ink for the canvas (CSS cannot paint canvas 2D).
 * CSS variables live in `src/styles/theme.css` — keep hexes in sync.
 */

import './leftDockCoordinator';

export type UiThemeId = 'light' | 'elegant-dark' | 'ink-dark';

export const UI_THEME_OPTIONS: {
  id: UiThemeId;
  label: string;
  hint: string;
}[] = [
  {
    id: 'light',
    label: 'Light',
    hint: 'Classic ChemDraw-like light chrome and black structure ink',
  },
  {
    id: 'elegant-dark',
    label: 'Elegant dark',
    hint: 'Soft ChatGPT-style charcoal UI with light bonds on a dark canvas',
  },
  {
    id: 'ink-dark',
    label: 'Ink dark',
    hint: 'Near-black UI and canvas — white bonds and white atom letters',
  },
];

export type StructureThemeInk = {
  ink: string;
  hydrogen: string;
  gridMinor: string;
  gridMajor: string;
  gridAxis: string;
  gridDotMinor?: string;
  gridDotMajor?: string;
  gridDotAxis?: string;
  /** Selection wash (canvas highlight). */
  selectionHoverFill: string;
  selectionFill: string;
  selectionHoverStroke: string;
  selectionStroke: string;
  selectionBond: string;
  transformHandleFill: string;
  transformHandleStroke: string;
  transformBoxStroke: string;
  transformAccent: string;
  transformBadgeFill: string;
  transformBadgeText: string;
  transformGuideStroke: string;
  marqueeStroke: string;
  marqueeFill: string;
};

const TRANSFORM_LIGHT = {
  transformHandleFill: '#ffffff',
  transformHandleStroke: '#0f172a',
  transformBoxStroke: 'rgba(13, 148, 136, 0.92)',
  transformAccent: '#2dd4bf',
  transformBadgeFill: 'rgba(240, 253, 250, 0.97)',
  transformBadgeText: '#0f172a',
  transformGuideStroke: 'rgba(45, 212, 191, 0.55)',
  marqueeStroke: 'rgba(13, 148, 136, 0.85)',
  marqueeFill: 'rgba(45, 212, 191, 0.08)',
} as const;

const TRANSFORM_DARK = {
  transformHandleFill: '#f8fafc',
  transformHandleStroke: '#0f172a',
  transformBoxStroke: 'rgba(94, 234, 212, 0.92)',
  transformAccent: '#5eead4',
  transformBadgeFill: 'rgba(15, 23, 42, 0.94)',
  transformBadgeText: '#f8fafc',
  transformGuideStroke: 'rgba(153, 246, 228, 0.55)',
  marqueeStroke: 'rgba(94, 234, 212, 0.9)',
  marqueeFill: 'rgba(45, 212, 191, 0.14)',
} as const;

/** Default structure colors per theme (match --structure-* / --grid-* in theme.css). */
export function structureInkForTheme(theme: UiThemeId | undefined): StructureThemeInk {
  switch (theme) {
    case 'elegant-dark':
      return {
        ink: '#ececec',
        hydrogen: '#a1a1aa',
        gridMinor: 'rgba(255, 255, 255, 0.1)',
        gridMajor: 'rgba(255, 255, 255, 0.18)',
        gridAxis: 'rgba(255, 255, 255, 0.28)',
        gridDotMinor: 'rgba(226, 232, 240, 0.72)',
        gridDotMajor: 'rgba(248, 250, 252, 0.9)',
        gridDotAxis: 'rgba(255, 255, 255, 1)',
        selectionHoverFill: 'rgba(45, 212, 191, 0.28)',
        selectionFill: 'rgba(56, 189, 248, 0.38)',
        selectionHoverStroke: 'rgba(125, 211, 252, 0.85)',
        selectionStroke: 'rgba(45, 212, 191, 0.7)',
        selectionBond: 'rgba(56, 189, 248, 0.55)',
        ...TRANSFORM_DARK,
      };
    case 'ink-dark':
      return {
        ink: '#ffffff',
        hydrogen: '#d4d4d8',
        gridMinor: 'rgba(255, 255, 255, 0.12)',
        gridMajor: 'rgba(255, 255, 255, 0.2)',
        gridAxis: 'rgba(255, 255, 255, 0.32)',
        gridDotMinor: 'rgba(226, 232, 240, 0.74)',
        gridDotMajor: 'rgba(248, 250, 252, 0.92)',
        gridDotAxis: 'rgba(255, 255, 255, 1)',
        selectionHoverFill: 'rgba(45, 212, 191, 0.3)',
        selectionFill: 'rgba(56, 189, 248, 0.4)',
        selectionHoverStroke: 'rgba(125, 211, 252, 0.9)',
        selectionStroke: 'rgba(94, 234, 212, 0.75)',
        selectionBond: 'rgba(56, 189, 248, 0.6)',
        ...TRANSFORM_DARK,
      };
    case 'light':
    default:
      return {
        ink: '#0f172a',
        hydrogen: '#94a3b8',
        gridMinor: 'rgba(15, 23, 42, 0.1)',
        gridMajor: 'rgba(15, 23, 42, 0.18)',
        gridAxis: 'rgba(15, 23, 42, 0.28)',
        gridDotMinor: 'rgba(15, 23, 42, 0.78)',
        gridDotMajor: 'rgba(15, 23, 42, 0.94)',
        gridDotAxis: 'rgba(2, 6, 23, 1)',
        selectionHoverFill: 'rgba(125, 211, 252, 0.28)',
        selectionFill: 'rgba(56, 189, 248, 0.42)',
        selectionHoverStroke: 'rgba(14, 165, 233, 0.7)',
        selectionStroke: 'rgba(45, 212, 191, 0.45)',
        selectionBond: 'rgba(56, 189, 248, 0.42)',
        ...TRANSFORM_LIGHT,
      };
  }
}

export {
  canvasLabelInk,
  canvasMutedAnnotationInk,
  canvasTitleInk,
} from '../../packages/ai/src/canvasAnnotationColors';

/** Toolbar / library canvas preview stroke (white in dark themes). */
export function previewStrokeForTheme(theme?: UiThemeId | string | null): string {
  if (theme === 'elegant-dark' || theme === 'ink-dark') return '#ffffff';
  if (typeof document !== 'undefined') {
    const t = document.documentElement.dataset.theme;
    if (t === 'elegant-dark' || t === 'ink-dark') return '#ffffff';
  }
  return '#0f172a';
}

/** 3Dmol viewer clear color (match `--viewer3d-bg` in theme.css). */
export function viewer3dBackgroundForTheme(theme: UiThemeId | undefined): string {
  switch (theme) {
    case 'elegant-dark':
      return '#1a1a1a';
    case 'ink-dark':
      return '#000000';
    case 'light':
    default:
      return '#f8fafc';
  }
}

/** Apply theme to <html> for CSS variables + native form controls. */
export function applyUiThemeToDocument(theme: UiThemeId | undefined): void {
  if (typeof document === 'undefined') return;
  const id: UiThemeId = theme ?? 'light';
  document.documentElement.dataset.theme = id;
  document.documentElement.style.colorScheme = id === 'light' ? 'light' : 'dark';
}
