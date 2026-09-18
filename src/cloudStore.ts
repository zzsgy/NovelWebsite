import { useSyncExternalStore } from 'react'
import { cloud } from './cloud'
import {
  emptyDB,
  defaultSettings,
  localAdapter,
  packMeta,
  setAdapterImpl,
  type StorageAdapter,
} from './store'
import { setImageCloudHook, getImage, type StoredImage } from './files'
import type { Chapter, ChapterVersion, DB, ID } from './types'

/**
 * 云端同步层。
 *
 * 数据模型：一张 app_docs 文档表（owner_id + doc_key + value），
 * 与本地 LocalAdapter 的分键方式一一对应——
 *   meta         → 元数据包（作品/卷/素材/伏笔/日志/构思案/设置 + 章节索引）
 *   ch:<章节id>  → 单章正文
 *   ver:<章节id> → 单章版本快照列表
 * 写操作双写：先落本地（断网兜底），再写云端；读操作以云端为准。
 * 图片走对象存储：上传时后台同步，本地缺失时按需拉回（见 files.ts 钩子）。
 *
 * 单账号场景，冲突策略为「按文档粒度最后写入生效」。
 */

/* ------------------------------ 同步状态（界面可见） ------------------------------ */

export interface CloudStatus {
  /** off=未启用云服务 / syncing=正在写入 / ok=最近写入成功 / error=最近写入失败（本地已保存） */
  state: 'off' | 'syncing' | 'ok' | 'error'
  at: number
  message?: string
  user?: { id: string; email?: string }
}

let cloudStatus: CloudStatus = { state: 'off', at: 0 }
const statusListeners = new Set<() => void>()

function setStatus(patch: Partial<CloudStatus>) {
  cloudStatus = { ...cloudStatus, ...patch, at: Date.now() }
  statusListeners.forEach((f) => f())
}

export function getCloudStatus(): CloudStatus {
  return cloudStatus
}
export function subscribeCloud(fn: () => void): () => void {
  statusListeners.add(fn)
  return () => statusListeners.delete(fn)
}
export function useCloudStatus(): CloudStatus {
  return useSyncExternalStore(subscribeCloud, getCloudStatus, getCloudStatus)
}

/* ------------------------------ 云端适配器 ------------------------------ */

const T = 'app_docs'

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e ?? '未知错误')
}

class CloudAdapter implements StorageAdapter {
  name = 'cloud'
  label = '云端同步'
  private local = localAdapter

  constructor(private uid: string) {}

  async load(): Promise<DB | null> {
    let remote: DB | null = null
    try {
      remote = await this.loadRemote()
    } catch (e) {
      // 网络异常 / 服务异常：回退本地缓存，状态标记为失败，不阻塞写作
      setStatus({ state: 'error', message: '云端读取失败，已改用本机缓存：' + msg(e) })
      return this.local.load()
    }
    if (remote) {
      // 以云端为准，同时刷新本地缓存；后台把本地图片同步到云端（首次迁移用）
      void this.local.saveMeta(remote).catch(() => {})
      remote.chapters.forEach((ch) => void this.local.saveChapter(ch).catch(() => {}))
      setStatus({ state: 'ok' })
      void this.syncLocalImagesToCloud(remote)
      return remote
    }
    // 云端为空：本机有数据则做一次整体迁移上传
    const local = await this.local.load()
    if (local && (local.works.length > 0 || local.chapters.length > 0 || local.materials.length > 0)) {
      try {
        await this.pushAll(local)
        setStatus({ state: 'ok', message: '已把本机数据迁移到云端' })
      } catch (e) {
        setStatus({ state: 'error', message: '迁移到云端失败，数据仍保存在本机：' + msg(e) })
      }
      void this.syncLocalImagesToCloud(local)
      return local
    }
    return null
  }

  private async loadRemote(): Promise<DB | null> {
    const { data, error } = await cloud.database.from(T).select('doc_key, value')
    if (error) throw new Error((error as { message?: string }).message || '云端查询失败')
    const rows = (data || []) as { doc_key: string; value: unknown }[]
    if (rows.length === 0) return null
    const metaRow = rows.find((r) => r.doc_key === 'meta')
    if (!metaRow || !metaRow.value) return null
    const meta = metaRow.value as ReturnType<typeof packMeta>
    const db: DB = {
      ...emptyDB(),
      ...meta,
      settings: { ...defaultSettings, ...(meta.settings || {}) },
    } as DB
    db.chapters = (meta.chapterIndex || []).map((c: Chapter) => {
      const row = rows.find((r) => r.doc_key === 'ch:' + c.id)
      const v = row?.value as { content?: string } | undefined
      return { ...c, content: v?.content || '' }
    })
    db.versions = (meta.chapterIndex || []).flatMap((c: Chapter) => {
      const row = rows.find((r) => r.doc_key === 'ver:' + c.id)
      const v = row?.value as { versions?: ChapterVersion[] } | undefined
      return v?.versions || []
    })
    return db
  }

