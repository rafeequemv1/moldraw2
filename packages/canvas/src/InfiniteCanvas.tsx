import { useRef, useEffect, forwardRef, useImperativeHandle, useMemo, useState, useCallback } from 'react';
import type React from 'react';
import type {
  Atom,
  Bond,
  CanvasImage,
  CanvasShape,
  Molecule,
  ReactionArrow,
  ReactionArrowKind,
  ReactionArrowUpdatePatch,
  CanvasText,
  CanvasShapeKind,
  Stroke,
} from '@moldraw/domain';
import {
  createSmartDrawSession,
  isRingTool as isRingToolName,
  isSmartDrawTool,
  ringSidesForTool,
  type SmartDrawSessionResult,
  type SmartDrawStroke,
} from './interaction';
import type { InteractionContext } from './interaction';
import { useCanvasInput } from './useCanvasInput';
import { useCanvasRenderer } from './useCanvasRenderer';
import { useCanvasViewport } from './useCanvasViewport';
import { CANVAS_TOUCH_CLASS } from './touch';
import type { ResolvedCanvasPreferences } from '@moldraw/core';
import type {
  FragmentPlacementCommit,
  FragmentPlacementSession,
} from '@moldraw/core';
import { materializeInstanceArraysForDisplay, PLACE_FRAGMENT_TOOL_ID } from '@moldraw/core';
import type { StructureThemeColors } from './render/types';

export type { Point, Viewport } from './geometry';
import { shortestAngleDiff, type Point, type Viewport } from './geometry';

