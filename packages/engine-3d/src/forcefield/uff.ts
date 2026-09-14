/**
 * UFF energy + gradient for a molecule.
 *
 * Terms: bond stretch, angle bend, torsion, and van der Waals (LJ 12-6).
 * Bond/angle/vdW use analytical gradients; torsion uses a *local* finite
 * difference over its four atoms (cheap and numerically robust, avoids
 * dihedral-derivative sign bugs). Non-bonded pairs are found with a cell list
 * so cost stays near-linear for large structures.
 *
 * Coordinates are a flat Float64Array [x0,y0,z0, x1,y1,z1, ...] in Ångström.
 */
import type { Molecule } from '@moldraw/domain';
import { buildGraph } from '@moldraw/engine';
import { perceiveHybridization, type Hybridization } from '../hybridization';
import {
  assignUffTypes,
  coordinationGeometryFor,
  uffBondForceConstant,
  uffBondLength,
  uffParamsFor,
  type CoordinationGeometry,
  type UffType,
} from './uffParams';

const DEG2RAD = Math.PI / 180;
const VDW_CUTOFF = 12; // Å

interface BondTerm {
  i: number;
  j: number;
  r0: number;
  kb: number;
}
/**
 * Angle bend. `kind`:
 *  - `harmonic`  UFF cosine-Fourier expansion around theta0 (c0/c1/c2)
 *  - `linear`    K(1 + cos θ) for 180° centres
 *  - `periodic4` K/16 · (1 − cos 4θ): minima at 90° and 180° — square-planar /
 *                octahedral coordination centres (UFF's own form for θ0 = 90°)
 *  - `multiwell` nearest of several harmonic wells (`wellCos` / `wellK`) — used
 *                for trigonal-bipyramidal (90/120/180) and higher coordination.
 */
interface AngleTerm {
  i: number;
  j: number;
  k: number;
  ka: number;
  c0: number;
  c1: number;
  c2: number;
  kind: 'harmonic' | 'linear' | 'periodic4' | 'multiwell';
  /** multiwell: cos θ_t per well (NaN marks the 180° well, handled as linear). */
  wellCos?: number[];
  /** multiwell: per-well stiffness so each well has curvature `ka` at its minimum. */
  wellK?: number[];
}
interface TorsionTerm {
  i: number;
  j: number;
  k: number;
  l: number;
  V: number;
  n: number;
  cosNphi0: number;
}

/** Tetrahedral chirality restraint: keep triple((a-c),(b-c),(d-c)) at `sign`. */
export interface ChiralTerm {
  c: number;
  a: number;
  b: number;
  d: number;
  sign: number;
  k: number;
}
/** Double-bond geometry restraint on the i–j=k–l dihedral toward `desiredCos`. */
export interface CisTransTerm {
  i: number;
  j: number;
  k: number;
  l: number;
  desiredCos: number;
  k2: number;
}

export interface UffTopology {
  n: number;
  ids: string[];
  bonds: BondTerm[];
  angles: AngleTerm[];
  torsions: TorsionTerm[];
  vdwX: Float64Array; // per-atom vdW distance
  vdwD: Float64Array; // per-atom vdW well depth
  excluded: Set<number>; // packed i*n+j (i<j) for 1-2 and 1-3 pairs
  /** Optional stereochemistry restraints (empty unless added). */
  chirals: ChiralTerm[];
  cisTrans: CisTransTerm[];
}

const packPair = (a: number, b: number, n: number): number => (a < b ? a * n + b : b * n + a);

const torsionParams = (
  hj: Hybridization,
  hk: Hybridization,
  pj: UffType,
  pk: UffType,
  bo: number,
): { V: number; n: number; cosNphi0: number } | null => {
  // Linear centers have no meaningful torsion; metal–ligand bonds rotate freely.
  if (hj === 'sp' || hk === 'sp') return null;
  if (pj.metal || pk.metal) return null;
  if (hj === 'sp3' && hk === 'sp3') {
    const V = Math.sqrt((pj.Vsp3 || 0.1) * (pk.Vsp3 || 0.1));
    return { V, n: 3, cosNphi0: Math.cos(3 * 180 * DEG2RAD) }; // = -1 (staggered)
  }
  if (hj === 'sp2' && hk === 'sp2') {
    const V = 5 * Math.sqrt((pj.Usp2 || 2) * (pk.Usp2 || 2)) * (1 + 4.18 * Math.log(Math.max(1, bo)));
    return { V, n: 2, cosNphi0: Math.cos(2 * 180 * DEG2RAD) }; // = 1 (planar)
  }
  // Mixed sp2–sp3: small six-fold barrier.
  return { V: 1.0, n: 6, cosNphi0: Math.cos(0) };
};

