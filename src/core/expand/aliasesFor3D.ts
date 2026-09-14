import type { Atom, Molecule } from '@moldraw/domain';

/**
 * Replace 2D group aliases (e.g. "Et", "Ph", "Boc") with explicit fragment geometry
 * so RDKit can generate a sane 3D layout. If `targetAtomIds` is provided, only
 * those alias atoms are expanded; otherwise every alias atom is expanded.
 */
export const expandAliasesFor3D = (mol: Molecule, targetAtomIds?: Set<string>): Molecule => {
  const next: Molecule = {
    ...mol,
    atoms: mol.atoms.map(a => ({ ...a })),
    bonds: mol.bonds.map(b => ({ ...b })),
  };
  const atomById = new Map(next.atoms.map(a => [a.id, a] as const));
  const bondOrderSum = (id: string) =>
    next.bonds
      .filter(b => b.fromAtomId === id || b.toAtomId === id)
      .reduce((s, b) => s + b.order, 0);
  const neighbors = (id: string) =>
    next.bonds
      .flatMap(b => (b.fromAtomId === id ? [b.toAtomId] : b.toAtomId === id ? [b.fromAtomId] : []))
      .map(nid => atomById.get(nid))
      .filter((a): a is Atom => Boolean(a));
  const mkId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
  const addAtom = (element: string, x: number, y: number): Atom => {
    const a: Atom = { id: mkId('x'), element, x, y, charge: 0 };
    next.atoms.push(a);
    atomById.set(a.id, a);
    return a;
  };
  const addAt = (element: string, pt: { x: number; y: number }) => addAtom(element, pt.x, pt.y);
  const addBond = (from: Atom, to: Atom, order = 1) => {
    next.bonds.push({ id: mkId('b'), fromAtomId: from.id, toAtomId: to.id, order });
  };
  const outward = (a: Atom): { x: number; y: number } => {
    const ns = neighbors(a.id);
    if (ns.length === 0) return { x: 1, y: 0 };
    let vx = 0;
    let vy = 0;
    ns.forEach(n => {
      vx += a.x - n.x;
      vy += a.y - n.y;
    });
    const n = Math.hypot(vx, vy);
    if (n < 1e-6) return { x: 1, y: 0 };
    return { x: vx / n, y: vy / n };
  };
  const perp = (u: { x: number; y: number }) => ({ x: -u.y, y: u.x });
  const BL = 40;
  const aliases = [...next.atoms].filter(a => {
    if (!a.alias?.trim()) return false;
    if (!targetAtomIds) return true;
    return targetAtomIds.has(a.id);
  });
  for (const a of aliases) {
    const raw = a.alias?.trim();
    if (!raw) continue;
    const key = raw.toUpperCase();
    // skip strict atom aliases that are already atom-accurate
    if (/^[A-Z][A-Z]?(H\d*)?$/i.test(raw)) continue;
    const u = outward(a);
    const n = perp(u);
    const p = (du: number, dn = 0) => ({ x: a.x + u.x * du + n.x * dn, y: a.y + u.y * du + n.y * dn });

    if (key === 'ME') {
      a.alias = undefined;
      continue;
    }
    if (key === 'ET' || key === 'NPR' || key === 'NBU') {
      const len = key === 'ET' ? 1 : key === 'NPR' ? 2 : 3;
      let prev = a;
      for (let i = 0; i < len; i++) {
        const q = p(BL * (i + 1));
        const c = addAtom('C', q.x, q.y);
        addBond(prev, c, 1);
        prev = c;
      }
      a.alias = undefined;
      continue;
    }
    if (key === 'IPR') {
      const c1p = p(BL);
      const c1 = addAtom('C', c1p.x, c1p.y);
      addBond(a, c1, 1);
      const c2p = p(BL * 2, BL * 0.55);
      const c3p = p(BL * 2, -BL * 0.55);
      addBond(c1, addAtom('C', c2p.x, c2p.y), 1);
      addBond(c1, addAtom('C', c3p.x, c3p.y), 1);
      a.alias = undefined;
      continue;
    }
    if (key === 'TBU') {
      const c1p = p(BL);
      const c1 = addAtom('C', c1p.x, c1p.y);
      addBond(a, c1, 1);
      const q1 = p(BL * 2, BL * 0.8);
      const q2 = p(BL * 2, -BL * 0.8);
      const q3 = p(BL * 2.2, 0);
      addBond(c1, addAtom('C', q1.x, q1.y), 1);
      addBond(c1, addAtom('C', q2.x, q2.y), 1);
      addBond(c1, addAtom('C', q3.x, q3.y), 1);
      a.alias = undefined;
      continue;
    }
    if (key === 'CF3') {
      const c1p = p(BL);
      const c1 = addAtom('C', c1p.x, c1p.y);
      addBond(a, c1, 1);
      addBond(c1, addAt('F', p(BL * 2, BL * 0.8)), 1);
      addBond(c1, addAt('F', p(BL * 2, -BL * 0.8)), 1);
      addBond(c1, addAt('F', p(BL * 2.2, 0)), 1);
      a.alias = undefined;
      continue;
    }
    if (key === 'CN') {
      const c1p = p(BL);
      const n1p = p(BL * 2.05);
      const c1 = addAtom('C', c1p.x, c1p.y);
      const n1 = addAtom('N', n1p.x, n1p.y);
      addBond(a, c1, 1);
      addBond(c1, n1, 3);
      a.alias = undefined;
      continue;
    }
    if (key === 'OH') {
      a.alias = undefined;
      continue;
    }
    if (key === 'NH2') {
      a.alias = undefined;
      continue;
    }
    if (key === 'OME') {
      const q = p(BL);
      addBond(a, addAtom('C', q.x, q.y), 1);
      a.alias = undefined;
      continue;
    }
    if (key === 'OET') {
      const c1 = addAt('C', p(BL));
      const c2 = addAt('C', p(BL * 2));
      addBond(a, c1, 1);
      addBond(c1, c2, 1);
      a.alias = undefined;
      continue;
    }
    if (key === 'NME2') {
      addBond(a, addAt('C', p(BL, BL * 0.65)), 1);
      addBond(a, addAt('C', p(BL, -BL * 0.65)), 1);
      a.alias = undefined;
      continue;
    }
    if (key === 'NO2') {
      addBond(a, addAt('O', p(BL, BL * 0.55)), 2);
      addBond(a, addAt('O', p(BL, -BL * 0.55)), 1);
      a.alias = undefined;
      continue;
    }
    if (key === 'COOH' || key === 'CO2ME' || key === 'CO2ET' || key === 'AC' || key === 'CHO') {
      const c1 = addAt('C', p(BL));
      addBond(a, c1, 1);
      addBond(c1, addAt('O', p(BL * 2, BL * 0.6)), 2);
      if (key === 'CHO') continue;
      const o2 = addAt('O', p(BL * 2, -BL * 0.6));
      addBond(c1, o2, 1);
      if (key === 'CO2ME') addBond(o2, addAt('C', p(BL * 3, -BL * 0.6)), 1);
      if (key === 'CO2ET') {
        const c2 = addAt('C', p(BL * 3, -BL * 0.6));
        addBond(o2, c2, 1);
        addBond(c2, addAt('C', p(BL * 4, -BL * 0.6)), 1);
      }
      if (key === 'AC') addBond(c1, addAt('C', p(BL * 2.25, 0)), 1);
      a.alias = undefined;
      continue;
    }
    if (key === 'SO3H' || key === 'SO2ME') {
      addBond(a, addAt('O', p(BL, BL * 0.7)), 2);
      addBond(a, addAt('O', p(BL, -BL * 0.7)), 2);
      if (key === 'SO3H') {
        addBond(a, addAt('O', p(BL * 1.2, 0)), 1);
      } else {
        addBond(a, addAt('C', p(BL * 1.2, 0)), 1);
      }
      a.alias = undefined;
      continue;
    }
    if (key === 'TS' || key === 'MS') {
      const s1 = addAt('S', p(BL));
      addBond(a, s1, 1);
      addBond(s1, addAt('O', p(BL * 2, BL * 0.65)), 2);
      addBond(s1, addAt('O', p(BL * 2, -BL * 0.65)), 2);
      if (key === 'TS') {
        const c1 = addAt('C', p(BL * 2.7, 0));
        addBond(s1, c1, 1);
        const center = p(BL * 4.0, 0);
        const r = BL * 0.9;
        const pts = Array.from({ length: 6 }, (_, i) => {
          const ang = Math.atan2(u.y, u.x) + i * (Math.PI / 3);
          return { x: center.x + Math.cos(ang) * r, y: center.y + Math.sin(ang) * r };
        });
        const ring = pts.map(pt => addAt('C', pt));
        addBond(c1, ring[0], 1);
        for (let i = 0; i < 6; i++) addBond(ring[i], ring[(i + 1) % 6], i % 2 === 0 ? 2 : 1);
      } else {
        addBond(s1, addAt('C', p(BL * 2.8, 0)), 1);
      }
      a.alias = undefined;
      continue;
    }
    if (key === 'PH' || key === 'BN') {
      const ringStart = key === 'BN' ? addAt('C', p(BL)) : a;
      if (key === 'BN') addBond(a, ringStart, 1);
      const center = p(key === 'BN' ? BL * 2.4 : BL * 1.7);
      const r = BL * 0.95;
      const pts = Array.from({ length: 6 }, (_, i) => {
        const ang = Math.atan2(u.y, u.x) + (Math.PI / 6) + i * (Math.PI / 3);
        return { x: center.x + Math.cos(ang) * r, y: center.y + Math.sin(ang) * r };
      });
      const ring = pts.map(pt => addAtom('C', pt.x, pt.y));
      addBond(ringStart, ring[0], 1);
      for (let i = 0; i < 6; i++) addBond(ring[i], ring[(i + 1) % 6], i % 2 === 0 ? 2 : 1);
      a.alias = undefined;
      continue;
    }
    if (key === 'BOC' || key === 'CBZ' || key === 'FMOC') {
      const nOrO = a;
      const c1 = addAt('C', p(BL));
      addBond(nOrO, c1, 1);
      addBond(c1, addAt('O', p(BL * 2, BL * 0.6)), 2);
      const o1 = addAt('O', p(BL * 2, -BL * 0.6));
      addBond(c1, o1, 1);
      if (key === 'BOC') {
        const ctert = addAt('C', p(BL * 3.1, -BL * 0.6));
        addBond(o1, ctert, 1);
        addBond(ctert, addAt('C', p(BL * 4.1, -BL * 0.1)), 1);
        addBond(ctert, addAt('C', p(BL * 3.9, -BL * 1.2)), 1);
        addBond(ctert, addAt('C', p(BL * 2.8, -BL * 1.25)), 1);
      } else if (key === 'CBZ') {
        const ch2 = addAt('C', p(BL * 3.1, -BL * 0.6));
        addBond(o1, ch2, 1);
        const center = p(BL * 4.6, -BL * 0.6);
        const r = BL * 0.9;
        const pts = Array.from({ length: 6 }, (_, i) => {
          const ang = Math.atan2(u.y, u.x) + (Math.PI / 6) + i * (Math.PI / 3);
          return { x: center.x + Math.cos(ang) * r, y: center.y + Math.sin(ang) * r };
        });
        const ring = pts.map(pt => addAt('C', pt));
        addBond(ch2, ring[0], 1);
        for (let i = 0; i < 6; i++) addBond(ring[i], ring[(i + 1) % 6], i % 2 === 0 ? 2 : 1);
      } else {
        const oCH2 = addAt('C', p(BL * 3.1, -BL * 0.6));
        addBond(o1, oCH2, 1);
        const ringA1 = addAt('C', p(BL * 4.1, -BL * 0.1));
        const ringA2 = addAt('C', p(BL * 5.0, -BL * 0.6));
        const ringA3 = addAt('C', p(BL * 4.7, -BL * 1.5));
        const ringA4 = addAt('C', p(BL * 3.6, -BL * 1.5));
        addBond(oCH2, ringA1, 1);
        addBond(ringA1, ringA2, 2);
        addBond(ringA2, ringA3, 1);
        addBond(ringA3, ringA4, 2);
        addBond(ringA4, ringA1, 1);
        const ringB1 = addAt('C', p(BL * 5.8, -BL * 0.05));
        const ringB2 = addAt('C', p(BL * 6.7, -BL * 0.6));
        const ringB3 = addAt('C', p(BL * 6.4, -BL * 1.5));
        const ringB4 = addAt('C', p(BL * 5.3, -BL * 1.5));
        addBond(ringA2, ringB1, 1);
        addBond(ringB1, ringB2, 2);
        addBond(ringB2, ringB3, 1);
        addBond(ringB3, ringB4, 2);
        addBond(ringB4, ringA3, 1);
      }
      a.alias = undefined;
      continue;
    }
    // keep unknown/protecting-group aliases as labels only
    if (bondOrderSum(a.id) > 0) continue;
  }
  return next;
};