export interface InfiniteCanvasProps {
  onViewportChange?: (viewport: Viewport) => void;
  activeTool?: string;
  molecule?: Molecule;
  showHydrogens?: boolean;
  /** Teaching-style CH₃ / NH₂ labels on terminal groups (see Settings → General). */
  condensedGroupLabels?: boolean;
  /** Heteroatom labels use element colors when true (Settings → General). */
  colorAtomLabels?: boolean;
  /** Bond strokes follow endpoint label colors (Settings → General). */
  applyAtomColorsToBonds?: boolean;
  /** Theme structure ink + grid (Settings → Appearance). */
  structureTheme?: StructureThemeColors;
  /** 2D structure look (Default skeletal, or Simple ball-and-stick). */
  structureDrawMode?: 'skeletal' | 'ball-stick';
  onAddAtom?: (atom: Atom) => void;
  onAddBond?: (bond: Bond) => void;
  onUpdateBond?: (
    bondId: string,
    patch: Partial<Pick<Bond, 'order' | 'stereo' | 'orderCycleRamp'>>,
  ) => void;
  /** Swap a bond's endpoints (wedge/dash narrow→wide flip on re-tap). */
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
  onSetAtomCharge?: (atomId: string, charge: number, markStyle?: 'plain' | 'circled') => void;
  onSetAtomDeltaCharge?: (atomId: string, deltaCharge: number) => void;
  onSetAtomChargeOffset?: (atomId: string, offset: { x: number; y: number } | null) => void;
  onSetAtomDeltaChargeOffset?: (atomId: string, offset: { x: number; y: number } | null) => void;
  onUpdateAtomLonePairs?: (atomId: string, delta: number) => void;
  onSetAtomRadical?: (atomId: string, radical: number) => void;
  onSetAtomRadicalIon?: (atomId: string, charge: number, radical: number) => void;
  onAddExplicitHydrogen?: (atomId: string) => boolean;
  onUpdateAtomElement?: (atomId: string, element: string) => void;
  activeColor?: string;
  activeThickness?: number;
  ringPaintActive?: boolean;
  ringFillOpacity?: number;
  onApplyRingFill?: (ringAtomIds: string[], color: string, opacity: number) => void;
  onAddStroke?: (stroke: Stroke) => void;
  /** Host-owned Smart Draw session ended (idle / Enter / pointer cancel). */
  onSmartDrawSessionComplete?: (result: SmartDrawSessionResult) => void;
  onTranslateStroke?: (id: string, dx: number, dy: number) => void;
  selectedAtomIds?: string[];
  setSelectedAtomIds?: (ids: string[]) => void;
  selectedChargeAtomIds?: string[];
  setSelectedChargeAtomIds?: (ids: string[]) => void;
  selectedChargeMarkKind?: 'formal' | 'delta' | null;
  setSelectedChargeMarkKind?: (kind: 'formal' | 'delta' | null) => void;
  selectedBondIds?: string[];
  setSelectedBondIds?: (ids: string[]) => void;
  onMoveAtoms?: (atomIds: string[], dx: number, dy: number) => void;
  /** Cumulative rotation for upright labels on selected atoms (world rad). */
  selectionFragmentRotationRad?: number;
  onRotateSelectionCommit?: (atomIds: string[], cx: number, cy: number, deltaRad: number) => void;
  onScaleSelectionCommit?: (atomIds: string[], cx: number, cy: number, factor: number) => void;
  /** ChemDraw Structure Perspective: commit pose orbit on pointer-up. */
  onRotate3DPoseCommit?: (dAngleX: number, dAngleY: number) => void;
  /** Live canvas 3D pose → right viewer during drag. */
  onPerspectivePosePreview?: (molblock: string) => void;
  onContextMenu?: (
    e: React.MouseEvent | React.PointerEvent,
    worldPos: Point,
  ) => void;
  /**
   * Touch: one finger on empty canvas with the select tool pans instead of
   * marquee-selecting. Default `false` (two fingers / hand tool pan).
   */
  touchPanOnEmptyCanvas?: boolean;
  /**
   * Touch: show a magnifier above the fingertip while dragging a bond / ring /
   * chain or resting on an atom / bond. Default `true`.
   */
  touchLoupe?: boolean;
  /**
   * Debug HUD (top-left of the canvas) with the last pointer's type, pressure,
   * tilt, buttons and the multi-touch gesture state. Default `false`.
   */
  pointerDebugHud?: boolean;
  /** Touch: two-finger tap. */
  onUndoGesture?: () => void;
  /** Touch: three-finger tap. */
  onRedoGesture?: () => void;
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
  onAddCanvasOrbital?: (orbital: import('@moldraw/domain').CanvasOrbital) => void;
  onUpdateCanvasOrbital?: (
    id: string,
    patch: Partial<Omit<import('@moldraw/domain').CanvasOrbital, 'id' | 'atomId'>> & {
      atomId?: string | null;
    },
  ) => void;
  selectedCanvasOrbitalIds?: string[];
  setSelectedCanvasOrbitalIds?: (ids: string[]) => void;
  /** Latest atom under the pointer (type-to-label without selecting first). */
  onHoverAtomIdChange?: (atomId: string | null) => void;
  selectedCanvasTextId?: string | null;
  setSelectedCanvasTextId?: (id: string | null) => void;
  setColorEditCanvasShapeId?: (id: string | null) => void;
  setColorEditStrokeId?: (id: string | null) => void;
  selectedCanvasShapeId?: string | null;
  selectedStrokeId?: string | null;
  onUpdateCanvasShape?: (id: string, patch: Partial<Omit<CanvasShape, 'id'>>) => void;
  onTranslateCanvasShapes?: (ids: string[], dx: number, dy: number) => void;
  onAddCanvasText?: (t: CanvasText) => void;
  onUpdateCanvasText?: (id: string, patch: Partial<CanvasText>) => void;
  /** Host should hide the HTML text overlay while true (smooth canvas drag preview). */
  onCanvasTextTransforming?: (active: boolean) => void;
  selectedCanvasImageId?: string | null;
  setSelectedCanvasImageId?: (id: string | null) => void;
  onUpdateCanvasImage?: (
    id: string,
    patch: Partial<Omit<CanvasImage, 'id' | 'dataUrl' | 'mimeType'>>,
  ) => void;
  /** While inline DOM editor shows this text, skip drawing its body on canvas (selection box still draws). */
  omitCanvasTextBodyId?: string | null;
  selectedReactionArrowId?: string | null;
  selectedReactionArrowIds?: string[];
  setSelectedReactionArrowId?: (id: string | null) => void;
  selectedStrokeIds?: string[];
  selectedCanvasTextIds?: string[];
  selectedCanvasShapeIds?: string[];
  selectedCanvasImageIds?: string[];
  onSetMarqueeSelection?: InteractionContext['onSetMarqueeSelection'];
  onTranslateMarqueeSelection?: InteractionContext['onTranslateMarqueeSelection'];
  selectedSruBracketId?: string | null;
  setSelectedSruBracketId?: (id: string | null) => void;
  /** Prompt / edit polymer SRU subscript (e.g. after clicking the label). */
  onEditSruBracketSubscript?: (id: string) => void;
  onUpdateReactionArrow?: (id: string, patch: ReactionArrowUpdatePatch) => void;
  /** Kind used for the next reaction-arrow placement; parent cycles via toolbar. */
  reactionArrowKind?: ReactionArrowKind;
  /** Shape kind for the annotation shape tool (toolbar dropdown). */
  canvasShapeKind?: CanvasShapeKind;
  /** Wrap ≥2 atoms in polymer SRU brackets (Polymer toolbar tool). */
  onAddSruBracketAroundAtoms?: (atomIds: string[]) => void;
  /** Element symbol used when clicking empty canvas or finishing a bond in open space. */
  placementElement?: string;
  /** While inline atom-alias editor is open for this atom, skip drawing its label on canvas. */
  omitAtomAliasBodyId?: string | null;
  /** Atom label (A) tool: user clicked an atom to edit its `alias` in the parent. */
  onRequestAtomAliasEdit?: (atomId: string) => void;
  /** Open inline editor for reagent text above/below the selected arrow. */
  onRequestArrowReagentEdit?: (arrowId: string, slot: 'above' | 'below') => void;
  /** Visual scale factor for split workspace rendering. */
  displayScale?: number;
  /** Resolved typography + bond metrics (from app settings). */
  displayPrefs: ResolvedCanvasPreferences;
  /** Fragment awaiting click/drag on canvas (functional group or template). */
  fragmentPlacement?: FragmentPlacementSession | null;
  onCommitFragmentPlacement?: (commit: FragmentPlacementCommit) => void;
  /** Indigo CIP labels (R/S on atoms, E/Z on bonds). */
  cipAtomLabels?: ReadonlyMap<string, string> | null;
  cipBondLabels?: ReadonlyMap<string, string> | null;
  showCipLabels?: boolean;
}

