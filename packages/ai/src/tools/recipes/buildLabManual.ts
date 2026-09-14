/**
 * Lab-manual procedure diagram: horizontal apparatus columns with step arrows,
 * optional reaction scheme in a clean band below (no overlap).
 */
import { listGlasswareSetups } from '@moldraw/domain';
import { DEFAULT_LAB_MANUAL_STEPS } from '../../chat/diagramLayoutEnforce';
import { buildLabManualInputSchema } from '../../schemas/tools';
import type { AiExecutionContext } from '../../types';
import type { RegisteredAiTool } from '../types';
import { toolFail, toolOk } from '../types';
import { buildReactionSchemeTool } from './buildReactionScheme';
import {
  newGlasswareId,
  placeAssemblyAt,
  placeCanvasCaption,
  placeGlasswareNamesAt,
  placeSetupAt,
  viewportCenterWorld,
} from './glasswarePlacement';

/** Columns per row in the apparatus strip. */
const STEPS_PER_ROW = 4;
/** Center-to-center spacing between columns (keeps arrows short). */
const COL_PITCH = 248;
/** Horizontal inset from column centers for step arrows (arrow length ≈ COL_PITCH − 2×inset). */
const ARROW_INSET = 88;
const LABEL_GAP = 24;
const NOTE_GAP = 18;
const LABEL_BAND = 64;
const ROW_GAP = 36;
const SCHEME_GAP = 100;
/** Approx. px/char at label font sizes — keep captions inside one column. */
const LABEL_MAX_CHARS = 26;
const NOTE_MAX_CHARS = 32;

