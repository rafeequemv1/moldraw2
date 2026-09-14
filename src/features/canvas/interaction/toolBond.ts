import type { Atom } from '@moldraw/domain';
import { orientBondEndpointsForGroupAbbrevPair } from '@moldraw/domain';
import { getMaxValencyForElement } from '@moldraw/domain';
import { getAtomValency, pickAtomAt, pickAtomOrBondForBondTool } from './hitTest';
import type { InteractionContext } from './types';

const ATOM_HIT_RADIUS = 15;
const CLICK_DRAG_THRESHOLD = 5;
/** Used only as an upper cap; actual threshold scales with `bondLengthPx` (see below). */
const BOND_DRAW_MIN_LENGTH = 20;

/** Commit a bond stroke if longer than this — must stay ≤ preview length (`bondLengthPx`) or short bond settings block drawing entirely. */
function bondDragCommitThresholdPx(bondLengthPx: number): number {
  const bl = Number.isFinite(bondLengthPx) && bondLengthPx > 0 ? bondLengthPx : 40;
  return Math.min(BOND_DRAW_MIN_LENGTH, bl * 0.85);
}

const BOND_TOOLS = [
  'single_bond',
  'double_bond',
  'triple_bond',
  'wedge_bond',
  'dash_bond',
  'wavy_bond',
] as const;
type BondTool = (typeof BOND_TOOLS)[number];

export const isBondTool = (tool: string): tool is BondTool =>
  (BOND_TOOLS as readonly string[]).includes(tool);

const orderForTool = (tool: string): 1 | 2 | 3 =>
  tool === 'triple_bond' ? 3 : tool === 'double_bond' ? 2 : 1;

const stereoForTool = (tool: string): 'wedge' | 'dash' | 'wavy' | undefined => {
  if (tool === 'wedge_bond') return 'wedge';
  if (tool === 'dash_bond') return 'dash';
  if (tool === 'wavy_bond') return 'wavy';
  return undefined;
};

/**
 * Bond family (single/double/triple/wedge/dash/wavy) — primary chemistry tool.
 *
 * Pointer-down branches:
 *   - Empty canvas: arm a bond drag from `worldPos`; clear selection.
 *   - Existing bond:
 *       * First click — set its order/stereo to the tool's pair (valency-checked).
 *       * Re-tap on a bond already matching the tool — ChemDraw-style cycle:
 *           - Order tool (single/double/triple): cycle order 1 → 2 → 3 → 1
 *             (skipping the flip if the next step would exceed valency).
 *           - Wedge / dash tool: swap endpoints to flip narrow→wide direction.
 *           - Wavy tool (symmetric): toggle the stereo flag off.
 *         This eliminates the tool-switching ritual users hate.
 *   - Existing atom: arm a bond drag rooted at the atom, after a valency check.
 *
 * Pointer-move snaps the ghost end to the configured angle increment at fixed length.
 *
 * Pointer-up commit branches:
 *   - Tiny drag on existing atom in single-bond mode → relabel atom to
 *     `placementElement`.
 *   - Tiny drag on empty canvas → create a single placement atom.
 *   - Real drag → create start/end atoms as needed and link with a bond,
 *     skipping if a bond already exists between the same endpoints.
 */
