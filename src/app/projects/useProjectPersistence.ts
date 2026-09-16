import { useCallback, useEffect, useRef, useState } from 'react';
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
} from './projectStorage';
import { migrateLegacyMyDesigns } from './migrateLegacyMyDesigns';
import { renderProjectThumbnailDataUrl } from './projectThumbnail';
import {
  readOpenTabsSession,
  readSessionProjectId,
  writeOpenTabsSession,
} from './tabSession';
import type { DocumentTab, ProjectFolder, SavedProjectMeta } from './types';

function urlHasEditorSeedQuery(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return Boolean(params.get('reaction')?.trim() || params.get('smiles')?.trim());
}

export function useProjectPersistence(editorStore: MoleculeEditor) {
  const tabsSession = readOpenTabsSession();
  const fallbackId = readSessionProjectId() ?? crypto.randomUUID();
  const initialActiveId = tabsSession?.activeTabId ?? fallbackId;
  const initialTabs: DocumentTab[] = tabsSession?.tabs ?? [
    { id: initialActiveId, name: 'Untitled design' },
  ];

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
  const hydratedRef = useRef(false);
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

  const refreshLibrary = useCallback(async () => {
    const [metas, folderList] = await Promise.all([listProjectMetas(), listFolders()]);
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
      opts?: { announce?: boolean; savedOnce?: boolean; molecule?: Molecule },
    ) => {
      const molecule = opts?.molecule ?? editorStore.getMolecule();
      moleculeCacheRef.current.set(id, cloneMolecule(molecule));
      const savedOnce = opts?.savedOnce ?? savedOnceByTabRef.current.get(id) ?? savedOnceRef.current;
      if (!moleculeHasProjectContent(molecule) && !savedOnce) return;
      const trimmedName = name.trim() || defaultProjectName(molecule);
      const existing = await getProject(id);
      const thumbnailDataUrl =
        renderProjectThumbnailDataUrl(molecule) ?? existing?.thumbnailDataUrl;
      const record = buildProjectRecord(id, trimmedName, molecule, {
        folderId: existing?.folderId ?? null,
        thumbnailDataUrl,
      });
      await saveProjectRecord(record);
      savedOnceByTabRef.current.set(id, true);
      if (id === projectIdRef.current) {
        setProjectName(record.name);
        savedOnceRef.current = true;
      }
      setOpenTabs(prev => {
        const next = prev.map(t => (t.id === id ? { ...t, name: record.name } : t));
        syncTabsSession(next, projectIdRef.current);
        return next;
      });
      void refreshLibrary();
      if (opts?.announce !== false) showSavedNotice();
    },
    [editorStore, refreshLibrary, showSavedNotice, syncTabsSession],
  );

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
        if (!saved || !moleculeHasProjectContent(saved.molecule)) return;
        editorStore.resetMolecule(saved.molecule);
        setProjectName(saved.name);
        savedOnceRef.current = true;
        savedOnceByTabRef.current.set(projectId, true);
        setOpenTabs(prev =>
          prev.map(t => (t.id === projectId ? { ...t, name: saved.name } : t)),
        );
      } finally {
        setInitialHydrationDone(true);
      }
    })();
  }, [editorStore, projectId]);

  useEffect(() => {
    let timer = 0;
    return editorStore.subscribe(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void persistCurrent({ announce: false });
      }, 4000);
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
      void persistCurrent({ announce: false });
    };
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, [persistCurrent]);

  return {
    projectId,
    projectName,
    openTabs,
    activeTabId: projectId,
    projectMetas,
    folders,
    saveNotice,
    saveProject,
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
    refreshMetas: refreshLibrary,
    initialHydrationDone,
  };
}
