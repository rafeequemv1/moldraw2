/**
 * Embed COF-1.mol as a TypeScript string for tsc-compatible imports (Vite ?raw breaks tsc).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const molPath = path.join(root, 'packages', 'templates', 'src', 'library', 'assets', 'COF-1.mol');
const outPath = path.join(root, 'packages', 'templates', 'src', 'library', 'assets', 'cof1MolRaw.ts');

const mol = fs.readFileSync(molPath, 'utf8');
const escaped = mol.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

const out = `/** Auto-generated from COF-1.mol — run \`npm run prebuild\` after editing the mol file. */
const cof1MolRaw = \`${escaped}\`;
export default cof1MolRaw;
`;

fs.writeFileSync(outPath, out, 'utf8');
console.log('[generate-cof1-mol-raw] Wrote', path.relative(root, outPath));
