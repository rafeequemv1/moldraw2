import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'tsup'

const external = [
  /^@moldraw\//,
  'react',
  'react-dom',
  'react/jsx-runtime',
  'zod',
  'zod-to-json-schema',
  '@modelcontextprotocol/sdk',
  /^@modelcontextprotocol\/sdk\//,
  '@google/generative-ai',
  'indigo-ketcher',
  '3dmol',
  'openchemlib',
]

/** @param {string[]} entry */
export function createMoldrawTsupConfig(entry = ['src/index.ts']) {
  return defineConfig({
    entry,
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'es2022',
    splitting: false,
    treeshake: true,
    tsconfig: '../tsconfig.json',
    external,
    esbuildPlugins: [
      {
        name: 'raw-import',
        setup(build) {
          build.onResolve({ filter: /\?raw$/ }, args => ({
            path: resolve(args.resolveDir, args.path.replace(/\?raw$/, '')),
            namespace: 'raw-text',
          }))
          build.onLoad({ filter: /.*/, namespace: 'raw-text' }, args => ({
            contents: `export default ${JSON.stringify(readFileSync(args.path, 'utf8'))}`,
            loader: 'js',
          }))
        },
      },
    ],
    esbuildOptions(opts) {
      opts.jsx = 'automatic'
      // CSS ships as package files (e.g. styles.css); do not bundle into JS.
      opts.loader = { ...opts.loader, '.css': 'empty', '.mol': 'text' }
    },
  })
}
