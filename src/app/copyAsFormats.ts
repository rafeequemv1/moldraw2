/**
 * ChemDraw-style “Copy as …” catalog for the top-bar Copy dropdown.
 */
import type { CopyAsFormat } from './types';

export type CopyAsFormatItem = {
  key: CopyAsFormat;
  label: string;
  /**
   * When false, the menu item is shown but disabled (format not exported yet).
   * Biomolecule notations need dedicated serializers beyond small-molecule Indigo.
   */
  available: boolean;
  /** Shown on disabled items. */
  unavailableReason?: string;
};

/** Right-click “Copy as…” flyout — the four formats used when pasting into docs. */
export const CONTEXT_COPY_AS_ITEMS: ReadonlyArray<CopyAsFormatItem> = [
  { key: 'smiles', label: 'SMILES', available: true },
  { key: 'mol_v2000', label: 'MOL', available: true },
  { key: 'png', label: 'PNG', available: true },
  { key: 'svg', label: 'SVG', available: true },
];

export const COPY_AS_FORMAT_ITEMS: ReadonlyArray<CopyAsFormatItem> = [
  { key: 'smiles', label: 'Copy as SMILES', available: true },
  { key: 'mol_v2000', label: 'Copy as MOL V2000', available: true },
  { key: 'png', label: 'Copy as PNG', available: true },
  { key: 'svg', label: 'Copy as SVG', available: true },
  { key: 'cdxml', label: 'Copy as CDXML', available: true },
  {
    key: 'helm',
    label: 'Copy as HELM',
    available: false,
    unavailableReason: 'HELM export is not available yet',
  },
  {
    key: 'fasta',
    label: 'Copy as FASTA',
    available: false,
    unavailableReason: 'FASTA export is not available yet',
  },
  {
    key: 'biln',
    label: 'Copy as BILN',
    available: false,
    unavailableReason: 'BILN export is not available yet',
  },
  { key: 'mol_v3000', label: 'Copy as MOL V3000', available: true },
  {
    key: 'mol_v3000_expanded',
    label: 'Copy as MOL V3000 (Expanded)',
    available: true,
  },
  { key: 'inchi', label: 'Copy as InChI', available: true },
  { key: 'inchi_key', label: 'Copy as InChI Key', available: true },
  {
    key: 'sln',
    label: 'Copy as SLN',
    available: false,
    unavailableReason: 'SLN export is not available yet',
  },
];
