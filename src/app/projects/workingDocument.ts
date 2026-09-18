import type { Molecule } from '@moldraw/domain';
import { moleculeHasProjectContent } from './projectStorage';
import type { OpenTabsSession } from './tabSession';
import {
  STARTUP_SEED_CONSUMED_KEY,
  WORKING_DOCUMENT_SNAPSHOT_KEY,
  type DocumentTab,
  type SavedProject,
} from './types';

export type WorkingDocumentSnapshot = {
  tabs: DocumentTab[];
  activeTabId: string;
  name: string;
  molecule: Molecule;
  savedAt: number;
};

export type HydrationDocument = {
  molecule: Molecule;
  name: string;
  tabs: DocumentTab[];
  activeTabId: string;
};

function readStorageItem(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorageItem(storage: Storage, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    /* private mode / quota — IndexedDB remains the durable store */
  }
}

function parseSnapshot(raw: string | null): WorkingDocumentSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as WorkingDocumentSnapshot;
    if (!parsed?.tabs?.length || !parsed.activeTabId) return null;
    if (!parsed.tabs.some(t => t.id === parsed.activeTabId)) return null;
    if (!parsed.molecule || typeof parsed.molecule !== 'object') return null;
    if (!Array.isArray(parsed.molecule.atoms) || !Array.isArray(parsed.molecule.bonds)) return null;
    return {
      tabs: parsed.tabs,
      activeTabId: parsed.activeTabId,
      name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name : 'Untitled design',
      molecule: parsed.molecule,
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
    };
  } catch {
    return null;
  }
}

export function readWorkingDocumentSnapshot(): WorkingDocumentSnapshot | null {
  if (typeof window === 'undefined') return null;
  return (
    parseSnapshot(readStorageItem(sessionStorage, WORKING_DOCUMENT_SNAPSHOT_KEY)) ??
    parseSnapshot(readStorageItem(localStorage, WORKING_DOCUMENT_SNAPSHOT_KEY))
  );
}

export type WriteWorkingDocumentOptions = {
  /**
   * Allow replacing a non-empty snapshot with an empty molecule (Clear canvas).
   * Default false avoids wiping a drawn file during pre-hydration races.
   */
  allowEmpty?: boolean;
};

/**
 * Synchronous persist of the live canvas. IndexedDB writes are async and can
 * lose the race when OAuth / email confirmation navigates away.
 *
 * Empty molecules are only written when `allowEmpty` is set (Clear / explicit
 * empty save). Otherwise boot upsert would leave a blank snapshot that blocks
 * the first-visit demo molecule and still looks like a “prior document”.
 */
export function writeWorkingDocumentSnapshot(
  snapshot: WorkingDocumentSnapshot,
  opts?: WriteWorkingDocumentOptions,
): void {
  if (typeof window === 'undefined') return;
  if (!moleculeHasProjectContent(snapshot.molecule) && !opts?.allowEmpty) {
    return;
  }
  const json = JSON.stringify(snapshot);
  writeStorageItem(sessionStorage, WORKING_DOCUMENT_SNAPSHOT_KEY, json);
  writeStorageItem(localStorage, WORKING_DOCUMENT_SNAPSHOT_KEY, json);
}

/** True after the first-visit PubChem seed has run, Clear, or a prior local doc hydrated. */
export function isStartupSeedConsumed(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    readStorageItem(localStorage, STARTUP_SEED_CONSUMED_KEY) === '1' ||
    readStorageItem(sessionStorage, STARTUP_SEED_CONSUMED_KEY) === '1'
  );
}

export function markStartupSeedConsumed(): void {
  if (typeof window === 'undefined') return;
  writeStorageItem(localStorage, STARTUP_SEED_CONSUMED_KEY, '1');
  writeStorageItem(sessionStorage, STARTUP_SEED_CONSUMED_KEY, '1');
}

export function resolveBootTabs(
  session: OpenTabsSession | null,
  snapshot: WorkingDocumentSnapshot | null,
  fallbackId: string,
): { tabs: DocumentTab[]; activeTabId: string } {
  if (session?.tabs.length) {
    return { tabs: session.tabs, activeTabId: session.activeTabId };
  }
  if (snapshot?.tabs.length) {
    return { tabs: snapshot.tabs, activeTabId: snapshot.activeTabId };
  }
  return {
    tabs: [{ id: fallbackId, name: 'Untitled design' }],
    activeTabId: fallbackId,
  };
}

/**
 * After login, keep the local working file. Never replace a drawn molecule with
 * an empty cloud/default document.
 */
export function preferLocalWorkingDocument<T extends { molecule: Molecule; name: string }>(
  local: T | null,
  remote: T | null,
): T | null {
  if (local && moleculeHasProjectContent(local.molecule)) return local;
  if (remote && moleculeHasProjectContent(remote.molecule)) return remote;
  return local ?? remote;
}

export function pickHydrationDocument(opts: {
  projectId: string;
  snapshot: WorkingDocumentSnapshot | null;
  saved: SavedProject | null;
  sessionTabs: DocumentTab[];
}): HydrationDocument | null {
  const { projectId, snapshot, saved, sessionTabs } = opts;
  const snapshotHasContent = Boolean(snapshot && moleculeHasProjectContent(snapshot.molecule));
  const savedHasContent = Boolean(saved && moleculeHasProjectContent(saved.molecule));

  const snapshotForActive =
    snapshot &&
    (snapshot.activeTabId === projectId || snapshot.tabs.some(t => t.id === projectId));

  if (snapshotHasContent && savedHasContent && snapshot && saved) {
    const useSnapshot =
      snapshot.activeTabId === projectId && snapshot.savedAt >= (saved.updatedAt ?? 0);
    if (useSnapshot || snapshot.activeTabId !== projectId) {
      if (snapshot.activeTabId === projectId || !savedHasContent) {
        return {
          molecule: snapshot.molecule,
          name: snapshot.name,
          tabs: snapshot.tabs,
          activeTabId: snapshot.activeTabId,
        };
      }
    }
    return {
      molecule: saved.molecule,
      name: saved.name,
      tabs: sessionTabs.length ? sessionTabs : snapshot.tabs,
      activeTabId: projectId,
    };
  }

  if (snapshotHasContent && snapshot) {
    return {
      molecule: snapshot.molecule,
      name: snapshot.name,
      tabs: snapshot.tabs,
      activeTabId: snapshot.activeTabId,
    };
  }

  if (savedHasContent && saved) {
    return {
      molecule: saved.molecule,
      name: saved.name,
      tabs: sessionTabs.map(t => (t.id === projectId ? { ...t, name: saved.name } : t)),
      activeTabId: projectId,
    };
  }

  if (snapshotForActive && snapshot) {
    return {
      molecule: snapshot.molecule,
      name: snapshot.name,
      tabs: snapshot.tabs,
      activeTabId: snapshot.activeTabId,
    };
  }

  return null;
}

/** Do not persist an empty in-memory canvas over a stored drawing that has not been hydrated yet. */
export function shouldKeepStoredMolecule(
  inMemory: Molecule,
  stored: Molecule | null | undefined,
  savedOnce: boolean,
): boolean {
  if (savedOnce) return false;
  if (moleculeHasProjectContent(inMemory)) return false;
  return Boolean(stored && moleculeHasProjectContent(stored));
}
