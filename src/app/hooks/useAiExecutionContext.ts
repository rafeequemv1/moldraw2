import { useMemo } from 'react';
import type { AiExecutionContext, AiWorkerResult } from '@moldraw/ai';
import type { Molecule } from '@moldraw/domain';
import type { MoleculeSelection } from '@moldraw/core';
import { moleculeToMolblock } from '@moldraw/core/io/molblock';
import { buildCleanupWorkerPayload } from '@moldraw/core/io/localCleanup';
import { nativeSmilesTo2DMolblock } from '@moldraw/core/io/smilesToMolblock';
import { CMD } from '@moldraw/core/commands/registry';
import type { CommandResult } from '@moldraw/core/commands';
import type { MoleculeWorkerClient } from '@moldraw/core/moleculeWorker/client';
import {
  defaultImportGridOrigin,
  IMPORT_GRID_COLS,
} from '@moldraw/core/molecule/importPlacement';
import { pubchemMolblockFromSmilesOrName } from '../advanced/batchExport';
import { defaultImportCompoundName } from '@moldraw/ai/utils/smilesQuery';

export type AiWorkerPendingMap = Map<string, { resolve: (r: AiWorkerResult) => void }>;

const WORKER_TIMEOUT_MS = 45000;

function waitWorker(
  pending: AiWorkerPendingMap,
  id: string,
  post: () => void,
  timeoutMs = WORKER_TIMEOUT_MS,
): Promise<AiWorkerResult> {
  return new Promise(resolve => {
    pending.set(id, { resolve });
    post();
    window.setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        resolve({ ok: false, error: 'Worker request timed out' });
      }
    }, timeoutMs);
  });
}

