/**
 * In-modal 3Dmol preview for a single conformer pose.
 * Host must be position:relative with a non-zero box before createViewer —
 * 3Dmol's canvas is position:absolute and will otherwise paint outside the modal.
 */
import { useEffect, useRef } from 'react';
import {
  create3DmolViewer,
  disposeViewerHost,
  type Viewer3DHandle,
} from '../create3DmolViewer';
import { applyAtomDisplayStyle } from '../display/applyAtomDisplayStyle';

type Viewer3D = Viewer3DHandle;

const paintPose = (viewer: Viewer3D, molblock: string): void => {
  viewer.resize();
  viewer.clear();
  if (!molblock.trim()) {
    viewer.render();
    return;
  }
  const model = viewer.addModel(molblock, 'sdf') as {
    selectedAtoms?: (sel: object) => Array<{ elem?: string; serial?: number }>;
    setStyle?: (sel: object, style: object) => void;
  } | null;
  applyAtomDisplayStyle({
    viewer,
    models: model ? [model] : [],
    mode: 'ballStick',
    showHydrogens: true,
  });
  viewer.zoomTo();
  viewer.render();
};

export function ConformerPreview({ molblock }: { molblock: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer3D | null>(null);
  const molblockRef = useRef(molblock);
  molblockRef.current = molblock;

  // Create the viewer once when the host mounts (stable WebGL context).
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // Force a concrete box before GLViewer reads offsetWidth/Height.
    host.style.position = 'relative';
    host.style.width = '100%';
    if (host.clientHeight < 40) {
      host.style.height = '260px';
    }

    disposeViewerHost(host);
    let viewer: Viewer3D;
    try {
      viewer = create3DmolViewer(host, { backgroundColor: '#f8fafc' });
    } catch (err) {
      console.warn('[conformer-preview] createViewer failed', err);
      return;
    }
    viewerRef.current = viewer;

    const syncSizeAndPaint = () => {
      const v = viewerRef.current;
      if (!v || !hostRef.current) return;
      try {
        paintPose(v, molblockRef.current);
      } catch (err) {
        console.warn('[conformer-preview] paint failed', err);
      }
    };

    syncSizeAndPaint();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncSizeAndPaint) : null;
    ro?.observe(host);

    return () => {
      ro?.disconnect();
      viewerRef.current = null;
      disposeViewerHost(host);
    };
  }, []);

  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    try {
      paintPose(v, molblock);
    } catch (err) {
      console.warn('[conformer-preview] paint failed', err);
    }
  }, [molblock]);

  return (
    <div
      ref={hostRef}
      style={{ width: '100%', height: '100%', minHeight: 260, position: 'relative' }}
    />
  );
}
