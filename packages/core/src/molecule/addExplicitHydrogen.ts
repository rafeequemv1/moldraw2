/**
 * Add real H atoms (with bonds) to selected heavy atoms — teaching aid for
 * showing aldehyde H, methyl / cyclohexane hydrogens, etc.
 *
 * Tagged chair/boat rings use textbook 2D placement:
 *   - axial / flagpole H → exact vertical
 *   - geminal partner → outward equatorial (not stacked on C–C bonds)
 */
import type { Atom, Bond, Molecule } from '@moldraw/domain';
import {
  getEffectiveValencyForImplicitHydrogen,
  getMaxValencyForElement,
  uniqueRingPaths,
} from '@moldraw/domain';
import { addAtom, addBondSafe } from './mutations';

const newId = () => Math.random().toString(36).slice(2, 11);

const TAU = Math.PI * 2;
/** Prefer below-right for teaching diagrams (canvas y grows downward). */
const DEFAULT_EXTEND_ANGLE = Math.PI / 6;
const MIN_GAP_FROM_NEIGHBOR = (22 * Math.PI) / 180;
/** Canvas: y increases downward → up = −π/2, down = +π/2. */
const VERT_UP = -Math.PI / 2;
const VERT_DOWN = Math.PI / 2;
/** Soft preference toward below-right when several gaps are similar. */
const PREFERRED_H_DIR = Math.PI / 6;

const bondOrderSum = (mol: Molecule, atomId: string): number =>
  mol.bonds
    .filter(b => b.fromAtomId === atomId || b.toAtomId === atomId)
    .reduce((s, b) => s + (b.dative ? 0 : b.order), 0);

const implicitHCount = (mol: Molecule, atom: Atom): number => {
  if (atom.element === 'H') return 0;
  if (atom.alias?.trim()) return 0;
  // Boron hydrides: fill to drawing max (4) so BH4− can be expanded even
  // before charge is set. Other elements keep implicit-H (BH3-style) caps.
  const max =
    atom.element === 'B'
      ? getMaxValencyForElement(atom.element, atom.charge || 0)
      : getEffectiveValencyForImplicitHydrogen(atom.element, atom.charge || 0);
  return Math.max(0, max - bondOrderSum(mol, atom.id));
};

