/**
 * Compare Moldraw MOL export vs PubChem (created vs imported structures).
 *
 * Run: npx tsx packages/core/src/__tests__/molExportVsPubchemAccuracy.ts
 * Requires network (PubChem).
 */
import type { Molecule } from '@moldraw/domain';
import { parseMolblock, moleculeToMolblock } from '../io/molblock';
import { pubchemMolblockFromSmiles, pubchem3dMolblockFromSmiles } from '../io/pubchemSmiles';
import { prepareImportFromMolblock } from '../molecule/importPrepare';
import {
  apply3DPose,
  poseFromMolblock3D,
} from '../molecule/perspective3D';
import { nativeEngine as engine } from '../../../engine/src/nativeEngine';
import { buildGraph } from '../../../engine/src/graph';
import { generate3DMolblock } from '../../../engine-3d/src/index';

const BOND_PX = 40;

interface Case {
  name: string;
  smiles: string;
}

const CASES: Case[] = [
  { name: 'benzene', smiles: 'c1ccccc1' },
  { name: 'aspirin', smiles: 'CC(=O)Oc1ccccc1C(=O)O' },
  { name: 'caffeine', smiles: 'CN1C=NC2=C1C(=O)N(C(=O)N2C)C' },
];

type Vec3 = { x: number; y: number; z: number };

const parseMolblockCoords3D = (molblock: string): Vec3[] => {
  const lines = molblock.split(/\r?\n/);
  const counts = lines.find(l => /V2000/.test(l));
  if (!counts) return [];
  const n = parseInt(counts.slice(0, 3).trim() || '0', 10);
  const start = lines.indexOf(counts) + 1;
  const out: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const line = lines[start + i];
    if (!line) break;
    out.push({
      x: parseFloat(line.slice(0, 10).trim() || '0'),
      y: parseFloat(line.slice(10, 20).trim() || '0'),
      z: parseFloat(line.slice(20, 30).trim() || '0'),
    });
  }
  return out;
};

const heavy = (mol: Molecule) => mol.atoms.filter(a => a.element !== 'H');

const heavyRanks = (mol: Molecule): Map<string, number> => {
  const g = buildGraph(mol);
  const hvy = new Set(heavy(mol).map(a => a.id));
  const byId = new Map(mol.atoms.map(a => [a.id, a]));
  let labels = new Map<string, string>();
  for (const id of hvy) {
    const a = byId.get(id)!;
    const deg = (g.nodes.get(id)?.neighbors ?? []).filter(n => hvy.has(n)).length;
    labels.set(id, `${a.element}:${deg}`);
  }
  for (let round = 0; round < 4; round++) {
    const next = new Map<string, string>();
    for (const id of hvy) {
      const nbs = (g.nodes.get(id)?.neighbors ?? [])
        .filter(n => hvy.has(n))
        .map(n => labels.get(n)!)
        .sort();
      next.set(id, `${labels.get(id)}>${nbs.join(',')}`);
    }
    labels = next;
  }
  const uniq = [...new Set(labels.values())].sort();
  const rankOf = new Map(uniq.map((s, i) => [s, i]));
  const out = new Map<string, number>();
  for (const [id, lab] of labels) out.set(id, rankOf.get(lab)!);
  return out;
};

const mapHeavyByRank = (ref: Molecule, other: Molecule): Map<string, string> | null => {
  const refR = heavyRanks(ref);
  const othR = heavyRanks(other);
  const refH = heavy(ref);
  const othH = heavy(other);
  if (refH.length !== othH.length) return null;

  const bucket = (atoms: typeof refH, ranks: Map<string, number>) => {
    const m = new Map<number, string[]>();
    for (const a of atoms) {
      const r = ranks.get(a.id)!;
      const list = m.get(r) ?? [];
      list.push(a.id);
      m.set(r, list);
    }
    return m;
  };
  const refB = bucket(refH, refR);
  const othB = bucket(othH, othR);
  const map = new Map<string, string>();
  for (const [rank, refIds] of refB) {
    const othIds = othB.get(rank);
    if (!othIds || othIds.length !== refIds.length) return null;
    const rs = [...refIds].sort();
    const os = [...othIds].sort();
    for (let i = 0; i < rs.length; i++) map.set(rs[i]!, os[i]!);
  }
  return map.size === refH.length ? map : null;
};

