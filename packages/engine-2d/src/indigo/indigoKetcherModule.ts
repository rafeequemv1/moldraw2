/**
 * Typed re-export of indigo-ketcher (no official @types).
 * Prefer the separate-wasm build so Vite can fetch the .wasm asset correctly
 * inside Web Workers (the single-file build embeds a huge base64 blob and can
 * hang or fail to instantiate in workers).
 */
import type { IndigoFactory } from './types';

// @ts-expect-error -- indigo-ketcher has no TypeScript types
import factory from 'indigo-ketcher/binaryWasmNoRender';

export default factory as IndigoFactory;