/** Live selection transform while the user drags (store coords not yet committed). */
export type SelectionDragPreview =
  | { kind: 'move'; dx: number; dy: number }
  | { kind: 'rotate'; cx: number; cy: number; deltaRad: number }
  | { kind: 'scale'; cx: number; cy: number; factor: number };

export interface InfiniteCanvasHandle {
  getCanvas: () => HTMLCanvasElement | null;
  getViewport: () => Viewport;
  /** In-flight move/rotate preview for floating selection chrome. */
  getSelectionDragPreview: () => SelectionDragPreview | null;
  /** Zoom by a multiplicative scale around a client-space focal point. */
  zoomAtClientPoint: (scale: number, clientX: number, clientY: number) => void;
  /** Reset pan/zoom to the default 100% view. */
  resetViewport: () => void;
  /** Fit a world AABB into view (AI import / focus). */
  fitWorldRect: (
    rect: { minX: number; maxX: number; minY: number; maxY: number },
    paddingPx?: number,
  ) => void;
  /** End the Smart Draw session and emit the stroke group (Enter). */
  commitSmartDrawSession: () => void;
  /** Drop buffered Smart Draw strokes without recognizing (Escape). */
  discardSmartDrawSession: () => void;
}

/**
 * Infinite, pan/zoom-able canvas used as the molecular drawing surface.
 *
 * The component is intentionally small — it owns the `<canvas>` ref and
 * parent-prop wiring only. Behavior is split across three collaborators:
 *
 *   - `useCanvasViewport`  — viewport state (pan/zoom) + screen↔world transform.
 *   - `useCanvasInput`     — Pointer Events (mouse/touch/pen) + per-tool dispatch.
 *   - `useCanvasRenderer`  — draw pipeline + redraw effect.
 *   - `./touch/`           — pinch-pan, palm rejection, long-press menu.
 *
 * Per-tool input logic lives in `./interaction/`; per-layer rendering lives
 * in `./render/`. This file should never grow tool- or layer-specific
 * branches again — the hooks compose them.
 */
