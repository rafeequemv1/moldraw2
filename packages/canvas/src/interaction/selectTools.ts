/** Pointer tools that select (marquee, lasso, or whole connected fragment). */
export const SELECT_TOOL_IDS = ['select', 'lasso_select', 'fragment_select'] as const;

export type SelectFamilyToolId = (typeof SELECT_TOOL_IDS)[number];

export function isSelectTool(tool: string): tool is SelectFamilyToolId {
  return tool === 'select' || tool === 'lasso_select' || tool === 'fragment_select';
}
