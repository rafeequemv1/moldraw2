/**
 * Template library sidebar categories (placeholders; content added per category later).
 * Merged from ChemDraw-style group lists — each id appears once.
 */
export interface TemplateCategory {
  id: string;
  label: string;
  /** Shown as (n) when set; omit for categories without a fixed count yet. */
  count?: number;
  /** Category has insertable templates in the app today. */
  implemented?: boolean;
}

export const TEMPLATE_CATEGORIES: readonly TemplateCategory[] = [
  { id: '3d-templates', label: '3D Templates', count: 20, implemented: true },
  { id: 'ligands', label: 'Ligands', count: 16, implemented: true },
  { id: 'alpha-d-sugars', label: 'α-D-Sugars', count: 21 },
  { id: 'aromatics', label: 'Aromatics', count: 18 },
  { id: 'beta-d-sugars', label: 'β-D-Sugars', count: 22 },
  { id: 'bicycles', label: 'Bicyclics', count: 40 },
  { id: 'bridged-polycyclics', label: 'Bridged Polycyclics', count: 4 },
  { id: 'conformers', label: 'Conformers' },
  { id: 'crown-ethers', label: 'Crown Ethers', count: 12 },
  { id: 'cycloalkanes', label: 'Cycloalkanes' },
  { id: 'd-amino-acids', label: 'D-Amino Acids', count: 20 },
  { id: 'd-sugars', label: 'D-Sugars', count: 21 },
  { id: 'heterocyclic-rings', label: 'Heterocyclic Rings', count: 29 },
  { id: 'l-amino-acids', label: 'L-Amino Acids', count: 20, implemented: true },
  { id: 'nanotubes', label: 'Nanotubes' },
  { id: 'nucleobases', label: 'Nucleobases', count: 12 },
  { id: 'polyhedra', label: 'Polyhedra' },
  { id: 'polypeptides', label: 'Polypeptides' },
  { id: 'rings', label: 'Rings', count: 27 },
  { id: 'solvents', label: 'Solvents' },
  { id: 'sugars', label: 'Sugars', count: 8 },
  { id: 'supramolecules', label: 'Supramolecules' },
] as const;

export type TemplateCategoryId = (typeof TEMPLATE_CATEGORIES)[number]['id'];

export const DEFAULT_TEMPLATE_CATEGORY_ID: TemplateCategoryId = 'l-amino-acids';
