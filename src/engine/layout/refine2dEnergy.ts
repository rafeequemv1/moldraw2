/**
 * Stage 2 native 2D layout refine — spring / repulsion energy minimization.
 *
 * Takes a Stage-1 skeleton seed and improves overlaps / crossings / bond
 * lengths without RDKit. Fused ring systems move as rigid bodies so hexagons
 * stay regular while substituents untangle.
 */
import type { Molecule } from '@moldraw/domain';
import { buildGraph, type MoleculeGraph } from '../graph';
import { perceiveRings } from '../chem/rings';
import { isAcceptableLayout, measureLayoutQuality } from './layoutQuality';
import { uniformizeBondLengths } from './optimizeSkeleton';
import { untangleByReflection } from './untangleByReflection';

export interface Refine2DOptions {
  bondLengthPx: number;
  /** Max force iterations. Default scales with atom count. */
  maxIterations?: number;
  /** Skip refine when layout already passes the quality gate. Default true. */
  onlyIfNeeded?: boolean;
}

interface Vec {
  x: number;
  y: number;
}

interface RigidBlock {
  ids: string[];
  /** Local offsets from centroid at refine start (rigid shape). */
  local: Map<string, Vec>;
}

const TRIGONAL = (2 * Math.PI) / 3; // 120°

const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);

const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });

const scale = (a: Vec, s: number): Vec => ({ x: a.x * s, y: a.y * s });

const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });

const segmentsCross = (a: Vec, b: Vec, c: Vec, d: Vec): boolean => {
  const cross = (p: Vec, q: Vec, r: Vec) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);
  return (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  );
};

const centroid = (ids: string[], pos: Map<string, Vec>): Vec => {
  let x = 0;
  let y = 0;
  let n = 0;
  for (const id of ids) {
    const p = pos.get(id);
    if (!p) continue;
    x += p.x;
    y += p.y;
    n += 1;
  }
  return n === 0 ? { x: 0, y: 0 } : { x: x / n, y: y / n };
};

/** Connected components within ringAtomSet (fused systems stay together). */
const buildRigidBlocks = (
  g: MoleculeGraph,
  ringAtomSet: Set<string>,
  pos: Map<string, Vec>,
): RigidBlock[] => {
  const seen = new Set<string>();
  const blocks: RigidBlock[] = [];
  for (const start of ringAtomSet) {
    if (seen.has(start)) continue;
    const ids: string[] = [];
    const q = [start];
    seen.add(start);
    while (q.length) {
      const u = q.shift()!;
      ids.push(u);
      for (const nb of g.nodes.get(u)?.neighbors ?? []) {
        if (!ringAtomSet.has(nb) || seen.has(nb)) continue;
        seen.add(nb);
        q.push(nb);
      }
    }
    if (ids.length < 3) continue;
    const c = centroid(ids, pos);
    const local = new Map<string, Vec>();
    for (const id of ids) {
      const p = pos.get(id)!;
      local.set(id, { x: p.x - c.x, y: p.y - c.y });
    }
    blocks.push({ ids, local });
  }
  return blocks;
};

const layoutScore = (mol: Molecule): number => {
  const q = measureLayoutQuality(mol);
  return q.overlaps * 10 + q.crossings * 8 + q.bondRatio * 2 + q.badCccFraction * 20;
};

const applyPosToMolecule = (mol: Molecule, pos: Map<string, Vec>): Molecule => ({
  ...mol,
  atoms: mol.atoms.map(a => {
    const p = pos.get(a.id);
    return p ? { ...a, x: p.x, y: p.y } : a;
  }),
});

/**
 * Refine 2D coordinates with bond springs, angle springs, and repulsion.
 * Ring systems translate/rotate rigidly.
 */
