/**
 * Iterative bond-length correction for 2D-derived 3D coordinates.
 *
 * The "instant local" 3D path (`molecule3dWorker` GENERATE_3D) returns
 * a molblock whose atom positions come straight from the 2D canvas — every
 * bond is the same ~1.0 Å (canvas 40 px ÷ molblock divisor). Rendered in
 * 3Dmol that produces the "everything looks like the same length" complaint.
 *
 * This module runs a Jacobi-style spring relaxation on the parsed atom/bond
 * lists: every iteration, every bond pulls or pushes its endpoints toward
 * the chemically correct length (covalent-radius sum × bond-order factor).
 * Damping prevents oscillation; ~30 iterations converges most drug-like
 * molecules to <5% average bond-length error.
 *
 * NOTE this is NOT a real 3D embedding. Atoms stay in (or near) their input
 * plane — Z is preserved and only nudged along bonds that have non-zero Z
 * components. For real 3D coords (proper torsions, ring puckers) use the
 * CACTUS service or a full RDKit build with `EmbedMolecule`. This pass is
 * deliberately a "best-effort" fix-up that runs in microseconds and improves
 * the visual feel without adding a force-field dependency.
 */
import { targetBondLengthA, type BondOrderForLength } from './atomicData';

export interface MolAtom3D {
  element: string;
  x: number;
  y: number;
  z: number;
}

export interface MolBond3D {
  fromIdx: number;
  toIdx: number;
  order: BondOrderForLength;
}

export interface BondLengthCorrectionOptions {
  /** Iterations of the Jacobi pass. Default 30. */
  iterations?: number;
  /**
   * Per-iteration step size, in (0, 1]. Default 0.4 — empirically the best
   * trade-off between convergence speed and oscillation for typical small
   * organic molecules.
   */
  damping?: number;
}

/**
 * Mutates `atoms` in place. Each pass walks every bond and splits its length
 * error symmetrically between the two endpoints along the bond direction.
 */
export const correctBondLengths = (
  atoms: MolAtom3D[],
  bonds: ReadonlyArray<MolBond3D>,
  options: BondLengthCorrectionOptions = {},
): void => {
  const iterations = options.iterations ?? 30;
  const damping = options.damping ?? 0.4;

  for (let iter = 0; iter < iterations; iter++) {
    for (const b of bonds) {
      const a = atoms[b.fromIdx];
      const c = atoms[b.toIdx];
      if (!a || !c) continue;
      const dx = c.x - a.x;
      const dy = c.y - a.y;
      const dz = c.z - a.z;
      const L = Math.hypot(dx, dy, dz);
      if (L < 1e-6) continue;
      const T = targetBondLengthA(a.element, c.element, b.order);
      const halfDelta = ((T - L) * damping) / 2;
      const ux = dx / L;
      const uy = dy / L;
      const uz = dz / L;
      a.x -= ux * halfDelta;
      a.y -= uy * halfDelta;
      a.z -= uz * halfDelta;
      c.x += ux * halfDelta;
      c.y += uy * halfDelta;
      c.z += uz * halfDelta;
    }
  }
};

/**
 * Apply bond-length correction to a V2000 molblock and return a new molblock
 * string. Fails safe — on any parse error the input is returned unchanged.
 *
 * Atom block fields past column 30 (element symbol, charges, parity, valence,
 * H count, mapping) are preserved verbatim; only the X/Y/Z coordinate
 * triples are rewritten.
 */
export const correctMolblockBondLengths = (
  molblock: string,
  options: BondLengthCorrectionOptions = {},
): string => {
  const lines = molblock.split(/\r?\n/);
  if (lines.length < 5) return molblock;

  const counts = lines[3] || '';
  const numAtoms = parseInt(counts.substring(0, 3).trim() || '0', 10);
  const numBonds = parseInt(counts.substring(3, 6).trim() || '0', 10);
  if (!Number.isFinite(numAtoms) || numAtoms <= 0 || numAtoms > 10000) return molblock;
  if (!Number.isFinite(numBonds) || numBonds < 0 || numBonds > 20000) return molblock;
  if (numAtoms < 2 || numBonds === 0) return molblock;

  const atoms: MolAtom3D[] = [];
  for (let i = 0; i < numAtoms; i++) {
    const line = lines[4 + i];
    if (!line || line.length < 34) return molblock;
    const x = parseFloat(line.substring(0, 10).trim());
    const y = parseFloat(line.substring(10, 20).trim());
    const z = parseFloat(line.substring(20, 30).trim()) || 0;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return molblock;
    const element = line.substring(31, 34).trim();
    atoms.push({ element, x, y, z });
  }

  const bonds: MolBond3D[] = [];
  for (let i = 0; i < numBonds; i++) {
    const line = lines[4 + numAtoms + i];
    if (!line || line.length < 9) return molblock;
    const from = parseInt(line.substring(0, 3).trim(), 10);
    const to = parseInt(line.substring(3, 6).trim(), 10);
    const orderRaw = parseInt(line.substring(6, 9).trim(), 10);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return molblock;
    if (from < 1 || to < 1 || from > numAtoms || to > numAtoms) return molblock;
    const order: BondOrderForLength =
      orderRaw === 4 ? 'aromatic' : orderRaw === 2 ? 2 : orderRaw === 3 ? 3 : 1;
    bonds.push({ fromIdx: from - 1, toIdx: to - 1, order });
  }

  correctBondLengths(atoms, bonds, options);

  for (let i = 0; i < numAtoms; i++) {
    const idx = 4 + i;
    const orig = lines[idx];
    if (!orig) continue;
    const a = atoms[i];
    const xs = a.x.toFixed(4).padStart(10, ' ');
    const ys = a.y.toFixed(4).padStart(10, ' ');
    const zs = a.z.toFixed(4).padStart(10, ' ');
    lines[idx] = `${xs}${ys}${zs}${orig.substring(30)}`;
  }

  return lines.join('\n');
};
