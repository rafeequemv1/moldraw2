/**
 * Chemistry fragments used by hexagonal COF presets.
 * Carbon hexes are Kekulé benzene (alternating doubles), not cyclohexane.
 */
import type { Atom, Bond } from '@moldraw/domain';
import { hexPoints } from './geometry';

const randomId = () => Math.random().toString(36).slice(2, 11);

/* ------------------------------------------------------------------------ */
/* Deterministic lattice ids                                                 */
/* ------------------------------------------------------------------------ */

/**
 * While a builder runs inside `withLatticeIdScope`, every atom / bond id is
 * `${prefix}:${fragmentKey}:a<n>` / `:b<n>`. Builders call
 * `enterLatticeFragment(key)` before each node / linker / terminal, where the
 * key derives from the lattice position — so re-generating a larger packing
 * yields the *same* ids for every atom that already existed. Growth then
 * becomes an incremental merge (no canvas jump, 3D keeps its model, selection
 * survives) instead of a delete + rebuild with fresh random ids.
 */
type LatticeIdScope = { prefix: string; fragment: string; atomN: number; bondN: number };

let activeScope: LatticeIdScope | null = null;

/** Make a lattice position key safe inside an id (`ia:` parsing splits on ':'). */
export const latticeKeySafe = (key: string): string =>
  key.replace(/[:|]/g, '/').replace(/,/g, '_').replace(/-/g, 'm');

export function withLatticeIdScope<T>(prefix: string, fn: () => T): T {
  const prev = activeScope;
  activeScope = { prefix: latticeKeySafe(prefix), fragment: 'root', atomN: 0, bondN: 0 };
  try {
    return fn();
  } finally {
    activeScope = prev;
  }
}

/** Start a new deterministic id run for the fragment at `key` (node / edge / terminal). */
export function enterLatticeFragment(key: string): void {
  if (!activeScope) return;
  activeScope.fragment = latticeKeySafe(key);
  activeScope.atomN = 0;
  activeScope.bondN = 0;
}

/** Fragment keys shared by every lattice builder (node / linker / terminal). */
export const nodeFragmentKey = (nodeKey: string): string => `n${nodeKey}`;
export const edgeFragmentKey = (fromKey: string, toKey: string): string =>
  fromKey < toKey ? `e${fromKey}|${toKey}` : `e${toKey}|${fromKey}`;
export const terminalFragmentKey = (nodeKey: string, angle: number): string =>
  `t${nodeKey}@${Math.round((((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) * 1000)}`;

const newId = (): string => {
  if (!activeScope) return randomId();
  return `${activeScope.prefix}:${activeScope.fragment}:a${activeScope.atomN++}`;
};

const newBondId = (): string => {
  if (!activeScope) return randomId();
  return `${activeScope.prefix}:${activeScope.fragment}:b${activeScope.bondN++}`;
};

/* ------------------------------------------------------------------------ */
/* Per-builder lookup indexes (keyed on the arrays the builder owns)         */
/* ------------------------------------------------------------------------ */

const atomIndexByArray = new WeakMap<Atom[], Map<string, Atom>>();
const bondPairsByArray = new WeakMap<Bond[], Set<string>>();

const atomIndex = (atoms: Atom[]): Map<string, Atom> => {
  let idx = atomIndexByArray.get(atoms);
  if (!idx) {
    idx = new Map(atoms.map(a => [a.id, a]));
    atomIndexByArray.set(atoms, idx);
  }
  return idx;
};

const bondPairs = (bonds: Bond[]): Set<string> => {
  let set = bondPairsByArray.get(bonds);
  if (!set) {
    set = new Set(bonds.map(b => pairKey(b.fromAtomId, b.toAtomId)));
    bondPairsByArray.set(bonds, set);
  }
  return set;
};

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** O(1) atom lookup inside a builder (replaces `atoms.find`). */
export const findAtom = (atoms: Atom[], id: string): Atom | undefined => atomIndex(atoms).get(id);

