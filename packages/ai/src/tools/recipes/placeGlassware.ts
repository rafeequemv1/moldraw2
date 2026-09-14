import {
  glasswareLibrarySummary,
  listGlasswareSetups,
  resolveGlassware,
} from '@moldraw/domain';
import { placeGlasswareInputSchema } from '../../schemas/tools';
import type { RegisteredAiTool } from '../types';
import { toolFail, toolOk } from '../types';
import {
  placeAssemblyAt,
  placeCanvasCaption,
  placeGlasswareNamesAt,
  placeGlasswareShape,
  placeSetupAt,
  viewportCenterWorld,
  type AssemblyPieceInput,
} from './glasswarePlacement';

export const placeGlasswareTool: RegisteredAiTool = {
  id: 'molecule.place_glassware',
  category: 'recipe',
  description: (() => {
    const setups = listGlasswareSetups()
      .map(s => s.id)
      .join('|');
    return (
      `Place lab glassware for apparatus / mechanism diagrams. ` +
      `Single vessel: name = kind/alias (${glasswareLibrarySummary()}). ` +
      `Named multi-piece: setup = ${setups}. ` +
      `Custom pipeline: pieces[] with attachTo/fromPort/toPort (call molecule.list_glassware for port ids). ` +
      `Optional labelBelow, cx/cy, fillLevel/fillColor. ` +
      `For multi-step lab-manual diagrams after user confirmation, prefer molecule.build_lab_manual.`
    );
  })(),
  inputSchema: placeGlasswareInputSchema,
  handler: (input, ctx) => {
    const raw = input as {
      name?: string;
      setup?: string;
      pieces?: AssemblyPieceInput[];
      cx?: number;
      cy?: number;
      width?: number;
      height?: number;
      fillLevel?: number;
      fillColor?: string;
      labelBelow?: string;
    };

    const anchor = viewportCenterWorld(ctx);
    const cx = raw.cx ?? anchor.cx;
    const cy = raw.cy ?? anchor.cy;

    if (raw.setup) {
      const r = placeSetupAt(ctx, raw.setup, cx, cy);
      if (!r.ok) return toolFail('EXECUTION', r.error);
      let textId: string | undefined;
      if (raw.labelBelow?.trim()) {
        const cap = placeCanvasCaption(ctx, {
          x: cx,
          y: cy + r.stackHalfH + 22,
          text: raw.labelBelow.trim(),
          fontSize: 15,
        });
        if (!cap.ok) return toolFail('EXECUTION', cap.error);
        textId = cap.textId;
      }
      return toolOk({
        setup: raw.setup,
        placed: r.placed,
        textId,
      });
    }

    if (raw.pieces?.length) {
      const r = placeAssemblyAt(ctx, raw.pieces, cx, cy);
      if (!r.ok) return toolFail('EXECUTION', r.error);
      let textId: string | undefined;
      if (raw.labelBelow?.trim()) {
        const cap = placeCanvasCaption(ctx, {
          x: cx,
          y: cy + r.stackHalfH + 22,
          text: raw.labelBelow.trim(),
          fontSize: 15,
        });
        if (!cap.ok) return toolFail('EXECUTION', cap.error);
        textId = cap.textId;
      }
      return toolOk({
        assembly: true,
        placed: r.placed,
        textId,
      });
    }

    const entry = resolveGlassware(raw.name ?? '');
    if (!entry) {
      return toolFail(
        'EXECUTION',
        `Unknown glassware "${raw.name}". Call molecule.list_glassware. Known: ${glasswareLibrarySummary()}.`,
      );
    }

    if (raw.width != null || raw.height != null || raw.fillLevel != null || raw.fillColor != null) {
      const one = placeGlasswareShape(ctx, entry, {
        cx,
        cy,
        width: raw.width,
        height: raw.height,
        fillLevel: raw.fillLevel,
        fillColor: raw.fillColor,
      });
      if (!one.ok) return toolFail('EXECUTION', one.error);
      let textId: string | undefined;
      if (raw.labelBelow?.trim()) {
        const h = raw.height ?? entry.defaultHeight;
        const cap = placeCanvasCaption(ctx, {
          x: cx,
          y: cy + h / 2 + 18,
          text: raw.labelBelow.trim(),
        });
        if (!cap.ok) return toolFail('EXECUTION', cap.error);
        textId = cap.textId;
      }
      return toolOk({
        kind: entry.kind,
        label: entry.label,
        shapeId: one.shapeId,
        textId,
      });
    }

    const stack = placeGlasswareNamesAt(ctx, [raw.name!], cx, cy);
    if (!stack.ok) return toolFail('EXECUTION', stack.error);
    let textId: string | undefined;
    if (raw.labelBelow?.trim()) {
      const cap = placeCanvasCaption(ctx, {
        x: cx,
        y: cy + stack.stackHalfH + 18,
        text: raw.labelBelow.trim(),
      });
      if (!cap.ok) return toolFail('EXECUTION', cap.error);
      textId = cap.textId;
    }
    return toolOk({
      kind: entry.kind,
      label: entry.label,
      shapeId: stack.placed[0]?.shapeId,
      textId,
    });
  },
};
