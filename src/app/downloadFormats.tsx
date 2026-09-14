/**
 * Shared download / Save as format catalog for File, Export, and context menus.
 */
import type { ReactNode } from 'react';
import {
  Image as ImageIcon,
  FileImage,
  FileCode2,
  FileText,
  ScrollText,
  Atom as AtomIcon,
} from 'lucide-react';
import type { DownloadFormat } from './types';

export type DownloadFormatItem = {
  key: DownloadFormat;
  label: string;
  /** Short extension hint for File → Save as. */
  ext: string;
  icon: (size?: number) => ReactNode;
};

export const DOWNLOAD_FORMAT_ITEMS: ReadonlyArray<DownloadFormatItem> = [
  {
    key: 'png',
    label: 'PNG',
    ext: '.png',
    icon: s => <ImageIcon size={s ?? 13} strokeWidth={2} color="#475569" />,
  },
  {
    key: 'png_white',
    label: 'PNG (white)',
    ext: '.png',
    icon: s => <ImageIcon size={s ?? 13} strokeWidth={2} color="#475569" />,
  },
  {
    key: 'jpeg',
    label: 'JPEG',
    ext: '.jpg',
    icon: s => <FileImage size={s ?? 13} strokeWidth={2} color="#475569" />,
  },
  {
    key: 'svg',
    label: 'SVG',
    ext: '.svg',
    icon: s => <FileCode2 size={s ?? 13} strokeWidth={2} color="#475569" />,
  },
  {
    key: 'pdf',
    label: 'PDF',
    ext: '.pdf',
    icon: s => <FileText size={s ?? 13} strokeWidth={2} color="#475569" />,
  },
  {
    key: 'mol',
    label: 'Molfile',
    ext: '.mol',
    icon: s => <ScrollText size={s ?? 13} strokeWidth={2} color="#475569" />,
  },
  {
    key: 'cdxml',
    label: 'ChemDraw XML',
    ext: '.cdxml',
    icon: s => <FileCode2 size={s ?? 13} strokeWidth={2} color="#475569" />,
  },
  {
    key: 'cdx',
    label: 'ChemDraw binary',
    ext: '.cdx',
    icon: s => <FileCode2 size={s ?? 13} strokeWidth={2} color="#475569" />,
  },
  {
    key: 'smiles',
    label: 'SMILES',
    ext: '.smi',
    icon: s => <AtomIcon size={s ?? 13} strokeWidth={2} color="#475569" />,
  },
  {
    key: 'smarts',
    label: 'SMARTS',
    ext: '.sma',
    icon: s => <AtomIcon size={s ?? 13} strokeWidth={2} color="#475569" />,
  },
  {
    key: 'cml',
    label: 'CML',
    ext: '.cml',
    icon: s => <FileCode2 size={s ?? 13} strokeWidth={2} color="#475569" />,
  },
  {
    key: 'rxn',
    label: 'Reaction',
    ext: '.rxn',
    icon: s => <ScrollText size={s ?? 13} strokeWidth={2} color="#475569" />,
  },
  {
    key: 'inchi',
    label: 'InChI',
    ext: '.inchi',
    icon: s => <AtomIcon size={s ?? 13} strokeWidth={2} color="#475569" />,
  },
];

/** File → Save as submenu: chemical exchange first, then images. Native .moldraw is File → Save Moldraw. */
const SAVE_AS_CHEM_KEYS = new Set<DownloadFormat>([
  'mol',
  'cdxml',
  'cdx',
  'smiles',
  'smarts',
  'cml',
  'rxn',
  'inchi',
]);

export const FILE_SAVE_AS_MENU_ITEMS: ReadonlyArray<DownloadFormatItem> = [
  ...DOWNLOAD_FORMAT_ITEMS.filter(item => SAVE_AS_CHEM_KEYS.has(item.key)),
  ...DOWNLOAD_FORMAT_ITEMS.filter(item => !SAVE_AS_CHEM_KEYS.has(item.key)),
];
