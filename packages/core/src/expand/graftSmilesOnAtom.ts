/**
 * Graft a SMILES fragment onto a labeled atom for 3D alias expansion.
 *
 * - `merge-first`: fragment.atoms[0] is identified with the labeled atom (Ph, COOH…).
 * - `bond-to-labeled`: single bond from labeled atom → fragment.atoms[0] (Et, Bn, Boc…).
 *
 * New atoms are laid out along the outward ray from the labeled atom so the 3D
 * seed is not a pile-up at the origin; UFF then refines.
 */

import type { Atom, Bond, Molecule } from '@moldraw/domain';
import { kekulize, parseSmilesToMolecule } from '@moldraw/engine';
import type { AliasAttachMode } from './aliasToSmiles';

const BL = 40;

const outwardDir = (
  mol: Molecule,
  atomId: string,
): { x: number; y: number } => {
  const a = mol.atoms.find(x => x.id === atomId);
  if (!a) return { x: 1, y: 0 };
  let vx = 0;
  let vy = 0;
  let n = 0;
  for (const b of mol.bonds) {
    if (b.fromAtomId !== atomId && b.toAtomId !== atomId) continue;
    const oid = b.fromAtomId === atomId ? b.toAtomId : b.fromAtomId;
    const o = mol.atoms.find(x => x.id === oid);
    if (!o) continue;
    vx += a.x - o.x;
    vy += a.y - o.y;
    n++;
  }
  if (n === 0) return { x: 1, y: 0 };
  const len = Math.hypot(vx, vy);
  if (len < 1e-6) return { x: 1, y: 0 };
  return { x: vx / len, y: vy / len };
};

const layoutNewAtoms = (
  mol: Molecule,
  anchorId: string,
  newIds: Set<string>,
  u: { x: number; y: number },
): void => {
  const perp = { x: -u.y, y: u.x };
  const anchor = mol.atoms.find(a => a.id === anchorId);
  if (!anchor) return;

  // BFS depths among new atoms (+ anchor at 0)
  const depth = new Map<string, number>();
  depth.set(anchorId, 0);
  const q = [anchorId];
  while (q.length) {
    const cur = q.shift()!;
    const d = depth.get(cur) ?? 0;
    for (const b of mol.bonds) {
      if (b.fromAtomId !== cur && b.toAtomId !== cur) continue;
      const oid = b.fromAtomId === cur ? b.toAtomId : b.fromAtomId;
      if (!newIds.has(oid) || depth.has(oid)) continue;
      depth.set(oid, d + 1);
      q.push(oid);
    }
  }

  // Group siblings at same depth for lateral spread
  const byDepth = new Map<number, string[]>();
  for (const [id, d] of depth) {
    if (!newIds.has(id)) continue;
    const arr = byDepth.get(d) ?? [];
    arr.push(id);
    byDepth.set(d, arr);
  }

  for (const [d, ids] of byDepth) {
    ids.forEach((id, i) => {
      const atom = mol.atoms.find(a => a.id === id);
      if (!atom) return;
      const spread = ids.length === 1 ? 0 : (i - (ids.length - 1) / 2) * (BL * 0.55);
      atom.x = anchor.x + u.x * BL * d + perp.x * spread;
      atom.y = anchor.y + u.y * BL * d + perp.y * spread;
    });
  }
};

const mkId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`;

/**
 * Apply SMILES fragment onto `atomId`. Mutates a shallow-copied molecule.
 * Returns null if SMILES parse/graft fails.
 */
export const graftSmilesOnAtom = (
  mol: Molecule,
  atomId: string,
  smiles: string,
  attach: AliasAttachMode,
): Molecule | null => {
  if (attach === 'clear' || !smiles.trim()) {
    return {
      ...mol,
      atoms: mol.atoms.map(a =>
        a.id === atomId ? { ...a, alias: undefined } : { ...a },
      ),
      bonds: mol.bonds.map(b => ({ ...b })),
    };
  }

  let parsed: Molecule;
  try {
    parsed = parseSmilesToMolecule(smiles.trim());
  } catch {
    return null;
  }
  if (parsed.atoms.length === 0) return null;
  // A single-atom fragment ("N" for an NH2 alias) has nothing to kekulize.
  // Keep the parsed graph if kekulize throws — dropping it leaves a plain carbon.
  let frag = parsed;
  try {
    frag = kekulize(parsed);
  } catch {
    frag = parsed;
  }

  const next: Molecule = {
    ...mol,
    atoms: mol.atoms.map(a => ({ ...a })),
    bonds: mol.bonds.map(b => ({ ...b })),
  };
  const labeled = next.atoms.find(a => a.id === atomId);
  if (!labeled) return null;

  const idMap = new Map<string, string>();
  const newIds = new Set<string>();
  const first = frag.atoms[0]!;

  if (attach === 'merge-first') {
    idMap.set(first.id, labeled.id);
    // Keep labeled element if fragment first is C/c and labeled is C; else take fragment element
    if (labeled.element.toUpperCase() === 'C' && first.element.toUpperCase() === 'C') {
      // keep C
    } else if (labeled.element.toUpperCase() === first.element.toUpperCase()) {
      // keep
    } else {
      // Prefer fragment element when merging onto matching chemistry (rare mismatch)
      labeled.element = first.element;
    }
    labeled.alias = undefined;
    if (first.charge) labeled.charge = first.charge;

    for (let i = 1; i < frag.atoms.length; i++) {
      const fa = frag.atoms[i]!;
      const id = mkId('x');
      idMap.set(fa.id, id);
      newIds.add(id);
      const na: Atom = {
        id,
        element: fa.element,
        x: labeled.x,
        y: labeled.y,
        charge: fa.charge ?? 0,
        ...(fa.isotope ? { isotope: fa.isotope } : {}),
      };
      next.atoms.push(na);
    }
  } else {
    // bond-to-labeled
    labeled.alias = undefined;
    for (const fa of frag.atoms) {
      const id = mkId('x');
      idMap.set(fa.id, id);
      newIds.add(id);
      next.atoms.push({
        id,
        element: fa.element,
        x: labeled.x,
        y: labeled.y,
        charge: fa.charge ?? 0,
        ...(fa.isotope ? { isotope: fa.isotope } : {}),
      });
    }
  }

  const mapId = (id: string) => idMap.get(id) ?? id;

  for (const fb of frag.bonds) {
    const b: Bond = {
      id: mkId('b'),
      fromAtomId: mapId(fb.fromAtomId),
      toAtomId: mapId(fb.toAtomId),
      order: fb.order,
      ...(fb.aromatic ? { aromatic: true } : {}),
      ...(fb.stereo ? { stereo: fb.stereo } : {}),
    };
    next.bonds.push(b);
  }

  if (attach === 'bond-to-labeled') {
    const firstNew = idMap.get(first.id);
    if (!firstNew) return null;
    next.bonds.push({
      id: mkId('b'),
      fromAtomId: labeled.id,
      toAtomId: firstNew,
      order: 1,
    });
  }

  const u = outwardDir(next, labeled.id);
  layoutNewAtoms(next, labeled.id, newIds, u);

  try {
    return kekulize(next);
  } catch {
    return next;
  }
};
