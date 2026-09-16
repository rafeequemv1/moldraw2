import type { DocumentStyleByTabId } from '../settings/documentStyle';
import { CURRENT_PROJECT_SESSION_KEY, OPEN_TABS_SESSION_KEY, type DocumentTab } from './types';

export type OpenTabsSession = {
  tabs: DocumentTab[];
  activeTabId: string;
  documentStyles?: DocumentStyleByTabId;
};

function parseOpenTabs(raw: string | null): OpenTabsSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as OpenTabsSession;
    if (!parsed.tabs?.length || !parsed.activeTabId) return null;
    if (!parsed.tabs.some(t => t.id === parsed.activeTabId)) return null;
    return parsed;
  } catch {
    return null;
  }
}

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
    /* private mode / quota */
  }
}

/** sessionStorage first (same tab), then localStorage (survives close / reopen). */
export const readOpenTabsSession = (): OpenTabsSession | null => {
  if (typeof window === 'undefined') return null;
  return (
    parseOpenTabs(readStorageItem(sessionStorage, OPEN_TABS_SESSION_KEY)) ??
    parseOpenTabs(readStorageItem(localStorage, OPEN_TABS_SESSION_KEY))
  );
};

export const writeOpenTabsSession = (session: OpenTabsSession): void => {
  const json = JSON.stringify(session);
  if (typeof window === 'undefined') return;
  writeStorageItem(sessionStorage, OPEN_TABS_SESSION_KEY, json);
  writeStorageItem(sessionStorage, CURRENT_PROJECT_SESSION_KEY, session.activeTabId);
  writeStorageItem(localStorage, OPEN_TABS_SESSION_KEY, json);
  writeStorageItem(localStorage, CURRENT_PROJECT_SESSION_KEY, session.activeTabId);
};

export const readSessionProjectId = (): string | null => {
  if (typeof window === 'undefined') return null;
  return (
    readStorageItem(sessionStorage, CURRENT_PROJECT_SESSION_KEY) ??
    readStorageItem(localStorage, CURRENT_PROJECT_SESSION_KEY)
  );
};
