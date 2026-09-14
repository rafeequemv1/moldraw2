import { useCallback, useRef, useState } from 'react';
import type React from 'react';
import type { CanvasShapeKind, Molecule, ReactionArrowKind } from '@moldraw/domain';
import type {
  FragmentPlacementCommit,
  FragmentPlacementSession,
} from '@moldraw/core/molecule/fragmentPlacement';
import type { Point } from './geometry';
import { findSmallestRingAtPoint } from './geometry';
import type {
  DragActionState,
  DrawingBondState,
  DrawingCanvasShapeState,
  DrawingChainState,
  DrawingReactionArrowState,
  DrawingRingState,
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
  commitDragAction,
  eraseToolMouseDown,
  isBondTool,
  isRingTool,
  pencilToolMouseDown,
  pencilToolMouseMove,
  pencilToolMouseUp,
  pickAtomAt,
  reactionArrowToolMouseDown,
  reactionArrowToolMouseMove,
  reactionArrowToolMouseUp,
  ringSidesForTool,
  ringToolMouseDown,
  ringToolMouseMove,
  ringToolMouseUp,
  ringToolUpdateHover,
  selectToolMouseDown,
  selectRingToolMouseDown,
  selectRingToolUpdateHover,
  resetRingPickCycle,
  placeFragmentToolMouseDown,
  placeFragmentToolMouseMove,
  placeFragmentToolMouseUp,
  isPlaceFragmentTool,
  shapeToolMouseDown,
  shapeToolMouseMove,
  shapeToolMouseUp,
  textToolMouseDown,
  updateActiveDragAction,
  updateCanvasHover,
} from './interaction';
import type { InteractionContext } from './interaction';
import {
  captureCanvasPointer,
  isDrawingPointer,
  isLikelyPalm,
  isMiddleButton,
  isSecondaryButton,
  isTouchPointer,
  releaseCanvasPointer,
  useMultiTouchGestures,
  usePointerCoalesce,
  useTouchLongPress,
  type CanvasPointerEvent,
} from './touch';

const EMPTY_CLICK_THRESHOLD = 5;

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
  molecule: Molecule;
  activeTool: string;
  placementElement: string;
  activeColor: string;
  activeThickness: number;
  selectedAtomIds: string[];
  selectedBondIds?: string[];

  setSelectedAtomIds?: (ids: string[]) => void;
  setSelectedBondIds?: (ids: string[]) => void;
  setSelectedCanvasTextId?: (id: string | null) => void;
  setSelectedReactionArrowId?: (id: string | null) => void;

  onAddAtom?: InteractionContext['onAddAtom'];
  onAddBond?: InteractionContext['onAddBond'];
  onUpdateBond?: InteractionContext['onUpdateBond'];
  onFlipBond?: InteractionContext['onFlipBond'];
  onAddRing?: InteractionContext['onAddRing'];
  onAddBoatRing?: InteractionContext['onAddBoatRing'];
  onAddChairRing?: InteractionContext['onAddChairRing'];
  onAddChain?: InteractionContext['onAddChain'];
  onUpdateAtomCharge?: InteractionContext['onUpdateAtomCharge'];
  onUpdateAtomLonePairs?: InteractionContext['onUpdateAtomLonePairs'];
  onUpdateAtomElement?: InteractionContext['onUpdateAtomElement'];
  onAddStroke?: InteractionContext['onAddStroke'];
  onMoveAtoms?: InteractionContext['onMoveAtoms'];
  onRotateSelectionCommit?: InteractionContext['onRotateSelectionCommit'];
  onEraseAt?: InteractionContext['onEraseAt'];
  onAddReactionArrow?: InteractionContext['onAddReactionArrow'];
  onAddCanvasText?: InteractionContext['onAddCanvasText'];
  onUpdateCanvasText?: InteractionContext['onUpdateCanvasText'];
  onUpdateReactionArrow?: InteractionContext['onUpdateReactionArrow'];
  onRequestAtomAliasEdit?: InteractionContext['onRequestAtomAliasEdit'];

  onContextMenu?: (e: React.MouseEvent | React.PointerEvent, worldPos: Point) => void;

  /** Ring-select + ring-fill: apply swatch to clicked ring without using the color menu each time. */
  ringPaintActive?: boolean;
  ringFillOpacity?: number;
  onApplyRingFill?: (ringAtomIds: string[], color: string, opacity: number) => void;

  /** Arrow geometry the reaction-arrow tool will place (toolbar cycle). */
  reactionArrowKind?: ReactionArrowKind;
  /** Shape kind for the annotation shape tool (toolbar dropdown). */
  canvasShapeKind?: CanvasShapeKind;
  onAddCanvasShape?: InteractionContext['onAddCanvasShape'];

  fragmentPlacement?: FragmentPlacementSession | null;
  onCommitFragmentPlacement?: (commit: FragmentPlacementCommit) => void;
}