export const buildUffTopology = (mol: Molecule): UffTopology => {
  const g = buildGraph(mol);
  const hyb = perceiveHybridization(mol, g);
  const types = assignUffTypes(mol, g, hyb);

  const ids = mol.atoms.map(a => a.id);
  const index = new Map<string, number>();
  ids.forEach((id, i) => index.set(id, i));
  const n = ids.length;

  const paramOf = (id: string): UffType => uffParamsFor(types.get(id) ?? 'C_3');

  // Bonds.
  const bonds: BondTerm[] = [];
  const bondR0 = new Map<string, number>(); // "i|j" sorted → r0
  for (const b of mol.bonds) {
    const i = index.get(b.fromAtomId);
    const j = index.get(b.toAtomId);
    if (i === undefined || j === undefined) continue;
    const pa = paramOf(b.fromAtomId);
    const pb = paramOf(b.toAtomId);
    const bo = b.aromatic ? 1.5 : b.order || 1;
    const r0 = uffBondLength(pa, pb, bo);
    const kb = uffBondForceConstant(pa, pb, r0);
    bonds.push({ i, j, r0, kb });
    bondR0.set(packPair(i, j, n).toString(), r0);
  }

  // Angles + exclusions (1-2 from bonds, 1-3 from angles).
  const excluded = new Set<number>();
  for (const b of bonds) excluded.add(packPair(b.i, b.j, n));

  const angles: AngleTerm[] = [];
  for (const center of mol.atoms) {
    const j = index.get(center.id)!;
    const neigh = g.nodes.get(center.id)?.neighbors ?? [];
    if (neigh.length < 2) continue;
    const pj = paramOf(center.id);

    // Coordination centres: geometry from the coordination number (octahedral,
    // square-planar, TBP…) rather than a single organic theta0.
    const geometry: CoordinationGeometry = pj.metal
      ? coordinationGeometryFor(center.element, neigh.length, center.charge ?? 0)
      : pj.theta0 >= 179.5
        ? { kind: 'linear' }
        : { kind: 'harmonic', theta0: pj.theta0 };

    // Reference angle used for the UFF force-constant formula.
    const theta0Deg =
      geometry.kind === 'harmonic'
        ? geometry.theta0
        : geometry.kind === 'linear'
          ? 180
          : 90;
    const theta0 = theta0Deg * DEG2RAD;
    const cos0 = Math.cos(theta0);
    const sin0 = Math.sin(theta0);
    let c0 = 0;
    let c1 = 0;
    let c2 = 0;
    if (geometry.kind === 'harmonic' && Math.abs(sin0) > 1e-6) {
      c2 = 1 / (4 * sin0 * sin0);
      c1 = -4 * c2 * cos0;
      c0 = c2 * (2 * cos0 * cos0 + 1);
    }
    let wellCos: number[] | undefined;
    let wellK: number[] | undefined;
    if (geometry.kind === 'multiwell') {
      wellCos = geometry.thetas.map(t => (t >= 179.5 ? Number.NaN : Math.cos(t * DEG2RAD)));
      // Each well: E = wellK · (cos θ − cos θ_t)² with curvature ka at θ_t.
      wellK = geometry.thetas.map(t => {
        const s = Math.sin(t * DEG2RAD);
        return s > 1e-6 ? 1 / (2 * s * s) : 1;
      });
    }

    for (let a = 0; a < neigh.length; a++) {
      for (let b = a + 1; b < neigh.length; b++) {
        const i = index.get(neigh[a])!;
        const k = index.get(neigh[b])!;
        const rij = bondR0.get(packPair(i, j, n).toString());
        const rjk = bondR0.get(packPair(j, k, n).toString());
        if (rij === undefined || rjk === undefined) continue;
        const pi = paramOf(neigh[a]);
        const pk = paramOf(neigh[b]);
        const rik2 = rij * rij + rjk * rjk - 2 * rij * rjk * cos0;
        const rik = Math.sqrt(Math.max(rik2, 1e-6));
        let ka =
          (664.12 * pi.Zstar * pk.Zstar) / Math.pow(rik, 5) *
          rij * rjk *
          (3 * rij * rjk * (1 - cos0 * cos0) - rik2 * cos0);
        ka = Math.max(0, ka);
        // Ligand–metal–ligand bends are soft in UFF; give coordination centres a
        // floor so the polyhedron actually forms instead of collapsing.
        if (pj.metal) ka = Math.max(ka, 40);
        angles.push({
          i,
          j,
          k,
          ka,
          c0,
          c1,
          c2,
          kind: geometry.kind,
          ...(wellCos ? { wellCos, wellK } : {}),
        });
        excluded.add(packPair(i, k, n));
      }
    }
  }

  // Torsions.
  const torsions: TorsionTerm[] = [];
  const bondOrderOf = new Map<string, number>();
  for (const b of mol.bonds) {
    const i = index.get(b.fromAtomId);
    const j = index.get(b.toAtomId);
    if (i === undefined || j === undefined) continue;
    bondOrderOf.set(packPair(i, j, n).toString(), b.aromatic ? 1.5 : b.order || 1);
  }
  for (const b of mol.bonds) {
    const j = index.get(b.fromAtomId);
    const k = index.get(b.toAtomId);
    if (j === undefined || k === undefined) continue;
    const nj = g.nodes.get(b.fromAtomId)?.neighbors ?? [];
    const nk = g.nodes.get(b.toAtomId)?.neighbors ?? [];
    if (nj.length < 2 || nk.length < 2) continue;
    const hj = hyb.get(b.fromAtomId) ?? 'sp3';
    const hk = hyb.get(b.toAtomId) ?? 'sp3';
    const bo = bondOrderOf.get(packPair(j, k, n).toString()) ?? 1;
    const tp = torsionParams(hj, hk, paramOf(b.fromAtomId), paramOf(b.toAtomId), bo);
    if (!tp || tp.V <= 1e-6) continue;
    const count = (nj.length - 1) * (nk.length - 1);
    const Vscaled = tp.V / Math.max(1, count);
    for (const iId of nj) {
      const i = index.get(iId)!;
      if (i === k) continue;
      for (const lId of nk) {
        const l = index.get(lId)!;
        if (l === j || l === i) continue;
        torsions.push({ i, j, k, l, V: Vscaled, n: tp.n, cosNphi0: tp.cosNphi0 });
      }
    }
  }

  // vdW per-atom params.
  const vdwX = new Float64Array(n);
  const vdwD = new Float64Array(n);
  ids.forEach((id, i) => {
    const p = paramOf(id);
    vdwX[i] = p.x;
    vdwD[i] = p.D;
  });

  return { n, ids, bonds, angles, torsions, vdwX, vdwD, excluded, chirals: [], cisTrans: [] };
};

