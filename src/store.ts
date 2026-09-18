import { useSyncExternalStore } from 'react'
import type {
  DB,
  ID,
  Work,
  Volume,
  Chapter,
  ChapterVersion,
  Material,
  Foreshadow,
  PlanCard,
  WorkPlan,
  Settings,
  WritingLog,
} from './types'
import { uid, countWords, todayKey, dateKeyOffset, normalizeIndent } from './lib'

const K_META = 'novel-studio:meta'
const K_CH = 'novel-studio:ch:'
const K_VER = 'novel-studio:ver:'
const LIMIT_VERSIONS = 20

export const defaultSettings: Settings = {
  theme: 'light',
  fontFamily: '"Alibaba PuHuiTi","AlibabaPuHuiTi-3","阿里巴巴普惠体","Microsoft YaHei",system-ui,sans-serif',
  fontSize: 17,
  lineHeight: 1.8,
  pageWidth: 860,
  autoIndent: true,
  highlightNames: true,
  forbiddenCheck: true,
  typewriter: false,
  focusParagraph: false,
  showWordProgress: true,
  showSpeed: true,
  forbiddenWords: [],
  dailyGoal: 4000,
  chapterGoal: 2000,
}

export function emptyDB(): DB {
  return {
    version: 1,
    works: [],
    volumes: [],
    chapters: [],
    versions: [],
    materials: [],
    foreshadows: [],
    logs: [],
    plans: [],
    settings: { ...defaultSettings },
  }
}

/**
 * 存储适配层。
 * 默认是浏览器本地存储实现；接入云服务后由 cloudStore 切换到云端实现，
 * 上层业务代码（store 与页面）完全不用改。
 */
export interface StorageAdapter {
  name: string
  label: string
  load(): Promise<DB | null>
  saveMeta(db: DB): Promise<void>
  saveChapter(ch: Chapter): Promise<void>
  saveVersions(chapterId: ID, list: ChapterVersion[]): Promise<void>
  removeChapter(chapterId: ID): Promise<void>
  clear(): Promise<void>
}

/** 把 DB 打成「元数据包」：正文与版本分键存放，云端与本地实现共用这一套 */
export function packMeta(db: DB) {
  return {
    version: db.version,
    works: db.works,
    volumes: db.volumes,
    materials: db.materials,
    foreshadows: db.foreshadows,
    logs: db.logs,
    plans: db.plans,
    settings: db.settings,
    chapterIndex: db.chapters.map(({ content, ...rest }) => rest),
  }
}

class LocalAdapter implements StorageAdapter {
  name = 'local'
  label = '浏览器本地存储'

  async load(): Promise<DB | null> {
    const raw = localStorage.getItem(K_META)
    if (!raw) return null
    try {
      const meta = JSON.parse(raw)
      const db: DB = {
        ...emptyDB(),
        ...meta,
        settings: { ...defaultSettings, ...(meta.settings || {}) },
      }
      db.chapters = (meta.chapterIndex || []).map((c: Chapter) => ({
        ...c,
        content: localStorage.getItem(K_CH + c.id) || '',
      }))
      db.versions = (meta.chapterIndex || []).flatMap((c: Chapter) => {
        const v = localStorage.getItem(K_VER + c.id)
        return v ? (JSON.parse(v) as ChapterVersion[]) : []
      })
      db.materials = meta.materials || []
      db.foreshadows = meta.foreshadows || []
      db.logs = meta.logs || []
      db.plans = meta.plans || []
      db.works = meta.works || []
      db.volumes = meta.volumes || []
      return db
    } catch {
      return null
    }
  }

  async saveMeta(db: DB): Promise<void> {
    localStorage.setItem(K_META, JSON.stringify(packMeta(db)))
  }

  async saveChapter(ch: Chapter): Promise<void> {
    localStorage.setItem(K_CH + ch.id, ch.content || '')
  }

  async saveVersions(chapterId: ID, list: ChapterVersion[]): Promise<void> {
    localStorage.setItem(K_VER + chapterId, JSON.stringify(list))
  }

  async removeChapter(chapterId: ID): Promise<void> {
    localStorage.removeItem(K_CH + chapterId)
    localStorage.removeItem(K_VER + chapterId)
  }

  async clear(): Promise<void> {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('novel-studio:'))
      .forEach((k) => localStorage.removeItem(k))
  }
}

/** 可切换实现的委托适配器：启动时由 cloudStore 决定是否换成云端实现 */
class DelegatingAdapter implements StorageAdapter {
  constructor(private impl: StorageAdapter) {}
  get name() {
    return this.impl.name
  }
  get label() {
    return this.impl.label
  }
  setImpl(next: StorageAdapter) {
    this.impl = next
  }
  load() {
    return this.impl.load()
  }
  saveMeta(db: DB) {
    return this.impl.saveMeta(db)
  }
  saveChapter(ch: Chapter) {
    return this.impl.saveChapter(ch)
  }
  saveVersions(chapterId: ID, list: ChapterVersion[]) {
    return this.impl.saveVersions(chapterId, list)
  }
  removeChapter(chapterId: ID) {
    return this.impl.removeChapter(chapterId)
  }
  clear() {
    return this.impl.clear()
  }
}

