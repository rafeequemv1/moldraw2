import { CMD } from '@moldraw/core';
import { ELEMENT_COLORS } from '@moldraw/domain';
import { colorByElementInputSchema } from '../../schemas/tools';
import type { RegisteredAiTool } from '../types';
import { dispatchCommand, toolFail, toolOk } from '../types';
import { resolveNamedHexColor } from './namedColor';

function resolveColor(raw: string, element: string): string {
  const t = raw.trim();
  if (!t || /^(default|element|cpk|auto)$/i.test(t)) {
    return ELEMENT_COLORS[element] ?? '#0f172a';
  }
  return resolveNamedHexColor(t) ?? (t.startsWith('#') ? t : `#${t}`);
}

/**
 * Paint all atoms of one element. Works when Settings “Color atom labels by
 * element” is off — sets per-atom `color` so labels actually change on the 2D canvas.
 */
export const colorByElementTool: RegisteredAiTool = {
  id: 'molecule.color_by_element',
  category: 'recipe',
  description:
    'Color ALL atoms of a given element (e.g. O → red). Use for “make all oxygen red”, “color nitrogens blue”. ' +
    '2D canvas defaults to black labels unless Settings “Color atom labels by element” is on — this tool paints custom atom colors so the change is always visible. ' +
    'Do NOT claim oxygen is already red; do NOT require a selection.',
  inputSchema: colorByElementInputSchema,
  handler: (input, ctx) => {
    const {
      element: rawEl,
      color: rawColor = 'default',
      colorBonds = false,
    } = input as {
      element: string;
      color?: string;
      colorBonds?: boolean;
    };

    const element = rawEl.trim();
    if (!/^[A-Z][a-z]?$/.test(element)) {
      return toolFail(
        'VALIDATION',
        `Invalid element symbol "${rawEl}". Use standard symbols like O, N, Cl.`,
      );
    }

    const mol = ctx.getMolecule();
    const atoms = mol.atoms.filter(a => a.element === element);

    if (atoms.length === 0) {
      return toolFail('EXECUTION', `No ${element} atoms on the canvas.`);
    }

    const color = resolveColor(rawColor, element);
    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
      return toolFail(
        'VALIDATION',
        `Could not resolve color "${rawColor}". Use a hex like #dc2626 or a name like red.`,
      );
    }

    const selectedAtomIds = atoms.map(a => a.id);
    const result = dispatchCommand(ctx, CMD.ApplySelectionColor, {
      color,
      flags: {
        atomLabels: true,
        bonds: colorBonds,
        ringFill: false,
        text: false,
        arrowLine: false,
        arrowReagent: false,
        strokes: false,
        canvasShapes: false,
      },
      selectedAtomIds,
      selectedCanvasTextId: null,
      selectedReactionArrowId: null,
      selectedStrokeId: null,
      selectedCanvasShapeId: null,
      ringFillOpacity: 0.35,
    });
    if (!result.ok) return result;

    ctx.setSelection?.({ atomIds: selectedAtomIds, bondIds: [] });

    return toolOk({
      element,
      color,
      atomCount: selectedAtomIds.length,
      colorBonds,
      note:
        'Painted custom atom colors. Settings “Color atom labels by element” can stay off — these overrides still show.',
    });
  },
};
