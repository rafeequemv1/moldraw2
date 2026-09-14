import { buildCof1, cof1NodeSpacing } from './presets/cof1';
import { buildCof5, cof5NodeSpacing } from './presets/cof5';
import type { CofBuilder, CofPresetInfo, CofStackingSpec } from './types';

/**
 * Catalog of programmatic COF presets. Add a builder + info row to ship a new
 * framework without touching the top-bar menu.
 */
export const COF_PROGRAMMATIC_PRESETS: readonly CofPresetInfo[] = [
  {
    id: 'cof-1',
    label: 'COF-1',
    name: 'COF-1',
    summary:
      'Boroxine-linked hexagonal 2D COF (BDBA condensation). Benzene linkers; dashed bonds at the packing edge.',
    topology: 'hexagonal-honeycomb',
    dimensionality: 'layered',
    stacking: { mode: 'ab-slipped' },
    conditions: 'Mesitylene / 1,4-dioxane, 120 °C, 72 h',
  },
  {
    id: 'cof-5',
    label: 'COF-5',
    name: 'COF-5',
    summary:
      'HHTP + BDBA hexagonal 2D COF (dioxaborole joints). Black triphenylene nodes, blue phenylene linkers.',
    topology: 'hexagonal-honeycomb',
    dimensionality: 'layered',
    stacking: { mode: 'aa-eclipsed' },
    conditions: 'Mesitylene / 1,4-dioxane, 120 °C, 72 h',
  },
];

const BUILDERS: Record<string, CofBuilder> = {
  'cof-1': buildCof1,
  'cof-5': buildCof5,
};

export const COF_PRESET_INFO_BY_ID: ReadonlyMap<string, CofPresetInfo> = new Map(
  COF_PROGRAMMATIC_PRESETS.map(p => [p.id, p]),
);

export function getCofBuilder(presetId: string): CofBuilder | undefined {
  return BUILDERS[presetId];
}

export function listCofPresets(): readonly CofPresetInfo[] {
  return COF_PROGRAMMATIC_PRESETS;
}

export function cofNodeSpacing(presetId: string, bondLength: number): number {
  const a = Math.max(16, bondLength);
  return presetId === 'cof-5' ? cof5NodeSpacing(a) : cof1NodeSpacing(a);
}

export function cofStackingForPreset(presetId: string): CofStackingSpec {
  return (
    COF_PRESET_INFO_BY_ID.get(presetId)?.stacking ?? { mode: 'aa-eclipsed' as const }
  );
}
