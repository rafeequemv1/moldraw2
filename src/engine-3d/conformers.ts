/**
 * Multi-conformer generation with UFF energy ranking.
 *
 * Starting from one stereo-correct minimized conformer, we sample torsional
 * space by randomly rotating rotatable (acyclic, non-terminal single) bonds,
 * re-minimize each sample with the same UFF topology + stereo restraints, then
 * deduplicate by energy and return the distinct conformers sorted low→high.
 *
 * Rotatable-bond sampling preserves configuration: single-bond rotations never
 * invert a tetrahedral center or flip a double bond, and the stereo restraints
 * hold chirality/E–Z through every re-minimization.
 */
import type { Molecule } from '@moldraw/domain';
import { embed3D, type Conformer } from './embed';
import { buildGraph } from '@moldraw/engine/graph';
import { buildUffTopology, setStereoTerms, uffEnergyAndGradient } from './forcefield/uff';
import { minimizeUff } from './forcefield/minimize';
import { perceiveStereo } from './stereo';
import { add, cross, dot, normalize, scale, sub, v, type Vec3 } from './vec';

export interface RankedConformer {
  conformer: Conformer;
  /** UFF energy (kcal/mol). */
  energy: number;
}

export interface GenerateConformersOptions {
  /** Number of samples to try (default 10). */
  count?: number;
  /** Max distinct conformers to return (default = count). */
  maxResults?: number;
  includeHydrogens?: boolean;
  maxIterations?: number;
  /** Deterministic RNG seed (default 1). */
  seed?: number;
  /** Two conformers within this energy (kcal/mol) are treated as duplicates. */
  energyWindow?: number;
}

const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Rodrigues rotation of point `p` by `angle` about unit `axis` through `origin`. */
const rotateAbout = (p: Vec3, origin: Vec3, axis: Vec3, angle: number): Vec3 => {
  const rel = sub(p, origin);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const term1 = scale(rel, c);
  const term2 = scale(cross(axis, rel), s);
  const term3 = scale(axis, dot(axis, rel) * (1 - c));
  return add(origin, add(add(term1, term2), term3));
};

export const generateConformers = (
  input: Molecule,
  opts: GenerateConformersOptions = {},
): RankedConformer[] => {
  const count = Math.max(1, opts.count ?? 10);
  const includeHydrogens = opts.includeHydrogens ?? true;
  const maxIterations = opts.maxIterations ?? 400;
  const energyWindow = opts.energyWindow ?? 0.5;

  // Reference conformer: correct stereo, fully minimized.
  const base = embed3D(input, { includeHydrogens, forceField: 'uff', maxIterations });
  if (base.atoms.length < 2) {
    return [{ conformer: base, energy: 0 }];
  }

  const pseudo: Molecule = {
    atoms: base.atoms.map(a => ({ id: a.id, element: a.element, x: 0, y: 0, charge: a.charge })),
    bonds: base.bonds,
  };
  const topo = buildUffTopology(pseudo);
  const indexOf = new Map<string, number>();
  base.atoms.forEach((a, i) => indexOf.set(a.id, i));
  const stereo = perceiveStereo(input);
  if (stereo.chirals.length > 0 || stereo.cisTrans.length > 0) {
    setStereoTerms(topo, stereo, indexOf);
  }

  const rotatable = findRotatableBonds(base, indexOf);
  const base0 = new Float64Array(base.atoms.length * 3);
  base.atoms.forEach((a, i) => {
    base0[i * 3] = a.pos.x;
    base0[i * 3 + 1] = a.pos.y;
    base0[i * 3 + 2] = a.pos.z;
  });
  const baseEnergy = uffEnergyAndGradient(topo, base0, null);

  const samples: { coords: Float64Array; energy: number }[] = [{ coords: base0, energy: baseEnergy }];
  const rng = mulberry32(opts.seed ?? 1);

  for (let s = 1; s < count; s++) {
    const coords = base0.slice();
    for (const rb of rotatable) {
      if (rng() < 0.35) continue; // leave some bonds at the reference angle
      rotateSide(coords, rb, rng() * Math.PI * 2);
    }
    minimizeUff(topo, coords, { maxIterations });
    const energy = uffEnergyAndGradient(topo, coords, null);
    samples.push({ coords, energy });
  }

  samples.sort((a, b) => a.energy - b.energy);
  const kept: { coords: Float64Array; energy: number }[] = [];
  for (const sample of samples) {
    if (kept.some(k => Math.abs(k.energy - sample.energy) < energyWindow)) continue;
    kept.push(sample);
  }

  const maxResults = opts.maxResults ?? count;
  return kept.slice(0, maxResults).map(k => ({
    conformer: {
      atoms: base.atoms.map((a, i) => ({
        ...a,
        pos: { x: k.coords[i * 3], y: k.coords[i * 3 + 1], z: k.coords[i * 3 + 2] },
      })),
      bonds: base.bonds,
    },
    energy: k.energy,
  }));
};

