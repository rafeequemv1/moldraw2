/**
 * `molecule.transaction` — apply several commands as ONE atomic, undoable step.
 *
 * Each step runs through the normal `runCommand` pipeline (Zod → reference
 * check → apply) against the intermediate molecule, so ids created by step 0
 * are visible to step 1. If any step fails the whole transaction fails with
 * that step's error code and nothing is committed. Undo reverts all steps at once.
 *
 * Used by the AI façade tools (`draw.atom` with `attachToAtomId`, `draw.ring`
 * with a follow-up element change, …) so one agent action is one history entry.
 */
import { z } from 'zod';
import type { Molecule } from '@moldraw/domain';
import { runCommand } from './executor';
import { CommandFailureError, type MoleculeCommand } from './types';

export const TRANSACTION_COMMAND_ID = 'molecule.transaction';

export const transactionInputSchema = z
  .object({
    steps: z
      .array(
        z.object({
          id: z.string().min(1).describe('Command id, e.g. "molecule.addAtom".'),
          input: z.unknown().default({}).describe('Input for that command.'),
        }),
      )
      .min(1)
      .max(100)
      .describe('Commands to apply in order (1-100). All succeed or none is applied.'),
  })
  .describe('Apply several commands as one undoable step.');

export interface TransactionExtra {
  /** Per-step `extra` payloads (same order as `steps`). */
  steps: unknown[];
  /** Union of ids created by the steps (when steps report them). */
  newAtomIds: string[];
  newBondIds: string[];
}

export const transactionCmd: MoleculeCommand<z.infer<typeof transactionInputSchema>, TransactionExtra> = {
  id: TRANSACTION_COMMAND_ID,
  description:
    'Apply several commands atomically as one undo step. Fails with the first failing step\'s error; nothing is applied then.',
  inputSchema: transactionInputSchema,
  visibility: 'core',
  tags: ['meta'],
  references: 'lenient',
  apply: (prev: Molecule, { steps }) => {
    let cur = prev;
    const extras: unknown[] = [];
    const newAtomIds: string[] = [];
    const newBondIds: string[] = [];
    steps.forEach((step, index) => {
      if (step.id === TRANSACTION_COMMAND_ID) {
        throw new CommandFailureError('VALIDATION', `Step ${index}: nested molecule.transaction is not allowed.`);
      }
      const r = runCommand(cur, step.id, step.input);
      if (!r.ok) {
        throw new CommandFailureError(r.error.code, `Step ${index} (${step.id}) failed: ${r.error.message}`, {
          step: index,
          ...(r.error.details && typeof r.error.details === 'object' ? (r.error.details as object) : {}),
        });
      }
      cur = r.next;
      extras.push(r.extra);
      const ex = r.extra as { newAtomIds?: string[]; newBondIds?: string[] } | undefined;
      if (ex?.newAtomIds) newAtomIds.push(...ex.newAtomIds);
      if (ex?.newBondIds) newBondIds.push(...ex.newBondIds);
    });
    return { next: cur, extra: { steps: extras, newAtomIds, newBondIds } };
  },
};
