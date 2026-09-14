import { explicitHydrogensInputSchema } from '../../schemas/tools';
import type { RegisteredAiTool } from '../types';
import { toolFail, toolOk } from '../types';

export const explicitHydrogensTool: RegisteredAiTool = {
  id: 'molecule.explicit_hydrogens',
  category: 'async',
  description:
    'Fold or unfold explicit hydrogen atoms (mode: fold | unfold | auto). Native @moldraw/engine in MCP / HTTP sessions; the in-app worker when embedded.',
  inputSchema: explicitHydrogensInputSchema,
  handler: async (input, ctx) => {
    const { mode = 'auto' } = (input ?? {}) as { mode?: 'fold' | 'unfold' | 'auto' };
    if (!ctx.runExplicitHydrogens) {
      return toolFail(
        'NO_DISPATCHER',
        'molecule.explicit_hydrogens requires ctx.runExplicitHydrogens (in-app worker).',
      );
    }
    const r = await ctx.runExplicitHydrogens(mode);
    if (!r.ok) return toolFail('EXECUTION', r.error ?? 'Explicit-hydrogen convert failed');
    return toolOk(r.data ?? { mode });
  },
};
