/**
 * Bake 2D wedge/dash / E–Z into a 3D seed before minimization.
 * Shared by embed3D and progressive embed (gradient descent cannot cross
 * inversion / double-bond flip barriers on its own).
 */
import type { Molecule } from '@moldraw/domain';
import type { StereoConstraints } from './stereo';

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

/** Out-of-plane displacement from wedge (toward viewer) / dash (away). */
export const bakeWedgeDashSeed = (mol: Molecule, pos: Map<string, Vec3>, out = 0.9): void => {
  for (const b of mol.bonds) {
    if (!b.stereo || (b.stereo !== 'wedge' && b.stereo !== 'dash')) continue;
    const center = pos.get(b.fromAtomId);
    const nb = pos.get(b.toAtomId);
    if (!center || !nb) continue;
    pos.set(b.toAtomId, {
      x: nb.x,
      y: nb.y,
      z: center.z + (b.stereo === 'wedge' ? out : -out),
    });
  }
};

const seedCisTrans = (
  pos: Map<string, Vec3>,
  con: { i: string; j: string; k: string; l: string; desiredCos: number },
  adjacency: Map<string, string[]>,
): void => {
  const pj = pos.get(con.j);
  const pk = pos.get(con.k);
  const pi = pos.get(con.i);
  const pl = pos.get(con.l);
  if (!pj || !pk || !pi || !pl) return;
  const cos = dihedralCos(pi, pj, pk, pl);
  if (Math.sign(cos) === Math.sign(con.desiredCos)) return;

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
    const p = pos.get(id);
    if (!p) continue;
    const rel = sub(p, pj);
    const proj = 2 * dot(rel, u);
    pos.set(id, add(pj, sub(scale(u, proj), rel)));
  }
};

/**
 * Apply depiction stereo to an existing xyz seed (wedge/dash z + E/Z flip).
 * Call after scaling 2D coords into Å; `mol` should carry the drawn stereo bonds.
 */
export const applyDepictionStereoSeed = (
  mol: Molecule,
  pos: Map<string, Vec3>,
  stereo: StereoConstraints,
): void => {
  bakeWedgeDashSeed(mol, pos);
  if (stereo.cisTrans.length === 0) return;
  const adjacency = new Map<string, string[]>();
  for (const a of mol.atoms) adjacency.set(a.id, []);
  for (const b of mol.bonds) {
    adjacency.get(b.fromAtomId)?.push(b.toAtomId);
    adjacency.get(b.toAtomId)?.push(b.fromAtomId);
  }
  for (const con of stereo.cisTrans) seedCisTrans(pos, con, adjacency);
};
