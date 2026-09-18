/**
 * ChemDraw-style sequential lone pairs stay off bonds and nearby atoms.
 * Run: npx tsx --tsconfig tsconfig.app.json packages/core/src/__tests__/lonePairLayoutSmoke.ts
 */
import type { Atom, Bond, Molecule } from '@moldraw/domain';
import {
  defaultChargeSeatAngle,
  getLonePairPlacements,
  getRadicalPlacement,
  labelBoxFromExtents,
  LONE_PAIR_DIST_PX,
  lockLonePairAngles,
} from '../molecule/lonePairLayout';
import { alignCleanupCoordsPerComponent } from '../io/localCleanup';

const fail = (msg: string): never => {
  throw new Error(msg);
};

const shortest = (from: number, to: number): number => {
  let d = to - from;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
};

const atom = (id: string, element: string, x: number, y: number, extra: Partial<Atom> = {}): Atom => ({
  id,
  element,
  x,
  y,
  charge: 0,
  ...extra,
});

const bond = (id: string, fromAtomId: string, toAtomId: string, order = 1): Bond => ({
  id,
  fromAtomId,
  toAtomId,
  order,
});

const molOf = (atoms: Atom[], bonds: Bond[]): Molecule => ({ atoms, bonds });

const bondAngle = (from: Atom, to: Atom): number => Math.atan2(to.y - from.y, to.x - from.x);

const place = (host: Atom, mol: Molecule, count: number) =>
  getLonePairPlacements(host, mol, count, { preferSide: 'above' });

const minBondSep = (host: Atom, mol: Molecule, count: number): number => {
  const neighbors = mol.bonds
    .filter(b => b.fromAtomId === host.id || b.toAtomId === host.id)
    .map(b => {
      const nid = b.fromAtomId === host.id ? b.toAtomId : b.fromAtomId;
      return mol.atoms.find(a => a.id === nid)!;
    });
  const placements = place(host, mol, count);
  let best = Infinity;
  for (const p of placements) {
    const ang = Math.atan2(p.dir.y, p.dir.x);
    for (const n of neighbors) {
      best = Math.min(best, Math.abs(shortest(ang, bondAngle(host, n))));
    }
  }
  return best;
};

const minPairSep = (host: Atom, mol: Molecule, count: number): number => {
  const ps = place(host, mol, count);
  let best = Infinity;
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      const a = Math.atan2(ps[i]!.dir.y, ps[i]!.dir.x);
      const b = Math.atan2(ps[j]!.dir.y, ps[j]!.dir.x);
      best = Math.min(best, Math.abs(shortest(a, b)));
    }
  }
  return best;
};

const minAtomDist = (host: Atom, mol: Molecule, count: number): number => {
  const ps = place(host, mol, count);
  let best = Infinity;
  for (const p of ps) {
    const px = host.x + p.dir.x * p.dist;
    const py = host.y + p.dir.y * p.dist;
    for (const other of mol.atoms) {
      if (other.id === host.id) continue;
      best = Math.min(best, Math.hypot(other.x - px, other.y - py));
    }
  }
  return best;
};

// Carbonyl O (C=O to the left): vacant up/down seats — one pair each.
{
  const C = atom('c', 'C', 0, 0);
  const O = atom('o', 'O', 40, 0);
  const mol = molOf([C, O], [bond('b', 'c', 'o', 2)]);
  const ps = place(O, mol, 2);
  if (ps.length !== 2) fail('carbonyl: expected 2 pairs');
  const sep = minBondSep(O, mol, 2);
  if (sep < 1.2) fail(`carbonyl: pair on C=O (sep=${sep.toFixed(3)})`);
  if (ps.some(p => Math.abs(p.dir.y) < 0.75)) fail('carbonyl: expected upright up/down pairs');
  if (minPairSep(O, mol, 2) < 1.8) fail('carbonyl: pairs too close');
}

// Terminal Cl with 3 pairs: opposite + two perps — none on C–Cl.
{
  const C = atom('c', 'C', 0, 40);
  const Cl = atom('cl', 'Cl', 0, 0);
  const mol = molOf([C, Cl], [bond('b', 'c', 'cl')]);
  if (place(Cl, mol, 3).length !== 3) fail('Cl: expected 3 pairs');
  const sep = minBondSep(Cl, mol, 3);
  if (sep < 1.4) fail(`Cl: pair on C–Cl (sep=${sep.toFixed(3)})`);
  if (minPairSep(Cl, mol, 3) < 1.4) fail('Cl: pairs clustered');
  for (const n of [1, 2, 3] as const) {
    if (minBondSep(Cl, mol, n) < 0.9) fail(`Cl sequential ${n}: overlaps bond`);
  }
}

