/**
 * Façade tools — flat, consistent inputs for the 90 % case so an agent can
 * draw without learning command-specific shapes. Every façade dispatches
 * ordinary registry commands through `ctx.applyCommand`, so undo, validation
 * and the live canvas see exactly the same effects.
 *
 * Positions are canvas world px (y down); the default bond length is 40 px.
 */
import { z } from 'zod';
import {
  CMD,
  elementSymbol,
  nextFreePoint,
  openDirection,
  ringPlacementForAttach,
  ringPlacementForFusion,
  zigzagChainPoints,
  type NewIdsExtra,
} from '@moldraw/core';
import type { AiExecutionContext, AiToolResult } from '../../types';
import type { RegisteredAiTool } from '../types';
import { dispatchCommand, toolFail, toolOk } from '../types';

const newId = () => Math.random().toString(36).slice(2, 11);
const bondLen = (ctx: AiExecutionContext) => ctx.bondLengthPx ?? 40;

const atomIdField = z.string().describe('Existing atom id (see molecule.get_structure).');
const bondIdField = z.string().describe('Existing bond id (see molecule.get_structure).');
const worldX = z.number().describe('World x in canvas px.');
const worldY = z.number().describe('World y in canvas px (y grows downward).');

const extraOf = (r: AiToolResult): NewIdsExtra | undefined =>
  r.ok ? ((r.data as { extra?: NewIdsExtra } | undefined)?.extra ?? undefined) : undefined;

interface CommandStep {
  id: string;
  input: unknown;
}

/**
 * Apply steps as ONE undoable change. A single step dispatches directly;
 * several steps go through `molecule.transaction`, so a failure in step 2
 * leaves the document untouched and Ctrl+Z reverts the whole façade action.
 */
function runAtomic(ctx: AiExecutionContext, steps: CommandStep[]): AiToolResult {
  if (steps.length === 1) return dispatchCommand(ctx, steps[0].id, steps[0].input);
  return dispatchCommand(ctx, CMD.Transaction, { steps });
}

// ─── draw.atom ─────────────────────────────────────────────────────────────

const drawAtomInput = z
  .object({
    element: elementSymbol,
    attachToAtomId: atomIdField
      .optional()
      .describe('Bond the new atom to this existing atom (placed one bond length away, in the open direction).'),
    bondOrder: z
      .number()
      .int()
      .min(1)
      .max(3)
      .default(1)
      .describe('Order of the connecting bond when attachToAtomId is given (default 1).'),
    x: worldX.optional().describe('Explicit x. Ignored when attachToAtomId is set. Defaults to a free spot right of existing content.'),
    y: worldY.optional().describe('Explicit y. Ignored when attachToAtomId is set.'),
    charge: z.number().int().default(0).describe('Formal charge (default 0).'),
    alias: z.string().optional().describe('Abbreviation label to show instead of the element (e.g. "OMe", "Ph").'),
  })
  .describe('Add one atom, optionally bonded to an existing atom.');

export const drawAtomTool: RegisteredAiTool = {
  id: 'draw.atom',
  title: 'Draw atom',
  category: 'facade',
  visibility: 'core',
  tags: ['atoms', 'draw'],
  description:
    'Add an atom. Give attachToAtomId to grow a substituent off an existing atom (position and bond are handled for you), or x/y for a free atom. Returns newAtomIds / newBondIds.',
  inputSchema: drawAtomInput,
  handler: (raw, ctx) => {
    const input = raw as z.infer<typeof drawAtomInput>;
    const mol = ctx.getMolecule();
    let pos: { x: number; y: number };
    if (input.attachToAtomId) {
      const root = mol.atoms.find(a => a.id === input.attachToAtomId);
      if (!root) return toolFail('NOT_FOUND', `Unknown atom id "${input.attachToAtomId}".`);
      const ang = openDirection(mol, root.id);
      pos = { x: root.x + Math.cos(ang) * bondLen(ctx), y: root.y + Math.sin(ang) * bondLen(ctx) };
    } else if (input.x !== undefined && input.y !== undefined) {
      pos = { x: input.x, y: input.y };
    } else {
      pos = nextFreePoint(mol, bondLen(ctx));
    }
    const atomId = newId();
    const steps: CommandStep[] = [
      {
        id: CMD.AddAtom,
        input: {
          atom: { id: atomId, element: input.element, x: pos.x, y: pos.y, charge: input.charge, alias: input.alias },
        },
      },
    ];
    const bondId = newId();
    if (input.attachToAtomId) {
      steps.push({
        id: CMD.AddBond,
        input: { bond: { id: bondId, fromAtomId: input.attachToAtomId, toAtomId: atomId, order: input.bondOrder } },
      });
    }
    const r = runAtomic(ctx, steps);
    if (!r.ok) return r;
    return toolOk({
      newAtomIds: [atomId],
      newBondIds: input.attachToAtomId ? [bondId] : [],
      position: pos,
    });
  },
};