export interface UseCanvasInputResult {
  // State exposed to render()
  drawingBond: DrawingBondState | null;
  drawingChain: DrawingChainState | null;
  drawingRing: DrawingRingState | null;
  drawingStroke: Point[] | null;
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

  // Pointer handlers (Pointer Events — mouse, touch, pen)
  handlePointerDown: (e: CanvasPointerEvent) => void;
  handlePointerMove: (e: CanvasPointerEvent) => void;
  handlePointerUp: (e: CanvasPointerEvent) => void;
  handlePointerCancel: (e: CanvasPointerEvent) => void;
  handlePointerLeave: (e: CanvasPointerEvent) => void;
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
  const [drawingStroke, setDrawingStroke] = useState<Point[] | null>(null);
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
  const [placementDragging, setPlacementDragging] = useState(false);
  const [placementAnchorAtomId, setPlacementAnchorAtomId] = useState<string | null>(null);

  // Reset placement / ring-hover when the active tool changes (adjust state during render).
  const [toolEpoch, setToolEpoch] = useState(activeTool);
  if (toolEpoch !== activeTool) {
    setToolEpoch(activeTool);
    if (!isPlaceFragmentTool(activeTool)) {
      setPlacementDragging(false);
      setPlacementAnchorAtomId(null);
      setHoverAtomId(null);
    }
    if (activeTool !== 'select_ring') {
      setHoverRingAtomIds(null);
      resetRingPickCycle();
    }
  }

  const [errorAtomId, setErrorAtomId] = useState<string | null>(null);
  const [mouseDownPos, setMouseDownPos] = useState<Point>({ x: 0, y: 0 });

  /** Active single-pointer drawing id (for capture / ignore extras). */
  const activePointerIdRef = useRef<number | null>(null);
  /** Skip tool commit after long-press opened the context menu. */
  const suppressNextUpRef = useRef(false);
  /**
   * After a two-finger gesture starts, ignore remaining touch contacts for
   * drawing until all fingers lift (avoids stray commits / hover).
   */
  const touchGestureLockRef = useRef(false);

  const flashAtomError = useCallback((atomId: string) => {
    setErrorAtomId(atomId);
    setTimeout(() => setErrorAtomId(null), ERROR_FLASH_MS);
  }, []);

  const clearInFlightDrawing = useCallback(() => {
    setDrawingBond(null);
    setDrawingChain(null);
    setDrawingRing(null);
    setDrawingStroke(null);
    setDrawingReactionArrow(null);
    setDrawingCanvasShape(null);
    setDragAction(null);
    setPlacementDragging(false);
    setMouseWorldPos(null);
  }, []);

  const { shouldDispatchMove, reset: resetCoalesce } = usePointerCoalesce();

  const longPress = useTouchLongPress({
    canvasRef,
    getWorldPos,
    onLongPress: (e, worldPos) => {
      suppressNextUpRef.current = true;
      clearInFlightDrawing();
      // Synthesize a context-menu open for touch (no right-click).
      opts.onContextMenu?.(e, worldPos);
    },
  });

  const multiTouch = useMultiTouchGestures({
    onPan: panByScreenDelta,
    onPinchZoom: zoomAtClientPoint,
    onGestureStart: () => {
      longPress.cancel();
      clearInFlightDrawing();
      endPan();
      activePointerIdRef.current = null;
      touchGestureLockRef.current = true;
      suppressNextUpRef.current = true;
    },
  });

