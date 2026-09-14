/**
 * Repo-local stdio entry (`npm run mcp` → scripts/run-mcp-server.mjs → tsx).
 * Same behaviour as the published `moldraw-mcp` bin (see ./cli.ts).
 */
import { runMcpCli } from './cli';

runMcpCli().catch(err => {
  console.error('Moldraw MCP server failed:', err);
  process.exit(1);
});