export const localAdapter: StorageAdapter = new LocalAdapter()
export const adapter = new DelegatingAdapter(localAdapter)
/** 由 cloudStore 在登录成功后调用，把持久化切到云端 */
export function setAdapterImpl(next: StorageAdapter) {
  adapter.setImpl(next)
}

/* ------------------------------ 全局状态 ------------------------------ */

let db: DB = emptyDB()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((f) => f())

export function getDB(): DB {
  return db
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function useDB(): DB {
  return useSyncExternalStore(subscribe, getDB, getDB)
}

let metaTimer: number | null = null
function persistMeta() {
  if (metaTimer) window.clearTimeout(metaTimer)
  metaTimer = window.setTimeout(() => {
    adapter.saveMeta(db).catch(() => {})
  }, 400)
}

export function setDB(next: DB, opts: { persist?: boolean } = {}) {
  db = next
  emit()
  if (opts.persist !== false) persistMeta()
}

export async function hydrate(): Promise<void> {
  const loaded = await adapter.load()
  if (loaded) {
    db = loaded
    emit()
  } else {
    db = emptyDB()
    emit()
    await adapter.saveMeta(db)
  }
}

/* ------------------------------ 工具 ------------------------------ */

const now = () => Date.now()

function patchChapters(fn: (list: Chapter[]) => Chapter[]) {
  setDB({ ...db, chapters: fn(db.chapters) })
}

function recordLog(workId: ID, delta: number) {
  if (!delta) return
  const date = todayKey()
  const logs = [...db.logs]
  const i = logs.findIndex((l) => l.date === date && l.workId === workId)
  if (i >= 0) {
    logs[i] = {
      ...logs[i],
      added: logs[i].added + Math.max(0, delta),
      net: logs[i].net + delta,
    }
  } else {
    logs.push({ date, workId, added: Math.max(0, delta), net: delta })
  }
  db = { ...db, logs }
}

/* ------------------------------ 作品 ------------------------------ */

export function addWork(partial: Partial<Work> = {}): Work {
  const w: Work = {
    id: uid(),
    title: partial.title || '未命名长篇',
    penName: partial.penName || '',
    genre: partial.genre || '玄幻',
    status: '构思',
    intro: '',
    platform: '',
    targetMin: 1000000,
    targetMax: 2000000,
    createdAt: now(),
    updatedAt: now(),
    ...partial,
  }
  const vol: Volume = { id: uid(), workId: w.id, title: '第一卷', order: 1 }
  const ch: Chapter = {
    id: uid(),
    workId: w.id,
    volumeId: vol.id,
    title: '第1章 ',
    order: 1,
    status: '草稿',
    content: db.settings.autoIndent ? '\u3000\u3000' : '',
    outline: '',
    createdAt: now(),
    updatedAt: now(),
  }
  setDB({
    ...db,
    works: [...db.works, w],
    volumes: [...db.volumes, vol],
    chapters: [...db.chapters, ch],
    plans: [...db.plans, emptyPlan(w.id)],
  })
  adapter.saveChapter(ch)
  return w
}

export function updateWork(id: ID, patch: Partial<Work>) {
  setDB({
    ...db,
    works: db.works.map((w) =>
      w.id === id ? { ...w, ...patch, updatedAt: now() } : w
    ),
  })
}

export function deleteWork(id: ID) {
  const chapterIds = db.chapters.filter((c) => c.workId === id).map((c) => c.id)
  chapterIds.forEach((cid) => adapter.removeChapter(cid))
  setDB({
    ...db,
    works: db.works.filter((w) => w.id !== id),
    volumes: db.volumes.filter((v) => v.workId !== id),
    chapters: db.chapters.filter((c) => c.workId !== id),
    versions: db.versions.filter((v) => !chapterIds.includes(v.chapterId)),
    foreshadows: db.foreshadows.filter((f) => f.workId !== id),
    plans: db.plans.filter((p) => p.workId !== id),
  })
}

/* ------------------------------ 卷 ------------------------------ */

export function addVolume(workId: ID, title?: string): Volume {
  const orders = db.volumes.filter((v) => v.workId === workId).map((v) => v.order)
  const vol: Volume = {
    id: uid(),
    workId,
    title: title || `第${orders.length + 1}卷`,
    order: (orders.length ? Math.max(...orders) : 0) + 1,
  }
  setDB({ ...db, volumes: [...db.volumes, vol] })
  return vol
}

export function updateVolume(id: ID, patch: Partial<Volume>) {
  setDB({ ...db, volumes: db.volumes.map((v) => (v.id === id ? { ...v, ...patch } : v)) })
}

export function deleteVolume(id: ID) {
  const chapterIds = db.chapters.filter((c) => c.volumeId === id).map((c) => c.id)
  chapterIds.forEach((cid) => adapter.removeChapter(cid))
  setDB({
    ...db,
    volumes: db.volumes.filter((v) => v.id !== id),
    chapters: db.chapters.filter((c) => c.volumeId !== id),
    versions: db.versions.filter((v) => !chapterIds.includes(v.chapterId)),
  })
}

/* ------------------------------ 章节 ------------------------------ */

export function addChapter(workId: ID, volumeId: ID | null): Chapter {
  const list = db.chapters.filter((c) => c.workId === workId)
  const order = (list.length ? Math.max(...list.map((c) => c.order)) : 0) + 1
  const ch: Chapter = {
    id: uid(),
    workId,
    volumeId,
    title: `第${order}章 `,
    order,
    status: '草稿',
    content: db.settings.autoIndent ? '\u3000\u3000' : '',
    outline: '',
    createdAt: now(),
    updatedAt: now(),
  }
  setDB({ ...db, chapters: [...db.chapters, ch] })
  adapter.saveChapter(ch)
  return ch
}

export function updateChapterMeta(id: ID, patch: Partial<Chapter>) {
  patchChapters((list) =>
    list.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: now() } : c))
  )
}

