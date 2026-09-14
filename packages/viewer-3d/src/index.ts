/**
 * Optional 3D viewer peer — 3dmol panel, surfaces, OCL conformer gallery / MMFF94.
 *
 * Import rule: only App (product chrome) should mount this. Canvas/domain must not.
 */
export { Molecule3DPanel, type Viewer3DComputeStatus } from './Molecule3DPanel';
export type { Molecule3DPanelProps } from './Molecule3DPanel';
export { Viewer3DExportBar, exportViewer3D, captureViewerImage } from './export';
export type { Viewer3DExportFormat, Viewer3DExportViewer } from './export';
export { create3DmolViewer, disposeViewerHost } from './create3DmolViewer';
export type { Viewer3DHandle } from './create3DmolViewer';
