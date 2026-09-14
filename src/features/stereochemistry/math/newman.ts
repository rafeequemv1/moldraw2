import type { Molecule } from '@moldraw/domain';
import type { NewmanHint, NewmanProjectionData } from '../types';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Mol3DAtom {
  pos: Vec3;
  element: string;
}

export interface Mol3DBond {
  from: string;
  to: string;
  order: number;
}

export interface Mol3D {
  atoms: Map<string, Mol3DAtom>;
  bonds: Mol3DBond[];
  hydrogensByHeavy: Map<string, string[]>;
}

const norm2pi = (a: number): number => {
  let t = a % (Math.PI * 2);
  if (t < 0) t += Math.PI * 2;
  return t;
};

const sub3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot3 = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross3 = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const len3 = (v: Vec3): number => Math.hypot(v.x, v.y, v.z);
const normalize3 = (v: Vec3): Vec3 | null => {
  const len = len3(v);
  if (len < 1e-8) return null;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
};

const projectPerpendicular = (vec: Vec3, axis: Vec3): Vec3 => {
  const d = dot3(vec, axis);
  return { x: vec.x - axis.x * d, y: vec.y - axis.y * d, z: vec.z - axis.z * d };
};

const extractBondParity = (raw: unknown, bondIndex?: number): string | undefined => {
  if (bondIndex == null) return undefined;
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  const arrCandidates = ['bondStereoTags', 'bonds', 'bond_tags', 'bondTags']
    .map(k => obj[k])
    .filter(Array.isArray) as unknown[][];
  for (const arr of arrCandidates) {
    for (const it of arr) {
      if (!it || typeof it !== 'object') continue;
      const row = it as Record<string, unknown>;
      const idx = Number(row.bondIndex ?? row.bondIdx ?? row.idx ?? row.index);
      if (!Number.isFinite(idx) || idx !== bondIndex) continue;
      const tag =
        String(row.cipCode ?? row.cip ?? row.stereo ?? row.tag ?? row.label ?? '')
          .trim()
          .toUpperCase();
      if (tag) return tag;
    }
  }
  return undefined;
};

const extractAtomParity = (raw: unknown, atomIndex?: number): string | undefined => {
  if (atomIndex == null || atomIndex < 0) return undefined;
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  const arrCandidates = ['atomStereoTags', 'atoms', 'atom_tags', 'atomTags']
    .map(k => obj[k])
    .filter(Array.isArray) as unknown[][];
  for (const arr of arrCandidates) {
    for (const it of arr) {
      if (!it || typeof it !== 'object') continue;
      const row = it as Record<string, unknown>;
      const idx = Number(row.atomIndex ?? row.atomIdx ?? row.idx ?? row.index);
      if (!Number.isFinite(idx) || idx !== atomIndex) continue;
      const tag =
        String(row.cipCode ?? row.cip ?? row.stereo ?? row.tag ?? row.label ?? '')
          .trim()
          .toUpperCase();
      if (tag) return tag;
    }
  }
  return undefined;
};

export interface NewmanBasis {
  origin: Vec3;
  axis: Vec3;
  u: Vec3;
  v: Vec3;
}

