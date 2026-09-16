import { useMemo, useRef, useState, type DragEvent, type PointerEvent } from 'react';
import {
  ArrowLeft,
  CheckSquare,
  Download,
  Folder,
  FolderPlus,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  Search,
  Square,
  Trash2,
} from 'lucide-react';
import type { ProjectFolder, SavedProjectMeta } from '../projects/types';
import { ConfirmDialog } from './ConfirmDialog';
import { DesignLibraryFolderTree } from './DesignLibraryFolderTree';
import {
  DesignLibraryGrid,
  type DesignCardModifiers,
  type DesignLibraryLayout,
} from './DesignLibraryGrid';
import { DesignLibraryStorageNotice } from './DesignLibraryStorageNotice';

export type DesignLibraryViewProps = {
  projects: SavedProjectMeta[];
  folders: ProjectFolder[];
  onOpenProject: (id: string) => void;
  onNewProject?: (folderId?: string | null) => void;
  onDeleteProjects: (ids: string[]) => void | Promise<void>;
  onDuplicateProject: (id: string) => void | Promise<void>;
  onRenameProject: (id: string, name: string) => void | Promise<void>;
  onCreateFolder: (name: string, parentId?: string | null) => void | Promise<void>;
  onRenameFolder: (id: string, name: string) => void | Promise<void>;
  onDeleteFolder: (id: string) => void | Promise<void>;
  onMoveProjectsToFolder: (ids: string[], folderId: string | null) => void | Promise<void>;
  onDownloadProject?: (id: string) => void | Promise<void>;
  onDownloadAll?: (asZip: boolean) => void | Promise<void>;
  onAfterOpen?: () => void;
  variant?: 'page' | 'modal';
};

type PendingDelete =
  | { kind: 'projects'; ids: string[]; label: string }
  | { kind: 'folder'; id: string; name: string };

type MarqueeRect = { x: number; y: number; w: number; h: number };

const MARQUEE_THRESHOLD_PX = 4;

