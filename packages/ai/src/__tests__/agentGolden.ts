/**
 * Agent golden suite — "can an AI actually drive the canvas?"
 *
 *   npm run test:agent
 *
 * Four layers, all without React or a browser:
 *   1. Catalogue invariants: every parameter described, toolsets sized sanely,
 *      annotations consistent, JSON-schema conversion never throws.
 *   2. Session tasks: ~25 realistic agent tasks through `executeAiTool` on a
 *      `createMoldrawSession()` (draw / verify / edit / errors / stereo / batch /
 *      transaction / revision guards).
 *   3. Stdio MCP protocol: spawn the real server (`runStdio.ts --toolset=core`)
 *      and exercise initialize / tools / resources / prompts / envelope.
 *   4. Live bridge: HTTP session + MCP proxy (`--session-url`) share one canvas.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z, type ZodType } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { listCommands } from '@moldraw/core';
import { createMoldrawSession } from '../session/createMoldrawSession';
import { executeAiTool } from '../executor';
import { listAiToolsByCategory, listAiToolsForToolset } from '../registry';
import { toolAnnotations } from '../toolsets';
import { buildMcpCatalog } from '../mcp/catalog';
import { MCP_RESOURCES } from '../mcp/resources';
import { MCP_PROMPTS } from '../mcp/prompts';
import { parseMcpCliArgs } from '../mcp/cli';
import { startHttpServer } from '../http/startHttpServer';
import type { AiToolResult } from '../types';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..', '..');
const tsxCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const runStdio = path.join(root, 'packages', 'ai', 'src', 'mcp', 'runStdio.ts');
const tsconfigNode = path.join(root, 'tsconfig.node.json');

let passed = 0;
let failed = 0;
const check = (name: string, cond: boolean, detail?: unknown): void => {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name}`, detail !== undefined ? JSON.stringify(detail).slice(0, 400) : '');
  }
};
const section = (title: string): void => console.log(`\n${title}\n`);
const data = <T,>(r: AiToolResult): T => (r.ok ? (r.data as T) : (undefined as T));
const errOf = (r: AiToolResult): { code: string; message: string } | undefined => (r.ok ? undefined : r.error);

// ─── 1. Catalogue invariants ────────────────────────────────────────────────
section('1. Catalogue invariants');
{
  type J = Record<string, unknown>;
  const undescribed = (node: J, prefix: string, out: string[]): void => {
    const props = node.properties as J | undefined;
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        const child = v as J;
        const p = prefix ? `${prefix}.${k}` : k;
        if (!child.description) out.push(p);
        undescribed(child, p, out);
      }
    }
    if (node.items && typeof node.items === 'object') undescribed(node.items as J, `${prefix}[]`, out);
    for (const key of ['anyOf', 'oneOf', 'allOf']) {
      const arr = node[key] as J[] | undefined;
      if (arr) arr.forEach((b, i) => undescribed(b, `${prefix}|${i}`, out));
    }
  };
  const missing: string[] = [];
  const conversionFailures: string[] = [];
  const entries = [
    ...listCommands().map(c => ({ id: c.id, schema: c.inputSchema as ZodType })),
    ...listAiToolsByCategory()
      .filter(t => !t.id.startsWith('command.'))
      .map(t => ({ id: t.id, schema: t.inputSchema as ZodType })),
  ];
  for (const e of entries) {
    try {
      const json = z.toJSONSchema(e.schema, { target: 'draft-2020-12', unrepresentable: 'any', io: 'input' }) as J;
      const out: string[] = [];
      undescribed(json, '', out);
      for (const p of out) missing.push(`${e.id}: ${p}`);
    } catch (err) {
      conversionFailures.push(`${e.id}: ${(err as Error).message}`);
    }
  }
  check(`every command / tool parameter has .describe() (${entries.length} schemas)`, missing.length === 0, missing.slice(0, 20));
  check('every schema converts to JSON Schema', conversionFailures.length === 0, conversionFailures);

  const all = listAiToolsByCategory();
  const ids = all.map(t => t.id);
  check('tool ids are unique', new Set(ids).size === ids.length);
  const shortDesc = all.filter(t => (t.description ?? '').length < 40).map(t => t.id);
  check('every tool description is at least 40 chars', shortDesc.length === 0, shortDesc);

  const minimal = listAiToolsForToolset('minimal');
  const core = listAiToolsForToolset('core');
  const advanced = listAiToolsForToolset('advanced');
  const full = listAiToolsForToolset('full');
  check(`minimal toolset fits tool-capped clients (20–40): ${minimal.length}`, minimal.length >= 20 && minimal.length <= 40);
  check(`core toolset is compact (60–110): ${core.length}`, core.length >= 60 && core.length <= 110);
  check('minimal ⊂ core ⊂ advanced ⊂ full', minimal.length < core.length && core.length < advanced.length && advanced.length <= full.length && full.length === all.length);
  const facades = ['draw.smiles', 'draw.atom', 'draw.bond', 'draw.ring', 'draw.chain', 'draw.text', 'draw.arrow', 'edit.atom', 'edit.bond', 'edit.delete',
    'molecule.get_canvas_state', 'molecule.render', 'molecule.undo', 'molecule.batch', 'moldraw.list_tools', 'molecule.find_substructure'];
  const minimalIds = new Set(minimal.map(t => t.id));
  check('start-here tools are all in minimal', facades.every(id => minimalIds.has(id)), facades.filter(id => !minimalIds.has(id)));
  const minimalBytes = JSON.stringify(
    minimal.map(t => ({ name: t.id, description: t.description, inputSchema: z.toJSONSchema(t.inputSchema as ZodType, { target: 'draft-2020-12', unrepresentable: 'any', io: 'input' }), annotations: toolAnnotations(t) })),
  ).length;
  check(`minimal tools/list payload ≤ 48 kB (≈ 12 k tokens): ${Math.round(minimalBytes / 1024)} kB`, minimalBytes <= 48 * 1024);

  const badAnnotations = all
    .map(t => [t.id, toolAnnotations(t)] as const)
    .filter(([, a]) => a.readOnlyHint && a.destructiveHint)
    .map(([id]) => id);
  check('no tool is both read-only and destructive', badAnnotations.length === 0, badAnnotations);
  const readTools = all.filter(t => t.category === 'read');
  check('read tools are annotated readOnlyHint', readTools.every(t => toolAnnotations(t).readOnlyHint));

  const catalog = buildMcpCatalog();
  check('catalogue lists resources + prompts', catalog.resources.length === MCP_RESOURCES.length && catalog.prompts.length === MCP_PROMPTS.length && catalog.resources.length >= 6 && catalog.prompts.length >= 3);

  const cli = parseMcpCliArgs(['--toolset=advanced', '--debug', '--session-url', 'http://127.0.0.1:9'], {});
  check('cli parses --toolset/--debug/--session-url', cli.options.toolset === 'advanced' && cli.options.debug === true && cli.options.sessionUrl === 'http://127.0.0.1:9' && cli.errors.length === 0, cli);
  check('cli rejects bad toolset', parseMcpCliArgs(['--toolset=nope'], {}).errors.length === 1);
}

// ─── 2. Session tasks ───────────────────────────────────────────────────────
section('2. Session tasks (executeAiTool on createMoldrawSession)');
{
  const session = createMoldrawSession();
  const ctx = session.ctx;
  const run = (id: string, input: unknown = {}) => executeAiTool(id, input, ctx);
  const atoms = () => session.store.getMolecule().atoms.length;
  const bonds = () => session.store.getMolecule().bonds.length;

  // Task 1: draw from SMILES and verify formula
  let r = await run('draw.smiles', { smiles: 'CC(=O)Oc1ccccc1C(=O)O', mode: 'replace' });
  check('T1 draw.smiles aspirin', r.ok && data<{ newAtomIds: string[] }>(r).newAtomIds.length === 13, r);
  r = await run('molecule.get_canvas_state', {});
  const st = data<{ summary: { moleculeCount: number; empiricalFormula?: string; formula?: string } }>(r);
  const formula = st.summary.empiricalFormula ?? st.summary.formula ?? '';
  check('T2 get_canvas_state formula C9H8O4, one molecule', st.summary.moleculeCount === 1 && formula === 'C9H8O4', st.summary);

  // Task 3: render SVG
  r = await run('molecule.render', { width: 400 });
  check('T3 render returns SVG', r.ok && data<{ svg: string }>(r).svg.includes('<svg'), r.ok ? undefined : r);

  // Task 4: semantic selection
  r = await run('molecule.find_substructure', { group: 'carboxylic_acid', select: 'first' });
  check('T4 find_substructure carboxylic_acid → 1 match, selected', r.ok && data<{ count: number }>(r).count === 1 && session.getState().selection.atomIds.length === 3, r);

  // Task 5: edit atom element via case-normalised symbol
  const acidO = data<{ matches: { atomIds: string[] }[] }>(r).matches[0].atomIds;
  const structure = data<{ atoms: { id: string; element: string }[] }>(await run('molecule.get_structure', {}));
  const oh = structure.atoms.find(a => acidO.includes(a.id) && a.element === 'O')!;
  r = await run('edit.atom', { atomId: oh.id, element: 'n' });
  check('T5 edit.atom "n" → N (case-normalised)', r.ok && session.store.getMolecule().atoms.find(a => a.id === oh.id)?.element === 'N', r);

  // Task 6: validation error with issue path
  r = await run('edit.atom', { atomId: oh.id, element: 'Xx' });
  check('T6 bad element → VALIDATION with details', !r.ok && errOf(r)?.code === 'VALIDATION' && (errOf(r)?.message ?? '').toLowerCase().includes('element'), errOf(r));

  // Task 7: NOT_FOUND for invented id
  r = await run('draw.bond', { fromAtomId: oh.id, toAtomId: 'made-up' });
  check('T7 unknown id → NOT_FOUND', !r.ok && errOf(r)?.code === 'NOT_FOUND', errOf(r));

  // Task 8: attach substituent — one undo entry
  const a0 = atoms();
  const b0 = bonds();
  r = await run('draw.atom', { element: 'Cl', attachToAtomId: oh.id });
  check('T8 draw.atom attach adds atom + bond', r.ok && atoms() === a0 + 1 && bonds() === b0 + 1, r);
  r = await run('molecule.undo', {});
  check('T9 undo reverts atom + bond together (transaction)', r.ok && atoms() === a0 && bonds() === b0);

  // Task 10: ring fused / attached
  r = await run('draw.ring', { size: 6, attachToAtomId: oh.id });
  check('T10 draw.ring attach adds 6 atoms', r.ok && atoms() === a0 + 6, r);
  await run('molecule.undo', {});

  // Task 11: stereo survives SMILES → canvas → SMILES
  await run('draw.smiles', { smiles: 'C[C@H](N)C(=O)O', mode: 'replace' });
  r = await run('molecule.export_smiles', {});
  const smi = data<{ smiles: string }>(r).smiles;
  check('T11 stereo round-trip keeps @', r.ok && /@/.test(smi), smi);

  // Task 12: E/Z round trip
  await run('draw.smiles', { smiles: 'C/C=C/C', mode: 'replace' });
  r = await run('molecule.export_smiles', {});
  check('T12 E/Z round-trip keeps / or \\', r.ok && /[\\/]/.test(data<{ smiles: string }>(r).smiles), r);

  // Task 13: batch with references
  await run('command.molecule.clearAll', {});
  const revBefore = session.revision;
  r = await run('molecule.batch', {
    steps: [
      { tool: 'draw.atom', input: { element: 'O', x: 100, y: 100 } },
      { tool: 'draw.atom', input: { element: 'C', x: 140, y: 100 } },
      { tool: 'draw.bond', input: { fromAtomId: '$0.newAtomIds.0', toAtomId: '$1.newAtomIds.0', order: 2 } },
    ],
  });
  check('T13 batch with $ref builds C=O', r.ok && atoms() === 2 && bonds() === 1 && session.store.getMolecule().bonds[0].order === 2, r);
  check('T14 revision advanced', session.revision > revBefore);

  // Task 15: atomic batch rollback
  const a1 = atoms();
  r = await run('molecule.batch', {
    steps: [
      { tool: 'draw.atom', input: { element: 'N', x: 300, y: 100 } },
      { tool: 'draw.bond', input: { fromAtomId: '$0.newAtomIds.0', toAtomId: 'ghost' } },
    ],
  });
  check('T15 failing atomic batch rolls back', !r.ok && atoms() === a1, { ok: r.ok, atoms: atoms() });

  // Task 16: transaction command fails as a unit
  r = await run('command.molecule.transaction', {
    steps: [
      { id: 'molecule.addAtom', input: { atom: { element: 'S', x: 500, y: 100 } } },
      { id: 'molecule.addBond', input: { bond: { fromAtomId: 'nope', toAtomId: 'nope2', order: 1 } } },
    ],
  });
  check('T16 transaction failure applies nothing', !r.ok && atoms() === a1, errOf(r));

  // Task 17: no-op detection
  const revNoop = session.revision;
  const cId = session.store.getMolecule().atoms.find(a => a.element === 'C')!.id;
  r = await run('edit.atom', { atomId: cId, element: 'C' });
  check('T17 no-op edit reports changed:false and keeps revision', r.ok && session.revision === revNoop, { rev: session.revision, revNoop, r });

  // Task 18: expectedRevision guard
  const stale = session.applyCommand({ id: 'molecule.addAtom', expectedRevision: 0 }, { atom: { element: 'F', x: 0, y: 0 } });
  check('T18 stale expectedRevision → STALE_REVISION', !stale.ok && stale.error?.code === 'STALE_REVISION', stale);

  // Task 19: list_tools discovery
  r = await run('moldraw.list_tools', { query: 'perspective', limit: 5 });
  const found = data<{ tools: { id: string }[] }>(r).tools;
  check('T19 list_tools finds advanced tools by query', r.ok && found.some(t => t.id.includes('erspective')), found);

  // Task 20: chain + text + arrow (reaction scaffold)
  await run('command.molecule.clearAll', {});
  r = await run('draw.chain', { length: 4, x: 0, y: 0 });
  check('T20 draw.chain 4 atoms', r.ok && atoms() === 4, r);
  r = await run('draw.arrow', { x1: 200, y1: 0, x2: 300, y2: 0 });
  check('T21 draw.arrow ok', r.ok, r);
  r = await run('draw.text', { text: 'heat', x: 250, y: -20 });
  check('T22 draw.text ok', r.ok, r);
  r = await run('molecule.get_canvas_state', {});
  const ann = data<{ annotations?: { reactionArrows?: unknown[]; texts?: unknown[] }; summary: Record<string, unknown> }>(r);
  check('T23 canvas state reports arrow + text', r.ok && JSON.stringify(ann).includes('heat'), ann.summary);

  // Task 24: edit.delete + undo/redo
  const a2 = atoms();
  const firstId = session.store.getMolecule().atoms[0].id;
  r = await run('edit.delete', { atomIds: [firstId] });
  check('T24 edit.delete removes atom', r.ok && atoms() === a2 - 1, r);
  await run('molecule.undo', {});
  r = await run('molecule.redo', {});
  check('T25 undo/redo restore + reapply', r.ok && atoms() === a2 - 1);

  // Task 26: valency is enforced at draw time, with a chemistry reason
  await run('command.molecule.clearAll', {});
  await run('draw.smiles', { smiles: 'C', mode: 'replace' });
  const c = session.store.getMolecule().atoms[0].id;
  for (let i = 0; i < 4; i++) r = await run('draw.atom', { element: 'F', attachToAtomId: c });
  check('T26 CF4 builds (4 substituents)', r.ok && atoms() === 5, r);
  r = await run('draw.atom', { element: 'F', attachToAtomId: c });
  check('T27 fifth F refused with valency EXECUTION error, nothing applied', !r.ok && errOf(r)?.code === 'EXECUTION' && /valen/i.test(errOf(r)?.message ?? '') && atoms() === 5, errOf(r));
  r = await run('molecule.check_structure', {});
  check('T28 check_structure on CF4 is clean', r.ok && JSON.stringify(r.data).includes('"issues":[]'), r);
}

// ─── 3. Stdio MCP protocol ──────────────────────────────────────────────────
section('3. Stdio MCP protocol (real server subprocess)');
{
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [tsxCli, '--tsconfig', tsconfigNode, runStdio, '--toolset=core'],
    cwd: root,
    env: { ...(process.env as Record<string, string>), MOLDRAW_MOLECULE_PATH: '', MOLDRAW_SESSION_URL: '', MOLDRAW_MCP_TOOLSET: '' },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'agent-golden', version: '0.0.1' });
  await client.connect(transport);
  const caps = client.getServerCapabilities() ?? {};
  check('capabilities: tools.listChanged + resources + prompts', !!(caps.tools as { listChanged?: boolean })?.listChanged && !!caps.resources && !!caps.prompts, caps);
  check('instructions mention draw.smiles', (client.getInstructions() ?? '').includes('draw.smiles'));

  const tools = await client.listTools();
  const coreCount = listAiToolsForToolset('core').length;
  check(`tools/list (--toolset=core) == registry core (${coreCount})`, tools.tools.length === coreCount, tools.tools.length);
  const drawAtom = tools.tools.find(t => t.name === 'draw.atom');
  check('draw.atom has annotations + outputSchema + described params', !!drawAtom?.annotations && !!drawAtom?.outputSchema && JSON.stringify(drawAtom?.inputSchema).includes('"description"'));

  const call = async (name: string, args: Record<string, unknown>) => {
    const res = await client.callTool({ name, arguments: args });
    return res.structuredContent as { ok: boolean; revision: number; changed: boolean; data?: Record<string, unknown>; error?: { code: string; message: string } };
  };
  let env = await call('draw.smiles', { smiles: 'c1ccccc1O', mode: 'replace' });
  check('MCP draw.smiles envelope ok/revision/changed', env.ok && env.changed && env.revision >= 1, env);
  env = await call('molecule.get_canvas_state', {});
  check('MCP get_canvas_state formula C6H6O', JSON.stringify(env.data).includes('C6H6O'), env.data);
  env = await call('does.not.exist', {});
  check('unknown tool → UNKNOWN_TOOL hint', !env.ok && env.error?.code === 'UNKNOWN_TOOL' && env.error.message.includes('list_tools'), env);
  env = await call('molecule.rotate_perspective', {});
  check('advanced tool callable even when not listed (validation error, not unknown)', env.error?.code !== 'UNKNOWN_TOOL', env);

  const res = await client.listResources();
  check(`resources/list (${MCP_RESOURCES.length})`, res.resources.length === MCP_RESOURCES.length);
  const smiles = await client.readResource({ uri: 'moldraw://molecule.smiles' });
  check('resource molecule.smiles reflects canvas', ((smiles.contents[0] as { text: string }).text ?? '').toLowerCase().includes('o'), smiles.contents[0]);
  const prompts = await client.listPrompts();
  check(`prompts/list (${MCP_PROMPTS.length})`, prompts.prompts.length === MCP_PROMPTS.length);
  const prompt = await client.getPrompt({ name: 'draw-structure', arguments: { structure: 'caffeine' } });
  check('prompt draw-structure renders argument', (prompt.messages[0].content as { text: string }).text.includes('caffeine'));
  await client.close();
}

// ─── 4. Live bridge: HTTP session + MCP proxy ───────────────────────────────
section('4. Live bridge (HTTP session ⇄ MCP --session-url)');
{
  const port = 8790 + Math.floor(Math.random() * 100);
  const { url, close, session } = startHttpServer({ port });
  await new Promise(r => setTimeout(r, 150));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [tsxCli, '--tsconfig', tsconfigNode, runStdio, `--session-url=${url}`],
    cwd: root,
    env: { ...(process.env as Record<string, string>), MOLDRAW_MOLECULE_PATH: '', MOLDRAW_MCP_TOOLSET: '' },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'agent-golden-proxy', version: '0.0.1' });
  await client.connect(transport);
  const listed = await client.listTools();
  const minimalCount = listAiToolsForToolset('minimal').length;
  check(`default tools/list is the minimal toolset (${minimalCount})`, listed.tools.length === minimalCount, listed.tools.length);
  const r1 = await client.callTool({ name: 'draw.smiles', arguments: { smiles: 'CCO', mode: 'replace' } });
  const e1 = r1.structuredContent as { ok: boolean; revision: number };
  check('proxy draw.smiles mutates the HTTP session', e1.ok && session.store.getMolecule().atoms.length === 3 && session.revision === e1.revision, e1);
  const put = await fetch(`${url}/v1/tools/draw.atom`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-moldraw-client-id': 'app' },
    body: JSON.stringify({ element: 'N', x: 200, y: 0 }),
  });
  check('HTTP tool call from "the App" succeeds', put.status === 200);
  const r2 = await client.callTool({ name: 'molecule.get_canvas_state', arguments: {} });
  const e2 = r2.structuredContent as { ok: boolean; data: { summary: { atomCount: number } } };
  check('proxy sees App edits (4 atoms)', e2.ok && e2.data.summary.atomCount === 4, e2.data?.summary);
  const r3 = await client.callTool({ name: 'molecule.undo', arguments: {} });
  check('proxy undo pops the shared history', (r3.structuredContent as { ok: boolean }).ok && session.store.getMolecule().atoms.length === 3);
  await client.close();
  await close();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
