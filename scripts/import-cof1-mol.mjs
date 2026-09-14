import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync('d:/downloads/COF-1_from_CIF_MOL_V2000.mol', 'utf8');
const lines = src.replace(/\r\n/g, '\n').split('\n');

let countsIdx = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('V2000')) {
    countsIdx = i;
    break;
  }
}
if (countsIdx < 0) throw new Error('counts line not found');

const numAtoms = 175;
const numBonds = 192;

const header = lines.slice(0, countsIdx);
header.push(
  `${String(numAtoms).padStart(3)}${String(numBonds).padStart(3)}  0  0  0  0  0  0  0  0999 V2000`,
);

const atomLines = lines.slice(countsIdx + 1, countsIdx + 1 + numAtoms);
const bondRaw = lines.slice(countsIdx + 1 + numAtoms, countsIdx + 1 + numAtoms + numBonds);

function splitIndices(token, max = numAtoms) {
  const n = parseInt(token, 10);
  if (!Number.isFinite(n) || n <= max) return null;
  const s = String(n);
  for (let i = 1; i < s.length; i++) {
    const a = parseInt(s.slice(0, i), 10);
    const b = parseInt(s.slice(i), 10);
    if (a >= 1 && a <= max && b >= 1 && b <= max) return [a, b];
  }
  throw new Error(`Cannot split bond token: ${token}`);
}

const bondLines = bondRaw.map(line => {
  const trimmed = line.trim();
  if (!trimmed) return line;
  const parts = trimmed.split(/\s+/);
  let from;
  let to;
  let order;
  const first = parseInt(parts[0], 10);
  if (parts.length >= 3 && first <= numAtoms && parseInt(parts[1], 10) <= numAtoms) {
    from = first;
    to = parseInt(parts[1], 10);
    order = parseInt(parts[2], 10);
  } else {
    const split = splitIndices(parts[0]);
    from = split[0];
    to = split[1];
    order = parseInt(parts[1], 10);
  }
  const stereo = parts[3] ?? '0';
  const rest = parts.slice(4).join(' ') || '0  0  0';
  return `${String(from).padStart(3)}${String(to).padStart(3)}${String(order).padStart(3)}  ${stereo}  ${rest}`;
});

const molblock = [...header, ...atomLines, ...bondLines, 'M  END', ''].join('\n');
const escaped = molblock.replace(/\\/g, '\\\\').replace(/`/g, '\\`');

const out = `/** COF-1 hexagonal pore — from CIF 05000N2(1), one 2D layer (V2000 molblock). */
export const COF1_HEX_PORE_MOLBLOCK = \`${escaped}\`;
`;

const molPath = join(root, 'packages/templates/src/library/assets/COF-1.mol');
writeFileSync(molPath, molblock);

const tsPath = join(root, 'packages/templates/src/library/assets/cof1FromCif.ts');
writeFileSync(
  tsPath,
  `/** COF-1 hexagonal pore — from CIF 05000N2(1), one 2D layer (V2000 molblock). */\nexport const COF1_HEX_PORE_MOLBLOCK = \`${escaped}\`;\n`,
);

console.log('Wrote', molPath, 'and', tsPath, 'atoms', numAtoms, 'bonds', numBonds);
