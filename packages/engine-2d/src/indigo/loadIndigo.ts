/**
 * Lazy loader for indigo-ketcher WASM (optional accelerator).
 *
 * Native engine stays the default brain; Indigo is loaded once and reused for
 * preferred 2D layout/cleanup when available. Failure to load must never break
 * the app — callers fall back to native cleanupStructure.
 */
import type { IndigoKetcher } from './types';

let indigoPromise: Promise<IndigoKetcher | null> | null = null;
let indigoInstance: IndigoKetcher | null = null;

/** True after a successful load (sync peek). */
export const isIndigoReady = (): boolean => indigoInstance != null;

/** Current Indigo instance, or null if not loaded / failed. */
export const getIndigoOrNull = (): IndigoKetcher | null => indigoInstance;

/**
 * Load Indigo WASM once. Resolves to the instance, or null if unavailable.
 * Safe to call from a worker or the main thread.
 */
export const loadIndigo = (): Promise<IndigoKetcher | null> => {
  if (indigoInstance) return Promise.resolve(indigoInstance);
  if (indigoPromise) return indigoPromise;

  indigoPromise = (async () => {
    try {
      const { default: factory } = await import('./indigoKetcherModule');
      const indigo = await factory();
      if (typeof indigo.layout !== 'function') {
        throw new Error('indigo-ketcher loaded but layout() is missing');
      }
      indigoInstance = indigo;
      return indigo;
    } catch (err) {
      console.warn('[indigo] WASM unavailable — native cleanup remains default', err);
      indigoInstance = null;
      return null;
    }
  })();

  return indigoPromise;
};

/** Reset loader state (tests only). */
export const resetIndigoLoaderForTests = (): void => {
  indigoPromise = null;
  indigoInstance = null;
};