export const bondToolMouseDown = (ctx: InteractionContext): boolean => {
  const { e, worldPos, molecule, activeTool } = ctx;
  if (e.button !== 0 || !isBondTool(activeTool)) return false;

  const { atom, bond } = pickAtomOrBondForBondTool(molecule, worldPos, ATOM_HIT_RADIUS);

  if (!atom && !bond) {
    // Empty canvas — start a free bond drag.
    e.preventDefault();
    ctx.setMouseDownPos({ x: e.clientX, y: e.clientY });
    ctx.setSelectedAtomIds?.([]);
    ctx.setSelectedCanvasTextId?.(null);
    ctx.setSelectedReactionArrowId?.(null);
    ctx.setDrawingBond({ startPos: worldPos, currentPos: worldPos });
    return true;
  }

  if (bond && ctx.onUpdateBond) {
    const from = molecule.atoms.find(a => a.id === bond.fromAtomId);
    const to = molecule.atoms.find(a => a.id === bond.toAtomId);
    const nextStereo = stereoForTool(activeTool);
    const isStereoTool = nextStereo !== undefined;

    // ── Stereo tool branch (wedge / dash / wavy) ────────────────────────
    if (isStereoTool) {
      const stereoMatches = (bond.stereo ?? null) === nextStereo;
      // Re-tap with the same stereo: wedge/dash flips direction; wavy is
      // symmetric so it just toggles off (re-tap to remove the stereo flag).
      if (stereoMatches) {
        if (nextStereo === 'wavy') {
          ctx.onUpdateBond(bond.id, { order: bond.order, stereo: undefined });
        } else if (ctx.onFlipBond) {
          ctx.onFlipBond(bond.id);
        }
        return true;
      }
      // Different stereo (or none) → set to tool's stereo, preserve order.
      ctx.onUpdateBond(bond.id, { order: bond.order, stereo: nextStereo });
      return true;
    }

    // ── Order tool branch (single / double / triple) ────────────────────
    // Clicks bounce: 1 → 2 → 3 → 2 → 1 → … so stepping down from triple hits
    // double (offset lines) before single — not 3 → 1 in one jump. `orderCycleRamp`
    // on the bond records whether double was reached from below (`up`) or from
    // triple (`down`) to choose 2 → 3 vs 2 → 1.
    //
    // Stereo is cleared on cycle (a single/double/triple tool click on a
    // wedge/dash promotes the depiction to plain order). Valency is guarded
    // on the upward step; if blocked, flash and leave the bond alone.
    const ramp = bond.orderCycleRamp ?? 'up';
    let cycled: 1 | 2 | 3;
    if (bond.order === 1) {
      cycled = 2;
    } else if (bond.order === 3) {
      cycled = 2;
    } else {
      cycled = ramp === 'up' ? 3 : 1;
    }

    if (from && to && cycled > bond.order) {
      const delta = cycled - bond.order;
      const fromV = getAtomValency(from.id, molecule);
      const toV = getAtomValency(to.id, molecule);
      const fromMax = getMaxValencyForElement(from.element, from.charge);
      const toMax = getMaxValencyForElement(to.element, to.charge);
      if (fromV + delta > fromMax || toV + delta > toMax) {
        ctx.flashAtomError(fromV + delta > fromMax ? from.id : to.id);
        return true;
      }
    }

    let orderCycleRamp: 'up' | 'down' | undefined;
    if (cycled === 2) {
      orderCycleRamp = bond.order === 3 ? 'down' : 'up';
    } else if (cycled === 3) {
      orderCycleRamp = undefined;
    } else {
      orderCycleRamp = 'up';
    }

    ctx.onUpdateBond(bond.id, { order: cycled, stereo: undefined, orderCycleRamp });
    return true;
  }

  if (atom) {
    const currentValency = getAtomValency(atom.id, molecule);
    const maxValency = getMaxValencyForElement(atom.element, atom.charge);
    const bondOrder = orderForTool(activeTool);
    if (currentValency + bondOrder > maxValency) {
      ctx.flashAtomError(atom.id);
      return true;
    }
    ctx.setDrawingBond({
      startAtomId: atom.id,
      startPos: { x: atom.x, y: atom.y },
      currentPos: worldPos,
    });
  }
  return true;
};

/**
 * Update preview-hover state while a bond tool is active and no drag/draw is
 * in progress. Sets `hoverAtomId` / `hoverBondId` / `mouseWorldPos` so the
 * `drawBondHoverHint` overlay can render the "what will happen" affordance
 * (faint preview bond on atom hover, faint placement-atom dot on empty
 * canvas).
 */
export const bondToolUpdateHover = (ctx: InteractionContext): void => {
  ctx.setMouseWorldPos(ctx.worldPos);
  if (ctx.drawingBond) return;
  const { atom, bond } = pickAtomOrBondForBondTool(ctx.molecule, ctx.worldPos, ATOM_HIT_RADIUS);
  ctx.setHoverAtomId(atom ? atom.id : null);
  ctx.setHoverBondId(bond ? bond.id : null);
};

export const bondToolMouseMove = (ctx: InteractionContext): boolean => {
  if (!ctx.drawingBond || !isBondTool(ctx.activeTool)) return false;
  const { molecule, worldPos, drawingBond } = ctx;
  const startAtom = drawingBond.startAtomId
    ? molecule.atoms.find(a => a.id === drawingBond.startAtomId)
    : null;
  const start = startAtom ? { x: startAtom.x, y: startAtom.y } : drawingBond.startPos;

  const dx = worldPos.x - start.x;
  const dy = worldPos.y - start.y;
  let angle = Math.atan2(dy, dx);
  const step = ctx.bondAngleSnapRad > 1e-9 ? ctx.bondAngleSnapRad : Math.PI / 6;
  angle = Math.round(angle / step) * step;

  const snappedPos = {
    x: start.x + Math.cos(angle) * ctx.bondLengthPx,
    y: start.y + Math.sin(angle) * ctx.bondLengthPx,
  };
  ctx.setDrawingBond(prev => (prev ? { ...prev, currentPos: snappedPos } : null));
  return true;
};

/**
 * Pointer-up commit. Returns `true` when this tool fully handled the event;
 * the dispatcher relies on this to suppress the generic "click empty canvas
 * to clear selection" branch.
 */
