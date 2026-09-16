/**
 * Toolbar bond-tool ids → Bond fields used when drawing or restyling.
 */
import type { Bond } from '@moldraw/domain';

export const BOND_TOOLS = [
  'single_bond',
  'double_bond',
  'triple_bond',
  'aromatic_bond',
  'wedge_bond',
  'dash_bond',
  'either_bond',
  'wavy_bond',
  'cis_trans_bond',
  'dative_bond',
  'any_bond',
  'single_double_bond',
  'single_aromatic_bond',
  'double_aromatic_bond',
  'dotted_bond',
  'bold_bond',
] as const;

export type BondToolId = (typeof BOND_TOOLS)[number];

export const isBondTool = (tool: string): tool is BondToolId =>
  (BOND_TOOLS as readonly string[]).includes(tool);

export type BondStylePatch = Partial<
  Pick<Bond, 'order' | 'stereo' | 'orderCycleRamp' | 'dative' | 'dotted' | 'aromatic' | 'queryType' | 'bold'>
>;

const CLEAR: BondStylePatch = {
  order: 1,
  stereo: undefined,
  dative: false,
  dotted: false,
  aromatic: false,
  queryType: undefined,
  bold: false,
  orderCycleRamp: undefined,
};

export function bondPatchForStyleTool(toolId: BondToolId): BondStylePatch {
  switch (toolId) {
    case 'single_bond':
      return { ...CLEAR, order: 1, orderCycleRamp: null as unknown as undefined };
    case 'double_bond':
      return { ...CLEAR, order: 2, orderCycleRamp: 'up' };
    case 'triple_bond':
      return { ...CLEAR, order: 3 };
    case 'aromatic_bond':
      return { ...CLEAR, order: 1, aromatic: true };
    case 'wedge_bond':
      return { ...CLEAR, order: 1, stereo: 'wedge' };
    case 'dash_bond':
      return { ...CLEAR, order: 1, stereo: 'dash' };
    case 'either_bond':
      return { ...CLEAR, order: 1, stereo: 'either' };
    case 'wavy_bond':
      return { ...CLEAR, order: 1, stereo: 'wavy' };
    case 'cis_trans_bond':
      return { ...CLEAR, order: 2, stereo: 'cis_trans' };
    case 'dative_bond':
      return { ...CLEAR, order: 1, dative: true };
    case 'any_bond':
      return { ...CLEAR, order: 1, queryType: 'any' };
    case 'single_double_bond':
      return { ...CLEAR, order: 1, queryType: 'single_double' };
    case 'single_aromatic_bond':
      return { ...CLEAR, order: 1, queryType: 'single_aromatic' };
    case 'double_aromatic_bond':
      return { ...CLEAR, order: 1, queryType: 'double_aromatic' };
    case 'dotted_bond':
      return { ...CLEAR, order: 1, dotted: true };
    case 'bold_bond':
      return { ...CLEAR, order: 1, bold: true };
  }
}

export function bondMatchesStyle(bond: Bond, toolId: BondToolId): boolean {
  const p = bondPatchForStyleTool(toolId);
  if (p.order !== undefined && bond.order !== p.order) return false;
  if ((bond.stereo ?? undefined) !== (p.stereo ?? undefined)) return false;
  if (Boolean(bond.dative) !== Boolean(p.dative)) return false;
  if (Boolean(bond.dotted) !== Boolean(p.dotted)) return false;
  if (Boolean(bond.aromatic) !== Boolean(p.aromatic)) return false;
  if ((bond.queryType ?? undefined) !== (p.queryType ?? undefined)) return false;
  if (Boolean(bond.bold) !== Boolean(p.bold)) return false;
  return true;
}

export function isOrderCycleTool(toolId: BondToolId): boolean {
  return toolId === 'single_bond' || toolId === 'double_bond' || toolId === 'triple_bond';
}

export function skipsValencyTool(toolId: BondToolId): boolean {
  return (
    toolId === 'dative_bond' ||
    toolId === 'dotted_bond' ||
    toolId === 'any_bond' ||
    toolId === 'single_double_bond' ||
    toolId === 'single_aromatic_bond' ||
    toolId === 'double_aromatic_bond'
  );
}

/** Command payload: Zod needs `null` to clear optional enums. */
export function bondCommandPatchForStyleTool(toolId: BondToolId): {
  order?: 1 | 2 | 3;
  stereo?: 'wedge' | 'dash' | 'wavy' | 'either' | 'cis_trans' | null;
  dative?: boolean;
  dotted?: boolean;
  aromatic?: boolean;
  queryType?: 'any' | 'single_double' | 'single_aromatic' | 'double_aromatic' | null;
  bold?: boolean;
  orderCycleRamp?: 'up' | 'down' | null;
} {
  const p = bondPatchForStyleTool(toolId);
  return {
    order: p.order as 1 | 2 | 3 | undefined,
    stereo: p.stereo ?? null,
    dative: Boolean(p.dative),
    dotted: Boolean(p.dotted),
    aromatic: Boolean(p.aromatic),
    queryType: p.queryType ?? null,
    bold: Boolean(p.bold),
    orderCycleRamp: p.orderCycleRamp ?? null,
  };
}
