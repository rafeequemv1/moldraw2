import { moleculeToCdxml } from '@moldraw/core/io/cdxmlFromMolecule';
import { downloadBlob } from '../importExport/helpers';
import { sanitizeDesignFilename, serializeMoldrawFile } from '../importExport/moldrawFile';
import { zipStoreFiles } from '../importExport/storeZip';
import { getProject, listAllProjects } from './projectStorage';
import type { SavedProject } from './types';

const CDXML_MIME = 'chemical/x-cdxml;charset=utf-8';
const MOLDRAW_MIME = 'application/json';
const QUEUE_DELAY_MS = 350;

function uniqueFilename(base: string, ext: '.moldraw' | '.cdxml', used: Set<string>): string {
  let name = `${base}${ext}`;
  let n = 2;
  while (used.has(name)) {
    name = `${base}-${n}${ext}`;
    n += 1;
  }
  used.add(name);
  return name;
}

function backupZipName(kind: 'moldraw' | 'chemdraw'): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `${kind}-designs-${stamp}.zip`;
}

function moldrawBlob(project: SavedProject): Blob {
  return new Blob([serializeMoldrawFile(project.name, project.molecule)], { type: MOLDRAW_MIME });
}

function cdxmlBlob(project: SavedProject): Blob | null {
  if (project.molecule.atoms.length === 0) return null;
  return new Blob([moleculeToCdxml(project.molecule)], { type: CDXML_MIME });
}

/** Download one saved design as a native .moldraw file (entire canvas). */
export async function downloadProjectMoldrawFile(projectId: string): Promise<boolean> {
  const project = await getProject(projectId);
  if (!project) return false;
  const base = sanitizeDesignFilename(project.name);
  downloadBlob(moldrawBlob(project), `${base}.moldraw`);
  return true;
}

/** Download one saved design as ChemDraw CDXML. */
export async function downloadProjectChemDrawFile(projectId: string): Promise<boolean> {
  const project = await getProject(projectId);
  if (!project) return false;
  const blob = cdxmlBlob(project);
  if (!blob) return false;
  const base = sanitizeDesignFilename(project.name);
  downloadBlob(blob, `${base}.cdxml`);
  return true;
}

async function downloadQueue(
  projects: SavedProject[],
  write: (project: SavedProject) => boolean,
): Promise<number> {
  let count = 0;
  for (let i = 0; i < projects.length; i++) {
    const project = projects[i]!;
    if (write(project)) count += 1;
    if (i < projects.length - 1) {
      await new Promise(resolve => window.setTimeout(resolve, QUEUE_DELAY_MS));
    }
  }
  return count;
}

function downloadZip(
  projects: SavedProject[],
  zipName: string,
  entry: (project: SavedProject, used: Set<string>) => { name: string; data: Uint8Array } | null,
): number {
  const used = new Set<string>();
  const entries = projects.flatMap(project => {
    const row = entry(project, used);
    return row ? [row] : [];
  });
  if (entries.length === 0) return 0;
  const zipped = zipStoreFiles(entries);
  downloadBlob(new Blob([new Uint8Array(zipped)], { type: 'application/zip' }), zipName);
  return entries.length;
}

/** Download every saved design as .moldraw — ZIP (default) or queued singles. */
export async function downloadAllProjectsMoldraw(options: { asZip: boolean }): Promise<number> {
  const projects = await listAllProjects();
  if (projects.length === 0) return 0;
  const enc = new TextEncoder();
  if (options.asZip) {
    return downloadZip(projects, backupZipName('moldraw'), (project, used) => {
      const base = sanitizeDesignFilename(project.name);
      return {
        name: uniqueFilename(base, '.moldraw', used),
        data: enc.encode(serializeMoldrawFile(project.name, project.molecule)),
      };
    });
  }
  return downloadQueue(projects, project => {
    downloadBlob(moldrawBlob(project), `${sanitizeDesignFilename(project.name)}.moldraw`);
    return true;
  });
}

/** Download every saved design as ChemDraw CDXML — ZIP (default) or queued singles. */
export async function downloadAllProjectsChemDraw(options: { asZip: boolean }): Promise<number> {
  const projects = await listAllProjects();
  if (projects.length === 0) return 0;
  const enc = new TextEncoder();
  if (options.asZip) {
    return downloadZip(projects, backupZipName('chemdraw'), (project, used) => {
      const blob = cdxmlBlob(project);
      if (!blob) return null;
      const base = sanitizeDesignFilename(project.name);
      return {
        name: uniqueFilename(base, '.cdxml', used),
        data: enc.encode(moleculeToCdxml(project.molecule)),
      };
    });
  }
  return downloadQueue(projects, project => {
    const blob = cdxmlBlob(project);
    if (!blob) return false;
    downloadBlob(blob, `${sanitizeDesignFilename(project.name)}.cdxml`);
    return true;
  });
}
