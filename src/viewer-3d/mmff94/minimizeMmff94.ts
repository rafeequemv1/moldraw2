/**
 * OpenChemLib ForceFieldMMFF94 wrapper — organic-oriented energy minimization.
 * Complements native UFF; better bond/angle/torsion geometry for drug-like organics.
 * OCL is loaded on demand so the main app chunk stays lean.
 */
import { ensureOclResources } from '../conformers/oclResources';
import { countHeavyAtomsInMolblock, normalizeOclMolfile } from '../conformers/molfileUtils';
import { molblockHas3dCoords } from './molblock3dCheck';
import { prepareMoleculeForMmff94 } from './prepareForMmff94';
import {
  Mmff94Error,
  type MinimizeMmff94Options,
  type Mmff94MinimizeResult,
  type Mmff94Table,
} from './types';

const DEFAULT_MAX_HEAVY = 180;
const DEFAULT_MAX_ITS = 2000;
const DEFAULT_GRAD_TOL = 1e-4;
const DEFAULT_FUNC_TOL = 1e-6;
const DEFAULT_TABLE: Mmff94Table = 'MMFF94';

const throwIfAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    throw new Mmff94Error('cancelled', 'MMFF94 minimization cancelled.');
  }
};

const yieldToUi = (): Promise<void> =>
  new Promise(resolve => {
    window.setTimeout(resolve, 0);
  });

const errMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

/**
 * Minimize a 3D molblock with OpenChemLib MMFF94.
 * Accepts native UFF / OCL conformer poses. Kekulizes aromatic bonds and
 * ensures explicit H (required by ForceFieldMMFF94).
 * If the input is flat, seeds a single OCL conformer first.
 */
export const minimizeMmff94 = async (
  molblock: string,
  options: MinimizeMmff94Options = {},
): Promise<Mmff94MinimizeResult> => {
  let trimmed = normalizeOclMolfile(molblock);
  if (!trimmed || !trimmed.includes('V2000')) {
    throw new Mmff94Error('empty', 'Need a 3D molecule (molblock) to minimize.');
  }

  const maxHeavy = options.maxHeavyAtoms ?? DEFAULT_MAX_HEAVY;
  const table = options.table ?? DEFAULT_TABLE;
  const maxIts = options.maxIts ?? DEFAULT_MAX_ITS;
  const gradTol = options.gradTol ?? DEFAULT_GRAD_TOL;
  const funcTol = options.funcTol ?? DEFAULT_FUNC_TOL;
  const { signal, onProgress } = options;

  const heavyAtomCount = countHeavyAtomsInMolblock(trimmed);
  if (heavyAtomCount > maxHeavy) {
    throw new Mmff94Error(
      'too_large',
      `Molecule has ${heavyAtomCount} heavy atoms (limit ${maxHeavy}). Use UFF Calculate structure instead.`,
    );
  }

  throwIfAborted(signal);
  onProgress?.(0.05, 'Loading OpenChemLib…');

  let OCL: typeof import('openchemlib');
  try {
    await ensureOclResources();
    OCL = await import('openchemlib');
  } catch (err) {
    if (err instanceof Mmff94Error) throw err;
    throw new Mmff94Error(
      'resources',
      `Could not load OpenChemLib: ${errMessage(err)}`,
    );
  }

  throwIfAborted(signal);
  onProgress?.(0.15, 'Parsing structure…');
  await yieldToUi();

  const { ConformerGenerator, ForceFieldMMFF94, Molecule } = OCL;

  // Flat 2D seed → invent one collision-free 3D pose before minimizing.
  if (!molblockHas3dCoords(trimmed)) {
    onProgress?.(0.2, 'Seeding 3D pose (flat input)…');
    await yieldToUi();
    try {
      const seedMol = Molecule.fromMolfile(trimmed);
      prepareMoleculeForMmff94(seedMol);
      const gen = new ConformerGenerator(1);
      const ok = gen.initializeConformers(seedMol, {
        strategy: ConformerGenerator.STRATEGY_ADAPTIVE_RANDOM,
        maxTorsionSets: 2000,
      });
      if (ok) {
        const conf =
          gen.getNextConformerAsMolecule() ?? gen.getOneConformerAsMolecule(seedMol);
        if (conf) {
          trimmed = normalizeOclMolfile(conf.toMolfile());
        }
      }
      if (!molblockHas3dCoords(trimmed)) {
        const one = gen.getOneConformerAsMolecule(Molecule.fromMolfile(trimmed));
        if (one) trimmed = normalizeOclMolfile(one.toMolfile());
      }
    } catch (err) {
      throw new Mmff94Error(
        'flat',
        `Need 3D coordinates first (Calculate structure / Conformers). Seed failed: ${errMessage(err)}`,
      );
    }
    if (!molblockHas3dCoords(trimmed)) {
      throw new Mmff94Error(
        'flat',
        'Structure looks flat (no Z coords). Run Calculate structure or Conformers first, then MMFF94.',
      );
    }
  }

  throwIfAborted(signal);
  onProgress?.(0.3, 'Preparing for MMFF94…');
  await yieldToUi();

  let mol: InstanceType<typeof Molecule>;
  try {
    mol = Molecule.fromMolfile(trimmed);
    prepareMoleculeForMmff94(mol);
  } catch (err) {
    throw new Mmff94Error(
      'parse_failed',
      `OpenChemLib could not prepare molfile: ${errMessage(err)}`,
    );
  }

  if (!mol || mol.getAllAtoms() === 0) {
    throw new Mmff94Error('empty', 'Parsed molecule has no atoms.');
  }

  throwIfAborted(signal);
  onProgress?.(0.4, `Building ${table} force field…`);
  await yieldToUi();

  let ff: InstanceType<typeof ForceFieldMMFF94>;
  try {
    ff = new ForceFieldMMFF94(mol, table);
  } catch (err) {
    const msg = errMessage(err);
    throw new Mmff94Error(
      'init_failed',
      msg.includes('hydrogen')
        ? 'MMFF94 needs explicit hydrogens. Toggle Hydrogens on, or run Conformers… first.'
        : `MMFF94 init failed (unsupported atom/bond?): ${msg}`,
    );
  }

  let energyBeforeKcal: number | null = null;
  try {
    energyBeforeKcal = ff.getTotalEnergy();
  } catch {
    energyBeforeKcal = null;
  }

  throwIfAborted(signal);
  onProgress?.(0.5, `Minimizing (${maxIts} max its)…`);
  await yieldToUi();

  let status = -1;
  try {
    status = ff.minimise({ maxIts, gradTol, funcTol });
  } catch (err) {
    throw new Mmff94Error(
      'minimize_failed',
      `MMFF94 minimise threw: ${errMessage(err)}`,
    );
  }

  onProgress?.(0.9, 'Reading result…');
  await yieldToUi();

  let energyKcal = NaN;
  try {
    energyKcal = ff.getTotalEnergy();
  } catch (err) {
    throw new Mmff94Error(
      'minimize_failed',
      `Could not read MMFF94 energy: ${errMessage(err)}`,
    );
  }

  const out = normalizeOclMolfile(mol.toMolfile());
  if (!out.includes('V2000')) {
    throw new Mmff94Error('minimize_failed', 'Minimized structure could not be serialized.');
  }

  if (!Number.isFinite(energyKcal)) {
    throw new Mmff94Error(
      'minimize_failed',
      `MMFF94 minimise returned status ${status} without a usable energy.`,
    );
  }

  onProgress?.(1, 'Done');

  return {
    molblock: out,
    energyKcal,
    energyBeforeKcal,
    status,
    table,
    heavyAtomCount,
    source: 'mmff94',
  };
};
