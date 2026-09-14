import {
  captureViewerImage,
  exportViewer3D,
  type Viewer3DExportFormat,
  type Viewer3DExportViewer,
} from '@moldraw/viewer-3d';
import { pdbToMolblock } from './pdbUtils';

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const sanitizeBase = (title: string): string => {
  const t = title.replace(/[^\w.\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
  return t || 'protein';
};

export type ProteinExportFormat = Viewer3DExportFormat | 'pdb';

export const PROTEIN_EXPORT_FORMATS: ProteinExportFormat[] = [
  'glb',
  'png',
  'jpg',
  'pdb',
  'sdf',
  'xyz',
  'x3d',
  'obj',
];

export function exportProtein(opts: {
  format: ProteinExportFormat;
  pdbText: string;
  title?: string;
  viewer: Viewer3DExportViewer | null;
  transparentPng?: boolean;
  hiRes?: boolean;
}): { ok: true } | { ok: false; error: string } {
  const { format, pdbText, title = 'protein', viewer, transparentPng = true, hiRes = false } = opts;
  const base = sanitizeBase(title);
  const pdb = pdbText.trim();

  if (!pdb) {
    return { ok: false, error: 'No structure loaded' };
  }

  if (format === 'pdb') {
    downloadBlob(new Blob([pdb.endsWith('\n') ? pdb : `${pdb}\n`], { type: 'chemical/x-pdb' }), `${base}.pdb`);
    return { ok: true };
  }

  if (format === 'png' || format === 'jpg') {
    if (!viewer) return { ok: false, error: '3D viewer not ready' };
    const uri = captureViewerImage(viewer, format, transparentPng && format === 'png', hiRes);
    const a = document.createElement('a');
    a.href = uri;
    a.download = `${base}.${format}`;
    a.click();
    return { ok: true };
  }

  const molblock = pdbToMolblock(pdb);
  if (!molblock) {
    return { ok: false, error: 'Could not convert PDB for export' };
  }

  return exportViewer3D({
    format,
    molblock,
    title: base,
    viewer,
    transparentPng,
    hiRes,
  });
}
