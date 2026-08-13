import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const srcPath = join(__dirname, '..', 'public', 'images', 'goblin_assets', 'coin_badge_1.png')
const outDir = join(__dirname, '..', 'build')
const outPng = join(outDir, 'icon.png')
const outIco = join(outDir, 'icon.ico')

try {
  mkdirSync(outDir, { recursive: true })
  copyFileSync(srcPath, outPng)
  copyFileSync(srcPath, outIco)
  console.log(`✅ App Icon generated from coin_badge_1.png: ${outPng}`)
} catch (err) {
  console.error('Failed to generate icon:', err)
}
