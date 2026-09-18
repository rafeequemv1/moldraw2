/**
 * Shared `RenderContext` passed to every draw submodule. Bundling everything
 * into one snapshot lets `InfiniteCanvas` build it once per frame and pass it
 * to a handful of focused `drawXxx(ctx, R)` functions instead of threading 30+
 * positional args through the call site.
 */
import type { ArrowSnapKind, FragmentPlacementSession, ResolvedCanvasPreferences } from '@moldraw/core';
import type {
  ArrowAnchor,
  ArrowHeadStyle,
  ArrowTailStyle,
  CanvasOrbital,
  CanvasShape,
  CanvasShapeKind,
  CanvasText,
  CanvasImage,
  Molecule,
  ReactionArrow,
  ReactionArrowKind,
} from '@moldraw/domain';
import type { Atom, Bond } from '@moldraw/domain';
import type { CanvasTextResizeHandle, Point, Viewport } from '../geometry';
import { DEFAULT_ATOM_INK, EXPLICIT_HYDROGEN_COLOR } from '@moldraw/domain';

/**
 * Freehand stroke sample: world position plus optional stylus pressure
 * (0..1). Pressure is only recorded for pen input; mouse / touch leave it
 * undefined and the stroke renders at constant width.
 */
export type StrokeSample = Point & { pressure?: number };

/** Structure ink + grid colors for the current UI theme (host-supplied). */
export type StructureThemeColors = {
  ink: string;
  hydrogen: string;
  gridMinor: string;
  gridMajor: string;
  gridAxis: string;
  selectionHoverFill?: string;
  selectionFill?: string;
  selectionHoverStroke?: string;
  selectionStroke?: string;
  selectionBond?: string;
  /** Transform / marquee chrome (selection tool). */
  transformHandleFill?: string;
  transformHandleStroke?: string;
  transformBoxStroke?: string;
  transformAccent?: string;
  transformBadgeFill?: string;
  transformBadgeText?: string;
  transformGuideStroke?: string;
  marqueeStroke?: string;
  marqueeFill?: string;
};

/** Light-theme defaults (matches `src/styles/theme.css` / ChemDraw-like ink). */
export const DEFAULT_STRUCTURE_THEME: StructureThemeColors = {
  ink: DEFAULT_ATOM_INK,
  hydrogen: EXPLICIT_HYDROGEN_COLOR,
  gridMinor: 'rgba(15, 23, 42, 0.1)',
  gridMajor: 'rgba(15, 23, 42, 0.18)',
  gridAxis: 'rgba(15, 23, 42, 0.28)',
  selectionHoverFill: 'rgba(45, 212, 191, 0.28)',
  selectionFill: 'rgba(45, 212, 191, 0.36)',
  selectionHoverStroke: 'rgba(45, 212, 191, 0.85)',
  selectionStroke: 'rgba(20, 184, 166, 0.7)',
  selectionBond: 'rgba(45, 212, 191, 0.4)',
  transformHandleFill: '#ffffff',
  transformHandleStroke: '#0f172a',
  transformBoxStroke: 'rgba(148, 163, 184, 0.72)',
  transformAccent: '#2dd4bf',
  transformBadgeFill: 'rgba(240, 253, 250, 0.97)',
  transformBadgeText: '#0f172a',
  transformGuideStroke: 'rgba(45, 212, 191, 0.55)',
  marqueeStroke: 'rgba(148, 163, 184, 0.75)',
  marqueeFill: 'rgba(148, 163, 184, 0.06)',
};

