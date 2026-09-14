/**
 * Spectroscopy prediction items — nested under Chemistry as a submenu.
 */

export type SpectroscopyKind = 'nmr' | 'mass' | 'uv';

export const SPECTROSCOPY_ITEMS: {
  id: SpectroscopyKind;
  label: string;
  hint: string;
}[] = [
  { id: 'nmr', label: 'Predict NMR', hint: 'Heuristic ¹H / ¹³C spectrum (selection or canvas)' },
  { id: 'mass', label: 'Predict MASS spectra', hint: 'Isotope pattern / EI mass spectrum' },
  { id: 'uv', label: 'Predict UV', hint: 'Heuristic UV-Vis λmax bands' },
];

/** @deprecated Spectroscopy lives under ChemistryMenu — kept for import stability. */
export function SpectroscopyMenu() {
  return null;
}
