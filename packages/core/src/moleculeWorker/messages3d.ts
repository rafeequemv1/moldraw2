/**
 * Typed message contract for the dedicated 3D worker (`molecule3dWorker.ts`).
 * Kept separate from Indigo/2D worker messages so engine-2d types do not leak
 * into the 3D peer graph.
 */

export type Molecule3dWorkerRequest =
  | { type: 'INIT'; id: string }
  | {
      type: 'GENERATE_3D';
      id: string;
      payload: {
        molBlock: string;
        fallbackMolBlock?: string;
        includeHydrogens: boolean;
        sequence?: number;
        /** Optional heavy-atom hint so the worker can pick a light path early. */
        heavyAtomHint?: number;
        /** Grow 3D center-out with streamed shell progress (large molecules). */
        progressive?: boolean;
        /**
         * Starting 3D coordinates (Å, molblock frame) in `molBlock` atom order;
         * `null` entries are seeded from the depiction. Re-minimizes an existing
         * conformer (canvas Structure Perspective re-clean) instead of lifting 2D.
         */
        seed3D?: ({ x: number; y: number; z: number } | null)[];
      };
    }
  | {
      type: 'REFINE_3D_REGION';
      id: string;
      payload: {
        molBlock: string;
        previousMolBlock3D: string;
        dirtyAtomIds: string[];
        includeHydrogens: boolean;
        bondBuffer?: number;
        maxIterations?: number;
        sequence?: number;
      };
    };

export type Molecule3dWorkerResponse =
  | { type: 'INIT_SUCCESS'; id: string }
  | { type: 'INIT_ERROR'; id: string; error: string }
  | {
      type: 'GENERATE_3D_SUCCESS';
      id: string;
      payload: {
        molBlock3D: string;
        source: string;
        energy?: number;
        movableCount?: number;
        atomCount?: number;
      };
    }
  | {
      type: 'GENERATE_3D_PROGRESS';
      id: string;
      payload: {
        molBlock3D: string;
        fraction: number;
        shell: number;
        shellCount: number;
        done: boolean;
        energy?: number;
      };
    }
  | { type: 'GENERATE_3D_ERROR'; id: string; error: string };
