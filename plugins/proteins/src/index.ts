import { definePlugin } from '@moldraw/plugin-sdk';
import { proteinsManifest } from './manifest';
import { ProteinViewerTab } from './ProteinViewerTab';

export default definePlugin({
  manifest: proteinsManifest,

  setup(ctx) {
    ctx.registerInspectorTab({
      id: 'protein-viewer',
      label: 'Protein',
      component: ProteinViewerTab,
    });

    ctx.registerMenu({
      slot: 'file',
      id: 'proteins-import',
      label: 'Import protein (PDB)…',
      title: 'Open the Protein tab in the 3D viewer',
      onClick: () => {
        window.dispatchEvent(new CustomEvent('moldraw:viewer3d-tab', { detail: 'protein-viewer' }));
        ctx.services.ui.showToast('Switch to the Protein tab in the 3D panel to load a PDB.', 'info');
      },
    });

    ctx.registerImporter({
      id: 'proteins-pdb',
      label: 'Protein (PDB)',
      extensions: ['.pdb', '.ent'],
    });
  },

  dispose(ctx) {
    ctx.services.logger.info('Proteins plugin disposed');
  },
});
