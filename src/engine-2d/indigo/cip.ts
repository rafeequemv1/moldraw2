/**
 * Indigo `calculateCip` — R/S and E/Z labels via Ketcher JSON (`ket` format).
 *
 * Returns tags keyed by 0-based atom/bond index matching molblock order.
 * Callers map indices onto the live Molecule (same atom/bond order as
 * moleculeToMolblock).
 */
import type { IndigoKetcher } from './types';
import { getIndigoOrNull, loadIndigo } from './loadIndigo';
import { makeIndigoOptions } from './options';

export interface CipAtomTag {
  atomIndex: number;
  cip: string;
}

export interface CipBondTag {
  bondIndex: number;
  cip: string;
}

export interface CipStereoTags {
  atomStereoTags: CipAtomTag[];
  bondStereoTags: CipBondTag[];
}

const normalizeCip = (raw: unknown): string | null => {
  if (raw == null) return null;
  const s = String(raw).trim().toUpperCase();
  if (!s) return null;
  // Indigo may return "(R)" in S-groups; ket uses bare "R"/"S"/"E"/"Z".
  const bare = s.replace(/[()]/g, '');
  if (bare === 'R' || bare === 'S' || bare === 'E' || bare === 'Z' || bare === 'OR' || bare === 'AND') {
    return bare;
  }
  if (/^[RS]$/.test(bare) || /^[EZ]$/.test(bare)) return bare;
  return bare || null;
};

/** Parse Indigo `ket` JSON from calculateCip into atom/bond CIP tags. */
export const parseCipKetJson = (ketJson: string): CipStereoTags | null => {
  try {
    const root = JSON.parse(ketJson) as {
      root?: { nodes?: Array<{ $ref?: string } | Record<string, unknown>> };
      [key: string]: unknown;
    };
    const atomStereoTags: CipAtomTag[] = [];
    const bondStereoTags: CipBondTag[] = [];

    const molKeys: string[] = [];
    const nodes = root.root?.nodes;
    if (Array.isArray(nodes)) {
      for (const n of nodes) {
        if (n && typeof n === 'object' && '$ref' in n && typeof n.$ref === 'string') {
          molKeys.push(n.$ref);
        }
      }
    }
    if (molKeys.length === 0) {
      for (const k of Object.keys(root)) {
        if (k === 'root') continue;
        const v = root[k];
        if (v && typeof v === 'object' && (v as { type?: string }).type === 'molecule') {
          molKeys.push(k);
        }
      }
    }

    let atomOffset = 0;
    let bondOffset = 0;
    for (const key of molKeys) {
      const mol = root[key] as
        | {
            atoms?: Array<{ cip?: string; stereoLabel?: string }>;
            bonds?: Array<{ cip?: string; atoms?: number[] }>;
          }
        | undefined;
      if (!mol) continue;
      const atoms = mol.atoms ?? [];
      const bonds = mol.bonds ?? [];
      atoms.forEach((a, i) => {
        const cip = normalizeCip(a.cip);
        if (cip) atomStereoTags.push({ atomIndex: atomOffset + i, cip });
      });
      bonds.forEach((b, i) => {
        const cip = normalizeCip(b.cip);
        if (cip) bondStereoTags.push({ bondIndex: bondOffset + i, cip });
      });
      atomOffset += atoms.length;
      bondOffset += bonds.length;
    }

    if (atomStereoTags.length === 0 && bondStereoTags.length === 0) {
      return { atomStereoTags: [], bondStereoTags: [] };
    }
    return { atomStereoTags, bondStereoTags };
  } catch (err) {
    console.warn('[indigo] parseCipKetJson failed', err);
    return null;
  }
};

export const indigoCalculateCip = (
  molblock: string,
  indigo: IndigoKetcher,
): CipStereoTags | null => {
  const trimmed = molblock.trim();
  if (!trimmed) return null;
  const opts = makeIndigoOptions(indigo);
  try {
    const ket = indigo.calculateCip(trimmed, 'ket', opts);
    if (typeof ket !== 'string' || !ket.trim()) return null;
    return parseCipKetJson(ket);
  } catch (err) {
    console.warn('[indigo] calculateCip failed', err);
    return null;
  }
};

export const tryIndigoCalculateCip = async (
  molblock: string,
): Promise<CipStereoTags | null> => {
  const indigo = getIndigoOrNull() ?? (await loadIndigo());
  if (!indigo) return null;
  return indigoCalculateCip(molblock, indigo);
};

/** Map CIP tags onto atom/bond ids using molblock index order. */
export const cipTagsById = (
  tags: CipStereoTags | null | undefined,
  atomIds: readonly string[],
  bondIds: readonly string[],
): { atoms: Map<string, string>; bonds: Map<string, string> } => {
  const atoms = new Map<string, string>();
  const bonds = new Map<string, string>();
  if (!tags) return { atoms, bonds };
  for (const t of tags.atomStereoTags) {
    const id = atomIds[t.atomIndex];
    if (id) atoms.set(id, t.cip);
  }
  for (const t of tags.bondStereoTags) {
    const id = bondIds[t.bondIndex];
    if (id) bonds.set(id, t.cip);
  }
  return { atoms, bonds };
};
