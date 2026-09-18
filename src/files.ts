import { uid } from './lib'

/**
 * 图片附件存储。
 *
 * 存在 IndexedDB 而不是 localStorage：
 * localStorage 单键只有 5MB 且写入是同步整串覆盖，把参考图塞进去会很快撑爆配额，
 * 也会让每次自动保存都变慢。图片走 IndexedDB，卡片里只留一个 id。
 *
 * 接入云服务后：IndexedDB 继续作本地高速缓存，云端对象存储作多机同步的备份层——
 * 上传时后台同步到云端；本地缺失时按需从云端拉回并缓存。这些由 cloudStore 注入钩子实现。
 */

const DB_NAME = 'novel-studio-files'
const STORE = 'images'

export interface StoredImage {
  id: string
  blob: Blob
  name: string
  width: number
  height: number
  size: number
  createdAt: number
}

/** 云端图片钩子：由 cloudStore 在登录成功后注入；未注入（本地模式）时完全不走云端 */
interface ImageCloudHook {
  /** 后台上传（fire-and-forget，内部自行消化错误） */
  put(rec: StoredImage): void
  /** 本地缺失时尝试从云端下载，拿不到返回 null */
  get(id: string): Promise<Blob | null>
}
let cloudHook: ImageCloudHook | null = null
export function setImageCloudHook(h: ImageCloudHook | null) {
  cloudHook = h
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const d = req.result
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const t = d.transaction(STORE, mode)
        const req = fn(t.objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
        t.oncomplete = () => d.close()
      })
  )
}

/** 把上传的图片压到最长边 1600px 再存，避免几十 MB 的相机原图直接进库 */
async function shrink(file: File, maxSide = 1600): Promise<{ blob: Blob; width: number; height: number }> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()
    const blob: Blob = await new Promise((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/jpeg', 0.86)
    )
    return { blob, width: w, height: h }
  } catch {
    // 浏览器解不了（极少数格式）就原样存
    return { blob: file, width: 0, height: 0 }
  }
}

export async function putImage(file: File): Promise<StoredImage> {
  const { blob, width, height } = await shrink(file)
  const rec: StoredImage = {
    id: uid(),
    blob,
    name: file.name || 'image',
    width,
    height,
    size: blob.size,
    createdAt: Date.now(),
  }
  await tx('readwrite', (s) => s.put(rec))
  cloudHook?.put(rec)
  return rec
}

/** 导入备份时用：把 dataURL 还原成附件；传入 id 可保留原引用（卡片里的 images 数组不用改） */
export async function putImageFromDataURL(dataURL: string, name = 'image', id?: string): Promise<string> {
  const res = await fetch(dataURL)
  const blob = await res.blob()
  const rec: StoredImage = {
    id: id || uid(),
    blob,
    name,
    width: 0,
    height: 0,
    size: blob.size,
    createdAt: Date.now(),
  }
  await tx('readwrite', (s) => s.put(rec))
  return rec.id
}

export async function getImage(id: string): Promise<StoredImage | null> {
  try {
    const r = await tx<StoredImage | undefined>('readonly', (s) => s.get(id))
    return r || null
  } catch {
    return null
  }
}

export async function getImageDataURL(id: string): Promise<string | null> {
  const rec = await getImage(id)
  if (!rec) return null
  return new Promise((resolve) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = () => resolve(null)
    fr.readAsDataURL(rec.blob)
  })
}

export async function deleteImage(id: string): Promise<void> {
  urlCache.delete(id)
  await tx('readwrite', (s) => s.delete(id))
}

export async function clearImages(): Promise<void> {
  urlCache.forEach((u) => URL.revokeObjectURL(u))
  urlCache.clear()
  await tx('readwrite', (s) => s.clear())
}

export async function countImages(): Promise<number> {
  try {
    return await tx<number>('readonly', (s) => s.count())
  } catch {
    return 0
  }
}

/* ------------------------------ 显示用 objectURL 缓存 ------------------------------ */

const urlCache = new Map<string, string>()
const pending = new Map<string, Promise<string | null>>()

/** 取显示用的 objectURL；同一张图只读一次 IndexedDB，本地缺失时按需从云端拉回并缓存 */
export function resolveImageURL(id: string): Promise<string | null> {
  const hit = urlCache.get(id)
  if (hit) return Promise.resolve(hit)
  const p = pending.get(id)
  if (p) return p
  const job = getImageOrCloud(id).then((rec) => {
    pending.delete(id)
    if (!rec) return null
    const url = URL.createObjectURL(rec.blob)
    urlCache.set(id, url)
    return url
  })
  pending.set(id, job)
  return job
}

async function getImageOrCloud(id: string): Promise<StoredImage | null> {
  const rec = await getImage(id)
  if (rec) return rec
  if (!cloudHook) return null
  const blob = await cloudHook.get(id).catch(() => null)
  if (!blob) return null
  const pulled: StoredImage = {
    id,
    blob,
    name: id,
    width: 0,
    height: 0,
    size: blob.size,
    createdAt: Date.now(),
  }
  try {
    await tx('readwrite', (s) => s.put(pulled))
  } catch {
    /* 缓存失败不碍事，本次直接用 blob */
  }
  return pulled
}
