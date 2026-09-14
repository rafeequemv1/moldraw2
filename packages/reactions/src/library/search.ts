import { REACTION_CATEGORIES } from './categories';
import { NAMED_REACTIONS } from './namedReactions';
import type { ReactionCategoryId, ReactionTemplate } from '../types';

export type ReactionSearchHit = {
  reaction: ReactionTemplate;
  categoryLabel: string;
};

const categoryLabel = (id: ReactionCategoryId): string =>
  REACTION_CATEGORIES.find(c => c.id === id)?.label ?? id;

export const searchNamedReactions = (query: string): ReactionSearchHit[] => {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: ReactionSearchHit[] = [];
  for (const reaction of NAMED_REACTIONS) {
    const hay = [
      reaction.name,
      reaction.label,
      reaction.summary,
      reaction.mechanism ?? '',
      ...(reaction.tags ?? []),
      ...(reaction.aliases ?? []),
    ]
      .join(' ')
      .toLowerCase();
    if (hay.includes(q)) {
      hits.push({ reaction, categoryLabel: categoryLabel(reaction.categoryId) });
    }
  }
  return hits;
};

export const categoryHasReactionMatch = (categoryId: ReactionCategoryId, query: string): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const cat = REACTION_CATEGORIES.find(c => c.id === categoryId);
  if (cat?.label.toLowerCase().includes(q)) return true;
  return NAMED_REACTIONS.some(r => {
    if (r.categoryId !== categoryId) return false;
    return searchNamedReactions(query).some(h => h.reaction.id === r.id);
  });
};

export const reactionsInCategory = (categoryId: ReactionCategoryId): ReactionTemplate[] =>
  NAMED_REACTIONS.filter(r => r.categoryId === categoryId);
