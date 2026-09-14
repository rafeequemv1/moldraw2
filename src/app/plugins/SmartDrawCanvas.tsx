import { useCallback, type Ref } from 'react';
import { MoldrawCanvas, type MoldrawCanvasProps } from '@moldraw/canvas';
import type { InfiniteCanvasHandle, SmartDrawSessionResult } from '@moldraw/canvas';
import { CMD } from '@moldraw/core';
import { usePluginHostOptional } from './PluginHostProvider';

export function MoldrawCanvasWithPlugins({
  canvasRef,
  store,
  ...props
}: MoldrawCanvasProps & {
  canvasRef: Ref<InfiniteCanvasHandle>;
}) {
  const host = usePluginHostOptional();

  const onSmartDrawSessionComplete = useCallback(
    (result: SmartDrawSessionResult) => {
      if (host?.host.getPluginState('smart-draw').state === 'loaded') {
        host.host.dispatchCanvasToolStrokes(result);
        return;
      }
      for (const stroke of result.strokes) {
        if (stroke.points.length < 2) continue;
        store.applyCommand(CMD.AddStroke, {
          stroke: {
            id: `sd-${result.sessionId}-${Math.random().toString(36).slice(2, 8)}`,
            points: stroke.points,
            color: '#64748b',
            thickness: 3,
          },
        });
      }
    },
    [host, store],
  );

  return (
    <>
      <MoldrawCanvas
        ref={canvasRef}
        store={store}
        {...props}
        onSmartDrawSessionComplete={onSmartDrawSessionComplete}
      />
      {(host?.contributions.canvasOverlays ?? []).map(overlay => {
        const Comp = overlay.component;
        return <Comp key={overlay.id} />;
      })}
    </>
  );
}
