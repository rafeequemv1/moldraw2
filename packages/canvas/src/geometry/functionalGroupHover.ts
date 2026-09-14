/**
 * Hover targeting: outline the atom, bond, or a small functional group
 * (OH, NH/NH2, COOH, CHO, CON, CN, NO2, CF3, OMe, …) — not the whole molecule.
 */
import type { Atom, Molecule } from '@moldraw/domain';

type Neighbor = { id: string; atom: Atom; order: number };

const adjacency = (mol: Molecule): Map<string, Neighbor[]> => {
  const atomById = new Map(mol.atoms.map(a => [a.id, a]));
  const adj = new Map<string, Neighbor[]>();
  for (const a of mol.atoms) adj.set(a.id, []);
  for (const b of mol.bonds) {
    const from = atomById.get(b.fromAtomId);
    const to = atomById.get(b.toAtomId);
    if (!from || !to) continue;
    const order = b.order === 4 ? 1.5 : b.order;
    adj.get(from.id)!.push({ id: to.id, atom: to, order });
    adj.get(to.id)!.push({ id: from.id, atom: from, order });
  }
  return adj;
};

const heavy = (nbs: Neighbor[]): Neighbor[] => nbs.filter(n => n.atom.element !== 'H');

const isTerminalOxygen = (atom: Atom, nbs: Neighbor[]): boolean =>
  atom.element === 'O' && heavy(nbs).length === 1;

const withExplicitH = (ids: string[], adj: Map<string, Neighbor[]>): string[] => {
  const out = new Set(ids);
  for (const id of ids) {
    for (const n of adj.get(id) ?? []) {
      if (n.atom.element === 'H') out.add(n.id);
    }
  }
  return [...out];
};

const tryCOOH = (
  carbonId: string,
  atomById: Map<string, Atom>,
  adj: Map<string, Neighbor[]>,
): string[] | null => {
  const c = atomById.get(carbonId);
  if (!c || c.element !== 'C') return null;
  const nbs = heavy(adj.get(carbonId) ?? []);
  const oxygens = nbs.filter(n => n.atom.element === 'O');
  const carbonyl = oxygens.find(n => n.order >= 1.5);
  const hydroxyl = oxygens.find(
    n => n !== carbonyl && n.order < 1.5 && isTerminalOxygen(n.atom, adj.get(n.id) ?? []),
  );
  if (!carbonyl || !hydroxyl) return null;
  if (nbs.length > 3) return null;
  return [carbonId, carbonyl.id, hydroxyl.id];
};

const tryEster = (
  carbonId: string,
  atomById: Map<string, Atom>,
  adj: Map<string, Neighbor[]>,
): string[] | null => {
  if (tryCOOH(carbonId, atomById, adj)) return null;
  const c = atomById.get(carbonId);
  if (!c || c.element !== 'C') return null;
  const nbs = heavy(adj.get(carbonId) ?? []);
  const oxygens = nbs.filter(n => n.atom.element === 'O');
  const carbonyl = oxygens.find(n => n.order >= 1.5);
  const alkoxy = oxygens.find(
    n => n !== carbonyl && n.order < 1.5 && heavy(adj.get(n.id) ?? []).length >= 2,
  );
  if (!carbonyl || !alkoxy) return null;
  if (nbs.length > 3) return null;
  return [carbonId, carbonyl.id, alkoxy.id];
};

const tryAmide = (
  carbonId: string,
  atomById: Map<string, Atom>,
  adj: Map<string, Neighbor[]>,
): string[] | null => {
  const c = atomById.get(carbonId);
  if (!c || c.element !== 'C') return null;
  const nbs = heavy(adj.get(carbonId) ?? []);
  const carbonyl = nbs.find(n => n.atom.element === 'O' && n.order >= 1.5);
  const nitrogen = nbs.find(n => n.atom.element === 'N');
  if (!carbonyl || !nitrogen) return null;
  if (nbs.length > 3) return null;
  return [carbonId, carbonyl.id, nitrogen.id];
};