export const buildNewmanBasisFromMol3D = (
  mol: Molecule,
  frontId: string,
  backId: string,
  mol3d: Mol3D,
): NewmanBasis | null => {
  const front = mol3d.atoms.get(frontId);
  const back = mol3d.atoms.get(backId);
  if (!front || !back) return null;
  const axis = normalize3(sub3(back.pos, front.pos));
  if (!axis) return null;

  const heavyNeighborIds = mol.bonds
    .map(b => (b.fromAtomId === frontId ? b.toAtomId : b.toAtomId === frontId ? b.fromAtomId : null))
    .filter((id): id is string => Boolean(id && id !== backId));

  let u: Vec3 | null = null;
  for (const id of heavyNeighborIds) {
    const entry = mol3d.atoms.get(id);
    if (!entry) continue;
    u = normalize3(projectPerpendicular(sub3(entry.pos, front.pos), axis));
    if (u) break;
  }
  if (!u) {
    for (const hid of mol3d.hydrogensByHeavy.get(frontId) ?? []) {
      const entry = mol3d.atoms.get(hid);
      if (!entry) continue;
      u = normalize3(projectPerpendicular(sub3(entry.pos, front.pos), axis));
      if (u) break;
    }
  }
  if (!u) {
    const fallback: Vec3 = Math.abs(axis.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
    u = normalize3(cross3(fallback, axis));
  }
  if (!u) return null;
  const v = normalize3(cross3(axis, u));
  if (!v) return null;
  return { origin: front.pos, axis, u, v };
};

export const projectOntoBasis = (basis: NewmanBasis, pos: Vec3): { x: number; y: number; axial: number } => {
  const vec = sub3(pos, basis.origin);
  return {
    x: dot3(vec, basis.u),
    y: dot3(vec, basis.v),
    axial: dot3(vec, basis.axis),
  };
};

export const buildNewmanProjection = (
  mol: Molecule,
  frontAtomId: string,
  backAtomId: string,
  mol3d: Mol3D,
  opts?: { bondIndex?: number; cipStereoTags?: unknown; basis?: NewmanBasis },
): NewmanProjectionData | null => {
  const front = mol.atoms.find(a => a.id === frontAtomId);
  const back = mol.atoms.find(a => a.id === backAtomId);
  if (!front || !back) return null;

  const frontEntry = mol3d.atoms.get(frontAtomId);
  const backEntry = mol3d.atoms.get(backAtomId);
  if (!frontEntry || !backEntry) return null;

  const basis = opts?.basis ?? buildNewmanBasisFromMol3D(mol, frontAtomId, backAtomId, mol3d);
  if (!basis) return null;

  const projectAngle = (centerPos: Vec3, atomPos: Vec3): number => {
    const proj = projectOntoBasis(basis, atomPos);
    const center = projectOntoBasis(basis, centerPos);
    return norm2pi(Math.atan2(proj.y - center.y, proj.x - center.x));
  };

  const heavyNeighborIds = (id: string, exclude: string): string[] =>
    mol.bonds
      .map(b => (b.fromAtomId === id ? b.toAtomId : b.toAtomId === id ? b.fromAtomId : null))
      .filter((nid): nid is string => Boolean(nid && nid !== exclude));

  const buildHints = (centerId: string, centerPos: Vec3, heavyIds: string[]): NewmanHint[] => {
    const hints: NewmanHint[] = [];
    for (const id of heavyIds) {
      const entry = mol3d.atoms.get(id);
      if (!entry) continue;
      const atom = mol.atoms.find(a => a.id === id);
      hints.push({
        atomId: id,
        label: atom?.alias?.trim() || atom?.element || entry.element,
        angleRad: projectAngle(centerPos, entry.pos),
      });
    }
    for (const hid of mol3d.hydrogensByHeavy.get(centerId) ?? []) {
      const entry = mol3d.atoms.get(hid);
      if (!entry) continue;
      hints.push({
        atomId: hid,
        label: 'H',
        angleRad: projectAngle(centerPos, entry.pos),
      });
    }
    return hints.sort((a, b) => a.angleRad - b.angleRad);
  };

  const frontHints = buildHints(frontAtomId, frontEntry.pos, heavyNeighborIds(frontAtomId, backAtomId));
  const backHints = buildHints(backAtomId, backEntry.pos, heavyNeighborIds(backAtomId, frontAtomId));

  const bondParity = extractBondParity(opts?.cipStereoTags, opts?.bondIndex);
  const frontParity = extractAtomParity(opts?.cipStereoTags, mol.atoms.findIndex(a => a.id === frontAtomId));
  const backParity = extractAtomParity(opts?.cipStereoTags, mol.atoms.findIndex(a => a.id === backAtomId));

  return {
    frontAtomId,
    backAtomId,
    frontElement: front.element,
    backElement: back.element,
    frontHints,
    backHints,
    cipParityHint: ['3D', bondParity, frontParity, backParity].filter(Boolean).join(' / ') || undefined,
  };
};
