/**
 * Post-layout skeleton angle optimization — enforce 120° C–C–C on alkane spines.
 *
 * Explicit alkyl / aromatic H are invisible to 2D layout (ChemDraw convention).
 */
import type { Molecule } from '@moldraw/domain';
import { bondBetween, type MoleculeGraph } from '../graph';
import {
  ZIGZAG,
  bondAngleDegAt,
  dirBetween,
  dist,
  isHeavyAtom,
  normalizeAngle,
  vecAt,
  type Vec,
} from './layoutGeometry';

const TARGET_CCC = 120;
const TOLERANCE_DEG = 12;

const heavyDegree = (g: MoleculeGraph, atomId: string): number =>
  (g.nodes.get(atomId)?.neighbors ?? []).filter(nb =>
    isHeavyAtom(g.atomById.get(nb)?.element ?? ''),
  ).length;

const isCarbonylCarbon = (g: MoleculeGraph, atomId: string): boolean => {
  if (g.atomById.get(atomId)?.element !== 'C') return false;
  return (g.nodes.get(atomId)?.neighbors ?? []).some(nb => {
    const b = bondBetween(g, atomId, nb);
    return b != null && b.order >= 2 && g.atomById.get(nb)?.element === 'O';
  });
};

/** Walk a linear exocyclic C–C spine from `startId` away from `anchorId`. */
export const walkCarbonSpine = (
  g: MoleculeGraph,
  anchorId: string,
  startId: string,
  ringAtomSet: Set<string>,
): string[] => {
  if (ringAtomSet.has(startId)) return [];
  const spine = [startId];
  let prev = anchorId;
  let cur = startId;
  while (true) {
    const node = g.nodes.get(cur);
    if (!node) break;
    const forward = node.neighbors.filter(nb => {
      if (nb === prev || ringAtomSet.has(nb)) return false;
      return g.atomById.get(nb)?.element === 'C';
    });
    if (forward.length !== 1) break;
    const next = forward[0];
    spine.push(next);
    prev = cur;
    cur = next;
  }
  return spine;
};

const isAlkaneSpine = (
  g: MoleculeGraph,
  anchorId: string,
  spine: string[],
): boolean => {
  // Allow length-1 (methyl) and longer. Explicit H/D ignored.
  // Terminal heteros (–OH, –NH2, halogen) are exo decoration — they must NOT
  // block C–C–C zigzag; they are placed afterward into free 120° slots.
  if (spine.length < 1) return false;
  const spineSet = new Set(spine);
  for (const id of spine) {
    const node = g.nodes.get(id);
    if (!node) return false;
    if (g.atomById.get(id)?.element !== 'C') return false;
    for (const nb of node.neighbors) {
      if (nb === anchorId || spineSet.has(nb)) continue;
      const el = g.atomById.get(nb)?.element ?? '';
      if (!isHeavyAtom(el)) continue; // alkyl / aromatic H — ignore
      if (el === 'C') continue; // methyl / alkyl branch OK
      // Terminal hetero leaf (OH, halogen, …) — ignore for spine purposes.
      const heavyNbs = (g.nodes.get(nb)?.neighbors ?? []).filter(n =>
        isHeavyAtom(g.atomById.get(n)?.element ?? ''),
      );
      if (heavyNbs.length <= 1) continue;
      return false; // bridging / multi-heavy hetero
    }
  }
  return true;
};

export const laySpineZigzag = (
  anchorId: string,
  spine: string[],
  pos: Map<string, Vec>,
  placed: Set<string>,
  bondLen: number,
): void => {
  if (spine.length === 0) return;
  const anchorPos = pos.get(anchorId);
  if (!anchorPos) return;

  const first = spine[0];
  const existing = pos.get(first);
  const firstDir =
    existing != null
      ? dirBetween(anchorPos, existing)
      : dirBetween(anchorPos, vecAt(anchorPos, -Math.PI / 2, bondLen));

  pos.set(first, vecAt(anchorPos, firstDir, bondLen));
  placed.add(first);

  let bondDir = firstDir;
  let flip = 1;
  for (let i = 1; i < spine.length; i++) {
    bondDir += flip * ZIGZAG;
    flip *= -1;
    pos.set(spine[i], vecAt(pos.get(spine[i - 1])!, bondDir, bondLen));
    placed.add(spine[i]);
  }
};

/**
 * Re-optimize exocyclic alkane spines attached to placed anchor atoms.
 * Also re-fans quaternary (4+ C) and tertiary (3 C) junctions to exact
 * 90° / 120° ChemDraw slots so branched carbons don't inherit zigzag angles.
 */
