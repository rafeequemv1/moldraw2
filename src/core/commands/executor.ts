/**
 * Pure command dispatch — validate Zod, run handler, return next molecule.
 *
 * Used by:
 *  - `MoleculeEditor.applyCommand` (via `createMoleculeStore`) for in-app dispatch with undo/redo.
 *  - `src/ai/registry.ts` to expose commands as AI/MCP tools without
 *    rebuilding any of the validation or business logic.
 */
import type { Molecule } from '@moldraw/domain';
import { getCommand } from './registry';
import type { CommandResult } from './types';

export const runCommand = (
  prev: Molecule,
  commandId: string,
  rawInput: unknown,
): CommandResult => {
  const cmd = getCommand(commandId);
  if (!cmd) {
    return {
      ok: false,
      error: { code: 'UNKNOWN_COMMAND', message: `Unknown command: ${commandId}` },
    };
  }
  const parsed = cmd.inputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION',
        message: `Invalid input for ${commandId}`,
        details: parsed.error.issues,
      },
    };
  }
  try {
    const { next, extra } = cmd.apply(prev, parsed.data);
    return { ok: true, next, extra };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'EXECUTION',
        message: err instanceof Error ? err.message : 'Command execution failed',
      },
    };
  }
};
