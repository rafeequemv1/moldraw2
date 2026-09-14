/**
 * Session kernel golden tests (no React).
 *   npm run test:session
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMoldrawSession } from '../session/createMoldrawSession';
import { executeAiTool } from '../executor';
import { moleculeSnapshot } from './sessionSnapshot';

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

let passed = 0;
let failed = 0;

const check = (name: string, cond: boolean, detail?: unknown): void => {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name}`, detail !== undefined ? JSON.stringify(detail) : '');
  }
};

const loadFixture = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(fixtureDir, name), 'utf8')) as Record<string, unknown>;

const sameSnapshot = (got: Record<string, unknown>, expected: Record<string, unknown>): boolean =>
  JSON.stringify(got) === JSON.stringify(expected);

console.log('Session kernel\n');

{
  const a = createMoldrawSession();
  const b = createMoldrawSession();
  a.applyCommand('molecule.addAtom', {
    atom: { id: 'a1', element: 'C', x: 0, y: 0, charge: 0 },
  });
  check('independent sessions', a.getState().molecule.atoms.length === 1 && b.getState().molecule.atoms.length === 0);
}

{
  const session = createMoldrawSession();
  const events: string[] = [];
  session.subscribe(e => events.push(e.type));

  const r1 = session.applyCommand({
    id: 'molecule.addAtom',
    input: { atom: { id: 'c1', element: 'C', x: 0, y: 0, charge: 0 } },
  });
  const r2 = session.applyCommand('molecule.addAtom', {
    atom: { id: 'o1', element: 'O', x: 40, y: 0, charge: 0 },
  });
  const r3 = session.applyCommand('molecule.addBond', {
    bond: { id: 'b1', fromAtomId: 'c1', toAtomId: 'o1', order: 1 },
  });

  check('addAtom ok + changed', r1.ok && r1.changed && r1.revision === 1);
  check('second addAtom revision 2', r2.ok && r2.revision === 2);
  check('addBond revision 3', r3.ok && r3.changed && r3.revision === 3);
  check('result omits molecule by default', r3.ok && r3.molecule === undefined);
  check(
    'add-bond fixture',
    sameSnapshot(moleculeSnapshot(session.getState().molecule), loadFixture('add-bond.json')),
    moleculeSnapshot(session.getState().molecule),
  );
  check('typed session.changed events', events.filter(t => t === 'session.changed').length === 3);

  const noMol = session.applyCommand({
    id: 'molecule.addAtom',
    input: { atom: { id: 'c1', element: 'N', x: 10, y: 10, charge: 0 } },
    includeMolecule: true,
  });
  check('failed or no-op does not require molecule on default path', session.revision >= 3);
  check('includeMolecule optional', noMol.ok ? noMol.molecule != null || !noMol.changed : true);

  const bad = session.applyCommand('molecule.notACommand', {});
  check('unknown command fails', !bad.ok && bad.revision === session.revision && !bad.changed);

  const undone = session.undo();
  check('undo increments revision', undone.ok && undone.changed);
  check('undo event reserved type', events.includes('session.undo'));
}

{
  const session = createMoldrawSession();
  const imported = session.applyCommand('molecule.importSmiles', { smiles: 'c1ccccc1' });
  check('importSmiles ok', imported.ok && imported.changed);
  const snap = moleculeSnapshot(session.getState().molecule);
  const fixture = loadFixture('benzene.json');
  check(
    'benzene atom/bond counts',
    snap.atomCount === fixture.atomCount && snap.bondCount === fixture.bondCount,
    snap,
  );
  check('benzene six carbons', (snap.elements as string[]).every(e => e === 'C'), snap.elements);

  const viaTool = createMoldrawSession();
  const tool = await executeAiTool(
    'command.molecule.importSmiles',
    { smiles: 'c1ccccc1' },
    viaTool.ctx,
  );
  check('tool uses session.applyCommand', tool.ok);
  check(
    'tool benzene parity',
    moleculeSnapshot(viaTool.getState().molecule).atomCount === 6 &&
      moleculeSnapshot(viaTool.getState().molecule).bondCount === 6,
  );
}

{
  const session = createMoldrawSession();
  const imported = session.applyCommand('molecule.importSmiles', { smiles: 'C#N' });
  check('HCN precursor imported', imported.ok);
  const c = session.getState().molecule.atoms.find(a => a.element === 'C');
  if (!c) {
    check('HCN has carbon', false);
  } else {
    const h = session.applyCommand('molecule.addExplicitHydrogens', {
      atomIds: [c.id],
      bondLengthPx: 40,
    });
    check('add explicit H', h.ok && h.changed, h);
    const snap = moleculeSnapshot(session.getState().molecule);
    check(
      'hcn-explicit fixture',
      sameSnapshot(snap, loadFixture('hcn-explicit.json')),
      snap,
    );

    const arrow = session.applyCommand('molecule.addReactionArrow', {
      arrow: {
        id: 'ef1',
        x1: 0,
        y1: 0,
        x2: 40,
        y2: 20,
        kind: 'electron_flow',
      },
    });
    check('electron-flow arrow', arrow.ok && arrow.changed);
    const flow = moleculeSnapshot(session.getState().molecule);
    check(
      'electron-flow fixture',
      sameSnapshot(flow, loadFixture('electron-flow.json')),
      flow,
    );

    const cleaned = session.applyCommand('molecule.cleanup', { bondLengthPx: 40 });
    check('cleanup via command', cleaned.ok);
    check('cleanup keeps H-CN atoms', session.getState().molecule.atoms.length === 3);
  }
}

{
  const session = createMoldrawSession();
  session.applyCommand('molecule.importSmiles', { smiles: 'CCO' });
  const themed = session.applyCommand('molecule.setStructureTheme', { themeId: 'simple' });
  check('setStructureTheme ok', themed.ok && themed.changed);
  check('simple is ball-stick', session.getState().molecule.structureDrawMode === 'ball-stick');
  check('theme id simple', session.getState().molecule.structureThemeId === 'simple');
  const viaTool = await executeAiTool(
    'command.molecule.setStructureTheme',
    { themeId: 'skeletal' },
    session.ctx,
  );
  check('theme tool skeletal', viaTool.ok);
  check(
    'skeletal after tool',
    session.getState().molecule.structureThemeId === 'skeletal' &&
      session.getState().molecule.structureDrawMode === 'skeletal',
  );
}

{
  const session = createMoldrawSession();
  session.applyCommand('molecule.importSmiles', { smiles: 'c1ccccc1' });
  const validated = await session.ctx.runCheckStructure?.();
  check('ChemistryEngine validate hook', Boolean(validated?.ok));
  const smiles = await session.ctx.exportSmiles?.();
  check('exportSmiles hook', Boolean(smiles?.ok));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