function fitCaption(text: string, maxChars: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= maxChars) return t;
  return `${t.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

type IdSnap = {
  atomIds: Set<string>;
  arrowIds: Set<string>;
  textIds: Set<string>;
  shapeIds: Set<string>;
};

function snapshotIds(ctx: AiExecutionContext): IdSnap {
  const mol = ctx.getMolecule();
  return {
    atomIds: new Set(mol.atoms.map(a => a.id)),
    arrowIds: new Set((mol.reactionArrows ?? []).map(a => a.id)),
    textIds: new Set((mol.canvasTexts ?? []).map(t => t.id)),
    shapeIds: new Set((mol.canvasShapes ?? []).map(s => s.id)),
  };
}

function boundsOfNewContent(
  ctx: AiExecutionContext,
  before: IdSnap,
): { minX: number; maxX: number; minY: number; maxY: number } | null {
  const mol = ctx.getMolecule();
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
  for (const a of mol.atoms) {
    if (!before.atomIds.has(a.id)) grow(a.x, a.y);
  }
  for (const ar of mol.reactionArrows ?? []) {
    if (before.arrowIds.has(ar.id)) continue;
    grow(ar.x1, ar.y1);
    grow(ar.x2, ar.y2);
    for (const p of ar.pathPoints ?? []) grow(p.x, p.y);
  }
  for (const t of mol.canvasTexts ?? []) {
    if (!before.textIds.has(t.id)) grow(t.x, t.y);
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, maxX, minY, maxY };
}

/** Move scheme content placed beside glassware into a band below it. */
function moveNewContentToBand(
  ctx: AiExecutionContext,
  before: IdSnap,
  targetCx: number,
  targetTop: number,
): { ok: true } | { ok: false; error: string } {
  if (!ctx.applyCommand) return { ok: false, error: 'No dispatcher' };
  const bb = boundsOfNewContent(ctx, before);
  if (!bb) return { ok: true };

  const schemeCx = (bb.minX + bb.maxX) / 2;
  const dx = targetCx - schemeCx;
  const dy = targetTop - bb.minY;
  if (Math.hypot(dx, dy) < 1) return { ok: true };

  const mol = ctx.getMolecule();
  const newAtomIds = mol.atoms.filter(a => !before.atomIds.has(a.id)).map(a => a.id);
  if (newAtomIds.length) {
    const moved = ctx.applyCommand('molecule.moveAtoms', { atomIds: newAtomIds, dx, dy });
    if (!moved.ok) {
      return { ok: false, error: moved.error?.message ?? 'moveAtoms failed' };
    }
  }

  for (const ar of mol.reactionArrows ?? []) {
    if (before.arrowIds.has(ar.id)) continue;
    const patch: Record<string, unknown> = {
      id: ar.id,
      x1: ar.x1 + dx,
      y1: ar.y1 + dy,
      x2: ar.x2 + dx,
      y2: ar.y2 + dy,
    };
    if (ar.cx != null) patch.cx = ar.cx + dx;
    if (ar.cy != null) patch.cy = ar.cy + dy;
    if (ar.c1x != null) patch.c1x = ar.c1x + dx;
    if (ar.c1y != null) patch.c1y = ar.c1y + dy;
    if (ar.c2x != null) patch.c2x = ar.c2x + dx;
    if (ar.c2y != null) patch.c2y = ar.c2y + dy;
    if (ar.pathPoints?.length) {
      patch.pathPoints = ar.pathPoints.map(p => ({ x: p.x + dx, y: p.y + dy }));
    }
    const ur = ctx.applyCommand('molecule.updateReactionArrow', patch);
    if (!ur.ok) {
      return { ok: false, error: ur.error?.message ?? 'updateReactionArrow failed' };
    }
  }

  // Re-read texts after moves (ids unchanged).
  const mol2 = ctx.getMolecule();
  for (const t of mol2.canvasTexts ?? []) {
    if (before.textIds.has(t.id)) continue;
    const ur = ctx.applyCommand('molecule.updateCanvasText', {
      id: t.id,
      patch: { x: t.x + dx, y: t.y + dy },
    });
    if (!ur.ok) {
      return { ok: false, error: ur.error?.message ?? 'updateCanvasText failed' };
    }
  }

  return { ok: true };
}

function placeStepArrow(
  ctx: AiExecutionContext,
  x1: number,
  x2: number,
  y: number,
): { ok: true; id: string } | { ok: false; error: string } {
  if (!ctx.applyCommand) return { ok: false, error: 'No dispatcher' };
  const id = newGlasswareId('stepArrow');
  const r = ctx.applyCommand('molecule.addReactionArrow', {
    arrow: {
      id,
      x1,
      y1: y,
      x2,
      y2: y,
      kind: 'straight',
      color: '#475569',
      strokeWidth: 2.25,
      headScale: 1,
    },
  });
  if (!r.ok) return { ok: false, error: r.error?.message ?? 'addReactionArrow failed' };
  return { ok: true, id };
}

export const buildLabManualTool: RegisteredAiTool = {
  id: 'molecule.build_lab_manual',
  category: 'recipe',
  description: (() => {
    const setups = listGlasswareSetups()
      .map(s => s.id)
      .join('|');
    return (
      `Draw a lab-manual procedure diagram AFTER the user confirms. ` +
      `layoutMode: glassware|scheme|both (honor chat UI toggle / ctx.diagramLayoutMode). ` +
      `glassware/both: steps[] with setup (${setups}), pieces[] port chains, or glassware names; draws up to 4 columns per row with short step arrows and non-overlapping captions. ` +
      `both: reaction scheme (compounds SMILES) in a separate band BELOW apparatus — never beside/overlapping. ` +
      `scheme: compounds/arrows only. clear defaults false — only clear:true when user asks to replace/start fresh.`
    );
  })(),
  inputSchema: buildLabManualInputSchema,
  handler: async (input, ctx) => {
    const parsed = buildLabManualInputSchema.safeParse(input);
    if (!parsed.success) {
      return toolFail('VALIDATION', 'Invalid build_lab_manual input', parsed.error.flatten());
    }
    if (!ctx.applyCommand) {
      return toolFail('NO_DISPATCHER', 'build_lab_manual requires applyCommand');
    }

    const {
      clear = false,
      title,
      compounds,
      arrows,
    } = parsed.data;

    const layoutMode =
      parsed.data.layoutMode ?? ctx.diagramLayoutMode ?? 'both';

    // Ensure apparatus appears for glassware/both even if the model omitted steps.
    let steps = parsed.data.steps ?? [];
    if (
      (layoutMode === 'glassware' || layoutMode === 'both') &&
      steps.length === 0
    ) {
      steps = DEFAULT_LAB_MANUAL_STEPS.map(s => ({ ...s }));
    }

    if (clear) {
      const cleared = ctx.applyCommand('molecule.clearAll', {});
      if (!cleared.ok) {
        return toolFail('EXECUTION', cleared.error?.message ?? 'clearAll failed');
      }
    }

    const anchor = viewportCenterWorld(ctx);
    const wantGlassware = layoutMode === 'glassware' || layoutMode === 'both';
    const wantScheme =
      (layoutMode === 'scheme' || layoutMode === 'both') &&
      compounds != null &&
      compounds.length >= 2;

    const columns: {
      label: string;
      setup?: string;
      placed: { kind: string; shapeId: string }[];
      textIds: string[];
    }[] = [];
    const stepArrowIds: string[] = [];
    /** Bottom Y of apparatus+labels (for scheme band). */
    let apparatusBandBottom = anchor.cy + 120;

    if (wantGlassware && steps.length) {
      // Lift apparatus when a scheme band will sit below.
      const topRowCy = wantScheme ? anchor.cy - 140 : anchor.cy;
      const n = steps.length;
      const rowCount = Math.ceil(n / STEPS_PER_ROW);

      type ColInfo = {
        index: number;
        row: number;
        col: number;
        cx: number;
        cy: number;
        stackHalfH: number;
        label: string;
        note?: string;
        setup?: string;
        placed: { kind: string; shapeId: string }[];
      };
      const colInfos: ColInfo[] = [];
      const rowMaxHalf: number[] = Array.from({ length: rowCount }, () => 100);

      // Pass 1 — place apparatus on a STEPS_PER_ROW grid.
      for (let i = 0; i < n; i++) {
        const step = steps[i]!;
        const row = Math.floor(i / STEPS_PER_ROW);
        const col = i % STEPS_PER_ROW;
        const colsInRow = Math.min(STEPS_PER_ROW, n - row * STEPS_PER_ROW);
        const startX = anchor.cx - ((colsInRow - 1) * COL_PITCH) / 2;
        const cx = startX + col * COL_PITCH;
        let cy = topRowCy;
        for (let r = 0; r < row; r++) {
          cy += rowMaxHalf[r]! * 2 + LABEL_BAND + ROW_GAP;
        }

        const placed =
          step.setup != null
            ? placeSetupAt(ctx, step.setup, cx, cy)
            : step.pieces != null && step.pieces.length > 0
              ? placeAssemblyAt(ctx, step.pieces, cx, cy)
              : placeGlasswareNamesAt(ctx, step.glassware ?? [], cx, cy);
        if (!placed.ok) return toolFail('EXECUTION', placed.error);

        rowMaxHalf[row] = Math.max(rowMaxHalf[row]!, placed.stackHalfH);
        colInfos.push({
          index: i,
          row,
          col,
          cx,
          cy,
          stackHalfH: placed.stackHalfH,
          label: step.label,
          note: step.note,
          setup: step.setup,
          placed: placed.placed,
        });
      }

      // Pass 2 — labels under each column using the row's max stack (shared baseline, no overlap).
      for (const info of colInfos) {
        const rowHalf = rowMaxHalf[info.row]!;
        const labelY = info.cy + rowHalf + LABEL_GAP;
        const textIds: string[] = [];
        const cap = placeCanvasCaption(ctx, {
          x: info.cx,
          y: labelY,
          text: fitCaption(info.label, LABEL_MAX_CHARS),
          fontSize: 14,
        });
        if (!cap.ok) return toolFail('EXECUTION', cap.error);
        textIds.push(cap.textId);

        if (info.note?.trim()) {
          const note = placeCanvasCaption(ctx, {
            x: info.cx,
            y: labelY + NOTE_GAP,
            text: fitCaption(info.note.trim(), NOTE_MAX_CHARS),
            fontSize: 11,
          });
          if (!note.ok) return toolFail('EXECUTION', note.error);
          textIds.push(note.textId);
        }

        columns.push({
          label: info.label,
          setup: info.setup,
          placed: info.placed,
          textIds,
        });
      }

      // Short horizontal arrows between adjacent columns in the same row only.
      for (let i = 0; i < n - 1; i++) {
        const a = colInfos[i]!;
        const b = colInfos[i + 1]!;
        if (a.row !== b.row) continue;
        const ar = placeStepArrow(
          ctx,
          a.cx + ARROW_INSET,
          b.cx - ARROW_INSET,
          a.cy,
        );
        if (!ar.ok) return toolFail('EXECUTION', ar.error);
        stepArrowIds.push(ar.id);
      }

      if (title?.trim()) {
        const titleCap = placeCanvasCaption(ctx, {
          x: anchor.cx,
          y: topRowCy - (rowMaxHalf[0] ?? 100) - 40,
          text: title.trim(),
          fontSize: 18,
        });
        if (!titleCap.ok) return toolFail('EXECUTION', titleCap.error);
      }

      // Band bottom from row centers (labels share a baseline under each row).
      let rowCy = topRowCy;
      for (let r = 0; r < rowCount; r++) {
        const half = rowMaxHalf[r] ?? 100;
        apparatusBandBottom = rowCy + half + LABEL_BAND;
        if (r < rowCount - 1) {
          rowCy = apparatusBandBottom + ROW_GAP + (rowMaxHalf[r + 1] ?? 100);
        }
      }
    } else if (title?.trim() && wantScheme) {
      const titleCap = placeCanvasCaption(ctx, {
        x: anchor.cx,
        y: anchor.cy - 160,
        text: title.trim(),
        fontSize: 18,
      });
      if (!titleCap.ok) return toolFail('EXECUTION', titleCap.error);
    }

    let scheme: unknown;
    if (wantScheme) {
      const beforeScheme = snapshotIds(ctx);
      const schemeResult = await buildReactionSchemeTool.handler(
        {
          clear: false,
          compounds,
          arrows,
          layout: 'row',
        },
        ctx,
      );
      if (!schemeResult.ok) {
        return toolFail(
          'EXECUTION',
          `Scheme failed: ${schemeResult.error.message}`,
          schemeResult.error.details,
        );
      }
      scheme = schemeResult.data;

      if (wantGlassware && steps.length) {
        const targetTop = apparatusBandBottom + SCHEME_GAP;
        const moved = moveNewContentToBand(ctx, beforeScheme, anchor.cx, targetTop);
        if (!moved.ok) return toolFail('EXECUTION', moved.error);
      }
    }

    return toolOk({
      layoutMode,
      columns,
      stepArrowIds,
      title: title ?? null,
      scheme,
    });
  },
};
