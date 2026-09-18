import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getImage, getStoredImageBlob, getStoredImageThumbnail } from '../lib/db'
import { isNativeApp } from '../lib/platform'
import { shareNativeBlob } from '../lib/nativeExport'
import { compilePptx } from '../lib/pptx/package'
import { clearPptxDraft, loadPptxDraft, savePptxDraft } from '../lib/pptx/draft'
import { ingestPptxFiles } from '../lib/pptx/fileIngest'
import { createEmptyPptxDraft, getPptxSlideSize, updatePptxDraft, validatePptxPages, PPTX_MAX_SOURCE_PAGES, type PptxProjectDraft, type PptxSourcePage } from '../lib/pptx/model'

const safeFileName = (value: string) => (value.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').slice(0, 80) || '图片转PPTX').replace(/\.pptx$/i, '') + '.pptx'

function ImagePreview({ page }: { page: PptxSourcePage }) {
  const [src, setSrc] = useState<string>()
  useEffect(() => {
    let alive = true
    let objectUrl = ''
    void (async () => {
      const thumb = await getStoredImageThumbnail(page.imageId)
      if (alive && thumb?.thumbnailDataUrl) { setSrc(thumb.thumbnailDataUrl); return }
      const blob = await getStoredImageBlob(page.imageId)
      if (blob) {
        const nextUrl = URL.createObjectURL(blob)
        if (alive) { objectUrl = nextUrl; setSrc(nextUrl) } else URL.revokeObjectURL(nextUrl)
        return
      }
      const image = await getImage(page.imageId)
      if (alive && image?.dataUrl) setSrc(image.dataUrl)
    })()
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [page.imageId])
  return src ? <img src={src} alt={page.name} className="h-full w-full object-contain" /> : <span className="text-xs text-gray-400">读取中…</span>
}

export default function PptxWorkbench() {
  const [draft, setDraft] = useState<PptxProjectDraft>(() => loadPptxDraft())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string }>()
  const [progress, setProgress] = useState('')
  const [result, setResult] = useState<{ blob: Blob; fileName: string; ratio: number; bytes: number; report: Record<string, unknown> }>()
  const fileRef = useRef<HTMLInputElement>(null)
  const setPatch = useCallback((patch: Partial<Pick<PptxProjectDraft, 'pages' | 'options'>>) => setDraft((current) => updatePptxDraft(current, patch)), [])
  useEffect(() => { savePptxDraft(draft) }, [draft])

  const slideSize = useMemo(() => getPptxSlideSize(draft.options.aspectRatio, draft.pages[0]), [draft.options.aspectRatio, draft.pages])
  const updateOptions = (patch: Partial<PptxProjectDraft['options']>) => setPatch({ options: { ...draft.options, ...patch } })
  const removePage = (id: string) => setPatch({ pages: draft.pages.filter((page) => page.id !== id) })
  const movePage = (index: number, direction: -1 | 1) => { const next = index + direction; if (next < 0 || next >= draft.pages.length) return; const pages = [...draft.pages]; [pages[index], pages[next]] = [pages[next], pages[index]]; setPatch({ pages }) }

  const onFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []); event.target.value = ''
    if (!files.length) return
    setMessage(undefined)
    try { setPatch({ pages: [...draft.pages, ...(await ingestPptxFiles(files, draft.pages.length))] }) }
    catch (error) { setMessage({ kind: 'error', text: error instanceof Error ? error.message : '图片导入失败' }) }
  }

  const generate = async () => {
    if (busy) return
    const issues = validatePptxPages(draft.pages)
    if (issues.length) { setMessage({ kind: 'error', text: issues.join('；') }); return }
    if (draft.options.mode === 'semantic-rebuild') { setMessage({ kind: 'error', text: '分析服务尚未配置，本阶段只完成快速打包，请切换为快速打包' }); return }
    setBusy(true); setMessage(undefined); setResult(undefined)
    try {
      setProgress('正在检查图片…')
      const resolved = new Map<string, Blob | string>()
      for (const page of draft.pages) { const blob = await getStoredImageBlob(page.imageId); if (blob) resolved.set(page.imageId, blob); else { const image = await getImage(page.imageId); if (image?.dataUrl) resolved.set(page.imageId, image.dataUrl) } }
      if (resolved.size !== draft.pages.length) throw new Error('部分图片已失效，请重新导入后再生成')
      setProgress('正在生成 PPTX…')
      const compiled = await compilePptx({ pages: draft.pages, options: draft.options, resolveImage: (page) => resolved.get(page.imageId)! })
      const fileName = safeFileName(draft.options.fileName)
      const report = { version: 1, createdAt: Date.now(), fileName, sourcePageCount: draft.pages.length, fileSizeBytes: compiled.blob.size, slideRatio: compiled.slideSize.ratio, mode: draft.options.mode, editability: '整页图片，不可拆分编辑', limitation: '每页以整页图片写入 PPTX，文本、图层和元素不可单独编辑' }
      setProgress('正在准备下载…')
      if (isNativeApp()) await shareNativeBlob(compiled.blob, fileName)
      else { const url = URL.createObjectURL(compiled.blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = fileName; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }
      setResult({ blob: compiled.blob, fileName, ratio: compiled.slideSize.ratio, bytes: compiled.blob.size, report })
      setMessage({ kind: 'success', text: 'PPTX 已生成并准备下载' })
    } catch (error) { setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'PPTX 生成失败' }) }
    finally { setBusy(false); setProgress('') }
  }

  const downloadReport = () => { if (!result) return; const blob = new Blob([JSON.stringify(result.report, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = result.fileName.replace(/\.pptx$/i, '.json'); anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }

  return <main data-pptx-content className="safe-area-x mx-auto w-full max-w-7xl px-0 pb-24 pt-4 sm:pt-6">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-xl font-bold text-gray-900 dark:text-white">图片转 PPTX</h2><p className="mt-1 text-sm text-gray-500">把图片按页快速打包为演示文稿，图片仍保留在本地 IndexedDB。</p></div>
      <button type="button" onClick={() => fileRef.current?.click()} className="min-h-11 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 dark:bg-white dark:text-gray-900" aria-label="添加图片">添加图片</button>
      <input ref={fileRef} type="file" multiple accept="image/png,image/jpeg,image/gif,image/bmp" className="hidden" onChange={onFiles} />
    </div>
    {message && <div role="status" className={`mb-4 rounded-lg border px-3 py-2 text-sm ${message.kind === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{message.text}</div>}
    <section className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-white/[0.1] dark:bg-gray-900 sm:p-5" aria-label="图片页面列表">
      {!draft.pages.length ? <div className="rounded-lg border border-dashed border-gray-300 px-4 py-14 text-center text-sm text-gray-500 dark:border-gray-700">尚未添加图片。支持 PNG、JPEG、GIF、BMP，最多 {PPTX_MAX_SOURCE_PAGES} 页。</div> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{draft.pages.map((page, index) => <article key={page.id} className="overflow-hidden rounded-lg border border-gray-200 dark:border-white/[0.1]"><div className="flex aspect-video items-center justify-center bg-gray-100 dark:bg-gray-950"><ImagePreview page={page} /></div><div className="p-3"><div className="truncate text-sm font-medium" title={page.name}>{index + 1}. {page.name}</div><div className="mt-1 text-xs text-gray-500">{page.width} × {page.height} · {(page.bytes / 1024 / 1024).toFixed(2)} MB</div><div className="mt-3 flex flex-wrap gap-1"><button type="button" aria-label={`第 ${index + 1} 页上移`} disabled={index === 0} onClick={() => movePage(index, -1)} className="min-h-9 rounded border px-2 text-xs disabled:opacity-40">上移</button><button type="button" aria-label={`第 ${index + 1} 页下移`} disabled={index === draft.pages.length - 1} onClick={() => movePage(index, 1)} className="min-h-9 rounded border px-2 text-xs disabled:opacity-40">下移</button><button type="button" aria-label={`移除第 ${index + 1} 页`} onClick={() => removePage(page.id)} className="min-h-9 rounded border border-red-200 px-2 text-xs text-red-600">移除</button></div></div></article>)}</div>}
    </section>
    <section className="mt-4 grid gap-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-white/[0.1] dark:bg-gray-900 sm:grid-cols-2 lg:grid-cols-4" aria-label="PPTX 输出选项">
      <label className="text-sm">打包模式<select value={draft.options.mode} onChange={(event) => updateOptions({ mode: event.target.value as PptxProjectDraft['options']['mode'] })} className="mt-1 min-h-11 w-full rounded border bg-transparent px-2"><option value="quick-pack">快速打包</option><option value="semantic-rebuild">语义重建（未配置）</option></select>{draft.options.mode === 'semantic-rebuild' && <span className="mt-1 block text-xs text-amber-600">分析服务尚未配置，本阶段只完成快速打包</span>}</label>
      <label className="text-sm">幻灯片比例<select value={draft.options.aspectRatio} onChange={(event) => updateOptions({ aspectRatio: event.target.value as PptxProjectDraft['options']['aspectRatio'] })} className="mt-1 min-h-11 w-full rounded border bg-transparent px-2"><option value="source">跟随首张图片</option><option value="16:9">16:9</option><option value="4:3">4:3</option></select></label>
      <label className="text-sm">图片适配<select value={draft.options.fit} onChange={(event) => updateOptions({ fit: event.target.value as PptxProjectDraft['options']['fit'] })} className="mt-1 min-h-11 w-full rounded border bg-transparent px-2"><option value="contain">完整显示（contain）</option><option value="cover">铺满裁切（cover）</option></select></label>
      <label className="text-sm">背景色<input type="color" value={draft.options.backgroundColor} onChange={(event) => updateOptions({ backgroundColor: event.target.value })} className="mt-1 block h-11 w-full rounded border bg-transparent px-1" aria-label="背景色" /></label>
      <label className="text-sm sm:col-span-2 lg:col-span-4">输出文件名<input value={draft.options.fileName} onChange={(event) => updateOptions({ fileName: event.target.value })} className="mt-1 min-h-11 w-full rounded border bg-transparent px-3" placeholder="图片转PPTX" /></label>
    </section>
    <div className="mt-4 flex flex-wrap items-center justify-end gap-2"><button type="button" onClick={() => { setDraft(createEmptyPptxDraft()); clearPptxDraft(); setResult(undefined); setMessage(undefined) }} className="min-h-11 rounded-lg border px-4 text-sm">清空草稿</button><button type="button" disabled={busy || draft.options.mode === 'semantic-rebuild'} onClick={generate} className="min-h-11 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white disabled:opacity-50">{busy ? (progress || '处理中…') : '生成 PPTX'}</button></div>
    {result && <section className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900" aria-label="生成结果"><h3 className="font-semibold">生成完成</h3><p className="mt-2">页数：{draft.pages.length} · 文件大小：{(result.bytes / 1024 / 1024).toFixed(2)} MB · Slide ratio：{result.ratio.toFixed(3)}</p><p className="mt-1">编辑限制：整页图片，不可拆分编辑</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className="min-h-10 rounded border border-emerald-300 px-3" onClick={downloadReport}>下载报告 JSON</button><button type="button" className="min-h-10 rounded border border-emerald-300 px-3" onClick={generate}>重新生成</button></div></section>}
  </main>
}
