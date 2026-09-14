/**
 * Common coordination ligands ([*] = attachment toward the metal).
 * Place with the ligand picker / Template library, then use the dative tool
 * if a coordination arrow is needed.
 */
export type LigandTemplate = {
  id: string;
  label: string;
  /** Display name (may include subscripts via unicode). */
  name: string;
  smiles: string;
};

export const LIGAND_TEMPLATES: readonly LigandTemplate[] = [
  { id: 'nh3', label: 'NH₃', name: 'Ammine', smiles: '[*]N' },
  { id: 'h2o', label: 'H₂O', name: 'Aqua', smiles: '[*]O' },
  { id: 'co', label: 'CO', name: 'Carbonyl', smiles: '[*]C#[O+]' },
  { id: 'cn', label: 'CN', name: 'Cyano', smiles: '[*]C#N' },
  { id: 'cl', label: 'Cl', name: 'Chlorido', smiles: '[*]Cl' },
  { id: 'py', label: 'py', name: 'Pyridine', smiles: '[*]n1ccccc1' },
  { id: 'pph3', label: 'PPh₃', name: 'Triphenylphosphine', smiles: '[*]P(c1ccccc1)(c1ccccc1)c1ccccc1' },
  { id: 'bpy', label: 'bpy', name: '2,2′-Bipyridine', smiles: '[*]n1ccccc1-c2ncccc2' },
  { id: 'en', label: 'en', name: 'Ethylenediamine', smiles: '[*]NCCN' },
  { id: 'acac', label: 'acac', name: 'Acetylacetonate', smiles: '[*]O/C(=C\\C(=O)C)/C' },
  { id: 'cp', label: 'Cp', name: 'Cyclopentadienyl', smiles: '[*]c1cccc1' },
  { id: 'cp-star', label: 'Cp*', name: 'Pentamethylcyclopentadienyl', smiles: '[*]c1c(C)c(C)c(C)c1C' },
  { id: 'cod', label: 'cod', name: '1,5-Cyclooctadiene', smiles: 'C1C/C=C\\CC/C=C\\1' },
  { id: 'dppe', label: 'dppe', name: '1,2-Bis(diphenylphosphino)ethane', smiles: '[*]P(c1ccccc1)(c1ccccc1)CCP(c1ccccc1)c1ccccc1' },
  { id: 'ootf', label: 'OTf', name: 'Triflate', smiles: '[*]OS(=O)(=O)C(F)(F)F' },
  { id: 'oh', label: 'OH', name: 'Hydroxido', smiles: '[*]O' },
] as const;

export const LIGAND_BY_ID: ReadonlyMap<string, LigandTemplate> = new Map(
  LIGAND_TEMPLATES.map(t => [t.id, t]),
);