/** True when a bond between `a` and `b` already exists in this builder's list. */
export const hasBond = (bonds: Bond[], a: string, b: string): boolean =>
  bondPairs(bonds).has(pairKey(a, b));

export const LINKER_BLUE = '#2563eb';

export type PlacedBoroxine = {
  boronByAngle: Map<number, string>;
};

export type BondExtras = Partial<Pick<Bond, 'order' | 'aromatic' | 'dotted' | 'color'>>;

export function addAtom(
  atoms: Atom[],
  element: string,
  x: number,
  y: number,
  extras?: Partial<Pick<Atom, 'color' | 'showElementLabel'>>,
): Atom {
  const atom: Atom = {
    id: newId(),
    element,
    x,
    y,
    charge: 0,
    ...(extras?.color ? { color: extras.color } : {}),
    ...(extras?.showElementLabel === false ? { showElementLabel: false } : {}),
  };
  atoms.push(atom);
  atomIndex(atoms).set(atom.id, atom);
  return atom;
}

export function addBond(
  bonds: Bond[],
  fromAtomId: string,
  toAtomId: string,
  extras?: BondExtras,
): Bond {
  const bond: Bond = {
    id: newBondId(),
    fromAtomId,
    toAtomId,
    order: extras?.order ?? 1,
    ...(extras?.aromatic ? { aromatic: true } : {}),
    ...(extras?.dotted ? { dotted: true } : {}),
    ...(extras?.color ? { color: extras.color } : {}),
  };
  bonds.push(bond);
  bondPairs(bonds).add(pairKey(fromAtomId, toAtomId));
  return bond;
}

