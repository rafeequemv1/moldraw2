/**
 * OpenChemLib ConformerGenerator wrapper — systematic torsion sampling with
 * clash rejection. Complements the native UFF multi-conformer path.
 * OCL is loaded on demand so the main app chunk stays lean.
 */
import { ensureOclResources } from './oclResources';
import { countHeavyAtomsInMolblock, normalizeOclMolfile } from './molfileUtils';
import {
  OclConformerError,
  type ConformerStrategy,
  type GenerateOclConformersOptions,
  type OclConformerPose,
  type OclConformerResult,
} from './types';

const HARD_MAX_CONFORMERS = 24;
const DEFAULT_MAX_CONFORMERS = 12;
/** Multi-conformer OCL gallery — keep well below single-structure UFF (~400). */
export const OCL_CONFORMER_MAX_HEAVY = 80;
const DEFAULT_MAX_HEAVY = OCL_CONFORMER_MAX_HEAVY;
const DEFAULT_MAX_TORSION_SETS = 8000;

type OclModule = typeof import('openchemlib');

const strategyCode = (OCL: OclModule, strategy: ConformerStrategy): number => {
  const CG = OCL.ConformerGenerator;
  switch (strategy) {
    case 'likely_systematic':
      return CG.STRATEGY_LIKELY_SYSTEMATIC;
    case 'pure_random':
      return CG.STRATEGY_PURE_RANDOM;
    case 'likely_random':
      return CG.STRATEGY_LIKELY_RANDOM;
    case 'adaptive_random':
    default:
      return CG.STRATEGY_ADAPTIVE_RANDOM;
  }
};

const throwIfAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    throw new OclConformerError('cancelled', 'Conformer generation cancelled.');
  }
};

const yieldToUi = (): Promise<void> =>
  new Promise(resolve => {
    window.setTimeout(resolve, 0);
  });

/**
 * Generate collision-free 3D conformers from a V2000 molblock (2D or 3D).
 * Topology comes from the molblock; coordinates are replaced by OCL.
 */
export const generateOclConformers = async (
  molblock: string,
  options: GenerateOclConformersOptions = {},
): Promise<OclConformerResult> => {
  const trimmed = normalizeOclMolfile(molblock);
  if (!trimmed || !trimmed.includes('V2000')) {
    throw new OclConformerError('empty', 'Need a molecule (molblock) to generate conformers.');
  }

  const maxConformers = Math.min(
    HARD_MAX_CONFORMERS,
    Math.max(1, options.maxConformers ?? DEFAULT_MAX_CONFORMERS),
  );
  const maxHeavy = options.maxHeavyAtoms ?? DEFAULT_MAX_HEAVY;
  const strategy = options.strategy ?? 'adaptive_random';
  const seed = options.seed ?? 1;
  const maxTorsionSets = options.maxTorsionSets ?? DEFAULT_MAX_TORSION_SETS;
  const { signal, onProgress } = options;

  throwIfAborted(signal);
  onProgress?.(0.02, 'Loading OpenChemLib…');

  let OCL: OclModule;
  try {
    await ensureOclResources();
    OCL = await import('openchemlib');
  } catch (err) {
    if (err instanceof OclConformerError) throw err;
    throw new OclConformerError(
      'resources',
      `Could not load OpenChemLib: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  throwIfAborted(signal);
  onProgress?.(0.08, 'Parsing structure…');

  const { ConformerGenerator, Molecule } = OCL;

  let mol: InstanceType<typeof Molecule>;
  try {
    mol = Molecule.fromMolfile(trimmed);
  } catch (err) {
    throw new OclConformerError(
      'parse_failed',
      `OpenChemLib could not parse molfile: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!mol || mol.getAllAtoms() === 0) {
    throw new OclConformerError('empty', 'Parsed molecule has no atoms.');
  }

  const heavyAtomCount = countHeavyAtomsInMolblock(trimmed) || mol.getAllAtoms();
  if (heavyAtomCount > maxHeavy) {
    throw new OclConformerError(
      'too_large',
      `Conformers not supported for larger molecules (${heavyAtomCount} heavy atoms; limit ${maxHeavy}). Use Calculate structure for a single 3D pose.`,
    );
  }

  throwIfAborted(signal);
  onProgress?.(0.15, 'Sampling torsions…');

  const generator = new ConformerGenerator(seed);
  let ok = false;
  try {
    ok = generator.initializeConformers(mol, {
      strategy: strategyCode(OCL, strategy),
      maxTorsionSets,
    });
  } catch (err) {
    throw new OclConformerError(
      'init_failed',
      `ConformerGenerator init failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!ok) {
    throw new OclConformerError(
      'init_failed',
      'OpenChemLib rejected this structure for conformer generation.',
    );
  }

  const potentialCount = (() => {
    try {
      return generator.getPotentialConformerCount();
    } catch {
      return 0;
    }
  })();

  const poses: OclConformerPose[] = [];
  const target = maxConformers;

  for (let i = 0; i < target; i++) {
    throwIfAborted(signal);
    onProgress?.(0.15 + (0.8 * i) / target, `Conformer ${i + 1} of up to ${target}…`);

    let next: InstanceType<typeof Molecule> | null = null;
    try {
      next = generator.getNextConformerAsMolecule();
    } catch (err) {
      console.warn('[ocl-conformers] getNext failed', err);
      break;
    }
    if (!next) break;

    const mb = normalizeOclMolfile(next.toMolfile());
    if (!mb.includes('V2000')) continue;

    poses.push({
      index: poses.length + 1,
      molblock: mb,
      atomCount: next.getAllAtoms(),
    });

    if (i % 2 === 1) await yieldToUi();
  }

  if (poses.length === 0) {
    throwIfAborted(signal);
    onProgress?.(0.9, 'Trying single-conformer fallback…');
    try {
      const copy = Molecule.fromMolfile(trimmed);
      const one = generator.getOneConformerAsMolecule(copy);
      if (one) {
        const mb = normalizeOclMolfile(one.toMolfile());
        if (mb.includes('V2000')) {
          poses.push({ index: 1, molblock: mb, atomCount: one.getAllAtoms() });
        }
      }
    } catch (err) {
      console.warn('[ocl-conformers] single fallback failed', err);
    }
  }

  if (poses.length === 0) {
    throw new OclConformerError(
      'no_conformers',
      'No collision-free conformers found. Try Calculate structure (UFF) or a smaller molecule.',
    );
  }

  onProgress?.(1, `Ready — ${poses.length} conformer${poses.length === 1 ? '' : 's'}`);

  return {
    poses,
    potentialCount,
    heavyAtomCount,
    strategy,
    source: 'openchemlib',
  };
};
