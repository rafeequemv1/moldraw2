import { DisposableStore } from './disposable';
import type {
  CanvasOverlayContribution,
  CanvasThemeContribution,
  CanvasToolContribution,
  CommandContribution,
  ContextMenuContribution,
  ExporterContribution,
  ImporterContribution,
  InspectorTabContribution,
  MenuContribution,
  PanelContribution,
  PluginAiToolContribution,
  PluginContributions,
  ToolbarContribution,
} from './contributions';
import type { PluginManifest } from './manifest';
import type { PluginServices } from './services';

export interface PluginMetadata {
  id: string;
  version: string;
  manifest: PluginManifest;
}

export interface PluginSetupContext {
  plugin: PluginMetadata;
  services: PluginServices;
  subscriptions: DisposableStore;
  registerMenu(contribution: MenuContribution): void;
  registerCommand(contribution: CommandContribution): void;
  registerPanel(contribution: PanelContribution): void;
  registerToolbar(contribution: ToolbarContribution): void;
  registerContextMenu(contribution: ContextMenuContribution): void;
  registerAiTool(contribution: PluginAiToolContribution): void;
  registerImporter(contribution: ImporterContribution): void;
  registerExporter(contribution: ExporterContribution): void;
  registerInspectorTab(contribution: InspectorTabContribution): void;
  registerCanvasOverlay(contribution: CanvasOverlayContribution): void;
  registerCanvasTool(contribution: CanvasToolContribution): void;
  registerCanvasTheme(contribution: CanvasThemeContribution): void;
}

export type PluginDisposeContext = Pick<PluginSetupContext, 'plugin' | 'services'>;

export interface MoldrawPlugin {
  manifest: PluginManifest;
  setup(ctx: PluginSetupContext): void | Promise<void>;
  dispose?(ctx: PluginDisposeContext): void | Promise<void>;
}

export function createSetupContext(
  manifest: PluginManifest,
  services: PluginServices,
  contributions: PluginContributions,
): PluginSetupContext {
  const subscriptions = new DisposableStore();

  const push = <T>(key: keyof PluginContributions, item: T) => {
    (contributions[key] as T[]).push(item);
  };

  return {
    plugin: { id: manifest.id, version: manifest.version, manifest },
    services,
    subscriptions,
    registerMenu: c => push('menus', c),
    registerCommand: c => push('commands', c),
    registerPanel: c => push('panels', c),
    registerToolbar: c => push('toolbar', c),
    registerContextMenu: c => push('contextMenus', c),
    registerAiTool: c => push('aiTools', c),
    registerImporter: c => push('importers', c),
    registerExporter: c => push('exporters', c),
    registerInspectorTab: c => push('inspectorTabs', c),
    registerCanvasOverlay: c => push('canvasOverlays', c),
    registerCanvasTool: c => push('canvasTools', c),
    registerCanvasTheme: c => push('canvasThemes', c),
  };
}
