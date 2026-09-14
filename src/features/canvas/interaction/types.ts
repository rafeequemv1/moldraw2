import type React from 'react';
import type {
  Atom,
  Bond,
  CanvasShape,
  CanvasShapeKind,
  CanvasText,
  Molecule,
  ReactionArrow,
  ReactionArrowKind,
  Stroke,
} from '@moldraw/domain';
import type { Point } from '../geometry';
import type {
  FragmentPlacementCommit,
  FragmentPlacementSession,
} from '@moldraw/core/molecule/fragmentPlacement';
import type {
  DragActionState,
  DrawingBondState,
  DrawingCanvasShapeState,
  DrawingChainState,
  DrawingReactionArrowState,
  DrawingRingState,
} from '../render/types';

export type SetState<T> = React.Dispatch<React.SetStateAction<T>>;

/**
 * Frame-scoped snapshot passed to per-tool pointer handlers. Builds in the
 * dispatcher (`useCanvasInput`) once per pointer event so each tool sees a
 * consistent view of state and never re-reads stale closure values.
 *
 * Mutators are split between simple setters (for current-frame state) and
 * upstream callbacks (for committing to the parent app state).
 */
export interface InteractionContext {
  /** Pointer event data (PointerEvent; mouse/touch/pen). */
  e: React.PointerEvent;
  worldPos: Point;
  mouseDownPos: Point;

  /** Active tool + computed tool meta. */
  activeTool: string;
  /** Kind used when placing a new arrow with the reaction-arrow tool. */
  reactionArrowKind: ReactionArrowKind;
  /** Kind used when placing a shape with the shape tool. */
  canvasShapeKind: CanvasShapeKind;
  placementElement: string;
  isRingTool: boolean;
  isBoatTool: boolean;
  isBenzene: boolean;
  numSides: number;

  /** Pencil-tool style. */
  activeColor: string;
  activeThickness: number;
  /** Ring-select tool + ring-fill color target: click rings to paint without re-opening Color. */
  ringPaintActive?: boolean;
  ringFillOpacity?: number;
  onApplyRingFill?: (ringAtomIds: string[], color: string, opacity: number) => void;

  /** Read-only snapshots. */
  molecule: Molecule;
  /** Fixed bond length for drawing tools (matches app bond length setting). */
  bondLengthPx: number;
  /** Direction snap increment (radians), from app bond angle setting. */
  bondAngleSnapRad: number;
  selectedAtomIds: string[];
  /** Individually selected bonds (select tool). */
  selectedBondIds?: string[];

  /** Current in-progress drawing state (frame-scoped values). */
  drawingBond: DrawingBondState | null;
  drawingChain: DrawingChainState | null;
  drawingRing: DrawingRingState | null;
  drawingStroke: Point[] | null;
  drawingReactionArrow: DrawingReactionArrowState | null;
  drawingCanvasShape: DrawingCanvasShapeState | null;
  dragAction: DragActionState | null;
  hoverBondId: string | null;

  /** Setters for in-progress drawing state. */
  setDrawingBond: SetState<DrawingBondState | null>;
  setDrawingChain: SetState<DrawingChainState | null>;
  setDrawingRing: SetState<DrawingRingState | null>;
  setDrawingStroke: SetState<Point[] | null>;
  setDrawingReactionArrow: SetState<DrawingReactionArrowState | null>;
  setDrawingCanvasShape: SetState<DrawingCanvasShapeState | null>;
  setDragAction: SetState<DragActionState | null>;
  setMouseDownPos: SetState<Point>;

  /** Hover/error state setters. */
  setHoverAtomId: SetState<string | null>;
  setHoverBondId: SetState<string | null>;
  setHoveredAtomCircleId: SetState<string | null>;
  setHoveredBondHighlightId: SetState<string | null>;
  setHoveredComponentIds: SetState<string[]>;
  setMouseWorldPos: SetState<Point | null>;

  /** Briefly flash an atom red to indicate an error (e.g. valency violation). */
  flashAtomError: (atomId: string) => void;

  /** Optional selection / commit callbacks (props from `InfiniteCanvas`). */
  setSelectedAtomIds?: (ids: string[]) => void;
  setSelectedBondIds?: (ids: string[]) => void;
  setSelectedCanvasTextId?: (id: string | null) => void;
  setSelectedReactionArrowId?: (id: string | null) => void;

  onAddAtom?: (atom: Atom) => void;
  onAddBond?: (bond: Bond) => void;
  onUpdateBond?: (
    bondId: string,
    patch: Partial<Pick<Bond, 'order' | 'stereo' | 'orderCycleRamp'>>,
  ) => void;
  /**
   * Swap a bond's endpoints. Used by the wedge / dash tool's re-tap branch
   * to flip the depicted narrow→wide direction without changing chemistry.
   */
  onFlipBond?: (bondId: string) => void;
  onAddRing?: (
    center: Point,
    numSides: number,
    isBenzene: boolean,
    angleOffset: number,
    rootAtomId?: string,
    attachedViaBond?: boolean,
    fusedBondId?: string,
    angleStep?: number,
    radius?: number,
  ) => void;
  onAddBoatRing?: (center: Point, rootAtomId?: string, attachedViaBond?: boolean) => void;
  onAddChairRing?: (center: Point, rootAtomId?: string, attachedViaBond?: boolean) => void;
  onAddChain?: (points: Point[], startAtomId?: string) => void;
  onUpdateAtomCharge?: (atomId: string, delta: number) => void;
  onUpdateAtomLonePairs?: (atomId: string, delta: number) => void;
  onUpdateAtomElement?: (atomId: string, element: string) => void;
  onAddStroke?: (stroke: Stroke) => void;
  onMoveAtoms?: (atomIds: string[], dx: number, dy: number) => void;
  onRotateSelectionCommit?: (
    atomIds: string[],
    cx: number,
    cy: number,
    deltaRad: number,
  ) => void;
  onEraseAt?: (
    hit:
      | { type: 'atom'; atomId: string }
      | { type: 'bond'; bondId: string }
      | { type: 'stroke'; strokeId: string }
      | { type: 'reactionArrow'; id: string }
      | { type: 'canvasText'; id: string }
      | { type: 'canvasShape'; id: string }
      | { type: 'canvasImage'; id: string },
  ) => void;
  onAddReactionArrow?: (arrow: ReactionArrow) => void;
  onAddCanvasShape?: (shape: CanvasShape) => void;
  onAddCanvasText?: (t: CanvasText) => void;
  onUpdateCanvasText?: (id: string, patch: Partial<CanvasText>) => void;
  onUpdateReactionArrow?: (id: string, patch: Partial<Omit<ReactionArrow, 'id'>>) => void;
  onRequestAtomAliasEdit?: (atomId: string) => void;

  /** Lazy accessor for the canvas 2D context (needed for text picking). */
  getCanvasContext: () => CanvasRenderingContext2D | null;

  /** SMILES fragment waiting for click/drag placement on canvas. */
  fragmentPlacement?: FragmentPlacementSession | null;
  placementDragging?: boolean;
  setPlacementDragging?: SetState<boolean>;
  /** Atom under pointer at placement pointer-down; keeps snap while dragging. */
  placementAnchorAtomId?: string | null;
  setPlacementAnchorAtomId?: SetState<string | null>;
  onCommitFragmentPlacement?: (commit: FragmentPlacementCommit) => void;
}
