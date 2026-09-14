import type { ProteinStyleSettings, ResidueSelection, StyledRegion } from './types';
import { DEFAULT_SELECTION_STYLE } from './types';

export function selectionKey(residues: ResidueSelection[]): string {
  return [...residues]
    .map(r => `${r.chain}:${r.resi}`)
    .sort()
    .join(',');
}

export function upsertStyledRegion(
  regions: StyledRegion[],
  residues: ResidueSelection[],
  style: ProteinStyleSettings,
): StyledRegion[] {
  if (residues.length === 0) return regions;
  const key = selectionKey(residues);
  const idx = regions.findIndex(r => selectionKey(r.residues) === key);
  if (idx >= 0) {
    const next = [...regions];
    next[idx] = { ...next[idx]!, style };
    return next;
  }
  return [...regions, { id: key, residues, style }];
}

export function styleForSelection(
  regions: StyledRegion[],
  residues: ResidueSelection[],
): ProteinStyleSettings {
  if (residues.length === 0) return DEFAULT_SELECTION_STYLE;
  const key = selectionKey(residues);
  return regions.find(r => selectionKey(r.residues) === key)?.style ?? DEFAULT_SELECTION_STYLE;
}

export const CUSTOM_COLOR_PRESETS = [
  '#3b82f6',
  '#ef4444',
  '#22c55e',
  '#f59e0b',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
  '#64748b',
] as const;