/** Chirality restraint activates only when the wrong handedness needs flipping. */
const CHIRAL_MARGIN = 1.0;
const CHIRAL_K = 5;
const CISTRANS_K = 10;

/**
 * Attach stereochemistry restraints to a topology, resolving atom ids to
 * indices. Ids that aren't present in this conformer are skipped.
 */
export const setStereoTerms = (
  topo: UffTopology,
  constraints: {
    chirals: { center: string; n1: string; n2: string; n3: string; sign: number }[];
    cisTrans: { i: string; j: string; k: string; l: string; desiredCos: number }[];
  },
  indexOf: Map<string, number>,
): void => {
  const idx = (id: string): number | undefined => indexOf.get(id);
  topo.chirals = [];
  for (const c of constraints.chirals) {
    const ci = idx(c.center);
    const ai = idx(c.n1);
    const bi = idx(c.n2);
    const di = idx(c.n3);
    if (ci === undefined || ai === undefined || bi === undefined || di === undefined) continue;
    topo.chirals.push({ c: ci, a: ai, b: bi, d: di, sign: c.sign, k: CHIRAL_K });
  }
  topo.cisTrans = [];
  for (const t of constraints.cisTrans) {
    const i = idx(t.i);
    const j = idx(t.j);
    const k = idx(t.k);
    const l = idx(t.l);
    if (i === undefined || j === undefined || k === undefined || l === undefined) continue;
    topo.cisTrans.push({ i, j, k, l, desiredCos: t.desiredCos, k2: CISTRANS_K });
  }
};

