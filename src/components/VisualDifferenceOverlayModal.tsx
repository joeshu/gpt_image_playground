import { useEffect, useState } from 'react'
import type { VisualDifferenceRegion, VisualDifferenceReport } from '../types'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'
import { ensureImageCached, getCachedImage } from '../lib/imageCache'
import { CloseIcon } from './icons'

interface Props {
  imageId: string
  report: VisualDifferenceReport
  onClose: () => void
}

const CATEGORY_LABELS: Record<VisualDifferenceRegion['category'], string> = {
  layout: '布局',
  color: '颜色',
  element: '关键元素',
  crop: '裁切',
  style: '风格',
}

const SEVERITY_LABELS: Record<VisualDifferenceRegion['severity'], string> = {
  low: '轻微',
  medium: '中等',
  high: '严重',
}

function severityTone(severity: VisualDifferenceRegion['severity'], selected = false) {
  if (selected) return 'border-white bg-white/20 shadow-[0_0_0_2px_rgba(0,0,0,0.7),0_0_22px_rgba(255,255,255,0.65)]'
  if (severity === 'high') return 'border-red-400 bg-red-500/35 shadow-[0_0_18px_rgba(239,68,68,0.55)]'
  if (severity === 'medium') return 'border-amber-300 bg-amber-400/28 shadow-[0_0_16px_rgba(251,191,36,0.45)]'
  return 'border-cyan-300 bg-cyan-400/20 shadow-[0_0_12px_rgba(34,211,238,0.35)]'
}

export default function VisualDifferenceOverlayModal({ imageId, report, onClose }: Props) {
  const [imageSrc, setImageSrc] = useState(() => getCachedImage(imageId) ?? '')
  const [selectedIndex, setSelectedIndex] = useState(0)

  useCloseOnEscape(true, onClose)
  usePreventBackgroundScroll(true)

  useEffect(() => {
    let cancelled = false
    setImageSrc(getCachedImage(imageId) ?? '')
    void ensureImageCached(imageId).then((src) => {
      if (!cancelled && src) setImageSrc(src)
    })
    return () => { cancelled = true }
  }, [imageId])

  useEffect(() => {
    setSelectedIndex(0)
  }, [imageId, report.checkedAt])

  const selectedRegion = report.regions[selectedIndex] ?? null

  return (
    <div className="fixed inset-0 z-[86] flex flex-col bg-slate-950/95 pb-[var(--safe-area-bottom)] pt-[var(--safe-area-top)] backdrop-blur-xl" onClick={onClose}>
      <div className="flex h-16 shrink-0 items-center justify-between px-4" onClick={(event) => event.stopPropagation()}>
        <div>
          <h2 className="text-base font-semibold text-white">视觉差异热区</h2>
          <p className="text-xs text-white/55">{report.regions.length} 个区域 · 忠实度 {report.fidelityScore} 分</p>
        </div>
        <button type="button" className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white active:scale-95" aria-label="关闭视觉差异热区" onClick={onClose}>
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-4" onClick={(event) => event.stopPropagation()}>
        <div className="flex min-h-[16rem] flex-1 items-center justify-center overflow-auto rounded-2xl bg-black/45 p-2">
          {imageSrc ? (
            <div className="relative inline-block max-w-full">
              <img src={imageSrc} alt="视觉差异结果图" className="block max-h-[62dvh] max-w-full select-none object-contain" draggable={false} />
              {report.regions.map((region, index) => (
                <button
                  key={`${region.category}-${region.x}-${region.y}-${index}`}
                  type="button"
                  aria-label={`差异 ${index + 1}：${region.label || CATEGORY_LABELS[region.category]}`}
                  onClick={() => setSelectedIndex(index)}
                  className={`absolute border-2 transition ${severityTone(region.severity, index === selectedIndex)}`}
                  style={{ left: `${region.x}%`, top: `${region.y}%`, width: `${region.width}%`, height: `${region.height}%` }}
                >
                  <span className="absolute -left-2 -top-3 flex h-6 min-w-6 items-center justify-center rounded-full bg-black/85 px-1 text-[11px] font-bold text-white ring-1 ring-white/50">{index + 1}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-sm text-white/60">正在载入结果图片…</div>
          )}
        </div>

        {selectedRegion && (
          <div className="shrink-0 rounded-2xl border border-white/10 bg-white/[0.08] p-3 text-white">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/20 bg-white/10 px-2 py-1 text-[11px] font-medium">
                {selectedIndex + 1} · {CATEGORY_LABELS[selectedRegion.category]}
              </span>
              <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${
                selectedRegion.severity === 'high'
                  ? 'bg-red-500/20 text-red-200'
                  : selectedRegion.severity === 'medium'
                    ? 'bg-amber-500/20 text-amber-200'
                    : 'bg-cyan-500/20 text-cyan-200'
              }`}>{SEVERITY_LABELS[selectedRegion.severity]}</span>
            </div>
            <div className="mt-2 text-sm font-medium">{selectedRegion.label || '视觉差异'}</div>
            <p className="mt-1 text-xs leading-relaxed text-white/65">{selectedRegion.description || '请对照来源图检查该区域。'}</p>
          </div>
        )}

        <div className="flex shrink-0 gap-2 overflow-x-auto pb-1 hide-scrollbar">
          {report.regions.map((region, index) => (
            <button
              key={`item-${region.category}-${index}`}
              type="button"
              onClick={() => setSelectedIndex(index)}
              className={`min-h-11 shrink-0 rounded-xl border px-3 py-2 text-left text-xs transition ${
                index === selectedIndex ? 'border-white/60 bg-white/15 text-white' : 'border-white/10 bg-white/[0.06] text-white/70'
              }`}
            >
              <div className="font-medium">{index + 1}. {region.label || CATEGORY_LABELS[region.category]}</div>
              <div className="mt-0.5 max-w-48 truncate text-[11px] opacity-65">{SEVERITY_LABELS[region.severity]} · {CATEGORY_LABELS[region.category]}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
