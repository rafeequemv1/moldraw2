import { defineConfig } from 'tsup'
import { createMoldrawTsupConfig } from '../../scripts/createMoldrawTsupConfig'

const base = createMoldrawTsupConfig([
  'src/index.ts',
  'src/mcp/index.ts',
  'src/mcp/cli.ts',
  'src/http/index.ts',
  'src/chat/index.ts',
])

/** MCP stdio uses `node:fs` / `process`; use a Node-typed tsconfig for DTS. */
export default defineConfig({
  ...base,
  tsconfig: './tsconfig.json',
  // `dist/mcp/cli.js` is the `moldraw-mcp` bin (esbuild preserves the entry shebang).
})
