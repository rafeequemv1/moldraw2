import type { ReactionArrow, ReactionArrowKind } from './types';

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

/** Default canvas px for reagent / condition text when no size is stored. */
export const DEFAULT_REAGENT_FONT_SIZE = 16;

export const REAGENT_FONT_SIZE_MIN = 8;
export const REAGENT_FONT_SIZE_MAX = 36;

export type ReactionArrowReagentSlot = 'above' | 'below';

export type ReagentFontSizeFields = Pick<
  ReactionArrow,
  'reagentFontSize' | 'reagentAboveFontSize' | 'reagentBelowFontSize'
>;

/** Resolve font size for one reagent slot (per-slot → shared → default). */
export const resolveReagentFontSize = (
  arrow: ReagentFontSizeFields,
  slot: ReactionArrowReagentSlot,
): number => {
  const specific = slot === 'above' ? arrow.reagentAboveFontSize : arrow.reagentBelowFontSize;
  return specific ?? arrow.reagentFontSize ?? DEFAULT_REAGENT_FONT_SIZE;
};

export const clampReagentFontSize = (n: number): number =>
  Math.min(REAGENT_FONT_SIZE_MAX, Math.max(REAGENT_FONT_SIZE_MIN, Math.round(n)));
