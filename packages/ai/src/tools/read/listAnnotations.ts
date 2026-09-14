import { listAnnotationsInputSchema } from '../../schemas/tools';
import type { RegisteredAiTool } from '../types';
import { toolOk } from '../types';

export const listAnnotationsTool: RegisteredAiTool = {
  id: 'molecule.list_annotations',
  category: 'read',
  description:
    'List canvas annotations with ids: reaction arrows, texts, strokes, shapes, and images.',
  inputSchema: listAnnotationsInputSchema,
  handler: (_input, ctx) => {
    const mol = ctx.getMolecule();
    return toolOk({
      reactionArrows: (mol.reactionArrows ?? []).map(a => ({
        id: a.id,
        kind: a.kind ?? null,
        x1: a.x1,
        y1: a.y1,
        x2: a.x2,
        y2: a.y2,
        cx: a.cx ?? null,
        cy: a.cy ?? null,
        fromAnchor: a.fromAnchor ?? null,
        toAnchor: a.toAnchor ?? null,
        headStyle: a.headStyle ?? null,
        curveAmount: a.curveAmount ?? null,
        reagentAbove: a.reagentAbove ?? null,
        reagentBelow: a.reagentBelow ?? null,
      })),
      canvasTexts: (mol.canvasTexts ?? []).map(t => ({
        id: t.id,
        text: t.text,
        x: t.x,
        y: t.y,
      })),
      strokes: (mol.strokes ?? []).map(s => ({ id: s.id, pointCount: s.points?.length ?? 0 })),
      canvasShapes: (mol.canvasShapes ?? []).map(s => ({ id: s.id, kind: s.kind })),
      canvasImages: (mol.canvasImages ?? []).map(img => ({
        id: img.id,
        width: img.width,
        height: img.height,
      })),
    });
  },
};
