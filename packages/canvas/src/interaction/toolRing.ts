import { getMaxValencyForElement } from '@moldraw/domain';
import {
  getAtomValency,
  pickAtomCenterAt,
  pickAtomOrBondForRingTool,
} from './hitTest';

const RING_ATTACH_OPTS = { includeLabels: false } as const;
import type { InteractionContext } from './types';

/** Drag past this (world px) from a root atom → attach via single bond. */
const ATOM_ATTACH_DRAG_PX = 10;

const RING_TOOLS = [
  'benzene',
  'hexagon',
  'cyclohexane',
  'boat_cyclohexane',
  'cyclopentane',
  'cyclopentadiene',
  'cyclobutane',
  'cyclopropane',
  'cycloheptane',
  'cyclooctane',
] as const;
type RingTool = (typeof RING_TOOLS)[number];

export const isRingTool = (tool: string): tool is RingTool =>
  (RING_TOOLS as readonly string[]).includes(tool);

export const isBoatTool = (tool: string): boolean => tool === 'boat_cyclohexane';
export const isChairTool = (tool: string): boolean => tool === 'cyclohexane';
export const isAromaticRing = (tool: string): boolean =>
  tool === 'benzene' || tool === 'cyclopentadiene';

export const ringSidesForTool = (tool: string): number => {
  switch (tool) {
    case 'cyclopropane':
      return 3;
    case 'cyclobutane':
      return 4;
    case 'cyclopentane':
    case 'cyclopentadiene':
      return 5;
    case 'cycloheptane':
      return 7;
    case 'cyclooctane':
      return 8;
    default:
      return 6;
  }
};

/**
 * Compute fusion geometry for a ring sharing `bond` (a1–a2), growing toward
 * `toward` (usually the cursor). Returns null if the bond endpoints are missing.
 */
export const computeRingFusionGeometry = (
  a1: { x: number; y: number },
  a2: { x: number; y: number },
  toward: { x: number; y: number },
  numSides: number,
): {
  center: { x: number; y: number };
  angleOffset: number;
  angleStep: number;
  radius: number;
} | null => {
  const dx = a2.x - a1.x;
  const dy = a2.y - a1.y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-6) return null;

  const mx = (a1.x + a2.x) / 2;
  const my = (a1.y + a2.y) / 2;

  // Unit perpendicular to the bond.
  let px = -dy / L;
  let py = dx / L;

  // Grow toward the cursor (or away from existing ring mass if toward is on bond).
  if ((toward.x - mx) * px + (toward.y - my) * py < 0) {
    px = -px;
    py = -py;
  }

  const apothem = L / 2 / Math.tan(Math.PI / numSides);
  const center = { x: mx + px * apothem, y: my + py * apothem };
  const radius = L / (2 * Math.sin(Math.PI / numSides));
  const angleOffset = Math.atan2(a1.y - center.y, a1.x - center.x);

  // Orient so a2 lands at angleOffset + step (not -step).
  let angleStep = (Math.PI * 2) / numSides;
  const expectedA2x = center.x + radius * Math.cos(angleOffset + angleStep);
  const expectedA2y = center.y + radius * Math.sin(angleOffset + angleStep);
  if (Math.hypot(expectedA2x - a2.x, expectedA2y - a2.y) > 1) {
    angleStep = -angleStep;
  }

  return { center, angleOffset, angleStep, radius };
};

/**
 * Ring tools (cyclo*, benzene, boat-cyclohexane).
 *
 * Pointer-down on an atom seeds a ring drag rooted at that atom (single-bond
 * attach on drag). Pointer-down on empty canvas / a bond is handled at
 * pointer-up via `hoverBondId` for side-to-side fusion.
 */
export const ringToolMouseDown = (ctx: InteractionContext): boolean => {
  const { e, worldPos, molecule } = ctx;
  if (e.button !== 0) return false;

  // Prefer mid-shaft bond for fusion; near endpoints, start atom-attach drag.
  const { atom, bond } = pickAtomOrBondForRingTool(
    molecule,
    worldPos,
    ctx.hit.atomAttachRadius,
    ctx.hit.bondHitTolerance + 4,
    RING_ATTACH_OPTS,
  );
  if (atom) {
    ctx.setDrawingRing({ startAtomId: atom.id, currentPos: worldPos });
    ctx.setHoverBondId(null);
  } else if (bond) {
    // Seed fusion target immediately so a click-without-move still fuses.
    ctx.setHoverBondId(bond.id);
    ctx.setDrawingRing(null);
  }
  return true;
};

export const ringToolMouseMove = (ctx: InteractionContext): boolean => {
  if (!ctx.drawingRing) return false;
  const { worldPos } = ctx;
  ctx.setDrawingRing(prev => (prev ? { ...prev, currentPos: worldPos } : null));
  return true;
};

