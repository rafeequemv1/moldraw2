/**
 * Scan plugins package.json moldrawPlugin metadata and emit host generated artifacts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pluginsDir = path.join(root, 'plugins');
const outDir = path.join(root, 'packages', 'plugin-host', 'src', 'generated');

interface MoldrawPluginMeta {
  id: string;
  name: string;
  version: string;
  description: string;
  capabilities: string[];
  engine: string;
  defaultInstalled?: boolean;
}

function readPluginMeta(pluginDir: string): MoldrawPluginMeta & { packageName: string } | null {
  const pkgPath = path.join(pluginDir, 'package.json');
  if (!fs.existsSync(pkgPath)) return null;
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
    name?: string;
    moldrawPlugin?: MoldrawPluginMeta;
  };
  if (!pkg.moldrawPlugin || !pkg.name) return null;
  return { ...pkg.moldrawPlugin, packageName: pkg.name };
}

function main(): void {
  if (!fs.existsSync(pluginsDir)) {
    console.warn('[generate-plugin-artifacts] No plugins/ directory — skipping');
    return;
  }

  const entries = fs
    .readdirSync(pluginsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => readPluginMeta(path.join(pluginsDir, d.name)))
    .filter((e): e is NonNullable<typeof e> => e != null);

  fs.mkdirSync(outDir, { recursive: true });

  const catalog = entries.map(e => ({
    id: e.id,
    name: e.name,
    version: e.version,
    description: e.description,
    capabilities: e.capabilities,
    engine: e.engine,
    packageName: e.packageName,
  }));

  const ids = entries.map(e => e.id);
  const defaultInstalledIds = entries.filter(e => e.defaultInstalled).map(e => e.id);

  const catalogTs = `/** @generated — run \`pnpm run generate:plugins\` */
import type { PluginCapability } from '@moldraw/plugin-sdk';
import type { PluginId } from './types';

export interface PluginCatalogEntry {
  id: string;
  name: string;
  version: string;
  description: string;
  capabilities: PluginCapability[];
  engine: string;
  packageName: string;
}

export const PLUGIN_CATALOG: readonly PluginCatalogEntry[] = ${JSON.stringify(catalog, null, 2)} as PluginCatalogEntry[];

/** Plugins installed automatically on first visit (no prior localStorage state). */
export const PLUGIN_DEFAULT_INSTALLED_IDS: readonly PluginId[] = ${JSON.stringify(defaultInstalledIds)} as PluginId[];
`;

  const typesTs = `/** @generated — run \`pnpm run generate:plugins\` */
${ids.length > 0 ? `export type PluginId = ${ids.map(id => `'${id}'`).join(' | ')};` : 'export type PluginId = string;'}
`;

  const loadersTs = `/** @generated — run \`pnpm run generate:plugins\` */
import type { MoldrawPlugin } from '@moldraw/plugin-sdk';
import type { PluginId } from './types';

export const PLUGIN_LOADERS: Record<
  PluginId,
  () => Promise<{ default: MoldrawPlugin }>
> = {
${entries.map(e => `  '${e.id}': () => import('${e.packageName}'),`).join('\n')}
};
`;

  fs.writeFileSync(path.join(outDir, 'catalog.ts'), catalogTs);
  fs.writeFileSync(path.join(outDir, 'types.ts'), typesTs);
  fs.writeFileSync(path.join(outDir, 'loaders.ts'), loadersTs);

  console.log(`[generate-plugin-artifacts] Wrote ${entries.length} plugin(s) to ${outDir}`);
}

main();
