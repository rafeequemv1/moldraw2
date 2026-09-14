/**
 * Aromaticity perception and kekulization.
 *
 * - `kekulize`: takes aromatic-flagged bonds (e.g. from SMILES lowercase atoms)
 *   and assigns an explicit alternating single/double (Kekulé) pattern via a
 *   backtracking maximum matching, then clears the aromatic flags. This is what
 *   the editor wants: real double bonds it can draw and validate.
 * - `perceiveAromaticity`: the reverse — inspects a Kekulé structure ring by
 *   ring (over SSSR) and flags rings that satisfy a Hückel 4n+2 π-electron
 *   count with sp2 members. Common cases: benzene, pyridine, pyrrole, furan,
 *   thiophene, imidazole, naphthalene, indole.
 */
import type { Bond, Molecule } from '@moldraw/domain';
import { buildGraph, type MoleculeGraph } from '../graph';
import { perceiveRings } from './rings';

const AROMATIC_LONE_PAIR_DONORS = new Set(['O', 'S', 'Se']);

/** Whether an aromatic atom needs to receive one ring double bond (matching). */
const needsRingDouble = (
  g: MoleculeGraph,
  atomId: string,
): boolean => {
  const node = g.nodes.get(atomId);
  if (!node) return false;
  const atom = node.atom;
  const el = atom.element;
  const charge = atom.charge ?? 0;

  // Already satisfied by an exocyclic (non-aromatic) double/triple bond.
  for (const bid of node.bonds) {
    const b = g.bondById.get(bid);
    if (b && !b.aromatic && b.order >= 2) return false;
  }

  if (AROMATIC_LONE_PAIR_DONORS.has(el)) return false; // furan O / thiophene S
  if (el === 'C' || el === 'Si') {
    return charge >= 0; // carbanion donates its lone pair (e.g. cyclopentadienyl)
  }
  if (el === 'N' || el === 'P') {
    if (charge > 0) return true; // pyridinium-type
    // pyrrole-type (has H/substituent → degree 3) donates; pyridine-type needs double
    return node.neighbors.length < 3;
  }
  return true;
};

/** Backtracking perfect/max matching over aromatic bonds among participants. */
const matchAromaticDoubles = (
  aromaticBonds: Bond[],
  participants: Set<string>,
): Set<string> => {
  // adjacency of participants via aromatic bonds
  const adj = new Map<string, { atom: string; bondId: string }[]>();
  for (const p of participants) adj.set(p, []);
  for (const b of aromaticBonds) {
    if (participants.has(b.fromAtomId) && participants.has(b.toAtomId)) {
      adj.get(b.fromAtomId)!.push({ atom: b.toAtomId, bondId: b.id });
      adj.get(b.toAtomId)!.push({ atom: b.fromAtomId, bondId: b.id });
    }
  }
  const matchedPartner = new Map<string, string>();
  const chosenBondIds = new Set<string>();

  const unmatched = (): string | null => {
    let best: string | null = null;
    let bestOpts = Infinity;
    for (const p of participants) {
      if (matchedPartner.has(p)) continue;
      const opts = (adj.get(p) ?? []).filter(o => !matchedPartner.has(o.atom)).length;
      if (opts < bestOpts) {
        bestOpts = opts;
        best = p;
      }
    }
    return best;
  };

  const solve = (): boolean => {
    const u = unmatched();
    if (u === null) return true; // all matched
    const opts = (adj.get(u) ?? []).filter(o => !matchedPartner.has(o.atom));
    for (const o of opts) {
      matchedPartner.set(u, o.atom);
      matchedPartner.set(o.atom, u);
      chosenBondIds.add(o.bondId);
      if (solve()) return true;
      matchedPartner.delete(u);
      matchedPartner.delete(o.atom);
      chosenBondIds.delete(o.bondId);
    }
    return false;
  };

  if (!solve()) {
    // No perfect matching — greedily place as many doubles as possible.
    chosenBondIds.clear();
    matchedPartner.clear();
    for (const b of aromaticBonds) {
      if (
        participants.has(b.fromAtomId) &&
        participants.has(b.toAtomId) &&
        !matchedPartner.has(b.fromAtomId) &&
        !matchedPartner.has(b.toAtomId)
      ) {
        matchedPartner.set(b.fromAtomId, b.toAtomId);
        matchedPartner.set(b.toAtomId, b.fromAtomId);
        chosenBondIds.add(b.id);
      }
    }
  }
  return chosenBondIds;
};

