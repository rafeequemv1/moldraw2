/**
 * Thin typed wrapper around a molecule worker (2D or 3D).
 *
 * Owns the worker lifetime and exposes a small typed API for the App:
 *   client.post({ type: 'GET_SMILES', payload: { molBlock }, id: 'copy' })
 *   client.onMessage(msg => …)
 *   client.terminate()
 */
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
 * Construct a molecule-worker client backed by a Worker instance (use Vite's
 * `?worker` import so the worker is emitted as bundled JS in production).
 * The caller is responsible for calling `client.terminate()` on unmount.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see MoleculeWorkerClient
export function createMoleculeWorkerClient<Req = any, Res = any>(
  worker: Worker,
): MoleculeWorkerClient<Req, Res> {
  let listener: ((msg: Res) => void) | null = null;
  worker.onmessage = (e: MessageEvent<Res>) => {
    listener?.(e.data);
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
