/**
 * Compact on-canvas chips: Reflect / Duplicate / Delete for molecules and
 * annotations (glassware, shapes, text, arrows, images).
 * Tracks live drag/rotate previews; clamped inside the 2D pane.
 */
import { useEffect, useRef, type RefObject } from 'react';
import { CopyPlus, Trash2 } from 'lucide-react';
import type { Molecule } from '@moldraw/domain';
import { siblingShapeIdsInCollection } from '@moldraw/core';
import type { InfiniteCanvasHandle, SelectionDragPreview } from '@moldraw/canvas';
import {
  ROTATE_HANDLE_R,
  atomIdsForSelectionTransform,
  getMarqueeSelectionTransformLayout,
  getSelectionAabb,
  getSelectionTransformLayout,
  getShapesWorldAabb,
  type MarqueeSelectionBoundsInput,
  type Viewport,
} from '@moldraw/canvas/geometry';

export type SelectionReflectAxis = 'horizontal' | 'vertical';

const EMPTY_BOND_IDS: string[] = [];
const EDGE_PAD = 8;

export type SelectionActionTarget =
  | { kind: 'atoms' }
  | { kind: 'shape'; id: string }
  | { kind: 'text'; id: string }
  | { kind: 'arrow'; id: string }
  | { kind: 'image'; id: string }
  | { kind: 'stroke'; id: string };

export interface SelectionActionToolbarProps {
  visible: boolean;
  molecule: Molecule;
  selectionAtomIds: string[];
  selectedBondIds?: string[];
  /** When set, toolbar anchors to this annotation instead of atoms. */
  annotationTarget?: SelectionActionTarget | null;
  /** Full multi-object box (same as the dashed rectangle). */
  marqueeSelection?: MarqueeSelectionBoundsInput;
  viewport: Viewport;
  canvasRef: RefObject<InfiniteCanvasHandle | null>;
  onReflect: (axis: SelectionReflectAxis) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

function ReflectHorizontalIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 18 18" aria-hidden fill="none">
      <path
        d="M7 3.5H4.2a1.2 1.2 0 0 0-1.2 1.2v8.6A1.2 1.2 0 0 0 4.2 14.5H7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 2.25v13.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeDasharray="1.7 1.5"
      />
      <path
        d="M11 3.5h2.8a1.2 1.2 0 0 1 1.2 1.2v8.6a1.2 1.2 0 0 1-1.2 1.2H11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ReflectVerticalIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 18 18" aria-hidden fill="none">
      <path
        d="M3.5 7V4.2A1.2 1.2 0 0 1 4.7 3h8.6a1.2 1.2 0 0 1 1.2 1.2V7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.25 9h13.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeDasharray="1.7 1.5"
      />
      <path
        d="M3.5 11v2.8A1.2 1.2 0 0 0 4.7 15h8.6a1.2 1.2 0 0 0 1.2-1.2V11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function applyPreview(
  x: number,
  y: number,
  preview: SelectionDragPreview | null,
): { x: number; y: number } {
  if (!preview) return { x, y };
  if (preview.kind === 'move') {
    return { x: x + preview.dx, y: y + preview.dy };
  }
  if (preview.kind === 'scale') {
    return {
      x: preview.cx + (x - preview.cx) * preview.factor,
      y: preview.cy + (y - preview.cy) * preview.factor,
    };
  }
  const c = Math.cos(preview.deltaRad);
  const s = Math.sin(preview.deltaRad);
  const dx = x - preview.cx;
  const dy = y - preview.cy;
  return {
    x: preview.cx + c * dx - s * dy,
    y: preview.cy + s * dx + c * dy,
  };
}

function worldToOverlay(
  worldX: number,
  worldY: number,
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  vp: Viewport,
): { left: number; top: number } {
  const crect = canvas.getBoundingClientRect();
  const hrect = host.getBoundingClientRect();
  const scaleX = crect.width / Math.max(1, canvas.width);
  const scaleY = crect.height / Math.max(1, canvas.height);
  const sx = (worldX * vp.zoom + canvas.width / 2 + vp.x) * scaleX;
  const sy = (worldY * vp.zoom + canvas.height / 2 + vp.y) * scaleY;
  return {
    left: crect.left - hrect.left + sx,
    top: crect.top - hrect.top + sy,
  };
}

function clampBarAnchor(
  anchorLeft: number,
  anchorTop: number,
  barW: number,
  barH: number,
  hostW: number,
  hostH: number,
): { left: number; top: number } {
  let barLeft = anchorLeft - barW / 2;
  let barTop = anchorTop - barH;
  const maxLeft = Math.max(EDGE_PAD, hostW - barW - EDGE_PAD);
  const maxTop = Math.max(EDGE_PAD, hostH - barH - EDGE_PAD);
  barLeft = Math.min(Math.max(barLeft, EDGE_PAD), maxLeft);
  barTop = Math.min(Math.max(barTop, EDGE_PAD), maxTop);
  return { left: barLeft + barW / 2, top: barTop + barH };
}

