/**
 * Build a multi-step reaction scheme: molecules + arrows + labels (not arrows-only).
 * Imports place into spaced slots progressively (no stacking at origin) and reflow
 * as fragment sizes are measured so the pathway grows with accurate spacing in realtime.
 */
import {
  CMD,
  layoutReactionScheme,
  type ReactionSchemeLayout,
} from '@moldraw/core';
import { canvasLabelInk, canvasTitleInk } from '../../canvasAnnotationColors';
import { buildReactionSchemeInputSchema } from '../../schemas/tools';
import type { RegisteredAiTool } from '../types';
import { dispatchCommand, toolFail, toolOk } from '../types';

const newId = () => `t-${Math.random().toString(36).slice(2, 10)}`;

/** Canvas text sizes for reaction schemes inserted from the library / AI tool. */
const REACTION_TITLE_FONT_SIZE = 18;
const REACTION_LABEL_FONT_SIZE = 16;
const REACTION_REAGENT_FONT_SIZE = 22;

type Compound = { smiles: string; labelBelow?: string };
type ArrowSpec = {
  reagentAbove?: string;
  reagentBelow?: string;
  kind?: string;
};

/**
 * Reaction schemes must use SMILES (local Indigo layout), not PubChem names —
 * intermediates often aren't in PubChem and name lookup can return the wrong compound.
 */
function looksLikeSmilesNotName(query: string): boolean {
  const t = query.trim();
  if (!t || /\s/.test(t)) return false;
  if (/^\d{2,7}-\d{2}-\d$/.test(t)) return false;
  if (/[=#\[\]\(\)@\\\/+]/.test(t)) return true;
  if (/\d/.test(t)) return true;
  // Short atom/SMILES tokens (C, CO, ClC, Br) — allow; English names are longer.
  if (/^[A-Za-z][A-Za-z0-9+\-]*$/.test(t) && t.length <= 4) return true;
  return false;
}

function fragmentCentroid(
  mol: { atoms: Array<{ id: string; x: number; y: number }> },
  atomIds: string[],
): { cx: number; cy: number } | null {
  const set = new Set(atomIds);
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const a of mol.atoms) {
    if (!set.has(a.id)) continue;
    sx += a.x;
    sy += a.y;
    n += 1;
  }
  if (n === 0) return null;
  return { cx: sx / n, cy: sy / n };
}

function fragmentAabb(
  mol: { atoms: Array<{ id: string; x: number; y: number }> },
  atomIds: string[],
): { minX: number; maxX: number; minY: number; maxY: number; width: number; height: number } | null {
  const set = new Set(atomIds);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const a of mol.atoms) {
    if (!set.has(a.id)) continue;
    minX = Math.min(minX, a.x);
    maxX = Math.max(maxX, a.x);
    minY = Math.min(minY, a.y);
    maxY = Math.max(maxY, a.y);
  }
  if (!Number.isFinite(minX)) return null;
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: Math.max(40, maxX - minX),
    height: Math.max(40, maxY - minY),
  };
}

function schemeSpacing(
  layoutMode: 'row' | 'cycle' | 'branch',
  maxW: number,
  maxH: number,
): { pitch: number; rowGap: number; labelOffset: number; arrowLength: number } {
  const arrowGutter = 110;
  const labelBand = 44;
  const rowPad = 56;
  // Cycle pitch ≈ desired center-to-center chord; radius is derived from it.
  const pitch =
    layoutMode === 'cycle'
      ? Math.max(260, maxW + 120, maxH + 100)
      : layoutMode === 'branch'
        ? Math.max(320, maxW + arrowGutter + 60)
        : Math.max(300, maxW + arrowGutter + 88);
  const rowGap =
    layoutMode === 'branch'
      ? Math.max(220, maxH + labelBand + 36)
      : Math.max(340, maxH + labelBand + rowPad + 40);
  const labelOffset =
    layoutMode === 'cycle'
      ? Math.max(88, maxH / 2 + 52)
      : Math.max(96, maxH / 2 + 40);
  const arrowLength = Math.min(96, Math.max(64, pitch * 0.28));
  return { pitch, rowGap, labelOffset, arrowLength };
}

function documentContentBounds(mol: {
  atoms: Array<{ x: number; y: number }>;
  reactionArrows?: Array<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    pathPoints?: Array<{ x: number; y: number }>;
  }>;
  canvasTexts?: Array<{ x: number; y: number }>;
}): { minX: number; maxX: number; minY: number; maxY: number } | null {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const grow = (x: number, y: number) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  };
  for (const a of mol.atoms) grow(a.x, a.y);
  for (const ar of mol.reactionArrows ?? []) {
    grow(ar.x1, ar.y1);
    grow(ar.x2, ar.y2);
    for (const p of ar.pathPoints ?? []) grow(p.x, p.y);
  }
  for (const t of mol.canvasTexts ?? []) grow(t.x, t.y);
  if (!Number.isFinite(minX)) return null;
  return { minX, maxX, minY, maxY };
}

