/** Chemistry annotation glyphs for the text toolbar (δ, arrows, etc.). */
export type ChemTextSymbol = {
  char: string;
  label: string;
  title: string;
};

export const CHEM_TEXT_SYMBOLS: ChemTextSymbol[] = [
  { char: 'δ', label: 'δ', title: 'Delta (partial charge)' },
  { char: 'δ+', label: 'δ+', title: 'Partial positive (δ+)' },
  { char: 'δ−', label: 'δ−', title: 'Partial negative (δ−)' },
  { char: 'δ⁺', label: 'δ⁺', title: 'Partial positive superscript' },
  { char: 'δ⁻', label: 'δ⁻', title: 'Partial negative superscript' },
  { char: '⊕', label: '⊕', title: 'Carbocation (circled +)' },
  { char: '⊖', label: '⊖', title: 'Carbanion (circled −)' },
  { char: 'Δ', label: 'Δ', title: 'Heat / change (capital delta)' },
  { char: '△', label: '△', title: 'Heat (open triangle)' },
  { char: 'ν', label: 'ν', title: 'Nu / frequency (e.g. hν)' },
  { char: '‡', label: '‡', title: 'Transition state (double dagger)' },
  { char: '°C', label: '°C', title: 'Degrees Celsius' },
  { char: '→', label: '→', title: 'Reaction arrow' },
  { char: '⇌', label: '⇌', title: 'Equilibrium' },
  { char: '↔', label: '↔', title: 'Resonance / reversible' },
  { char: '⟶', label: '⟶', title: 'Long reaction arrow' },
  { char: '°', label: '°', title: 'Degree' },
  { char: '·', label: '·', title: 'Middle dot (radical / hydrate)' },
  { char: '±', label: '±', title: 'Plus-minus' },
  { char: '≠', label: '≠', title: 'Not equal' },
  { char: '≈', label: '≈', title: 'Approximately' },
  { char: '∞', label: '∞', title: 'Infinity' },
  { char: 'α', label: 'α', title: 'Alpha' },
  { char: 'β', label: 'β', title: 'Beta' },
  { char: 'γ', label: 'γ', title: 'Gamma' },
  { char: 'λ', label: 'λ', title: 'Lambda (wavelength)' },
];

/** One-click inserts for reaction arrow reagent fields. */
export const ARROW_CONDITION_CHIPS: ChemTextSymbol[] = [
  { char: 'Δ', label: 'Δ', title: 'Heat' },
  { char: '△', label: '△', title: 'Heat (triangle)' },
  { char: 'ν', label: 'ν', title: 'Light / frequency (hν)' },
  { char: '‡', label: '‡', title: 'Transition state' },
  { char: '°C', label: '°C', title: 'Degrees Celsius' },
];
