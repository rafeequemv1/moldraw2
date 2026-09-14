/**
 * ChemDraw-style canvas 3D perspective: pose apply / clear / flatten / rotate,
 * and mapping GENERATE_3D molblock coords onto document atom ids.
 */
import type { Atom3DPose, Molecule, PerspectivePose } from '@moldraw/domain';
import { buildV2000Molblock, type MolblockAtomRow, type MolblockBondRow } from '../io/buildV2000Molblock';

export type { Atom3DPose, PerspectivePose };

/** Clamp fade strength to [0, 1.5] (1 = full ChemDraw-like; >1 = extra far fade). */
export const clampDepthFade = (v: number | undefined): number => {
  if (v == null || !Number.isFinite(v)) return 1;
  return Math.min(1.5, Math.max(0, v));
};

/** Parse V2000 molblock atom block into sequential xyz (same layout as engine-3d). */
const parseMolblock3DCoords = (
  molblock: string,
): { coords: { x: number; y: number; z: number }[] } | null => {
  const lines = molblock.split(/\r?\n/);
  const counts = lines[3];
  if (!counts) return null;
  const nAtoms = parseInt(counts.slice(0, 3).trim() || '0', 10);
  if (!Number.isFinite(nAtoms) || nAtoms <= 0) return null;
  const coords: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < nAtoms; i++) {
    const line = lines[4 + i];
    if (!line || line.length < 34) return null;
    coords.push({
      x: parseFloat(line.slice(0, 10)),
      y: parseFloat(line.slice(10, 20)),
      z: parseFloat(line.slice(20, 30)) || 0,
    });
  }
  return { coords };
};

/** Parse V2000 bond endpoints (0-based indices) for scale estimation. */
const parseMolblockBondPairs = (
  molblock: string,
  nAtoms: number,
): { from: number; to: number }[] => {
  const lines = molblock.split(/\r?\n/);
  const counts = lines[3];
  if (!counts) return [];
  const nBonds = parseInt(counts.slice(3, 6).trim() || '0', 10);
  if (!Number.isFinite(nBonds) || nBonds <= 0) return [];
  const bonds: { from: number; to: number }[] = [];
  for (let i = 0; i < nBonds; i++) {
    const line = lines[4 + nAtoms + i];
    if (!line || line.length < 6) continue;
    const from = parseInt(line.slice(0, 3).trim() || '0', 10) - 1;
    const to = parseInt(line.slice(3, 6).trim() || '0', 10) - 1;
    if (from >= 0 && to >= 0 && from < nAtoms && to < nAtoms) {
      bonds.push({ from, to });
    }
  }
  return bonds;
};

/** Median pairwise bond length in 3D (Å). */
const medianBondLength3D = (
  coords: { x: number; y: number; z: number }[],
  bonds: { from: number; to: number }[],
): number => {
  const lens: number[] = [];
  for (const b of bonds) {
    const a = coords[b.from];
    const c = coords[b.to];
    if (!a || !c) continue;
    const d = Math.hypot(a.x - c.x, a.y - c.y, a.z - c.z);
    if (Number.isFinite(d) && d > 1e-6) lens.push(d);
  }
  if (lens.length === 0) {
    for (let i = 0; i < coords.length - 1; i++) {
      const a = coords[i]!;
      const c = coords[i + 1]!;
      const d = Math.hypot(a.x - c.x, a.y - c.y, a.z - c.z);
      if (d > 1e-6) lens.push(d);
    }
  }
  if (lens.length === 0) return 1.5;
  lens.sort((x, y) => x - y);
  return lens[Math.floor(lens.length / 2)]!;
};

const centroid2D = (atoms: { x: number; y: number }[]): { cx: number; cy: number } => {
  if (atoms.length === 0) return { cx: 0, cy: 0 };
  let sx = 0;
  let sy = 0;
  for (const a of atoms) {
    sx += a.x;
    sy += a.y;
  }
  return { cx: sx / atoms.length, cy: sy / atoms.length };
};