const centeredRmsd3D = (a: Vec3[], b: Vec3[]): number => {
  const n = a.length;
  if (n === 0) return 0;
  const c = (pts: Vec3[]) => ({
    x: pts.reduce((s, p) => s + p.x, 0) / n,
    y: pts.reduce((s, p) => s + p.y, 0) / n,
    z: pts.reduce((s, p) => s + p.z, 0) / n,
  });
  const ca = c(a);
  const cb = c(b);
  let s2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = a[i]!.x - ca.x - (b[i]!.x - cb.x);
    const dy = a[i]!.y - ca.y - (b[i]!.y - cb.y);
    const dz = a[i]!.z - ca.z - (b[i]!.z - cb.z);
    s2 += dx * dx + dy * dy + dz * dz;
  }
  return Math.sqrt(s2 / n);
};

const bondLengthMedian = (coords: Vec3[], bonds: { from: number; to: number }[]): number => {
  const lens: number[] = [];
  for (const b of bonds) {
    const p = coords[b.from];
    const q = coords[b.to];
    if (!p || !q) continue;
    lens.push(Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z));
  }
  lens.sort((x, y) => x - y);
  return lens.length ? lens[Math.floor(lens.length / 2)]! : 0;
};

const bondAngleMedianDeg = (coords: Vec3[], bonds: { from: number; to: number }[]): number => {
  const nbrs = new Map<number, number[]>();
  for (const b of bonds) {
    (nbrs.get(b.from) ?? nbrs.set(b.from, []).get(b.from)!).push(b.to);
    (nbrs.get(b.to) ?? nbrs.set(b.to, []).get(b.to)!).push(b.from);
  }
  const angles: number[] = [];
  for (let ai = 0; ai < coords.length; ai++) {
    const ns = nbrs.get(ai) ?? [];
    if (ns.length < 2) continue;
    const o = coords[ai]!;
    for (let i = 0; i < ns.length; i++) {
      for (let j = i + 1; j < ns.length; j++) {
        const a = coords[ns[i]!]!;
        const b = coords[ns[j]!]!;
        const u = { x: a.x - o.x, y: a.y - o.y, z: a.z - o.z };
        const v = { x: b.x - o.x, y: b.y - o.y, z: b.z - o.z };
        const lu = Math.hypot(u.x, u.y, u.z);
        const lv = Math.hypot(v.x, v.y, v.z);
        if (lu < 1e-6 || lv < 1e-6) continue;
        const dot = (u.x * v.x + u.y * v.y + u.z * v.z) / (lu * lv);
        angles.push((Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI);
      }
    }
  }
  angles.sort((x, y) => x - y);
  return angles.length ? angles[Math.floor(angles.length / 2)]! : 0;
};

const parseBondIndexPairs = (molblock: string, nAtoms: number) => {
  const lines = molblock.split(/\r?\n/);
  const counts = lines.find(l => /V2000/.test(l));
  if (!counts) return [];
  const start = lines.indexOf(counts) + 1 + nAtoms;
  const nBonds = parseInt(counts.slice(3, 6).trim() || '0', 10);
  const bonds: { from: number; to: number }[] = [];
  for (let i = 0; i < nBonds; i++) {
    const line = lines[start + i];
    if (!line) break;
    bonds.push({
      from: parseInt(line.slice(0, 3).trim() || '0', 10) - 1,
      to: parseInt(line.slice(3, 6).trim() || '0', 10) - 1,
    });
  }
  return bonds;
};

const scaleMoleculeToBond = (mol: Molecule, bondPx: number): Molecule => {
  const byId = new Map(mol.atoms.map(a => [a.id, a]));
  let sum = 0;
  let n = 0;
  for (const b of mol.bonds) {
    const a = byId.get(b.fromAtomId);
    const c = byId.get(b.toAtomId);
    if (!a || !c || a.element === 'H' || c.element === 'H') continue;
    sum += Math.hypot(a.x - c.x, a.y - c.y);
    n++;
  }
  const avg = n ? sum / n : bondPx;
  const s = bondPx / avg;
  return { ...mol, atoms: mol.atoms.map(a => ({ ...a, x: a.x * s, y: a.y * s })) };
};

const withPerspectiveFrom3D = (
  mol2d: Molecule,
  molblock3d: string,
  bondLengthPx: number,
): Molecule | null => {
  const atomIdsInOrder = mol2d.atoms.map(a => a.id);
  const pose = poseFromMolblock3D(
    molblock3d,
    atomIdsInOrder,
    new Set(atomIdsInOrder),
    mol2d.atoms,
    bondLengthPx,
  );
  if (!pose) return null;
  return apply3DPose(mol2d, pose);
};

const pairedHeavyCoords = (
  refMol: Molecule,
  refCoords: Vec3[],
  otherMol: Molecule,
  otherCoords: Vec3[],
): { ref: Vec3[]; other: Vec3[] } | null => {
  const map = mapHeavyByRank(refMol, otherMol);
  if (!map) return null;
  const refIdx = new Map(refMol.atoms.map((a, i) => [a.id, i]));
  const othIdx = new Map(otherMol.atoms.map((a, i) => [a.id, i]));
  const ref: Vec3[] = [];
  const other: Vec3[] = [];
  for (const [rid, oid] of map) {
    const ri = refIdx.get(rid);
    const oi = othIdx.get(oid);
    if (ri == null || oi == null) continue;
    ref.push(refCoords[ri]!);
    other.push(otherCoords[oi]!);
  }
  return ref.length ? { ref, other } : null;
};

const report3D = (
  label: string,
  molWithPose: Molecule,
  refMol: Molecule,
  refMb: string,
) => {
  const exportedMb = moleculeToMolblock(molWithPose);
  const expCoords = parseMolblockCoords3D(exportedMb);
  const refCoords = parseMolblockCoords3D(refMb);
  const zSpan = Math.max(...expCoords.map(c => c.z)) - Math.min(...expCoords.map(c => c.z));
  const paired = pairedHeavyCoords(refMol, refCoords, molWithPose, expCoords);
  if (!paired) {
    console.log(`  ${label}: SKIP — atom mapping failed`);
    return;
  }
  const rmsd = centeredRmsd3D(paired.ref, paired.other);
  const refBonds = parseBondIndexPairs(refMb, refCoords.length);
  const expBonds = parseBondIndexPairs(exportedMb, expCoords.length);
  const refBL = bondLengthMedian(refCoords, refBonds);
  const expBL = bondLengthMedian(expCoords, expBonds);
  const refAng = bondAngleMedianDeg(refCoords, refBonds);
  const expAng = bondAngleMedianDeg(expCoords, expBonds);

  console.log(`  ${label}:`);
  console.log(`    z-span in export: ${zSpan.toFixed(3)} Å ${zSpan < 0.01 ? '(flat — bad)' : '(3D OK)'}`);
  console.log(`    vs PubChem 3D — coord RMSD: ${rmsd.toFixed(3)} Å`);
  console.log(`    median bond: export ${expBL.toFixed(3)} Å · PubChem ${refBL.toFixed(3)} Å`);
  console.log(`    median angle: export ${expAng.toFixed(1)}° · PubChem ${refAng.toFixed(1)}°`);
};

const runCase = async (c: Case) => {
  console.log(`\n=== ${c.name} ===`);

  const pc2dMb = await pubchemMolblockFromSmiles(c.smiles);
  const pc3dMb = await pubchem3dMolblockFromSmiles(c.smiles);
  if (!pc2dMb || !pc3dMb) {
    console.log('  SKIP: PubChem 2D/3D unavailable');
    return;
  }

  const refMol = parseMolblock(pc3dMb);

  // A) Moldraw-created: native 2D + native 3D embed (correct atom order)
  let native2d = engine.generate2D(engine.parseSmiles(c.smiles), { bondLengthPx: BOND_PX });
  native2d = scaleMoleculeToBond(native2d, BOND_PX);
  const native3dMb = generate3DMolblock(native2d, { includeHydrogens: false, count: 1 });
  const nativePose = withPerspectiveFrom3D(native2d, native3dMb, BOND_PX);
  if (!nativePose) {
    console.log('  A) native create: FAIL — pose mapping');
  } else {
    console.log('  A) Moldraw-created (native 2D + native 3D embed → export):');
    report3D('created vs PubChem 3D', nativePose, refMol, pc3dMb);
    // Round-trip: export should match the embed source
    const rtPaired = pairedHeavyCoords(
      native2d,
      parseMolblockCoords3D(native3dMb),
      nativePose,
      parseMolblockCoords3D(moleculeToMolblock(nativePose)),
    );
    if (rtPaired) {
      const rtRmsd = centeredRmsd3D(rtPaired.ref, rtPaired.other);
      const rtZ = parseMolblockCoords3D(moleculeToMolblock(nativePose));
      const rtZSpan = Math.max(...rtZ.map(p => p.z)) - Math.min(...rtZ.map(p => p.z));
      console.log(`    round-trip vs embed source: RMSD ${rtRmsd.toFixed(3)} Å, z-span ${rtZSpan.toFixed(3)} Å`);
    }
  }

  // B) PubChem import: 2D from PubChem
  const imported = prepareImportFromMolblock({ molblock: pc2dMb, bondLengthPx: BOND_PX });
  if (!imported.ok) {
    console.log('  B) PubChem import: FAIL —', imported.error);
    return;
  }
  const pubMol: Molecule = { atoms: imported.atoms, bonds: imported.bonds };
  const pubPose = withPerspectiveFrom3D(pubMol, pc3dMb, BOND_PX);
  if (!pubPose) {
    console.log('  B) PubChem import: FAIL — pose mapping');
  } else {
    console.log('  B) PubChem-imported (PubChem 2D + same 3D pose → export):');
    report3D('imported', pubPose, refMol, pc3dMb);
  }

  // Round-trip: export should preserve pose geometry (low RMSD vs PubChem 3D when same pose applied)
  const flatMb = moleculeToMolblock(pubMol);
  const flatZ = parseMolblockCoords3D(flatMb).every(z => Math.abs(z.z) < 1e-4);
  console.log('  Flat export (no perspective):');
  console.log(`    z all zero: ${flatZ ? 'yes' : 'NO'}`);

  const pc2dMol = parseMolblock(pc2dMb);
  const paired2d = pairedHeavyCoords(pc2dMol, parseMolblockCoords3D(pc2dMb), pubMol, parseMolblockCoords3D(flatMb));
  if (paired2d) {
    const rmsd2d = centeredRmsd3D(paired2d.ref, paired2d.other);
    console.log(`    2D layout RMSD vs PubChem 2D: ${rmsd2d.toFixed(3)} Å (depiction may differ)`);
  }
};

(async () => {
  console.log('Moldraw MOL export accuracy — created vs PubChem-imported');
  for (const c of CASES) {
    await runCase(c);
    await new Promise(r => setTimeout(r, 350));
  }
  console.log('\nDone. Low 3D RMSD (<0.05 Å) means export preserves pose; PubChem vs native 2D layouts differ in xy only.');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
