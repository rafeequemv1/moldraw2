/**
 * Per-sheet memory of graphene generator parameters, keyed by the sheet id
 * embedded in atom ids (`gr<sheetId>.v…`). Lets the params panel reopen with
 * the right sliders when a sheet is (re)selected, and lets the Library insert a
 * sheet that the Arrange toolbar can then keep growing incrementally.
 */
import type { Molecule } from '@moldraw/domain';

export type GrapheneSheetParams = {
  cols: number;
  rows: number;
  shape: 'rectangular' | 'circular';
  bondLengthPx: number;
  oxidation: 'none' | 'rgo';
  cx: number;
  cy: number;
};

export const GRAPHENE_DEFAULT_PARAMS: Omit<GrapheneSheetParams, 'cx' | 'cy'> = {
  cols: 4,
  rows: 3,
  shape: 'rectangular',
  bondLengthPx: 40,
  oxidation: 'none',
};

const SHEET_ID_RE = /^gr([0-9a-z]+)\./;

const memory = new Map<string, GrapheneSheetParams>();

export function grapheneSheetIdOf(atomId: string): string | null {
  const m = SHEET_ID_RE.exec(atomId);
  return m ? m[1]! : null;
}

/** Sheet id shared by ALL given atoms (null if empty / mixed / not graphene). */
export function grapheneSheetIdForSelection(atomIds: readonly string[]): string | null {
  if (atomIds.length === 0) return null;
  let sheet: string | null = null;
  for (const id of atomIds) {
    const s = grapheneSheetIdOf(id);
    if (!s) return null;
    if (sheet && s !== sheet) return null;
    sheet = s;
  }
  return sheet;
}

/** Every atom id (carbons + oxygen groups) that belongs to `sheetId`. */
export function grapheneSheetAtomIds(mol: Molecule, sheetId: string): string[] {
  const prefix = `gr${sheetId}.`;
  return mol.atoms.filter(a => a.id.startsWith(prefix)).map(a => a.id);
}

export function rememberGrapheneSheet(atomIds: readonly string[], params: GrapheneSheetParams): void {
  const sheet = atomIds.map(grapheneSheetIdOf).find((s): s is string => Boolean(s));
  if (sheet) memory.set(sheet, params);
}

export function recallGrapheneSheet(sheetId: string): GrapheneSheetParams | null {
  return memory.get(sheetId) ?? null;
}

/**
 * Fallback anchor when the sheet was not generated in this session (e.g. a
 * loaded file): the (0,0) hex is anchored at (cx, cy) and every vertex id
 * encodes its offset from that anchor at 1/50 px resolution.
 */
export function grapheneAnchorFromAtoms(mol: Molecule, sheetId: string): { cx: number; cy: number } | null {
  const prefix = `gr${sheetId}.v`;
  for (const a of mol.atoms) {
    if (!a.id.startsWith(prefix)) continue;
    const key = a.id.slice(prefix.length);
    const [kx, ky] = key.split('_');
    if (kx == null || ky == null) continue;
    const parse = (s: string) => (s.startsWith('m') ? -Number(s.slice(1)) : Number(s)) / 50;
    const dx = parse(kx);
    const dy = parse(ky);
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) continue;
    return { cx: a.x - dx, cy: a.y - dy };
  }
  return null;
}
