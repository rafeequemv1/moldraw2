export interface Point {
  x: number;
  y: number;
}

export interface Atom {
  id: string;
  element: string; // 'C', 'N', 'O', etc.
  x: number;
  y: number;
  charge: number;
  /** Explicit lone pair count (visual + validation). */
  lonePairs?: number;
  /** Custom stroke / label color (hex), e.g. #2563eb */
  color?: string;
  /** Optional mass number for isotope labels / molfile M ISO, e.g. 13 for 13C. */
  isotope?: number;
  /** User-typed functional group label (ASCII), e.g. CH3 — display-only v1; molfile still uses `element`. */
  alias?: string;
  /**
   * V2000 atom stereo parity / care (molfile field after charge): 0 none, 1 odd, 2 even, 3 either.
   * Set when parsing molfiles; used to keep stereochem-relevant H during import. Not written by `moleculeToMolblock`.
   */
  mdlStereoCare?: number;
  /**
   * Tetrahedral chirality for the 3D engine, independent of 2D depiction. Sign
   * (+1/-1) of the scalar triple product of the first three neighbors (atom ids
   * sorted ascending) relative to this center. Populated from SMILES `@`/`@@`.
   */
  chiralParity?: number;
  /**
   * Atom-atom mapping number for reactions (reactant ↔ product). From molfile
   * V2000 mapping column / Indigo automap. 0 or undefined = unmapped.
   */
  atomMap?: number;
}

export interface Bond {
  id: string;
  fromAtomId: string;
  toAtomId: string;
  order: number; // 1 (single), 2 (double), 3 (triple)
  /** From molfile bond type 4; exported back as aromatic. Not used for user-drawn kekulé rings. */
  aromatic?: boolean;
  stereo?: 'wedge' | 'dash' | 'wavy';
  /**
   * UI-only: when cycling bond order by clicking (1↔2↔3), remembers whether the
   * bond reached double from below (`up`) or from triple (`down`) so the next
   * click steps 2→3 vs 2→1 (ChemDraw-style bounce: …→triple→double→single→…).
   * Not written to molfiles.
   */
  orderCycleRamp?: 'up' | 'down';
  /** Custom stroke color (hex). Independent of endpoint atom label colors. */
  color?: string;
  /**
   * Double-bond (E/Z) geometry for the 3D engine, independent of 2D depiction.
   * `ref1` is a neighbor id on `fromAtomId`, `ref2` a neighbor id on `toAtomId`;
   * `sameSide` true = cis (Z-like), false = trans (E-like). From SMILES `/`,`\`.
   */
  cisTransRef?: { ref1: string; ref2: string; sameSide: boolean };
}

export interface Stroke {
  id: string;
  points: Point[];
  color: string;
  thickness: number;
}

/** Annotative shapes (rectangle, line, …) drawn on the canvas; not part of molfile chemistry. */
export type CanvasShapeKind = 'rectangle' | 'line' | 'circle' | 'triangle' | 'star';

export const CANVAS_SHAPE_KIND_ORDER: readonly CanvasShapeKind[] = [
  'rectangle',
  'line',
  'circle',
  'triangle',
  'star',
] as const;

export interface CanvasShape {
  id: string;
  kind: CanvasShapeKind;
  /** For `line`: segment endpoints. For other kinds: axis-aligned bounding box (min/max corners). */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  strokeWidth: number;
}

/** Raster image annotation pasted or inserted onto the drawing canvas. */
export interface CanvasImage {
  id: string;
  dataUrl: string;
  mimeType: string;
  x: number;
  y: number;
  width: number;
  height: number;
  name?: string;
}

/** Visual / semantic style for on-canvas arrows (ChemDraw-like palette). */
export type ReactionArrowKind =
  | 'straight'
  | 'curved'
  | 's_curve'
  | 'retrosynthetic'
  | 'equilibrium'
  | 'half_equilibrium'
  /** Curved electron-flow arrow with fish-hook tail (mechanisms / teaching). */
  | 'electron_flow'
  | 'resonance';

