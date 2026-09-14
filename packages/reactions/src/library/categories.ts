import type { ReactionCategory, ReactionCategoryId } from '../types';

export const REACTION_CATEGORIES: readonly ReactionCategory[] = [
  { id: 'substitution', label: 'Substitution', implemented: true },
  { id: 'elimination', label: 'Elimination', implemented: true },
  { id: 'addition', label: 'Addition', implemented: true },
  { id: 'carbonyl', label: 'Carbonyl chemistry', implemented: true },
  { id: 'aromatic', label: 'Aromatic', implemented: true },
  { id: 'oxidation-reduction', label: 'Oxidation & reduction', implemented: true },
] as const;

export const DEFAULT_REACTION_CATEGORY_ID: ReactionCategoryId = 'substitution';

export const REACTION_CATEGORY_BY_ID: ReadonlyMap<ReactionCategoryId, ReactionCategory> = new Map(
  REACTION_CATEGORIES.map(c => [c.id, c]),
);
