/**
 * Graph-based carbon-skeleton 2D layout orchestrator.
 *
 * Pipeline per connected component:
 *   1. Classify skeleton nodes (ring / chain / junction / carbonyl / hetero)
 *   2. Layout rings (regular polygons, fuse at shared edges)
 *   3. BFS/DFS traverse C skeleton with 120° angle rules
 *   4. Decorate heteroatoms (O, N, S, halogens) — H is never positioned
 *   5. Optimize alkane spines to 120° C–C–C
 */
import { bondBetween, type MoleculeGraph } from '../graph';
import type { Ring } from '../types';
import { classifySkeleton, type SkeletonClassification } from './skeletonClassify';
import {
  computeChildDirections,
  shouldKeepExactFan,
  shouldUseChainZigzag,
  sortChildrenForLayout,
} from './skeletonRules';
import { optimizeSkeletonAngles, uniformizeBondLengths, resolveAtomOverlaps } from './optimizeSkeleton';
import {
  fusedRingFingerprint,
  orderRingsForScaffold,
  preferredCoreRingSize,
} from './scaffoldTemplates';
import { isBridgedRingSystem, layoutBridgedComponent } from './bridgedLayout';
import {
  TRIGONAL,
  ZIGZAG,
  bondAngleDegAt,
  centroidOf,
  collidesWithPlaced,
  conflictsWith,
  dirBetween,
  dist,
  isHeavyAtom,
  normalizeAngle,
  occupiedBondDirs,
  pickFreeDirection,
  pickFreeDirectionSafe,
  vecAt,
  type Vec,
} from './layoutGeometry';

export type SkeletonLayoutMode = 'full' | 'correct';

const cross2 = (o: Vec, p: Vec, q: Vec): number =>
  (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);

const idealRingInterior = (n: number): number => (Math.PI * (n - 2)) / n;

const bfsInComp = (
  g: MoleculeGraph,
  start: string,
  compSet: Set<string>,
): { dist: Map<string, number>; prev: Map<string, string> } => {
  const distMap = new Map<string, number>();
  const prev = new Map<string, string>();
  const q = [start];
  distMap.set(start, 0);
  while (q.length) {
    const u = q.shift()!;
    for (const nb of g.nodes.get(u)?.neighbors ?? []) {
      if (!compSet.has(nb) || distMap.has(nb)) continue;
      distMap.set(nb, distMap.get(u)! + 1);
      prev.set(nb, u);
      q.push(nb);
    }
  }
  return { dist: distMap, prev };
};

const diameterPath = (g: MoleculeGraph, comp: string[]): string[] => {
  // Path atoms = carbons + bridging heteros (ester/ether O, amine N, …).
  // Exclude terminal =O / –OH so carbonyl oxygens are decorated trigonal,
  // not laid as zigzag chain tips.
  const isPathAtom = (id: string): boolean => {
    const el = g.atomById.get(id)?.element ?? '';
    if (el === 'C') return true;
    if (el === 'O' || el === 'N' || el === 'S' || el === 'P') {
      return (g.nodes.get(id)?.neighbors.length ?? 0) >= 2;
    }
    return false;
  };
  const pool = comp.filter(isPathAtom);
  const use = pool.length >= 2 ? pool : comp;
  if (use.length <= 1) return [...use];
  const compSet = new Set(use);
  const first = bfsInComp(g, use[0], compSet);
  let endA = use[0];
  let maxD = 0;
  for (const id of use) {
    const d = first.dist.get(id) ?? 0;
    if (d > maxD) {
      maxD = d;
      endA = id;
    }
  }
  const second = bfsInComp(g, endA, compSet);
  let endB = endA;
  maxD = 0;
  for (const id of use) {
    const d = second.dist.get(id) ?? 0;
    if (d > maxD) {
      maxD = d;
      endB = id;
    }
  }
  const path: string[] = [];
  let cur = endB;
  while (true) {
    path.unshift(cur);
    if (cur === endA) break;
    const p = second.prev.get(cur);
    if (p === undefined) break;
    cur = p;
  }
  return path;
};

const orderRingsForLayout = (rings: Ring[]): Ring[] => {
  if (rings.length <= 1) return [...rings];
  const sorted = [...rings].sort((a, b) => b.size - a.size);
  const ordered: Ring[] = [sorted[0]];
  const placedAtoms = new Set(sorted[0].atomIds);
  const remaining = new Set(sorted.slice(1));
  while (remaining.size > 0) {
    let best: Ring | null = null;
    let bestShared = -1;
    for (const r of remaining) {
      const shared = r.atomIds.filter(id => placedAtoms.has(id)).length;
      if (shared > bestShared) {
        best = r;
        bestShared = shared;
      }
    }
    if (!best || bestShared <= 0) {
      ordered.push(...remaining);
      break;
    }
    ordered.push(best);
    remaining.delete(best);
    for (const id of best.atomIds) placedAtoms.add(id);
  }
  return ordered;
};

const placeRegularPolygon = (
  atomIds: string[],
  center: Vec,
  bondLen: number,
  startAngle: number,
  pos: Map<string, Vec>,
  placed: Set<string>,
): void => {
  const n = atomIds.length;
  if (n < 3) return;
  const radius = bondLen / (2 * Math.sin(Math.PI / n));
  atomIds.forEach((id, k) => {
    if (placed.has(id)) return;
    const ang = startAngle + (2 * Math.PI * k) / n;
    pos.set(id, { x: center.x + radius * Math.cos(ang), y: center.y + radius * Math.sin(ang) });
    placed.add(id);
  });
};

const pickFusionTurn = (
  pb: Vec,
  incomingDir: number,
  turnMag: number,
  bondLen: number,
  placedCentroid: Vec | null,
): number => {
  const dir1 = incomingDir + turnMag;
  const dir2 = incomingDir - turnMag;
  const c1 = vecAt(pb, dir1, bondLen);
  const c2 = vecAt(pb, dir2, bondLen);
  if (placedCentroid) {
    return dist(c1, placedCentroid) >= dist(c2, placedCentroid) ? dir1 : dir2;
  }
  return dir1;
};

/**
 * Place a fused ring as a regular polygon sharing edge (edgeIdx, edgeIdx+1).
 * More reliable than turn-walking for naphthalene / anthracene.
 */
const placeFusedRegularPolygon = (
  ids: string[],
  edgeIdx: number,
  bondLen: number,
  pos: Map<string, Vec>,
  placed: Set<string>,
  outwardSign: 1 | -1,
): boolean => {
  const n = ids.length;
  if (n < 3) return false;
  const a = ids[edgeIdx];
  const b = ids[(edgeIdx + 1) % n];
  const pa = pos.get(a);
  const pb = pos.get(b);
  if (!pa || !pb) return false;

  const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
  const edgeDx = pb.x - pa.x;
  const edgeDy = pb.y - pa.y;
  const edgeLen = Math.hypot(edgeDx, edgeDy);
  if (edgeLen < 1e-6) return false;

  // Perpendicular unit (two choices); outwardSign picks side.
  const nx = (-edgeDy / edgeLen) * outwardSign;
  const ny = (edgeDx / edgeLen) * outwardSign;

  // Distance from edge midpoint to polygon center for regular n-gon with side = bondLen.
  const radius = bondLen / (2 * Math.sin(Math.PI / n));
  const apothem = radius * Math.cos(Math.PI / n);
  const center = { x: mid.x + nx * apothem, y: mid.y + ny * apothem };

  // Angle of atom `a` around center; walk in ring order.
  const angA = Math.atan2(pa.y - center.y, pa.x - center.x);
  const angB = Math.atan2(pb.y - center.y, pb.x - center.x);
  // Step direction: from a toward b around the circle.
  let step = normalizeAngle(angB - angA);
  // Prefer the short arc matching one exterior angle (2π/n).
  const targetStep = (2 * Math.PI) / n;
  if (Math.abs(Math.abs(step) - targetStep) > 0.35) {
    // Wrong winding — flip.
    step = step > 0 ? step - 2 * Math.PI : step + 2 * Math.PI;
  }
  const signedStep = step >= 0 ? targetStep : -targetStep;

  const snapshot = new Map<string, Vec>();
  for (let k = 0; k < n; k++) {
    const id = ids[(edgeIdx + k) % n];
    if (placed.has(id)) continue;
    const ang = angA + signedStep * k;
    snapshot.set(id, {
      x: center.x + radius * Math.cos(ang),
      y: center.y + radius * Math.sin(ang),
    });
  }

  const unplaced = ids.filter(id => !placed.has(id));
  if (snapshot.size < unplaced.length) return false;

  // Sanity: new atoms should not sit on top of already-placed non-shared atoms.
  for (const p of snapshot.values()) {
    for (const [oid, q] of pos) {
      if (oid === a || oid === b || snapshot.has(oid)) continue;
      if (dist(p, q) < bondLen * 0.4) return false;
    }
  }

  for (const [sid, p] of snapshot) {
    pos.set(sid, p);
    placed.add(sid);
  }
  return unplaced.every(uid => placed.has(uid));
};

