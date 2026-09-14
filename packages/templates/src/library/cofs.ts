import { COF1_HEX_PORE_MOLBLOCK } from './cof1HexMolblock';

/**
 * Legacy COF molblock catalog. The Library → COFs tab places programmatic
 * frameworks from `@moldraw/core` `cofs/` (COF-1, COF-5) instead of these rows.
 */
export type CofPreset = {
  id: string;
  label: string;
  name: string;
  /** Precomputed 2D molblock (hex pore / repeat unit). */
  molblock: string;
  summary: string;
  conditions?: string;
};

export const COF_PRESETS: readonly CofPreset[] = [
  {
    id: 'cof-1',
    label: 'COF-1',
    name: 'COF-1',
    molblock: COF1_HEX_PORE_MOLBLOCK,
    summary:
      'COF-1 2D layer from CIF 05000N2(1): boroxine-linked hexagonal pore (BDBA condensation).',
    conditions: 'Mesitylene / 1,4-dioxane, 120 °C, 72 h',
  },
];

export const COF_PRESET_BY_ID: ReadonlyMap<string, CofPreset> = new Map(
  COF_PRESETS.map(p => [p.id, p]),
);
