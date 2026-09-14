/** Reaction scheme layout — mirrors build_reaction_scheme recipe. */
export type ReactionSchemeLayout = 'row' | 'cycle' | 'branch';

export type ReactionCompoundSpec = {
  smiles: string;
  labelBelow?: string;
};

export type ReactionStepSpec = {
  /** Short step title shown in the library detail pane. */
  label: string;
  reagentAbove?: string;
  /** Conditions (solvent, temperature, catalyst) — drawn below the arrow. */
  reagentBelow?: string;
  /** Optional per-step mechanism note. */
  mechanism?: string;
  arrowKind?: string;
};

export type ReactionCategoryId =
  | 'substitution'
  | 'elimination'
  | 'addition'
  | 'carbonyl'
  | 'aromatic'
  | 'oxidation-reduction';

export type ReactionTemplate = {
  id: string;
  name: string;
  /** Short label for cards and top-bar pickers. */
  label: string;
  categoryId: ReactionCategoryId;
  summary: string;
  /** Overall mechanism / notes (markdown-friendly plain text). */
  mechanism?: string;
  layout?: ReactionSchemeLayout;
  compounds: readonly ReactionCompoundSpec[];
  steps: readonly ReactionStepSpec[];
  tags?: readonly string[];
  aliases?: readonly string[];
};

export type ReactionCategory = {
  id: ReactionCategoryId;
  label: string;
  implemented: boolean;
};
