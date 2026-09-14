import { useMemo } from 'react';
import {
  listStructureThemes,
  resolveStructureDrawMode,
  type CanvasStructureTheme,
  type StructureDrawMode,
} from '@moldraw/canvas';
import { usePluginHostOptional } from '../plugins/PluginHostProvider';

/** Survives plugin-host reloads so the Style dropdown does not drop plugin themes. */
let cachedPluginThemes: CanvasStructureTheme[] = [];

export function useInstalledStructureThemes(): CanvasStructureTheme[] {
  const ctx = usePluginHostOptional();
  const extras = ctx?.contributions.canvasThemes ?? [];
  if (extras.length > 0) cachedPluginThemes = extras;
  const list = extras.length > 0 ? extras : cachedPluginThemes;
  const extraKey = list.map(t => t.id).join('|');
  return useMemo(
    () => listStructureThemes(list),
    // extras array identity is new every host render; key is the stable signal
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx?.revision, extraKey],
  );
}

export function useResolvedStructureDrawMode(
  themeId: string | undefined,
  storedDrawMode?: StructureDrawMode,
): StructureDrawMode {
  const themes = useInstalledStructureThemes();
  const fromCatalog = useMemo(
    () => resolveStructureDrawMode(themeId, themes),
    [themeId, themes],
  );
  const known = !themeId || themes.some(t => t.id === themeId);
  if (known) return fromCatalog;
  return storedDrawMode ?? fromCatalog;
}