const extendRingFromEdge = (
  ids: string[],
  edgeIdx: number,
  bondLen: number,
  pos: Map<string, Vec>,
  placed: Set<string>,
): boolean => {
  const placedCentroid = centroidOf([...placed], pos);
  const a = ids[edgeIdx];
  const b = ids[(edgeIdx + 1) % nSafe(ids)];
  const pa = pos.get(a)!;
  const pb = pos.get(b)!;
  const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
  const edgeDx = pb.x - pa.x;
  const edgeDy = pb.y - pa.y;
  const edgeLen = Math.hypot(edgeDx, edgeDy) || 1;
  // Sign that points away from existing ring centroid.
  const n1 = { x: -edgeDy / edgeLen, y: edgeDx / edgeLen };
  const c1 = { x: mid.x + n1.x, y: mid.y + n1.y };
  const c2 = { x: mid.x - n1.x, y: mid.y - n1.y };
  const preferPositive =
    !placedCentroid || dist(c1, placedCentroid) >= dist(c2, placedCentroid);
  const first: 1 | -1 = preferPositive ? 1 : -1;
  const second: 1 | -1 = first === 1 ? -1 : 1;
  if (placeFusedRegularPolygon(ids, edgeIdx, bondLen, pos, placed, first)) return true;
  if (placeFusedRegularPolygon(ids, edgeIdx, bondLen, pos, placed, second)) return true;
  // Fallback: classic turn-walk (both windings).
  return tryExtendRingTurnWalk(ids, edgeIdx, bondLen, pos, placed, true)
    || tryExtendRingTurnWalk(ids, edgeIdx, bondLen, pos, placed, false);
};

const nSafe = (ids: string[]): number => ids.length;

const tryExtendRingTurnWalk = (
  ids: string[],
  edgeIdx: number,
  bondLen: number,
  pos: Map<string, Vec>,
  placed: Set<string>,
  preferOutward: boolean,
): boolean => {
  const n = ids.length;
  const exterior = (2 * Math.PI) / n;
  const turnMag = Math.PI - exterior;
  const a = ids[edgeIdx];
  const b = ids[(edgeIdx + 1) % n];
  const pa = pos.get(a)!;
  const pb = pos.get(b)!;
  const incomingDir = dirBetween(pa, pb);
  const nextIdx = (edgeIdx + 2) % n;
  const nextId = ids[nextIdx];
  if (placed.has(nextId)) return false;

  const placedCentroid = centroidOf([...placed], pos);
  let outDir = pickFusionTurn(pb, incomingDir, turnMag, bondLen, placedCentroid);
  if (!preferOutward) {
    outDir = outDir === incomingDir + turnMag ? incomingDir - turnMag : incomingDir + turnMag;
  }

  const snapshot = new Map<string, Vec>();
  const newly: string[] = [];
  snapshot.set(nextId, vecAt(pb, outDir, bondLen));
  newly.push(nextId);

  const turnStep = cross2(pa, pb, snapshot.get(nextId)!) >= 0 ? -turnMag : turnMag;
  let prevId = nextId;
  let curIdx = nextIdx;
  let curOutDir = outDir;
  while (true) {
    curOutDir += turnStep;
    curIdx = (curIdx + 1) % n;
    const curId = ids[curIdx];
    if (placed.has(curId) || snapshot.has(curId)) break;
    snapshot.set(curId, vecAt(snapshot.get(prevId)!, curOutDir, bondLen));
    newly.push(curId);
    prevId = curId;
  }

  const unplaced = ids.filter(uid => !placed.has(uid));
  if (newly.length < unplaced.length) return false;
  for (const p of snapshot.values()) {
    for (const [oid, q] of pos) {
      if (oid === a || oid === b || snapshot.has(oid)) continue;
      if (dist(p, q) < bondLen * 0.4) return false;
    }
  }
  for (const nid of newly) {
    pos.set(nid, snapshot.get(nid)!);
    placed.add(nid);
  }
  return unplaced.every(uid => placed.has(uid));
};

/**
 * Place a ring that shares no atoms with already-placed rings but is connected
 * by a bridge bond or a short acyclic linker (biphenyl, stilbene, etc.).
 */
