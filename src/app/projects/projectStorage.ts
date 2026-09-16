import type { Molecule } from '@moldraw/domain';
import type { ProjectFolder, SavedProject, SavedProjectMeta } from './types';

const DB_NAME = 'moldraw.projects';
const DB_VERSION = 2;
const PROJECT_STORE = 'projects';
const FOLDER_STORE = 'folders';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PROJECT_STORE)) {
        db.createObjectStore(PROJECT_STORE);
      }
      if (!db.objectStoreNames.contains(FOLDER_STORE)) {
        db.createObjectStore(FOLDER_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

function metaFromProject(project: SavedProject): SavedProjectMeta {
  return {
    id: project.id,
    name: project.name,
    updatedAt: project.updatedAt,
    atomCount: project.atomCount,
    folderId: project.folderId ?? null,
    thumbnailDataUrl: project.thumbnailDataUrl,
  };
}

function normalizeProject(raw: SavedProject): SavedProject {
  return {
    ...raw,
    folderId: raw.folderId ?? null,
  };
}

export function moleculeHasProjectContent(mol: Molecule): boolean {
  return (
    mol.atoms.length > 0 ||
    (mol.reactionArrows?.length ?? 0) > 0 ||
    (mol.canvasTexts?.length ?? 0) > 0 ||
    (mol.canvasShapes?.length ?? 0) > 0 ||
    (mol.canvasImages?.length ?? 0) > 0 ||
    (mol.strokes?.length ?? 0) > 0
  );
}

export function defaultProjectName(mol: Molecule): string {
  const names = mol.objectOutline?.names ?? {};
  for (const name of Object.values(names)) {
    const trimmed = name.trim();
    if (trimmed) return trimmed;
  }
  return 'Untitled design';
}

/** Deep-clone a molecule for duplicate / fork (JSON fallback when structuredClone fails). */
export function cloneProjectMolecule(mol: Molecule): Molecule {
  try {
    return structuredClone(mol);
  } catch {
    return JSON.parse(JSON.stringify(mol)) as Molecule;
  }
}

/** Pick a non-colliding duplicate name (e.g. "Design" → "Design copy", "Design copy 2"). */
export function duplicateProjectName(baseName: string, takenNames: ReadonlySet<string>): string {
  const base = baseName.trim() || 'Untitled design';
  let candidate = `${base} copy`;
  let n = 2;
  while (takenNames.has(candidate)) {
    candidate = `${base} copy ${n}`;
    n += 1;
  }
  return candidate;
}

export function buildProjectRecord(
  id: string,
  name: string,
  molecule: Molecule,
  opts?: { folderId?: string | null; thumbnailDataUrl?: string },
): SavedProject {
  const trimmed = name.trim() || defaultProjectName(molecule);
  return {
    id,
    name: trimmed,
    updatedAt: Date.now(),
    atomCount: molecule.atoms.length,
    folderId: opts?.folderId ?? null,
    thumbnailDataUrl: opts?.thumbnailDataUrl,
    molecule,
  };
}

export async function listProjectMetas(): Promise<SavedProjectMeta[]> {
  try {
    const db = await openDb();
    const metas = await new Promise<SavedProjectMeta[]>((resolve, reject) => {
      const tx = db.transaction(PROJECT_STORE, 'readonly');
      const req = tx.objectStore(PROJECT_STORE).getAll();
      req.onsuccess = () => {
        const rows = (req.result ?? []) as SavedProject[];
        resolve(
          rows
            .map(p => metaFromProject(normalizeProject(p)))
            .sort((a, b) => b.updatedAt - a.updatedAt),
        );
      };
      req.onerror = () => reject(req.error ?? new Error('IndexedDB read failed'));
    });
    db.close();
    return metas;
  } catch {
    return [];
  }
}

export async function listAllProjects(): Promise<SavedProject[]> {
  try {
    const db = await openDb();
    const projects = await new Promise<SavedProject[]>((resolve, reject) => {
      const tx = db.transaction(PROJECT_STORE, 'readonly');
      const req = tx.objectStore(PROJECT_STORE).getAll();
      req.onsuccess = () => {
        const rows = (req.result ?? []) as SavedProject[];
        resolve(rows.map(p => normalizeProject(p)).sort((a, b) => b.updatedAt - a.updatedAt));
      };
      req.onerror = () => reject(req.error ?? new Error('IndexedDB read failed'));
    });
    db.close();
    return projects;
  } catch {
    return [];
  }
}

export async function listFolders(): Promise<ProjectFolder[]> {
  try {
    const db = await openDb();
    const folders = await new Promise<ProjectFolder[]>((resolve, reject) => {
      const tx = db.transaction(FOLDER_STORE, 'readonly');
      const req = tx.objectStore(FOLDER_STORE).getAll();
      req.onsuccess = () => {
        const rows = (req.result ?? []) as ProjectFolder[];
        resolve(rows.sort((a, b) => a.name.localeCompare(b.name)));
      };
      req.onerror = () => reject(req.error ?? new Error('IndexedDB read failed'));
    });
    db.close();
    return folders;
  } catch {
    return [];
  }
}

export async function getProject(id: string): Promise<SavedProject | null> {
  try {
    const db = await openDb();
    const value = await new Promise<SavedProject | null>((resolve, reject) => {
      const tx = db.transaction(PROJECT_STORE, 'readonly');
      const req = tx.objectStore(PROJECT_STORE).get(id);
      req.onsuccess = () => {
        const v = req.result;
        resolve(v && typeof v === 'object' ? normalizeProject(v as SavedProject) : null);
      };
      req.onerror = () => reject(req.error ?? new Error('IndexedDB read failed'));
    });
    db.close();
    return value;
  } catch {
    return null;
  }
}

export async function saveProjectRecord(project: SavedProject): Promise<void> {
  await saveProjectRecords([project]);
}

/** One transaction for every open tab — used by unload / visibility flush. */
export async function saveProjectRecords(projects: SavedProject[]): Promise<void> {
  if (projects.length === 0) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PROJECT_STORE, 'readwrite');
    const store = tx.objectStore(PROJECT_STORE);
    for (const project of projects) {
      store.put(normalizeProject(project), project.id);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
  });
  db.close();
}