// ── geometry helpers on the flat coord array ────────────────────────────────
const gx = (c: Float64Array, i: number): number => c[i * 3];
const gy = (c: Float64Array, i: number): number => c[i * 3 + 1];
const gz = (c: Float64Array, i: number): number => c[i * 3 + 2];

/** Minimum cross-product norm before a dihedral is treated as singular. */
const TORSION_SINGULAR = 0.1;

/**
 * Torsion energy for one dihedral, or 0 when the geometry is near-collinear
 * (i–j–k or j–k–l almost straight). Damping to zero there is standard practice:
 * dφ/dx diverges at collinearity, so an unguarded term produces an enormous,
 * unphysical force that stalls the minimizer. The same guard is used for the
 * energy and the finite-difference gradient so the two stay consistent.
 */
const torsionEnergyAt = (
  c: Float64Array,
  i: number,
  j: number,
  k: number,
  l: number,
  V: number,
  nn: number,
  cosNphi0: number,
): number => {
  const b1x = gx(c, j) - gx(c, i), b1y = gy(c, j) - gy(c, i), b1z = gz(c, j) - gz(c, i);
  const b2x = gx(c, k) - gx(c, j), b2y = gy(c, k) - gy(c, j), b2z = gz(c, k) - gz(c, j);
  const b3x = gx(c, l) - gx(c, k), b3y = gy(c, l) - gy(c, k), b3z = gz(c, l) - gz(c, k);
  const n1x = b1y * b2z - b1z * b2y, n1y = b1z * b2x - b1x * b2z, n1z = b1x * b2y - b1y * b2x;
  const n2x = b2y * b3z - b2z * b3y, n2y = b2z * b3x - b2x * b3z, n2z = b2x * b3y - b2y * b3x;
  const n1len = Math.sqrt(n1x * n1x + n1y * n1y + n1z * n1z);
  const n2len = Math.sqrt(n2x * n2x + n2y * n2y + n2z * n2z);
  if (n1len < TORSION_SINGULAR || n2len < TORSION_SINGULAR) return 0;
  const m1x = n1y * b2z - n1z * b2y, m1y = n1z * b2x - n1x * b2z, m1z = n1x * b2y - n1y * b2x;
  const b2len = Math.sqrt(b2x * b2x + b2y * b2y + b2z * b2z) || 1e-9;
  const y = (m1x * n2x + m1y * n2y + m1z * n2z) / b2len;
  const x = n1x * n2x + n1y * n2y + n1z * n2z;
  const phi = Math.atan2(y, x);
  return 0.5 * V * (1 - cosNphi0 * Math.cos(nn * phi));
};

/**
 * Compute UFF energy and (optionally) accumulate gradient into `grad`.
 * Returns total energy in kcal/mol.
 *
 * When `activeAtoms` is set, only terms that touch at least one active atom
 * are evaluated — critical for region refine (otherwise every step still
 * costs a full-molecule UFF pass).
 */
