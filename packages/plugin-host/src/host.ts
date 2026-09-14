import {
  createSetupContext,
  emptyContributions,
  type CanvasToolInput,
  type MoldrawPlugin,
  type PluginContributions,
  type PluginServices,
  type PluginSetupContext,
} from '@moldraw/plugin-sdk';
import { checkEngineCompatibility } from './engineCompat';
import { PLUGIN_CATALOG } from './generated/catalog';
import { PLUGIN_LOADERS } from './generated/loaders';
import type { InstallStore } from './installStore';
import { ensureDefaultPluginsInstalled } from './installStore';
import type { PluginRuntimeState, PluginStateRecord } from './installStore';

export interface LoadedPlugin {
  id: string;
  plugin: MoldrawPlugin;
  contributions: PluginContributions;
  setupContext: PluginSetupContext;
  subscriptions: ReturnType<typeof createSetupContext>['subscriptions'];
}

export interface PluginHostOptions {
  store: InstallStore;
  services: PluginServices;
  onStateChange?: () => void;
}

export class PluginHost {
  private readonly store: InstallStore;
  private readonly services: PluginServices;
  private readonly onStateChange?: () => void;
  private loaded = new Map<string, LoadedPlugin>();
  private states = new Map<string, PluginStateRecord>();

  constructor(opts: PluginHostOptions) {
    this.store = opts.store;
    this.services = opts.services;
    this.onStateChange = opts.onStateChange;
    ensureDefaultPluginsInstalled(this.store);
    this.syncStatesFromStore();
  }

  listCatalog() {
    return PLUGIN_CATALOG;
  }

  getPluginState(id: string): PluginStateRecord {
    return this.states.get(id) ?? { id, state: 'not_installed' };
  }

  listInstalled(): PluginStateRecord[] {
    return PLUGIN_CATALOG.map(entry => this.getPluginState(entry.id));
  }

  installPlugin(id: string): { ok: true } | { ok: false; error: string } {
    const entry = PLUGIN_CATALOG.find(e => e.id === id);
    if (!entry) return { ok: false, error: `Unknown plugin id: ${id}` };

    const installed = this.store.getInstalled();
    if (!installed.includes(id)) {
      this.store.setInstalled([...installed, id]);
    }
    const disabled = this.store.getDisabled().filter(x => x !== id);
    this.store.setDisabled(disabled);
    this.setState(id, 'installed');
    return { ok: true };
  }

  async ensurePluginLoaded(id: string): Promise<void> {
    await this.loadPlugin(id);
  }

  uninstallPlugin(id: string): { ok: true } | { ok: false; error: string } {
    void this.unloadPlugin(id);
    this.store.setInstalled(this.store.getInstalled().filter(x => x !== id));
    this.store.setDisabled(this.store.getDisabled().filter(x => x !== id));
    this.states.delete(id);
    this.notify();
    return { ok: true };
  }

  disablePlugin(id: string): void {
    void this.unloadPlugin(id);
    const disabled = this.store.getDisabled();
    if (!disabled.includes(id)) {
      this.store.setDisabled([...disabled, id]);
    }
    if (this.store.getInstalled().includes(id)) {
      this.setState(id, 'disabled');
    }
  }

  enablePlugin(id: string): void {
    this.store.setDisabled(this.store.getDisabled().filter(x => x !== id));
    if (this.store.getInstalled().includes(id)) {
      this.setState(id, 'installed');
      void this.loadPlugin(id);
    }
  }

  async loadInstalledPlugins(): Promise<void> {
    for (const id of this.store.getInstalled()) {
      if (this.store.getDisabled().includes(id)) {
        this.setState(id, 'disabled');
        continue;
      }
      await this.loadPlugin(id);
    }
  }