/** RMS distance from centroid in the XY plane — used to match on-canvas footprint. */
const rmsRadius2D = (
  atoms: { x: number; y: number }[],
  c: { cx: number; cy: number },
): number => {
  if (atoms.length === 0) return 0;
  let s = 0;
  for (const a of atoms) {
    const dx = a.x - c.cx;
    const dy = a.y - c.cy;
    s += dx * dx + dy * dy;
  }
  return Math.sqrt(s / atoms.length);
};

const normalizePoseOptions = (
  pose: PerspectivePose,
): Pick<PerspectivePose, 'depthShading' | 'depthFade' | 'depthWedges'> => ({
  depthShading: pose.depthShading !== false,
  depthFade: clampDepthFade(pose.depthFade),
  depthWedges: pose.depthWedges === true,
});

// ── rigid superposition (Horn 1987, quaternion closed form) ─────────────────

/** Largest-eigenvalue eigenvector of a symmetric 4×4 matrix (cyclic Jacobi). */
const dominantEigenvector4 = (m: number[][]): number[] => {
  const a = m.map(r => [...r]);
  const vec = [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];
  for (let sweep = 0; sweep < 50; sweep++) {
    let off = 0;
    for (let p = 0; p < 4; p++) for (let q = p + 1; q < 4; q++) off += a[p]![q]! * a[p]![q]!;
    if (off < 1e-18) break;
    for (let p = 0; p < 4; p++) {
      for (let q = p + 1; q < 4; q++) {
        const apq = a[p]![q]!;
        if (Math.abs(apq) < 1e-15) continue;
        const theta = (a[q]![q]! - a[p]![p]!) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < 4; k++) {
          const akp = a[k]![p]!;
          const akq = a[k]![q]!;
          a[k]![p] = c * akp - s * akq;
          a[k]![q] = s * akp + c * akq;
        }
        for (let k = 0; k < 4; k++) {
          const apk = a[p]![k]!;
          const aqk = a[q]![k]!;
          a[p]![k] = c * apk - s * aqk;
          a[q]![k] = s * apk + c * aqk;
        }
        for (let k = 0; k < 4; k++) {
          const vkp = vec[k]![p]!;
          const vkq = vec[k]![q]!;
          vec[k]![p] = c * vkp - s * vkq;
          vec[k]![q] = s * vkp + c * vkq;
        }
      }
    }
  }
  let best = 0;
  for (let i = 1; i < 4; i++) if (a[i]![i]! > a[best]![best]!) best = i;
  return [vec[0]![best]!, vec[1]![best]!, vec[2]![best]!, vec[3]![best]!];
};

type XYZ = { x: number; y: number; z: number };

/**
 * Optimal rotation (3×3, row-major) that maps centred `from` points onto
 * centred `to` points in a least-squares sense. Returns null with < 3 pairs
 * or a degenerate (collinear) configuration.
 */
export const kabschRotation = (
  from: readonly XYZ[],
  to: readonly XYZ[],
): number[][] | null => {
  const n = Math.min(from.length, to.length);
  if (n < 3) return null;
  let Sxx = 0, Sxy = 0, Sxz = 0, Syx = 0, Syy = 0, Syz = 0, Szx = 0, Szy = 0, Szz = 0;
  for (let i = 0; i < n; i++) {
    const p = from[i]!;
    const q = to[i]!;
    Sxx += p.x * q.x; Sxy += p.x * q.y; Sxz += p.x * q.z;
    Syx += p.y * q.x; Syy += p.y * q.y; Syz += p.y * q.z;
    Szx += p.z * q.x; Szy += p.z * q.y; Szz += p.z * q.z;
  }
  const N = [
    [Sxx + Syy + Szz, Syz - Szy, Szx - Sxz, Sxy - Syx],
    [Syz - Szy, Sxx - Syy - Szz, Sxy + Syx, Szx + Sxz],
    [Szx - Sxz, Sxy + Syx, -Sxx + Syy - Szz, Syz + Szy],
    [Sxy - Syx, Szx + Sxz, Syz + Szy, -Sxx - Syy + Szz],
  ];
  const [w, x, y, z] = dominantEigenvector4(N) as [number, number, number, number];
  const norm = Math.hypot(w, x, y, z);
  if (!Number.isFinite(norm) || norm < 1e-9) return null;
  const qw = w / norm, qx = x / norm, qy = y / norm, qz = z / norm;
  return [
    [1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - qz * qw), 2 * (qx * qz + qy * qw)],
    [2 * (qx * qy + qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - qx * qw)],
    [2 * (qx * qz - qy * qw), 2 * (qy * qz + qx * qw), 1 - 2 * (qx * qx + qy * qy)],
  ];
};

