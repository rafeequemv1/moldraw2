import type { Molecule } from '@moldraw/domain';
import { createMoleculeStore, moleculeToMolblock } from '@moldraw/core';
import { calculateCip } from '@moldraw/engine';
import type { MoleculeSelection } from '@moldraw/core';
import type { AiExecutionContext } from '../types';
import { createNodeChemistryEngine, type ChemistryEngine } from './chemistryEngine';
import type {
  ApplyCommandArg,
  ApplyCommandOptions,
  CreateMoldrawSessionOptions,
  MoldrawSession,
  SessionCommandResult,
  SessionEvent,
} from './types';

const SELECTION_COMMAND_IDS = new Set(['selection.set', 'molecule.setSelection']);

function parseApplyArgs(
  command: ApplyCommandArg,
  input?: unknown,
  opts?: ApplyCommandOptions,
): { id: string; input: unknown } & ApplyCommandOptions {
  if (typeof command === 'string') {
    return { id: command, input: input ?? {}, ...opts };
  }
  return {
    id: command.id,
    input: command.input ?? input ?? {},
    includeMolecule: command.includeMolecule ?? opts?.includeMolecule,
    expectedRevision: command.expectedRevision ?? opts?.expectedRevision,
    clientId: command.clientId ?? opts?.clientId,
  };
}

function atomBounds(mol: Molecule, atomIds: string[]) {
  const ids = new Set(atomIds);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const a of mol.atoms) {
    if (!ids.has(a.id)) continue;
    if (a.x < minX) minX = a.x;
    if (a.y < minY) minY = a.y;
    if (a.x > maxX) maxX = a.x;
    if (a.y > maxY) maxY = a.y;
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : undefined;
}

function fail(
  revision: number,
  code: string,
  message: string,
  details?: unknown,
): SessionCommandResult {
  return {
    ok: false,
    revision,
    changed: false,
    error: { code, message, details },
  };
}

