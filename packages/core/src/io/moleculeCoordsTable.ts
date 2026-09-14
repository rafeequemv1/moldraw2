/**
 * Tab-separated coordinate table for canvas world positions (px, Y down).
 */
import type { Atom, Molecule } from '@moldraw/domain';
import { documentFragmentBoxes } from '../align/selectionArrange';
import { expandAtomIdsToObjectCollections } from '../molecule/arrayCollection';
import { collectConnectedComponent } from './localCleanup';
import { projectPerspectiveForDisplay } from '../molecule/perspective3D';
import { syncSruBracketsToAtoms } from '../molecule/mutations';
import { reconcileObjectOutline } from '../molecule/objectOutline';

export type MoleculeCoordsTableOptions = {
  /** Subset of atom ids; default all atoms in the molecule. */
  atomIds?: string[];
  /** Decimal places for x/y (default 2). */
  decimals?: number;
  /** Include internal atom id column (default false). */
  includeAtomIds?: boolean;
};

export type ParsedCoordsTableRow = {
  index?: number;
  element?: string;
  x: number;
  y: number;
  isotope?: number;
  charge?: number;
  alias?: string;
  atomId?: string;
};

export type ParseCoordsTableResult =
  | { ok: true; rows: ParsedCoordsTableRow[] }
  | { ok: false; error: string };

export type ApplyCoordsTableResult = {
  molecule: Molecule;
  applied: number;
  skipped: number;
};

/** Strip BOM / normalize line endings from clipboard text. */
export const normalizeClipboardText = (text: string): string =>
  text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .trim();

/**
 * Atom ids to update when pasting a coordinate table.
 * Expands selection / right-click target to whole object collections (e.g. COF).
 */
export const resolveCoordsPasteAtomIds = (mol: Molecule, seeds: string[]): string[] => {
  if (seeds.length > 0) {
    const conn = new Set<string>();
    for (const id of seeds) {
      for (const a of collectConnectedComponent(mol, [id])) conn.add(a);
    }
    return expandAtomIdsToObjectCollections(mol, [...conn]);
  }

  const boxes = documentFragmentBoxes(mol);
  if (boxes.length === 1) return mol.atoms.map(a => a.id);

  const outline = reconcileObjectOutline(mol);
  const collectionIds = new Set(
    Object.values(outline.parent ?? {}).filter((id): id is string => Boolean(id)),
  );
  if (collectionIds.size === 1 && mol.atoms[0]) {
    return expandAtomIdsToObjectCollections(mol, [mol.atoms[0]!.id]);
  }

  return [];
};

const fmt = (n: number, decimals: number): string => {
  if (!Number.isFinite(n)) return '';
  return n.toFixed(decimals);
};

const atomRow = (
  atom: Atom,
  index: number,
  decimals: number,
  includeAtomIds: boolean,
): string[] => {
  const cols = [
    String(index),
    atom.element,
    fmt(atom.x, decimals),
    fmt(atom.y, decimals),
  ];
  if (atom.isotope != null) cols.push(String(atom.isotope));
  else cols.push('');
  if (atom.charge != null && atom.charge !== 0) cols.push(String(atom.charge));
  else cols.push('');
  const alias = atom.alias?.trim();
  cols.push(alias ?? '');
  if (includeAtomIds) cols.push(atom.id);
  return cols;
};

/**
 * Canvas coordinates as a tab-separated table (paste into Excel / Sheets).
 * Uses perspective-projected positions when `perspective3D` is set (matches on-screen draw).
 */
export const moleculeCoordsTableText = (
  mol: Molecule,
  options: MoleculeCoordsTableOptions = {},
): string => {
  const decimals = options.decimals ?? 2;
  const includeAtomIds = options.includeAtomIds ?? false;
  const displayMol = mol.perspective3D ? projectPerspectiveForDisplay(mol).molecule : mol;
  const idSet = options.atomIds?.length ? new Set(options.atomIds) : null;
  const atoms = displayMol.atoms.filter(a => !idSet || idSet.has(a.id));
  if (atoms.length === 0) return '';

  const header = ['index', 'element', 'x_px', 'y_px', 'isotope', 'charge', 'alias'];
  if (includeAtomIds) header.push('atom_id');

  const lines = [header.join('\t')];
  atoms.forEach((atom, i) => {
    lines.push(atomRow(atom, i + 1, decimals, includeAtomIds).join('\t'));
  });
  return lines.join('\n');
};

