import type { AiToolCategory } from './types';

export const AI_TOOL_CATEGORY_LABELS: Record<AiToolCategory, string> = {
  read: 'Read / introspection',
  mutate: 'Mutating command',
  async: 'Async chemistry (worker)',
  meta: 'Editor meta (undo / selection)',
  recipe: 'High-level recipe',
  facade: 'Drawing façade (draw.* / edit.*)',
};
