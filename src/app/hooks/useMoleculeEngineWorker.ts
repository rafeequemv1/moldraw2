/**
 * Thin lifecycle boundary for the 2D Indigo `moleculeEngineWorker`.
 *
 * Owns: Worker construction, INIT handshake, status flags, and terminate.
 * Does **not** own the large Indigo response router — App (or a later
 * message-router hook) passes `onMessage` for CLEANUP / CONVERT / etc.
 */
import { useEffect, useRef, useState } from 'react';
import {
  createMoleculeWorkerClient,
  type MoleculeWorkerClient,
} from '@moldraw/core/moleculeWorker/client';
import type {
  MoleculeWorkerRequest,
  MoleculeWorkerResponse,
} from '@moldraw/core/moleculeWorker/messages';
import MoleculeEngineWorker from '../../workers/moleculeEngineWorker.ts?worker';
import { registerIndigo2DSeedFor3D } from '@moldraw/engine-3d';
import { layoutMoleculeIndigoSync, isIndigoReady } from '@moldraw/engine-2d';

export type EngineWorkerStatus = 'loading' | 'ready' | 'error';

export interface UseMoleculeEngineWorkerOptions {
  /**
   * Called for every worker response except INIT_* (those update status here).
   * Keep a stable ref wrapper in the caller so this effect stays one-shot.
   */
  onMessage: (msg: MoleculeWorkerResponse) => void;
  /** Fired once after INIT_SUCCESS — e.g. seed `selection.smi` on empty canvas. */
  onReady?: (
    client: MoleculeWorkerClient<MoleculeWorkerRequest, MoleculeWorkerResponse>,
  ) => void;
}

export function useMoleculeEngineWorker({
  onMessage,
  onReady,
}: UseMoleculeEngineWorkerOptions) {
  const workerRef = useRef<MoleculeWorkerClient<
    MoleculeWorkerRequest,
    MoleculeWorkerResponse
  > | null>(null);
  const onMessageRef = useRef(onMessage);
  const onReadyRef = useRef(onReady);

  useEffect(() => {
    onMessageRef.current = onMessage;
    onReadyRef.current = onReady;
  }, [onMessage, onReady]);

  const [engineWorkerStatus, setEngineWorkerStatus] =
    useState<EngineWorkerStatus>('loading');
  const [indigoLayoutReady, setIndigoLayoutReady] = useState(false);
  const [engineWorkerError, setEngineWorkerError] = useState<string | null>(null);

  useEffect(() => {
    const client = createMoleculeWorkerClient<
      MoleculeWorkerRequest,
      MoleculeWorkerResponse
    >(new MoleculeEngineWorker());
    workerRef.current = client;

    const unsubscribe = client.onMessage((msg: MoleculeWorkerResponse) => {
      if (msg.type === 'INIT_SUCCESS') {
        setEngineWorkerStatus('ready');
        setEngineWorkerError(null);
        onReadyRef.current?.(client);
        return;
      }
      if (msg.type === 'INIT_INDIGO_SUCCESS') {
        setIndigoLayoutReady(!!msg.payload?.ready);
        // Soft Indigo seed for main-thread 3D refine (never pulled into 3D worker).
        if (msg.payload?.ready) {
          registerIndigo2DSeedFor3D(mol => {
            if (!isIndigoReady()) return null;
            return layoutMoleculeIndigoSync(mol, { bondLengthPx: 1.5 });
          });
        }
        return;
      }
      if (msg.type === 'INIT_INDIGO_ERROR') {
        setIndigoLayoutReady(false);
        registerIndigo2DSeedFor3D(null);
        console.warn('Indigo layout unavailable:', msg.error);
        return;
      }
      if (msg.type === 'INIT_ERROR') {
        setEngineWorkerStatus('error');
        setEngineWorkerError(msg.error);
        console.error('Engine worker error:', msg.error);
        return;
      }
      onMessageRef.current(msg);
    });

    client.post({ type: 'INIT', id: 'init-1' });

    return () => {
      unsubscribe();
      client.terminate();
      workerRef.current = null;
    };
  }, []);

  return {
    workerRef,
    engineWorkerStatus,
    engineWorkerError,
    indigoLayoutReady,
  };
}