const layoutBridgedRing = (
  g: MoleculeGraph,
  ring: Ring,
  bondLen: number,
  pos: Map<string, Vec>,
  placed: Set<string>,
  ringAtomSet: Set<string>,
): boolean => {
  const ids = ring.atomIds;
  const idSet = new Set(ids);

  // BFS from ring atoms to nearest placed atom (may cross a short linker).
  type Step = { id: string; prev: string | null };
  let bridgeLocal: string | null = null;
  let pathToPlaced: string[] | null = null; // [localRing, ..., placedRemote] exclusive of remote
  const visited = new Set<string>(ids);
  const queue: Step[] = ids.map(id => ({ id, prev: null }));
  const cameFrom = new Map<string, string | null>();
  for (const id of ids) cameFrom.set(id, null);

  while (queue.length && !pathToPlaced) {
    const { id } = queue.shift()!;
    for (const nb of g.nodes.get(id)?.neighbors ?? []) {
      if (visited.has(nb)) continue;
      if (placed.has(nb)) {
        // Reconstruct path from ring atom to this placed neighbor.
        const path: string[] = [nb];
        let cur: string | null = id;
        while (cur != null) {
          path.unshift(cur);
          cur = cameFrom.get(cur) ?? null;
        }
        // path[0] is in ring; path[last] is placed remote.
        if (idSet.has(path[0])) {
          bridgeLocal = path[0];
          pathToPlaced = path;
          break;
        }
      }
      if (ringAtomSet.has(nb) && !idSet.has(nb)) {
        // Don't walk into other unplaced rings via ring atoms.
        continue;
      }
      visited.add(nb);
      cameFrom.set(nb, id);
      queue.push({ id: nb, prev: id });
    }
  }

  if (!bridgeLocal || !pathToPlaced || pathToPlaced.length < 2) return false;
  // Cap linker length — paclitaxel side-chain phenyls sit ~6–8 bonds out.
  if (pathToPlaced.length > 10) return false;

  const remote = pathToPlaced[pathToPlaced.length - 1];

  // Place intervening linker atoms (if any) along an exo direction from remote.
  const occupied = occupiedBondDirs(g, pos, remote);
  let dir: number;
  if (ringAtomSet.has(remote)) {
    dir = pickFreeDirection(ringExoDirection(g, pos, remote, ringAtomSet), occupied);
  } else {
    dir = pickFreeDirection(-Math.PI / 2, occupied);
  }

  // path: [ringLocal, linker..., remote]
  // Place from remote backward toward ringLocal.
  for (let i = pathToPlaced.length - 2; i >= 1; i--) {
    const atomId = pathToPlaced[i];
    if (placed.has(atomId)) {
      const prev = pathToPlaced[i + 1];
      dir = dirBetween(pos.get(prev)!, pos.get(atomId)!);
      continue;
    }
    const parent = pathToPlaced[i + 1];
    const parentPos = pos.get(parent)!;
    const pOcc = occupiedBondDirs(g, pos, parent);
    const outDir =
      i === pathToPlaced.length - 2
        ? dir
        : pickFreeDirection(dir, pOcc);
    pos.set(atomId, vecAt(parentPos, outDir, bondLen));
    placed.add(atomId);
    dir = outDir;
  }

  // Place ringLocal at bondLen from its linker neighbor (or remote if direct).
  const attachParent = pathToPlaced[1];
  const attachPos = pos.get(attachParent)!;
  const attachOcc = occupiedBondDirs(g, pos, attachParent);
  let bridgeDir: number;
  if (pathToPlaced.length === 2) {
    // Direct ring–ring bridge.
    bridgeDir = ringAtomSet.has(attachParent)
      ? pickFreeDirection(ringExoDirection(g, pos, attachParent, ringAtomSet), attachOcc)
      : pickFreeDirection(-Math.PI / 2, attachOcc);
  } else {
    // Continue roughly along the linker direction.
    const grand = pathToPlaced[2];
    const incoming = dirBetween(pos.get(grand)!, attachPos);
    bridgeDir = pickFreeDirection(incoming, attachOcc);
  }

  const localPos = vecAt(attachPos, bridgeDir, bondLen);
  pos.set(bridgeLocal, localPos);
  placed.add(bridgeLocal);

  const n = ids.length;
  const radius = bondLen / (2 * Math.sin(Math.PI / n));
  const idx0 = ids.indexOf(bridgeLocal);
  const center = {
    x: localPos.x + radius * Math.cos(bridgeDir),
    y: localPos.y + radius * Math.sin(bridgeDir),
  };
  const startAngle = Math.atan2(localPos.y - center.y, localPos.x - center.x);
  placeRegularPolygon(
    ids,
    center,
    bondLen,
    startAngle - (2 * Math.PI * idx0) / n,
    pos,
    placed,
  );
  return ids.every(id => placed.has(id));
};

/**
 * Complete a regular n-gon: place `count` unplaced atoms on the circle of
 * radius R = bondLen/(2·sin(π/n)) between fixed endpoints `from` and `to`.
 * Picks the center farther from `preferAwayFrom` so the ring bulges outward.
 */
const placeAtomsOnArc = (
  from: Vec,
  to: Vec,
  count: number,
  bondLen: number,
  ringSize: number,
  preferAwayFrom: Vec | null,
): Vec[] => {
  if (count <= 0 || ringSize < 3) return [];
  const R = bondLen / (2 * Math.sin(Math.PI / ringSize));
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const chord = Math.hypot(dx, dy);
  if (chord < 1e-6) return [];
  const nx = -dy / chord;
  const ny = dx / chord;
  const half = chord / 2;
  const d2 = R * R - half * half;
  // Endpoints farther than a regular n-gon allows — fit whatever radius works.
  const useR =
    d2 < -bondLen * 0.05
      ? Math.max(half * 1.01, half / Math.sin(Math.PI / Math.max(2, count + 1)))
      : R;
  const useD2 = Math.max(0, useR * useR - half * half);
  const dCenter = Math.sqrt(useD2);
  let sign = 1;
  if (preferAwayFrom) {
    const c1 = { x: mx + nx * dCenter, y: my + ny * dCenter };
    const c2 = { x: mx - nx * dCenter, y: my - ny * dCenter };
    sign = dist(c1, preferAwayFrom) >= dist(c2, preferAwayFrom) ? 1 : -1;
  }
  const center = { x: mx + nx * sign * dCenter, y: my + ny * sign * dCenter };
  const ang0 = Math.atan2(from.y - center.y, from.x - center.x);
  const raw = Math.atan2(to.y - center.y, to.x - center.x) - ang0;
  // Two arcs between endpoints; pick the one whose central angle matches the
  // missing n-gon sectors (taxane 6-on-8 needs ~240°, not the short ~120°).
  const target = ((count + 1) * 2 * Math.PI) / ringSize;
  const candA = normalizeAngle(raw);
  const candB = candA > 0 ? candA - 2 * Math.PI : candA + 2 * Math.PI;
  const sweep =
    Math.abs(Math.abs(candA) - target) <= Math.abs(Math.abs(candB) - target) ? candA : candB;
  const out: Vec[] = [];
  const nSeg = count + 1;
  for (let i = 1; i <= count; i++) {
    const ang = ang0 + (sweep * i) / nSeg;
    out.push({ x: center.x + useR * Math.cos(ang), y: center.y + useR * Math.sin(ang) });
  }
  return out;
};

/** Fill unplaced runs in a partially-placed ring so every ring bond ≈ bondLen. */
const closeRingGaps = (
  ids: string[],
  bondLen: number,
  pos: Map<string, Vec>,
  placed: Set<string>,
): void => {
  const n = ids.length;
  if (n < 3) return;
  const placedCentroid = centroidOf(
    ids.filter(id => placed.has(id)),
    pos,
  );

  for (let start = 0; start < n; start++) {
    if (!placed.has(ids[start])) continue;
    const next = ids[(start + 1) % n];
    if (placed.has(next)) continue;
    const gapIds: string[] = [];
    let j = (start + 1) % n;
    while (!placed.has(ids[j]) && gapIds.length < n) {
      gapIds.push(ids[j]);
      j = (j + 1) % n;
    }
    if (gapIds.length === 0 || !placed.has(ids[j])) continue;
    const from = pos.get(ids[start]);
    const to = pos.get(ids[j]);
    if (!from || !to) continue;
    const pts = placeAtomsOnArc(from, to, gapIds.length, bondLen, n, placedCentroid);
    gapIds.forEach((id, k) => {
      const p = pts[k];
      if (!p) return;
      pos.set(id, p);
      placed.add(id);
    });
  }
};

/** First-ring start angle from the user's drawing, not a fixed upright pose. */
const originalRingStartAngle = (
  ids: string[],
  orig: Map<string, Vec> | undefined,
  fallbackCenter: Vec,
): number => {
  if (!orig) return -Math.PI / 2;
  let cx = 0;
  let cy = 0;
  let n = 0;
  for (const id of ids) {
    const p = orig.get(id);
    if (!p) continue;
    cx += p.x;
    cy += p.y;
    n += 1;
  }
  const center = n >= 3 ? { x: cx / n, y: cy / n } : fallbackCenter;
  const p0 = orig.get(ids[0]!);
  if (!p0) return -Math.PI / 2;
  return Math.atan2(p0.y - center.y, p0.x - center.x);
};