export type DragActionState =
  | { type: 'move_selection'; startX: number; startY: number; currentX: number; currentY: number }
  | { type: 'box_select'; startX: number; startY: number; currentX: number; currentY: number }
  | { type: 'lasso_select'; points: Point[]; currentX: number; currentY: number }
  | {
      type: 'move_canvas_text';
      textId: string;
      startX: number;
      startY: number;
      currentX: number;
      currentY: number;
      origX: number;
      origY: number;
    }
  | {
      /** Drag formal / δ charge mark around its parent atom. */
      type: 'move_charge_mark';
      atomId: string;
      kind: 'formal' | 'delta';
      startX: number;
      startY: number;
      currentX: number;
      currentY: number;
      origOffsetX: number;
      origOffsetY: number;
      /**
       * Place-on-drag (charge/δ tools): default seat center. While dragging past
       * the threshold, offset = pointer − seat so the mark follows the cursor.
       */
      seatAnchorX?: number;
      seatAnchorY?: number;
      placeDragThreshold?: number;
    }
  | {
      type: 'resize_canvas_text';
      textId: string;
      startX: number;
      startY: number;
      currentX: number;
      currentY: number;
      origText: CanvasText;
      corner: CanvasTextResizeHandle;
      /** Content-fit floor so the box never shrinks below its text. */
      minW?: number;
      minH?: number;
    }
  | {
      type: 'rotate_canvas_text';
      textId: string;
      startX: number;
      startY: number;
      currentX: number;
      currentY: number;
      origText: CanvasText;
      cx: number;
      cy: number;
      startPointerAngle: number;
      currentPointerAngle: number;
    }
  | {
      type: 'move_canvas_image';
      imageId: string;
      startX: number;
      startY: number;
      currentX: number;
      currentY: number;
      origX: number;
      origY: number;
    }
  | {
      type: 'resize_canvas_image';
      imageId: string;
      startX: number;
      startY: number;
      currentX: number;
      currentY: number;
      origImage: CanvasImage;
      lockAspect?: boolean;
    }
  | {
      type: 'rotate_canvas_image';
      imageId: string;
      startX: number;
      startY: number;
      currentX: number;
      currentY: number;
      origImage: CanvasImage;
      cx: number;
      cy: number;
      startPointerAngle: number;
      currentPointerAngle: number;
    }
  | {
      type: 'move_canvas_shape';
      shapeId: string;
      /** All shapes moved together (COF group); defaults to `[shapeId]`. */
      shapeIds?: string[];
      startX: number;
      startY: number;
      currentX: number;
      currentY: number;
      origX1: number;
      origY1: number;
      origX2: number;
      origY2: number;
      /** Original boxes for every shape in the group move. */
      origById?: Record<string, { x1: number; y1: number; x2: number; y2: number }>;
    }
  | {
      type: 'move_canvas_stroke';
      strokeId: string;
      startX: number;
      startY: number;
      currentX: number;
      currentY: number;
      origPoints: Point[];
    }
  | {
      type: 'resize_canvas_shape';
      shapeId: string;
      startX: number;
      startY: number;
      currentX: number;
      currentY: number;
      origShape: CanvasShape;
      lockAspect?: boolean;
    }
  | {
      type: 'rotate_canvas_shape';
      shapeId: string;
      startX: number;
      startY: number;
      currentX: number;
      currentY: number;
      origShape: CanvasShape;
      cx: number;
      cy: number;
      startPointerAngle: number;
      currentPointerAngle: number;
    }
  | {
      type: 'move_canvas_orbital';
      orbitalId: string;
      startX: number;
      startY: number;
      currentX: number;
      currentY: number;
      origX: number;
      origY: number;
    }
  | {
      type: 'rotate_canvas_orbital';
      orbitalId: string;
      startX: number;
      startY: number;
      currentX: number;
      currentY: number;
      origOrbital: CanvasOrbital;
      cx: number;
      cy: number;
      startPointerAngle: number;
      currentPointerAngle: number;
    }
  | {
      type: 'move_reaction_arrow';
      arrowId: string;
      startX: number;
      startY: number;
      currentX: number;
      currentY: number;
      /** Snapshot at pointer-down (all coordinates preserved for preview/commit). */
      origArrow: ReactionArrow;
    }
  | {
      type: 'resize_reaction_arrow';
      arrowId: string;
      endpoint: 'tail' | 'head' | 'curve' | 'c1' | 'c2' | 'vertex';
      /** When endpoint is `vertex`, index into pathPoints. */
      vertexIndex?: number;
      startX: number;
      startY: number;
      currentX: number;
      currentY: number;
      origArrow: ReactionArrow;
    }
  | {
      type: 'rotate_selection';
      cx: number;
      cy: number;
      snap: Record<string, { x: number; y: number }>;
      startPointerAngle: number;
      currentPointerAngle: number;
    }
  | {
      type: 'scale_selection';
      handle: 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';
      anchorX: number;
      anchorY: number;
      snap: Record<string, { x: number; y: number }>;
      startPointerX: number;
      startPointerY: number;
      currentFactorX: number;
      currentFactorY: number;
    }
  | {
      /**
       * Two-finger touch transform of the selection: rotate by `deltaRad` and
       * scale by `factor` about (cx, cy), then translate by (dx, dy) — all in
       * world units, accumulated over the gesture.
       */
      type: 'transform_selection';
      cx: number;
      cy: number;
      snap: Record<string, { x: number; y: number }>;
      dx: number;
      dy: number;
      deltaRad: number;
      factor: number;
      /** Raw accumulated twist / pinch before the start thresholds are crossed. */
      rawRad: number;
      rawFactor: number;
    }
  | {
      /** ChemDraw Structure Perspective: orbit the 3D pose (session preview). */
      type: 'rotate_perspective';
      startX: number;
      startY: number;
      currentX: number;
      currentY: number;
    };