const centroid3D = (pts: readonly XYZ[]): XYZ => {
  if (pts.length === 0) return { x: 0, y: 0, z: 0 };
  let sx = 0, sy = 0, sz = 0;
  for (const p of pts) {
    sx += p.x;
    sy += p.y;
    sz += p.z;
  }
  return { x: sx / pts.length, y: sy / pts.length, z: sz / pts.length };
};

/**
 * Rigidly rotate `positions` (about their centroid) so atoms shared with
 * `reference` line up as closely as possible — keeps the user's orbit after a
 * re-run of 3D Clean Up instead of snapping to the embedder's frame.
 */
export const alignPositionsToReference = (
  positions: Record<string, Atom3DPose>,
  reference: Readonly<Record<string, Atom3DPose>>,
): Record<string, Atom3DPose> => {
  const common = Object.keys(positions).filter(id => reference[id]);
  if (common.length < 3) return positions;
  const from = common.map(id => positions[id]!);
  const to = common.map(id => reference[id]!);
  const cf = centroid3D(from);
  const ct = centroid3D(to);
  const R = kabschRotation(
    from.map(p => ({ x: p.x - cf.x, y: p.y - cf.y, z: p.z - cf.z })),
    to.map(p => ({ x: p.x - ct.x, y: p.y - ct.y, z: p.z - ct.z })),
  );
  if (!R) return positions;
  const out: Record<string, Atom3DPose> = {};
  for (const [id, p] of Object.entries(positions)) {
    const x = p.x - cf.x;
    const y = p.y - cf.y;
    const z = p.z - cf.z;
    out[id] = {
      x: cf.x + R[0]![0]! * x + R[0]![1]! * y + R[0]![2]! * z,
      y: cf.y + R[1]![0]! * x + R[1]![1]! * y + R[1]![2]! * z,
      z: cf.z + R[2]![0]! * x + R[2]![1]! * y + R[2]![2]! * z,
    };
  }
  return out;
};

export interface PoseFromMolblockOptions {
  /**
   * Previous pose positions (canvas space). When given, the new pose is
   * rigidly rotated to best match the atoms it shares with the reference so a
   * re-clean keeps the current orientation.
   */
  referencePositions?: Readonly<Record<string, Atom3DPose>>;
}

/**
 * Build a canvas-scaled PerspectivePose from a 3D molblock whose atom order
 * matches `atomIdsInOrder` (same order as the molblock sent to GENERATE_3D).
 * Only ids present in `keepAtomIds` are kept (drops expanded alias atoms).
 */
