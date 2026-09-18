import { useMemo } from 'react'
import { useDB, workChapters, workWordCount, stockpile, areaLogs, streakDays } from '../store'
import { countWords, fmtNum, pct } from '../lib'
import type { Work } from '../types'

export default function Stats({ work }: { work: Work | null }) {
  const db = useDB()

  const chapters = work ? workChapters(db, work.id) : []
  const words = workWordCount(chapters)
  const logs = useMemo(() => areaLogs(db, 90, work?.id), [db, work])
  const logs30 = logs.slice(-30)
  const logs14 = logs.slice(-14)

  const today = logs[logs.length - 1]?.added || 0
  const goal = db.settings.dailyGoal
  const streak = streakDays(db)
  const stock = stockpile(chapters)
  const published = chapters.filter((c) => c.status === '已发布').length
  const drafts = chapters.filter((c) => c.status === '草稿').length
  const needFix = chapters.filter((c) => c.status === '待修').length
  const done = chapters.filter((c) => c.status === '已定稿').length

  const avg14 = logs14.reduce((s, l) => s + l.added, 0) / 14
  const maxBar = Math.max(goal, ...logs30.map((l) => l.added), 1)
  const maxHm = Math.max(...logs.map((l) => l.added), 1)

  const targetMin = work?.targetMin || 0
  const targetMax = work?.targetMax || 0
  const remainMin = Math.max(0, targetMin - words)
  const remainMax = Math.max(0, targetMax - words)
  const daysToMin = avg14 > 1 ? Math.ceil(remainMin / avg14) : Infinity
  const daysToMax = avg14 > 1 ? Math.ceil(remainMax / avg14) : Infinity

  const avgChapter = published + drafts + needFix + done > 0 ? Math.round(words / chapters.length) : 0

  if (!work) {
    return (
      <div className="page">
        <div className="card empty"><b>请先选择一部作品</b></div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page narrow">
        <div className="grid g4" style={{ marginBottom: 16 }}>
          <div className="stat">
            <div className="n" style={{ color: today >= goal ? 'var(--green)' : 'var(--ink)' }}>
              {fmtNum(today)}
            </div>
            <div className="l">今日字数 / 目标 {fmtNum(goal)}</div>
            <div className="progress g" style={{ marginTop: 10 }}>
              <i style={{ width: pct(today, goal) + '%' }} />
            </div>
          </div>
          <div className="stat">
            <div className="n">{streak} 天</div>
            <div className="l">连续更新</div>
            <div className="h">断更会以琥珀色标注在下方日历</div>
          </div>
          <div className="stat">
            <div className="n" style={{ color: stock > 0 ? 'var(--green)' : 'var(--amber)' }}>{stock}</div>
            <div className="l">存稿量（已写未发布）</div>
            <div className="h">
              {(() => {
                const d = (stock * avgChapter) / Math.max(1, goal)
                return d >= 1
                  ? `按均章 ${fmtNum(avgChapter)} 字、日更 ${fmtNum(goal)} 字计，可支撑约 ${Math.floor(d)} 天`
                  : `待发约 ${fmtNum(stock * avgChapter)} 字，还不足一天的量`
              })()}
            </div>
          </div>
          <div className="stat">
            <div className="n">{fmtNum(words)}</div>
            <div className="l">全书字数</div>
            <div className="h">{chapters.length} 章 · 均章 {fmtNum(avgChapter)} 字</div>
          </div>
        </div>

        <div className="grid g2" style={{ marginBottom: 16 }}>
          <div className="card">
            <b style={{ fontSize: 14 }}>目标进度</b>
            <div className="kv" style={{ marginTop: 12 }}>
              <span>下限 {fmtNum(targetMin)} 字</span>
              <span>{pct(words, targetMin)}%</span>
            </div>
            <div className="progress" style={{ marginTop: 6 }}>
              <i style={{ width: pct(words, targetMin) + '%' }} />
            </div>
            <div className="kv" style={{ marginTop: 14 }}>
              <span>上限 {fmtNum(targetMax)} 字</span>
              <span>{pct(words, targetMax)}%</span>
            </div>
            <div className="progress g" style={{ marginTop: 6 }}>
              <i style={{ width: pct(words, targetMax) + '%' }} />
            </div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 14, lineHeight: 1.9 }}>
              近 14 天日均 {fmtNum(Math.round(avg14))} 字。
              {avg14 > 1 ? (
                <>
                  按此速度，写到下限还需约 <b style={{ color: 'var(--blue)' }}>{daysToMin}</b> 天，
                  写到上限还需约 <b style={{ color: 'var(--blue)' }}>{daysToMax}</b> 天
                  （约 {(daysToMax / 365).toFixed(1)} 年）。
                </>
              ) : (
                ' 还没有足够数据推算完本时间，先写几天。'
              )}
            </div>
          </div>

          <div className="card">
            <b style={{ fontSize: 14 }}>章节状态分布</b>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
              <div className="side-card" style={{ margin: 0 }}>
                <b>{published}</b><span className="t">已发布</span>
              </div>
              <div className="side-card" style={{ margin: 0 }}>
                <b>{done}</b><span className="t">已定稿</span>
              </div>
              <div className="side-card" style={{ margin: 0 }}>
                <b>{needFix}</b><span className="t">待修（琥珀标记）</span>
              </div>
              <div className="side-card" style={{ margin: 0 }}>
                <b>{drafts}</b><span className="t">草稿</span>
              </div>
            </div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>
              全书 {fmtNum(chapters.reduce((s, c) => s + countWords(c.content), 0))} 字，
              平均每章 {fmtNum(avgChapter)} 字。
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <b style={{ fontSize: 14 }}>近 30 天每日字数</b>
            <div className="spacer" />
            <span className="muted" style={{ fontSize: 12 }}>蓝＝未达标，琥珀＝断更</span>
          </div>
          <div className="bars" style={{ marginTop: 14 }}>
            {logs30.map((l) => (
              <div
                key={l.date}
                className={l.added === 0 ? 'a' : ''}
                style={{ height: Math.max(3, (l.added / maxBar) * 100) + '%' }}
                title={`${l.date} · ${fmtNum(l.added)} 字`}
              />
            ))}
          </div>
          <div className="kv" style={{ marginTop: 8 }}>
            <span className="muted" style={{ fontSize: 11.5 }}>{logs30[0]?.date}</span>
            <span className="muted" style={{ fontSize: 11.5 }}>{logs30[logs30.length - 1]?.date}</span>
          </div>
        </div>

        <div className="card">
          <b style={{ fontSize: 14 }}>近 90 天写作日历</b>
          <div className="heatmap" style={{ marginTop: 14 }}>
            {logs.map((l) => {
              const r = l.added / maxHm
              const cls =
                l.added === 0
                  ? 'zero'
                  : r > 0.75
                  ? 'l4'
                  : r > 0.5
                  ? 'l3'
                  : r > 0.2
                  ? 'l2'
                  : 'l1'
              return <div key={l.date} className={'hm-cell ' + cls} title={`${l.date} · ${fmtNum(l.added)} 字`} />
            })}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            共 90 格，每格一天（自左向右、自上而下）。琥珀格为当天没有记录字数的日子。
          </div>
        </div>
      </div>
    </div>
  )
}
