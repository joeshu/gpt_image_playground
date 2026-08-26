import type { TextVerificationReport, VisualDifferenceReport } from '../types'

export type CommercialDeliveryStatus = 'pending' | 'partial' | 'passed' | 'warning'

export interface CommercialDeliveryIssue {
  category: 'text' | 'visual'
  severity: 'medium' | 'high'
  label: string
}

export interface CommercialDeliveryCheck {
  status: CommercialDeliveryStatus
  score: number | null
  textScore: number | null
  visualScore: number | null
  completedChecks: number
  totalChecks: 2
  issues: CommercialDeliveryIssue[]
}

export function getCommercialDeliveryCheck(
  textReport?: TextVerificationReport,
  visualReport?: VisualDifferenceReport,
): CommercialDeliveryCheck {
  const completedChecks = Number(Boolean(textReport)) + Number(Boolean(visualReport))
  const issues: CommercialDeliveryIssue[] = []

  for (const text of textReport?.missingTexts ?? []) {
    issues.push({ category: 'text', severity: 'high', label: `缺失文字：${text}` })
  }
  for (const change of textReport?.changedTexts ?? []) {
    issues.push({
      category: 'text',
      severity: 'high',
      label: `文字变化：${change.expected || '(缺失)'} → ${change.actual || '(缺失)'}`,
    })
  }
  for (const change of textReport?.numericChanges ?? []) {
    issues.push({
      category: 'text',
      severity: 'high',
      label: `数字变化：${change.expected || '(缺失)'} → ${change.actual || '(缺失)'}`,
    })
  }

  const describedVisualIssues = new Set<string>()
  for (const region of visualReport?.regions ?? []) {
    if (region.severity === 'low') continue
    const label = region.description || region.label
    describedVisualIssues.add(label)
    issues.push({
      category: 'visual',
      severity: region.severity === 'high' ? 'high' : 'medium',
      label,
    })
  }
  for (const change of visualReport?.changes ?? []) {
    if (!describedVisualIssues.has(change)) {
      issues.push({ category: 'visual', severity: 'medium', label: change })
    }
  }

  const textScore = textReport?.score ?? null
  const visualScore = visualReport?.fidelityScore ?? null
  if (completedChecks === 0) {
    return { status: 'pending', score: null, textScore, visualScore, completedChecks, totalChecks: 2, issues }
  }
  if (completedChecks === 1) {
    return { status: 'partial', score: null, textScore, visualScore, completedChecks, totalChecks: 2, issues }
  }

  const score = Math.round((textScore ?? 0) * 0.6 + (visualScore ?? 0) * 0.4)
  const passed = textReport?.status === 'passed'
    && visualReport?.status === 'passed'
    && score >= 90

  return {
    status: passed ? 'passed' : 'warning',
    score,
    textScore,
    visualScore,
    completedChecks,
    totalChecks: 2,
    issues,
  }
}