const layoutRing = (
  ring: Ring,
  bondLen: number,
  pos: Map<string, Vec>,
  placed: Set<string>,
  preserveOrientation: boolean,
  cursor: Vec,
  anchorCenter: Vec,
  g?: MoleculeGraph,
  ringAtomSet?: Set<string>,
  orig?: Map<string, Vec>,
): void => {
  const ids = ring.atomIds;
  const n = ids.length;
  if (n < 3) return;
  const alreadyPlaced = ids.filter(id => placed.has(id));
  if (alreadyPlaced.length === 0) {
    if (g && ringAtomSet && layoutBridgedRing(g, ring, bondLen, pos, placed, ringAtomSet)) {
      return;
    }
    const center = preserveOrientation ? anchorCenter : cursor;
    const startAngle = preserveOrientation
      ? originalRingStartAngle(ids, orig, center)
      : -Math.PI / 2;
    placeRegularPolygon(ids, center, bondLen, startAngle, pos, placed);
    return;
  }
  if (alreadyPlaced.length === n) return;

  const ringBondsOk = (): boolean => {
    if (!ids.every(id => placed.has(id) && pos.has(id))) return false;
    for (let i = 0; i < n; i++) {
      const p0 = pos.get(ids[i])!;
      const p1 = pos.get(ids[(i + 1) % n])!;
      if (Math.abs(dist(p0, p1) - bondLen) > bondLen * 0.25) return false;
    }
    return true;
  };

  // Single shared edge: classic fused regular polygon.
  if (alreadyPlaced.length === 2) {
    for (let i = 0; i < n; i++) {
      const a = ids[i];
      const b = ids[(i + 1) % n];
      if (placed.has(a) && placed.has(b)) {
        if (extendRingFromEdge(ids, i, bondLen, pos, placed) && ringBondsOk()) return;
      }
    }
  }

  // Multi-atom fusion (taxane 6+8): place the open arc as a regular n-gon sector.
  if (alreadyPlaced.length >= 2) {
    for (const id of ids) {
      if (!alreadyPlaced.includes(id)) {
        placed.delete(id);
        pos.delete(id);
      }
    }
    closeRingGaps(ids, bondLen, pos, placed);
    if (ringBondsOk()) return;
  }

  const anchor = alreadyPlaced[0];
  const anchorPos = pos.get(anchor)!;
  const idx = ids.indexOf(anchor);
  const prevId = ids[(idx - 1 + n) % n];
  const nextId = ids[(idx + 1) % n];
  let incomingDir: number;
  if (placed.has(prevId)) {
    incomingDir = dirBetween(pos.get(prevId)!, anchorPos);
  } else if (placed.has(nextId)) {
    incomingDir = dirBetween(anchorPos, pos.get(nextId)!);
  } else {
    incomingDir = -Math.PI / 2;
  }
  const radius = bondLen / (2 * Math.sin(Math.PI / n));
  const center = {
    x: anchorPos.x - radius * Math.cos(incomingDir),
    y: anchorPos.y - radius * Math.sin(incomingDir),
  };
  const startAngle = Math.atan2(anchorPos.y - center.y, anchorPos.x - center.x);
  const idx0 = ids.indexOf(anchor);
  placeRegularPolygon(ids, center, bondLen, startAngle - (2 * Math.PI * idx0) / n, pos, placed);
};

const ringIsWellFormed = (ring: Ring, pos: Map<string, Vec>, bondLen: number): boolean => {
  const ids = ring.atomIds;
  const n = ids.length;
  if (n < 3) return true;
  const lens: number[] = [];
  let maxAngleErr = 0;
  const ideal = idealRingInterior(n);
  for (let i = 0; i < n; i++) {
    const p0 = pos.get(ids[i]);
    const p1 = pos.get(ids[(i + 1) % n]);
    const p2 = pos.get(ids[(i + 2) % n]);
    if (!p0 || !p1 || !p2) return false;
    lens.push(dist(p0, p1));
    const a1 = dirBetween(p1, p0);
    const a2 = dirBetween(p1, p2);
    let ang = Math.abs(normalizeAngle(a2 - a1));
    if (ang > Math.PI) ang = 2 * Math.PI - ang;
    maxAngleErr = Math.max(maxAngleErr, Math.abs(ang - ideal));
  }
  const avg = lens.reduce((s, l) => s + l, 0) / n;
  // Must also match the canvas bond length — otherwise frozen rings stay at a
  // different scale than freshly laid chains (the "stretched bond" look).
  return (
    Math.abs(avg - bondLen) < bondLen * 0.12 &&
    Math.max(...lens.map(l => Math.abs(l - avg))) < bondLen * 0.14 &&
    maxAngleErr < 0.2
  );
};

/**
 * In correct/import mode: BFS outward from placed ring atoms and freeze any
 * exo atom whose bond to its parent is ~bondLen and that doesn't overlap
 * other atoms. Prevents re-layout from twisting a good ortho substituent
 * (aspirin acetoxy) into a neighboring group (COOH).
 */
const freezeReasonableExo = (
  g: MoleculeGraph,
  comp: string[],
  ringAtomSet: Set<string>,
  bondLen: number,
  pos: Map<string, Vec>,
  placed: Set<string>,
): void => {
  const compSet = new Set(comp);
  const queue = [...placed];
  const minSep = bondLen * 0.45;
  while (queue.length) {
    const parentId = queue.shift()!;
    const parentPos = pos.get(parentId);
    if (!parentPos) continue;
    for (const nb of g.nodes.get(parentId)?.neighbors ?? []) {
      if (!compSet.has(nb) || placed.has(nb) || ringAtomSet.has(nb)) continue;
      const p = pos.get(nb);
      if (!p) continue;
      const len = dist(parentPos, p);
      if (Math.abs(len - bondLen) > bondLen * 0.2) continue;
      let clash = false;
      for (const [id, q] of pos) {
        if (id === nb || id === parentId) continue;
        if (!placed.has(id) && !ringAtomSet.has(id)) continue;
        if (dist(p, q) < minSep) {
          clash = true;
          break;
        }
      }
      if (clash) continue;
      placed.add(nb);
      queue.push(nb);
    }
  }
};

const ringExoDirection = (
  g: MoleculeGraph,
  pos: Map<string, Vec>,
  atomId: string,
  ringAtomSet: Set<string>,
): number => {
  const base = pos.get(atomId);
  if (!base) return -Math.PI / 2;
  const node = g.nodes.get(atomId);
  if (!node) return -Math.PI / 2;
  let sx = 0;
  let sy = 0;
  for (const nb of node.neighbors) {
    if (!ringAtomSet.has(nb)) continue;
    const p = pos.get(nb);
    if (!p) continue;
    sx += p.x - base.x;
    sy += p.y - base.y;
  }
  if (Math.hypot(sx, sy) < 1e-6) return -Math.PI / 2;
  return Math.atan2(-sy, -sx);
};

const isCarbon = (g: MoleculeGraph, id: string): boolean =>
  g.atomById.get(id)?.element === 'C';