export const poseFromMolblock3D = (
  molblock: string,
  atomIdsInOrder: string[],
  keepAtomIds: ReadonlySet<string>,
  target2DAtoms: { id: string; x: number; y: number }[],
  bondLengthPx: number,
  options: PoseFromMolblockOptions = {},
): PerspectivePose | null => {
  const parsed = parseMolblock3DCoords(molblock);
  if (!parsed || parsed.coords.length === 0) return null;

  const n = Math.min(parsed.coords.length, atomIdsInOrder.length);
  const bonds = parseMolblockBondPairs(molblock, parsed.coords.length).filter(
    b => b.from < n && b.to < n,
  );
  const med = medianBondLength3D(parsed.coords.slice(0, n), bonds);
  const bondScale = bondLengthPx / (med || 1.5);

  let positions: Record<string, Atom3DPose> = {};
  for (let i = 0; i < n; i++) {
    const id = atomIdsInOrder[i]!;
    if (!keepAtomIds.has(id)) continue;
    const c = parsed.coords[i]!;
    positions[id] = { x: c.x * bondScale, y: -c.y * bondScale, z: c.z * bondScale };
  }
  if (Object.keys(positions).length === 0) return null;

  if (options.referencePositions) {
    positions = alignPositionsToReference(positions, options.referencePositions);
  }
  const scaled = Object.entries(positions).map(([id, p]) => ({ id, ...p }));

  // Match the original 2D footprint (size + center) so labels don't look bigger
  // and the molecule doesn't jump/shrink after Clean Up.
  const keepTargets = target2DAtoms.filter(a => keepAtomIds.has(a.id) && positions[a.id]);
  const targets = keepTargets.length ? keepTargets : target2DAtoms;
  const docC = centroid2D(targets);
  const poseC = centroid2D(scaled);
  const targetR = rmsRadius2D(targets, docC);
  const poseR = rmsRadius2D(scaled, poseC);
  const sizeScale = poseR > 1e-3 && targetR > 1e-3 ? targetR / poseR : 1;

  for (const id of Object.keys(positions)) {
    const p = positions[id]!;
    positions[id] = {
      x: poseC.cx + (p.x - poseC.cx) * sizeScale,
      y: poseC.cy + (p.y - poseC.cy) * sizeScale,
      z: p.z * sizeScale,
    };
  }
  const dx = docC.cx - poseC.cx;
  const dy = docC.cy - poseC.cy;
  for (const id of Object.keys(positions)) {
    const p = positions[id]!;
    positions[id] = { x: p.x + dx, y: p.y + dy, z: p.z };
  }

  return {
    positions,
    depthShading: true,
    depthFade: 1,
    depthWedges: false,
  };
};

export const apply3DPose = (prev: Molecule, pose: PerspectivePose): Molecule => ({
  ...prev,
  perspective3D: {
    positions: { ...pose.positions },
    ...normalizePoseOptions(pose),
  },
});

/**
 * Coarse fingerprint of canvas perspective positions (for 3D viewer sync).
 * Chemistry-only keys ignore this — pose orbit/drag must invalidate separately.
 */
export const perspectivePoseFingerprint = (mol: Molecule): string => {
  const pose = mol.perspective3D;
  if (!pose) return '';
  const ids = Object.keys(pose.positions).sort();
  if (ids.length === 0) return '';
  return ids
    .map(id => {
      const p = pose.positions[id]!;
      return `${id}:${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`;
    })
    .join('|');
};

/**
 * Depth-only pose signature. 2D move/rotate/scale of a drawing changes x/y
 * but not z — the right-hand 3D viewer must stay put for those layout edits.
 */
export const perspectiveZFingerprint = (mol: Molecule): string => {
  const pose = mol.perspective3D;
  if (!pose) return '';
  const ids = mol.atoms.map(a => a.id).filter(id => pose.positions[id]).sort();
  if (ids.length === 0) return '';
  return ids.map(id => `${id}:${pose.positions[id]!.z.toFixed(3)}`).join('|');
};

/**
 * Serialize the canvas perspective pose as a 3D V2000 molblock (Å, y-up) for
 * the right-hand viewer. Scales by median bond length so the pose footprint
 * matches typical UFF bond lengths (~1.5 Å).
 */
export const molblock3DFromPerspectivePose = (mol: Molecule): string | null => {
  const pose = mol.perspective3D;
  if (!pose) return null;
  const atomsWithPose = mol.atoms.filter(a => pose.positions[a.id]);
  if (atomsWithPose.length === 0) return null;

  const coordsById = new Map(mol.atoms.map((a, i) => [a.id, molfileCoordsAngstrom(mol)[i]!]));
  const atoms: MolblockAtomRow[] = atomsWithPose.map(a => {
    const c = coordsById.get(a.id)!;
    return { element: a.element, x: c.x, y: c.y, z: c.z };
  });

  const idToIdx = new Map(atomsWithPose.map((a, i) => [a.id, i]));
  const bonds: MolblockBondRow[] = [];
  for (const b of mol.bonds) {
    const from = idToIdx.get(b.fromAtomId);
    const to = idToIdx.get(b.toAtomId);
    if (from == null || to == null) continue;
    bonds.push({
      from,
      to,
      order: b.order,
      aromatic: b.aromatic,
      stereo:
        b.stereo === 'wedge' || b.stereo === 'dash' || b.stereo === 'wavy'
          ? b.stereo
          : undefined,
    });
  }

  return buildV2000Molblock(atoms, bonds);
};

