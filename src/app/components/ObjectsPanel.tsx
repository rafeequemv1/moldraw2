/**
 * Objects panel: collections (folders), rename, drag-reorder, move up/down, visibility.
 */
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  FolderPlus,
  GripVertical,
  List,
  Trash2,
  X,
  ChevronUp,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Molecule } from '@moldraw/domain';
import {
  CMD,
  discoverOutlineObjects,
  resolveOutlineRows,
  type ResolvedOutlineRow,
} from '@moldraw/core';
import type { HiddenCanvasIds } from '@moldraw/canvas';
import '../../styles/objects-panel.css';
import { useChromeOverlay } from '../chromeDismiss';

const ROW_HEIGHT = 28;
const OVERSCAN = 8;

export interface ObjectsPanelProps {
  molecule: Molecule;
  hiddenIds: HiddenCanvasIds;
  onToggleHidden: (id: string) => void;
  onCommand: (commandId: string, input: unknown) => void;
  onSelectMolecule: (atomIds: string[]) => void;
  onSelectArrow: (id: string) => void;
  onSelectText: (id: string) => void;
  onSelectImage: (id: string) => void;
  onSelectShape: (id: string) => void;
  onClose: () => void;
  /** `sheet` — fills a mobile bottom sheet (no absolute dock). */
  variant?: 'dock' | 'sheet';
}

function deleteInputForRow(row: {
  isCollection: boolean;
  collectionId?: string;
  objectKind?: string;
  atomIds?: string[];
  annotationId?: string;
}): { commandId: string; input: unknown } | null {
  if (row.isCollection && row.collectionId) {
    return {
      commandId: CMD.DeleteObjectCollection,
      input: { collectionId: row.collectionId, deleteContents: true },
    };
  }
  switch (row.objectKind) {
    case 'Mol':
      return row.atomIds?.length
        ? { commandId: CMD.DeleteAtoms, input: { atomIds: row.atomIds } }
        : null;
    case 'Arrow':
      return row.annotationId
        ? { commandId: CMD.DeleteReactionArrow, input: { id: row.annotationId } }
        : null;
    case 'Text':
      return row.annotationId
        ? { commandId: CMD.DeleteCanvasText, input: { id: row.annotationId } }
        : null;
    case 'Shape':
      return row.annotationId
        ? { commandId: CMD.DeleteCanvasShape, input: { id: row.annotationId } }
        : null;
    case 'Image':
      return row.annotationId
        ? { commandId: CMD.DeleteCanvasImage, input: { id: row.annotationId } }
        : null;
    case 'Stroke':
      return row.annotationId
        ? { commandId: CMD.DeleteStroke, input: { id: row.annotationId } }
        : null;
    default:
      return null;
  }
}

type RowProps = {
  row: ResolvedOutlineRow;
  hiddenIds: HiddenCanvasIds;
  renamingKey: string | null;
  renameDraft: string;
  dragKey: string | null;
  dropKey: string | null;
  setRenameDraft: (v: string) => void;
  setRenamingKey: (v: string | null) => void;
  startRename: (key: string, current: string) => void;
  commitRename: () => void;
  onFocusRow: (row: ResolvedOutlineRow) => void;
  onCommand: (commandId: string, input: unknown) => void;
  onToggleHidden: (id: string) => void;
  setDragKey: (k: string | null) => void;
  setDropKey: (k: string | null) => void;
  handleDropOn: (targetKey: string) => void;
};