/** Grow C skeleton + hetero substituents with 120° rules. */
const layoutTree = (
  g: MoleculeGraph,
  rootId: string,
  parentId: string | null,
  rootPos: Vec,
  incomingDir: number,
  bondLen: number,
  pos: Map<string, Vec>,
  placed: Set<string>,
  classification: SkeletonClassification,
  chainFlip = 1,
  heteroQueue: { parentId: string; childId: string }[] = [],
): void => {
  pos.set(rootId, rootPos);
  placed.add(rootId);

  const node = g.nodes.get(rootId);
  if (!node) return;

  const allChildren = node.neighbors.filter(nb => {
    if (nb === parentId || placed.has(nb)) return false;
    // Never grow layout through explicit H — alkyl/aromatic H are implicit in 2D.
    return isHeavyAtom(g.atomById.get(nb)?.element ?? '');
  });
  const carbonChildren = allChildren.filter(nb => isCarbon(g, nb));
  for (const childId of allChildren) {
    if (!isCarbon(g, childId)) {
      heteroQueue.push({ parentId: rootId, childId });
    }
  }
  if (carbonChildren.length === 0) return;

  const occupied = occupiedBondDirs(g, pos, rootId);
  if (parentId !== null) {
    occupied.push(dirBetween(pos.get(parentId)!, pos.get(rootId)!));
  }

  // Memoize — sortChildrenForLayout calls this per comparison; uncached DFS
  // was O(V² log d) per layoutTree node and hung paclitaxel-scale SMILES paste.
  const depthCache = new Map<string, number>();
  const subtreeDepth = (start: string, from: string): number => {
    const key = `${start}|${from}`;
    const hit = depthCache.get(key);
    if (hit !== undefined) return hit;
    let best = 0;
    const stack: { id: string; d: number; prev: string }[] = [{ id: start, d: 0, prev: from }];
    const seen = new Set<string>([from, start]);
    while (stack.length) {
      const { id, d, prev } = stack.pop()!;
      best = Math.max(best, d);
      for (const nb of g.nodes.get(id)?.neighbors ?? []) {
        if (nb === prev || seen.has(nb)) continue;
        seen.add(nb);
        stack.push({ id: nb, d: d + 1, prev: id });
      }
    }
    depthCache.set(key, best);
    return best;
  };

  const sorted = sortChildrenForLayout(g, rootId, carbonChildren, subtreeDepth, classification);
  const prevBondDir =
    parentId !== null ? dirBetween(pos.get(parentId)!, pos.get(rootId)!) : incomingDir;

  const { dirs, nextFlip } = computeChildDirections(
    g,
    rootId,
    parentId,
    sorted,
    occupied,
    prevBondDir,
    chainFlip,
    pos,
    classification,
  );

  sorted.forEach((childId, idx) => {
    let outDir = dirs[idx] ?? prevBondDir + Math.PI;
    const useZigzag = shouldUseChainZigzag(g, rootId, childId, parentId, sorted.length);
    const keepFan = shouldKeepExactFan(sorted.length);
    // Exact 120°/90° fans and zigzag must not be nudged by collision avoidance.
    if (!useZigzag && !keepFan) {
      outDir = pickFreeDirectionSafe(
        outDir,
        occupied,
        pos.get(rootId)!,
        bondLen,
        pos,
        new Set([rootId, childId]),
      );
    }
    const childPos = vecAt(pos.get(rootId)!, outDir, bondLen);
    occupied.push(outDir);
    const childFlip = idx === 0 && useZigzag ? nextFlip : chainFlip;
    layoutTree(
      g,
      childId,
      rootId,
      childPos,
      outDir,
      bondLen,
      pos,
      placed,
      classification,
      childFlip,
      heteroQueue,
    );
  });
};

/** Place O/N/S/halogen atoms after the C skeleton is fixed. */
const decorateHeteroatoms = (
  g: MoleculeGraph,
  comp: string[],
  bondLen: number,
  pos: Map<string, Vec>,
  placed: Set<string>,
  pending: { parentId: string; childId: string }[],
  ringAtomSet: Set<string>,
): void => {
  const queue = [...pending];
  const compSet = new Set(comp);

  for (const id of comp) {
    if (placed.has(id) || isCarbon(g, id)) continue;
    const parent = g.nodes.get(id)?.neighbors.find(nb => placed.has(nb));
    if (parent) queue.push({ parentId: parent, childId: id });
  }

  // Group pending heteros by parent so carbonyl =O and –OH are placed together.
  const byParent = new Map<string, string[]>();
  const seenChild = new Set<string>();
  for (const { parentId, childId } of queue) {
    if (seenChild.has(childId) || placed.has(childId) || !compSet.has(childId)) continue;
    seenChild.add(childId);
    const list = byParent.get(parentId) ?? [];
    list.push(childId);
    byParent.set(parentId, list);
  }

  for (const [parentId, children] of byParent) {
    if (!pos.has(parentId) || !placed.has(parentId)) continue;

    const oxyChildren = children.filter(id => g.atomById.get(id)?.element === 'O');
    const hasCarbonylDouble = oxyChildren.some(id => {
      const b = bondBetween(g, parentId, id);
      return b != null && b.order >= 2;
    });

    if (hasCarbonylDouble && g.atomById.get(parentId)?.element === 'C') {
      placeCarbonylOxygens(g, parentId, oxyChildren, bondLen, pos, placed);
      for (const childId of children) {
        if (placed.has(childId)) continue;
        placeSingleHetero(g, parentId, childId, bondLen, pos, placed, ringAtomSet);
      }
      continue;
    }

    for (const childId of children) {
      if (placed.has(childId)) continue;
      placeSingleHetero(g, parentId, childId, bondLen, pos, placed, ringAtomSet);
    }
  }

  // Second pass: heteros attached to newly placed heteros.
  for (const id of comp) {
    if (placed.has(id) || isCarbon(g, id)) continue;
    const parent = g.nodes.get(id)?.neighbors.find(nb => placed.has(nb));
    if (!parent) continue;
    placeSingleHetero(g, parent, id, bondLen, pos, placed, ringAtomSet);
  }
};

/** ChemDraw COOH / carbonyl: =O and –OH/OR in the two free 120° slots.
 * Prefers the slot that stays clear of already-placed atoms (ortho proximity). */
const placeCarbonylOxygens = (
  g: MoleculeGraph,
  carbonId: string,
  oxygenIds: string[],
  bondLen: number,
  pos: Map<string, Vec>,
  placed: Set<string>,
): void => {
  const parentPos = pos.get(carbonId);
  if (!parentPos) return;
  const occupied = occupiedBondDirs(g, pos, carbonId);

  // Prefer C–C (or other non-O) neighbor as the reference bond.
  let ref = occupied.length > 0 ? occupied[0] : -Math.PI / 2;
  const node = g.nodes.get(carbonId);
  const carbonNb = node?.neighbors.find(
    nb => placed.has(nb) && g.atomById.get(nb)?.element !== 'O',
  );
  if (carbonNb && pos.has(carbonNb)) {
    ref = dirBetween(parentPos, pos.get(carbonNb)!);
  }

  const slotA = ref + TRIGONAL;
  const slotB = ref - TRIGONAL;
  const doubleOs = oxygenIds.filter(id => (bondBetween(g, carbonId, id)?.order ?? 0) >= 2);
  const singleOs = oxygenIds.filter(id => (bondBetween(g, carbonId, id)?.order ?? 0) < 2);
  const ordered = [...doubleOs, ...singleOs];

  const used = [...occupied];
  const minDist = bondLen * 0.55;
  for (const oxId of ordered) {
    if (placed.has(oxId)) continue;
    const ignore = new Set([carbonId, oxId, ...oxygenIds]);
    const candidates = [slotA, slotB, slotA + ZIGZAG, slotB - ZIGZAG, ref + Math.PI];
    let best = slotA;
    let bestScore = -Infinity;
    for (const d of candidates) {
      if (conflictsWith(d, used)) continue;
      const p = vecAt(parentPos, d, bondLen);
      if (collidesWithPlaced(p, pos, ignore, minDist)) continue;
      // Prefer farther from other placed atoms (esp. other oxygens / ring).
      let nearest = Infinity;
      for (const [id, q] of pos) {
        if (ignore.has(id)) continue;
        nearest = Math.min(nearest, dist(p, q));
      }
      if (nearest > bestScore) {
        bestScore = nearest;
        best = d;
      }
    }
    // Fallback: collision-aware free direction around preferred slot.
    if (bestScore < minDist) {
      best = pickFreeDirectionSafe(slotA, used, parentPos, bondLen, pos, ignore);
    }
    pos.set(oxId, vecAt(parentPos, best, bondLen));
    placed.add(oxId);
    used.push(best);
  }
};

