/**
 * Design library listing: open tabs must appear even before IndexedDB upsert.
 * Run: npx tsx --tsconfig tsconfig.app.json src/app/projects/__tests__/designLibraryListingSmoke.ts
 */
import {
  localSaveOriginWarning,
  mergeLibraryMetasWithOpenTabs,
  projectBelongsInFolderView,
} from '../libraryListing';
import type { DocumentTab, SavedProjectMeta } from '../types';

const fail = (msg: string): never => {
  throw new Error(msg);
};

const eq = (got: unknown, want: unknown, msg: string): void => {
  if (got !== want) fail(`${msg}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

const meta = (partial: Partial<SavedProjectMeta> & Pick<SavedProjectMeta, 'id' | 'name'>): SavedProjectMeta => ({
  updatedAt: 1,
  atomCount: 0,
  folderId: null,
  ...partial,
});

const saved: SavedProjectMeta[] = [
  meta({ id: 'a', name: 'Benzene', atomCount: 6, updatedAt: 100, folderId: null }),
  meta({ id: 'b', name: 'In folder', atomCount: 2, updatedAt: 90, folderId: 'folder-1' }),
  meta({ id: 'orphan', name: 'Lost folder', atomCount: 1, updatedAt: 80, folderId: 'missing-folder' }),
];

const workingTab: DocumentTab = { id: 'working', name: 'Untitled design' };
const openTabs: DocumentTab[] = [
  { id: 'a', name: 'Benzene (open)' },
  workingTab,
];

const merged = mergeLibraryMetasWithOpenTabs(saved, openTabs);
eq(merged.some(p => p.id === 'working'), true, 'current working tab is listed');
eq(merged.find(p => p.id === 'a')?.name, 'Benzene (open)', 'open tab name wins over stale meta');
eq(merged.filter(p => p.id === 'a').length, 1, 'open tab does not duplicate saved meta');
eq(merged.some(p => p.id === 'b'), true, 'other local projects stay listed');

const knownFolders = new Set(['folder-1']);
eq(projectBelongsInFolderView(saved[0]!, null, knownFolders), true, 'root shows unfiled');
eq(projectBelongsInFolderView(saved[1]!, null, knownFolders), false, 'filed project hidden at root');
eq(projectBelongsInFolderView(saved[2]!, null, knownFolders), true, 'orphan shows at All designs');
eq(projectBelongsInFolderView(saved[1]!, 'folder-1', knownFolders), true, 'folder view shows members');
eq(projectBelongsInFolderView(saved[0]!, 'folder-1', knownFolders), false, 'unfiled hidden in folder');

const emptyLibrary = mergeLibraryMetasWithOpenTabs([], [{ id: 'boot', name: 'Untitled design' }]);
eq(emptyLibrary.length, 1, 'boot untitled appears when IndexedDB is empty');
eq(emptyLibrary[0]?.id, 'boot', 'boot untitled id preserved');

const notice = localSaveOriginWarning('http://127.0.0.1:5173');
if (!notice.includes('http://127.0.0.1:5173')) fail('notice must name the current origin');
if (!notice.includes('moldraw.com')) fail('notice must mention moldraw.com vs local hosts');
if (!notice.includes('do not sync')) fail('notice must say origins do not sync');

const prodNotice = localSaveOriginWarning('https://moldraw.com');
if (!prodNotice.includes('https://moldraw.com')) fail('prod origin must appear in notice');

console.log('designLibraryListingSmoke OK');
