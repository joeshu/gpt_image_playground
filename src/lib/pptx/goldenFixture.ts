import type { PptxElementBox, PptxSlideElement, PptxSlideSpec, PptxTextStyle } from './model'

const b = (x: number, y: number, width: number, height: number): PptxElementBox => ({ x, y, width, height })
const baseText = { fontFamily: 'Microsoft YaHei', marginPt: 0, verticalAnchor: 'middle' as const }

function text(id: string, box: PptxElementBox, value: string, style: Record<string, unknown> = {}, confidence = 0.98): PptxSlideElement {
  return { id, type: 'text', box, text: value, style: { ...baseText, ...style } as PptxTextStyle, confidence, editable: true }
}

function rect(id: string, box: PptxElementBox, fill: string, line?: string, radius = 0): PptxSlideElement {
  return { id, type: 'rect', box, fill, line, radius }
}

function shape(id: string, shapeName: Extract<PptxSlideElement, { type: 'shape' }>['shape'], box: PptxElementBox, fill: string, line?: string, rotation?: number): PptxSlideElement {
  return { id, type: 'shape', shape: shapeName, box, fill, line, rotation }
}

function line(id: string, x1: number, y1: number, x2: number, y2: number, color: string, widthPt = 1): PptxSlideElement {
  return {
    id,
    type: 'line',
    box: b(Math.min(x1, x2), Math.min(y1, y2), Math.max(0.001, Math.abs(x2 - x1)), Math.max(0.001, Math.abs(y2 - y1))),
    line: color,
    widthPt,
    flipH: x2 < x1,
    flipV: y2 < y1,
  }
}

function sourceCrop(id: string, box: PptxElementBox, reason: string): PptxSlideElement {
  return { id, type: 'image', box, sourceBox: box, classification: 'source_crop', sourceExact: true, confidence: 0.97, editable: false, fallbackReason: reason }
}

function imagegenAsset(id: string, box: PptxElementBox, prompt: string, confidence = 0.90): PptxSlideElement {
  return {
    id,
    type: 'image',
    box,
    classification: 'imagegen_asset',
    assetId: id,
    assetPrompt: `Isolated transparent PNG asset for a Chinese business presentation. No text, labels, numbers, card frame, or background. Match the reference geometry and colors exactly. ${prompt}`,
    confidence,
    editable: false,
  }
}

/**
 * Hand-verified golden inventory for the supplied China Unicom operations slide.
 * It is intentionally a fixture, not a content-based production shortcut: the
 * runtime analyzer generates the same protocol for arbitrary source images.
 */
