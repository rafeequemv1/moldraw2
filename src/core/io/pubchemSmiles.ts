import { withPubChemThrottle } from './pubchemRateLimit';
import { firstRecordFromSdf } from './sdfExtract';

const PUBCHEM = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug';

const firstMolblockFromSdf = (sdfText: string): string | null => {
  const first = firstRecordFromSdf(sdfText) ?? sdfText.split('$$$$')[0]?.trim() ?? '';
  if (first && (first.includes('V2000') || first.includes('V3000'))) return first;
  return null;
};

/**
 * Fetch first compound SDF (2D) from PubChem by SMILES, or null if not found.
 * PubChem SDF includes precomputed 2D coordinates — the same depiction used
 * when importing from PubChem search.
 */
export async function pubchemMolblockFromSmiles(smiles: string): Promise<string | null> {
  return withPubChemThrottle(async () => {
    try {
      const res = await fetch(`${PUBCHEM}/compound/smiles/${encodeURIComponent(smiles)}/SDF`);
      if (!res.ok) return null;
      const txt = await res.text();
      return firstMolblockFromSdf(txt);
    } catch {
      return null;
    }
  });
}

/**
 * Fetch first compound SDF with PubChem's precomputed 3D coordinates by SMILES.
 * Returns null when PubChem has no 3D conformer for the compound.
 */
export async function pubchem3dMolblockFromSmiles(smiles: string): Promise<string | null> {
  return withPubChemThrottle(async () => {
    try {
      const url = `${PUBCHEM}/compound/smiles/${encodeURIComponent(smiles)}/SDF?record_type=3d`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const txt = await res.text();
      return firstMolblockFromSdf(txt);
    } catch {
      return null;
    }
  });
}
