/**
 * Machine-readable catalogue of the MCP surface (tools, toolsets, resources,
 * prompts, env vars). Consumed by `scripts/generate-mcp-catalog.ts` (prebuild →
 * `documentation/mcp/tools-catalog.md`, `public/.well-known/mcp/server-card.json`)
 * and by the `test:agent` suite, so docs can never drift from the registry.
 */
import type { ZodType } from 'zod';
import { listAiToolsByCategory } from '../registry';
import { isToolInToolset, TOOLSETS, toolAnnotations, toolVisibility, type Toolset } from '../toolsets';
import type { RegisteredAiTool } from '../tools/types';
import { zodToJsonSchemaInput } from '../zodToOpenApi';
import { MCP_RESOURCES, type McpResourceDescriptor } from './resources';
import { MCP_PROMPTS, type McpPromptDescriptor } from './prompts';

export interface CatalogParam {
  path: string;
  type: string;
  required: boolean;
  description: string;
  default?: unknown;
}

export interface CatalogTool {
  id: string;
  title: string;
  category: string;
  visibility: 'core' | 'advanced' | 'internal';
  toolsets: Toolset[];
  description: string;
  annotations: ReturnType<typeof toolAnnotations>;
  tags: string[];
  params: CatalogParam[];
  inputSchema: Record<string, unknown>;
}

export interface McpCatalog {
  generatedAt: string;
  toolsets: Record<Toolset, number>;
  tools: CatalogTool[];
  resources: McpResourceDescriptor[];
  prompts: McpPromptDescriptor[];
  env: Record<string, string>;
}

export const MCP_ENV_VARS: Record<string, string> = {
  MOLDRAW_MCP_TOOLSET:
    'Optional. Which tools `tools/list` advertises: `minimal` (default: draw.*/edit.*/reads/undo/batch, ≈30 tools), `core` (adds recipes + core command.*), `advanced`, or `full`. Any known tool can still be called.',
  MOLDRAW_MOLECULE_PATH:
    'Optional. Absolute path to a JSON molecule file; the session loads it on start and persists after each committed mutation.',
  MOLDRAW_SESSION_URL:
    'Optional. Proxy every call to a running local HTTP session (`npm run api`, e.g. `http://127.0.0.1:8787`) so the desktop App and the agent share one live canvas.',
  MOLDRAW_BOND_LENGTH_PX: 'Optional. Default bond length in canvas px (default 40).',
  MOLDRAW_MCP_DEBUG: 'Optional. `1` logs every tool call (name, ms, ok/error code) to stderr.',
};

type J = Record<string, unknown>;

const typeOf = (node: J): string => {
  if (node.enum) return (node.enum as unknown[]).map(v => JSON.stringify(v)).join(' \\| ');
  if (node.const !== undefined) return JSON.stringify(node.const);
  if (typeof node.type === 'string') {
    if (node.type === 'array' && node.items && typeof node.items === 'object') {
      return `${typeOf(node.items as J)}[]`;
    }
    return node.type;
  }
  if (Array.isArray(node.type)) return (node.type as string[]).join(' \\| ');
  for (const key of ['anyOf', 'oneOf'] as const) {
    const arr = node[key] as J[] | undefined;
    if (arr) return arr.map(typeOf).join(' \\| ');
  }
  if (node.allOf) return 'object';
  return 'any';
};

function collectParams(node: J, prefix: string, requiredSet: Set<string>, out: CatalogParam[], depth = 0): void {
  if (depth > 4) return;
  const props = node.properties as J | undefined;
  const req = new Set([...(node.required as string[] | undefined) ?? []]);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      const child = v as J;
      const path = prefix ? `${prefix}.${k}` : k;
      out.push({
        path,
        type: typeOf(child),
        required: prefix ? req.has(k) : requiredSet.has(k),
        description: typeof child.description === 'string' ? child.description : '',
        ...(child.default !== undefined ? { default: child.default } : {}),
      });
      collectParams(child, path, req, out, depth + 1);
      if (child.items && typeof child.items === 'object') {
        collectParams(child.items as J, `${path}[]`, new Set(), out, depth + 1);
      }
    }
  }
  for (const key of ['anyOf', 'oneOf', 'allOf'] as const) {
    const arr = node[key] as J[] | undefined;
    if (arr) for (const branch of arr) collectParams(branch, prefix, requiredSet, out, depth + 1);
  }
}

export function catalogEntryForTool(tool: RegisteredAiTool): CatalogTool {
  const inputSchema = zodToJsonSchemaInput(tool.inputSchema as ZodType) as J;
  const params: CatalogParam[] = [];
  collectParams(inputSchema, '', new Set((inputSchema.required as string[] | undefined) ?? []), params);
  // De-duplicate paths that appear in several union branches.
  const seen = new Set<string>();
  const unique = params.filter(p => (seen.has(p.path) ? false : (seen.add(p.path), true)));
  return {
    id: tool.id,
    title: tool.title ?? tool.id,
    category: tool.category,
    visibility: toolVisibility(tool),
    toolsets: TOOLSETS.filter(ts => isToolInToolset(tool, ts)),
    description: tool.description,
    annotations: toolAnnotations(tool),
    tags: [...(tool.tags ?? [])],
    params: unique,
    inputSchema,
  };
}