export interface SaveResult {
  delta: number
}

/**
 * 保存章节正文。自动写版本快照：
 * 距上一版 3 分钟以上、或当天还没有版本时才新建，每章最多保留 20 个（永久保留的除外）。
 */
export function saveChapterContent(id: ID, raw: string): SaveResult {
  const ch = db.chapters.find((c) => c.id === id)
  if (!ch) return { delta: 0 }
  const content = db.settings.autoIndent ? normalizeIndent(raw) : raw
  const before = countWords(ch.content)
  const after = countWords(content)
  const delta = after - before
  const updated: Chapter = { ...ch, content, updatedAt: now() }

  // 版本快照
  const mine = db.versions.filter((v) => v.chapterId === id).sort((a, b) => a.createdAt - b.createdAt)
  const last = mine[mine.length - 1]
  const needNew =
    !last ||
    (Date.now() - last.createdAt > 3 * 60 * 1000 &&
      last.content !== content) ||
    (!last.keepForever && todayKey(new Date(last.createdAt)) !== todayKey())
  let versions = db.versions
  if (after > 0 && needNew && (!last || last.content !== content)) {
    const v: ChapterVersion = {
      id: uid(),
      chapterId: id,
      content,
      wordCount: after,
      note: '',
      createdAt: now(),
      keepForever: false,
    }
    const keep = [...mine, v]
    const forever = keep.filter((x) => x.keepForever)
    const normal = keep.filter((x) => !x.keepForever)
    const trimmed = [...forever, ...normal.slice(-LIMIT_VERSIONS)]
    versions = [...db.versions.filter((x) => x.chapterId !== id), ...trimmed]
    adapter.saveVersions(id, trimmed)
  }

  db = {
    ...db,
    chapters: db.chapters.map((c) => (c.id === id ? updated : c)),
    versions,
  }
  recordLog(ch.workId, delta)
  db = {
    ...db,
    works: db.works.map((w) => (w.id === ch.workId ? { ...w, updatedAt: now() } : w)),
  }
  emit()
  persistMeta()
  adapter.saveChapter(updated)
  return { delta }
}

export function deleteChapter(id: ID) {
  adapter.removeChapter(id)
  setDB({
    ...db,
    chapters: db.chapters.filter((c) => c.id !== id),
    versions: db.versions.filter((v) => v.chapterId !== id),
  })
}

export function rollbackVersion(chapterId: ID, versionId: ID) {
  const v = db.versions.find((x) => x.id === versionId)
  if (!v) return
  saveChapterContent(chapterId, v.content)
}

export function toggleKeepForever(versionId: ID) {
  setDB({
    ...db,
    versions: db.versions.map((v) =>
      v.id === versionId ? { ...v, keepForever: !v.keepForever } : v
    ),
  })
}

/* ------------------------------ 素材 ------------------------------ */

const MATERIAL_FIELDS: Record<string, string[]> = {
  人物: ['性别', '年龄', '身份', '境界/能力', '外貌', '性格', '动机', '所属势力', '当前状态'],
  地点: ['所属区域', '类型', '距离参考', '当前状态'],
  势力: ['类型', '首领', '立场', '势力范围'],
  物品: ['类别', '外观', '功能', '当前持有者'],
  词条: ['分类', '说明'],
  桥段: ['分类', '适用阶段'],
  命名: ['类型', '寓意'],
  灵感: [],
}

