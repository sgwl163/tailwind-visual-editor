import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd())
const dist = resolve(root, 'dist')
if (!existsSync(dist)) {
  throw new Error('dist folder not found. Did the build succeed?')
}

const srcManifest = resolve(root, 'manifest.json')
const destManifest = resolve(dist, 'manifest.json')

copyFileSync(srcManifest, destManifest)

const pkgPath = resolve(root, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
const banner = `/* ${pkg.name} v${pkg.version} */\n`
const bgFile = resolve(dist, 'assets/background.js')
if (existsSync(bgFile)) {
  const orig = readFileSync(bgFile, 'utf-8')
  writeFileSync(bgFile, banner + orig, 'utf-8')
}

console.log('Manifest copied to dist/ and background banner added')