const placeSingleHetero = (
  g: MoleculeGraph,
  parentId: string,
  childId: string,
  bondLen: number,
  pos: Map<string, Vec>,
  placed: Set<string>,
  ringAtomSet: Set<string>,
): void => {
  if (placed.has(childId)) return;
  const parentPos = pos.get(parentId);
  if (!parentPos) return;
  // Heavy-atom dirs only — H never occupies a ChemDraw slot.
  const occupied = occupiedBondDirs(g, pos, parentId);
  let preferred: number;
  if (ringAtomSet.has(parentId)) {
    preferred = ringExoDirection(g, pos, parentId, ringAtomSet);
  } else if (occupied.length > 0) {
    // Free trigonal (120°) slot relative to existing heavy bonds.
    preferred = pickFreeTrigonalSlot(occupied);
  } else {
    preferred = -Math.PI / 2;
  }
  // Prefer the exact trigonal slot; only nudge if it collides with a placed atom.
  let outDir = preferred;
  const trial = vecAt(parentPos, outDir, bondLen);
  const ignore = new Set([parentId, childId]);
  if (collidesWithPlaced(trial, pos, ignore, bondLen * 0.45)) {
    outDir = pickFreeDirectionSafe(preferred, occupied, parentPos, bondLen, pos, ignore);
  }
  pos.set(childId, vecAt(parentPos, outDir, bondLen));
  placed.add(childId);
};

/**
 * Pick a free 120° ChemDraw slot given already-occupied heavy-bond directions.
 * Ignores H by construction (caller uses occupiedBondDirs).
 */
const pickFreeTrigonalSlot = (occupied: number[]): number => {
  if (occupied.length === 0) return -Math.PI / 2;
  const ref = occupied[0]!;
  const candidates = [
    ref + TRIGONAL,
    ref - TRIGONAL,
    ref + 2 * TRIGONAL,
    ref - 2 * TRIGONAL,
    ref + Math.PI,
  ];
  for (const c of candidates) {
    if (!conflictsWith(c, occupied)) return c;
  }
  return ref + TRIGONAL;
};

/**
 * Snap every terminal exo hetero (OH, NH2, halogen, …) to a free 120° slot
 * on its parent carbon. Runs after C-skeleton optimize so alcohols stay trigonal.
 */
const redecorateExoHeteros = (
  g: MoleculeGraph,
  comp: string[],
  bondLen: number,
  pos: Map<string, Vec>,
  placed: Set<string>,
  ringAtomSet: Set<string>,
): void => {
  const heteroEls = new Set(['O', 'N', 'S', 'F', 'Cl', 'Br', 'I', 'P']);
  for (const id of comp) {
    const el = g.atomById.get(id)?.element ?? '';
    if (!heteroEls.has(el) || !pos.has(id)) continue;
    // Terminal only (one heavy neighbor) — skip ethers / esters bridges.
    const heavyNbs = (g.nodes.get(id)?.neighbors ?? []).filter(nb =>
      isHeavyAtom(g.atomById.get(nb)?.element ?? ''),
    );
    if (heavyNbs.length !== 1) continue;
    const parentId = heavyNbs[0]!;
    if (g.atomById.get(parentId)?.element !== 'C') continue;
    if (!pos.has(parentId)) continue;
    // Skip carbonyl =O (order ≥ 2) — handled by redecorateCarbonylOxygens.
    const bnd = bondBetween(g, parentId, id);
    if (bnd && bnd.order >= 2) continue;

    const parentPos = pos.get(parentId)!;
    // Occupied = other heavy bonds from parent, excluding this hetero.
    const occupied: number[] = [];
    for (const nb of g.nodes.get(parentId)?.neighbors ?? []) {
      if (nb === id) continue;
      if (!isHeavyAtom(g.atomById.get(nb)?.element ?? '')) continue;
      const p = pos.get(nb);
      if (p) occupied.push(dirBetween(parentPos, p));
    }
    let preferred: number;
    if (ringAtomSet.has(parentId)) {
      preferred = ringExoDirection(g, pos, parentId, ringAtomSet);
      // If another exo already sits near that bisector, use free trigonal instead.
      if (conflictsWith(preferred, occupied)) {
        preferred = pickFreeTrigonalSlot(occupied);
      }
    } else {
      preferred = pickFreeTrigonalSlot(occupied);
    }
    pos.set(id, vecAt(parentPos, preferred, bondLen));
    placed.add(id);
  }
};

/** After C-skeleton optimization, snap every carbonyl's O atoms back to 120° slots.
 * Skips oxygens that are already well placed (import/correct freeze) so a good
 * aspirin layout is not twisted into an ortho clash. */
const redecorateCarbonylOxygens = (
  g: MoleculeGraph,
  comp: string[],
  bondLen: number,
  pos: Map<string, Vec>,
  placed: Set<string>,
): void => {
  for (const id of comp) {
    if (g.atomById.get(id)?.element !== 'C' || !pos.has(id)) continue;
    const oxyIds = (g.nodes.get(id)?.neighbors ?? []).filter(nb => {
      if (g.atomById.get(nb)?.element !== 'O') return false;
      return bondBetween(g, id, nb) != null;
    });
    const hasDouble = oxyIds.some(nb => (bondBetween(g, id, nb)?.order ?? 0) >= 2);
    if (!hasDouble) continue;

    const parentPos = pos.get(id)!;
    const terminals = oxyIds.filter(ox => (g.nodes.get(ox)?.neighbors.length ?? 0) < 2);

    // If all terminal oxygens already sit at ~bondLen with ~120° angles and
    // no clash, leave them alone.
    const allGood = terminals.every(ox => {
      if (!placed.has(ox) || !pos.has(ox)) return false;
      const p = pos.get(ox)!;
      if (Math.abs(dist(parentPos, p) - bondLen) > bondLen * 0.15) return false;
      // Angle check vs each other placed neighbor of the carbonyl C.
      const nbs = (g.nodes.get(id)?.neighbors ?? []).filter(nb => placed.has(nb) && nb !== ox);
      for (const nb of nbs) {
        const ang = bondAngleDegAt(pos, id, ox, nb);
        if (Math.abs(ang - 120) > 18) return false;
      }
      // Proximity: not stacked on another non-parent atom.
      for (const [oid, q] of pos) {
        if (oid === ox || oid === id || !placed.has(oid)) continue;
        if (dist(p, q) < bondLen * 0.45) return false;
      }
      return true;
    });
    if (allGood && terminals.length > 0) continue;

    for (const ox of terminals) {
      placed.delete(ox);
      pos.delete(ox);
    }
    if (terminals.length > 0) {
      placeCarbonylOxygens(g, id, terminals, bondLen, pos, placed);
    }
  }
};

