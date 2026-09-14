/**
 * Seed-time un-threading of interlocked / overlapping ring systems.
 *
 * The 3D embedder seeds coordinates from the 2D depiction. When a ring (e.g. a
 * freshly added benzene) is drawn on top of / across another ring system, the
 * seed is topologically interlocked. Local relaxation (bond/angle springs +
 * pairwise repulsion) can never pull a bond back out through a ring, so the
 * catenane-like tangle is frozen in.
 *
 * This pass detects a ring system whose disk is pierced by another system's
 * bond (or two ring systems overlapping coplanar), then translates the smaller
 * connected component out of the ring plane so the projections no longer
 * overlap. It is a preconditioner: after separation the minimizer keeps the
 * pieces apart.
 */
import type { Molecule } from '@moldraw/domain';
import { buildGraph, perceiveRings, type MoleculeGraph } from '@moldraw/engine';
import { add, cross, distance, dot, length, normalize, scale, sub, v, type Vec3 } from './vec';

type Pos = Map<string, Vec3>;

interface RingSystem {
  atomIds: string[];
  atomSet: Set<string>;
  center: Vec3;
  normal: Vec3;
  radius: number;
}

/** Best-fit plane of a set of points via Newell's method. */
const planeOf = (pos: Pos, ids: string[]): { center: Vec3; normal: Vec3; radius: number } | null => {
  const pts = ids.map(id => pos.get(id)).filter((p): p is Vec3 => !!p);
  if (pts.length < 3) return null;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[i]!;
    const p1 = pts[(i + 1) % pts.length]!;
    nx += (p0.y - p1.y) * (p0.z + p1.z);
    ny += (p0.z - p1.z) * (p0.x + p1.x);
    nz += (p0.x - p1.x) * (p0.y + p1.y);
  }
  let normal = v(nx, ny, nz);
  normal = length(normal) < 1e-6 ? v(0, 0, 1) : normalize(normal);
  const center = scale(
    pts.reduce((s, p) => add(s, p), v(0, 0, 0)),
    1 / pts.length,
  );
  let radius = 0;
  for (const p of pts) radius = Math.max(radius, distance(p, center));
  return { center, normal, radius };
};

