import { pathLength } from './simplify';
import type { Stroke } from './types';

/** Prefer the editor bond length; fall back to median stroke length if empty. */
export function estimateScale(strokes: Stroke[], bondLengthPx: number): number {
  if (bondLengthPx > 4) return bondLengthPx;
  const lengths = strokes.map(s => pathLength(s.points)).filter(n => n > 0).sort((a, b) => a - b);
  if (lengths.length === 0) return 40;
  return lengths[Math.floor(lengths.length / 2)]!;
}
