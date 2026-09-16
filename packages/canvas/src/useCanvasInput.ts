import { useCallback, useRef, useState } from 'react';
import type React from 'react';
import type {
  ArrowHeadStyle,
  ArrowTailStyle,
  CanvasShapeKind,
  Molecule,
  ReactionArrowKind,
} from '@moldraw/domain';
import type {
  FragmentPlacementCommit,
  FragmentPlacementSession,
} from '@moldraw/core';
import type { Point } from './geometry';
import { expandAtomIdsToConnectedFragments, findSmallestRingAtPoint } from './geometry';
import type {
  DragActionState,
  DrawingBondState,
  DrawingCanvasShapeState,
  DrawingChainState,
  DrawingReactionArrowState,
  DrawingRingState,
  StrokeSample,
} from './render/types';
import {
  atomLabelToolMouseDown,
  bondToolMouseDown,
  bondToolMouseMove,
  bondToolMouseUp,
  bondToolUpdateHover,
  chainToolMouseDown,
  chainToolMouseMove,
  chainToolMouseUp,
  chargeToolMouseDown,
  isStampSymbolTool,
  stampSymbolToolMouseDown,
  commitDragAction,
  eraseToolMouseDown,
  isOrbitalTool,
  orbitalToolMouseDown,
  isBondTool,
  isRingTool,
  isSmartDrawTool,
  pencilToolMouseDown,
  pencilToolMouseMove,
  pencilToolMouseUp,
  displayGroupLabelForAtom,
  pickAtomAt,
  pickBondAt,
  reactionArrowToolMouseDown,
  reactionArrowToolMouseMove,
  reactionArrowToolMouseUp,
  ringSidesForTool,
  ringToolMouseDown,
  ringToolMouseMove,
  ringToolMouseUp,
  ringToolUpdateHover,
  selectToolMouseDown,
  selectToolHasTargetAt,
  trySelectAnnotationAt,
  resetRingPickCycle,
  placeFragmentToolMouseDown,
  placeFragmentToolMouseMove,
  placeFragmentToolMouseUp,
  isPlaceFragmentTool,
  perspectiveToolMouseDown,
  shapeToolMouseDown,
  shapeToolMouseMove,
  shapeToolMouseUp,
  sruBracketToolMouseDown,
  sruBracketToolMouseUp,
  textToolMouseDown,
  updateActiveDragAction,
  updateCanvasHover,
} from './interaction';
import type { InteractionContext } from './interaction';
import {
  beginTouchSelectionTransform,
  commitTouchSelectionTransform,
  updateTouchSelectionTransform,
  type TouchSelectionTransformCallbacks,
  type TransformSelectionDrag,
} from './interaction/touchSelectionTransform';
import {
  captureCanvasPointer,
  createPenPriorityTracker,
  hitMetricsFor,
  inputProfileOf,
  isDrawingPointer,
  isLikelyPalm,
  isMiddleButton,
  isPenEraser,
  isSecondaryButton,
  isTouchPointer,
  releaseCanvasPointer,
  useMultiTouchGestures,
  usePointerCoalesce,
  useTouchLongPress,
  type CanvasPointerEvent,
  type PointerDebugInfo,
} from './touch';

/** Tools whose long-press opens the context menu on touch (never drawing tools). */
const LONG_PRESS_TOOLS = new Set(['select', 'lasso_select']);