const tryNO2 = (
  nId: string,
  atomById: Map<string, Atom>,
  adj: Map<string, Neighbor[]>,
): string[] | null => {
  const n = atomById.get(nId);
  if (!n || n.element !== 'N') return null;
  const oxygens = heavy(adj.get(nId) ?? []).filter(x => x.atom.element === 'O');
  if (oxygens.length < 2) return null;
  return [nId, ...oxygens.map(o => o.id)];
};

const tryCN = (
  cId: string,
  atomById: Map<string, Atom>,
  adj: Map<string, Neighbor[]>,
): string[] | null => {
  const c = atomById.get(cId);
  if (!c || c.element !== 'C') return null;
  const nbs = heavy(adj.get(cId) ?? []);
  const nitrile = nbs.find(x => x.atom.element === 'N' && x.order >= 2.5);
  if (!nitrile || nbs.length > 2) return null;
  return [cId, nitrile.id];
};

const tryCarbonyl = (
  cId: string,
  atomById: Map<string, Atom>,
  adj: Map<string, Neighbor[]>,
): string[] | null => {
  if (tryCOOH(cId, atomById, adj) || tryEster(cId, atomById, adj) || tryAmide(cId, atomById, adj)) {
    return null;
  }
  const c = atomById.get(cId);
  if (!c || c.element !== 'C') return null;
  const nbs = heavy(adj.get(cId) ?? []);
  const carbonyl = nbs.find(x => x.atom.element === 'O' && x.order >= 1.5);
  if (!carbonyl) return null;
  return [cId, carbonyl.id];
};

const tryCX3 = (
  cId: string,
  halogen: string,
  atomById: Map<string, Atom>,
  adj: Map<string, Neighbor[]>,
): string[] | null => {
  const c = atomById.get(cId);
  if (!c || c.element !== 'C') return null;
  const nbs = heavy(adj.get(cId) ?? []);
  const x = nbs.filter(n => n.atom.element === halogen);
  if (x.length < 3) return null;
  return [cId, ...x.map(n => n.id)];
};

const trySO3H = (
  sId: string,
  atomById: Map<string, Atom>,
  adj: Map<string, Neighbor[]>,
): string[] | null => {
  const s = atomById.get(sId);
  if (!s || s.element !== 'S') return null;
  const oxygens = heavy(adj.get(sId) ?? []).filter(n => n.atom.element === 'O');
  if (oxygens.length < 3) return null;
  const hydroxyl = oxygens.find(n => isTerminalOxygen(n.atom, adj.get(n.id) ?? []));
  if (!hydroxyl) return null;
  return [sId, ...oxygens.map(o => o.id)];
};

const trySO2 = (
  sId: string,
  atomById: Map<string, Atom>,
  adj: Map<string, Neighbor[]>,
): string[] | null => {
  if (trySO3H(sId, atomById, adj)) return null;
  const s = atomById.get(sId);
  if (!s || s.element !== 'S') return null;
  const oxygens = heavy(adj.get(sId) ?? []).filter(n => n.atom.element === 'O' && n.order >= 1.5);
  if (oxygens.length < 2) return null;
  return [sId, ...oxygens.map(o => o.id)];
};

/** Terminal O–C (OMe): oxygen plus a carbon whose only heavy neighbor is that O. */
const tryOMe = (
  oId: string,
  atomById: Map<string, Atom>,
  adj: Map<string, Neighbor[]>,
): string[] | null => {
  const o = atomById.get(oId);
  if (!o || o.element !== 'O') return null;
  const methyl = heavy(adj.get(oId) ?? []).find(
    n => n.atom.element === 'C' && heavy(adj.get(n.id) ?? []).length === 1,
  );
  return methyl ? [oId, methyl.id] : null;
};

const groupFromCarbon = (
  carbonId: string,
  atomById: Map<string, Atom>,
  adj: Map<string, Neighbor[]>,
): string[] =>
  tryCOOH(carbonId, atomById, adj) ??
  tryEster(carbonId, atomById, adj) ??
  tryAmide(carbonId, atomById, adj) ??
  tryCN(carbonId, atomById, adj) ??
  tryCX3(carbonId, 'F', atomById, adj) ??
  tryCX3(carbonId, 'Cl', atomById, adj) ??
  tryCarbonyl(carbonId, atomById, adj) ??
  [carbonId];

