import { useMemo, type DragEvent } from 'react';
import { Folder } from 'lucide-react';
import type { ProjectFolder } from '../projects/types';

export type FolderDropBind = {
  onDragOver: (e: DragEvent) => void;
  onDragLeave: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
};

type FolderNode = ProjectFolder & { children: FolderNode[] };

function buildFolderTree(folders: ProjectFolder[]): FolderNode[] {
  const byParent = new Map<string | null, ProjectFolder[]>();
  for (const folder of folders) {
    const list = byParent.get(folder.parentId) ?? [];
    list.push(folder);
    byParent.set(folder.parentId, list);
  }
  const nest = (parentId: string | null): FolderNode[] =>
    (byParent.get(parentId) ?? [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(folder => ({ ...folder, children: nest(folder.id) }));
  return nest(null);
}

export type DesignLibraryFolderTreeProps = {
  folders: ProjectFolder[];
  currentFolderId: string | null;
  dropTargetFolderId: string | null | '__root__';
  onOpenFolder: (id: string | null) => void;
  bindFolderDrop: (id: string | null) => FolderDropBind;
};

export function DesignLibraryFolderTree({
  folders,
  currentFolderId,
  dropTargetFolderId,
  onOpenFolder,
  bindFolderDrop,
}: DesignLibraryFolderTreeProps) {
  const tree = useMemo(() => buildFolderTree(folders), [folders]);

  const renderNodes = (nodes: FolderNode[], depth: number) => (
    <ul className="design-library__tree-list">
      {nodes.map(node => {
        const isCurrent = currentFolderId === node.id;
        const isDrop = dropTargetFolderId === node.id;
        return (
          <li key={node.id}>
            <div
              className={`design-library__tree-item${isCurrent ? ' is-current' : ''}${
                isDrop ? ' is-drop-target' : ''
              }`}
              style={{ paddingLeft: 8 + depth * 14 }}
              {...bindFolderDrop(node.id)}
            >
              <Folder size={14} aria-hidden />
              <button
                type="button"
                className="design-library__tree-open"
                title={node.name}
                onClick={() => onOpenFolder(node.id)}
              >
                {node.name}
              </button>
            </div>
            {node.children.length > 0 ? renderNodes(node.children, depth + 1) : null}
          </li>
        );
      })}
    </ul>
  );

  return (
    <aside className="design-library__folder-tree" aria-label="Folders">
      <p className="design-library__tree-heading">Folders</p>
      <div
        className={`design-library__tree-item${currentFolderId === null ? ' is-current' : ''}${
          dropTargetFolderId === '__root__' ? ' is-drop-target' : ''
        }`}
        {...bindFolderDrop(null)}
      >
        <Folder size={14} aria-hidden />
        <button type="button" className="design-library__tree-open" onClick={() => onOpenFolder(null)}>
          All designs
        </button>
      </div>
      {tree.length === 0 ? (
        <p className="design-library__tree-empty">Create a folder, then drag designs onto it.</p>
      ) : (
        renderNodes(tree, 0)
      )}
    </aside>
  );
}