function annotationAnchor(
  mol: Molecule,
  target: SelectionActionTarget,
): { x: number; y: number } | null {
  if (target.kind === 'atoms') return null;
  if (target.kind === 'shape') {
    const groupIds = siblingShapeIdsInCollection(mol, target.id);
    const groupShapes = (mol.canvasShapes ?? []).filter(s => groupIds.includes(s.id));
    if (groupShapes.length > 1) {
      // COF / shape group: pin chips above the whole framework, not one member.
      const aabb = getShapesWorldAabb(groupShapes);
      if (!aabb) return null;
      return { x: aabb.cx, y: aabb.y1 - 18 };
    }
    const s = groupShapes[0] ?? mol.canvasShapes?.find(x => x.id === target.id);
    if (!s) return null;
    return {
      x: (s.x1 + s.x2) / 2,
      y: Math.min(s.y1, s.y2) - 12,
    };
  }
  if (target.kind === 'text') {
    const t = mol.canvasTexts?.find(x => x.id === target.id);
    if (!t) return null;
    return { x: t.x, y: t.y - 16 };
  }
  if (target.kind === 'arrow') {
    const a = mol.reactionArrows?.find(x => x.id === target.id);
    if (!a) return null;
    return { x: (a.x1 + a.x2) / 2, y: Math.min(a.y1, a.y2) - 12 };
  }
  if (target.kind === 'image') {
    const img = mol.canvasImages?.find(x => x.id === target.id);
    if (!img) return null;
    return { x: img.x + img.width / 2, y: img.y - 12 };
  }
  if (target.kind === 'stroke') {
    const st = mol.strokes?.find(x => x.id === target.id);
    if (!st || st.points.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    for (const p of st.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
    }
    return { x: (minX + maxX) / 2, y: minY - 12 };
  }
  return null;
}

export function SelectionActionToolbar({
  visible,
  molecule,
  selectionAtomIds,
  selectedBondIds,
  annotationTarget = null,
  marqueeSelection,
  viewport,
  canvasRef,
  onReflect,
  onDuplicate,
  onDelete,
}: SelectionActionToolbarProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const bondIds = selectedBondIds ?? EMPTY_BOND_IDS;
  const moleculeRef = useRef(molecule);
  const selectionRef = useRef(selectionAtomIds);
  const bondRef = useRef(bondIds);
  const viewportRef = useRef(viewport);
  const annotationRef = useRef(annotationTarget);
  const marqueeRef = useRef(marqueeSelection);
  moleculeRef.current = molecule;
  selectionRef.current = selectionAtomIds;
  bondRef.current = bondIds;
  viewportRef.current = viewport;
  annotationRef.current = annotationTarget;
  marqueeRef.current = marqueeSelection;

  const isAnnotation =
    annotationTarget != null && annotationTarget.kind !== 'atoms';
  const canReflect =
    selectionAtomIds.length > 0 || annotationTarget?.kind === 'shape';
  const showBar =
    visible && (selectionAtomIds.length > 0 || isAnnotation);

  useEffect(() => {
    const bar = barRef.current;
    if (!showBar) {
      if (bar) {
        bar.style.display = 'none';
        bar.style.left = '';
        bar.style.top = '';
      }
      return;
    }

    let raf = 0;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const host = hostRef.current;
      const el = barRef.current;
      const handle = canvasRef.current;
      const canvas = handle?.getCanvas() ?? null;
      const vp = handle?.getViewport() ?? viewportRef.current;
      if (!host || !el || !canvas || host.clientWidth < 2 || host.clientHeight < 2) {
        if (el) el.style.display = 'none';
        raf = requestAnimationFrame(tick);
        return;
      }

      const mol = moleculeRef.current;
      const ann = annotationRef.current;
      const preview = handle?.getSelectionDragPreview?.() ?? null;
      // Hide chips while rotating — they sit on the rotate handle and native
      // `title` tooltips steal the pointer / obscure the angle HUD.
      if (preview?.kind === 'rotate') {
        el.style.display = 'none';
        raf = requestAnimationFrame(tick);
        return;
      }

      let worldX: number;
      let worldY: number;

      const atomIds = selectionRef.current;
      const bonds = bondRef.current;
      const transformIds = atomIdsForSelectionTransform(mol, atomIds, bonds);
      const ids = transformIds.length > 0 ? transformIds : atomIds;
      const marquee: MarqueeSelectionBoundsInput = {
        atomIds: marqueeRef.current?.atomIds?.length ? marqueeRef.current.atomIds : ids,
        reactionArrowIds: marqueeRef.current?.reactionArrowIds,
        strokeIds: marqueeRef.current?.strokeIds,
        canvasTextIds: marqueeRef.current?.canvasTextIds,
        canvasShapeIds: marqueeRef.current?.canvasShapeIds,
        canvasImageIds: marqueeRef.current?.canvasImageIds,
      };
      const groupLayout =
        getMarqueeSelectionTransformLayout(mol, marquee, null) ??
        getSelectionTransformLayout(mol, ids);
      const multiObject =
        ids.length > 0 ||
        (marquee.reactionArrowIds?.length ?? 0) +
          (marquee.strokeIds?.length ?? 0) +
          (marquee.canvasTextIds?.length ?? 0) +
          (marquee.canvasShapeIds?.length ?? 0) +
          (marquee.canvasImageIds?.length ?? 0) >
          1;

      if (groupLayout && (multiObject || !ann || ann.kind === 'atoms')) {
        // Sit above the dashed rectangle and the rotate handle — never inside the box.
        worldX = groupLayout.handleX;
        worldY = groupLayout.handleY - ROTATE_HANDLE_R - 8;
      } else if (ann && ann.kind !== 'atoms') {
        const anchor = annotationAnchor(mol, ann);
        if (!anchor) {
          el.style.display = 'none';
          raf = requestAnimationFrame(tick);
          return;
        }
        worldX = anchor.x;
        worldY = anchor.y;
      } else {
        const aabb = getSelectionAabb(mol, ids);
        if (!aabb) {
          el.style.display = 'none';
          raf = requestAnimationFrame(tick);
          return;
        }
        worldX = aabb.cx;
        worldY = aabb.minY - 22;
      }

      const live = applyPreview(worldX, worldY, preview);
      const { left, top } = worldToOverlay(live.x, live.y, canvas, host, vp);
      if (!Number.isFinite(left) || !Number.isFinite(top)) {
        el.style.display = 'none';
        raf = requestAnimationFrame(tick);
        return;
      }

      el.style.display = 'flex';
      const bw = el.offsetWidth || 160;
      const bh = el.offsetHeight || 28;
      // Prefer above the selection; CSS translate(-50%,-100%) places the bar above this point.
      const clamped = clampBarAnchor(left, top - 14, bw, bh, host.clientWidth, host.clientHeight);
      el.style.left = `${clamped.left}px`;
      el.style.top = `${clamped.top}px`;
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (barRef.current) {
        barRef.current.style.display = 'none';
        barRef.current.style.left = '';
        barRef.current.style.top = '';
      }
    };
  }, [showBar, selectionAtomIds.length, annotationTarget?.kind, annotationTarget && 'id' in annotationTarget ? annotationTarget.id : null, canvasRef]);

  if (!showBar) return null;

  const subject =
    annotationTarget?.kind === 'shape'
      ? 'glassware / shape'
      : annotationTarget?.kind === 'text'
        ? 'text'
        : annotationTarget?.kind === 'arrow'
          ? 'arrow'
          : annotationTarget?.kind === 'image'
            ? 'image'
            : annotationTarget?.kind === 'stroke'
              ? 'stroke'
              : 'selection';

  return (
    <div ref={hostRef} className="selection-action-toolbar-host" aria-hidden={false}>
      <div
        ref={barRef}
        className="selection-action-toolbar"
        role="toolbar"
        aria-label="Selection actions"
        onPointerDown={e => e.stopPropagation()}
      >
        <button
          type="button"
          className="selection-action-toolbar__chip"
          title={
            canReflect
              ? `Reflect ${subject} horizontally (left ↔ right)`
              : 'Reflect (select a molecule or glassware)'
          }
          aria-label={`Reflect ${subject} horizontally`}
          disabled={!canReflect}
          onClick={() => onReflect('horizontal')}
        >
          <ReflectHorizontalIcon />
        </button>
        <button
          type="button"
          className="selection-action-toolbar__chip"
          title={
            canReflect
              ? `Reflect ${subject} vertically (top ↔ bottom)`
              : 'Reflect (select a molecule or glassware)'
          }
          aria-label={`Reflect ${subject} vertically`}
          disabled={!canReflect}
          onClick={() => onReflect('vertical')}
        >
          <ReflectVerticalIcon />
        </button>
        <button
          type="button"
          className="selection-action-toolbar__chip"
          title={`Duplicate ${subject}`}
          aria-label={`Duplicate ${subject}`}
          onClick={onDuplicate}
        >
          <CopyPlus size={14} strokeWidth={1.85} aria-hidden />
        </button>
        <button
          type="button"
          className="selection-action-toolbar__chip"
          title={`Delete ${subject} (Del / Backspace)`}
          aria-label={`Delete ${subject}`}
          onClick={onDelete}
        >
          <Trash2 size={14} strokeWidth={1.85} aria-hidden />
        </button>
      </div>
    </div>
  );
}
