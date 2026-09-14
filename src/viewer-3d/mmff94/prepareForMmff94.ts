/**
 * Prepare an OpenChemLib Molecule for ForceFieldMMFF94.
 * Native / Indigo molblocks often use aromatic bond order 4 (OCL type 8
 * delocalized). MMFF94 needs a kekulé form; explicit H only if missing.
 */
type OclMolecule = {
  getAllAtoms(): number;
  getAllBonds(): number;
  getAtomicNo(atom: number): number;
  getBondType(bond: number): number;
  getBondOrder(bond: number): number;
  setBondType(bond: number, type: number): void;
  getBondAtom(atomIndexInBond: 0 | 1, bond: number): number;
  addImplicitHydrogens(): void;
};

/** OCL cBondTypeDelocalized — aromatic/delocalized from molfile bond order 4. */
const BOND_TYPE_DELOCALIZED = 8;
const BOND_TYPE_SINGLE = 1;
const BOND_TYPE_DOUBLE = 2;
const ATOMIC_NO_H = 1;

/**
 * Convert delocalized/aromatic bonds to an alternating single/double kekulé form
 * so MMFF94 can assign atom types. Uses BFS edge parity on the aromatic subgraph.
 */
export const kekulizeDelocalizedBonds = (mol: OclMolecule): number => {
  const nBonds = mol.getAllBonds();
  const aromaticBondIdx: number[] = [];
  for (let i = 0; i < nBonds; i++) {
    const type = mol.getBondType(i);
    const order = mol.getBondOrder(i);
    if (type === BOND_TYPE_DELOCALIZED || order === 4) {
      aromaticBondIdx.push(i);
    }
  }
  if (aromaticBondIdx.length === 0) return 0;

  const adj = new Map<number, Array<{ bond: number; other: number }>>();
  for (const bi of aromaticBondIdx) {
    const a = mol.getBondAtom(0, bi);
    const b = mol.getBondAtom(1, bi);
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a)!.push({ bond: bi, other: b });
    adj.get(b)!.push({ bond: bi, other: a });
  }

  const bondParity = new Map<number, 0 | 1>();
  const visitedAtoms = new Set<number>();

  for (const start of adj.keys()) {
    if (visitedAtoms.has(start)) continue;
    const queue: Array<{ atom: number; nextParity: 0 | 1 }> = [
      { atom: start, nextParity: 0 },
    ];
    visitedAtoms.add(start);
    while (queue.length > 0) {
      const { atom, nextParity } = queue.shift()!;
      for (const { bond, other } of adj.get(atom) ?? []) {
        if (bondParity.has(bond)) continue;
        bondParity.set(bond, nextParity);
        if (!visitedAtoms.has(other)) {
          visitedAtoms.add(other);
          queue.push({ atom: other, nextParity: (1 - nextParity) as 0 | 1 });
        }
      }
    }
  }

  for (const [bond, parity] of bondParity) {
    mol.setBondType(bond, parity === 0 ? BOND_TYPE_DOUBLE : BOND_TYPE_SINGLE);
  }
  return aromaticBondIdx.length;
};

const countHydrogens = (mol: OclMolecule): number => {
  let n = 0;
  for (let i = 0; i < mol.getAllAtoms(); i++) {
    if (mol.getAtomicNo(i) === ATOMIC_NO_H) n += 1;
  }
  return n;
};

/**
 * Kekulize aromatic bonds. Add explicit H only when the molblock has none
 * (calling addImplicitHydrogens on an already-complete aromatic graph can
 * over-add H before kekulization; after kekulize, existing H are enough).
 */
export const prepareMoleculeForMmff94 = (mol: OclMolecule): number => {
  kekulizeDelocalizedBonds(mol);
  if (countHydrogens(mol) === 0) {
    mol.addImplicitHydrogens();
  }
  return mol.getAllAtoms();
};
