export type PromptTemplateCategory = 'poster' | 'ecommerce' | 'portrait' | 'logo' | 'infographic' | 'custom'

export interface PromptTemplateVariable {
  key: string
  label: string
  placeholder: string
  defaultValue?: string
}

export interface PromptTemplate {
  id: string
  category: PromptTemplateCategory
  title: string
  description: string
  tags: string[]
  template: string
  variables: PromptTemplateVariable[]
  builtin?: boolean
}

export interface CustomPromptTemplateInput {
  title: string
  description?: string
  template: string
  variables?: PromptTemplateVariable[]
  tags?: string[]
}

const CUSTOM_STORAGE_KEY = 'gpt-image-playground-prompt-templates'

export const BUILTIN_PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'poster-commercial',
    category: 'poster',
    title: '商业宣传海报',
    description: '适合活动、政策、营销和运营宣传页',
    tags: ['商业', '海报', '信息层级'],
    template: '制作一张{{aspectRatio}}横版中文商业宣传海报，主题为“{{topic}}”，面向{{audience}}。主标题清晰醒目，建立标题、卖点、说明和行动提示的层级；采用{{brandColor}}为主色，辅以克制的高端商务配色。画面留足安全边距，文字准确、清晰、可读，禁止乱码、错别字和无意义装饰。整体风格专业、现代、可信，适合直接交付。',
    variables: [
      { key: 'topic', label: '主题', placeholder: '例如：2026 年积分活动' },
      { key: 'audience', label: '目标受众', placeholder: '例如：营业员和门店客户' },
      { key: 'brandColor', label: '品牌主色', placeholder: '例如：中国联通红' },
      { key: 'aspectRatio', label: '画面比例', placeholder: '例如：16:9', defaultValue: '16:9' },
    ],
    builtin: true,
  },
  {
    id: 'ecommerce-product',
    category: 'ecommerce',
    title: '电商商品主图',
    description: '适合商品主图、详情页和促销素材',
    tags: ['电商', '商品', '转化'],
    template: '制作一张高端电商商品视觉图，主体是{{product}}，核心卖点为{{sellingPoint}}。场景为{{scene}}，主体完整、比例准确、材质真实，采用{{background}}背景与柔和接触阴影。构图简洁有呼吸感，商品位于安全区并突出细节；预留{{aspectRatio}}画布的文案区域。禁止改变商品关键结构、品牌标识和文字，禁止乱码。输出商业摄影级、干净、可直接投放的成品。',
    variables: [
      { key: 'product', label: '商品', placeholder: '例如：红色 5G 路由器' },
      { key: 'sellingPoint', label: '核心卖点', placeholder: '例如：高速、稳定、低延迟' },
      { key: 'scene', label: '使用场景', placeholder: '例如：现代家庭客厅' },
      { key: 'background', label: '背景', placeholder: '例如：暖白渐变' },
      { key: 'aspectRatio', label: '画面比例', placeholder: '例如：1:1', defaultValue: '1:1' },
    ],
    builtin: true,
  },
  {
    id: 'portrait-editorial',
    category: 'portrait',
    title: '人物品牌肖像',
    description: '适合头像、人物海报和品牌故事',
    tags: ['人物', '肖像', '品牌'],
    template: '创作一张{{aspectRatio}}人物品牌肖像，主体为{{subject}}，人物特征自然可信，气质为{{mood}}。场景为{{scene}}，采用具有层次的专业布光、自然肤色和适度景深；服装、姿态与构图服务于主题，不添加无关人物。整体视觉参考{{style}}，主体清晰并处于安全区，保留自然细节，禁止面部畸变、手部异常、乱码文字和水印。',
    variables: [
      { key: 'subject', label: '人物主体', placeholder: '例如：年轻的产品经理' },
      { key: 'mood', label: '气质', placeholder: '例如：专业、自信、亲和' },
      { key: 'scene', label: '场景', placeholder: '例如：明亮的科技办公空间' },
      { key: 'style', label: '视觉风格', placeholder: '例如：高级杂志人像' },
      { key: 'aspectRatio', label: '画面比例', placeholder: '例如：4:5', defaultValue: '4:5' },
    ],
    builtin: true,
  },
  {
    id: 'logo-brand',
    category: 'logo',
    title: '品牌 Logo 方向稿',
    description: '适合 Logo 概念探索和品牌视觉提案',
    tags: ['Logo', '品牌', '方向'],
    template: '为“{{brandName}}”设计一组专业 Logo 方向稿，所属行业为{{industry}}，品牌气质为{{style}}，主色为{{color}}。图形简洁、识别度高、适合小尺寸使用，兼顾正负形、比例、留白和可延展性。展示图形标志与标准字的组合关系，并提供干净的浅色背景和单色适配思路。不要使用现成品牌标识，不要生成乱码，不要添加多余水印。',
    variables: [
      { key: 'brandName', label: '品牌名称', placeholder: '例如：星云智造' },
      { key: 'industry', label: '所属行业', placeholder: '例如：智能家居' },
      { key: 'style', label: '品牌气质', placeholder: '例如：科技、可靠、温暖' },
      { key: 'color', label: '主色', placeholder: '例如：深蓝与荧光绿' },
    ],
    builtin: true,
  },
  {
    id: 'infographic-business',
    category: 'infographic',
    title: '中文信息图',
    description: '适合规则说明、数据看板和汇报图',
    tags: ['信息图', '数据', '中文'],
    template: '重构一张{{aspectRatio}}横版中文商业信息图，主题为“{{topic}}”，包含以下信息模块：{{sections}}。必须忠实保留原始业务事实、文字、数字、单位和计算关系，不擅自增删或改写核心内容。采用{{brandColor}}品牌色，建立清晰的信息层级、模块网格、对齐线和安全边距；重点数字突出，表格和说明文字在手机屏幕上也清晰可读。禁止乱码、错字、数字变化、文字裁切和过度装饰，输出高端、可信、可直接交付的成品。',
    variables: [
      { key: 'topic', label: '信息图主题', placeholder: '例如：营业员积分明白卡' },
      { key: 'sections', label: '信息模块', placeholder: '例如：积分标准、渠道系数、计算规则、积分示例' },
      { key: 'brandColor', label: '品牌主色', placeholder: '例如：中国联通红' },
      { key: 'aspectRatio', label: '画面比例', placeholder: '例如：16:9', defaultValue: '16:9' },
    ],
    builtin: true,
  },
]

