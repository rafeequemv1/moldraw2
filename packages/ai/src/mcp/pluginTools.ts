import { z } from 'zod';
import {
  createPluginHost,
  PLUGIN_CATALOG,
} from '@moldraw/plugin-host';
import { setRuntimePluginTools } from '../runtimePluginTools';
import { pluginAiToolToRegistered } from '../pluginBridge';
import { buildHeadlessPluginServices, createMcpInstallStore } from './pluginHeadless';

let mcpHost: ReturnType<typeof createPluginHost> | null = null;

export async function ensureMcpPluginHost(getMoleculeJson: () => string): Promise<void> {
  if (mcpHost) return;
  mcpHost = createPluginHost({
    store: createMcpInstallStore(),
    services: buildHeadlessPluginServices(getMoleculeJson),
  });
  await mcpHost.loadInstalledPlugins();
  setRuntimePluginTools(mcpHost.getLoadedPluginAiTools().map(pluginAiToolToRegistered));
}

export function getMcpPluginHost() {
  return mcpHost;
}

export const PLUGIN_MCP_TOOLS = [
  {
    id: 'plugin.list_catalog',
    description: 'List available Moldraw plugins from the built-in catalog.',
    inputSchema: z.object({}).optional(),
  },
  {
    id: 'plugin.list_installed',
    description: 'List installed plugins and their load state.',
    inputSchema: z.object({}).optional(),
  },
  {
    id: 'plugin.install',
    description: 'Install a plugin by catalog id (e.g. spectroscopy).',
    inputSchema: z.object({ id: z.string().min(1) }),
  },
  {
    id: 'plugin.uninstall',
    description: 'Uninstall a plugin by id.',
    inputSchema: z.object({ id: z.string().min(1) }),
  },
  {
    id: 'plugin.disable',
    description: 'Disable an installed plugin without uninstalling.',
    inputSchema: z.object({ id: z.string().min(1) }),
  },
  {
    id: 'plugin.enable',
    description: 'Re-enable a disabled plugin.',
    inputSchema: z.object({ id: z.string().min(1) }),
  },
] as const;

export async function handlePluginMcpTool(
  name: string,
  args: Record<string, unknown>,
  getMoleculeJson: () => string,
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  await ensureMcpPluginHost(getMoleculeJson);
  const host = mcpHost;
  if (!host) return { ok: false, error: 'Plugin host failed to initialize.' };

  switch (name) {
    case 'plugin.list_catalog':
      return { ok: true, data: { catalog: PLUGIN_CATALOG } };
    case 'plugin.list_installed':
      return { ok: true, data: { installed: host.listInstalled() } };
    case 'plugin.install': {
      const id = String(args.id ?? '');
      const r = host.installPlugin(id);
      if (!r.ok) return { ok: false, error: r.error };
      await host.loadInstalledPlugins();
      setRuntimePluginTools(host.getLoadedPluginAiTools().map(pluginAiToolToRegistered));
      return { ok: true, data: { installed: id } };
    }
    case 'plugin.uninstall': {
      const id = String(args.id ?? '');
      host.uninstallPlugin(id);
      setRuntimePluginTools(host.getLoadedPluginAiTools().map(pluginAiToolToRegistered));
      return { ok: true, data: { uninstalled: id } };
    }
    case 'plugin.disable': {
      const id = String(args.id ?? '');
      host.disablePlugin(id);
      setRuntimePluginTools(host.getLoadedPluginAiTools().map(pluginAiToolToRegistered));
      return { ok: true, data: { disabled: id } };
    }
    case 'plugin.enable': {
      const id = String(args.id ?? '');
      host.enablePlugin(id);
      await host.loadInstalledPlugins();
      setRuntimePluginTools(host.getLoadedPluginAiTools().map(pluginAiToolToRegistered));
      return { ok: true, data: { enabled: id } };
    }
    default:
      return { ok: false, error: `Unknown plugin tool: ${name}` };
  }
}