export interface DrawingBondState {
  startAtomId?: string;
  startPos: Point;
  currentPos: Point;
}

export interface DrawingChainState {
  startAtomId?: string;
  /** When attached to an existing atom, anchor first segment outward from that atom. */
  preferredFirstBondAngle?: number;
  startPos: Point;
  currentPos: Point;
}

export interface DrawingRingState {
  startAtomId?: string;
  currentPos: Point;
}

export interface DrawingReactionArrowState {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: ReactionArrowKind;
  headStyle?: ArrowHeadStyle;
  tailStyle?: ArrowTailStyle;
  headScale?: number;
  fromAnchor?: ArrowAnchor;
  toAnchor?: ArrowAnchor;
  fromSnapKind?: ArrowSnapKind;
  toSnapKind?: ArrowSnapKind;
}

export interface DrawingCanvasShapeState {
  kind: CanvasShapeKind;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Frame-scoped snapshot of everything render submodules need. Built once per
 * frame inside `InfiniteCanvas#render`. Treat as immutable.
 */
export interface RenderContext {
  /** The original molecule from props. */
  molecule: Molecule;
  /** Same molecule with in-progress drag/rotate applied to selected atoms. */
  renderedMolecule: Molecule;
  /** Per-atom opacity for Structure Perspective depth shading (1 = near). */
  /** Per-atom opacity for Structure Perspective depth fade; omit → fully opaque. */
  atomOpacityById?: Map<string, number>;
  /** Sum of bond orders incident on each atom, computed from `renderedMolecule`. */
  valencyMap: Map<string, number>;
  /** O(1) atom lookup for `renderedMolecule` (rebuild when positions change). */
  atomById: Map<string, Atom>;
  /** O(1) bond lookup. */
  bondById: Map<string, Bond>;
  /** Bond id → smallest-ring centroid (memoized per revision). */
  ringCenterByBondId: Map<string, Point>;
  /** Bond id → smallest-cycle atom ids (in-plane double bonds under perspective). */
  ringAtomIdsByBondId: Map<string, string[]>;
  /**
   * When set, skip atoms/bonds outside the viewport. `null` / allVisible → draw all.
   */
  visibleAtomIds: Set<string> | null;
  visibleBondIds: Set<string> | null;
  /** Below LOD threshold: skip labels / lone pairs. */
  lodSkipLabels: boolean;

  /** Viewport (pan/zoom) at the time this frame started. */
  viewport: Viewport;
  /** Display scale factor (e.g. shrunk panes). */
  displayScale: number;

  /** Typography + bond metrics from app settings (resolved once per frame). */
  displayPrefs: ResolvedCanvasPreferences;

  /** Active drawing/selection tool. */
  activeTool: string;
  /** Current reaction-arrow kind from the toolbar (for implicit lone-pair loci). */
  reactionArrowKind?: import('@moldraw/domain').ReactionArrowKind;
  /** Whether the active tool is one of the ring tools. */
  isRingTool: boolean;
  /** Number of sides for the active ring tool (or 6 by default). */
  numSides: number;
  /** Aromatic visualization (benzene / cyclopentadiene). */
  isBenzene: boolean;
  /** Whether the active tool is the boat-cyclohexane tool. */
  isBoatTool: boolean;
  /** Whether the active tool is the chair cyclohexane tool. */
  isChairTool: boolean;

  /** Selection sets. */
  selectedAtomIds: string[];
  /** Formal-charge marks selected for Delete → clear charge. */
  selectedChargeAtomIds?: string[];
  /** Individually selected bonds (select tool). */
  selectedBondIds: string[];
  selectedCanvasTextId: string | null;
  selectedCanvasTextIds?: string[];
  selectedReactionArrowId: string | null;
  selectedReactionArrowIds?: string[];
  selectedCanvasImageId: string | null;
  selectedCanvasImageIds?: string[];
  selectedStrokeId: string | null;
  selectedStrokeIds?: string[];
  selectedCanvasShapeId: string | null;
  selectedCanvasShapeIds?: string[];
  selectedCanvasOrbitalIds?: string[];
  selectedSruBracketId: string | null;

