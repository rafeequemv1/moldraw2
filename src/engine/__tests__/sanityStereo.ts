/**
 * Stereochemistry (Phase C) checks. Run with:
 *   npx tsx src/engine/__tests__/sanityStereo.ts
 */
import type { Molecule } from '@moldraw/domain';
import { embed3D } from '@moldraw/engine-3d/embed';
import { perceiveStereo } from '@moldraw/engine-3d/stereo';

let passed = 0;
let failed = 0;
const check = (name: string, cond: boolean, detail?: unknown): void => {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`, detail !== undefined ? JSON.stringify(detail) : '');
  }
};

type V = { x: number; y: number; z: number };
const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const cross = (a: V, b: V): V => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const dot = (a: V, b: V): number => a.x * b.x + a.y * b.y + a.z * b.z;
const dihedral = (a: V, b: V, c: V, d: V): number => {
  const b1 = sub(b, a);
  const b2 = sub(c, b);
  const b3 = sub(d, c);
  const n1 = cross(b1, b2);
  const n2 = cross(b2, b3);
  const cosang = dot(n1, n2) / (Math.hypot(n1.x, n1.y, n1.z) * Math.hypot(n2.x, n2.y, n2.z));
  return Math.max(-1, Math.min(1, cosang));
};

// CHFClBr chiral center with a wedge/dash on the C→Br bond.
const chiral = (stereo: 'wedge' | 'dash'): Molecule => ({
  atoms: [
    { id: 'C0', element: 'C', x: 0, y: 0, charge: 0 },
    { id: 'Br', element: 'Br', x: 100, y: 0, charge: 0 },
    { id: 'Cl', element: 'Cl', x: -50, y: 87, charge: 0 },
    { id: 'F', element: 'F', x: -50, y: -87, charge: 0 },
  ],
  bonds: [
    { id: 'b1', fromAtomId: 'C0', toAtomId: 'Br', order: 1, stereo },
    { id: 'b2', fromAtomId: 'C0', toAtomId: 'Cl', order: 1 },
    { id: 'b3', fromAtomId: 'C0', toAtomId: 'F', order: 1 },
  ],
});

console.log('Stereochemistry (Phase C)\n');

for (const s of ['wedge', 'dash'] as const) {
  const mol = chiral(s);
  const perceived = perceiveStereo(mol);
  check(`CHFClBr (${s}): one chiral center perceived`, perceived.chirals.length === 1, perceived.chirals.length);
  const conf = embed3D(mol, { includeHydrogens: true });
  const pos = new Map(conf.atoms.map(a => [a.id, a.pos]));
  const vol = dot(
    sub(pos.get('Br')!, pos.get('C0')!),
    cross(sub(pos.get('Cl')!, pos.get('C0')!), sub(pos.get('F')!, pos.get('C0')!)),
  );
  const sign3d = Math.sign(vol);
  check(`CHFClBr (${s}): 3D handedness matches drawn`, sign3d === perceived.chirals[0].sign, {
    sign3d,
    want: perceived.chirals[0].sign,
  });
}

// Enantiomers: wedge and dash must produce opposite handedness.
{
  const w = embed3D(chiral('wedge'), { includeHydrogens: true });
  const d = embed3D(chiral('dash'), { includeHydrogens: true });
  const volOf = (conf: typeof w): number => {
    const pos = new Map(conf.atoms.map(a => [a.id, a.pos]));
    return dot(
      sub(pos.get('Br')!, pos.get('C0')!),
      cross(sub(pos.get('Cl')!, pos.get('C0')!), sub(pos.get('F')!, pos.get('C0')!)),
    );
  };
  check('CHFClBr: wedge vs dash are enantiomers', Math.sign(volOf(w)) === -Math.sign(volOf(d)));
}

// 2-butene E/Z from drawn geometry.
const butene = (kind: 'cis' | 'trans'): Molecule => ({
  atoms: [
    { id: 'C1', element: 'C', x: 0, y: 0, charge: 0 },
    { id: 'C2', element: 'C', x: 100, y: 0, charge: 0 },
    { id: 'M1', element: 'C', x: -50, y: 87, charge: 0 },
    { id: 'M2', element: 'C', x: 150, y: kind === 'cis' ? 87 : -87, charge: 0 },
  ],
  bonds: [
    { id: 'd', fromAtomId: 'C1', toAtomId: 'C2', order: 2 },
    { id: 's1', fromAtomId: 'C1', toAtomId: 'M1', order: 1 },
    { id: 's2', fromAtomId: 'C2', toAtomId: 'M2', order: 1 },
  ],
});

for (const kind of ['cis', 'trans'] as const) {
  const mol = butene(kind);
  const perceived = perceiveStereo(mol);
  check(`2-butene (${kind}): double-bond stereo perceived`, perceived.cisTrans.length === 1, perceived.cisTrans.length);
  const conf = embed3D(mol, { includeHydrogens: true });
  const pos = new Map(conf.atoms.map(a => [a.id, a.pos]));
  const cosDih = dihedral(pos.get('M1')!, pos.get('C1')!, pos.get('C2')!, pos.get('M2')!);
  if (kind === 'cis') {
    check('2-butene cis: M1–C1=C2–M2 dihedral ≈ 0°', cosDih > 0.5, cosDih);
  } else {
    check('2-butene trans: M1–C1=C2–M2 dihedral ≈ 180°', cosDih < -0.5, cosDih);
  }
}

// ── SMILES stereo (@/@@ and /,\) ─────────────────────────────────────────────
import { engine } from '../index';
import { buildGraph } from '../graph';

const tripleForCenter = (
  mol: Molecule,
  conf: { atoms: { id: string; pos: V }[] },
): { center: string; vol: number } | null => {
  const g = buildGraph(mol);
  const center = mol.atoms.find(a => a.chiralParity !== undefined);
  if (!center) return null;
  const neighbors = [...(g.nodes.get(center.id)?.neighbors ?? [])].sort();
  if (neighbors.length < 3) return null;
  const pos = new Map(conf.atoms.map(a => [a.id, a.pos]));
  const c = pos.get(center.id)!;
  const vol = dot(
    sub(pos.get(neighbors[0])!, c),
    cross(sub(pos.get(neighbors[1])!, c), sub(pos.get(neighbors[2])!, c)),
  );
  return { center: center.id, vol };
};

{
  const molR = engine.parseSmiles('[C@@H](F)(Cl)Br');
  const molS = engine.parseSmiles('[C@H](F)(Cl)Br');
  const cR = molR.atoms.find(a => a.chiralParity !== undefined);
  const cS = molS.atoms.find(a => a.chiralParity !== undefined);
  check('SMILES @@/@: parity parsed on center', cR?.chiralParity !== undefined && cS?.chiralParity !== undefined);
  check('SMILES @@ vs @: opposite parity', Math.sign(cR?.chiralParity ?? 0) === -Math.sign(cS?.chiralParity ?? 0), {
    at: cR?.chiralParity,
    an: cS?.chiralParity,
  });

  const confR = embed3D(molR, { includeHydrogens: true });
  const confS = embed3D(molS, { includeHydrogens: true });
  const vR = tripleForCenter(molR, confR);
  const vS = tripleForCenter(molS, confS);
  check('SMILES chirality: 3D handedness matches parsed parity (R)', vR !== null && Math.sign(vR.vol) === Math.sign(cR!.chiralParity!), vR?.vol);
  check('SMILES chirality: 3D handedness matches parsed parity (S)', vS !== null && Math.sign(vS.vol) === Math.sign(cS!.chiralParity!), vS?.vol);
  check('SMILES @@/@ embed to enantiomers', vR !== null && vS !== null && Math.sign(vR.vol) === -Math.sign(vS.vol));
}

{
  const trans = engine.parseSmiles('F/C=C/F');
  const cis = engine.parseSmiles('F/C=C\\F');
  const tBond = trans.bonds.find(b => b.cisTransRef);
  const cBond = cis.bonds.find(b => b.cisTransRef);
  check('SMILES /=/: directional bonds parsed', tBond?.cisTransRef !== undefined && cBond?.cisTransRef !== undefined);
  check('SMILES /=/ vs /=\\: opposite side', tBond?.cisTransRef?.sameSide === false && cBond?.cisTransRef?.sameSide === true, {
    trans: tBond?.cisTransRef?.sameSide,
    cis: cBond?.cisTransRef?.sameSide,
  });

  const confT = embed3D(trans, { includeHydrogens: true });
  const confC = embed3D(cis, { includeHydrogens: true });
  const fF = (conf: typeof confT): number => {
    const pos = new Map(conf.atoms.map(a => [a.id, a.pos]));
    const fs = conf.atoms.filter(a => a.element === 'F');
    const cs = conf.atoms.filter(a => a.element === 'C');
    return dihedral(pos.get(fs[0].id)!, pos.get(cs[0].id)!, pos.get(cs[1].id)!, pos.get(fs[1].id)!);
  };
  check('SMILES F/C=C/F embeds trans (dihedral ≈ 180°)', fF(confT) < -0.5, fF(confT));
  check('SMILES F/C=C\\F embeds cis (dihedral ≈ 0°)', fF(confC) > 0.5, fF(confC));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
