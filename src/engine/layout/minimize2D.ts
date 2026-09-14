/**
 * Stage 1 certified 2D layout — native force-field minimize.
 *
 * Pure TypeScript, offline, no templates. Energy terms:
 *   - bond stretch  → bondLengthPx
 *   - angle bend    → 120° (exo / chains); ring interior from n-gon
 *   - nonbonded     → short-range repulsion
 *   - ring regular  → soft equal-chord constraint per SSSR ring
 *
 * Fused ring systems move as rigid bodies (translate + rotate).
 * Minimizer: conjugate-gradient with backtracking line search.
 */
import type { Molecule } from '@moldraw/domain';
import { buildGraph, type MoleculeGraph } from '../graph';
import { perceiveRings } from '../chem/rings';
import type { Ring } from '../types';
import { isAcceptableLayout, measureLayoutQuality } from './layoutQuality';

export interface Minimize2DOptions {
  bondLengthPx: number;
  /** Max CG iterations. Default scales with heavy-atom count. */
  maxIterations?: number;
  /** Skip when layout already passes the quality gate. Default false for cleanup. */
  onlyIfNeeded?: boolean;
}

interface Vec {
  x: number;
  y: number;
}

interface RigidBlock {
  ids: string[];
  local: Map<string, Vec>;
}

const TRIGONAL = (2 * Math.PI) / 3;

const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);
const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const scale = (a: Vec, s: number): Vec => ({ x: a.x * s, y: a.y * s });
const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y;
const norm = (a: Vec): number => Math.hypot(a.x, a.y);

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

const applyPos = (mol: Molecule, pos: Map<string, Vec>): Molecule => ({
  ...mol,
  atoms: mol.atoms.map(a => {
    const p = pos.get(a.id);
    return p ? { ...a, x: p.x, y: p.y } : a;
  }),
});

const layoutScore = (mol: Molecule): number => {
  const q = measureLayoutQuality(mol);
  return q.overlaps * 10 + q.crossings * 8 + q.bondRatio * 2 + q.badCccFraction * 20;
};

const clonePos = (pos: Map<string, Vec>): Map<string, Vec> => {
  const out = new Map<string, Vec>();
  for (const [id, p] of pos) out.set(id, { x: p.x, y: p.y });
  return out;
};

interface ForceField {
  heavyIds: string[];
  bonds: { a: string; b: string }[];
  bonded: Set<string>;
  angles: { a: string; c: string; b: string; target: number }[];
  rings: Ring[];
  blocks: RigidBlock[];
  blockOf: Map<string, RigidBlock>;
  bondLen: number;
  kBond: number;
  kAngle: number;
  kRepel: number;
  kRing: number;
  repelCutoff: number;
}

const buildForceField = (
  mol: Molecule,
  bondLen: number,
): { ff: ForceField; pos: Map<string, Vec> } | null => {
  const g = buildGraph(mol);
  const rings = perceiveRings(mol);
  const ringAtomSet = new Set(rings.flatMap(r => r.atomIds));

  const pos = new Map<string, Vec>();
  for (const a of mol.atoms) {
    if (a.element === 'H') continue;
    pos.set(a.id, { x: a.x, y: a.y });
  }
  const heavyIds = [...pos.keys()];
  if (heavyIds.length < 2) return null;

  const blocks = buildRigidBlocks(g, ringAtomSet, pos);
  const blockOf = new Map<string, RigidBlock>();
  for (const b of blocks) {
    for (const id of b.ids) blockOf.set(id, b);
  }

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

  const angles: { a: string; c: string; b: string; target: number }[] = [];
  for (const id of heavyIds) {
    const nbs = (g.nodes.get(id)?.neighbors ?? []).filter(nb => pos.has(nb));
    if (nbs.length < 2) continue;
    for (let i = 0; i < nbs.length; i++) {
      for (let j = i + 1; j < nbs.length; j++) {
        const a = nbs[i]!;
        const b = nbs[j]!;
        const ba = blockOf.get(a);
        const bb = blockOf.get(b);
        const bc = blockOf.get(id);
        // Interior angles of a rigid fused block are frozen by the block shape.
        if (ba && bb && bc && ba === bb && ba === bc) continue;
        let target = TRIGONAL;
        if (ringAtomSet.has(id) && ringAtomSet.has(a) && ringAtomSet.has(b)) {
          // Soft ring interior: (n-2)/n * π for the smallest ring containing all three.
          const host = rings.find(
            r =>
              r.atomIds.includes(id) && r.atomIds.includes(a) && r.atomIds.includes(b),
          );
          if (host) target = (Math.PI * (host.size - 2)) / host.size;
        }
        angles.push({ a, c: id, b, target });
      }
    }
  }

  return {
    pos,
    ff: {
      heavyIds,
      bonds,
      bonded,
      angles,
      rings,
      blocks,
      blockOf,
      bondLen,
      kBond: 2.2,
      kAngle: 0.55,
      kRepel: 0.85,
      kRing: 1.1,
      repelCutoff: bondLen * 1.55,
    },
  };
};