export const uffEnergyAndGradient = (
  topo: UffTopology,
  coords: Float64Array,
  grad: Float64Array | null,
  activeAtoms?: boolean[],
): number => {
  const n = topo.n;
  if (grad) grad.fill(0);
  let energy = 0;
  const anyActive = (...idxs: number[]): boolean => {
    if (!activeAtoms) return true;
    for (const i of idxs) if (activeAtoms[i]) return true;
    return false;
  };

  // Bonds (harmonic).
  for (const b of topo.bonds) {
    if (!anyActive(b.i, b.j)) continue;
    const dx = gx(coords, b.j) - gx(coords, b.i);
    const dy = gy(coords, b.j) - gy(coords, b.i);
    const dz = gz(coords, b.j) - gz(coords, b.i);
    const r = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
    const dr = r - b.r0;
    energy += 0.5 * b.kb * dr * dr;
    if (grad) {
      const f = (b.kb * dr) / r;
      grad[b.i * 3] -= f * dx; grad[b.i * 3 + 1] -= f * dy; grad[b.i * 3 + 2] -= f * dz;
      grad[b.j * 3] += f * dx; grad[b.j * 3 + 1] += f * dy; grad[b.j * 3 + 2] += f * dz;
    }
  }

  // Angles (cosine-Fourier / linear).
  for (const a of topo.angles) {
    if (!anyActive(a.i, a.j, a.k)) continue;
    const ux = gx(coords, a.i) - gx(coords, a.j);
    const uy = gy(coords, a.i) - gy(coords, a.j);
    const uz = gz(coords, a.i) - gz(coords, a.j);
    const vx = gx(coords, a.k) - gx(coords, a.j);
    const vy = gy(coords, a.k) - gy(coords, a.j);
    const vz = gz(coords, a.k) - gz(coords, a.j);
    const nu = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1e-9;
    const nv = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1e-9;
    let cosT = (ux * vx + uy * vy + uz * vz) / (nu * nv);
    cosT = Math.max(-1, Math.min(1, cosT));

    let e: number;
    let dEdcos: number;
    switch (a.kind) {
      case 'linear':
        e = a.ka * (1 + cosT);
        dEdcos = a.ka;
        break;
      case 'periodic4': {
        // K/16 · (1 − cos 4θ) = (K/2)(c² − c⁴): minima at 90° and 180°.
        const c2 = cosT * cosT;
        e = 0.5 * a.ka * (c2 - c2 * c2);
        dEdcos = a.ka * (cosT - 2 * cosT * c2);
        break;
      }
      case 'multiwell': {
        // Nearest well wins (energy is continuous; gradient piecewise).
        e = Infinity;
        dEdcos = 0;
        const wc = a.wellCos!;
        const wk = a.wellK!;
        for (let w = 0; w < wc.length; w++) {
          const ct = wc[w]!;
          let ew: number;
          let dw: number;
          if (Number.isNaN(ct)) {
            ew = a.ka * (1 + cosT);
            dw = a.ka;
          } else {
            const d = cosT - ct;
            ew = a.ka * wk[w]! * d * d;
            dw = 2 * a.ka * wk[w]! * d;
          }
          if (ew < e) {
            e = ew;
            dEdcos = dw;
          }
        }
        if (!Number.isFinite(e)) {
          e = 0;
          dEdcos = 0;
        }
        break;
      }
      default: {
        const cos2 = 2 * cosT * cosT - 1;
        e = a.ka * (a.c0 + a.c1 * cosT + a.c2 * cos2);
        dEdcos = a.ka * (a.c1 + 4 * a.c2 * cosT);
      }
    }
    energy += e;
    if (grad) {
      // dcos/dpos
      const dci_x = (vx / (nu * nv)) - (cosT * ux) / (nu * nu);
      const dci_y = (vy / (nu * nv)) - (cosT * uy) / (nu * nu);
      const dci_z = (vz / (nu * nv)) - (cosT * uz) / (nu * nu);
      const dck_x = (ux / (nu * nv)) - (cosT * vx) / (nv * nv);
      const dck_y = (uy / (nu * nv)) - (cosT * vy) / (nv * nv);
      const dck_z = (uz / (nu * nv)) - (cosT * vz) / (nv * nv);
      grad[a.i * 3] += dEdcos * dci_x; grad[a.i * 3 + 1] += dEdcos * dci_y; grad[a.i * 3 + 2] += dEdcos * dci_z;
      grad[a.k * 3] += dEdcos * dck_x; grad[a.k * 3 + 1] += dEdcos * dck_y; grad[a.k * 3 + 2] += dEdcos * dck_z;
      grad[a.j * 3] -= dEdcos * (dci_x + dck_x);
      grad[a.j * 3 + 1] -= dEdcos * (dci_y + dck_y);
      grad[a.j * 3 + 2] -= dEdcos * (dci_z + dck_z);
    }
  }

  // Torsions (local finite-difference gradient, singularity-damped).
  for (const t of topo.torsions) {
    if (!anyActive(t.i, t.j, t.k, t.l)) continue;
    energy += torsionEnergyAt(coords, t.i, t.j, t.k, t.l, t.V, t.n, t.cosNphi0);
    if (grad) {
      const h = 1e-4;
      const atoms = [t.i, t.j, t.k, t.l];
      for (const ai of atoms) {
        for (let d = 0; d < 3; d++) {
          const off = ai * 3 + d;
          const orig = coords[off];
          coords[off] = orig + h;
          const ep = torsionEnergyAt(coords, t.i, t.j, t.k, t.l, t.V, t.n, t.cosNphi0);
          coords[off] = orig - h;
          const em = torsionEnergyAt(coords, t.i, t.j, t.k, t.l, t.V, t.n, t.cosNphi0);
          coords[off] = orig;
          grad[off] += (ep - em) / (2 * h);
        }
      }
    }
  }

  // Van der Waals (LJ 12-6) with cell-list neighbor search.
  energy += vdwEnergyAndGradient(topo, coords, grad, n, activeAtoms);

  // Stereochemistry restraints (local finite-difference gradients).
  for (const t of topo.chirals) {
    if (!anyActive(t.c, t.a, t.b, t.d)) continue;
    energy += chiralEnergyAt(coords, t);
    if (grad) localFdGrad(coords, grad, [t.c, t.a, t.b, t.d], () => chiralEnergyAt(coords, t));
  }
  for (const t of topo.cisTrans) {
    if (!anyActive(t.i, t.j, t.k, t.l)) continue;
    energy += cisTransEnergyAt(coords, t);
    if (grad) localFdGrad(coords, grad, [t.i, t.j, t.k, t.l], () => cisTransEnergyAt(coords, t));
  }

  return energy;
};

