import type { Molecule } from '@moldraw/domain';

export type ProjectFolder = {
  id: string;
  name: string;
  parentId: string | null;
  updatedAt: number;
};

export type SavedProjectMeta = {
  id: string;
  name: string;
  updatedAt: number;
  atomCount: number;
  folderId: string | null;
  thumbnailDataUrl?: string;
};

export type SavedProject = SavedProjectMeta & {
  molecule: Molecule;
};

export const CURRENT_PROJECT_SESSION_KEY = 'moldraw-current-project-id';
export const OPEN_TABS_SESSION_KEY = 'moldraw-open-tabs';
/** Sync snapshot of the working canvas so OAuth / email redirects cannot boot a blank Untitled. */
export const WORKING_DOCUMENT_SNAPSHOT_KEY = 'moldraw-working-document';
/**
 * Once set, the PubChem first-visit demo molecule must not be re-injected on refresh.
 * Set after the startup seed runs, after Clear, or when hydrating any prior local document.
 */
export const STARTUP_SEED_CONSUMED_KEY = 'moldraw-startup-seed-consumed';

export type DocumentTab = {
  id: string;
  name: string;
};
