#!/usr/bin/env tsx
/**
 * Generates public AI-discovery + SEO assets from documentation/ + docNav.
 * Run before `vite build` (see package.json `prebuild`).
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_DOC_SECTIONS } from '../src/features/documentation/docNav.ts';
import { buildOpenApiDocument } from '../packages/ai/src/http/dispatch.ts';
import { buildMcpCatalog } from '../packages/ai/src/mcp/catalog.ts';
import { DEFAULT_MCP_TOOLSET, TOOLSETS } from '../packages/ai/src/toolsets.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const publicDir = join(root, 'public');
const docsSrc = join(root, 'documentation');

const siteOrigin = (process.env.VITE_SITE_URL ?? 'https://moldraw.vercel.app').replace(/\/$/, '');
const today = new Date().toISOString().slice(0, 10);
const mcpCatalog = buildMcpCatalog();

const writeText = (rel: string, body: string): void => {
  const path = join(publicDir, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body.endsWith('\n') ? body : `${body}\n`, 'utf8');
};

const writeJson = (rel: string, value: unknown): void => {
  writeText(rel, JSON.stringify(value, null, 2));
};

const sitemapUrl = (loc: string, priority: string): string => `  <url>
    <loc>${loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${priority}</priority>
  </url>`;

mkdirSync(publicDir, { recursive: true });
rmSync(join(publicDir, 'docs'), { recursive: true, force: true });
rmSync(join(publicDir, 'api'), { recursive: true, force: true });
rmSync(join(publicDir, '.well-known'), { recursive: true, force: true });

const pages = ALL_DOC_SECTIONS.map(section => {
  const sourcePath = join(docsSrc, section.file);
  const markdown = readFileSync(sourcePath, 'utf8');
  return { section, markdown };
});

for (const { section, markdown } of pages) {
  writeText(`docs/${section.slug}.md`, markdown);
  writeText(`api/md/${section.slug}.md`, markdown);
}

writeJson(
  'api/md/_catalog.json',
  pages.map(({ section }) => ({
    title: section.title,
    slug: section.slug,
    description: section.description,
    html: `${siteOrigin}/docs/${section.slug}`,
    markdown: `${siteOrigin}/docs/${section.slug}.md`,
  })),
);

const llmsLines = [
  '# Moldraw',
  '',
  '> ChemDraw-class visual chemistry editor. Humans draw on the canvas. Agents and software use the same Zod commands through a session kernel (MCP and local HTTP).',
  '',
  `Site: ${siteOrigin}`,
  `Documentation (HTML): ${siteOrigin}/docs/introduction`,
  `Documentation (Markdown twins): ${siteOrigin}/docs/introduction.md`,
  `For AI agents: ${siteOrigin}/docs/for-agents.md`,
  `Full text: ${siteOrigin}/llms-full.txt`,
  `Policy: ${siteOrigin}/ai.txt`,
  `Markdown catalog: ${siteOrigin}/api/md/_catalog.json`,
  `Sitemap: ${siteOrigin}/sitemap.xml`,
  '',
  '## Mental model',
  '',
  'Zod command registry → session kernel → store → canvas (session-unaware) · MCP · HTTP',
  '',
  '- Canvas / embed: host store (`createMoleculeStore`) → `store.applyCommand`.',
  '- MCP / HTTP / Node tools: `session.applyCommand` only. Never `runCommand` as an adapter.',
  '- Local HTTP binds `127.0.0.1` only (`npm run api`). Stdio MCP: `npx -p @moldraw/ai moldraw-mcp` or `npm run mcp`.',
  `- MCP toolsets: \`${DEFAULT_MCP_TOOLSET}\` (default) ⊂ core ⊂ advanced ⊂ full; every tool callable; discover with \`moldraw.list_tools\`. Start with draw.smiles / draw.ring / edit.atom / molecule.render / molecule.check_structure.`,
  '- Every MCP / HTTP result: `{ ok, revision, changed, data | error: { code, message, details } }`.',
  '- Live canvas: App Settings → AI → Local session bridge + MCP `--session-url=http://127.0.0.1:8787` share one document and undo history.',
  '- This website is discovery. Live mutations run on the user machine.',
  '',
  '## Documentation pages',
  '',
  ...pages.map(
    ({ section }) =>
      `- [${section.title}](${siteOrigin}/docs/${section.slug}) ([md](${siteOrigin}/docs/${section.slug}.md)): ${section.description}`,
  ),
  '',
  '## Discovery',
  '',
  `- ${siteOrigin}/ai.txt`,
  `- ${siteOrigin}/llms-full.txt`,
  `- ${siteOrigin}/api/md/_catalog.json`,
  `- ${siteOrigin}/api/ai.json`,
  `- ${siteOrigin}/api/mcp.json`,
  `- ${siteOrigin}/mcp.md`,
  `- ${siteOrigin}/auth.md`,
  `- ${siteOrigin}/openapi/session-api.json`,
  `- ${siteOrigin}/.well-known/api-catalog`,
  `- ${siteOrigin}/.well-known/mcp/server-card.json`,
  '',
];

writeText('llms.txt', llmsLines.join('\n'));

const fullParts = pages.map(({ section, markdown }) => {
  const html = `${siteOrigin}/docs/${section.slug}`;
  const md = `${siteOrigin}/docs/${section.slug}.md`;
  return [`# ${section.title}`, '', `HTML: ${html}`, `Markdown: ${md}`, '', markdown.trim(), ''].join('\n');
});

writeText(
  'llms-full.txt',
  [
    '# Moldraw — full documentation',
    '',
    `Generated: ${today}`,
    `Index: ${siteOrigin}/llms.txt`,
    '',
    fullParts.join('\n---\n\n'),
    '',
  ].join('\n'),
);

writeText(
  'ai.txt',
  [
    '# Moldraw AI policy',
    '',
    'Moldraw is a visual ChemDraw-class editor. Capabilities underneath are headless.',
    '',
    '## Use',
    '',
    '- Read docs as Markdown: /llms.txt, /llms-full.txt, /docs/{slug}.md, /docs/mcp/tools-catalog.md.',
    '- Mutate structures with session.applyCommand (or executeAiTool + session.ctx).',
    '- Run tools locally: npx -p @moldraw/ai moldraw-mcp / npm run mcp (stdio) or npm run api (127.0.0.1 only).',
    '- Prefer draw.* / edit.* façade tools; verify with molecule.render and molecule.check_structure; undo with molecule.undo.',
    '',
    '## Do not',
    '',
    '- Treat this website as a public execution API.',
    '- Call runCommand as an MCP/HTTP adapter.',
    '- Invent Mut.* or a second mutation surface.',
    '',
    `Guide: ${siteOrigin}/docs/for-agents.md`,
    `Session hub: ${siteOrigin}/docs/architecture/session-and-api.md`,
    `Catalog: ${siteOrigin}/api/md/_catalog.json`,
    '',
  ].join('\n'),
);

writeText(
  'auth.md',
  [
    '# Auth',
    '',
    'Moldraw has no public login and no hosted session API.',
    '',
    '- The website is documentation and a visual editor.',
    '- Stdio MCP (`npm run mcp`) and local HTTP (`npm run api`) run on your machine.',
    '- HTTP binds `127.0.0.1` only. There is no network authentication because the API is not public.',
    '- The process uses your OS user. Do not point `MOLDRAW_MOLECULE_PATH` at sensitive files.',
    '',
    `See ${siteOrigin}/docs/http-api.md and ${siteOrigin}/ai.txt.`,
    '',
  ].join('\n'),
);

writeText(
  'mcp.md',
  [
    '# Moldraw MCP',
    '',
    'This path is a landing page, not a live MCP socket.',
    '',
    'Transport: **stdio** via `npx -p @moldraw/ai moldraw-mcp` or `npm run mcp` in a clone of this repo.',
    'Mutations: `session.applyCommand` (same Zod commands as the canvas).',
    `Toolsets: \`${DEFAULT_MCP_TOOLSET}\` (default, ${mcpCatalog.toolsets[DEFAULT_MCP_TOOLSET]} tools) ⊂ core ⊂ advanced ⊂ full (${mcpCatalog.toolsets.full}); every tool callable, discover with \`moldraw.list_tools\`.`,
    'Envelope: `{ ok, revision, changed, data | error: { code, message, details } }`.',
    'Live canvas: run `npm run api`, enable the App session bridge, start MCP with `--session-url=http://127.0.0.1:8787`.',
    '',
    `- Install (flags, .mcp.json, Cursor deeplink): ${siteOrigin}/docs/mcp/installation.md`,
    `- Tools catalogue (generated, all tools / resources / prompts): ${siteOrigin}/docs/mcp/tools-catalog.md`,
    `- Tools reference (narrative): ${siteOrigin}/docs/mcp/tools-reference.md`,
    `- Protocol / envelope / error codes: ${siteOrigin}/docs/mcp/protocol.md`,
    `- Readiness review & status: ${siteOrigin}/docs/mcp/ai-readiness-review.md`,
    `- Server card: ${siteOrigin}/.well-known/mcp/server-card.json`,
    `- JSON: ${siteOrigin}/api/mcp.json`,
    '',
  ].join('\n'),
);

const localRun = {
  mcp: 'npm run mcp',
  http: 'npm run api',
  bind: '127.0.0.1:8787',
  persist: 'MOLDRAW_MOLECULE_PATH',
};

writeJson('api/ai.json', {
  name: 'moldraw-ai',
  kind: 'discovery',
  execution: 'local',
  product: 'ChemDraw-class visual editor',
  mutation: 'session.applyCommand',
  run: localRun,
  docs: {
    agents: `${siteOrigin}/docs/for-agents.md`,
    session: `${siteOrigin}/docs/architecture/session-and-api.md`,
    http: `${siteOrigin}/docs/http-api.md`,
    policy: `${siteOrigin}/ai.txt`,
  },
});

writeJson('api/mcp.json', {
  name: 'moldraw',
  kind: 'discovery',
  transport: 'stdio',
  execution: 'local',
  command: 'npm run mcp',
  bin: 'moldraw-mcp',
  toolsets: { default: DEFAULT_MCP_TOOLSET, counts: mcpCatalog.toolsets },
  mutation: 'session.applyCommand',
  docs: {
    overview: `${siteOrigin}/docs/mcp/overview.md`,
    installation: `${siteOrigin}/docs/mcp/installation.md`,
    tools: `${siteOrigin}/docs/mcp/tools-reference.md`,
    toolsCatalog: `${siteOrigin}/docs/mcp/tools-catalog.md`,
    protocol: `${siteOrigin}/docs/mcp/protocol.md`,
    readiness: `${siteOrigin}/docs/mcp/ai-readiness-review.md`,
    landing: `${siteOrigin}/mcp.md`,
    serverCard: `${siteOrigin}/.well-known/mcp/server-card.json`,
  },
  run: localRun,
});

const openApi = buildOpenApiDocument() as Record<string, unknown>;
const info = (openApi.info ?? {}) as Record<string, unknown>;
openApi.info = {
  ...info,
  description:
    'Local session API snapshot for agents. Execute only on 127.0.0.1:8787 (`npm run api`). This file is documentation — not a public endpoint.',
};
writeJson('openapi/session-api.json', openApi);

writeJson('.well-known/api-catalog', {
  linkset: [
    {
      anchor: `${siteOrigin}/`,
      item: [
        { href: `${siteOrigin}/llms.txt`, rel: 'describedby', type: 'text/plain' },
        { href: `${siteOrigin}/llms-full.txt`, rel: 'describedby', type: 'text/plain' },
        { href: `${siteOrigin}/ai.txt`, rel: 'describedby', type: 'text/plain' },
        { href: `${siteOrigin}/api/md/_catalog.json`, rel: 'describedby', type: 'application/json' },
        { href: `${siteOrigin}/openapi/session-api.json`, rel: 'service-desc', type: 'application/json' },
        { href: `${siteOrigin}/.well-known/mcp/server-card.json`, rel: 'describedby', type: 'application/json' },
        { href: `${siteOrigin}/docs/for-agents.md`, rel: 'describedby', type: 'text/markdown' },
      ],
    },
  ],
});

writeJson('.well-known/mcp/server-card.json', {
  name: 'moldraw',
  version: '0.2.0',
  transport: 'stdio',
  command: 'npm run mcp',
  args: ['scripts/run-mcp-server.mjs'],
  bin: 'moldraw-mcp',
  env: mcpCatalog.env,
  toolsets: {
    default: DEFAULT_MCP_TOOLSET,
    counts: mcpCatalog.toolsets,
    select: `MOLDRAW_MCP_TOOLSET=${TOOLSETS.join('|')} or --toolset=<name> (any known tool is callable regardless; use moldraw.list_tools to discover the rest)`,
  },
  capabilities: {
    tools: { listChanged: true },
    resources: mcpCatalog.resources.map(r => r.uri),
    prompts: mcpCatalog.prompts.map(p => p.name),
    structuredContent: true,
    envelope: '{ ok, revision, changed, data | error: { code, message, details } }',
    liveCanvas: 'Set MOLDRAW_SESSION_URL to a running `npm run api` session to share the desktop canvas with the agent.',
  },
  startHere: ['draw.smiles', 'draw.ring', 'edit.atom', 'molecule.get_canvas_state', 'molecule.render', 'molecule.undo', 'molecule.batch', 'moldraw.list_tools'],
  mutation: 'session.applyCommand',
  docs: `${siteOrigin}/docs/mcp/overview.md`,
  toolsCatalog: `${siteOrigin}/docs/mcp/tools-catalog.md`,
  landing: `${siteOrigin}/mcp.md`,
});

writeText(
  '.well-known/agent-skills/moldraw-session/SKILL.md',
  [
    '# Moldraw session',
    '',
    'Mutate a Moldraw document through `createMoldrawSession` → `session.applyCommand`.',
    '',
    '```ts',
    "import { createMoldrawSession, executeAiTool } from '@moldraw/ai'",
    '',
    'const session = createMoldrawSession({ initialMolecule })',
    "session.applyCommand('molecule.addAtom', { atom })",
    "await executeAiTool('molecule.stats', {}, session.ctx)",
    '```',
    '',
    'Do not use `runCommand` as an adapter. Do not call `Mut.*`.',
    `Guide: ${siteOrigin}/docs/for-agents.md`,
    '',
  ].join('\n'),
);

writeText(
  '.well-known/agent-skills/moldraw-mcp/SKILL.md',
  [
    '# Moldraw MCP',
    '',
    'Stdio MCP is local. There is no public MCP socket on this website.',
    '',
    '```bash',
    'npx -p @moldraw/ai moldraw-mcp --toolset=minimal   # published',
    'npm run mcp -- --toolset=minimal                    # repo clone',
    'npm run mcp -- --session-url=http://127.0.0.1:8787  # share the live App canvas (`npm run api`)',
    '```',
    '',
    `Toolsets: \`${DEFAULT_MCP_TOOLSET}\` (default) ⊂ core ⊂ advanced ⊂ full — every tool callable; \`moldraw.list_tools\` finds the rest.`,
    'Loop: `draw.smiles` / `draw.ring` / `draw.atom` → `molecule.render` (look) → `molecule.check_structure` (chemistry) → `edit.atom` / `edit.bond` / `edit.delete` or `molecule.undo`. Group steps with `molecule.batch`.',
    'Every result: `{ ok, revision, changed, data | error: { code, message, details } }`; `NOT_FOUND` lists unknown ids, `VALIDATION` lists issue paths, `EXECUTION` explains the chemistry refusal.',
    'Optional `MOLDRAW_MOLECULE_PATH` persists the document. Tools call `session.applyCommand`.',
    `Install: ${siteOrigin}/docs/mcp/installation.md`,
    `Catalogue: ${siteOrigin}/docs/mcp/tools-catalog.md`,
    `Card: ${siteOrigin}/.well-known/mcp/server-card.json`,
    '',
  ].join('\n'),
);

writeText(
  '.well-known/agent-skills/moldraw-embed/SKILL.md',
  [
    '# Moldraw embed',
    '',
    'Pass a store into `MoldrawCanvas`. The canvas stays session-unaware.',
    '',
    '```ts',
    "import { createMoleculeStore } from '@moldraw/core'",
    "import { MoldrawCanvas } from '@moldraw/canvas'",
    '',
    'const store = createMoleculeStore()',
    '<MoldrawCanvas store={store} />',
    '```',
    '',
    `Guide: ${siteOrigin}/docs/embed.md`,
    '',
  ].join('\n'),
);

const extraSitemap = [
  ['/', '1.0'],
  ['/llms.txt', '0.9'],
  ['/llms-full.txt', '0.8'],
  ['/ai.txt', '0.8'],
  ['/mcp', '0.7'],
  ['/mcp.md', '0.6'],
  ['/auth.md', '0.5'],
  ['/api/md/_catalog.json', '0.7'],
  ['/openapi/session-api.json', '0.6'],
] as const;

const sitemapBody = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...extraSitemap.map(([path, priority]) => sitemapUrl(`${siteOrigin}${path}`, priority)),
  ...pages.flatMap(({ section }) => [
    sitemapUrl(
      `${siteOrigin}/docs/${section.slug}`,
      section.slug === 'introduction' ? '1.0' : '0.8',
    ),
    sitemapUrl(`${siteOrigin}/docs/${section.slug}.md`, '0.7'),
  ]),
  '</urlset>',
  '',
];

writeText('sitemap.xml', sitemapBody.join('\n'));

writeText(
  'robots.txt',
  [
    'User-agent: *',
    'Allow: /',
    'Allow: /docs/',
    'Allow: /llms.txt',
    'Allow: /llms-full.txt',
    'Allow: /ai.txt',
    '',
    `Sitemap: ${siteOrigin}/sitemap.xml`,
    '',
    `# LLM indexes`,
    `# ${siteOrigin}/llms.txt`,
    `# ${siteOrigin}/llms-full.txt`,
    `# ${siteOrigin}/ai.txt`,
    '',
  ].join('\n'),
);

console.log(
  `[generate-docs-seo] Wrote discovery assets (${pages.length} pages, origin=${siteOrigin})`,
);