export const kekulize = (mol: Molecule): Molecule => {
  const aromaticBonds = mol.bonds.filter(b => b.aromatic);
  if (aromaticBonds.length === 0) return mol;

  const g = buildGraph(mol);
  const aromaticAtomIds = new Set<string>();
  for (const b of aromaticBonds) {
    aromaticAtomIds.add(b.fromAtomId);
    aromaticAtomIds.add(b.toAtomId);
  }
  const participants = new Set<string>();
  for (const id of aromaticAtomIds) {
    if (needsRingDouble(g, id)) participants.add(id);
  }

  const doubleBondIds = matchAromaticDoubles(aromaticBonds, participants);

  const bonds = mol.bonds.map(b => {
    if (!b.aromatic) return b;
    const next: Bond = { ...b, order: doubleBondIds.has(b.id) ? 2 : 1 };
    delete next.aromatic;
    return next;
  });
  return { ...mol, bonds };
};

export const perceiveAromaticity = (mol: Molecule): Molecule => {
  const g = buildGraph(mol);
  const rings = perceiveRings(mol);
  const aromaticBondIds = new Set<string>();

  for (const ring of rings) {
    if (ring.size < 5 || ring.size > 7) continue;
    const ringAtoms = new Set(ring.atomIds);
    let piElectrons = 0;
    let sp2Ok = true;
    let ringDoubleBonds = 0;
    const atomHasRingDouble = new Set<string>();

    for (const bid of ring.bondIds) {
      const b = g.bondById.get(bid);
      if (b && b.order === 2) {
        ringDoubleBonds++;
        atomHasRingDouble.add(b.fromAtomId);
        atomHasRingDouble.add(b.toAtomId);
      }
    }
    piElectrons += ringDoubleBonds * 2;

    for (const aid of ring.atomIds) {
      if (atomHasRingDouble.has(aid)) continue;
      const node = g.nodes.get(aid);
      if (!node) {
        sp2Ok = false;
        break;
      }
      const el = node.atom.element;
      const charge = node.atom.charge ?? 0;
      // exocyclic double? (sp2 carbonyl-like — contributes 0 π, still planar)
      let exoDouble = false;
      for (const bid of node.bonds) {
        const b = g.bondById.get(bid);
        if (b && b.order === 2 && !(ringAtoms.has(b.fromAtomId) && ringAtoms.has(b.toAtomId))) {
          exoDouble = true;
        }
      }
      if (exoDouble) continue;
      if (AROMATIC_LONE_PAIR_DONORS.has(el) || el === 'N' || el === 'P') {
        piElectrons += 2; // heteroatom lone-pair donor
      } else if ((el === 'C' || el === 'Si') && charge < 0) {
        piElectrons += 2; // carbanion
      } else if ((el === 'C' || el === 'Si') && ringDoubleBonds > 0) {
        // Kekulé sp² partner carbon — π count already from ring doubles.
        continue;
      } else {
        sp2Ok = false; // sp3 center breaks the ring
        break;
      }
    }

    const allCarbon = ring.atomIds.every(id => g.atomById.get(id)?.element === 'C');
    if (
      sp2Ok &&
      piElectrons >= 2 &&
      (piElectrons - 2) % 4 === 0 &&
      !(allCarbon && piElectrons < ring.size)
    ) {
      for (const bid of ring.bondIds) aromaticBondIds.add(bid);
    }
  }

  if (aromaticBondIds.size === 0) return mol;
  const bonds = mol.bonds.map(b => (aromaticBondIds.has(b.id) ? { ...b, aromatic: true } : b));
  return { ...mol, bonds };
};