export interface UseCanvasInputOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  getWorldPos: (e: { clientX: number; clientY: number }) => Point;
  beginPan: (e: { clientX: number; clientY: number }) => void;
  updatePan: (e: { clientX: number; clientY: number }) => boolean;
  endPan: () => boolean;
  panByScreenDelta: (dx: number, dy: number) => void;
  zoomAtClientPoint: (scale: number, clientX: number, clientY: number) => void;

  bondLengthPx: number;
  bondAngleSnapRad: number;
  snapToGrid?: boolean;
  gridSizePx?: number;
  molecule: Molecule;
  activeTool: string;
  placementElement: string;
  activeColor: string;
  activeThickness: number;
  selectedAtomIds: string[];
  selectedBondIds?: string[];

  setSelectedAtomIds?: (ids: string[]) => void;
  setSelectedBondIds?: (ids: string[]) => void;
  selectedChargeAtomIds?: string[];
  selectedChargeMarkKind?: 'formal' | 'delta' | null;
  setSelectedChargeMarkKind?: (kind: 'formal' | 'delta' | null) => void;
  setSelectedChargeAtomIds?: (ids: string[]) => void;
  setSelectedCanvasTextId?: (id: string | null) => void;
  setColorEditCanvasShapeId?: (id: string | null) => void;
  setColorEditStrokeId?: (id: string | null) => void;
  selectedReactionArrowIds?: string[];
  selectedStrokeIds?: string[];
  selectedCanvasTextIds?: string[];
  selectedCanvasShapeIds?: string[];
  selectedCanvasImageIds?: string[];
  onSetMarqueeSelection?: InteractionContext['onSetMarqueeSelection'];
  onTranslateMarqueeSelection?: InteractionContext['onTranslateMarqueeSelection'];
  selectedCanvasShapeId?: string | null;
  setSelectedReactionArrowId?: (id: string | null) => void;
  setSelectedCanvasImageId?: (id: string | null) => void;
  setSelectedSruBracketId?: (id: string | null) => void;
  selectedCanvasImageId?: string | null;
  selectedCanvasTextId?: string | null;
  selectedSruBracketId?: string | null;
  onEditSruBracketSubscript?: (id: string) => void;

  onAddAtom?: InteractionContext['onAddAtom'];
  onAddBond?: InteractionContext['onAddBond'];
  onUpdateBond?: InteractionContext['onUpdateBond'];
  onFlipBond?: InteractionContext['onFlipBond'];
  onAddRing?: InteractionContext['onAddRing'];
  onAddBoatRing?: InteractionContext['onAddBoatRing'];
  onAddChairRing?: InteractionContext['onAddChairRing'];
  onAddChain?: InteractionContext['onAddChain'];
  onUpdateAtomCharge?: InteractionContext['onUpdateAtomCharge'];
  onSetAtomCharge?: InteractionContext['onSetAtomCharge'];
  onSetAtomDeltaCharge?: InteractionContext['onSetAtomDeltaCharge'];
  onSetAtomChargeOffset?: InteractionContext['onSetAtomChargeOffset'];
  onSetAtomDeltaChargeOffset?: InteractionContext['onSetAtomDeltaChargeOffset'];
  onUpdateAtomLonePairs?: InteractionContext['onUpdateAtomLonePairs'];
  onSetAtomRadical?: InteractionContext['onSetAtomRadical'];
  onSetAtomRadicalIon?: InteractionContext['onSetAtomRadicalIon'];
  onAddExplicitHydrogen?: InteractionContext['onAddExplicitHydrogen'];
  onUpdateAtomElement?: InteractionContext['onUpdateAtomElement'];
  onAddStroke?: InteractionContext['onAddStroke'];
  onSmartDrawStroke?: InteractionContext['onSmartDrawStroke'];
  /** Pointer cancel / lost capture while Smart Draw is active. */
  onSmartDrawPointerCancel?: () => void;
  onTranslateStroke?: InteractionContext['onTranslateStroke'];
  onMoveAtoms?: InteractionContext['onMoveAtoms'];
  onRotateSelectionCommit?: InteractionContext['onRotateSelectionCommit'];
  onScaleSelectionCommit?: InteractionContext['onScaleSelectionCommit'];
  onRotate3DPoseCommit?: InteractionContext['onRotate3DPoseCommit'];
  onPerspectivePosePreview?: InteractionContext['onPerspectivePosePreview'];
  onEraseAt?: InteractionContext['onEraseAt'];
  onAddReactionArrow?: InteractionContext['onAddReactionArrow'];
  onAddCanvasText?: InteractionContext['onAddCanvasText'];
  onUpdateCanvasText?: InteractionContext['onUpdateCanvasText'];
  onCanvasTextTransforming?: InteractionContext['onCanvasTextTransforming'];
  onUpdateCanvasImage?: InteractionContext['onUpdateCanvasImage'];
  onUpdateCanvasShape?: InteractionContext['onUpdateCanvasShape'];
  onTranslateCanvasShapes?: InteractionContext['onTranslateCanvasShapes'];
  onUpdateReactionArrow?: InteractionContext['onUpdateReactionArrow'];
  onRequestAtomAliasEdit?: InteractionContext['onRequestAtomAliasEdit'];
  onRequestArrowReagentEdit?: InteractionContext['onRequestArrowReagentEdit'];
  selectedReactionArrowId?: string | null;

  onContextMenu?: (e: React.MouseEvent | React.PointerEvent, worldPos: Point) => void;
  /**
   * Host chrome (menus, docks, modals). Called on drawing-surface pointerdown.
   * Return true if overlays were open so this press should not also start a draw.
   */
  onDismissChromeOverlays?: () => boolean;

  /** Ring-select + ring-fill: apply swatch to clicked ring without using the color menu each time. */
  ringPaintActive?: boolean;
  ringFillOpacity?: number;
  onApplyRingFill?: (ringAtomIds: string[], color: string, opacity: number) => void;

  /** Arrow geometry the reaction-arrow tool will place (toolbar cycle). */
  reactionArrowKind?: ReactionArrowKind;
  /** electron_flow head style from the Arrow split menu. */
  reactionArrowHeadStyle?: ArrowHeadStyle;
  reactionArrowTailStyle?: ArrowTailStyle;
  reactionArrowHeadScale?: number;
  /** Shape kind for the annotation shape tool (toolbar dropdown). */
  canvasShapeKind?: CanvasShapeKind;
  onAddCanvasShape?: InteractionContext['onAddCanvasShape'];
  onAddCanvasOrbital?: InteractionContext['onAddCanvasOrbital'];
  onUpdateCanvasOrbital?: InteractionContext['onUpdateCanvasOrbital'];
  selectedCanvasOrbitalIds?: string[];
  setSelectedCanvasOrbitalIds?: (ids: string[]) => void;
  onAddSruBracketAroundAtoms?: InteractionContext['onAddSruBracketAroundAtoms'];

  fragmentPlacement?: FragmentPlacementSession | null;
  onCommitFragmentPlacement?: (commit: FragmentPlacementCommit) => void;
  /** Current viewport zoom for handle hit sizes. */
  viewportZoom?: number;

  /**
   * Touch only: a single finger on empty canvas with the select tool pans
   * instead of starting a marquee. Default `false` — marquee / lasso work
   * like on desktop and panning is two fingers or the hand tool.
   */
  touchPanOnEmptyCanvas?: boolean;
  /** Record pointer events for the developer HUD (`pointerDebugInfo`). */
  pointerDebugHud?: boolean;
  /** Two-finger tap (touch). */
  onUndoGesture?: () => void;
  /** Three-finger tap (touch). */
  onRedoGesture?: () => void;
}

export interface UseCanvasInputResult {
  // State exposed to render()
  drawingBond: DrawingBondState | null;
  drawingChain: DrawingChainState | null;
  drawingRing: DrawingRingState | null;
  drawingStroke: StrokeSample[] | null;
  drawingReactionArrow: DrawingReactionArrowState | null;
  drawingCanvasShape: DrawingCanvasShapeState | null;
  dragAction: DragActionState | null;
  hoveredAtomCircleId: string | null;
  hoveredBondHighlightId: string | null;
  hoveredComponentIds: string[];
  hoverAtomId: string | null;
  hoverBondId: string | null;
  hoverRingAtomIds: string[] | null;
  mouseWorldPos: Point | null;
  errorAtomId: string | null;
  /**
   * World position of the active finger while it is down (touch only). The
   * renderer draws a halo there so the user sees what the (occluding) finger
   * is over; null for mouse / pen and when no finger is down.
   */
  touchPointerWorldPos: Point | null;
  /** Last pointer event snapshot when `pointerDebugHud` is on; else null. */
  pointerDebugInfo: PointerDebugInfo | null;

  // Pointer handlers (Pointer Events — mouse, touch, pen)
  handlePointerDown: (e: CanvasPointerEvent) => void;
  handlePointerMove: (e: CanvasPointerEvent) => void;
  handlePointerUp: (e: CanvasPointerEvent) => void;
  handlePointerCancel: (e: CanvasPointerEvent) => void;
  handlePointerLeave: (e: CanvasPointerEvent) => void;
  handleLostPointerCapture: (e: CanvasPointerEvent) => void;
  handleDoubleClick: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  handleContextMenu: (e: React.MouseEvent<HTMLCanvasElement>) => void;
}

const ERROR_FLASH_MS = 800;

/**
 * Owns all canvas interaction state (drawing previews, drag actions, hover,
 * error flash) and exposes high-level pointer handlers. Each handler builds a
 * frame-scoped `InteractionContext` and dispatches into a per-tool module
 * from `./interaction/`.
 *
 * Input is Pointer Events (mouse / touch / pen). Multi-touch pinch-pan and
 * palm rejection live in `./touch/`; this hook wires them to the viewport
 * and cancels in-flight single-finger tools when a second finger lands.
 */
