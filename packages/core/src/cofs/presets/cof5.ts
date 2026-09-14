/**
 * COF-5: HHTP triphenylene nodes + BDBA phenylene linkers (dioxaborole joints).
 * Nodes black; linkers (B + phenylene) blue. Unused arms end in dashed bonds.
 */
import type { Atom, Bond } from '@moldraw/domain';
import { buildHoneycombLattice } from '../topologies/hexagonalHoneycomb';
import type { CofBuilder } from '../types';
import {
  LINKER_BLUE,
  addAtom,
  addBond,
  addDashedContinuation,
  addFusedKekuleBenzene,
  addKekuleBenzene,
  addPhenyleneLinker,
  edgeFragmentKey,
  enterLatticeFragment,
  findAtom,
  nodeFragmentKey,
  terminalFragmentKey,
} from '../rings';

/** Node center → neighboring node center. */
export const cof5NodeSpacing = (a: number) => a * (6 + 3 * Math.sqrt(3));

export type PlacedCof5Node = {
  boronByAngle: Map<number, string>;
};

const angleKey = (ang: number) =>
  Math.round((((ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) * 1000);

/**
 * HHTP core: one central benzene + three regular fused benzenes (C₃ propeller),
 * then a dioxaborole on each outer ortho edge.
 */
export function addTriphenyleneBoronate(
  atoms: Atom[],
  bonds: Bond[],
  cx: number,
  cy: number,
  a: number,
  attachments: readonly number[],
): PlacedCof5Node {
  const arm0 = attachments[0] ?? 0;
  const start = arm0 - Math.PI / 6;
  const central = addKekuleBenzene(atoms, bonds, cx, cy, a, start);
  const inward = { x: cx, y: cy };
  const boronByAngle = new Map<number, string>();

  for (let k = 0; k < 3; k++) {
    const arm = attachments[k] ?? arm0 + (k * 2 * Math.PI) / 3;
    const edge = k * 2;
    const outer = addFusedKekuleBenzene(
      atoms,
      bonds,
      central[edge]!,
      central[(edge + 1) % 6]!,
      inward,
    );
    // Opposite the fused edge [0,1]: outer carbons [3] and [4].
    const c1 = findAtom(atoms, outer[3]!)!;
    const c2 = findAtom(atoms, outer[4]!)!;
    const mid = { x: (c1.x + c2.x) / 2, y: (c1.y + c2.y) / 2 };
    const ux = Math.cos(arm);
    const uy = Math.sin(arm);
    const bx = mid.x + a * ux;
    const by = mid.y + a * uy;
    const o1 = addAtom(atoms, 'O', (c1.x + bx) / 2, (c1.y + by) / 2);
    const o2 = addAtom(atoms, 'O', (c2.x + bx) / 2, (c2.y + by) / 2);
    const boron = addAtom(atoms, 'B', bx, by, { color: LINKER_BLUE });
    addBond(bonds, c1.id, o1.id);
    addBond(bonds, c2.id, o2.id);
    addBond(bonds, o1.id, boron.id, { color: LINKER_BLUE });
    addBond(bonds, o2.id, boron.id, { color: LINKER_BLUE });
    boronByAngle.set(angleKey(arm), boron.id);
  }

  return { boronByAngle };
}

export const buildCof5: CofBuilder = ({ cols, rows, bondLength, cx, cy }) => {
  const a = Math.max(16, bondLength);
  const lattice = buildHoneycombLattice(cols, rows, cof5NodeSpacing(a), cx, cy);
  const atoms: Atom[] = [];
  const bonds: Bond[] = [];
  const placed = new Map<string, PlacedCof5Node>();

  for (const node of lattice.nodes) {
    enterLatticeFragment(nodeFragmentKey(node.key));
    placed.set(
      node.key,
      addTriphenyleneBoronate(atoms, bonds, node.x, node.y, a, node.attachments),
    );
  }

  for (const e of lattice.edges) {
    const pa = placed.get(e.fromKey);
    const pb = placed.get(e.toKey);
    const fromId = pa?.boronByAngle.get(angleKey(e.fromAngle));
    const toId = pb?.boronByAngle.get(angleKey(e.toAngle));
    const fromAtom = fromId ? findAtom(atoms, fromId) : undefined;
    const toAtom = toId ? findAtom(atoms, toId) : undefined;
    if (!fromId || !toId || !fromAtom || !toAtom) continue;
    enterLatticeFragment(edgeFragmentKey(e.fromKey, e.toKey));
    addPhenyleneLinker(atoms, bonds, fromId, toId, fromAtom, toAtom, a, LINKER_BLUE);
  }

  for (const t of lattice.terminals) {
    const p = placed.get(t.nodeKey);
    const boronId = p?.boronByAngle.get(angleKey(t.angle));
    const boron = boronId ? findAtom(atoms, boronId) : undefined;
    if (!boronId || !boron) continue;
    enterLatticeFragment(terminalFragmentKey(t.nodeKey, t.angle));
    addDashedContinuation(atoms, bonds, boronId, boron, t.angle, a, LINKER_BLUE);
  }

  return { atoms, bonds, atomIds: atoms.map(x => x.id) };
};