// ─── draw.bond ─────────────────────────────────────────────────────────────

const drawBondInput = z
  .object({
    fromAtomId: atomIdField,
    toAtomId: atomIdField,
    order: z.number().int().min(1).max(3).default(1).describe('1 single, 2 double, 3 triple (default 1).'),
    stereo: z
      .enum(['wedge', 'dash', 'wavy'])
      .optional()
      .describe('Stereo mark drawn with the narrow end at fromAtomId: wedge = toward viewer, dash = away, wavy = unknown.'),
  })
  .describe('Bond two existing atoms.');

export const drawBondTool: RegisteredAiTool = {
  id: 'draw.bond',
  title: 'Draw bond',
  category: 'facade',
  visibility: 'core',
  tags: ['bonds', 'draw'],
  description:
    'Connect two existing atoms with a bond (fails with a reason if they are already bonded or valency would be exceeded). Returns newBondIds.',
  inputSchema: drawBondInput,
  handler: (raw, ctx) => {
    const input = raw as z.infer<typeof drawBondInput>;
    const id = newId();
    const r = dispatchCommand(ctx, CMD.AddBond, {
      bond: { id, fromAtomId: input.fromAtomId, toAtomId: input.toAtomId, order: input.order, stereo: input.stereo },
    });
    if (!r.ok) return r;
    return toolOk({ newAtomIds: [], newBondIds: extraOf(r)?.newBondIds ?? [id] });
  },
};

// ─── draw.ring ─────────────────────────────────────────────────────────────

const drawRingInput = z
  .object({
    size: z.number().int().min(3).max(12).default(6).describe('Ring size 3–12 (default 6).'),
    aromatic: z.boolean().default(false).describe('Draw as benzene-style aromatic ring (alternating double bonds). Default false.'),
    attachToAtomId: atomIdField.optional().describe('Attach the ring to this atom through a single bond (substituent ring).'),
    fuseToBondId: bondIdField.optional().describe('Fuse the ring onto this existing bond (shares both bond atoms, e.g. naphthalene).'),
    x: worldX.optional().describe('Ring centre x for a free ring (ignored with attachToAtomId / fuseToBondId).'),
    y: worldY.optional().describe('Ring centre y for a free ring.'),
  })
  .describe('Add a regular ring: free, attached to an atom, or fused onto a bond.');