function rectsIntersect(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function shouldIgnoreMarqueeStart(target: EventTarget | null): boolean {
  const el = target instanceof Element ? target : null;
  if (!el) return false;
  if (el.closest('input, textarea, select, [contenteditable="true"]')) return true;
  if (el.closest('.design-library__action, .design-library__check')) return true;
  if (el.closest('.design-library__folder-card, .design-library__folder-tree')) return true;
  return false;
}

export function DesignLibraryView({
  projects,
  folders,
  onOpenProject,
  onNewProject,
  onDeleteProjects,
  onDuplicateProject,
  onRenameProject,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveProjectsToFolder,
  onDownloadProject,
  onDownloadAll,
  onAfterOpen,
  variant = 'page',
}: DesignLibraryViewProps) {
  const [search, setSearch] = useState('');
  const [folderId, setFolderId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [folderRenameDraft, setFolderRenameDraft] = useState('');
  const [draggingIds, setDraggingIds] = useState<string[]>([]);
  const [dropTargetFolderId, setDropTargetFolderId] = useState<string | null | '__root__'>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [downloadAllAsZip, setDownloadAllAsZip] = useState(true);
  const [layout, setLayout] = useState<DesignLibraryLayout>('grid');
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null);

  const libraryRootRef = useRef<HTMLDivElement>(null);
  const gridWrapRef = useRef<HTMLDivElement>(null);
  const selectedIdsRef = useRef(selectedIds);
  const selectModeRef = useRef(selectMode);
  const draggingIdsRef = useRef<string[]>([]);
  const lastClickedIdRef = useRef<string | null>(null);
  const suppressClickRef = useRef(false);
  const marqueeLiveRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    additive: boolean;
    baseline: Set<string>;
    active: boolean;
  } | null>(null);

  selectedIdsRef.current = selectedIds;
  selectModeRef.current = selectMode;
  draggingIdsRef.current = draggingIds;

  const currentFolder = folderId ? folders.find(f => f.id === folderId) ?? null : null;
  const parentFolderId = currentFolder?.parentId ?? null;
  const parentFolder = parentFolderId ? folders.find(f => f.id === parentFolderId) ?? null : null;
  const childFolders = useMemo(
    () => folders.filter(f => f.parentId === folderId).sort((a, b) => a.name.localeCompare(b.name)),
    [folders, folderId],
  );

  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects.filter(p => {
      if (search.trim()) return p.name.toLowerCase().includes(q);
      return p.folderId === folderId;
    });
  }, [projects, search, folderId]);

  const folderNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const folder of folders) map.set(folder.id, folder.name);
    return map;
  }, [folders]);

  const toggleSelect = (id: string) => {
    setSelectMode(true);
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    lastClickedIdRef.current = id;
  };

  const clearSelection = () => setSelectedIds(new Set());

  const selectAllVisible = () => {
    setSelectMode(true);
    setSelectedIds(new Set(filteredProjects.map(p => p.id)));
    lastClickedIdRef.current = filteredProjects[filteredProjects.length - 1]?.id ?? null;
  };

  const handleActivateCard = (id: string, keys: DesignCardModifiers) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setSelectMode(true);
    const ids = filteredProjects.map(p => p.id);
    const additive = keys.ctrlKey || keys.metaKey;
    if (keys.shiftKey && lastClickedIdRef.current) {
      const a = ids.indexOf(lastClickedIdRef.current);
      const b = ids.indexOf(id);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        const slice = ids.slice(lo, hi + 1);
        setSelectedIds(prev => {
          const next = additive ? new Set(prev) : new Set<string>();
          for (const item of slice) next.add(item);
          return next;
        });
        return;
      }
    }
    lastClickedIdRef.current = id;
    if (additive) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      return;
    }
    setSelectedIds(new Set([id]));
  };

  const startRename = (id: string, name: string) => {
    setRenamingId(id);
    setRenameDraft(name);
  };

  const commitRename = async () => {
    if (!renamingId) return;
    const id = renamingId;
    const name = renameDraft;
    setRenamingId(null);
    await onRenameProject(id, name);
  };

  const startFolderRename = (id: string, name: string) => {
    setRenamingFolderId(id);
    setFolderRenameDraft(name);
  };

  const commitFolderRename = async (id: string) => {
    const name = folderRenameDraft.trim();
    setRenamingFolderId(null);
    if (!name) return;
    await onRenameFolder(id, name);
  };

  const handleCreateFolder = async () => {
    const name = window.prompt('Folder name', 'New folder');
    if (!name?.trim()) return;
    await onCreateFolder(name.trim(), folderId);
  };

  const requestDeleteProjects = (ids: string[]) => {
    const label =
      ids.length === 1
        ? (projects.find(p => p.id === ids[0])?.name ?? 'this design')
        : `${ids.length} designs`;
    setPendingDelete({ kind: 'projects', ids, label });
  };

  const requestDeleteFolder = (id: string, name: string) => {
    setPendingDelete({ kind: 'folder', id, name });
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    if (pendingDelete.kind === 'projects') {
      await onDeleteProjects(pendingDelete.ids);
      clearSelection();
      setSelectMode(false);
    } else {
      await onDeleteFolder(pendingDelete.id);
      if (folderId === pendingDelete.id) setFolderId(parentFolderId);
    }
    setPendingDelete(null);
  };

  const handleDuplicateSelected = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    for (const id of ids) {
      await onDuplicateProject(id);
    }
    clearSelection();
  };

  const handleMoveToFolder = async (targetFolderId: string | null, ids: string[]) => {
    if (ids.length === 0) return;
    await onMoveProjectsToFolder(ids, targetFolderId);
    clearSelection();
    draggingIdsRef.current = [];
    setDraggingIds([]);
    setDropTargetFolderId(null);
  };

  const resolveDragIds = (projectId: string): string[] => {
    if (selectedIds.has(projectId) && selectedIds.size > 0) {
      return [...selectedIds];
    }
    return [projectId];
  };

  const onCardDragStart = (projectId: string) => {
    const ids = resolveDragIds(projectId);
    draggingIdsRef.current = ids;
    setDraggingIds(ids);
  };

  const onCardDragEnd = () => {
    draggingIdsRef.current = [];
    setDraggingIds([]);
    setDropTargetFolderId(null);
  };

  const bindFolderDrop = (targetId: string | null) => ({
    onDragOver: (e: DragEvent) => {
      if (draggingIdsRef.current.length === 0) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDropTargetFolderId(targetId ?? '__root__');
    },
    onDragLeave: (e: DragEvent) => {
      const next = e.relatedTarget as Node | null;
      if (next && e.currentTarget.contains(next)) return;
      setDropTargetFolderId(prev => (prev === (targetId ?? '__root__') ? null : prev));
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      const ids = draggingIdsRef.current;
      if (ids.length === 0) return;
      void handleMoveToFolder(targetId, ids);
    },
  });

  const applyMarqueeSelection = (rect: MarqueeRect, additive: boolean, baseline: Set<string>) => {
    const wrap = gridWrapRef.current;
    if (!wrap) return;
    const box = {
      left: rect.x,
      top: rect.y,
      right: rect.x + rect.w,
      bottom: rect.y + rect.h,
    };
    const hit = new Set<string>();
    wrap.querySelectorAll<HTMLElement>('[data-design-card][data-project-id]').forEach(card => {
      const id = card.dataset.projectId;
      if (!id) return;
      const r = card.getBoundingClientRect();
      if (rectsIntersect(box, r)) hit.add(id);
    });
    setSelectedIds(() => {
      if (!additive) return hit;
      const next = new Set(baseline);
      for (const id of hit) next.add(id);
      return next;
    });
  };

  const endMarquee = (e?: PointerEvent<HTMLDivElement>) => {
    const live = marqueeLiveRef.current;
    if (!live) return;
    if (e && live.active) {
      try {
        e.currentTarget.releasePointerCapture(live.pointerId);
      } catch {
        /* already released */
      }
    }
    if (live.active) suppressClickRef.current = true;
    marqueeLiveRef.current = null;
    setMarquee(null);
    document.body.style.removeProperty('user-select');
  };

  const onGridPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (shouldIgnoreMarqueeStart(e.target)) return;
    const card = e.target instanceof Element ? e.target.closest('[data-design-card]') : null;
    const cardId = card instanceof HTMLElement ? card.dataset.projectId : undefined;
    if (cardId && (selectedIdsRef.current.has(cardId) || !selectModeRef.current)) return;
    marqueeLiveRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      additive: e.ctrlKey || e.metaKey || e.shiftKey,
      baseline: new Set(selectedIdsRef.current),
      active: false,
    };
  };

  const onGridPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const live = marqueeLiveRef.current;
    if (!live || live.pointerId !== e.pointerId) return;
    const dx = e.clientX - live.startX;
    const dy = e.clientY - live.startY;
    if (!live.active) {
      if (Math.hypot(dx, dy) < MARQUEE_THRESHOLD_PX) return;
      live.active = true;
      setSelectMode(true);
      document.body.style.userSelect = 'none';
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    e.preventDefault();
    const x = Math.min(live.startX, e.clientX);
    const y = Math.min(live.startY, e.clientY);
    const rect = {
      x,
      y,
      w: Math.abs(e.clientX - live.startX),
      h: Math.abs(e.clientY - live.startY),
    };
    setMarquee(rect);
    applyMarqueeSelection(rect, live.additive, live.baseline);
  };

  const openProject = (id: string) => {
    onOpenProject(id);
    onAfterOpen?.();
  };

  const goBackFromFolder = () => {
    setFolderId(parentFolderId);
  };

  const rootClass =
    variant === 'modal' ? 'design-library design-library--modal' : 'design-library design-library--page';

  const deleteDialog =
    pendingDelete?.kind === 'projects'
      ? {
          title: pendingDelete.ids.length === 1 ? 'Delete design?' : `Delete ${pendingDelete.ids.length} designs?`,
          description: `“${pendingDelete.label}” will be permanently removed from this device. This cannot be undone.`,
          confirmLabel: 'Delete',
        }
      : pendingDelete?.kind === 'folder'
        ? {
            title: 'Delete folder?',
            description: `Folder “${pendingDelete.name}” will be deleted. Designs inside will move to All designs.`,
            confirmLabel: 'Delete folder',
          }
        : null;

  const marqueeStyle = (() => {
    if (!marquee) return undefined;
    const origin = libraryRootRef.current?.getBoundingClientRect();
    if (!origin) return { left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h };
    return {
      left: marquee.x - origin.left,
      top: marquee.y - origin.top,
      width: marquee.w,
      height: marquee.h,
    };
  })();

  return (
    <div className={rootClass} ref={libraryRootRef}>
      <DesignLibraryStorageNotice />

      <div className="design-library__toolbar">
        <div className="design-library__search">
          <Search size={14} aria-hidden />
          <input
            type="search"
            placeholder="Search designs…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search designs"
          />
        </div>
        {onDownloadAll && projects.length > 0 ? (
          <div className="design-library__download-all">
            <label className="design-library__zip-toggle" title="When on, all designs download in one ZIP">
              <input
                type="checkbox"
                checked={downloadAllAsZip}
                onChange={e => setDownloadAllAsZip(e.target.checked)}
              />
              ZIP
            </label>
            <button
              type="button"
              className="design-library__btn"
              title={
                downloadAllAsZip
                  ? 'Download all designs as .moldraw files in one ZIP'
                  : 'Download each design as a separate .moldraw file'
              }
              onClick={() => void onDownloadAll(downloadAllAsZip)}
            >
              <Download size={14} aria-hidden />
              Download all
            </button>
          </div>
        ) : null}
        {onNewProject ? (
          <>
            <button type="button" className="design-library__btn" onClick={() => void handleCreateFolder()}>
              <FolderPlus size={14} aria-hidden />
              New folder
            </button>
            <button type="button" className="design-library__btn design-library__btn--primary" onClick={() => onNewProject(folderId)}>
              <Plus size={14} aria-hidden />
              New project
            </button>
          </>
        ) : (
          <button type="button" className="design-library__btn" onClick={() => void handleCreateFolder()}>
            <FolderPlus size={14} aria-hidden />
            New folder
          </button>
        )}
        <div className="design-library__view-toggle" role="group" aria-label="Design layout">
          <button
            type="button"
            className={`design-library__btn${layout === 'grid' ? ' is-active' : ''}`}
            aria-pressed={layout === 'grid'}
            title="Grid view"
            onClick={() => setLayout('grid')}
          >
            <LayoutGrid size={14} aria-hidden />
          </button>
          <button
            type="button"
            className={`design-library__btn${layout === 'list' ? ' is-active' : ''}`}
            aria-pressed={layout === 'list'}
            title="List view"
            onClick={() => setLayout('list')}
          >
            <List size={14} aria-hidden />
          </button>
        </div>
        <button
          type="button"
          className={`design-library__btn${selectMode ? ' is-active' : ''}`}
          onClick={() => {
            setSelectMode(v => !v);
            clearSelection();
          }}
        >
          {selectMode ? <CheckSquare size={14} aria-hidden /> : <Square size={14} aria-hidden />}
          Select
        </button>
        <div className="design-library__bulk">
          <button
            type="button"
            className="design-library__btn"
            disabled={filteredProjects.length === 0}
            onClick={selectAllVisible}
          >
            Select all
          </button>
          <button
            type="button"
            className="design-library__btn"
            disabled={selectedIds.size === 0}
            onClick={clearSelection}
          >
            Deselect all
          </button>
          <button
            type="button"
            className="design-library__btn"
            disabled={selectedIds.size === 0}
            onClick={() => void handleDuplicateSelected()}
          >
            Duplicate
          </button>
          <button
            type="button"
            className="design-library__btn design-library__btn--danger design-library__btn--count"
            disabled={selectedIds.size === 0}
            onClick={() => requestDeleteProjects([...selectedIds])}
          >
            <Trash2 size={14} aria-hidden />
            Delete{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
          </button>
          {folders.length > 0 ? (
            <select
              className="design-library__move-select"
              defaultValue=""
              disabled={selectedIds.size === 0}
              aria-label="Move to folder"
              onChange={e => {
                const v = e.target.value;
                e.target.value = '';
                if (v === '') return;
                void handleMoveToFolder(v === '__root__' ? null : v, [...selectedIds]);
              }}
            >
              <option value="" disabled>
                Move to…
              </option>
              <option value="__root__">All designs (root)</option>
              {folders.map(f => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </div>

      <div className="design-library__shell">
        <DesignLibraryFolderTree
          folders={folders}
          currentFolderId={folderId}
          dropTargetFolderId={dropTargetFolderId}
          onOpenFolder={setFolderId}
          bindFolderDrop={bindFolderDrop}
        />

        <div className="design-library__main">
          {currentFolder ? (
            <div className="design-library__folder-header">
              <button type="button" className="design-library__back-btn" onClick={goBackFromFolder}>
                <ArrowLeft size={16} aria-hidden />
                {parentFolder ? `Back to ${parentFolder.name}` : 'Back to All designs'}
              </button>
              <div className="design-library__folder-title-wrap">
                <Folder size={16} aria-hidden />
                {renamingFolderId === currentFolder.id ? (
                  <input
                    className="design-library__rename design-library__rename--folder-title"
                    value={folderRenameDraft}
                    autoFocus
                    aria-label="Folder name"
                    onChange={e => setFolderRenameDraft(e.target.value)}
                    onBlur={() => void commitFolderRename(currentFolder.id)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void commitFolderRename(currentFolder.id);
                      }
                      if (e.key === 'Escape') setRenamingFolderId(null);
                    }}
                  />
                ) : (
                  <>
                    <span className="design-library__folder-title" title={currentFolder.name}>
                      {currentFolder.name}
                    </span>
                    <button
                      type="button"
                      className="design-library__folder-rename-btn"
                      aria-label={`Rename folder ${currentFolder.name}`}
                      title="Rename folder"
                      onClick={() => startFolderRename(currentFolder.id, currentFolder.name)}
                    >
                      <Pencil size={14} aria-hidden />
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <nav className="design-library__crumb" aria-label="Location">
              <button
                type="button"
                className={`design-library__crumb-btn is-active${
                  dropTargetFolderId === '__root__' ? ' is-drop-target' : ''
                }`}
                onClick={() => setFolderId(null)}
                {...bindFolderDrop(null)}
              >
                All designs
              </button>
              <span
                className={`design-library__drag-hint${draggingIds.length > 0 ? '' : ' design-library__drag-hint--muted'}`}
              >
                {draggingIds.length > 0
                  ? 'Drop on any folder to move'
                  : 'Drag a box to select · drop designs on a folder'}
              </span>
            </nav>
          )}

          {currentFolder ? (
            <p
              className={`design-library__drag-hint design-library__drag-hint--inline${
                draggingIds.length > 0 ? '' : ' design-library__drag-hint--muted'
              }`}
            >
              {draggingIds.length > 0
                ? 'Drop on any folder to move'
                : 'Drag a box to select · drop designs on a folder'}
            </p>
          ) : null}

          <div
            ref={gridWrapRef}
            className={`design-library__content${marquee ? ' is-marqueeing' : ''}`}
            onPointerDown={onGridPointerDown}
            onPointerMove={onGridPointerMove}
            onPointerUp={endMarquee}
            onPointerCancel={endMarquee}
          >
            {!search.trim() && childFolders.length > 0 ? (
              <ul className="design-library__folder-list">
                {childFolders.map(folder => (
                  <li
                    key={folder.id}
                    className={`design-library__folder-card${
                      dropTargetFolderId === folder.id ? ' is-drop-target' : ''
                    }`}
                    {...bindFolderDrop(folder.id)}
                  >
                    {renamingFolderId === folder.id ? (
                      <input
                        className="design-library__rename"
                        value={folderRenameDraft}
                        autoFocus
                        aria-label="Folder name"
                        onChange={e => setFolderRenameDraft(e.target.value)}
                        onBlur={() => void commitFolderRename(folder.id)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void commitFolderRename(folder.id);
                          }
                          if (e.key === 'Escape') setRenamingFolderId(null);
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className="design-library__folder-open"
                        onClick={() => setFolderId(folder.id)}
                        title={folder.name}
                      >
                        <Folder size={16} aria-hidden />
                        <span>{folder.name}</span>
                      </button>
                    )}
                    <div className="design-library__folder-actions">
                      <button
                        type="button"
                        className="design-library__action"
                        title="Rename folder"
                        aria-label={`Rename folder ${folder.name}`}
                        onClick={() => startFolderRename(folder.id, folder.name)}
                      >
                        <Pencil size={13} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="design-library__action design-library__action--danger"
                        title="Delete folder"
                        aria-label={`Delete folder ${folder.name}`}
                        onClick={() => requestDeleteFolder(folder.id, folder.name)}
                      >
                        <Trash2 size={13} aria-hidden />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}

            <DesignLibraryGrid
              projects={filteredProjects}
              folderNameById={folderNameById}
              layout={layout}
              selectedIds={selectedIds}
              selectMode={selectMode}
              renamingId={renamingId}
              renameDraft={renameDraft}
              draggingIds={draggingIds}
              onRenameDraftChange={setRenameDraft}
              onStartRename={startRename}
              onCommitRename={() => void commitRename()}
              onCancelRename={() => setRenamingId(null)}
              onOpen={openProject}
              onActivate={handleActivateCard}
              onToggleSelect={toggleSelect}
              onDuplicate={id => void onDuplicateProject(id)}
              onDelete={id => requestDeleteProjects([id])}
              onDownload={onDownloadProject ? id => void onDownloadProject(id) : undefined}
              onDragStart={onCardDragStart}
              onDragEnd={onCardDragEnd}
              emptyMessage={
                search.trim()
                  ? 'No designs match your search.'
                  : 'No designs in this folder yet. Create one or draw on the canvas — edits auto-save here.'
              }
            />
          </div>
        </div>
      </div>

      <div className="design-library__marquee-layer" aria-hidden>
        {marquee && marqueeStyle ? <div className="design-library__marquee" style={marqueeStyle} /> : null}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={deleteDialog?.title ?? ''}
        description={deleteDialog?.description ?? ''}
        confirmLabel={deleteDialog?.confirmLabel ?? 'Delete'}
        danger
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void handleConfirmDelete()}
      />
    </div>
  );
}
