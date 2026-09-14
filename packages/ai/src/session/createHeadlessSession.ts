import { createMoldrawSession } from './createMoldrawSession';
import { loadMoleculeFromPath } from './loadMoleculeFile';
import { createJsonFilePersist } from './persistFile';
import type { MoldrawSession } from './types';

/** One independent session for local MCP / HTTP. Not a global singleton. */
export function createHeadlessSession(opts?: {
  moleculePath?: string;
  bondLengthPx?: number;
}): MoldrawSession {
  const moleculePath = opts?.moleculePath ?? process.env.MOLDRAW_MOLECULE_PATH;
  const bondLengthPx = opts?.bondLengthPx ?? (Number(process.env.MOLDRAW_BOND_LENGTH_PX) || 40);
  return createMoldrawSession({
    initialMolecule: loadMoleculeFromPath(moleculePath),
    bondLengthPx,
    persist: moleculePath ? createJsonFilePersist(moleculePath) : undefined,
  });
}
