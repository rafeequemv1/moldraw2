/**
 * Resolve SMILES to a 2D molblock for canvas import.
 *
 * Uses local parse + 2D layout so aromatic SMILES (`c1ccccc1`) stay aromatic
 * and Kekulé SMILES (`C1=CC=CC=C1`) stay explicit doubles. PubChem SDF is not
 * used here — it always kekulizes and would erase that distinction.
 */
import { indigoSmilesTo2DMolblock, nativeSmilesTo2DMolblock } from './smilesToMolblock';

export type Smiles2DSource = 'pubchem' | 'indigo' | 'native';

export interface ResolveSmiles2DResult {
  molblock: string;
  source: Smiles2DSource;
}

/**
 * SMILES → 2D molblock. Native layout first (preserves aromatic flags), then
 * optional worker / Indigo for coordinates only.
 */
export async function resolveSmilesTo2DMolblock(
  smiles: string,
  options?: {
    /** Skip network (offline / tests). Unused for SMILES — PubChem is not consulted. */
    offline?: boolean;
    /** Worker Indigo/native path when direct load is unavailable. */
    workerSmilesToMolblock?: (smiles: string) => Promise<string>;
  },
): Promise<ResolveSmiles2DResult | null> {
  const trimmed = smiles.trim();
  if (!trimmed) return null;
  void options?.offline;

  if (options?.workerSmilesToMolblock) {
    try {
      const mb = await options.workerSmilesToMolblock(trimmed);
      if (mb?.trim()) return { molblock: mb, source: 'native' };
    } catch {
      /* fall through */
    }
  }

  const native = nativeSmilesTo2DMolblock(trimmed);
  if (native?.trim()) return { molblock: native, source: 'native' };

  const indigo = await indigoSmilesTo2DMolblock(trimmed);
  if (indigo?.trim()) return { molblock: indigo, source: 'indigo' };

  return null;
}
