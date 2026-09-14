import { definePlugin } from '@moldraw/plugin-sdk';
import { themesManifest } from './manifest';

/**
 * Registers 2D structure themes. Drawing lives in `@moldraw/canvas` so export
 * and the live canvas stay in lock-step; this plugin only unlocks the looks.
 */
export default definePlugin({
  manifest: themesManifest,

  setup(ctx) {
    ctx.registerCanvasTheme({
      id: 'simple',
      label: 'Simple',
      drawMode: 'ball-stick',
    });
    ctx.services.logger.info('Themes plugin ready');
  },

  dispose(ctx) {
    ctx.services.logger.info('Themes plugin disposed');
  },
});
