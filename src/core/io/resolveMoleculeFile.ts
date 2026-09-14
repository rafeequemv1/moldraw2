import { cdxmlToMolblock } from './cdxmlToMolblock';
import { firstRecordFromSdf } from './sdfExtract';
import { xyzTextToMolblock } from './xyzToMolblock';
import { nativeSmilesTo2DMolblock } from './smilesToMolblock';
import { resolveSmilesTo2DMolblock } from './resolveSmiles2D';

export type MoleculeFileFormat =
  | 'mol'
  | 'sdf'
  | 'xyz'
  | 'smiles'
  | 'inchi'
  | 'cdxml'
  | 'cdx'
  | 'cml'
  | 'smarts'
  | 'rxn'
  | 'unknown';

export const OPEN_MOLECULE_FILE_ACCEPT =
  '.mol,.mdl,.sdf,.smi,.smiles,.sma,.smarts,.txt,.xyz,.cdxml,.cdx,.cml,.rxn,.inchi';

export interface AsyncMolblockResolver {
  smilesToMolblock: (smiles: string) => Promise<string>;
  /** Worker fallback for exotic SMILES or mol text the native parser rejects. */
  textToMolblock: (text: string) => Promise<string>;
  /**
   * ChemDraw CDXML text or CDX (base64) → molblock via Indigo.
   * Required for reliable .cdx / complex .cdxml open.
   */
  chemDrawToMolblock?: (data: string, format: 'cdxml' | 'cdx') => Promise<string>;
  /**
   * Prefer PubChem precomputed 2D SDF (same depiction as PubChem import).
   * Default true when online; set false for offline-only.
   */
  preferPubChem2D?: boolean;
}

/** True when bytes look like ChemDraw binary CDX (`VjCD` magic). */
export function looksLikeCdxBinary(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  // ASCII "VjCD" at start of many CDX files
  return bytes[0] === 0x56 && bytes[1] === 0x6a && bytes[2] === 0x43 && bytes[3] === 0x44;
}

export function detectMoleculeFileFormat(filename: string, content: string): MoleculeFileFormat {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const head = content.trimStart().slice(0, 200);
  const upperHead = head.toUpperCase();

  if (ext === 'cdx') return 'cdx';
  if (ext === 'cdxml') return 'cdxml';
  if (ext === 'cml') return 'cml';
  if (ext === 'rxn') return 'rxn';
  if (ext === 'sma' || ext === 'smarts') return 'smarts';
  if (ext === 'xml') {
    if (head.includes('<CDXML') || head.includes('<cdxml')) return 'cdxml';
    if (/<cml[\s>]|<molecule[\s>]/i.test(head)) return 'cml';
    return 'unknown';
  }
  if (ext === 'xyz') return 'xyz';
  if (ext === 'sdf' || ext === 'sd') return 'sdf';
  if (ext === 'inchi') return 'inchi';
  if (ext === 'smi' || ext === 'smiles') return 'smiles';
  if (ext === 'mol' || ext === 'mdl') return 'mol';

  if (head.startsWith('InChI=')) return 'inchi';
  if (head.includes('<CDXML') || head.includes('<cdxml')) return 'cdxml';
  if (upperHead.startsWith('$RXN') || upperHead.includes('\n$RXN')) return 'rxn';
  if (/<cml[\s>]|<molecule[\s>]/i.test(head) && !head.includes('<CDXML')) return 'cml';
  if (/^\d+\s*$/m.test(head.split('\n')[0] ?? '') && head.includes('\n')) {
    const second = head.split('\n')[1] ?? '';
    if (/^[A-Za-z]{1,3}\s+[-\d.]/m.test(second)) return 'xyz';
  }
  if (head.includes('V2000') || head.includes('V3000') || /^\s*\d+\s+\d+/m.test(head)) return 'mol';
  if (head.includes('$$$$') || /M\s+END/i.test(head)) return 'sdf';

  const oneLine = content.trim().split(/\r?\n/).filter(Boolean);
  if (oneLine.length === 1 && /^[^<\s].*$/.test(oneLine[0]!) && !oneLine[0]!.includes(' ')) {
    // SMARTS often uses [#6], *, ;, ! — still openable via Indigo convert.
    const s = oneLine[0]!;
    if (/[\[\]*!;$]/.test(s) && !s.includes('>>')) return 'smarts';
    return 'smiles';
  }
  return 'unknown';
}

function normalizeMolText(text: string): string {
  const t = text.trim();
  if (!t) return t;
  if (/M\s+END/i.test(t)) return t;
  return `${t}\nM  END\n`;
}

function extractSmilesFromText(text: string): string {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith('#') && !l.startsWith('SMILES'));
  if (lines.length === 0) return '';
  const first = lines[0]!;
  const tab = first.split(/\s+/);
  return tab[tab.length - 1] ?? first;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Resolve a ChemDraw file (CDXML text or CDX bytes) to a molblock.
 * Prefers Indigo via `chemDrawToMolblock`; falls back to native CDXML parser.
 */