export const clear3DPose = (prev: Molecule): Molecule => {
  if (!prev.perspective3D) return prev;
  return { ...prev, perspective3D: undefined };
};

/**
 * Project pose x/y onto Atom.x/y (keep stereo bonds), then clear the pose.
 * Conservative Flatten — does not re-derive wedges from z.
 */
export const flatten3DPose = (prev: Molecule): Molecule => {
  const pose = prev.perspective3D;
  if (!pose) return prev;
  const atoms = prev.atoms.map(a => {
    const p = pose.positions[a.id];
    if (!p) return a;
    return { ...a, x: p.x, y: p.y };
  });
  return { ...prev, atoms, perspective3D: undefined };
};

export const setPerspectiveDepthShading = (prev: Molecule, depthShading: boolean): Molecule => {
  if (!prev.perspective3D) return prev;
  return {
    ...prev,
    perspective3D: { ...prev.perspective3D, depthShading },
  };
};

export const setPerspectiveDepthFade = (prev: Molecule, depthFade: number): Molecule => {
  if (!prev.perspective3D) return prev;
  return {
    ...prev,
    perspective3D: { ...prev.perspective3D, depthFade: clampDepthFade(depthFade) },
  };
};

export const setPerspectiveDepthWedges = (prev: Molecule, depthWedges: boolean): Molecule => {
  if (!prev.perspective3D) return prev;
  return {
    ...prev,
    perspective3D: { ...prev.perspective3D, depthWedges },
  };
};

/** Rotate a crystal-frame offset by the same X-then-Y Euler used for the pose. */
export const rotateOffset3D = (
  dx: number,
  dy: number,
  dz: number,
  rotX: number,
  rotY: number,
): { x: number; y: number; z: number } => {
  const cosX = Math.cos(rotX);
  const sinX = Math.sin(rotX);
  const cosY = Math.cos(rotY);
  const sinY = Math.sin(rotY);
  const y1 = dy * cosX - dz * sinX;
  const z1 = dy * sinX + dz * cosX;
  return {
    x: dx * cosY + z1 * sinY,
    y: y1,
    z: -dx * sinY + z1 * cosY,
  };
};

/**
 * User orbit commit: accumulate on COF `viewRot` so instanced layers stay
 * crystal-framed. Other pose atoms still rotate in place.
 */
export const rotateCofViewOrPose = (
  prev: Molecule,
  dAngleX: number,
  dAngleY: number,
): Molecule => {
  const layered = (prev.cofLattices ?? []).filter(l => l.viewRot);
  if (layered.length === 0) return rotate3DPose(prev, dAngleX, dAngleY);
  const cofSeed = new Set(layered.flatMap(l => l.atomIds));
  const next: Molecule = {
    ...prev,
    cofLattices: (prev.cofLattices ?? []).map(l =>
      l.viewRot
        ? { ...l, viewRot: { x: l.viewRot.x + dAngleX, y: l.viewRot.y + dAngleY } }
        : l,
    ),
  };
  const others = Object.keys(next.perspective3D?.positions ?? {}).filter(id => !cofSeed.has(id));
  return others.length ? rotate3DPose(next, dAngleX, dAngleY, others) : next;
};

/** Rotate pose about its centroid by Euler angles (radians) about X then Y. */
export const rotate3DPose = (
  prev: Molecule,
  dAngleX: number,
  dAngleY: number,
  atomIds?: readonly string[],
): Molecule => {
  const pose = prev.perspective3D;
  if (!pose) return prev;
  const ids = (atomIds?.length ? atomIds : Object.keys(pose.positions)).filter(
    id => pose.positions[id],
  );
  if (ids.length === 0) return prev;

  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const id of ids) {
    const p = pose.positions[id]!;
    cx += p.x;
    cy += p.y;
    cz += p.z;
  }
  cx /= ids.length;
  cy /= ids.length;
  cz /= ids.length;

  const cosX = Math.cos(dAngleX);
  const sinX = Math.sin(dAngleX);
  const cosY = Math.cos(dAngleY);
  const sinY = Math.sin(dAngleY);

  const positions: Record<string, Atom3DPose> = {};
  for (const id of ids) {
    const p = pose.positions[id]!;
    let x = p.x - cx;
    let y = p.y - cy;
    let z = p.z - cz;
    // Rotate about X
    const y1 = y * cosX - z * sinX;
    const z1 = y * sinX + z * cosX;
    y = y1;
    z = z1;
    // Rotate about Y
    const x2 = x * cosY + z * sinY;
    const z2 = -x * sinY + z * cosY;
    x = x2;
    z = z2;
    positions[id] = { x: x + cx, y: y + cy, z: z + cz };
  }

  return {
    ...prev,
    perspective3D: {
      ...pose,
      positions: atomIds?.length ? { ...pose.positions, ...positions } : positions,
    },
  };
};