export const bondToolMouseUp = (ctx: InteractionContext): boolean => {
  const { activeTool, e, worldPos, molecule, mouseDownPos, placementElement } = ctx;
  if (!isBondTool(activeTool)) return false;

  const distance = Math.hypot(e.clientX - mouseDownPos.x, e.clientY - mouseDownPos.y);

  // Tiny single-bond drag on existing atom → relabel to placement element.
  if (
    distance < CLICK_DRAG_THRESHOLD &&
    e.button === 0 &&
    activeTool === 'single_bond' &&
    ctx.onUpdateAtomElement
  ) {
    const releaseAtom = pickAtomAt(molecule, worldPos, ATOM_HIT_RADIUS);
    if (releaseAtom && releaseAtom.element !== placementElement) {
      ctx.onUpdateAtomElement(releaseAtom.id, placementElement);
      ctx.setDrawingBond(null);
      return true;
    }
  }

  if (!ctx.drawingBond) {
    // Tiny click on empty canvas with bond tool active → place a single atom.
    if (
      distance < CLICK_DRAG_THRESHOLD &&
      e.button === 0 &&
      !ctx.drawingRing &&
      !ctx.drawingChain &&
      !ctx.hoverBondId &&
      !ctx.drawingStroke &&
      !ctx.drawingReactionArrow &&
      !ctx.drawingCanvasShape
    ) {
      const releaseAtom = pickAtomAt(molecule, worldPos, ATOM_HIT_RADIUS);
      if (!releaseAtom) {
        ctx.setSelectedAtomIds?.([]);
        ctx.setSelectedCanvasTextId?.(null);
        ctx.setSelectedReactionArrowId?.(null);
        ctx.onAddAtom?.({
          id: Math.random().toString(36).substr(2, 9),
          element: placementElement,
          x: worldPos.x,
          y: worldPos.y,
          charge: 0,
        });
      }
    }
    return true;
  }

  const releaseAtom = pickAtomAt(molecule, worldPos, ATOM_HIT_RADIUS);
  let startAtomId = ctx.drawingBond.startAtomId;
  let endAtomId = releaseAtom?.id;
  const bondOrder = orderForTool(activeTool);
  const startAtom = startAtomId ? molecule.atoms.find(a => a.id === startAtomId) : null;
  const startPos = startAtom ? { x: startAtom.x, y: startAtom.y } : ctx.drawingBond.startPos;
  const drawnLength = Math.hypot(
    startPos.x - ctx.drawingBond.currentPos.x,
    startPos.y - ctx.drawingBond.currentPos.y,
  );
  const minBondDragPx = bondDragCommitThresholdPx(ctx.bondLengthPx);

  const atomsCreatedThisStroke: Atom[] = [];
  const atomById = (id: string): Atom | undefined =>
    molecule.atoms.find(a => a.id === id) ?? atomsCreatedThisStroke.find(a => a.id === id);

  if (releaseAtom) {
    const currentValency = getAtomValency(releaseAtom.id, molecule);
    const maxValency = getMaxValencyForElement(releaseAtom.element, releaseAtom.charge);
    if (currentValency + bondOrder > maxValency && releaseAtom.id !== startAtomId) {
      ctx.flashAtomError(releaseAtom.id);
      ctx.setDrawingBond(null);
      return true;
    }
    if (!startAtomId && drawnLength > minBondDragPx) {
      const newAtom: Atom = {
        id: Math.random().toString(36).substr(2, 9),
        element: placementElement,
        x: startPos.x,
        y: startPos.y,
        charge: 0,
      };
      atomsCreatedThisStroke.push(newAtom);
      ctx.onAddAtom?.(newAtom);
      startAtomId = newAtom.id;
    }
  } else if (drawnLength > minBondDragPx) {
    if (!startAtomId) {
      const newStartAtom: Atom = {
        id: Math.random().toString(36).substr(2, 9),
        element: placementElement,
        x: startPos.x,
        y: startPos.y,
        charge: 0,
      };
      atomsCreatedThisStroke.push(newStartAtom);
      ctx.onAddAtom?.(newStartAtom);
      startAtomId = newStartAtom.id;
    }
    const newAtom: Atom = {
      id: Math.random().toString(36).substr(2, 9),
      element: placementElement,
      x: ctx.drawingBond.currentPos.x,
      y: ctx.drawingBond.currentPos.y,
      charge: 0,
    };
    atomsCreatedThisStroke.push(newAtom);
    ctx.onAddAtom?.(newAtom);
    endAtomId = newAtom.id;
  }

  if (startAtomId && endAtomId && endAtomId !== startAtomId && ctx.onAddBond) {
    const bondExists = molecule.bonds.some(
      b =>
        (b.fromAtomId === startAtomId && b.toAtomId === endAtomId) ||
        (b.fromAtomId === endAtomId && b.toAtomId === startAtomId),
    );
    if (!bondExists) {
      const epA = atomById(startAtomId);
      const epB = atomById(endAtomId);
      const oriented =
        epA && epB ? orientBondEndpointsForGroupAbbrevPair(epA, epB) : null;
      ctx.onAddBond({
        id: Math.random().toString(36).substr(2, 9),
        fromAtomId: oriented?.fromAtomId ?? startAtomId,
        toAtomId: oriented?.toAtomId ?? endAtomId,
        order: bondOrder,
        stereo: stereoForTool(activeTool),
      });
    }
  }

  // Single-click on the same atom in single-bond mode → relabel.
  if (
    activeTool === 'single_bond' &&
    releaseAtom &&
    releaseAtom.id === ctx.drawingBond.startAtomId &&
    distance < CLICK_DRAG_THRESHOLD &&
    ctx.onUpdateAtomElement &&
    releaseAtom.element !== placementElement
  ) {
    ctx.onUpdateAtomElement(releaseAtom.id, placementElement);
  }

  ctx.setDrawingBond(null);
  return true;
};
