import { engine } from '@moldraw/engine';
import { layoutMoleculeIndigo, isIndigoReady, loadIndigo } from '@moldraw/engine-2d';

/**
 * SMILES → 2D V2000 molblock via Indigo layout when WASM is ready.
 */
export async function indigoSmilesTo2DMolblock(
  smiles: string,
  bondLengthPx = 45,
): Promise<string | null> {
  try {
    const mol = engine.parseSmiles(smiles);
    if (mol.atoms.length === 0) return null;
    const { molecule } = await layoutMoleculeIndigo(mol, { bondLengthPx });
    return engine.toMolblock(molecule);
  } catch {
    return null;
  }
}

/**
 * SMILES → 2D V2000 molblock via native generate2D (no WASM).
 */
export function nativeSmilesTo2DMolblock(smiles: string, bondLengthPx = 45): string | null {
  try {
    const mol = engine.parseSmiles(smiles);
    if (mol.atoms.length === 0) return null;
    const laid = engine.generate2D(mol, { bondLengthPx });
    if (laid.atoms.length === 0) return null;
    return engine.toMolblock(laid);
  } catch (err) {
    console.warn('[nativeSmilesTo2DMolblock] failed', err);
    return null;
  }
}

/**
 * Prefer Indigo when ready, else native.
 */
export async function smilesTo2DMolblock(
  smiles: string,
  bondLengthPx = 45,
): Promise<{ molblock: string; source: 'indigo' | 'native' } | null> {
  try {
    await loadIndigo();
  } catch {
    /* native fallback */
  }
  if (isIndigoReady()) {
    const indigo = await indigoSmilesTo2DMolblock(smiles, bondLengthPx);
    if (indigo?.trim()) return { molblock: indigo, source: 'indigo' };
  }
  const native = nativeSmilesTo2DMolblock(smiles, bondLengthPx);
  if (native?.trim()) return { molblock: native, source: 'native' };
  return null;
}