export function useAiExecutionContext(opts: {
  molecule: Molecule;
  /** Prefer live store read so multi-step tools see post-command state. */
  getMoleculeLive?: () => Molecule;
  applyCommand: (commandId: string, input: unknown) => CommandResult;
  bondLengthPx: number;
  bondAngleSnapRad: number;
  viewportInfoRef: React.MutableRefObject<{ x: number; y: number; zoom: number }>;
  molblockGridSlotRef: React.MutableRefObject<number>;
  molblockGridOriginRef: React.MutableRefObject<{ x: number; y: number } | null>;
  /** Shared pending map for AI worker ops (cleanup, aromatize, SMILES, …). */
  aiWorkerPendingRef: React.MutableRefObject<AiWorkerPendingMap>;
  workerRef: React.MutableRefObject<MoleculeWorkerClient | null>;
  batchWorkerWaitRef: React.MutableRefObject<
    Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>
  >;
  importMolblockRef: React.MutableRefObject<
    (
      molblock: string,
      meta?: {
        compoundName?: string;
        iupacName?: string;
        useViewportGrid?: boolean;
        startFreshGrid?: boolean;
        placeBesideExisting?: boolean;
      },
    ) => Promise<string[]>
  >;
  resetAutoCleanup: () => void;
  preferIndigo2dRef?: React.MutableRefObject<boolean>;
  getSelection: () => MoleculeSelection;
  setSelection: (patch: Partial<MoleculeSelection>) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  /** Split canvas and post AUTOMAP. Optional requestId for AI pending resolution. */
  startAutomap?: (requestId?: string) => boolean;
  /** Pan/zoom so newly added atoms are in view. */
  focusAtoms?: (atomIds: string[]) => void;
}): AiExecutionContext {
  const {
    molecule,
    getMoleculeLive,
    applyCommand,
    bondLengthPx,
    bondAngleSnapRad,
    viewportInfoRef,
    molblockGridSlotRef,
    molblockGridOriginRef,
    aiWorkerPendingRef,
    workerRef,
    batchWorkerWaitRef,
    importMolblockRef,
    resetAutoCleanup,
    preferIndigo2dRef,
    getSelection,
    setSelection,
    undo,
    redo,
    canUndo,
    canRedo,
    startAutomap,
    focusAtoms,
  } = opts;

  return useMemo<AiExecutionContext>(
    () => ({
      getMolecule: () => (getMoleculeLive ? getMoleculeLive() : molecule),
      applyCommand: (commandId, input) => {
        const result = applyCommand(commandId, input);
        if (result.ok && (commandId === 'molecule.clearAll' || commandId === CMD.ClearAll)) {
          molblockGridSlotRef.current = 0;
          molblockGridOriginRef.current = null;
        }
        if (result.ok && focusAtoms) {
          const extra = result.extra as { newAtomIds?: string[] } | undefined;
          if (extra?.newAtomIds && extra.newAtomIds.length > 0) {
            queueMicrotask(() => focusAtoms(extra.newAtomIds!));
          }
        }
        return result;
      },
      getSelection,
      setSelection,
      undo,
      redo,
      canUndo,
      canRedo,
      bondLengthPx,
      bondAngleSnapDeg: (bondAngleSnapRad * 180) / Math.PI,
      focusAtoms,
      get viewport() {
        return viewportInfoRef.current;
      },
      windowWidth: typeof window !== 'undefined' ? window.innerWidth : 1200,
      windowHeight: typeof window !== 'undefined' ? window.innerHeight : 800,
      nextGridSlot: () => {
        const slotIndex = molblockGridSlotRef.current;
        molblockGridSlotRef.current += 1;
        return {
          col: slotIndex % IMPORT_GRID_COLS,
          row: Math.floor(slotIndex / IMPORT_GRID_COLS),
        };
      },
      nextGridOrigin: () => {
        if (!molblockGridOriginRef.current) {
          molblockGridOriginRef.current = defaultImportGridOrigin({
            viewport: viewportInfoRef.current,
            windowWidth: typeof window !== 'undefined' ? window.innerWidth : 1200,
            windowHeight: typeof window !== 'undefined' ? window.innerHeight : 800,
            bondLengthPx,
            cols: IMPORT_GRID_COLS,
          });
        }
        return molblockGridOriginRef.current;
      },
      runCleanup: () => {
        if (molecule.atoms.length === 0) {
          return Promise.resolve({ ok: false, error: 'Nothing to clean up' });
        }
        const id = `ai-cleanup:${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const p = waitWorker(aiWorkerPendingRef.current, id, () => {
          workerRef.current?.post({
            type: 'CLEANUP',
            payload: buildCleanupWorkerPayload(molecule, {
              bondLengthPx,
              preferIndigo: preferIndigo2dRef?.current !== false,
            }),
            id,
          });
          resetAutoCleanup();
        });
        return p.then(r => ({ ok: r.ok, error: r.ok ? undefined : r.error }));
      },
      runAromatize: mode => {
        if (molecule.atoms.length === 0) {
          return Promise.resolve({ ok: false, error: 'Nothing to aromatize' });
        }
        const id = `ai-aromatize:${mode}:${Date.now()}`;
        return waitWorker(aiWorkerPendingRef.current, id, () => {
          workerRef.current?.post({
            type: 'AROMATIZE',
            payload: { molBlock: moleculeToMolblock(molecule), mode },
            id,
          });
        });
      },
      runExplicitHydrogens: (mode = 'auto') => {
        if (molecule.atoms.length === 0) {
          return Promise.resolve({ ok: false, error: 'Empty molecule' });
        }
        const id = `ai-explicit-h:${mode}:${Date.now()}`;
        return waitWorker(aiWorkerPendingRef.current, id, () => {
          workerRef.current?.post({
            type: 'CONVERT_EXPLICIT_HYDROGENS',
            payload: { molBlock: moleculeToMolblock(molecule), mode },
            id,
          });
        });
      },
      runCheckStructure: () => {
        if (molecule.atoms.length === 0) {
          return Promise.resolve({ ok: false, error: 'Empty molecule' });
        }
        const id = `ai-check:${Date.now()}`;
        return waitWorker(aiWorkerPendingRef.current, id, () => {
          workerRef.current?.post({
            type: 'CHECK_STRUCTURE',
            payload: { molBlock: moleculeToMolblock(molecule) },
            id,
          });
        });
      },
      runCipStereo: () => {
        if (molecule.atoms.length === 0) {
          return Promise.resolve({ ok: false, error: 'Empty molecule' });
        }
        const id = `ai-stereo:${Date.now()}`;
        return waitWorker(aiWorkerPendingRef.current, id, () => {
          workerRef.current?.post({
            type: 'GET_STEREO_TAGS',
            payload: { molBlock: moleculeToMolblock(molecule) },
            id,
          });
        });
      },
      exportSmiles: () => {
        if (molecule.atoms.length === 0) {
          return Promise.resolve({ ok: false, error: 'Empty molecule' });
        }
        const id = `ai-smiles-export:${Date.now()}`;
        return waitWorker(aiWorkerPendingRef.current, id, () => {
          workerRef.current?.post({
            type: 'GET_SMILES',
            payload: { molBlock: moleculeToMolblock(molecule) },
            id,
          });
        });
      },
      runAutomap: () => {
        if (!startAutomap) {
          return Promise.resolve({ ok: false, error: 'Automap not wired' });
        }
        const id = `ai-automap:${Date.now()}`;
        return new Promise(resolve => {
          aiWorkerPendingRef.current.set(id, { resolve });
          const started = startAutomap(id);
          if (!started) {
            aiWorkerPendingRef.current.delete(id);
            resolve({
              ok: false,
              error: 'Automap needs reactants, a reaction arrow, and products on the canvas',
            });
            return;
          }
          window.setTimeout(() => {
            if (aiWorkerPendingRef.current.has(id)) {
              aiWorkerPendingRef.current.delete(id);
              resolve({ ok: false, error: 'Automap timed out' });
            }
          }, WORKER_TIMEOUT_MS);
        });
      },
      importMolblock: async (molblock, importOpts) => {
        try {
          const ids = await importMolblockRef.current(molblock, {
            compoundName: importOpts?.compoundName,
            useViewportGrid:
              importOpts?.useViewportGrid ?? importOpts?.placement === 'viewport_center',
            startFreshGrid: importOpts?.startFreshGrid,
            placeBesideExisting: importOpts?.placeBesideExisting,
          });
          if (ids.length > 0 && importOpts?.focus !== false) focusAtoms?.(ids);
          return { ok: true, newAtomIds: ids };
        } catch (e) {
          return {
            ok: false,
            error: e instanceof Error ? e.message : 'Import failed',
          };
        }
      },
      importSmiles: async (smiles, importOpts) => {
        try {
          let mb: string | null = null;
          const resolveVia = importOpts?.resolveVia ?? 'auto';
          const tryLocal = async (): Promise<string | null> => {
            if (!workerRef.current) return null;
            const sid = `ai-smiles-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const p = new Promise<string | null>(res => {
              const timer = window.setTimeout(() => res(null), 30000);
              batchWorkerWaitRef.current.set(sid, {
                resolve: v => {
                  window.clearTimeout(timer);
                  res(typeof v === 'string' ? v : null);
                },
                reject: () => {
                  window.clearTimeout(timer);
                  res(null);
                },
              });
            });
            workerRef.current.post({
              type: 'SMILES_TO_MOLBLOCK',
              payload: {
                smiles,
                preferIndigo: preferIndigo2dRef?.current !== false,
              },
              id: sid,
            });
            return p;
          };

          if (resolveVia === 'local') {
            mb = await tryLocal();
            if (!mb?.trim()) {
              // Main-thread native layout if the worker is slow/unavailable or
              // the reply was never routed (e.g. before ai-smiles-* was handled).
              mb = nativeSmilesTo2DMolblock(smiles, bondLengthPx);
            }
          } else {
            mb = await pubchemMolblockFromSmilesOrName(smiles);
            if (!mb) mb = await tryLocal();
            if (!mb?.trim()) mb = nativeSmilesTo2DMolblock(smiles, bondLengthPx);
          }
          if (!mb?.trim()) {
            return {
              ok: false,
              error:
                resolveVia === 'local'
                  ? `Local SMILES layout failed for "${smiles}" — pass a valid SMILES string (not a name)`
                  : `Could not resolve "${smiles}" to a structure`,
            };
          }
          if (importOpts?.mode === 'replace') {
            const slot = molblockGridSlotRef.current;
            molblockGridSlotRef.current += 1;
            if (!molblockGridOriginRef.current) {
              molblockGridOriginRef.current = defaultImportGridOrigin({
                viewport: viewportInfoRef.current,
                windowWidth: window.innerWidth,
                windowHeight: window.innerHeight,
                bondLengthPx,
                cols: IMPORT_GRID_COLS,
              });
            }
            const r = applyCommand(CMD.ImportMolblock, {
              molblock: mb,
              mode: 'replace',
              bondLengthPx,
              placement: importOpts.placement ?? 'viewport_center',
              viewport: viewportInfoRef.current,
              windowWidth: window.innerWidth,
              windowHeight: window.innerHeight,
              gridSlot: {
                col: slot % IMPORT_GRID_COLS,
                row: Math.floor(slot / IMPORT_GRID_COLS),
              },
              gridOrigin: molblockGridOriginRef.current,
            }) as {
              ok: boolean;
              error?: { message?: string };
              extra?: unknown;
            };
            if (!r.ok) {
              return { ok: false, error: r.error?.message ?? 'Replace import failed' };
            }
            const extra = r.extra as { newAtomIds?: string[] } | undefined;
            if (extra?.newAtomIds?.length && importOpts?.focus !== false) {
              focusAtoms?.(extra.newAtomIds);
            }
            return { ok: true, newAtomIds: extra?.newAtomIds };
          }
          const ids = await importMolblockRef.current(mb, {
            compoundName: defaultImportCompoundName(smiles, importOpts?.compoundName),
            useViewportGrid: importOpts?.useViewportGrid ?? true,
            startFreshGrid: importOpts?.startFreshGrid,
            placeBesideExisting: importOpts?.placeBesideExisting,
          });
          if (ids.length > 0 && importOpts?.focus !== false) focusAtoms?.(ids);
          return { ok: true, newAtomIds: ids };
        } catch (e) {
          return {
            ok: false,
            error: e instanceof Error ? e.message : 'SMILES import failed',
          };
        }
      },
    }),
    // Refs are stable; omit from deps (same pattern as prior AI ctx wiring).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs + stable callbacks
    [
      molecule,
      applyCommand,
      bondLengthPx,
      bondAngleSnapRad,
      resetAutoCleanup,
      preferIndigo2dRef,
      getSelection,
      setSelection,
      undo,
      redo,
      canUndo,
      canRedo,
      startAutomap,
      focusAtoms,
    ],
  );
}
