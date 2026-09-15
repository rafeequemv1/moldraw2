import type { DocumentStyleByTabId } from '../settings/documentStyle';
import { CURRENT_PROJECT_SESSION_KEY, OPEN_TABS_SESSION_KEY, type DocumentTab } from './types';

export type OpenTabsSession = {
  tabs: DocumentTab[];
  activeTabId: string;
  documentStyles?: DocumentStyleByTabId;
};

export const readOpenTabsSession = (): OpenTabsSession | null => {
  try {
    const raw = sessionStorage.getItem(OPEN_TABS_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OpenTabsSession;
    if (!parsed.tabs?.length || !parsed.activeTabId) return null;
    if (!parsed.tabs.some(t => t.id === parsed.activeTabId)) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const writeOpenTabsSession = (session: OpenTabsSession): void => {
  try {
    sessionStorage.setItem(OPEN_TABS_SESSION_KEY, JSON.stringify(session));
    sessionStorage.setItem(CURRENT_PROJECT_SESSION_KEY, session.activeTabId);
  } catch {
    /* private mode */
  }
};

export const readSessionProjectId = (): string | null => {
  try {
    return sessionStorage.getItem(CURRENT_PROJECT_SESSION_KEY);
  } catch {
    return null;
  }
};
