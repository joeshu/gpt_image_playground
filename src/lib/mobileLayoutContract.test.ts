import { describe, expect, it } from 'vitest'

import css from '../index.css?raw'
import inputBar from '../components/InputBar.tsx?raw'
import agentWorkspace from '../components/AgentWorkspace.tsx?raw'

describe('mobile layout contract', () => {
  it('keeps the composer docked above the iOS safe area', () => {
    expect(css).toContain('[data-input-bar]')
    expect(css).toContain('padding-bottom: calc(0.375rem + var(--safe-area-bottom))')
    expect(css).toContain('--input-bar-clearance')
  })

  it('keeps task detail actions visible above the Home Indicator', () => {
    expect(css).toMatch(/\[data-detail-info\][\s\S]*?flex:\s*1 1 0%/)
    expect(css).toMatch(/\[data-detail-actions\][\s\S]*?position:\s*sticky/)
    expect(css).toContain('calc(0.75rem + var(--safe-area-bottom))')
  })

  it('keeps the Agent composer compact and scroll controls clear of content', () => {
    expect(inputBar).toContain("localStorage.getItem('mobile-composer-collapsed')")
    expect(agentWorkspace).toContain('right-4 z-30')
    expect(agentWorkspace).toContain('var(--input-bar-clearance,12rem)')
  })

  it('neutralizes sticky destructive hover on coarse touch devices', () => {
    expect(css).toContain('@media (hover: none) and (pointer: coarse)')
    expect(css).toContain('[data-agent-delete-action]:hover')
  })
})
