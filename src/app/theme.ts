/**
 * UI theme ids + structure ink for the canvas (CSS cannot paint canvas 2D).
 * CSS variables live in `src/styles/theme.css` — keep hexes in sync.
 */

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
  transformHandleStroke: 'rgba(30, 58, 138, 0.95)',
  transformBoxStroke: 'rgba(30, 58, 138, 0.75)',
  transformAccent: 'rgba(30, 58, 138, 0.85)',
  transformBadgeFill: 'rgba(241, 245, 249, 0.96)',
  transformBadgeText: '#1e3a8a',
  transformGuideStroke: 'rgba(100, 116, 139, 0.95)',
  marqueeStroke: 'rgba(30, 58, 138, 0.75)',
  marqueeFill: 'rgba(30, 58, 138, 0.08)',
} as const;

const TRANSFORM_DARK = {
  transformHandleFill: '#f8fafc',
  transformHandleStroke: 'rgba(147, 197, 253, 0.95)',
  transformBoxStroke: 'rgba(147, 197, 253, 0.88)',
  transformAccent: 'rgba(96, 165, 250, 0.92)',
  transformBadgeFill: 'rgba(15, 23, 42, 0.92)',
  transformBadgeText: '#f8fafc',
  transformGuideStroke: 'rgba(203, 213, 225, 0.9)',
  marqueeStroke: 'rgba(147, 197, 253, 0.9)',
  marqueeFill: 'rgba(59, 130, 246, 0.14)',
} as const;

/** Default structure colors per theme (match --structure-* / --grid-* in theme.css). */
export function structureInkForTheme(theme: UiThemeId | undefined): StructureThemeInk {
  switch (theme) {
    case 'elegant-dark':
      return {
        ink: '#ececec',
        hydrogen: '#a1a1aa',
        gridMinor: 'rgba(255, 255, 255, 0.05)',
        gridMajor: 'rgba(255, 255, 255, 0.09)',
        gridAxis: 'rgba(255, 255, 255, 0.16)',
        selectionHoverFill: 'rgba(59, 130, 246, 0.42)',
        selectionFill: 'rgba(59, 130, 246, 0.55)',
        selectionHoverStroke: 'rgba(96, 165, 250, 0.75)',
        selectionStroke: 'rgba(96, 165, 250, 0.9)',
        selectionBond: 'rgba(96, 165, 250, 0.7)',
        ...TRANSFORM_DARK,
      };
    case 'ink-dark':
      return {
        ink: '#ffffff',
        hydrogen: '#d4d4d8',
        gridMinor: 'rgba(255, 255, 255, 0.06)',
        gridMajor: 'rgba(255, 255, 255, 0.1)',
        gridAxis: 'rgba(255, 255, 255, 0.2)',
        selectionHoverFill: 'rgba(59, 130, 246, 0.45)',
        selectionFill: 'rgba(59, 130, 246, 0.58)',
        selectionHoverStroke: 'rgba(147, 197, 253, 0.8)',
        selectionStroke: 'rgba(147, 197, 253, 0.95)',
        selectionBond: 'rgba(147, 197, 253, 0.75)',
        ...TRANSFORM_DARK,
      };
    case 'light':
    default:
      return {
        ink: '#0f172a',
        hydrogen: '#94a3b8',
        gridMinor: 'rgba(15, 23, 42, 0.035)',
        gridMajor: 'rgba(15, 23, 42, 0.07)',
        gridAxis: 'rgba(15, 23, 42, 0.14)',
        selectionHoverFill: 'rgba(147, 197, 253, 0.38)',
        selectionFill: 'rgba(147, 197, 253, 0.55)',
        selectionHoverStroke: 'rgba(147, 197, 253, 0.45)',
        selectionStroke: 'rgba(147, 197, 253, 0.55)',
        selectionBond: 'rgba(147, 197, 253, 0.55)',
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
