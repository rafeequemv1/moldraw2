/**
 * COF-1: boroxine (B₃O₃) nodes + 1,4-phenylene (Kekulé benzene) linkers.
 * Unused arms end in a benzene + dashed continuation bond.
 */
import type { Atom, Bond } from '@moldraw/domain';
import { buildHoneycombLattice } from '../topologies/hexagonalHoneycomb';
import type { CofBuilder } from '../types';
import {
  addBoroxine,
  addDashedContinuation,
  addPhenyleneLinker,
  addTerminalPhenyl,
  boronIdAt,
  edgeFragmentKey,
  enterLatticeFragment,
  findAtom,
  nodeFragmentKey,
  terminalFragmentKey,
} from '../rings';

export const cof1NodeSpacing = (bondLength: number) => 6 * bondLength;

export const buildCof1: CofBuilder = ({ cols, rows, bondLength, cx, cy }) => {
  const a = Math.max(16, bondLength);
  const lattice = buildHoneycombLattice(cols, rows, cof1NodeSpacing(a), cx, cy);
  const atoms: Atom[] = [];
  const bonds: Bond[] = [];

  const placed = new Map<string, ReturnType<typeof addBoroxine>>();

  for (const node of lattice.nodes) {
    enterLatticeFragment(nodeFragmentKey(node.key));
    placed.set(node.key, addBoroxine(atoms, bonds, node.x, node.y, a, node.attachments));
  }

  for (const e of lattice.edges) {
    const pa = placed.get(e.fromKey);
    const pb = placed.get(e.toKey);
    const fromId = pa ? boronIdAt(pa, e.fromAngle) : undefined;
    const toId = pb ? boronIdAt(pb, e.toAngle) : undefined;
    const fromAtom = fromId ? findAtom(atoms, fromId) : undefined;
    const toAtom = toId ? findAtom(atoms, toId) : undefined;
    if (!fromId || !toId || !fromAtom || !toAtom) continue;
    enterLatticeFragment(edgeFragmentKey(e.fromKey, e.toKey));
    addPhenyleneLinker(atoms, bonds, fromId, toId, fromAtom, toAtom, a);
  }

  for (const t of lattice.terminals) {
    const p = placed.get(t.nodeKey);
    const boronId = p ? boronIdAt(p, t.angle) : undefined;
    const boron = boronId ? findAtom(atoms, boronId) : undefined;
    if (!boronId || !boron) continue;
    enterLatticeFragment(terminalFragmentKey(t.nodeKey, t.angle));
    const { paraId, para } = addTerminalPhenyl(atoms, bonds, boronId, boron, t.angle, a);
    addDashedContinuation(atoms, bonds, paraId, para, t.angle, a);
  }

  return { atoms, bonds, atomIds: atoms.map(x => x.id) };
};
