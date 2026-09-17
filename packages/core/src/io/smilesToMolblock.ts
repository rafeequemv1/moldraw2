import { engine, certifyLayout, applyModelStereoToDepiction } from '@moldraw/engine';
import { looksLikeCompoundName } from './pubchemSmiles';

/**
 * SMILES → 2D V2000 molblock via Indigo layout when the optional
 * `@moldraw/engine-2d` peer is present and WASM is ready.
 * Dynamic import keeps Indigo off the default core/canvas bundle graph.
 */
export async function indigoSmilesTo2DMolblock(
  smiles: string,
  bondLengthPx = 45,
): Promise<string | null> {
  const trimmed = smiles.trim();
  if (!trimmed || looksLikeCompoundName(trimmed)) return null;
  try {
    const e2d = await import('@moldraw/engine-2d');
    const mol = engine.parseSmiles(trimmed);
    if (mol.atoms.length === 0) return null;
    const { molecule } = await e2d.layoutMoleculeIndigo(mol, { bondLengthPx });
    return engine.toMolblock(applyModelStereoToDepiction(molecule));
  } catch {
    return null;
  }
}

/**
 * SMILES → 2D V2000 molblock via native generate2D (no WASM).
 */
export function nativeSmilesTo2DMolblock(smiles: string, bondLengthPx = 45): string | null {
  const trimmed = smiles.trim();
  if (!trimmed || looksLikeCompoundName(trimmed)) return null;
  try {
    const mol = engine.parseSmiles(trimmed);
    if (mol.atoms.length === 0) return null;
    const seed = engine.generate2D(mol, { bondLengthPx, skipEnergyRefine: true });
    const certified = certifyLayout(seed, { bondLengthPx, maxRestarts: 2, repairRounds: 3 });
    if (certified.molecule.atoms.length === 0) return null;
    return engine.toMolblock(applyModelStereoToDepiction(certified.molecule));
  } catch (err) {
    console.warn('[nativeSmilesTo2DMolblock] failed', err);
    return null;
  }
}

/**
 * Native first; optional Indigo accelerator when peer loads.
 */
export async function smilesTo2DMolblock(
  smiles: string,
  bondLengthPx = 45,
  preferIndigo = false,
): Promise<{ molblock: string; source: 'indigo' | 'native' } | null> {
  const native = nativeSmilesTo2DMolblock(smiles, bondLengthPx);
  if (native?.trim() && !preferIndigo) return { molblock: native, source: 'native' };

  if (preferIndigo) {
    try {
      const e2d = await import('@moldraw/engine-2d');
      try {
        await e2d.loadIndigo();
      } catch {
        /* native fallback */
      }
      if (e2d.isIndigoReady()) {
        const indigo = await indigoSmilesTo2DMolblock(smiles, bondLengthPx);
        if (indigo?.trim()) return { molblock: indigo, source: 'indigo' };
      }
    } catch {
      /* peer absent */
    }
  }

  if (native?.trim()) return { molblock: native, source: 'native' };
  return null;
}