export function materialFields(type: string): string[] {
  return MATERIAL_FIELDS[type] || []
}

export function addMaterial(type: Material['type'], workId: ID | null): Material {
  const m: Material = {
    id: uid(),
    workId,
    type,
    title: '',
    aliases: '',
    body: '',
    images: [],
    fields: {},
    tags: [],
    color: '',
    createdAt: now(),
    updatedAt: now(),
  }
  setDB({ ...db, materials: [...db.materials, m] })
  return m
}

export function updateMaterial(id: ID, patch: Partial<Material>) {
  setDB({
    ...db,
    materials: db.materials.map((m) =>
      m.id === id ? { ...m, ...patch, updatedAt: now() } : m
    ),
  })
}

export function deleteMaterial(id: ID) {
  setDB({ ...db, materials: db.materials.filter((m) => m.id !== id) })
}

/* ------------------------------ 伏笔 ------------------------------ */

export function addForeshadow(workId: ID, partial: Partial<Foreshadow> = {}): Foreshadow {
  const f: Foreshadow = {
    id: uid(),
    workId,
    desc: '',
    plantChapterId: null,
    planChapterId: null,
    payoffChapterId: null,
    status: '已埋未收',
    tier: '重要',
    note: '',
    createdAt: now(),
    ...partial,
  }
  setDB({ ...db, foreshadows: [...db.foreshadows, f] })
  return f
}

export function updateForeshadow(id: ID, patch: Partial<Foreshadow>) {
  setDB({
    ...db,
    foreshadows: db.foreshadows.map((f) => (f.id === id ? { ...f, ...patch } : f)),
  })
}

export function deleteForeshadow(id: ID) {
  setDB({ ...db, foreshadows: db.foreshadows.filter((f) => f.id !== id) })
}

export function autoForeshadowStatus(f: Foreshadow): Foreshadow {
  if (f.payoffChapterId) return { ...f, status: '已回收' }
  if (f.status === '已回收') return { ...f, status: '已埋未收' }
  return f
}

/* ------------------------------ 构思案 ------------------------------ */

export function emptyPlan(workId: ID): WorkPlan {
  return {
    workId,
    logline: '',
    sellingPoint: '',
    conflict: '',
    audience: '',
    tone: '',
    ending: '',
    worldview: '',
    powerSystem: '',
    notes: '',
    ideas: [],
    updatedAt: now(),
  }
}

/** 取作品构思案；尚未创建时返回一份空白结构（首次编辑才真正落库） */
export function getPlan(d: DB, workId: ID): WorkPlan {
  return d.plans.find((p) => p.workId === workId) || emptyPlan(workId)
}

export function updatePlan(workId: ID, patch: Partial<WorkPlan>) {
  const exists = db.plans.some((p) => p.workId === workId)
  const plans = exists
    ? db.plans.map((p) => (p.workId === workId ? { ...p, ...patch, updatedAt: now() } : p))
    : [...db.plans, { ...emptyPlan(workId), ...patch }]
  setDB({ ...db, plans })
}

export function addPlanCard(workId: ID, title = ''): PlanCard {
  const plan = getPlan(db, workId)
  const card: PlanCard = {
    id: uid(),
    title,
    body: '',
    adopted: false,
    order: (plan.ideas.length ? Math.max(...plan.ideas.map((c) => c.order)) : 0) + 1,
  }
  updatePlan(workId, { ideas: [...plan.ideas, card] })
  return card
}

export function updatePlanCard(workId: ID, cardId: ID, patch: Partial<PlanCard>) {
  const plan = getPlan(db, workId)
  updatePlan(workId, {
    ideas: plan.ideas.map((c) => (c.id === cardId ? { ...c, ...patch } : c)),
  })
}

export function deletePlanCard(workId: ID, cardId: ID) {
  const plan = getPlan(db, workId)
  updatePlan(workId, { ideas: plan.ideas.filter((c) => c.id !== cardId) })
}

export function movePlanCard(workId: ID, cardId: ID, dir: -1 | 1) {
  const plan = getPlan(db, workId)
  const list = [...plan.ideas].sort((a, b) => a.order - b.order)
  const i = list.findIndex((c) => c.id === cardId)
  const j = i + dir
  if (i < 0 || j < 0 || j >= list.length) return
  const t = list[i].order
  list[i] = { ...list[i], order: list[j].order }
  list[j] = { ...list[j], order: t }
  updatePlan(workId, { ideas: list })
}

export type ComposeSection = 'overview' | 'world' | 'cast' | 'docs' | 'ideas' | 'outline'

export interface ComposeTask {
  key: string
  section: ComposeSection
  label: string
  hint: string
  done: boolean
}

/**
 * 构思完成度清单。
 * 每一项都是可判定的具体条件，避免出现「感觉差不多了」这种无法确认的状态。
 */
