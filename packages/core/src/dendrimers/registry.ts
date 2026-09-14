import { buildCarbosilaneFcG3 } from './presets/carbosilaneFcG3';
import { buildPamamG2 } from './presets/pamamG2';
import type { DendrimerBuilder, DendrimerPresetInfo } from './types';

export const DENDRIMER_PROGRAMMATIC_PRESETS: readonly DendrimerPresetInfo[] = [
  {
    id: 'carbosilane-fc-g3',
    label: 'Si–Fc G3',
    name: 'Carbosilane–ferrocene G3',
    summary:
      '1,3,5-benzene core, Si 3-way branching, phenoxy linkers, 81 Fc termini. One wedge × dendrimer array.',
  },
  {
    id: 'pamam-g2',
    label: 'PAMAM G2',
    name: 'PAMAM G2',
    summary:
      'Poly(amidoamine) dendrimer, ethylenediamine core, 16 terminal amines (G2).',
  },
];

const BUILDERS: Record<string, DendrimerBuilder> = {
  'carbosilane-fc-g3': buildCarbosilaneFcG3,
  'pamam-g2': buildPamamG2,
};

export const DENDRIMER_PRESET_INFO_BY_ID: ReadonlyMap<string, DendrimerPresetInfo> = new Map(
  DENDRIMER_PROGRAMMATIC_PRESETS.map(p => [p.id, p]),
);

export function getDendrimerBuilder(presetId: string): DendrimerBuilder | undefined {
  return BUILDERS[presetId];
}

export function listDendrimerPresets(): readonly DendrimerPresetInfo[] {
  return DENDRIMER_PROGRAMMATIC_PRESETS;
}