export async function saveFolderRecord(folder: ProjectFolder): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(FOLDER_STORE, 'readwrite');
    tx.objectStore(FOLDER_STORE).put(folder, folder.id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
  });
  db.close();
}

export async function deleteProjectRecord(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PROJECT_STORE, 'readwrite');
    tx.objectStore(PROJECT_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'));
  });
  db.close();
}

export async function deleteProjectRecords(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PROJECT_STORE, 'readwrite');
    const store = tx.objectStore(PROJECT_STORE);
    for (const id of ids) store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'));
  });
  db.close();
}

export async function deleteFolderRecord(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([PROJECT_STORE, FOLDER_STORE], 'readwrite');
    const projectStore = tx.objectStore(PROJECT_STORE);
    const folderStore = tx.objectStore(FOLDER_STORE);
    const projectReq = projectStore.getAll();
    projectReq.onsuccess = () => {
      const projects = (projectReq.result ?? []) as SavedProject[];
      for (const p of projects) {
        if (p.folderId === id) {
          projectStore.put({ ...normalizeProject(p), folderId: null }, p.id);
        }
      }
      const folderReq = folderStore.getAll();
      folderReq.onsuccess = () => {
        const folders = (folderReq.result ?? []) as ProjectFolder[];
        for (const f of folders) {
          if (f.parentId === id) {
            folderStore.put({ ...f, parentId: null }, f.id);
          }
        }
        folderStore.delete(id);
      };
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'));
  });
  db.close();
}

export async function duplicateProjectRecord(
  id: string,
  thumbnailDataUrl?: string,
  copyName?: string,
): Promise<SavedProject | null> {
  const src = await getProject(id);
  if (!src) return null;
  const newId = crypto.randomUUID();
  const name =
    copyName?.trim() ||
    duplicateProjectName(src.name, new Set((await listProjectMetas()).map(m => m.name)));
  const copy = buildProjectRecord(newId, name, cloneProjectMolecule(src.molecule), {
    folderId: src.folderId,
    thumbnailDataUrl: thumbnailDataUrl ?? src.thumbnailDataUrl,
  });
  await saveProjectRecord(copy);
  return copy;
}

export async function moveProjectsToFolder(
  projectIds: string[],
  folderId: string | null,
): Promise<void> {
  for (const id of projectIds) {
    const p = await getProject(id);
    if (!p) continue;
    await saveProjectRecord({ ...p, folderId, updatedAt: Date.now() });
  }
}

export async function renameProjectRecord(id: string, name: string): Promise<void> {
  const p = await getProject(id);
  if (!p) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  await saveProjectRecord({ ...p, name: trimmed, updatedAt: Date.now() });
}

export async function renameFolderRecord(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  const folders = await listFolders();
  const folder = folders.find(f => f.id === id);
  if (!folder) return;
  await saveFolderRecord({ ...folder, name: trimmed, updatedAt: Date.now() });
}

export async function createFolderRecord(
  name: string,
  parentId: string | null = null,
): Promise<ProjectFolder> {
  const folder: ProjectFolder = {
    id: crypto.randomUUID(),
    name: name.trim() || 'New folder',
    parentId,
    updatedAt: Date.now(),
  };
  await saveFolderRecord(folder);
  return folder;
}
