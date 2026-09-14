import type { PluginManifest } from '@moldraw/plugin-sdk';

export const proteinsManifest: PluginManifest = {
  id: 'proteins',
  name: 'Proteins',
  version: '1.0.0',
  description: 'Load and view proteins from PDB with sequence selection and style controls',
  capabilities: ['panel', 'filesystem'],
  engine: '^1.0.0',
};
