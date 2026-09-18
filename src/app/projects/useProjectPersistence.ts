import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Molecule } from '@moldraw/domain';
import type { MoleculeEditor } from '@moldraw/core';
import { navigateToEditor, parseAppRoute } from '../../features/documentation';
import {
  buildProjectRecord,
  createFolderRecord,
  defaultProjectName,
  deleteFolderRecord,
  deleteProjectRecord,
  deleteProjectRecords,
  duplicateProjectRecord,
  duplicateProjectName,
  getProject,
  listFolders,
  listProjectMetas,
  moleculeHasProjectContent,
  moveProjectsToFolder,
  renameFolderRecord,
  renameProjectRecord,
  saveProjectRecord,
  saveProjectRecords,
} from './projectStorage';
import { mergeLibraryMetasWithOpenTabs } from './libraryListing';
import { migrateLegacyMyDesigns } from './migrateLegacyMyDesigns';
import { renderProjectThumbnailDataUrl } from './projectThumbnail';
import {
  readOpenTabsSession,
  readSessionProjectId,
  writeOpenTabsSession,
} from './tabSession';
import {
  markStartupSeedConsumed,
  pickHydrationDocument,
  readWorkingDocumentSnapshot,
  resolveBootTabs,
  shouldKeepStoredMolecule,
  writeWorkingDocumentSnapshot,
} from './workingDocument';
import { registerAuthLeavePersist } from '../auth/authLeavePersist';
import type { DocumentTab, ProjectFolder, SavedProject, SavedProjectMeta } from './types';

import { urlHasEditorSeedQuery } from '../editorSeedQuery';

/** Debounced canvas → IndexedDB write. Short enough that a refresh keeps work. */
const AUTOSAVE_DEBOUNCE_MS = 800;