const angleKey = (ang: number) =>
  Math.round((((ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) * 1000);

/** Kekulé benzene: alternating double/single C–C (ChemDraw-style, not cyclohexane). */
export function addKekuleBenzene(
  atoms: Atom[],
  bonds: Bond[],
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  opts?: { color?: string; reuse?: Array<string | undefined> },
): string[] {
  const pts = hexPoints(cx, cy, radius, startAngle);
  const ids: string[] = [];
  for (let i = 0; i < 6; i++) {
    const reuse = opts?.reuse?.[i];
    if (reuse) {
      ids.push(reuse);
      continue;
    }
    ids.push(addAtom(atoms, 'C', pts[i]!.x, pts[i]!.y, { color: opts?.color }).id);
  }
  for (let i = 0; i < 6; i++) {
    const a = ids[i]!;
    const b = ids[(i + 1) % 6]!;
    if (hasBond(bonds, a, b)) continue;
    addBond(bonds, a, b, {
      order: i % 2 === 0 ? 2 : 1,
      color: opts?.color,
    });
  }
  return ids;
}

const rot60 = (x: number, y: number, sign: 1 | -1): { x: number; y: number } => {
  const c = 0.5;
  const s = (Math.sqrt(3) / 2) * sign;
  return { x: c * x - s * y, y: s * x + c * y };
};

/**
 * Fuse a regular Kekulé benzene onto an existing edge, walking 60° turns
 * away from `inward` so the new hex stays planar and undistorted.
 */
export function addFusedKekuleBenzene(
  atoms: Atom[],
  bonds: Bond[],
  sharedId0: string,
  sharedId1: string,
  inward: { x: number; y: number },
): string[] {
  const p0 = findAtom(atoms, sharedId0);
  const p1 = findAtom(atoms, sharedId1);
  if (!p0 || !p1) return [sharedId0, sharedId1];
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const outwardX = (p0.x + p1.x) / 2 - inward.x;
  const outwardY = (p0.y + p1.y) / 2 - inward.y;
  const ccw = rot60(dx, dy, 1);
  const cw = rot60(dx, dy, -1);
  const sign: 1 | -1 =
    ccw.x * outwardX + ccw.y * outwardY >= cw.x * outwardX + cw.y * outwardY ? 1 : -1;

  const ids = [sharedId0, sharedId1];
  let prevX = p0.x;
  let prevY = p0.y;
  let curX = p1.x;
  let curY = p1.y;
  for (let i = 0; i < 4; i++) {
    const step = rot60(curX - prevX, curY - prevY, sign);
    const nx = curX + step.x;
    const ny = curY + step.y;
    ids.push(addAtom(atoms, 'C', nx, ny).id);
    prevX = curX;
    prevY = curY;
    curX = nx;
    curY = ny;
  }
  for (let i = 1; i < 6; i++) {
    const a = ids[i]!;
    const b = ids[(i + 1) % 6]!;
    if (hasBond(bonds, a, b)) continue;
    addBond(bonds, a, b, { order: i % 2 === 0 ? 2 : 1 });
  }
  return ids;
}

/** Open dashed stub — packing continues beyond this atom. */
export function addDashedContinuation(
  atoms: Atom[],
  bonds: Bond[],
  fromId: string,
  from: { x: number; y: number },
  angle: number,
  length: number,
  color?: string,
): void {
  const tip = addAtom(
    atoms,
    'C',
    from.x + length * Math.cos(angle),
    from.y + length * Math.sin(angle),
    { color, showElementLabel: false },
  );
  addBond(bonds, fromId, tip.id, { order: 1, dotted: true, color });
}

export function addBoroxine(
  atoms: Atom[],
  bonds: Bond[],
  cx: number,
  cy: number,
  radius: number,
  attachments: readonly number[],
): PlacedBoroxine {
  const start = attachments[0] ?? 0;
  const pts = hexPoints(cx, cy, radius, start);
  const ids: string[] = [];
  for (let i = 0; i < 6; i++) {
    const el = i % 2 === 0 ? 'B' : 'O';
    ids.push(addAtom(atoms, el, pts[i]!.x, pts[i]!.y).id);
  }
  for (let i = 0; i < 6; i++) addBond(bonds, ids[i]!, ids[(i + 1) % 6]!);

  const boronByAngle = new Map<number, string>();
  attachments.forEach((ang, i) => {
    boronByAngle.set(angleKey(ang), ids[(i * 2) % 6]!);
  });
  return { boronByAngle };
}

export function boronIdAt(placed: PlacedBoroxine, angle: number): string | undefined {
  return placed.boronByAngle.get(angleKey(angle));
}

export function addPhenyleneLinker(
  atoms: Atom[],
  bonds: Bond[],
  fromBoronId: string,
  toBoronId: string,
  from: { x: number; y: number },
  to: { x: number; y: number },
  radius: number,
  color?: string,
): void {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const ipsoAng = Math.atan2(from.y - my, from.x - mx);
  const cIds = addKekuleBenzene(atoms, bonds, mx, my, radius, ipsoAng, { color });
  addBond(bonds, fromBoronId, cIds[0]!, { color });
  addBond(bonds, toBoronId, cIds[3]!, { color });
}

export function addTerminalPhenyl(
  atoms: Atom[],
  bonds: Bond[],
  boronId: string,
  boron: { x: number; y: number },
  outwardAng: number,
  radius: number,
  color?: string,
): { paraId: string; para: { x: number; y: number } } {
  const ux = Math.cos(outwardAng);
  const uy = Math.sin(outwardAng);
  const cx = boron.x + 2 * radius * ux;
  const cy = boron.y + 2 * radius * uy;
  const ipsoAng = Math.atan2(boron.y - cy, boron.x - cx);
  const cIds = addKekuleBenzene(atoms, bonds, cx, cy, radius, ipsoAng, { color });
  addBond(bonds, boronId, cIds[0]!, { color });
  const para = findAtom(atoms, cIds[3]!)!;
  return { paraId: cIds[3]!, para };
}
