import { emptyInputSchema } from '../../schemas/tools';
import type { RegisteredAiTool } from '../types';
import { toolFail, toolOk } from '../types';

export const automapTool: RegisteredAiTool = {
  id: 'molecule.automap',
  category: 'async',
  description:
    'Run reaction atom-atom mapping (automap) when reactants/products are separated by a reaction arrow. In-app only (Indigo worker); returns NO_DISPATCHER in headless MCP / HTTP sessions.',
  inputSchema: emptyInputSchema,
  handler: async (_input, ctx) => {
    if (!ctx.runAutomap) {
      return toolFail('NO_DISPATCHER', 'molecule.automap requires ctx.runAutomap (in-app worker).');
    }
    const r = await ctx.runAutomap();
    if (!r.ok) return toolFail('EXECUTION', r.error ?? 'Automap failed');
    return toolOk(r.data ?? {});
  },
};
