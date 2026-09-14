/**
 * Stdio MCP server — thin adapter over an independent Moldraw session.
 * Run via `npm run mcp` (see scripts/run-mcp-server.mjs) or the `moldraw-mcp` bin.
 *
 * Env:
 *  - MOLDRAW_MCP_TOOLSET   minimal (default) | core | advanced | full — shapes `tools/list` only.
 *  - MOLDRAW_MOLECULE_PATH persist the document to this JSON file.
 *  - MOLDRAW_SESSION_URL   proxy every call to a running local HTTP session (App bridge).
 *  - MOLDRAW_MCP_DEBUG=1   log each call to stderr.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { ZodType } from 'zod';
import { zodToJsonSchemaInput } from '../zodToOpenApi';
import { getRegisteredAiTool, listAiToolsByCategory } from '../registry';
import { executeAiTool } from '../executor';
import { isToolInToolset, resolveToolset, toolAnnotations, type Toolset } from '../toolsets';
import type { RegisteredAiTool } from '../tools/types';
import { PLUGIN_MCP_TOOLS, handlePluginMcpTool, ensureMcpPluginHost } from './pluginTools';
import { createHeadlessSession } from '../session/createHeadlessSession';
import type { MoldrawSession } from '../session/types';
import { envelopeToCallResult, MCP_ENVELOPE_DOC, MCP_ENVELOPE_OUTPUT_SCHEMA, type McpToolEnvelope } from './envelope';
import { MCP_RESOURCES, readMcpResource } from './resources';
import { getMcpPromptMessages, MCP_PROMPTS } from './prompts';
import { createProxySession, type ProxySession } from './proxySession';

export const MCP_SERVER_INSTRUCTIONS = [
  'Moldraw is a ChemDraw-class 2D chemistry editor. Every tool edits one shared document (the canvas) held by this session.',
  '',
  'Start here: draw.smiles (draw a structure from SMILES), draw.ring / draw.chain / draw.atom / draw.bond (build up manually),',
  'edit.atom / edit.bond / edit.delete (modify), molecule.get_canvas_state + molecule.render (verify what is drawn),',
  'molecule.undo (revert). Use molecule.batch to apply several steps atomically in one call; later steps can reference',
  'earlier results with "$0.newAtomIds.0". Element symbols are validated and case-normalised ("cl" → "Cl").',
  '',
  MCP_ENVELOPE_DOC,
  'Fix the input and retry on VALIDATION / NOT_FOUND rather than guessing; on STALE_REVISION re-read the canvas first.',
  '',
  'Coordinates are canvas pixels (x right, y down); the default bond length is 40 px. Atom / bond ids are strings that come',
  'from tool results (newAtomIds) or from molecule.get_structure / molecule.find_substructure — never invent ids.',
  'The listed catalogue is a toolset (default `minimal`: draw.* / edit.* / reads / undo / batch). Every registered tool is',
  'callable even when not listed: call moldraw.list_tools (query, tag, category) to discover recipes such as',
  'molecule.build_reaction_scheme, molecule.place_template, molecule.move_fragment, colouring, arrays, perspective, glassware,',
  'polymers, and the raw command.molecule.* layer.',
  'Resources moldraw://molecule.svg, moldraw://molecule.smiles and moldraw://canvas-state.json mirror the read tools.',
].join('\n');

export interface StartStdioMcpServerOptions {
  toolset?: Toolset;
  moleculePath?: string;
  /** Proxy to a running local HTTP session (`http://127.0.0.1:8787`). Defaults to `MOLDRAW_SESSION_URL`. */
  sessionUrl?: string;
  debug?: boolean;
  version?: string;
}

const debugLog = (enabled: boolean, ...args: unknown[]): void => {
  if (enabled) console.error('[moldraw-mcp]', ...args);
};

function describeTool(tool: RegisteredAiTool) {
  return {
    name: tool.id,
    title: tool.title ?? tool.id,
    description: tool.description,
    inputSchema: zodToJsonSchemaInput(tool.inputSchema as ZodType),
    outputSchema: MCP_ENVELOPE_OUTPUT_SCHEMA,
    annotations: toolAnnotations(tool),
  };
}

function pluginToolDescriptor(t: (typeof PLUGIN_MCP_TOOLS)[number]) {
  const destructive = t.id === 'plugin.uninstall';
  const readOnly = t.id === 'plugin.list_catalog' || t.id === 'plugin.list_installed';
  return {
    name: t.id,
    title: t.id,
    description: t.description,
    inputSchema: zodToJsonSchemaInput(t.inputSchema as ZodType),
    outputSchema: MCP_ENVELOPE_OUTPUT_SCHEMA,
    annotations: {
      title: t.id,
      readOnlyHint: readOnly,
      destructiveHint: destructive,
      idempotentHint: readOnly || !destructive,
      openWorldHint: false,
    },
  };
}