const layoutAcyclicComponent = (
  g: MoleculeGraph,
  comp: string[],
  bondLen: number,
  origin: Vec,
  pos: Map<string, Vec>,
  placed: Set<string>,
  classification: SkeletonClassification,
  heteroQueue: { parentId: string; childId: string }[],
): void => {
  const path = diameterPath(g, comp);
  if (path.length === 0) return;
  const pathSetCache = new Set(path);

  pos.set(path[0], { ...origin });
  placed.add(path[0]);

  if (path.length === 1) {
    layoutTree(g, path[0], null, origin, 0, bondLen, pos, placed, classification, 1, heteroQueue);
    return;
  }

  pos.set(path[1], vecAt(origin, 0, bondLen));
  placed.add(path[1]);
  let prevBondDir = 0;
  let flip = 1;
  for (let i = 2; i < path.length; i++) {
    // Same 60° bond-direction turn as alkanes → 120° interior at C and at
    // bridging O/N (ester C–O–C, ether, amine).
    const outDir = prevBondDir + flip * ZIGZAG;
    flip *= -1;
    prevBondDir = outDir;
    pos.set(path[i], vecAt(pos.get(path[i - 1])!, outDir, bondLen));
    placed.add(path[i]);
  }

  for (let i = 0; i < path.length; i++) {
    const id = path[i];
    const parent = i > 0 ? path[i - 1] : null;
    const node = g.nodes.get(id);
    if (!node) continue;
    const pathSet = pathSetCache;
    const sideChildren = node.neighbors.filter(
      nb => !placed.has(nb) && (parent === null || nb !== parent) && !pathSet.has(nb),
    );
    if (sideChildren.length === 0) continue;
    const occupied = occupiedBondDirs(g, pos, id);
    for (const childId of sideChildren) {
      if (!isCarbon(g, childId)) {
        heteroQueue.push({ parentId: id, childId });
        continue;
      }
      const { dirs } = computeChildDirections(
        g,
        id,
        parent,
        [childId],
        occupied,
        parent !== null ? dirBetween(pos.get(parent)!, pos.get(id)!) : 0,
        1,
        pos,
        classification,
      );
      let outDir = dirs[0] ?? -Math.PI / 2;
      const useZigzag = shouldUseChainZigzag(g, id, childId, parent, 1);
      const keepFan = shouldKeepExactFan(1);
      if (!useZigzag && !keepFan) {
        outDir = pickFreeDirectionSafe(
          outDir,
          occupied,
          pos.get(id)!,
          bondLen,
          pos,
          new Set([id, childId]),
        );
      }
      const childPos = vecAt(pos.get(id)!, outDir, bondLen);
      occupied.push(outDir);
      layoutTree(
        g,
        childId,
        id,
        childPos,
        outDir,
        bondLen,
        pos,
        placed,
        classification,
        useZigzag ? -1 : 1,
        heteroQueue,
      );
    }
  }

  // Stragglers: attach to nearest already-placed neighbor (never re-root at
  // origin — that re-walked overlapping subtrees and blew up on polycyclics).
  for (const id of comp) {
    if (placed.has(id) || !isCarbon(g, id)) continue;
    const nbs = (g.nodes.get(id)?.neighbors ?? []).filter(nb => placed.has(nb) && pos.has(nb));
    if (nbs.length === 0) {
      layoutTree(g, id, null, origin, 0, bondLen, pos, placed, classification, 1, heteroQueue);
      continue;
    }
    let parentId = nbs[0]!;
    let bestD = Infinity;
    for (const nb of nbs) {
      const p = pos.get(nb)!;
      const d = Math.hypot(p.x - origin.x, p.y - origin.y);
      if (d < bestD) {
        bestD = d;
        parentId = nb;
      }
    }
    const parentPos = pos.get(parentId)!;
    const occupied = occupiedBondDirs(g, pos, parentId);
    const outDir = pickFreeDirectionSafe(0, occupied, parentPos, bondLen, pos, new Set([parentId, id]));
    const childPos = vecAt(parentPos, outDir, bondLen);
    layoutTree(g, id, parentId, childPos, outDir, bondLen, pos, placed, classification, 1, heteroQueue);
  }
};

const layoutRingSubstituents = (
  g: MoleculeGraph,
  ringAtomSet: Set<string>,
  bondLen: number,
  pos: Map<string, Vec>,
  placed: Set<string>,
  classification: SkeletonClassification,
  heteroQueue: { parentId: string; childId: string }[],
): void => {
  for (const atomId of ringAtomSet) {
    const node = g.nodes.get(atomId);
    if (!node) continue;
    const base = pos.get(atomId);
    if (!base) continue;
    const exo = node.neighbors.filter(nb => !ringAtomSet.has(nb) && !placed.has(nb));
    if (exo.length === 0) continue;
    const outward = ringExoDirection(g, pos, atomId, ringAtomSet);
    const occupied = occupiedBondDirs(g, pos, atomId);
    const carbonExo = exo.filter(id => isCarbon(g, id));
    const heteroExo = exo.filter(id => !isCarbon(g, id));
    for (const childId of heteroExo) {
      heteroQueue.push({ parentId: atomId, childId });
    }
    carbonExo.forEach((childId, idx) => {
      const spread = carbonExo.length > 1 ? idx - (carbonExo.length - 1) / 2 : 0;
      const preferred = outward + spread * TRIGONAL;
      // Always proximity-aware — ortho substituents must not fold into each other.
      const outDir = pickFreeDirectionSafe(
        preferred,
        occupied,
        base,
        bondLen,
        pos,
        new Set([atomId, childId]),
      );
      const childPos = vecAt(base, outDir, bondLen);
      occupied.push(outDir);
      layoutTree(
        g,
        childId,
        atomId,
        childPos,
        outDir,
        bondLen,
        pos,
        placed,
        classification,
        1,
        heteroQueue,
      );
    });
  }
};

export interface SkeletonLayoutContext {
  g: MoleculeGraph;
  comp: string[];
  rings: Ring[];
  bondLen: number;
  origin: Vec;
  orig: Map<string, Vec>;
  mode: SkeletonLayoutMode;
  /**
   * Multi-start override: force first ring size (e.g. 6 instead of scaffold 8).
   * When set, skips the default scaffold preferredCoreRingSize.
   */
  preferRingSize?: number;
  /** Multi-start: place smallest rings first instead of largest. */
  ringOrder?: 'largest' | 'smallest';
  /**
   * Atom ids belonging to tagged chair/boat rings — keep their relative
   * geometry (scaled to bondLen) instead of rebuilding as regular polygons.
   */
  lockedAtomIds?: Set<string>;
  /**
   * Full rebuild: seed the first ring from the existing heading instead of
   * a canonical upright regular polygon.
   */
  preserveOrientation?: boolean;
}

/**
 * Seed chair/boat rings from existing coords (rigid scale to bondLen).
 * Prevents Cleanup from flattening cyclohexane chairs into flat hexagons.
 */
const freezeLockedConformationRings = (
  rings: Ring[],
  locked: Set<string>,
  orig: Map<string, Vec>,
  bondLen: number,
  pos: Map<string, Vec>,
  placed: Set<string>,
  compSet: Set<string>,
): void => {
  if (locked.size === 0) return;
  for (const ring of rings) {
    if (!ring.atomIds.every(id => locked.has(id) && compSet.has(id))) continue;
    const pts = ring.atomIds.map(id => orig.get(id));
    if (pts.some(p => !p)) continue;
    const n = ring.atomIds.length;
    let cx = 0;
    let cy = 0;
    for (const p of pts) {
      cx += p!.x;
      cy += p!.y;
    }
    cx /= n;
    cy /= n;
    let avg = 0;
    for (let i = 0; i < n; i++) {
      avg += dist(pts[i]!, pts[(i + 1) % n]!);
    }
    avg /= n;
    const scale = avg > 1e-6 ? bondLen / avg : 1;
    for (let i = 0; i < n; i++) {
      const id = ring.atomIds[i]!;
      const p = pts[i]!;
      pos.set(id, {
        x: cx + (p.x - cx) * scale,
        y: cy + (p.y - cy) * scale,
      });
      placed.add(id);
    }
  }
};

