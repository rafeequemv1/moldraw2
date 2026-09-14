/**
 * 3D viewer export helpers — SDF / XYZ / images / simple mesh formats.
 */
import { molblock3dToXyz } from './molblockToXyz';
import { molblockToObj } from './molblockToObj';
import { molblockToX3d } from './molblockToX3d';
import { molblockToGlb } from './molblockToGlb';

export type Viewer3DExportFormat =
  | 'glb'
  | 'png'
  | 'jpg'
  | 'sdf'
  | 'xyz'
  | 'x3d'
  | 'obj';

export type Viewer3DExportViewer = {
  pngURI: () => string;
  getCanvas: () => HTMLCanvasElement;
  setBackgroundColor: (hex: number | string, a?: number) => void;
  render: () => void;
};

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const downloadDataUrl = (dataUrl: string, filename: string) => {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
};

const sanitizeBase = (title: string): string => {
  const t = title.replace(/[^\w.\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
  return t || 'molecule';
};

/** Capture viewer canvas; optionally force transparent background for PNG. */
export const captureViewerImage = (
  viewer: Viewer3DExportViewer,
  kind: 'png' | 'jpg',
  transparentPng: boolean,
  hiRes = false,
): string => {
  const canvas = viewer.getCanvas();
  const captureFrom = (src: HTMLCanvasElement): string =>
    kind === 'jpg' ? src.toDataURL('image/jpeg', 0.92) : src.toDataURL('image/png');

  if (kind === 'png' && transparentPng) {
    viewer.setBackgroundColor(0xffffff, 0);
    viewer.render();
  }

  let uri: string;
  if (hiRes && canvas.width > 0 && canvas.height > 0) {
    const scale = 2;
    const off = document.createElement('canvas');
    off.width = canvas.width * scale;
    off.height = canvas.height * scale;
    const ctx = off.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(canvas, 0, 0, off.width, off.height);
      uri = captureFrom(off);
    } else {
      uri = kind === 'jpg' ? captureFrom(canvas) : viewer.pngURI();
    }
  } else {
    uri = kind === 'jpg' ? captureFrom(canvas) : transparentPng ? viewer.pngURI() : viewer.pngURI();
  }

  if (kind === 'png' && transparentPng) {
    const themeBg =
      (typeof document !== 'undefined' &&
        getComputedStyle(document.documentElement).getPropertyValue('--viewer3d-bg').trim()) ||
      '#f8fafc';
    viewer.setBackgroundColor(themeBg, 1);
    viewer.render();
  }
  return uri;
};

export const exportViewer3D = (opts: {
  format: Viewer3DExportFormat;
  molblock: string;
  title?: string;
  viewer: Viewer3DExportViewer | null;
  transparentPng?: boolean;
  hiRes?: boolean;
}): { ok: true } | { ok: false; error: string } => {
  const {
    format,
    molblock,
    title = 'molecule',
    viewer,
    transparentPng = true,
    hiRes = false,
  } = opts;
  const base = sanitizeBase(title);
  const mb = molblock.trim();
  if (!mb && format !== 'png' && format !== 'jpg') {
    return { ok: false, error: 'No 3D structure to export' };
  }

  try {
    switch (format) {
      case 'sdf':
        downloadBlob(
          new Blob([mb.endsWith('\n') ? mb : `${mb}\n`], { type: 'chemical/x-mdl-sdfile' }),
          `${base}.sdf`,
        );
        return { ok: true };
      case 'xyz': {
        const xyz = molblock3dToXyz(mb, title);
        if (!xyz) return { ok: false, error: 'Could not build XYZ from molblock' };
        downloadBlob(new Blob([xyz], { type: 'chemical/x-xyz' }), `${base}.xyz`);
        return { ok: true };
      }
      case 'obj': {
        const obj = molblockToObj(mb, title);
        if (!obj) return { ok: false, error: 'Could not build OBJ' };
        downloadBlob(new Blob([obj], { type: 'text/plain' }), `${base}.obj`);
        return { ok: true };
      }
      case 'x3d': {
        const x3d = molblockToX3d(mb, title);
        if (!x3d) return { ok: false, error: 'Could not build X3D' };
        downloadBlob(new Blob([x3d], { type: 'model/x3d+xml' }), `${base}.x3d`);
        return { ok: true };
      }
      case 'glb': {
        const glb = molblockToGlb(mb);
        if (!glb) return { ok: false, error: 'Could not build GLB' };
        downloadBlob(new Blob([glb], { type: 'model/gltf-binary' }), `${base}.glb`);
        return { ok: true };
      }
      case 'png':
      case 'jpg': {
        if (!viewer) return { ok: false, error: '3D viewer not ready' };
        const uri = captureViewerImage(viewer, format, transparentPng && format === 'png', hiRes);
        downloadDataUrl(uri, `${base}.${format === 'png' ? 'png' : 'jpg'}`);
        return { ok: true };
      }
      default:
        return { ok: false, error: `Unknown format: ${format}` };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
};
