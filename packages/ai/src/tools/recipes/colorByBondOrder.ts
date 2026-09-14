import { CMD } from '@moldraw/core';
import { colorByBondOrderInputSchema } from '../../schemas/tools';
import type { RegisteredAiTool } from '../types';
import { dispatchCommand, toolFail, toolOk } from '../types';
import { resolveNamedHexColor } from './namedColor';

type BondKind = 'single' | 'double' | 'triple' | 'aromatic' | 'dative' | 'wedge' | 'dash';

function parseBondKind(raw: string): BondKind | number | null {
  const t = raw.trim().toLowerCase().replace(/[_-]+/g, ' ');
  if (/^(1|single|singles?)$/.test(t)) return 'single';
  if (/^(2|double|doubles?)$/.test(t)) return 'double';
  if (/^(3|triple|triples?)$/.test(t)) return 'triple';
  if (/^aromatic/.test(t)) return 'aromatic';
  if (/^dative|^coordinate|^coordination/.test(t)) return 'dative';
  if (/^wedge|^bold/.test(t)) return 'wedge';
  if (/^dash|^hashed?/.test(t)) return 'dash';
  const n = Number(t);
  if (n === 1 || n === 2 || n === 3) return n;
  return null;
}

function bondMatches(
  b: { order: number; aromatic?: boolean; dative?: boolean; stereo?: string },
  kind: BondKind | number,
): boolean {
  if (typeof kind === 'number') return b.order === kind && !b.aromatic;
  switch (kind) {
    case 'single':
      return b.order === 1 && !b.aromatic && !b.dative;
    case 'double':
      return b.order === 2 && !b.aromatic;
    case 'triple':
      return b.order === 3 && !b.aromatic;
    case 'aromatic':
      return Boolean(b.aromatic);
    case 'dative':
      return Boolean(b.dative);
    case 'wedge':
      return b.stereo === 'wedge';
    case 'dash':
      return b.stereo === 'dash';
    default:
      return false;
  }
}

/**
 * Paint all bonds of a given order/kind. No UI selection required —
 * avoids the color_selection “Nothing selected” failure for “make all double bonds blue”.
 */
export const colorByBondOrderTool: RegisteredAiTool = {
  id: 'molecule.color_by_bond_order',
  category: 'recipe',
  description:
    'Color ALL bonds of a given order/kind (double, single, triple, aromatic, dative, wedge, dash). ' +
    'Use for “make all double bonds blue”, “color triples red”. Do NOT use color_selection (needs a selection). ' +
    'Pass color as a name (blue) or hex (#2563eb).',
  inputSchema: colorByBondOrderInputSchema,
  handler: (input, ctx) => {
    const { bondOrder: rawOrder, color: rawColor } = input as {
      bondOrder: string | number;
      color: string;
    };

    const kind = parseBondKind(String(rawOrder));
    if (kind == null) {
      return toolFail(
        'VALIDATION',
        `Unknown bond kind "${rawOrder}". Use single/double/triple/aromatic/dative/wedge/dash or 1/2/3.`,
      );
    }

    const color = resolveNamedHexColor(rawColor);
    if (!color) {
      return toolFail(
        'VALIDATION',
        `Could not resolve color "${rawColor}". Use a hex like #2563eb or a name like blue.`,
      );
    }

    const mol = ctx.getMolecule();
    const bonds = mol.bonds.filter(b => bondMatches(b, kind));
    if (bonds.length === 0) {
      return toolFail('EXECUTION', `No ${String(rawOrder)} bonds on the canvas.`);
    }

    const selectedBondIds = bonds.map(b => b.id);
    const result = dispatchCommand(ctx, CMD.ApplySelectionColor, {
      color,
      flags: {
        atomLabels: false,
        bonds: true,
        ringFill: false,
        text: false,
        arrowLine: false,
        arrowReagent: false,
        strokes: false,
        canvasShapes: false,
      },
      selectedAtomIds: [],
      selectedBondIds,
      selectedCanvasTextId: null,
      selectedReactionArrowId: null,
      selectedStrokeId: null,
      selectedCanvasShapeId: null,
      ringFillOpacity: 0.35,
    });
    if (!result.ok) return result;

    ctx.setSelection?.({ atomIds: [], bondIds: selectedBondIds });

    return toolOk({
      bondOrder: kind,
      color,
      bondCount: selectedBondIds.length,
    });
  },
};