const isCyanideGroupAlias = (alias?: string): boolean =>
  /^C(?:N|≡N|#N)$/i.test(alias?.trim() ?? '');

const isHcnGroupAlias = (alias?: string): boolean =>
  /^HC(?:N|≡N|#N)$/i.test(alias?.trim() ?? '');

/**
 * Isolated CN / HCN label (no heavy-atom bonds): add a real H–C bond and keep
 * the cyanide as a CN label — teaching “H–CN”, not a condensed HCN string.
 * R–CN substituents are left alone.
 */
const attachExplicitHToIsolatedCyanideLabel = (
  mol: Molecule,
  atom: Atom,
  bondLengthPx: number,
): Molecule | null => {
  if (atom.element !== 'C') return null;
  const alias = atom.alias?.trim() ?? '';
  if (!isCyanideGroupAlias(alias) && !isHcnGroupAlias(alias)) return null;

  const bonds = mol.bonds.filter(b => b.fromAtomId === atom.id || b.toAtomId === atom.id);
  for (const b of bonds) {
    const nid = b.fromAtomId === atom.id ? b.toAtomId : b.fromAtomId;
    const n = mol.atoms.find(a => a.id === nid);
    if (n?.element === 'H') return null;
    if (n && n.element !== 'H') return null;
  }

  let next = mol;
  if (isHcnGroupAlias(alias) || (atom.charge || 0) === -1) {
    next = {
      ...next,
      atoms: next.atoms.map(a =>
        a.id === atom.id
          ? {
              ...a,
              alias: 'CN',
              charge: 0,
              lonePairs: 0,
            }
          : a,
      ),
    };
  }

  const c = next.atoms.find(a => a.id === atom.id) ?? atom;
  const hx = c.x - bondLengthPx;
  const hy = c.y;
  const hId = newId();
  const withAtom = addAtom(next, { id: hId, element: 'H', x: hx, y: hy, charge: 0 });
  const withBond = addBondSafe(withAtom, {
    id: newId(),
    fromAtomId: atom.id,
    toAtomId: hId,
    order: 1,
  });
  return withBond === withAtom ? null : withBond;
};

/** Terminal C≡N (often cyanide). Neutralize C⁻ so a bonded H can be added. */
const isTerminalNitrileCarbon = (mol: Molecule, atom: Atom): boolean => {
  if (atom.element !== 'C') return false;
  const bonds = mol.bonds.filter(b => b.fromAtomId === atom.id || b.toAtomId === atom.id);
  if (bonds.length !== 1) return false;
  const b = bonds[0]!;
  if ((b.dative ? 0 : b.order) !== 3) return false;
  const nid = b.fromAtomId === atom.id ? b.toAtomId : b.fromAtomId;
  return mol.atoms.find(a => a.id === nid)?.element === 'N';
};

const normAngle = (a: number) => {
  let x = a % TAU;
  if (x < 0) x += TAU;
  return x;
};

const angleDiff = (a: number, b: number): number => {
  let d = Math.abs(normAngle(a) - normAngle(b));
  if (d > Math.PI) d = TAU - d;
  return d;
};

const snapAngleToStepRad = (rad: number, stepRad: number): number => {
  if (stepRad < 1e-9) return rad;
  return Math.round(rad / stepRad) * stepRad;
};

type NeighborRay = { id: string; element: string; angle: number };

const neighborRays = (mol: Molecule, atomId: string): NeighborRay[] => {
  const atom = mol.atoms.find(a => a.id === atomId);
  if (!atom) return [];
  const out: NeighborRay[] = [];
  for (const b of mol.bonds) {
    const neighborId =
      b.fromAtomId === atomId ? b.toAtomId : b.toAtomId === atomId ? b.fromAtomId : null;
    if (!neighborId) continue;
    const neighbor = mol.atoms.find(a => a.id === neighborId);
    if (!neighbor) continue;
    const dx = neighbor.x - atom.x;
    const dy = neighbor.y - atom.y;
    if (Math.hypot(dx, dy) < 1e-6) continue;
    out.push({ id: neighbor.id, element: neighbor.element, angle: Math.atan2(dy, dx) });
  }
  return out;
};

const lockedConformationKind = (
  mol: Molecule,
  atomId: string,
): 'chair' | 'boat' | null => {
  const conf = mol.ringConformations;
  if (!conf) return null;
  for (const [sig, kind] of Object.entries(conf)) {
    if (kind !== 'chair' && kind !== 'boat') continue;
    if (sig.split('\0').filter(Boolean).includes(atomId)) return kind;
  }
  return null;
};

const ringIdsForAtom = (mol: Molecule, atomId: string): string[] | null => {
  const conf = mol.ringConformations;
  if (conf) {
    for (const [sig, kind] of Object.entries(conf)) {
      if (kind !== 'chair' && kind !== 'boat') continue;
      const ids = sig.split('\0').filter(Boolean);
      if (ids.includes(atomId)) return ids;
    }
  }
  const rings = uniqueRingPaths(mol).filter(r => r.includes(atomId) && r.length === 6);
  if (rings.length === 0) return null;
  rings.sort((a, b) => a.length - b.length);
  return rings[0] ?? null;
};

const ringCentroid = (mol: Molecule, ringIds: string[]): { x: number; y: number } | null => {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const id of ringIds) {
    const a = mol.atoms.find(x => x.id === id);
    if (!a) continue;
    sx += a.x;
    sy += a.y;
    n += 1;
  }
  if (n === 0) return null;
  return { x: sx / n, y: sy / n };
};

const clearOfHeavies = (ang: number, heavyAngles: number[]): boolean =>
  heavyAngles.every(h => angleDiff(ang, h) >= MIN_GAP_FROM_NEIGHBOR);

/**
 * Outward equatorial (~30° from horizontal).
 * Opposite vertical sense from axial: axial up → eq down-out; axial down → eq up-out.
 */
const outwardEquatorialAngle = (
  atom: Atom,
  center: { x: number; y: number },
  axial: number,
): number => {
  const left = atom.x <= center.x;
  const axialUp = angleDiff(axial, VERT_UP) <= angleDiff(axial, VERT_DOWN);
  if (left) {
    // Axial up → down-left (150°); axial down → up-left (210°).
    return axialUp ? (Math.PI * 5) / 6 : (Math.PI * 7) / 6;
  }
  // Axial down → up-right (−30°); axial up → down-right (+30°) — chair right tip needs up-right.
  return axialUp ? Math.PI / 6 : -Math.PI / 6;
};

type GeminalPair = { axial: number; equatorial: number };

/**
 * Textbook geminal directions for a chair/boat ring carbon (exactly 2 heavy neighbors).
 */
const chairBoatGeminalPair = (
  mol: Molecule,
  atom: Atom,
  kind: 'chair' | 'boat',
  heavyAngles: number[],
): GeminalPair | null => {
  const ringIds = ringIdsForAtom(mol, atom.id);
  if (!ringIds || ringIds.length < 6) return null;
  const center = ringCentroid(mol, ringIds);
  if (!center) return null;

  const ys = ringIds
    .map(id => mol.atoms.find(a => a.id === id)?.y)
    .filter((y): y is number => y != null);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = Math.max(1e-6, maxY - minY);
  const isBoatPeak = kind === 'boat' && atom.y <= minY + span * 0.30;

  let axial: number;
  let equatorial: number;

  if (isBoatPeak) {
    // Flagpoles: always vertical up; equatorial out to the side (not along C–C).
    axial = VERT_UP;
    equatorial = outwardEquatorialAngle(atom, center, axial);
  } else if (kind === 'boat') {
    // Gunwale / floor: axial vertical (down on bottom row, else up if clear).
    const onBottom = atom.y >= maxY - span * 0.30;
    axial = onBottom ? VERT_DOWN : VERT_UP;
    if (!clearOfHeavies(axial, heavyAngles)) {
      axial = axial === VERT_UP ? VERT_DOWN : VERT_UP;
    }
    if (!clearOfHeavies(axial, heavyAngles)) {
      // Last resort: bisect the larger gap between C–C bonds.
      const a0 = normAngle(heavyAngles[0]!);
      const a1 = normAngle(heavyAngles[1]!);
      const lo = Math.min(a0, a1);
      const hi = Math.max(a0, a1);
      const small = hi - lo;
      const largeMid = normAngle(hi + (lo + TAU - hi) / 2);
      const smallMid = normAngle(lo + small / 2);
      axial = lo + TAU - hi >= small ? largeMid : smallMid;
    }
    equatorial = outwardEquatorialAngle(atom, center, axial);
    if (angleDiff(equatorial, axial) < MIN_GAP_FROM_NEIGHBOR) {
      equatorial = normAngle(axial + Math.PI);
    }
  } else {
    // Chair: left tip axial up, right tip axial down (ChemDraw-style).
    axial = atom.x < center.x ? VERT_UP : VERT_DOWN;
    if (!clearOfHeavies(axial, heavyAngles)) {
      axial = axial === VERT_UP ? VERT_DOWN : VERT_UP;
    }
    // Right tip: axial down → equatorial up-right (−30°), not down-right.
    equatorial = outwardEquatorialAngle(atom, center, axial);
    if (!clearOfHeavies(equatorial, heavyAngles) || angleDiff(equatorial, axial) < MIN_GAP_FROM_NEIGHBOR) {
      equatorial = atom.x < center.x ? (Math.PI * 7) / 6 : -Math.PI / 6;
    }
  }

  // Keep equatorial off ring bonds.
  if (!clearOfHeavies(equatorial, heavyAngles)) {
    const outward = Math.atan2(atom.y - center.y, atom.x - center.x);
    equatorial = outward;
    if (!clearOfHeavies(equatorial, heavyAngles)) {
      equatorial = normAngle(outward + Math.PI);
    }
  }

  return { axial, equatorial };
};

const computeChairBoatHydrogenAngle = (mol: Molecule, atomId: string): number | null => {
  const kind = lockedConformationKind(mol, atomId);
  if (!kind) return null;
  const atom = mol.atoms.find(a => a.id === atomId);
  if (!atom || atom.element !== 'C') return null;

  const rays = neighborRays(mol, atomId);
  const heavy = rays.filter(r => r.element !== 'H');
  const hydrogens = rays.filter(r => r.element === 'H');
  if (heavy.length !== 2) return null;

  const pair = chairBoatGeminalPair(
    mol,
    atom,
    kind,
    heavy.map(h => h.angle),
  );
  if (!pair) return null;

  const { axial, equatorial } = pair;
  const free = (ang: number) =>
    hydrogens.every(h => angleDiff(h.angle, ang) >= MIN_GAP_FROM_NEIGHBOR) &&
    clearOfHeavies(ang, heavy.map(h => h.angle));

  if (hydrogens.length === 0) {
    if (free(axial)) return axial;
    if (free(equatorial)) return equatorial;
    return axial;
  }

  const existing = hydrogens[0]!.angle;
  const existingIsAxial = angleDiff(existing, axial) <= angleDiff(existing, equatorial);
  const next = existingIsAxial ? equatorial : axial;
  if (free(next)) return next;
  if (free(existingIsAxial ? axial : equatorial)) return existingIsAxial ? axial : equatorial;
  return next;
};

const ringCentroidForAtom = (
  mol: Molecule,
  atomId: string,
): { x: number; y: number } | null => {
  const ids = ringIdsForAtom(mol, atomId);
  if (!ids) {
    const rings = uniqueRingPaths(mol).filter(r => r.includes(atomId));
    if (rings.length === 0) return null;
    rings.sort((a, b) => a.length - b.length);
    return ringCentroid(mol, rings[0]!);
  }
  return ringCentroid(mol, ids);
};

const verticalScore = (ang: number): number => Math.abs(Math.sin(ang));

/**
 * Next explicit-H direction. Chair/boat axials stay vertical. Chain terminals
 * take the two directions perpendicular to the heavy-atom bond (above/below)
 * instead of opposite the chain (which reads as H₂C).
 */
export function computeNextExplicitHydrogenAngle(
  mol: Molecule,
  atomId: string,
  snapRad: number = Math.PI / 12,
): number {
  const chairBoat = computeChairBoatHydrogenAngle(mol, atomId);
  if (chairBoat != null) return chairBoat;

  const atom = mol.atoms.find(a => a.id === atomId);
  const step = snapRad > 1e-9 ? snapRad : 0;
  if (!atom) return snapAngleToStepRad(DEFAULT_EXTEND_ANGLE, step || Math.PI / 12);

  const rays = neighborRays(mol, atomId);
  const heavy = rays.filter(r => r.element !== 'H');
  const heavyAngles = heavy.map(r => r.angle);
  const occupied = rays.map(r => r.angle);

  const blocked = (ang: number) =>
    occupied.some(a => angleDiff(ang, a) < MIN_GAP_FROM_NEIGHBOR);

  const tryAngle = (raw: number): number | null => {
    let ang = step > 0 ? snapAngleToStepRad(raw, step) : raw;
    if (blocked(ang)) ang = raw;
    return blocked(ang) ? null : ang;
  };

  const candidates: number[] = [];
  if (heavyAngles.length === 0) {
    candidates.push(VERT_UP, VERT_DOWN, DEFAULT_EXTEND_ANGLE, Math.PI);
  } else if (heavyAngles.length === 1) {
    const axis = heavyAngles[0]!;
    const perps = [normAngle(axis + Math.PI / 2), normAngle(axis - Math.PI / 2)].sort(
      (a, b) => verticalScore(b) - verticalScore(a),
    );
    candidates.push(...perps, normAngle(axis + Math.PI));
  } else {
    const sorted = [...occupied].map(normAngle).sort((a, b) => a - b);
    type Gap = { mid: number; size: number; outward: number };
    const gaps: Gap[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i]!;
      const b = i + 1 < sorted.length ? sorted[i + 1]! : sorted[0]! + TAU;
      const size = b - a;
      gaps.push({ mid: normAngle(a + size / 2), size, outward: 0 });
    }
    const center = ringCentroidForAtom(mol, atomId);
    if (center) {
      const vx = atom.x - center.x;
      const vy = atom.y - center.y;
      const vlen = Math.hypot(vx, vy) || 1;
      const ux = vx / vlen;
      const uy = vy / vlen;
      for (const g of gaps) {
        g.outward = Math.cos(g.mid) * ux + Math.sin(g.mid) * uy;
      }
    }
    gaps.sort((a, b) => {
      if (Math.abs(a.size - b.size) > 0.15) return b.size - a.size;
      if (Math.abs(a.outward - b.outward) > 0.08) return b.outward - a.outward;
      const vert = verticalScore(b.mid) - verticalScore(a.mid);
      if (Math.abs(vert) > 0.08) return vert;
      return angleDiff(a.mid, PREFERRED_H_DIR) - angleDiff(b.mid, PREFERRED_H_DIR);
    });
    for (const g of gaps) candidates.push(g.mid);
    candidates.push(VERT_UP, VERT_DOWN);
  }

  for (const raw of candidates) {
    const hit = tryAngle(raw);
    if (hit != null) return hit;
  }

  return snapAngleToStepRad(DEFAULT_EXTEND_ANGLE, step || Math.PI / 12);
}

