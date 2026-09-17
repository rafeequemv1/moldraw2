/**
 * Chair cyclohexane — exact geometry from hex.mol (C1CCCCC1, RDKit/MolDraw).
 * Ring order: atoms 1→2→3→4→5→6→1 per the mol bond block.
 *
 * Canvas transform matches `parseMolblock` in molblock.ts:
 *   x = molX * bondLengthPx,  y = -molY * bondLengthPx
 */
export const HEX_MOL_CHAIR_ATOMS = [
  { x: -2.253, y: 2.7519 },
  { x: -2.753, y: 3.6179 },
  { x: -1.7871, y: 3.3591 },
  { x: -0.8212, y: 3.6179 },
  { x: -0.3212, y: 2.7519 },
  { x: -1.2871, y: 3.0108 },
] as const;

/** Same Y flip + scale as molblock import (mean C–C bond length ≈ 1 in this file). */
export function molChairCoordToCanvas(
  molX: number,
  molY: number,
  bondLengthPx: number,
): { x: number; y: number } {
  return { x: molX * bondLengthPx, y: -molY * bondLengthPx };
}

export function chairRingVertices(
  center: { x: number; y: number },
  bondLengthPx: number,
  rotationRad = 0,
): Array<{ x: number; y: number }> {
  const canvas = HEX_MOL_CHAIR_ATOMS.map(a => molChairCoordToCanvas(a.x, a.y, bondLengthPx));
  const cx = canvas.reduce((s, p) => s + p.x, 0) / canvas.length;
  const cy = canvas.reduce((s, p) => s + p.y, 0) / canvas.length;
  const c = Math.cos(rotationRad);
  const s = Math.sin(rotationRad);
  return canvas.map(p => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    return { x: dx * c - dy * s + center.x, y: dx * s + dy * c + center.y };
  });
}

/** SVG points for toolbar icon (viewBox 0 0 20 20). */
export function chairRingIconPoints(): string {
  return chairRingVertices({ x: 10, y: 10 }, 5.8)
    .map(v => `${v.x.toFixed(2)},${v.y.toFixed(2)}`)
    .join(' ');
}