export const InfiniteCanvas = forwardRef<InfiniteCanvasHandle, InfiniteCanvasProps>(
  function InfiniteCanvas(
    {
      onViewportChange,
      activeTool = 'select',
      molecule = { atoms: [], bonds: [] },
      showHydrogens = false,
      condensedGroupLabels = false,
      colorAtomLabels = false,
      applyAtomColorsToBonds = false,
      structureTheme,
      structureDrawMode = 'skeletal',
      onAddAtom,
      onAddBond,
      onUpdateBond,
      onFlipBond,
      onAddRing,
      onAddBoatRing,
      onAddChairRing,
      onAddChain,
      onUpdateAtomCharge,
      onSetAtomCharge,
      onSetAtomDeltaCharge,
      onSetAtomChargeOffset,
      onSetAtomDeltaChargeOffset,
      onUpdateAtomLonePairs,
      onSetAtomRadical,
      onSetAtomRadicalIon,
      onAddExplicitHydrogen,
      onUpdateAtomElement,
      activeColor = '#0f172a',
      activeThickness = 4,
      ringPaintActive = false,
      ringFillOpacity = 0.22,
      onApplyRingFill,
      onAddStroke,
      onSmartDrawSessionComplete,
      onTranslateStroke,
      selectedAtomIds = [],
      setSelectedAtomIds,
      selectedChargeAtomIds = [],
      setSelectedChargeAtomIds,
      selectedChargeMarkKind = null,
      setSelectedChargeMarkKind,
      selectedBondIds = [],
      setSelectedBondIds,
      onMoveAtoms,
      selectionFragmentRotationRad = 0,
      onRotateSelectionCommit,
      onScaleSelectionCommit,
      onRotate3DPoseCommit,
      onPerspectivePosePreview,
      onContextMenu,
      touchPanOnEmptyCanvas,
      touchLoupe,
      pointerDebugHud,
      onUndoGesture,
      onRedoGesture,
      onEraseAt,
      onAddReactionArrow,
      selectedCanvasTextId = null,
      setSelectedCanvasTextId,
      setColorEditCanvasShapeId,
      setColorEditStrokeId,
      selectedCanvasShapeId = null,
      selectedStrokeId = null,
      onUpdateCanvasShape,
      onTranslateCanvasShapes,
      onAddCanvasText,
      onUpdateCanvasText,
      onCanvasTextTransforming,
      omitCanvasTextBodyId = null,
      selectedReactionArrowId = null,
      selectedReactionArrowIds = [],
      setSelectedReactionArrowId,
      selectedStrokeIds = [],
      selectedCanvasTextIds = [],
      selectedCanvasShapeIds = [],
      selectedCanvasImageIds = [],
      onSetMarqueeSelection,
      onTranslateMarqueeSelection,
      onUpdateReactionArrow,
      selectedCanvasImageId = null,
      setSelectedCanvasImageId,
      onUpdateCanvasImage,
      selectedSruBracketId = null,
      setSelectedSruBracketId,
      onEditSruBracketSubscript,
      reactionArrowKind = 'straight',
      canvasShapeKind = 'rectangle',
      onAddCanvasShape,
      onAddCanvasOrbital,
      onUpdateCanvasOrbital,
      selectedCanvasOrbitalIds = [],
      setSelectedCanvasOrbitalIds,
      onHoverAtomIdChange,
      onAddSruBracketAroundAtoms,
      placementElement = 'C',
      omitAtomAliasBodyId = null,
      onRequestAtomAliasEdit,
      onRequestArrowReagentEdit,
      displayScale = 1,
      displayPrefs,
      fragmentPlacement = null,
      onCommitFragmentPlacement,
      cipAtomLabels = null,
      cipBondLabels = null,
      showCipLabels = false,
    },
    ref,
  ) {
    const structureCanvasRef = useRef<HTMLCanvasElement>(null);
    const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
    const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);

    /** Expand InstanceArrays for draw/hit; keep array metadata for parent highlight. */
    const displayMolecule = useMemo(
      () => materializeInstanceArraysForDisplay(molecule),
      [molecule],
    );

    const viewportApi = useCanvasViewport({ canvasRef: overlayCanvasRef, displayScale, onViewportChange });

    const [smartDrawSessionStrokes, setSmartDrawSessionStrokes] = useState<SmartDrawStroke[]>([]);
    const onSmartDrawCompleteRef = useRef(onSmartDrawSessionComplete);
    onSmartDrawCompleteRef.current = onSmartDrawSessionComplete;
    const bondLengthRef = useRef(displayPrefs.bondLengthPx);
    bondLengthRef.current = displayPrefs.bondLengthPx;

    const smartDrawSessionRef = useRef<ReturnType<typeof createSmartDrawSession> | null>(null);
    if (smartDrawSessionRef.current == null) {
      smartDrawSessionRef.current = createSmartDrawSession({
        getBondLengthPx: () => bondLengthRef.current,
        onComplete: result => onSmartDrawCompleteRef.current?.(result),
        onStrokesChange: setSmartDrawSessionStrokes,
      });
    }

    useEffect(() => {
      return () => {
        smartDrawSessionRef.current?.dispose();
        smartDrawSessionRef.current = null;
      };
    }, []);

    useEffect(() => {
      if (!isSmartDrawTool(activeTool)) {
        smartDrawSessionRef.current?.commit();
      }
    }, [activeTool]);

    const handleSmartDrawStroke = useCallback((points: { x: number; y: number }[]) => {
      smartDrawSessionRef.current?.addStroke(points);
    }, []);

    const handleSmartDrawPointerCancel = useCallback(() => {
      smartDrawSessionRef.current?.commit();
    }, []);

    const input = useCanvasInput({
      canvasRef: overlayCanvasRef,
      getWorldPos: viewportApi.getWorldPos,
      beginPan: viewportApi.beginPan,
      updatePan: viewportApi.updatePan,
      endPan: viewportApi.endPan,
      panByScreenDelta: viewportApi.panByScreenDelta,
      zoomAtClientPoint: viewportApi.zoomAtClientPoint,
      bondLengthPx: displayPrefs.bondLengthPx,
      bondAngleSnapRad: displayPrefs.bondAngleSnapRad,
      snapToGrid: displayPrefs.snapToGrid,
      gridSizePx: displayPrefs.gridSizePx,
      molecule: displayMolecule,
      activeTool,
      placementElement,
      activeColor,
      activeThickness,
      ringPaintActive,
      ringFillOpacity,
      onApplyRingFill,
      selectedAtomIds,
      setSelectedAtomIds,
      selectedChargeAtomIds,
      setSelectedChargeAtomIds,
      selectedChargeMarkKind,
      setSelectedChargeMarkKind,
      selectedBondIds,
      setSelectedBondIds,
      setSelectedCanvasTextId,
      setColorEditCanvasShapeId,
      setColorEditStrokeId,
      selectedCanvasShapeId,
      setSelectedReactionArrowId,
      selectedReactionArrowId,
      selectedReactionArrowIds,
      selectedStrokeIds,
      selectedCanvasTextIds,
      selectedCanvasShapeIds,
      selectedCanvasImageIds,
      onSetMarqueeSelection,
      onTranslateMarqueeSelection,
      setSelectedCanvasImageId,
      setSelectedSruBracketId,
      selectedCanvasImageId,
      selectedCanvasTextId,
      selectedSruBracketId,
      onEditSruBracketSubscript,
      onAddAtom,
      onAddBond,
      onUpdateBond,
      onFlipBond,
      onAddRing,
      onAddBoatRing,
      onAddChairRing,
      onAddChain,
      onUpdateAtomCharge,
      onSetAtomCharge,
      onSetAtomDeltaCharge,
      onSetAtomChargeOffset,
      onSetAtomDeltaChargeOffset,
      onUpdateAtomLonePairs,
      onSetAtomRadical,
      onSetAtomRadicalIon,
      onAddExplicitHydrogen,
      onUpdateAtomElement,
      onAddStroke,
      onSmartDrawStroke: handleSmartDrawStroke,
      onSmartDrawPointerCancel: handleSmartDrawPointerCancel,
      onTranslateStroke,
      onMoveAtoms,
      onRotateSelectionCommit,
      onScaleSelectionCommit,
      onRotate3DPoseCommit,
      onPerspectivePosePreview,
      onEraseAt,
      onAddReactionArrow,
      onAddCanvasText,
      onUpdateCanvasText,
      onCanvasTextTransforming,
      onUpdateCanvasImage,
      onUpdateCanvasShape,
      onTranslateCanvasShapes,
      onUpdateReactionArrow,
      onRequestAtomAliasEdit,
      onRequestArrowReagentEdit,
      onContextMenu,
      reactionArrowKind,
      canvasShapeKind,
      onAddCanvasShape,
      onAddCanvasOrbital,
      onUpdateCanvasOrbital,
      selectedCanvasOrbitalIds,
      setSelectedCanvasOrbitalIds,
      onAddSruBracketAroundAtoms,
      fragmentPlacement,
      onCommitFragmentPlacement,
      viewportZoom: viewportApi.viewport.zoom,
      touchPanOnEmptyCanvas,
      pointerDebugHud,
      onUndoGesture,
      onRedoGesture,
    });

    useEffect(() => {
      onHoverAtomIdChange?.(input.hoverAtomId);
    }, [input.hoverAtomId, onHoverAtomIdChange]);

    const { render } = useCanvasRenderer({
      structureCanvasRef,
      overlayCanvasRef,
      offscreenCanvasRef,
      viewport: viewportApi.viewport,
      displayScale,
      displayPrefs,
      molecule: displayMolecule,
      showHydrogens,
      condensedGroupLabels,
      colorAtomLabels,
      applyAtomColorsToBonds,
      structureTheme,
      structureDrawMode,
      activeTool,
      isRingTool: isRingToolName(activeTool),
      numSides: ringSidesForTool(activeTool),
      isBenzene: activeTool === 'benzene' || activeTool === 'cyclopentadiene',
      isBoatTool: activeTool === 'boat_cyclohexane',
      isChairTool: activeTool === 'cyclohexane',
      selectedAtomIds,
      selectedChargeAtomIds,
      selectedBondIds,
      selectedCanvasTextId,
      selectedReactionArrowId,
      selectedReactionArrowIds,
      selectedCanvasImageId,
      selectedCanvasImageIds,
      selectedCanvasShapeId,
      selectedCanvasShapeIds,
      selectedCanvasOrbitalIds,
      selectedStrokeId,
      selectedStrokeIds,
      selectedCanvasTextIds,
      selectedSruBracketId,
      selectionFragmentRotationRad,
      hasRotateCommit: !!onRotateSelectionCommit,
      hasScaleCommit: !!onScaleSelectionCommit,
      hoveredComponentIds: input.hoveredComponentIds,
      hoveredAtomCircleId: input.hoveredAtomCircleId,
      hoveredBondHighlightId: input.hoveredBondHighlightId,
      hoverAtomId: input.hoverAtomId,
      hoverBondId: input.hoverBondId,
      hoverRingAtomIds: input.hoverRingAtomIds,
      mouseWorldPos: input.mouseWorldPos,
      touchPointerWorldPos: input.touchPointerWorldPos,
      touchLoupe,
      pointerDebugHud: pointerDebugHud ? input.pointerDebugInfo : null,
      errorAtomId: input.errorAtomId,
      omitAtomAliasBodyId,
      omitCanvasTextBodyId,
      activeColor,
      activeThickness,
      placementElement,
      drawingBond: input.drawingBond,
      drawingChain: input.drawingChain,
      drawingRing: input.drawingRing,
      drawingStroke: input.drawingStroke,
      smartDrawSessionStrokes,
      drawingReactionArrow: input.drawingReactionArrow,
      drawingCanvasShape: input.drawingCanvasShape,
      dragAction: input.dragAction,
      fragmentPlacement,
      cipAtomLabels,
      cipBondLabels,
      showCipLabels,
    });

    useImperativeHandle(
      ref,
      () => ({
        /** DOM canvas used for layout / pointer hit size (overlay layer). */
        getCanvas: () => overlayCanvasRef.current,
        getViewport: () => viewportApi.viewport,
        getSelectionDragPreview: () => {
          const drag = input.dragAction;
          if (!drag) return null;
          if (drag.type === 'move_selection' || drag.type === 'move_canvas_shape') {
            return {
              kind: 'move' as const,
              dx: drag.currentX - drag.startX,
              dy: drag.currentY - drag.startY,
            };
          }
          if (drag.type === 'rotate_selection') {
            return {
              kind: 'rotate' as const,
              cx: drag.cx,
              cy: drag.cy,
              deltaRad: shortestAngleDiff(drag.startPointerAngle, drag.currentPointerAngle),
            };
          }
          if (drag.type === 'scale_selection') {
            return {
              kind: 'scale' as const,
              cx: drag.cx,
              cy: drag.cy,
              factor: drag.currentFactor,
            };
          }
          return null;
        },
        zoomAtClientPoint: viewportApi.zoomAtClientPoint,
        resetViewport: viewportApi.resetViewport,
        fitWorldRect: viewportApi.fitWorldRect,
        commitSmartDrawSession: () => smartDrawSessionRef.current?.commit(),
        discardSmartDrawSession: () => smartDrawSessionRef.current?.discard(),
      }),
      [
        viewportApi.viewport,
        viewportApi.zoomAtClientPoint,
        viewportApi.resetViewport,
        viewportApi.fitWorldRect,
        input.dragAction,
      ],
    );

    // Auto-size both canvas layers to the parent. Synchronously redraws so the
    // new buffers don't flash empty between resize and the next effect.
    useEffect(() => {
      const structure = structureCanvasRef.current;
      const overlay = overlayCanvasRef.current;
      if (!structure || !overlay) return;
      const resizeCanvas = () => {
        const parent = overlay.parentElement;
        const w = parent?.clientWidth ?? window.innerWidth;
        const h = parent?.clientHeight ?? window.innerHeight;
        structure.width = w;
        structure.height = h;
        overlay.width = w;
        overlay.height = h;
        render();
      };
      window.addEventListener('resize', resizeCanvas);
      let ro: ResizeObserver | null = null;
      if (typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(() => resizeCanvas());
        if (overlay.parentElement) ro.observe(overlay.parentElement);
      }
      resizeCanvas();
      if (!offscreenCanvasRef.current) {
        offscreenCanvasRef.current = document.createElement('canvas');
      }
      return () => {
        window.removeEventListener('resize', resizeCanvas);
        ro?.disconnect();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const cursor = viewportApi.isPanning
      ? 'grabbing'
      : activeTool === 'hand'
        ? 'grab'
        : activeTool === 'perspective'
          ? 'grab'
          : activeTool === PLACE_FRAGMENT_TOOL_ID
            ? 'copy'
            : activeTool === 'select' || activeTool === 'lasso_select'
              ? 'pointer'
              : activeTool === 'erase'
                ? 'cell'
                : 'crosshair';

    return (
      <div style={{ position: 'relative', overflow: 'hidden', width: '100%', height: '100%', flex: '1 1 auto' }}>
        <canvas
          ref={structureCanvasRef}
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            display: 'block',
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
          }}
        />
        <canvas
          ref={overlayCanvasRef}
          className={CANVAS_TOUCH_CLASS}
          onPointerDown={input.handlePointerDown}
          onPointerMove={input.handlePointerMove}
          onPointerUp={input.handlePointerUp}
          onPointerCancel={input.handlePointerCancel}
          onPointerLeave={input.handlePointerLeave}
          onLostPointerCapture={input.handleLostPointerCapture}
          onDoubleClick={input.handleDoubleClick}
          onWheel={viewportApi.onWheel}
          onContextMenu={input.handleContextMenu}
          style={{
            position: 'absolute',
            inset: 0,
            display: 'block',
            width: '100%',
            height: '100%',
            cursor,
          }}
        />
      </div>
    );
  },
);
