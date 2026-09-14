/**
 * Distance-geometry (DG) embedding for heavy-atom skeletons.
 *
 * The regular Phase-A seed lifts the 2D depiction into 3D. For cages and
 * bridged polycycles (cubane, bicyclo[2.2.2]octane, cryptands, metal cages…)
 * the depiction necessarily overlaps atoms, and the lifted seed can land in a
 * topologically wrong basin (an "inside-out" cube) that no local force field
 * can escape — the UFF minimizer then converges to a strained local minimum
 * with 1.3 Å and 2.5 Å "bonds".
 *
 * DG sidesteps the depiction entirely: it builds distance bounds from the
 * graph alone (bond lengths, 1–3 distances from ideal / ring angles, path-
 * based upper bounds, contact lower bounds), smooths them with the triangle
 * inequality, samples a distance matrix, and embeds it with the classical
 * metric-matrix eigendecomposition followed by a bounds-refinement sweep.
 *
 * The output is a coarse but topologically correct 3D skeleton meant to be
 * handed to the UFF minimizer. `embed3D` uses it as a fallback when the
 * default seed produced a strained conformer, trying a few random seeds and
 * keeping the lowest-energy result.
 */
import type { Molecule } from '@moldraw/domain';
import { perceiveRings, type MoleculeGraph } from '@moldraw/engine';
import { IDEAL_ANGLE, type Hybridization } from './hybridization';
import { isUffMetal } from './forcefield/uffParams';
import type { Vec3 } from './vec';

export interface DistanceGeometryInput {
  mol: Molecule;
  g: MoleculeGraph;
  hyb: Map<string, Hybridization>;
  /** Target bond lengths (Å) by bond id. */
  bondTargets: Map<string, number>;
  /** Atom ids to embed (heavy atoms). */
  ids: readonly string[];
}

/** Largest skeleton we embed with dense O(n²) bounds + O(n³) smoothing. */
export const DG_MAX_ATOMS = 220;

const DEG2RAD = Math.PI / 180;

