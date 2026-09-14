import type { Molecule } from '@moldraw/domain';

export type StructureDrawMode = 'skeletal' | 'ball-stick';

export function setStructureTheme(
  prev: Molecule,
  input: { themeId: string; drawMode?: StructureDrawMode },
): Molecule {
  const themeId = input.themeId.trim() || 'skeletal';
  const drawMode: StructureDrawMode =
    input.drawMode ??
    (themeId === 'simple' ? 'ball-stick' : themeId === 'skeletal' ? 'skeletal' : prev.structureDrawMode ?? 'skeletal');
  if (prev.structureThemeId === themeId && prev.structureDrawMode === drawMode) return prev;
  return { ...prev, structureThemeId: themeId, structureDrawMode: drawMode };
}
