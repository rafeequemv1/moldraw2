#!/usr/bin/env node
/**
 * `moldraw-mcp` — stdio MCP server CLI (`@moldraw/ai` bin).
 *
 *   moldraw-mcp [--toolset=core|advanced|full] [--molecule=<file.json>]
 *               [--session-url=http://127.0.0.1:8787] [--debug] [--help] [--version]
 *
 * Flags win over the equivalent environment variables (MOLDRAW_MCP_TOOLSET,
 * MOLDRAW_MOLECULE_PATH, MOLDRAW_SESSION_URL, MOLDRAW_MCP_DEBUG). Never writes
 * to stdout except through the MCP transport.
 */
import { resolveToolset, TOOLSETS } from '../toolsets';
import { startStdioMcpServer, type StartStdioMcpServerOptions } from './stdioServer';

export const MCP_CLI_VERSION = '0.2.0';

const HELP = `moldraw-mcp ${MCP_CLI_VERSION} — Moldraw chemistry canvas as an MCP server (stdio)

Usage: moldraw-mcp [options]

  --toolset=<minimal|core|advanced|full>
                                  Tools advertised by tools/list (default minimal; any tool stays callable)
  --molecule=<path.json>          Load / persist the document at this JSON file
  --session-url=<url>             Proxy to a running local session (npm run api) to share the App canvas
  --bond-length=<px>              Default bond length in canvas px (default 40)
  --debug                         Log every tool call to stderr
  --version                       Print version and exit
  --help                          Show this help

Environment fallbacks: MOLDRAW_MCP_TOOLSET, MOLDRAW_MOLECULE_PATH, MOLDRAW_SESSION_URL,
MOLDRAW_BOND_LENGTH_PX, MOLDRAW_MCP_DEBUG=1.
`;

export interface ParsedMcpCliArgs {
  options: StartStdioMcpServerOptions;
  help: boolean;
  version: boolean;
  errors: string[];
}

export function parseMcpCliArgs(argv: readonly string[], env: NodeJS.ProcessEnv = process.env): ParsedMcpCliArgs {
  const out: ParsedMcpCliArgs = { options: {}, help: false, version: false, errors: [] };
  const read = (flag: string, i: number): [string | undefined, number] => {
    const a = argv[i];
    if (a.startsWith(`${flag}=`)) return [a.slice(flag.length + 1), i];
    return [argv[i + 1], i + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--version' || a === '-v') out.version = true;
    else if (a === '--debug') out.options.debug = true;
    else if (a.startsWith('--toolset')) {
      const [v, next] = read('--toolset', i);
      i = next;
      if (!v || !(TOOLSETS as readonly string[]).includes(v.toLowerCase())) {
        out.errors.push(`--toolset must be one of ${TOOLSETS.join(', ')} (got "${v ?? ''}")`);
      } else out.options.toolset = resolveToolset(v);
    } else if (a.startsWith('--molecule')) {
      const [v, next] = read('--molecule', i);
      i = next;
      if (!v) out.errors.push('--molecule needs a file path');
      else out.options.moleculePath = v;
    } else if (a.startsWith('--session-url')) {
      const [v, next] = read('--session-url', i);
      i = next;
      if (!v || !/^https?:\/\//.test(v)) out.errors.push('--session-url must be an http(s) URL');
      else out.options.sessionUrl = v;
    } else if (a.startsWith('--bond-length')) {
      const [v, next] = read('--bond-length', i);
      i = next;
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) out.errors.push('--bond-length must be a positive number');
      else env.MOLDRAW_BOND_LENGTH_PX = String(n);
    } else if (a.startsWith('-')) out.errors.push(`Unknown option "${a}"`);
  }
  if (out.options.debug == null && env.MOLDRAW_MCP_DEBUG === '1') out.options.debug = true;
  out.options.version = MCP_CLI_VERSION;
  return out;
}

export async function runMcpCli(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const parsed = parseMcpCliArgs(argv);
  if (parsed.help) {
    process.stderr.write(HELP);
    return;
  }
  if (parsed.version) {
    process.stderr.write(`${MCP_CLI_VERSION}\n`);
    return;
  }
  if (parsed.errors.length) {
    process.stderr.write(`${parsed.errors.join('\n')}\n\n${HELP}`);
    process.exitCode = 2;
    return;
  }
  await startStdioMcpServer(parsed.options);
}

// Run when executed directly (`moldraw-mcp` bin / `tsx cli.ts`), not when imported
// by runStdio.ts or the tests.
const invokedDirectly = (() => {
  const entry = (process.argv[1] ?? '').replace(/\\/g, '/');
  return /\/mcp\/cli\.(c|m)?(j|t)s$/.test(entry) || /\/moldraw-mcp$/.test(entry);
})();

if (invokedDirectly) {
  runMcpCli().catch(err => {
    console.error('Moldraw MCP server failed:', err);
    process.exit(1);
  });
}
