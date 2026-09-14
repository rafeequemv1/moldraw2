/**
 * MOF-2 family: M₂(BDC)₂ square (sql) layers.
 * Dinuclear paddlewheel nodes (M–M axis out of the sheet; shown offset in 2D)
 * + 1,4-benzenedicarboxylate edges. Unused arms get dashed stubs.
 *
 * MOF-2 = Zn (Yaghi 1995). Cu/Ni/Co are the isostructural layered M(BDC) set.
 */
import type { Atom, Bond } from '@moldraw/domain';
import { buildSquareLattice } from '../../cofs/topologies/squareGrid';
import type { CofBuilder } from '../../cofs/types';
import {
  addAtom,
  addBond,
  addDashedContinuation,
  addPhenyleneLinker,
  edgeFragmentKey,
  enterLatticeFragment,
  findAtom,
  nodeFragmentKey,
  terminalFragmentKey,
} from '../../cofs/rings';

export type MBdcMetal = 'Zn' | 'Cu' | 'Ni' | 'Co';

const METAL_COLOR: Record<MBdcMetal, string> = {
  Zn: '#64748b',
  Cu: '#c2410c',
  Ni: '#0f766e',
  Co: '#0369a1',
};

/** Node center → carboxylate carbon (along an arm). */
const carboxylateReach = (a: number) => a * 1.45;

/** Node center → neighboring node center (paddlewheel + BDC phenylene). */
export const mBdcNodeSpacing = (a: number) => 2 * carboxylateReach(a) + 2 * a;

export type PlacedPaddlewheel = {
  carboxylateByAngle: Map<number, string>;
};

const angleKey = (ang: number) =>
  Math.round((((ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) * 1000);

/**
 * In-plane 2D paddlewheel: two metals (M–M slightly offset so both are visible;
 * the crystallographic M–M axis is perpendicular to the layer) and four
 * syn–syn carboxylates at 90°.
 */
export function addPaddlewheel(
  atoms: Atom[],
  bonds: Bond[],
  cx: number,
  cy: number,
  a: number,
  metal: MBdcMetal,
  attachments: readonly number[],
): PlacedPaddlewheel {
  const color = METAL_COLOR[metal];
  const split = a * 0.32;
  const m1 = addAtom(atoms, metal, cx - split * Math.SQRT1_2, cy - split * Math.SQRT1_2, { color });
  const m2 = addAtom(atoms, metal, cx + split * Math.SQRT1_2, cy + split * Math.SQRT1_2, { color });
  addBond(bonds, m1.id, m2.id, { color });

  const rO = a * 0.95;
  const rC = carboxylateReach(a);
  const half = a * 0.36;
  const carboxylateByAngle = new Map<number, string>();

  for (const arm of attachments) {
    const ux = Math.cos(arm);
    const uy = Math.sin(arm);
    const px = -uy;
    const py = ux;
    const o1 = addAtom(atoms, 'O', cx + rO * ux + half * px, cy + rO * uy + half * py);
    const o2 = addAtom(atoms, 'O', cx + rO * ux - half * px, cy + rO * uy - half * py);
    const c = addAtom(atoms, 'C', cx + rC * ux, cy + rC * uy);
    addBond(bonds, m1.id, o1.id, { color });
    addBond(bonds, m2.id, o2.id, { color });
    addBond(bonds, o1.id, c.id);
    addBond(bonds, o2.id, c.id, { order: 2 });
    carboxylateByAngle.set(angleKey(arm), c.id);
  }

  return { carboxylateByAngle };
}

export function buildMBdc(metal: MBdcMetal): CofBuilder {
  return ({ cols, rows, bondLength, cx, cy }) => {
    const a = Math.max(16, bondLength);
    const lattice = buildSquareLattice(cols, rows, mBdcNodeSpacing(a), cx, cy);
    const atoms: Atom[] = [];
    const bonds: Bond[] = [];
    const placed = new Map<string, PlacedPaddlewheel>();

    for (const node of lattice.nodes) {
      enterLatticeFragment(nodeFragmentKey(node.key));
      placed.set(
        node.key,
        addPaddlewheel(atoms, bonds, node.x, node.y, a, metal, node.attachments),
      );
    }

    for (const e of lattice.edges) {
      const pa = placed.get(e.fromKey);
      const pb = placed.get(e.toKey);
      const fromId = pa?.carboxylateByAngle.get(angleKey(e.fromAngle));
      const toId = pb?.carboxylateByAngle.get(angleKey(e.toAngle));
      const fromAtom = fromId ? findAtom(atoms, fromId) : undefined;
      const toAtom = toId ? findAtom(atoms, toId) : undefined;
      if (!fromId || !toId || !fromAtom || !toAtom) continue;
      enterLatticeFragment(edgeFragmentKey(e.fromKey, e.toKey));
      addPhenyleneLinker(atoms, bonds, fromId, toId, fromAtom, toAtom, a);
    }

    for (const t of lattice.terminals) {
      const p = placed.get(t.nodeKey);
      const cId = p?.carboxylateByAngle.get(angleKey(t.angle));
      const carbon = cId ? findAtom(atoms, cId) : undefined;
      if (!cId || !carbon) continue;
      enterLatticeFragment(terminalFragmentKey(t.nodeKey, t.angle));
      addDashedContinuation(atoms, bonds, cId, carbon, t.angle, a);
    }

    return { atoms, bonds, atomIds: atoms.map(x => x.id) };
  };
}

export const buildMof2 = buildMBdc('Zn');
export const buildCuBdc = buildMBdc('Cu');
export const buildNiBdc = buildMBdc('Ni');
export const buildCoBdc = buildMBdc('Co');
