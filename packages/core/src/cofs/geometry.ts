/** Shared 2D helpers for COF lattice builders. */

export const wrapPi = (delta: number): number => {
  let d = delta;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};

export const nearestAngle = (target: number, candidates: readonly number[]): number => {
  let best = candidates[0] ?? 0;
  let bestD = Infinity;
  for (const c of candidates) {
    const d = Math.abs(wrapPi(target - c));
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
};

export const posKey = (x: number, y: number): string =>
  `${Math.round(x * 20)},${Math.round(y * 20)}`;

export const hexVertex = (
  cx: number,
  cy: number,
  radius: number,
  angle: number,
): { x: number; y: number } => ({
  x: cx + radius * Math.cos(angle),
  y: cy + radius * Math.sin(angle),
});

export const hexPoints = (
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
): Array<{ x: number; y: number }> => {
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < 6; i++) {
    out.push(hexVertex(cx, cy, radius, startAngle + (i * Math.PI) / 3));
  }
  return out;
};

/** Flat-top axial → world (same convention as graphene). `size` is center → vertex. */
export const axialToWorld = (q: number, r: number, size: number): { x: number; y: number } => ({
  x: size * ((3 / 2) * q),
  y: size * ((Math.sqrt(3) / 2) * q + Math.sqrt(3) * r),
});

/** Rectangular hex-cell grid via odd-q offset → axial. */
export const rectangularHexCells = (cols: number, rows: number): Array<{ q: number; r: number }> => {
  const out: Array<{ q: number; r: number }> = [];
  const col0 = -Math.floor((cols - 1) / 2);
  const row0 = -Math.floor((rows - 1) / 2);
  for (let ci = 0; ci < cols; ci++) {
    for (let ri = 0; ri < rows; ri++) {
      const col = col0 + ci;
      const row = row0 + ri;
      const q = col;
      const r = row - (col - (col & 1)) / 2;
      out.push({ q, r });
    }
  }
  return out;
};
