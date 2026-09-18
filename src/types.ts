export type ID = string

export type WorkStatus = '构思' | '连载' | '完结' | '搁置'
export type ChapterStatus = '草稿' | '待修' | '已定稿' | '已发布'

export type MaterialType =
  | '人物'
  | '地点'
  | '势力'
  | '物品'
  | '词条'
  | '桥段'
  | '命名'
  | '灵感'

export type ForeshadowStatus = '已埋未收' | '部分回收' | '已回收' | '逾期'
export type ForeshadowTier = '核心' | '重要' | '一般'

export interface Work {
  id: ID
  title: string
  penName: string
  genre: string
  status: WorkStatus
  intro: string
  platform: string
  targetMin: number
  targetMax: number
  createdAt: number
  updatedAt: number
}

export interface Volume {
  id: ID
  workId: ID
  title: string
  order: number
  /** 卷梗概：这一卷要讲什么，构思阶段填写 */
  outline?: string
}

/** 思路池里的一条备选想法 */
export interface PlanCard {
  id: ID
  title: string
  body: string
  /** 是否已被大纲采用 */
  adopted: boolean
  order: number
}

/**
 * 作品构思案。与正文、素材、伏笔分开存放：
 * 这里是「写之前想清楚」的部分，不参与字数统计，也不生成版本快照。
 */
export interface WorkPlan {
  workId: ID
  /** 一句话故事 */
  logline: string
  /** 核心卖点 */
  sellingPoint: string
  /** 核心矛盾 */
  conflict: string
  /** 目标读者 */
  audience: string
  /** 风格基调 */
  tone: string
  /** 预定结局 */
  ending: string
  /** 世界观与规则 */
  worldview: string
  /** 力量 / 等级体系 */
  powerSystem: string
  /** 资料笔记 */
  notes: string
  /** 思路池 */
  ideas: PlanCard[]
  updatedAt: number
}

export interface Chapter {
  id: ID
  workId: ID
  volumeId: ID | null
  title: string
  order: number
  status: ChapterStatus
  content: string
  outline: string
  createdAt: number
  updatedAt: number
}

export interface ChapterVersion {
  id: ID
  chapterId: ID
  content: string
  wordCount: number
  note: string
  createdAt: number
  keepForever: boolean
}

export interface Material {
  id: ID
  workId: ID | null
  type: MaterialType
  title: string
  aliases: string
  /** 卡片正文：一段自由文本，预览时按轻量写法解析成小节 */
  body: string
  /** 图片附件 id 列表（实际图片存在 IndexedDB，见 src/files.ts），第一张作封面 */
  images?: string[]
  fields: Record<string, string>
  tags: string[]
  color: string
  createdAt: number
  updatedAt: number
}

export interface Foreshadow {
  id: ID
  workId: ID
  desc: string
  plantChapterId: ID | null
  planChapterId: ID | null
  payoffChapterId: ID | null
  status: ForeshadowStatus
  tier: ForeshadowTier
  note: string
  createdAt: number
}

export interface WritingLog {
  date: string
  workId: ID
  added: number
  net: number
}

export interface Settings {
  theme: 'light' | 'dark' | 'amber' | 'green'
  fontFamily: string
  fontSize: number
  lineHeight: number
  pageWidth: number
  autoIndent: boolean
  highlightNames: boolean
  forbiddenCheck: boolean
  typewriter: boolean
  focusParagraph: boolean
  showWordProgress: boolean
  showSpeed: boolean
  forbiddenWords: string[]
  dailyGoal: number
  chapterGoal: number
}

export interface DB {
  version: number
  works: Work[]
  volumes: Volume[]
  chapters: Chapter[]
  versions: ChapterVersion[]
  materials: Material[]
  foreshadows: Foreshadow[]
  logs: WritingLog[]
  plans: WorkPlan[]
  settings: Settings
}