export function createUnicomOperationsGoldenSpec(): PptxSlideSpec {
  const elements: PptxSlideElement[] = [
    text('title-black', b(0.058, 0.014, 0.355, 0.055), '聚焦流失三大根因，构建', { fontSizePt: 27, bold: true, color: '#111111', align: 'left' }),
    text('title-red', b(0.405, 0.014, 0.355, 0.055), '全生命周期客户运营体系', { fontSizePt: 27, bold: true, color: '#C91F2B', align: 'left' }),
    text('subtitle', b(0.060, 0.079, 0.53, 0.047), '主动干预 · 强化挽留 · 前置维系，推动流失收入持续压降', { fontSizePt: 16, bold: true, color: '#25364A', align: 'left' }),
    sourceCrop('china-unicom-logo', b(0.837, 0.012, 0.138, 0.096), '复杂品牌 Logo 保留为独立源图资产'),

    rect('top-overview-panel', b(0.020, 0.148, 0.318, 0.238), '#FFFDFD', '#F0D8DB', 0.018),
    rect('current-panel', b(0.030, 0.170, 0.132, 0.190), '#FFF1F2', undefined, 0.012),
    rect('target-panel', b(0.190, 0.170, 0.132, 0.190), '#FFF1F2', undefined, 0.012),
    imagegenAsset('current-icon', b(0.045, 0.198, 0.050, 0.066), 'flat red bar-chart pictogram with three ascending bars and a small upward trend line'),
    imagegenAsset('target-icon', b(0.205, 0.198, 0.050, 0.066), 'flat red target and bullseye pictogram with a centered arrow'),
    text('current-label', b(0.086, 0.194, 0.065, 0.034), '现状', { fontSizePt: 17, bold: true, color: '#C91F2B', align: 'center' }),
    text('current-copy', b(0.040, 0.279, 0.105, 0.062), '趋势向好\n仍在高位', { fontSizePt: 14, bold: true, color: '#16263A', align: 'center' }),
    text('target-label', b(0.240, 0.194, 0.065, 0.034), '目标', { fontSizePt: 17, bold: true, color: '#C91F2B', align: 'center' }),
    text('target-copy', b(0.205, 0.270, 0.117, 0.070), '流失收入\n持续压降', { fontSizePt: 13, bold: true, color: '#16263A', align: 'center' }),
    text('target-percent', b(0.268, 0.291, 0.050, 0.042), '10%', { fontSizePt: 24, bold: true, color: '#C91F2B', align: 'center' }),
    shape('overview-arrow', 'chevron', b(0.162, 0.235, 0.030, 0.050), '#F08A92', undefined),

    rect('chart-panel', b(0.347, 0.148, 0.633, 0.238), '#FFFFFF', '#F0D8DB', 0.018),
    shape('chart-title-pill', 'roundRect', b(0.350, 0.153, 0.190, 0.044), '#D92737', undefined),
    text('chart-title', b(0.358, 0.154, 0.178, 0.041), '出版流失收入（单位：万元）', { fontSizePt: 11, bold: true, color: '#FFFFFF', align: 'center' }),
    text('chart-legend-2025', b(0.835, 0.158, 0.070, 0.030), '2025年', { fontSizePt: 10, color: '#1F6EC5', align: 'right' }),
    text('chart-legend-2026', b(0.916, 0.158, 0.062, 0.030), '2026年', { fontSizePt: 10, color: '#D92737', align: 'right' }),
    line('legend-blue', 0.807, 0.174, 0.832, 0.174, '#1F6EC5', 1.4),
    line('legend-red', 0.889, 0.174, 0.913, 0.174, '#D92737', 1.4),
    shape('chart-goal-pill', 'roundRect', b(0.820, 0.194, 0.157, 0.043), '#FFF6F6', '#E89DA3'),
    text('chart-goal', b(0.825, 0.195, 0.148, 0.040), '目标：持续压降10% ↓', { fontSizePt: 10, bold: true, color: '#C91F2B', align: 'center' }),
  ]

  const chartLeft = 0.394
  const chartRight = 0.947
  const chartTop = 0.229
  const chartBottom = 0.343
  const blue = [0.207, 0.222, 0.253, 0.255, 0.290, 0.333, 0.233, 0.236, 0.230, 0.222, 0.214, 0.266]
  const red = [0.219, 0.230, 0.221, 0.248, 0.233, 0.243, 0.224, 0.206, 0.213, 0.202, 0.194, 0.238]
  const blueLabels = ['218.9', '222.5', '253.3', '254.6', '290.3', '332.8', '232.9', '236.0', '230.0', '221.7', '213.9', '265.5']
  const redLabels = ['218.9', '230.3', '220.8', '248.3', '232.7', '243.2', '224.0']
  for (const [series, values, color, labels] of [['blue', blue, '#1F6EC5', blueLabels], ['red', red, '#D92737', redLabels]] as const) {
    for (let index = 0; index < values.length - 1; index += 1) {
      const x1 = chartLeft + (chartRight - chartLeft) * index / 11
      const x2 = chartLeft + (chartRight - chartLeft) * (index + 1) / 11
      const y1 = chartBottom - (values[index] - 0.15) / 0.20 * (chartBottom - chartTop)
      const y2 = chartBottom - (values[index + 1] - 0.15) / 0.20 * (chartBottom - chartTop)
      elements.push(line(`${series}-segment-${index + 1}`, x1, y1, x2, y2, color, 1.35))
    }
    values.forEach((value, index) => {
      const x = chartLeft + (chartRight - chartLeft) * index / 11
      const y = chartBottom - (value - 0.15) / 0.20 * (chartBottom - chartTop)
      elements.push(shape(`${series}-point-${index + 1}`, 'ellipse', b(x - 0.004, y - 0.006, 0.008, 0.012), color, undefined))
      if (labels[index]) elements.push(text(`${series}-value-${index + 1}`, b(x - 0.026, y - (series === 'blue' ? 0.028 : -0.017), 0.052, 0.020), labels[index], { fontSizePt: 7.5, bold: true, color, align: 'center' }, 0.90))
    })
  }
  ;['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'].forEach((month, index) => {
    const x = chartLeft + (chartRight - chartLeft) * index / 11
    elements.push(text(`month-${index + 1}`, b(x - 0.020, 0.347, 0.040, 0.021), month, { fontSizePt: 7.5, color: '#25364A', align: 'center' }, 0.97))
  })
  ;['450', '350', '250', '150'].forEach((label, index) => elements.push(text(`axis-${label}`, b(0.355, 0.214 + index * 0.038, 0.030, 0.020), label, { fontSizePt: 7.5, color: '#25364A', align: 'right' }, 0.94)))
  for (let index = 0; index < 4; index += 1) elements.push(line(`grid-${index}`, chartLeft, 0.229 + index * 0.038, chartRight, 0.229 + index * 0.038, '#D9DEE5', 0.45))
  elements.push(line('chart-axis-bottom', chartLeft, chartBottom, chartRight, chartBottom, '#596675', 0.8))

  const cards = [
    { x: 0.020, header: '01  发展质量｜主动干预', sub: '（端网业适配）', body: ['目标用户：40万', '套餐适配 + FTTR/万兆猫，\n次推优选千兆、CBSS弹窗拦截', '营销组织：智客结对协同营销，\nOMO触达（到厅、看弹窗、看推荐）'], footer: '提升匹配度，降低流失风险' },
    { x: 0.348, header: '02  满卡满融｜强化挽留', sub: '（拆机挽留）', body: ['目标用户：20万', '发展场景：①外呼或同时推荐搭载，\n②触达办派单，③前期自己发展用户\n④到厅用户－看弹窗', '举措：三抓（挖需求、搭载、降套）\n三换（装维上门、方案升级、问题解决）\n中台拆机：挖真实需求，定制挽留方案'], footer: '深挖需求，提升价值与粘性' },
    { x: 0.676, header: '03  事后回捞｜前置维系', sub: '（新入网&金融维系）', body: ['新入网维系：发展入主动联系用户，做关爱提醒，\n到厅充值送小礼品，促二次保长期在网', '金融维系：回访、包装价值是否足额，促进实发展', '分类分级监控：按入网时长、套餐种类、客户价值分类，\n识别风险客群并前置维系。'], footer: '前置服务，延长在网生命周期' },
  ]
  cards.forEach((card, cardIndex) => {
    elements.push(rect(`card-${cardIndex + 1}-body`, b(card.x, 0.400, 0.318, 0.365), '#FFFDFD', '#F0D8DB', 0.014))
    elements.push(shape(`card-${cardIndex + 1}-header`, 'roundRect', b(card.x, 0.400, 0.318, 0.065), '#D92737', undefined))
    elements.push(text(`card-${cardIndex + 1}-header-text`, b(card.x + 0.013, 0.406, 0.292, 0.050), card.header, { fontSizePt: 15, bold: true, color: '#FFFFFF', align: 'left' }))
    elements.push(text(`card-${cardIndex + 1}-sub`, b(card.x + 0.238, 0.423, 0.072, 0.022), card.sub, { fontSizePt: 8.5, color: '#FFFFFF', align: 'right' }, 0.90))
    const bodyY = 0.473
    card.body.forEach((copy, bodyIndex) => {
      const y = bodyY + bodyIndex * (cardIndex === 1 ? 0.083 : 0.095)
      elements.push(imagegenAsset(`card-${cardIndex + 1}-icon-${bodyIndex + 1}`, b(card.x + 0.020, y + 0.008, 0.044, 0.058), `small monochrome red business pictogram for card ${cardIndex + 1}, item ${bodyIndex + 1}; simple flat vector-like silhouette with a soft pale-red circular host`))
      elements.push(text(`card-${cardIndex + 1}-copy-${bodyIndex + 1}`, b(card.x + 0.086, y, 0.216, cardIndex === 1 ? 0.072 : 0.080), copy, { fontSizePt: cardIndex === 1 ? 10.2 : 10.6, bold: bodyIndex === 0, color: '#16263A', align: 'left' }, bodyIndex === 1 ? 0.88 : 0.94))
    })
    elements.push(rect(`card-${cardIndex + 1}-footer-bg`, b(card.x + 0.010, 0.706, 0.298, 0.046), '#FFF0F1', undefined, 0.009))
    elements.push(text(`card-${cardIndex + 1}-footer`, b(card.x + 0.025, 0.710, 0.270, 0.038), card.footer, { fontSizePt: 12, bold: true, color: '#D92737', align: 'center' }))
  })

  elements.push(
    rect('management-strip', b(0.020, 0.785, 0.960, 0.058), '#FFFDFD', '#D92737', 0.010),
    text('management-title', b(0.038, 0.795, 0.340, 0.034), '管理保障｜借鉴郑州经验，营造高质量发展氛围', { fontSizePt: 11.5, bold: true, color: '#D92737', align: 'left' }),
    imagegenAsset('management-shield', b(0.402, 0.794, 0.034, 0.040), 'flat red shield with a white check mark, isolated transparent asset'),
    text('management-copy-1', b(0.438, 0.795, 0.215, 0.034), '① 建立一线员工信誉分管理体系', { fontSizePt: 10, bold: true, color: '#25364A', align: 'left' }),
    imagegenAsset('management-policy', b(0.665, 0.794, 0.034, 0.040), 'flat red document policy pictogram with two white horizontal lines, isolated transparent asset'),
    text('management-copy-2', b(0.700, 0.795, 0.260, 0.034), '② 明确违反生产经营管理秩序行为处理标准', { fontSizePt: 9.5, bold: true, color: '#25364A', align: 'left' }),
    shape('management-divider', 'rect', b(0.650, 0.795, 0.001, 0.034), '#E6A0A5', undefined),
    shape('outcome-ribbon', 'chevron', b(0.020, 0.860, 0.160, 0.064), '#D92737', undefined),
    text('outcome-title', b(0.043, 0.868, 0.130, 0.046), '预期成效', { fontSizePt: 16, bold: true, color: '#FFFFFF', align: 'center' }),
    imagegenAsset('outcome-quality-icon', b(0.190, 0.867, 0.046, 0.052), 'flat red ascending bar chart pictogram inside a pale-red circle'),
    text('outcome-quality', b(0.236, 0.866, 0.110, 0.053), '高质量发展\n提升收入持续性', { fontSizePt: 9.5, bold: true, color: '#25364A', align: 'left' }),
    shape('outcome-arrow-1', 'chevron', b(0.350, 0.878, 0.032, 0.030), '#F08A92', undefined),
    imagegenAsset('outcome-risk-icon', b(0.400, 0.867, 0.046, 0.052), 'flat red shield with a white check mark inside a pale-red circle'),
    text('outcome-risk', b(0.446, 0.866, 0.110, 0.053), '降低流失风险\n减少非必要流失', { fontSizePt: 9.5, bold: true, color: '#25364A', align: 'left' }),
    shape('outcome-arrow-2', 'chevron', b(0.560, 0.878, 0.032, 0.030), '#F08A92', undefined),
    imagegenAsset('outcome-value-icon', b(0.610, 0.867, 0.046, 0.052), 'flat red group-of-customers pictogram inside a pale-red circle'),
    text('outcome-value', b(0.656, 0.866, 0.110, 0.053), '客户价值提升\nARPU与粘性增长', { fontSizePt: 9.5, bold: true, color: '#25364A', align: 'left' }),
    shape('outcome-arrow-3', 'chevron', b(0.770, 0.878, 0.032, 0.030), '#F08A92', undefined),
    imagegenAsset('outcome-target-icon', b(0.815, 0.867, 0.046, 0.052), 'flat red target and bullseye pictogram with a centered arrow inside a pale-red circle'),
    text('outcome-target', b(0.861, 0.860, 0.115, 0.064), '流失收入持续压降\n目标 10%', { fontSizePt: 10, bold: true, color: '#D92737', align: 'left' }),
    text('footer-slogan', b(0.022, 0.934, 0.300, 0.035), '联通世界  创享美好智慧生活', { fontFamily: 'KaiTi', fontSizePt: 11, color: '#6D6D6D', align: 'left' }),
    imagegenAsset('footer-city-decoration', b(0.575, 0.932, 0.405, 0.068), 'wide red and pale-pink Chinese city skyline silhouette with a soft diagonal gradient band, transparent around the skyline'),
  )

  return {
    schemaVersion: 1,
    canvas: { widthPx: 1672, heightPx: 941, aspectRatio: 1672 / 941 },
    background: { color: '#FFFFFF' },
    elements,
    readingOrder: elements.filter((element) => element.type === 'text').map((element) => element.id),
    warnings: [
      '这是首张中国联通运营分析图的人工校准 golden fixture。',
      'Logo、业务 pictogram、城市剪影等复杂资产保留为独立源图局部，不伪造为矢量图标。',
      '折线图已拆为原生线段、数据点和标签；真实数据仍建议在导出后复核。',
    ],
  }
}
