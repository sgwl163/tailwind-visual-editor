import { build } from 'esbuild'
import { resolve } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'

const root = resolve(process.cwd())
const outdir = resolve(root, 'dist', 'assets')
if (!existsSync(outdir)) mkdirSync(outdir, { recursive: true })

await build({
  entryPoints: [resolve(root, 'src', 'content', 'main.tsx')],
  bundle: true,
  format: 'iife',
  outfile: resolve(outdir, 'content.js'),
  platform: 'browser',
  target: ['es2020'],
  jsx: 'automatic',
  define: {
    'process.env.NODE_ENV': '"production"'
  },
  logLevel: 'info',
})

console.log('Content script built as IIFE to dist/assets/content.js')
