export type StructureDrawMode = 'skeletal' | 'ball-stick';

/** A named 2D structure look. Built-in Default plus plugin-contributed themes. */
export interface CanvasStructureTheme {
  id: string;
  label: string;
  drawMode: StructureDrawMode;
}

export const SKELETAL_THEME_ID = 'skeletal';

export const BUILTIN_STRUCTURE_THEMES: readonly CanvasStructureTheme[] = [
  { id: SKELETAL_THEME_ID, label: 'Default', drawMode: 'skeletal' },
  { id: 'simple', label: 'Simple', drawMode: 'ball-stick' },
];

export function resolveStructureDrawMode(
  themeId: string | undefined,
  extraThemes: readonly Pick<CanvasStructureTheme, 'id' | 'drawMode'>[] = [],
): StructureDrawMode {
  if (!themeId || themeId === SKELETAL_THEME_ID) return 'skeletal';
  const found =
    extraThemes.find(t => t.id === themeId) ??
    BUILTIN_STRUCTURE_THEMES.find(t => t.id === themeId);
  return found?.drawMode ?? 'skeletal';
}

export function listStructureThemes(
  extraThemes: readonly CanvasStructureTheme[] = [],
): CanvasStructureTheme[] {
  const seenIds = new Set<string>(BUILTIN_STRUCTURE_THEMES.map(t => t.id));
  const seenLabels = new Set<string>(BUILTIN_STRUCTURE_THEMES.map(t => t.label.toLowerCase()));
  const extras: CanvasStructureTheme[] = [];
  for (const t of extraThemes) {
    const labelKey = t.label.trim().toLowerCase();
    if (seenIds.has(t.id) || seenLabels.has(labelKey)) continue;
    seenIds.add(t.id);
    seenLabels.add(labelKey);
    extras.push(t);
  }
  return [...BUILTIN_STRUCTURE_THEMES, ...extras];
}
