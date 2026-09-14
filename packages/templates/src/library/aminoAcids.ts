/**
 * Teaching templates: 20 proteinogenic amino acids as SMILES (achiral / simple
 * 2D layouts from RDKit — suitable for high-school boards).
 */
export type AminoAcidTemplate = {
  code: string;
  name: string;
  smiles: string;
};

export const AMINO_ACID_TEMPLATES: readonly AminoAcidTemplate[] = [
  { code: 'A', name: 'Alanine', smiles: 'CC(N)C(=O)O' },
  { code: 'R', name: 'Arginine', smiles: 'NC(=N)NCCCC(N)C(=O)O' },
  { code: 'N', name: 'Asparagine', smiles: 'NC(CC(=O)N)C(=O)O' },
  { code: 'D', name: 'Aspartic acid', smiles: 'NC(CC(=O)O)C(=O)O' },
  { code: 'C', name: 'Cysteine', smiles: 'NC(CS)C(=O)O' },
  { code: 'Q', name: 'Glutamine', smiles: 'NC(CCC(=O)N)C(=O)O' },
  { code: 'E', name: 'Glutamic acid', smiles: 'NC(CCC(=O)O)C(=O)O' },
  { code: 'G', name: 'Glycine', smiles: 'NCC(=O)O' },
  { code: 'H', name: 'Histidine', smiles: 'NC(Cc1cncn1)C(=O)O' },
  { code: 'I', name: 'Isoleucine', smiles: 'CCC(C)C(N)C(=O)O' },
  { code: 'L', name: 'Leucine', smiles: 'CC(C)CC(N)C(=O)O' },
  { code: 'K', name: 'Lysine', smiles: 'NCCCCC(N)C(=O)O' },
  { code: 'M', name: 'Methionine', smiles: 'CSCCC(N)C(=O)O' },
  { code: 'F', name: 'Phenylalanine', smiles: 'NC(Cc1ccccc1)C(=O)O' },
  { code: 'P', name: 'Proline', smiles: 'O=C(O)C1CCCN1' },
  { code: 'S', name: 'Serine', smiles: 'NC(CO)C(=O)O' },
  { code: 'T', name: 'Threonine', smiles: 'CC(O)C(N)C(=O)O' },
  { code: 'W', name: 'Tryptophan', smiles: 'NC(Cc1c[nH]c2ccccc12)C(=O)O' },
  { code: 'Y', name: 'Tyrosine', smiles: 'NC(Cc1ccc(O)cc1)C(=O)O' },
  { code: 'V', name: 'Valine', smiles: 'CC(C)C(N)C(=O)O' },
] as const;

export const AMINO_ACID_BY_CODE: ReadonlyMap<string, AminoAcidTemplate> = new Map(
  AMINO_ACID_TEMPLATES.map(t => [t.code, t]),
);
