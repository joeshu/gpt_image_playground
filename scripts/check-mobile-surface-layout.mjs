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
const inputBar = read('src/components/InputBar.tsx')
const promptStudio = read('src/components/PromptStudioModal.tsx')
const promptTemplate = read('src/components/PromptTemplateModal.tsx')
const select = read('src/components/Select.tsx')
const inputParamsPanel = read('src/components/input/inputParamsPanel.tsx')
const creationBatch = read('src/components/CreationBatchPanel.tsx')
const promptEnhancer = read('src/components/PromptEnhancerModal.tsx')
const promptPreflight = read('src/components/PromptPreflightModal.tsx')
const promptVersions = read('src/components/PromptVersionHistoryModal.tsx')
const sizePicker = read('src/components/SizePickerModal.tsx')
const stateOwnedPpt = read('src/components/StateOwnedPptBriefModal.tsx')
const confirmDialog = read('src/components/ConfirmDialog.tsx')
const supportPrompt = read('src/components/SupportPromptModal.tsx')
const surfaceNavigation = read('src/lib/surfaceNavigation.ts')

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

if (!styles.includes('overflow-x: clip') || !styles.includes('max-width: 100%')) {
  fail('mobile surfaces must prevent page-level horizontal overflow')
}

if (!inputBar.includes('data-mobile-param-scroll')) {
  fail('mobile parameter controls must have an explicit scroll boundary')
}

if (!surfaceNavigation.includes('document.documentElement.scrollLeft = 0') || !surfaceNavigation.includes('document.body.scrollLeft = 0')) {
  fail('surface switches must clear stale horizontal WebView scroll')
}

const viewport = read('src/lib/viewport.ts')
if (!agent.includes('data-agent-sidebar') || !viewport.includes("active.closest('[data-agent-sidebar], [data-input-bar]')")) {
  fail('fixed Agent drawer inputs must not scroll the document horizontally')
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

if (!styles.includes('[data-agent-message-list]') || !styles.includes('scroll-padding-bottom: max(12rem')) {
  fail('Agent history must reserve the measured fixed composer clearance')
}

if (!workbench.includes('data-creation-layout') || !styles.includes('[data-creation-layout]')) {
  fail('creation workbench layout must explicitly bound mobile grid and scroll children')
}

if (!workbench.includes('data-creation-actions') || !styles.includes('[data-creation-actions]')) {
  fail('creation workbench actions must reserve the iOS bottom safe area')
}

if (!creationBatch.includes('grid-cols-[2rem_minmax(0,1fr)_auto]') || !creationBatch.includes('col-span-3') || !creationBatch.includes('sm:col-span-1')) {
  fail('batch queue rows must move actions below content on narrow screens')
}

if (!inputBar.includes("renderParams('mobile-param-grid mobile-param-strip")) {
  fail('mobile parameter controls must use the contained horizontal strip')
}

if (!styles.includes('.mobile-param-strip') || !styles.includes('touch-action: pan-x') || !styles.includes('overscroll-behavior-x: contain')) {
  fail('mobile parameter controls must expose a touch-scrollable horizontal boundary')
}

if (!styles.includes('.mobile-param-scroll') || !inputBar.includes('data-mobile-param-scroll')) {
  fail('mobile parameter controls must have an explicit scroll boundary')
}

if (!styles.includes('.mobile-param-strip > label') || !styles.includes('grid-template-columns: repeat(2, minmax(0, 1fr))')) {
  fail('mobile parameter controls must use complete two-column fields instead of clipping the third control')
}

if (!promptTemplate.includes('data-scroll-boundary="prompt-template-categories"') ||
    !promptTemplate.includes('data-scroll-boundary="prompt-template-editor"') ||
    !styles.includes('[data-prompt-template-categories]')) {
  fail('prompt template sheets must expose independent iOS scroll boundaries')
}

if (!header.includes('sticky top-0') || header.includes(' fixed top-0')) {
  fail('global mobile header must remain in document flow to reserve its own height')
}

const modalScrollContracts = [
  ['Prompt Studio', promptStudio, 'usePreventBackgroundScroll(open && activeTool === null, modalRef)'],
  ['Prompt Enhancer', promptEnhancer, 'usePreventBackgroundScroll(open, modalRef)'],
  ['Prompt Preflight', promptPreflight, 'usePreventBackgroundScroll(open, modalRef)'],
  ['Prompt Version History', promptVersions, 'usePreventBackgroundScroll(open, modalRef)'],
  ['Size Picker', sizePicker, 'usePreventBackgroundScroll(true, modalRef)'],
  ['State-Owned PPT', stateOwnedPpt, 'usePreventBackgroundScroll(open, modalRef)'],
  ['Confirm Dialog', confirmDialog, 'usePreventBackgroundScroll(Boolean(confirmDialog), modalRef)'],
  ['Support Prompt', supportPrompt, 'usePreventBackgroundScroll(visible, modalRef)'],
]
for (const [name, source, hookCall] of modalScrollContracts) {
  if (!source.includes(hookCall) || !source.includes('ref={modalRef}')) {
    fail(`${name} must provide a scroll boundary to the background-scroll lock`)
  }
}

if (!promptStudio.includes('activeTool === null')) {
  fail('Prompt Studio must release its parent scroll lock while a child tool is open')
}

if (!select.includes('createPortal(') || !select.includes('data-scroll-boundary')) {
  fail('Select menus must escape clipping parents and expose a scroll boundary')
}

if (!inputParamsPanel.includes('role="status"') || !inputParamsPanel.includes('aria-disabled="true"')) {
  fail('Auto parameter fields must be explicitly read-only status elements')
}

if (!creationBatch.includes('draftSnapshotRef') || !creationBatch.includes('state.setPrompt(draft.prompt)')) {
  fail('Batch runner must restore the user draft after completion or cancellation')
}

if (header.includes('safe-area-top invisible pointer-events-none')) {
  fail('mobile header must not rely on a duplicated approximate spacer')
}

if (header.includes("'-translate-y-full sm:translate-y-0'")) {
  fail('global navigation must remain reachable while Agent is active')
}

if (!process.exitCode) console.log('Mobile surface layout contract passed')
