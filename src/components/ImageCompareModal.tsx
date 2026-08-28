import { useEffect, useState } from 'react'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'
import { ensureImageCached, getCachedImage } from '../lib/imageCache'
import { CloseIcon } from './icons'

interface Props {
  beforeImageId: string
  afterImageId: string
  onClose: () => void
}

export default function ImageCompareModal({ beforeImageId, afterImageId, onClose }: Props) {
  const [beforeSrc, setBeforeSrc] = useState(() => getCachedImage(beforeImageId) ?? '')
  const [afterSrc, setAfterSrc] = useState(() => getCachedImage(afterImageId) ?? '')
  const [position, setPosition] = useState(50)

  useCloseOnEscape(true, onClose)
  usePreventBackgroundScroll(true)

  useEffect(() => {
    let cancelled = false
    setBeforeSrc(getCachedImage(beforeImageId) ?? '')
    void ensureImageCached(beforeImageId).then((src) => {
      if (!cancelled && src) setBeforeSrc(src)
    })
    return () => { cancelled = true }
  }, [beforeImageId])

  useEffect(() => {
    let cancelled = false
    setAfterSrc(getCachedImage(afterImageId) ?? '')
    void ensureImageCached(afterImageId).then((src) => {
      if (!cancelled && src) setAfterSrc(src)
    })
    return () => { cancelled = true }
  }, [afterImageId])

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4 pb-[max(1rem,var(--safe-area-bottom))] pt-[max(1rem,var(--safe-area-top))] backdrop-blur-xl" onClick={onClose}>
      <button
        type="button"
        className="absolute right-[max(1rem,var(--safe-area-right))] top-[max(1rem,var(--safe-area-top))] z-30 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/45 text-white shadow-lg backdrop-blur-md active:scale-95"
        aria-label="关闭图片对比"
        onClick={onClose}
      >
        <CloseIcon className="h-5 w-5" />
      </button>

      <div className="relative h-[min(72dvh,50rem)] w-full max-w-5xl overflow-hidden rounded-2xl border border-white/15 bg-black shadow-2xl" onClick={(event) => event.stopPropagation()}>
        {beforeSrc && <img src={beforeSrc} className="absolute inset-0 h-full w-full object-contain" alt="上一版本" />}
        {afterSrc && (
          <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}>
            <img src={afterSrc} className="h-full w-full object-contain" alt="当前版本" />
          </div>
        )}

        {(!beforeSrc || !afterSrc) && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70">正在载入对比图片…</div>
        )}

        <div className="pointer-events-none absolute inset-y-0 z-20 w-0.5 bg-white shadow-[0_0_12px_rgba(0,0,0,0.65)]" style={{ left: `${position}%` }}>
          <div className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-black/55 text-sm font-bold text-white shadow-lg">↔</div>
        </div>

        <span className="absolute left-3 top-3 z-20 rounded-full bg-black/55 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-md">上一版本</span>
        <span className="absolute right-3 top-3 z-20 rounded-full bg-black/55 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-md">当前结果</span>

        <input
          type="range"
          min="0"
          max="100"
          value={position}
          onChange={(event) => setPosition(Number(event.target.value))}
          className="absolute inset-0 z-30 h-full w-full cursor-ew-resize opacity-0"
          aria-label="拖动比较上一版本与当前结果"
        />
      </div>

      <div className="pointer-events-none absolute bottom-[calc(1.25rem+var(--safe-area-bottom))] left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-4 py-2 text-xs text-white/85 backdrop-blur-md">
        左右拖动查看版本差异
      </div>
    </div>
  )
}
