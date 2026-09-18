import type { Atom } from '@moldraw/domain';
import { orientBondEndpointsForGroupAbbrevPair } from '@moldraw/domain';
import { getMaxValencyForElement } from '@moldraw/domain';
import { bestSproutAngle } from '../geometry';
import {
  getAtomValency,
  pickAtomAt,
  pickAtomCenterAt,
  pickAtomOrBondForBondTool,
} from './hitTest';
import type { InteractionContext } from './types';
import {
  bondMatchesStyle,
  bondPatchForStyleTool,
  isBondTool,
  isOrderCycleTool,
  skipsValencyTool,
  type BondToolId,
} from './bondToolStyles';

export { isBondTool } from './bondToolStyles';

/**
 * Center-only attach radius — label-expanded hits steal neighbors (OH/NH/Cl).
 * Radii and tap thresholds come from `ctx.hit` so a fingertip gets a much
 * larger target than a mouse (see `touch/inputProfile.ts`).
 */
const ATTACH_OPTS = { includeLabels: false } as const;
/** Used only as an upper cap; actual threshold scales with `bondLengthPx` (see below). */
const BOND_DRAW_MIN_LENGTH = 20;

/** Commit a bond stroke if longer than this — must stay ≤ preview length (`bondLengthPx`) or short bond settings block drawing entirely. */
function bondDragCommitThresholdPx(bondLengthPx: number): number {
  const bl = Number.isFinite(bondLengthPx) && bondLengthPx > 0 ? bondLengthPx : 40;
  return Math.min(BOND_DRAW_MIN_LENGTH, bl * 0.85);
}

const orderForTool = (tool: BondToolId): 1 | 2 | 3 => {
  const order = bondPatchForStyleTool(tool).order;
  return order === 3 ? 3 : order === 2 ? 2 : 1;
};

/**
 * Bond family (single/double/triple/wedge/dash/wavy and query types) — primary chemistry tool.
 *
 * Pointer-down branches:
 *   - Empty canvas: arm a bond drag from `worldPos`; clear selection.
 *   - Existing bond:
 *       * First click — set its order/stereo to the tool's pair.
 *       * Re-tap on a bond already matching the tool — ChemDraw-style cycle:
 *           - Order tool (single/double/triple): bounce order 1 → 2 → 3 → 2 → 1.
 *           - Wedge / dash tool: swap endpoints to flip narrow→wide direction.
 *           - Wavy tool (symmetric): toggle the stereo flag off.
 *         This eliminates the tool-switching ritual users hate.
 *       Valency is *not* a blocker: over-filled atoms get a brief flash and a
 *       persistent octet marker (see `overValentAtomIds`), so a user can turn
 *       a Kekulé ring into whatever intermediate they need bond by bond.
 *   - Existing atom: arm a bond drag rooted at the atom.
 *
 * Pointer-move snaps the ghost end to the configured angle increment at fixed length.
 *
 * Pointer-up commit branches:
 *   - Click on an atom or its functional-group label (NH2, COOH, …) in
 *     single-bond mode with a palette element → relabel that atom. H clears
 *     the alias and sets element H (it does not sprout a second hydrogen).
 *   - Click on an existing atom otherwise → sprout a bond of the tool's
 *     order/style into the best free direction (`bestSproutAngle`).
 *   - Click on empty canvas → horizontal C–C bond (carbon placement) or a
 *     single atom of the chosen element (heteroatom placement).
 *   - Real drag → create start/end atoms as needed and link with a bond,
 *     skipping if a bond already exists between the same endpoints.
 */
