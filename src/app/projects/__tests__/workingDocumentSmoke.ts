/**
 * Working-document snapshot: auth / OAuth return must reopen the same molecule + tab name.
 * Run: npx tsx --tsconfig tsconfig.app.json src/app/projects/__tests__/workingDocumentSmoke.ts
 */
import type { Molecule } from '@moldraw/domain';
import {
  isStartupSeedConsumed,
  markStartupSeedConsumed,
  pickHydrationDocument,
  preferLocalWorkingDocument,
  readWorkingDocumentSnapshot,
  resolveBootTabs,
  shouldKeepStoredMolecule,
  writeWorkingDocumentSnapshot,
  type WorkingDocumentSnapshot,
} from '../workingDocument';
import type { SavedProject } from '../types';
import { STARTUP_SEED_CONSUMED_KEY, WORKING_DOCUMENT_SNAPSHOT_KEY } from '../types';

const fail = (msg: string): never => {
  throw new Error(msg);
};

const eq = (got: unknown, want: unknown, msg: string): void => {
  if (got !== want) fail(`${msg}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

const emptyMol: Molecule = { atoms: [], bonds: [] };
const drawnMol = {
  atoms: [{ id: 'a1', element: 'C', x: 0, y: 0 }],
  bonds: [],
} as Molecule;

const snapshot: WorkingDocumentSnapshot = {
  tabs: [{ id: 'work-1', name: 'Aspirin' }],
  activeTabId: 'work-1',
  name: 'Aspirin',
  molecule: drawnMol,
  savedAt: 200,
};

eq(resolveBootTabs(null, snapshot, 'new-uuid').activeTabId, 'work-1', 'OAuth return reopens snapshot tab');
eq(resolveBootTabs(null, snapshot, 'new-uuid').tabs[0]?.name, 'Aspirin', 'OAuth return keeps tab name');
eq(
  resolveBootTabs({ tabs: [{ id: 'sess', name: 'Live' }], activeTabId: 'sess' }, snapshot, 'x').activeTabId,
  'sess',
  'open-tabs session wins when present',
);

const saved: SavedProject = {
  id: 'work-1',
  name: 'Aspirin',
  updatedAt: 100,
  atomCount: 1,
  folderId: null,
  molecule: drawnMol,
};

const hydrated = pickHydrationDocument({
  projectId: 'work-1',
  snapshot,
  saved: { ...saved, molecule: emptyMol, atomCount: 0 },
  sessionTabs: snapshot.tabs,
});
eq(hydrated?.name, 'Aspirin', 'snapshot restores name when IndexedDB is empty');
eq(hydrated?.molecule.atoms.length, 1, 'snapshot restores molecule when IndexedDB is empty');

const oauthLostSession = pickHydrationDocument({
  projectId: 'brand-new-untitled',
  snapshot,
  saved: null,
  sessionTabs: [{ id: 'brand-new-untitled', name: 'Untitled design' }],
});
eq(oauthLostSession?.activeTabId, 'work-1', 'do not boot a blank Untitled when snapshot exists');
eq(oauthLostSession?.name, 'Aspirin', 'lost session still restores tab name');

const local = { molecule: drawnMol, name: 'Local working' };
const emptyCloud = { molecule: emptyMol, name: 'Untitled design' };
eq(
  preferLocalWorkingDocument(local, emptyCloud)?.name,
  'Local working',
  'cloud sync must not replace local working file with empty default',
);

eq(shouldKeepStoredMolecule(emptyMol, drawnMol, false), true, 'unhydrated empty memory must not wipe stored drawing');
eq(shouldKeepStoredMolecule(emptyMol, drawnMol, true), false, 'explicit clear after save may persist empty');
eq(shouldKeepStoredMolecule(drawnMol, drawnMol, false), false, 'live drawing is what gets saved');

// After Clear, IndexedDB may already be empty while the sync snapshot still holds
// the old drawing — pickHydration must prefer the empty saved record once the
// snapshot is also cleared (allowEmpty write). Until then, snapshot wins (OAuth race).
const clearedSnapshot: WorkingDocumentSnapshot = {
  ...snapshot,
  molecule: emptyMol,
  savedAt: 300,
};
const afterClear = pickHydrationDocument({
  projectId: 'work-1',
  snapshot: clearedSnapshot,
  saved: { ...saved, molecule: emptyMol, atomCount: 0, updatedAt: 300 },
  sessionTabs: snapshot.tabs,
});
eq(afterClear?.molecule.atoms.length ?? 0, 0, 'cleared snapshot + empty IDB stay empty');

// Empty snapshot writes require allowEmpty (boot upsert must not look like a prior doc).
const mem = (() => {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  };
})();
const g = globalThis as {
  window?: unknown;
  localStorage?: Storage;
  sessionStorage?: Storage;
};
g.localStorage = mem as Storage;
g.sessionStorage = mem as Storage;
g.window = globalThis;

writeWorkingDocumentSnapshot(
  {
    tabs: [{ id: 'boot', name: 'Untitled design' }],
    activeTabId: 'boot',
    name: 'Untitled design',
    molecule: emptyMol,
    savedAt: 1,
  },
  { allowEmpty: false },
);
eq(readWorkingDocumentSnapshot(), null, 'boot empty without allowEmpty must not create a snapshot');

writeWorkingDocumentSnapshot(
  {
    tabs: [{ id: 'boot', name: 'Untitled design' }],
    activeTabId: 'boot',
    name: 'Untitled design',
    molecule: emptyMol,
    savedAt: 2,
  },
  { allowEmpty: true },
);
eq(
  readWorkingDocumentSnapshot()?.molecule.atoms.length ?? -1,
  0,
  'Clear allowEmpty writes an empty snapshot',
);
eq(
  pickHydrationDocument({
    projectId: 'boot',
    snapshot: readWorkingDocumentSnapshot(),
    saved: null,
    sessionTabs: [{ id: 'boot', name: 'Untitled design' }],
  })?.molecule.atoms.length ?? -1,
  0,
  'empty cleared snapshot hydrates as empty (not null → no demo re-seed)',
);

eq(isStartupSeedConsumed(), false, 'startup seed flag starts unset');
markStartupSeedConsumed();
eq(isStartupSeedConsumed(), true, 'startup seed flag persists after mark');
eq(mem.getItem(STARTUP_SEED_CONSUMED_KEY), '1', 'startup seed flag stored under known key');
eq(mem.getItem(WORKING_DOCUMENT_SNAPSHOT_KEY) != null, true, 'cleared snapshot still present');

console.log('workingDocumentSmoke OK');