export function useProjectPersistence(editorStore: MoleculeEditor) {
  const snapshot = readWorkingDocumentSnapshot();
  const tabsSession = readOpenTabsSession();
  const fallbackId = snapshot?.activeTabId ?? readSessionProjectId() ?? crypto.randomUUID();
  const bootTabs = resolveBootTabs(tabsSession, snapshot, fallbackId);
  const initialActiveId = bootTabs.activeTabId;
  const initialTabs: DocumentTab[] = bootTabs.tabs;

  const [projectId, setProjectId] = useState(initialActiveId);
  const [projectName, setProjectName] = useState(
    () => initialTabs.find(t => t.id === initialActiveId)?.name ?? 'Untitled design',
  );
  const [openTabs, setOpenTabs] = useState<DocumentTab[]>(initialTabs);
  const [projectMetas, setProjectMetas] = useState<SavedProjectMeta[]>([]);
  const [folders, setFolders] = useState<ProjectFolder[]>([]);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const savedOnceRef = useRef(false);
  const savedOnceByTabRef = useRef<Map<string, boolean>>(new Map());
  const moleculeCacheRef = useRef(new Map<string, Molecule>());
  const folderIdByProjectRef = useRef(new Map<string, string | null>());
  const thumbnailByProjectRef = useRef(new Map<string, string | undefined>());
  const hydratedRef = useRef(false);
  const bootUpsertedRef = useRef(false);
  const [initialHydrationDone, setInitialHydrationDone] = useState(false);
  const openTabsRef = useRef(openTabs);
  const projectIdRef = useRef(projectId);
  const projectNameRef = useRef(projectName);

  const cloneMolecule = (mol: Molecule): Molecule =>
    JSON.parse(JSON.stringify(mol)) as Molecule;

  openTabsRef.current = openTabs;
  projectIdRef.current = projectId;
  projectNameRef.current = projectName;

  const syncTabsSession = useCallback((tabs: DocumentTab[], activeId: string) => {
    const prev = readOpenTabsSession();
    writeOpenTabsSession({
      tabs,
      activeTabId: activeId,
      documentStyles: prev?.documentStyles,
    });
  }, []);

  const rememberMeta = (meta: SavedProjectMeta) => {
    folderIdByProjectRef.current.set(meta.id, meta.folderId ?? null);
    if (meta.thumbnailDataUrl) thumbnailByProjectRef.current.set(meta.id, meta.thumbnailDataUrl);
    savedOnceByTabRef.current.set(meta.id, true);
  };

  const refreshLibrary = useCallback(async () => {
    const [metas, folderList] = await Promise.all([listProjectMetas(), listFolders()]);
    for (const meta of metas) rememberMeta(meta);
    setProjectMetas(metas);
    setFolders(folderList);
    setOpenTabs(prev => {
      const next = prev.map(tab => {
        const meta = metas.find(m => m.id === tab.id);
        return meta ? { ...tab, name: meta.name } : tab;
      });
      if (next.every((t, i) => t.name === prev[i]?.name)) return prev;
      syncTabsSession(next, projectIdRef.current);
      return next;
    });
  }, [syncTabsSession]);

  const showSavedNotice = useCallback((message = 'Saved locally on this device') => {
    setSaveNotice(message);
    window.setTimeout(() => setSaveNotice(null), 2600);
  }, []);

  const goEditorIfNeeded = useCallback(() => {
    if (parseAppRoute(window.location).kind !== 'editor') {
      navigateToEditor(true);
    }
  }, []);

  const persistProjectById = useCallback(
    async (
      id: string,
      name: string,
      opts?: {
        announce?: boolean;
        savedOnce?: boolean;
        molecule?: Molecule;
        refresh?: boolean;
        skipThumbnail?: boolean;
        folderId?: string | null;
      },
    ) => {
      const molecule = opts?.molecule ?? editorStore.getMolecule();
      const savedOnce = opts?.savedOnce ?? savedOnceByTabRef.current.get(id) ?? savedOnceRef.current;
      if (!opts?.molecule && !moleculeHasProjectContent(molecule) && !savedOnce) {
        const existing = await getProject(id);
        if (shouldKeepStoredMolecule(molecule, existing?.molecule, savedOnce)) return;
      }
      const storedMol = cloneMolecule(molecule);
      moleculeCacheRef.current.set(id, storedMol);
      const isOpenTab = openTabsRef.current.some(t => t.id === id) || id === projectIdRef.current;
      // Open / working tabs always upsert so My Designs lists the current canvas,
      // including empty untitled files. Background records still skip blanks.
      if (!moleculeHasProjectContent(molecule) && !savedOnce && !isOpenTab) return;
      const trimmedName = name.trim() || defaultProjectName(molecule);
      let folderId = opts?.folderId ?? folderIdByProjectRef.current.get(id);
      if (folderId === undefined) {
        const existing = await getProject(id);
        folderId = existing?.folderId ?? null;
        if (existing?.thumbnailDataUrl) {
          thumbnailByProjectRef.current.set(id, existing.thumbnailDataUrl);
        }
        folderIdByProjectRef.current.set(id, folderId);
      }
      const thumbnailDataUrl = opts?.skipThumbnail
        ? thumbnailByProjectRef.current.get(id)
        : renderProjectThumbnailDataUrl(molecule) ?? thumbnailByProjectRef.current.get(id);
      const record = buildProjectRecord(id, trimmedName, storedMol, {
        folderId,
        thumbnailDataUrl,
      });
      const allowEmptySnapshot =
        !moleculeHasProjectContent(storedMol) &&
        (savedOnce || (savedOnceByTabRef.current.get(id) ?? false));
      try {
        await saveProjectRecord(record);
      } catch (err) {
        console.warn('[useProjectPersistence] saveProjectRecord failed', err);
        setSaveNotice('Could not save locally in this browser (private window, blocked storage, or quota).');
        throw err;
      }
      rememberMeta(record);
      savedOnceByTabRef.current.set(id, true);
      if (id === projectIdRef.current) {
        setProjectName(record.name);
        savedOnceRef.current = true;
        writeWorkingDocumentSnapshot(
          {
            tabs: openTabsRef.current.map(t => (t.id === id ? { ...t, name: record.name } : t)),
            activeTabId: id,
            name: record.name,
            molecule: storedMol,
            savedAt: Date.now(),
          },
          // Clear canvas must replace a prior drawn snapshot; otherwise refresh restores it.
          { allowEmpty: allowEmptySnapshot },
        );
      }
      setOpenTabs(prev => {
        const next = prev.map(t => (t.id === id ? { ...t, name: record.name } : t));
        syncTabsSession(next, projectIdRef.current);
        return next;
      });
      if (opts?.refresh !== false) void refreshLibrary();
      if (opts?.announce !== false) showSavedNotice();
    },
    [editorStore, refreshLibrary, showSavedNotice, syncTabsSession],
  );

  const captureWorkingSnapshot = useCallback(() => {
    const currentId = projectIdRef.current;
    const molecule = cloneMolecule(editorStore.getMolecule());
    const tabs = openTabsRef.current.length
      ? openTabsRef.current
      : [{ id: currentId, name: projectNameRef.current || 'Untitled design' }];
    const allowEmpty =
      savedOnceRef.current || (savedOnceByTabRef.current.get(currentId) ?? false);
    writeWorkingDocumentSnapshot(
      {
        tabs,
        activeTabId: currentId,
        name: projectNameRef.current,
        molecule,
        savedAt: Date.now(),
      },
      { allowEmpty: allowEmpty && !moleculeHasProjectContent(molecule) },
    );
    syncTabsSession(openTabsRef.current.length ? openTabsRef.current : tabs, currentId);
  }, [editorStore, syncTabsSession]);

  /** After Clear: immediately wipe IndexedDB + working snapshot for the active design. */
  const persistClearedDocument = useCallback(async () => {
    const id = projectIdRef.current;
    const name = projectNameRef.current;
    const empty = cloneMolecule(editorStore.getMolecule());
    savedOnceRef.current = true;
    savedOnceByTabRef.current.set(id, true);
    moleculeCacheRef.current.set(id, empty);
    // Cleared empty docs must stay empty across refresh — never re-offer the demo molecule.
    markStartupSeedConsumed();
    writeWorkingDocumentSnapshot(
      {
        tabs: openTabsRef.current.length
          ? openTabsRef.current
          : [{ id, name: name || 'Untitled design' }],
        activeTabId: id,
        name,
        molecule: empty,
        savedAt: Date.now(),
      },
      { allowEmpty: true },
    );
    await persistProjectById(id, name, {
      molecule: empty,
      savedOnce: true,
      announce: false,
      refresh: true,
    });
  }, [editorStore, persistProjectById]);

  const persistAllOpenTabs = useCallback(
    async (opts?: { skipThumbnail?: boolean; refresh?: boolean }) => {
      let currentId = projectIdRef.current;
      let currentMol = cloneMolecule(editorStore.getMolecule());
      if (!moleculeHasProjectContent(currentMol) && !savedOnceRef.current) {
        const existing = await getProject(currentId);
        if (existing && moleculeHasProjectContent(existing.molecule)) {
          currentMol = cloneMolecule(existing.molecule);
          if (!moleculeHasProjectContent(editorStore.getMolecule())) {
            editorStore.resetMolecule(cloneMolecule(existing.molecule));
            setProjectName(existing.name);
            projectNameRef.current = existing.name;
          }
        } else {
          const snap = readWorkingDocumentSnapshot();
          if (snap && moleculeHasProjectContent(snap.molecule)) {
            currentMol = cloneMolecule(snap.molecule);
            if (snap.activeTabId !== currentId) {
              openTabsRef.current = snap.tabs;
              projectIdRef.current = snap.activeTabId;
              projectNameRef.current = snap.name;
              currentId = snap.activeTabId;
              setOpenTabs(snap.tabs);
              setProjectId(snap.activeTabId);
              setProjectName(snap.name);
              syncTabsSession(snap.tabs, snap.activeTabId);
              editorStore.resetMolecule(cloneMolecule(snap.molecule));
            }
          }
        }
      }
      moleculeCacheRef.current.set(currentId, currentMol);
      writeWorkingDocumentSnapshot(
        {
          tabs: openTabsRef.current,
          activeTabId: currentId,
          name: projectNameRef.current,
          molecule: currentMol,
          savedAt: Date.now(),
        },
        {
          allowEmpty:
            !moleculeHasProjectContent(currentMol) &&
            (savedOnceRef.current || (savedOnceByTabRef.current.get(currentId) ?? false)),
        },
      );
      const records: SavedProject[] = [];
      for (const tab of openTabsRef.current) {
        let molecule = tab.id === currentId ? currentMol : moleculeCacheRef.current.get(tab.id);
        if (!molecule) {
          const saved = await getProject(tab.id);
          if (saved?.molecule) {
            molecule = cloneMolecule(saved.molecule);
            moleculeCacheRef.current.set(tab.id, molecule);
            if (saved.folderId != null) folderIdByProjectRef.current.set(tab.id, saved.folderId);
            if (saved.thumbnailDataUrl) thumbnailByProjectRef.current.set(tab.id, saved.thumbnailDataUrl);
          } else {
            molecule = { atoms: [], bonds: [] };
          }
        }
        const name = (tab.id === currentId ? projectNameRef.current : tab.name).trim()
          || defaultProjectName(molecule);
        let folderId = folderIdByProjectRef.current.get(tab.id);
        if (folderId === undefined) folderId = null;
        const thumbnailDataUrl = opts?.skipThumbnail
          ? thumbnailByProjectRef.current.get(tab.id)
          : renderProjectThumbnailDataUrl(molecule) ?? thumbnailByProjectRef.current.get(tab.id);
        const record = buildProjectRecord(tab.id, name, molecule, { folderId, thumbnailDataUrl });
        records.push(record);
      }
      if (records.length > 0) {
        try {
          await saveProjectRecords(records);
        } catch (err) {
          console.warn('[useProjectPersistence] saveProjectRecords failed', err);
          setSaveNotice('Could not save locally in this browser (private window, blocked storage, or quota).');
          throw err;
        }
        for (const record of records) {
          rememberMeta(record);
          savedOnceByTabRef.current.set(record.id, true);
          moleculeCacheRef.current.set(record.id, cloneMolecule(record.molecule));
        }
        if (records.some(r => r.id === currentId)) savedOnceRef.current = true;
      }
      if (opts?.refresh !== false) await refreshLibrary();
    },
    [editorStore, refreshLibrary, syncTabsSession],
  );

  const flushWorkingDocument = useCallback(async () => {
    captureWorkingSnapshot();
    try {
      await persistAllOpenTabs({ skipThumbnail: true, refresh: false });
    } catch (err) {
      console.warn('[useProjectPersistence] auth leave persist failed', err);
    }
  }, [captureWorkingSnapshot, persistAllOpenTabs]);

  const flushOpenTabsAndRefresh = useCallback(async () => {
    try {
      await persistAllOpenTabs({ refresh: false });
    } catch (err) {
      console.warn('[useProjectPersistence] flush library failed', err);
    }
    await refreshLibrary();
  }, [persistAllOpenTabs, refreshLibrary]);

  const persistCurrent = useCallback(
    async (opts?: { name?: string; announce?: boolean }) => {
      const id = projectIdRef.current;
      const name = opts?.name ?? projectNameRef.current;
      await persistProjectById(id, name, {
        announce: opts?.announce,
        savedOnce: savedOnceRef.current,
      });
    },
    [persistProjectById],
  );

  const saveProject = useCallback(async () => {
    await persistCurrent({ announce: true });
  }, [persistCurrent]);

  const loadTabIntoEditor = useCallback(
    async (tab: DocumentTab) => {
      const cached = moleculeCacheRef.current.get(tab.id);
      if (cached) {
        editorStore.resetMolecule(cloneMolecule(cached));
        setProjectId(tab.id);
        setProjectName(tab.name);
        savedOnceRef.current = savedOnceByTabRef.current.get(tab.id) ?? false;
        return;
      }
      setProjectId(tab.id);
      setProjectName(tab.name);
      savedOnceRef.current = savedOnceByTabRef.current.get(tab.id) ?? false;
      try {
        const saved = await getProject(tab.id);
        if (projectIdRef.current !== tab.id) return;
        const mol = saved?.molecule ?? { atoms: [], bonds: [] };
        moleculeCacheRef.current.set(tab.id, cloneMolecule(mol));
        editorStore.resetMolecule(mol);
        setProjectName(saved?.name ?? tab.name);
        savedOnceRef.current = savedOnceByTabRef.current.get(tab.id) ?? !!saved;
      } catch {
        editorStore.resetMolecule({ atoms: [], bonds: [] });
      }
    },
    [editorStore],
  );

  const switchTab = useCallback(
    async (id: string) => {
      if (id === projectIdRef.current) return;
      const target = openTabsRef.current.find(t => t.id === id);
      if (!target) return;
      const currentId = projectIdRef.current;
      const snapshot = editorStore.getMolecule();
      const snapshotName = projectNameRef.current;
      const snapshotSavedOnce = savedOnceRef.current;
      projectIdRef.current = id;
      moleculeCacheRef.current.set(currentId, cloneMolecule(snapshot));
      void persistProjectById(currentId, snapshotName, {
        announce: false,
        savedOnce: snapshotSavedOnce,
        molecule: snapshot,
      }).catch(() => {
        /* IndexedDB can stall on the published site; still switch tabs. */
      });
      const cached = moleculeCacheRef.current.get(id);
      if (cached) {
        editorStore.resetMolecule(cloneMolecule(cached));
        setProjectId(id);
        setProjectName(target.name);
        savedOnceRef.current = savedOnceByTabRef.current.get(id) ?? false;
      } else {
        editorStore.resetMolecule({ atoms: [], bonds: [] });
        setProjectId(id);
        setProjectName(target.name);
        savedOnceRef.current = savedOnceByTabRef.current.get(id) ?? false;
        void getProject(id)
          .then(saved => {
            if (projectIdRef.current !== id) return;
            const mol = saved?.molecule ?? { atoms: [], bonds: [] };
            moleculeCacheRef.current.set(id, cloneMolecule(mol));
            editorStore.resetMolecule(mol);
            setProjectName(saved?.name ?? target.name);
            savedOnceRef.current = savedOnceByTabRef.current.get(id) ?? !!saved;
          })
          .catch(() => {
            /* empty tab is better than a hung switch */
          });
      }
      syncTabsSession(openTabsRef.current, id);
      goEditorIfNeeded();
    },
    [editorStore, goEditorIfNeeded, persistProjectById, syncTabsSession],
  );

  const newProject = useCallback(
    async (folderId: string | null = null) => {
      const priorId = projectIdRef.current;
      const priorName = projectNameRef.current;
      try {
        await persistProjectById(priorId, priorName, {
          announce: false,
          savedOnce: savedOnceRef.current,
        });
      } catch {
        /* still open a new tab if autosave fails */
      }

      const id = crypto.randomUUID();
      const newTab: DocumentTab = { id, name: 'Untitled design' };

      projectIdRef.current = id;
      projectNameRef.current = 'Untitled design';
      savedOnceRef.current = false;
      savedOnceByTabRef.current.set(id, false);
      moleculeCacheRef.current.set(id, { atoms: [], bonds: [] });

      setOpenTabs(prev => {
        const next = [...prev, newTab];
        openTabsRef.current = next;
        syncTabsSession(next, id);
        return next;
      });
      setProjectId(id);
      setProjectName('Untitled design');

      editorStore.resetMolecule();

      if (folderId) {
        const record = buildProjectRecord(id, 'Untitled design', editorStore.getMolecule(), {
          folderId,
        });
        try {
          await saveProjectRecord(record);
          void refreshLibrary();
        } catch {
          /* library folder save is optional */
        }
      }
      goEditorIfNeeded();
    },
    [editorStore, goEditorIfNeeded, persistProjectById, refreshLibrary, syncTabsSession],
  );

  const openProject = useCallback(
    async (id: string) => {
      const existing = openTabsRef.current.find(t => t.id === id);
      if (existing) {
        await switchTab(id);
        return;
      }
      await persistCurrent({ announce: false });
      const saved = await getProject(id);
      if (!saved) return;
      const newTab: DocumentTab = { id, name: saved.name };
      moleculeCacheRef.current.set(id, cloneMolecule(saved.molecule));
      editorStore.resetMolecule(saved.molecule);
      setOpenTabs(prev => {
        const next = [...prev, newTab];
        syncTabsSession(next, id);
        return next;
      });
      setProjectId(id);
      setProjectName(saved.name);
      savedOnceRef.current = true;
      savedOnceByTabRef.current.set(id, true);
      goEditorIfNeeded();
    },
    [editorStore, goEditorIfNeeded, persistCurrent, switchTab, syncTabsSession],
  );

  const closeTab = useCallback(
    async (id: string) => {
      const tabs = openTabsRef.current;
      const activeId = projectIdRef.current;
      if (id === activeId) {
        moleculeCacheRef.current.set(activeId, cloneMolecule(editorStore.getMolecule()));
        void persistCurrent({ announce: false });
      }
      moleculeCacheRef.current.delete(id);
      let nextTabs = tabs.filter(t => t.id !== id);
      if (nextTabs.length === 0) {
        const newId = crypto.randomUUID();
        nextTabs = [{ id: newId, name: 'Untitled design' }];
        editorStore.resetMolecule();
        setProjectId(newId);
        setProjectName('Untitled design');
        savedOnceRef.current = false;
        savedOnceByTabRef.current.set(newId, false);
        setOpenTabs(nextTabs);
        syncTabsSession(nextTabs, newId);
        goEditorIfNeeded();
        return;
      }
      setOpenTabs(nextTabs);
      if (id === activeId) {
        const closedIdx = tabs.findIndex(t => t.id === id);
        const nextActive = nextTabs[Math.min(closedIdx, nextTabs.length - 1)]!;
        syncTabsSession(nextTabs, nextActive.id);
        await loadTabIntoEditor(nextActive);
      } else {
        syncTabsSession(nextTabs, activeId);
      }
      goEditorIfNeeded();
    },
    [editorStore, goEditorIfNeeded, loadTabIntoEditor, persistCurrent, syncTabsSession],
  );

  const deleteProject = useCallback(
    async (id: string) => {
      await deleteProjectRecord(id);
      const tabs = openTabsRef.current.filter(t => t.id !== id);
      if (tabs.length === 0) {
        const newId = crypto.randomUUID();
        editorStore.resetMolecule();
        const nextTabs = [{ id: newId, name: 'Untitled design' }];
        setOpenTabs(nextTabs);
        setProjectId(newId);
        setProjectName('Untitled design');
        savedOnceRef.current = false;
        syncTabsSession(nextTabs, newId);
      } else if (id === projectIdRef.current) {
        const nextActive = tabs[0]!;
        setOpenTabs(tabs);
        syncTabsSession(tabs, nextActive.id);
        await loadTabIntoEditor(nextActive);
      } else {
        setOpenTabs(tabs);
        syncTabsSession(tabs, projectIdRef.current);
      }
      void refreshLibrary();
    },
    [editorStore, loadTabIntoEditor, refreshLibrary, syncTabsSession],
  );

  const deleteProjects = useCallback(
    async (ids: string[]) => {
      await deleteProjectRecords(ids);
      const idSet = new Set(ids);
      let tabs = openTabsRef.current.filter(t => !idSet.has(t.id));
      if (tabs.length === 0) {
        const newId = crypto.randomUUID();
        editorStore.resetMolecule();
        tabs = [{ id: newId, name: 'Untitled design' }];
        setOpenTabs(tabs);
        setProjectId(newId);
        setProjectName('Untitled design');
        savedOnceRef.current = false;
        syncTabsSession(tabs, newId);
      } else if (idSet.has(projectIdRef.current)) {
        const nextActive = tabs[0]!;
        setOpenTabs(tabs);
        syncTabsSession(tabs, nextActive.id);
        await loadTabIntoEditor(nextActive);
      } else {
        setOpenTabs(tabs);
        syncTabsSession(tabs, projectIdRef.current);
      }
      void refreshLibrary();
    },
    [editorStore, loadTabIntoEditor, refreshLibrary, syncTabsSession],
  );

  const duplicateProject = useCallback(
    async (id: string) => {
      try {
        const src = await getProject(id);
        if (!src) {
          showSavedNotice('Could not duplicate — design not found');
          return null;
        }
        const thumb = renderProjectThumbnailDataUrl(src.molecule);
        const taken = new Set((await listProjectMetas()).map(m => m.name));
        const copyName = duplicateProjectName(src.name, taken);
        const copy = await duplicateProjectRecord(id, thumb, copyName);
        await refreshLibrary();
        if (copy) {
          showSavedNotice(`Duplicated as “${copy.name}”`);
        } else {
          showSavedNotice('Could not duplicate design');
        }
        return copy?.id ?? null;
      } catch {
        showSavedNotice('Could not duplicate design');
        return null;
      }
    },
    [refreshLibrary, showSavedNotice],
  );

  const renameProject = useCallback(
    async (name: string, id?: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const targetId = id ?? projectIdRef.current;
      if (targetId === projectIdRef.current) setProjectName(trimmed);
      setOpenTabs(prev => {
        const next = prev.map(t => (t.id === targetId ? { ...t, name: trimmed } : t));
        syncTabsSession(next, projectIdRef.current);
        return next;
      });
      await renameProjectRecord(targetId, trimmed);
      if (targetId === projectIdRef.current) {
        await persistCurrent({ name: trimmed, announce: false });
      } else {
        void refreshLibrary();
      }
    },
    [persistCurrent, refreshLibrary, syncTabsSession],
  );

  const createFolder = useCallback(
    async (name: string, parentId: string | null = null) => {
      const folder = await createFolderRecord(name, parentId);
      void refreshLibrary();
      return folder;
    },
    [refreshLibrary],
  );

  const renameFolder = useCallback(
    async (id: string, name: string) => {
      await renameFolderRecord(id, name);
      void refreshLibrary();
    },
    [refreshLibrary],
  );

  const deleteFolder = useCallback(
    async (id: string) => {
      await deleteFolderRecord(id);
      void refreshLibrary();
    },
    [refreshLibrary],
  );

  const moveProjectsToFolderId = useCallback(
    async (ids: string[], folderId: string | null) => {
      await moveProjectsToFolder(ids, folderId);
      void refreshLibrary();
    },
    [refreshLibrary],
  );

  useEffect(() => {
    syncTabsSession(openTabs, projectId);
  }, [openTabs, projectId, syncTabsSession]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await migrateLegacyMyDesigns();
      } catch (err) {
        console.warn('[useProjectPersistence] legacy My Designs migration failed', err);
      }
      if (!cancelled) await refreshLibrary();
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshLibrary]);

  useEffect(() => {
    if (hydratedRef.current) {
      setInitialHydrationDone(true);
      return;
    }
    hydratedRef.current = true;
    void (async () => {
      try {
        // `/?reaction=` and `/?smiles=` must win over the last IndexedDB design.
        if (urlHasEditorSeedQuery()) return;
        try {
          await migrateLegacyMyDesigns();
        } catch {
          /* already logged above */
        }
        const saved = await getProject(projectId);
        const snapshot = readWorkingDocumentSnapshot();
        const picked = pickHydrationDocument({
          projectId,
          snapshot,
          saved,
          sessionTabs: openTabsRef.current,
        });
        // Any prior local document (including an intentionally empty cleared canvas)
        // means this is not a true first visit — do not re-inject the PubChem demo.
        if (picked) markStartupSeedConsumed();
        if (!picked) return;
        editorStore.resetMolecule(cloneMolecule(picked.molecule));
        moleculeCacheRef.current.set(picked.activeTabId, cloneMolecule(picked.molecule));
        projectIdRef.current = picked.activeTabId;
        projectNameRef.current = picked.name;
        // Prior local doc (drawn or cleared-empty) — allow empty snapshot writes on refresh.
        savedOnceRef.current = true;
        savedOnceByTabRef.current.set(picked.activeTabId, true);
        setProjectId(picked.activeTabId);
        setProjectName(picked.name);
        setOpenTabs(picked.tabs);
        syncTabsSession(picked.tabs, picked.activeTabId);
      } finally {
        setInitialHydrationDone(true);
      }
    })();
  }, [editorStore, projectId, syncTabsSession]);

  useEffect(() => {
    if (!initialHydrationDone || bootUpsertedRef.current) return;
    if (urlHasEditorSeedQuery()) {
      bootUpsertedRef.current = true;
      return;
    }
    bootUpsertedRef.current = true;
    void persistAllOpenTabs({ skipThumbnail: true, refresh: true }).catch(err => {
      console.warn('[useProjectPersistence] boot library upsert failed', err);
    });
  }, [initialHydrationDone, persistAllOpenTabs]);

  useEffect(() => {
    let timer = 0;
    return editorStore.subscribe(() => {
      const id = projectIdRef.current;
      moleculeCacheRef.current.set(id, cloneMolecule(editorStore.getMolecule()));
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void persistCurrent({ announce: false }).catch(() => {
          /* notice already set */
        });
      }, AUTOSAVE_DEBOUNCE_MS);
    });
  }, [editorStore, persistCurrent]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's') return;
      const t = e.target as HTMLElement | null;
      if (t?.isContentEditable) return;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      void saveProject();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saveProject]);

  useEffect(() => {
    const flush = () => {
      captureWorkingSnapshot();
      void persistAllOpenTabs({ skipThumbnail: true, refresh: false });
    };
    const onHidden = () => {
      if (document.visibilityState === 'hidden') {
        captureWorkingSnapshot();
        void persistAllOpenTabs({ skipThumbnail: true, refresh: false });
      }
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, [persistAllOpenTabs, captureWorkingSnapshot]);

  useEffect(() => {
    registerAuthLeavePersist(flushWorkingDocument);
    return () => registerAuthLeavePersist(null);
  }, [flushWorkingDocument]);

  const visibleProjectMetas = useMemo(
    () => mergeLibraryMetasWithOpenTabs(projectMetas, openTabs),
    [projectMetas, openTabs],
  );

  return {
    projectId,
    projectName,
    openTabs,
    activeTabId: projectId,
    projectMetas: visibleProjectMetas,
    folders,
    saveNotice,
    saveProject,
    persistClearedDocument,
    newProject,
    openProject,
    switchTab,
    closeTab,
    deleteProject,
    deleteProjects,
    duplicateProject,
    renameProject,
    createFolder,
    renameFolder,
    deleteFolder,
    moveProjectsToFolder: moveProjectsToFolderId,
    refreshLibrary,
    refreshMetas: flushOpenTabsAndRefresh,
    flushWorkingDocument,
    initialHydrationDone,
  };
}
