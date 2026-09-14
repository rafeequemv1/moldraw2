import type { Atom, Bond, Molecule } from '@moldraw/domain';

const rot2 = (x: number, y: number, deg: number) => {
  const t = (deg * Math.PI) / 180;
  return { x: x * Math.cos(t) - y * Math.sin(t), y: x * Math.sin(t) + y * Math.cos(t) };
};

/**
 * Fixed 2D layout for acetylsalicylic acid (aspirin) — preview-only.
 * Regular benzene ring; carboxyl at vertex 0 along radial; acetoxy at vertex 1 along radial;
 * trigonal geometry at carboxyl carbon and acetyl carbon.
 */
export function createAspirinMolecule(): Molecule {
  const cx = 160;
  const cy = 120;
  const R = 40;
  const ring: Atom[] = [];
  for (let i = 0; i < 6; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 3;
    ring.push({
      id: `asp_r${i}`,
      element: 'C',
      x: cx + R * Math.cos(ang),
      y: cy + R * Math.sin(ang),
      charge: 0,
    });
  }
  const r0 = ring[0]!;
  const r1 = ring[1]!;

  const rad0 = Math.atan2(r0.y - cy, r0.x - cx);
  const out0x = Math.cos(rad0);
  const out0y = Math.sin(rad0);
  const bRing = 52;
  const cCarboxyl: Atom = {
    id: 'asp_c7',
    element: 'C',
    x: r0.x + out0x * bRing,
    y: r0.y + out0y * bRing,
    charge: 0,
  };

  const vx = r0.x - cCarboxyl.x;
  const vy = r0.y - cCarboxyl.y;
  const vlen = Math.hypot(vx, vy) || 1;
  const b0x = vx / vlen;
  const b0y = vy / vlen;
  const dO1 = rot2(b0x, b0y, 120);
  const dO2 = rot2(b0x, b0y, -120);
  const bo = 40;
  const oCarbonyl: Atom = {
    id: 'asp_o8',
    element: 'O',
    x: cCarboxyl.x + dO1.x * bo,
    y: cCarboxyl.y + dO1.y * bo,
    charge: 0,
  };
  const oHydroxyl: Atom = {
    id: 'asp_o9',
    element: 'O',
    x: cCarboxyl.x + dO2.x * bo,
    y: cCarboxyl.y + dO2.y * bo,
    charge: 0,
    alias: 'OH',
  };

  const rad1 = Math.atan2(r1.y - cy, r1.x - cx);
  const out1x = Math.cos(rad1);
  const out1y = Math.sin(rad1);
  const oEster: Atom = {
    id: 'asp_o10',
    element: 'O',
    x: r1.x + out1x * 44,
    y: r1.y + out1y * 44,
    charge: 0,
  };

  const uox = oEster.x - r1.x;
  const uoy = oEster.y - r1.y;
  const uol = Math.hypot(uox, uoy) || 1;
  const uex = uox / uol;
  const uey = uoy / uol;
  const cAcetyl: Atom = {
    id: 'asp_c11',
    element: 'C',
    x: oEster.x + uex * 42,
    y: oEster.y + uey * 42,
    charge: 0,
  };

  const pnx = -uey;
  const pny = uex;
  const oAcetyl: Atom = {
    id: 'asp_o12',
    element: 'O',
    x: cAcetyl.x + pnx * 36,
    y: cAcetyl.y + pny * 36,
    charge: 0,
  };

  const cMethyl: Atom = {
    id: 'asp_c13',
    element: 'C',
    x: cAcetyl.x - uex * 40 + pnx * 4,
    y: cAcetyl.y - uey * 40 + pny * 4,
    charge: 0,
    alias: 'CH₃',
  };

  const atoms: Atom[] = [...ring, cCarboxyl, oCarbonyl, oHydroxyl, oEster, cAcetyl, oAcetyl, cMethyl];

  const bonds: Bond[] = [
    { id: 'asp_b01', fromAtomId: 'asp_r0', toAtomId: 'asp_r1', order: 1 },
    { id: 'asp_b12', fromAtomId: 'asp_r1', toAtomId: 'asp_r2', order: 2 },
    { id: 'asp_b23', fromAtomId: 'asp_r2', toAtomId: 'asp_r3', order: 1 },
    { id: 'asp_b34', fromAtomId: 'asp_r3', toAtomId: 'asp_r4', order: 2 },
    { id: 'asp_b45', fromAtomId: 'asp_r4', toAtomId: 'asp_r5', order: 1 },
    { id: 'asp_b50', fromAtomId: 'asp_r5', toAtomId: 'asp_r0', order: 2 },
    { id: 'asp_b_r0_c7', fromAtomId: 'asp_r0', toAtomId: 'asp_c7', order: 1 },
    { id: 'asp_b_c7_o8', fromAtomId: 'asp_c7', toAtomId: 'asp_o8', order: 2 },
    { id: 'asp_b_c7_o9', fromAtomId: 'asp_c7', toAtomId: 'asp_o9', order: 1 },
    { id: 'asp_b_r1_o10', fromAtomId: 'asp_r1', toAtomId: 'asp_o10', order: 1 },
    { id: 'asp_b_o10_c11', fromAtomId: 'asp_o10', toAtomId: 'asp_c11', order: 1 },
    { id: 'asp_b_c11_o12', fromAtomId: 'asp_c11', toAtomId: 'asp_o12', order: 2 },
    { id: 'asp_b_c11_c13', fromAtomId: 'asp_c11', toAtomId: 'asp_c13', order: 1 },
  ];

  return { atoms, bonds };
}

/** Scale coordinates so the median bond length matches the canvas bond-length setting. */
export function scaleMoleculeToBondLength(mol: Molecule, targetBondLengthPx: number): Molecule {
  const lens: number[] = [];
  const byId = new Map(mol.atoms.map(a => [a.id, a]));
  for (const b of mol.bonds) {
    const a = byId.get(b.fromAtomId);
    const c = byId.get(b.toAtomId);
    if (!a || !c) continue;
    const len = Math.hypot(c.x - a.x, c.y - a.y);
    if (len > 1e-6) lens.push(len);
  }
  if (lens.length === 0) return mol;
  lens.sort((x, y) => x - y);
  const median = lens[Math.floor(lens.length / 2)]!;
  const scale = targetBondLengthPx / median;
  if (!Number.isFinite(scale) || Math.abs(scale - 1) < 1e-6) return mol;
  return {
    ...mol,
    atoms: mol.atoms.map(a => ({ ...a, x: a.x * scale, y: a.y * scale })),
  };
}

export function fitMoleculeToCanvas(mol: Molecule, canvasW: number, canvasH: number, pad: number): Molecule {
  if (mol.atoms.length === 0) return mol;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const a of mol.atoms) {
    minX = Math.min(minX, a.x);
    minY = Math.min(minY, a.y);
    maxX = Math.max(maxX, a.x);
    maxY = Math.max(maxY, a.y);
  }
  const bw = Math.max(1e-6, maxX - minX);
  const bh = Math.max(1e-6, maxY - minY);
  const innerW = Math.max(1, canvasW - pad * 2);
  const innerH = Math.max(1, canvasH - pad * 2);
  const scale = Math.min(innerW / bw, innerH / bh) * 0.9;
  const mx = (minX + maxX) / 2;
  const my = (minY + maxY) / 2;
  const tx = canvasW / 2;
  const ty = canvasH / 2;
  return {
    ...mol,
    atoms: mol.atoms.map(a => ({
      ...a,
      x: (a.x - mx) * scale + tx,
      y: (a.y - my) * scale + ty,
    })),
  };
}