export function buildMcpCatalog(): McpCatalog {
  const tools = listAiToolsByCategory().map(catalogEntryForTool);
  const toolsets = Object.fromEntries(
    TOOLSETS.map(ts => [ts, tools.filter(t => t.toolsets.includes(ts)).length]),
  ) as Record<Toolset, number>;
  return {
    generatedAt: new Date().toISOString().slice(0, 10),
    toolsets,
    tools,
    resources: [...MCP_RESOURCES],
    prompts: [...MCP_PROMPTS],
    env: MCP_ENV_VARS,
  };
}

const md = (s: string): string => s.replace(/\|/g, '\\|').replace(/\r?\n+/g, ' ').trim();

export function renderMcpCatalogMarkdown(catalog: McpCatalog): string {
  const lines: string[] = [];
  lines.push('# MCP tools catalogue (generated)');
  lines.push('');
  lines.push(
    '> Generated by `scripts/generate-mcp-catalog.ts` from the live tool registry during `npm run build` (prebuild). Do not edit by hand — change the Zod schema / tool description and rebuild.',
  );
  lines.push('');
  lines.push(
    `Toolsets: **minimal** ${catalog.toolsets.minimal} tools (MCP default) · **core** ${catalog.toolsets.core} · **advanced** ${catalog.toolsets.advanced} · **full** ${catalog.toolsets.full}. Select with \`MOLDRAW_MCP_TOOLSET\` or \`--toolset\`; every tool is callable regardless of the active toolset (use \`moldraw.list_tools\` to discover). Every call returns \`{ ok, revision, changed, data | error }\`.`,
  );
  lines.push('');
  lines.push('## Environment');
  lines.push('');
  lines.push('| Variable | Meaning |');
  lines.push('|---|---|');
  for (const [k, v] of Object.entries(catalog.env)) lines.push(`| \`${k}\` | ${md(v)} |`);
  lines.push('');
  lines.push('## Resources');
  lines.push('');
  lines.push('| URI | MIME | Description |');
  lines.push('|---|---|---|');
  for (const r of catalog.resources) lines.push(`| \`${r.uri}\` | \`${r.mimeType}\` | ${md(r.description)} |`);
  lines.push('');
  lines.push('## Prompts');
  lines.push('');
  lines.push('| Name | Arguments | Description |');
  lines.push('|---|---|---|');
  for (const p of catalog.prompts) {
    const args = p.arguments.map(a => `\`${a.name}\`${a.required ? '*' : ''}`).join(', ') || '—';
    lines.push(`| \`${p.name}\` | ${args} | ${md(p.description)} |`);
  }
  lines.push('');
  lines.push('## Tools by toolset');
  lines.push('');
  lines.push('Each tool is listed once, under the smallest toolset that advertises it (toolsets nest: minimal ⊂ core ⊂ advanced ⊂ full).');
  lines.push('');
  for (let i = 0; i < TOOLSETS.length; i++) {
    const ts = TOOLSETS[i];
    const prev = TOOLSETS[i - 1];
    const inSet = catalog.tools.filter(t => t.toolsets[0] === ts);
    lines.push(`### ${ts} (${inSet.length} tools${i === 0 ? ' — advertised by default' : ` added on top of ${prev}`})`);
    lines.push('');
    lines.push('| Tool | Category | Read-only | Destructive | Summary |');
    lines.push('|---|---|---|---|---|');
    for (const t of inSet) {
      const anchor = t.id.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      lines.push(
        `| [\`${t.id}\`](#${anchor}) | ${t.category} | ${t.annotations.readOnlyHint ? 'yes' : 'no'} | ${t.annotations.destructiveHint ? 'yes' : 'no'} | ${md(t.description).slice(0, 140)}${t.description.length > 140 ? '…' : ''} |`,
      );
    }
    lines.push('');
  }
  lines.push('## Tool details');
  lines.push('');
  for (const t of catalog.tools) {
    lines.push(`### \`${t.id}\``);
    lines.push('');
    lines.push(
      `Category \`${t.category}\` · toolset \`${t.toolsets[0]}\` · read-only ${t.annotations.readOnlyHint ? 'yes' : 'no'} · destructive ${t.annotations.destructiveHint ? 'yes' : 'no'} · idempotent ${t.annotations.idempotentHint ? 'yes' : 'no'}${t.tags.length ? ` · tags: ${t.tags.join(', ')}` : ''}`,
    );
    lines.push('');
    lines.push(md(t.description));
    lines.push('');
    if (t.params.length === 0) {
      lines.push('No parameters (`{}`).');
    } else {
      lines.push('| Param | Type | Required | Default | Description |');
      lines.push('|---|---|---|---|---|');
      for (const p of t.params) {
        lines.push(
          `| \`${p.path}\` | ${p.type} | ${p.required ? 'yes' : ''} | ${p.default !== undefined ? `\`${JSON.stringify(p.default)}\`` : ''} | ${md(p.description)} |`,
        );
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}