export function composeChecklist(d: DB, workId: ID): ComposeTask[] {
  const p = getPlan(d, workId)
  const volumes = workVolumes(d, workId)
  const chapters = workChapters(d, workId)
  const people = d.materials.filter((m) => m.type === '人物' && (!m.workId || m.workId === workId))
  const others = d.materials.filter((m) => m.type !== '人物' && m.workId === workId)
  const framed = chapters.filter((c) => (c.outline || '').trim().length >= 5)

  return [
    {
      key: 'logline',
      section: 'overview',
      label: '一句话故事',
      hint: '主角是谁、要什么、被什么挡住',
      done: p.logline.trim().length >= 8,
    },
    {
      key: 'selling',
      section: 'overview',
      label: '核心卖点',
      hint: '读者为什么追这本书',
      done: p.sellingPoint.trim().length >= 4,
    },
    {
      key: 'conflict',
      section: 'overview',
      label: '核心矛盾',
      hint: '贯穿全书的那条对抗线',
      done: p.conflict.trim().length >= 4,
    },
    {
      key: 'worldview',
      section: 'world',
      label: '世界观与规则',
      hint: '时代、地理、规则、禁忌',
      done: countWords(p.worldview) >= 30,
    },
    {
      key: 'power',
      section: 'world',
      label: '力量 / 等级体系',
      hint: '升级线与战力标尺',
      done: countWords(p.powerSystem) >= 20,
    },
    {
      key: 'cast',
      section: 'cast',
      label: '主要人物',
      hint: '至少 2 张人物卡',
      done: people.length >= 2,
    },
    {
      key: 'docs',
      section: 'docs',
      label: '资料整理',
      hint: '写了资料笔记，或建了本作品的词条类素材',
      done: countWords(p.notes) >= 20 || others.length > 0,
    },
    {
      key: 'volume',
      section: 'outline',
      label: '分卷规划',
      hint: '写清第一卷要讲什么',
      done: volumes.some((v) => (v.outline || '').trim().length >= 5),
    },
    {
      key: 'outline',
      section: 'outline',
      label: '章节大纲',
      hint: '至少 3 章有一句话梗概',
      done: framed.length >= 3,
    },
    {
      key: 'ideas',
      section: 'ideas',
      label: '思路池',
      hint: '至少 3 条备选想法',
      done: p.ideas.length >= 3,
    },
  ]
}

export function composeProgress(d: DB, workId: ID): { done: number; total: number; pct: number } {
  const list = composeChecklist(d, workId)
  const done = list.filter((t) => t.done).length
  const total = list.length
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 }
}

/** 正文总字数：用于判断这部作品是「还没动笔」还是「已在写」 */
export function draftWords(d: DB, workId: ID): number {
  return workChapters(d, workId).reduce((s, c) => s + countWords(c.content), 0)
}

/* ------------------------------ 设置 ------------------------------ */

export function updateSettings(patch: Partial<Settings>) {
  setDB({ ...db, settings: { ...db.settings, ...patch } })
}

export function replaceDB(next: DB) {
  setDB({ ...emptyDB(), ...next, settings: { ...defaultSettings, ...(next.settings || {}) } })
  next.chapters?.forEach((c) => adapter.saveChapter(c))
  next.chapters?.forEach((c) => {
    const vs = (next.versions || []).filter((v) => v.chapterId === c.id)
    if (vs.length) adapter.saveVersions(c.id, vs)
  })
}

export async function wipeAll() {
  await adapter.clear()
  db = emptyDB()
  emit()
  await adapter.saveMeta(db)
}

/* ------------------------------ 派生数据 ------------------------------ */

export function workChapters(d: DB, workId: ID, sorted = true): Chapter[] {
  const list = d.chapters.filter((c) => c.workId === workId)
  return sorted ? list.sort((a, b) => a.order - b.order) : list
}

export function workVolumes(d: DB, workId: ID): Volume[] {
  return d.volumes.filter((v) => v.workId === workId).sort((a, b) => a.order - b.order)
}

export function workWordCount(chapters: Chapter[]): number {
  return chapters.reduce((s, c) => s + countWords(c.content), 0)
}

/** 存稿量：已写未发布的章节数 */
export function stockpile(chapters: Chapter[]): number {
  return chapters.filter((c) => c.status !== '已发布' && countWords(c.content) > 0).length
}

export function todayWords(d: DB, workId?: ID): number {
  const t = todayKey()
  return d.logs
    .filter((l) => l.date === t && (!workId || l.workId === workId))
    .reduce((s, l) => s + Math.max(0, l.added), 0)
}

export function streakDays(d: DB): number {
  const set = new Set(d.logs.filter((l) => l.added > 0).map((l) => l.date))
  let n = 0
  for (let i = 0; i < 400; i++) {
    if (set.has(dateKeyOffset(-i))) n++
    else if (i === 0) continue
    else break
  }
  return n
}