/** Merge `add` into the pose (and drop `remove`). Clears the pose when empty. */
export const mergePerspectivePositions = (
  mol: Molecule,
  add: Record<string, Atom3DPose>,
  remove?: readonly string[],
): Molecule => {
  const prev = mol.perspective3D;
  const positions = { ...(prev?.positions ?? {}) };
  if (remove?.length) {
    for (const id of remove) delete positions[id];
  }
  for (const [id, p] of Object.entries(add)) positions[id] = p;
  if (Object.keys(positions).length === 0) {
    if (!prev) return mol;
    const next = { ...mol };
    delete next.perspective3D;
    return next;
  }
  return {
    ...mol,
    perspective3D: {
      positions,
      depthShading: prev?.depthShading !== false,
      depthFade: clampDepthFade(prev?.depthFade),
      depthWedges: prev?.depthWedges === true,
    },
  };
};

/** Orthographic project pose → 2D atom positions + per-atom opacity (1 = near). */
export const projectPerspectiveForDisplay = (
  mol: Molecule,
): { molecule: Molecule; opacityByAtomId: Map<string, number> } => {
  const pose = mol.perspective3D;
  const opacityByAtomId = new Map<string, number>();
  if (!pose) return { molecule: mol, opacityByAtomId };

  const zs = Object.values(pose.positions).map(p => p.z);
  let zMin = Infinity;
  let zMax = -Infinity;
  for (const z of zs) {
    if (z < zMin) zMin = z;
    if (z > zMax) zMax = z;
  }
  const span = Math.max(zMax - zMin, 1e-6);
  const shade = pose.depthShading !== false;
  const fade = clampDepthFade(pose.depthFade);

  const atoms = mol.atoms.map(a => {
    const p = pose.positions[a.id];
    if (!p) {
      opacityByAtomId.set(a.id, 1);
      return a;
    }
    // Near (high z toward viewer) → opaque; far → faded.
    // Full fade (strength 1): far ≈ 0.05, near = 1. Strength 0 → always 1.
    // Strength may exceed 1 (slider up to 1.5) for extra fade on distant atoms.
    const t = (p.z - zMin) / span;
    const farFloor = 0.05;
    const fullFadeOpacity = farFloor + (1 - farFloor) * t;
    const opacity = shade
      ? Math.max(0.02, 1 - fade * (1 - fullFadeOpacity))
      : 1;
    opacityByAtomId.set(a.id, opacity);
    return { ...a, x: p.x, y: p.y };
  });

  return { molecule: { ...mol, atoms }, opacityByAtomId };
};

export const hasPerspectivePose = (mol: Molecule): boolean =>
  !!mol.perspective3D && Object.keys(mol.perspective3D.positions).length > 0;

/** Flat 2D canvas px → Å for molfile export (40 px bond length = 1 Å). */
const FLAT_MOLFILE_ANGSTROM_PER_PX = 1 / 40;

/**
 * Median bond length in pose canvas space (px). Falls back to 40 px when unknown.
 */