export const optimizeSkeletonAngles = (
  g: MoleculeGraph,
  ringAtomSet: Set<string>,
  bondLen: number,
  pos: Map<string, Vec>,
  placed: Set<string>,
): void => {
  const doneSpines = new Set<string>();
  const spineKey = (anchorId: string, tipId: string) => `${anchorId}->${tipId}`;

  const isChainAnchor = (atomId: string): boolean => {
    if (ringAtomSet.has(atomId)) return true;
    // Branch / junction only — never reverse-layout from a chain tip (heavy degree 1),
    // which overwrites a good ring→tip zigzag with a conflicting tip→ring pass.
    // Count heavy atoms only: methylene C with 2H must NOT look like a junction.
    return heavyDegree(g, atomId) >= 3;
  };

  for (const anchorId of placed) {
    if (!isChainAnchor(anchorId)) continue;
    const node = g.nodes.get(anchorId);
    if (!node) continue;
    for (const nb of node.neighbors) {
      if (g.atomById.get(nb)?.element !== 'C') continue;
      const spine = walkCarbonSpine(g, anchorId, nb, ringAtomSet);
      if (spine.length === 0 || !isAlkaneSpine(g, anchorId, spine)) continue;
      // Don't zigzag through a branch junction — that moves the junction and
      // leaves its side chains pointing at stale absolute coords (→ 0° collapse).
      if (spine.some(id => {
        const cDeg = (g.nodes.get(id)?.neighbors ?? []).filter(
          n => g.atomById.get(n)?.element === 'C',
        ).length;
        return cDeg >= 3 && !ringAtomSet.has(id);
      })) {
        continue;
      }
      const tipId = spine[spine.length - 1];
      const key = spineKey(anchorId, tipId);
      if (doneSpines.has(key)) continue;
      doneSpines.add(key);
      laySpineZigzag(anchorId, spine, pos, placed, bondLen);
    }
  }

  // Fan junctions AFTER spine zigzag so branch methyls aren't left behind.
  relayoutJunctionFans(g, ringAtomSet, bondLen, pos, placed);
};

/**
 * At tertiary/quaternary carbons, redistribute C–C bonds to exact trigonal (120°)
 * or square (90°) fans. Never moves ring atoms. For ring attachments, only fills
 * free exo slots (bisector), leaving the ring polygon intact.
 */
const relayoutJunctionFans = (
  g: MoleculeGraph,
  ringAtomSet: Set<string>,
  bondLen: number,
  pos: Map<string, Vec>,
  placed: Set<string>,
): void => {
  for (const [id, node] of g.nodes) {
    if (!placed.has(id) || !pos.has(id)) continue;
    if (g.atomById.get(id)?.element !== 'C') continue;
    // Never rewrite carbonyl carbons — =O / –OH are placed by hetero decoration.
    if (isCarbonylCarbon(g, id)) continue;

    const cNbs = node.neighbors.filter(
      nb => g.atomById.get(nb)?.element === 'C' && pos.has(nb) && !isCarbonylCarbon(g, nb),
    );
    if (cNbs.length < 3) continue;

    const center = pos.get(id)!;
    const ringNbs = cNbs.filter(nb => ringAtomSet.has(nb));
    const exoNbs = cNbs.filter(nb => !ringAtomSet.has(nb));

    if (ringAtomSet.has(id)) {
      // Ring atom: place each exo into a free trigonal slot relative to ring bonds.
      if (exoNbs.length === 0 || ringNbs.length < 2) continue;
      const ringDirs = ringNbs.map(nb => dirBetween(center, pos.get(nb)!));
      // Ideal exo = average of ring dirs + π (outward bisector).
      let sx = 0;
      let sy = 0;
      for (const d of ringDirs) {
        sx += Math.cos(d);
        sy += Math.sin(d);
      }
      const outward = Math.atan2(-sy, -sx);
      if (exoNbs.length === 1) {
        pos.set(exoNbs[0], vecAt(center, outward, bondLen));
        placed.add(exoNbs[0]);
      } else {
        exoNbs.forEach((nb, i) => {
          const spread = i - (exoNbs.length - 1) / 2;
          pos.set(nb, vecAt(center, outward + spread * ((2 * Math.PI) / 3), bondLen));
          placed.add(nb);
        });
      }
      continue;
    }

    // Acyclic junction: fan all C neighbors from a fixed reference bond.
    const refId = cNbs.find(nb => heavyDegree(g, nb) >= 2) ?? cNbs[0];
    const refDir = dirBetween(center, pos.get(refId)!);
    const step = cNbs.length >= 4 ? Math.PI / 2 : (2 * Math.PI) / 3;
    const others = cNbs.filter(nb => nb !== refId);
    // Assign slots in angular order around the circle starting just after ref.
    others.sort((a, b) => {
      const da = normalizeAngle(dirBetween(center, pos.get(a)!) - refDir);
      const db = normalizeAngle(dirBetween(center, pos.get(b)!) - refDir);
      // Map (-π,π] to (0,2π] so sorting goes counterclockwise from ref.
      const ua = da < 0 ? da + 2 * Math.PI : da;
      const ub = db < 0 ? db + 2 * Math.PI : db;
      return ua - ub;
    });
    others.forEach((nb, i) => {
      const dir = refDir + (i + 1) * step;
      pos.set(nb, vecAt(center, dir, bondLen));
      placed.add(nb);
    });
  }
};

