/**
 * Place resonance contributors in a row with solid ↔ arrows between them,
 * plus optional electron-flow arrows anchored to form-local atom/bond indices.
 *
 * Chemistry (which SMILES, which curly arrows) is entirely LLM-authored —
 * this recipe only layouts forms, draws ↔, and resolves mechanism anchors.
 */
import { z } from 'zod';
import type { ArrowAnchor, Molecule } from '@moldraw/domain';
import {
  buildElectronFlowArrow,
  documentFragmentBoxes,
  getLonePairPlacements,
} from '@moldraw/core';
import type { RegisteredAiTool } from '../types';
import { toolFail, toolOk } from '../types';
import { looksLikeSmilesNotName } from '../../utils/smilesQuery';

const formLocalAnchor = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('atom').describe("Anchor kind: 'atom' = arrow end sits just outside an atom."),
    atomIndex: z
      .number()
      .int()
      .nonnegative()
      .describe('0-based atom index within this form (import order, usually SMILES atom order; see formMaps in result).'),
    offsetDeg: z
      .number()
      .describe('Direction from the atom to the arrow end in degrees (0 = +x right, 90 = +y down). Auto if omitted.')
      .optional(),
    offsetPx: z
      .number()
      .describe('Distance from the atom center to the arrow end in canvas px. Default ~10-16 px depending on label.')
      .optional(),
  }),
  z.object({
    type: z.literal('bond').describe("Anchor kind: 'bond' = arrow end sits on a bond (pi source/sink)."),
    bondIndex: z
      .number()
      .int()
      .nonnegative()
      .describe('0-based bond index within this form (bond order in the imported structure; see formMaps).'),
    t: z
      .number()
      .min(0)
      .max(1)
      .describe('Position along the bond 0-1 (0 = first atom, 1 = second atom). Default 0.5 (midpoint).')
      .optional(),
  }),
  z.object({
    type: z.literal('lone_pair').describe("Anchor kind: 'lone_pair' = arrow starts/ends at a lone pair on an atom."),
    atomIndex: z
      .number()
      .int()
      .nonnegative()
      .describe('0-based atom index within this form that carries the lone pair.'),
    slot: z
      .number()
      .int()
      .nonnegative()
      .describe('Which lone-pair slot on that atom (0-based). Default: the slot furthest from the form centroid.')
      .optional(),
  }),
]);

export const placeResonanceFormsInputSchema = z.object({
  forms: z
    .array(
      z.object({
        smiles: z
          .string()
          .min(1)
          .describe('SMILES of this resonance contributor with explicit charges (e.g. [O-]C=[N+]); must differ per form.'),
        label: z
          .string()
          .describe('Caption drawn under this form (e.g. "I", "major").')
          .optional(),
      }),
    )
    .min(2)
    .max(12)
    .describe('Resonance contributors in display order left-to-right (2-12).'),
  /** Row (default) or grid of contributors. */
  layout: z
    .enum(['row', 'grid'])
    .describe("'row' (default) places forms in one line with <-> arrows; 'grid' uses the viewport grid.")
    .optional(),
  /** Insert solid ↔ between adjacent forms (default true). */
  withResonanceArrows: z
    .boolean()
    .describe('true (default) draws a solid double-headed resonance arrow between adjacent forms.')
    .optional(),
  /**
   * Electron-flow (curly) arrows. Anchors are 0-based within that form after import
   * (atomIndex / bondIndex among that form’s atoms/bonds). Prefer lone_pair for O⁻,
   * bond for π sources/sinks, headStyle "pair" for 2e moves.
   */
  mechanismArrows: z
    .array(
      z.object({
        formIndex: z
          .number()
          .int()
          .nonnegative()
          .describe('0-based index into forms[] of the contributor this curly arrow is drawn on.'),
        from: formLocalAnchor.describe(
          'Electron source anchor: {type:"lone_pair",atomIndex} | {type:"bond",bondIndex} | {type:"atom",atomIndex}.',
        ),
        to: formLocalAnchor.describe(
          'Electron destination anchor: {type:"atom",atomIndex} | {type:"bond",bondIndex} | {type:"lone_pair",atomIndex}.',
        ),
        headStyle: z
          .enum(['single', 'pair'])
          .describe("'pair' (default) = full head for 2-electron moves; 'single' = fish-hook for 1-electron moves.")
          .optional(),
        curveAmount: z
          .number()
          .describe('Arc bend as a signed fraction of chord length (default 0.34); sign picks the side if bulgeSide omitted.')
          .optional(),
        /** Force arc bulge side (+1 / −1); omit for auto away-from-centroid. */
        bulgeSide: z
          .union([z.literal(1), z.literal(-1)])
          .describe('Force the arc to bulge to one side of the chord: 1 or -1. Omit to bulge away from the form centroid.')
          .optional(),
      }),
    )
    .max(24)
    .describe('Curly electron-pushing arrows (max 24) anchored to form-local atom/bond indices.')
    .optional(),
  /** Clear canvas first (default false). */
  clear: z
    .boolean()
    .describe('true clears the whole canvas before placing. Default false (place beside existing content).')
    .optional(),
});

