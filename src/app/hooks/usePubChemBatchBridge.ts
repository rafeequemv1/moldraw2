/**
 * PubChem import + batch SMILES / 3D pipeline bridge (worker waits + PubChem fetch).
 * Extracted from App.tsx (hooks-first path).
 */
import { useCallback } from 'react';
import type { MoleculeWorkerClient } from '@moldraw/core/moleculeWorker/client';
import type {
  MoleculeWorkerRequest,
  MoleculeWorkerResponse,
} from '@moldraw/core/moleculeWorker/messages';
import type {
  Molecule3dWorkerRequest,
  Molecule3dWorkerResponse,
} from '@moldraw/core/moleculeWorker/messages3d';
import type { BatchPipelineResult } from '../advanced/batchExport';
import {
  pubchem3dMolblockFromSmiles,
  pubchemMolblockFromSmiles,
} from '../advanced/batchExport';

export interface UsePubChemBatchBridgeOptions {
  importMolblock: (
    molblock: string,
    meta?: {
      compoundName?: string;
      iupacName?: string;
      useViewportGrid?: boolean;
      startFreshGrid?: boolean;
      placeBesideExisting?: boolean;
    },
  ) => Promise<string[]>;
  setShowPubChem: React.Dispatch<React.SetStateAction<boolean>>;
  molblockGridSlotRef: React.MutableRefObject<number>;
  molblockGridOriginRef: React.MutableRefObject<{ x: number; y: number } | null>;
  batchWorkerWaitRef: React.MutableRefObject<
    Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>
  >;
  workerRef: React.MutableRefObject<MoleculeWorkerClient<
    MoleculeWorkerRequest,
    MoleculeWorkerResponse
  > | null>;
  worker3dRef: React.MutableRefObject<MoleculeWorkerClient<
    Molecule3dWorkerRequest,
    Molecule3dWorkerResponse
  > | null>;
  /** Mirrored settings flag for SMILES→2D (default true). */
  preferIndigo2dRef?: React.MutableRefObject<boolean>;
}

export function usePubChemBatchBridge({
  importMolblock,
  setShowPubChem,
  molblockGridSlotRef,
  molblockGridOriginRef,
  batchWorkerWaitRef,
  workerRef,
  worker3dRef,
  preferIndigo2dRef,
}: UsePubChemBatchBridgeOptions) {
  // Called from PubChemSearch modal — receives the raw SDF molblock fetched by the modal.
  const handlePubChemImport = useCallback(async (molblock: string, name: string, iupacName?: string) => {
    setShowPubChem(false);
    await importMolblock(molblock, { compoundName: name, iupacName });
  }, [importMolblock]);

  const handlePubChemImportQuiet = useCallback(async (molblock: string, name: string, iupacName?: string) => {
    await importMolblock(molblock, { compoundName: name, iupacName, useViewportGrid: true });
  }, [importMolblock]);

  const waitBatchWorker = useCallback((id: string) => {
    return new Promise<unknown>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        if (batchWorkerWaitRef.current.delete(id)) {
          reject(new Error('Structure engine worker timeout'));
        }
      }, 120000);
      batchWorkerWaitRef.current.set(id, {
        resolve: v => {
          window.clearTimeout(timer);
          resolve(v);
        },
        reject: e => {
          window.clearTimeout(timer);
          reject(e);
        },
      });
    });
  }, []);

  const requestTemplateSmilesMolblock = useCallback(
    async (smiles: string): Promise<string | null> => {
      const client = workerRef.current;
      if (!client) return null;
      const id = `template-preview-${crypto.randomUUID()}`;
      try {
        const p = waitBatchWorker(id);
        client.post({
          type: 'SMILES_TO_MOLBLOCK',
          payload: { smiles, preferIndigo: preferIndigo2dRef?.current !== false },
          id,
        });
        const mb = await p;
        return typeof mb === 'string' && mb.trim() ? mb : null;
      } catch {
        return null;
      }
    },
    [waitBatchWorker, preferIndigo2dRef],
  );

  const runBatchSmilesPipeline = useCallback(
    async (
      smiles: string,
      includeHydrogens: boolean,
      preferPubChem2d: boolean,
      preferPubChem3d: boolean,
    ): Promise<BatchPipelineResult> => {
      const client = workerRef.current;
      if (!client) throw new Error('Structure engine is still loading. Try again in a moment.');
      let mol2d = '';
      let mol3d = '';
      if (preferPubChem2d) {
        const pc = await pubchemMolblockFromSmiles(smiles);
        if (pc) mol2d = pc;
      }
      if (preferPubChem3d) {
        const pc3d = await pubchem3dMolblockFromSmiles(smiles);
        if (pc3d) mol3d = pc3d;
      }
      if (!mol2d) {
        const sid = `batch-smiles-${crypto.randomUUID()}`;
        const p = waitBatchWorker(sid);
        client.post({
          type: 'SMILES_TO_MOLBLOCK',
          payload: { smiles, preferIndigo: preferIndigo2dRef?.current !== false },
          id: sid,
        });
        const mb = await p;
        if (typeof mb !== 'string' || !mb.trim()) throw new Error('Invalid SMILES (could not build 2D molblock).');
        mol2d = mb;
      }
      if (mol3d) {
        return { molblock2d: mol2d, molblock3d: mol3d, source: 'PubChem 3D SDF' };
      }
      const client3d = worker3dRef.current;
      if (!client3d) throw new Error('3D worker is not ready yet.');
      const gid = `batch-3d-${crypto.randomUUID()}`;
      const p3 = waitBatchWorker(gid);
      client3d.post({
        type: 'GENERATE_3D',
        id: gid,
        payload: {
          molBlock: mol2d,
          fallbackMolBlock: mol2d,
          includeHydrogens: includeHydrogens,
          sequence: 0,
        },
      });
      const payload = (await p3) as { molBlock3D: string; source: string };
      if (!payload?.molBlock3D?.trim()) throw new Error('3D generation returned empty molblock.');
      return { molblock2d: mol2d, molblock3d: payload.molBlock3D, source: payload.source };
    },
    [waitBatchWorker, worker3dRef, preferIndigo2dRef],
  );

  const handleBatchImportMolblockOnly = useCallback(
    async (molblock: string, displayName: string) => {
      await importMolblock(molblock, { compoundName: displayName, useViewportGrid: true });
    },
    [importMolblock],
  );

  const handleBatchImportMolblocksToCanvas = useCallback(
    async (items: Array<{ molblock: string; displayName: string }>) => {
      if (items.length === 0) return;
      molblockGridSlotRef.current = 0;
      molblockGridOriginRef.current = null;
      for (let i = 0; i < items.length; i++) {
        const item = items[i]!;
        await importMolblock(item.molblock, {
          compoundName: item.displayName,
          useViewportGrid: true,
          ...(i === 0
            ? { startFreshGrid: true, placeBesideExisting: true }
            : {}),
        });
      }
    },
    [importMolblock, molblockGridSlotRef, molblockGridOriginRef],
  );

  return {
    handlePubChemImport,
    handlePubChemImportQuiet,
    waitBatchWorker,
    requestTemplateSmilesMolblock,
    runBatchSmilesPipeline,
    handleBatchImportMolblockOnly,
    handleBatchImportMolblocksToCanvas,
  };
}
