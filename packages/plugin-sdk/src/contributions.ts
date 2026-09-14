import type { ComponentType } from 'react';
import type { ZodType } from 'zod';
import type { PluginSetupContext } from './context';

export type MenuSlot = 'chemistry' | 'file' | 'edit' | 'view';

export interface MenuItemContribution {
  id: string;
  label: string;
  title?: string;
  onClick: () => void | Promise<void>;
}

export interface MenuContribution {
  slot: MenuSlot;
  id: string;
  label: string;
  title?: string;
  items?: MenuItemContribution[];
  onClick?: () => void | Promise<void>;
}

export interface CommandContribution {
  id: string;
  title: string;
  handler: () => void | Promise<void>;
}

export interface PanelContribution {
  id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: ComponentType<any>;
}

export interface ToolbarContribution {
  id: string;
  label: string;
  onClick: () => void | Promise<void>;
}

export interface ContextMenuContribution {
  id: string;
  label: string;
  when?: string;
  onClick: () => void | Promise<void>;
}

export type AiToolCategory = 'read' | 'mutate' | 'async' | 'meta' | 'recipe';

export interface PluginAiToolContribution {
  id: string;
  description: string;
  category: AiToolCategory;
  inputSchema: ZodType<unknown>;
  handler: (input: unknown) => unknown | Promise<unknown>;
}

export interface ImporterContribution {
  id: string;
  label: string;
  extensions: string[];
}

export interface ExporterContribution {
  id: string;
  label: string;
  extensions: string[];
}

export interface InspectorTabContribution {
  id: string;
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: ComponentType<any>;
}

export interface CanvasOverlayContribution {
  id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: ComponentType<any>;
}

/** World-space stroke group emitted by the host after a Smart Draw session ends. */
export interface CanvasToolInput {
  sessionId: string;
  strokes: { points: { x: number; y: number }[] }[];
  /** Bond length in canvas / world units (not screen pixels). */
  bondLengthPx: number;
}

export type CanvasToolGroup = 'select_edit';

export interface CanvasToolContribution {
  id: string;
  label: string;
  title: string;
  group: CanvasToolGroup;
  onStrokes: (input: CanvasToolInput, ctx: PluginSetupContext) => void | Promise<void>;
}

/** 2D structure look contributed by an installable themes plugin. */
export type CanvasThemeDrawMode = 'skeletal' | 'ball-stick';

export interface CanvasThemeContribution {
  id: string;
  label: string;
  drawMode: CanvasThemeDrawMode;
}

export interface PluginContributions {
  menus: MenuContribution[];
  commands: CommandContribution[];
  panels: PanelContribution[];
  toolbar: ToolbarContribution[];
  contextMenus: ContextMenuContribution[];
  aiTools: PluginAiToolContribution[];
  importers: ImporterContribution[];
  exporters: ExporterContribution[];
  inspectorTabs: InspectorTabContribution[];
  canvasOverlays: CanvasOverlayContribution[];
  canvasTools: CanvasToolContribution[];
  canvasThemes: CanvasThemeContribution[];
}

export function emptyContributions(): PluginContributions {
  return {
    menus: [],
    commands: [],
    panels: [],
    toolbar: [],
    contextMenus: [],
    aiTools: [],
    importers: [],
    exporters: [],
    inspectorTabs: [],
    canvasOverlays: [],
    canvasTools: [],
    canvasThemes: [],
  };
}
