/**
 * Shared 2D layout benchmark corpus — Tier A/B/C.
 * Used by offline CI (`runLayoutBenchmark.ts`) and optional online PubChem/Indigo runners.
 */
export type LayoutBenchmarkTier = 'A' | 'B' | 'C';

export interface LayoutBenchmarkCase {
  name: string;
  smiles: string;
  tier: LayoutBenchmarkTier;
  cid?: number;
}

/** ~70 molecules: chains, aromatics, heterocycles, fused, steroids, polycyclics. */
export const LAYOUT_BENCHMARK_CASES: LayoutBenchmarkCase[] = [
  // ── Tier A — everyday organics ──────────────────────────────────────────
  { name: 'methane', smiles: 'C', tier: 'A' },
  { name: 'ethane', smiles: 'CC', tier: 'A' },
  { name: 'ethanol', smiles: 'CCO', tier: 'A' },
  { name: 'methanol', smiles: 'CO', tier: 'A' },
  { name: 'propane', smiles: 'CCC', tier: 'A' },
  { name: 'butane', smiles: 'CCCC', tier: 'A' },
  { name: 'isobutane', smiles: 'CC(C)C', tier: 'A' },
  { name: 'acetone', smiles: 'CC(=O)C', tier: 'A' },
  { name: 'acetic-acid', smiles: 'CC(=O)O', tier: 'A' },
  { name: 'ethylamine', smiles: 'CCN', tier: 'A' },
  { name: 'ethylene', smiles: 'C=C', tier: 'A' },
  { name: 'ethyne', smiles: 'C#C', tier: 'A' },
  { name: 'benzene', smiles: 'c1ccccc1', tier: 'A' },
  { name: 'toluene', smiles: 'Cc1ccccc1', tier: 'A' },
  { name: 'phenol', smiles: 'Oc1ccccc1', tier: 'A' },
  { name: 'aniline', smiles: 'Nc1ccccc1', tier: 'A' },
  { name: 'chlorobenzene', smiles: 'Clc1ccccc1', tier: 'A' },
  { name: 'nitrobenzene', smiles: 'O=[N+]([O-])c1ccccc1', tier: 'A' },
  { name: 'benzoic-acid', smiles: 'O=C(O)c1ccccc1', tier: 'A' },
  { name: 'styrene', smiles: 'C=Cc1ccccc1', tier: 'A' },
  { name: 'cyclohexane', smiles: 'C1CCCCC1', tier: 'A' },
  { name: 'cyclopentane', smiles: 'C1CCCC1', tier: 'A' },
  { name: 'cyclohexanol', smiles: 'OC1CCCCC1', tier: 'A' },
  { name: 'pyridine', smiles: 'c1ccncc1', tier: 'A' },
  { name: 'furan', smiles: 'c1ccoc1', tier: 'A' },
  { name: 'thiophene', smiles: 'c1ccsc1', tier: 'A' },
  { name: 'pyrrole', smiles: 'c1cc[nH]c1', tier: 'A' },
  { name: 'imidazole', smiles: 'c1cnc[nH]1', tier: 'A' },
  { name: 'morpholine', smiles: 'C1COCCN1', tier: 'A' },
  { name: 'piperidine', smiles: 'C1CCNCC1', tier: 'A' },
  { name: 'piperazine', smiles: 'C1CNCCN1', tier: 'A' },
  { name: 'aspirin', smiles: 'CC(=O)Oc1ccccc1C(=O)O', tier: 'A', cid: 2244 },
  { name: 'caffeine', smiles: 'CN1C=NC2=C1C(=O)N(C(=O)N2C)C', tier: 'A', cid: 2519 },
  { name: 'ibuprofen', smiles: 'CC(C)Cc1ccc(cc1)C(C)C(=O)O', tier: 'A', cid: 3672 },
  { name: 'paracetamol', smiles: 'CC(=O)Nc1ccc(O)cc1', tier: 'A', cid: 1983 },
  { name: 'nicotine', smiles: 'CN1CCC[C@H]1c2cccnc2', tier: 'A' },
  { name: 'glycine', smiles: 'NCC(=O)O', tier: 'A' },
  { name: 'alanine', smiles: 'CC(N)C(=O)O', tier: 'A' },
  { name: 'lactic-acid', smiles: 'CC(O)C(=O)O', tier: 'A' },
  { name: 'malonic-acid', smiles: 'O=C(O)CC(=O)O', tier: 'A' },
  { name: 'succinic-acid', smiles: 'O=C(O)CCC(=O)O', tier: 'A' },
  { name: 'dimethyl-ether', smiles: 'COC', tier: 'A' },
  { name: 'acetaldehyde', smiles: 'CC=O', tier: 'A' },
  { name: 'formamide', smiles: 'NC=O', tier: 'A' },
  { name: 'urea', smiles: 'NC(=O)N', tier: 'A' },
  { name: 'dimethylamine', smiles: 'CNC', tier: 'A' },
  { name: 'trimethylamine', smiles: 'CN(C)C', tier: 'A' },
  { name: 'allyl-alcohol', smiles: 'C=CCO', tier: 'A' },
  { name: 'acrylonitrile', smiles: 'C=CC#N', tier: 'A' },
  { name: 'vinyl-chloride', smiles: 'C=CCl', tier: 'A' },

  // ── Tier B — fused / medium polycyclics ───────────────────────────────
  { name: 'naphthalene', smiles: 'c1ccc2ccccc2c1', tier: 'B' },
  { name: 'anthracene', smiles: 'c1ccc2cc3ccccc3cc2c1', tier: 'B' },
  { name: 'phenanthrene', smiles: 'c1ccc2c(c1)ccc3ccccc23', tier: 'B' },
  { name: 'indole', smiles: 'c1ccc2[nH]ccc2c1', tier: 'B' },
  { name: 'quinoline', smiles: 'c1ccc2ncccc2c1', tier: 'B' },
  { name: 'isoquinoline', smiles: 'c1ccc2nccc3ccccc23', tier: 'B' },
  { name: 'biphenyl', smiles: 'c1ccc(-c2ccccc2)cc1', tier: 'B' },
  { name: 'fluorene', smiles: 'c1ccc2c(c1)Cc3ccccc32', tier: 'B' },
  { name: 'carbazole', smiles: 'c1ccc2[nH]c3ccccc3c2c1', tier: 'B' },
  { name: 'decalin-cis', smiles: 'C1CCC2CCCCC2C1', tier: 'B' },
  { name: 'bicyclo-2-2-2-octane', smiles: 'C1CC2CCC1CC2', tier: 'B' },
  { name: 'adamantane', smiles: 'C1C2CC3CC(CC(C3)C2)C1', tier: 'B' },
  { name: 'cholesterol', smiles: 'CC(C)CCCC(C)C1CCC2C3CC=C4CC(O)CCC4(C)C3CCC12C', tier: 'B', cid: 5997 },
  { name: 'testosterone', smiles: 'CC12CCC3C(C1CCC2O)CCC4=CC(=O)CCC34C', tier: 'B' },
  { name: 'estradiol', smiles: 'CC12CCC3C(C1CCC2O)CCC4=C3CCC4O', tier: 'B' },
  { name: 'penicillinG', smiles: 'CC1(C)SC2C(NC(=O)Cc3ccccc3)C(=O)N2C1C(=O)O', tier: 'B' },
  { name: 'cephalexin', smiles: 'CC1=C(NC(=O)C(N)C2=CC=CC=C2)C(=O)N2C1SC(C)C2C(=O)O', tier: 'B' },
  { name: 'purine', smiles: 'c1ncnc2[nH]cnc12', tier: 'B' },
  { name: 'adenine', smiles: 'Nc1ncnc2[nH]cnc12', tier: 'B' },
  { name: 'guanine', smiles: 'Nc1nc2c([nH]1)nc[nH]c2=O', tier: 'B' },
  { name: 'coumarin', smiles: 'O=c1ccc2ccccc2o1', tier: 'B' },
  { name: 'indomethacin', smiles: 'COc1ccc2c(c1)c(CC(=O)O)c(C)n2C(=O)c1ccc(Cl)cc1', tier: 'B' },

  // ── Tier C — hard polycyclics / cages ─────────────────────────────────
  {
    name: 'paclitaxel-like',
    smiles:
      'CC(=O)OC1C(=O)C2(C)C(O)CC3OCC3(OC(C)=O)C2C(OC(=O)c2ccccc2)C2(O)CC(OC(=O)C(O)C(NC(=O)c3ccccc3)c3ccccc3)C(C)=C1C2(C)C',
    tier: 'C',
  },
  {
    name: 'paclitaxel-CID36314',
    smiles:
      'CC1=C2[C@H](C(=O)[C@]3([C@H](C[C@@H]4[C@]([C@H]3[C@@H]([C@@](C2(C)C)(C[C@@H]1OC(=O)[C@@H]([C@H](C5=CC=CC=C5)NC(=O)C6=CC=CC=C6)O)O)OC(=O)C7=CC=CC=C7)(CO4)OC(=O)C)O)C)OC(=O)C',
    tier: 'C',
    cid: 36314,
  },
  { name: 'cubane', smiles: 'C12C3C4C1C5C3C45C2', tier: 'C' },
  { name: 'dodecahedrane', smiles: 'C12C3C4C5C1C6C7C2C8C3C9C4C%10C5C6C%11C7C%12C8C9C%10C%11C%12', tier: 'C' },
  { name: 'strychnine', smiles: 'O=C1NC2=C(C3CC4CC3C(C=C)CN4C)C1=CC=CC2', tier: 'C' },
  { name: 'morphine', smiles: 'CN1CC[C@]23c4c5ccc(O)c4O[C@H]2[C@@H](O)C=C[C@H]3[C@H]1C5', tier: 'C' },
  { name: 'codeine', smiles: 'COc1ccc2c3c1O[C@H]4[C@@H](C2)N(C)CC[C@]34C=C', tier: 'C' },
  { name: 'vitamin-D3', smiles: 'CC(C)CCCC(C)C1CCC2C1CCC3C2CCC4C3(C)CCC(O)C4C', tier: 'C' },
  { name: 'progesterone', smiles: 'CC(=O)C1CCC2C1(CCC3C2CCC4=CC(=O)CCC34C)C', tier: 'C' },
  { name: 'digitoxin', smiles: 'CC(=O)OC1C(C)CC2C3CC4C5CCC6C(CCC6C5CCC4(C)C3CC2C1O)O', tier: 'C' },
];

export const tierCases = (tier: LayoutBenchmarkTier): LayoutBenchmarkCase[] =>
  LAYOUT_BENCHMARK_CASES.filter(c => c.tier === tier);
