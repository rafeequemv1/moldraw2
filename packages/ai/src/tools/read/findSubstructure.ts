/**
 * `molecule.find_substructure` — semantic atom/bond selectors for agents.
 *
 * Lets an AI locate "the carbonyl", "all aromatic rings", "every N" without
 * reading coordinates: SMARTS-lite patterns, a named functional-group table,
 * or plain element symbols. Optionally selects the first/all matches so the
 * next `edit.*` / `command.*` call can target `selection`.
 */
import { z } from 'zod';
import {
  findSubstructure,
  NAMED_SUBSTRUCTURES,
  NAMED_SUBSTRUCTURE_IDS,
  SmartsSyntaxError,
  type SubstructureMatch,
} from '@moldraw/engine';
import type { RegisteredAiTool } from '../types';
import { toolFail, toolOk } from '../types';

const groupIds = NAMED_SUBSTRUCTURE_IDS as [string, ...string[]];

export const findSubstructureInputSchema = z
  .object({
    smarts: z
      .string()
      .min(1)
      .max(400)
      .optional()
      .describe(
        'SMARTS-lite pattern, e.g. "[CX3](=O)[OX2H1]" (carboxylic acid), "c1ccccc1" (benzene), "[N+]", "[R]" (ring atoms). Supported: element / aromatic atoms, [#n], wildcards * a A, X D H h R r v, charge, ring closures, branches, bond primitives - = # : ~ @ ! and & , ; logic. Not supported: recursive $(), disconnected ".", stereo, component grouping.',
      ),
    group: z
      .enum(groupIds)
      .optional()
      .describe(
        `Named functional group instead of SMARTS: ${NAMED_SUBSTRUCTURE_IDS.join(', ')}.`,
      ),
    element: z
      .string()
      .min(1)
      .max(3)
      .optional()
      .describe('Element symbol shortcut (e.g. "N", "Cl") — equivalent to SMARTS "[N]".'),
    maxMatches: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .default(200)
      .describe('Upper bound on unique matches returned (default 200).'),
    select: z
      .enum(['none', 'first', 'all'])
      .default('none')
      .describe(
        'Set the canvas selection to the matched atoms/bonds: "first" selects the first match, "all" selects the union of all matches.',
      ),
  })
  .refine(v => [v.smarts, v.group, v.element].filter(Boolean).length === 1, {
    error: 'Provide exactly one of smarts, group, or element.',
  });

export type FindSubstructureInput = z.infer<typeof findSubstructureInputSchema>;

export interface FindSubstructureOutput {
  /** The pattern actually matched (resolved from group/element when given). */
  smarts: string;
  label?: string;
  count: number;
  /** Deterministic, unique-atom-set matches in query-atom order. */
  matches: SubstructureMatch[];
  /** Union of matched atom ids (handy for `atomIds` params on other tools). */
  atomIds: string[];
  bondIds: string[];
  /** Truncated at maxMatches. */
  truncated: boolean;
  /** What was selected (when `select` != "none"). */
  selected?: { atomIds: string[]; bondIds: string[] };
  /** Available named groups (only when a bad `group` is passed). */
  availableGroups?: string[];
}

export const findSubstructureTool: RegisteredAiTool = {
  id: 'molecule.find_substructure',
  category: 'read',
  description:
    'Locate atoms/bonds by chemistry rather than coordinates: SMARTS-lite pattern, named functional group (carbonyl, ester, amide, phenyl, ...) or element symbol. Returns atom/bond ids per match; select="first"|"all" also sets the canvas selection so a following edit.* / command.* call can target it. Read-only unless select is used.',
  inputSchema: findSubstructureInputSchema,
  tags: ['read', 'search', 'selection'],
  handler: (rawInput, ctx) => {
    const input = rawInput as FindSubstructureInput;
    let smarts: string;
    let label: string | undefined;
    if (input.group) {
      const entry = NAMED_SUBSTRUCTURES[input.group];
      if (!entry) {
        return toolFail('VALIDATION', `Unknown group "${input.group}".`, {
          availableGroups: NAMED_SUBSTRUCTURE_IDS,
        });
      }
      smarts = entry.smarts;
      label = entry.label;
    } else if (input.element) {
      const el = input.element.trim();
      smarts = `[${el.length > 1 ? el[0].toUpperCase() + el.slice(1).toLowerCase() : el.toUpperCase()}]`;
      label = `Element ${el}`;
    } else {
      smarts = input.smarts!.trim();
    }

    const mol = ctx.getMolecule();
    let matches: SubstructureMatch[];
    try {
      matches = findSubstructure(mol, smarts, { maxMatches: input.maxMatches + 1, uniqueAtomSets: true });
    } catch (err) {
      if (err instanceof SmartsSyntaxError) {
        return toolFail('VALIDATION', `Invalid SMARTS: ${err.message}`, {
          smarts,
          position: err.position,
        });
      }
      return toolFail('EXECUTION', err instanceof Error ? err.message : String(err));
    }
    const truncated = matches.length > input.maxMatches;
    if (truncated) matches = matches.slice(0, input.maxMatches);

    const atomIds = [...new Set(matches.flatMap(m => m.atomIds))];
    const bondIds = [...new Set(matches.flatMap(m => m.bondIds))];

    const out: FindSubstructureOutput = {
      smarts,
      ...(label ? { label } : {}),
      count: matches.length,
      matches,
      atomIds,
      bondIds,
      truncated,
    };

    if (input.select !== 'none' && matches.length > 0) {
      const pick =
        input.select === 'first'
          ? { atomIds: matches[0].atomIds, bondIds: matches[0].bondIds }
          : { atomIds, bondIds };
      if (!ctx.setSelection) {
        return toolFail('NO_DISPATCHER', 'select requires a context with setSelection.');
      }
      ctx.setSelection(pick);
      out.selected = pick;
    }
    return toolOk(out);
  },
};
