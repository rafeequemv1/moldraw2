import type { ReactionArrowKind } from './types';

/** Kinds that are decorative only — `reactionSmilesSplit` skips them. */
const NON_PARTITION_KINDS = new Set<ReactionArrowKind>([
  'resonance',
  'equilibrium',
  'half_equilibrium',
  'electron_flow',
  'path',
  'row_wrap',
  'cycle_arc',
]);

/**
 * Whether this arrow may be used to partition the canvas into reactants vs
 * products for `reactants>>products` SMILES. Uses the chord from tail (x1,y1)
 * to head (x2,y2); curved / S / retrosynthetic / straight all use the same
 * geometric half-plane test.
 */
export const reactionArrowParticipatesInSmilesSplit = (arrow: {
  kind?: ReactionArrowKind;
}): boolean => !NON_PARTITION_KINDS.has(arrow.kind ?? 'straight');
