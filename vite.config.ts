import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const root = path.dirname(fileURLToPath(import.meta.url))
const pkg = (name: string) => path.resolve(root, `packages/${name}/src`)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: '@moldraw/canvas/styles.css',
        replacement: path.resolve(root, 'packages/canvas/styles.css'),
      },
      { find: '@moldraw/domain', replacement: pkg('domain') },
      { find: '@moldraw/engine', replacement: pkg('engine') },
      { find: '@moldraw/core', replacement: pkg('core') },
      { find: '@moldraw/canvas', replacement: pkg('canvas') },
      { find: '@moldraw/engine-2d', replacement: pkg('engine-2d') },
      { find: '@moldraw/engine-3d', replacement: pkg('engine-3d') },
      { find: '@moldraw/viewer-3d', replacement: pkg('viewer-3d') },
      { find: '@moldraw/ai/chat', replacement: path.resolve(root, 'packages/ai/src/chat') },
      { find: '@moldraw/ai/mcp', replacement: path.resolve(root, 'packages/ai/src/mcp') },
      { find: '@moldraw/ai', replacement: pkg('ai') },
      { find: '@moldraw/templates', replacement: pkg('templates') },
      { find: '@moldraw/reactions', replacement: pkg('reactions') },
      { find: '@moldraw/plugin-sdk', replacement: pkg('plugin-sdk') },
      { find: '@moldraw/plugin-host', replacement: pkg('plugin-host') },
      { find: '@moldraw/plugin-spectroscopy', replacement: path.resolve(root, 'plugins/spectroscopy/src') },
      { find: '@moldraw/plugin-proteins', replacement: path.resolve(root, 'plugins/proteins/src') },
      { find: '@moldraw/plugin-smart-draw', replacement: path.resolve(root, 'plugins/smart-draw/src') },
      { find: '@moldraw/plugin-themes', replacement: path.resolve(root, 'plugins/themes/src') },
      { find: '@moldraw/plugin-proteins/proteins.css', replacement: path.resolve(root, 'plugins/proteins/src/proteins.css') },
    ],
  },
  envPrefix: ['VITE_', 'REACT_APP_'],
  worker: {
    format: 'es',
  },
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    exclude: ['indigo-ketcher'],
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes('node_modules/react-dom') ||
            id.includes('node_modules/react/') ||
            id.includes('node_modules/scheduler')
          ) {
            return 'react';
          }
          if (id.includes('node_modules/zod')) return 'zod';
          if (id.includes('node_modules/lucide-react')) return 'lucide';
        },
      },
    },
  },
})