export async function startStdioMcpServer(opts: StartStdioMcpServerOptions = {}): Promise<void> {
  const toolset = opts.toolset ?? resolveToolset(process.env.MOLDRAW_MCP_TOOLSET);
  const debug = opts.debug ?? process.env.MOLDRAW_MCP_DEBUG === '1';
  const sessionUrl = opts.sessionUrl ?? process.env.MOLDRAW_SESSION_URL;

  let proxy: ProxySession | null = null;
  let session: MoldrawSession;
  if (sessionUrl) {
    proxy = createProxySession(sessionUrl);
    session = await proxy.connect();
    debugLog(debug, `proxying to ${sessionUrl}`);
  } else {
    session = createHeadlessSession({ moleculePath: opts.moleculePath });
  }

  const getMoleculeJson = () => JSON.stringify(session.store.getMolecule());
  await ensureMcpPluginHost(getMoleculeJson);

  const server = new Server(
    { name: 'moldraw', version: opts.version ?? '0.2.0' },
    {
      capabilities: {
        tools: { listChanged: true },
        resources: { subscribe: false, listChanged: false },
        prompts: { listChanged: false },
      },
      instructions: MCP_SERVER_INSTRUCTIONS,
    },
  );

  // ─── tools ────────────────────────────────────────────────────────────────
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      ...listAiToolsByCategory()
        .filter(t => isToolInToolset(t, toolset))
        .map(describeTool),
      ...(toolset === 'advanced' || toolset === 'full' ? PLUGIN_MCP_TOOLS.map(pluginToolDescriptor) : []),
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async request => {
    const toolName = request.params.name;
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    const started = Date.now();
    const finish = (env: McpToolEnvelope) => {
      debugLog(debug, toolName, env.ok ? 'ok' : `error:${env.error?.code}`, `changed=${env.changed}`, `${Date.now() - started}ms`);
      return envelopeToCallResult(env);
    };

    if (toolName.startsWith('plugin.') && PLUGIN_MCP_TOOLS.some(t => t.id === toolName)) {
      const r = await handlePluginMcpTool(toolName, args, getMoleculeJson);
      if (r.ok && toolName !== 'plugin.list_catalog' && toolName !== 'plugin.list_installed') {
        // Plugin tools were added / removed → tell clients to refresh `tools/list`.
        server.sendToolListChanged().catch(() => undefined);
      }
      return finish(
        r.ok
          ? { ok: true, revision: session.revision, changed: false, data: r.data }
          : { ok: false, revision: session.revision, changed: false, error: { code: 'EXECUTION', message: r.error } },
      );
    }

    if (!getRegisteredAiTool(toolName)) {
      return finish({
        ok: false,
        revision: session.revision,
        changed: false,
        error: {
          code: 'UNKNOWN_TOOL',
          message: `Unknown tool "${toolName}". Call moldraw.list_tools to search the catalogue.`,
        },
      });
    }

    if (proxy) {
      return finish(await proxy.callTool(toolName, args));
    }

    const before = session.revision;
    const result = await executeAiTool(toolName, args, session.ctx);
    if (result.ok) {
      return finish({ ok: true, revision: session.revision, changed: session.revision !== before, data: result.data ?? {} });
    }
    return finish({
      ok: false,
      revision: session.revision,
      changed: false,
      error: { code: result.error.code, message: result.error.message, details: result.error.details },
    });
  });

  // ─── resources ────────────────────────────────────────────────────────────
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: MCP_RESOURCES.map(r => ({ ...r })),
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async request => {
    const uri = request.params.uri;
    if (proxy) await proxy.refresh();
    const content = readMcpResource(session, uri);
    if (!content) throw new Error(`Unknown resource: ${uri}`);
    return { contents: [content] };
  });

  // ─── prompts ──────────────────────────────────────────────────────────────
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: MCP_PROMPTS.map(p => ({ ...p })),
  }));

  server.setRequestHandler(GetPromptRequestSchema, async request => {
    const messages = getMcpPromptMessages(request.params.name, (request.params.arguments ?? {}) as Record<string, string>);
    if (!messages) throw new Error(`Unknown prompt: ${request.params.name}`);
    const desc = MCP_PROMPTS.find(p => p.name === request.params.name);
    return { description: desc?.description, messages };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  debugLog(debug, `ready (toolset=${toolset}, tools=${listAiToolsByCategory().filter(t => isToolInToolset(t, toolset)).length})`);
}
