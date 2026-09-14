/**
 * Heuristic: query string is SMILES/SMARTS rather than a common chemical name.
 * Used to avoid stamping raw SMILES as canvas captions after import.
 */
export function looksLikeSmilesNotName(query: string): boolean {
  const t = query.trim();
  if (!t || /\s/.test(t)) return false;
  if (/^\d{2,7}-\d{2}-\d$/.test(t)) return false;
  if (/[=#\[\]\(\)@\\\/+]/.test(t)) return true;
  if (/\d/.test(t)) return true;
  if (/^[A-Za-z][A-Za-z0-9+\-]*$/.test(t) && t.length <= 4) return true;
  return false;
}

/** Caption under imported structures — common names only, never raw SMILES. */
export function defaultImportCompoundName(
  smiles: string,
  explicit?: string,
): string | undefined {
  if (explicit?.trim()) return explicit.trim();
  const t = smiles.trim();
  if (!t || looksLikeSmilesNotName(t)) return undefined;
  return t;
}
