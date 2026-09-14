/**
 * Node entry for the local Moldraw HTTP session API (127.0.0.1 only).
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = path.join(root, 'packages', 'ai', 'src', 'http', 'runHttp.ts');
const tsconfig = path.join(root, 'tsconfig.node.json');

execFileSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['tsx', '--tsconfig', tsconfig, entry],
  {
    stdio: 'inherit',
    cwd: root,
    env: process.env,
  },
);