interface RotatableBond {
  from: number;
  to: number;
  side: number[]; // indices to rotate (the `to` component)
}

const findRotatableBonds = (conf: Conformer, indexOf: Map<string, number>): RotatableBond[] => {
  const g = buildGraph({
    atoms: conf.atoms.map(a => ({ id: a.id, element: a.element, x: 0, y: 0, charge: a.charge })),
    bonds: conf.bonds,
  });
  const adjacency = new Map<number, number[]>();
  for (const a of conf.atoms) adjacency.set(indexOf.get(a.id)!, []);
  for (const b of conf.bonds) {
    const f = indexOf.get(b.fromAtomId)!;
    const t = indexOf.get(b.toAtomId)!;
    adjacency.get(f)!.push(t);
    adjacency.get(t)!.push(f);
  }

  const out: RotatableBond[] = [];
  for (const b of conf.bonds) {
    if (b.order !== 1 || b.aromatic) continue;
    const from = indexOf.get(b.fromAtomId)!;
    const to = indexOf.get(b.toAtomId)!;
    if ((adjacency.get(from)?.length ?? 0) < 2 || (adjacency.get(to)?.length ?? 0) < 2) continue;
    // Terminal (e.g. C–H, methyl) → rotation is a no-op / trivial; skip.
    const side = componentExcluding(adjacency, to, from);
    if (side === null) continue; // ring bond
    if (side.length <= 1) continue;
    out.push({ from, to, side });
  }
  void g;
  return out;
};

/** BFS the component containing `start` without crossing `blocked`; null if it loops back. */
const componentExcluding = (
  adjacency: Map<number, number[]>,
  start: number,
  blocked: number,
): number[] | null => {
  const comp = new Set<number>([start]);
  const stack = [start];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const nb of adjacency.get(cur) ?? []) {
      if (nb === blocked) {
        if (cur !== start) return null; // reached the blocked atom via a ring
        continue;
      }
      if (comp.has(nb)) continue;
      comp.add(nb);
      stack.push(nb);
    }
  }
  return [...comp];
};

const rotateSide = (coords: Float64Array, rb: RotatableBond, angle: number): void => {
  const origin = v(coords[rb.from * 3], coords[rb.from * 3 + 1], coords[rb.from * 3 + 2]);
  const to = v(coords[rb.to * 3], coords[rb.to * 3 + 1], coords[rb.to * 3 + 2]);
  const axis = normalize(sub(to, origin));
  for (const idx of rb.side) {
    const p = v(coords[idx * 3], coords[idx * 3 + 1], coords[idx * 3 + 2]);
    const np = rotateAbout(p, origin, axis, angle);
    coords[idx * 3] = np.x;
    coords[idx * 3 + 1] = np.y;
    coords[idx * 3 + 2] = np.z;
  }
};