const perspectivePoseMedianBondPx = (mol: Molecule): number => {
  const pose = mol.perspective3D;
  if (!pose) return 40;
  const idSet = new Set(mol.atoms.map(a => a.id));
  const bondLens: number[] = [];
  for (const b of mol.bonds) {
    if (!idSet.has(b.fromAtomId) || !idSet.has(b.toAtomId)) continue;
    const p0 = pose.positions[b.fromAtomId];
    const p1 = pose.positions[b.toAtomId];
    if (!p0 || !p1) continue;
    const d = Math.hypot(p0.x - p1.x, p0.y - p1.y, p0.z - p1.z);
    if (Number.isFinite(d) && d > 1e-6) bondLens.push(d);
  }
  bondLens.sort((a, b) => a - b);
  return bondLens.length > 0 ? bondLens[Math.floor(bondLens.length / 2)]! : 40;
};

/**
 * Per-atom molfile coordinates in Å (y-up). Uses the active perspective pose when
 * present so 3D angles survive MOL export; otherwise exports flat 2D with z = 0.
 */
export const molfileCoordsAngstrom = (
  mol: Molecule,
): { x: number; y: number; z: number }[] => {
  const pose = mol.perspective3D;
  if (!pose || Object.keys(pose.positions).length === 0) {
    return mol.atoms.map(a => ({
      x: a.x * FLAT_MOLFILE_ANGSTROM_PER_PX,
      y: -a.y * FLAT_MOLFILE_ANGSTROM_PER_PX,
      z: 0,
    }));
  }

  const scale = 1.5 / perspectivePoseMedianBondPx(mol);
  return mol.atoms.map(a => {
    const p = pose.positions[a.id];
    if (p) {
      return { x: p.x * scale, y: -p.y * scale, z: p.z * scale };
    }
    return {
      x: a.x * scale,
      y: -a.y * scale,
      z: 0,
    };
  });
};

/**
 * 3D seed (Å, right-handed / y-up — same frame as a 3D molblock) for the atoms
 * in `atomIdsInOrder`, taken from the active perspective pose. Atoms without a
 * pose entry get `null` so the embedder seeds them from the depiction instead.
 * Use as `GENERATE_3D.payload.seed3D` to re-minimize the pose in place.
 */
export const perspectivePoseSeedAngstrom = (
  mol: Molecule,
  atomIdsInOrder: readonly string[],
): ({ x: number; y: number; z: number } | null)[] | null => {
  const pose = mol.perspective3D;
  if (!pose || Object.keys(pose.positions).length === 0) return null;
  const scale = 1.5 / perspectivePoseMedianBondPx(mol);
  let any = false;
  const out = atomIdsInOrder.map(id => {
    const p = pose.positions[id];
    if (!p) return null;
    any = true;
    return { x: p.x * scale, y: -p.y * scale, z: p.z * scale };
  });
  return any ? out : null;
};

/**
 * Atom x/y from the active pose (canvas display space). Use for placement /
 * fusion / overlap while Structure Perspective is on — document Atom.x/y may
 * still be the pre–3D-Clean-Up flat coords.
 */
export const displayCoordsMolecule = (mol: Molecule): Molecule => {
  if (!hasPerspectivePose(mol)) return mol;
  return projectPerspectiveForDisplay(mol).molecule;
};

/** Average pose z near attachment atoms, else whole-pose mid-depth. */
export const midPerspectiveZ = (
  pose: PerspectivePose,
  nearAtomIds?: readonly string[],
): number => {
  const zs: number[] = [];
  if (nearAtomIds?.length) {
    for (const id of nearAtomIds) {
      const p = pose.positions[id];
      if (p) zs.push(p.z);
    }
  }
  if (zs.length === 0) {
    for (const p of Object.values(pose.positions)) zs.push(p.z);
  }
  if (zs.length === 0) return 0;
  return zs.reduce((s, z) => s + z, 0) / zs.length;
};

/**
 * Register newly added atoms in `perspective3D` so they orbit/fade with the
 * pose. Uses each atom's current x/y (placement/display space).
 *
 * Depth (z) comes from the bond geometry rather than a flat mid-depth: an atom
 * bonded to a posed neighbour is placed so the bond keeps the pose's bond
 * length — a foreshortened bond on screen therefore points toward or away from
 * the viewer, into the most open direction around the attachment atom (VSEPR-
 * like). Ring-closure atoms bonded to several posed atoms take their mean
 * depth. Atoms with no posed neighbour fall back to the depth near
 * `nearAtomIds` (fuse/attach roots) or the pose mid-depth.
 */
