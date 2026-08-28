import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const failures = []
const require = (source, marker, message) => {
  if (!source.includes(marker)) failures.push(message)
}

const agent = read('src/components/AgentWorkspace.tsx')
const inputBar = read('src/components/InputBar.tsx')
const header = read('src/components/Header.tsx')
const navigation = read('src/lib/surfaceNavigation.ts')
const viewport = read('src/lib/viewport.ts')

require(agent, 'data-agent-sidebar', 'Agent drawer marker is missing')
require(agent, 'data-agent-sidebar-backdrop', 'Agent drawer backdrop marker is missing')
require(agent, 'data-agent-message-list', 'Agent message list marker is missing')
require(agent, 'scrollContainerRef', 'Agent message list must have an owned scroll ref')
require(agent, 'overflow-y-auto', 'Agent message list must own vertical scrolling')
require(agent, "container.scrollTo({ top: container.scrollHeight", 'Agent bottom action must scroll the message container')
require(agent, "container.scrollTo({ top: 0", 'Agent top/conversation reset must scroll the message container')
require(agent, 'onCompositionStart', 'Agent title editing must start IME composition tracking')
require(agent, 'onCompositionEnd', 'Agent title editing must end IME composition tracking')
require(agent, 'handleRenameBlur', 'Agent title editing must defer blur commits')

require(inputBar, 'data-input-bar', 'Composer marker is missing')
require(inputBar, 'data-scroll-boundary="composer"', 'Composer must expose its scroll boundary')
require(inputBar, 'visualViewport', 'Composer must react to visual viewport changes')
require(header, 'data-global-header-spacer', 'Global header must expose a measured flow spacer')
require(navigation, 'requestAnimationFrame', 'Surface navigation must wait for rendered layout before resetting scroll')
require(navigation, 'document.documentElement.scrollLeft = 0', 'Surface navigation must clear stale horizontal scroll')
require(viewport, "addEventListener('scrollend'", 'Viewport guard must settle after iOS scroll animations')

if (failures.length) {
  console.error('Agent mobile interaction contract failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else {
  console.log('Agent mobile interaction contract passed')
}
