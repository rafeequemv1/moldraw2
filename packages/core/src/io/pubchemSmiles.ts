import { withPubChemThrottle } from './pubchemRateLimit';
import { firstRecordFromSdf } from './sdfExtract';

const PUBCHEM = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug';
const CAS_PATTERN = /^\d{2,7}-\d{2}-\d$/;

const firstMolblockFromSdf = (sdfText: string): string | null => {
  const first = firstRecordFromSdf(sdfText) ?? sdfText.split('$$$$')[0]?.trim() ?? '';
  if (first && (first.includes('V2000') || first.includes('V3000'))) return first;
  return null;
};

async function fetchSdf(url: string): Promise<string | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  return firstMolblockFromSdf(await res.text());
}

function firstCid(data: unknown): number | null {
  const cidField = (data as { IdentifierList?: { CID?: number | number[] } })?.IdentifierList?.CID;
  if (cidField == null) return null;
  return Array.isArray(cidField) ? (cidField[0] ?? null) : cidField;
}

/**
 * Fetch compound SDF (2D) from PubChem by CID, or null if not found.
 * Prefers the same precomputed depiction as PubChem’s structure view.
 */
export async function pubchemMolblockFromCid(cid: number): Promise<string | null> {
  if (!Number.isFinite(cid) || cid <= 0) return null;
  return withPubChemThrottle(async () => {
    try {
      return await fetchSdf(
        `${PUBCHEM}/compound/cid/${Math.trunc(cid)}/SDF?record_type=2d`,
      );
    } catch {
      return null;
    }
  });
}

/**
 * Fetch first compound SDF (2D) from PubChem by SMILES, or null if not found.
 * PubChem SDF includes precomputed 2D coordinates — the same depiction used
 * when importing from PubChem search.
 */
export async function pubchemMolblockFromSmiles(smiles: string): Promise<string | null> {
  return withPubChemThrottle(async () => {
    try {
      return await fetchSdf(`${PUBCHEM}/compound/smiles/${encodeURIComponent(smiles)}/SDF`);
    } catch {
      return null;
    }
  });
}

/**
 * Fetch first compound SDF (2D) from PubChem by common name or CAS.
 */
export async function pubchemMolblockFromName(name: string): Promise<string | null> {
  const term = name.trim();
  if (!term) return null;
  return withPubChemThrottle(async () => {
    try {
      if (CAS_PATTERN.test(term)) {
        const byCas = await fetchSdf(
          `${PUBCHEM}/compound/xref/RN/${encodeURIComponent(term)}/SDF`,
        );
        if (byCas) return byCas;
      }

      // Direct name → SDF (works for most simple names).
      const direct = await fetchSdf(`${PUBCHEM}/compound/name/${encodeURIComponent(term)}/SDF`);
      if (direct) return direct;

      // Names with odd characters: resolve CID via ?name=, then SDF by CID.
      const cidRes = await fetch(
        `${PUBCHEM}/compound/name/cids/JSON?name=${encodeURIComponent(term)}&MaxRecords=1`,
      );
      if (!cidRes.ok) return null;
      const cid = firstCid(await cidRes.json());
      if (cid == null) return null;
      return await fetchSdf(`${PUBCHEM}/compound/cid/${cid}/SDF?record_type=2d`);
    } catch {
      return null;
    }
  });
}

/** True when the query is more likely a compound name / CAS than a SMILES. */
export function looksLikeCompoundName(query: string): boolean {
  const t = query.trim();
  if (!t) return false;
  if (/^\d{2,7}-\d{2}-\d$/.test(t)) return true;
  if (/[=#\[\]\(\)@\\\/+]/.test(t)) return false;
  if (/\d/.test(t)) return false;
  return /^[A-Za-z][A-Za-z\s\-'.]{1,80}$/.test(t);
}

/**
 * Resolve SMILES **or** common name / CAS to a PubChem 2D molblock.
 * Tries the appropriate endpoint first, then the other.
 */
export async function pubchemMolblockFromSmilesOrName(query: string): Promise<string | null> {
  const q = query.trim();
  if (!q) return null;

  if (/^\d+$/.test(q)) {
    const cid = Number.parseInt(q, 10);
    if (Number.isFinite(cid) && cid > 0) {
      const byCid = await pubchemMolblockFromCid(cid);
      if (byCid) return byCid;
    }
  }

  if (looksLikeCompoundName(q)) {
    const byName = await pubchemMolblockFromName(q);
    if (byName) return byName;
    return pubchemMolblockFromSmiles(q);
  }
  const bySmiles = await pubchemMolblockFromSmiles(q);
  if (bySmiles) return bySmiles;
  return pubchemMolblockFromName(q);
}

/**
 * Fetch first compound SDF with PubChem's precomputed 3D coordinates by SMILES.
 * Returns null when PubChem has no 3D conformer for the compound.
 */
export async function pubchem3dMolblockFromSmiles(smiles: string): Promise<string | null> {
  return withPubChemThrottle(async () => {
    try {
      return await fetchSdf(
        `${PUBCHEM}/compound/smiles/${encodeURIComponent(smiles)}/SDF?record_type=3d`,
      );
    } catch {
      return null;
    }
  });
}