export const joinAtomsIntoPerspectivePose = (
  mol: Molecule,
  newAtomIds: readonly string[],
  nearAtomIds?: readonly string[],
): Molecule => {
  const pose = mol.perspective3D;
  if (!pose || newAtomIds.length === 0) return mol;
  const byId = new Map(mol.atoms.map(a => [a.id, a]));
  const positions: Record<string, Atom3DPose> = { ...pose.positions };
  const pending = new Set(newAtomIds.filter(id => !positions[id] && byId.has(id)));
  if (pending.size === 0) return mol;

  const bondLen = perspectivePoseMedianBondPx(mol);
  const neighbours = new Map<string, string[]>();
  for (const b of mol.bonds) {
    if (b.dotted) continue;
    (neighbours.get(b.fromAtomId) ?? neighbours.set(b.fromAtomId, []).get(b.fromAtomId)!).push(
      b.toAtomId,
    );
    (neighbours.get(b.toAtomId) ?? neighbours.set(b.toAtomId, []).get(b.toAtomId)!).push(
      b.fromAtomId,
    );
  }
  const nearSet = new Set(nearAtomIds ?? []);

  /** Openness score of direction `dir` (unit) at `root`: lower = more open. */
  const crowding = (rootId: string, root: Atom3DPose, dir: Atom3DPose): number => {
    let score = 0;
    for (const nid of neighbours.get(rootId) ?? []) {
      const np = positions[nid];
      if (!np) continue;
      const dx = np.x - root.x;
      const dy = np.y - root.y;
      const dz = np.z - root.z;
      const len = Math.hypot(dx, dy, dz) || 1;
      // cos of the angle between the new bond and each existing bond (+1 = on top).
      score += (dx * dir.x + dy * dir.y + dz * dir.z) / len;
    }
    return score;
  };

  // Batch orientation: first-generation atoms share one out-of-plane sign so a
  // fused ring / multi-attach fragment does not twist.
  let batchSign = 0;

  let progress = true;
  while (progress && pending.size > 0) {
    progress = false;
    for (const id of [...pending]) {
      const a = byId.get(id)!;
      const posedNbrs = (neighbours.get(id) ?? []).filter(nid => positions[nid]);
      if (posedNbrs.length === 0) continue;

      let z: number;
      if (posedNbrs.length >= 2) {
        // Ring closure / bridge: mean depth of the posed neighbours.
        z = posedNbrs.reduce((s, nid) => s + positions[nid]!.z, 0) / posedNbrs.length;
      } else {
        const rootId =
          posedNbrs.find(nid => nearSet.has(nid)) ?? posedNbrs[0]!;
        const root = positions[rootId]!;
        const dx = a.x - root.x;
        const dy = a.y - root.y;
        const d2 = dx * dx + dy * dy;
        const L2 = bondLen * bondLen;
        if (d2 >= L2 * 0.97) {
          z = root.z; // bond lies (almost) in the view plane
        } else {
          const dz = Math.sqrt(Math.max(0, L2 - d2));
          const dirFor = (s: number): Atom3DPose => {
            const len = Math.hypot(dx, dy, s * dz) || 1;
            return { x: dx / len, y: dy / len, z: (s * dz) / len };
          };
          const scorePlus = crowding(rootId, root, dirFor(1));
          const scoreMinus = crowding(rootId, root, dirFor(-1));
          let sign: number;
          if (Math.abs(scorePlus - scoreMinus) < 1e-3) {
            sign = batchSign || 1;
          } else {
            sign = scorePlus < scoreMinus ? 1 : -1;
          }
          if (batchSign === 0) batchSign = sign;
          z = root.z + sign * dz;
        }
      }
      positions[id] = { x: a.x, y: a.y, z };
      pending.delete(id);
      progress = true;
    }
  }

  // Detached atoms (no posed neighbour at all): depth near the roots / mid-depth.
  if (pending.size > 0) {
    const z = midPerspectiveZ(pose, nearAtomIds);
    for (const id of pending) {
      const a = byId.get(id)!;
      positions[id] = { x: a.x, y: a.y, z };
    }
  }
  return { ...mol, perspective3D: { ...pose, positions } };
};