export async function resolveChemDrawToMolblock(
  data: { text?: string; bytes?: Uint8Array },
  filename: string,
  worker?: AsyncMolblockResolver,
): Promise<{ molblock: string; format: 'cdxml' | 'cdx' }> {
  const format = detectMoleculeFileFormat(filename, data.text ?? '') as 'cdxml' | 'cdx' | 'unknown';
  const isCdx =
    format === 'cdx' || (data.bytes != null && looksLikeCdxBinary(data.bytes));

  if (isCdx) {
    if (!data.bytes || data.bytes.length === 0) {
      throw new Error('Empty ChemDraw .cdx file.');
    }
    if (!worker?.chemDrawToMolblock) {
      throw new Error(
        'ChemDraw .cdx needs the structure worker (Indigo). Wait for the engine to load, or Save As → CDXML / .mol in ChemDraw.',
      );
    }
    const b64 = bytesToBase64(data.bytes);
    const mb = await worker.chemDrawToMolblock(b64, 'cdx');
    if (!mb) throw new Error('Could not parse ChemDraw .cdx. Try Save As → CDXML or .mol.');
    return { molblock: mb, format: 'cdx' };
  }

  const xml = data.text?.trim() ?? '';
  if (!xml) throw new Error('Empty ChemDraw CDXML file.');

  // Prefer native CDXML: preserves ChemDraw page coordinates (BondLength-scaled).
  // Indigo convert often collapses multi-fragment cover-art pages.
  // Note: V2000 molblock is null when >999 atoms — callers should use cdxmlToMolecule.
  const native = cdxmlToMolblock(xml);
  if (native) return { molblock: native, format: 'cdxml' };

  throw new Error(
    'CDXML is too large for molfile (999-atom limit) or could not be parsed. Use File → Open (native CDXML import).',
  );
}

export async function resolveMoleculeFileToMolblock(
  content: string,
  filename: string,
  worker?: AsyncMolblockResolver,
): Promise<{ molblock: string; format: MoleculeFileFormat }> {
  const format = detectMoleculeFileFormat(filename, content);

  if (format === 'cdx') {
    throw new Error(
      'Binary ChemDraw (.cdx) must be opened via resolveChemDrawFile (ArrayBuffer). Use File → Open.',
    );
  }

  if (format === 'cdxml') {
    return resolveChemDrawToMolblock({ text: content }, filename, worker);
  }

  if (format === 'xyz') {
    const mb = xyzTextToMolblock(content);
    if (!mb) throw new Error('Could not parse XYZ file.');
    return { molblock: mb, format };
  }

  if (format === 'sdf') {
    const record = firstRecordFromSdf(content);
    if (!record) throw new Error('Empty SD file.');
    return { molblock: normalizeMolText(record), format };
  }

  if (format === 'mol') {
    const mb = normalizeMolText(content);
    if (!mb) throw new Error('Empty molfile.');
    return { molblock: mb, format };
  }

  if (format === 'smiles') {
    const smiles = extractSmilesFromText(content);
    if (!smiles) throw new Error('No SMILES found in file.');
    const preferPubChem = worker?.preferPubChem2D !== false;
    const resolved = await resolveSmilesTo2DMolblock(smiles, {
      offline: !preferPubChem,
      workerSmilesToMolblock: worker?.smilesToMolblock,
    });
    if (resolved) return { molblock: resolved.molblock, format };
    throw new Error(`Could not parse SMILES: ${smiles}`);
  }

  if (format === 'inchi') {
    const inchi = content.trim();
    if (!worker) throw new Error('InChI import requires the structure worker (Indigo).');
    const mb = await worker.textToMolblock(inchi);
    return { molblock: mb, format };
  }

  if (format === 'cml' || format === 'smarts' || format === 'rxn') {
    if (!worker) {
      throw new Error(
        `${format.toUpperCase()} import requires the structure worker (Indigo). Wait for the engine to load.`,
      );
    }
    const mb = await worker.textToMolblock(content.trim());
    if (!mb) throw new Error(`Could not parse ${format.toUpperCase()} file.`);
    return { molblock: mb, format };
  }

  // Last-resort: maybe the content is a bare SMILES string.
  {
    const preferPubChem = worker?.preferPubChem2D !== false;
    const resolved = await resolveSmilesTo2DMolblock(content.trim(), {
      offline: !preferPubChem,
      workerSmilesToMolblock: worker?.smilesToMolblock,
    });
    if (resolved) return { molblock: resolved.molblock, format: 'smiles' };
  }
  {
    const native = nativeSmilesTo2DMolblock(content.trim());
    if (native) return { molblock: native, format: 'unknown' };
  }
  if (worker) {
    try {
      const mb = await worker.textToMolblock(content.trim());
      return { molblock: mb, format: 'unknown' };
    } catch {
      /* fall through */
    }
  }

  throw new Error(
    `Unsupported file type. Use ${OPEN_MOLECULE_FILE_ACCEPT.replace(/\./g, '').split(',').join(', ')}.`,
  );
}

/**
 * Open a File from the OS picker — handles binary .cdx via ArrayBuffer.
 */
export async function resolveMoleculeFileBlobToMolblock(
  file: File,
  worker?: AsyncMolblockResolver,
): Promise<{ molblock: string; format: MoleculeFileFormat }> {
  const name = file.name;
  const ext = name.split('.').pop()?.toLowerCase() ?? '';

  if (ext === 'cdx') {
    const buf = new Uint8Array(await file.arrayBuffer());
    return resolveChemDrawToMolblock({ bytes: buf }, name, worker);
  }

  const text = await file.text();
  if (ext === 'cdxml' || ext === 'xml' || /<CDXML|<cdxml/.test(text)) {
    return resolveChemDrawToMolblock({ text }, name, worker);
  }

  return resolveMoleculeFileToMolblock(text, name, worker);
}
