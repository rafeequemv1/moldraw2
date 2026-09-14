import { useMemo, useState, type DragEvent } from 'react';
import {
  ArrowLeft,
  CheckSquare,
  Download,
  Folder,
  FolderPlus,
  Pencil,
  Plus,
  Search,
  Square,
  Trash2,
} from 'lucide-react';
import type { ProjectFolder, SavedProjectMeta } from '../projects/types';
import { ConfirmDialog } from './ConfirmDialog';
import { DesignLibraryGrid } from './DesignLibraryGrid';
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

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

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
    setDraggingIds([]);
    setDropTargetFolderId(null);
  };

  const resolveDragIds = (projectId: string): string[] => {
    if (selectMode && selectedIds.has(projectId) && selectedIds.size > 0) {
      return [...selectedIds];
    }
    return [projectId];
  };

  const onCardDragStart = (projectId: string) => {
    setDraggingIds(resolveDragIds(projectId));
  };

  const onCardDragEnd = () => {
    setDraggingIds([]);
    setDropTargetFolderId(null);
  };

  const bindFolderDrop = (targetId: string | null) => ({
    onDragOver: (e: DragEvent) => {
      if (draggingIds.length === 0) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDropTargetFolderId(targetId ?? '__root__');
    },
    onDragLeave: () => {
      setDropTargetFolderId(prev => (prev === (targetId ?? '__root__') ? null : prev));
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      if (draggingIds.length === 0) return;
      void handleMoveToFolder(targetId, draggingIds);
    },
  });

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

  return (
    <div className={rootClass}>
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
        {selectMode && selectedIds.size > 0 ? (
          <>
            <button
              type="button"
              className="design-library__btn"
              disabled={selectedIds.size === 0}
              onClick={() => void handleDuplicateSelected()}
            >
              Duplicate{selectedIds.size > 1 ? ` (${selectedIds.size})` : ''}
            </button>
            <button
              type="button"
              className="design-library__btn design-library__btn--danger"
              onClick={() => requestDeleteProjects([...selectedIds])}
            >
              <Trash2 size={14} aria-hidden />
              Delete ({selectedIds.size})
            </button>
            {folders.length > 0 ? (
              <select
                className="design-library__move-select"
                defaultValue=""
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
          </>
        ) : null}
      </div>

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
          {draggingIds.length > 0 ? (
            <span className="design-library__drag-hint">Drop on a folder to move</span>
          ) : null}
        </nav>
      )}

      {currentFolder && draggingIds.length > 0 ? (
        <p className="design-library__drag-hint design-library__drag-hint--inline">Drop on a folder to move</p>
      ) : null}

      <div className="design-library__content">
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
