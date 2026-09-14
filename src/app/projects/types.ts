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

export type DocumentTab = {
  id: string;
  name: string;
};
