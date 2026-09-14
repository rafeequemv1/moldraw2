import { z } from 'zod';

export const PLUGIN_CAPABILITIES = [
  'ai',
  'panel',
  'filesystem',
  'cloud',
  'clipboard',
  'export',
  'canvas',
  'selection',
] as const;

export type PluginCapability = (typeof PLUGIN_CAPABILITIES)[number];

export const PluginManifestSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9-]*$/, 'Plugin id must be lowercase kebab-case'),
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().min(1),
  capabilities: z.array(z.enum(PLUGIN_CAPABILITIES)),
  engine: z.string().min(1),
});

export type PluginManifest = z.infer<typeof PluginManifestSchema>;

/** Host engine version plugins declare compatibility against. */
export const MOLDRAW_PLUGIN_ENGINE_VERSION = '1.0.0';