function customTemplateId() {
  return `custom-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function renderPromptTemplate(template: PromptTemplate, values: Record<string, string>) {
  return template.template.replace(/{{\s*([\w-]+)\s*}}/g, (_, key: string) => values[key]?.trim() || `{{${key}}}`)
}

export function getPromptTemplateDefaults(template: PromptTemplate) {
  return Object.fromEntries(template.variables.map((variable) => [variable.key, variable.defaultValue ?? '']))
}

export function loadCustomPromptTemplates(): PromptTemplate[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(CUSTOM_STORAGE_KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const record = item as Record<string, unknown>
      if (typeof record.title !== 'string' || typeof record.template !== 'string' || !record.template.trim()) return []
      return [{
        id: typeof record.id === 'string' && record.id ? record.id : customTemplateId(),
        category: 'custom' as const,
        title: record.title.trim(),
        description: typeof record.description === 'string' ? record.description.trim() : '本机保存的自定义模板',
        tags: Array.isArray(record.tags) ? record.tags.filter((tag): tag is string => typeof tag === 'string') : ['自定义'],
        template: record.template,
        variables: Array.isArray(record.variables) ? record.variables as PromptTemplateVariable[] : [],
      }]
    })
  } catch {
    return []
  }
}

export function saveCustomPromptTemplate(input: CustomPromptTemplateInput) {
  const template: PromptTemplate = {
    id: customTemplateId(),
    category: 'custom',
    title: input.title.trim() || '未命名模板',
    description: input.description?.trim() || '本机保存的自定义模板',
    tags: input.tags ?? ['自定义'],
    template: input.template.trim(),
    variables: input.variables ?? [],
  }
  const next = [template, ...loadCustomPromptTemplates()].slice(0, 30)
  localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(next))
  return template
}

export function deleteCustomPromptTemplate(id: string) {
  localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(loadCustomPromptTemplates().filter((template) => template.id !== id)))
}

export function getAllPromptTemplates() {
  return [...BUILTIN_PROMPT_TEMPLATES, ...loadCustomPromptTemplates()]
}