const parseNum = (raw: string): number | null => {
  let t = raw.trim().replace(/\u2212/g, '-').replace(/^["']|["']$/g, '');
  if (!t) return null;
  if (/^-?\d+,\d+$/.test(t)) t = t.replace(',', '.');
  else t = t.replace(/,/g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

const parseIntField = (raw: string): number | undefined => {
  const t = raw.trim();
  if (!t) return undefined;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) ? n : undefined;
};

const elementFromLabel = (raw: string): string | undefined => {
  const t = raw.trim();
  if (!t) return undefined;
  const m = /^([A-Z][a-z]?)\d*$/.exec(t);
  return m?.[1];
};

const isSeparatorRow = (cells: string[]): boolean =>
  cells.length > 0 && cells.every(c => /^:?-{2,}:?$/.test(c.trim()));

const splitLine = (line: string): string[] => {
  const trimmed = line.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('|')) {
    return trimmed
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map(c => c.trim());
  }
  if (line.includes('\t')) return line.split('\t').map(c => c.trim());
  if (line.includes(',')) return line.split(',').map(c => c.trim());
  return line.split(/\s+/).map(c => c.trim());
};

type ColMap = {
  index?: number;
  element?: number;
  x?: number;
  y?: number;
  isotope?: number;
  charge?: number;
  alias?: number;
  atomId?: number;
};

const headerCol = (label: string): keyof ColMap | null => {
  const s = label.trim().toLowerCase().replace(/\s+/g, '_');
  if (/^(index|idx|#|no|n)$/.test(s)) return 'index';
  if (/^(element|el|elem|atom|symbol)$/.test(s)) return 'element';
  if (/^(x_px|x|corrected_x|correctedx)$/.test(s)) return 'x';
  if (/^(y_px|y|corrected_y|correctedy)$/.test(s)) return 'y';
  if (/^(isotope|mass)$/.test(s)) return 'isotope';
  if (/^(charge|chg)$/.test(s)) return 'charge';
  if (/^(alias|label)$/.test(s)) return 'alias';
  if (/^(atom_id|atomid|id)$/.test(s)) return 'atomId';
  if (s.includes('corrected') && s.includes('x')) return 'x';
  if (s.includes('corrected') && s.includes('y')) return 'y';
  return null;
};

const buildColMap = (cells: string[]): ColMap | null => {
  const mapped: ColMap = {};
  let pendingX: number | undefined;
  let pendingY: number | undefined;
  let hits = 0;
  cells.forEach((cell, i) => {
    const s = cell.trim().toLowerCase().replace(/\s+/g, '_');
    if (/^(current_x|currentx)$/.test(s)) {
      pendingX = i;
      return;
    }
    if (/^(current_y|currenty)$/.test(s)) {
      pendingY = i;
      return;
    }
    const key = headerCol(cell);
    if (!key) return;
    if (mapped[key] == null) {
      mapped[key] = i;
      hits += 1;
    }
  });
  if (mapped.x == null && pendingX != null) {
    mapped.x = pendingX;
    hits += 1;
  }
  if (mapped.y == null && pendingY != null) {
    mapped.y = pendingY;
    hits += 1;
  }
  if (hits === 0) return null;
  if (mapped.x == null || mapped.y == null) return null;
  return mapped;
};

const inferColMap = (width: number): ColMap => {
  if (width >= 4) return { index: 0, element: 1, x: 2, y: 3 };
  if (width === 3) return { element: 0, x: 1, y: 2 };
  return { x: 0, y: 1 };
};

const rowFromCells = (cells: string[], map: ColMap, rowIndex: number): ParsedCoordsTableRow | null => {
  const pick = (key: keyof ColMap): string => {
    const idx = map[key];
    return idx == null ? '' : (cells[idx] ?? '');
  };

  const x = parseNum(pick('x'));
  const y = parseNum(pick('y'));
  if (x == null || y == null) return null;

  const elementRaw = pick('element');
  const element = elementFromLabel(elementRaw) ?? (elementRaw.trim() || undefined);
  const index = parseIntField(pick('index'));
  const isotope = parseIntField(pick('isotope'));
  const chargeRaw = pick('charge');
  const charge = chargeRaw.trim() ? Number.parseInt(chargeRaw, 10) : undefined;
  const alias = pick('alias').trim() || undefined;
  const atomId = pick('atomId').trim() || undefined;

  return {
    index: index ?? rowIndex,
    element,
    x,
    y,
    isotope,
    charge: Number.isFinite(charge) ? charge : undefined,
    alias,
    atomId,
  };
};

/**
 * Parse a coordinate table copied from Moldraw, Excel, or a markdown pipe table.
 * Preferred format matches {@link moleculeCoordsTableText} (tab-separated).
 */
export const parseMoleculeCoordsTable = (text: string): ParseCoordsTableResult => {
  const normalized = normalizeClipboardText(text);
  const lines = normalized
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith('#'));

  if (lines.length === 0) return { ok: false, error: 'Clipboard is empty' };

  const dataLines: string[][] = [];
  for (const line of lines) {
    const cells = splitLine(line);
    if (cells.length === 0) continue;
    if (isSeparatorRow(cells)) continue;
    dataLines.push(cells);
  }

  if (dataLines.length === 0) return { ok: false, error: 'No coordinate rows found' };

  let colMap = buildColMap(dataLines[0]!);
  let body = dataLines;
  if (colMap) {
    body = dataLines.slice(1);
  } else {
    colMap = inferColMap(dataLines[0]!.length);
  }

  const rows: ParsedCoordsTableRow[] = [];
  for (let i = 0; i < body.length; i++) {
    const row = rowFromCells(body[i]!, colMap, i + 1);
    if (row) rows.push(row);
  }

  if (rows.length === 0) {
    return { ok: false, error: 'No valid x/y coordinate rows found' };
  }
  return { ok: true, rows };
};

const orderedTargetAtoms = (mol: Molecule, atomIds: string[]): Atom[] => {
  const set = new Set(atomIds);
  return mol.atoms.filter(a => set.has(a.id));
};

const matchRowsToAtoms = (
  mol: Molecule,
  atomIds: string[],
  rows: ParsedCoordsTableRow[],
): Map<string, ParsedCoordsTableRow> => {
  const atoms = orderedTargetAtoms(mol, atomIds);
  const byId = new Map(atoms.map(a => [a.id, a]));
  const out = new Map<string, ParsedCoordsTableRow>();
  const usedAtoms = new Set<string>();
  const usedRows = new Set<ParsedCoordsTableRow>();

  const tryAssign = (atomId: string, row: ParsedCoordsTableRow): boolean => {
    if (usedAtoms.has(atomId) || usedRows.has(row)) return false;
    const atom = byId.get(atomId);
    if (!atom) return false;
    if (row.element && row.element !== atom.element) return false;
    out.set(atomId, row);
    usedAtoms.add(atomId);
    usedRows.add(row);
    return true;
  };

  for (const row of rows) {
    if (row.atomId) tryAssign(row.atomId, row);
  }

  for (const row of rows) {
    if (usedRows.has(row)) continue;
    if (row.index == null || row.index < 1 || row.index > atoms.length) continue;
    tryAssign(atoms[row.index - 1]!.id, row);
  }

  let ai = 0;
  for (const row of rows) {
    if (usedRows.has(row)) continue;
    while (ai < atoms.length && usedAtoms.has(atoms[ai]!.id)) ai += 1;
    if (ai >= atoms.length) break;
    tryAssign(atoms[ai]!.id, row);
    ai += 1;
  }

  return out;
};

export type AtomCanvasCoordUpdate = {
  atomId: string;
  x: number;
  y: number;
  isotope?: number;
  charge?: number;
  alias?: string;
};

/** Set absolute canvas x/y (and optional fields) for atoms; keeps perspective pose in sync. */
export const setAtomCanvasCoords = (prev: Molecule, updates: AtomCanvasCoordUpdate[]): Molecule => {
  if (updates.length === 0) return prev;
  const map = new Map(updates.map(u => [u.atomId, u]));
  const atomIds = updates.map(u => u.atomId);
  const pose = prev.perspective3D;

  const patchAtom = (a: Atom): Atom => {
    const u = map.get(a.id);
    if (!u) return a;
    const next: Atom = { ...a, x: u.x, y: u.y };
    if (u.isotope != null) next.isotope = u.isotope;
    if (u.charge != null) next.charge = u.charge;
    if (u.alias != null) next.alias = u.alias;
    return next;
  };

  if (pose) {
    const positions = { ...pose.positions };
    for (const u of updates) {
      const p = positions[u.atomId];
      if (p) positions[u.atomId] = { ...p, x: u.x, y: u.y };
    }
    return syncSruBracketsToAtoms(
      {
        ...prev,
        atoms: prev.atoms.map(patchAtom),
        perspective3D: { ...pose, positions },
      },
      atomIds,
    );
  }

  return syncSruBracketsToAtoms({ ...prev, atoms: prev.atoms.map(patchAtom) }, atomIds);
};

/** Apply parsed rows to a target atom subset (same order as copy export). */
export const applyMoleculeCoordsTable = (
  mol: Molecule,
  rows: ParsedCoordsTableRow[],
  atomIds: string[],
): ApplyCoordsTableResult => {
  const assignments = matchRowsToAtoms(mol, atomIds, rows);
  const updates: AtomCanvasCoordUpdate[] = [];
  for (const [atomId, row] of assignments) {
    updates.push({
      atomId,
      x: row.x,
      y: row.y,
      isotope: row.isotope,
      charge: row.charge,
      alias: row.alias,
    });
  }
  return {
    molecule: setAtomCanvasCoords(mol, updates),
    applied: updates.length,
    skipped: Math.max(0, rows.length - updates.length),
  };
};

const coordLikeLine = (line: string): boolean => {
  const cells = splitLine(line);
  if (cells.length < 2) return false;
  const nums = cells.map(c => parseNum(c)).filter((n): n is number => n != null);
  return nums.length >= 2;
};

/** True when clipboard text is a coordinate table (not SMILES/molfile). */
export const looksLikeCoordsTableText = (text: string): boolean => {
  const normalized = normalizeClipboardText(text);
  if (!normalized) return false;
  if (/^(index|idx|#|atom)\b/i.test(normalized.split('\n')[0] ?? '')) return true;
  if (/\b(x_px|y_px|corrected[_\s]?x|corrected[_\s]?y|current[_\s]?x|current[_\s]?y)\b/i.test(normalized)) {
    return true;
  }
  const lines = normalized.split('\n').filter(l => l.trim().length > 0 && !l.startsWith('#'));
  if (lines.length < 2) return false;
  const body = coordLikeLine(lines[0]!) ? lines : lines.slice(1);
  const hits = body.filter(coordLikeLine).length;
  return hits >= 2 && hits >= Math.floor(body.length * 0.6);
};
