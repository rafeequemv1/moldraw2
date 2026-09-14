/**
 * Optional 3D viewer peer — 3dmol panel, surfaces, OCL conformer gallery / MMFF94.
 *
 * Import rule: only App (product chrome) should mount this. Canvas/domain must not.
 */
export { Molecule3DPanel, type Viewer3DComputeStatus } from './Molecule3DPanel';
export type { Molecule3DPanelProps } from './Molecule3DPanel';
