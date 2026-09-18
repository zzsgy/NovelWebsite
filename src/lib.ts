export const uid = (): string =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

/** 网文口径字数：去掉所有空白字符后的字符数 */
export function countWords(text: string): number {
  if (!text) return 0
  return text.replace(/\s/g, '').length
}

export function todayKey(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function dateKeyOffset(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return todayKey(d)
}

export function fmtTime(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes()
  ).padStart(2, '0')}`
}

const INDENT = '\u3000\u3000'

/** 段首缩进两字符（网文标准排版），跳过空行与已有缩进的行 */
export function normalizeIndent(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const t = line.replace(/^[\u3000\s]+/, '')
      if (!t) return ''
      return INDENT + t
    })
    .join('\n')
}

export function stripIndent(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/^[\u3000\s]+/, ''))
    .join('\n')
}

export interface Seg {
  text: string
  kind: 'normal' | 'name' | 'forbidden'
}

/** 构建高亮片段：人物名（绿）与禁词（琥珀） */
export function buildSegments(
  text: string,
  names: string[],
  forbidden: string[]
): Seg[] {
  const kws: { w: string; kind: 'name' | 'forbidden' }[] = []
  forbidden.forEach((w) => w && kws.push({ w, kind: 'forbidden' }))
  names.forEach((w) => w && kws.push({ w, kind: 'name' }))
  if (!kws.length) return [{ text, kind: 'normal' }]
  // 长词优先，避免短词抢先匹配
  kws.sort((a, b) => b.w.length - a.w.length)
  const first = new Map<string, typeof kws>()
  kws.forEach((k) => {
    const c = k.w[0]
    if (!first.has(c)) first.set(c, [])
    first.get(c)!.push(k)
  })

  const segs: Seg[] = []
  let buf = ''
  let bufKind: Seg['kind'] = 'normal'
  const push = () => {
    if (buf) segs.push({ text: buf, kind: bufKind })
    buf = ''
  }

  let i = 0
  while (i < text.length) {
    const cands = first.get(text[i])
    let hit: (typeof kws)[number] | null = null
    if (cands) {
      for (const k of cands) {
        if (text.startsWith(k.w, i)) {
          hit = k
          break
        }
      }
    }
    if (hit) {
      push()
      segs.push({ text: hit.w, kind: hit.kind })
      bufKind = 'normal'
      i += hit.w.length
    } else {
      if (bufKind !== 'normal') push()
      bufKind = 'normal'
      buf += text[i]
      i++
    }
  }
  push()
  return segs
}

export function pct(a: number, b: number): number {
  if (!b) return 0
  return Math.max(0, Math.min(100, Math.round((a / b) * 100)))
}

export function fmtNum(n: number): string {
  return n.toLocaleString('zh-CN')
}

/** 万元/万字友好显示 */
export function fmtWords(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(2) + ' 万字'
  return n + ' 字'
}

export function isToday(ts: number): boolean {
  return todayKey(new Date(ts)) === todayKey()
}
