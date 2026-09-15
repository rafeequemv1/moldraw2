import type { ImageResolutionPreset } from '@moldraw/core/canvasPreferences';
import type { UiLanguage } from '../i18n';
import type { ShortcutBindingsMap } from '../keyboard/shortcutBindings';
import type { UiThemeId } from '../theme';

export type { ImageResolutionPreset };
export type { UiThemeId };

/** Persisted user preferences (JSON-serializable). */
export interface AppSettings {
  general: GeneralSettings;
  bonds: BondsSettings;
  /** Keyboard shortcut overrides (unset keys use built-in defaults). */
  shortcuts?: {
    bindings?: ShortcutBindingsMap;
  };
  /** Last Style presets card applied — restored when the modal reopens. */
  lastPresetId?: string;
}

/** Persisted checkboxes in the top-bar color menu (which layers receive a new color). */
export interface ColorTargetPrefs {
  atomLabels: boolean;
  bonds: boolean;
  ringFill: boolean;
  text: boolean;
  arrowLine: boolean;
  arrowReagent: boolean;
  strokes: boolean;
  canvasShapes: boolean;
  ringFillOpacity: number;
}

export interface GeneralSettings {
  /** 2D structure theme id (`skeletal` built-in; plugin ids such as `simple`). */
  structureThemeId: string;
  /** Resolved 2D draw mode for the selected theme — stored so canvas can switch instantly. */
  structureDrawMode: 'skeletal' | 'ball-stick';
  /**
   * App chrome + canvas surface theme.
   * Tokens live in `src/styles/theme.css`; structure ink in `src/app/theme.ts`.
   */
  theme: UiThemeId;
  /** Interface language (English or German). */
  uiLanguage?: UiLanguage;
  showImplicitHydrogens: boolean;
  /**
   * When true, 2D atom labels use element palette colors (N blue, O red, …).
   * Default false — all 2D labels are black unless the atom has an explicit color.
   * Does not affect the 3D viewer (3D keeps element/CPK coloring).
   */
  colorAtomLabels: boolean;
  /**
   * When true, 2D bond strokes follow endpoint label colors (N blue, O red, …).
   * Default false — 2D bonds stay black unless a bond has an explicit color.
   * Does not affect the 3D viewer (3D bonds keep element/CPK coloring).
   */
  applyAtomColorsToBonds: boolean;
  colorTargets: ColorTargetPrefs;
  /** Teaching: condensed terminal labels (CH₃, NH₂, OH) instead of only skeletal vertices. */
  condensedGroupLabels: boolean;
  /** After several bonds in a row, auto-run layout cleanup on that fragment (same as manual Cleanup). */
  autoLayoutAfterBondBurst: boolean;
  /**
   * When true (default), Cleanup / SMILES→2D prefer Indigo WASM when ready.
   * When false, force the native `@moldraw/engine` 2D layout path (reversible test toggle).
   * Indigo-only tools (CIP, aromatize, convert, check, automap) are unchanged.
   */
  preferIndigo2d: boolean;
  /**
   * Snap dragged molecules / reaction arrows to the background grid
   * (centers align to 50 px world cells — teaching mechanism layouts).
   */
  snapToGrid: boolean;
  /** Show the canvas background grid. Default true. */
  showGrid: boolean;
  /**
   * Touch screens: one finger on empty canvas with the Select tool pans the
   * view instead of drawing a selection box. Default false (two-finger pan).
   */
  touchPanOnEmptyCanvas: boolean;
  /** Touch: 2× loupe above the fingertip while drawing / hovering a target. Default true. */
  touchLoupe: boolean;
  /** Developer: on-canvas HUD with pointer type / pressure / tilt / gesture state. Default false. */
  pointerDebugHud: boolean;
  /**
   * AI bridge: mirror this canvas into a local Moldraw session (`npm run api`)
   * so MCP agents (`MOLDRAW_SESSION_URL`) edit what the user sees. Default false.
   */
  localSessionEnabled: boolean;
  /** Base URL of the local session (loopback only). */
  localSessionUrl: string;
  /**
   * When true, draw Indigo CIP stereo descriptors (R/S on atoms, E/Z on bonds).
   * Default false — off until enabled in Settings or the toolbar.
   */
  showCipLabels: boolean;
  fontFamily: string;
  /** Bold atom / group labels on the 2D canvas. Default false. */
  boldAtomLabels: boolean;
  /**
   * When true (default), style panel edits update canvas defaults and all open designs.
   * When false, edits apply to the active design tab only.
   */
  styleApplyGlobally?: boolean;
  /** Atom / group label size in CSS pixels at zoom 1 (20 = 20px Times New Roman). */
  fontSizePt: number;
  /** Subscript size in CSS pixels (NH₂, CH₃, …). */
  subFontSizePt: number;
  reactionComponentMarginPt: number;
  imageResolution: ImageResolutionPreset;
}

export interface BondsSettings {
  bondLengthPx: number;
  /** Perpendicular gap between double/triple lines as % of bond length (e.g. 15 = 15%). */
  bondSpacingPercent: number;
  bondThicknessPx: number;
  stereoWedgeWidthPx: number;
  hashSpacingPx: number;
  /** Bond / ring / chain direction snap (e.g. 30 = ACS; 15 = RSC / Chem Soc). */
  bondAngleSnapDeg: number;
}