  getMergedContributions(): PluginContributions {
    const merged = emptyContributions();
    for (const lp of this.loaded.values()) {
      merged.menus.push(...lp.contributions.menus);
      merged.panels.push(...lp.contributions.panels);
      merged.aiTools.push(...lp.contributions.aiTools);
      merged.commands.push(...lp.contributions.commands);
      merged.toolbar.push(...lp.contributions.toolbar);
      merged.contextMenus.push(...lp.contributions.contextMenus);
      merged.importers.push(...lp.contributions.importers);
      merged.exporters.push(...lp.contributions.exporters);
      merged.inspectorTabs.push(...lp.contributions.inspectorTabs);
      merged.canvasOverlays.push(...lp.contributions.canvasOverlays);
      merged.canvasThemes.push(...lp.contributions.canvasThemes);
      merged.canvasTools.push(
        ...lp.contributions.canvasTools.map(tool => ({
          ...tool,
          onStrokes: (input: CanvasToolInput) => tool.onStrokes(input, lp.setupContext),
        })),
      );
    }
    return merged;
  }

  /** Deliver a completed host stroke session to every loaded canvas tool. */
  dispatchCanvasToolStrokes(input: CanvasToolInput): void {
    for (const lp of this.loaded.values()) {
      for (const tool of lp.contributions.canvasTools) {
        void tool.onStrokes(input, lp.setupContext);
      }
    }
  }

  getLoadedPluginAiTools() {
    return this.getMergedContributions().aiTools;
  }

  private syncStatesFromStore(): void {
    const installed = new Set(this.store.getInstalled());
    const disabled = new Set(this.store.getDisabled());
    for (const entry of PLUGIN_CATALOG) {
      if (!installed.has(entry.id)) {
        this.states.set(entry.id, { id: entry.id, state: 'not_installed' });
      } else if (disabled.has(entry.id)) {
        this.states.set(entry.id, { id: entry.id, state: 'disabled' });
      } else if (this.loaded.has(entry.id)) {
        this.states.set(entry.id, { id: entry.id, state: 'loaded' });
      } else {
        this.states.set(entry.id, { id: entry.id, state: 'installed' });
      }
    }
  }

  private setState(id: string, state: PluginRuntimeState, error?: string): void {
    this.states.set(id, { id, state, error });
    this.notify();
  }

  private notify(): void {
    this.onStateChange?.();
  }

  private async loadPlugin(id: string): Promise<void> {
    if (this.loaded.has(id)) return;
    if (this.store.getDisabled().includes(id)) {
      this.setState(id, 'disabled');
      return;
    }

    const entry = PLUGIN_CATALOG.find(e => e.id === id);
    if (!entry) {
      this.setState(id, 'failed', `Unknown plugin: ${id}`);
      return;
    }

    const engineCheck = checkEngineCompatibility(entry.engine);
    if (!engineCheck.ok) {
      this.setState(id, 'failed', engineCheck.reason);
      return;
    }

    if (entry.capabilities.includes('ai') && !this.services.ai.isAvailable()) {
      this.setState(id, 'failed', 'This plugin requires AI. Add a Gemini API key in Settings → AI.');
      return;
    }

    const loader = PLUGIN_LOADERS[id as keyof typeof PLUGIN_LOADERS];
    if (!loader) {
      this.setState(id, 'failed', `No loader for plugin: ${id}`);
      return;
    }

    try {
      const mod = await loader();
      const plugin = mod.default;
      const contributions = emptyContributions();
      const services: PluginServices = {
        ...this.services,
        logger: {
          info: (message, ...args) =>
            this.services.logger.info(`[${plugin.manifest.name}] ${message}`, ...args),
          warn: (message, ...args) =>
            this.services.logger.warn(`[${plugin.manifest.name}] ${message}`, ...args),
          error: (message, ...args) =>
            this.services.logger.error(`[${plugin.manifest.name}] ${message}`, ...args),
        },
      };
      const ctx = createSetupContext(plugin.manifest, services, contributions);
      await plugin.setup(ctx);
      this.loaded.set(id, {
        id,
        plugin,
        contributions,
        setupContext: ctx,
        subscriptions: ctx.subscriptions,
      });
      this.setState(id, 'loaded');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.setState(id, 'failed', msg);
    }
  }

  private async unloadPlugin(id: string): Promise<void> {
    const lp = this.loaded.get(id);
    if (!lp) return;
    try {
      await lp.plugin.dispose?.({ plugin: { id, version: lp.plugin.manifest.version, manifest: lp.plugin.manifest }, services: this.services });
    } catch {
      /* ignore */
    }
    lp.subscriptions.dispose();
    this.loaded.delete(id);
  }
}

export function createPluginHost(opts: PluginHostOptions): PluginHost {
  return new PluginHost(opts);
}
