/**
 * Thin typed wrapper around a molecule worker (2D or 3D).
 *
 * Owns the worker lifetime and exposes a small typed API for the App:
 *   client.post({ type: 'GET_SMILES', payload: { molBlock }, id: 'copy' })
 *   client.onMessage(msg => …)
 *   client.terminate()
 *
 * Uses a duck-typed worker surface so Node/DOM `Worker` type merges cannot break
 * package typecheck (app `types: ["vite/client"]` + optional `@types/node`).
 */
export interface MoldrawWorkerLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accept DOM/Node Worker onmessage
  onmessage: ((ev: any) => void) | null;
  postMessage(message: unknown): void;
  terminate(): void;
}

export interface MoldrawWorkerUrlOptions {
  type?: 'classic' | 'module';
  credentials?: 'omit' | 'same-origin' | 'include';
  name?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- host hooks pass variously typed 2D/3D clients via refs
export interface MoleculeWorkerClient<Req = any, Res = any> {
  /** Send a typed request to the worker. */
  post: (req: Req) => void;
  /** Subscribe to all responses. Returns an unsubscribe function. */
  onMessage: (cb: (msg: Res) => void) => () => void;
  /** Terminate the underlying Worker. */
  terminate: () => void;
}

/**
 * Construct a molecule-worker client backed by a Worker instance.
 * The caller is responsible for calling `client.terminate()` on unmount.
 *
 * **Host owns Worker construction** — packages must not import Vite `?worker`
 * modules. Typical Vite app wiring:
 *
 * ```ts
 * import EngineWorker from '../workers/moleculeEngineWorker.ts?worker'
 * const client = createMoleculeWorkerClient(new EngineWorker())
 * ```
 *
 * Non-Vite / URL-based hosts can use {@link createMoleculeWorkerFromUrl}.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see MoleculeWorkerClient
export function createMoleculeWorkerClient<Req = any, Res = any>(
  worker: MoldrawWorkerLike,
): MoleculeWorkerClient<Req, Res> {
  let listener: ((msg: Res) => void) | null = null;
  worker.onmessage = e => {
    listener?.(e.data as Res);
  };
  return {
    post: req => worker.postMessage(req),
    onMessage: cb => {
      listener = cb;
      return () => {
        if (listener === cb) listener = null;
      };
    },
    terminate: () => worker.terminate(),
  };
}

type WorkerConstructor = new (
  scriptURL: string | URL,
  options?: MoldrawWorkerUrlOptions,
) => MoldrawWorkerLike;

/**
 * Build a client from a module Worker URL (bundler-agnostic).
 *
 * ```ts
 * const client = createMoleculeWorkerFromUrl(
 *   new URL('./moleculeEngineWorker.ts', import.meta.url),
 * )
 * ```
 *
 * Prefer Vite `?worker` in the Moldraw app so the worker is pre-bundled;
 * use this helper when the host already has a resolvable worker module URL.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see MoleculeWorkerClient
export function createMoleculeWorkerFromUrl<Req = any, Res = any>(
  url: URL | string,
  options?: MoldrawWorkerUrlOptions,
): MoleculeWorkerClient<Req, Res> {
  const WorkerCtor = (globalThis as unknown as { Worker?: WorkerConstructor }).Worker;
  if (!WorkerCtor) {
    throw new Error('createMoleculeWorkerFromUrl requires globalThis.Worker');
  }
  return createMoleculeWorkerClient<Req, Res>(
    new WorkerCtor(url, { type: 'module', ...options }),
  );
}
