import { PluginManifestSchema } from './manifest';
import type { MoldrawPlugin } from './context';

export function definePlugin(plugin: MoldrawPlugin): MoldrawPlugin {
  const parsed = PluginManifestSchema.safeParse(plugin.manifest);
  if (!parsed.success) {
    throw new Error(`Invalid plugin manifest: ${parsed.error.message}`);
  }
  return plugin;
}

export type { MoldrawPlugin, PluginSetupContext, PluginDisposeContext, PluginMetadata } from './context';
