/**
 * Node entry for the Moldraw stdio MCP server (not bundled in Vite).
 * Uses tsconfig.node.json so `@moldraw/...` resolves to `packages/<name>/src`.
 *
 *   npm run mcp -- --toolset=advanced --debug
 *   npm run mcp -- --session-url=http://127.0.0.1:8787   (share the App canvas via `npm run api`)
 *
 * Published equivalent: `npx moldraw-mcp` (bin of @moldraw/ai).
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = path.join(root, 'packages', 'ai', 'src', 'mcp', 'runStdio.ts');
const tsconfig = path.join(root, 'tsconfig.node.json');
const tsxCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');

try {
  execFileSync(process.execPath, [tsxCli, '--tsconfig', tsconfig, entry, ...process.argv.slice(2)], {
    stdio: 'inherit',
    cwd: root,
    env: process.env,
  });
} catch (err) {
  process.exit(typeof err?.status === 'number' ? err.status : 1);
}
