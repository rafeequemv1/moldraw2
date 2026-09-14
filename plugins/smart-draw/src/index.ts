import { definePlugin, type CanvasToolInput, type PluginSetupContext } from '@moldraw/plugin-sdk';
import { toMergeSketch } from './convert/toMergeSketch';
import { smartDrawManifest } from './manifest';
import { SmartDrawPreview } from './overlay/SmartDrawPreview';
import { recognizeSketch, shouldCommit } from './recognize/recognizeSketch';

function handleStrokes(input: CanvasToolInput, ctx: PluginSetupContext): void {
  if (input.strokes.length === 0) return;

  const mol = ctx.services.document.getMolecule() as {
    atoms?: { id: string; x: number; y: number; element: string }[];
  };
  const result = recognizeSketch({
    strokes: input.strokes,
    bondLengthPx: input.bondLengthPx,
    molecule: { atoms: mol.atoms ?? [] },
  });

  if (shouldCommit(result)) {
    ctx.services.commands.execute('molecule.mergeSketch', toMergeSketch(result.graph));
    ctx.services.commands.execute('molecule.cleanup', { bondLengthPx: input.bondLengthPx });
    for (const stroke of result.rejectedStrokes) {
      if (stroke.points.length < 2) continue;
      ctx.services.commands.execute('molecule.addStroke', {
        stroke: {
          id: `sd-${input.sessionId}-${Math.random().toString(36).slice(2, 8)}`,
          points: stroke.points,
          color: '#64748b',
          thickness: 3,
        },
      });
    }
    return;
  }

  for (const stroke of input.strokes) {
    if (stroke.points.length < 2) continue;
    ctx.services.commands.execute('molecule.addStroke', {
      stroke: {
        id: `sd-${input.sessionId}-${Math.random().toString(36).slice(2, 8)}`,
        points: stroke.points,
        color: '#64748b',
        thickness: 3,
      },
    });
  }
  ctx.services.ui.showToast("Couldn't read that sketch", 'info');
}

export default definePlugin({
  manifest: smartDrawManifest,

  setup(ctx) {
    ctx.registerCanvasTool({
      id: 'smart_draw',
      label: 'Smart Draw',
      title: 'Smart Draw — sketch bonds, rings, and labels; pause ~1.2s or Enter',
      group: 'select_edit',
      onStrokes: handleStrokes,
    });
    ctx.registerCanvasOverlay({
      id: 'smart-draw-preview',
      component: SmartDrawPreview,
    });
  },

  dispose(ctx) {
    ctx.services.logger.info('Smart Draw plugin disposed');
  },
});
