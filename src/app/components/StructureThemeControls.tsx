import type { ComponentProps } from 'react';
import type { StructureDrawMode } from '@moldraw/canvas';
import { MoldrawCanvasWithPlugins } from '../plugins';
import { useResolvedStructureDrawMode } from '../hooks/useStructureTheme';

type CanvasProps = ComponentProps<typeof MoldrawCanvasWithPlugins>;

/**
 * Resolves the Style-panel theme against installed plugin themes and paints
 * the canvas in the same render. `storedDrawMode` (from settings) is applied
 * immediately so plugin catalog lag cannot flash the skeletal look.
 */
export function CanvasWithResolvedTheme({
  themeId,
  storedDrawMode,
  ...props
}: CanvasProps & {
  themeId: string | undefined;
  storedDrawMode?: StructureDrawMode;
}) {
  const mode = useResolvedStructureDrawMode(themeId, storedDrawMode);
  return <MoldrawCanvasWithPlugins {...props} structureDrawMode={mode} />;
}
