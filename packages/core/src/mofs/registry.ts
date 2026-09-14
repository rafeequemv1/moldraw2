import type { CofBuilder, CofPresetInfo, CofStackingSpec } from '../cofs/types';
import { buildCuHhtp, cuHhtpNodeSpacing } from './presets/cuHhtp';
import {
  buildCoBdc,
  buildCuBdc,
  buildMof2,
  buildNiBdc,
  mBdcNodeSpacing,
} from './presets/mBdc';

/**
 * Catalog of programmatic 2D MOF presets. Add a builder + info row to ship a
 * new framework without touching the top-bar menu.
 */
export const MOF_PROGRAMMATIC_PRESETS: readonly CofPresetInfo[] = [
  {
    id: 'cu-hhtp',
    label: 'Cu-HHTP',
    name: 'Cu₃(HHTP)₂ (Cu-CAT-1)',
    summary:
      'Conductive 2D MOF: HHTP triphenylene nodes linked by square-planar Cu (catechol). Hexagonal honeycomb; dashed bonds at the packing edge.',
    topology: 'hexagonal-honeycomb',
    dimensionality: 'layered',
    stacking: { mode: 'ab-slipped' },
    conditions: 'Cu(NO₃)₂ + HHTP, DMF / H₂O, 85 °C',
  },
  {
    id: 'mof-2',
    label: 'MOF-2',
    name: 'Zn₂(BDC)₂ (MOF-2)',
    summary:
      'First 2D MOF (Yaghi 1995). Zinc paddlewheel nodes + terephthalate (BDC) in a square sql layer. Dashed bonds at the packing edge.',
    topology: 'square-grid',
    dimensionality: 'layered',
    stacking: { mode: 'ab-slipped' },
    conditions: 'Zn(NO₃)₂ + H₂BDC, DMF / H₂O, hydrothermal',
  },
  {
    id: 'cu-bdc',
    label: 'Cu(BDC)',
    name: 'Cu₂(BDC)₂',
    summary:
      'Layered copper terephthalate (sql paddlewheel). Workhorse for intercalation and exfoliation to 2D nanosheets.',
    topology: 'square-grid',
    dimensionality: 'layered',
    stacking: { mode: 'ab-slipped' },
    conditions: 'Cu(NO₃)₂ + H₂BDC, DMF, 110 °C',
  },
  {
    id: 'ni-bdc',
    label: 'Ni(BDC)',
    name: 'Ni₂(BDC)₂',
    summary:
      'Layered nickel terephthalate, same square paddlewheel + BDC net as MOF-2 / Cu(BDC).',
    topology: 'square-grid',
    dimensionality: 'layered',
    stacking: { mode: 'ab-slipped' },
    conditions: 'Ni(NO₃)₂ + H₂BDC, DMF / H₂O',
  },
  {
    id: 'co-bdc',
    label: 'Co(BDC)',
    name: 'Co₂(BDC)₂',
    summary:
      'Layered cobalt terephthalate, same square paddlewheel + BDC net as MOF-2 / Cu(BDC).',
    topology: 'square-grid',
    dimensionality: 'layered',
    stacking: { mode: 'ab-slipped' },
    conditions: 'Co(NO₃)₂ + H₂BDC, DMF / H₂O',
  },
];

const BUILDERS: Record<string, CofBuilder> = {
  'cu-hhtp': buildCuHhtp,
  'mof-2': buildMof2,
  'cu-bdc': buildCuBdc,
  'ni-bdc': buildNiBdc,
  'co-bdc': buildCoBdc,
};

const MBDC_IDS = new Set(['mof-2', 'cu-bdc', 'ni-bdc', 'co-bdc']);

export const MOF_PRESET_INFO_BY_ID: ReadonlyMap<string, CofPresetInfo> = new Map(
  MOF_PROGRAMMATIC_PRESETS.map(p => [p.id, p]),
);

export function getMofBuilder(presetId: string): CofBuilder | undefined {
  return BUILDERS[presetId];
}

export function listMofPresets(): readonly CofPresetInfo[] {
  return MOF_PROGRAMMATIC_PRESETS;
}

export function mofNodeSpacing(presetId: string, bondLength: number): number | undefined {
  const a = Math.max(16, bondLength);
  if (presetId === 'cu-hhtp') return cuHhtpNodeSpacing(a);
  if (MBDC_IDS.has(presetId)) return mBdcNodeSpacing(a);
  return undefined;
}

export function mofStackingForPreset(presetId: string): CofStackingSpec | undefined {
  return MOF_PRESET_INFO_BY_ID.get(presetId)?.stacking;
}
