import { useEffect, useRef } from 'react';
import { Copy, Download, FolderOpen, Pencil, Trash2 } from 'lucide-react';
import type { SavedProjectMeta } from '../projects/types';

export type DesignLibraryGridProps = {
  projects: SavedProjectMeta[];
  selectedIds: Set<string>;
  selectMode: boolean;
  renamingId: string | null;
  renameDraft: string;
  draggingIds: string[];
  onRenameDraftChange: (v: string) => void;
  onStartRename: (id: string, name: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onOpen: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onDownload?: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  emptyMessage?: string;
};

function formatWhen(ts: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(ts);
  } catch {
    return new Date(ts).toLocaleString();
  }
}

export function DesignLibraryGrid({
  projects,
  selectedIds,
  selectMode,
  renamingId,
  renameDraft,
  draggingIds,
  onRenameDraftChange,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onOpen,
  onToggleSelect,
  onDuplicate,
  onDelete,
  onDownload,
  onDragStart,
  onDragEnd,
  emptyMessage = 'No designs here yet.',
}: DesignLibraryGridProps) {
  if (projects.length === 0) {
    return (
      <div className="design-library__empty">
        <FolderOpen size={28} strokeWidth={1.5} aria-hidden />
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <ul className="design-library__grid">
      {projects.map(project => {
        const selected = selectedIds.has(project.id);
        const renaming = renamingId === project.id;
        const dragging = draggingIds.includes(project.id);
        return (
          <li
            key={project.id}
            className={[
              'design-library__card',
              selected ? 'design-library__card--selected' : '',
              dragging ? 'design-library__card--dragging' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            draggable={!renaming}
            onDragStart={e => {
              onDragStart(project.id);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', project.id);
            }}
            onDragEnd={onDragEnd}
          >
            {(selectMode || selected) && (
              <label className="design-library__check">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onToggleSelect(project.id)}
                  aria-label={`Select ${project.name}`}
                />
              </label>
            )}
            <button
              type="button"
              className="design-library__preview"
              onClick={() => onOpen(project.id)}
              aria-label={`Open ${project.name}`}
            >
              {project.thumbnailDataUrl ? (
                <img src={project.thumbnailDataUrl} alt="" className="design-library__thumb" draggable={false} />
              ) : (
                <div className="design-library__thumb design-library__thumb--empty">
                  <FolderOpen size={22} strokeWidth={1.5} aria-hidden />
                </div>
              )}
            </button>
            <div className="design-library__body">
              {renaming ? (
                <RenameInline
                  value={renameDraft}
                  onChange={onRenameDraftChange}
                  onCommit={onCommitRename}
                  onCancel={onCancelRename}
                />
              ) : (
                <button
                  type="button"
                  className="design-library__name"
                  onClick={() => onOpen(project.id)}
                  onDoubleClick={e => {
                    e.preventDefault();
                    onStartRename(project.id, project.name);
                  }}
                  title={project.name}
                >
                  {project.name}
                </button>
              )}
              <p className="design-library__meta">
                {project.atomCount} atom{project.atomCount === 1 ? '' : 's'} · {formatWhen(project.updatedAt)}
              </p>
            </div>
            <div className="design-library__actions">
              {onDownload ? (
                <button
                  type="button"
                  className="design-library__action"
                  title="Download Moldraw file (.moldraw) — entire canvas"
                  aria-label={`Download ${project.name} as .moldraw`}
                  onClick={e => {
                    e.stopPropagation();
                    onDownload(project.id);
                  }}
                >
                  <Download size={13} aria-hidden />
                </button>
              ) : null}
              <button
                type="button"
                className="design-library__action"
                title="Rename"
                aria-label={`Rename ${project.name}`}
                onClick={e => {
                  e.stopPropagation();
                  onStartRename(project.id, project.name);
                }}
              >
                <Pencil size={13} aria-hidden />
              </button>
              <button
                type="button"
                className="design-library__action"
                title="Duplicate"
                aria-label={`Duplicate ${project.name}`}
                onClick={e => {
                  e.stopPropagation();
                  onDuplicate(project.id);
                }}
              >
                <Copy size={13} aria-hidden />
              </button>
              <button
                type="button"
                className="design-library__action design-library__action--danger"
                title="Delete"
                aria-label={`Delete ${project.name}`}
                onClick={e => {
                  e.stopPropagation();
                  onDelete(project.id);
                }}
              >
                <Trash2 size={13} aria-hidden />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function RenameInline({
  value,
  onChange,
  onCommit,
  onCancel,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      className="design-library__rename"
      value={value}
      onChange={e => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onCommit();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
    />
  );
}
