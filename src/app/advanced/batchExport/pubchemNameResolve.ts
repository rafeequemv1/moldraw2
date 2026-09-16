import { looksLikeCompoundName, pubchemFetch } from '@moldraw/core/io/pubchemSmiles';
import { withPubChemThrottle } from './pubchemRateLimit';

const PUBCHEM_BASE = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug';
const CAS_PATTERN = /^\d{2,7}-\d{2}-\d$/;

/** True when the query is more likely SMILES than a compound name / CAS. */
export function looksLikeSmiles(term: string): boolean {
  const t = term.trim();
  if (!t) return false;
  if (/[=\[\]\(\)@#\\\/]/.test(t)) return true;
  if (/^[BCNOPSFIbcnops]\d/.test(t)) return true;
  if (!/\s/.test(t) && /[cnosp]\d/i.test(t)) return true;
  if (looksLikeCompoundName(t)) return false;
  return false;
}

export function isCasNumber(raw: string): boolean {
  const t = raw.trim();
  if (!CAS_PATTERN.test(t)) return false;
  const digits = t.replace(/-/g, '');
  const check = Number(digits.at(-1));
  const body = digits.slice(0, -1).split('').reverse().map(Number);
  const sum = body.reduce((acc, n, i) => acc + n * (i + 1), 0);
  return sum % 10 === check;
}

function buildNameVariants(raw: string): string[] {
  const t = raw.normalize('NFKC').replace(/\u200b/g, '').trim();
  if (!t) return [];
  const out: string[] = [];
  const add = (s: string) => {
    const x = s.trim();
    if (x && !out.includes(x)) out.push(x);
  };
  add(t);
  const m = t.match(/^(.+?)\s*\(([^)]{1,120})\)\s*$/);
  if (m?.[1] && m[2] && !/\d/.test(m[2])) {
    add(m[1].trim());
  }
  return out;
}

function normalizeCidList(data: unknown): number[] {
  const cidField = (data as { IdentifierList?: { CID?: number | number[] } })?.IdentifierList?.CID;
  if (cidField == null) return [];
  return Array.isArray(cidField) ? cidField : [cidField];
}

const fetchCidsFromUrl = async (url: string, maxRecords: number): Promise<number[]> => {
  const res = await pubchemFetch(url);
  if (!res.ok) return [];
  return normalizeCidList(await res.json()).slice(0, maxRecords);
};

export async function fetchCidsForPubChemTerm(rawTerm: string, maxRecords = 28): Promise<number[]> {
  const term = rawTerm.trim();
  if (!term) return [];

  // Numeric PubChem CID (e.g. 2244 for aspirin).
  if (/^\d+$/.test(term)) {
    const cid = Number.parseInt(term, 10);
    if (Number.isFinite(cid) && cid > 0) return [cid];
  }

  return withPubChemThrottle(async () => {
    if (isCasNumber(term)) {
      return fetchCidsFromUrl(
        `${PUBCHEM_BASE}/compound/xref/RN/${encodeURIComponent(term)}/cids/JSON?MaxRecords=${maxRecords}`,
        maxRecords,
      );
    }

    if (looksLikeSmiles(term)) {
      const bySmiles = await fetchCidsFromUrl(
        `${PUBCHEM_BASE}/compound/smiles/${encodeURIComponent(term)}/cids/JSON?MaxRecords=${maxRecords}`,
        maxRecords,
      );
      if (bySmiles.length > 0) return bySmiles;
    }

    for (const variant of buildNameVariants(term)) {
      const cids = await fetchCidsFromUrl(
        `${PUBCHEM_BASE}/compound/name/${encodeURIComponent(variant)}/cids/JSON?MaxRecords=${maxRecords}`,
        maxRecords,
      );
      if (cids.length > 0) return cids;
    }

    return [];
  });
}

type PubChemSmilesProperty = {
  IsomericSMILES?: string;
  CanonicalSMILES?: string;
  SMILES?: string;
  ConnectivitySMILES?: string;
};

/** PubChem property rows vary by compound; many only expose `SMILES`. */
export function smilesFromPubChemProperty(p: PubChemSmilesProperty | undefined): string | undefined {
  if (!p) return undefined;
  const smi =
    p.IsomericSMILES ||
    p.CanonicalSMILES ||
    p.SMILES ||
    p.ConnectivitySMILES;
  return typeof smi === 'string' && smi.trim() ? smi.trim() : undefined;
}

/** PubChem REST: SMILES for a CID. */
export async function fetchSmilesForCid(cid: number): Promise<string | undefined> {
  return withPubChemThrottle(async () => {
    const res = await pubchemFetch(
      `${PUBCHEM_BASE}/compound/cid/${cid}/property/IsomericSMILES,CanonicalSMILES,SMILES,ConnectivitySMILES/JSON`,
    );
    if (!res.ok) return undefined;
    const data = await res.json();
    const p = data?.PropertyTable?.Properties?.[0] as PubChemSmilesProperty | undefined;
    return smilesFromPubChemProperty(p);
  });
}

/**
 * Map a compound string (e.g. autocomplete suggestion) to the first CID + SMILES.
 * Uses `.../compound/name/cids/JSON?name=` so characters like `/` in names do not break path URLs.
 */
export async function resolveCompoundNameFromPubChem(
  rawName: string,
): Promise<{ cid: number; smiles: string } | null> {
  for (const name of buildNameVariants(rawName)) {
    const hit = (await fetchCidsForPubChemTerm(name, 8))[0] ?? null;
    if (hit == null) continue;
    const smiles = (await fetchSmilesForCid(hit))?.trim();
    if (smiles) return { cid: hit, smiles };
  }
  return null;
}