/**
 * Pointer-up commit. Priority:
 *   1. Atom-rooted drag → attach via single bond (ChemDraw-style).
 *   2. Hovered / mid-shaft bond → side-to-side fusion.
 *   3. Free ring on empty canvas.
 */
export const ringToolMouseUp = (ctx: InteractionContext): boolean => {
  const { activeTool, e, worldPos, molecule, mouseDownPos } = ctx;
  if (!isRingTool(activeTool)) return false;

  const numSides = ringSidesForTool(activeTool);
  const isBenzene = isAromaticRing(activeTool);
  const isBoat = isBoatTool(activeTool);
  const isChair = isChairTool(activeTool);
  const distance = Math.hypot(e.clientX - mouseDownPos.x, e.clientY - mouseDownPos.y);

  // ── 1. Atom-rooted: click or drag from an atom ───────────────────────────
  if (ctx.drawingRing?.startAtomId) {
    const rootAtomId = ctx.drawingRing.startAtomId;
    const startAtom = molecule.atoms.find(a => a.id === rootAtomId);
    if (!startAtom) {
      ctx.setDrawingRing(null);
      return true;
    }

    const currentValency = getAtomValency(startAtom.id, molecule);
    const maxValency = getMaxValencyForElement(startAtom.element, startAtom.charge);
    if (currentValency + 1 > maxValency) {
      ctx.flashAtomError(startAtom.id);
      ctx.setDrawingRing(null);
      return true;
    }

    const dx = worldPos.x - startAtom.x;
    const dy = worldPos.y - startAtom.y;
    const dist = Math.hypot(dx, dy);
    let dragAngle = Math.atan2(dy, dx);

    // Short click (no meaningful drag): auto-orient away from existing bonds,
    // still attach via a single bond in that direction.
    if (dist <= ATOM_ATTACH_DRAG_PX * ctx.hit.zoomScale) {
      const existingBonds = molecule.bonds.filter(
        b => b.fromAtomId === rootAtomId || b.toAtomId === rootAtomId,
      );
      if (existingBonds.length > 0) {
        let sx = 0;
        let sy = 0;
        existingBonds.forEach(b => {
          const neighborId = b.fromAtomId === rootAtomId ? b.toAtomId : b.fromAtomId;
          const n = molecule.atoms.find(a => a.id === neighborId);
          if (!n) return;
          const ndx = n.x - startAtom.x;
          const ndy = n.y - startAtom.y;
          const nl = Math.hypot(ndx, ndy) || 1;
          sx += ndx / nl;
          sy += ndy / nl;
        });
        dragAngle =
          Math.hypot(sx, sy) > 1e-3 ? Math.atan2(-sy, -sx) : -Math.PI / 2;
      } else {
        dragAngle = -Math.PI / 2;
      }
    }

    const snap = ctx.bondAngleSnapRad > 1e-9 ? ctx.bondAngleSnapRad : Math.PI / 6;
    dragAngle = Math.round(dragAngle / snap) * snap;

    const activeRadius = ctx.bondLengthPx / (2 * Math.sin(Math.PI / numSides));
    // Attachment atom of the new ring sits one bondLength away; ring center
    // continues along the same ray so the connector is a clean single bond.
    const endX = startAtom.x + Math.cos(dragAngle) * ctx.bondLengthPx;
    const endY = startAtom.y + Math.sin(dragAngle) * ctx.bondLengthPx;
    const center = {
      x: endX + activeRadius * Math.cos(dragAngle),
      y: endY + activeRadius * Math.sin(dragAngle),
    };
    const angleOffset = dragAngle + Math.PI;
    const attachedViaBond = true;

    if (isBoat) {
      ctx.onAddBoatRing?.(center, rootAtomId, attachedViaBond);
    } else if (isChair) {
      ctx.onAddChairRing?.(center, rootAtomId, attachedViaBond);
    } else {
      ctx.onAddRing?.(
        center,
        numSides,
        isBenzene,
        angleOffset,
        rootAtomId,
        attachedViaBond,
        undefined,
        undefined,
        activeRadius,
      );
    }
    ctx.setDrawingRing(null);
    ctx.setHoverBondId(null);
    return true;
  }

  // ── 2. Side-to-side fusion onto a bond ───────────────────────────────────
  // Re-pick at release so a click on a bond mid-shaft still fuses even if
  // hover state was cleared; prefer the live hover when present.
  const releasePick = pickAtomOrBondForRingTool(
    molecule,
    worldPos,
    ctx.hit.atomAttachRadius,
    ctx.hit.bondHitTolerance + 4,
    RING_ATTACH_OPTS,
  );
  const fuseBondId = ctx.hoverBondId ?? releasePick.bond?.id ?? null;

  if (isBoat && fuseBondId) {
    ctx.setDrawingRing(null);
    ctx.setHoverBondId(null);
    return true;
  }

  if (fuseBondId) {
    const bond = molecule.bonds.find(b => b.id === fuseBondId);
    if (bond) {
      const a1 = molecule.atoms.find(a => a.id === bond.fromAtomId);
      const a2 = molecule.atoms.find(a => a.id === bond.toAtomId);
      if (a1 && a2) {
        const v1 = getAtomValency(a1.id, molecule);
        const v2 = getAtomValency(a2.id, molecule);
        if (
          v1 + 1 > getMaxValencyForElement(a1.element, a1.charge) ||
          v2 + 1 > getMaxValencyForElement(a2.element, a2.charge)
        ) {
          ctx.flashAtomError(
            v1 + 1 > getMaxValencyForElement(a1.element, a1.charge) ? a1.id : a2.id,
          );
        }

        const geom = computeRingFusionGeometry(a1, a2, worldPos, numSides);
        if (geom) {
          if (isChair) {
            ctx.onAddChairRing?.(geom.center, undefined, false);
          } else {
            ctx.onAddRing?.(
              geom.center,
              numSides,
              isBenzene,
              geom.angleOffset,
              undefined,
              false,
              fuseBondId,
              geom.angleStep,
              geom.radius,
            );
          }
        }
      }
    }
    ctx.setDrawingRing(null);
    ctx.setHoverBondId(null);
    return true;
  }

  // ── 3. Free ring on empty canvas (tiny click) ────────────────────────────
  if (
    distance < ctx.hit.clickDragThresholdPx &&
    e.button === 0 &&
    !ctx.drawingBond &&
    !ctx.drawingChain &&
    !ctx.drawingStroke &&
    !ctx.drawingReactionArrow &&
    !ctx.drawingCanvasShape
  ) {
    const releaseAtom = pickAtomCenterAt(molecule, worldPos, ctx.hit.atomAttachRadius);
    if (!releaseAtom) {
      ctx.setSelectedAtomIds?.([]);
      ctx.setSelectedCanvasTextId?.(null);
      ctx.setSelectedReactionArrowId?.(null);
      if (isBoat) {
        ctx.onAddBoatRing?.(worldPos, undefined, false);
      } else if (isChair) {
        ctx.onAddChairRing?.(worldPos, undefined, false);
      } else {
        ctx.onAddRing?.(
          worldPos,
          numSides,
          isBenzene,
          -Math.PI / 2,
          undefined,
          false,
          undefined,
          undefined,
          ctx.bondLengthPx / (2 * Math.sin(Math.PI / numSides)),
        );
      }
      return true;
    }
  }

  // Drag on empty canvas without a root → place free ring at release point.
  if (!ctx.drawingRing) {
    ctx.setHoverBondId(null);
    return true;
  }

  const center = ctx.drawingRing.currentPos;
  const angleOffset = -Math.PI / 2;
  if (isBoat) {
    ctx.onAddBoatRing?.(center, undefined, false);
  } else if (isChair) {
    ctx.onAddChairRing?.(center, undefined, false);
  } else if (ctx.onAddRing) {
    const activeRadius = ctx.bondLengthPx / (2 * Math.sin(Math.PI / numSides));
    ctx.onAddRing(
      center,
      numSides,
      isBenzene,
      angleOffset,
      undefined,
      false,
      undefined,
      undefined,
      activeRadius,
    );
  }
  ctx.setDrawingRing(null);
  ctx.setHoverBondId(null);
  return true;
};

/**
 * Update hover targets while a ring tool is active so the ghost preview can
 * show fusion (mid-shaft bond) vs atom-attach targets.
 */
export const ringToolUpdateHover = (ctx: InteractionContext): void => {
  const { worldPos, molecule } = ctx;
  ctx.setMouseWorldPos(worldPos);

  // While dragging from an atom, keep fusion hover cleared so we don't steal
  // the single-bond attach path on release.
  if (ctx.drawingRing?.startAtomId) {
    ctx.setHoverAtomId(ctx.drawingRing.startAtomId);
    ctx.setHoverBondId(null);
    return;
  }

  const { atom, bond } = pickAtomOrBondForRingTool(
    molecule,
    worldPos,
    ctx.hit.atomAttachRadius,
    ctx.hit.bondHitTolerance + 4,
    RING_ATTACH_OPTS,
  );
  ctx.setHoverAtomId(atom ? atom.id : null);
  ctx.setHoverBondId(bond ? bond.id : null);
};
