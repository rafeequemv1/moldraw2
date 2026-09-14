import type { PluginManifest } from '@moldraw/plugin-sdk';

export const themesManifest: PluginManifest = {
  id: 'themes',
  name: 'Themes',
  version: '1.0.0',
  description: 'Adds a Simple ball-and-stick structure theme to the Style panel',
  capabilities: ['canvas'],
  engine: '^1.0.0',
};
