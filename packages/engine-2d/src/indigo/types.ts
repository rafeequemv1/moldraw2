/**
 * Minimal typings for the indigo-ketcher WASM module (jsNoRender / binaryWasmNoRender).
 */
export interface IndigoStringMap {
  set(key: string, value: string): void;
}

export interface IndigoIntVector {
  push_back(v: number): void;
  size(): number;
  get(i: number): number;
}

export interface IndigoKetcher {
  MapStringString: new () => IndigoStringMap;
  VectorInt: new () => IndigoIntVector;
  version(): string;

  /** Layout structure; outputFormat e.g. "molfile". */
  layout(input: string, outputFormat: string, options: IndigoStringMap): string;
  /** Soft clean2d; selectedAtoms usually empty VectorInt. */
  clean2d(
    input: string,
    outputFormat: string,
    options: IndigoStringMap,
    selectedAtoms: IndigoIntVector,
  ): string;
  convert(input: string, outputFormat: string, options: IndigoStringMap): string;
  calculateCip(input: string, outputFormat: string, options: IndigoStringMap): string;
  /** `types` is a comma-separated list (e.g. "valence,stereo") or "". Returns JSON string. */
  check(input: string, types: string, options: IndigoStringMap): string;
  aromatize(input: string, outputFormat: string, options: IndigoStringMap): string;
  dearomatize(input: string, outputFormat: string, options: IndigoStringMap): string;
  /**
   * Fold / unfold hydrogens. `mode`: `"fold"` | `"unfold"` | `"auto"`
   * (auto folds if any explicit H exist, otherwise unfolds).
   */
  convert_explicit_hydrogens(
    input: string,
    mode: string,
    outputFormat: string,
    options: IndigoStringMap,
  ): string;
  automap(input: string, mode: string, outputFormat: string, options: IndigoStringMap): string;
  /**
   * Chemical properties JSON. Signature is
   * `calculate(input, options, selectedAtoms)` — not (input, properties, options).
   */
  calculate(input: string, options: IndigoStringMap, selectedAtoms: IndigoIntVector): string;
  logp(input: string, options: IndigoStringMap): number | string;
  pka(input: string, options: IndigoStringMap): number | string;
  molarRefractivity(input: string, options: IndigoStringMap): number | string;
}

export type IndigoFactory = (moduleArg?: Record<string, unknown>) => Promise<IndigoKetcher>;

/** Common Indigo convert output formats we support. */
export type IndigoConvertFormat =
  | 'molfile'
  | 'smiles'
  | 'inchi'
  | 'inchi-key'
  | 'cml'
  | 'smarts'
  | 'rxnfile'
  | 'ket'
  | 'cdxml'
  /** ChemDraw binary; Indigo accepts/returns base64 for this format. */
  | 'cdx';