/** Place a new scheme to the right of existing content (no overlap). */
function schemeOriginAvoidingOverlap(
  existing: { minX: number; maxX: number; minY: number; maxY: number } | null,
  fallbackX: number,
  fallbackY: number,
  gap = 220,
): { originX: number; originY: number } {
  if (!existing) return { originX: fallbackX, originY: fallbackY };
  return {
    originX: existing.maxX + gap,
    originY: (existing.minY + existing.maxY) / 2,
  };
}

/** Yield so the UI can paint between progressive layout steps (DOM + Node safe). */
function yieldUi(): Promise<void> {
  return new Promise(resolve => {
    const g = globalThis as typeof globalThis & {
      requestAnimationFrame?: (cb: () => void) => number;
    };
    const finish = () => setTimeout(resolve, 28);
    if (typeof g.requestAnimationFrame === 'function') {
      g.requestAnimationFrame(() => g.requestAnimationFrame!(finish));
    } else {
      finish();
    }
  });
}

function moveFragmentsToLayout(
  ctx: Parameters<RegisteredAiTool['handler']>[1],
  fragmentAtomIds: string[][],
  layout: ReactionSchemeLayout,
): ReturnType<typeof toolFail> | null {
  for (let i = 0; i < fragmentAtomIds.length; i++) {
    const ids = fragmentAtomIds[i]!;
    const slot = layout.molecules[i];
    if (!slot) continue;
    const mol = ctx.getMolecule();
    const cen = fragmentCentroid(mol, ids);
    if (!cen) continue;
    const dx = slot.cx - cen.cx;
    const dy = slot.cy - cen.cy;
    if (Math.hypot(dx, dy) <= 0.5) continue;
    const moved = dispatchCommand(ctx, CMD.MoveAtoms, { atomIds: ids, dx, dy });
    if (!moved.ok) return moved;
  }
  return null;
}

function syncArrowsToLayout(
  ctx: Parameters<RegisteredAiTool['handler']>[1],
  arrowIds: string[],
  layout: ReactionSchemeLayout,
  arrowSpecs: ArrowSpec[],
): ReturnType<typeof toolFail> | null {
  for (let i = 0; i < arrowIds.length; i++) {
    const slot = layout.arrows[i];
    const id = arrowIds[i];
    if (!slot || !id) continue;
    const spec = arrowSpecs[i] ?? {};
    const kind = (spec.kind as string | undefined) ?? slot.kind ?? 'straight';
    const updated = dispatchCommand(ctx, CMD.UpdateReactionArrow, {
      id,
      x1: slot.x1,
      y1: slot.y1,
      x2: slot.x2,
      y2: slot.y2,
      kind,
      pathPoints: kind === 'path' || kind === 'row_wrap' ? slot.pathPoints : undefined,
      cx: kind === 'cycle_arc' ? slot.cx : undefined,
      cy: kind === 'cycle_arc' ? slot.cy : undefined,
    });
    if (!updated.ok) return updated;
  }
  return null;
}

