/** Chemistry annotation glyphs for the text toolbar (δ, arrows, etc.). */
export type ChemTextSymbol = {
  char: string;
  label: string;
  title: string;
  /** Extra search tokens (aliases, spellings). */
  keywords?: string;
};

export type ChemTextSymbolGroup = {
  id: string;
  label: string;
  symbols: ChemTextSymbol[];
};

const s = (char: string, title: string, keywords?: string): ChemTextSymbol => ({
  char,
  label: char,
  title,
  ...(keywords ? { keywords } : {}),
});

function uniqueByChar(items: readonly ChemTextSymbol[]): ChemTextSymbol[] {
  const seen = new Set<string>();
  const out: ChemTextSymbol[] = [];
  for (const item of items) {
    if (seen.has(item.char)) continue;
    seen.add(item.char);
    out.push(item);
  }
  return out;
}

/** Grouped chemistry / annotation symbols for the text-style picker. */
export const CHEM_TEXT_SYMBOL_GROUPS: ChemTextSymbolGroup[] = [
  {
    id: 'arrows',
    label: 'Arrows',
    symbols: uniqueByChar([
      s('→', 'Right arrow / reaction', 'arrow reaction'),
      s('←', 'Left arrow', 'arrow'),
      s('↔', 'Resonance / reversible', 'arrow resonance double headed'),
      s('⇌', 'Equilibrium', 'arrow equilibrium harpoons'),
      s('⇄', 'Right over left arrows', 'arrow equilibrium exchange'),
      s('⇆', 'Left over right arrows', 'arrow exchange'),
      s('⇋', 'Left harpoon over right', 'arrow equilibrium'),
      s('⟶', 'Long reaction arrow', 'arrow long'),
      s('⟵', 'Long left arrow', 'arrow long'),
      s('⟷', 'Long resonance arrow', 'arrow long resonance'),
      s('⟹', 'Long double right arrow', 'arrow implies'),
      s('⟸', 'Long double left arrow', 'arrow'),
      s('⟺', 'Long double-headed arrow', 'arrow iff iff'),
    ]),
  },
  {
    id: 'bonds',
    label: 'Bonds',
    symbols: uniqueByChar([
      s('−', 'Single bond / minus', 'bond minus minus-sign'),
      s('=', 'Double bond / equals', 'bond double'),
      s('≡', 'Triple bond', 'bond triple identical'),
      s('∼', 'Similar / wavy', 'bond tilde similar'),
      s('≈', 'Approximately equal', 'bond approx approximately'),
      s('⋯', 'Midline ellipsis', 'bond ellipsis dots'),
      s('···', 'Three middle dots', 'bond ellipsis dots'),
    ]),
  },
  {
    id: 'charge',
    label: 'Charge',
    symbols: uniqueByChar([
      s('+', 'Plus charge', 'charge plus cation'),
      s('−', 'Minus charge', 'charge minus anion'),
      s('±', 'Plus-minus', 'charge plus-minus'),
      s('⁺', 'Superscript plus', 'charge superscript plus cation'),
      s('⁻', 'Superscript minus', 'charge superscript minus anion'),
      s('²⁺', '2+ charge', 'charge 2+ cation'),
      s('²⁻', '2− charge', 'charge 2- anion'),
      s('³⁺', '3+ charge', 'charge 3+ cation'),
      s('³⁻', '3− charge', 'charge 3- anion'),
      s('⁴⁺', '4+ charge', 'charge 4+ cation'),
      s('⁴⁻', '4− charge', 'charge 4- anion'),
      s('δ+', 'Partial positive (δ+)', 'charge delta partial'),
      s('δ−', 'Partial negative (δ−)', 'charge delta partial'),
      s('δ⁺', 'Partial positive superscript', 'charge delta partial'),
      s('δ⁻', 'Partial negative superscript', 'charge delta partial'),
      s('⊕', 'Carbocation (circled +)', 'charge oplus cation'),
      s('⊖', 'Carbanion (circled −)', 'charge ominus anion'),
    ]),
  },
  {
    id: 'temp',
    label: 'Temp / conditions',
    symbols: uniqueByChar([
      s('°C', 'Degrees Celsius', 'temp celsius heat'),
      s('°F', 'Degrees Fahrenheit', 'temp fahrenheit'),
      s('K', 'Kelvin', 'temp kelvin'),
      s('Δ', 'Heat / change (capital delta)', 'temp heat delta triangle'),
      s('hν', 'Irradiation (hν)', 'temp light photon hnu hv'),
      s('hv', 'Irradiation (hv)', 'temp light photon'),
      s('UV', 'Ultraviolet', 'temp light uv'),
      s('ΔT', 'Temperature change (ΔT)', 'temp delta T'),
      s('△', 'Heat (open triangle)', 'temp heat triangle'),
      s('‡', 'Transition state (double dagger)', 'temp ts transition-state'),
    ]),
  },
  {
    id: 'spectroscopy',
    label: 'Spectroscopy',
    symbols: uniqueByChar([
      s('λ', 'Wavelength (λ)', 'spectroscopy lambda wavelength'),
      s('ν', 'Frequency (ν)', 'spectroscopy nu frequency'),
      s('ν̄', 'Wavenumber (ν̄)', 'spectroscopy nu-bar nu bar wavenumber'),
      s('δ', 'Chemical shift (δ)', 'spectroscopy delta shift nmr'),
      s('J', 'Coupling constant (J)', 'spectroscopy coupling nmr'),
      s('Δ', 'Delta (spectroscopy)', 'spectroscopy delta'),
      s('ppm', 'Parts per million', 'spectroscopy ppm nmr'),
      s('cm⁻¹', 'Wavenumber (cm⁻¹)', 'spectroscopy ir wavenumber cm-1'),
      s('Hz', 'Hertz', 'spectroscopy frequency hz'),
      s('MHz', 'Megahertz', 'spectroscopy frequency mhz nmr'),
      s('GHz', 'Gigahertz', 'spectroscopy frequency ghz'),
      s('λmax', 'λmax', 'spectroscopy lambda max lambda_max'),
      s('νmax', 'νmax', 'spectroscopy nu max nu_max'),
    ]),
  },
  {
    id: 'quantum',
    label: 'Quantum',
    symbols: uniqueByChar([
      s('ψ', 'Wavefunction (ψ)', 'quantum psi wavefunction'),
      s('Ψ', 'Wavefunction (Ψ)', 'quantum psi wavefunction'),
      s('φ', 'Phi (φ)', 'quantum phi'),
      s('Φ', 'Phi (Φ)', 'quantum phi'),
      s('σ', 'Sigma (σ)', 'quantum sigma orbital bonding'),
      s('π', 'Pi (π)', 'quantum pi orbital bonding'),
      s('δ', 'Delta (δ)', 'quantum delta'),
      s('Δ', 'Delta (Δ)', 'quantum delta'),
      s('λ', 'Lambda (λ)', 'quantum lambda'),
      s('ℏ', 'Reduced Planck constant (ℏ)', 'quantum hbar h-bar hbar'),
      s('ħ', 'h-bar (ħ)', 'quantum hbar h-stroke'),
      s('μ', 'Mu (μ)', 'quantum mu dipole'),
      s('ρ', 'Rho (ρ)', 'quantum rho density'),
      s('θ', 'Theta (θ)', 'quantum theta'),
      s('χ', 'Chi (χ)', 'quantum chi electronegativity'),
      s('s', 's orbital', 'quantum orbital s'),
      s('p', 'p orbital', 'quantum orbital p'),
      s('d', 'd orbital', 'quantum orbital d'),
      s('f', 'f orbital', 'quantum orbital f'),
      s('σ*', 'Sigma star (σ*)', 'quantum sigma star antibonding orbital'),
      s('π*', 'Pi star (π*)', 'quantum pi star antibonding orbital'),
    ]),
  },
  {
    id: 'thermo',
    label: 'Thermo',
    symbols: uniqueByChar([
      s('ΔH', 'Enthalpy change (ΔH)', 'thermo enthalpy'),
      s('ΔS', 'Entropy change (ΔS)', 'thermo entropy'),
      s('ΔG', 'Gibbs energy (ΔG)', 'thermo gibbs free energy'),
      s('ΔU', 'Internal energy (ΔU)', 'thermo internal energy'),
      s('ΔA', 'Helmholtz energy (ΔA)', 'thermo helmholtz'),
      s('ΔCp', 'Heat capacity change (ΔCp)', 'thermo heat capacity'),
      s('ΔT', 'Temperature change (ΔT)', 'thermo temperature'),
      s('R', 'Gas constant (R)', 'thermo gas constant'),
      s('q', 'Heat (q)', 'thermo heat'),
      s('w', 'Work (w)', 'thermo work'),
      s('S°', 'Standard entropy (S°)', 'thermo standard entropy'),
      s('H°', 'Standard enthalpy (H°)', 'thermo standard enthalpy'),
      s('G°', 'Standard Gibbs energy (G°)', 'thermo standard gibbs'),
    ]),
  },
  {
    id: 'directions',
    label: 'Directions',
    symbols: uniqueByChar([
      s('↑', 'Up arrow', 'direction up'),
      s('↓', 'Down arrow', 'direction down'),
      s('↗', 'Up-right arrow', 'direction northeast'),
      s('↘', 'Down-right arrow', 'direction southeast'),
      s('↖', 'Up-left arrow', 'direction northwest'),
      s('↙', 'Down-left arrow', 'direction southwest'),
      s('→', 'Right arrow', 'direction right'),
      s('←', 'Left arrow', 'direction left'),
      s('↔', 'Left-right arrow', 'direction both'),
    ]),
  },
  {
    id: 'misc',
    label: 'Misc',
    symbols: uniqueByChar([
      s('·', 'Middle dot (radical / hydrate)', 'misc dot radical'),
      s('•', 'Bullet', 'misc bullet'),
      s('°', 'Degree', 'misc degree'),
      s('′', 'Prime', 'misc prime minutes'),
      s('″', 'Double prime', 'misc double-prime seconds'),
      s('⁻', 'Superscript minus', 'misc superscript minus'),
      s('⁺', 'Superscript plus', 'misc superscript plus'),
      s('δ', 'Delta (δ)', 'misc delta'),
      s('Δ', 'Delta (Δ)', 'misc delta'),
      s('λ', 'Lambda (λ)', 'misc lambda'),
      s('μ', 'Mu (μ)', 'misc mu micro'),
      s('η', 'Eta (η)', 'misc eta viscosity'),
      s('θ', 'Theta (θ)', 'misc theta'),
      s('φ', 'Phi (φ)', 'misc phi'),
      s('χ', 'Chi (χ)', 'misc chi'),
      s('ρ', 'Rho (ρ)', 'misc rho'),
      s('σ', 'Sigma (σ)', 'misc sigma'),
      s('π', 'Pi (π)', 'misc pi'),
      s('≠', 'Not equal', 'misc not-equal'),
      s('∞', 'Infinity', 'misc infinity'),
      s('α', 'Alpha', 'misc alpha'),
      s('β', 'Beta', 'misc beta'),
      s('γ', 'Gamma', 'misc gamma'),
    ]),
  },
];

