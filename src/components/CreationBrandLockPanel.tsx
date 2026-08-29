import type { CreationProject, CreationWorkspaceModule } from '../types'
import {
  CREATION_LOCK_LAYERS,
  getCreationLockSummary,
  normalizeCreationBrandColor,
} from '../lib/creationWorkspace'

type BrandModule = Extract<CreationWorkspaceModule, 'brand' | 'style'>

interface CreationBrandLockPanelProps {
  project: CreationProject
  activeModule: BrandModule
  onBrandChange: (patch: Partial<CreationProject['brand']>) => void
  onStyleChange: (patch: Partial<CreationProject['style']>) => void
  onBindCurrentImages: () => void
  fieldClass: string
  smallFieldClass: string
}

const colorFields: Array<{ key: 'primaryColor' | 'secondaryColor' | 'neutralColor'; label: string }> = [
  { key: 'primaryColor', label: '品牌主色' },
  { key: 'secondaryColor', label: '辅助色' },
  { key: 'neutralColor', label: '中性色' },
]

export default function CreationBrandLockPanel({
  project,
  activeModule,
  onBrandChange,
  onStyleChange,
  onBindCurrentImages,
  fieldClass,
  smallFieldClass,
}: CreationBrandLockPanelProps) {
  const lockSummary = getCreationLockSummary(project)

  if (activeModule === 'brand') {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 dark:border-blue-500/15 dark:bg-blue-500/[0.06]">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-blue-900 dark:text-blue-100">结构化品牌资产</div>
              <p className="mt-1 text-xs leading-relaxed text-blue-800/75 dark:text-blue-200/75">把品牌事实、固定文案和资产使用边界写成可复用规则，避免每次生成都靠临时补充。</p>
            </div>
            <span className="shrink-0 rounded-full bg-white/80 px-2 py-1 text-[10px] font-medium text-blue-700 dark:bg-white/[0.08] dark:text-blue-200">锁定规则 {lockSummary.readyCount}/{lockSummary.lockedCount}</span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="text-xs font-medium text-gray-700 dark:text-gray-200">品牌名称</span><input value={project.brand.name} onChange={(event) => onBrandChange({ name: event.target.value })} placeholder="例如：中国联通" className={smallFieldClass + ' mt-1'} /></label>
          <label className="block"><span className="text-xs font-medium text-gray-700 dark:text-gray-200">品牌口号 / 语气</span><input value={project.brand.slogan} onChange={(event) => onBrandChange({ slogan: event.target.value })} placeholder="例如：连接美好，共创未来" className={smallFieldClass + ' mt-1'} /></label>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {colorFields.map((field) => {
            const color = project.brand[field.key]
            return <label key={field.key} className="block"><span className="text-xs font-medium text-gray-700 dark:text-gray-200">{field.label}</span><div className="mt-1 flex min-h-11 items-center gap-2 rounded-xl border border-gray-200 bg-white px-2 dark:border-white/[0.1] dark:bg-white/[0.04]"><input type="color" value={/^#[0-9a-f]{6}$/i.test(color) ? color : '#000000'} onChange={(event) => onBrandChange({ [field.key]: event.target.value.toLowerCase() })} className="h-8 w-9 cursor-pointer rounded-lg border-0 bg-transparent p-0" aria-label={field.label} /><input value={color} onChange={(event) => onBrandChange({ [field.key]: event.target.value })} onBlur={() => onBrandChange({ [field.key]: normalizeCreationBrandColor(color, '#000000') })} inputMode="text" maxLength={7} spellCheck={false} className="min-w-0 flex-1 border-0 bg-transparent px-1 text-sm uppercase text-gray-700 outline-none focus:ring-0 dark:text-gray-200" /></div></label>
          })}
        </div>

        <label className="block"><span className="text-xs font-medium text-gray-700 dark:text-gray-200">视觉资产说明</span><textarea value={project.brand.visualNotes} onChange={(event) => onBrandChange({ visualNotes: event.target.value })} rows={4} placeholder="记录 Logo 使用方式、品牌图形、品牌字体气质、图片中的固定元素等。只填写已确认的品牌事实。" className={fieldClass} /></label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="text-xs font-medium text-gray-700 dark:text-gray-200">固定事实与数字</span><textarea value={project.brand.fixedFacts} onChange={(event) => onBrandChange({ fixedFacts: event.target.value })} rows={6} placeholder="例如：升降比目标为 1:1.5；活动时间为 2026 年 9 月；金额、百分比和单位必须原样保留。" className={fieldClass} /></label>
          <label className="block"><span className="text-xs font-medium text-gray-700 dark:text-gray-200">必须保留的原文</span><textarea value={project.brand.mandatoryText} onChange={(event) => onBrandChange({ mandatoryText: event.target.value })} rows={6} placeholder="逐行填写必须逐字出现的标题、产品名、专有名词、政策表述或免责声明。" className={fieldClass} /></label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="text-xs font-medium text-gray-700 dark:text-gray-200">品牌禁改项</span><textarea value={project.brand.forbiddenChanges} onChange={(event) => onBrandChange({ forbiddenChanges: event.target.value })} rows={5} placeholder="例如：不得替换 Logo；不得虚构数据；不得擅自更改联通红；不得新增未经确认的口号。" className={fieldClass} /></label>
          <label className="block"><span className="text-xs font-medium text-gray-700 dark:text-gray-200">Logo / 资产使用规则</span><textarea value={project.brand.logoUsage} onChange={(event) => onBrandChange({ logoUsage: event.target.value })} rows={5} placeholder="例如：Logo 保持完整比例，置于安全区内；品牌参考图只用于识别风格和资产，不改变主体身份。" className={fieldClass} /></label>
        </div>

        <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 dark:border-blue-500/15 dark:bg-blue-500/[0.06]">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0"><div className="text-sm font-semibold text-blue-800 dark:text-blue-200">品牌参考图</div><p className="mt-1 break-words text-xs leading-relaxed text-gray-600 dark:text-gray-300">绑定当前输入栏的图片。应用规则时会尝试从本机图片库恢复它们，不会上传或调用 AI。</p></div>
            <button type="button" onClick={onBindCurrentImages} className="min-h-10 shrink-0 rounded-xl bg-white px-3 text-xs font-medium text-blue-700 shadow-sm hover:bg-blue-50 dark:bg-white/[0.08] dark:text-blue-200">绑定当前参考图</button>
          </div>
          <div className="mt-3 text-xs text-blue-700 dark:text-blue-300">已绑定 {project.brand.referenceImageIds.length} 张</div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex min-w-0 items-start gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.04]">
        <input type="checkbox" checked={project.style.enabled} onChange={(event) => onStyleChange({ enabled: event.target.checked })} className="mt-0.5 h-4 w-4 accent-blue-600" id="creation-style-enabled" />
        <label htmlFor="creation-style-enabled" className="min-w-0 cursor-pointer"><div className="text-sm font-semibold text-gray-900 dark:text-white">启用风格与事实锁</div><p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">锁定层会随项目规则写入画廊、Agent 和批量任务的提示词；关闭后仍保留配置，方便稍后恢复。</p></label>
      </div>

      <div className="rounded-2xl border border-violet-100 bg-violet-50/60 p-4 dark:border-violet-500/15 dark:bg-violet-500/[0.06]">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0"><div className="text-sm font-semibold text-violet-900 dark:text-violet-100">独立锁定层</div><p className="mt-1 text-xs leading-relaxed text-violet-800/75 dark:text-violet-200/75">只锁定你已经确认的内容；未锁定的层不会被追加为硬约束。</p></div>
          <span className="shrink-0 rounded-full bg-white/80 px-2 py-1 text-[10px] font-medium text-violet-700 dark:bg-white/[0.08] dark:text-violet-200">已锁定 {lockSummary.lockedCount}/{lockSummary.total}</span>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {CREATION_LOCK_LAYERS.map((layer) => {
            const checked = project.style.lockedLayers.includes(layer.value)
            return <label key={layer.value} className={`flex min-w-0 cursor-pointer items-start gap-2 rounded-xl border px-3 py-2.5 transition ${checked ? 'border-violet-200 bg-white/80 dark:border-violet-500/25 dark:bg-white/[0.06]' : 'border-transparent bg-white/45 dark:bg-white/[0.03]'}`}><input type="checkbox" checked={checked} onChange={(event) => onStyleChange({ lockedLayers: event.target.checked ? [...new Set([...project.style.lockedLayers, layer.value])] : project.style.lockedLayers.filter((value) => value !== layer.value) })} className="mt-0.5 h-4 w-4 accent-violet-600" /><span className="min-w-0"><span className="block text-xs font-medium text-gray-800 dark:text-gray-100">{layer.label}</span><span className="mt-0.5 block break-words text-[10px] leading-relaxed text-gray-500 dark:text-gray-400">{layer.description}</span></span></label>
          })}
        </div>
        {lockSummary.warnings.length > 0 && <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200"><div className="font-medium">锁定层待完善</div><div className="mt-1">{lockSummary.warnings.join('；')}</div></div>}
        {lockSummary.warnings.length === 0 && project.style.enabled && <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-200">当前锁定层均已具备对应规则，可以应用到生成流程。</div>}
      </div>

      <label className="block"><span className="text-xs font-medium text-gray-700 dark:text-gray-200">视觉方向</span><textarea value={project.style.visualDirection} onChange={(event) => onStyleChange({ visualDirection: event.target.value })} rows={4} placeholder="例如：正式、克制、现代政企商务风；大面积留白，信息层级清晰" className={fieldClass} /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="text-xs font-medium text-gray-700 dark:text-gray-200">必须保持的关键词</span><textarea value={project.style.keywords} onChange={(event) => onStyleChange({ keywords: event.target.value })} rows={5} placeholder="用逗号或换行填写：稳重、清晰、统一、留白…" className={fieldClass} /></label>
        <label className="block"><span className="text-xs font-medium text-gray-700 dark:text-gray-200">避免出现</span><textarea value={project.style.avoid} onChange={(event) => onStyleChange({ avoid: event.target.value })} rows={5} placeholder="例如：过度炫技、廉价渐变、无关装饰、拥挤排版…" className={fieldClass} /></label>
      </div>
      <label className="block"><span className="text-xs font-medium text-gray-700 dark:text-gray-200">版式规则</span><textarea value={project.style.layoutRules} onChange={(event) => onStyleChange({ layoutRules: event.target.value })} rows={5} placeholder="例如：标题优先，结论突出；数据与备注分层；四周保留安全区…" className={fieldClass} /></label>
    </div>
  )
}
