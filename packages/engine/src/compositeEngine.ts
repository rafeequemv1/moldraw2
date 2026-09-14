/**
 * CompositeEngine — native by default, delegating specific operations to an
 * optional accelerator (e.g. an RDKit-backed adapter) when it's present and the
 * caller prefers it. Keeps callers decoupled from RDKit entirely.
 *
 * The accelerator is deliberately a *subset* of `MoleculeEngine` (all optional),
 * so an RDKit adapter only needs to implement what it improves (e.g. layout via
 * CoordGen, or InChI later). Everything else falls through to native.
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
  ToSmilesOptions,
} from './types';
import { nativeEngine } from './nativeEngine';

export type EngineAccelerator = Partial<MoleculeEngine>;

export interface CreateEngineOptions {
  /** Which implementation to prefer when both can do an op. Default 'native'. */
  prefer?: 'native' | 'accelerator';
  accelerator?: EngineAccelerator | null;
  /** Per-op override, e.g. { generate2D: 'accelerator' }. */
  overrides?: Partial<Record<keyof MoleculeEngine, 'native' | 'accelerator'>>;
}

export class CompositeEngine implements MoleculeEngine {
  readonly name = 'composite';
  private native: MoleculeEngine;
  private accel: EngineAccelerator | null;
  private prefer: 'native' | 'accelerator';
  private overrides: Partial<Record<keyof MoleculeEngine, 'native' | 'accelerator'>>;

  constructor(opts: CreateEngineOptions = {}) {
    this.native = nativeEngine;
    this.accel = opts.accelerator ?? null;
    this.prefer = opts.prefer ?? 'native';
    this.overrides = opts.overrides ?? {};
  }

  private pick<K extends keyof MoleculeEngine>(op: K): MoleculeEngine[K] {
    const choice = this.overrides[op] ?? this.prefer;
    const accelFn = this.accel?.[op];
    if (choice === 'accelerator' && typeof accelFn === 'function') {
      return (accelFn as MoleculeEngine[K]);
    }
    return this.native[op];
  }

  parseMolblock(text: string): Molecule {
    return (this.pick('parseMolblock') as MoleculeEngine['parseMolblock']).call(
      this.resolveThis('parseMolblock'),
      text,
    );
  }
  parseSmiles(smiles: string): Molecule {
    return (this.pick('parseSmiles') as MoleculeEngine['parseSmiles']).call(
      this.resolveThis('parseSmiles'),
      smiles,
    );
  }
  toMolblock(mol: Molecule, opts?: ToMolblockOptions): string {
    return (this.pick('toMolblock') as MoleculeEngine['toMolblock']).call(
      this.resolveThis('toMolblock'),
      mol,
      opts,
    );
  }
  toSmiles(mol: Molecule, opts?: ToSmilesOptions): string {
    return (this.pick('toSmiles') as MoleculeEngine['toSmiles']).call(
      this.resolveThis('toSmiles'),
      mol,
      opts,
    );
  }
  perceiveRings(mol: Molecule): Ring[] {
    return (this.pick('perceiveRings') as MoleculeEngine['perceiveRings']).call(
      this.resolveThis('perceiveRings'),
      mol,
    );
  }
  perceiveAromaticity(mol: Molecule): Molecule {
    return (this.pick('perceiveAromaticity') as MoleculeEngine['perceiveAromaticity']).call(
      this.resolveThis('perceiveAromaticity'),
      mol,
    );
  }
  kekulize(mol: Molecule): Molecule {
    return (this.pick('kekulize') as MoleculeEngine['kekulize']).call(this.resolveThis('kekulize'), mol);
  }
  implicitHydrogens(mol: Molecule): Map<string, number> {
    return (this.pick('implicitHydrogens') as MoleculeEngine['implicitHydrogens']).call(
      this.resolveThis('implicitHydrogens'),
      mol,
    );
  }
  generate2D(mol: Molecule, opts?: Generate2DOptions): Molecule {
    return (this.pick('generate2D') as MoleculeEngine['generate2D']).call(
      this.resolveThis('generate2D'),
      mol,
      opts,
    );
  }
  generate3D(mol: Molecule, opts?: Generate3DOptions): string {
    return (this.pick('generate3D') as MoleculeEngine['generate3D']).call(
      this.resolveThis('generate3D'),
      mol,
      opts,
    );
  }
  generate3DConformers(mol: Molecule, opts?: GenerateConformersOptions): Conformer3DResult[] {
    return (this.pick('generate3DConformers') as MoleculeEngine['generate3DConformers']).call(
      this.resolveThis('generate3DConformers'),
      mol,
      opts,
    );
  }
  refine3DRegion(mol: Molecule, opts: Refine3DRegionOptions): Refine3DRegionResult {
    return (this.pick('refine3DRegion') as MoleculeEngine['refine3DRegion']).call(
      this.resolveThis('refine3DRegion'),
      mol,
      opts,
    );
  }
  properties(mol: Molecule): MoleculeProperties {
    return (this.pick('properties') as MoleculeEngine['properties']).call(
      this.resolveThis('properties'),
      mol,
    );
  }

  /** Return the object that owns the picked method so `this` binds correctly. */
  private resolveThis(op: keyof MoleculeEngine): object {
    const choice = this.overrides[op] ?? this.prefer;
    if (choice === 'accelerator' && this.accel && typeof this.accel[op] === 'function') {
      return this.accel;
    }
    return this.native;
  }
}
