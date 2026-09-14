import type { PluginManifest } from '@moldraw/plugin-sdk';

export const smartDrawManifest: PluginManifest = {
  id: 'smart-draw',
  name: 'Smart Draw',
  version: '1.0.0',
  description: 'Draw with a pencil; strokes become bonds, rings, and atom labels (offline)',
  capabilities: ['canvas'],
  engine: '^1.0.0',
};
