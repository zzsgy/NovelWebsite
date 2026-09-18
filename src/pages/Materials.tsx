import { useEffect, useMemo, useState } from 'react'
import { useDB, addMaterial, workChapters } from '../store'
import { MaterialEditor, MaterialViewer } from '../components/MaterialDialog'
import { MaterialMiniCard } from '../components/MaterialPreview'
import { parseCard } from '../card'
import { fmtTime } from '../lib'
import type { Material, MaterialType, Work } from '../types'

const TYPES: MaterialType[] = ['人物', '地点', '势力', '物品', '词条', '桥段', '命名', '灵感']

/** 表格视图里的一行简介：从正文里摘一句 */
function excerpt(m: Material): string {
  const p = parseCard(m.body || '')
  const para = p.lead[0] || p.sections.flatMap((s) => s.blocks).find((b) => b.kind === 'para')
  const text = para ? (typeof para === 'string' ? para : para.text) : (m.body || '')
  return text.replace(/[#【】*]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) || '—'
}

export default function Materials({
  work,
  openId,
  onOpened,
}: {
  work: Work | null
  /** 从别的页面点某条素材时，直接打开它的预览 */
  openId?: string | null
  onOpened?: () => void
}) {
  const db = useDB()
  const [type, setType] = useState<MaterialType | '全部'>('人物')
  const [scope, setScope] = useState<'work' | 'all'>('work')
  const [q, setQ] = useState('')
  const [mode, setMode] = useState<'card' | 'table'>('card')
  const [editing, setEditing] = useState<Material | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [viewing, setViewing] = useState<Material | null>(null)

  // 外部指定了要打开的素材卡
  useEffect(() => {
    if (!openId) return
    const m = db.materials.find((x) => x.id === openId)
    if (m) {
      setType(m.type)
      setViewing(m)
    }
    onOpened?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId])

  // 别让弹窗里显示的是旧快照
  const editingLive = editing ? db.materials.find((x) => x.id === editing.id) || editing : null
  const viewingLive = viewing ? db.materials.find((x) => x.id === viewing.id) || viewing : null

  const inScope = (m: Material) => scope === 'all' || !m.workId || (!!work && m.workId === work.id)

  const list = useMemo(() => {
    let arr = db.materials.filter(inScope)
    if (type !== '全部') arr = arr.filter((m) => m.type === type)
    if (q.trim()) {
      const kw = q.trim()
      arr = arr.filter(
        (m) =>
          m.title.includes(kw) ||
          m.body.includes(kw) ||
          m.aliases.includes(kw) ||
          Object.values(m.fields || {}).some((v) => (v || '').includes(kw))
      )
    }
    return arr.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'zh'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.materials, type, q, work, scope])

  const chapters = work ? workChapters(db, work.id) : []
  const fullText = chapters.map((c) => c.content).join('\n')
  const appears = (m: Material) => (m.title ? fullText.split(m.title).length - 1 : 0)

  const count = (t: MaterialType | '全部') =>
    db.materials.filter((m) => inScope(m) && (t === '全部' || m.type === t)).length

  const create = () => {
    const t = (type === '全部' ? '人物' : type) as MaterialType
    const m = addMaterial(t, work?.id || null)
    setIsNew(true)
    setEditing(m)
    if (type === '全部') setType(t)
  }

  return (
    <div className="writer">
      <aside className="writer-side" style={{ width: 208, flex: '0 0 208px' }}>
        <div className="side-head">
          <b>素材类型</b>
        </div>
        <div className="side-body">
          <div className="scope-switch">
            <button className={'seg-btn' + (scope === 'work' ? ' on' : '')} onClick={() => setScope('work')}>
              本书
            </button>
            <button className={'seg-btn' + (scope === 'all' ? ' on' : '')} onClick={() => setScope('all')}>
              全部作品
            </button>
          </div>
          <button
            className={'nav-item' + (type === '全部' ? ' on' : '')}
            style={{ width: '100%' }}
            onClick={() => setType('全部')}
          >
            <i className="nav-dot" />
            <span>全部</span>
            <div className="spacer" />
            <span style={{ fontSize: 11, opacity: 0.7 }}>{count('全部')}</span>
          </button>
          {TYPES.map((t) => (
            <button
              key={t}
              className={'nav-item' + (type === t ? ' on' : '')}
              style={{ width: '100%' }}
              onClick={() => setType(t)}
            >
              <i className="nav-dot" />
              <span>{t}</span>
              <div className="spacer" />
              <span style={{ fontSize: 11, opacity: 0.7 }}>{count(t)}</span>
            </button>
          ))}
        </div>
      </aside>

      <div className="writer-main">
        <div className="editor-bar">
          <input
            className="input"
            style={{ maxWidth: 280 }}
            placeholder="搜索：名称、别名、正文内容…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <span className="muted">{list.length} 条</span>
          <div className="spacer" />
          <button className="btn ghost sm" onClick={() => setMode(mode === 'card' ? 'table' : 'card')}>
            {mode === 'card' ? '切换表格视图' : '切换卡片视图'}
          </button>
          <button className="btn primary sm" onClick={create}>
            ＋ 新建{type === '全部' ? '素材' : type}
          </button>
        </div>

        <div className="page" style={{ paddingTop: 16 }}>
          {list.length === 0 ? (
            <div className="card empty">
              <b>这一栏还没有内容</b>
              <div style={{ marginBottom: 14 }}>
                卡片用自由文本，想到什么写什么；参考图可以直接拖进来当封面。
              </div>
              <button className="btn primary" onClick={create}>
                ＋ 新建{type === '全部' ? '素材' : type}
              </button>
            </div>
          ) : mode === 'card' ? (
            <div className="grid g3">
              {list.map((m) => (
                <MaterialMiniCard
                  key={m.id}
                  item={m}
                  badge={m.type}
                  appearances={appears(m)}
                  onClick={() => setViewing(m)}
                />
              ))}
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table className="tb">
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>类型</th>
                    <th style={{ width: 140 }}>名称</th>
                    <th style={{ width: 120 }}>别名</th>
                    <th>正文摘要</th>
                    <th style={{ width: 90 }}>正文出现</th>
                    <th style={{ width: 80 }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((m) => {
                    const n = appears(m)
                    return (
                      <tr key={m.id}>
                        <td><span className="chip plain">{m.type}</span></td>
                        <td><b>{m.title || '（未命名）'}</b></td>
                        <td className="muted">{m.aliases || '—'}</td>
                        <td className="muted" style={{ maxWidth: 360 }}>{excerpt(m)}</td>
                        <td>{n > 0 ? <span className="badge g">{n} 次</span> : <span className="badge">0</span>}</td>
                        <td>
                          <button
                            className="btn ghost sm"
                            onClick={() => {
                              setIsNew(false)
                              setEditing(m)
                            }}
                          >
                            编辑
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {list.length > 0 && (
            <div className="muted" style={{ fontSize: 11.5, marginTop: 12 }}>
              共 {list.length} 条 · 最近更新 {fmtTime(Math.max(...list.map((m) => m.updatedAt)))}
              {mode === 'card' && ' · 点卡片看完整预览'}
            </div>
          )}
        </div>
      </div>

      {editingLive && (
        <MaterialEditor item={editingLive} isNew={isNew} onClose={() => setEditing(null)} />
      )}
      {viewingLive && !editingLive && (
        <MaterialViewer
          item={viewingLive}
          appearances={appears(viewingLive)}
          onClose={() => setViewing(null)}
          onEdit={() => {
            setIsNew(false)
            setEditing(viewingLive)
            setViewing(null)
          }}
        />
      )}
    </div>
  )
}
