/**
 * Resolve SMILES to a 2D molblock for canvas import.
 *
 * Prefer PubChem's precomputed 2D SDF when online, then Indigo layout
 * (worker or direct), then native generate2D.
 */
import { pubchemMolblockFromSmiles } from './pubchemSmiles';
import { indigoSmilesTo2DMolblock, nativeSmilesTo2DMolblock } from './smilesToMolblock';

export type Smiles2DSource = 'pubchem' | 'indigo' | 'native';

export interface ResolveSmiles2DResult {
  molblock: string;
  source: Smiles2DSource;
}

/**
 * SMILES → 2D molblock. Tries PubChem SDF, then Indigo, then native.
 */
export async function resolveSmilesTo2DMolblock(
  smiles: string,
  options?: {
    /** Skip network (offline / tests). Default false. */
    offline?: boolean;
    /** Worker Indigo/native path when direct load is unavailable. */
    workerSmilesToMolblock?: (smiles: string) => Promise<string>;
  },
): Promise<ResolveSmiles2DResult | null> {
  const trimmed = smiles.trim();
  if (!trimmed) return null;

  if (!options?.offline) {
    const pc = await pubchemMolblockFromSmiles(trimmed);
    if (pc?.trim()) return { molblock: pc, source: 'pubchem' };
  }

  if (options?.workerSmilesToMolblock) {
    try {
      const mb = await options.workerSmilesToMolblock(trimmed);
      if (mb?.trim()) return { molblock: mb, source: 'indigo' };
    } catch {
      /* fall through */
    }
  }

  const indigo = await indigoSmilesTo2DMolblock(trimmed);
  if (indigo?.trim()) return { molblock: indigo, source: 'indigo' };

  const native = nativeSmilesTo2DMolblock(trimmed);
  if (native?.trim()) return { molblock: native, source: 'native' };

  return null;
}
