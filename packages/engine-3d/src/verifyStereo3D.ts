/**
 * Verify 2D-perceived stereo against a 3D conformer, and hard-correct poses
 * that contradict wedge/@ or E/Z (never silently show the wrong enantiomer/isomer).
 */
import type { Molecule } from '@moldraw/domain';
import { buildGraph } from '@moldraw/engine';
import { perceiveStereo, type ChiralConstraint, type CisTransConstraint, type StereoConstraints } from './stereo';
import type { Atom3D, Conformer } from './embed';

export interface ChiralStereoStatus {
  kind: 'chiral';
  centerId: string;
  /** Index in the conformer atom list (-1 if missing). */
  centerIdx: number;
  satisfied: boolean;
  desiredSign: number;
  actualSign: number;
}

export interface CisTransStereoStatus {
  kind: 'cisTrans';
  bondKey: string;
  jId: string;
  kId: string;
  jIdx: number;
  kIdx: number;
  satisfied: boolean;
  desiredCos: number;
  actualCos: number;
}

export type StereoStatusItem = ChiralStereoStatus | CisTransStereoStatus;

export interface StereoVerifyResult {
  constraints: StereoConstraints;
  items: StereoStatusItem[];
  allSatisfied: boolean;
  /** True when at least one hard flip was applied. */
  corrected: boolean;
}

type Vec3 = { x: number; y: number; z: number };

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
const normalize = (a: Vec3): Vec3 => {
  const L = length(a) || 1;
  return { x: a.x / L, y: a.y / L, z: a.z / L };
};

const tripleSign = (c: Vec3, p1: Vec3, p2: Vec3, p3: Vec3): number =>
  Math.sign(dot(sub(p1, c), cross(sub(p2, c), sub(p3, c))));

const dihedralCos = (pi: Vec3, pj: Vec3, pk: Vec3, pl: Vec3): number => {
  const b1 = sub(pj, pi);
  const b2 = sub(pk, pj);
  const b3 = sub(pl, pk);
  const n1 = cross(b1, b2);
  const n2 = cross(b2, b3);
  const denom = length(n1) * length(n2);
  if (denom < 1e-9) return 1;
  return Math.max(-1, Math.min(1, dot(n1, n2) / denom));
};

const posOf = (atoms: Atom3D[], id: string): Vec3 | null => {
  const a = atoms.find(x => x.id === id);
  return a ? { ...a.pos } : null;
};

const setPos = (atoms: Atom3D[], id: string, p: Vec3): void => {
  const a = atoms.find(x => x.id === id);
  if (a) a.pos = p;
};

/**
 * Reflect point `p` through the plane defined by point `o` and unit normal `n`.
 */
const reflectThroughPlane = (p: Vec3, o: Vec3, n: Vec3): Vec3 => {
  const rel = sub(p, o);
  const d = 2 * dot(rel, n);
  return sub(p, scale(n, d));
};

/** Flip chirality by reflecting the center's n3-side atoms across the n1–c–n2 plane. */
const flipChiral = (
  atoms: Atom3D[],
  con: ChiralConstraint,
  adjacency: Map<string, string[]>,
): void => {
  const c = posOf(atoms, con.center);
  const p1 = posOf(atoms, con.n1);
  const p2 = posOf(atoms, con.n2);
  if (!c || !p1 || !p2) return;
  const n = normalize(cross(sub(p1, c), sub(p2, c)));
  if (length(n) < 1e-8) {
    // Degenerate plane — just invert z of n3 relative to center.
    const p3 = posOf(atoms, con.n3);
    if (p3) setPos(atoms, con.n3, { x: p3.x, y: p3.y, z: 2 * c.z - p3.z });
    return;
  }
  // Reflect everything on the "n3" side of the center except n1 and n2.
  const frozen = new Set([con.center, con.n1, con.n2]);
  const flip = new Set<string>();
  const stack = [con.n3];
  flip.add(con.n3);
  while (stack.length) {
    const cur = stack.pop()!;
    for (const nb of adjacency.get(cur) ?? []) {
      if (frozen.has(nb) || flip.has(nb)) continue;
      flip.add(nb);
      stack.push(nb);
    }
  }
  for (const id of flip) {
    const p = posOf(atoms, id);
    if (!p) continue;
    setPos(atoms, id, reflectThroughPlane(p, c, n));
  }
};