export function createMoldrawSession(opts: CreateMoldrawSessionOptions = {}): MoldrawSession {
  const store = createMoleculeStore({
    initialMolecule: opts.initialMolecule,
    initialSelection: opts.initialSelection,
  });
  const chemistry: ChemistryEngine = opts.engine ?? createNodeChemistryEngine();
  const bondLengthPx = opts.bondLengthPx ?? 40;
  const includeMoleculeByDefault = opts.includeMoleculeByDefault ?? false;

  let revision = 0;
  const listeners = new Set<(event: SessionEvent) => void>();

  const emit = (event: SessionEvent): void => {
    for (const listener of listeners) listener(event);
  };

  const persistNow = (event: SessionEvent): void => {
    if (!opts.persist) return;
    opts.persist(store.getMolecule(), event);
    emit({ type: 'session.persisted', revision });
  };

  const afterCommit = (
    type: SessionEvent['type'],
    changed: boolean,
    extra?: unknown,
    applyOpts?: ApplyCommandOptions,
  ): SessionCommandResult => {
    if (changed) {
      revision += 1;
      const event: SessionEvent = { type, revision, clientId: applyOpts?.clientId };
      emit(event);
      persistNow(event);
    }
    return {
      ok: true,
      revision,
      changed,
      extra,
      molecule:
        applyOpts?.includeMolecule || includeMoleculeByDefault ? store.getMolecule() : undefined,
    };
  };

  /** `STALE_REVISION` guard shared by every mutating entry point. */
  const staleCheck = (applyOpts?: ApplyCommandOptions): SessionCommandResult | null => {
    const expected = applyOpts?.expectedRevision;
    if (expected === undefined || expected === revision) return null;
    return fail(
      revision,
      'STALE_REVISION',
      `Session revision is ${revision}, but expectedRevision was ${expected}. Re-read the state and retry.`,
      { expected, actual: revision },
    );
  };

  const applySelection = (
    patch: Partial<MoleculeSelection>,
    applyOpts?: ApplyCommandOptions,
  ): SessionCommandResult => {
    const stale = staleCheck(applyOpts);
    if (stale) return stale;
    const before = JSON.stringify(store.getSelection());
    store.setSelection(patch);
    const changed = JSON.stringify(store.getSelection()) !== before;
    return afterCommit('session.changed', changed, undefined, applyOpts);
  };

  const applyCommand = (
    command: ApplyCommandArg,
    input?: unknown,
    applyOpts?: ApplyCommandOptions,
  ): SessionCommandResult => {
    const parsed = parseApplyArgs(command, input, applyOpts);
    if (SELECTION_COMMAND_IDS.has(parsed.id)) {
      const patch =
        parsed.input && typeof parsed.input === 'object'
          ? (parsed.input as Partial<MoleculeSelection>)
          : {};
      return applySelection(patch, parsed);
    }

    const stale = staleCheck(parsed);
    if (stale) return stale;

    const before = store.getMolecule();
    const result = store.applyCommand(parsed.id, parsed.input);
    if (!result.ok) {
      return fail(
        revision,
        result.error.code,
        result.error.message,
        result.error.details,
      );
    }
    const changed = store.getMolecule() !== before;
    return afterCommit('session.changed', changed, result.extra, parsed);
  };

  const undo = (applyOpts?: ApplyCommandOptions): SessionCommandResult => {
    const stale = staleCheck(applyOpts);
    if (stale) return stale;
    if (!store.canUndo()) {
      return fail(revision, 'EXECUTION', 'Nothing to undo.');
    }
    const before = store.getMolecule();
    store.undo();
    return afterCommit('session.undo', store.getMolecule() !== before, undefined, applyOpts);
  };

  const redo = (applyOpts?: ApplyCommandOptions): SessionCommandResult => {
    const stale = staleCheck(applyOpts);
    if (stale) return stale;
    if (!store.canRedo()) {
      return fail(revision, 'EXECUTION', 'Nothing to redo.');
    }
    const before = store.getMolecule();
    store.redo();
    return afterCommit('session.redo', store.getMolecule() !== before, undefined, applyOpts);
  };

  const replaceDocument = (molecule: Molecule, applyOpts?: ApplyCommandOptions): SessionCommandResult => {
    const stale = staleCheck(applyOpts);
    if (stale) return stale;
    if (!molecule || !Array.isArray(molecule.atoms) || !Array.isArray(molecule.bonds)) {
      return fail(revision, 'VALIDATION', 'replaceDocument expects a molecule with atoms[] and bonds[].');
    }
    const before = store.getMolecule();
    store.updateMolecule(molecule);
    return afterCommit('session.document', store.getMolecule() !== before, undefined, applyOpts);
  };

  const focusAtoms = (atomIds: string[]): void => {
    if (atomIds.length === 0) return;
    emit({
      type: 'session.focus',
      revision,
      focus: { atomIds, bounds: atomBounds(store.getMolecule(), atomIds) },
    });
  };

  const persist = (): void => {
    persistNow({ type: 'session.persisted', revision });
  };

  const ctx: AiExecutionContext = {
    getMolecule: () => store.getMolecule(),
    applyCommand: (commandId, commandInput) => {
      const r = applyCommand(commandId, commandInput);
      if (!r.ok) return { ok: false, error: r.error };
      return { ok: true, extra: r.extra };
    },
    getSelection: () => store.getSelection(),
    setSelection: patch => {
      applySelection(patch);
    },
    undo: () => {
      undo();
    },
    redo: () => {
      redo();
    },
    canUndo: () => store.canUndo(),
    canRedo: () => store.canRedo(),
    focusAtoms,
    bondLengthPx,
    runCleanup: async () => {
      const mol = store.getMolecule();
      if (mol.atoms.length === 0) return { ok: false, error: 'Nothing to clean up' };
      const r = applyCommand('molecule.cleanup', { bondLengthPx });
      return r.ok ? { ok: true } : { ok: false, error: r.error.message };
    },
    runAromatize: async mode => {
      const mol = store.getMolecule();
      if (mol.atoms.length === 0) return { ok: false, error: 'Nothing to aromatize' };
      const next = chemistry.aromatize(mol, mode);
      const molBlock = moleculeToMolblock(next);
      const r = applyCommand('molecule.aromatize', { mode, molBlock });
      if (!r.ok) return { ok: false, error: r.error.message };
      return { ok: true, data: { mode, changed: r.changed } };
    },
    runCheckStructure: async () => {
      const mol = store.getMolecule();
      if (mol.atoms.length === 0) return { ok: false, error: 'Empty molecule' };
      const data = chemistry.validate(mol);
      return { ok: true, data };
    },
    runExplicitHydrogens: async (mode = 'auto') => {
      const mol = store.getMolecule();
      if (mol.atoms.length === 0) return { ok: false, error: 'Empty molecule' };
      if (!chemistry.convertExplicitHydrogens) {
        return { ok: false, error: 'Explicit-hydrogen convert is not available' };
      }
      const next = chemistry.convertExplicitHydrogens(mol, mode);
      const molBlock = moleculeToMolblock(next);
      const r = applyCommand('molecule.applyExplicitHydrogens', { mode, molBlock });
      if (!r.ok) return { ok: false, error: r.error.message };
      return { ok: true, data: { mode, changed: r.changed } };
    },
    runCipStereo: async () => {
      const mol = store.getMolecule();
      if (mol.atoms.length === 0) return { ok: false, error: 'Empty molecule' };
      try {
        return { ok: true, data: calculateCip(mol) };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'CIP stereo failed',
        };
      }
    },
    exportSmiles: async () => {
      const mol = store.getMolecule();
      if (mol.atoms.length === 0) return { ok: false, error: 'Empty molecule' };
      if (!chemistry.toSmiles) return { ok: false, error: 'SMILES export is not available' };
      try {
        return { ok: true, data: { smiles: chemistry.toSmiles(mol) } };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'SMILES export failed',
        };
      }
    },
    importSmiles: async (smiles, importOpts) => {
      const r = applyCommand('molecule.importSmiles', {
        smiles,
        mode: importOpts?.mode ?? 'merge',
        placement: importOpts?.placement,
      });
      if (!r.ok) return { ok: false, error: r.error.message };
      const extra = (r.extra as { newAtomIds?: string[]; newBondIds?: string[] } | undefined) ?? {};
      return { ok: true, newAtomIds: extra.newAtomIds, newBondIds: extra.newBondIds };
    },
    importMolblock: async (molblock, importOpts) => {
      const r = applyCommand('molecule.importMolblock', {
        molblock,
        mode: importOpts?.mode ?? 'merge',
        placement: importOpts?.placement ?? 'origin',
        bondLengthPx,
      });
      if (!r.ok) return { ok: false, error: r.error.message };
      const extra = (r.extra as { newAtomIds?: string[]; newBondIds?: string[] } | undefined) ?? {};
      return { ok: true, newAtomIds: extra.newAtomIds, newBondIds: extra.newBondIds };
    },
  };

  emit({ type: 'session.loaded', revision: 0 });

  return {
    applyCommand,
    store,
    ctx,
    subscribe: listener => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    persist,
    get revision() {
      return revision;
    },
    getState: () => ({
      revision,
      molecule: store.getMolecule(),
      selection: store.getSelection(),
      canUndo: store.canUndo(),
      canRedo: store.canRedo(),
    }),
    undo,
    redo,
    setSelection: (patch, applyOpts) => applySelection(patch, applyOpts),
    replaceDocument,
    focusAtoms,
  };
}

export function emptyMolecule(): Molecule {
  return { atoms: [], bonds: [] };
}
