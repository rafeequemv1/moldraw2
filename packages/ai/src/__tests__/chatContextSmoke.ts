/**
 * Smoke: intent subsets + history compaction + compound-vs-text routing.
 *   npx tsx --tsconfig tsconfig.app.json packages/ai/src/__tests__/chatContextSmoke.ts
 */
import { classifyChatIntent } from '../chat/intentRouter';
import { compactMessagesForLlm, foldMessagesIntoMemory } from '../chat/compactHistory';
import { buildLlmToolsForIntent, buildLlmToolsForChat } from '../chat/toolBridge';
import { resolveAiToolId } from '../registry';
import type { ChatMessage } from '../chat/types';

const full = buildLlmToolsForChat().length;
const draw = buildLlmToolsForIntent('draw').length;
const scheme = buildLlmToolsForIntent('scheme').length;
const read = buildLlmToolsForIntent('read').length;
const importTools = buildLlmToolsForIntent('import');

console.log({ full, draw, scheme, read, importTools: importTools.length });
console.log('intent draw', classifyChatIntent('draw benzene'));
console.log('intent scheme', classifyChatIntent('add a 9 step reaction'));
console.log('intent import', classifyChatIntent('import aspirin'));

if (classifyChatIntent('add testosterone') !== 'import') {
  console.error('FAIL: add testosterone should be import');
  process.exit(1);
}
if (classifyChatIntent('add testasterone') !== 'import') {
  console.error('FAIL: add testasterone (typo) should be import');
  process.exit(1);
}
if (classifyChatIntent('ADD TESTOSTERONE') !== 'import') {
  console.error('FAIL: ADD TESTOSTERONE should be import');
  process.exit(1);
}
if (classifyChatIntent('draw benzene') !== 'draw') {
  console.error('FAIL: draw benzene should stay draw');
  process.exit(1);
}
if (classifyChatIntent('fix the ethanol') !== 'edit') {
  console.error('FAIL: fix the ethanol should be edit');
  process.exit(1);
}
if (classifyChatIntent('replace leftmost with nicotine') !== 'edit') {
  console.error('FAIL: replace leftmost should be edit');
  process.exit(1);
}
if (classifyChatIntent('change the chlorine to fluorine') !== 'edit') {
  console.error('FAIL: change chlorine should be edit');
  process.exit(1);
}
if (classifyChatIntent('add a text label') !== 'draw') {
  console.error('FAIL: add a text label should be draw');
  process.exit(1);
}
if (!importTools.some(t => t.name.includes('importSmiles'))) {
  console.error('FAIL: import intent must expose importSmiles');
  process.exit(1);
}
if (importTools.some(t => t.name.includes('addCanvasText'))) {
  console.error('FAIL: import intent must not expose addCanvasText');
  process.exit(1);
}
if (resolveAiToolId('build_reaction_scheme') !== 'molecule.build_reaction_scheme') {
  console.error('FAIL: alias build_reaction_scheme');
  process.exit(1);
}

if (draw >= full || scheme >= full) {
  console.error('FAIL: intent subsets should be smaller than full chat catalog');
  process.exit(1);
}
if (draw > 36 || scheme > 20 || read > 12) {
  console.error('FAIL: intent subsets still too large', { draw, scheme, read });
  process.exit(1);
}

// Formerly MCP-only commands must be chat-eligible for edit/chemistry/import.
const editTools = buildLlmToolsForIntent('edit');
const chemTools = buildLlmToolsForIntent('chemistry');
const importToolsFull = buildLlmToolsForIntent('import');
for (const need of [
  'command.molecule.updateAtomLonePairs',
  'command.molecule.invertStereoAtAtom',
  'command.molecule.flipBondEndpoints',
  'command.molecule.swapAtomPositions',
]) {
  if (!editTools.some(t => t.name === need)) {
    console.error('FAIL: edit missing', need);
    process.exit(1);
  }
}
if (!chemTools.some(t => t.name === 'command.molecule.flatten3DPose')) {
  console.error('FAIL: chemistry missing flatten3DPose');
  process.exit(1);
}
if (!importToolsFull.some(t => t.name === 'command.molecule.importMolblock')) {
  console.error('FAIL: import missing importMolblock');
  process.exit(1);
}
if (classifyChatIntent('add a lone pair') !== 'edit') {
  console.error('FAIL: lone pair should be edit');
  process.exit(1);
}
if (classifyChatIntent('flatten the 3d pose') !== 'chemistry') {
  console.error('FAIL: flatten should be chemistry');
  process.exit(1);
}

const msgs: ChatMessage[] = [];
for (let i = 0; i < 20; i++) {
  msgs.push({ id: `u${i}`, role: 'user', content: `msg ${i}` });
  msgs.push({ id: `a${i}`, role: 'assistant', content: `reply ${i}` });
}
const memory = foldMessagesIntoMemory('', msgs.slice(0, 30));
const compacted = compactMessagesForLlm(msgs, { memory, recentLimit: 10 });
console.log('compacted len', compacted.length, 'memory chars', memory.length);
if (compacted.length > 12) {
  console.error('FAIL: compacted history too long', compacted.length);
  process.exit(1);
}
if (!compacted[0]?.content.includes('Session memory')) {
  console.error('FAIL: expected memory blot');
  process.exit(1);
}

// Tool rows: UI summary + full JSON for LLM
const toolUi: ChatMessage = {
  id: 't1',
  role: 'tool',
  toolName: 'molecule.stats',
  toolOk: true,
  content: 'stats ✓',
  llmContent: JSON.stringify({ ok: true, atomCount: 12, smiles: 'CCO' }),
};
const withTool = compactMessagesForLlm([toolUi], { recentLimit: 10 });
const toolForLlm = withTool.find(m => m.role === 'tool');
if (!toolForLlm?.content.includes('"atomCount":12')) {
  console.error('FAIL: LLM history must keep full tool JSON', toolForLlm?.content);
  process.exit(1);
}
if (toolUi.content !== 'stats ✓') {
  console.error('FAIL: UI tool content must stay summarized');
  process.exit(1);
}

console.log('OK');
