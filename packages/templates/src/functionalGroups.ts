/**
 * Common R-group substituents ([*] = attachment to the canvas structure).
 * Layout order matches standard ChemDraw functional-group palettes (7×5).
 */
export type FunctionalGroupTemplate = {
  id: string;
  label: string;
  smiles: string;
};

export const FUNCTIONAL_GROUP_TEMPLATES: readonly FunctionalGroupTemplate[] = [
  { id: 'coome', label: 'COOMe', smiles: '[*]C(=O)OC' },
  { id: 'cn', label: 'CN', smiles: '[*]C#N' },
  { id: 'cho', label: 'CHO', smiles: '[*]C=O' },
  { id: 'cooh', label: 'COOH', smiles: '[*]C(=O)O' },
  { id: 'cf3', label: 'CF3', smiles: '[*]C(F)(F)F' },
  { id: 'ph', label: 'Ph', smiles: '[*]c1ccccc1' },
  { id: 'bn', label: 'Bn', smiles: '[*]Cc1ccccc1' },

  { id: 'boc', label: 'Boc', smiles: '[*]NC(=O)OC(C)(C)C' },
  { id: 'no2', label: 'NO2', smiles: '[*]N(=O)=O' },
  { id: 'cooet', label: 'COOEt', smiles: '[*]C(=O)OCC' },
  { id: 'coch3', label: 'COCH3', smiles: '[*]C(=O)C' },
  { id: 'me', label: 'Me', smiles: '[*]C' },
  { id: 'ome', label: 'OMe', smiles: '[*]OC' },
  { id: 'cbz', label: 'Cbz', smiles: '[*]NC(=O)OCCc1ccccc1' },

  { id: 'ms', label: 'Ms', smiles: '[*]OS(=O)(=O)C' },
  { id: 'fmoc', label: 'Fmoc', smiles: '[*]NC(=O)OCC1c2ccccc2-c3ccccc13' },
  { id: 'tos', label: 'Tos', smiles: '[*]OS(=O)(=O)c1ccc(C)cc1' },
  { id: 'tfa', label: 'TFA', smiles: '[*]C(=O)C(F)(F)F' },
  { id: 'pmb', label: 'PMB', smiles: '[*]OCc1ccc(OC)cc1' },
  { id: 'et', label: 'Et', smiles: '[*]CC' },
  { id: 'oet', label: 'OEt', smiles: '[*]OCC' },

  { id: 'n-pr', label: 'n-Pr', smiles: '[*]CCC' },
  { id: 'i-pr', label: 'i-Pr', smiles: '[*]C(C)C' },
  { id: 'n-pro', label: 'n-PrO', smiles: '[*]OCCC' },
  { id: 'i-pro', label: 'i-PrO', smiles: '[*]OC(C)C' },
  { id: 'n-bu', label: 'n-Bu', smiles: '[*]CCCC' },
  { id: 'i-bu', label: 'i-Bu', smiles: '[*]CC(C)C' },
  { id: 's-bu', label: 's-Bu', smiles: '[*]C(C)CC' },

  { id: 'n-obu', label: 'n-OBu', smiles: '[*]OCCCC' },
  { id: 't-obu', label: 't-OBu', smiles: '[*]OC(C)(C)C' },
  { id: 'oph', label: 'OPh', smiles: '[*]Oc1ccccc1' },
  { id: 'ccl2', label: 'CCl2', smiles: '[*]C(Cl)Cl' },
  { id: 'ccl3', label: 'CCl3', smiles: '[*]C(Cl)(Cl)Cl' },
  { id: 'no', label: 'NO', smiles: '[*]N=O' },
  { id: 'trt', label: 'Trt', smiles: '[*]C(c1ccccc1)(c2ccccc2)c3ccccc3' },
] as const;