/** Rotate k-side 180° about j–k if E/Z is wrong. */
const flipCisTrans = (
  atoms: Atom3D[],
  con: CisTransConstraint,
  adjacency: Map<string, string[]>,
): void => {
  const pj = posOf(atoms, con.j);
  const pk = posOf(atoms, con.k);
  const pi = posOf(atoms, con.i);
  const pl = posOf(atoms, con.l);
  if (!pj || !pk || !pi || !pl) return;
  if (Math.sign(dihedralCos(pi, pj, pk, pl)) === Math.sign(con.desiredCos)) return;

  const comp = new Set<string>([con.k]);
  const stack = [con.k];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const nb of adjacency.get(cur) ?? []) {
      if (nb === con.j || comp.has(nb)) continue;
      comp.add(nb);
      stack.push(nb);
    }
  }
  const u = normalize(sub(pk, pj));
  for (const id of comp) {
    if (id === con.k) continue;
    const p = posOf(atoms, id);
    if (!p) continue;
    const rel = sub(p, pj);
    const proj = 2 * dot(rel, u);
    setPos(atoms, id, add(pj, sub(scale(u, proj), rel)));
  }
};

const buildAdjacency = (conf: Conformer): Map<string, string[]> => {
  const adj = new Map<string, string[]>();
  for (const a of conf.atoms) adj.set(a.id, []);
  for (const b of conf.bonds) {
    adj.get(b.fromAtomId)?.push(b.toAtomId);
    adj.get(b.toAtomId)?.push(b.fromAtomId);
  }
  return adj;
};

/** Apply hard flips so conformer matches stereo constraints (in place). */
export const enforceStereoConstraints = (
  conformer: Conformer,
  constraints: StereoConstraints,
): boolean => {
  const adj = buildAdjacency(conformer);
  let corrected = false;
  for (const con of constraints.cisTrans) {
    const pi = posOf(conformer.atoms, con.i);
    const pj = posOf(conformer.atoms, con.j);
    const pk = posOf(conformer.atoms, con.k);
    const pl = posOf(conformer.atoms, con.l);
    if (!pi || !pj || !pk || !pl) continue;
    if (Math.sign(dihedralCos(pi, pj, pk, pl)) !== Math.sign(con.desiredCos)) {
      flipCisTrans(conformer.atoms, con, adj);
      corrected = true;
    }
  }
  for (const con of constraints.chirals) {
    const c = posOf(conformer.atoms, con.center);
    const p1 = posOf(conformer.atoms, con.n1);
    const p2 = posOf(conformer.atoms, con.n2);
    const p3 = posOf(conformer.atoms, con.n3);
    if (!c || !p1 || !p2 || !p3) continue;
    const actual = tripleSign(c, p1, p2, p3);
    if (actual !== 0 && actual !== con.sign) {
      flipChiral(conformer.atoms, con, adj);
      corrected = true;
    }
  }
  return corrected;
};

/** Report which stereo constraints the conformer currently satisfies. */
export const verifyStereoConstraints = (
  conformer: Conformer,
  constraints: StereoConstraints,
): StereoStatusItem[] => {
  const indexOf = new Map(conformer.atoms.map((a, i) => [a.id, i]));
  const items: StereoStatusItem[] = [];

  for (const con of constraints.chirals) {
    const c = posOf(conformer.atoms, con.center);
    const p1 = posOf(conformer.atoms, con.n1);
    const p2 = posOf(conformer.atoms, con.n2);
    const p3 = posOf(conformer.atoms, con.n3);
    const actual = c && p1 && p2 && p3 ? tripleSign(c, p1, p2, p3) : 0;
    items.push({
      kind: 'chiral',
      centerId: con.center,
      centerIdx: indexOf.get(con.center) ?? -1,
      satisfied: actual !== 0 && actual === con.sign,
      desiredSign: con.sign,
      actualSign: actual,
    });
  }

  for (const con of constraints.cisTrans) {
    const pi = posOf(conformer.atoms, con.i);
    const pj = posOf(conformer.atoms, con.j);
    const pk = posOf(conformer.atoms, con.k);
    const pl = posOf(conformer.atoms, con.l);
    const actual = pi && pj && pk && pl ? dihedralCos(pi, pj, pk, pl) : 0;
    const [ja, jb] = con.j < con.k ? [con.j, con.k] : [con.k, con.j];
    items.push({
      kind: 'cisTrans',
      bondKey: `${ja}|${jb}`,
      jId: con.j,
      kId: con.k,
      jIdx: indexOf.get(con.j) ?? -1,
      kIdx: indexOf.get(con.k) ?? -1,
      satisfied: Math.sign(actual) === Math.sign(con.desiredCos),
      desiredCos: con.desiredCos,
      actualCos: actual,
    });
  }
  return items;
};

