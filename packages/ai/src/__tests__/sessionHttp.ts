/**
 * HTTP adapter tests (dispatch, no public bind).
 *   npm run test:session
 */
import { createMoldrawSession } from '../session/createMoldrawSession';
import { dispatchSessionHttp } from '../http/dispatch';
import { moleculeSnapshot } from './sessionSnapshot';

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

console.log('Session HTTP adapter\n');

const session = createMoldrawSession();

{
  const listed = await dispatchSessionHttp(session, { method: 'GET', path: '/v1' });
  check('GET /v1', listed.status === 200);

  const mol0 = await dispatchSessionHttp(session, { method: 'GET', path: '/v1/molecule' });
  check('GET molecule empty', mol0.status === 200);
  const emptyBody = mol0.body as { revision: number; molecule: { atoms: unknown[] } };
  check('empty revision 0', emptyBody.revision === 0 && emptyBody.molecule.atoms.length === 0);
}

{
  const added = await dispatchSessionHttp(session, {
    method: 'POST',
    path: '/v1/commands',
    body: {
      id: 'molecule.addAtom',
      input: { atom: { id: 'c1', element: 'C', x: 0, y: 0, charge: 0 } },
    },
  });
  const body = added.body as { ok: boolean; revision: number; changed: boolean; molecule?: unknown };
  check('POST command addAtom', added.status === 200 && body.ok && body.changed && body.revision === 1);
  check('POST command omits molecule', body.molecule === undefined);

  await dispatchSessionHttp(session, {
    method: 'POST',
    path: '/v1/commands/molecule.addAtom',
    body: { atom: { id: 'o1', element: 'O', x: 40, y: 0, charge: 0 } },
  });
  const bonded = await dispatchSessionHttp(session, {
    method: 'POST',
    path: '/v1/commands',
    body: {
      id: 'molecule.addBond',
      input: { bond: { id: 'b1', fromAtomId: 'c1', toAtomId: 'o1', order: 1 } },
    },
  });
  const bondBody = bonded.body as { ok: boolean; revision: number };
  check('POST addBond revision', bonded.status === 200 && bondBody.revision === 3);

  const got = await dispatchSessionHttp(session, { method: 'GET', path: '/v1/molecule' });
  const mol = (got.body as { molecule: Parameters<typeof moleculeSnapshot>[0] }).molecule;
  const snap = moleculeSnapshot(mol);
  check('GET molecule after commands', snap.atomCount === 2 && snap.bondCount === 1, snap);
}

{
  const other = createMoldrawSession();
  const tool = await dispatchSessionHttp(other, {
    method: 'POST',
    path: '/v1/tools/command.molecule.importSmiles',
    body: { smiles: 'c1ccccc1' },
  });
  const toolBody = tool.body as { ok: boolean; changed: boolean; revision: number };
  check('POST tool importSmiles', tool.status === 200 && toolBody.ok && toolBody.changed, tool.body);

  const state = await dispatchSessionHttp(other, { method: 'GET', path: '/v1/state' });
  const st = state.body as { molecule: { atoms: unknown[]; bonds: unknown[] }; revision: number };
  check('GET state after tool', st.molecule.atoms.length === 6 && st.molecule.bonds.length === 6);

  const sel = await dispatchSessionHttp(other, {
    method: 'POST',
    path: '/v1/commands',
    body: { id: 'selection.set', input: { atomIds: [st.molecule.atoms[0] ? (st.molecule.atoms[0] as { id: string }).id : ''] } },
  });
  check('selection.set via commands', sel.status === 200);
  const selGot = await dispatchSessionHttp(other, { method: 'GET', path: '/v1/selection' });
  const selBody = selGot.body as { selection: { atomIds: string[] } };
  check('GET selection', selBody.selection.atomIds.length === 1);

  const unknown = await dispatchSessionHttp(other, {
    method: 'POST',
    path: '/v1/commands',
    body: { id: 'molecule.nope', input: {} },
  });
  check('unknown command 404', unknown.status === 404);

  const spec = await dispatchSessionHttp(other, { method: 'GET', path: '/v1/openapi.json' });
  check('OpenAPI from Zod', spec.status === 200 && Boolean((spec.body as { openapi?: string }).openapi));
}

{
  const sessionA = createMoldrawSession();
  const sessionB = createMoldrawSession();
  await dispatchSessionHttp(sessionA, {
    method: 'POST',
    path: '/v1/commands',
    body: {
      id: 'molecule.addAtom',
      input: { atom: { id: 'x', element: 'N', x: 0, y: 0, charge: 0 } },
    },
  });
  check(
    'HTTP sessions stay independent',
    sessionA.getState().molecule.atoms.length === 1 && sessionB.getState().molecule.atoms.length === 0,
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
