/**
 * 3D viewer export formats (same set as Viewer3DExportBar).
 */
import type { Viewer3DExportFormat } from '@moldraw/viewer-3d';

export type Export3DFormat = Viewer3DExportFormat;

export const EXPORT_3D_FORMAT_ITEMS: ReadonlyArray<{
  key: Export3DFormat;
  label: string;
  ext: string;
}> = [
  { key: 'glb', label: 'GLB (3D mesh)', ext: '.glb' },
  { key: 'png', label: 'PNG image', ext: '.png' },
  { key: 'jpg', label: 'JPEG image', ext: '.jpg' },
  { key: 'sdf', label: 'SDF (3D coords)', ext: '.sdf' },
  { key: 'xyz', label: 'XYZ', ext: '.xyz' },
  { key: 'x3d', label: 'X3D', ext: '.x3d' },
  { key: 'obj', label: 'OBJ mesh', ext: '.obj' },
];
