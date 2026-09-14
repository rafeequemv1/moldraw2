import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import type React from 'react';
import type {
  Atom,
  Bond,
  CanvasShape,
  Molecule,
  ReactionArrow,
  ReactionArrowKind,
  CanvasText,
  CanvasShapeKind,
  Stroke,
} from '@moldraw/domain';
import { isRingTool as isRingToolName, ringSidesForTool } from './interaction';
import { useCanvasInput } from './useCanvasInput';
import { useCanvasRenderer } from './useCanvasRenderer';
import { useCanvasViewport } from './useCanvasViewport';
import { CANVAS_TOUCH_CLASS } from './touch';
import type { ResolvedCanvasPreferences } from '@moldraw/core/canvasPreferences';
import type {
  FragmentPlacementCommit,
  FragmentPlacementSession,
} from '@moldraw/core/molecule/fragmentPlacement';
import { PLACE_FRAGMENT_TOOL_ID } from '@moldraw/core/molecule/fragmentPlacement';

export type { Point, Viewport } from './geometry';
import type { Point, Viewport } from './geometry';

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
  onUpdateAtomLonePairs?: (atomId: string, delta: number) => void;
  onUpdateAtomElement?: (atomId: string, element: string) => void;
  activeColor?: string;
  activeThickness?: number;
  ringPaintActive?: boolean;
  ringFillOpacity?: number;
  onApplyRingFill?: (ringAtomIds: string[], color: string, opacity: number) => void;
  onAddStroke?: (stroke: Stroke) => void;
  selectedAtomIds?: string[];
  setSelectedAtomIds?: (ids: string[]) => void;
  selectedBondIds?: string[];
  setSelectedBondIds?: (ids: string[]) => void;
  onMoveAtoms?: (atomIds: string[], dx: number, dy: number) => void;
  /** Cumulative rotation for upright labels on selected atoms (world rad). */
  selectionFragmentRotationRad?: number;
  onRotateSelectionCommit?: (atomIds: string[], cx: number, cy: number, deltaRad: number) => void;
  onContextMenu?: (
    e: React.MouseEvent | React.PointerEvent,
    worldPos: Point,
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
  selectedCanvasTextId?: string | null;
  setSelectedCanvasTextId?: (id: string | null) => void;
  onAddCanvasText?: (t: CanvasText) => void;
  onUpdateCanvasText?: (id: string, patch: Partial<CanvasText>) => void;
  /** While inline DOM editor shows this text, skip drawing its body on canvas (selection box still draws). */
  omitCanvasTextBodyId?: string | null;
  selectedReactionArrowId?: string | null;
  setSelectedReactionArrowId?: (id: string | null) => void;
  onUpdateReactionArrow?: (id: string, patch: Partial<Omit<ReactionArrow, 'id'>>) => void;
  /** Kind used for the next reaction-arrow placement; parent cycles via toolbar. */
  reactionArrowKind?: ReactionArrowKind;
  /** Shape kind for the annotation shape tool (toolbar dropdown). */
  canvasShapeKind?: CanvasShapeKind;
  /** Element symbol used when clicking empty canvas or finishing a bond in open space. */
  placementElement?: string;
  /** While inline atom-alias editor is open for this atom, skip drawing its label on canvas. */
  omitAtomAliasBodyId?: string | null;
  /** Atom label (A) tool: user clicked an atom to edit its `alias` in the parent. */
  onRequestAtomAliasEdit?: (atomId: string) => void;
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

export interface InfiniteCanvasHandle {
  getCanvas: () => HTMLCanvasElement | null;
  getViewport: () => Viewport;
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
      onAddAtom,
      onAddBond,
      onUpdateBond,
      onFlipBond,
      onAddRing,
      onAddBoatRing,
      onAddChairRing,
      onAddChain,
      onUpdateAtomCharge,
      onUpdateAtomLonePairs,
      onUpdateAtomElement,
      activeColor = '#0f172a',
      activeThickness = 4,
      ringPaintActive = false,
      ringFillOpacity = 0.22,
      onApplyRingFill,
      onAddStroke,
      selectedAtomIds = [],
      setSelectedAtomIds,
      selectedBondIds = [],
      setSelectedBondIds,
      onMoveAtoms,
      selectionFragmentRotationRad = 0,
      onRotateSelectionCommit,
      onContextMenu,
      onEraseAt,
      onAddReactionArrow,
      selectedCanvasTextId = null,
      setSelectedCanvasTextId,
      onAddCanvasText,
      onUpdateCanvasText,
      omitCanvasTextBodyId = null,
      selectedReactionArrowId = null,
      setSelectedReactionArrowId,
      onUpdateReactionArrow,
      reactionArrowKind = 'straight',
      canvasShapeKind = 'rectangle',
      onAddCanvasShape,
      placementElement = 'C',
      omitAtomAliasBodyId = null,
      onRequestAtomAliasEdit,
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
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);

    const viewportApi = useCanvasViewport({ canvasRef, displayScale, onViewportChange });

    const input = useCanvasInput({
      canvasRef,
      getWorldPos: viewportApi.getWorldPos,
      beginPan: viewportApi.beginPan,
      updatePan: viewportApi.updatePan,
      endPan: viewportApi.endPan,
      panByScreenDelta: viewportApi.panByScreenDelta,
      zoomAtClientPoint: viewportApi.zoomAtClientPoint,
      bondLengthPx: displayPrefs.bondLengthPx,
      bondAngleSnapRad: displayPrefs.bondAngleSnapRad,
      molecule,
      activeTool,
      placementElement,
      activeColor,
      activeThickness,
      ringPaintActive,
      ringFillOpacity,
      onApplyRingFill,
      selectedAtomIds,
      setSelectedAtomIds,
      selectedBondIds,
      setSelectedBondIds,
      setSelectedCanvasTextId,
      setSelectedReactionArrowId,
      onAddAtom,
      onAddBond,
      onUpdateBond,
      onFlipBond,
      onAddRing,
      onAddBoatRing,
      onAddChairRing,
      onAddChain,
      onUpdateAtomCharge,
      onUpdateAtomLonePairs,
      onUpdateAtomElement,
      onAddStroke,
      onMoveAtoms,
      onRotateSelectionCommit,
      onEraseAt,
      onAddReactionArrow,
      onAddCanvasText,
      onUpdateCanvasText,
      onUpdateReactionArrow,
      onRequestAtomAliasEdit,
      onContextMenu,
      reactionArrowKind,
      canvasShapeKind,
      onAddCanvasShape,
      fragmentPlacement,
      onCommitFragmentPlacement,
    });

    const { render } = useCanvasRenderer({
      canvasRef,
      offscreenCanvasRef,
      viewport: viewportApi.viewport,
      displayScale,
      displayPrefs,
      molecule,
      showHydrogens,
      condensedGroupLabels,
      colorAtomLabels,
      applyAtomColorsToBonds,
      activeTool,
      isRingTool: isRingToolName(activeTool),
      numSides: ringSidesForTool(activeTool),
      isBenzene: activeTool === 'benzene' || activeTool === 'cyclopentadiene',
      isBoatTool: activeTool === 'boat_cyclohexane',
      isChairTool: activeTool === 'cyclohexane',
      selectedAtomIds,
      selectedBondIds,
      selectedCanvasTextId,
      selectedReactionArrowId,
      selectionFragmentRotationRad,
      hasRotateCommit: !!onRotateSelectionCommit,
      hoveredComponentIds: input.hoveredComponentIds,
      hoveredAtomCircleId: input.hoveredAtomCircleId,
      hoveredBondHighlightId: input.hoveredBondHighlightId,
      hoverAtomId: input.hoverAtomId,
      hoverBondId: input.hoverBondId,
      hoverRingAtomIds: input.hoverRingAtomIds,
      mouseWorldPos: input.mouseWorldPos,
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
      drawingReactionArrow: input.drawingReactionArrow,
      drawingCanvasShape: input.drawingCanvasShape,
      dragAction: input.dragAction,
      fragmentPlacement,
      cipAtomLabels,
      cipBondLabels,
      showCipLabels,
    });

    useImperativeHandle(ref, () => ({
      getCanvas: () => canvasRef.current,
      getViewport: () => viewportApi.viewport,
    }));

    // Auto-size the canvas backing buffer to its parent. Synchronously redraws
    // so the new buffer doesn't flash empty between resize and the next effect.
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const resizeCanvas = () => {
        const parent = canvas.parentElement;
        canvas.width = parent?.clientWidth ?? window.innerWidth;
        canvas.height = parent?.clientHeight ?? window.innerHeight;
        render();
      };
      window.addEventListener('resize', resizeCanvas);
      let ro: ResizeObserver | null = null;
      if (typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(() => resizeCanvas());
        if (canvas.parentElement) ro.observe(canvas.parentElement);
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

    return (
      <div style={{ position: 'relative', overflow: 'hidden', width: '100%', height: '100%', flex: '1 1 auto' }}>
        <canvas
          ref={canvasRef}
          className={CANVAS_TOUCH_CLASS}
          onPointerDown={input.handlePointerDown}
          onPointerMove={input.handlePointerMove}
          onPointerUp={input.handlePointerUp}
          onPointerCancel={input.handlePointerCancel}
          onPointerLeave={input.handlePointerLeave}
          onDoubleClick={input.handleDoubleClick}
          onWheel={viewportApi.onWheel}
          onContextMenu={input.handleContextMenu}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            cursor: viewportApi.isPanning
              ? 'grabbing'
              : activeTool === PLACE_FRAGMENT_TOOL_ID
                ? 'copy'
                : activeTool === 'select' || activeTool === 'lasso_select'
                  ? 'pointer'
                  : activeTool === 'erase'
                    ? 'cell'
                    : 'crosshair',
          }}
        />
      </div>
    );
  },
);