export const drawRingTool: RegisteredAiTool = {
  id: 'draw.ring',
  title: 'Draw ring',
  category: 'facade',
  visibility: 'core',
  tags: ['rings', 'draw'],
  description:
    'Add a ring (cyclohexane, benzene with aromatic=true, cyclopentane…). Geometry is computed for you: free at x/y (or beside existing content), attached to an atom, or fused across a bond. Returns newAtomIds / newBondIds and reusedAtomIds for fusion.',
  inputSchema: drawRingInput,
  handler: (raw, ctx) => {
    const input = raw as z.infer<typeof drawRingInput>;
    const mol = ctx.getMolecule();
    const L = bondLen(ctx);
    if (input.fuseToBondId) {
      const p = ringPlacementForFusion(mol, input.fuseToBondId, input.size);
      if (!p) return toolFail('NOT_FOUND', `Unknown bond id "${input.fuseToBondId}".`);
      const r = dispatchCommand(ctx, CMD.AddRing, {
        center: p.center,
        numSides: input.size,
        isAromatic: input.aromatic,
        angleOffset: p.angleOffset,
        angleStep: p.angleStep,
        radius: p.radius,
        fusedBondId: input.fuseToBondId,
      });
      return r.ok ? toolOk({ ...extraOf(r), center: p.center }) : r;
    }
    if (input.attachToAtomId) {
      const p = ringPlacementForAttach(mol, input.attachToAtomId, input.size, L);
      if (!p) return toolFail('NOT_FOUND', `Unknown atom id "${input.attachToAtomId}".`);
      const r = dispatchCommand(ctx, CMD.AddRing, {
        center: p.center,
        numSides: input.size,
        isAromatic: input.aromatic,
        angleOffset: p.angleOffset,
        radius: p.radius,
        rootAtomId: input.attachToAtomId,
        attachedViaBond: true,
      });
      return r.ok ? toolOk({ ...extraOf(r), center: p.center }) : r;
    }
    const radius = L / (2 * Math.sin(Math.PI / input.size));
    const center =
      input.x !== undefined && input.y !== undefined
        ? { x: input.x, y: input.y }
        : nextFreePoint(mol, L, radius);
    const r = dispatchCommand(ctx, CMD.AddRing, {
      center,
      numSides: input.size,
      isAromatic: input.aromatic,
      angleOffset: -Math.PI / 2,
      radius,
    });
    return r.ok ? toolOk({ ...extraOf(r), center }) : r;
  },
};

// ─── draw.chain ────────────────────────────────────────────────────────────

const drawChainInput = z
  .object({
    length: z.number().int().min(1).max(60).describe('Number of new carbon atoms to add.'),
    fromAtomId: atomIdField.optional().describe('Grow the chain from this atom (default: free chain beside existing content).'),
    x: worldX.optional().describe('Start x for a free chain.'),
    y: worldY.optional().describe('Start y for a free chain.'),
    direction: z
      .enum(['right', 'left', 'up', 'down'])
      .optional()
      .describe('Overall direction (default: right, or the open direction when growing from an atom).'),
    element: elementSymbol.default('C').describe('Element for the chain atoms (default C).'),
  })
  .describe('Add a zig-zag alkyl chain.');

const DIR_ANGLE: Record<'right' | 'left' | 'up' | 'down', number> = {
  right: 0,
  left: Math.PI,
  up: -Math.PI / 2,
  down: Math.PI / 2,
};

export const drawChainTool: RegisteredAiTool = {
  id: 'draw.chain',
  title: 'Draw chain',
  category: 'facade',
  visibility: 'core',
  tags: ['chains', 'draw'],
  description:
    'Add a zig-zag alkyl chain of N atoms, free or growing from an existing atom. Returns newAtomIds in chain order.',
  inputSchema: drawChainInput,
  handler: (raw, ctx) => {
    const input = raw as z.infer<typeof drawChainInput>;
    const mol = ctx.getMolecule();
    const L = bondLen(ctx);
    let start: { x: number; y: number };
    let angle: number;
    if (input.fromAtomId) {
      const root = mol.atoms.find(a => a.id === input.fromAtomId);
      if (!root) return toolFail('NOT_FOUND', `Unknown atom id "${input.fromAtomId}".`);
      start = root;
      angle = input.direction ? DIR_ANGLE[input.direction] : openDirection(mol, root.id, 0);
    } else {
      start = input.x !== undefined && input.y !== undefined ? { x: input.x, y: input.y } : nextFreePoint(mol, L);
      angle = DIR_ANGLE[input.direction ?? 'right'];
    }
    // `length` = number of NEW atoms. Growing from an atom, every generated
    // vertex after the root is new; for a free chain the start vertex is new too.
    if (!input.fromAtomId && input.length === 1) {
      const r1 = dispatchCommand(ctx, CMD.AddAtom, {
        atom: { id: newId(), element: input.element, x: start.x, y: start.y, charge: 0 },
      });
      return r1.ok ? toolOk({ ...extraOf(r1) }) : r1;
    }
    const points = zigzagChainPoints(start, input.fromAtomId ? input.length : input.length - 1, L, angle);
    const r = dispatchCommand(ctx, CMD.AddChain, {
      points,
      placementElement: input.element,
      startAtomId: input.fromAtomId,
    });
    return r.ok ? toolOk({ ...extraOf(r) }) : r;
  },
};

