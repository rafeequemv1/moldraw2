/** Shared named / hex resolve for chat color recipes. */
const NAMED: Record<string, string> = {
  red: '#dc2626',
  blue: '#2563eb',
  green: '#16a34a',
  orange: '#ea580c',
  purple: '#9333ea',
  yellow: '#ca8a04',
  black: '#0f172a',
  gray: '#64748b',
  grey: '#64748b',
  pink: '#db2777',
  brown: '#92400e',
};

export function resolveNamedHexColor(raw: string, fallback = '#0f172a'): string | null {
  const t = raw.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(t)) return t;
  const named = NAMED[t.toLowerCase()];
  if (named) return named;
  if (/^[0-9A-Fa-f]{6}$/.test(t)) return `#${t}`;
  if (!t) return fallback;
  return null;
}
