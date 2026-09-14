/** @generated — run `pnpm run generate:plugins` */
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

export const PLUGIN_CATALOG: readonly PluginCatalogEntry[] = [
  {
    "id": "proteins",
    "name": "Proteins",
    "version": "1.0.0",
    "description": "Load and view proteins from PDB with sequence selection and style controls",
    "capabilities": [
      "panel",
      "filesystem"
    ],
    "engine": "^1.0.0",
    "packageName": "@moldraw/plugin-proteins"
  },
  {
    "id": "smart-draw",
    "name": "Smart Draw",
    "version": "1.0.0",
    "description": "Draw with a pencil; strokes become bonds, rings, and atom labels (offline)",
    "capabilities": [
      "canvas"
    ],
    "engine": "^1.0.0",
    "packageName": "@moldraw/plugin-smart-draw"
  },
  {
    "id": "spectroscopy",
    "name": "Spectroscopy",
    "version": "1.0.0",
    "description": "NMR, MS, and UV spectrum prediction via AI",
    "capabilities": [
      "ai",
      "panel"
    ],
    "engine": "^1.0.0",
    "packageName": "@moldraw/plugin-spectroscopy"
  },
  {
    "id": "themes",
    "name": "Themes",
    "version": "1.0.0",
    "description": "Adds a Simple ball-and-stick structure theme to the Style panel",
    "capabilities": [
      "canvas"
    ],
    "engine": "^1.0.0",
    "packageName": "@moldraw/plugin-themes"
  }
] as PluginCatalogEntry[];

/** Plugins installed automatically on first visit (no prior localStorage state). */
export const PLUGIN_DEFAULT_INSTALLED_IDS: readonly PluginId[] = ["proteins","themes"] as PluginId[];
