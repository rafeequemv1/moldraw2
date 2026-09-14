/** @generated — run `pnpm run generate:plugins` */
import type { MoldrawPlugin } from '@moldraw/plugin-sdk';
import type { PluginId } from './types';

export const PLUGIN_LOADERS: Record<
  PluginId,
  () => Promise<{ default: MoldrawPlugin }>
> = {
  'proteins': () => import('@moldraw/plugin-proteins'),
  'smart-draw': () => import('@moldraw/plugin-smart-draw'),
  'spectroscopy': () => import('@moldraw/plugin-spectroscopy'),
  'themes': () => import('@moldraw/plugin-themes'),
};
