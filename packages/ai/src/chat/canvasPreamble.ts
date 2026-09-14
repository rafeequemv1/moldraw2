/**
 * Deterministic canvas snapshot injected into each chat turn so the model
 * does not rely on memory (or a fresh get_canvas_state) for basic continuity.
 */
import { buildCanvasStateSnapshot } from '@moldraw/core';
import type { AiExecutionContext } from '../types';

export interface CanvasPreambleFingerprint {
  moleculeCount: number;
  atomCount: number;
  bondCount: number;
  smiles: string[];
  selectedAtomCount: number;
  selectedBondCount: number;
  formula: string;
}

/** Slim snapshot for structured memory + LLM suffix (no per-atom coords). */
export function buildCanvasPreambleFingerprint(aiCtx: AiExecutionContext): CanvasPreambleFingerprint {
  const mol = aiCtx.getMolecule();
  const snap = buildCanvasStateSnapshot(mol, {
    includeCoords: false,
    includeSmiles: true,
    includeAnnotations: false,
  });
  const sel = aiCtx.getSelection?.();
  const smiles = snap.molecules
    .map(m => m.smiles)
    .filter((s): s is string => Boolean(s))
    .slice(0, 12);
  return {
    moleculeCount: snap.summary.moleculeCount,
    atomCount: snap.summary.atomCount,
    bondCount: snap.summary.bondCount,
    smiles,
    selectedAtomCount: sel?.atomIds.length ?? 0,
    selectedBondCount: sel?.bondIds.length ?? 0,
    formula: snap.summary.empiricalFormula || '',
  };
}

/**
 * Short text block for systemInstructionSuffix. Keep under ~700 chars.
 */
export function formatCanvasPreambleForLlm(aiCtx: AiExecutionContext): string {
  const fp = buildCanvasPreambleFingerprint(aiCtx);
  if (fp.atomCount === 0 && fp.moleculeCount === 0) {
    return 'Live canvas: empty (no atoms).';
  }
  const smilesPart =
    fp.smiles.length > 0
      ? ` SMILES(left→right): ${fp.smiles.map((s, i) => `[${i}] ${s}`).join(' | ')}.`
      : '';
  const selPart =
    fp.selectedAtomCount > 0 || fp.selectedBondCount > 0
      ? ` Selection: ${fp.selectedAtomCount} atoms, ${fp.selectedBondCount} bonds.`
      : ' Selection: none.';
  const formulaPart = fp.formula ? ` Formula: ${fp.formula}.` : '';
  const body =
    `Live canvas (authoritative — prefer over older chat memory): ` +
    `${fp.moleculeCount} molecule(s), ${fp.atomCount} atoms, ${fp.bondCount} bonds.` +
    formulaPart +
    smilesPart +
    selPart;
  return body.length > 700 ? `${body.slice(0, 699)}…` : body;
}