/** Energy + per-atom force (negative gradient of energy). */
const energyAndForce = (
  pos: Map<string, Vec>,
  ff: ForceField,
): { energy: number; force: Map<string, Vec> } => {
  const force = new Map<string, Vec>();
  for (const id of ff.heavyIds) force.set(id, { x: 0, y: 0 });
  let energy = 0;

  // Bond stretch: E = 0.5 k (d - L)^2
  for (const { a, b } of ff.bonds) {
    const pa = pos.get(a)!;
    const pb = pos.get(b)!;
    const d = dist(pa, pb);
    if (d < 1e-8) continue;
    const diff = d - ff.bondLen;
    energy += 0.5 * ff.kBond * diff * diff;
    const mag = ff.kBond * diff;
    const fx = ((pb.x - pa.x) / d) * mag;
    const fy = ((pb.y - pa.y) / d) * mag;
    // Force on a pulls toward equilibrium along bond (negative grad).
    force.set(a, add(force.get(a)!, { x: fx, y: fy }));
    force.set(b, add(force.get(b)!, { x: -fx, y: -fy }));
  }

  // Angle bend: E = 0.5 k (θ - θ0)^2
  for (const { a, c, b, target } of ff.angles) {
    const pa = pos.get(a)!;
    const pc = pos.get(c)!;
    const pb = pos.get(b)!;
    const v1 = sub(pa, pc);
    const v2 = sub(pb, pc);
    const n1 = norm(v1);
    const n2 = norm(v2);
    if (n1 < 1e-8 || n2 < 1e-8) continue;
    const u1 = scale(v1, 1 / n1);
    const u2 = scale(v2, 1 / n2);
    let cos = Math.max(-1, Math.min(1, dot(u1, u2)));
    const ang = Math.acos(cos);
    const err = ang - target;
    energy += 0.5 * ff.kAngle * err * err;
    if (Math.abs(err) < 1e-5) continue;
    const cross = u1.x * u2.y - u1.y * u2.x;
    const sign = cross >= 0 ? 1 : -1;
    const p1 = { x: -u1.y * sign, y: u1.x * sign };
    const p2 = { x: u2.y * sign, y: -u2.x * sign };
    const mag = ff.kAngle * err * ff.bondLen * 0.45;
    force.set(a, add(force.get(a)!, scale(p1, mag)));
    force.set(b, add(force.get(b)!, scale(p2, mag)));
    force.set(c, add(force.get(c)!, scale(add(p1, p2), -0.5 * mag)));
  }

  // Nonbonded repulsion: E = 0.5 k (cutoff - d)^2 for d < cutoff
  for (let i = 0; i < ff.heavyIds.length; i++) {
    const idA = ff.heavyIds[i]!;
    const pa = pos.get(idA)!;
    for (let j = i + 1; j < ff.heavyIds.length; j++) {
      const idB = ff.heavyIds[j]!;
      const key = idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
      if (ff.bonded.has(key)) continue;
      const ba = ff.blockOf.get(idA);
      const bb = ff.blockOf.get(idB);
      if (ba && bb && ba === bb) continue;
      const pb = pos.get(idB)!;
      const d = dist(pa, pb);
      if (d >= ff.repelCutoff || d < 1e-8) continue;
      const gap = ff.repelCutoff - d;
      energy += 0.5 * ff.kRepel * gap * gap;
      const mag = ff.kRepel * gap;
      const fx = ((pa.x - pb.x) / d) * mag;
      const fy = ((pa.y - pb.y) / d) * mag;
      force.set(idA, add(force.get(idA)!, { x: fx, y: fy }));
      force.set(idB, add(force.get(idB)!, { x: -fx, y: -fy }));
    }
  }

  // Soft ring regularity: each ring edge → bondLen
  for (const ring of ff.rings) {
    const ids = ring.atomIds;
    const n = ids.length;
    if (n < 3) continue;
    for (let i = 0; i < n; i++) {
      const a = ids[i]!;
      const b = ids[(i + 1) % n]!;
      if (!pos.has(a) || !pos.has(b)) continue;
      // Skip if already a bonded pair counted in bond stretch with same k —
      // still add soft ring term for equal chords.
      const pa = pos.get(a)!;
      const pb = pos.get(b)!;
      const d = dist(pa, pb);
      if (d < 1e-8) continue;
      const diff = d - ff.bondLen;
      energy += 0.5 * ff.kRing * diff * diff;
      const mag = ff.kRing * diff;
      const fx = ((pb.x - pa.x) / d) * mag;
      const fy = ((pb.y - pa.y) / d) * mag;
      force.set(a, add(force.get(a)!, { x: fx, y: fy }));
      force.set(b, add(force.get(b)!, { x: -fx, y: -fy }));
    }
  }

  return { energy, force };
};