export const buildReactionSchemeTool: RegisteredAiTool = {
  id: 'molecule.build_reaction_scheme',
  category: 'recipe',
  description:
    'Draw any multi-step reaction scheme from chemistry knowledge (no structure library, no PubChem). Each compounds[].smiles MUST be a real SMILES string (e.g. Oc1ccccc1), never a chemical name — structures are laid out locally via Indigo. labelBelow is the display name. Put reagents on arrows. clear defaults false (append beside existing content). Only set clear:true when the user asks to replace/clear/start fresh. layout:"branch"|"cycle"|"row". Use layout:"cycle" for Krebs/TCA and other closed pathways.',
  inputSchema: buildReactionSchemeInputSchema,
  handler: async (input, ctx) => {
    const parsed = buildReactionSchemeInputSchema.safeParse(input);
    if (!parsed.success) {
      return toolFail('VALIDATION', 'Invalid build_reaction_scheme input', parsed.error.flatten());
    }
    if (!ctx.applyCommand) {
      return toolFail('NO_DISPATCHER', 'build_reaction_scheme requires applyCommand');
    }

    const {
      clear = false,
      title,
      layout: layoutMode = 'row',
      maxPerRow = 4,
      compounds,
      arrows: arrowSpecs = [],
    } = parsed.data as {
      clear?: boolean;
      title?: string;
      layout?: 'row' | 'cycle' | 'branch';
      maxPerRow?: number;
      compounds: Compound[];
      arrows?: ArrowSpec[];
    };

    for (let i = 0; i < compounds.length; i++) {
      const s = compounds[i]?.smiles?.trim() ?? '';
      if (!looksLikeSmilesNotName(s)) {
        return toolFail(
          'VALIDATION',
          `compounds[${i}].smiles must be a SMILES string (got "${s}"). Do not pass chemical names — reaction schemes use local SMILES layout, not PubChem.`,
        );
      }
    }

    const existingBounds = clear ? null : documentContentBounds(ctx.getMolecule());

    if (clear) {
      const cleared = dispatchCommand(ctx, CMD.ClearAll, {});
      if (!cleared.ok) return cleared;
    }

    const vp = ctx.viewport;
    const fallbackX = vp ? -vp.x / Math.max(vp.zoom, 0.01) : 0;
    const fallbackY = vp ? -vp.y / Math.max(vp.zoom, 0.01) : 0;
    const placed = schemeOriginAvoidingOverlap(existingBounds, fallbackX, fallbackY);
    const originBaseX = placed.originX;
    const originY = placed.originY;

    let maxW = 120;
    let maxH = 90;
    let { pitch, rowGap, labelOffset, arrowLength } = schemeSpacing(layoutMode, maxW, maxH);

    const fragmentAtomIds: string[][] = [];
    const fragmentLabels: Array<string | undefined> = [];
    const importErrors: string[] = [];
    const arrowIds: string[] = [];
    const groupId = `scheme-${Date.now().toString(36)}`;
    let layout: ReactionSchemeLayout | null = null;

    const rebuildLayout = (count: number): ReactionSchemeLayout => {
      const originX =
        layoutMode === 'cycle' || layoutMode === 'branch'
          ? originBaseX
          : originBaseX - ((Math.min(count, maxPerRow) - 1) * pitch) / 2;
      // Even chord spacing on the ring from measured fragment size.
      const cycleRadius =
        layoutMode === 'cycle' && count >= 2
          ? Math.max(180, pitch / (2 * Math.sin(Math.PI / count)))
          : undefined;
      return layoutReactionScheme({
        moleculeCount: count,
        layout: layoutMode,
        maxPerRow,
        originX,
        originY,
        slotPitch: pitch,
        arrowLength,
        rowGap,
        labelOffset,
        cycleRadius,
      });
    };

    const workingArrows: ArrowSpec[] = arrowSpecs.map(a => ({ ...a }));
    const resolvedCompounds = compounds;

    for (let i = 0; i < resolvedCompounds.length; i++) {
      const c = resolvedCompounds[i]!;
      let newIds: string[] | undefined;

      if (ctx.importSmiles) {
        const r = await ctx.importSmiles(c.smiles, {
          mode: 'merge',
          placement: 'origin',
          useViewportGrid: false,
          compoundName: c.labelBelow,
          resolveVia: 'local',
        });
        if (!r.ok) {
          importErrors.push(`${c.smiles}: ${r.error ?? 'import failed'}`);
          continue;
        }
        newIds = r.newAtomIds;
      } else {
        const r = ctx.applyCommand(CMD.ImportSmiles, {
          smiles: c.smiles,
          mode: 'merge',
          placement: 'origin',
          bondLengthPx: ctx.bondLengthPx,
        });
        if (!r.ok) {
          importErrors.push(`${c.smiles}: ${r.error?.message ?? 'import failed'}`);
          continue;
        }
        newIds = (r.extra as { newAtomIds?: string[] } | undefined)?.newAtomIds;
      }

      if (!newIds?.length) {
        importErrors.push(`${c.smiles}: no atoms returned`);
        continue;
      }

      fragmentAtomIds.push(newIds);
      fragmentLabels.push(c.labelBelow);

      // Measure this fragment and grow spacing if needed.
      const bb = fragmentAabb(ctx.getMolecule(), newIds);
      if (bb) {
        maxW = Math.max(maxW, bb.width);
        maxH = Math.max(maxH, bb.height);
        ({ pitch, rowGap, labelOffset, arrowLength } = schemeSpacing(layoutMode, maxW, maxH));
      }

      // Reflow every placed structure into the current spaced pathway (visible growth).
      layout = rebuildLayout(fragmentAtomIds.length);
      const moved = moveFragmentsToLayout(ctx, fragmentAtomIds, layout);
      if (moved) return moved;

      // Add the connecting arrow as soon as we have a new step; reflow updates prior arrows.
      const step = fragmentAtomIds.length - 2;
      if (step >= 0 && layout.arrows[step] && !arrowIds[step]) {
        const slot = layout.arrows[step]!;
        const spec = workingArrows[step] ?? {};
        const arrowId = `ra-${Math.random().toString(36).slice(2, 10)}`;
        const kind = (spec.kind as string | undefined) ?? slot.kind ?? 'straight';
        const added = dispatchCommand(ctx, CMD.AddReactionArrow, {
          arrow: {
            id: arrowId,
            x1: slot.x1,
            y1: slot.y1,
            x2: slot.x2,
            y2: slot.y2,
            kind,
            pathPoints: kind === 'path' || kind === 'row_wrap' ? slot.pathPoints : undefined,
            cx: kind === 'cycle_arc' ? slot.cx : undefined,
            cy: kind === 'cycle_arc' ? slot.cy : undefined,
            reagentAbove: spec.reagentAbove,
            reagentBelow: spec.reagentBelow,
            reagentFontSize: REACTION_REAGENT_FONT_SIZE,
            multiStepGroupId: groupId,
            stepIndex: step,
          },
        });
        if (!added.ok) return added;
        arrowIds.push(arrowId);
      }

      if (arrowIds.length > 0) {
        const synced = syncArrowsToLayout(ctx, arrowIds, layout, workingArrows);
        if (synced) return synced;
      }

      ctx.focusAtoms?.(fragmentAtomIds.flat());
      await yieldUi();
    }

    if (fragmentAtomIds.length < 2 || !layout) {
      return toolFail(
        'EXECUTION',
        `Need at least 2 structures for a scheme. Imported ${fragmentAtomIds.length}. ${importErrors.join('; ')}`,
      );
    }

    // Final reflow with full spacing (in case last molecule grew the grid).
    layout = rebuildLayout(fragmentAtomIds.length);
    const finalMove = moveFragmentsToLayout(ctx, fragmentAtomIds, layout);
    if (finalMove) return finalMove;
    const finalSync = syncArrowsToLayout(ctx, arrowIds, layout, workingArrows);
    if (finalSync) return finalSync;

    // Close cycle pathways: layout may include a closing arrow beyond n-1 steps.
    while (arrowIds.length < layout.arrows.length) {
      const step = arrowIds.length;
      const slot = layout.arrows[step]!;
      const spec = workingArrows[step] ?? {};
      const arrowId = `ra-${Math.random().toString(36).slice(2, 10)}`;
      const kind = (spec.kind as string | undefined) ?? slot.kind ?? 'cycle_arc';
      const added = dispatchCommand(ctx, CMD.AddReactionArrow, {
        arrow: {
          id: arrowId,
          x1: slot.x1,
          y1: slot.y1,
          x2: slot.x2,
          y2: slot.y2,
          kind,
          pathPoints: kind === 'path' || kind === 'row_wrap' ? slot.pathPoints : undefined,
          cx: kind === 'cycle_arc' ? slot.cx : undefined,
          cy: kind === 'cycle_arc' ? slot.cy : undefined,
          reagentAbove: spec.reagentAbove,
          reagentBelow: spec.reagentBelow,
          reagentFontSize: REACTION_REAGENT_FONT_SIZE,
          multiStepGroupId: groupId,
          stepIndex: step,
        },
      });
      if (!added.ok) return added;
      arrowIds.push(arrowId);
    }

    if (title) {
      const titleText = dispatchCommand(ctx, CMD.AddCanvasText, {
        text: {
          id: newId(),
          x: (layout.bounds.minX + layout.bounds.maxX) / 2,
          y: layout.bounds.minY - 44,
          text: title,
          fontSize: REACTION_TITLE_FONT_SIZE,
          color: canvasTitleInk(),
          fontWeight: 'bold',
        },
      });
      if (!titleText.ok) return titleText;
    }

    const labelIds: string[] = [];
    for (let i = 0; i < fragmentAtomIds.length; i++) {
      const label = fragmentLabels[i]?.trim();
      if (!label) continue;
      const ids = fragmentAtomIds[i]!;
      const slot = layout.molecules[i]!;
      const mol = ctx.getMolecule();
      const bb = fragmentAabb(mol, ids);
      const labelY = bb ? bb.maxY + 34 : slot.labelY;
      const tid = newId();
      const textResult = dispatchCommand(ctx, CMD.AddCanvasText, {
        text: {
          id: tid,
          x: slot.labelX,
          y: labelY,
          text: label,
          fontSize: REACTION_LABEL_FONT_SIZE,
          color: canvasLabelInk(),
          fontWeight: 'normal',
          boxWidth: Math.max(88, label.length * 8.5),
          boxHeight: 36,
        },
      });
      if (!textResult.ok) return textResult;
      labelIds.push(tid);
      await yieldUi();
    }

    const allAtomIds = fragmentAtomIds.flat();
    ctx.focusAtoms?.(allAtomIds);

    return toolOk({
      moleculeCount: fragmentAtomIds.length,
      arrowCount: arrowIds.length,
      arrowIds,
      labelIds,
      groupId,
      layout: layoutMode,
      importErrors: importErrors.length ? importErrors : undefined,
      bounds: layout.bounds,
      newAtomIds: allAtomIds,
      fragmentAtomIds,
      spacing: { pitch, rowGap, arrowLength, labelOffset, maxW, maxH },
    });
  },
};