/** Small deterministic PRNG (mulberry32) so fallbacks are reproducible. */
const makeRandom = (seed: number): (() => number) => {
  let a = (seed * 0x9e3779b9) >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * Embed the heavy-atom skeleton of `mol` from graph-derived distance bounds.
 * Returns positions (Å) by atom id, or null when the skeleton is too small or
 * too large for DG to be useful.
 */
export const embedDistanceGeometry = (
  input: DistanceGeometryInput,
  seed = 1,
): Map<string, Vec3> | null => {
  const { mol, g, hyb, bondTargets } = input;
  const ids = input.ids.filter(id => g.atomById.has(id));
  const n = ids.length;
  if (n < 4 || n > DG_MAX_ATOMS) return null;

  const index = new Map<string, number>();
  ids.forEach((id, i) => index.set(id, i));
  const idSet = new Set(ids);

  const lo = new Float64Array(n * n);
  const up = new Float64Array(n * n);
  const at = (i: number, j: number): number => i * n + j;

  // Defaults: generous contact lower bound, "infinite" upper bound.
  const CONTACT = 2.9;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      lo[at(i, j)] = i === j ? 0 : CONTACT;
      up[at(i, j)] = i === j ? 0 : 1e6;
    }
  }

  // Bonded pairs.
  const nbrs: number[][] = ids.map(() => []);
  const r0 = new Map<string, number>();
  const pairKey = (i: number, j: number): string => (i < j ? `${i}|${j}` : `${j}|${i}`);
  for (const b of mol.bonds) {
    const i = index.get(b.fromAtomId);
    const j = index.get(b.toAtomId);
    if (i === undefined || j === undefined || i === j) continue;
    const r = bondTargets.get(b.id) ?? 1.5;
    r0.set(pairKey(i, j), r);
    nbrs[i].push(j);
    nbrs[j].push(i);
    // Bonds override the contact lower bound.
    lo[at(i, j)] = lo[at(j, i)] = r - 0.02;
    up[at(i, j)] = up[at(j, i)] = r + 0.02;
  }

  // Smallest ring containing three given atoms (for ring-adjusted 1–3 angles).
  const rings = perceiveRings(mol)
    .filter(r => r.atomIds.every(id => idSet.has(id)))
    .map(r => ({ size: r.size, set: new Set(r.atomIds) }))
    .sort((a, b) => a.size - b.size);
  const smallestRingWith = (a: string, b: string, c: string): number | null => {
    for (const r of rings) if (r.set.has(a) && r.set.has(b) && r.set.has(c)) return r.size;
    return null;
  };

  // 1–3 pairs via law of cosines around each centre.
  for (let j = 0; j < n; j++) {
    const nb = nbrs[j];
    if (nb.length < 2) continue;
    const centerId = ids[j];
    const el = g.atomById.get(centerId)?.element ?? 'C';
    const metal = isUffMetal(el);
    for (let a = 0; a < nb.length; a++) {
      for (let b = a + 1; b < nb.length; b++) {
        const i = nb[a];
        const k = nb[b];
        if (i === k || r0.has(pairKey(i, k))) continue; // 3-ring: already a bond
        const rij = r0.get(pairKey(i, j)) ?? 1.5;
        const rjk = r0.get(pairKey(j, k)) ?? 1.5;
        let thetaLo: number;
        let thetaHi: number;
        if (metal) {
          // Coordination centres: anywhere between cis (90°) and trans (180°).
          thetaLo = nb.length <= 2 ? 170 * DEG2RAD : nb.length === 3 ? 110 * DEG2RAD : 85 * DEG2RAD;
          thetaHi = Math.PI;
        } else {
          const ringSize = smallestRingWith(ids[i], centerId, ids[k]);
          const ideal =
            ringSize !== null && ringSize <= 5
              ? Math.PI - (2 * Math.PI) / ringSize
              : IDEAL_ANGLE[hyb.get(centerId) ?? 'sp3'];
          thetaLo = Math.max(0.3, ideal - 6 * DEG2RAD);
          thetaHi = Math.min(Math.PI, ideal + 6 * DEG2RAD);
        }
        const dLo = Math.sqrt(Math.max(0.1, rij * rij + rjk * rjk - 2 * rij * rjk * Math.cos(thetaLo)));
        const dHi = Math.sqrt(Math.max(0.1, rij * rij + rjk * rjk - 2 * rij * rjk * Math.cos(thetaHi)));
        // 1–3 bounds replace the contact floor (they are always < CONTACT); a
        // pair that is 1–3 through two centres (4-ring) gets the tighter range.
        const k1 = at(i, k);
        const k2 = at(k, i);
        lo[k1] = lo[k2] = lo[k1] >= CONTACT ? dLo : Math.max(lo[k1], dLo);
        up[k1] = up[k2] = Math.min(up[k1], dHi);
      }
    }
  }

  // 1–4 pairs (three bonds apart) can be as close as an eclipsed/cis contact.
  const path = new Int32Array(n * n).fill(-1);
  for (let s = 0; s < n; s++) {
    path[at(s, s)] = 0;
    const queue = [s];
    for (let qi = 0; qi < queue.length; qi++) {
      const cur = queue[qi];
      const d = path[at(s, cur)];
      if (d >= 3) continue;
      for (const nx of nbrs[cur]) {
        if (path[at(s, nx)] !== -1) continue;
        path[at(s, nx)] = d + 1;
        queue.push(nx);
      }
    }
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (path[at(i, j)] === 3 && lo[at(i, j)] >= CONTACT) {
        lo[at(i, j)] = lo[at(j, i)] = 2.35;
      }
    }
  }

  // Triangle-inequality smoothing (Floyd–Warshall on upper bounds, then the
  // inverse triangle inequality on lower bounds).
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      const uik = up[at(i, k)];
      if (uik >= 1e6) continue;
      for (let j = 0; j < n; j++) {
        const cand = uik + up[at(k, j)];
        if (cand < up[at(i, j)]) up[at(i, j)] = cand;
      }
    }
  }
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const cand = Math.max(lo[at(i, k)] - up[at(k, j)], lo[at(k, j)] - up[at(i, k)]);
        if (cand > lo[at(i, j)]) lo[at(i, j)] = cand;
      }
    }
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (lo[at(i, j)] > up[at(i, j)]) lo[at(i, j)] = up[at(i, j)];
    }
  }

  // Sample a distance matrix inside the bounds.
  const rand = makeRandom(seed);
  const d2 = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const l = lo[at(i, j)];
      const u = up[at(i, j)];
      const d = l + (u - l) * rand();
      d2[at(i, j)] = d2[at(j, i)] = d * d;
    }
  }

  // Metric matrix relative to the centroid.
  const d0 = new Float64Array(n);
  let total = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) total += d2[at(i, j)];
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += d2[at(i, j)];
    d0[i] = s / n - total / (n * n);
  }
  const G = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) G[at(i, j)] = 0.5 * (d0[i] + d0[j] - d2[at(i, j)]);
  }

  // Top-3 eigenpairs by shifted power iteration with deflation. The shift
  // (Gershgorin bound) makes G + σI positive semi-definite so the iteration
  // locks onto the *largest* eigenvalues rather than the largest-magnitude
  // (possibly negative) ones of the non-Euclidean sampled matrix.
  let shift = 0;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += Math.abs(G[at(i, j)]);
    shift = Math.max(shift, s);
  }
  const coords = new Float64Array(n * 3);
  const work = new Float64Array(n);
  const vec = new Float64Array(n);
  for (let dim = 0; dim < 3; dim++) {
    for (let i = 0; i < n; i++) vec[i] = rand() - 0.5;
    for (let it = 0; it < 250; it++) {
      for (let i = 0; i < n; i++) {
        let s = shift * vec[i];
        const row = i * n;
        for (let j = 0; j < n; j++) s += G[row + j] * vec[j];
        work[i] = s;
      }
      let norm = 0;
      for (let i = 0; i < n; i++) norm += work[i] * work[i];
      norm = Math.sqrt(norm) || 1e-12;
      let diff = 0;
      for (let i = 0; i < n; i++) {
        const nv = work[i] / norm;
        diff += Math.abs(nv - vec[i]);
        vec[i] = nv;
      }
      if (diff < 1e-9) break;
    }
    // Rayleigh quotient sign (power iteration on an indefinite matrix may lock
    // onto a large negative eigenvalue; treat those as zero extent).
    let rq = 0;
    for (let i = 0; i < n; i++) {
      let s = 0;
      const row = i * n;
      for (let j = 0; j < n; j++) s += G[row + j] * vec[j];
      rq += vec[i] * s;
    }
    const extent = rq > 0 ? Math.sqrt(rq) : 0;
    for (let i = 0; i < n; i++) coords[i * 3 + dim] = extent * vec[i];
    // Deflate.
    for (let i = 0; i < n; i++) {
      const row = i * n;
      for (let j = 0; j < n; j++) G[row + j] -= rq * vec[i] * vec[j];
    }
  }

  // Refine against the bounds (iterative pairwise projection). The metric
  // embedding is exact only for a Euclidean-consistent matrix; the random
  // sample is not, so a few hundred sweeps pull every pair back inside
  // [lo, up] while keeping the global fold.
  const px = (i: number): number => coords[i * 3];
  const py = (i: number): number => coords[i * 3 + 1];
  const pz = (i: number): number => coords[i * 3 + 2];
  for (let sweep = 0; sweep < 300; sweep++) {
    const factor = sweep < 100 ? 0.35 : 0.2;
    let maxViol = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = px(j) - px(i);
        let dy = py(j) - py(i);
        let dz = pz(j) - pz(i);
        let d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < 1e-6) {
          // Coincident atoms: split along a deterministic pseudo-random axis.
          dx = rand() - 0.5;
          dy = rand() - 0.5;
          dz = rand() - 0.5;
          d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        }
        const l = lo[at(i, j)];
        const u = up[at(i, j)];
        let target = d;
        if (d < l) target = l;
        else if (d > u) target = u;
        if (target === d) continue;
        const viol = Math.abs(target - d);
        if (viol > maxViol) maxViol = viol;
        const s = ((target - d) / d) * 0.5 * factor;
        coords[i * 3] -= dx * s;
        coords[i * 3 + 1] -= dy * s;
        coords[i * 3 + 2] -= dz * s;
        coords[j * 3] += dx * s;
        coords[j * 3 + 1] += dy * s;
        coords[j * 3 + 2] += dz * s;
      }
    }
    if (maxViol < 0.01) break;
  }

  const out = new Map<string, Vec3>();
  for (let i = 0; i < n; i++) out.set(ids[i], { x: px(i), y: py(i), z: pz(i) });
  return out;
};

