import { useCallback, useEffect, useRef, useState } from 'react';
import type { MoleculeEditor } from '@moldraw/core';
import { navigateToEditor } from '../../features/documentation';
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
  const hydratedRef = useRef(false);
  const openTabsRef = useRef(openTabs);
  const projectIdRef = useRef(projectId);
  const projectNameRef = useRef(projectName);

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

  const persistProjectById = useCallback(
    async (
      id: string,
      name: string,
      opts?: { announce?: boolean; savedOnce?: boolean },
    ) => {
      const molecule = editorStore.getMolecule();
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
      const saved = await getProject(tab.id);
      editorStore.resetMolecule(saved?.molecule ?? { atoms: [], bonds: [] });
      setProjectId(tab.id);
      setProjectName(saved?.name ?? tab.name);
      savedOnceRef.current = savedOnceByTabRef.current.get(tab.id) ?? !!saved;
    },
    [editorStore],
  );

  const switchTab = useCallback(
    async (id: string) => {
      if (id === projectIdRef.current) return;
      const currentId = projectIdRef.current;
      await persistProjectById(currentId, projectNameRef.current, {
        announce: false,
        savedOnce: savedOnceRef.current,
      });
      const target = openTabsRef.current.find(t => t.id === id);
      if (!target) return;
      await loadTabIntoEditor(target);
      syncTabsSession(openTabsRef.current, id);
      navigateToEditor();
    },
    [loadTabIntoEditor, persistProjectById, syncTabsSession],
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
      navigateToEditor();
    },
    [editorStore, persistProjectById, refreshLibrary, syncTabsSession],
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
      navigateToEditor();
    },
    [editorStore, persistCurrent, switchTab, syncTabsSession],
  );

  const closeTab = useCallback(
    async (id: string) => {
      const tabs = openTabsRef.current;
      const activeId = projectIdRef.current;
      if (id === activeId) {
        await persistCurrent({ announce: false });
      }
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
        navigateToEditor();
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
      navigateToEditor();
    },
    [editorStore, loadTabIntoEditor, persistCurrent, syncTabsSession],
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
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    void (async () => {
      // Wait a tick so migration can finish writing before hydrating the active tab.
      try {
        await migrateLegacyMyDesigns();
      } catch {
        /* already logged above */
      }
      const saved = await getProject(projectId);
      if (!saved) return;
      editorStore.resetMolecule(saved.molecule);
      setProjectName(saved.name);
      savedOnceRef.current = true;
      savedOnceByTabRef.current.set(projectId, true);
      setOpenTabs(prev =>
        prev.map(t => (t.id === projectId ? { ...t, name: saved.name } : t)),
      );
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
  };
}