export interface AddExplicitHydrogensOptions {
  atomIds: string[];
  bondLengthPx: number;
  maxPerAtom?: number;
  bondAngleSnapRad?: number;
}

export function addExplicitHydrogensToAtoms(
  prev: Molecule,
  opts: AddExplicitHydrogensOptions,
): Molecule {
  const { atomIds, bondLengthPx } = opts;
  if (atomIds.length === 0) return prev;
  const bl = Math.max(12, Math.min(120, Number.isFinite(bondLengthPx) ? bondLengthPx : 40));
  const snap = opts.bondAngleSnapRad ?? Math.PI / 12;
  const maxPer = opts.maxPerAtom == null ? Infinity : Math.max(0, Math.floor(opts.maxPerAtom));
  if (maxPer <= 0) return prev;

  let next = prev;
  let changed = false;
  const targets = [...new Set(atomIds)];

  for (const atomId of targets) {
    let added = 0;
    while (added < maxPer) {
      const atom = next.atoms.find(a => a.id === atomId);
      if (!atom || atom.element === 'H') break;

      const asHcn = attachExplicitHToIsolatedCyanideLabel(next, atom, bl);
      if (asHcn) {
        next = asHcn;
        changed = true;
        break;
      }

      if (implicitHCount(next, atom) <= 0) {
        if (isTerminalNitrileCarbon(next, atom) && (atom.charge || 0) === -1) {
          next = {
            ...next,
            atoms: next.atoms.map(a =>
              a.id === atomId ? { ...a, charge: 0, lonePairs: 0 } : a,
            ),
          };
          changed = true;
          continue;
        }
        break;
      }

      const angle = computeNextExplicitHydrogenAngle(next, atomId, snap);
      if (!Number.isFinite(angle)) break;

      const hx = atom.x + Math.cos(angle) * bl;
      const hy = atom.y + Math.sin(angle) * bl;
      if (!Number.isFinite(hx) || !Number.isFinite(hy)) break;
      // Refuse degenerate placement on top of the parent carbon.
      if (Math.hypot(hx - atom.x, hy - atom.y) < bl * 0.5) break;

      const hId = newId();
      const hAtom: Atom = { id: hId, element: 'H', x: hx, y: hy, charge: 0 };
      const bond: Bond = {
        id: newId(),
        fromAtomId: atomId,
        toAtomId: hId,
        order: 1,
      };
      const withAtom = addAtom(next, hAtom);
      const withBond = addBondSafe(withAtom, bond);
      if (withBond === withAtom) break;
      next = withBond;
      changed = true;
      added += 1;
    }
  }

  return changed ? next : prev;
}