type FormLocalAnchor = z.infer<typeof formLocalAnchor>;
type MechanismArrowSpec = NonNullable<
  z.infer<typeof placeResonanceFormsInputSchema>['mechanismArrows']
>[number];

const newId = () => Math.random().toString(36).slice(2, 11);

/** Gap reserved between form boxes for a readable ↔. */
const RESONANCE_GAP = 96;
const LABEL_BELOW = 26;

const boxForAtomIds = (mol: Molecule, atomIds: string[]) => {
  const set = new Set(atomIds);
  const atoms = mol.atoms.filter(a => set.has(a.id));
  if (atoms.length === 0) return null;
  const xs = atoms.map(a => a.x);
  const ys = atoms.map(a => a.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    cx: (Math.min(...xs) + Math.max(...xs)) / 2,
    cy: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
};

const mapFormAnchor = (
  mol: Molecule,
  atomIds: string[],
  local: FormLocalAnchor,
): ArrowAnchor | null => {
  const atoms = atomIds
    .map(id => mol.atoms.find(a => a.id === id))
    .filter((a): a is NonNullable<typeof a> => !!a);
  const idSet = new Set(atomIds);
  const bonds = mol.bonds.filter(
    b => idSet.has(b.fromAtomId) && idSet.has(b.toAtomId),
  );

  if (local.type === 'atom' || local.type === 'lone_pair') {
    const atom = atoms[local.atomIndex];
    if (!atom) return null;
    if (local.type === 'lone_pair') {
      let slot = local.slot;
      if (slot == null) {
        // Prefer the LP placement furthest from the form centroid (outer pair).
        const cx = atoms.reduce((s, a) => s + a.x, 0) / Math.max(atoms.length, 1);
        const cy = atoms.reduce((s, a) => s + a.y, 0) / Math.max(atoms.length, 1);
        const count = Math.max(atom.lonePairs ?? 1, 1);
        const placements = getLonePairPlacements(atom, mol, count, {
          preferSide: atom.lonePairSide ?? 'above',
        });
        let best = 0;
        let bestDist = -Infinity;
        placements.forEach((p, i) => {
          const px = atom.x + p.dir.x * p.dist;
          const py = atom.y + p.dir.y * p.dist;
          const d = (px - cx) ** 2 + (py - cy) ** 2;
          if (d > bestDist) {
            bestDist = d;
            best = i;
          }
        });
        slot = best;
      }
      return { type: 'lone_pair', atomId: atom.id, slot };
    }
    return {
      type: 'atom',
      atomId: atom.id,
      offsetDeg: local.offsetDeg,
      offsetPx: local.offsetPx,
    };
  }

  const bond = bonds[local.bondIndex];
  if (!bond) return null;
  return { type: 'bond', bondId: bond.id, t: local.t };
};

const mechanismArrowFromSpec = (
  mol: Molecule,
  formAtomIds: string[],
  ma: MechanismArrowSpec,
) => {
  const fromA = mapFormAnchor(mol, formAtomIds, ma.from);
  const toA = mapFormAnchor(mol, formAtomIds, ma.to);
  if (!fromA || !toA) return null;
  return buildElectronFlowArrow(mol, {
    id: `ef-${newId()}`,
    fromAnchor: fromA,
    toAnchor: toA,
    panelAtomIds: formAtomIds,
    headStyle: ma.headStyle ?? 'pair',
    curveAmount: ma.curveAmount ?? 0.34,
    bulgeSide: ma.bulgeSide,
  });
};

/**
 * After import, return atom/bond index maps so the model can be told (in tool
 * result) how indices line up — helps follow-up curly-arrow fixes.
 */
const formIndexMaps = (mol: Molecule, atomIds: string[]) => {
  const idSet = new Set(atomIds);
  const atoms = atomIds
    .map((id, atomIndex) => {
      const a = mol.atoms.find(x => x.id === id);
      if (!a) return null;
      return {
        atomIndex,
        element: a.element,
        charge: a.charge ?? 0,
        id: a.id,
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  const bonds = mol.bonds
    .filter(b => idSet.has(b.fromAtomId) && idSet.has(b.toAtomId))
    .map((b, bondIndex) => {
      const from = atoms.find(a => a.id === b.fromAtomId);
      const to = atoms.find(a => a.id === b.toAtomId);
      return {
        bondIndex,
        order: b.order ?? 1,
        fromAtomIndex: from?.atomIndex ?? -1,
        toAtomIndex: to?.atomIndex ?? -1,
        fromElement: from?.element,
        toElement: to?.element,
      };
    });
  return { atoms, bonds };
};

export const placeResonanceFormsTool: RegisteredAiTool = {
  id: 'molecule.place_resonance_forms',
  category: 'recipe',
  description:
    'Draw resonance contributors with solid ↔ between them. ALWAYS use for “resonance structures / contributors / mesomers”. Pass forms[{smiles,label?}] (≥2) with chemically DISTINCT SMILES for each contributor (you reason the structures — no preset list). withResonanceArrows defaults true (user need not ask for ↔). Also pass mechanismArrows on the left form for electron-push diagrams: formIndex + from/to anchors (atom|bond|lone_pair, 0-based within that form); prefer lone_pair tails; headStyle "pair" for 2e, "single" for fish-hook; optional signed curveAmount + bulgeSide (+1/−1). clear defaults false.',
  inputSchema: placeResonanceFormsInputSchema,
  handler: async (input, ctx) => {
    const parsed = placeResonanceFormsInputSchema.safeParse(input);
    if (!parsed.success) {
      return toolFail('VALIDATION', 'Invalid place_resonance_forms input', parsed.error.flatten());
    }
    if (!ctx.importSmiles && !ctx.applyCommand) {
      return toolFail(
        'NO_DISPATCHER',
        'molecule.place_resonance_forms requires ctx.importSmiles or ctx.applyCommand.',
      );
    }

    const {
      forms,
      layout = 'row',
      withResonanceArrows = true,
      mechanismArrows = [],
      clear = false,
    } = parsed.data;

    if (clear) {
      if (!ctx.applyCommand) {
        return toolFail('NO_DISPATCHER', 'clear requires applyCommand');
      }
      const cleared = ctx.applyCommand('molecule.clearAll', {});
      if (!cleared.ok) {
        return toolFail('EXECUTION', cleared.error?.message ?? 'clearAll failed');
      }
    }

    const placed: Array<{
      smiles: string;
      label?: string;
      newAtomIds: string[];
      ok: boolean;
      error?: string;
    }> = [];
    let isFirst = true;
    const placeBeside = !clear && ctx.getMolecule().atoms.length > 0;
    for (const m of forms) {
      const smiles = m.smiles.trim();
      const label = m.label?.trim();
      if (!smiles) {
        placed.push({ smiles, label, newAtomIds: [], ok: false, error: 'empty smiles' });
        continue;
      }

      if (ctx.importSmiles) {
        // No compoundName — single caption below avoids double/ghost labels.
        const r = await ctx.importSmiles(smiles, {
          mode: 'merge',
          placement: 'viewport_center',
          useViewportGrid: true,
          focus: false,
          startFreshGrid: isFirst,
          placeBesideExisting: isFirst && placeBeside,
        });
        isFirst = false;
        if (!r.ok) {
          placed.push({
            smiles,
            label,
            newAtomIds: [],
            ok: false,
            error: r.error ?? 'Import failed',
          });
          continue;
        }
        placed.push({ smiles, label, newAtomIds: r.newAtomIds ?? [], ok: true });
      } else {
        const r = ctx.applyCommand!('molecule.importSmiles', {
          smiles,
          mode: 'merge',
          placement: 'viewport_center',
        });
        if (!r.ok) {
          placed.push({
            smiles,
            label,
            newAtomIds: [],
            ok: false,
            error: r.error?.message ?? 'Import failed',
          });
          continue;
        }
        const ids = (r.extra as { newAtomIds?: string[] } | undefined)?.newAtomIds ?? [];
        placed.push({ smiles, label, newAtomIds: ids, ok: true });
      }
    }

    const okForms = placed.filter(p => p.ok && p.newAtomIds.length > 0);
    if (okForms.length < 2) {
      return toolFail(
        'EXECUTION',
        placed.map(p => p.error).filter(Boolean).join('; ') || 'Need ≥2 forms imported',
      );
    }

    // Reflow left→right with a guaranteed gap so ↔ always fits.
    if (ctx.applyCommand && layout !== 'grid') {
      let live = ctx.getMolecule();
      const ordered = [...okForms]
        .map(p => {
          const box = boxForAtomIds(live, p.newAtomIds);
          return box ? { ...p, box } : null;
        })
        .filter((x): x is NonNullable<typeof x> => !!x)
        .sort((a, b) => a.box.cx - b.box.cx || a.box.cy - b.box.cy);

      if (ordered.length >= 2) {
        const baseY = ordered.reduce((s, f) => s + f.box.cy, 0) / ordered.length;
        let cursorX = ordered[0]!.box.minX;
        for (let i = 0; i < ordered.length; i++) {
          const f = ordered[i]!;
          const box = boxForAtomIds(live, f.newAtomIds);
          if (!box) continue;
          const targetMinX = i === 0 ? box.minX : cursorX;
          const dx = targetMinX - box.minX;
          const dy = baseY - box.cy;
          if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
            ctx.applyCommand('molecule.moveAtoms', {
              atomIds: f.newAtomIds,
              dx,
              dy,
            });
            live = ctx.getMolecule();
          }
          const after = boxForAtomIds(live, f.newAtomIds);
          if (after) cursorX = after.maxX + RESONANCE_GAP;
        }
        okForms.sort((a, b) => {
          const ba = boxForAtomIds(live, a.newAtomIds);
          const bb = boxForAtomIds(live, b.newAtomIds);
          return (ba?.cx ?? 0) - (bb?.cx ?? 0);
        });
      }
    }

    let mol = ctx.getMolecule();
    const formBoxes = okForms
      .map(p => {
        const box = boxForAtomIds(mol, p.newAtomIds);
        return box ? { ...p, box } : null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x);

    const resonanceArrowIds: string[] = [];
    if (withResonanceArrows && ctx.applyCommand && formBoxes.length >= 2) {
      for (let i = 0; i < formBoxes.length - 1; i++) {
        const a = formBoxes[i]!.box;
        const b = formBoxes[i + 1]!.box;
        const gap = b.minX - a.maxX;
        if (gap < 20) continue;
        const y = (a.cy + b.cy) / 2;
        const pad = Math.min(22, Math.max(14, gap * 0.22));
        const x1 = a.maxX + pad;
        const x2 = b.minX - pad;
        if (x2 - x1 < 16) continue;
        const id = `res-${newId()}`;
        const r = ctx.applyCommand('molecule.addReactionArrow', {
          arrow: {
            id,
            x1,
            y1: y,
            x2,
            y2: y,
            kind: 'resonance',
          },
        });
        if (r.ok) resonanceArrowIds.push(id);
      }
    }

    if (ctx.applyCommand) {
      for (const f of formBoxes) {
        const caption = f.label?.trim();
        if (!caption || looksLikeSmilesNotName(caption)) continue;
        ctx.applyCommand('molecule.addCanvasText', {
          text: {
            id: `lbl-${newId()}`,
            x: f.box.cx,
            y: f.box.maxY + LABEL_BELOW,
            text: caption,
            fontSize: 12,
            color: '#334155',
          },
        });
      }
    }

    const mechanismArrowIds: string[] = [];
    if (ctx.applyCommand && mechanismArrows.length > 0) {
      let live = ctx.getMolecule();
      for (const ma of mechanismArrows) {
        const form = okForms[ma.formIndex];
        if (!form) continue;
        const draft = mechanismArrowFromSpec(live, form.newAtomIds, ma);
        if (!draft) continue;
        const r = ctx.applyCommand('molecule.addReactionArrow', { arrow: draft });
        if (r.ok) {
          mechanismArrowIds.push(draft.id);
          live = ctx.getMolecule();
        }
      }
    }

    mol = ctx.getMolecule();
    const formMaps = okForms.map((f, formIndex) => ({
      formIndex,
      smiles: f.smiles,
      label: f.label,
      ...formIndexMaps(mol, f.newAtomIds),
    }));

    const allNewIds = okForms.flatMap(f => f.newAtomIds);
    if (allNewIds.length > 0 && ctx.focusAtoms) {
      ctx.focusAtoms(allNewIds);
    }

    const fragmentCount = documentFragmentBoxes(ctx.getMolecule()).length;
    return toolOk({
      placed,
      layout,
      resonanceArrowIds,
      mechanismArrowIds,
      fragmentCount,
      formCount: okForms.length,
      /** Index maps for follow-up curly-arrow corrections via updateReactionArrow. */
      formMaps,
      hint:
        mechanismArrowIds.length === 0
          ? 'No mechanismArrows drawn. To add curly arrows, call again with mechanismArrows using formMaps atomIndex/bondIndex, or updateReactionArrow.'
          : undefined,
    });
  },
};
