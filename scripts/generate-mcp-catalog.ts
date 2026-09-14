#!/usr/bin/env tsx
/**
 * Prebuild: regenerate the MCP catalogue docs from the live tool registry.
 *
 *   documentation/mcp/tools-catalog.md        — full, per-tool parameter tables
 *   documentation/mcp/tools-catalog.json      — machine-readable (tools, toolsets, resources, prompts, env)
 *
 * The public server card (`public/.well-known/mcp/server-card.json`) is written by
 * `generate-docs-seo.ts`, which imports `buildMcpCatalog()` for the same data.
 * Run: `tsx --tsconfig tsconfig.node.json scripts/generate-mcp-catalog.ts`
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMcpCatalog, renderMcpCatalogMarkdown } from '../packages/ai/src/mcp/catalog.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'documentation', 'mcp');
mkdirSync(outDir, { recursive: true });

const catalog = buildMcpCatalog();
const markdown = `${renderMcpCatalogMarkdown(catalog)}\n`;
const json = `${JSON.stringify(
  {
    ...catalog,
    // Keep the JSON compact: inputSchema is large and already covered by params.
    tools: catalog.tools.map(tool => {
      const compact = { ...tool } as Partial<typeof tool>;
      delete compact.inputSchema;
      return compact;
    }),
  },
  null,
  2,
)}\n`;

const writeIfChanged = (file: string, body: string): boolean => {
  let prev = '';
  try {
    prev = readFileSync(file, 'utf8');
  } catch {
    /* new file */
  }
  // Ignore the generatedAt date so a no-op rebuild does not dirty the tree.
  const strip = (s: string) => s.replace(/"generatedAt": "\d{4}-\d{2}-\d{2}"/, '');
  if (strip(prev) === strip(body)) return false;
  writeFileSync(file, body, 'utf8');
  return true;
};

const changedMd = writeIfChanged(join(outDir, 'tools-catalog.md'), markdown);
const changedJson = writeIfChanged(join(outDir, 'tools-catalog.json'), json);
console.log(
  `[generate-mcp-catalog] ${catalog.tools.length} tools (minimal ${catalog.toolsets.minimal}, core ${catalog.toolsets.core}, advanced ${catalog.toolsets.advanced}, full ${catalog.toolsets.full}), ${catalog.resources.length} resources, ${catalog.prompts.length} prompts → tools-catalog.md${changedMd ? ' (updated)' : ''}, tools-catalog.json${changedJson ? ' (updated)' : ''}`,
);
