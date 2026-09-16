/**
 * Working-document snapshot: auth / OAuth return must reopen the same molecule + tab name.
 * Run: npx tsx --tsconfig tsconfig.app.json src/app/projects/__tests__/workingDocumentSmoke.ts
 */
import type { Molecule } from '@moldraw/domain';
import {
  pickHydrationDocument,
  preferLocalWorkingDocument,
  resolveBootTabs,
  shouldKeepStoredMolecule,
  type WorkingDocumentSnapshot,
} from '../workingDocument';
import type { SavedProject } from '../types';

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

console.log('workingDocumentSmoke OK');
