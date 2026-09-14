/**
 * `molecule.batch` — run several tools in one round-trip, atomically.
 *
 * Steps run in order against the same session. On failure (with `atomic`,
 * the default) every step that changed the document is undone, so the canvas
 * never ends up half-edited. Inputs may reference earlier results with
 * `"$0.newAtomIds.1"` (step index, then a dotted path into that step's data).
 */
import { z } from 'zod';
import type { AiExecutionContext, AiToolResult } from '../../types';
import type { RegisteredAiTool } from '../types';
import { toolFail, toolOk } from '../types';

const stepSchema = z
  .object({
    tool: z.string().min(1).describe('Tool id, e.g. "draw.ring" or "command.molecule.addAtom".'),
    input: z
      .record(z.string(), z.unknown())
      .default({})
      .describe(
        'Tool input. String values of the form "$<stepIndex>.<path>" are replaced with data from an earlier step, e.g. "$0.newAtomIds.0".',
      ),
  })
  .describe('One batch step.');

export const batchInputSchema = z
  .object({
    steps: z.array(stepSchema).min(1).max(100).describe('Steps to run in order (max 100).'),
    atomic: z
      .boolean()
      .default(true)
      .describe('Undo all applied steps if any step fails (default true).'),
    stopOnError: z
      .boolean()
      .default(true)
      .describe('Stop at the first failing step (default true). Ignored when atomic is true.'),
  })
  .describe('Run several tools in one call.');

const REF_RE = /^\$(\d+)\.(.+)$/;

function resolveRefs(value: unknown, results: unknown[], stepIndex: number): unknown {
  if (typeof value === 'string') {
    const m = REF_RE.exec(value);
    if (!m) return value;
    const idx = Number(m[1]);
    if (!(idx < stepIndex)) throw new Error(`Step ${stepIndex}: reference "${value}" points at a step that has not run yet.`);
    let cur: unknown = results[idx];
    for (const seg of m[2].split('.')) {
      if (cur == null || typeof cur !== 'object') {
        throw new Error(`Step ${stepIndex}: reference "${value}" could not be resolved (missing "${seg}").`);
      }
      cur = (cur as Record<string, unknown>)[seg];
    }
    if (cur === undefined) throw new Error(`Step ${stepIndex}: reference "${value}" resolved to undefined.`);
    return cur;
  }
  if (Array.isArray(value)) return value.map(v => resolveRefs(v, results, stepIndex));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = resolveRefs(v, results, stepIndex);
    return out;
  }
  return value;
}

export const batchTool: RegisteredAiTool = {
  id: 'molecule.batch',
  title: 'Batch',
  category: 'meta',
  visibility: 'core',
  tags: ['meta'],
  description:
    'Run several tools in one call, atomically (all-or-nothing by default). Later steps can reference earlier results with "$<step>.<path>", e.g. draw.atom then draw.bond with fromAtomId "$0.newAtomIds.0". Returns per-step results.',
  inputSchema: batchInputSchema,
  handler: async (raw, ctx) => {
    const input = raw as z.infer<typeof batchInputSchema>;
    // Lazy import avoids a circular dependency with the registry.
    const { executeAiTool } = await import('../../executor');
    const results: AiToolResult[] = [];
    const datas: unknown[] = [];
    let applied = 0;
    const undoApplied = (): void => {
      for (let i = 0; i < applied; i++) ctx.undo?.();
    };
    for (let i = 0; i < input.steps.length; i++) {
      const step = input.steps[i];
      if (step.tool === 'molecule.batch') {
        return toolFail('VALIDATION', `Step ${i}: nested molecule.batch is not allowed.`);
      }
      let resolvedInput: unknown;
      try {
        resolvedInput = resolveRefs(step.input, datas, i);
      } catch (err) {
        if (input.atomic) undoApplied();
        return toolFail('VALIDATION', err instanceof Error ? err.message : String(err), { step: i, results });
      }
      const before = ctx.getMolecule();
      const r = await executeAiTool(step.tool, resolvedInput, ctx as AiExecutionContext);
      results.push(r);
      datas.push(r.ok ? r.data : undefined);
      if (ctx.getMolecule() !== before) applied += 1;
      if (!r.ok) {
        if (input.atomic) {
          undoApplied();
          return toolFail(r.error.code, `Step ${i} (${step.tool}) failed: ${r.error.message}. All ${applied} applied step(s) were undone.`, {
            step: i,
            results,
          });
        }
        if (input.stopOnError) break;
      }
    }
    return toolOk({
      steps: results.map((r, i) => ({ tool: input.steps[i]?.tool, ...r })),
      applied,
      ok: results.every(r => r.ok),
    });
  },
};
