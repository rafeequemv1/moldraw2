/**
 * C₆₀ (buckminsterfullerene) special-case: organic UFF cannot embed the cage.
 * Detect the classic 60×C / 90-bond / degree-3 graph and lay out a sphere pose
 * from the molecule's own connectivity (iterative spherical spring embed).
 */
import type { Molecule, PerspectivePose } from '@moldraw/domain';

/** Classic soccer-ball fullerene fingerprint. */
export const isBuckminsterfullereneC60 = (mol: Molecule): boolean => {
  if (mol.atoms.length !== 60 || mol.bonds.length !== 90) return false;
  if (!mol.atoms.every(a => a.element === 'C')) return false;
  const deg = new Map<string, number>();
  for (const a of mol.atoms) deg.set(a.id, 0);
  for (const b of mol.bonds) {
    if (b.order !== 1 && !b.aromatic) return false;
    deg.set(b.fromAtomId, (deg.get(b.fromAtomId) ?? 0) + 1);
    deg.set(b.toAtomId, (deg.get(b.toAtomId) ?? 0) + 1);
  }
  for (const a of mol.atoms) {
    if (deg.get(a.id) !== 3) return false;
  }
  return true;
};

const UNIT_BOND_CHORD = 0.403526; // regular truncated icosahedron on unit sphere

/**
 * Build a spherical PerspectivePose for a C₆₀ graph.
 * Uses current 2D coords as a seed, then relaxes bonds on a sphere of radius
 * matching `bondLengthPx`.
 */
export const buildC60SpherePose = (
  mol: Molecule,
  bondLengthPx: number,
): PerspectivePose | null => {
  if (!isBuckminsterfullereneC60(mol)) return null;

  const ids = mol.atoms.map(a => a.id);
  const indexOf = new Map(ids.map((id, i) => [id, i]));
  const n = ids.length;
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const b of mol.bonds) {
    const i = indexOf.get(b.fromAtomId);
    const j = indexOf.get(b.toAtomId);
    if (i == null || j == null) continue;
    adj[i]!.push(j);
    adj[j]!.push(i);
  }

  let cx = 0;
  let cy = 0;
  for (const a of mol.atoms) {
    cx += a.x;
    cy += a.y;
  }
  cx /= n;
  cy /= n;

  // Seed on sphere from 2D (inverse-ish stereographic) then normalize.
  const pos = mol.atoms.map(a => {
    const x = a.x - cx;
    const y = a.y - cy;
    const r2 = x * x + y * y;
    const z = 1 - r2 * 0.0004;
    const L = Math.hypot(x, y, z) || 1;
    return { x: x / L, y: y / L, z: z / L };
  });

  const targetChord = UNIT_BOND_CHORD;
  const radius = bondLengthPx / targetChord;

  for (let iter = 0; iter < 280; iter++) {
    const force = pos.map(() => ({ x: 0, y: 0, z: 0 }));
    // Bond springs → target chord on unit sphere.
    for (let i = 0; i < n; i++) {
      for (const j of adj[i]!) {
        if (j <= i) continue;
        const a = pos[i]!;
        const b = pos[j]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dy, dz) || 1e-9;
        const pull = (d - targetChord) * 0.35;
        const fx = (dx / d) * pull;
        const fy = (dy / d) * pull;
        const fz = (dz / d) * pull;
        force[i]!.x += fx;
        force[i]!.y += fy;
        force[i]!.z += fz;
        force[j]!.x -= fx;
        force[j]!.y -= fy;
        force[j]!.z -= fz;
      }
    }
    // Mild non-bonded repulsion (keeps sphere from collapsing faces).
    for (let i = 0; i < n; i++) {
      const nbr = new Set(adj[i]);
      nbr.add(i);
      for (let j = i + 1; j < n; j++) {
        if (nbr.has(j)) continue;
        const a = pos[i]!;
        const b = pos[j]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dy, dz) || 1e-9;
        if (d > 1.1) continue;
        const push = 0.02 / (d * d);
        force[i]!.x -= (dx / d) * push;
        force[i]!.y -= (dy / d) * push;
        force[i]!.z -= (dz / d) * push;
        force[j]!.x += (dx / d) * push;
        force[j]!.y += (dy / d) * push;
        force[j]!.z += (dz / d) * push;
      }
    }
    const step = iter < 80 ? 0.55 : 0.25;
    for (let i = 0; i < n; i++) {
      const p = pos[i]!;
      const f = force[i]!;
      let x = p.x + f.x * step;
      let y = p.y + f.y * step;
      let z = p.z + f.z * step;
      const L = Math.hypot(x, y, z) || 1;
      pos[i] = { x: x / L, y: y / L, z: z / L };
    }
  }

  // Center on current 2D centroid; scale to canvas bond length.
  const positions: PerspectivePose['positions'] = {};
  for (let i = 0; i < n; i++) {
    const p = pos[i]!;
    positions[ids[i]!] = {
      x: cx + p.x * radius,
      y: cy + p.y * radius,
      z: p.z * radius,
    };
  }

  return {
    positions,
    depthShading: true,
    depthFade: 1,
    depthWedges: false,
  };
};
