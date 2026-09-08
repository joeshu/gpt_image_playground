import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const version = typeof packageJson.version === 'string' ? packageJson.version.trim() : ''
if (!version) throw new Error('package.json 缺少有效 version')

const serviceWorkerPath = resolve(root, 'dist/sw.js')
let source = await readFile(serviceWorkerPath, 'utf8')
const placeholder = "const APP_VERSION = '__APP_VERSION__'"
const expected = `const APP_VERSION = '${version}'`

if (!source.includes(placeholder) && !source.includes(expected)) {
  throw new Error('dist/sw.js 未找到可替换的 APP_VERSION 占位符')
}
source = source.replace(placeholder, expected)
if (source.includes('__APP_VERSION__')) {
  throw new Error('dist/sw.js 仍包含未替换的 APP_VERSION 占位符')
}
await writeFile(serviceWorkerPath, source)
console.log(`Service Worker cache version synchronized: ${version}`)
