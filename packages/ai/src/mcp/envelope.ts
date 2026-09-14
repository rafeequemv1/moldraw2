/**
 * Uniform MCP tool result envelope. Every tool (read, mutate, façade, plugin)
 * returns the same shape so agents can branch on `ok` / `changed` without
 * per-tool special cases.
 */
import type { AiToolError } from '../types';

export interface McpToolEnvelope {
  ok: boolean;
  /** Session revision after the call. */
  revision: number;
  /** True when the document changed as a result of this call. */
  changed: boolean;
  /** Tool-specific payload (success only). */
  data?: unknown;
  /** Structured error (failure only). */
  error?: { code: AiToolError['code'] | string; message: string; details?: unknown };
}

/**
 * JSON Schema advertised as `outputSchema` for every tool. Kept deliberately
 * compact — it is repeated once per tool in `tools/list`, so every byte here is
 * multiplied by the toolset size. The long-form semantics live in
 * {@link MCP_ENVELOPE_DOC} (server `instructions`) and the docs.
 */
export const MCP_ENVELOPE_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  required: ['ok', 'revision', 'changed'],
  properties: {
    ok: { type: 'boolean' },
    revision: { type: 'integer' },
    changed: { type: 'boolean' },
    data: {},
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: { code: { type: 'string' }, message: { type: 'string' }, details: {} },
    },
  },
};

/** Human/agent-readable description of the envelope (used in server instructions and docs). */
export const MCP_ENVELOPE_DOC =
  'Every tool returns { ok, revision, changed, data | error }. revision = session revision after the call (increments on every committed change); ' +
  'changed = true only when the document actually changed (false for reads and no-op edits). ' +
  'error.code ∈ UNKNOWN_TOOL | UNKNOWN_COMMAND | VALIDATION (details.issues[{path,message}]) | NOT_FOUND (details.unknownAtomIds / unknownBondIds) | EXECUTION (chemistry reason, e.g. valency) | STALE_REVISION | NO_DISPATCHER. ' +
  'Mutating command.* tools return data.extra.newAtomIds / newBondIds; façade tools return them at the top level of data.';

export type McpCallToolResult = {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  structuredContent: Record<string, unknown>;
  isError?: boolean;
};

export function envelopeToCallResult(env: McpToolEnvelope): McpCallToolResult {
  const structured = env as unknown as Record<string, unknown>;
  return {
    content: [{ type: 'text', text: JSON.stringify(env) }],
    structuredContent: structured,
    ...(env.ok ? {} : { isError: true }),
  };
}
