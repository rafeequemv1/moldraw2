import type { ReactionArrowKind } from './types';

/** Decorative / mechanism arrows — no reagent above/below labels. */
const REAGENT_LABEL_EXCLUDED_KINDS = new Set<ReactionArrowKind>([
  'electron_flow',
  'resonance',
  'equilibrium',
  'half_equilibrium',
]);

/** Whether this arrow kind supports reagent/condition text above and below the shaft. */
export const reactionArrowSupportsReagentLabels = (kind?: ReactionArrowKind): boolean =>
  !REAGENT_LABEL_EXCLUDED_KINDS.has(kind ?? 'straight');
