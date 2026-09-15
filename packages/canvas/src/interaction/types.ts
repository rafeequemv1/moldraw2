import type React from 'react';
import type {
  Atom,
  Bond,
  CanvasImage,
  CanvasOrbital,
  CanvasShape,
  CanvasShapeKind,
  CanvasText,
  Molecule,
  ReactionArrow,
  ReactionArrowKind,
  ReactionArrowUpdatePatch,
  Stroke,
} from '@moldraw/domain';
import type { Point } from '../geometry';
import type {
  FragmentPlacementCommit,
  FragmentPlacementSession,
} from '@moldraw/core';
import type {
  DragActionState,
  DrawingBondState,
  DrawingCanvasShapeState,
  DrawingChainState,
  DrawingReactionArrowState,
  DrawingRingState,
  StrokeSample,
} from '../render/types';
import type { HitMetrics, InputProfile } from '../touch/inputProfile';

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
  /** Which kind of pointer is driving this event. */
  inputProfile: InputProfile;
  /** Hit radii / tap thresholds for `inputProfile` at the current zoom. */
  hit: HitMetrics;
  /**
   * High-frequency intermediate positions coalesced into this pointermove
   * (pen / touch), oldest first, already in world coordinates. Freehand
   * tools append these for smoother strokes; other tools ignore them.
   */
  coalescedWorldPositions?: StrokeSample[];

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
  /** When true, selection / arrow moves snap AABB center to the background grid. */
  snapToGrid?: boolean;
  /** World-unit grid spacing (defaults to canvas grid size). */
  gridSizePx?: number;
  selectedAtomIds: string[];
  /** Individually selected bonds (select tool). */
  selectedBondIds?: string[];
  selectedCanvasImageId?: string | null;
  selectedCanvasTextId?: string | null;
  selectedSruBracketId?: string | null;
  /** Viewport zoom for handle hit sizes (optional). */
  viewport?: { zoom: number };

  /** Current in-progress drawing state (frame-scoped values). */
  drawingBond: DrawingBondState | null;
  drawingChain: DrawingChainState | null;
  drawingRing: DrawingRingState | null;
  drawingStroke: StrokeSample[] | null;
  drawingReactionArrow: DrawingReactionArrowState | null;
  drawingCanvasShape: DrawingCanvasShapeState | null;
  dragAction: DragActionState | null;
  hoverBondId: string | null;

  /** Setters for in-progress drawing state. */
  setDrawingBond: SetState<DrawingBondState | null>;
  setDrawingChain: SetState<DrawingChainState | null>;
  setDrawingRing: SetState<DrawingRingState | null>;
  setDrawingStroke: SetState<StrokeSample[] | null>;
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
  /** Selected annotation shape (outline / flask liquid panel). */
  setColorEditCanvasShapeId?: (id: string | null) => void;
  /** Selected pencil stroke (color / delete). */
  setColorEditStrokeId?: (id: string | null) => void;
  selectedReactionArrowIds?: string[];
  selectedStrokeIds?: string[];
  selectedCanvasTextIds?: string[];
  selectedCanvasShapeIds?: string[];
  selectedCanvasImageIds?: string[];
  /** Replace the full marquee selection (atoms + annotation id lists). */
  onSetMarqueeSelection?: (patch: {
    atomIds: string[];
    bondIds: string[];
    reactionArrowIds: string[];
    strokeIds: string[];
    canvasTextIds: string[];
    canvasShapeIds: string[];
    canvasImageIds: string[];
    canvasOrbitalIds?: string[];
  }) => void;
  /** Move atoms + all marquee-selected annotations together. */
  onTranslateMarqueeSelection?: (opts: {
    atomIds: string[];
    arrowIds: string[];
    strokeIds: string[];
    textIds: string[];
    shapeIds: string[];
    imageIds: string[];
    dx: number;
    dy: number;
  }) => void;
  /** Currently selected annotation shape id (same as color-edit shape target). */
  selectedCanvasShapeId?: string | null;
  setSelectedReactionArrowId?: (id: string | null) => void;
  setSelectedCanvasImageId?: (id: string | null) => void;
  setSelectedSruBracketId?: (id: string | null) => void;
  onEditSruBracketSubscript?: (id: string) => void;

  onAddAtom?: (atom: Atom) => void;
  onAddBond?: (bond: Bond) => void;
  onUpdateBond?: (
    bondId: string,
    patch: Partial<Pick<Bond, 'order' | 'stereo' | 'orderCycleRamp' | 'dative' | 'dotted'>>,
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
  /** Set absolute formal charge (±1 circled ⊕/⊖ or clear). */
  onSetAtomCharge?: (atomId: string, charge: number, markStyle?: 'plain' | 'circled') => void;
  /** Set partial charge mark: +1 = δ+, −1 = δ−, 0 clears. */
  onSetAtomDeltaCharge?: (atomId: string, deltaCharge: number) => void;
  onSetAtomChargeOffset?: (atomId: string, offset: { x: number; y: number } | null) => void;
  onSetAtomDeltaChargeOffset?: (atomId: string, offset: { x: number; y: number } | null) => void;
  /** Atom ids whose formal/δ charge marks are selected (Delete clears). */
  selectedChargeAtomIds?: string[];
  setSelectedChargeAtomIds?: (ids: string[]) => void;
  /** Which mark kind is selected on `selectedChargeAtomIds` (for Delete / drag). */
  selectedChargeMarkKind?: 'formal' | 'delta' | null;
  setSelectedChargeMarkKind?: (kind: 'formal' | 'delta' | null) => void;
  onUpdateAtomLonePairs?: (atomId: string, delta: number) => void;
  /** Set (`1`) or clear (`0`) a single free radical on an atom. */
  onSetAtomRadical?: (atomId: string, radical: number) => void;
  onUpdateAtomElement?: (atomId: string, element: string) => void;
  /**
   * Attach an explicit H to a heavy atom. Return `false` when valency has no
   * room (caller may flash the atom).
   */
  onAddExplicitHydrogen?: (atomId: string) => boolean;
  onAddStroke?: (stroke: Stroke) => void;
  /** Finished Smart Draw stroke (world space). Host session buffers these. */
  onSmartDrawStroke?: (points: Point[]) => void;
  onTranslateStroke?: (id: string, dx: number, dy: number) => void;
  onMoveAtoms?: (atomIds: string[], dx: number, dy: number) => void;
  onRotateSelectionCommit?: (
    atomIds: string[],
    cx: number,
    cy: number,
    deltaRad: number,
  ) => void;
  onScaleSelectionCommit?: (
    atomIds: string[],
    anchorX: number,
    anchorY: number,
    factorX: number,
    factorY?: number,
  ) => void;
  /** Commit Structure Perspective orbit (radians about X then Y). */
  onRotate3DPoseCommit?: (dAngleX: number, dAngleY: number) => void;
  /**
   * Live molblock for the right-hand 3D viewer during Structure Perspective orbit.
   * 2D move / rotate / scale must not call this — those are layout-only.
   */
  onPerspectivePosePreview?: (molblock: string) => void;
  onEraseAt?: (
    hit:
      | { type: 'atom'; atomId: string }
      | { type: 'bond'; bondId: string }
      | { type: 'stroke'; strokeId: string }
      | { type: 'reactionArrow'; id: string }
      | { type: 'canvasText'; id: string }
      | { type: 'canvasShape'; id: string }
      | { type: 'canvasImage'; id: string }
      | { type: 'sruBracket'; id: string }
      | { type: 'canvasOrbital'; id: string },
  ) => void;
  onAddReactionArrow?: (arrow: ReactionArrow) => void;
  onAddCanvasShape?: (shape: CanvasShape) => void;
  onAddCanvasOrbital?: (orbital: CanvasOrbital) => void;
  onUpdateCanvasOrbital?: (
    id: string,
    patch: Partial<Omit<CanvasOrbital, 'id' | 'atomId'>> & { atomId?: string | null },
  ) => void;
  selectedCanvasOrbitalIds?: string[];
  setSelectedCanvasOrbitalIds?: (ids: string[]) => void;
  onUpdateCanvasShape?: (id: string, patch: Partial<Omit<CanvasShape, 'id'>>) => void;
  /** Move many shapes by one delta (grouped Objects collection). */
  onTranslateCanvasShapes?: (ids: string[], dx: number, dy: number) => void;
  /** Set formal charge + radical together (•+ / •−). */
  onSetAtomRadicalIon?: (atomId: string, charge: number, radical: number) => void;
  /** Place polymer SRU brackets around the given atoms (≥2). */
  onAddSruBracketAroundAtoms?: (atomIds: string[]) => void;
  onAddCanvasText?: (t: CanvasText) => void;
  onUpdateCanvasText?: (id: string, patch: Partial<CanvasText>) => void;
  /** True while moving/resizing/rotating canvas text — host should hide the HTML text overlay. */
  onCanvasTextTransforming?: (active: boolean) => void;
  onUpdateCanvasImage?: (
    id: string,
    patch: Partial<Omit<CanvasImage, 'id' | 'dataUrl' | 'mimeType'>>,
  ) => void;
  onUpdateReactionArrow?: (id: string, patch: ReactionArrowUpdatePatch) => void;
  onRequestAtomAliasEdit?: (atomId: string) => void;
  /** Open inline editor for reagent above/below on the selected arrow. */
  onRequestArrowReagentEdit?: (arrowId: string, slot: 'above' | 'below') => void;
  /** Currently selected reaction arrow (for reagent slot hit-testing). */
  selectedReactionArrowId?: string | null;

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
