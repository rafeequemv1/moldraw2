/**
 * Indigo `check` — ChemDraw-style structure validation (valence, stereo, …).
 * Returns a parsed issue list; empty when Indigo reports no problems.
 */
import type { IndigoKetcher } from './types';
import { getIndigoOrNull, loadIndigo } from './loadIndigo';
import { makeIndigoOptions } from './options';

export const DEFAULT_CHECK_TYPES =
  'valence,stereo,query,overlapping_bonds,load,radical,pseudoatoms,3d,sgroups' as const;

export interface StructureCheckIssue {
  /** Check category (e.g. "valence", "stereo"). */
  type: string;
  message: string;
  /** Optional 0-based atom indices when Indigo provides them. */
  atomIndices?: number[];
  /** Optional 0-based bond indices when Indigo provides them. */
  bondIndices?: number[];
}

export interface StructureCheckResult {
  ok: boolean;
  issues: StructureCheckIssue[];
  /** Raw JSON string from Indigo (for debugging). */
  raw: string;
}

const asMessage = (v: unknown): string => {
  if (typeof v === 'string') return v;
  if (v == null) return '';
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.message === 'string') return o.message;
    if (typeof o.msg === 'string') return o.msg;
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
};

const collectIndices = (v: unknown, keys: string[]): number[] | undefined => {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  for (const k of keys) {
    const arr = o[k];
    if (Array.isArray(arr) && arr.every(x => typeof x === 'number')) {
      return arr as number[];
    }
  }
  return undefined;
};

/** Flatten Indigo check JSON (`{ valence: "...", stereo: [...] }`) into issues. */
export const parseIndigoCheckJson = (raw: string): StructureCheckResult => {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '{}') {
    return { ok: true, issues: [], raw: trimmed || '{}' };
  }
  try {
    const obj = JSON.parse(trimmed) as Record<string, unknown>;
    const issues: StructureCheckIssue[] = [];
    for (const [type, value] of Object.entries(obj)) {
      if (value == null || value === '' || value === false) continue;
      if (Array.isArray(value)) {
        for (const item of value) {
          issues.push({
            type,
            message: asMessage(item) || type,
            atomIndices: collectIndices(item, ['atoms', 'atomIndices', 'atom_indices']),
            bondIndices: collectIndices(item, ['bonds', 'bondIndices', 'bond_indices']),
          });
        }
        continue;
      }
      if (typeof value === 'object') {
        issues.push({
          type,
          message: asMessage(value) || type,
          atomIndices: collectIndices(value, ['atoms', 'atomIndices', 'atom_indices']),
          bondIndices: collectIndices(value, ['bonds', 'bondIndices', 'bond_indices']),
        });
        continue;
      }
      issues.push({ type, message: asMessage(value) || type });
    }
    return { ok: issues.length === 0, issues, raw: trimmed };
  } catch {
    return {
      ok: false,
      issues: [{ type: 'parse', message: trimmed }],
      raw: trimmed,
    };
  }
};

export const indigoCheck = (
  molblock: string,
  indigo: IndigoKetcher,
  types: string = DEFAULT_CHECK_TYPES,
): StructureCheckResult => {
  const trimmed = molblock.trim();
  if (!trimmed) return { ok: true, issues: [], raw: '{}' };
  const opts = makeIndigoOptions(indigo);
  try {
    const raw = indigo.check(trimmed, types, opts);
    return parseIndigoCheckJson(typeof raw === 'string' ? raw : '{}');
  } catch (err) {
    console.warn('[indigo] check failed', err);
    return {
      ok: false,
      issues: [{ type: 'error', message: String(err) }],
      raw: '',
    };
  }
};

export const tryIndigoCheck = async (
  molblock: string,
  types: string = DEFAULT_CHECK_TYPES,
): Promise<StructureCheckResult | null> => {
  const indigo = getIndigoOrNull() ?? (await loadIndigo());
  if (!indigo) return null;
  return indigoCheck(molblock, indigo, types);
};