/** Union rings that share an atom into fused ring systems. */
const buildRingSystems = (pos: Pos, mol: Molecule): RingSystem[] => {
  const rings = perceiveRings(mol).map(r => r.atomIds.filter(id => pos.has(id)));
  const memberSets: Set<string>[] = [];
  for (const ring of rings) {
    if (ring.length < 3) continue;
    const ringSet = new Set(ring);
    let merged = false;
    for (let i = 0; i < memberSets.length; i++) {
      const gs = memberSets[i]!;
      if (ring.some(id => gs.has(id))) {
        for (const id of ring) gs.add(id);
        merged = true;
        break;
      }
    }
    if (!merged) {
      memberSets.push(ringSet);
    }
  }
  // A second merge pass catches chains fused transitively.
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < memberSets.length; i++) {
      for (let j = i + 1; j < memberSets.length; j++) {
        const a = memberSets[i]!;
        const b = memberSets[j]!;
        let overlap = false;
        for (const id of b) {
          if (a.has(id)) {
            overlap = true;
            break;
          }
        }
        if (overlap) {
          for (const id of b) a.add(id);
          memberSets.splice(j, 1);
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
  }

  const systems: RingSystem[] = [];
  for (const set of memberSets) {
    const atomIds = [...set];
    const plane = planeOf(pos, atomIds);
    if (!plane) continue;
    systems.push({
      atomIds,
      atomSet: set,
      center: plane.center,
      normal: plane.normal,
      radius: plane.radius,
    });
  }
  return systems;
};

/** Does any bond of `strand` pierce the disk of ring system `ring`? */
const bondPiercesDisk = (
  pos: Pos,
  strandBonds: { fromAtomId: string; toAtomId: string }[],
  ring: RingSystem,
): boolean => {
  const { center: c, normal: n, radius } = ring;
  for (const b of strandBonds) {
    const p0 = pos.get(b.fromAtomId);
    const p1 = pos.get(b.toAtomId);
    if (!p0 || !p1) continue;
    const dir = sub(p1, p0);
    const denom = dot(dir, n);
    if (Math.abs(denom) < 1e-6) continue;
    const t = dot(sub(c, p0), n) / denom;
    if (t < 0.02 || t > 0.98) continue;
    const x = add(p0, scale(dir, t));
    if (distance(x, c) < radius * 0.9) return true;
  }
  return false;
};

/** Connected heavy atoms reachable from `start` without entering `blocked`. */
const componentExcluding = (
  g: MoleculeGraph,
  pos: Pos,
  start: string,
  blocked: Set<string>,
): Set<string> => {
  const seen = new Set<string>();
  if (blocked.has(start) || !pos.has(start)) return seen;
  const stack = [start];
  seen.add(start);
  while (stack.length) {
    const cur = stack.pop()!;
    for (const nb of g.nodes.get(cur)?.neighbors ?? []) {
      if (seen.has(nb) || blocked.has(nb) || !pos.has(nb)) continue;
      seen.add(nb);
      stack.push(nb);
    }
  }
  return seen;
};

const centroidOf = (pos: Pos, ids: Iterable<string>): { c: Vec3; radius: number; count: number } => {
  let c = v(0, 0, 0);
  let count = 0;
  for (const id of ids) {
    const p = pos.get(id);
    if (!p) continue;
    c = add(c, p);
    count += 1;
  }
  if (count === 0) return { c, radius: 0, count };
  c = scale(c, 1 / count);
  let radius = 0;
  for (const id of ids) {
    const p = pos.get(id);
    if (p) radius = Math.max(radius, distance(p, c));
  }
  return { c, radius, count };
};

export interface UnthreadOptions {
  passes?: number;
  /**
   * When set, only atoms in this set may be translated. Separations whose
   * movable component contains no allowed atom are skipped so a frozen region
   * (e.g. region-refine) stays pixel-stable.
   */
  movable?: Set<string>;
}

/**
 * Detect and separate interlocked / overlapping ring systems in the seed.
 * Returns the number of separations performed.
 */
export const unthreadSeed = (
  pos: Pos,
  mol: Molecule,
  graph?: MoleculeGraph,
  options: UnthreadOptions = {},
): number => {
  const g = graph ?? buildGraph(mol);
  const passes = options.passes ?? 3;
  const movable = options.movable;
  let totalMoves = 0;

  for (let pass = 0; pass < passes; pass++) {
    const systems = buildRingSystems(pos, mol);
    if (systems.length < 2) break;

    // Bonds grouped by ring system (bonds with at least one endpoint in it).
    const bondsForSystem = (sys: RingSystem) =>
      mol.bonds.filter(
        b => sys.atomSet.has(b.fromAtomId) || sys.atomSet.has(b.toAtomId),
      );

    let movedThisPass = 0;
    for (let i = 0; i < systems.length; i++) {
      for (let j = i + 1; j < systems.length; j++) {
        const A = systems[i]!;
        const B = systems[j]!;
        // Skip fused systems (share atoms).
        let shares = false;
        for (const id of A.atomSet) {
          if (B.atomSet.has(id)) {
            shares = true;
            break;
          }
        }
        if (shares) continue;

        const pierced =
          bondPiercesDisk(pos, bondsForSystem(A), B) ||
          bondPiercesDisk(pos, bondsForSystem(B), A);

        // Coplanar overlap: centres close and normals near-parallel.
        const centerDist = distance(A.center, B.center);
        const parallel = Math.abs(dot(A.normal, B.normal)) > 0.8;
        const overlap =
          parallel && centerDist < (A.radius + B.radius) * 0.75;

        if (!pierced && !overlap) continue;

        // Move the smaller connected component out of the other ring's plane.
        const compA = componentExcluding(g, pos, A.atomIds[0]!, B.atomSet);
        const compB = componentExcluding(g, pos, B.atomIds[0]!, A.atomSet);
        const hasMovable = (comp: Set<string>) =>
          !movable || [...comp].some(id => movable.has(id));
        let useA = compA.size <= compB.size && compA.size > 0;
        // Prefer the component that contains movable atoms when a region is frozen.
        if (movable) {
          if (useA && !hasMovable(compA) && hasMovable(compB)) useA = false;
          else if (!useA && !hasMovable(compB) && hasMovable(compA)) useA = true;
        }
        let moveSet = useA ? compA : compB;
        const refRing = useA ? B : A;
        if (moveSet.size === 0) continue;
        if (movable) {
          const restricted = new Set([...moveSet].filter(id => movable.has(id)));
          if (restricted.size === 0) continue;
          moveSet = restricted;
        }

        const moved = centroidOf(pos, moveSet);
        if (moved.count === 0) continue;

        // In-plane direction (of the reference ring) away from its centre.
        const rel = sub(moved.c, refRing.center);
        const along = dot(rel, refRing.normal);
        let inPlane = sub(rel, scale(refRing.normal, along));
        if (length(inPlane) < 1e-3) {
          // Degenerate (stacked): pick any in-plane axis.
          const seedAxis = Math.abs(refRing.normal.x) < 0.9 ? v(1, 0, 0) : v(0, 1, 0);
          inPlane = normalize(cross(refRing.normal, seedAxis));
        } else {
          inPlane = normalize(inPlane);
        }

        const clearance = 1.6;
        const shiftMag = refRing.radius + moved.radius + clearance;
        const lift = 1.2 * (along >= 0 ? 1 : -1);
        const shift = add(scale(inPlane, shiftMag), scale(refRing.normal, lift));

        for (const id of moveSet) {
          const p = pos.get(id);
          if (!p) continue;
          pos.set(id, add(p, shift));
        }
        movedThisPass += 1;
        totalMoves += 1;
      }
    }
    if (movedThisPass === 0) break;
  }

  return totalMoves;
};
