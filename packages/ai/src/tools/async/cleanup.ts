import { schemas } from '@moldraw/core';
import type { RegisteredAiTool } from '../types';
import { toolFail, toolOk } from '../types';

function enrichCleanupInput(rawInput: unknown, ctx: import('../../types').AiExecutionContext): unknown {
  const input =
    rawInput && typeof rawInput === 'object'
      ? { ...(rawInput as Record<string, unknown>) }
      : {};
  if (input.bondLengthPx == null && ctx.bondLengthPx != null) {
    input.bondLengthPx = ctx.bondLengthPx;
  }
  return input;
}

export const cleanupTool: RegisteredAiTool = {
  id: 'command.molecule.cleanup',
  category: 'async',
  description: 'Run structure cleanup (Indigo when ready, else native 2D layout).',
  inputSchema: schemas.cleanup,
  handler: async (input, ctx) => {
    const enriched = enrichCleanupInput(input, ctx);
    if (ctx.runCleanup) {
      const r = await ctx.runCleanup();
      if (!r.ok) {
        const msg = r.error ?? 'Cleanup failed';
        // PubChem / stereo-rich imports often disagree with Indigo atom counts;
        // treat as soft skip so the chat does not look like a hard failure.
        if (/structure mismatch|atom mismatch/i.test(msg)) {
          return toolOk({ applied: false, warning: msg });
        }
        return toolFail('EXECUTION', msg);
      }
      return toolOk({ applied: true });
    }
    if (ctx.applyCommand) {
      const r = ctx.applyCommand('molecule.cleanup', enriched);
      if (!r.ok) {
        const msg = r.error?.message ?? 'Cleanup failed';
        if (/structure mismatch|atom mismatch/i.test(msg)) {
          return toolOk({ applied: false, warning: msg });
        }
        return toolFail(
          (r.error?.code as 'VALIDATION' | 'EXECUTION') ?? 'EXECUTION',
          msg,
        );
      }
      return toolOk({ applied: true });
    }
    return toolFail('NO_DISPATCHER', 'molecule.cleanup requires ctx.runCleanup or ctx.applyCommand.');
  },
};
