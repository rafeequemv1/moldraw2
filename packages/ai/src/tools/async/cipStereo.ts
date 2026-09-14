import { emptyInputSchema } from '../../schemas/tools';
import type { RegisteredAiTool } from '../types';
import { toolFail, toolOk } from '../types';

export const cipStereoTool: RegisteredAiTool = {
  id: 'molecule.cip_stereo',
  category: 'async',
  description:
    'Compute CIP stereo descriptors (R/S at tetrahedral centres, E/Z on double bonds) and return per-atom / per-bond tags. Native engine in MCP / HTTP; worker in-app.',
  inputSchema: emptyInputSchema,
  handler: async (_input, ctx) => {
    if (!ctx.runCipStereo) {
      return toolFail('NO_DISPATCHER', 'molecule.cip_stereo requires ctx.runCipStereo (in-app worker).');
    }
    const r = await ctx.runCipStereo();
    if (!r.ok) return toolFail('EXECUTION', r.error ?? 'CIP stereo failed');
    return toolOk(r.data ?? {});
  },
};
