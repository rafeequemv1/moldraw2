/**
 * NativeEngine — the pure-TypeScript "local brain" implementation of
 * `MoleculeEngine`. Always available, offline, no WASM.
 *
 * Composition of the engine submodules:
 *   io/molblockV2000  — V2000 read/write
 *   smiles/*          — SMILES read + canonical write
 *   chem/rings        — SSSR
 *   chem/aromaticity  — perceive + kekulize
 *   chem/valence      — implicit H
 *   chem/properties   — formula / MW / exact mass / charge
 *   layout/generate2d — native coordinates
 */
import type { Molecule } from '@moldraw/domain';
import type {
  Conformer3DResult,
  Generate2DOptions,
  Generate3DOptions,
  GenerateConformersOptions,
  MoleculeEngine,
  MoleculeProperties,
  Refine3DRegionOptions,
  Refine3DRegionResult,
  Ring,
  ToMolblockOptions,
} from './types';
import { moleculeToMolblockV2000, parseMolblockV2000 } from './io/molblockV2000';
import { parseSmilesToMolecule } from './smiles/parse';
import { moleculeToSmiles } from './smiles/write';
import { perceiveRings } from './chem/rings';
import { kekulize, perceiveAromaticity } from './chem/aromaticity';
import { implicitHydrogensForMolecule } from './chem/valence';
import { moleculeProperties } from './chem/properties';
import { generate2D as generate2DNative } from './layout/generate2d';

const missing3d = (api: string): never => {
  throw new Error(
    `${api} requires the optional engine-3d peer — import from '@moldraw/engine-3d' (or bind via App/worker).`,
  );
};

export class NativeEngine implements MoleculeEngine {
  readonly name = 'native';

  parseMolblock(text: string): Molecule {
    return parseMolblockV2000(text);
  }

  parseSmiles(smiles: string): Molecule {
    // Parse then kekulize so downstream (valence/H, export) sees explicit bonds.
    return kekulize(parseSmilesToMolecule(smiles));
  }

  toMolblock(mol: Molecule, opts: ToMolblockOptions = {}): string {
    // V3000 not yet implemented natively; falls back to V2000 (documented gap).
    return moleculeToMolblockV2000(mol, {
      title: opts.title,
      dativeAsType9: opts.dativeAsType9,
    });
  }

  toSmiles(mol: Molecule): string {
    return moleculeToSmiles(mol);
  }

  perceiveRings(mol: Molecule): Ring[] {
    return perceiveRings(mol);
  }

  perceiveAromaticity(mol: Molecule): Molecule {
    return perceiveAromaticity(mol);
  }

  kekulize(mol: Molecule): Molecule {
    return kekulize(mol);
  }

  implicitHydrogens(mol: Molecule): Map<string, number> {
    return implicitHydrogensForMolecule(kekulize(mol));
  }

  /**
   * Native 2D layout (always available offline). Indigo quality path lives in
   * engine-2d / worker via cleanupPreferIndigo and SMILES helpers.
   */
  generate2D(mol: Molecule, opts: Generate2DOptions = {}): Molecule {
    if (mol.atoms.length === 0) return mol;
    return generate2DNative(mol, opts);
  }

  /**
   * 3D APIs live in optional `engine-3d` so the 2D worker / native brain stay light.
   * Prefer `generate3DMolblock` / `refine3DRegion` from `../engine-3d`.
   */
  generate3D(_mol: Molecule, opts?: Generate3DOptions): string {
    void opts;
    return missing3d('generate3D');
  }

  generate3DConformers(
    _mol: Molecule,
    opts?: GenerateConformersOptions,
  ): Conformer3DResult[] {
    void opts;
    return missing3d('generate3DConformers');
  }

  refine3DRegion(mol: Molecule, opts: Refine3DRegionOptions): Refine3DRegionResult {
    void mol;
    void opts;
    return missing3d('refine3DRegion');
  }

  properties(mol: Molecule): MoleculeProperties {
    return moleculeProperties(mol);
  }
}

/** Shared singleton — the engine is stateless, so one instance is enough. */
export const nativeEngine = new NativeEngine();
