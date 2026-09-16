/**
 * Aromatic rings collect a solid inscribed circle (not a dashed companion).
 * Run: npx tsx --tsconfig tsconfig.app.json packages/canvas/src/geometry/__tests__/aromaticCircleSmoke.ts
 */
import type { Atom, Bond, Molecule } from '@moldraw/domain';
import {
  AROMATIC_CIRCLE_INSET,
  collectAromaticCircles,
} from '../aromaticCircles';
import { getMoleculeRevisionCache, clearMoleculeRevisionCache } from '../moleculeRevisionCache';

const fail = (msg: string): never => {
  throw new Error(msg);
};
const eq = (got: unknown, want: unknown, msg: string): void => {
  if (got !== want) fail(`${msg}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};
const ok = (cond: unknown, msg: string): void => {
  if (!cond) fail(msg);
};

const regularNgon = (n: number, cx: number, cy: number, R: number): Atom[] => {
  const atoms: Atom[] = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    atoms.push({
      id: `a${i}`,
      element: 'C',
      x: cx + R * Math.cos(a),
      y: cy + R * Math.sin(a),
      charge: 0,
    });
  }
  return atoms;
};

const ringBonds = (n: number, aromatic: boolean, order: number): Bond[] => {
  const bonds: Bond[] = [];
  for (let i = 0; i < n; i++) {
    bonds.push({
      id: `b${i}`,
      fromAtomId: `a${i}`,
      toAtomId: `a${(i + 1) % n}`,
      order,
      ...(aromatic ? { aromatic: true } : {}),
    });
  }
  return bonds;
};

const molOf = (atoms: Atom[], bonds: Bond[]): Molecule => ({ atoms, bonds });

const collect = (mol: Molecule) => {
  const cache = getMoleculeRevisionCache(mol);
  return collectAromaticCircles(mol, cache.atomById, cache.ringAtomIdsByBondId);
};

clearMoleculeRevisionCache();

// Kekulé benzene: alternating doubles, no aromatic flags → no circle.
{
  const atoms = regularNgon(6, 200, 200, 40);
  const bonds: Bond[] = [];
  for (let i = 0; i < 6; i++) {
    bonds.push({
      id: `b${i}`,
      fromAtomId: `a${i}`,
      toAtomId: `a${(i + 1) % 6}`,
      order: i % 2 === 0 ? 2 : 1,
    });
  }
  const r = collect(molOf(atoms, bonds));
  eq(r.circles.length, 0, 'kekule benzene has no aromatic circle');
  eq(r.bondIds.size, 0, 'kekule benzene covers no circle bonds');
}

// Aromatic benzene: six aromatic singles → one solid inner circle.
{
  const atoms = regularNgon(6, 200, 200, 40);
  const mol = molOf(atoms, ringBonds(6, true, 1));
  const r = collect(mol);
  eq(r.circles.length, 1, 'aromatic benzene has one circle');
  eq(r.bondIds.size, 6, 'all six benzene bonds belong to the circle');
  const c = r.circles[0]!;
  ok(c.radius > 20 && c.radius < 30, `benzene circle radius in range, got ${c.radius}`);
  const inr = 40 * Math.cos(Math.PI / 6);
  const expected = inr * AROMATIC_CIRCLE_INSET;
  ok(Math.abs(c.radius - expected) < 0.6, `radius ≈ inset inradius (${c.radius} vs ${expected})`);
  ok(Math.abs(c.center.x - 200) < 1e-6 && Math.abs(c.center.y - 200) < 1e-6, 'circle centered on ring');
}

// Isolated aromatic bond (aromatic-bond tool): no circle, caller keeps dashed inner.
{
  const mol = molOf(
    [
      { id: 'a0', element: 'C', x: 0, y: 0, charge: 0 },
      { id: 'a1', element: 'C', x: 40, y: 0, charge: 0 },
    ],
    [{ id: 'b0', fromAtomId: 'a0', toAtomId: 'a1', order: 1, aromatic: true }],
  );
  const r = collect(mol);
  eq(r.circles.length, 0, 'isolated aromatic bond has no circle');
}

// Pyrrole-sized aromatic pentagon.
{
  const atoms = regularNgon(5, 0, 0, 40);
  const r = collect(molOf(atoms, ringBonds(5, true, 1)));
  eq(r.circles.length, 1, 'aromatic pentagon has one circle');
  eq(r.bondIds.size, 5, 'five pentagon bonds belong to the circle');
}

// Empty ring map still finds the circle via uniqueRingPaths (ghost / preview).
{
  const atoms = regularNgon(6, 0, 0, 40);
  const mol = molOf(atoms, ringBonds(6, true, 1));
  const atomById = new Map(atoms.map(a => [a.id, a]));
  const r = collectAromaticCircles(mol, atomById, new Map());
  eq(r.circles.length, 1, 'fallback uniqueRingPaths finds aromatic benzene');
}

// Fused naphthalene: two hexagons, two circles.
{
  const L = 40;
  const hex = (cx: number, cy: number, idOff: number): Atom[] => {
    const out: Atom[] = [];
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 3;
      out.push({
        id: `n${idOff + i}`,
        element: 'C',
        x: cx + L * Math.cos(a),
        y: cy + L * Math.sin(a),
        charge: 0,
      });
    }
    return out;
  };
  const left = hex(0, 0, 0);
  // Fuse on the right edge of the left hex (vertices 1 and 2).
  const inr = L * Math.cos(Math.PI / 6);
  const right = hex(2 * inr, 0, 10);
  // Shared: left[1]≈right[5], left[2]≈right[4]. Keep left ids for those two.
  const atoms = [
    ...left,
    right[0]!,
    right[1]!,
    right[2]!,
    right[3]!,
  ];
  const bonds: Bond[] = [];
  const add = (from: string, to: string, id: string) => {
    bonds.push({ id, fromAtomId: from, toAtomId: to, order: 1, aromatic: true });
  };
  for (let i = 0; i < 6; i++) add(`n${i}`, `n${(i + 1) % 6}`, `bl${i}`);
  // Right ring: n10 (top), n11, n12, n13 (bottom), n2 (shared), n1 (shared)
  add('n10', 'n11', 'br0');
  add('n11', 'n12', 'br1');
  add('n12', 'n13', 'br2');
  add('n13', 'n2', 'br3');
  add('n1', 'n10', 'br4');
  const r = collect(molOf(atoms, bonds));
  eq(r.circles.length, 2, 'naphthalene has two aromatic circles');
}

// Seven fused hexagons (benzene + 6 around it): interior ring is all shared
// edges — left-face walk must still emit a circle there.
{
  const L = 40;
  const inr = L * Math.cos(Math.PI / 6);
  const centers: [number, number][] = [
    [0, 0],
    [2 * inr, 0],
    [inr, 1.5 * L],
    [-inr, 1.5 * L],
    [-2 * inr, 0],
    [-inr, -1.5 * L],
    [inr, -1.5 * L],
  ];
  const atomByKey = new Map<string, Atom>();
  const atoms: Atom[] = [];
  const coordKey = (x: number, y: number) => `${Math.round(x * 50)}_${Math.round(y * 50)}`;
  const vertex = (x: number, y: number): Atom => {
    const k = coordKey(x, y);
    const existing = atomByKey.get(k);
    if (existing) return existing;
    const a: Atom = { id: `g${atoms.length}`, element: 'C', x, y, charge: 0 };
    atomByKey.set(k, a);
    atoms.push(a);
    return a;
  };
  const bondSet = new Set<string>();
  const bonds: Bond[] = [];
  for (const [cx, cy] of centers) {
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 3;
      ids.push(vertex(cx + L * Math.cos(a), cy + L * Math.sin(a)).id);
    }
    for (let i = 0; i < 6; i++) {
      const a = ids[i]!;
      const b = ids[(i + 1) % 6]!;
      const k = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (bondSet.has(k)) continue;
      bondSet.add(k);
      bonds.push({ id: `gb${bonds.length}`, fromAtomId: a, toAtomId: b, order: 1, aromatic: true });
    }
  }
  const r = collect(molOf(atoms, bonds));
  eq(r.circles.length, 7, 'coronene-like flake has a circle in every hexagon');
}

console.log('aromaticCircleSmoke OK');
