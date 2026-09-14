import type { PluginManifest } from '@moldraw/plugin-sdk';

export const spectroscopyManifest: PluginManifest = {
  id: 'spectroscopy',
  name: 'Spectroscopy',
  version: '1.0.0',
  description: 'NMR, MS, and UV spectrum prediction via AI',
  capabilities: ['ai', 'panel'],
  engine: '^1.0.0',
};
