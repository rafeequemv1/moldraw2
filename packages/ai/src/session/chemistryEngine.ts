/**
 * Shared chemistry interface. Browser App keeps workers; Node session uses
 * `@moldraw/engine`. Same methods, different hosts.
 */
import type { Molecule } from '@moldraw/domain';
import {
  aromatizeMolecule,
  checkStructure,
  cleanupMolecule,
  convertExplicitHydrogens,
  engine,
  type AromatizeMode,
  type ExplicitHydrogenMode,
} from '@moldraw/engine';

export interface ChemistryValidateIssue {
  type: string;
  message: string;
}

export interface ChemistryValidateResult {
  ok: boolean;
  issues: ChemistryValidateIssue[];
}

export interface ChemistryEngine {
  parseSmiles(smiles: string): Molecule;
  generate2D(mol: Molecule, opts?: { bondLengthPx?: number }): Molecule;
  aromatize(mol: Molecule, mode?: AromatizeMode): Molecule;
  cleanup(mol: Molecule, opts?: { bondLengthPx?: number }): Molecule;
  validate(mol: Molecule): ChemistryValidateResult;
  toSmiles?(mol: Molecule): string;
  convertExplicitHydrogens?(mol: Molecule, mode?: ExplicitHydrogenMode): Molecule;
}

export function createNodeChemistryEngine(): ChemistryEngine {
  return {
    parseSmiles: smiles => engine.parseSmiles(smiles),
    generate2D: (mol, opts) => engine.generate2D(mol, { bondLengthPx: opts?.bondLengthPx }),
    aromatize: (mol, mode = 'aromatize') => aromatizeMolecule(mol, mode),
    cleanup: (mol, opts) => {
      const bondLengthPx = opts?.bondLengthPx ?? 40;
      const result = cleanupMolecule(mol, {
        bondLengthPx,
        preserveOrientation: true,
      });
      return result.molecule ?? mol;
    },
    validate: mol => {
      const r = checkStructure(mol);
      return {
        ok: r.ok,
        issues: r.issues.map(i => ({ type: i.type, message: i.message })),
      };
    },
    toSmiles: mol => engine.toSmiles(mol),
    convertExplicitHydrogens: (mol, mode = 'auto') => convertExplicitHydrogens(mol, mode),
  };
}
