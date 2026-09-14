import { definePlugin } from '@moldraw/plugin-sdk';
import { spectroscopyManifest } from './manifest';
import { createSpectroscopyTools, registerSpectroscopyAiTools, SPECTROSCOPY_AI_REQUIRED } from './predict';
import { SpectroscopyResultModal } from './SpectroscopyResultModal';

const MENU_ITEMS = [
  { id: 'nmr', label: 'Predict NMR', hint: 'AI ¹H / ¹³C spectrum (selection or canvas)' },
  { id: 'mass', label: 'Predict MASS spectra', hint: 'AI EI mass spectrum' },
  { id: 'uv', label: 'Predict UV', hint: 'AI UV-Vis bands' },
] as const;

export default definePlugin({
  manifest: spectroscopyManifest,

  setup(ctx) {
    const tools = createSpectroscopyTools(ctx.services);

    ctx.registerPanel({
      id: 'spectroscopy-result',
      component: SpectroscopyResultModal,
    });

    registerSpectroscopyAiTools(ctx.services, t => ctx.registerAiTool(t));

    ctx.registerMenu({
      slot: 'chemistry',
      id: 'spectroscopy',
      label: 'Spectroscopy',
      title: 'Spectroscopy predictions',
      items: MENU_ITEMS.map(item => ({
        id: item.id,
        label: item.label,
        title: item.hint,
        onClick: async () => {
          if (!ctx.services.ai.isAvailable()) {
            ctx.services.ui.showToast(SPECTROSCOPY_AI_REQUIRED, 'warning');
            return;
          }
          try {
            if (item.id === 'nmr') await tools.predictNmr('1H');
            else if (item.id === 'mass') await tools.predictMass();
            else await tools.predictUv();
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            ctx.services.ui.showToast(msg, 'error');
            ctx.services.logger.error(msg);
          }
        },
      })),
    });
  },

  dispose(ctx) {
    ctx.services.logger.info('Spectroscopy plugin disposed');
  },
});