/**
 * Heavy-atom strain of a conformer: the worst relative bond-length deviation
 * from its target, and whether any two non-bonded heavy atoms nearly overlap.
 * Used to decide whether the default seed needs the DG fallback.
 */
export const heavyAtomStrain = (
  atoms: readonly { id: string; element: string; pos: Vec3 }[],
  bonds: readonly { id: string; fromAtomId: string; toAtomId: string }[],
  bondTargets: Map<string, number>,
): { maxBondDeviation: number; minNonbonded: number } => {
  const heavy = atoms.filter(a => a.element !== 'H');
  const byId = new Map(heavy.map(a => [a.id, a]));
  const bonded = new Set<string>();
  let maxBondDeviation = 0;
  for (const b of bonds) {
    const p = byId.get(b.fromAtomId);
    const q = byId.get(b.toAtomId);
    if (!p || !q) continue;
    bonded.add(p.id < q.id ? `${p.id}|${q.id}` : `${q.id}|${p.id}`);
    const r0 = bondTargets.get(b.id);
    if (!r0) continue;
    const d = Math.hypot(p.pos.x - q.pos.x, p.pos.y - q.pos.y, p.pos.z - q.pos.z);
    maxBondDeviation = Math.max(maxBondDeviation, Math.abs(d - r0) / r0);
  }
  let minNonbonded = Infinity;
  if (heavy.length <= 400) {
    for (let i = 0; i < heavy.length; i++) {
      for (let j = i + 1; j < heavy.length; j++) {
        const a = heavy[i];
        const b = heavy[j];
        const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
        if (bonded.has(key)) continue;
        const d = Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y, a.pos.z - b.pos.z);
        if (d < minNonbonded) minNonbonded = d;
      }
    }
  }
  return { maxBondDeviation, minNonbonded };
};

/** True when a conformer is strained enough to justify a DG re-embed. */
export const isStrainedConformer = (strain: { maxBondDeviation: number; minNonbonded: number }): boolean =>
  strain.maxBondDeviation > 0.12 || strain.minNonbonded < 1.6;
