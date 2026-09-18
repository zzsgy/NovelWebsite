import { useMemo, useState } from 'react'
import {
  useDB,
  addForeshadow,
  updateForeshadow,
  deleteForeshadow,
  workChapters,
} from '../store'
import { fmtNum } from '../lib'
import type { Foreshadow, Work } from '../types'

const TIERS = ['核心', '重要', '一般'] as const

export default function Foreshadows({ work }: { work: Work | null }) {
  const db = useDB()
  const [filter, setFilter] = useState<'全部' | '未回收' | '已回收' | '逾期'>('全部')

  const chapters = work ? workChapters(db, work.id) : []
  const idx = useMemo(() => new Map(chapters.map((c, i) => [c.id, i])), [chapters])
  const total = chapters.length

  const rows = useMemo(() => {
    if (!work) return []
    return db.foreshadows
      .filter((f) => f.workId === work.id)
      .map((f) => {
        const pi = f.plantChapterId ? idx.get(f.plantChapterId) : undefined
        const passed = pi === undefined ? 0 : total - 1 - pi
        const done = !!f.payoffChapterId
        const overdue = !done && passed >= 30
        const status = done ? '已回收' : overdue ? '逾期' : f.status === '部分回收' ? '部分回收' : '已埋未收'
        return { f, passed, done, overdue, status }
      })
      .filter((r) => {
        if (filter === '全部') return true
        if (filter === '未回收') return !r.done
        if (filter === '已回收') return r.done
        return r.overdue
      })
      .sort((a, b) => b.passed - a.passed)
  }, [db.foreshadows, work, idx, total, filter])

  if (!work) {
    return (
      <div className="page">
        <div className="card empty"><b>请先选择一部作品</b></div>
      </div>
    )
  }

  const openCount = rows.filter((r) => !r.done).length
  const overdueCount = rows.filter((r) => r.overdue).length

  return (
    <div className="page">
      <div className="page narrow">
        <div className="grid g3" style={{ marginBottom: 18 }}>
          <div className="stat">
            <div className="n">{rows.length}</div>
            <div className="l">伏笔总数</div>
          </div>
          <div className="stat">
            <div className="n" style={{ color: 'var(--green)' }}>{openCount}</div>
            <div className="l">未回收</div>
          </div>
          <div className="stat">
            <div className="n" style={{ color: overdueCount ? 'var(--amber)' : 'var(--ink)' }}>{overdueCount}</div>
            <div className="l">逾期未回收（超过 30 章）</div>
          </div>
        </div>

        <div className="card" style={{ padding: '12px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="muted" style={{ fontSize: 12.5 }}>筛选</span>
          {(['全部', '未回收', '逾期', '已回收'] as const).map((x) => (
            <button
              key={x}
              className={'btn sm' + (filter === x ? ' primary' : ' ghost')}
              onClick={() => setFilter(x)}
            >
              {x}
            </button>
          ))}
          <div className="spacer" />
          <button className="btn primary sm" onClick={() => addForeshadow(work.id, { desc: '' })}>
            ＋ 登记伏笔
          </button>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="tb">
            <thead>
              <tr>
                <th style={{ width: 300 }}>伏笔描述</th>
                <th style={{ width: 150 }}>埋点章节</th>
                <th style={{ width: 150 }}>计划回收</th>
                <th style={{ width: 150 }}>实际回收</th>
                <th style={{ width: 90 }}>已过</th>
                <th style={{ width: 90 }}>重要度</th>
                <th style={{ width: 90 }}>状态</th>
                <th style={{ width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="muted" style={{ padding: 30, textAlign: 'center' }}>
                    这一筛选下没有伏笔。
                  </td>
                </tr>
              )}
              {rows.map(({ f, passed, overdue, status }) => (
                <tr key={f.id} className={overdue ? 'overdue-row' : ''}>
                  <td>
                    <textarea
                      className="textarea"
                      rows={2}
                      style={{ fontSize: 12.5, padding: '4px 8px' }}
                      placeholder="例如：断字铜钱另一面的字被谁磨掉了"
                      value={f.desc}
                      onChange={(e) => updateForeshadow(f.id, { desc: e.target.value })}
                    />
                    <input
                      className="input"
                      style={{ fontSize: 12, marginTop: 4, padding: '3px 8px' }}
                      placeholder="备注（可选）"
                      value={f.note}
                      onChange={(e) => updateForeshadow(f.id, { note: e.target.value })}
                    />
                  </td>
                  <td>
                    <ChapterSelect
                      chapters={chapters}
                      value={f.plantChapterId}
                      onChange={(v) => updateForeshadow(f.id, { plantChapterId: v })}
                    />
                  </td>
                  <td>
                    <ChapterSelect
                      chapters={chapters}
                      value={f.planChapterId}
                      onChange={(v) => updateForeshadow(f.id, { planChapterId: v })}
                    />
                  </td>
                  <td>
                    <ChapterSelect
                      chapters={chapters}
                      value={f.payoffChapterId}
                      onChange={(v) =>
                        updateForeshadow(f.id, { payoffChapterId: v, status: v ? '已回收' : '已埋未收' })
                      }
                    />
                  </td>
                  <td>
                    <span className={'badge ' + (overdue ? 'a' : '')}>{passed} 章</span>
                  </td>
                  <td>
                    <select
                      className="select"
                      style={{ fontSize: 12, padding: '3px 6px' }}
                      value={f.tier}
                      onChange={(e) => updateForeshadow(f.id, { tier: e.target.value as Foreshadow['tier'] })}
                    >
                      {TIERS.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <span
                      className={
                        'badge ' + (status === '已回收' ? 'g' : status === '逾期' ? 'a' : 'b')
                      }
                    >
                      {status}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn ghost sm warn"
                      onClick={() => {
                        if (confirm('删除这条伏笔记录？')) deleteForeshadow(f.id)
                      }}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>
          共 {total} 章 · 全书 {fmtNum(chapters.reduce((s, c) => s + c.content.replace(/\s/g, '').length, 0))} 字。
          已埋未收与逾期的条目以琥珀色标注，不使用红色。
        </p>
      </div>
    </div>
  )
}

function ChapterSelect({
  chapters,
  value,
  onChange,
}: {
  chapters: { id: string; title: string }[]
  value: string | null
  onChange: (v: string | null) => void
}) {
  return (
    <select
      className="select"
      style={{ fontSize: 12, padding: '3px 6px' }}
      value={value || ''}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">—</option>
      {chapters.map((c) => (
        <option key={c.id} value={c.id}>
          {c.title || '未命名'}
        </option>
      ))}
    </select>
  )
}
