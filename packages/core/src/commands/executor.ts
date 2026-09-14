/**
 * Pure command dispatch — validate Zod, check id references, run handler,
 * return next molecule.
 *
 * Used by:
 *  - `MoleculeEditor.applyCommand` (via `createMoleculeStore`) for in-app dispatch with undo/redo.
 *  - `src/ai/registry.ts` to expose commands as AI/MCP tools without
 *    rebuilding any of the validation or business logic.
 */
import type { Molecule } from '@moldraw/domain';
import { getCommand } from './registry';
import { CommandFailureError, type CommandResult } from './types';
import {
  describeUnknownReferences,
  findUnknownReferences,
  formatZodIssues,
  LENIENT_REFERENCE_COMMANDS,
} from './validation';

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
    const formatted = formatZodIssues(parsed.error.issues);
    return {
      ok: false,
      error: {
        code: 'VALIDATION',
        message: `Invalid input for ${commandId}: ${formatted.summary}`,
        details: formatted,
      },
    };
  }
  if (cmd.references !== 'lenient' && !LENIENT_REFERENCE_COMMANDS.has(commandId)) {
    const refs = findUnknownReferences(prev, parsed.data);
    if (refs) {
      return {
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `${commandId}: ${describeUnknownReferences(refs)}`,
          details: refs,
        },
      };
    }
  }
  try {
    const { next, extra } = cmd.apply(prev, parsed.data);
    return { ok: true, next, extra };
  } catch (err) {
    if (err instanceof CommandFailureError) {
      return { ok: false, error: { code: err.code, message: err.message, details: err.details } };
    }
    return {
      ok: false,
      error: {
        code: 'EXECUTION',
        message: err instanceof Error ? err.message : 'Command execution failed',
      },
    };
  }
};
