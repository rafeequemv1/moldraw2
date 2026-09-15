/**
 * One-time import of pre-Vite "My Designs" from localStorage into IndexedDB.
 *
 * Legacy CRA keys (do not delete — keep as backup):
 * - moldraw_local_projects: [{ id, title, smiles, molfile, svg, updatedAt, ... }]
 * - moldraw_canvas: { molfile, smiles?, ts? } last editor snapshot
 *
 * New store: IndexedDB `moldraw.projects` via projectStorage.ts
 */
import { parseMolblock } from '@moldraw/core/io/molblock';
import { nativeSmilesTo2DMolblock } from '@moldraw/core/io/smilesToMolblock';
import type { Molecule } from '@moldraw/domain';
import { buildProjectRecord, getProject, saveProjectRecord } from './projectStorage';

export const LEGACY_LOCAL_PROJECTS_KEY = 'moldraw_local_projects';
export const LEGACY_CANVAS_KEY = 'moldraw_canvas';
export const LEGACY_MIGRATION_FLAG = 'moldraw_legacy_my_designs_migrated_v1';

type LegacyLocalProject = {
  id?: string;
  title?: string;
  name?: string;
  smiles?: string;
  molfile?: string;
  svg?: string;
  updatedAt?: number;
  createdAt?: number;
};

function svgToDataUrl(svg: string | undefined): string | undefined {
  const trimmed = String(svg || '').trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('data:')) return trimmed;
  try {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(trimmed)}`;
  } catch {
    return undefined;
  }
}

function moleculeFromLegacy(molfile: string, smiles: string): Molecule | null {
  const mb = String(molfile || '').trim();
  if (mb) {
    try {
      const mol = parseMolblock(mb);
      if (mol.atoms.length > 0) return mol;
    } catch {
      /* fall through to SMILES */
    }
  }
  const smi = String(smiles || '').trim();
  if (!smi) return null;
  try {
    const fromSmiles = nativeSmilesTo2DMolblock(smi);
    if (!fromSmiles?.trim()) return null;
    const mol = parseMolblock(fromSmiles);
    return mol.atoms.length > 0 ? mol : null;
  } catch {
    return null;
  }
}

function readLegacyProjects(): LegacyLocalProject[] {
  try {
    const raw = localStorage.getItem(LEGACY_LOCAL_PROJECTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is LegacyLocalProject =>
        !!item && typeof item === 'object' && !!(item as LegacyLocalProject).id,
    );
  } catch {
    return [];
  }
}

function readLegacyCanvas(): LegacyLocalProject | null {
  try {
    const raw = localStorage.getItem(LEGACY_CANVAS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LegacyLocalProject & { ts?: number; molfile?: string };
    if (!parsed?.molfile?.trim() && !parsed?.smiles?.trim()) return null;
    return {
      id: 'legacy-last-canvas',
      title: 'Last session (before upgrade)',
      molfile: parsed.molfile,
      smiles: parsed.smiles,
      updatedAt: typeof parsed.ts === 'number' ? parsed.ts : Date.now(),
    };
  } catch {
    return null;
  }
}

async function importOne(legacy: LegacyLocalProject): Promise<boolean> {
  const id = String(legacy.id || '').trim();
  if (!id) return false;

  // Already migrated or user already has this id in the new library.
  const existing = await getProject(id);
  if (existing) return false;

  const molecule = moleculeFromLegacy(String(legacy.molfile || ''), String(legacy.smiles || ''));
  if (!molecule) return false;

  const name =
    String(legacy.title || legacy.name || '').trim() ||
    String(legacy.smiles || '').trim().slice(0, 48) ||
    'Imported design';

  const record = buildProjectRecord(id, name.slice(0, 90), molecule, {
    folderId: null,
    thumbnailDataUrl: svgToDataUrl(legacy.svg),
  });
  record.updatedAt =
    typeof legacy.updatedAt === 'number'
      ? legacy.updatedAt
      : typeof legacy.createdAt === 'number'
        ? legacy.createdAt
        : record.updatedAt;

  await saveProjectRecord(record);
  return true;
}

/**
 * Idempotent. Safe to call on every app boot.
 * Never deletes legacy localStorage keys.
 */
export async function migrateLegacyMyDesigns(): Promise<{ imported: number; skipped: boolean }> {
  if (typeof window === 'undefined') return { imported: 0, skipped: true };

  try {
    if (localStorage.getItem(LEGACY_MIGRATION_FLAG) === '1') {
      return { imported: 0, skipped: true };
    }
  } catch {
    /* private mode — still attempt import */
  }

  const legacyProjects = readLegacyProjects();
  const canvas = readLegacyCanvas();
  const queue = [...legacyProjects];
  if (canvas) queue.push(canvas);

  let imported = 0;
  for (const item of queue) {
    try {
      if (await importOne(item)) imported += 1;
    } catch (err) {
      console.warn('[migrateLegacyMyDesigns] failed for', item.id, err);
    }
  }

  try {
    // Mark done even if zero imported (empty library / already converted) so we don't re-scan forever.
    localStorage.setItem(LEGACY_MIGRATION_FLAG, '1');
  } catch {
    /* ignore */
  }

  if (imported > 0) {
    console.info(`[migrateLegacyMyDesigns] imported ${imported} design(s) into My Designs`);
  }
  return { imported, skipped: false };
}
