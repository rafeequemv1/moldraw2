/**
 * Verify cover-art CDXML opens with accurate bond lengths.
 * Run: npx --yes -p @xmldom/xmldom tsx src/engine/__tests__/cdxmlCoverArtDiag.ts
 */
import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
try {
  const { DOMParser } = require('@xmldom/xmldom');
  (globalThis as { DOMParser: unknown }).DOMParser = DOMParser;
} catch {
  console.error('Install @xmldom/xmldom for this Node test, or run in browser.');
  process.exit(1);
}

const { cdxmlToMolecule } = await import('../../core/io/cdxmlToMolblock');

const path = process.argv[2] || 'C:/Users/User/Desktop/cover art . _chemdraw file.cdxml';
const xml = fs.readFileSync(path, 'utf8');
const bondLenPx = 45;
const mol = cdxmlToMolecule(xml, { bondLengthPx: bondLenPx });
if (!mol) {
  console.error('parse failed');
  process.exit(1);
}
console.log('atoms', mol.atoms.length, 'bonds', mol.bonds.length);
const xs = mol.atoms.map(a => a.x);
const ys = mol.atoms.map(a => a.y);
console.log('span px', (Math.max(...xs) - Math.min(...xs)).toFixed(1), (Math.max(...ys) - Math.min(...ys)).toFixed(1));
let sum = 0;
let n = 0;
for (const b of mol.bonds) {
  const a = mol.atoms.find(x => x.id === b.fromAtomId);
  const c = mol.atoms.find(x => x.id === b.toAtomId);
  if (!a || !c) continue;
  sum += Math.hypot(a.x - c.x, a.y - c.y);
  n += 1;
}
const avg = n ? sum / n : 0;
console.log('avg bond px', avg.toFixed(3), 'target', bondLenPx);
if (Math.abs(avg - bondLenPx) > 2) {
  console.error('FAIL: bond length not preserved');
  process.exit(1);
}
if (mol.atoms.length < 2000) {
  console.error('FAIL: expected large multi-fragment file');
  process.exit(1);
}
console.log('OK: cover-art CDXML coords accurate');