/** Project free-atom forces; convert block forces to rigid translate + rotate. */
const applyForcesAsStep = (
  pos: Map<string, Vec>,
  force: Map<string, Vec>,
  ff: ForceField,
  step: number,
  maxStep: number,
): void => {
  // Free atoms.
  for (const id of ff.heavyIds) {
    if (ff.blockOf.has(id)) continue;
    const f = force.get(id)!;
    let dx = f.x * step;
    let dy = f.y * step;
    const len = Math.hypot(dx, dy);
    if (len > maxStep) {
      dx = (dx / len) * maxStep;
      dy = (dy / len) * maxStep;
    }
    const p = pos.get(id)!;
    pos.set(id, { x: p.x + dx, y: p.y + dy });
  }

  // Rigid blocks.
  for (const block of ff.blocks) {
    let fx = 0;
    let fy = 0;
    let torque = 0;
    const c = centroid(block.ids, pos);
    for (const id of block.ids) {
      const f = force.get(id)!;
      fx += f.x;
      fy += f.y;
      const p = pos.get(id)!;
      torque += (p.x - c.x) * f.y - (p.y - c.y) * f.x;
    }
    const n = block.ids.length;
    let tdx = (fx / n) * step;
    let tdy = (fy / n) * step;
    const tlen = Math.hypot(tdx, tdy);
    if (tlen > maxStep) {
      tdx = (tdx / tlen) * maxStep;
      tdy = (tdy / tlen) * maxStep;
    }
    const inertia = Math.max(n * ff.bondLen * ff.bondLen, 1);
    let dTheta = (torque / inertia) * step * 3.5;
    const maxTheta = 0.15;
    if (dTheta > maxTheta) dTheta = maxTheta;
    if (dTheta < -maxTheta) dTheta = -maxTheta;
    const cosT = Math.cos(dTheta);
    const sinT = Math.sin(dTheta);
    const nc = { x: c.x + tdx, y: c.y + tdy };
    // Do not mutate block.local here — line search may reject this step.
    for (const id of block.ids) {
      const loc = block.local.get(id)!;
      const rx = loc.x * cosT - loc.y * sinT;
      const ry = loc.x * sinT + loc.y * cosT;
      pos.set(id, { x: nc.x + rx, y: nc.y + ry });
    }
  }
};

const totalForceNorm = (force: Map<string, Vec>, heavyIds: string[]): number => {
  let s = 0;
  for (const id of heavyIds) {
    const f = force.get(id)!;
    s += f.x * f.x + f.y * f.y;
  }
  return Math.sqrt(s);
};

/**
 * Minimize 2D layout energy with conjugate-gradient + backtracking line search.
 */
