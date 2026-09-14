/**
 * Smoke: curated chat tools + edit-intent heuristic.
 *   npx tsx --tsconfig tsconfig.app.json packages/ai/src/__tests__/chatToolsSmoke.ts
 */
import {
  buildLlmToolsForChat,
  buildLlmToolsFromRegistry,
  userRequestsCanvasEdit,
} from '../chat/toolBridge';
import { zodToOpenApiParameters } from '../zodToOpenApi';
import { z } from 'zod';

const all = buildLlmToolsFromRegistry();
const chat = buildLlmToolsForChat();
const over64 = all.filter(t => t.name.length > 64);

console.log(`full registry: ${all.length}`);
console.log(`chat curated: ${chat.length}`);
console.log(
  'over 64 chars:',
  over64.length ? over64.map(t => `${t.name} (${t.name.length})`).join(', ') : 'none',
);
console.log('has build_reaction_scheme', chat.some(t => t.name === 'molecule.build_reaction_scheme'));
console.log('has place_glassware', chat.some(t => t.name === 'molecule.place_glassware'));
console.log('has list_glassware', chat.some(t => t.name === 'molecule.list_glassware'));
console.log('has build_lab_manual', chat.some(t => t.name === 'molecule.build_lab_manual'));
console.log('has addRing', chat.some(t => t.name === 'command.molecule.addRing'));
console.log('has importSmiles', chat.some(t => t.name.includes('importSmiles')));
console.log('edit: benzene', userRequestsCanvasEdit('add a benzene ring'));
console.log('edit: 9 steps', userRequestsCanvasEdit('add a reaction with 9 steps'));
console.log('edit: reflux', userRequestsCanvasEdit('draw a reflux setup with RBF'));
console.log('edit: hello', userRequestsCanvasEdit('hello'));

// Flash rejects min/max numeric bounds (“too many states”).
const bounded = zodToOpenApiParameters(z.object({ order: z.number().int().min(1).max(3) }));
const order = (bounded.properties as Record<string, Record<string, unknown>> | undefined)?.order;
if (order && ('minimum' in order || 'maximum' in order)) {
  console.error('FAIL: sanitized schema still has minimum/maximum', order);
  process.exit(1);
}
console.log('sanitized order schema', order);

if (chat.length >= all.length) {
  console.error('FAIL: chat tools should be fewer than full registry');
  process.exit(1);
}
if (chat.length > 70) {
  console.error('FAIL: chat tool set still too large for Flash schemas', chat.length);
  process.exit(1);
}
if (over64.length) {
  console.error('FAIL: tool names exceed Gemini 64-char limit');
  process.exit(1);
}
if (!userRequestsCanvasEdit('add a benzene ring')) {
  console.error('FAIL: edit heuristic');
  process.exit(1);
}
if (!chat.some(t => t.name === 'molecule.place_glassware')) {
  console.error('FAIL: chat missing place_glassware');
  process.exit(1);
}
if (!chat.some(t => t.name === 'molecule.build_lab_manual')) {
  console.error('FAIL: chat missing build_lab_manual');
  process.exit(1);
}
if (!all.some(t => t.name === 'molecule.list_glassware')) {
  console.error('FAIL: registry missing list_glassware');
  process.exit(1);
}
console.log('OK');
