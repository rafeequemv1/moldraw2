import { aromatizeInputSchema } from '../../schemas/tools';
import type { RegisteredAiTool } from '../types';
import { toolFail, toolOk } from '../types';

export const aromatizeTool: RegisteredAiTool = {
  id: 'molecule.aromatize',
  category: 'async',
  description:
    'Aromatize or dearomatize bonds (Kekulé ↔ aromatic circles). Native @moldraw/engine in MCP / HTTP sessions; the in-app worker (Indigo optional) when embedded.',
  inputSchema: aromatizeInputSchema,
  handler: async (input, ctx) => {
    const { mode = 'aromatize' } = (input ?? {}) as { mode?: 'aromatize' | 'dearomatize' };
    if (!ctx.runAromatize) {
      return toolFail('NO_DISPATCHER', 'molecule.aromatize requires ctx.runAromatize (in-app worker).');
    }
    const r = await ctx.runAromatize(mode);
    if (!r.ok) return toolFail('EXECUTION', r.error ?? 'Aromatize failed');
    return toolOk(r.data ?? { mode });
  },
};