/**
 * Push apart non-bonded atoms that sit closer than ~0.4× bondLen.
 * Prefers translating the smaller chemical fragment (often a phenyl / side chain).
 */
export const resolveAtomOverlaps = (
  g: MoleculeGraph,
  comp: string[],
  ringAtomSet: Set<string>,
  bondLen: number,
  pos: Map<string, Vec>,
): void => {
  const compSet = new Set(comp);
  const minSep = bondLen * 0.45;
  const bonded = new Set<string>();
  for (const a of comp) {
    for (const b of g.nodes.get(a)?.neighbors ?? []) {
      if (a < b) bonded.add(`${a}|${b}`);
      else bonded.add(`${b}|${a}`);
    }
  }

  for (let pass = 0; pass < 6; pass++) {
    let moved = false;
    for (let i = 0; i < comp.length; i++) {
      const a = comp[i]!;
      const pa = pos.get(a);
      if (!pa) continue;
      for (let j = i + 1; j < comp.length; j++) {
        const b = comp[j]!;
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        if (bonded.has(key)) continue;
        const pb = pos.get(b);
        if (!pb) continue;
        const d = dist(pa, pb);
        if (d >= minSep) continue;

        // Never translate atoms that belong to the same fused ring system —
        // that stretches ring bonds. Only move exo fragments / separate rings.
        const bothRing = ringAtomSet.has(a) && ringAtomSet.has(b);
        const sideA = componentBesideBond(g, a, b, compSet);
        const sideB = componentBesideBond(g, b, a, compSet);
        if (sideA.length >= comp.length || sideB.length >= comp.length) continue;

        const ringsIn = (ids: string[]) => ids.filter(id => ringAtomSet.has(id)).length;
        const score = (ids: string[]) => ringsIn(ids) * 100 + ids.length;

        let moveIds: string[] | null = null;
        let from: Vec = pa;
        let to: Vec = pb;

        if (!bothRing) {
          if (sideA.length > 0 && sideA.length < comp.length / 2 && score(sideA) <= score(sideB)) {
            moveIds = sideA;
            from = pb;
            to = pa;
          } else if (sideB.length > 0 && sideB.length < comp.length / 2) {
            moveIds = sideB;
            from = pa;
            to = pb;
          } else if (!ringAtomSet.has(a)) {
            moveIds = [a];
            from = pb;
            to = pa;
          } else if (!ringAtomSet.has(b)) {
            moveIds = [b];
            from = pa;
            to = pb;
          }
        } else {
          // Stacked separate ring systems (e.g. two phenyls): move smaller side.
          if (sideA.length < sideB.length && sideA.length < comp.length * 0.45) {
            moveIds = sideA;
            from = pb;
            to = pa;
          } else if (sideB.length < comp.length * 0.45) {
            moveIds = sideB;
            from = pa;
            to = pb;
          }
        }
        if (!moveIds) continue;

        const push = minSep - d + bondLen * 0.15;
        const dir = d > 1e-6 ? dirBetween(from, to) : Math.atan2(1, 0) + pass * 0.7;
        const dx = Math.cos(dir) * push;
        const dy = Math.sin(dir) * push;
        for (const id of moveIds) {
          const p = pos.get(id);
          if (!p) continue;
          pos.set(id, { x: p.x + dx, y: p.y + dy });
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
};

/**
 * Force every non-ring bond to exactly `bondLen` while keeping current directions.
 * Ring atoms are never moved (they must stay as regular polygons), except when
 * two ring systems are linked by a bridge bond — then the smaller ring is
 * rigid-translated so the bridge length equals `bondLen`.
 *
 * Multi-source BFS from rings leaves "join" edges (non-tree) between branches
 * that were laid far apart — those are snapped by translating the smaller
 * subtree toward the other endpoint.
 */
export const uniformizeBondLengths = (
  g: MoleculeGraph,
  comp: string[],
  ringAtomSet: Set<string>,
  bondLen: number,
  pos: Map<string, Vec>,
): void => {
  if (comp.length === 0 || bondLen <= 0) return;
  const compSet = new Set(comp);

  // Rigid-translate bridged ring systems so inter-ring bonds are exact.
  snapBridgeRingDistances(g, comp, ringAtomSet, bondLen, pos);

  // Seed BFS from all ring atoms (frozen) so we only reposition exocyclic atoms.
  const parent = new Map<string, string | null>();
  const order: string[] = [];
  const seen = new Set<string>();
  const queue: string[] = [];

  for (const id of comp) {
    if (!ringAtomSet.has(id)) continue;
    seen.add(id);
    parent.set(id, null);
    queue.push(id);
  }

  if (queue.length === 0) {
    const root = comp.reduce(
      (best, id) => (heavyDegree(g, id) > heavyDegree(g, best) ? id : best),
      comp[0],
    );
    seen.add(root);
    parent.set(root, null);
    queue.push(root);
  }

  while (queue.length) {
    const u = queue.shift()!;
    order.push(u);
    for (const nb of g.nodes.get(u)?.neighbors ?? []) {
      if (!compSet.has(nb) || seen.has(nb)) continue;
      seen.add(nb);
      parent.set(nb, u);
      queue.push(nb);
    }
  }

  const snapTreeEdges = (): void => {
    for (const v of order) {
      if (ringAtomSet.has(v)) continue;
      const u = parent.get(v);
      if (u == null) continue;
      const pu = pos.get(u);
      const pv = pos.get(v);
      if (!pu || !pv) continue;
      pos.set(v, vecAt(pu, dirBetween(pu, pv), bondLen));
    }
  };

  snapTreeEdges();

  // Snap non-tree join edges by translating the chemical side that has no
  // ring atoms (fixes multi-source BFS meet points on side chains).
  snapJoinEdges(g, comp, ringAtomSet, bondLen, pos, parent);
};

/**
 * Atoms reachable from `start` without crossing the blocked neighbor.
 * Used to translate one chemical side of a join bond.
 */
const componentBesideBond = (
  g: MoleculeGraph,
  start: string,
  blocked: string,
  compSet: Set<string>,
): string[] => {
  const out: string[] = [];
  const seen = new Set<string>([blocked]);
  const q = [start];
  seen.add(start);
  while (q.length) {
    const u = q.shift()!;
    out.push(u);
    for (const nb of g.nodes.get(u)?.neighbors ?? []) {
      if (!compSet.has(nb) || seen.has(nb)) continue;
      seen.add(nb);
      q.push(nb);
    }
  }
  return out;
};

const snapJoinEdges = (
  g: MoleculeGraph,
  comp: string[],
  ringAtomSet: Set<string>,
  bondLen: number,
  pos: Map<string, Vec>,
  parent: Map<string, string | null>,
): void => {
  const compSet = new Set(comp);
  const done = new Set<string>();
  for (const a of comp) {
    for (const b of g.nodes.get(a)?.neighbors ?? []) {
      if (a >= b) continue;
      const key = `${a}|${b}`;
      if (done.has(key)) continue;
      done.add(key);
      if (parent.get(a) === b || parent.get(b) === a) continue;
      if (ringAtomSet.has(a) && ringAtomSet.has(b)) continue;

      const pa = pos.get(a);
      const pb = pos.get(b);
      if (!pa || !pb) continue;
      const cur = dist(pa, pb);
      if (Math.abs(cur - bondLen) < 0.5) continue;

      const sideA = componentBesideBond(g, a, b, compSet);
      const sideB = componentBesideBond(g, b, a, compSet);
      // Never translate the whole molecule.
      if (sideA.length >= comp.length || sideB.length >= comp.length) continue;
      if (sideA.length === 0 || sideB.length === 0) continue;

      // Prefer a side with no rings; otherwise the smaller chemical fragment.
      const ringsIn = (ids: string[]) => ids.filter(id => ringAtomSet.has(id)).length;
      const score = (ids: string[]) => ringsIn(ids) * 1000 + ids.length;
      const moveA = score(sideA) <= score(sideB);
      const moveIds = moveA ? sideA : sideB;
      const fixed = moveA ? pb : pa;
      const movingId = moveA ? a : b;
      const moving = pos.get(movingId);
      if (!moving) continue;
      const dir = cur > 1e-6 ? dirBetween(fixed, moving) : 0;
      const target = vecAt(fixed, dir, bondLen);
      const dx = target.x - moving.x;
      const dy = target.y - moving.y;
      if (Math.hypot(dx, dy) < 0.01) continue;
      for (const id of moveIds) {
        const p = pos.get(id);
        if (!p) continue;
        pos.set(id, { x: p.x + dx, y: p.y + dy });
      }
    }
  }
};

/** Move whole ring subgraphs so bridge bonds between rings equal `bondLen`. */
const snapBridgeRingDistances = (
  g: MoleculeGraph,
  comp: string[],
  ringAtomSet: Set<string>,
  bondLen: number,
  pos: Map<string, Vec>,
): void => {
  const ringAtoms = comp.filter(id => ringAtomSet.has(id));
  if (ringAtoms.length < 6) return;

  // Connected components within ringAtomSet (fused systems stay together).
  const ringCompOf = new Map<string, string[]>();
  const seen = new Set<string>();
  for (const start of ringAtoms) {
    if (seen.has(start)) continue;
    const group: string[] = [];
    const q = [start];
    seen.add(start);
    while (q.length) {
      const u = q.shift()!;
      group.push(u);
      for (const nb of g.nodes.get(u)?.neighbors ?? []) {
        if (!ringAtomSet.has(nb) || seen.has(nb)) continue;
        seen.add(nb);
        q.push(nb);
      }
    }
    for (const id of group) ringCompOf.set(id, group);
  }

  const done = new Set<string>();
  for (const a of ringAtoms) {
    for (const b of g.nodes.get(a)?.neighbors ?? []) {
      if (!ringAtomSet.has(b)) continue;
      const ga = ringCompOf.get(a);
      const gb = ringCompOf.get(b);
      if (!ga || !gb || ga === gb) continue;
      const key = [a, b].sort().join('|');
      if (done.has(key)) continue;
      done.add(key);

      const pa = pos.get(a);
      const pb = pos.get(b);
      if (!pa || !pb) continue;
      const cur = dist(pa, pb);
      if (Math.abs(cur - bondLen) < 0.5) continue;

      // Translate the smaller ring group so b sits at bondLen from a.
      const moveGroup = ga.length <= gb.length ? ga : gb;
      const fixedId = moveGroup === ga ? b : a;
      const moveId = moveGroup === ga ? a : b;
      const fixed = pos.get(fixedId)!;
      const moving = pos.get(moveId)!;
      const dir = dirBetween(fixed, moving);
      const target = vecAt(fixed, dir, bondLen);
      const dx = target.x - moving.x;
      const dy = target.y - moving.y;
      for (const id of moveGroup) {
        const p = pos.get(id);
        if (!p) continue;
        pos.set(id, { x: p.x + dx, y: p.y + dy });
      }
    }
  }
};

export interface SkeletonAngleReport {
  cccAngles: number[];
  badCount: number;
  totalCount: number;
}

/** Measure interior C–C–C angles on the skeleton (for tests / diagnostics). */
export const measureSkeletonAngles = (
  mol: Molecule,
  g: MoleculeGraph,
  pos: Map<string, Vec>,
  ringAtomSet: Set<string>,
): SkeletonAngleReport => {
  const cccAngles: number[] = [];
  for (const a of mol.atoms) {
    if (a.element !== 'C') continue;
    const node = g.nodes.get(a.id);
    if (!node) continue;
    const cNbs = node.neighbors.filter(nb => g.atomById.get(nb)?.element === 'C');
    if (cNbs.length < 2) continue;
    for (let i = 0; i < cNbs.length; i++) {
      for (let j = i + 1; j < cNbs.length; j++) {
        if (ringAtomSet.has(a.id) && ringAtomSet.has(cNbs[i]) && ringAtomSet.has(cNbs[j])) {
          continue;
        }
        cccAngles.push(bondAngleDegAt(pos, a.id, cNbs[i], cNbs[j]));
      }
    }
  }
  const badCount = cccAngles.filter(
    a => Math.abs(a - TARGET_CCC) > TOLERANCE_DEG && Math.abs(a - 180) > TOLERANCE_DEG,
  ).length;
  return { cccAngles, badCount, totalCount: cccAngles.length };
};
