import { useEffect, useState } from 'react'
import type { TextVerificationRegion, TextVerificationReport } from '../types'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'
import { ensureImageCached, getCachedImage } from '../lib/imageCache'
import { CloseIcon } from './icons'

interface Props {
  imageId: string
  report: TextVerificationReport
  onClose: () => void
}

function regionLabel(region: TextVerificationRegion) {
  if (region.label) return region.label
  if (region.type === 'numeric') return '数字变化'
  if (region.type === 'missing') return '缺失文字'
  return '文字变化'
}

function regionTone(type: TextVerificationRegion['type']) {
  if (type === 'numeric') return 'border-amber-300 bg-amber-400/15 text-amber-100'
  if (type === 'missing') return 'border-red-400 bg-red-500/15 text-red-100'
  return 'border-fuchsia-300 bg-fuchsia-500/15 text-fuchsia-100'
}

export default function TextVerificationOverlayModal({ imageId, report, onClose }: Props) {
  const regions = report.regions ?? []
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

  const selectedRegion = regions[selectedIndex] ?? null

  return (
    <div
      className="fixed inset-0 z-[85] flex flex-col bg-black/90 pb-[var(--safe-area-bottom)] pt-[var(--safe-area-top)] backdrop-blur-xl"
      onClick={onClose}
    >
      <div className="flex h-16 shrink-0 items-center justify-between px-4" onClick={(event) => event.stopPropagation()}>
        <div>
          <h2 className="text-base font-semibold text-white">文字问题定位</h2>
          <p className="text-xs text-white/55">{regions.length} 个可定位区域 · 核验 {report.score} 分</p>
        </div>
        <button
          type="button"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white active:scale-95"
          aria-label="关闭文字问题定位"
          onClick={onClose}
        >
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-4" onClick={(event) => event.stopPropagation()}>
        <div className="flex min-h-[16rem] flex-1 items-center justify-center overflow-auto rounded-2xl bg-black/45 p-2">
          {imageSrc ? (
            <div className="relative inline-block max-w-full">
              <img src={imageSrc} alt="文字核验结果图" className="block max-h-[62dvh] max-w-full select-none object-contain" draggable={false} />
              {regions.map((region, index) => (
                <button
                  key={`${region.type}-${region.x}-${region.y}-${index}`}
                  type="button"
                  aria-label={`问题 ${index + 1}：${regionLabel(region)}`}
                  onClick={() => setSelectedIndex(index)}
                  className={`absolute border-2 transition ${
                    index === selectedIndex
                      ? 'z-20 border-yellow-300 bg-yellow-300/20 shadow-[0_0_0_2px_rgba(0,0,0,0.6),0_0_18px_rgba(253,224,71,0.75)]'
                      : `${regionTone(region.type)} shadow-[0_0_0_1px_rgba(0,0,0,0.5)]`
                  }`}
                  style={{
                    left: `${region.x}%`,
                    top: `${region.y}%`,
                    width: `${region.width}%`,
                    height: `${region.height}%`,
                  }}
                >
                  <span className="absolute -left-2 -top-3 flex h-6 min-w-6 items-center justify-center rounded-full bg-black/80 px-1 text-[11px] font-bold text-white ring-1 ring-white/50">
                    {index + 1}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-sm text-white/60">正在载入结果图片…</div>
          )}
        </div>

        {selectedRegion && (
          <div className="shrink-0 rounded-2xl border border-white/10 bg-white/[0.08] p-3 text-white">
            <div className="flex items-center gap-2">
              <span className={`rounded-full border px-2 py-1 text-[11px] font-medium ${regionTone(selectedRegion.type)}`}>
                {selectedIndex + 1} · {regionLabel(selectedRegion)}
              </span>
              <span className="text-[11px] text-white/45">点击图片框或下方条目切换</span>
            </div>
            <div className="mt-2 grid grid-cols-[auto,1fr] gap-x-2 gap-y-1 text-xs">
              <span className="text-white/45">应为</span>
              <span className="break-words text-red-200">{selectedRegion.expected || '(缺失)'}</span>
              <span className="text-white/45">实际</span>
              <span className="break-words text-green-200">{selectedRegion.actual || '(缺失)'}</span>
            </div>
          </div>
        )}

        <div className="flex shrink-0 gap-2 overflow-x-auto pb-1 hide-scrollbar">
          {regions.map((region, index) => (
            <button
              key={`list-${region.type}-${index}`}
              type="button"
              onClick={() => setSelectedIndex(index)}
              className={`min-h-11 shrink-0 rounded-xl border px-3 py-2 text-left text-xs transition ${
                index === selectedIndex
                  ? 'border-yellow-300 bg-yellow-300/15 text-white'
                  : 'border-white/10 bg-white/[0.06] text-white/70'
              }`}
            >
              <div className="font-medium">{index + 1}. {regionLabel(region)}</div>
              <div className="mt-0.5 max-w-48 truncate text-[11px] opacity-65">{region.expected || region.actual || '待检查区域'}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