export const minimize2D = (mol: Molecule, options: Minimize2DOptions): Molecule => {
  const bondLen = options.bondLengthPx;
  if (mol.atoms.length < 2 || bondLen <= 0) return mol;
  if (options.onlyIfNeeded && isAcceptableLayout(mol)) return mol;

  const built = buildForceField(mol, bondLen);
  if (!built) return mol;
  const { ff } = built;
  let pos = built.pos;

  const nHeavy = ff.heavyIds.length;
  const maxIter =
    options.maxIterations ??
    Math.min(320, Math.max(80, Math.floor(60 + nHeavy * 2.2)));
  const maxStep = bondLen * 0.4;

  let { energy, force } = energyAndForce(pos, ff);
  let direction = clonePos(force);

  let bestPos = clonePos(pos);
  let bestScore = layoutScore(applyPos(mol, pos));
  let bestEnergy = energy;
  let prevForceNorm2 = 0;
  for (const f of force.values()) prevForceNorm2 += f.x * f.x + f.y * f.y;

  for (let iter = 0; iter < maxIter; iter++) {
    const fNorm = totalForceNorm(force, ff.heavyIds);
    if (fNorm < 1e-4 * bondLen) break;

    // Backtracking line search along `direction` (same shape as force map).
    let step = 0.35;
    let accepted = false;
    let trialPos = pos;
    let trialEnergy = energy;
    let trialForce = force;

    for (let ls = 0; ls < 10; ls++) {
      trialPos = clonePos(pos);
      // Temporarily use direction as the force for the step applicator.
      applyForcesAsStep(trialPos, direction, ff, step, maxStep);
      const evaled = energyAndForce(trialPos, ff);
      // Armijo-like: accept if energy decreased.
      if (evaled.energy < energy - 1e-8) {
        trialEnergy = evaled.energy;
        trialForce = evaled.force;
        accepted = true;
        break;
      }
      step *= 0.5;
    }

    if (!accepted) {
      // Restart steepest descent from current force.
      direction = new Map();
      for (const [id, f] of force) direction.set(id, { x: f.x, y: f.y });
      step = 0.15;
      trialPos = clonePos(pos);
      applyForcesAsStep(trialPos, direction, ff, step, maxStep);
      const evaled = energyAndForce(trialPos, ff);
      trialEnergy = evaled.energy;
      trialForce = evaled.force;
    }

    // Polak–Ribière CG for next direction.
    let newNorm2 = 0;
    let pr = 0;
    for (const id of ff.heavyIds) {
      const fNew = trialForce.get(id)!;
      const fOld = force.get(id)!;
      newNorm2 += fNew.x * fNew.x + fNew.y * fNew.y;
      pr += fNew.x * (fNew.x - fOld.x) + fNew.y * (fNew.y - fOld.y);
    }
    const beta = prevForceNorm2 > 1e-16 ? Math.max(0, pr / prevForceNorm2) : 0;
    const nextDir = new Map<string, Vec>();
    for (const id of ff.heavyIds) {
      const fNew = trialForce.get(id)!;
      const dOld = direction.get(id) ?? { x: 0, y: 0 };
      nextDir.set(id, { x: fNew.x + beta * dOld.x, y: fNew.y + beta * dOld.y });
    }

    pos = trialPos;
    energy = trialEnergy;
    force = trialForce;
    direction = nextDir;
    prevForceNorm2 = newNorm2;

    // Sync rigid-block local frames to current positions.
    for (const block of ff.blocks) {
      const c = centroid(block.ids, pos);
      for (const id of block.ids) {
        const p = pos.get(id)!;
        block.local.set(id, { x: p.x - c.x, y: p.y - c.y });
      }
    }

    if (iter % 6 === 5 || iter === maxIter - 1) {
      const candidate = applyPos(mol, pos);
      const s = layoutScore(candidate);
      if (s < bestScore || (s === bestScore && energy < bestEnergy)) {
        bestScore = s;
        bestEnergy = energy;
        bestPos = clonePos(pos);
      }
    }
  }

  const minimized = applyPos(mol, bestPos);
  const before = layoutScore(mol);
  const after = layoutScore(minimized);
  if (after <= before + 0.05 || isAcceptableLayout(minimized)) {
    return minimized;
  }
  // Still return minimized if energy clearly dropped and overlaps improved.
  const qb = measureLayoutQuality(mol);
  const qa = measureLayoutQuality(minimized);
  if (qa.overlaps <= qb.overlaps && qa.crossings <= qb.crossings + 2) {
    return minimized;
  }
  return mol;
};
