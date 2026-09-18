import { useState } from 'react'
import {
  useDB,
  addWork,
  updateWork,
  deleteWork,
  workChapters,
  workWordCount,
  stockpile,
  loadSample,
} from '../store'
import { fmtNum, fmtTime, pct } from '../lib'
import type { Work } from '../types'

export default function Shelf({ onOpen }: { onOpen: (id: string) => void }) {
  const db = useDB()
  const [edit, setEdit] = useState<Work | null>(null)
  const [creating, setCreating] = useState(false)
  const [confirmDel, setConfirmDel] = useState<Work | null>(null)

  return (
    <div className="page">
      <div className="page narrow">
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>
              共 {db.works.length} 部作品 · 单账号多设备
            </div>
          </div>
          <div className="spacer" />
          <button className="btn primary" onClick={() => setCreating(true)}>
            ＋ 新建作品
          </button>
        </div>

        {db.works.length === 0 ? (
          <div className="card empty">
            <b>还没有作品</b>
            <div style={{ marginBottom: 16 }}>新建一部开始写，或先载入示例数据看看功能。</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="btn primary" onClick={() => setCreating(true)}>
                ＋ 新建作品
              </button>
              <button className="btn" onClick={() => loadSample()}>
                载入示例数据
              </button>
            </div>
          </div>
        ) : (
          <div className="grid g2">
            {db.works.map((w) => {
              const chs = workChapters(db, w.id)
              const words = workWordCount(chs)
              const pub = chs.filter((c) => c.status === '已发布').length
              const stock = stockpile(chs)
              const p = pct(words, w.targetMin)
              return (
                <div key={w.id} className="work-card" onClick={() => onOpen(w.id)}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="work-title">{w.title}</div>
                      <div className="work-meta" style={{ marginTop: 4 }}>
                        {w.penName || '未署名'} · {w.genre} · {chs.length} 章
                      </div>
                    </div>
                    <span className={'badge ' + statusClass(w.status)}>{w.status}</span>
                  </div>

                  <div>
                    <div className="progress">
                      <i style={{ width: p + '%' }} />
                    </div>
                    <div className="kv" style={{ marginTop: 6 }}>
                      <span>{fmtNum(words)} 字</span>
                      <span className="muted">
                        目标 {fmtNum(w.targetMin)} – {fmtNum(w.targetMax)}
                      </span>
                    </div>
                  </div>

                  <div className="kv">
                    <span>
                      已发布 {pub} 章 · 存稿 <b style={{ color: stock > 0 ? 'var(--green)' : 'var(--amber)' }}>{stock}</b> 章
                    </span>
                    <span className="muted">{fmtTime(w.updatedAt)}</span>
                  </div>

                  <div
                    style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--line-2)', paddingTop: 10 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button className="btn sm" onClick={() => onOpen(w.id)}>
                      继续写
                    </button>
                    <button className="btn ghost sm" onClick={() => setEdit(w)}>
                      作品信息
                    </button>
                    <div className="spacer" />
                    <button className="btn ghost sm warn" onClick={() => setConfirmDel(w)}>
                      删除
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {creating && (
        <WorkForm
          onClose={() => setCreating(false)}
          onSave={(data) => {
            const w = addWork(data)
            setCreating(false)
            onOpen(w.id)
          }}
        />
      )}
      {edit && (
        <WorkForm
          init={edit}
          onClose={() => setEdit(null)}
          onSave={(data) => {
            updateWork(edit.id, data)
            setEdit(null)
          }}
        />
      )}
      {confirmDel && (
        <div className="mask center" onClick={() => setConfirmDel(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <b style={{ fontSize: 15 }}>删除《{confirmDel.title}》？</b>
            <p className="muted" style={{ fontSize: 13 }}>
              该作品下的所有卷、章节正文、版本快照、伏笔记录都会一并删除，无法撤销。
            </p>
            <div className="right" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setConfirmDel(null)}>取消</button>
              <button
                className="btn warn"
                onClick={() => {
                  deleteWork(confirmDel.id)
                  setConfirmDel(null)
                }}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function statusClass(s: string) {
  if (s === '连载') return 'b'
  if (s === '完结') return 'g'
  if (s === '搁置') return 'a'
  return ''
}

function WorkForm({
  init,
  onClose,
  onSave,
}: {
  init?: Work
  onClose: () => void
  onSave: (data: Partial<Work>) => void
}) {
  const [f, setF] = useState<Partial<Work>>(
    init || {
      title: '',
      penName: '',
      genre: '玄幻',
      status: '构思',
      platform: '',
      targetMin: 1000000,
      targetMax: 2000000,
    }
  )
  const set = (k: keyof Work, v: any) => setF({ ...f, [k]: v })

  return (
    <div className="mask center" onClick={onClose}>
      <div className="modal" style={{ width: 560 }} onClick={(e) => e.stopPropagation()}>
        <b style={{ fontSize: 15 }}>{init ? '作品信息' : '新建作品'}</b>
        <div style={{ marginTop: 16 }}>
          <div className="field">
            <label>作品名</label>
            <input
              className="input"
              autoFocus
              value={f.title || ''}
              onChange={(e) => set('title', e.target.value)}
              placeholder="例如：北境旧事"
            />
          </div>
          <div className="row">
            <div className="field">
              <label>笔名</label>
              <input className="input" value={f.penName || ''} onChange={(e) => set('penName', e.target.value)} />
            </div>
            <div className="field">
              <label>题材</label>
              <input className="input" value={f.genre || ''} onChange={(e) => set('genre', e.target.value)} />
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>状态</label>
              <select className="select" value={f.status} onChange={(e) => set('status', e.target.value)}>
                {['构思', '连载', '完结', '搁置'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>发布平台</label>
              <input className="input" value={f.platform || ''} onChange={(e) => set('platform', e.target.value)} />
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>目标字数下限</label>
              <input
                className="input"
                type="number"
                value={f.targetMin || 0}
                onChange={(e) => set('targetMin', Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label>目标字数上限</label>
              <input
                className="input"
                type="number"
                value={f.targetMax || 0}
                onChange={(e) => set('targetMax', Number(e.target.value))}
              />
            </div>
          </div>
          <div className="field">
            <label>简介</label>
            <textarea
              className="textarea"
              rows={3}
              value={f.intro || ''}
              onChange={(e) => set('intro', e.target.value)}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn primary" onClick={() => onSave({ ...f, title: f.title || '未命名长篇' })}>
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