  /** Hover state. */
  hoveredComponentIds: string[];
  hoveredAtomCircleId: string | null;
  hoveredBondHighlightId: string | null;
  hoverAtomId: string | null;
  hoverBondId: string | null;
  /** Ring-select tool: atoms of the ring under the cursor (preview highlight). */
  hoverRingAtomIds: string[] | null;
  /** Last-known mouse world position (used for ring-tool ghost). */
  mouseWorldPos: Point | null;
  /** Active fingertip position (touch only) for the touch halo. */
  touchPointerWorldPos?: Point | null;

  /** Atom flagged with the brief red error indicator. */
  errorAtomId: string | null;
  /** Atoms with stereochemistry warnings (ambiguous center or wedge/hash conflict). */
  stereoWarningAtomIds: ReadonlySet<string>;
  /**
   * Octet / valence warnings: atom id → bond-order surplus over max valency.
   * Soft marker only — drawing never blocks on valency.
   */
  overValentAtoms?: ReadonlyMap<string, number>;

  /** Indigo CIP R/S labels keyed by atom id (when showCipLabels). */
  cipAtomLabels: ReadonlyMap<string, string> | null;
  /** Indigo CIP E/Z labels keyed by bond id. */
  cipBondLabels: ReadonlyMap<string, string> | null;
  /** Draw CIP descriptors on the canvas. */
  showCipLabels: boolean;

  /** Toggles. */
  showHydrogens: boolean;
  /** Teaching: show CH₃ / NH₂ / OH style condensed labels on terminal groups (see `condensedGroupLabelForAtom`). */
  condensedGroupLabels: boolean;
  /** Heteroatom labels use element palette colors when true; otherwise black (unless custom atom.color). */
  colorAtomLabels: boolean;
  /** Bond strokes inherit endpoint label colors when the bond has no explicit color. */
  applyAtomColorsToBonds: boolean;
  /**
   * Theme structure ink (bonds / default labels) + grid strokes.
   * CSS cannot paint the canvas 2D API — host passes colors from the UI theme.
   */
  structureTheme: StructureThemeColors;
  /** 2D structure look: skeletal (default) or ball-and-stick. */
  structureDrawMode?: 'skeletal' | 'ball-stick';
  /** Atoms whose label is being edited inline; skip drawing the body. */
  omitAtomAliasBodyId: string | null;
  /** Canvas text whose body is being edited inline; skip drawing the body. */
  omitCanvasTextBodyId: string | null;

  /** Pencil tool style. */
  activeColor: string;
  activeThickness: number;

  /**
   * Element symbol used when the next click would create a new atom (bond
   * empty-canvas, atom-label drop, hover-affordance preview). Mirrors
   * `App.activePlacementElement`.
   */
  placementElement: string;

  /** In-progress drawing previews. */
  drawingBond: DrawingBondState | null;
  drawingChain: DrawingChainState | null;
  drawingRing: DrawingRingState | null;
  drawingStroke: StrokeSample[] | null;
  /** Buffered Smart Draw strokes waiting for the host session to end. */
  smartDrawSessionStrokes: { points: Point[] }[];
  drawingReactionArrow: DrawingReactionArrowState | null;
  drawingCanvasShape: DrawingCanvasShapeState | null;

  /** Current drag action (selection move, box select, lasso, rotate, etc.). */
  dragAction: DragActionState | null;
  /** Live rotation delta (radians) during a `rotate_selection` drag. */
  rotatePreviewDelta: number;
  /**
   * Cumulative rotation applied to the current selection. Used so atom labels
   * and lone-pair dots stay upright relative to the canvas while bonds rotate.
   */
  labelCounterRad: number;

  /** Whether the parent supplied `onRotateSelectionCommit` (used to gate the rotate handle). */
  hasRotateCommit: boolean;
  /** Whether the parent supplied `onScaleSelectionCommit` (used to gate the scale handle). */
  hasScaleCommit: boolean;

  /** Wraps a draw callback in a counter-rotate so labels stay upright. */
  applyLabelUpright: (atomId: string, draw: () => void) => void;

  /** Offscreen canvas reused across frames for selection-highlight compositing. */
  offscreenCanvas: HTMLCanvasElement | null;

  /** Preview for click/drag fragment placement (functional groups, templates). */
  fragmentPlacement: FragmentPlacementSession | null;
}
