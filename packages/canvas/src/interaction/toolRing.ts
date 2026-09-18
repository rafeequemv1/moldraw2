import { boatRingVertices, chairRingVertices } from '@moldraw/core';
import { getMaxValencyForElement } from '@moldraw/domain';
import { bestRingAttachGrowAngle } from '../geometry';
import {
  getAtomValency,
  pickAtomCenterAt,
  pickAtomOrBondForRingTool,
} from './hitTest';
import type { InteractionContext } from './types';

const RING_ATTACH_OPTS = { includeLabels: false } as const;

/**
 * Screen-px pointer travel before an atom-rooted ring press counts as a drag.
 * Must stay well above a jittery click (generic click threshold is 5px mouse)
 * so clicking an atom never takes the via-bond path.
 */
export const ATOM_RING_DRAG_SCREEN_PX = 18;

/**
 * World-px from the root atom before the ghost (and world-space fallback)
 * treats the gesture as via-bond attach. Larger than the atom hit disk so an
 * off-centre click is still a click.
 */
export const ATOM_ATTACH_DRAG_WORLD_PX = 32;

export const isRingAtomClick = (
  screenTravelPx: number,
  clickDragThresholdPx: number,
): boolean => screenTravelPx <= Math.max(clickDragThresholdPx, ATOM_RING_DRAG_SCREEN_PX);

export const isAtomRingAttachDrag = (distWorld: number, bondLengthPx: number): boolean =>
  distWorld > Math.max(ATOM_ATTACH_DRAG_WORLD_PX, bondLengthPx * 0.5);

export type AtomRootedRingKind = 'regular' | 'chair' | 'boat';

/** Geometry for growing a ring from an existing atom (click = share vertex, drag = linker).
 *
 * Click (attachedViaBond=false): the shared atom is vertex 0. `growAngle` is
 * atom → ring centre. `angleOffset = growAngle + π` puts vertex 0 on the atom
 * so an existing substituent along −growAngle is a radial spoke (toluene).
 */
export function atomRootedRingGeometry(opts: {
  startAtom: { x: number; y: number };
  growAngle: number;
  numSides: number;
  bondLengthPx: number;
  attachedViaBond: boolean;
  kind?: AtomRootedRingKind;
}): {
  center: { x: number; y: number };
  angleOffset: number;
  radius: number;
  linkEnd: { x: number; y: number } | null;
} {
  const {
    startAtom,
    growAngle,
    numSides,
    bondLengthPx,
    attachedViaBond,
    kind = 'regular',
  } = opts;
  const radius = bondLengthPx / (2 * Math.sin(Math.PI / numSides));
  const cos = Math.cos(growAngle);
  const sin = Math.sin(growAngle);

  if (attachedViaBond) {
    const linkEnd = {
      x: startAtom.x + cos * bondLengthPx,
      y: startAtom.y + sin * bondLengthPx,
    };
    return {
      center: { x: linkEnd.x + radius * cos, y: linkEnd.y + radius * sin },
      angleOffset: growAngle + Math.PI,
      radius,
      linkEnd,
    };
  }

  if (kind === 'chair' || kind === 'boat') {
    const template =
      kind === 'chair'
        ? chairRingVertices({ x: 0, y: 0 }, bondLengthPx)
        : boatRingVertices({ x: 0, y: 0 }, bondLengthPx);
    const v0 = template[0] ?? { x: 0, y: 0 };
    const v0Len = Math.hypot(v0.x, v0.y);
    // Rotate so centroid → vertex 0 points at the atom (growAngle + π),
    // i.e. the existing substituent is collinear with that spoke.
    const rotation =
      v0Len < 1e-6 ? 0 : growAngle + Math.PI - Math.atan2(v0.y, v0.x);
    const c = Math.cos(rotation);
    const s = Math.sin(rotation);
    const rv0x = v0.x * c - v0.y * s;
    const rv0y = v0.x * s + v0.y * c;
    return {
      center: { x: startAtom.x - rv0x, y: startAtom.y - rv0y },
      angleOffset: rotation,
      radius,
      linkEnd: null,
    };
  }

  return {
    center: {
      x: startAtom.x + radius * cos,
      y: startAtom.y + radius * sin,
    },
    angleOffset: growAngle + Math.PI,
    radius,
    linkEnd: null,
  };
}

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
 * Pointer-down on an atom seeds a ring rooted at that atom. A short click
 * shares the atom as a ring vertex; a real drag attaches via a single bond.
 * Pointer-down on empty canvas / a bond is handled at pointer-up via
 * `hoverBondId` for side-to-side fusion.
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
 *   1. Atom-rooted click → share the atom as a ring vertex (no connector).
 *      Atom-rooted drag → attach via a single bond (ChemDraw-style).
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

  // ── 1. Atom-rooted: click shares the vertex; drag attaches via a bond ────
  if (ctx.drawingRing?.startAtomId) {
    const rootAtomId = ctx.drawingRing.startAtomId;
    const startAtom = molecule.atoms.find(a => a.id === rootAtomId);
    if (!startAtom) {
      ctx.setDrawingRing(null);
      return true;
    }

    const isClick = isRingAtomClick(distance, ctx.hit.clickDragThresholdPx);
    const attachedViaBond = !isClick;
    const kind: AtomRootedRingKind = isBoat ? 'boat' : isChair ? 'chair' : 'regular';

    // Over-valent carbons (Texas carbon, five bonds) are allowed. The editor
    // shows an orange surplus badge after the edit; the gesture is never refused.

    let growAngle: number;
    if (isClick) {
      // Vertex-fuse: existing bond is a radial substituent, not a 120° sprout.
      growAngle = bestRingAttachGrowAngle(startAtom, molecule);
    } else {
      const dx = worldPos.x - startAtom.x;
      const dy = worldPos.y - startAtom.y;
      growAngle = Math.atan2(dy, dx);
      const snap = ctx.bondAngleSnapRad > 1e-9 ? ctx.bondAngleSnapRad : Math.PI / 6;
      growAngle = Math.round(growAngle / snap) * snap;
    }

    const geom = atomRootedRingGeometry({
      startAtom,
      growAngle,
      numSides,
      bondLengthPx: ctx.bondLengthPx,
      attachedViaBond,
      kind,
    });

    if (isBoat) {
      ctx.onAddBoatRing?.(
        geom.center,
        rootAtomId,
        attachedViaBond,
        attachedViaBond ? 0 : geom.angleOffset,
      );
    } else if (isChair) {
      ctx.onAddChairRing?.(
        geom.center,
        rootAtomId,
        attachedViaBond,
        attachedViaBond ? 0 : geom.angleOffset,
      );
    } else {
      ctx.onAddRing?.(
        geom.center,
        numSides,
        isBenzene,
        geom.angleOffset,
        rootAtomId,
        attachedViaBond,
        undefined,
        undefined,
        geom.radius,
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