/** Layout one connected component via carbon-skeleton graph traversal. */
export const layoutComponentSkeleton = (ctx: SkeletonLayoutContext): Map<string, Vec> => {
  const {
    g,
    comp,
    rings,
    bondLen,
    origin,
    orig,
    mode,
    preferRingSize,
    ringOrder,
    lockedAtomIds,
    preserveOrientation: preserveOrientationOpt,
  } = ctx;
  const pos = new Map<string, Vec>();
  const placed = new Set<string>();
  const compSet = new Set(comp);
  const locked = lockedAtomIds ?? new Set<string>();
  const ringAtomSet = new Set<string>();
  for (const r of rings) {
    for (const id of r.atomIds) {
      if (compSet.has(id)) ringAtomSet.add(id);
    }
  }

  if (mode === 'correct') {
    for (const id of comp) {
      const p = orig.get(id);
      if (p) pos.set(id, { ...p });
    }
  }

  freezeLockedConformationRings(rings, locked, orig, bondLen, pos, placed, compSet);
  // Snapshot after scale-to-bondLen so later uniformize/optimize cannot flatten chairs.
  const lockedSnapshot = new Map<string, Vec>();
  for (const id of locked) {
    if (!compSet.has(id)) continue;
    const p = pos.get(id);
    if (p) lockedSnapshot.set(id, { ...p });
  }

  const classification = classifySkeleton(g, ringAtomSet);
  const heteroQueue: { parentId: string; childId: string }[] = [];
  const ringsInComp = rings.filter(r => r.atomIds.every(id => compSet.has(id)));
  // Stage 3: known polycyclic scaffolds (taxane 4-6-6-8, steroid 5-6-6-6)
  // seed layout from the largest core ring so phenyls don't claim the origin.
  // Stage D multi-start may override preferRingSize / ringOrder.
  const scaffold = fusedRingFingerprint(g, ringsInComp, ringAtomSet);
  const preferSize =
    preferRingSize ??
    (scaffold ? preferredCoreRingSize(scaffold.fingerprint) : undefined);
  let compRings =
    preferSize != null
      ? orderRingsForScaffold(ringsInComp, preferSize)
      : orderRingsForLayout(ringsInComp);
  if (ringOrder === 'smallest') {
    compRings = [...ringsInComp].sort((a, b) => a.size - b.size);
  }
  const anchorCenter = mode === 'correct' ? centroidOf(comp, orig) : origin;
  const preserveOrientation = mode === 'correct' || preserveOrientationOpt === true;
  let cursor = { ...origin };

  if (compRings.length > 0) {
    for (const ring of compRings) {
      // Tagged chair/boat: already frozen — never rebuild as a regular n-gon.
      if (
        ring.atomIds.length > 0 &&
        ring.atomIds.every(id => locked.has(id) && placed.has(id))
      ) {
        // keep frozen geometry
      } else if (mode === 'correct' && ringIsWellFormed(ring, pos, bondLen)) {
        for (const id of ring.atomIds) placed.add(id);
      } else {
        layoutRing(
          ring,
          bondLen,
          pos,
          placed,
          preserveOrientation,
          cursor,
          anchorCenter,
          g,
          ringAtomSet,
          orig,
        );
      }
      if (mode === 'full' && !preserveOrientation) {
        const ringPts = ring.atomIds.map(id => pos.get(id)).filter(Boolean) as Vec[];
        if (ringPts.length) {
          cursor = {
            x: Math.max(...ringPts.map(p => p.x)) + bondLen * 4,
            y: ringPts.reduce((s, p) => s + p.y, 0) / ringPts.length,
          };
        }
      }
    }
    // Bridged / cage systems: MDS centroid seed + KK refine on ring atoms.
    if (isBridgedRingSystem(compRings)) {
      layoutBridgedComponent(g, compRings, ringAtomSet, pos, bondLen, anchorCenter);
      for (const id of ringAtomSet) placed.add(id);
    }
    // Import/correct path: keep exo atoms that already sit at a sane bond length
    // and clear of neighbors — don't re-layout a good acetoxy into the COOH.
    if (mode === 'correct') {
      freezeReasonableExo(g, comp, ringAtomSet, bondLen, pos, placed);
    }
    layoutRingSubstituents(g, ringAtomSet, bondLen, pos, placed, classification, heteroQueue);
  }

  const nonRing = comp.filter(id => !ringAtomSet.has(id));
  if (nonRing.length > 0) {
    const seen = new Set<string>();
    for (const seed of nonRing) {
      if (seen.has(seed) || placed.has(seed)) continue;
      const tree: string[] = [];
      const stack = [seed];
      seen.add(seed);
      while (stack.length) {
        const u = stack.pop()!;
        tree.push(u);
        for (const nb of g.nodes.get(u)?.neighbors ?? []) {
          if (!compSet.has(nb) || ringAtomSet.has(nb) || seen.has(nb)) continue;
          seen.add(nb);
          stack.push(nb);
        }
      }
      const junction = tree.find(id =>
        g.nodes.get(id)?.neighbors.some(nb => placed.has(nb)),
      );
      if (junction !== undefined) {
        const jNb = g.nodes.get(junction)!.neighbors.find(nb => placed.has(nb))!;
        if (!placed.has(junction)) {
          const anchorPos = pos.get(jNb)!;
          const occupied = occupiedBondDirs(g, pos, jNb);
          const outDir = pickFreeDirectionSafe(
            ringExoDirection(g, pos, jNb, ringAtomSet),
            occupied,
            anchorPos,
            bondLen,
            pos,
            new Set([jNb, junction]),
          );
          pos.set(junction, vecAt(anchorPos, outDir, bondLen));
          placed.add(junction);
        }
        layoutTree(
          g,
          junction,
          jNb,
          pos.get(junction)!,
          dirBetween(pos.get(jNb)!, pos.get(junction)!),
          bondLen,
          pos,
          placed,
          classification,
          1,
          heteroQueue,
        );
      } else {
        layoutAcyclicComponent(
          g,
          tree,
          bondLen,
          mode === 'correct' ? anchorCenter : cursor,
          pos,
          placed,
          classification,
          heteroQueue,
        );
      }
    }
  }

  if (compRings.length === 0) {
    layoutAcyclicComponent(
      g,
      comp,
      bondLen,
      anchorCenter,
      pos,
      placed,
      classification,
      heteroQueue,
    );
  }

  // 1) Optimize C skeleton (zigzag / fans) — alcohol carbons included; OH not placed yet.
  // 2) Place heteros into free 120° heavy-atom slots (H ignored).
  // 3) Snap carbonyls + terminal OH/N/halogen again after any C moves.
  optimizeSkeletonAngles(g, ringAtomSet, bondLen, pos, placed);
  decorateHeteroatoms(g, comp, bondLen, pos, placed, heteroQueue, ringAtomSet);
  redecorateCarbonylOxygens(g, comp, bondLen, pos, placed);
  redecorateExoHeteros(g, comp, bondLen, pos, placed, ringAtomSet);
  // Final pass: every bond = canvas bondLengthPx (keeps angles, kills stretch).
  uniformizeBondLengths(g, comp, ringAtomSet, bondLen, pos);
  // Separate stacked substituents / phenyls after join snaps.
  resolveAtomOverlaps(g, comp, ringAtomSet, bondLen, pos);
  // Overlap pushes can stretch bonds / nudge OH — restore lengths then re-snap heteros.
  uniformizeBondLengths(g, comp, ringAtomSet, bondLen, pos);
  redecorateExoHeteros(g, comp, bondLen, pos, placed, ringAtomSet);
  redecorateCarbonylOxygens(g, comp, bondLen, pos, placed);
  uniformizeBondLengths(g, comp, ringAtomSet, bondLen, pos);

  for (const id of comp) {
    if (!pos.has(id)) pos.set(id, { ...(orig.get(id) ?? anchorCenter) });
  }
  // Re-apply chair/boat geometry after angle/bond-length passes.
  for (const [id, p] of lockedSnapshot) {
    pos.set(id, { ...p });
  }
  return pos;
};
