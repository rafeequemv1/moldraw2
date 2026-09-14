/**
 * Boat cyclohexane — classic ChemDraw / textbook 2D boat silhouette.
 *
 * Six ring carbons only: bow + stern raised, floor as a parallelogram.
 * Plain single bonds (no wedge/dash, no axial H stubs).
 *
 * Ring order: bow → nearL → nearR → stern → farR → farL → bow
 */
const BOAT_OFFSETS = [
  { x: -38, y: -22 }, // bow (left peak)
  { x: -14, y: 2 }, // near-left
  { x: 14, y: 2 }, // near-right
  { x: 38, y: -22 }, // stern (right peak)
  { x: 26, y: 20 }, // far-right
  { x: -26, y: 20 }, // far-left
] as const;

const BOAT_TEMPLATE_EDGE =
  BOAT_OFFSETS.reduce((sum, p, i) => {
    const n = BOAT_OFFSETS[(i + 1) % BOAT_OFFSETS.length];
    return sum + Math.hypot(n.x - p.x, n.y - p.y);
  }, 0) / BOAT_OFFSETS.length;

export function boatRingVertices(
  center: { x: number; y: number },
  bondLengthPx: number,
): Array<{ x: number; y: number }> {
  const scale = bondLengthPx / BOAT_TEMPLATE_EDGE;
  return BOAT_OFFSETS.map(o => ({
    x: center.x + o.x * scale,
    y: center.y + o.y * scale,
  }));
}

export function boatRingIconPoints(): string {
  const scale = 18 / 56;
  const cx = 10;
  const cy = 10;
  return BOAT_OFFSETS.map(o => `${cx + o.x * scale},${cy + o.y * scale}`).join(' ');
}

/** Previous cup / trapezoid template (wide keel) — not the textbook boat. */
export const LEGACY_BOAT_OFFSETS_CUP = [
  { x: -12, y: -18 },
  { x: 12, y: -18 },
  { x: 28, y: 2 },
  { x: 20, y: 20 },
  { x: -20, y: 20 },
  { x: -28, y: 2 },
] as const;

/** Previous inverted cup template (wide top / narrow keel). */
export const LEGACY_BOAT_OFFSETS_INVERTED = [
  { x: -25, y: 8 },
  { x: -25, y: -10 },
  { x: 25, y: -10 },
  { x: 25, y: 8 },
  { x: 12, y: 20 },
  { x: -12, y: 20 },
] as const;

/** Previous template (ChairBoatTool baseBoat) — W-shaped top; kept for debug diff. */
export const LEGACY_BOAT_OFFSETS_V1 = [
  { x: -115, y: 5.667 },
  { x: -59, y: -18.333 },
  { x: -1, y: -0.333 },
  { x: 59, y: -18.333 },
  { x: 117, y: 5.667 },
  { x: -1, y: 25.667 },
] as const;

export const LEGACY_BOAT_OFFSETS = [
  { x: -72, y: 8 },
  { x: -36, y: -16 },
  { x: 2, y: 0 },
  { x: 40, y: -16 },
  { x: 76, y: 8 },
  { x: 2, y: 28 },
] as const;
