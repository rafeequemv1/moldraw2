/**
 * `moldraw.list_tools` — discover tools beyond the default MCP toolset.
 * Lets an agent start with the compact `core` catalogue and pull in advanced
 * / internal commands on demand (by toolset, tag or free-text query).
 */
import { z } from 'zod';
import type { RegisteredAiTool } from '../types';
import { toolOk } from '../types';

export const listToolsInputSchema = z
  .object({
    toolset: z
      .enum(['core', 'advanced', 'full'])
      .default('full')
      .describe('Which catalogue to list: core (default MCP set), advanced (+niche), full (+internal).'),
    query: z.string().optional().describe('Case-insensitive substring matched against id, description and tags.'),
    tag: z.string().optional().describe('Only tools carrying this tag (e.g. "rings", "reactions", "stereo").'),
    category: z
      .enum(['read', 'mutate', 'async', 'meta', 'recipe', 'facade'])
      .optional()
      .describe('Only tools of this category.'),
    limit: z.number().int().min(1).max(200).default(60).describe('Max entries (default 60).'),
  })
  .describe('Search the tool catalogue.');

export const listToolsTool: RegisteredAiTool = {
  id: 'moldraw.list_tools',
  title: 'List tools',
  category: 'read',
  visibility: 'core',
  tags: ['meta', 'discovery'],
  description:
    'Search the full Moldraw tool catalogue (160+ tools) by toolset, tag, category or text. Use it when the advertised toolset (default: minimal) lacks what you need; any listed tool can be called directly even if it is not advertised.',
  inputSchema: listToolsInputSchema,
  handler: async raw => {
    const input = raw as z.infer<typeof listToolsInputSchema>;
    const [{ listAiToolsByCategory }, { isToolInToolset, toolVisibility }] = await Promise.all([
      import('../../registry'),
      import('../../toolsets'),
    ]);
    const q = input.query?.trim().toLowerCase();
    const all = listAiToolsByCategory(input.category).filter(t => isToolInToolset(t, input.toolset));
    const matched = all.filter(t => {
      if (input.tag && !(t.tags ?? []).includes(input.tag)) return false;
      if (!q) return true;
      return (
        t.id.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        (t.tags ?? []).some(tag => tag.toLowerCase().includes(q))
      );
    });
    return toolOk({
      total: matched.length,
      tools: matched.slice(0, input.limit).map(t => ({
        id: t.id,
        category: t.category,
        visibility: toolVisibility(t),
        destructive: t.destructive ?? false,
        tags: t.tags ?? [],
        description: t.description,
      })),
    });
  },
};