/** Accumulate a finite-difference gradient over just `atoms` for a local term. */
const localFdGrad = (
  coords: Float64Array,
  grad: Float64Array,
  atoms: number[],
  energyFn: () => number,
): void => {
  const h = 1e-4;
  for (const ai of atoms) {
    for (let d = 0; d < 3; d++) {
      const off = ai * 3 + d;
      const orig = coords[off];
      coords[off] = orig + h;
      const ep = energyFn();
      coords[off] = orig - h;
      const em = energyFn();
      coords[off] = orig;
      grad[off] += (ep - em) / (2 * h);
    }
  }
};

/** One-sided restraint: penalize only when `sign*volume` is below the margin. */
const chiralEnergyAt = (c: Float64Array, t: ChiralTerm): number => {
  const ax = gx(c, t.a) - gx(c, t.c), ay = gy(c, t.a) - gy(c, t.c), az = gz(c, t.a) - gz(c, t.c);
  const bx = gx(c, t.b) - gx(c, t.c), by = gy(c, t.b) - gy(c, t.c), bz = gz(c, t.b) - gz(c, t.c);
  const dx = gx(c, t.d) - gx(c, t.c), dy = gy(c, t.d) - gy(c, t.c), dz = gz(c, t.d) - gz(c, t.c);
  const cxb = by * dz - bz * dy;
  const cyb = bz * dx - bx * dz;
  const czb = bx * dy - by * dx;
  const vol = ax * cxb + ay * cyb + az * czb;
  const viol = CHIRAL_MARGIN - t.sign * vol;
  return viol > 0 ? 0.5 * t.k * viol * viol : 0;
};

const cisTransEnergyAt = (c: Float64Array, t: CisTransTerm): number => {
  const b1x = gx(c, t.j) - gx(c, t.i), b1y = gy(c, t.j) - gy(c, t.i), b1z = gz(c, t.j) - gz(c, t.i);
  const b2x = gx(c, t.k) - gx(c, t.j), b2y = gy(c, t.k) - gy(c, t.j), b2z = gz(c, t.k) - gz(c, t.j);
  const b3x = gx(c, t.l) - gx(c, t.k), b3y = gy(c, t.l) - gy(c, t.k), b3z = gz(c, t.l) - gz(c, t.k);
  const n1x = b1y * b2z - b1z * b2y, n1y = b1z * b2x - b1x * b2z, n1z = b1x * b2y - b1y * b2x;
  const n2x = b2y * b3z - b2z * b3y, n2y = b2z * b3x - b2x * b3z, n2z = b2x * b3y - b2y * b3x;
  const n1len = Math.sqrt(n1x * n1x + n1y * n1y + n1z * n1z);
  const n2len = Math.sqrt(n2x * n2x + n2y * n2y + n2z * n2z);
  if (n1len < TORSION_SINGULAR || n2len < TORSION_SINGULAR) return 0;
  const cosPhi = (n1x * n2x + n1y * n2y + n1z * n2z) / (n1len * n2len);
  const diff = cosPhi - t.desiredCos;
  return 0.5 * t.k2 * diff * diff;
};