// ─── draw.smiles ───────────────────────────────────────────────────────────

const drawSmilesInput = z
  .object({
    smiles: z.string().min(1).describe('SMILES string (strictly validated; syntax errors come back with character positions).'),
    mode: z
      .enum(['add', 'replace'])
      .default('add')
      .describe('"add" places the molecule beside existing content; "replace" clears atoms/bonds first.'),
  })
  .describe('Draw a molecule from SMILES.');

export const drawSmilesTool: RegisteredAiTool = {
  id: 'draw.smiles',
  title: 'Draw from SMILES',
  category: 'facade',
  visibility: 'core',
  tags: ['import', 'draw'],
  description:
    'Draw a whole molecule from SMILES with clean 2D layout (stereo @/@@ and cis/trans become wedges / geometry). Returns newAtomIds / newBondIds.',
  inputSchema: drawSmilesInput,
  handler: async (raw, ctx) => {
    const input = raw as z.infer<typeof drawSmilesInput>;
    const mode = input.mode === 'replace' ? 'replace' : 'merge';
    if (ctx.importSmiles) {
      const r = await ctx.importSmiles(input.smiles, { mode, resolveVia: 'local' });
      if (!r.ok) return toolFail('EXECUTION', r.error ?? 'Import failed');
      return toolOk({ newAtomIds: r.newAtomIds ?? [], newBondIds: r.newBondIds ?? [] });
    }
    const r = dispatchCommand(ctx, CMD.ImportSmiles, { smiles: input.smiles, mode });
    return r.ok ? toolOk({ ...extraOf(r) }) : r;
  },
};

// ─── draw.text / draw.arrow ────────────────────────────────────────────────

const drawTextInput = z
  .object({
    text: z.string().min(1).describe('Text to place (plain text; use molecule.add_caption-style labels for reagents).'),
    x: worldX,
    y: worldY,
    fontSize: z.number().positive().default(14).describe('Font size in px (default 14).'),
    color: z.string().default('#1f2937').describe('CSS colour (default near-black).'),
    bold: z.boolean().default(false).describe('Bold text.'),
  })
  .describe('Add a free text annotation.');

export const drawTextTool: RegisteredAiTool = {
  id: 'draw.text',
  title: 'Draw text',
  category: 'facade',
  visibility: 'core',
  tags: ['annotations', 'text', 'draw'],
  description: 'Add a text label / caption at world (x, y). Returns the new text id.',
  inputSchema: drawTextInput,
  handler: (raw, ctx) => {
    const input = raw as z.infer<typeof drawTextInput>;
    const id = newId();
    const r = dispatchCommand(ctx, CMD.AddCanvasText, {
      text: {
        id,
        x: input.x,
        y: input.y,
        text: input.text,
        fontSize: input.fontSize,
        color: input.color,
        fontWeight: input.bold ? 'bold' : 'normal',
      },
    });
    return r.ok ? toolOk({ textId: id }) : r;
  },
};

const drawArrowInput = z
  .object({
    x1: worldX.describe('Tail x.'),
    y1: worldY.describe('Tail y.'),
    x2: worldX.describe('Head x.'),
    y2: worldY.describe('Head y.'),
    kind: z
      .enum(['straight', 'equilibrium', 'retrosynthetic', 'resonance', 'curved', 'electron_flow'])
      .default('straight')
      .describe('Arrow style (default straight reaction arrow).'),
    reagentAbove: z.string().optional().describe('Text above the arrow (reagents).'),
    reagentBelow: z.string().optional().describe('Text below the arrow (conditions).'),
  })
  .describe('Add a reaction arrow.');