export const refine2DEnergy = (mol: Molecule, options: Refine2DOptions): Molecule => {
  const bondLen = options.bondLengthPx;
  if (mol.atoms.length < 3 || bondLen <= 0) return mol;
  if (options.onlyIfNeeded !== false && isAcceptableLayout(mol)) return mol;

  const g = buildGraph(mol);
  const rings = perceiveRings(mol);
  const ringAtomSet = new Set(rings.flatMap(r => r.atomIds));

  const pos = new Map<string, Vec>();
  for (const a of mol.atoms) {
    if (a.element === 'H') continue;
    pos.set(a.id, { x: a.x, y: a.y });
  }
  const heavyIds = [...pos.keys()];
  if (heavyIds.length < 3) return mol;

  const blocks = buildRigidBlocks(g, ringAtomSet, pos);
  const blockOf = new Map<string, RigidBlock>();
  for (const b of blocks) {
    for (const id of b.ids) blockOf.set(id, b);
  }

  // Bond list (heavy–heavy only).
  const bonds: { a: string; b: string }[] = [];
  const bonded = new Set<string>();
  for (const id of heavyIds) {
    for (const nb of g.nodes.get(id)?.neighbors ?? []) {
      if (!pos.has(nb)) continue;
      const key = id < nb ? `${id}|${nb}` : `${nb}|${id}`;
      if (bonded.has(key)) continue;
      bonded.add(key);
      bonds.push({ a: id, b: nb });
    }
  }

  // Angle triples: center with two heavy neighbors (skip pure ring-interior triples
  // that are already constrained by rigid blocks — still include exo angles).
  const angles: { a: string; c: string; b: string; target: number }[] = [];
  for (const id of heavyIds) {
    const nbs = (g.nodes.get(id)?.neighbors ?? []).filter(nb => pos.has(nb));
    if (nbs.length < 2) continue;
    const inRing = ringAtomSet.has(id);
    for (let i = 0; i < nbs.length; i++) {
      for (let j = i + 1; j < nbs.length; j++) {
        const a = nbs[i]!;
        const b = nbs[j]!;
        // Skip angles fully inside one rigid block (shape is frozen).
        const ba = blockOf.get(a);
        const bb = blockOf.get(b);
        const bc = blockOf.get(id);
        if (ba && bb && bc && ba === bb && ba === bc) continue;
        // Target: 120° for carbon trigonal / chain; ring exo still ~120°.
        let target = TRIGONAL;
        if (inRing && nbs.length === 2) {
          // Two neighbors on a ring atom that aren't both in-block — rare.
          target = TRIGONAL;
        }
        angles.push({ a, c: id, b, target });
      }
    }
  }

  const kBond = 1.6;
  const kAngle = 0.35;
  const kRepel = 0.7;
  const kCross = 0.55;
  const repelCutoff = bondLen * 1.5;
  const maxStep = bondLen * 0.32;
  const nHeavy = heavyIds.length;
  const maxIter =
    options.maxIterations ??
    Math.min(240, Math.max(80, Math.floor(50 + nHeavy * 1.6)));

  let bestPos = new Map(pos);
  let bestScore = layoutScore(applyPosToMolecule(mol, pos));

  for (let iter = 0; iter < maxIter; iter++) {
    const force = new Map<string, Vec>();
    for (const id of heavyIds) force.set(id, { x: 0, y: 0 });

    // Bond springs.
    for (const { a, b } of bonds) {
      const pa = pos.get(a)!;
      const pb = pos.get(b)!;
      const d = dist(pa, pb);
      if (d < 1e-6) continue;
      const diff = d - bondLen;
      const mag = kBond * diff;
      const fx = ((pb.x - pa.x) / d) * mag;
      const fy = ((pb.y - pa.y) / d) * mag;
      force.set(a, add(force.get(a)!, { x: fx, y: fy }));
      force.set(b, add(force.get(b)!, { x: -fx, y: -fy }));
    }

    // Angle springs (cosine form toward target).
    for (const { a, c, b, target } of angles) {
      const pa = pos.get(a)!;
      const pc = pos.get(c)!;
      const pb = pos.get(b)!;
      const v1 = sub(pa, pc);
      const v2 = sub(pb, pc);
      const n1 = Math.hypot(v1.x, v1.y);
      const n2 = Math.hypot(v2.x, v2.y);
      if (n1 < 1e-6 || n2 < 1e-6) continue;
      const u1 = scale(v1, 1 / n1);
      const u2 = scale(v2, 1 / n2);
      let cos = u1.x * u2.x + u1.y * u2.y;
      cos = Math.max(-1, Math.min(1, cos));
      const ang = Math.acos(cos);
      const err = ang - target;
      if (Math.abs(err) < 0.02) continue;
      // Perpendicular directions to rotate arms.
      const cross = u1.x * u2.y - u1.y * u2.x;
      const sign = cross >= 0 ? 1 : -1;
      const p1 = { x: -u1.y * sign, y: u1.x * sign };
      const p2 = { x: u2.y * sign, y: -u2.x * sign };
      const mag = kAngle * err * bondLen * 0.5;
      force.set(a, add(force.get(a)!, scale(p1, mag)));
      force.set(b, add(force.get(b)!, scale(p2, mag)));
      force.set(c, add(force.get(c)!, scale(add(p1, p2), -0.5 * mag)));
    }

    // Non-bonded repulsion (short range).
    for (let i = 0; i < heavyIds.length; i++) {
      const idA = heavyIds[i]!;
      const pa = pos.get(idA)!;
      for (let j = i + 1; j < heavyIds.length; j++) {
        const idB = heavyIds[j]!;
        const key = idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
        if (bonded.has(key)) continue;
        // Skip pairs inside the same rigid block.
        const ba = blockOf.get(idA);
        const bb = blockOf.get(idB);
        if (ba && bb && ba === bb) continue;
        const pb = pos.get(idB)!;
        const d = dist(pa, pb);
        if (d >= repelCutoff || d < 1e-6) continue;
        // Soft 1/r^2 style push.
        const strength = kRepel * (repelCutoff - d) * (repelCutoff - d) / bondLen;
        const fx = ((pa.x - pb.x) / d) * strength;
        const fy = ((pa.y - pb.y) / d) * strength;
        force.set(idA, add(force.get(idA)!, { x: fx, y: fy }));
        force.set(idB, add(force.get(idB)!, { x: -fx, y: -fy }));
      }
    }

    // Bond-crossing penalty: push midpoints of crossing segments apart.
    // Sample every few iterations early, then every iteration near the end.
    if (iter % 2 === 0 || iter > maxIter * 0.5) {
      for (let i = 0; i < bonds.length; i++) {
        const s = bonds[i]!;
        const sa = pos.get(s.a)!;
        const sb = pos.get(s.b)!;
        for (let j = i + 1; j < bonds.length; j++) {
          const t = bonds[j]!;
          if (s.a === t.a || s.a === t.b || s.b === t.a || s.b === t.b) continue;
          if (!segmentsCross(sa, sb, pos.get(t.a)!, pos.get(t.b)!)) continue;
          const midS = { x: (sa.x + sb.x) / 2, y: (sa.y + sb.y) / 2 };
          const ta = pos.get(t.a)!;
          const tb = pos.get(t.b)!;
          const midT = { x: (ta.x + tb.x) / 2, y: (ta.y + tb.y) / 2 };
          let dx = midS.x - midT.x;
          let dy = midS.y - midT.y;
          let d = Math.hypot(dx, dy);
          if (d < 1e-6) {
            dx = 1;
            dy = 0;
            d = 1;
          }
          const push = (kCross * bondLen * 0.35) / d;
          const fx = (dx / d) * push;
          const fy = (dy / d) * push;
          // Distribute to the four endpoints (skip if locked in same rigid block pair).
          for (const id of [s.a, s.b]) {
            force.set(id, add(force.get(id)!, { x: fx * 0.5, y: fy * 0.5 }));
          }
          for (const id of [t.a, t.b]) {
            force.set(id, add(force.get(id)!, { x: -fx * 0.5, y: -fy * 0.5 }));
          }
        }
      }
    }

    // Cooling step size.
    const cool = 1 - iter / (maxIter + 1);
    const stepScale = cool * 0.55;

    // Free atoms (not in a rigid block).
    for (const id of heavyIds) {
      if (blockOf.has(id)) continue;
      const f = force.get(id)!;
      let dx = f.x * stepScale;
      let dy = f.y * stepScale;
      const len = Math.hypot(dx, dy);
      if (len > maxStep) {
        dx = (dx / len) * maxStep;
        dy = (dy / len) * maxStep;
      }
      const p = pos.get(id)!;
      pos.set(id, { x: p.x + dx, y: p.y + dy });
    }

    // Rigid blocks: net force → translate; torque → rotate; reapply local frame.
    for (const block of blocks) {
      let fx = 0;
      let fy = 0;
      let torque = 0;
      const c = centroid(block.ids, pos);
      for (const id of block.ids) {
        const f = force.get(id)!;
        fx += f.x;
        fy += f.y;
        const p = pos.get(id)!;
        const rx = p.x - c.x;
        const ry = p.y - c.y;
        torque += rx * f.y - ry * f.x;
      }
      const n = block.ids.length;
      let tdx = (fx / n) * stepScale;
      let tdy = (fy / n) * stepScale;
      const tlen = Math.hypot(tdx, tdy);
      if (tlen > maxStep) {
        tdx = (tdx / tlen) * maxStep;
        tdy = (tdy / tlen) * maxStep;
      }
      // Torque → small rotation (I ≈ n * R^2, use soft gain).
      const inertia = Math.max(n * bondLen * bondLen, 1);
      let dTheta = (torque / inertia) * stepScale * 4;
      const maxTheta = 0.12 * cool;
      if (dTheta > maxTheta) dTheta = maxTheta;
      if (dTheta < -maxTheta) dTheta = -maxTheta;
      const cosT = Math.cos(dTheta);
      const sinT = Math.sin(dTheta);
      const nc = { x: c.x + tdx, y: c.y + tdy };
      for (const id of block.ids) {
        const loc = block.local.get(id)!;
        // Rotate local offset, then update stored local for next iter consistency.
        const rx = loc.x * cosT - loc.y * sinT;
        const ry = loc.x * sinT + loc.y * cosT;
        block.local.set(id, { x: rx, y: ry });
        pos.set(id, { x: nc.x + rx, y: nc.y + ry });
      }
    }

    // Track best by quality score every few iterations.
    if (iter % 8 === 7 || iter === maxIter - 1) {
      const candidate = applyPosToMolecule(mol, pos);
      const score = layoutScore(candidate);
      if (score < bestScore) {
        bestScore = score;
        bestPos = new Map(pos);
      }
    }
  }

  // Final bond-length snap (tree from rings) so energy pushes don't leave stretch.
  const snapPos = new Map(bestPos);
  const comps: string[][] = [];
  {
    const seen = new Set<string>();
    for (const start of heavyIds) {
      if (seen.has(start)) continue;
      const group: string[] = [];
      const q = [start];
      seen.add(start);
      while (q.length) {
        const u = q.shift()!;
        group.push(u);
        for (const nb of g.nodes.get(u)?.neighbors ?? []) {
          if (!snapPos.has(nb) || seen.has(nb)) continue;
          seen.add(nb);
          q.push(nb);
        }
      }
      comps.push(group);
    }
  }
  for (const comp of comps) {
    uniformizeBondLengths(g, comp, ringAtomSet, bondLen, snapPos);
  }

  const snapped = applyPosToMolecule(mol, snapPos);
  let refined =
    layoutScore(snapped) <= layoutScore(applyPosToMolecule(mol, bestPos)) + 2
      ? snapped
      : applyPosToMolecule(mol, bestPos);

  // Stage 3b: flip exo substituents across attachment bonds to cut crossings.
  const untangled = untangleByReflection(refined);
  if (layoutScore(untangled) < layoutScore(refined) - 0.5) {
    refined = untangled;
    // Re-snap bond lengths after reflections.
    const pos2 = new Map<string, Vec>();
    for (const a of refined.atoms) {
      if (a.element === 'H') continue;
      pos2.set(a.id, { x: a.x, y: a.y });
    }
    for (const comp of comps) {
      uniformizeBondLengths(g, comp, ringAtomSet, bondLen, pos2);
    }
    refined = applyPosToMolecule(refined, pos2);
  }

  // Keep refine only if it improved (or is acceptable).
  const before = layoutScore(mol);
  const after = layoutScore(refined);
  if (after <= before + 0.1 || isAcceptableLayout(refined)) {
    return refined;
  }
  return mol;
};
