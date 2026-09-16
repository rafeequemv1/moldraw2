import { createAspirinMolecule } from './aspirinPreviewMolecule';
import { MoleculePreviewCanvas } from './MoleculePreviewCanvas';
import type { AppSettings } from './types';

/**
 * Aspirin thumbnail using the same draw pipeline and resolved prefs as the
 * canvas. Geometry is scaled to the preset bond length; the view is zoomed to
 * fit (like canvas zoom) so stroke/font ratios stay faithful.
 */
export function StylePresetPreview({
  settings,
  width = 220,
  height = 140,
}: {
  settings: AppSettings;
  width?: number;
  height?: number;
}) {
  return <MoleculePreviewCanvas settings={settings} molecule={createAspirinMolecule()} width={width} height={height} />;
}