export const drawArrowTool: RegisteredAiTool = {
  id: 'draw.arrow',
  title: 'Draw reaction arrow',
  category: 'facade',
  visibility: 'core',
  tags: ['reactions', 'arrows', 'draw'],
  description:
    'Add a reaction / equilibrium / retrosynthetic arrow from (x1,y1) to (x2,y2) with optional reagent text above/below. Returns the new arrow id.',
  inputSchema: drawArrowInput,
  handler: (raw, ctx) => {
    const input = raw as z.infer<typeof drawArrowInput>;
    const id = newId();
    const r = dispatchCommand(ctx, CMD.AddReactionArrow, {
      arrow: {
        id,
        x1: input.x1,
        y1: input.y1,
        x2: input.x2,
        y2: input.y2,
        kind: input.kind,
        reagentAbove: input.reagentAbove,
        reagentBelow: input.reagentBelow,
      },
    });
    return r.ok ? toolOk({ arrowId: id }) : r;
  },
};

// ─── edit.atom / edit.bond / edit.delete ───────────────────────────────────

const editAtomInput = z
  .object({
    atomId: atomIdField,
    element: elementSymbol.optional().describe('New element symbol.'),
    charge: z.number().int().optional().describe('Absolute formal charge (0 clears).'),
    isotope: z.number().int().positive().nullable().optional().describe('Mass number; null clears.'),
    alias: z.string().nullable().optional().describe('Abbreviation label (e.g. "Boc"); null/"" clears.'),
    radical: z.boolean().optional().describe('Show a single unpaired electron.'),
    lonePairs: z.number().int().min(0).max(4).optional().describe('Explicit lone-pair dots to draw.'),
  })
  .describe('Patch one atom. Only the given fields change.');

export const editAtomTool: RegisteredAiTool = {
  id: 'edit.atom',
  title: 'Edit atom',
  category: 'facade',
  visibility: 'core',
  idempotent: true,
  tags: ['atoms', 'edit'],
  description:
    'Change an atom in one call: element, formal charge, isotope, alias label, radical, lone pairs. Only supplied fields are modified. Atomic: all-or-nothing.',
  inputSchema: editAtomInput,
  handler: (raw, ctx) => {
    const input = raw as z.infer<typeof editAtomInput>;
    const steps: CommandStep[] = [];
    if (input.element !== undefined) {
      steps.push({ id: CMD.UpdateAtomElement, input: { atomId: input.atomId, element: input.element } });
    }
    if (input.charge !== undefined) {
      steps.push({ id: CMD.SetAtomCharge, input: { atomId: input.atomId, charge: input.charge } });
    }
    if (input.isotope !== undefined) {
      steps.push({ id: CMD.SetAtomIsotope, input: { atomId: input.atomId, isotope: input.isotope ?? undefined } });
    }
    if (input.alias !== undefined) {
      steps.push({ id: CMD.SetAtomAlias, input: { atomId: input.atomId, alias: input.alias ?? '' } });
    }
    if (input.radical !== undefined) {
      steps.push({ id: CMD.SetAtomRadical, input: { atomId: input.atomId, radical: input.radical ? 1 : 0 } });
    }
    if (input.lonePairs !== undefined) {
      const cur = ctx.getMolecule().atoms.find(a => a.id === input.atomId)?.lonePairs ?? 0;
      steps.push({ id: CMD.UpdateAtomLonePairs, input: { atomId: input.atomId, delta: input.lonePairs - cur } });
    }
    if (!steps.length) return toolFail('VALIDATION', 'edit.atom: supply at least one field to change.');
    const r = runAtomic(ctx, steps);
    if (!r.ok) return r;
    const atom = ctx.getMolecule().atoms.find(a => a.id === input.atomId);
    return toolOk({ atom });
  },
};

