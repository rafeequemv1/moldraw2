import type { ZodType } from 'zod';
import type { CommandVisibility } from '@moldraw/core';
import type { AiExecutionContext, AiToolError, AiToolResult } from '../types';

/** MCP / docs categories for hand-authored and command tools. */
export type AiToolCategory = 'read' | 'mutate' | 'async' | 'meta' | 'recipe' | 'facade';

export interface RegisteredAiTool {
  /** Stable string id; e.g. `'molecule.stats'` or `'command.molecule.addAtom'`. */
  id: string;
  /** Short description for agents / MCP `description` fields. */
  description: string;
  category: AiToolCategory;
  inputSchema: ZodType<unknown>;
  handler: (input: unknown, ctx: AiExecutionContext) => AiToolResult | Promise<AiToolResult>;
  /** Human title for MCP `annotations.title` (defaults to the id). */
  title?: string;
  /**
   * Catalogue visibility. `core` = default MCP toolset; `advanced` adds niche
   * tools; `internal` only appears in the `full` toolset. Read tools default
   * to `core`, command tools inherit `commandMeta`, recipes default to `core`.
   */
  visibility?: CommandVisibility;
  /** Removes content (atoms, bonds, annotations, whole document). */
  destructive?: boolean;
  /** Re-running with the same input yields the same document. */
  idempotent?: boolean;
  /** Free-form grouping tags for discovery (`atoms`, `rings`, `reactions`, …). */
  tags?: readonly string[];
  /** Optional Zod schema for `data` in a successful result (exposed as MCP `outputSchema`). */
  outputSchema?: ZodType<unknown>;
}

export function toolFail(
  code: AiToolError['code'],
  message: string,
  details?: unknown,
): AiToolResult {
  return { ok: false, error: { code, message, details } };
}

export function toolOk(data: unknown = {}): AiToolResult {
  return { ok: true, data };
}

const KNOWN_CODES: ReadonlySet<string> = new Set([
  'UNKNOWN_TOOL',
  'UNKNOWN_COMMAND',
  'VALIDATION',
  'NOT_FOUND',
  'EXECUTION',
  'NO_DISPATCHER',
]);

/** Map a command-layer error code onto the tool error code union. */
export function toToolErrorCode(code: string | undefined): AiToolError['code'] {
  return code && KNOWN_CODES.has(code) ? (code as AiToolError['code']) : 'EXECUTION';
}

export function requireApplyCommand(
  ctx: AiExecutionContext,
  commandId: string,
): AiToolResult | null {
  if (!ctx.applyCommand) {
    return toolFail(
      'NO_DISPATCHER',
      `${commandId} requires ctx.applyCommand. Mutating tools cannot run in a read-only context.`,
    );
  }
  return null;
}

export function dispatchCommand(
  ctx: AiExecutionContext,
  commandId: string,
  input: unknown,
): AiToolResult {
  const missing = requireApplyCommand(ctx, commandId);
  if (missing) return missing;
  const r = ctx.applyCommand!(commandId, input);
  if (!r.ok) {
    return toolFail(
      toToolErrorCode(r.error?.code),
      r.error?.message ?? `Command ${commandId} failed`,
      r.error?.details,
    );
  }
  return toolOk({ extra: r.extra });
}
