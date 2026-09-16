import { AMINO_ACID_TEMPLATES, type AminoAcidTemplate } from './aminoAcids';
import { FUNCTIONAL_GROUP_TEMPLATES, type FunctionalGroupTemplate } from '../functionalGroups';
import { LIGAND_TEMPLATES, type LigandTemplate } from '../ligands';
import { STRUCTURE_3D_TEMPLATES, type Structure3DTemplate } from './structures3d';
import type { TemplateCategoryId } from './categories';

export type TemplateSearchHit =
  | { kind: 'amino'; categoryId: 'l-amino-acids'; amino: AminoAcidTemplate }
  | { kind: 'functional_group'; categoryId: 'r-groups'; group: FunctionalGroupTemplate }
  | { kind: 'ligand'; categoryId: 'ligands'; ligand: LigandTemplate }
  | { kind: 'structure3d'; categoryId: '3d-templates'; structure: Structure3DTemplate };

/** Implemented templates searchable from the library modal (extend as categories ship). */
export function searchImplementedTemplates(query: string): TemplateSearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: TemplateSearchHit[] = [];
  for (const amino of AMINO_ACID_TEMPLATES) {
    if (amino.code.toLowerCase().includes(q) || amino.name.toLowerCase().includes(q)) {
      hits.push({ kind: 'amino', categoryId: 'l-amino-acids', amino });
    }
  }
  for (const group of FUNCTIONAL_GROUP_TEMPLATES) {
    if (group.id.toLowerCase().includes(q) || group.label.toLowerCase().includes(q)) {
      hits.push({ kind: 'functional_group', categoryId: 'r-groups', group });
    }
  }
  for (const ligand of LIGAND_TEMPLATES) {
    if (
      ligand.id.toLowerCase().includes(q) ||
      ligand.label.toLowerCase().includes(q) ||
      ligand.name.toLowerCase().includes(q)
    ) {
      hits.push({ kind: 'ligand', categoryId: 'ligands', ligand });
    }
  }
  for (const structure of STRUCTURE_3D_TEMPLATES) {
    if (
      structure.id.toLowerCase().includes(q) ||
      structure.label.toLowerCase().includes(q) ||
      structure.name.toLowerCase().includes(q)
    ) {
      hits.push({ kind: 'structure3d', categoryId: '3d-templates', structure });
    }
  }
  return hits;
}

export function categoryHasTemplateMatch(categoryId: TemplateCategoryId, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  if (categoryId === 'l-amino-acids') {
    return AMINO_ACID_TEMPLATES.some(
      t => t.code.toLowerCase().includes(q) || t.name.toLowerCase().includes(q),
    );
  }
  if (categoryId === 'r-groups') {
    return FUNCTIONAL_GROUP_TEMPLATES.some(
      t => t.id.toLowerCase().includes(q) || t.label.toLowerCase().includes(q),
    );
  }
  if (categoryId === 'ligands') {
    return LIGAND_TEMPLATES.some(
      t =>
        t.id.toLowerCase().includes(q) ||
        t.label.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q),
    );
  }
  if (categoryId === '3d-templates') {
    return STRUCTURE_3D_TEMPLATES.some(
      t =>
        t.id.toLowerCase().includes(q) ||
        t.label.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q),
    );
  }
  return false;
}
