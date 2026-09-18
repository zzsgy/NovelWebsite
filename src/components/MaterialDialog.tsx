import { useEffect, useRef, useState } from 'react'
import { deleteMaterial, updateMaterial, useDB } from '../store'
import { CARD_SYNTAX_HELP, CARD_TEMPLATES } from '../card'
import { deleteImage, putImage, resolveImageURL } from '../files'
import { countWords } from '../lib'
import type { Material, MaterialType } from '../types'
import { MaterialPreview } from './MaterialPreview'

const TYPES: MaterialType[] = ['人物', '地点', '势力', '物品', '词条', '桥段', '命名', '灵感']

/**
 * 素材卡编辑器：居中的弹窗，只做输入，不做预览。
 * 卡片没有固定字段框——正文就是一段自由文本，图片拖进来即可，第一张自动作封面。
 */
export function MaterialEditor({
  item,
  onClose,
  isNew,
}: {
  item: Material
  onClose: () => void
  isNew?: boolean
}) {
  const db = useDB()
  const [m, setM] = useState<Material>(item)
  const [uploading, setUploading] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [dragging, setDragging] = useState(false)

  // 本次新加进来但还没保存的图片，取消时要删掉，别留下垃圾
  const added = useRef<string[]>([])
  const imgInput = useRef<HTMLInputElement>(null)
  const txtInput = useRef<HTMLInputElement>(null)

  const set = (patch: Partial<Material>) => setM((prev) => ({ ...prev, ...patch }))
  const images = m.images || []

  const save = () => {
    updateMaterial(item.id, m)
    added.current = []
    onClose()
  }

  const cancel = () => {
    added.current.forEach((id) => deleteImage(id))
    onClose()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel()
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  })

  const addFiles = async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith('image/'))
    if (!imgs.length) return
    setUploading(true)
    const ids: string[] = []
    for (const f of imgs) {
      const rec = await putImage(f)
      ids.push(rec.id)
    }
    added.current.push(...ids)
    set({ images: [...images, ...ids] })
    setUploading(false)
  }

  const removeImage = (id: string) => {
    set({ images: images.filter((x) => x !== id) })
    if (added.current.includes(id)) {
      added.current = added.current.filter((x) => x !== id)
      deleteImage(id)
    }
  }

  return (
    <div className="mask center" onClick={cancel}>
      <div
        className="dialog editor-dialog"
        onClick={(e) => e.stopPropagation()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          addFiles(Array.from(e.dataTransfer.files || []))
        }}
        onPaste={(e) => {
          const files = Array.from(e.clipboardData?.files || [])
          if (files.some((f) => f.type.startsWith('image/'))) {
            e.preventDefault()
            addFiles(files)
          }
        }}
      >
        <div className="dialog-head">
          <b>{isNew ? `新建${m.type}卡` : `编辑${m.type}卡`}</b>
          <span className="muted">想到什么写什么，格式都不用管</span>
          <div className="spacer" />
          <button className="dialog-x" onClick={cancel} title="关闭">✕</button>
        </div>

        <div className="dialog-body">
          <div className="row">
            <div className="field" style={{ flex: '0 0 130px' }}>
              <label>类型</label>
              <select
                className="select"
                value={m.type}
                onChange={(e) => set({ type: e.target.value as MaterialType })}
              >
                {TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>名称</label>
              <input
                className="input"
                autoFocus
                value={m.title}
                placeholder="这个人物 / 地点叫什么"
                onChange={(e) => set({ title: e.target.value })}
              />
            </div>
            <div className="field">
              <label>别名（逗号分隔）</label>
              <input
                className="input"
                value={m.aliases}
                placeholder="正文里出现别名也会被识别"
                onChange={(e) => set({ aliases: e.target.value })}
              />
            </div>
          </div>

          <div className="field">
            <div className="field-head">
              <label>图片</label>
              <span className="muted" style={{ fontSize: 11.5 }}>第一张自动作封面 · 可直接拖进来或 Ctrl+V 粘贴</span>
            </div>
            {images.length === 0 ? (
              <div
                className={'img-drop' + (dragging ? ' dragging' : '')}
                onClick={() => imgInput.current?.click()}
              >
                <b>{uploading ? '处理中…' : '拖入图片，或点击上传'}</b>
                <span>人物立绘、参考图、截图都可以，第一张会自动作为封面</span>
              </div>
            ) : (
              <div className={'imgs' + (dragging ? ' dragging' : '')}>
                {images.map((id, i) => (
                  <div className="img-item" key={id}>
                    <Thumb id={id} />
                    {i === 0 && <span className="img-tag">封面</span>}
                    <div className="img-ops">
                      {i !== 0 && (
                        <button
                          className="btn ghost sm"
                          onClick={() => set({ images: [id, ...images.filter((x) => x !== id)] })}
                        >
                          设封面
                        </button>
                      )}
                      <button className="btn ghost sm" onClick={() => removeImage(id)}>×</button>
                    </div>
                  </div>
                ))}
                <button className="img-add" onClick={() => imgInput.current?.click()} disabled={uploading}>
                  {uploading ? '处理中…' : '＋ 上传图片'}
                </button>
              </div>
            )}
            <input
              ref={imgInput}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                addFiles(Array.from(e.target.files || []))
                e.target.value = ''
              }}
            />
          </div>

          <div className="field">
            <div className="field-head">
              <label>卡片正文</label>
              <div className="spacer" />
              <button className="btn ghost sm" onClick={() => txtInput.current?.click()}>导入 txt / md</button>
              <button
                className="btn ghost sm"
                onClick={() => {
                  const tpl = CARD_TEMPLATES[m.type] || ''
                  if (!m.body.trim() || confirm('正文已有内容，用模板替换？')) set({ body: tpl })
                }}
              >
                插入{m.type}模板
              </button>
            </div>
            <textarea
              className="textarea card-body"
              rows={10}
              value={m.body}
              placeholder={'想到什么写什么，不用管格式。\n\n' + CARD_SYNTAX_HELP.map((h) => '· ' + h).join('\n')}
              onChange={(e) => set({ body: e.target.value })}
            />
            <input
              ref={txtInput}
              type="file"
              accept=".txt,.md,.markdown,text/plain"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (f) {
                  const text = await f.text()
                  set({ body: (m.body ? m.body.replace(/\s+$/, '') + '\n\n' : '') + text.trim() })
                }
                e.target.value = ''
              }}
            />
          </div>

          <div className="row">
            <div className="field">
              <label>标签（人物卡第一位填「主角 / 配角 / 反派」会自动分组）</label>
              <input
                className="input"
                value={m.tags.join(',')}
                onChange={(e) =>
                  set({ tags: e.target.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean) })
                }
              />
            </div>
            <div className="field">
              <label>归属</label>
              <select
                className="select"
                value={m.workId || ''}
                onChange={(e) => set({ workId: e.target.value || null })}
              >
                <option value="">全局（所有作品可见）</option>
                {db.works.map((w) => (
                  <option key={w.id} value={w.id}>{w.title}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="dialog-foot">
          {confirmDel ? (
            <>
              <span className="muted" style={{ fontSize: 12.5, marginRight: 'auto' }}>确认删除这张卡？</span>
              <button className="btn" onClick={() => setConfirmDel(false)}>取消</button>
              <button
                className="btn warn"
                onClick={() => {
                  images.forEach((id) => deleteImage(id))
                  deleteMaterial(item.id)
                  added.current = []
                  onClose()
                }}
              >
                确认删除
              </button>
            </>
          ) : (
            <>
              {!isNew && (
                <button className="btn ghost warn" onClick={() => setConfirmDel(true)}>删除</button>
              )}
              <div className="spacer" />
              <span className="muted" style={{ fontSize: 11.5, marginRight: 4 }}>{countWords(m.body)} 字</span>
              <button className="btn" onClick={cancel}>取消</button>
              <button className="btn primary" onClick={save}>保存</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** 卡片预览：居中大弹窗，从列表里点卡片进来 */
export function MaterialViewer({
  item,
  onClose,
  appearances,
  onEdit,
}: {
  item: Material
  onClose: () => void
  appearances?: number
  onEdit: () => void
}) {
  const [confirmDel, setConfirmDel] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="mask center" onClick={onClose}>
      <div className="dialog viewer-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <span className="chip plain">{item.type}</span>
          <b>{item.title || '未命名'}</b>
          <div className="spacer" />
          {confirmDel ? (
            <>
              <span className="muted" style={{ fontSize: 12.5 }}>确认删除这张卡？</span>
              <button className="btn sm" onClick={() => setConfirmDel(false)}>取消</button>
              <button
                className="btn warn sm"
                onClick={() => {
                  ;(item.images || []).forEach((id) => deleteImage(id))
                  deleteMaterial(item.id)
                  onClose()
                }}
              >
                确认删除
              </button>
            </>
          ) : (
            <>
              <button className="btn ghost sm" onClick={() => setConfirmDel(true)}>删除</button>
              <button className="btn sm" onClick={onEdit}>编辑</button>
              <button className="dialog-x" onClick={onClose} title="关闭">✕</button>
            </>
          )}
        </div>
        <div className="dialog-body viewer-body">
          <MaterialPreview item={item} appearances={appearances} />
        </div>
      </div>
    </div>
  )
}

function Thumb({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    resolveImageURL(id).then((u) => {
      if (alive) setUrl(u)
    })
    return () => {
      alive = false
    }
  }, [id])
  if (!url) return <div className="thumb loading" />
  return <img className="thumb" src={url} alt="" />
}
