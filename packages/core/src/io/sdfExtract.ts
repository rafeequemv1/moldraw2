/** First structure record from an SDFile (split on `$$$$`). */
export function firstRecordFromSdf(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  const parts = trimmed.split(/\$\$\$\$\s*/);
  const first = parts[0]?.trim() ?? '';
  if (!first) return '';
  if (/M\s+END/i.test(first)) return first;
  return `${first}\nM  END\n`;
}