export const useCanvasInput = (opts: UseCanvasInputOptions): UseCanvasInputResult => {
  const {
    canvasRef,
    getWorldPos,
    beginPan,
    updatePan,
    endPan,
    panByScreenDelta,
    zoomAtClientPoint,
    molecule,
    activeTool,
    placementElement,
    activeColor,
    activeThickness,
    selectedAtomIds,
    selectedBondIds = [],
  } = opts;

  const [drawingBond, setDrawingBond] = useState<DrawingBondState | null>(null);
  const [drawingChain, setDrawingChain] = useState<DrawingChainState | null>(null);
  const [drawingRing, setDrawingRing] = useState<DrawingRingState | null>(null);
  const [drawingStroke, setDrawingStroke] = useState<StrokeSample[] | null>(null);
  const [drawingReactionArrow, setDrawingReactionArrow] =
    useState<DrawingReactionArrowState | null>(null);
  const [drawingCanvasShape, setDrawingCanvasShape] =
    useState<DrawingCanvasShapeState | null>(null);
  const [dragAction, setDragAction] = useState<DragActionState | null>(null);

  const [hoveredAtomCircleId, setHoveredAtomCircleId] = useState<string | null>(null);
  const [hoveredBondHighlightId, setHoveredBondHighlightId] = useState<string | null>(null);
  const [hoveredComponentIds, setHoveredComponentIds] = useState<string[]>([]);
  const [hoverAtomId, setHoverAtomId] = useState<string | null>(null);
  const [hoverBondId, setHoverBondId] = useState<string | null>(null);
  const [hoverRingAtomIds, setHoverRingAtomIds] = useState<string[] | null>(null);
  const [mouseWorldPos, setMouseWorldPos] = useState<Point | null>(null);
  const placementDraggingRef = useRef(false);
  const placementAnchorAtomIdRef = useRef<string | null>(null);
  const [, setPlacementDraggingState] = useState(false);
  const [, setPlacementAnchorAtomIdState] = useState<string | null>(null);
  const setPlacementDragging = useCallback((value: React.SetStateAction<boolean>) => {
    const next = typeof value === 'function' ? value(placementDraggingRef.current) : value;
    placementDraggingRef.current = next;
    setPlacementDraggingState(next);
  }, []);
  const setPlacementAnchorAtomId = useCallback((value: React.SetStateAction<string | null>) => {
    const next = typeof value === 'function' ? value(placementAnchorAtomIdRef.current) : value;
    placementAnchorAtomIdRef.current = next;
    setPlacementAnchorAtomIdState(next);
  }, []);

  // Reset placement / ring-hover when the active tool changes (adjust state during render).
  const [toolEpoch, setToolEpoch] = useState(activeTool);
  if (toolEpoch !== activeTool) {
    setToolEpoch(activeTool);
    if (!isPlaceFragmentTool(activeTool)) {
      placementDraggingRef.current = false;
      placementAnchorAtomIdRef.current = null;
      setPlacementDraggingState(false);
      setPlacementAnchorAtomIdState(null);
      setHoverAtomId(null);
    }
    setHoverRingAtomIds(null);
    resetRingPickCycle();
  }

  const [errorAtomId, setErrorAtomId] = useState<string | null>(null);
  const [mouseDownPos, setMouseDownPos] = useState<Point>({ x: 0, y: 0 });
  const [touchPointerWorldPos, setTouchPointerWorldPos] = useState<Point | null>(null);

  /** Active single-pointer drawing id (for capture / ignore extras). */
  const activePointerIdRef = useRef<number | null>(null);
  /** Pen-priority: drop touch contacts while a stylus owns the canvas. */
  const penPriorityRef = useRef(createPenPriorityTracker());
  /** Eraser-end stroke in progress (stylus) — erase on every move. */
  const penEraserActiveRef = useRef(false);
  /** Targets already erased during the current eraser-end stroke. */
  const penEraserSeenRef = useRef(new Set<string>());
  /**
   * Touch contacts that passed palm / pen-priority checks on pointerdown.
   * Their up / cancel must always be processed (even if a pen has since
   * landed) so the multi-touch tracker never keeps a stale contact.
   */
  const admittedTouchIdsRef = useRef(new Set<number>());
  /** Skip tool commit after long-press opened the context menu. */
  const suppressNextUpRef = useRef(false);
  /**
   * After a two-finger gesture starts, ignore remaining touch contacts for
   * drawing until all fingers lift (avoids stray commits / hover).
   */
  const touchGestureLockRef = useRef(false);
  /** Live two-finger selection transform (mirrors `dragAction` without React lag). */
  const touchTransformRef = useRef<TransformSelectionDrag | null>(null);
  const onCanvasTextTransformingRef = useRef(opts.onCanvasTextTransforming);
  onCanvasTextTransformingRef.current = opts.onCanvasTextTransforming;
  const onDismissChromeOverlaysRef = useRef(opts.onDismissChromeOverlays);
  onDismissChromeOverlaysRef.current = opts.onDismissChromeOverlays;

  const flashAtomError = useCallback((atomId: string) => {
    setErrorAtomId(atomId);
    setTimeout(() => setErrorAtomId(null), ERROR_FLASH_MS);
  }, []);

  const clearInFlightDrawing = useCallback(() => {
    onCanvasTextTransformingRef.current?.(false);
    setDrawingBond(null);
    setDrawingChain(null);
    setDrawingRing(null);
    setDrawingStroke(null);
    setDrawingReactionArrow(null);
    setDrawingCanvasShape(null);
    setDragAction(null);
    placementDraggingRef.current = false;
    setPlacementDraggingState(false);
    setMouseWorldPos(null);
    setTouchPointerWorldPos(null);
  }, []);

  /**
   * Eraser-end drags fire on every pointermove; between React renders the
   * molecule snapshot is stale, so the same target must not be erased twice.
   */
  const withEraserDedupe = useCallback((ctx: InteractionContext): InteractionContext => {
    const onEraseAt = ctx.onEraseAt;
    if (!onEraseAt) return ctx;
    return {
      ...ctx,
      onEraseAt: hit => {
        const key = `${hit.type}:${'atomId' in hit ? hit.atomId : 'bondId' in hit ? hit.bondId : 'strokeId' in hit ? hit.strokeId : hit.id}`;
        if (penEraserSeenRef.current.has(key)) return;
        penEraserSeenRef.current.add(key);
        onEraseAt(hit);
      },
    };
  }, []);

  /** Touch has no hover: drop the halo / glow when the finger lifts. */
  const clearTouchFeedback = useCallback(() => {
    setTouchPointerWorldPos(null);
    setHoveredAtomCircleId(null);
    setHoveredBondHighlightId(null);
    setHoveredComponentIds([]);
    setHoverAtomId(null);
    setHoverBondId(null);
    setMouseWorldPos(null);
  }, []);

  const { shouldDispatchMove, reset: resetCoalesce } = usePointerCoalesce();

  const [pointerDebugInfo, setPointerDebugInfo] = useState<PointerDebugInfo | null>(null);
  const pointerDebugEnabled = opts.pointerDebugHud === true;

  const longPress = useTouchLongPress({
    canvasRef,
    getWorldPos,
    onLongPress: (e, worldPos) => {
      // Only armed for select / lasso / hand (see handlePointerDown), so this
      // never interrupts a bond / ring / chain drag. If the host has no
      // context menu, do nothing — the press continues as a normal drag.
      if (!opts.onContextMenu) return;
      suppressNextUpRef.current = true;
      clearInFlightDrawing();
      clearTouchFeedback();
      opts.onContextMenu(e, worldPos);
    },
  });

  const selectionTransformCallbacks = (): TouchSelectionTransformCallbacks => ({
    onTranslateMarqueeSelection: opts.onTranslateMarqueeSelection,
    onMoveAtoms: opts.onMoveAtoms,
    onRotateSelectionCommit: opts.onRotateSelectionCommit,
    onScaleSelectionCommit: opts.onScaleSelectionCommit,
    selectedReactionArrowIds: opts.selectedReactionArrowIds ?? [],
    selectedStrokeIds: opts.selectedStrokeIds ?? [],
    selectedCanvasTextIds: opts.selectedCanvasTextIds ?? [],
    selectedCanvasShapeIds: opts.selectedCanvasShapeIds ?? [],
    selectedCanvasImageIds: opts.selectedCanvasImageIds ?? [],
  });

  const multiTouch = useMultiTouchGestures({
    onPan: panByScreenDelta,
    onPinchZoom: zoomAtClientPoint,
    onGestureStart: focalClient => {
      longPress.cancel();
      clearInFlightDrawing();
      clearTouchFeedback();
      endPan();
      activePointerIdRef.current = null;
      touchGestureLockRef.current = true;
      suppressNextUpRef.current = true;
      touchTransformRef.current = null;
      // Two fingers on the selection (select / lasso): move / rotate / scale
      // the selection instead of the viewport.
      if (LONG_PRESS_TOOLS.has(activeTool)) {
        const drag = beginTouchSelectionTransform(
          molecule,
          selectedAtomIds,
          selectedBondIds,
          selectionTransformCallbacks(),
          getWorldPos({ clientX: focalClient.x, clientY: focalClient.y }),
          canvasRef.current?.getContext('2d') ?? null,
        );
        if (drag) {
          touchTransformRef.current = drag;
          setDragAction(drag);
          return true;
        }
      }
      return false;
    },
    onClaimedGesture: delta => {
      const prev = touchTransformRef.current;
      if (!prev) return;
      const next = updateTouchSelectionTransform(prev, delta, opts.viewportZoom ?? 1);
      touchTransformRef.current = next;
      setDragAction(next);
    },
    onGestureEnd: claimed => {
      const drag = touchTransformRef.current;
      touchTransformRef.current = null;
      if (claimed && drag) {
        commitTouchSelectionTransform(
          molecule,
          selectedAtomIds,
          selectedBondIds,
          selectionTransformCallbacks(),
          drag,
        );
      }
      if (drag) setDragAction(null);
    },
    onMultiTap: fingers => {
      if (fingers === 2) opts.onUndoGesture?.();
      else if (fingers === 3) opts.onRedoGesture?.();
    },
  });
  /** Record the last pointer event for the developer HUD (no-op when disabled). */
  const noteDebugPointer = useCallback(
    (
      e: CanvasPointerEvent,
      phase: PointerDebugInfo['phase'],
      rejected: PointerDebugInfo['rejected'] = null,
    ) => {
      if (!pointerDebugEnabled) return;
      const native = e as unknown as { tiltX?: number; tiltY?: number };
      setPointerDebugInfo({
        phase,
        pointerType: e.pointerType || 'mouse',
        pointerId: e.pointerId,
        isPrimary: e.isPrimary !== false,
        pressure: e.pressure ?? 0,
        tiltX: native.tiltX ?? 0,
        tiltY: native.tiltY ?? 0,
        buttons: e.buttons,
        width: e.width ?? 0,
        height: e.height ?? 0,
        touchCount: multiTouch.touchCount(),
        gesturing: multiTouch.isGesturing(),
        claimed: multiTouch.isClaimed(),
        rejected,
        activeTool,
        ts: Date.now(),
      });
    },
    [pointerDebugEnabled, activeTool, multiTouch],
  );

  const buildContext = useCallback(
    (
      e: React.PointerEvent,
      worldPos: Point,
      coalescedWorldPositions?: StrokeSample[],
    ): InteractionContext => ({
      e,
      worldPos,
      mouseDownPos,
      inputProfile: inputProfileOf(e.pointerType),
      hit: hitMetricsFor(inputProfileOf(e.pointerType), opts.viewportZoom ?? 1),
      coalescedWorldPositions,
      activeTool,
      reactionArrowKind: opts.reactionArrowKind ?? 'straight',
      reactionArrowHeadStyle: opts.reactionArrowHeadStyle ?? 'pair',
      reactionArrowTailStyle: opts.reactionArrowTailStyle ?? 'none',
      reactionArrowHeadScale: opts.reactionArrowHeadScale,
      canvasShapeKind: opts.canvasShapeKind ?? 'rectangle',
      placementElement,
      isRingTool: isRingTool(activeTool),
      isBoatTool: activeTool === 'boat_cyclohexane',
      isBenzene: activeTool === 'benzene' || activeTool === 'cyclopentadiene',
      numSides: ringSidesForTool(activeTool),
      activeColor,
      activeThickness,
      ringPaintActive: opts.ringPaintActive,
      ringFillOpacity: opts.ringFillOpacity,
      onApplyRingFill: opts.onApplyRingFill,
      molecule,
      bondLengthPx: opts.bondLengthPx,
      bondAngleSnapRad: opts.bondAngleSnapRad,
      snapToGrid: opts.snapToGrid,
      gridSizePx: opts.gridSizePx,
      selectedAtomIds,
      selectedBondIds,
      selectedCanvasImageId: opts.selectedCanvasImageId ?? null,
      selectedCanvasTextId: opts.selectedCanvasTextId ?? null,
      selectedSruBracketId: opts.selectedSruBracketId ?? null,
      viewport: { zoom: opts.viewportZoom ?? 1 },
      drawingBond,
      drawingChain,
      drawingRing,
      drawingStroke,
      drawingReactionArrow,
      drawingCanvasShape,
      dragAction,
      hoverBondId,
      setDrawingBond,
      setDrawingChain,
      setDrawingRing,
      setDrawingStroke,
      setDrawingReactionArrow,
      setDrawingCanvasShape,
      setDragAction,
      setMouseDownPos,
      setHoverAtomId,
      setHoverBondId,
      setHoveredAtomCircleId,
      setHoveredBondHighlightId,
      setHoveredComponentIds,
      setMouseWorldPos,
      flashAtomError,
      setSelectedAtomIds: opts.setSelectedAtomIds,
      setSelectedBondIds: opts.setSelectedBondIds,
      selectedChargeAtomIds: opts.selectedChargeAtomIds ?? [],
      setSelectedChargeAtomIds: opts.setSelectedChargeAtomIds,
      setSelectedCanvasTextId: opts.setSelectedCanvasTextId,
      setColorEditCanvasShapeId: opts.setColorEditCanvasShapeId,
      setColorEditStrokeId: opts.setColorEditStrokeId,
      selectedReactionArrowIds: opts.selectedReactionArrowIds ?? [],
      selectedStrokeIds: opts.selectedStrokeIds ?? [],
      selectedCanvasTextIds: opts.selectedCanvasTextIds ?? [],
      selectedCanvasShapeIds: opts.selectedCanvasShapeIds ?? [],
      selectedCanvasImageIds: opts.selectedCanvasImageIds ?? [],
      onSetMarqueeSelection: opts.onSetMarqueeSelection,
      onTranslateMarqueeSelection: opts.onTranslateMarqueeSelection,
      selectedCanvasShapeId: opts.selectedCanvasShapeId ?? null,
      setSelectedReactionArrowId: opts.setSelectedReactionArrowId,
      selectedReactionArrowId: opts.selectedReactionArrowId ?? null,
      setSelectedCanvasImageId: opts.setSelectedCanvasImageId,
      setSelectedSruBracketId: opts.setSelectedSruBracketId,
      onEditSruBracketSubscript: opts.onEditSruBracketSubscript,
      onAddAtom: opts.onAddAtom,
      onAddBond: opts.onAddBond,
      onUpdateBond: opts.onUpdateBond,
      onFlipBond: opts.onFlipBond,
      onAddRing: opts.onAddRing,
      onAddBoatRing: opts.onAddBoatRing,
      onAddChairRing: opts.onAddChairRing,
      onAddChain: opts.onAddChain,
      onUpdateAtomCharge: opts.onUpdateAtomCharge,
      onSetAtomCharge: opts.onSetAtomCharge,
      onSetAtomDeltaCharge: opts.onSetAtomDeltaCharge,
      onSetAtomChargeOffset: opts.onSetAtomChargeOffset,
      onSetAtomDeltaChargeOffset: opts.onSetAtomDeltaChargeOffset,
      selectedChargeMarkKind: opts.selectedChargeMarkKind ?? null,
      setSelectedChargeMarkKind: opts.setSelectedChargeMarkKind,
      onUpdateAtomLonePairs: opts.onUpdateAtomLonePairs,
      onSetAtomRadical: opts.onSetAtomRadical,
      onSetAtomRadicalIon: opts.onSetAtomRadicalIon,
      onAddExplicitHydrogen: opts.onAddExplicitHydrogen,
      onUpdateAtomElement: opts.onUpdateAtomElement,
      onAddStroke: opts.onAddStroke,
      onSmartDrawStroke: opts.onSmartDrawStroke,
      onTranslateStroke: opts.onTranslateStroke,
      onMoveAtoms: opts.onMoveAtoms,
      onRotate3DPoseCommit: opts.onRotate3DPoseCommit,
      onPerspectivePosePreview: opts.onPerspectivePosePreview,
      onRotateSelectionCommit: opts.onRotateSelectionCommit,
      onScaleSelectionCommit: opts.onScaleSelectionCommit,
      onEraseAt: opts.onEraseAt,
      onAddReactionArrow: opts.onAddReactionArrow,
      onAddCanvasShape: opts.onAddCanvasShape,
      onAddCanvasOrbital: opts.onAddCanvasOrbital,
      onUpdateCanvasOrbital: opts.onUpdateCanvasOrbital,
      selectedCanvasOrbitalIds: opts.selectedCanvasOrbitalIds,
      setSelectedCanvasOrbitalIds: opts.setSelectedCanvasOrbitalIds,
      onUpdateCanvasShape: opts.onUpdateCanvasShape,
      onTranslateCanvasShapes: opts.onTranslateCanvasShapes,
      onAddSruBracketAroundAtoms: opts.onAddSruBracketAroundAtoms,
      onAddCanvasText: opts.onAddCanvasText,
      onUpdateCanvasText: opts.onUpdateCanvasText,
      onCanvasTextTransforming: opts.onCanvasTextTransforming,
      onUpdateCanvasImage: opts.onUpdateCanvasImage,
      onUpdateReactionArrow: opts.onUpdateReactionArrow,
      onRequestAtomAliasEdit: opts.onRequestAtomAliasEdit,
      onRequestArrowReagentEdit: opts.onRequestArrowReagentEdit,
      getCanvasContext: () => canvasRef.current?.getContext('2d') ?? null,
      fragmentPlacement: opts.fragmentPlacement,
      placementDragging: placementDraggingRef.current,
      setPlacementDragging,
      placementAnchorAtomId: placementAnchorAtomIdRef.current,
      setPlacementAnchorAtomId,
      onCommitFragmentPlacement: opts.onCommitFragmentPlacement,
    }),
    [
      mouseDownPos,
      activeTool,
      setPlacementDragging,
      setPlacementAnchorAtomId,
      placementElement,
      activeColor,
      activeThickness,
      molecule,
      selectedAtomIds,
      selectedBondIds,
      drawingBond,
      drawingChain,
      drawingRing,
      drawingStroke,
      drawingReactionArrow,
      drawingCanvasShape,
      dragAction,
      hoverBondId,
      flashAtomError,
      opts,
      canvasRef,
    ],
  );

  /**
   * Dispatcher for pointer-down. Order matters:
   *   1. Palm reject / multi-touch bookkeeping.
   *   2. Middle-click → pan (no tool dispatch).
   *   3. Secondary button → context menu only.
   *   4. Tool-specific down — first match wins.
   */
  const handlePointerDown = useCallback(
    (e: CanvasPointerEvent) => {
      penPriorityRef.current.notePointerDown(e);

      // Stylus owns the canvas: the resting hand must not start gestures.
      if (penPriorityRef.current.shouldIgnoreTouch(e)) {
        e.preventDefault();
        noteDebugPointer(e, 'down', 'pen-priority');
        return;
      }

      if (isLikelyPalm(e)) {
        e.preventDefault();
        noteDebugPointer(e, 'down', 'palm');
        return;
      }

      if (isTouchPointer(e)) admittedTouchIdsRef.current.add(e.pointerId);

      // Always track touches for pinch/pan, even when not drawing.
      multiTouch.notePointerDown(e);
      noteDebugPointer(e, 'down');

      // Second+ finger: gesture owns the canvas; don't start tools. When the
      // gesture was claimed by the selection transform, `onGestureStart` has
      // already cleared single-finger state and seeded the drag — keep it.
      if (isTouchPointer(e) && multiTouch.touchCount() >= 2) {
        e.preventDefault();
        longPress.cancel();
        if (!multiTouch.isClaimed()) clearInFlightDrawing();
        activePointerIdRef.current = null;
        touchGestureLockRef.current = true;
        suppressNextUpRef.current = true;
        return;
      }

      if (multiTouch.isGesturing() || touchGestureLockRef.current) {
        e.preventDefault();
        return;
      }

      if (!isDrawingPointer(e)) {
        e.preventDefault();
        return;
      }

      // Canvas preventDefault() suppresses document `mousedown`, so header
      // click-outside listeners never see this press. Dismiss chrome here.
      // Primary button: first click closes overlays and does not also place
      // an atom / start a bond. Right-click may still open the context menu.
      if (onDismissChromeOverlaysRef.current?.()) {
        if (!isSecondaryButton(e) && !isMiddleButton(e)) {
          e.preventDefault();
          return;
        }
      }

      // Always seed `mouseDownPos` so the click-vs-drag distance check in
      // `handlePointerUp` is based on the *current* down event, not a stale one.
      setMouseDownPos({ x: e.clientX, y: e.clientY });
      suppressNextUpRef.current = false;
      penEraserActiveRef.current = false;
      resetCoalesce();

      if (isSecondaryButton(e)) {
        // Right-click / pen barrel: context menu only — never run tools.
        return;
      }

      if (isMiddleButton(e)) {
        e.preventDefault();
        beginPan(e);
        activePointerIdRef.current = e.pointerId;
        captureCanvasPointer(canvasRef.current, e);
        return;
      }

      e.preventDefault();
      activePointerIdRef.current = e.pointerId;
      captureCanvasPointer(canvasRef.current, e);

      const worldPos = getWorldPos(e);
      const ctx = buildContext(e, worldPos);

      // Stylus eraser end: erase under the tip regardless of the active tool,
      // and keep erasing while it is dragged (see handlePointerMove).
      if (isPenEraser(e)) {
        penEraserActiveRef.current = true;
        penEraserSeenRef.current.clear();
        eraseToolMouseDown(withEraserDedupe(ctx));
        return;
      }

      // Touch: show what the finger is over (no hover on touch otherwise).
      if (isTouchPointer(e)) {
        setTouchPointerWorldPos(worldPos);
        updateCanvasHover(ctx);
        if (isBondTool(activeTool)) bondToolUpdateHover(ctx);
        else if (isRingTool(activeTool)) ringToolUpdateHover(ctx);
      }

      // Touch long-press → context menu. Only for select / lasso (and only when
      // the host has a menu), so a finger resting before a bond / ring / chain
      // drag is never interrupted.
      if (LONG_PRESS_TOOLS.has(activeTool) && opts.onContextMenu) {
        longPress.notePointerDown(e);
      }

      if (trySelectAnnotationAt(ctx)) return;

      if (isPlaceFragmentTool(activeTool)) {
        placeFragmentToolMouseDown(ctx);
        return;
      }

      if (activeTool === 'hand') {
        beginPan(e);
        return;
      }
      if (activeTool === 'erase') return void eraseToolMouseDown(ctx);
      if (isOrbitalTool(activeTool)) return void orbitalToolMouseDown(ctx);
      if (activeTool === 'atom_label') return void atomLabelToolMouseDown(ctx);
      if (activeTool === 'reaction_arrow') return void reactionArrowToolMouseDown(ctx);
      if (activeTool === 'shape' || activeTool === 'glassware') return void shapeToolMouseDown(ctx);
      if (activeTool === 'sru_bracket') return void sruBracketToolMouseDown(ctx);
      if (activeTool === 'text') return void textToolMouseDown(ctx);
      if (activeTool === 'select' || activeTool === 'lasso_select') {
        if (
          (e.altKey || e.getModifierState?.('Alt')) &&
          ctx.molecule.perspective3D &&
          Object.keys(ctx.molecule.perspective3D.positions).length > 0
        ) {
          return void perspectiveToolMouseDown(ctx);
        }
        // Touch on empty canvas: marquee / lasso like desktop by default; pan
        // only when the host opts in (two fingers / hand tool pan otherwise).
        if (isTouchPointer(e) && !selectToolHasTargetAt(ctx)) {
          longPress.cancel();
          if (opts.touchPanOnEmptyCanvas !== true) {
            return void selectToolMouseDown(ctx);
          }
          opts.setSelectedAtomIds?.([]);
          opts.setSelectedBondIds?.([]);
          opts.setSelectedCanvasTextId?.(null);
          opts.setSelectedReactionArrowId?.(null);
          opts.setSelectedCanvasImageId?.(null);
          opts.setSelectedSruBracketId?.(null);
          opts.setColorEditCanvasShapeId?.(null);
          opts.setColorEditStrokeId?.(null);
          beginPan(e);
          return;
        }
        return void selectToolMouseDown(ctx);
      }
      if (activeTool === 'perspective') {
        return void perspectiveToolMouseDown(ctx);
      }
      if (activeTool === 'pencil' || isSmartDrawTool(activeTool)) return void pencilToolMouseDown(ctx);
      if (isStampSymbolTool(activeTool)) return void stampSymbolToolMouseDown(ctx);
      if (
        activeTool === 'charge_plus' ||
        activeTool === 'charge_minus' ||
        activeTool === 'oplus' ||
        activeTool === 'ominus' ||
        activeTool === 'radical_cation' ||
        activeTool === 'radical_anion' ||
        activeTool === 'lone_pair' ||
        activeTool === 'free_radical' ||
        activeTool === 'delta_plus' ||
        activeTool === 'delta_minus' ||
        activeTool === 'add_explicit_h'
      ) {
        return void chargeToolMouseDown(ctx);
      }

      // Bond/Ring/Chain are mutually exclusive — note the implicit fall-through
      // semantics in the legacy code: bond-tool empty-canvas branch is handled
      // inside `bondToolMouseDown`, not the chain/ring branches.
      if (isBondTool(activeTool)) {
        bondToolMouseDown(ctx);
        return;
      }
      if (isRingTool(activeTool)) {
        ringToolMouseDown(ctx);
        return;
      }
      if (activeTool === 'chain') {
        chainToolMouseDown(ctx);
        return;
      }
    },
    [
      activeTool,
      buildContext,
      beginPan,
      getWorldPos,
      multiTouch,
      longPress,
      clearInFlightDrawing,
      resetCoalesce,
      withEraserDedupe,
      noteDebugPointer,
      canvasRef,
      opts,
    ],
  );

  /**
   * Dispatcher for pointer-move. Order:
   *   1. Multi-touch pinch/pan → consume.
   *   2. Active pan → consume.
   *   3. Active drag-action (move/rotate/lasso/box/text/arrow) → consume.
   *   4. Tool-specific move (reaction-arrow drag, chain stretch, pencil draw,
   *      ring hover, bond ghost snap).
   *   5. Soft hover detection (atom/bond glow under the cursor).
   */
  const handlePointerMove = useCallback(
    (e: CanvasPointerEvent) => {
      // Touch contacts rejected on the way down (palm / pen-priority) stay ignored.
      if (isTouchPointer(e) && !admittedTouchIdsRef.current.has(e.pointerId)) {
        e.preventDefault();
        return;
      }
      noteDebugPointer(e, 'move');

      if (multiTouch.notePointerMove(e)) {
        e.preventDefault();
        longPress.cancel();
        return;
      }

      if (multiTouch.isGesturing() || touchGestureLockRef.current) {
        if (isTouchPointer(e)) {
          e.preventDefault();
          return;
        }
      }

      // Ignore moves from non-active pointers (extra fingers / palm).
      if (
        activePointerIdRef.current != null &&
        e.pointerId !== activePointerIdRef.current
      ) {
        return;
      }

      // No active drawing pointer: only allow mouse/pen soft hover.
      if (activePointerIdRef.current == null && isTouchPointer(e)) {
        return;
      }

      longPress.notePointerMove(e);

      if (updatePan(e)) return;

      // Coalesce high-frequency moves (esp. touch) unless a drag/draw is active.
      const drawingBusy =
        drawingBond != null ||
        drawingChain != null ||
        drawingRing != null ||
        drawingStroke != null ||
        drawingReactionArrow != null ||
        drawingCanvasShape != null ||
        dragAction != null ||
        placementDraggingRef.current;
      if (!drawingBusy && !isPlaceFragmentTool(activeTool) && !shouldDispatchMove(e)) return;

      const worldPos = getWorldPos(e);

      // Freehand strokes: fold in the browser's coalesced samples (pen/touch)
      // so fast strokes are not decimated to one point per frame.
      let coalesced: StrokeSample[] | undefined;
      if (drawingStroke) {
        const native = e.nativeEvent as PointerEvent & {
          getCoalescedEvents?: () => PointerEvent[];
        };
        const batch = native.getCoalescedEvents?.();
        if (batch && batch.length > 1) {
          const pen = e.pointerType === 'pen';
          coalesced = batch.map(ce =>
            pen ? { ...getWorldPos(ce), pressure: ce.pressure } : getWorldPos(ce),
          );
        }
      }

      const ctx = buildContext(e, worldPos, coalesced);

      // Stylus eraser end dragged across the structure.
      if (penEraserActiveRef.current) {
        if (isPenEraser(e)) eraseToolMouseDown(withEraserDedupe(ctx));
        return;
      }

      if (isTouchPointer(e)) setTouchPointerWorldPos(worldPos);

      if (updateActiveDragAction(ctx)) return;

      if (isPlaceFragmentTool(activeTool)) {
        placeFragmentToolMouseMove(ctx);
        updateCanvasHover(ctx);
        return;
      }

      if (activeTool === 'reaction_arrow' && reactionArrowToolMouseMove(ctx)) return;
      if ((activeTool === 'shape' || activeTool === 'glassware') && shapeToolMouseMove(ctx)) return;
      if (activeTool === 'chain' && chainToolMouseMove(ctx)) return;
      if ((activeTool === 'pencil' || isSmartDrawTool(activeTool)) && pencilToolMouseMove(ctx)) return;

      setHoverRingAtomIds(null);

      // Hover detection runs whenever no drag/draw consumed the move. Touch
      // only reaches here while the finger is down (active pointer), where
      // the glow doubles as "what am I over" feedback under the fingertip.
      updateCanvasHover(ctx);

      if (isRingTool(activeTool)) {
        ringToolUpdateHover(ctx);
        ringToolMouseMove(ctx);
        return;
      }

      if (isBondTool(activeTool)) {
        bondToolUpdateHover(ctx);
        bondToolMouseMove(ctx);
      }
    },
    [
      activeTool,
      buildContext,
      updatePan,
      getWorldPos,
      multiTouch,
      longPress,
      shouldDispatchMove,
      withEraserDedupe,
      noteDebugPointer,
      drawingBond,
      drawingChain,
      drawingRing,
      drawingStroke,
      drawingReactionArrow,
      drawingCanvasShape,
      dragAction,
    ],
  );

  /**
   * Dispatcher for pointer-up. Order:
   *   1. End multi-touch bookkeeping.
   *   2. End an active pan.
   *   3. Commit any active drag-action (move/rotate/lasso/box/text/arrow).
   *   4. Tool-specific commit (reaction-arrow / chain / pencil / bond / ring).
   */
  const handlePointerUp = useCallback(
    (e: CanvasPointerEvent) => {
      penPriorityRef.current.notePointerUp(e);
      if (isTouchPointer(e) && !admittedTouchIdsRef.current.delete(e.pointerId)) {
        // Rejected on the way down (palm / pen-priority) — nothing to commit.
        return;
      }

      multiTouch.notePointerUp(e);
      noteDebugPointer(e, 'up');
      longPress.cancel();
      releaseCanvasPointer(canvasRef.current, e);
      if (isTouchPointer(e)) clearTouchFeedback();

      if (penEraserActiveRef.current && activePointerIdRef.current === e.pointerId) {
        penEraserActiveRef.current = false;
        penEraserSeenRef.current.clear();
        activePointerIdRef.current = null;
        return;
      }

      const stillInTouchGesture =
        touchGestureLockRef.current ||
        multiTouch.isGesturing() ||
        multiTouch.touchCount() >= 1;

      if (multiTouch.touchCount() === 0) {
        touchGestureLockRef.current = false;
      }

      if (stillInTouchGesture) {
        // Still in / just finished a multi-touch sequence — don't commit tools.
        if (activePointerIdRef.current === e.pointerId) {
          activePointerIdRef.current = null;
          clearInFlightDrawing();
        }
        return;
      }

      if (
        activePointerIdRef.current != null &&
        e.pointerId !== activePointerIdRef.current
      ) {
        return;
      }
      activePointerIdRef.current = null;

      if (suppressNextUpRef.current || longPress.didFire()) {
        suppressNextUpRef.current = false;
        clearInFlightDrawing();
        endPan();
        return;
      }

      if (endPan()) return;

      const worldPos = getWorldPos(e);
      const ctx = buildContext(e, worldPos);

      // SRU owns box-select commit (place brackets) — before generic commitDragAction.
      if (activeTool === 'sru_bracket' && sruBracketToolMouseUp(ctx)) return;

      if (commitDragAction(ctx)) return;

      if (isPlaceFragmentTool(activeTool) && placeFragmentToolMouseUp(ctx)) return;

      if (activeTool === 'reaction_arrow' && reactionArrowToolMouseUp(ctx)) return;
      if ((activeTool === 'shape' || activeTool === 'glassware') && shapeToolMouseUp(ctx)) return;
      if (activeTool === 'chain' && chainToolMouseUp(ctx)) return;
      if ((activeTool === 'pencil' || isSmartDrawTool(activeTool)) && pencilToolMouseUp(ctx)) return;

      if (isBondTool(activeTool)) {
        bondToolMouseUp(ctx);
        return;
      }
      if (isRingTool(activeTool)) {
        ringToolMouseUp(ctx);
        return;
      }

      // Fall-through: tools that didn't consume the up event (erase,
      // atom_label, charge_*, lone_pair, text). Original behavior: a tiny
      // click on empty canvas clears all selections regardless of tool.
      const distance = Math.hypot(e.clientX - mouseDownPos.x, e.clientY - mouseDownPos.y);
      if (
        distance < ctx.hit.clickDragThresholdPx &&
        e.button === 0 &&
        !isPlaceFragmentTool(activeTool)
      ) {
        const releaseAtom = pickAtomAt(molecule, worldPos, ctx.hit.atomHitRadius);
        if (
          releaseAtom &&
          (activeTool === 'select' || activeTool === 'lasso_select') &&
          !e.shiftKey &&
          opts.onRequestAtomAliasEdit &&
          displayGroupLabelForAtom(releaseAtom, molecule)
        ) {
          // Click (no drag) on alias / condensed FG label → edit like atom-label tool.
          opts.onRequestAtomAliasEdit(releaseAtom.id);
          return;
        }
        if (!releaseAtom) {
          opts.setSelectedAtomIds?.([]);
          opts.setSelectedBondIds?.([]);
          opts.setSelectedChargeAtomIds?.([]);
          opts.setSelectedCanvasTextId?.(null);
          opts.setSelectedReactionArrowId?.(null);
          opts.setColorEditStrokeId?.(null);
        }
      }
    },
    [
      activeTool,
      buildContext,
      endPan,
      getWorldPos,
      mouseDownPos,
      molecule,
      opts,
      multiTouch,
      longPress,
      clearInFlightDrawing,
      clearTouchFeedback,
      noteDebugPointer,
      canvasRef,
    ],
  );

  const abortActivePointer = useCallback(
    (e: CanvasPointerEvent) => {
      penPriorityRef.current.notePointerUp(e);
      if (isTouchPointer(e) && !admittedTouchIdsRef.current.delete(e.pointerId)) {
        return;
      }
      multiTouch.notePointerUp(e);
      noteDebugPointer(e, 'cancel');
      longPress.cancel();
      releaseCanvasPointer(canvasRef.current, e);
      if (multiTouch.touchCount() === 0) {
        touchGestureLockRef.current = false;
      }
      if (activePointerIdRef.current == null || activePointerIdRef.current === e.pointerId) {
        activePointerIdRef.current = null;
        penEraserActiveRef.current = false;
        penEraserSeenRef.current.clear();
        clearInFlightDrawing();
        if (isTouchPointer(e)) clearTouchFeedback();
        endPan();
      }
      suppressNextUpRef.current = false;
    },
    [multiTouch, longPress, clearInFlightDrawing, clearTouchFeedback, noteDebugPointer, endPan, canvasRef],
  );

  const handlePointerCancel = useCallback(
    (e: CanvasPointerEvent) => {
      abortActivePointer(e);
      if (isSmartDrawTool(activeTool)) opts.onSmartDrawPointerCancel?.();
    },
    [abortActivePointer, activeTool, opts.onSmartDrawPointerCancel],
  );

  /** Capture lost (OS gesture / tab switch) — same abort as pointercancel. */
  const handleLostPointerCapture = useCallback(
    (e: CanvasPointerEvent) => {
      abortActivePointer(e);
    },
    [abortActivePointer],
  );

  const handlePointerLeave = useCallback(
    (e: CanvasPointerEvent) => {
      // With pointer capture, leave is less critical; still clear soft hover
      // for mouse when not mid-gesture.
      if (e.pointerType === 'mouse' && activePointerIdRef.current == null) {
        setMouseWorldPos(null);
        setHoveredAtomCircleId(null);
        setHoveredBondHighlightId(null);
        setHoveredComponentIds([]);
      }
    },
    [],
  );

  /**
   * Double-click:
   *  - atom-label tool on an atom → inline alias editor;
   *  - select / lasso on an atom, bond, or ring → the whole connected molecule.
   */
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const worldPos = getWorldPos(e);
      // dblclick is a MouseEvent, but Chromium exposes the originating
      // pointerType on the native event — use finger-sized radii for touch.
      const nativeType = (e.nativeEvent as Partial<PointerEvent>).pointerType;
      const hit = hitMetricsFor(inputProfileOf(nativeType), opts.viewportZoom ?? 1);

      if (activeTool === 'atom_label') {
        const labelAtom = pickAtomAt(molecule, worldPos, hit.atomHitRadius);
        if (labelAtom && opts.onRequestAtomAliasEdit) {
          e.preventDefault();
          e.stopPropagation();
          setDragAction(null);
          opts.onRequestAtomAliasEdit(labelAtom.id);
        }
        return;
      }

      if (activeTool !== 'select' && activeTool !== 'lasso_select') return;

      const hitAtom = pickAtomAt(molecule, worldPos, hit.atomHitRadius);
      const hitBond = hitAtom ? null : pickBondAt(molecule, worldPos, hit.bondHitTolerance);
      const ringIds =
        hitAtom || hitBond ? null : findSmallestRingAtPoint(molecule, worldPos.x, worldPos.y);
      const seeds = hitAtom
        ? [hitAtom.id]
        : hitBond
          ? [hitBond.fromAtomId, hitBond.toAtomId]
          : (ringIds ?? []);
      if (seeds.length === 0) return;

      const atomIds = expandAtomIdsToConnectedFragments(molecule, seeds);
      const atomSet = new Set(atomIds);
      const bondIds = molecule.bonds
        .filter(b => atomSet.has(b.fromAtomId) && atomSet.has(b.toAtomId))
        .map(b => b.id);

      e.preventDefault();
      e.stopPropagation();
      setDragAction(null);
      opts.setSelectedCanvasTextId?.(null);
      opts.setSelectedReactionArrowId?.(null);
      opts.setSelectedAtomIds?.(atomIds);
      opts.setSelectedBondIds?.(bondIds);
    },
    [activeTool, molecule, getWorldPos, opts],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      // Always block the OS menu (also keeps Chromium from cancelling the
      // pointer stream on a touch long-press).
      e.preventDefault();
      // Browser-synthesised long-press contextmenu while a finger / pen is
      // drawing must not pop the menu mid-stroke: useTouchLongPress owns the
      // touch menu (select / lasso / hand only). Mouse right-click never has
      // an active drawing pointer (secondary button returns before capture).
      const nativeType = (e.nativeEvent as Partial<PointerEvent>).pointerType;
      if (nativeType === 'touch') return; // handled by useTouchLongPress
      if (nativeType !== 'mouse' && activePointerIdRef.current != null) return;
      if (opts.onContextMenu) {
        opts.onContextMenu(e, getWorldPos(e));
      }
    },
    [opts, getWorldPos],
  );

  return {
    drawingBond,
    drawingChain,
    drawingRing,
    drawingStroke,
    drawingReactionArrow,
    drawingCanvasShape,
    dragAction,
    hoveredAtomCircleId,
    hoveredBondHighlightId,
    hoveredComponentIds,
    hoverAtomId,
    hoverBondId,
    hoverRingAtomIds,
    mouseWorldPos,
    errorAtomId,
    touchPointerWorldPos,
    pointerDebugInfo,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handlePointerLeave,
    handleLostPointerCapture,
    handleDoubleClick,
    handleContextMenu,
  };
};