function ObjectsRow({
  row,
  hiddenIds,
  renamingKey,
  renameDraft,
  dragKey,
  dropKey,
  setRenameDraft,
  setRenamingKey,
  startRename,
  commitRename,
  onFocusRow,
  onCommand,
  onToggleHidden,
  setDragKey,
  setDropKey,
  handleDropOn,
}: RowProps) {
  const hidden = !row.isCollection && hiddenIds.has(row.key);
  const del = deleteInputForRow(row);
  const isDropTarget = dropKey === row.key && dragKey !== row.key;

  return (
    <div
      className={[
        'objects-panel__row',
        hidden ? 'objects-panel__row--hidden' : '',
        row.depth > 0 ? 'objects-panel__row--nested' : '',
        row.isCollection ? 'objects-panel__row--collection' : '',
        isDropTarget ? 'objects-panel__row--drop' : '',
        dragKey === row.key ? 'objects-panel__row--dragging' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ paddingLeft: 2 + row.depth * 12, height: ROW_HEIGHT }}
      onDragOver={e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dropKey !== row.key) setDropKey(row.key);
      }}
      onDragLeave={() => {
        if (dropKey === row.key) setDropKey(null);
      }}
      onDrop={e => {
        e.preventDefault();
        handleDropOn(row.key);
      }}
    >
      <span
        className="objects-panel__grip"
        title="Drag to reorder"
        aria-hidden
        draggable
        onDragStart={e => {
          setDragKey(row.key);
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', row.key);
        }}
        onDragEnd={() => {
          setDragKey(null);
          setDropKey(null);
        }}
      >
        <GripVertical size={11} />
      </span>

      {row.isCollection && !row.unified ? (
        <button
          type="button"
          className="objects-panel__chevron"
          aria-label={row.collapsed ? 'Expand' : 'Collapse'}
          onClick={() =>
            row.collectionId &&
            onCommand(CMD.SetObjectCollectionCollapsed, {
              collectionId: row.collectionId,
              collapsed: !row.collapsed,
            })
          }
        >
          {row.collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        </button>
      ) : row.isCollection && row.unified ? (
        <span className="objects-panel__chevron objects-panel__chevron--spacer" aria-hidden />
      ) : null}

      {renamingKey === row.key ? (
        <form
          className="objects-panel__rename"
          onSubmit={e => {
            e.preventDefault();
            commitRename();
          }}
        >
          <input
            className="objects-panel__rename-input"
            value={renameDraft}
            autoFocus
            aria-label="Rename"
            onChange={e => setRenameDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => {
              if (e.key === 'Escape') setRenamingKey(null);
            }}
          />
        </form>
      ) : (
        <div className="objects-panel__main">
          <button
            type="button"
            className="objects-panel__kind-btn"
            onClick={() => onFocusRow(row)}
            title={row.sub ? `Select ${row.label} — ${row.sub}` : `Select ${row.label}`}
          >
            <span className="objects-panel__kind">{row.kind}</span>
          </button>
          <button
            type="button"
            className="objects-panel__name-btn"
            onClick={() => startRename(row.key, row.label)}
            title="Click to rename"
          >
            <span className="objects-panel__name">{row.label}</span>
            {row.sub ? <span className="objects-panel__sub">{row.sub}</span> : null}
          </button>
        </div>
      )}

      <div className="objects-panel__actions">
        <button
          type="button"
          className="objects-panel__icon-btn"
          title="Move up"
          aria-label="Move up"
          onClick={() => onCommand(CMD.MoveObjectOutline, { key: row.key, direction: 'up' })}
        >
          <ChevronUp size={12} />
        </button>
        <button
          type="button"
          className="objects-panel__icon-btn"
          title="Move down"
          aria-label="Move down"
          onClick={() => onCommand(CMD.MoveObjectOutline, { key: row.key, direction: 'down' })}
        >
          <ChevronDown size={12} />
        </button>
        {!row.isCollection ? (
          <button
            type="button"
            className="objects-panel__icon-btn"
            title={hidden ? 'Show' : 'Hide'}
            aria-label={hidden ? 'Show' : 'Hide'}
            aria-pressed={hidden}
            onClick={() => onToggleHidden(row.key)}
          >
            {hidden ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
        ) : null}
        {del ? (
          <button
            type="button"
            className="objects-panel__icon-btn objects-panel__icon-btn--danger"
            title={
              row.isCollection
                ? 'Delete collection'
                : `Delete ${row.label} (Del / Backspace)`
            }
            aria-label={row.isCollection ? 'Delete collection' : `Delete ${row.label}`}
            onClick={() => onCommand(del.commandId, del.input)}
          >
            <Trash2 size={12} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function ObjectsPanel({
  molecule,
  hiddenIds,
  onToggleHidden,
  onCommand,
  onSelectMolecule,
  onSelectArrow,
  onSelectText,
  onSelectImage,
  onSelectShape,
  onClose,
  variant = 'dock',
}: ObjectsPanelProps) {
  useChromeOverlay(variant !== 'sheet', onClose, 'dock');
  const rows = useMemo(() => resolveOutlineRows(molecule), [molecule]);
  const [search, setSearch] = useState('');
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(400);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      r =>
        r.label.toLowerCase().includes(q) ||
        (r.sub?.toLowerCase().includes(q) ?? false) ||
        r.kind.toLowerCase().includes(q) ||
        r.key.toLowerCase().includes(q),
    );
  }, [rows, search]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight));
    ro.observe(el);
    setViewportH(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  const startRename = useCallback((key: string, current: string) => {
    setRenamingKey(key);
    setRenameDraft(current);
  }, []);

  const commitRename = useCallback(() => {
    if (!renamingKey) return;
    onCommand(CMD.RenameObjectOutline, { key: renamingKey, name: renameDraft });
    setRenamingKey(null);
  }, [onCommand, renameDraft, renamingKey]);

  const onFocusRow = useCallback(
    (row: ResolvedOutlineRow) => {
      if (row.isCollection && row.collectionId) {
        // Select whole group as one (COF shapes or molecule array).
        const parent = molecule.objectOutline?.parent ?? {};
        const childKeys = Object.entries(parent)
          .filter(([, col]) => col === row.collectionId)
          .map(([key]) => key);
        const shapeChild = childKeys.find(k => k.startsWith('shape:'));
        if (shapeChild) {
          onSelectShape(shapeChild.slice('shape:'.length));
          return;
        }
        const live = discoverOutlineObjects(molecule);
        const byKey = new Map(live.map(o => [o.key, o]));
        const atomIds: string[] = [];
        for (const key of childKeys) {
          const obj = byKey.get(key);
          if (obj?.atomIds?.length) atomIds.push(...obj.atomIds);
        }
        if (atomIds.length > 0) {
          onSelectMolecule(atomIds);
        }
        return;
      }
      if (row.objectKind === 'Mol' && row.atomIds) onSelectMolecule(row.atomIds);
      else if (row.objectKind === 'Arrow' && row.annotationId) onSelectArrow(row.annotationId);
      else if (row.objectKind === 'Text' && row.annotationId) onSelectText(row.annotationId);
      else if (row.objectKind === 'Image' && row.annotationId) onSelectImage(row.annotationId);
      else if (row.objectKind === 'Shape' && row.annotationId) onSelectShape(row.annotationId);
    },
    [molecule, onSelectArrow, onSelectImage, onSelectMolecule, onSelectShape, onSelectText],
  );

  const handleDropOn = useCallback(
    (targetKey: string) => {
      if (!dragKey || dragKey === targetKey) {
        setDragKey(null);
        setDropKey(null);
        return;
      }
      onCommand(CMD.PlaceObjectOutlineItem, { key: dragKey, targetKey });
      setDragKey(null);
      setDropKey(null);
    },
    [dragKey, onCommand],
  );

  const totalH = filtered.length * ROW_HEIGHT;
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(viewportH / ROW_HEIGHT) + OVERSCAN * 2;
  const endIdx = Math.min(filtered.length, startIdx + visibleCount);
  const windowRows = filtered.slice(startIdx, endIdx);
  const padTop = startIdx * ROW_HEIGHT;

  return (
    <aside
      className={`objects-panel${variant === 'sheet' ? ' objects-panel--sheet' : ''}`}
      aria-label="Canvas objects"
    >
      <header className="objects-panel__header">
        <div className="objects-panel__title">
          <List size={13} strokeWidth={2} />
          {variant === 'sheet' ? null : <span>Objects</span>}
          <span className="objects-panel__count">{rows.filter(r => !r.isCollection).length}</span>
        </div>
        <div className="objects-panel__header-actions">
          <button
            type="button"
            className="objects-panel__icon-btn"
            title="New collection"
            aria-label="New collection"
            onClick={() => onCommand(CMD.CreateObjectCollection, { name: 'Collection' })}
          >
            <FolderPlus size={13} />
          </button>
          {variant === 'sheet' ? null : (
            <button
              type="button"
              className="objects-panel__icon-btn"
              onClick={onClose}
              aria-label="Close objects panel"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </header>

      <div className="objects-panel__search">
        <input
          type="search"
          className="objects-panel__search-input"
          placeholder="Search objects…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label="Search objects"
        />
      </div>

      <div
        className="objects-panel__list"
        ref={listRef}
        onScroll={e => setScrollTop((e.target as HTMLDivElement).scrollTop)}
      >
        {filtered.length === 0 ? (
          <p className="objects-panel__empty">
            {rows.length === 0 ? 'Canvas is empty' : 'No matches'}
          </p>
        ) : (
          <div style={{ height: totalH, position: 'relative' }}>
            <div style={{ transform: `translateY(${padTop}px)` }}>
              {windowRows.map(row => (
                <ObjectsRow
                  key={row.key}
                  row={row}
                  hiddenIds={hiddenIds}
                  renamingKey={renamingKey}
                  renameDraft={renameDraft}
                  dragKey={dragKey}
                  dropKey={dropKey}
                  setRenameDraft={setRenameDraft}
                  setRenamingKey={setRenamingKey}
                  startRename={startRename}
                  commitRename={commitRename}
                  onFocusRow={onFocusRow}
                  onCommand={onCommand}
                  onToggleHidden={onToggleHidden}
                  setDragKey={setDragKey}
                  setDropKey={setDropKey}
                  handleDropOn={handleDropOn}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
