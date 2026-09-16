import type { DocumentTab, SavedProjectMeta } from './types';

/** Treat missing folder as root; show orphans at All designs. */
export function projectBelongsInFolderView(
  project: Pick<SavedProjectMeta, 'folderId'>,
  folderId: string | null,
  knownFolderIds: ReadonlySet<string>,
): boolean {
  const fid = project.folderId ?? null;
  if (folderId === null) {
    return fid === null || !knownFolderIds.has(fid);
  }
  return fid === folderId;
}

/**
 * IndexedDB is the source of truth, but the editor tab may not have been
 * inserted yet (empty canvas skip, debounce, failed write). Always union
 * currently open tabs into the library list so My Designs shows the working file.
 */
export function mergeLibraryMetasWithOpenTabs(
  metas: readonly SavedProjectMeta[],
  openTabs: readonly DocumentTab[],
): SavedProjectMeta[] {
  const byId = new Map<string, SavedProjectMeta>();
  for (const meta of metas) {
    byId.set(meta.id, { ...meta, folderId: meta.folderId ?? null });
  }
  for (const tab of openTabs) {
    const existing = byId.get(tab.id);
    const name = tab.name.trim() || existing?.name || 'Untitled design';
    if (existing) {
      byId.set(tab.id, { ...existing, name });
    } else {
      byId.set(tab.id, {
        id: tab.id,
        name,
        updatedAt: Date.now(),
        atomCount: 0,
        folderId: null,
      });
    }
  }
  return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function localSaveOriginWarning(origin: string): string {
  const host = (() => {
    try {
      return new URL(origin).hostname || origin;
    } catch {
      return origin;
    }
  })();
  const originLabel = origin.trim() || host || 'this site';
  return (
    `Be careful: designs are saved locally in this browser, only for ${originLabel}. ` +
    `moldraw.com, localhost, and 127.0.0.1 each keep a separate library — they do not sync. ` +
    `Clearing site data, another browser, or a private window can remove them. ` +
    `Always save a copy on your computer so you don’t lose work in progress.`
  );
}
