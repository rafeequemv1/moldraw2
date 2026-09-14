/**
 * Smoke: extractChatFocusTarget + addRing newAtomIds.
 *   npx tsx --tsconfig tsconfig.app.json packages/ai/src/__tests__/chatFocusSmoke.ts
 */
import { createMoleculeStore, CMD } from '@moldraw/core';
import { extractChatFocusTarget } from '../chat/toolBridge';
import { executeAiTool } from '../index';

const store = createMoleculeStore();
const r = store.applyCommand(CMD.AddRing, {
  center: { x: 300, y: 280 },
  numSides: 6,
  isAromatic: true,
  angleOffset: 0,
});
if (!r.ok) {
  console.error('addRing command failed', r.error);
  process.exit(1);
}
const ids = (r.extra as { newAtomIds?: string[] } | undefined)?.newAtomIds ?? [];
console.log('addRing newAtomIds', ids.length);
if (ids.length < 6) {
  console.error('FAIL expected >=6 new atoms');
  process.exit(1);
}

const toolJson = JSON.stringify({
  ok: true,
  data: { extra: { newAtomIds: ids }, bounds: { minX: 1, maxX: 2, minY: 3, maxY: 4 } },
});
const focus = extractChatFocusTarget(toolJson, 'command.molecule.addRing');
console.log('focus', focus);
if (!focus?.focusAtomIds?.length || focus.focusLabel !== 'Ring on canvas') {
  console.error('FAIL extractChatFocusTarget');
  process.exit(1);
}

const ctx = {
  getMolecule: () => store.getMolecule(),
  applyCommand: (id: string, input: unknown) => store.applyCommand(id, input),
};
const viaTool = await executeAiTool(
  'command.molecule.addRing',
  { center: { x: 500, y: 280 }, numSides: 6, isAromatic: true, angleOffset: 0 },
  ctx,
);
console.log('viaTool', viaTool.ok, viaTool.ok ? viaTool.data : viaTool.error);
if (!viaTool.ok) process.exit(1);
const data = viaTool.data as { extra?: { newAtomIds?: string[] } };
if (!data.extra?.newAtomIds?.length) {
  console.error('FAIL tool data missing newAtomIds');
  process.exit(1);
}
console.log('OK');
