/**
 * In-modal 3Dmol preview for a single conformer pose.
 * Host must be position:relative with a non-zero box before createViewer —
 * 3Dmol's canvas is position:absolute and will otherwise paint outside the modal.
 */
import { useEffect, useRef } from 'react';
import * as $3Dmol from '3dmol';
import { vdwRadius } from '@moldraw/core/chemistry/atomicData';

type Viewer3D = {
  clear: () => void;
  addModel: (data: string, format: string) => unknown;
  setStyle: (sel: object, style: object) => void;
  zoomTo: () => void;
  render: () => void;
  resize: () => void;
};

const CARBON_VDW_A = vdwRadius('C');
const CARBON_SPHERE_RADIUS = 0.48;
const STICK_RADIUS = 0.11;
const HYDROGEN_COLOR = '#e8eef5';

const ballStickSphereRadius = (elem: string): number =>
  (vdwRadius(elem) / CARBON_VDW_A) * CARBON_SPHERE_RADIUS;

const resolveCreateViewer = ():
  | ((el: HTMLElement, opts: object) => Viewer3D)
  | null => {
  const mod = $3Dmol as unknown as {
    createViewer?: (el: HTMLElement, opts: object) => Viewer3D;
    default?: { createViewer?: (el: HTMLElement, opts: object) => Viewer3D };
  };
  return mod.createViewer ?? mod.default?.createViewer ?? null;
};

const paintPose = (viewer: Viewer3D, molblock: string): void => {
  viewer.resize();
  viewer.clear();
  if (!molblock.trim()) {
    viewer.render();
    return;
  }
  const model = viewer.addModel(molblock, 'sdf') as {
    selectedAtoms?: (sel: object) => Array<{ elem?: string }>;
  } | null;
  viewer.setStyle({}, { stick: { radius: STICK_RADIUS, singleBonds: true } });
  const atoms = model?.selectedAtoms?.({}) ?? [];
  const elems = new Set(atoms.map(a => a.elem).filter((e): e is string => !!e));
  for (const elem of elems) {
    const radius = ballStickSphereRadius(elem);
    const isH = elem === 'H';
    viewer.setStyle(
      { elem },
      {
        stick: isH
          ? { radius: STICK_RADIUS, color: HYDROGEN_COLOR, singleBonds: true }
          : { radius: STICK_RADIUS, singleBonds: true },
        sphere: isH
          ? { radius, color: HYDROGEN_COLOR }
          : { radius },
      },
    );
  }
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

    const createViewer = resolveCreateViewer();
    if (!createViewer) {
      console.warn('[conformer-preview] 3Dmol createViewer not found');
      return;
    }

    // Force a concrete box before GLViewer reads offsetWidth/Height.
    host.style.position = 'relative';
    host.style.width = '100%';
    if (host.clientHeight < 40) {
      host.style.height = '260px';
    }

    host.replaceChildren();
    let viewer: Viewer3D;
    try {
      viewer = createViewer(host, { backgroundColor: '#f8fafc' });
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
