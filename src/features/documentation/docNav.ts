/** Sidebar navigation — maps SEO slugs to markdown under `documentation/`. */

export interface DocSection {
  /** Stable internal id (legacy hash links). */
  id: string;
  /** URL path after `/docs/` (e.g. `mcp/overview`). */
  slug: string;
  title: string;
  /** Path relative to `documentation/` (e.g. `mcp/overview.md`). */
  file: string;
  /** Short meta description for SEO / AI summaries. */
  description: string;
}

export interface DocNavGroup {
  title: string;
  sections: DocSection[];
}

export const DOC_NAV: DocNavGroup[] = [
  {
    title: 'Guide',
    sections: [
      {
        id: 'intro',
        slug: 'introduction',
        title: 'Introduction',
        file: 'README.md',
        description:
          'Moldraw is a ChemDraw-class visual editor. Canvas, MCP, and local HTTP share one Zod command registry via the session kernel.',
      },
      {
        id: 'for-agents',
        slug: 'for-agents',
        title: 'For AI agents',
        file: 'for-agents.md',
        description:
          'How agents must edit Moldraw: session.applyCommand, tools, reads, and Copy as Markdown. Do not use runCommand as an adapter.',
      },
      {
        id: 'installation',
        slug: 'installation',
        title: 'Installation',
        file: 'installation.md',
        description: 'Install packages, then run pnpm dev, npm run mcp (or npx moldraw-mcp), npm run api, test:session and test:agent.',
      },
      {
        id: 'getting-started',
        slug: 'getting-started',
        title: 'Getting started',
        file: 'getting-started.md',
        description: 'Canvas still uses createMoleculeStore. Agents use the session kernel, not a parallel API.',
      },
      {
        id: 'embed',
        slug: 'embed',
        title: 'Embed',
        file: 'embed.md',
        description: 'Pass a store into MoldrawCanvas. The canvas stays session-unaware.',
      },
      {
        id: 'changelog',
        slug: 'changelog',
        title: 'Changelog',
        file: 'changelog.md',
        description: 'Release notes for @moldraw/* packages and the Moldraw app.',
      },
    ],
  },
  {
    title: 'API',
    sections: [
      {
        id: 'packages',
        slug: 'packages',
        title: 'Packages',
        file: 'packages.md',
        description: 'Package map including @moldraw/ai session kernel and @moldraw/ai/http.',
      },
      {
        id: 'store',
        slug: 'store',
        title: 'Store',
        file: 'store.md',
        description: 'The store is the document. Canvas uses store.applyCommand. MCP/HTTP wrap it in a session.',
      },
      {
        id: 'commands',
        slug: 'commands',
        title: 'Commands',
        file: 'commands.md',
        description: 'Zod-validated molecule commands — one registry for canvas, chat, MCP, and HTTP.',
      },
      {
        id: 'http-api',
        slug: 'http-api',
        title: 'Local HTTP API',
        file: 'http-api.md',
        description:
          '127.0.0.1 session HTTP: POST commands/tools, PUT molecule, undo/redo/focus, expectedRevision → 409, typed SSE, App live bridge. Not a public API.',
      },
      {
        id: 'canvas',
        slug: 'canvas',
        title: 'Canvas',
        file: 'canvas.md',
        description: 'Commit vs gesture on the canvas. Canvas does not own the session kernel.',
      },
      {
        id: 'templates',
        slug: 'templates',
        title: 'Templates',
        file: 'templates.md',
        description: 'Amino acid and functional-group SMILES libraries from @moldraw/templates.',
      },
      {
        id: 'plugins',
        slug: 'plugins',
        title: 'Plugins',
        file: 'plugins.md',
        description: 'Optional plugin packages — install, build, and extend Moldraw with proteins, spectroscopy, and more.',
      },
      {
        id: 'ai',
        slug: 'ai-sdk',
        title: 'AI SDK',
        file: 'ai.md',
        description: 'executeAiTool plus session.ctx — same commands as the canvas. Headless path is session.applyCommand.',
      },
      {
        id: 'workers',
        slug: 'engines-and-workers',
        title: 'Engines & workers',
        file: 'workers.md',
        description: 'Browser workers vs Node ChemistryEngine. Same native 2D engine for the session.',
      },
    ],
  },
  {
    title: 'Architecture',
    sections: [
      {
        id: 'architecture-ai-mcp',
        slug: 'architecture/ai-and-mcp',
        title: 'AI & MCP architecture',
        file: 'architecture/ai-and-mcp.md',
        description: 'How canvas, chat, MCP, and local HTTP share one command registry and session kernel.',
      },
      {
        id: 'architecture-session-api',
        slug: 'architecture/session-and-api',
        title: 'Session kernel & local API',
        file: 'architecture/session-and-api.md',
        description: 'Hub: session.applyCommand, result envelope + error codes, expectedRevision / STALE_REVISION, typed events incl. focus, live canvas bridge, persist, ChemistryEngine.',
      },
      {
        id: 'engine-2d-layout',
        slug: 'engine/native-2d-layout',
        title: 'Native 2D layout',
        file: 'engine/2d-layout.md',
        description: 'Native 2D layout used by the browser worker and the Node session ChemistryEngine.',
      },
    ],
  },
  {
    title: 'MCP',
    sections: [
      {
        id: 'mcp-overview',
        slug: 'mcp/overview',
        title: 'Overview',
        file: 'mcp/overview.md',
        description: 'What an agent gets: 167 tools in nested toolsets (minimal default), façade draw.*/edit.*, render, resources, prompts, live canvas bridge.',
      },
      {
        id: 'mcp-installation',
        slug: 'mcp/installation',
        title: 'Installation',
        file: 'mcp/installation.md',
        description: 'moldraw-mcp bin, CLI flags / env, .mcp.json for Cursor / Claude Code / Claude Desktop, Cursor deeplink, live App canvas via --session-url.',
      },
      {
        id: 'mcp-unified',
        slug: 'mcp/unified-mutations',
        title: 'Unified mutations',
        file: 'mcp/unified-mutations.md',
        description: 'Every persistent mutation is a named Zod command through the session. Same path for canvas, chat, MCP, and HTTP.',
      },
      {
        id: 'mcp-protocol',
        slug: 'mcp/protocol',
        title: 'Protocol',
        file: 'mcp/protocol.md',
        description: 'tools/list (toolsets, annotations, outputSchema), tools/call envelope { ok, revision, changed, data | error }, error codes, resources, prompts.',
      },
      {
        id: 'mcp-context',
        slug: 'mcp/execution-context',
        title: 'Execution context',
        file: 'mcp/execution-context.md',
        description: 'AiExecutionContext on a session: applyCommand, undo, selection, and Node ChemistryEngine hooks.',
      },
      {
        id: 'mcp-tools',
        slug: 'mcp/tools-reference',
        title: 'Tools reference',
        file: 'mcp/tools-reference.md',
        description: 'Narrative guide to the tool families: façades, meta (batch, list_tools), reads (render, find_substructure), recipes, engine helpers, command.* groups.',
      },
      {
        id: 'mcp-tools-catalog',
        slug: 'mcp/tools-catalog',
        title: 'Tools catalogue (generated)',
        file: 'mcp/tools-catalog.md',
        description: 'Auto-generated per-tool parameter tables, toolsets, resources and prompts — regenerated from the registry on every build.',
      },
      {
        id: 'mcp-molecule',
        slug: 'mcp/molecule-file',
        title: 'Molecule file',
        file: 'mcp/molecule-file.md',
        description: 'JSON molecule file persisted after a successful session commit (MOLDRAW_MOLECULE_PATH).',
      },
      {
        id: 'mcp-sdk',
        slug: 'mcp/sdk',
        title: 'SDK',
        file: 'mcp/sdk.md',
        description: 'MCP SDK wiring: capabilities, handlers, Zod v4 → JSON Schema, toolsets, client example, how to extend. ctx is session.ctx.',
      },
      {
        id: 'mcp-examples',
        slug: 'mcp/examples',
        title: 'Examples',
        file: 'mcp/examples.md',
        description: 'Working calls: draw.smiles, render, find_substructure, edit.atom, draw.ring, batch with $refs, reaction scheme, list_tools, live canvas, Node script.',
      },
      {
        id: 'mcp-limitations',
        slug: 'mcp/limitations',
        title: 'Limitations',
        file: 'mcp/limitations.md',
        description: 'What still differs headless vs in-app: PNG render, SMARTS-lite subset, automap, PubChem names, one session per process, HTTP is 127.0.0.1 only.',
      },
      {
        id: 'mcp-ai-readiness-review',
        slug: 'mcp/ai-readiness-review',
        title: 'AI readiness review',
        file: 'mcp/ai-readiness-review.md',
        description: 'September 2026 audit of the MCP / tool surface and its status: findings, phases A–E (all implemented), evidence, acceptance criteria.',
      },
    ],
  },
];