/**
 * Atoms that should be outlined together when hovering `seedId`.
 * Single-atom groups (OH, NH, a carbon) return `[seedId]`.
 */
export function functionalGroupAtomIds(mol: Molecule, seedId: string): string[] {
  const adj = adjacency(mol);
  const atomById = new Map(mol.atoms.map(a => [a.id, a]));
  const seed = atomById.get(seedId);
  if (!seed) return [seedId];
  if (seed.alias?.trim()) return [seed.id];

  const seedNb = adj.get(seedId) ?? [];

  if (seed.element === 'H') {
    const parent = seedNb[0];
    if (parent && (parent.atom.element === 'O' || parent.atom.element === 'N' || parent.atom.element === 'S')) {
      return functionalGroupAtomIds(mol, parent.id);
    }
    return [seedId];
  }

  let ids: string[];

  if (seed.element === 'C') {
    ids = groupFromCarbon(seedId, atomById, adj);
    if (ids.length === 1) {
      const oxygen = heavy(seedNb).find(n => n.atom.element === 'O');
      const ome = oxygen ? tryOMe(oxygen.id, atomById, adj) : null;
      if (ome?.includes(seedId)) ids = ome;
    }
  } else if (seed.element === 'O') {
    const parent = heavy(seedNb)[0];
    const fromParent =
      parent && parent.atom.element === 'C'
        ? tryCOOH(parent.id, atomById, adj) ??
          tryEster(parent.id, atomById, adj) ??
          tryAmide(parent.id, atomById, adj) ??
          (tryCarbonyl(parent.id, atomById, adj)?.includes(seedId)
            ? tryCarbonyl(parent.id, atomById, adj)
            : null)
        : parent && parent.atom.element === 'S'
          ? trySO3H(parent.id, atomById, adj) ?? trySO2(parent.id, atomById, adj)
          : parent && parent.atom.element === 'N'
            ? tryNO2(parent.id, atomById, adj)
            : null;
    ids = fromParent?.includes(seedId) ? fromParent : (tryOMe(seedId, atomById, adj) ?? [seedId]);
  } else if (seed.element === 'N') {
    const no2 = tryNO2(seedId, atomById, adj);
    const carbon = heavy(seedNb).find(x => x.atom.element === 'C');
    const fromC = carbon
      ? tryAmide(carbon.id, atomById, adj) ?? tryCN(carbon.id, atomById, adj)
      : null;
    ids = no2 ?? (fromC?.includes(seedId) ? fromC : [seedId]);
  } else if (seed.element === 'S') {
    ids = trySO3H(seedId, atomById, adj) ?? trySO2(seedId, atomById, adj) ?? [seedId];
  } else if (seed.element === 'F' || seed.element === 'Cl') {
    const parent = heavy(seedNb).find(x => x.atom.element === 'C');
    const cx3 = parent ? tryCX3(parent.id, seed.element, atomById, adj) : null;
    ids = cx3 ?? [seedId];
  } else {
    ids = [seedId];
    for (const n of heavy(seedNb)) {
      if (n.atom.element !== 'C') continue;
      const g = groupFromCarbon(n.id, atomById, adj);
      if (g.includes(seedId) && g.length > 1) {
        ids = g;
        break;
      }
    }
  }

  return withExplicitH(ids, adj);
}

/** Same multi-atom group if both ends belong to it; otherwise null. */
export function sharedFunctionalGroupAtomIds(
  mol: Molecule,
  atomIdA: string,
  atomIdB: string,
): string[] | null {
  const a = functionalGroupAtomIds(mol, atomIdA);
  if (a.length < 2 || !a.includes(atomIdB)) return null;
  const b = functionalGroupAtomIds(mol, atomIdB);
  if (b.length !== a.length) return null;
  const set = new Set(a);
  return b.every(id => set.has(id)) ? a : null;
}
