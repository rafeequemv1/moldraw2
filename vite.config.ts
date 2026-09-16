import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const require = createRequire(import.meta.url)

const root = path.dirname(fileURLToPath(import.meta.url))
const pkg = (name: string) => path.resolve(root, `packages/${name}/src`)

/** Serve crawlable community HTML in Vite (dev + preview), matching Vercel SSR. */
function communitySeoPlugin(): Plugin {
  type CommunitySeo = {
    isCommunitySeoPath: (pathname: string) => boolean
    renderCommunityPage: (pathname: string, options?: { accept?: string }) => Promise<{
      status: number
      headers: Record<string, string>
      body: string
    }>
    renderCommunitySitemap: () => Promise<{
      status: number
      headers: Record<string, string>
      body: string
    }>
  }

  let cachedSeo: CommunitySeo | null = null
  let cachedSeoMtime = 0
  const loadCommunitySeo = (): CommunitySeo => {
    const seoPath = require.resolve('./server/community-seo.js')
    const mtime = fs.statSync(seoPath).mtimeMs
    if (cachedSeo && cachedSeoMtime === mtime) return cachedSeo
    delete require.cache[seoPath]
    const loaded = require('./server/community-seo.js') as CommunitySeo
    if (typeof loaded?.isCommunitySeoPath !== 'function') {
      throw new Error('community-seo.js did not export isCommunitySeoPath')
    }
    cachedSeo = loaded
    cachedSeoMtime = mtime
    return loaded
  }

  const handle = async (
    req: { url?: string; headers?: { accept?: string } },
    res: { statusCode: number; setHeader: (key: string, value: string) => void; end: (body: string) => void },
    next: (err?: unknown) => void,
  ) => {
    const urlPath = (req.url || '').split('?')[0]
    if (!urlPath.startsWith('/community')) {
      next()
      return
    }
    let communitySeo: CommunitySeo
    try {
      communitySeo = loadCommunitySeo()
    } catch {
      next()
      return
    }
    if (urlPath === '/community/sitemap.xml') {
      try {
        const result = await communitySeo.renderCommunitySitemap()
        res.statusCode = result.status
        Object.entries(result.headers).forEach(([key, value]) => res.setHeader(key, value))
        res.end(result.body)
      } catch {
        next()
      }
      return
    }
    if (!communitySeo.isCommunitySeoPath(urlPath)) {
      next()
      return
    }
    try {
      const result = await communitySeo.renderCommunityPage(urlPath, {
        accept: req.headers?.accept || '',
      })
      res.statusCode = result.status
      Object.entries(result.headers).forEach(([key, value]) => res.setHeader(key, value))
      res.end(result.body)
    } catch (error) {
      next()
    }
  }

  return {
    name: 'moldraw-community-seo',
    configureServer(server) {
      server.middlewares.stack.unshift({ route: '', handle })
    },
    configurePreviewServer(server) {
      server.middlewares.stack.unshift({ route: '', handle })
    },
  }
}

/** Serve the static addons page at /addons and /addons/ in Vite (dev + preview). */
function addonsHtmlPlugin(): Plugin {
  const rewrite = (req: { url?: string }) => {
    const url = req.url?.split('?')[0]
    if (url === '/addons' || url === '/addons/') {
      req.url = '/addons/index.html'
    }
  }
  return {
    name: 'moldraw-addons-html',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        rewrite(req)
        next()
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        rewrite(req)
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), communitySeoPlugin(), addonsHtmlPlugin()],
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
