/**
 * Deep-link seeds the editor hydrates on load:
 * `/?smiles=` `/?reaction=` `/?mol=` `/?cdxml=` `/?inchi=`
 * and the same keys in the URL hash (hash is not sent to the server — used for
 * large molfiles from the Mathpix Chrome plugin).
 */

export type EditorSeedQuery = {
  smiles: string | null;
  reaction: string | null;
  mol: string | null;
  cdxml: string | null;
  inchi: string | null;
};

function firstParam(search: URLSearchParams, hash: URLSearchParams, keys: string[]): string | null {
  for (const key of keys) {
    const value = search.get(key)?.trim() || hash.get(key)?.trim();
    if (value) return value;
  }
  return null;
}

function hashSearchParams(hash: string): URLSearchParams {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return new URLSearchParams();
  if (raw.includes('=')) return new URLSearchParams(raw);
  return new URLSearchParams();
}

export function parseEditorSeedFromLocation(
  search = typeof window === 'undefined' ? '' : window.location.search,
  hash = typeof window === 'undefined' ? '' : window.location.hash,
): EditorSeedQuery {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const hashParams = hashSearchParams(hash);
  return {
    smiles: firstParam(params, hashParams, ['smiles']),
    reaction: firstParam(params, hashParams, ['reaction']),
    mol: firstParam(params, hashParams, ['mol', 'molfile', 'sdf']),
    cdxml: firstParam(params, hashParams, ['cdxml']),
    inchi: firstParam(params, hashParams, ['inchi']),
  };
}

export function editorSeedHasStructure(seed: EditorSeedQuery): boolean {
  return Boolean(seed.smiles || seed.reaction || seed.mol || seed.cdxml || seed.inchi);
}

export function urlHasEditorSeedQuery(): boolean {
  if (typeof window === 'undefined') return false;
  return editorSeedHasStructure(parseEditorSeedFromLocation());
}