  const buildContext = useCallback(
    (e: React.PointerEvent, worldPos: Point): InteractionContext => ({
      e,
      worldPos,
      mouseDownPos,
      activeTool,
      reactionArrowKind: opts.reactionArrowKind ?? 'straight',
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
      setSelectedCanvasTextId: opts.setSelectedCanvasTextId,
      setSelectedReactionArrowId: opts.setSelectedReactionArrowId,
      onAddAtom: opts.onAddAtom,
      onAddBond: opts.onAddBond,
      onUpdateBond: opts.onUpdateBond,
      onFlipBond: opts.onFlipBond,
      onAddRing: opts.onAddRing,
      onAddBoatRing: opts.onAddBoatRing,
      onAddChairRing: opts.onAddChairRing,
      onAddChain: opts.onAddChain,
      onUpdateAtomCharge: opts.onUpdateAtomCharge,
      onUpdateAtomLonePairs: opts.onUpdateAtomLonePairs,
      onUpdateAtomElement: opts.onUpdateAtomElement,
      onAddStroke: opts.onAddStroke,
      onMoveAtoms: opts.onMoveAtoms,
      onRotateSelectionCommit: opts.onRotateSelectionCommit,
      onEraseAt: opts.onEraseAt,
      onAddReactionArrow: opts.onAddReactionArrow,
      onAddCanvasShape: opts.onAddCanvasShape,
      onAddCanvasText: opts.onAddCanvasText,
      onUpdateCanvasText: opts.onUpdateCanvasText,
      onUpdateReactionArrow: opts.onUpdateReactionArrow,
      onRequestAtomAliasEdit: opts.onRequestAtomAliasEdit,
      getCanvasContext: () => canvasRef.current?.getContext('2d') ?? null,
      fragmentPlacement: opts.fragmentPlacement,
      placementDragging,
      setPlacementDragging,
      placementAnchorAtomId,
      setPlacementAnchorAtomId,
      onCommitFragmentPlacement: opts.onCommitFragmentPlacement,
    }),
    [
      mouseDownPos,
      activeTool,
      placementDragging,
      placementAnchorAtomId,
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
      if (isLikelyPalm(e)) {
        e.preventDefault();
        return;
      }

      // Always track touches for pinch/pan, even when not drawing.
      multiTouch.notePointerDown(e);

      // Second+ finger: gesture owns the canvas; don't start tools.
      if (isTouchPointer(e) && multiTouch.touchCount() >= 2) {
        e.preventDefault();
        longPress.cancel();
        clearInFlightDrawing();
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

      // Always seed `mouseDownPos` so the click-vs-drag distance check in
      // `handlePointerUp` is based on the *current* down event, not a stale one.
      setMouseDownPos({ x: e.clientX, y: e.clientY });
      suppressNextUpRef.current = false;
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

      // Touch long-press → context menu.
      longPress.notePointerDown(e);

      e.preventDefault();
      activePointerIdRef.current = e.pointerId;
      captureCanvasPointer(canvasRef.current, e);

      const worldPos = getWorldPos(e);
      const ctx = buildContext(e, worldPos);

      if (isPlaceFragmentTool(activeTool)) {
        placeFragmentToolMouseDown(ctx);
        return;
      }

      if (activeTool === 'erase') return void eraseToolMouseDown(ctx);
      if (activeTool === 'atom_label') return void atomLabelToolMouseDown(ctx);
      if (activeTool === 'reaction_arrow') return void reactionArrowToolMouseDown(ctx);
      if (activeTool === 'shape') return void shapeToolMouseDown(ctx);
      if (activeTool === 'text') return void textToolMouseDown(ctx);
      if (activeTool === 'select_ring') {
        return void selectRingToolMouseDown(ctx);
      }
      if (activeTool === 'select' || activeTool === 'lasso_select') {
        return void selectToolMouseDown(ctx);
      }
      if (activeTool === 'pencil') return void pencilToolMouseDown(ctx);
      if (
        activeTool === 'charge_plus' ||
        activeTool === 'charge_minus' ||
        activeTool === 'lone_pair'
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
      canvasRef,
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
        placementDragging;
      if (!drawingBusy && !shouldDispatchMove(e)) return;

      const worldPos = getWorldPos(e);
      const ctx = buildContext(e, worldPos);

      if (updateActiveDragAction(ctx)) return;

      if (isPlaceFragmentTool(activeTool)) {
        placeFragmentToolMouseMove(ctx);
        updateCanvasHover(ctx);
        return;
      }

      if (activeTool === 'reaction_arrow' && reactionArrowToolMouseMove(ctx)) return;
      if (activeTool === 'shape' && shapeToolMouseMove(ctx)) return;
      if (activeTool === 'chain' && chainToolMouseMove(ctx)) return;
      if (activeTool === 'pencil' && pencilToolMouseMove(ctx)) return;

      if (activeTool === 'select_ring') {
        const preview = selectRingToolUpdateHover(ctx);
        setHoverRingAtomIds(preview);
        setHoveredAtomCircleId(null);
        setHoveredBondHighlightId(null);
        return;
      }
      setHoverRingAtomIds(null);

      // Hover detection runs whenever no drag/draw consumed the move.
      // Skip soft hover for pure touch (no hover affordance on fingers).
      if (!isTouchPointer(e)) {
        updateCanvasHover(ctx);
      }

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
      drawingBond,
      drawingChain,
      drawingRing,
      drawingStroke,
      drawingReactionArrow,
      drawingCanvasShape,
      dragAction,
      placementDragging,
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
      multiTouch.notePointerUp(e);
      longPress.cancel();
      releaseCanvasPointer(canvasRef.current, e);

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
        return;
      }

      if (endPan()) return;

      const worldPos = getWorldPos(e);
      const ctx = buildContext(e, worldPos);

      if (commitDragAction(ctx)) return;

      if (isPlaceFragmentTool(activeTool) && placeFragmentToolMouseUp(ctx)) return;

      if (activeTool === 'reaction_arrow' && reactionArrowToolMouseUp(ctx)) return;
      if (activeTool === 'shape' && shapeToolMouseUp(ctx)) return;
      if (activeTool === 'chain' && chainToolMouseUp(ctx)) return;
      if (activeTool === 'pencil' && pencilToolMouseUp(ctx)) return;

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
        distance < EMPTY_CLICK_THRESHOLD &&
        e.button === 0 &&
        !isPlaceFragmentTool(activeTool)
      ) {
        const releaseAtom = pickAtomAt(molecule, worldPos);
        if (
          releaseAtom &&
          (activeTool === 'select' || activeTool === 'lasso_select') &&
          !e.shiftKey &&
          opts.onRequestAtomAliasEdit &&
          releaseAtom.alias?.trim()
        ) {
          // Click (no drag) on an existing functional-group alias → edit in place.
          opts.onRequestAtomAliasEdit(releaseAtom.id);
          return;
        }
        if (!releaseAtom) {
          opts.setSelectedAtomIds?.([]);
          opts.setSelectedBondIds?.([]);
          opts.setSelectedCanvasTextId?.(null);
          opts.setSelectedReactionArrowId?.(null);
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
      canvasRef,
    ],
  );

  const handlePointerCancel = useCallback(
    (e: CanvasPointerEvent) => {
      multiTouch.notePointerUp(e);
      longPress.cancel();
      releaseCanvasPointer(canvasRef.current, e);
      if (multiTouch.touchCount() === 0) {
        touchGestureLockRef.current = false;
      }
      if (activePointerIdRef.current === e.pointerId) {
        activePointerIdRef.current = null;
        clearInFlightDrawing();
        endPan();
      }
      suppressNextUpRef.current = false;
    },
    [multiTouch, longPress, clearInFlightDrawing, endPan, canvasRef],
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
   * Double-click in select mode:
   *  - on an atom → open the inline alias editor (ChemDraw quick-rename);
   *  - inside a ring → select all atoms of that ring.
   */
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (activeTool !== 'select' && activeTool !== 'lasso_select' && activeTool !== 'select_ring') {
        return;
      }
      const worldPos = getWorldPos(e);

      const hitAtom = pickAtomAt(molecule, worldPos);
      if (hitAtom && opts.onRequestAtomAliasEdit) {
        e.preventDefault();
        e.stopPropagation();
        setDragAction(null);
        opts.onRequestAtomAliasEdit(hitAtom.id);
        return;
      }

      const ringIds = findSmallestRingAtPoint(molecule, worldPos.x, worldPos.y);
      if (!ringIds?.length) return;
      e.preventDefault();
      e.stopPropagation();
      setDragAction(null);
      opts.setSelectedCanvasTextId?.(null);
      opts.setSelectedReactionArrowId?.(null);
      opts.setSelectedAtomIds?.(ringIds);
      opts.setSelectedBondIds?.([]);
    },
    [activeTool, molecule, getWorldPos, opts],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      // Browser contextmenu (right-click / long-press fallback). Touch long-press
      // already opens via useTouchLongPress; preventDefault still blocks the OS menu.
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
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handlePointerLeave,
    handleDoubleClick,
    handleContextMenu,
  };
};
