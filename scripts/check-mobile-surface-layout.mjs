import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const fail = (message) => {
  console.error(`Mobile surface layout contract failed: ${message}`)
  process.exitCode = 1
}

const agent = read('src/components/AgentWorkspace.tsx')
const workbench = read('src/components/CreationWorkbench.tsx')
const results = read('src/components/ResultsCenter.tsx')
const app = read('src/App.tsx')
const styles = read('src/index.css')
const header = read('src/components/Header.tsx')

const agentListClass = agent.match(/data-agent-message-list[\s\S]{0,180}?className="([^"]+)"/)?.[1]
if (!agentListClass) fail('Agent message list marker or class is missing')
else if (agentListClass.split(/\s+/).includes('flex')) fail('Agent message list must remain a vertical block, not a horizontal flex row')

for (const [name, source, marker] of [
  ['Creation Workbench', workbench, 'data-creation-content'],
  ['Results Center', results, 'data-results-content'],
]) {
  const className = source.match(new RegExp(`${marker}[\\s\\S]{0,180}?className="([^"]+)"`))?.[1]
  if (!className) fail(`${name} content marker or class is missing`)
  else if (/\bpt-(?:20|24|28|32)\b/.test(className)) fail(`${name} duplicates the fixed header spacer with excessive top padding`)
}

if (!app.includes("navigateToSurface('creation')") || !app.includes("navigateToSurface('results'")) {
  fail('surface switches must reset stale document scroll')
}

if (!workbench.includes("window.requestAnimationFrame") || !results.includes("window.requestAnimationFrame")) {
  fail('visible surfaces must reset iOS WebView scroll after they render')
}

if (!styles.includes('overflow-x: clip') || !styles.includes('max-width: 100%')) {
  fail('mobile surfaces must prevent page-level horizontal overflow')
}

if (!styles.includes('[data-agent-message-list] > *') || !styles.includes('[data-creation-content]')) {
  fail('surface children must stay inside the iOS WebView content box')
}

if (header.includes("'-translate-y-full sm:translate-y-0'")) {
  fail('global navigation must remain reachable while Agent is active')
}

if (!process.exitCode) console.log('Mobile surface layout contract passed')