export const DEFAULT_DOC_SLUG = 'introduction';

export const ALL_DOC_SECTIONS: DocSection[] = DOC_NAV.flatMap(g => g.sections);

const byId = new Map(ALL_DOC_SECTIONS.map(s => [s.id, s]));
const bySlug = new Map(ALL_DOC_SECTIONS.map(s => [s.slug, s]));
const byFile = new Map(ALL_DOC_SECTIONS.map(s => [s.file, s]));

export const getDocSection = (id: string): DocSection | undefined => byId.get(id);

export const getDocSectionBySlug = (slug: string): DocSection | undefined => {
  const normalized = slug.replace(/^\/+|\/+$/g, '');
  return bySlug.get(normalized);
};

export const getDocSectionByFile = (file: string): DocSection | undefined => {
  const normalized = file.replace(/^\.\//, '').replace(/^\//, '');
  return byFile.get(normalized);
};

/** Public site origin for canonical URLs (override with VITE_SITE_URL). */
export const DOC_SITE_ORIGIN =
  (typeof import.meta !== 'undefined' &&
    (import.meta as ImportMeta & { env?: { VITE_SITE_URL?: string } }).env?.VITE_SITE_URL) ||
  'https://moldraw.vercel.app';

export const docCanonicalUrl = (slug: string): string =>
  `${DOC_SITE_ORIGIN.replace(/\/$/, '')}/docs/${slug}`;