  /** 整体迁移：把一整份 DB 推上云端 */
  private async pushAll(db: DB): Promise<void> {
    await this.upsertDoc('meta', packMeta(db))
    for (const ch of db.chapters) {
      await this.upsertDoc('ch:' + ch.id, { content: ch.content || '' })
    }
    const byChapter = new Map<ID, ChapterVersion[]>()
    db.versions.forEach((v) => {
      const list = byChapter.get(v.chapterId) || []
      list.push(v)
      byChapter.set(v.chapterId, list)
    })
    for (const [cid, list] of byChapter) {
      await this.upsertDoc('ver:' + cid, { versions: list })
    }
  }

  private async upsertDoc(docKey: string, value: unknown): Promise<void> {
    const { error } = await cloud.database
      .from(T)
      .upsert({ doc_key: docKey, value } as never, { onConflict: 'owner_id,doc_key' })
    if (error) throw new Error((error as { message?: string }).message || '云端写入失败')
  }

  /** 双写：本地立即落盘（兜底），云端写失败只标记状态不抛错 */
  private async dual(label: string, job: () => Promise<void>, localJob: () => Promise<unknown>) {
    try {
      await localJob()
    } catch {
      /* 本地兜底失败也不阻塞 */
    }
    setStatus({ state: 'syncing' })
    try {
      await job()
      setStatus({ state: 'ok' })
    } catch (e) {
      setStatus({ state: 'error', message: label + '云端同步失败，已保存在本机：' + msg(e) })
    }
  }

  async saveMeta(db: DB): Promise<void> {
    await this.dual('', () => this.upsertDoc('meta', packMeta(db)), () => this.local.saveMeta(db))
  }

  async saveChapter(ch: Chapter): Promise<void> {
    await this.dual(
      '章节',
      () => this.upsertDoc('ch:' + ch.id, { content: ch.content || '' }),
      () => this.local.saveChapter(ch)
    )
  }

  async saveVersions(chapterId: ID, list: ChapterVersion[]): Promise<void> {
    await this.dual(
      '版本快照',
      () => this.upsertDoc('ver:' + chapterId, { versions: list }),
      () => this.local.saveVersions(chapterId, list)
    )
  }

  async removeChapter(chapterId: ID): Promise<void> {
    await this.dual(
      '章节删除',
      async () => {
        const { error } = await cloud.database
          .from(T)
          .delete()
          .in('doc_key', ['ch:' + chapterId, 'ver:' + chapterId])
        if (error) throw new Error((error as { message?: string }).message || '云端删除失败')
      },
      () => this.local.removeChapter(chapterId)
    )
  }

  async clear(): Promise<void> {
    await this.local.clear().catch(() => {})
    const { error } = await cloud.database.from(T).delete().gte('id', 0)
    if (error) {
      setStatus({ state: 'error', message: '云端清空失败：' + msg(error) })
      return
    }
    setStatus({ state: 'ok' })
  }

  /* ------------------------------ 图片迁移 ------------------------------ */

  private imagePath(id: string): string {
    return cloud.storage.userPath(this.uid, `images/${id}.jpg`)
  }

  /** 把本机 IndexedDB 里的图片逐张推上云端（幂等：upsert 覆盖同名） */
  private async syncLocalImagesToCloud(db: DB): Promise<void> {
    const ids = [...new Set(db.materials.flatMap((m) => m.images || []))]
    for (const id of ids) {
      try {
        const rec = await getImage(id)
        if (rec) {
          await cloud.storage.upload(this.imagePath(id), rec.blob, {
            contentType: 'image/jpeg',
            upsert: true,
          })
        }
      } catch {
        /* 单张失败不阻塞其余，等下次启动重试 */
      }
    }
  }

  /** 注入到 files.ts 的云端图片钩子 */
  imageHook() {
    return {
      put: (rec: StoredImage) => {
        cloud.storage
          .upload(this.imagePath(rec.id), rec.blob, { contentType: 'image/jpeg', upsert: true })
          .catch(() => {
            /* 后台失败静默，resolveImageURL 会按需重试 */
          })
      },
      get: async (id: string): Promise<Blob | null> => {
        try {
          const r = (await cloud.storage.download(this.imagePath(id))) as
            | { data?: Blob; error?: unknown }
            | Blob
          if (r instanceof Blob) return r
          if (r && typeof r === 'object' && 'data' in r && r.data instanceof Blob) return r.data
          return null
        } catch {
          return null
        }
      },
    }
  }
}

/* ------------------------------ 启动入口 ------------------------------ */

let current: CloudAdapter | null = null

/**
 * 登录态检查 + 云端适配器安装。
 * 返回 ready=已就绪（可直接 hydrate）；no-session=需要登录；off=当前环境未启用云服务。
 */
export async function startCloud(): Promise<'ready' | 'no-session' | 'off'> {
  const { data: session, error } = await cloud.auth.getSession()
  if (error || !session) return 'no-session'
  const ad = new CloudAdapter(session.user.id)
  current = ad
  setImageCloudHook(ad.imageHook())
  setAdapterImpl(ad)
  setStatus({ state: 'ok', user: { id: session.user.id, email: session.user.email } })
  return 'ready'
}

/** 退出登录并回到本地模式（随后由调用方刷新页面） */
export async function stopCloud(): Promise<void> {
  current = null
  setImageCloudHook(null)
  setAdapterImpl(localAdapter)
  setStatus({ state: 'off' })
  await cloud.auth.signOut()
}