// OH alias: tail + parent bond occupy opposite rays → pairs above/below, not on C–O or H-tail.
{
  const C = atom('c', 'C', 0, 0);
  const O = atom('o', 'O', 36, 0, { alias: 'OH' });
  const mol = molOf([C, O], [bond('b', 'c', 'o')]);
  const ps = place(O, mol, 2);
  if (ps.length !== 2) fail('OH: expected 2 pairs');
  if (minBondSep(O, mol, 2) < 1.2) fail('OH: pair on C–O');
  if (ps.some(p => Math.abs(p.dir.y) < 0.7)) fail('OH: pair along the H tail');
}

// Ether: two pairs fill remaining gaps, not the C–O–C wedge.
{
  const O = atom('o', 'O', 0, 0);
  const C1 = atom('c1', 'C', -30, 22);
  const C2 = atom('c2', 'C', 30, 22);
  const mol = molOf([O, C1, C2], [bond('b1', 'o', 'c1'), bond('b2', 'o', 'c2')]);
  if (minBondSep(O, mol, 2) < 0.7) fail('ether: pair on a C–O bond');
  const ps = place(O, mol, 2);
  if (ps.some(p => p.dir.y > 0.35)) fail('ether: pair sitting between the two carbons');
}

// Nitro: pairs on each O stay off the N–O bond and the sibling oxygen.
{
  const N = atom('n', 'N', 0, 0, { charge: 1 });
  const O1 = atom('o1', 'O', 28, -16, { charge: -1 });
  const O2 = atom('o2', 'O', 28, 16);
  const C = atom('c', 'C', -36, 0);
  const mol = molOf(
    [N, O1, O2, C],
    [bond('bn1', 'n', 'o1', 1), bond('bn2', 'n', 'o2', 2), bond('bc', 'n', 'c')],
  );
  for (const host of [O1, O2]) {
    if (minBondSep(host, mol, 3) < 0.7) fail(`nitro ${host.id}: pair on N–O`);
    if (minAtomDist(host, mol, 3) < 12) fail(`nitro ${host.id}: pair overlaps an atom`);
  }
}

// Hanging (upside-down) OH: C above O — pairs must not sit on the vertical C–O stem.
{
  const C = atom('c', 'C', 0, 0);
  const O = atom('o', 'O', 0, 40, { alias: 'OH' });
  const mol = molOf([C, O], [bond('b', 'c', 'o')]);
  const ps = getLonePairPlacements(O, mol, 2, {
    preferSide: 'above',
    labelTailLocal: { x: 1, y: 0 },
  });
  if (ps.length !== 2) fail('hanging OH: expected 2 pairs');
  const sep = minBondSep(O, mol, 2);
  if (sep < 1.15) fail(`hanging OH: pair on C–O (sep=${sep.toFixed(3)})`);
  if (ps.some(p => p.dir.y < -0.45)) fail('hanging OH: pair pointing up the stem');
  const rad = getRadicalPlacement(O, mol, { preferSide: 'above', labelTailLocal: { x: 1, y: 0 } });
  const bondAng = bondAngle(O, C);
  if (Math.abs(shortest(Math.atan2(rad.dir.y, rad.dir.x), bondAng)) < 1.1) {
    fail('hanging OH: radical on C–O');
  }
}

// 4-o'clock NH2: two pairs take different upright sides, not one stacked cluster, and not the C–N bond.
{
  const C = atom('c', 'C', -28, -22);
  const N = atom('n', 'N', 0, 0, { alias: 'NH2' });
  const mol = molOf([C, N], [bond('b', 'c', 'n')]);
  const ps = getLonePairPlacements(N, mol, 2, {
    preferSide: 'above',
    labelTailLocal: { x: 1, y: 0 },
  });
  if (ps.length !== 2) fail(`NH2: expected 2 pairs, got ${ps.length}`);
  if (minBondSep(N, mol, 2) < 0.85) fail('NH2: pair on C–N');
  if (minPairSep(N, mol, 2) < 1.0) fail('NH2: pairs stacked on one side');
  const onCardinal = (p: { dir: { x: number; y: number } }) =>
    Math.abs(p.dir.x) > 0.92 || Math.abs(p.dir.y) > 0.92;
  if (!ps.every(onCardinal)) fail('NH2: pairs should sit on up/down/left/right');
}

