/** Local UI types used by App.tsx and its children. */
import type { AbbrevTemplate } from '@moldraw/domain';

export type AliasSuggestionItem = {
  value: string;
  key?: string;
  category?: 'alkyl' | 'aryl' | 'protecting_group' | 'functional';
  preview?: AbbrevTemplate['preview'];
  custom?: boolean;
};

/** Formats supported by the Export menu. */
export type DownloadFormat =
  | 'png'
  | 'png_white'
  | 'jpeg'
  | 'svg'
  | 'pdf'
  | 'smiles'
  | 'mol'
  | 'cdxml'
  | 'cdx'
  | 'inchi'
  | 'smarts'
  | 'cml'
  | 'rxn';

/** Formats in the top-bar Copy dropdown (ChemDraw-style “Copy as …”). */
export type CopyAsFormat =
  | 'cdxml'
  | 'helm'
  | 'fasta'
  | 'biln'
  | 'smiles'
  | 'mol_v3000'
  | 'mol_v3000_expanded'
  | 'mol_v2000'
  | 'inchi'
  | 'inchi_key'
  | 'sln'
  | 'svg'
  | 'png';