/** Toolbar / cycle order (must include every `ReactionArrowKind`). */
export const REACTION_ARROW_KIND_ORDER: readonly ReactionArrowKind[] = [
  'straight',
  'curved',
  's_curve',
  'retrosynthetic',
  'equilibrium',
  'half_equilibrium',
  'electron_flow',
  'resonance',
] as const;

/**
 * Reaction arrow on canvas. Tail is (x1,y1), head is (x2,y2).
 * Curved / S-curve / resonance use optional control points; when omitted,
 * controls are derived from the chord for drawing and hit-testing.
 * For full-molecule SMILES `react>>prod`, see `reactionArrowParticipatesInSmilesSplit`
 * in `reactionArrowSmiles.ts` — decorative kinds are skipped when picking the
 * partition arrow.
 */
export interface ReactionArrow {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind?: ReactionArrowKind;
  /** Quadratic control (curved, resonance, electron_flow). */
  cx?: number;
  cy?: number;
  /** Cubic controls (s_curve). */
  c1x?: number;
  c1y?: number;
  c2x?: number;
  c2y?: number;
  /** Resonance: optional second barb at tail when true. */
  doubleHead?: boolean;
  color?: string;
  strokeWidth?: number;
  /** Scales arrowhead relative to default (1 = default). */
  headScale?: number;
  /** Reagents / conditions drawn above the arrow shaft (multi-line: newline). */
  reagentAbove?: string;
  /** Reagents / conditions drawn below the arrow shaft (multi-line: newline). */
  reagentBelow?: string;
  /** Canvas px for reagent lines (default applied in renderer if omitted). */
  reagentFontSize?: number;
  /** Fill color for reagent text (hex). */
  reagentColor?: string;
  reagentFontWeight?: 'normal' | 'bold';
  /**
   * plain — raw text;
   * auto — unicode subscripts when input looks like chemistry (`H2SO4`, `\ce{...}`);
   * latex — canvas uses simplified unicode; rich preview via KaTeX in the editor when needed.
   */
  reagentFormat?: 'plain' | 'auto' | 'latex';
  /**
   * When set with `multiStepGroupId`, this arrow is part of a sequential synthesis / multi-step route.
   * `stepIndex` is 0-based order within the group (left-to-right in typical layouts).
   */
  multiStepGroupId?: string;
  stepIndex?: number;
}

/** Optional title for a multi-step reaction group (`ReactionArrow.multiStepGroupId`). */
export interface ReactionMultiStepGroupMeta {
  title?: string;
}

/** Free-floating label on the canvas (not part of SMILES / molfile). */
export interface CanvasText {
  id: string;
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color: string;
  fontFamily?: string;
  /** World-space box size; defaults to measured text bounds when omitted. */
  boxWidth?: number;
  boxHeight?: number;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  textDecoration?: 'none' | 'underline';
}

export interface Molecule {
  atoms: Atom[];
  bonds: Bond[];
  /** Drag-drawn annotation shapes (rectangle, circle, …). */
  canvasShapes?: CanvasShape[];
  strokes?: Stroke[];
  /** Reaction arrows on canvas; first arrow can split full-molecule SMILES as `reactants>>products`. */
  reactionArrows?: ReactionArrow[];
  /** Free text annotations on the canvas. */
  canvasTexts?: CanvasText[];
  /** Raster image annotations. */
  canvasImages?: CanvasImage[];
  /** Per-cycle interior tint (canvas). Key = `ringSignature(atomIds)` from `domain/rings`. */
  ringFills?: Record<string, { color: string; opacity?: number }>;
  /** @deprecated Migrated into `ringFills` by `normalizeMoleculeRingFills`. */
  ringFill?: { enabled: boolean; color: string; opacity?: number };
  /** Titles for multi-step reaction groups keyed by `ReactionArrow.multiStepGroupId`. */
  reactionMultiStepGroups?: Record<string, ReactionMultiStepGroupMeta>;
}