// Inclined OH: pairs stay off the diagonal C–O and off each other.
{
  const C = atom('c', 'C', 30, 24);
  const O = atom('o', 'O', 0, 0, { alias: 'OH' });
  const mol = molOf([C, O], [bond('b', 'c', 'o')]);
  const ps = getLonePairPlacements(O, mol, 2, { preferSide: 'above', labelTailLocal: { x: 1, y: 0 } });
  if (ps.length !== 2) fail('inclined OH: expected 2 pairs');
  if (minBondSep(O, mol, 2) < 0.85) fail('inclined OH: pair on C–O');
  if (minPairSep(O, mol, 2) < 1.0) fail('inclined OH: pairs stacked');
}

// Pyramidal N: top vacant → pair sits above, horizontal.
{
  const N = atom('n', 'N', 0, 0);
  const H1 = atom('h1', 'H', -28, 0);
  const H2 = atom('h2', 'H', -12, 28);
  const C = atom('c', 'C', 26, 22);
  const mol = molOf([N, H1, H2, C], [bond('b1', 'n', 'h1'), bond('b2', 'n', 'h2'), bond('b3', 'n', 'c')]);
  const ps = place(N, mol, 1);
  if (ps.length !== 1) fail('N: expected 1 pair');
  if (ps[0]!.dir.y > -0.75) fail('N: pair should sit above when top is vacant');
  if (Math.abs(ps[0]!.dir.x) > 0.35) fail('N: pair should be upright (horizontal dots)');
}

// Charge and lone pairs do not share a seat.
{
  const C = atom('c', 'C', 0, 0);
  const O = atom('o', 'O', 36, 0, { charge: -1 });
  const mol = molOf([C, O], [bond('b', 'c', 'o')]);
  const chargeAng = defaultChargeSeatAngle(O, mol);
  const ps = place(O, mol, 2);
  for (const p of ps) {
    const a = Math.atan2(p.dir.y, p.dir.x);
    if (Math.abs(shortest(a, chargeAng)) < 0.65) fail('charge: lone pair overlaps charge seat');
  }
}

// All pairs sit on the same circle so the pair above Cl is not closer.
{
  const C = atom('c', 'C', 28, 22);
  const Cl = atom('cl', 'Cl', 0, 0);
  const mol = molOf([C, Cl], [bond('b', 'c', 'cl')]);
  const box = labelBoxFromExtents(-10, 10, 13);
  const ps = getLonePairPlacements(Cl, mol, 3, { headBox: box, preferSide: 'above' });
  const dists = ps.map(p => p.dist);
  const spread = Math.max(...dists) - Math.min(...dists);
  if (spread > 0.6) fail(`Cl: pair distances should match (spread=${spread.toFixed(2)})`);
}

if (LONE_PAIR_DIST_PX < 10) fail('pair distance unexpectedly short');

// Cleanup moves atoms but keeps each pair's direction from its atom.
{
  const C = atom('c', 'C', 0, -40);
  const O = atom('o', 'O', 0, 0, { alias: 'OH', lonePairs: 2 });
  const mol = molOf([C, O], [bond('b', 'c', 'o')]);
  const locked = lockLonePairAngles(mol);
  const host0 = locked.atoms.find(a => a.id === 'o')!;
  const before = getLonePairPlacements(host0, locked, 2).map(p => Math.atan2(p.dir.y, p.dir.x));
  const moved = {
    ...locked,
    atoms: locked.atoms.map(a => (a.id === 'c' ? { ...a, x: 40, y: 0 } : a)),
  };
  const host1 = moved.atoms.find(a => a.id === 'o')!;
  const after = getLonePairPlacements(host1, moved, 2).map(p => Math.atan2(p.dir.y, p.dir.x));
  for (let i = 0; i < before.length; i++) {
    if (Math.abs(shortest(before[i]!, after[i]!)) > 0.02) {
      fail('lone pair moved relative to its atom after the bond swung');
    }
  }
  const reseated = getLonePairPlacements({ ...host1, lonePairAngles: undefined }, moved, 2)
    .map(p => Math.atan2(p.dir.y, p.dir.x));
  const same = reseated.every((a, i) => Math.abs(shortest(a, before[i]!)) < 0.02);
  if (same) fail('expected a fresh seat to differ once the bond swings');
  const spun = alignCleanupCoordsPerComponent(
    locked,
    new Map(locked.atoms.map(a => [a.id, { x: a.x + 80, y: a.y - 30 }])),
  );
  const kept = spun.atoms.find(a => a.id === 'o')!.lonePairAngles ?? [];
  if (kept.length !== before.length) fail('cleanup dropped lone-pair seats');
  for (let i = 0; i < before.length; i++) {
    if (Math.abs(shortest(before[i]!, kept[i]!)) > 0.02) fail('cleanup rewrote a lone-pair seat');
  }
}

console.log('lonePairLayoutSmoke OK');