const editBondInput = z
  .object({
    bondId: bondIdField,
    order: z.number().int().min(1).max(3).optional().describe('New bond order (valency-checked).'),
    stereo: z
      .enum(['wedge', 'dash', 'wavy', 'none'])
      .optional()
      .describe('Stereo mark (narrow end at the bond\'s fromAtomId); "none" clears.'),
    flipStereo: z.boolean().optional().describe('Swap the narrow/wide ends of the stereo mark.'),
  })
  .describe('Patch one bond.');

export const editBondTool: RegisteredAiTool = {
  id: 'edit.bond',
  title: 'Edit bond',
  category: 'facade',
  visibility: 'core',
  idempotent: true,
  tags: ['bonds', 'edit'],
  description: 'Change a bond\'s order and/or stereo mark (wedge/dash/wavy/none), optionally flipping which end is narrow.',
  inputSchema: editBondInput,
  handler: (raw, ctx) => {
    const input = raw as z.infer<typeof editBondInput>;
    const steps: CommandStep[] = [];
    if (input.order !== undefined || input.stereo !== undefined) {
      const patch: Record<string, unknown> = { bondId: input.bondId };
      if (input.order !== undefined) patch.order = input.order;
      if (input.stereo !== undefined) patch.stereo = input.stereo === 'none' ? null : input.stereo;
      steps.push({ id: CMD.UpdateBond, input: patch });
    }
    if (input.flipStereo) steps.push({ id: CMD.FlipBondEndpoints, input: { bondId: input.bondId } });
    if (!steps.length) return toolFail('VALIDATION', 'edit.bond: supply order, stereo or flipStereo.');
    const r = runAtomic(ctx, steps);
    if (!r.ok) return r;
    return toolOk({ bond: ctx.getMolecule().bonds.find(b => b.id === input.bondId) });
  },
};

const editDeleteInput = z
  .object({
    atomIds: z.array(atomIdField).default([]).describe('Atoms to delete (their bonds go too).'),
    bondIds: z.array(bondIdField).default([]).describe('Bonds to delete.'),
    textIds: z.array(z.string()).default([]).describe('Text annotation ids to delete.'),
    arrowIds: z.array(z.string()).default([]).describe('Reaction arrow ids to delete.'),
    all: z.boolean().default(false).describe('Clear the whole canvas (ignores the id lists).'),
  })
  .describe('Delete atoms, bonds, texts, arrows — or everything.');

export const editDeleteTool: RegisteredAiTool = {
  id: 'edit.delete',
  title: 'Delete',
  category: 'facade',
  visibility: 'core',
  destructive: true,
  tags: ['delete'],
  description:
    'Delete atoms / bonds / text / arrows by id, or the entire canvas with all=true. Unknown ids fail with NOT_FOUND. Atomic.',
  inputSchema: editDeleteInput,
  handler: (raw, ctx) => {
    const input = raw as z.infer<typeof editDeleteInput>;
    if (input.all) return dispatchCommand(ctx, CMD.ClearAll, {});
    const steps: CommandStep[] = [];
    if (input.atomIds.length || input.bondIds.length) {
      steps.push({ id: CMD.DeleteSelection, input: { atomIds: input.atomIds, bondIds: input.bondIds } });
    }
    for (const id of input.textIds) steps.push({ id: CMD.DeleteCanvasText, input: { id } });
    for (const id of input.arrowIds) steps.push({ id: CMD.DeleteReactionArrow, input: { id } });
    if (!steps.length) return toolFail('VALIDATION', 'edit.delete: nothing to delete (give ids or all=true).');
    const r = runAtomic(ctx, steps);
    if (!r.ok) return r;
    const mol = ctx.getMolecule();
    return toolOk({ atomCount: mol.atoms.length, bondCount: mol.bonds.length });
  },
};

export const FACADE_TOOLS: readonly RegisteredAiTool[] = [
  drawSmilesTool,
  drawAtomTool,
  drawBondTool,
  drawRingTool,
  drawChainTool,
  drawTextTool,
  drawArrowTool,
  editAtomTool,
  editBondTool,
  editDeleteTool,
];