/** Flat unique-by-character list (first group wins). */
export const CHEM_TEXT_SYMBOLS: ChemTextSymbol[] = uniqueByChar(
  CHEM_TEXT_SYMBOL_GROUPS.flatMap(g => g.symbols),
);

function symbolMatches(symbol: ChemTextSymbol, groupLabel: string, query: string): boolean {
  const hay = [symbol.char, symbol.label, symbol.title, symbol.keywords, groupLabel]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(query);
}

/** Filter grouped symbols by a search query (char, label, title, keywords, group). */
export function filterChemTextSymbolGroups(
  groups: readonly ChemTextSymbolGroup[],
  query: string,
): ChemTextSymbolGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return groups.map(g => ({ ...g, symbols: [...g.symbols] }));
  return groups
    .map(g => ({
      ...g,
      symbols: g.symbols.filter(sym => symbolMatches(sym, g.label, q)),
    }))
    .filter(g => g.symbols.length > 0);
}

/** One-click inserts for reaction arrow reagent fields. */
export const ARROW_CONDITION_CHIPS: ChemTextSymbol[] = [
  { char: 'Δ', label: 'Δ', title: 'Heat' },
  { char: '△', label: '△', title: 'Heat (triangle)' },
  { char: 'ν', label: 'ν', title: 'Light / frequency (hν)' },
  { char: '‡', label: '‡', title: 'Transition state' },
  { char: '°C', label: '°C', title: 'Degrees Celsius' },
];
