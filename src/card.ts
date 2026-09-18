import type { MaterialType } from './types'

/**
 * 卡片文本解析。
 *
 * 卡片不强制任何字段框：正文就是一段自由文本，用最轻的书写习惯就能被认出来。
 * 这里负责把自由文本折成「头部信息 + 若干小节」，预览区据此排版。
 *
 * 认得的写法：
 *   # 小节名 / ## 小节名 / 【小节名】 / ■ 小节名
 *   键：值        （键不超过 14 字，值可空）
 *   - 条目        （也支持 · • *）
 *   ---           分隔线，忽略
 *   其余行        普通段落
 */

export type CardBlock =
  | { kind: 'fields'; rows: { k: string; v: string }[] }
  | { kind: 'para'; text: string }
  | { kind: 'list'; items: string[] }

export interface CardSection {
  title: string
  blocks: CardBlock[]
}

export interface ParsedCard {
  /** 第一个小节之前的字段，用作头部「基本信息」 */
  head: { k: string; v: string }[]
  /** 第一个小节之前的散文，通常是一句话简介或引言 */
  lead: string[]
  sections: CardSection[]
}

type LineKind =
  | { t: 'blank' }
  | { t: 'head'; text: string }
  | { t: 'field'; k: string; v: string }
  | { t: 'item'; text: string }
  | { t: 'text'; text: string }

const HEAD_MARKS = /^[#■◆●▲▶]+\s*/
const HEAD_BRACKET = /^[【\[](.+?)[】\]]\s*$/
const BOLD_ONLY = /^\*\*(.+?)\*\*\s*$/
const LIST_ITEM = /^[-*·•—]\s+(.*)$/
const SEPARATOR = /^\s*(-{3,}|={3,}|—{3,})\s*$/
const FIELD = /^([^：:]{1,14})[：:]\s*(.*)$/
const BAD_KEY = /[。！？；，、（）()「」【】…]/

function classify(raw: string): LineKind {
  const line = raw.replace(/\s+$/, '')
  if (!line.trim()) return { t: 'blank' }
  if (SEPARATOR.test(line)) return { t: 'blank' }

  const trimmed = line.trim()
  const b = trimmed.match(HEAD_BRACKET)
  if (b) return { t: 'head', text: b[1].trim() }
  const bold = trimmed.match(BOLD_ONLY)
  if (bold) return { t: 'head', text: bold[1].trim() }
  if (HEAD_MARKS.test(trimmed)) {
    const text = trimmed.replace(HEAD_MARKS, '').trim()
    if (text && text.length <= 24) return { t: 'head', text }
  }

  const item = trimmed.match(LIST_ITEM)
  if (item && !FIELD.test(trimmed)) return { t: 'item', text: item[1].trim() }

  const f = trimmed.match(FIELD)
  if (f) {
    const k = f[1].trim()
    if (k && !BAD_KEY.test(k)) return { t: 'field', k, v: f[2].trim() }
  }

  return { t: 'text', text: trimmed }
}

export function parseCard(text: string): ParsedCard {
  const lines = (text || '').split(/\r?\n/).map(classify)

  const head: { k: string; v: string }[] = []
  const lead: string[] = []
  const sections: CardSection[] = []
  let cur: CardSection | null = null

  const pushBlock = (block: CardBlock) => {
    if (cur) cur.blocks.push(block)
  }

  let i = 0
  while (i < lines.length) {
    const L = lines[i]

    if (L.t === 'blank') {
      i++
      continue
    }

    if (L.t === 'head') {
      cur = { title: L.text, blocks: [] }
      sections.push(cur)
      i++
      continue
    }

    if (L.t === 'field') {
      // 连续字段合成一组
      const rows: { k: string; v: string }[] = []
      while (i < lines.length && lines[i].t === 'field') {
        const f = lines[i] as { t: 'field'; k: string; v: string }
        rows.push({ k: f.k, v: f.v })
        i++
      }
      if (cur) pushBlock({ kind: 'fields', rows })
      else head.push(...rows)
      continue
    }

    if (L.t === 'item') {
      const items: string[] = []
      while (i < lines.length && (lines[i].t === 'item' || lines[i].t === 'text')) {
        const x = lines[i]
        items.push(x.t === 'item' ? x.text : (x as { t: 'text'; text: string }).text)
        i++
        // 段落之后不再并入列表
        if (x.t === 'text') break
      }
      pushBlock({ kind: 'list', items })
      continue
    }

    if (L.t === 'text') {
      const paras: string[] = []
      while (i < lines.length && lines[i].t === 'text') {
        paras.push((lines[i] as { t: 'text'; text: string }).text)
        i++
      }
      const joined = paras.join(' ')
      if (cur) pushBlock({ kind: 'para', text: joined })
      else lead.push(joined)
      continue
    }

    i++
  }

  return { head, lead, sections }
}

/** 预览里用：是否值得渲染（空卡片不渲染空壳） */
export function hasContent(p: ParsedCard): boolean {
  return p.head.length > 0 || p.lead.length > 0 || p.sections.length > 0
}

/* ------------------------------ 起步模板 ------------------------------ */

export const CARD_TEMPLATES: Record<MaterialType, string> = {
  人物: `# 基本信息
性别：
年龄：
身份：
出生地：

# 外貌与风格
外貌：
穿着：

# 性格与情感
性格：
情感特征：

# 动机与目标
动机：
短期目标：
长期目标：

# 能力
境界/能力：

# 人际关系
家人：
朋友：
敌人：

# 现状
当前状态：`,

  地点: `# 基本信息
所属区域：
类型：
规模：

# 地理
地形：
气候：
距离参考：

# 势力与人口
管辖势力：
主要居民：

# 现状
当前状态：`,

  势力: `# 基本信息
类型：
首领：
成立时间：

# 立场
立场：
势力范围：

# 组织
层级结构：
核心成员：
标志：

# 现状
当前状态：`,

  物品: `# 基本信息
类别：
外观：
来源：

# 功能
功能：
限制：

# 流转
当前持有者：
来历：`,

  词条: `# 基本信息
分类：

# 说明
说明：

# 相关
关联设定：`,

  桥段: `# 基本信息
分类：
适用阶段：

# 用法
用法：
注意：`,

  命名: `# 基本信息
类型：
寓意：

# 备选
- `,

  灵感: `# 想法
`,
}

export const CARD_SYNTAX_HELP = [
  '【小节名】或 # 小节名 单独一行 → 变成一个小节块',
  '键：值 单独一行 → 变成一行「标签｜内容」',
  '- 条目 → 变成列表',
  '空行分段，其余文字按段落显示',
]