export const bondToolMouseDown = (ctx: InteractionContext): boolean => {
  const { e, worldPos, molecule, activeTool } = ctx;
  if (e.button !== 0 || !isBondTool(activeTool)) return false;

  const { atom, bond } = pickAtomOrBondForBondTool(
    molecule,
    worldPos,
    ctx.hit.atomAttachRadius,
    ctx.hit.bondHitTolerance,
    ATTACH_OPTS,
  );

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
    const tool = activeTool as BondToolId;
    const patch = bondPatchForStyleTool(tool);

    // ── Style tools (stereo / aromatic / query / dative / H-bond / thick) ──
    if (!isOrderCycleTool(tool)) {
      if (bondMatchesStyle(bond, tool)) {
        const stereo = patch.stereo;
        if (stereo === 'wedge' || stereo === 'dash' || stereo === 'either') {
          ctx.onFlipBond?.(bond.id);
        } else {
          ctx.onUpdateBond(bond.id, {
            order: 1,
            stereo: undefined,
            dative: false,
            dotted: false,
            aromatic: false,
            queryType: undefined,
            bold: false,
          });
        }
        return true;
      }
      ctx.onUpdateBond(bond.id, patch);
      return true;
    }

    // ── Order tool branch (single / double / triple) ────────────────────
    // Clicks bounce: 1 → 2 → 3 → 2 → 1 → … so stepping down from triple hits
    // double (offset lines) before single — not 3 → 1 in one jump. `orderCycleRamp`
    // on the bond records whether double was reached from below (`up`) or from
    // triple (`down`) to choose 2 → 3 vs 2 → 1.
    //
    // Stereo is cleared on cycle (a single/double/triple tool click on a
    // wedge/dash promotes the depiction to plain order). If order already
    // matches the tool and stereo is set (e.g. single tool on a wedge), clear
    // stereo only — do not bump 1 → 2. Valency is guarded on the upward step.
    const toolOrder = orderForTool(tool);
    const hasSpecial =
      Boolean(bond.stereo) ||
      Boolean(bond.dative) ||
      Boolean(bond.dotted) ||
      Boolean(bond.aromatic) ||
      Boolean(bond.queryType) ||
      Boolean(bond.bold);
    if (bond.order === toolOrder && hasSpecial) {
      ctx.onUpdateBond(bond.id, {
        order: bond.order,
        stereo: undefined,
        dative: false,
        dotted: false,
        aromatic: false,
        queryType: undefined,
        bold: false,
      });
      return true;
    }

    // A tool of a *different* order converts the bond outright (double tool on
    // a single bond → double, triple tool → triple, single tool → single).
    // Re-tapping with the tool that already matches bounces through the cycle.
    const ramp = bond.orderCycleRamp ?? 'up';
    let cycled: 1 | 2 | 3;
    if (bond.order !== toolOrder) {
      cycled = toolOrder;
    } else if (bond.order === 1) {
      cycled = 2;
    } else if (bond.order === 3) {
      cycled = 2;
    } else {
      cycled = ramp === 'up' ? 3 : 1;
    }

    // Over-filled atoms are *allowed* (the user may be mid-way through
    // converting a ring bond by bond); flash the atom as a heads-up and let
    // the persistent octet marker take over once the edit lands.
    if (from && to && cycled > bond.order) {
      const delta = cycled - bond.order;
      const fromV = getAtomValency(from.id, molecule);
      const toV = getAtomValency(to.id, molecule);
      const fromMax = getMaxValencyForElement(from.element, from.charge);
      const toMax = getMaxValencyForElement(to.element, to.charge);
      if (fromV + delta > fromMax) ctx.flashAtomError(from.id);
      else if (toV + delta > toMax) ctx.flashAtomError(to.id);
    }

    let orderCycleRamp: 'up' | 'down' | undefined;
    if (cycled === 2) {
      orderCycleRamp = bond.order === 3 ? 'down' : 'up';
    } else if (cycled === 3) {
      orderCycleRamp = undefined;
    } else {
      orderCycleRamp = 'up';
    }

    ctx.onUpdateBond(bond.id, {
      order: cycled,
      stereo: undefined,
      dative: false,
      dotted: false,
      aromatic: false,
      queryType: undefined,
      bold: false,
      orderCycleRamp,
    });
    return true;
  }

  if (atom) {
    // Drawing from a saturated atom is allowed (sketcher-liberal); the octet
    // marker flags the atom once the extra bond exists. No pre-emptive block.
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
  const { atom, bond } = pickAtomOrBondForBondTool(
    ctx.molecule,
    ctx.worldPos,
    ctx.hit.atomAttachRadius,
    ctx.hit.bondHitTolerance,
    ATTACH_OPTS,
  );
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
  const CLICK_DRAG_THRESHOLD = ctx.hit.clickDragThresholdPx;
  const ATOM_HIT_RADIUS = ctx.hit.atomAttachRadius;

  // Tiny single-bond click on an existing atom or its functional-group label:
  //   - H / other palette elements → relabel that atom (clears NH2 / COOH / …)
  //   - same element, no alias → fall through and sprout a bond
  if (distance < CLICK_DRAG_THRESHOLD && e.button === 0 && activeTool === 'single_bond') {
    const releaseAtom = pickAtomAt(molecule, worldPos, ATOM_HIT_RADIUS, {
      includeLabels: true,
      inflateLabelDisk: false,
    });
    if (releaseAtom) {
      const labeled = Boolean(releaseAtom.alias?.trim());
      if (placementElement === 'H') {
        if (releaseAtom.element !== 'H' || labeled) {
          ctx.onUpdateAtomElement?.(releaseAtom.id, 'H');
        }
        ctx.setDrawingBond(null);
        return true;
      }
      if (ctx.onUpdateAtomElement && (releaseAtom.element !== placementElement || labeled)) {
        ctx.onUpdateAtomElement(releaseAtom.id, placementElement);
        ctx.setDrawingBond(null);
        return true;
      }
    }
  }

  if (!ctx.drawingBond) return true;

  const tool = activeTool as BondToolId;
  const style = bondPatchForStyleTool(tool);
  const bondOrder = orderForTool(tool);
  const isClick = distance < CLICK_DRAG_THRESHOLD && e.button === 0;

  // ── Plain click (no drag) ────────────────────────────────────────────────
  // ChemDraw / Ketcher behaviour: a click places a whole bond, not nothing.
  //   - Existing atom → sprout a bond of the tool's order/style into the
  //     best free direction (120° zig-zag continuation, largest gap, …).
  //   - Empty canvas, carbon placement → horizontal C–C bond at the click.
  //   - Empty canvas, other element   → a single atom of that element (so the
  //     periodic-table palette + click still drops Na, Cl⁻, O… on their own).
  if (isClick) {
    const clickAtom = ctx.drawingBond.startAtomId
      ? molecule.atoms.find(a => a.id === ctx.drawingBond!.startAtomId) ?? null
      : pickAtomCenterAt(molecule, worldPos, ATOM_HIT_RADIUS);

    if (clickAtom && placementElement === 'H') {
      if (clickAtom.element !== 'H') ctx.onUpdateAtomElement?.(clickAtom.id, 'H');
      ctx.setDrawingBond(null);
      return true;
    }

    if (clickAtom) {
      const angle = bestSproutAngle(clickAtom, molecule, ctx.bondAngleSnapRad);
      const end = {
        x: clickAtom.x + Math.cos(angle) * ctx.bondLengthPx,
        y: clickAtom.y + Math.sin(angle) * ctx.bondLengthPx,
      };
      // Snap onto an atom that already sits where the sprout would land.
      const landing = pickAtomCenterAt(molecule, end, ctx.bondLengthPx * 0.3);
      if (!skipsValencyTool(tool)) {
        const v = getAtomValency(clickAtom.id, molecule);
        if (v + bondOrder > getMaxValencyForElement(clickAtom.element, clickAtom.charge)) {
          ctx.flashAtomError(clickAtom.id);
        }
      }
      let endId: string;
      if (landing && landing.id !== clickAtom.id) {
        endId = landing.id;
      } else {
        const newAtom: Atom = {
          id: Math.random().toString(36).substr(2, 9),
          element: placementElement,
          x: end.x,
          y: end.y,
          charge: 0,
        };
        ctx.onAddAtom?.(newAtom);
        endId = newAtom.id;
      }
      const exists = molecule.bonds.some(
        b =>
          (b.fromAtomId === clickAtom.id && b.toAtomId === endId) ||
          (b.fromAtomId === endId && b.toAtomId === clickAtom.id),
      );
      if (!exists) {
        ctx.onAddBond?.({
          id: Math.random().toString(36).substr(2, 9),
          fromAtomId: clickAtom.id,
          toAtomId: endId,
          order: bondOrder,
          stereo: style.stereo,
          dative: style.dative || undefined,
          dotted: style.dotted || undefined,
          aromatic: style.aromatic || undefined,
          queryType: style.queryType,
          bold: style.bold || undefined,
        });
      }
      ctx.setDrawingBond(null);
      return true;
    }

    ctx.setSelectedAtomIds?.([]);
    ctx.setSelectedCanvasTextId?.(null);
    ctx.setSelectedReactionArrowId?.(null);
    const start = ctx.drawingBond.startPos;
    const a: Atom = {
      id: Math.random().toString(36).substr(2, 9),
      element: placementElement,
      x: start.x,
      y: start.y,
      charge: 0,
    };
    ctx.onAddAtom?.(a);
    if (placementElement === 'C') {
      const b: Atom = {
        id: Math.random().toString(36).substr(2, 9),
        element: placementElement,
        x: start.x + ctx.bondLengthPx,
        y: start.y,
        charge: 0,
      };
      ctx.onAddAtom?.(b);
      ctx.onAddBond?.({
        id: Math.random().toString(36).substr(2, 9),
        fromAtomId: a.id,
        toAtomId: b.id,
        order: bondOrder,
        stereo: style.stereo,
        dative: style.dative || undefined,
        dotted: style.dotted || undefined,
        aromatic: style.aromatic || undefined,
        queryType: style.queryType,
        bold: style.bold || undefined,
      });
    }
    ctx.setDrawingBond(null);
    return true;
  }

  // Prefer the atom under the snapped bond tip; fall back to pointer. Tight radius
  // avoids gluing bond ends to crowded neighbors (OH/NH stacks, COF lattices);
  // touch uses a larger fraction because the finger hides the tip.
  const releaseRadius = Math.min(
    ATOM_HIT_RADIUS,
    ctx.bondLengthPx * ctx.hit.bondReleaseSnapFraction * ctx.hit.zoomScale,
  );
  const tip = ctx.drawingBond.currentPos;
  const releaseAtom =
    pickAtomCenterAt(molecule, tip, releaseRadius) ??
    pickAtomCenterAt(molecule, worldPos, releaseRadius);
  let startAtomId = ctx.drawingBond.startAtomId;
  let endAtomId = releaseAtom?.id;
  const startAtom = startAtomId ? molecule.atoms.find(a => a.id === startAtomId) : null;
  const startPos = startAtom ? { x: startAtom.x, y: startAtom.y } : ctx.drawingBond.startPos;
  const drawnLength = Math.hypot(startPos.x - tip.x, startPos.y - tip.y);
  const minBondDragPx = bondDragCommitThresholdPx(ctx.bondLengthPx);

  const atomsCreatedThisStroke: Atom[] = [];
  const atomById = (id: string): Atom | undefined =>
    molecule.atoms.find(a => a.id === id) ?? atomsCreatedThisStroke.find(a => a.id === id);

  if (releaseAtom) {
    // Heads-up flash when the landing atom will be over-filled; the bond is
    // still created and the persistent octet marker shows the overflow.
    if (!skipsValencyTool(tool) && releaseAtom.id !== startAtomId) {
      const currentValency = getAtomValency(releaseAtom.id, molecule);
      const maxValency = getMaxValencyForElement(releaseAtom.element, releaseAtom.charge);
      if (currentValency + bondOrder > maxValency) ctx.flashAtomError(releaseAtom.id);
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
        stereo: style.stereo,
        dative: style.dative || undefined,
        dotted: style.dotted || undefined,
        aromatic: style.aromatic || undefined,
        queryType: style.queryType,
        bold: style.bold || undefined,
      });
    }
  }

  ctx.setDrawingBond(null);
  return true;
};