export function areaLogs(d: DB, days: number, workId?: ID): { date: string; added: number }[] {
  const out: { date: string; added: number }[] = []
  for (let i = days - 1; i >= 0; i--) {
    const date = dateKeyOffset(-i)
    const added = d.logs
      .filter((l) => l.date === date && (!workId || l.workId === workId))
      .reduce((s, l) => s + Math.max(0, l.added), 0)
    out.push({ date, added })
  }
  return out
}

/** 未回收伏笔（含已过章节数） */
export function openForeshadows(d: DB, workId: ID) {
  const chapters = workChapters(d, workId)
  const index = new Map(chapters.map((c, i) => [c.id, i]))
  const total = chapters.length
  return d.foreshadows
    .filter((f) => f.workId === workId && !f.payoffChapterId)
    .map((f) => {
      const plantIdx = f.plantChapterId ? index.get(f.plantChapterId) : undefined
      const passed = plantIdx === undefined ? 0 : total - 1 - plantIdx
      return { ...f, passed, overdue: passed >= 30 }
    })
    .sort((a, b) => b.passed - a.passed)
}

export function personNames(d: DB, workId: ID): string[] {
  const out: string[] = []
  d.materials
    .filter((m) => m.type === '人物' && (!m.workId || m.workId === workId))
    .forEach((m) => {
      if (m.title) out.push(m.title)
      ;(m.aliases || '')
        .split(/[,，、\s]+/)
        .filter(Boolean)
        .forEach((a) => out.push(a))
    })
  return Array.from(new Set(out))
}

export function relatedMaterials(d: DB, workId: ID, text: string, limit = 30): Material[] {
  if (!text) return []
  return d.materials
    .filter((m) => {
      if (m.workId && m.workId !== workId) return false
      if (!m.title) return false
      const names = [m.title, ...(m.aliases || '').split(/[,，、\s]+/).filter(Boolean)]
      return names.some((n) => n && text.includes(n))
    })
    .slice(0, limit)
}

export function searchAll(d: DB, q: string) {
  const kw = q.trim()
  if (!kw) return { chapters: [], materials: [], foreshadows: [] }
  const workTitle = new Map(d.works.map((w) => [w.id, w.title]))
  const chapters = d.chapters
    .filter((c) => c.content.includes(kw) || c.title.includes(kw))
    .map((c) => ({
      id: c.id,
      title: c.title,
      work: workTitle.get(c.workId) || '',
      snippet: snippet(c.content, kw),
      workId: c.workId,
    }))
    .slice(0, 50)
  const materials = d.materials
    .filter(
      (m) =>
        m.title.includes(kw) ||
        m.body.includes(kw) ||
        m.aliases.includes(kw) ||
        Object.values(m.fields || {}).some((v) => (v || '').includes(kw))
    )
    .map((m) => ({ id: m.id, type: m.type, title: m.title, snippet: snippet(m.body, kw) }))
    .slice(0, 50)
  const foreshadows = d.foreshadows
    .filter((f) => f.desc.includes(kw) || f.note.includes(kw))
    .map((f) => ({ id: f.id, desc: f.desc, status: f.status }))
    .slice(0, 50)
  return { chapters, materials, foreshadows }
}

function snippet(text: string, kw: string): string {
  const i = text.indexOf(kw)
  if (i < 0) return text.slice(0, 60)
  const s = Math.max(0, i - 24)
  return (s > 0 ? '…' : '') + text.slice(s, i + kw.length + 32).replace(/\n/g, ' ')
}

/* ------------------------------ 示例数据 ------------------------------ */