/**
 * Hard-enforce perceived stereo on a conformer (flips wrong centers / double bonds).
 * Returns a verification report (after correction).
 */
export const enforceAndVerifyStereo3D = (
  mol2d: Molecule,
  conformer: Conformer,
  opts: { correct?: boolean } = {},
): StereoVerifyResult => {
  const correct = opts.correct !== false;
  const g = buildGraph(mol2d);
  const constraints = perceiveStereo(mol2d, g);
  const corrected = correct ? enforceStereoConstraints(conformer, constraints) : false;
  const items = verifyStereoConstraints(conformer, constraints);
  return {
    constraints,
    items,
    allSatisfied: items.length === 0 || items.every(i => i.satisfied),
    corrected,
  };
};

/** True when the 2D molecule carries any stereo that 3D must honor. */
export const moleculeHasStereoConstraints = (mol: Molecule): boolean => {
  const s = perceiveStereo(mol);
  return s.chirals.length > 0 || s.cisTrans.length > 0;
};

const fixedCoord = (val: number): string => val.toFixed(4).padStart(10, ' ');

/**
 * Hard-correct a GENERATE_3D molblock so heavy-atom xyz matches 2D wedges/dashes
 * and E/Z. Atom order must match `atomIdsInOrder` (same order sent to the worker).
 * Hydrogens appended after heavies are left untouched.
 */
export const enforceStereoOnMolblock3D = (
  mol2d: Molecule,
  molblock3D: string,
  atomIdsInOrder: string[],
): { molblock: string; verify: StereoVerifyResult } | null => {
  if (!moleculeHasStereoConstraints(mol2d)) {
    return {
      molblock: molblock3D,
      verify: {
        constraints: { chirals: [], cisTrans: [] },
        items: [],
        allSatisfied: true,
        corrected: false,
      },
    };
  }

  const lines = molblock3D.split(/\r?\n/);
  const counts = lines[3];
  if (!counts) return null;
  const nAtoms = parseInt(counts.slice(0, 3).trim() || '0', 10);
  if (!Number.isFinite(nAtoms) || nAtoms <= 0) return null;

  const n = Math.min(nAtoms, atomIdsInOrder.length);
  const atomById = new Map(mol2d.atoms.map(a => [a.id, a]));
  const idSet = new Set(atomIdsInOrder.slice(0, n));
  const conf: Conformer = {
    atoms: [],
    bonds: mol2d.bonds.filter(b => idSet.has(b.fromAtomId) && idSet.has(b.toAtomId)),
  };

  for (let i = 0; i < n; i++) {
    const line = lines[4 + i];
    if (!line || line.length < 34) return null;
    const id = atomIdsInOrder[i]!;
    const a2 = atomById.get(id);
    conf.atoms.push({
      id,
      element: a2?.element ?? (line.slice(31, 34).trim() || 'C'),
      charge: a2?.charge ?? 0,
      isotope: a2?.isotope,
      pos: {
        x: parseFloat(line.slice(0, 10)),
        y: parseFloat(line.slice(10, 20)),
        z: parseFloat(line.slice(20, 30)) || 0,
      },
    });
  }

  const verify = enforceAndVerifyStereo3D(mol2d, conf, { correct: true });
  if (!verify.corrected) {
    return { molblock: molblock3D, verify };
  }

  for (let i = 0; i < n; i++) {
    const line = lines[4 + i];
    if (!line || line.length < 34) continue;
    const p = conf.atoms[i]!.pos;
    lines[4 + i] = `${fixedCoord(p.x)}${fixedCoord(p.y)}${fixedCoord(p.z)}${line.slice(30)}`;
  }
  return { molblock: lines.join('\n'), verify };
};
