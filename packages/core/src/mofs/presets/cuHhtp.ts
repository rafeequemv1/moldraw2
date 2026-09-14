/**
 * Cu-HHTP / Cu₃(HHTP)₂ (Cu-CAT-1): the standard conductive 2D MOF
 * (Hmadeh / Yaghi 2012). Honeycomb of HHTP triphenylene nodes linked by
 * square-planar Cu between catechol pairs. Unused arms get dashed stubs.
 */
import type { Atom, Bond } from '@moldraw/domain';
import { buildHoneycombLattice } from '../../cofs/topologies/hexagonalHoneycomb';
import type { CofBuilder } from '../../cofs/types';
import {
  addAtom,
  addBond,
  addDashedContinuation,
  addFusedKekuleBenzene,
  addKekuleBenzene,
  edgeFragmentKey,
  enterLatticeFragment,
  findAtom,
  nodeFragmentKey,
  terminalFragmentKey,
} from '../../cofs/rings';

const CU_COLOR = '#c2410c';

/** Node center → neighboring node center (HHTP–Cu–HHTP). */
export const cuHhtpNodeSpacing = (a: number) => {
  const toOuterMid = 1.5 * a * Math.sqrt(3);
  const toCatechol = toOuterMid + a * 0.62;
  return 2 * (toCatechol + a * 0.75);
};

export type PlacedHhtp = {
  oxygensByAngle: Map<number, [string, string]>;
};

const angleKey = (ang: number) =>
  Math.round((((ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) * 1000);

/** HHTP core: central benzene + three fused benzenes + catechol O on each outer ortho edge. */
export function addHhtpCatechol(
  atoms: Atom[],
  bonds: Bond[],
  cx: number,
  cy: number,
  a: number,
  attachments: readonly number[],
): PlacedHhtp {
  const arm0 = attachments[0] ?? 0;
  const start = arm0 - Math.PI / 6;
  const central = addKekuleBenzene(atoms, bonds, cx, cy, a, start);
  const inward = { x: cx, y: cy };
  const oxygensByAngle = new Map<number, [string, string]>();

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
    const c1 = findAtom(atoms, outer[3]!)!;
    const c2 = findAtom(atoms, outer[4]!)!;
    const ux = Math.cos(arm);
    const uy = Math.sin(arm);
    const ox = a * 0.62;
    const o1 = addAtom(atoms, 'O', c1.x + ox * ux, c1.y + ox * uy);
    const o2 = addAtom(atoms, 'O', c2.x + ox * ux, c2.y + ox * uy);
    addBond(bonds, c1.id, o1.id);
    addBond(bonds, c2.id, o2.id);
    oxygensByAngle.set(angleKey(arm), [o1.id, o2.id]);
  }

  return { oxygensByAngle };
}

export const buildCuHhtp: CofBuilder = ({ cols, rows, bondLength, cx, cy }) => {
  const a = Math.max(16, bondLength);
  const lattice = buildHoneycombLattice(cols, rows, cuHhtpNodeSpacing(a), cx, cy);
  const atoms: Atom[] = [];
  const bonds: Bond[] = [];
  const placed = new Map<string, PlacedHhtp>();

  for (const node of lattice.nodes) {
    enterLatticeFragment(nodeFragmentKey(node.key));
    placed.set(node.key, addHhtpCatechol(atoms, bonds, node.x, node.y, a, node.attachments));
  }

  for (const e of lattice.edges) {
    const pa = placed.get(e.fromKey);
    const pb = placed.get(e.toKey);
    const fromO = pa?.oxygensByAngle.get(angleKey(e.fromAngle));
    const toO = pb?.oxygensByAngle.get(angleKey(e.toAngle));
    if (!fromO || !toO) continue;
    const ids = [...fromO, ...toO];
    const pts = ids.map(id => findAtom(atoms, id)).filter((x): x is Atom => Boolean(x));
    if (pts.length !== 4) continue;
    const mx = pts.reduce((s, p) => s + p.x, 0) / 4;
    const my = pts.reduce((s, p) => s + p.y, 0) / 4;
    enterLatticeFragment(edgeFragmentKey(e.fromKey, e.toKey));
    const cu = addAtom(atoms, 'Cu', mx, my, { color: CU_COLOR });
    for (const id of ids) addBond(bonds, cu.id, id, { color: CU_COLOR });
  }

  for (const t of lattice.terminals) {
    const p = placed.get(t.nodeKey);
    const pair = p?.oxygensByAngle.get(angleKey(t.angle));
    if (!pair) continue;
    enterLatticeFragment(terminalFragmentKey(t.nodeKey, t.angle));
    for (const id of pair) {
      const atom = findAtom(atoms, id);
      if (!atom) continue;
      addDashedContinuation(atoms, bonds, id, atom, t.angle, a * 0.85, CU_COLOR);
    }
  }

  return { atoms, bonds, atomIds: atoms.map(x => x.id) };
};