const vdwEnergyAndGradient = (
  topo: UffTopology,
  coords: Float64Array,
  grad: Float64Array | null,
  n: number,
  activeAtoms?: boolean[],
): number => {
  let energy = 0;
  const cell = VDW_CUTOFF;
  const cutoff2 = VDW_CUTOFF * VDW_CUTOFF;

  // Build cell grid — when refining a region, only index active atoms + a
  // halo of nearby frozen atoms is unnecessary: we still need frozen atoms
  // as interaction partners, so keep the full grid but skip pairs where
  // neither atom is active.
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, coords[i * 3]);
    minY = Math.min(minY, coords[i * 3 + 1]);
    minZ = Math.min(minZ, coords[i * 3 + 2]);
  }
  const cellOf = new Map<string, number[]>();
  const cellKey = (cx: number, cy: number, cz: number): string => `${cx},${cy},${cz}`;
  const coordCell = (i: number): [number, number, number] => [
    Math.floor((coords[i * 3] - minX) / cell),
    Math.floor((coords[i * 3 + 1] - minY) / cell),
    Math.floor((coords[i * 3 + 2] - minZ) / cell),
  ];
  for (let i = 0; i < n; i++) {
    const [cx, cy, cz] = coordCell(i);
    const key = cellKey(cx, cy, cz);
    const arr = cellOf.get(key);
    if (arr) arr.push(i);
    else cellOf.set(key, [i]);
  }

  const seenPair = new Set<number>();
  // Prefer iterating from active atoms when a mask is present.
  const seeds: number[] = [];
  if (activeAtoms) {
    for (let i = 0; i < n; i++) if (activeAtoms[i]) seeds.push(i);
  } else {
    for (let i = 0; i < n; i++) seeds.push(i);
  }

  for (const i of seeds) {
    const [cx, cy, cz] = coordCell(i);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const arr = cellOf.get(cellKey(cx + dx, cy + dy, cz + dz));
          if (!arr) continue;
          for (const j of arr) {
            if (j === i) continue;
            const lo = i < j ? i : j;
            const hi = i < j ? j : i;
            const pk = packPair(lo, hi, n);
            if (topo.excluded.has(pk) || seenPair.has(pk)) continue;
            seenPair.add(pk);
            const rx = coords[hi * 3] - coords[lo * 3];
            const ry = coords[hi * 3 + 1] - coords[lo * 3 + 1];
            const rz = coords[hi * 3 + 2] - coords[lo * 3 + 2];
            const r2 = rx * rx + ry * ry + rz * rz;
            if (r2 > cutoff2 || r2 < 1e-8) continue;
            const xij = Math.sqrt(topo.vdwX[lo]! * topo.vdwX[hi]!);
            const dij = Math.sqrt(topo.vdwD[lo]! * topo.vdwD[hi]!);
            const r = Math.sqrt(r2);
            const ratio = xij / r;
            const r6 = ratio ** 6;
            const r12 = r6 * r6;
            energy += dij * (r12 - 2 * r6);
            if (grad) {
              const dEdr = (12 * dij * (r6 - r12)) / r;
              const f = dEdr / r;
              grad[lo * 3] -= f * rx; grad[lo * 3 + 1] -= f * ry; grad[lo * 3 + 2] -= f * rz;
              grad[hi * 3] += f * rx; grad[hi * 3 + 1] += f * ry; grad[hi * 3 + 2] += f * rz;
            }
          }
        }
      }
    }
  }
  return energy;
};
