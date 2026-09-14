import { formatZodIssues } from '@moldraw/core';
import { getRegisteredAiTool, listAiToolIds, resolveAiToolId } from './registry';
import type { AiExecutionContext, AiToolResult } from './types';

/**
 * Validates `rawInput` against the tool's Zod schema, then runs the handler
 * with `ctx`. Safe to call from in-app AI features, the MCP stdio bridge and
 * the local HTTP API — all three share this one entry point.
 *
 * Validation failures carry `details: { issues: [{ path, message, … }], summary }`
 * (see `formatZodIssues`) so an agent can correct the exact field.
 */
export const executeAiTool = async (
  toolId: string,
  rawInput: unknown,
  ctx: AiExecutionContext,
): Promise<AiToolResult> => {
  const tool = getRegisteredAiTool(toolId) ?? getRegisteredAiTool(resolveAiToolId(toolId) ?? '');
  if (!tool) {
    return {
      ok: false,
      error: {
        code: 'UNKNOWN_TOOL',
        message: `Unknown tool id: ${toolId}`,
        details: { knownTools: listAiToolIds() },
      },
    };
  }

  const parsed = tool.inputSchema.safeParse(rawInput ?? {});
  if (!parsed.success) {
    const formatted = formatZodIssues(parsed.error.issues);
    return {
      ok: false,
      error: {
        code: 'VALIDATION',
        message: `Invalid input for ${toolId}: ${formatted.summary}`,
        details: formatted,
      },
    };
  }

  return await tool.handler(parsed.data, ctx);
};
