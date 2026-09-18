import type { Atom, Bond, Molecule } from '@moldraw/domain';
import { normalizeAliasLabelCharacters } from '@moldraw/domain';
import { placeUnbondedNeighbor } from '../molecule/importPlacement';
import { resolveAliasToSmiles } from './aliasToSmiles';
import { graftSmilesOnAtom } from './graftSmilesOnAtom';
import { normalizeCondensedKey } from './condensedFormulaExpand';

const ionId = () => `ion_${Math.random().toString(36).slice(2, 9)}`;
const graftId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`;

/** Left- or right-written hetero groups on carbon → the bonding atom (not H₂). */
const HETERO_ON_CARBON: Record<string, string> = {
  NH2: 'N',
  H2N: 'N',
  OH: 'O',
  HO: 'O',
  SH: 'S',
  HS: 'S',
};

const graftHeteroOnCarbon = (mol: Molecule, carbonId: string, element: string): Molecule => {
  const labeled = mol.atoms.find(a => a.id === carbonId);
  if (!labeled) return mol;
  const id = graftId('fg');
  const heavies: Atom[] = [];
  const hydrogens: Atom[] = [];
  for (const b of mol.bonds) {
    if (b.fromAtomId !== carbonId && b.toAtomId !== carbonId) continue;
    const oid = b.fromAtomId === carbonId ? b.toAtomId : b.fromAtomId;
    const o = mol.atoms.find(a => a.id === oid);
    if (!o) continue;
    if (o.element === 'H') hydrogens.push(o);
    else heavies.push(o);
  }
  let dx = 0;
  let dy = 1;
  if (heavies.length >= 2) {
    const ax = heavies[1]!.x - heavies[0]!.x;
    const ay = heavies[1]!.y - heavies[0]!.y;
    let px = -ay;
    let py = ax;
    const plen = Math.hypot(px, py);
    if (plen > 1e-6) {
      px /= plen;
      py /= plen;
    }
    // Keep N off the chain: sit opposite explicit H, else on the left of the bond.
    if (hydrogens.length > 0) {
      const hx = hydrogens.reduce((s, h) => s + (h.x - labeled.x), 0);
      const hy = hydrogens.reduce((s, h) => s + (h.y - labeled.y), 0);
      if (px * hx + py * hy > 0) {
        px = -px;
        py = -py;
      }
    } else if (px > 0.05) {
      px = -px;
      py = -py;
    }
    dx = px;
    dy = py;
  } else if (heavies.length === 1) {
    const len = Math.hypot(labeled.x - heavies[0]!.x, labeled.y - heavies[0]!.y);
    dx = len > 1e-6 ? (labeled.x - heavies[0]!.x) / len : -1;
    dy = len > 1e-6 ? (labeled.y - heavies[0]!.y) / len : 0;
  }
  const hetero: Atom = {
    id,
    element,
    x: labeled.x + dx * 40,
    y: labeled.y + dy * 40,
    charge: 0,
  };
  const bond: Bond = { id: graftId('b'), fromAtomId: carbonId, toAtomId: id, order: 1 };
  return {
    ...mol,
    atoms: mol.atoms.map(a => (a.id === carbonId ? { ...a, alias: undefined } : a)).concat(hetero),
    bonds: mol.bonds.concat(bond),
  };
};

/**
 * Replace 2D group aliases with explicit atoms/bonds for 3D (and expand-alias).
 *
 * Scalable path — no per-group geometry presets:
 *   1. `resolveAliasToSmiles` maps any text (Ph, CH2CH2COOMe, Boc, …) → SMILES
 *   2. `graftSmilesOnAtom` parses that SMILES with the native engine and grafts
 *      it onto the labeled atom (merge-first or bond-to-labeled)
 *
 * Add new abbreviations by adding a SMILES row in `aliasToSmiles.ts`.
 * Arbitrary condensed text (branches, =/#, repeats) → SMILES via
 * `condensedToSmiles` — no per-string whitelist.
 */
export const expandAliasesFor3D = (mol: Molecule, targetAtomIds?: Set<string>): Molecule => {
  let next: Molecule = {
    ...mol,
    atoms: mol.atoms.map(a => ({ ...a })),
    bonds: mol.bonds.map(b => ({ ...b })),
  };

  const aliases = next.atoms.filter(a => {
    if (!a.alias?.trim()) return false;
    if (!targetAtomIds) return true;
    return targetAtomIds.has(a.id);
  });

  for (const a of aliases) {
    const raw = a.alias?.trim();
    if (!raw) continue;

    // Re-find atom on current molecule (ids stable; object may have been replaced).
    const live = next.atoms.find(x => x.id === a.id);
    if (!live?.alias?.trim()) continue;

    const spec = resolveAliasToSmiles(raw, live.element);
    const key = normalizeCondensedKey(normalizeAliasLabelCharacters(raw));
    if (live.element.toUpperCase() === 'C' && HETERO_ON_CARBON[key]) {
      next = graftHeteroOnCarbon(next, live.id, HETERO_ON_CARBON[key]!);
      continue;
    }
    if (!spec) continue;

    if (spec.attach === 'clear' || !spec.smiles.trim()) {
      live.alias = undefined;
      continue;
    }

    const beforeIds = new Set(next.atoms.map(x => x.id));
    const grafted = graftSmilesOnAtom(next, live.id, spec.smiles, spec.attach);
    if (grafted) next = grafted;
    if (spec.nearbyIon && grafted) {
      const oxide = next.atoms.find(
        x => !beforeIds.has(x.id) && x.element === 'O' && (x.charge ?? 0) === -1,
      );
      const anchor = oxide ?? next.atoms.find(x => x.id === a.id);
      if (anchor) {
        const pos = placeUnbondedNeighbor(next.atoms, anchor);
        const ion: Atom = {
          id: ionId(),
          element: spec.nearbyIon.element,
          x: pos.x,
          y: pos.y,
          charge: spec.nearbyIon.charge,
        };
        next = { ...next, atoms: [...next.atoms, ion] };
      }
    }
  }

  return next;
};