export function loadSample() {
  const wid = uid()
  const v1: Volume = {
    id: uid(),
    workId: wid,
    title: '第一卷 落霞城',
    order: 1,
    outline: '雨夜叩门起笔，一枚断字铜钱牵出沈砚父亲失踪十年的旧事，主角被迫离城北上。',
  }
  const v2: Volume = {
    id: uid(),
    workId: wid,
    title: '第二卷 北境行',
    order: 2,
    outline: '北上途中结识同行者，逐步摸到青芜关以北那条被抹掉的线索。',
  }
  const mk = (
    title: string,
    volumeId: ID,
    order: number,
    status: Chapter['status'],
    paras: string[],
    outline = ''
  ): Chapter => ({
    id: uid(),
    workId: wid,
    volumeId,
    title,
    order,
    status,
    content: paras.map((p) => '\u3000\u3000' + p).join('\n'),
    outline,
    createdAt: now(),
    updatedAt: now(),
  })
  const chapters: Chapter[] = [
    mk(
      '第1章 雨夜叩门',
      v1.id,
      1,
      '已发布',
      [
        '雨下了三天。',
        '沈砚把最后一盏灯吹灭的时候，门被人叩响了。三声，不轻不重，像是怕惊动了谁。',
        '他没有立刻去开。落霞城的规矩，雨夜里敲门的，多半不是人。',
      ],
      '雨夜有人叩门，沈砚没有立刻开——先把落霞城的规矩和主角的谨慎立起来。'
    ),
    mk(
      '第2章 一枚旧钱',
      v1.id,
      2,
      '已发布',
      [
        '来人穿着蓑衣，帽檐压得很低。',
        '他从怀里摸出一枚铜钱，放在桌上，推过来。铜钱的一面已经磨平了，另一面刻着一个"砚"字。',
        '沈砚盯着那枚钱看了很久，久到雨声都变得清晰起来。',
      ],
      '来人送上断字铜钱，核心悬念落地：磨掉字的人是谁，父亲还活着吗。'
    ),
    mk(
      '第3章 北去的路',
      v2.id,
      3,
      '草稿',
      [
        '天亮的时候雨停了。',
        '沈砚把书案上的东西一样样收进箱子里，最后剩下那枚铜钱，他攥在手心，攥得发烫。',
      ],
      '主角收拾行装北上，交代他与落霞城的牵绊，给第二卷开个头。'
    ),
  ]
  const materials: Material[] = [
    {
      id: uid(),
      workId: wid,
      type: '人物',
      title: '沈砚',
      aliases: '小砚,砚哥',
      images: [],
      body: `# 基本信息
性别：男
年龄：二十一
出生地：落霞城
身份：旧书铺掌柜

# 外貌与风格
外貌：身形偏瘦，眼下有青，常年一身洗旧的靛青长衫
穿着：朴素，袖口磨出了毛边
显著特征：右手虎口有一道旧疤，翻书时习惯用指腹压页角

# 性格与情感
性格：沉静、记仇、不轻信
情感特征：看着冷淡，但对旧物与旧人极重情
弱点：不肯欠人情，因而常常硬撑

# 动机与目标
动机：父亲失踪十年，只留下一枚断字铜钱
短期目标：弄清这枚钱是哪一年铸的
长期目标：找到磨掉铜钱上那个字的人

# 能力
境界/能力：凡人（尚未引气）
技能：过目不忘，辨识旧书与旧拓片

# 人际关系
家人：父亲（失踪十年）
朋友：柳七（存疑）
敌人：未知

# 现状
当前状态：准备北上`,
      fields: {
        性别: '男',
        年龄: '二十一',
        '境界/能力': '凡人（尚未引气）',
        性格: '沉静、记仇',
        所属势力: '无',
        当前状态: '准备北上',
      },
      tags: ['主角'],
      color: '',
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: uid(),
      workId: wid,
      type: '人物',
      title: '柳七',
      aliases: '',
      images: [],
      body: `# 基本信息
性别：男
年龄：三十上下
身份：自称行商

# 外貌与风格
外貌：蓑衣是新的，鞋底却沾着干泥
穿着：帽檐压得很低，看不到眼睛

# 性格与情感
性格：油滑、话密
弱点：越到关键处越不肯把话说全

# 动机
动机：不明。每一次帮沈砚，都像在替自己做铺垫

# 现状
当前状态：与主角同行`,
      fields: { 性别: '男', 年龄: '三十上下', 性格: '油滑', 当前状态: '与主角同行' },
      tags: ['配角'],
      color: '',
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: uid(),
      workId: wid,
      type: '地点',
      title: '落霞城',
      aliases: '',
      images: [],
      body: `# 基本信息
所属区域：北境
类型：边城
规模：三街九巷，常住不过两千户

# 地理
地形：夹在两山之间，唯一的平地给了官道
气候：入秋即冷，一年有半年刮北风
距离参考：距青芜关 三百里，快马两日

# 势力与人口
管辖势力：青芜关守军代管
主要居民：旧书商、皮货行、往来镖队

# 规矩
雨夜不开门：雨夜里敲门的，多半不是人
杀人案不过三日：三日不破，卷宗封存

# 现状
当前状态：表面太平，暗里在清人`,
      fields: { 所属区域: '北境', 类型: '边城', 距离参考: '距青芜关 三百里' },
      tags: [],
      color: '',
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: uid(),
      workId: wid,
      type: '势力',
      title: '青芜关守军',
      aliases: '',
      images: [],
      body: `# 基本信息
类型：军方
首领：关将 陆嵩
成立时间：不详，至少三代人

# 立场
立场：中立偏保守
势力范围：青芜关南北各百里

# 组织
层级结构：关将 → 五营都尉 → 什长
核心成员：陆嵩（关将）
标志：黑底白字旗，写一个「芜」字

# 现状
当前状态：收紧了北上路引的发放`,
      fields: { 类型: '军方', 首领: '关将 陆嵩', 立场: '中立偏保守' },
      tags: [],
      color: '',
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: uid(),
      workId: wid,
      type: '词条',
      title: '引气',
      aliases: '',
      images: [],
      body: `# 基本信息
分类：境界

# 说明
说明：凡人纳天地之气入体，气成之后可耐寒、可长力，但耗气则伤身
门槛：需在极寒处静坐七日，十人中不过一二人能成

# 关联
关联设定：御风（第四境）——引气之后路子还长`,
      fields: { 分类: '境界', 说明: '凡人若未引气，不可久御风' },
      tags: ['境界'],
      color: '',
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: uid(),
      workId: null,
      type: '灵感',
      title: '铜钱上的字是被谁磨掉的',
      aliases: '',
      images: [],
      body: '磨掉字的人，就是不想让沈砚找到父亲。',
      fields: {},
      tags: [],
      color: '',
      createdAt: now(),
      updatedAt: now(),
    },
  ]
  const foreshadows: Foreshadow[] = [
    {
      id: uid(),
      workId: wid,
      desc: '断字铜钱：另一面刻着"砚"，被谁磨平的',
      plantChapterId: chapters[1].id,
      planChapterId: chapters[2].id,
      payoffChapterId: null,
      status: '已埋未收',
      tier: '核心',
      note: '与主角父亲失踪线相关',
      createdAt: now(),
    },
    {
      id: uid(),
      workId: wid,
      desc: '柳七的蓑衣是新的，但鞋底沾着干泥——他走的是陆路，不是水路',
      plantChapterId: chapters[1].id,
      planChapterId: null,
      payoffChapterId: null,
      status: '已埋未收',
      tier: '重要',
      note: '',
      createdAt: now(),
    },
  ]
  const logs: WritingLog[] = []
  for (let i = 0; i < 9; i++) {
    const base = i === 4 ? 0 : 3200 + Math.round(Math.random() * 2200)
    logs.push({
      date: dateKeyOffset(-i),
      workId: wid,
      added: base,
      net: base,
    })
  }
  const plan: WorkPlan = {
    workId: wid,
    logline: '一个守着旧书铺的年轻人，为查父亲失踪的真相，带着一枚被磨去字的铜钱一路北上。',
    sellingPoint: '小人物查大案 + 边城冷硬氛围 + 每卷解开一个字。',
    conflict: '沈砚想知道真相，而当年抹掉线索的那批人，仍然在位。',
    audience: '喜欢冷硬悬疑与北境玄幻的男频读者',
    tone: '克制、阴冷、留白多，少用感叹句',
    ending: '铜钱上被磨掉的字是父亲自己刻的，也是他自己磨的。',
    worldview:
      '北境以落霞城为界，往北是关外荒原。修行分引气、通脉、铸骨、御风四境，境界越高越怕冷，所以北境高手多聚于关内。地方上通行铜钱，铜钱上的字由官铸局刻，私刻者以叛论。',
    powerSystem:
      '引气：纳气入体，可耐寒。通脉：气走十二脉，能隔空取物。铸骨：骨如金石，可硬撼兵刃。御风：踏空而行，惧强光。越境者十不存一，且无法在关外久留。',
    notes:
      '参考资料：北地边城志（卷三）、旧铜钱拓片若干。需要确认的点：官铸局的年份记号，用来给主角提供"这枚钱是哪年铸的"的推理入口。',
    ideas: [
      {
        id: uid(),
        title: '开篇不写身世，先写规矩',
        body: '用落霞城"雨夜不开门"的规矩替代背景交代，读者先记住氛围，再慢慢补信息。',
        adopted: true,
        order: 1,
      },
      {
        id: uid(),
        title: '铜钱上的字分四次给出',
        body: '每卷给出半个字，四卷拼完，读者自己拼出那句话。',
        adopted: true,
        order: 2,
      },
      {
        id: uid(),
        title: '柳七的立场要一直悬着',
        body: '同行但不交心，每次他帮主角都在为自己做铺垫。',
        adopted: false,
        order: 3,
      },
    ],
    updatedAt: now(),
  }

  const work: Work = {
    id: wid,
    title: '示例·北境旧事',
    penName: '示例笔名',
    genre: '玄幻',
    status: '连载',
    intro: '一枚断字铜钱引出的北境旧事。这是示例作品，可随时删除。',
    platform: '',
    targetMin: 1000000,
    targetMax: 2000000,
    createdAt: now(),
    updatedAt: now(),
  }
  setDB({
    ...db,
    works: [...db.works, work],
    volumes: [...db.volumes, v1, v2],
    chapters: [...db.chapters, ...chapters],
    materials: [...db.materials, ...materials],
    foreshadows: [...db.foreshadows, ...foreshadows],
    logs: [...db.logs, ...logs],
    plans: [...db.plans, plan],
  })
  chapters.forEach((c) => adapter.saveChapter(c))
  return wid
}
