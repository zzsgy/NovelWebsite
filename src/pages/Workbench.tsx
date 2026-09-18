import { useEffect, useMemo, useRef, useState } from 'react'
import {
  useDB,
  addChapter,
  addVolume,
  updateVolume,
  deleteVolume,
  updateChapterMeta,
  deleteChapter,
  saveChapterContent,
  rollbackVersion,
  toggleKeepForever,
  updateForeshadow,
  addForeshadow,
  workChapters,
  workVolumes,
  personNames,
  relatedMaterials,
  openForeshadows,
} from '../store'
import { buildSegments, countWords, fmtNum, fmtTime, pct } from '../lib'
import type { Chapter, Work, ID } from '../types'

export default function Workbench({
  work,
  onGoShelf,
  jumpToChapterId,
}: {
  work: Work | null
  onGoShelf: () => void
  jumpToChapterId?: ID | null
}) {
  const db = useDB()
  const [curChId, setCurChId] = useState<ID | null>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [showRight, setShowRight] = useState(true)

  const volumes = useMemo(() => (work ? workVolumes(db, work.id) : []), [db, work])
  const chapters = useMemo(() => (work ? workChapters(db, work.id) : []), [db, work])

  useEffect(() => {
    if (!chapters.length) {
      setCurChId(null)
      return
    }
    if (!curChId || !chapters.some((c) => c.id === curChId)) {
      setCurChId(chapters[0].id)
    }
  }, [chapters, curChId])

  // 从构思台的大纲点「开写」时直接定位到该章
  useEffect(() => {
    if (jumpToChapterId && chapters.some((c) => c.id === jumpToChapterId)) {
      setCurChId(jumpToChapterId)
    }
  }, [jumpToChapterId, chapters])

  if (!work) {
    return (
      <div className="page">
        <div className="card empty">
          <b>还没有作品</b>
          <div style={{ marginBottom: 16 }}>先去书架新建一部作品，再回来写正文。</div>
          <button className="btn primary" onClick={onGoShelf}>去书架</button>
        </div>
      </div>
    )
  }

  const ch = chapters.find((c) => c.id === curChId) || null

  return (
    <div className="writer">
      <aside className="writer-side">
        <div className="side-head">
          <b>目录</b>
          <span className="muted" style={{ fontSize: 11.5 }}>{chapters.length} 章</span>
          <div className="spacer" />
          <button className="btn ghost sm" onClick={() => addVolume(work.id)}>＋卷</button>
          <button
            className="btn ghost sm"
            onClick={() => {
              const last = chapters[chapters.length - 1]
              const v = last?.volumeId || volumes[0]?.id || null
              const c = addChapter(work.id, v)
              setCurChId(c.id)
            }}
          >
            ＋章
          </button>
        </div>
        <div className="side-body">
          {volumes.map((v) => {
            const list = chapters.filter((c) => c.volumeId === v.id)
            const open = !collapsed[v.id]
            const vWords = list.reduce((s, c) => s + countWords(c.content), 0)
            return (
              <div className="tree-vol" key={v.id}>
                <div className="tree-vol-head" onClick={() => setCollapsed({ ...collapsed, [v.id]: open })}>
                  <span className="caret">{open ? '▼' : '▶'}</span>
                  <span
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) => {
                      const t = e.currentTarget.innerText.trim()
                      if (t && t !== v.title) updateVolume(v.id, { title: t })
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {v.title}
                  </span>
                  <div className="spacer" />
                  <span className="muted" style={{ fontSize: 11 }}>{(vWords / 10000).toFixed(2)}万</span>
                  <button
                    className="btn ghost sm"
                    style={{ padding: '2px 6px' }}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (confirm(`删除「${v.title}」及其下 ${list.length} 章？此操作不可撤销。`)) deleteVolume(v.id)
                    }}
                  >
                    ×
                  </button>
                  <button
                    className="btn ghost sm"
                    style={{ padding: '2px 6px' }}
                    onClick={(e) => {
                      e.stopPropagation()
                      const c = addChapter(work.id, v.id)
                      setCurChId(c.id)
                    }}
                  >
                    ＋
                  </button>
                </div>
                {open &&
                  list.map((c) => (
                    <button
                      key={c.id}
                      className={'tree-ch' + (c.id === curChId ? ' on' : '')}
                      onClick={() => setCurChId(c.id)}
                    >
                      <i
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: '50%',
                          background:
                            c.status === '已发布'
                              ? 'var(--green)'
                              : c.status === '已定稿'
                              ? 'var(--blue)'
                              : c.status === '待修'
                              ? 'var(--amber)'
                              : 'var(--ink-3)',
                          flex: '0 0 5px',
                        }}
                      />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.title || '未命名'}
                      </span>
                      <span className="wc">{countWords(c.content)}</span>
                    </button>
                  ))}
                {open && list.length === 0 && (
                  <div className="muted" style={{ fontSize: 12, padding: '4px 0 4px 26px' }}>本卷还没有章节</div>
                )}
              </div>
            )
          })}
          {volumes.length === 0 && (
            <div className="muted" style={{ fontSize: 12.5, padding: 8 }}>
              还没有分卷，点上方「＋卷」创建。
            </div>
          )}
        </div>
      </aside>

      <div className="writer-main">
        {ch ? (
          <ChapterEditor
            chapter={ch}
            work={work}
            onToggleRight={() => setShowRight(!showRight)}
            showRight={showRight}
          />
        ) : (
          <div className="page">
            <div className="card empty">
              <b>这部作品还没有章节</b>
              <button className="btn primary" onClick={() => setCurChId(addChapter(work.id, volumes[0]?.id || null).id)}>
                ＋ 新建第一章
              </button>
            </div>
          </div>
        )}
      </div>

      {showRight && ch && (
        <RightPanel work={work} chapter={ch} chapters={chapters} onPick={setCurChId} onDelete={() => setCurChId(null)} />
      )}
    </div>
  )
}

/* ----------------------------- 编辑器 ----------------------------- */

function ChapterEditor({
  chapter,
  work,
  showRight,
  onToggleRight,
}: {
  chapter: Chapter
  work: Work
  showRight: boolean
  onToggleRight: () => void
}) {
  const db = useDB()
  const [text, setText] = useState(chapter.content)
  const [status, setStatus] = useState<'saved' | 'saving' | 'dirty'>('saved')
  const [title, setTitle] = useState(chapter.title)
  const timer = useRef<number | null>(null)
  const speedRef = useRef({ t: Date.now(), w: countWords(chapter.content) })
  const [speed, setSpeed] = useState(0)

  useEffect(() => {
    setText(chapter.content)
    setTitle(chapter.title)
    setStatus('saved')
    speedRef.current = { t: Date.now(), w: countWords(chapter.content) }
    setSpeed(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter.id])

  const names = useMemo(() => (db.settings.highlightNames ? personNames(db, work.id) : []), [db, work.id])
  const forbidden = db.settings.forbiddenCheck ? db.settings.forbiddenWords : []
  const segs = useMemo(() => buildSegments(text, names, forbidden), [text, names, forbidden])
  const words = countWords(text)
  const goal = db.settings.chapterGoal
  const p = pct(words, goal)

  const flush = (value: string, nextTitle?: string) => {
    saveChapterContent(chapter.id, value)
    if (nextTitle !== undefined && nextTitle !== chapter.title) {
      updateChapterMeta(chapter.id, { title: nextTitle })
    }
    setStatus('saved')
  }

  const schedule = (value: string, nextTitle?: string) => {
    setStatus('saving')
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => flush(value, nextTitle), 2500)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (timer.current) window.clearTimeout(timer.current)
        flush(text, title)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useEffect(() => {
    const id = window.setInterval(() => {
      const dt = (Date.now() - speedRef.current.t) / 60000
      if (dt > 0.15) {
        const dw = words - speedRef.current.w
        setSpeed(Math.max(0, Math.round(dw / dt)))
      }
    }, 5000)
    return () => window.clearInterval(id)
  }, [words])

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [])

  return (
    <>
      <div className="editor-bar">
        <span className={'dot ' + (status === 'saved' ? '' : status === 'saving' ? 'saving' : 'off')} />
        <span>{status === 'saved' ? '已保存' : status === 'saving' ? '保存中…' : '未保存'}</span>
        <span className="muted">·</span>
        <span>{fmtNum(words)} 字</span>
        {db.settings.showWordProgress && (
          <>
            <span className="progress-strip"><i style={{ width: p + '%' }} /></span>
            <span className="muted">{p}% / 目标 {goal}</span>
          </>
        )}
        {db.settings.showSpeed && <span className="muted">· {speed} 字/分</span>}
        <div className="spacer" />
        <select
          className="select"
          style={{ width: 96, padding: '3px 8px', fontSize: 12.5 }}
          value={chapter.status}
          onChange={(e) => updateChapterMeta(chapter.id, { status: e.target.value as any })}
        >
          {['草稿', '待修', '已定稿', '已发布'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <button className="btn ghost sm" onClick={onToggleRight}>
          {showRight ? '收起设定' : '展开设定'}
        </button>
        <button className="btn sm" onClick={() => flush(text, title)}>立即保存</button>
      </div>

      <div className="editor-scroll">
        <div className="editor-paper">
          <input
            className="editor-title"
            value={title}
            placeholder="章节标题，例如：第1章 雨夜叩门"
            onChange={(e) => {
              setTitle(e.target.value)
              schedule(text, e.target.value)
            }}
          />
          <div className="editor-wrap">
            <div className={'editor-layer editor-backdrop' + (db.settings.typewriter ? ' typewriter' : '')}>
              {segs.map((s, i) =>
                s.kind === 'normal' ? (
                  <span key={i}>{s.text}</span>
                ) : (
                  <span key={i} className={s.kind === 'name' ? 'hl-name' : 'hl-forbidden'}>
                    {s.text}
                  </span>
                )
              )}
              {'\u200b'}
            </div>
            <textarea
              className={'editor-layer editor-input' + (db.settings.typewriter ? ' typewriter' : '')}
              value={text}
              spellCheck={false}
              placeholder="在这里写正文…"
              onChange={(e) => {
                setText(e.target.value)
                schedule(e.target.value, title)
              }}
              onBlur={() => flush(text, title)}
            />
          </div>
        </div>
      </div>
    </>
  )
}

/* ----------------------------- 右侧设定面板 ----------------------------- */

function RightPanel({
  work,
  chapter,
  chapters,
  onPick,
  onDelete,
}: {
  work: Work
  chapter: Chapter
  chapters: Chapter[]
  onPick: (id: ID) => void
  onDelete: () => void
}) {
  const db = useDB()
  const [tab, setTab] = useState<'info' | 'version'>('info')

  const related = useMemo(() => relatedMaterials(db, work.id, chapter.content), [db, work.id, chapter.content])
  const people = related.filter((m) => m.type === '人物')
  const others = related.filter((m) => m.type !== '人物')

  const mine = db.foreshadows.filter(
    (f) => f.workId === work.id && (f.plantChapterId === chapter.id || f.payoffChapterId === chapter.id)
  )
  const open = openForeshadows(db, work.id).slice(0, 12)

  const versions = db.versions
    .filter((v) => v.chapterId === chapter.id)
    .sort((a, b) => b.createdAt - a.createdAt)

  const idx = chapters.findIndex((c) => c.id === chapter.id)

  return (
    <aside className="writer-side right">
      <div className="side-head">
        <button className={'btn ghost sm' + (tab === 'info' ? ' on' : '')} onClick={() => setTab('info')}>
          本章设定
        </button>
        <button className={'btn ghost sm' + (tab === 'version' ? ' on' : '')} onClick={() => setTab('version')}>
          版本 {versions.length}
        </button>
        <div className="spacer" />
        <span className="muted" style={{ fontSize: 11.5 }}>
          第 {idx + 1} 章
        </span>
      </div>
      <div className="side-body">
        {tab === 'info' ? (
          <>
            <div className="side-card">
              <b>本章梗概</b>
              <textarea
                className="textarea"
                rows={3}
                style={{ fontSize: 12.5, marginTop: 4 }}
                placeholder="一句话写清本章发生了什么，方便日后回看与生成大纲"
                value={chapter.outline}
                onChange={(e) => updateChapterMeta(chapter.id, { outline: e.target.value })}
              />
            </div>

            <div className="side-card">
              <b>本章出场人物（{people.length}）</b>
              <span className="t">按正文中出现的名字自动识别</span>
              {people.length === 0 && <div className="muted">正文里还没出现已建卡的人物</div>}
              {people.map((m) => (
                <div key={m.id} style={{ marginTop: 6 }}>
                  <span className="chip g">{m.title}</span>
                  {(m.aliases ? ' ' + m.aliases : '') && (
                    <span className="muted" style={{ fontSize: 11.5, marginLeft: 6 }}>{m.aliases}</span>
                  )}
                  {m.fields?.['当前状态'] && (
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>状态：{m.fields['当前状态']}</div>
                  )}
                </div>
              ))}
            </div>

            {others.length > 0 && (
              <div className="side-card">
                <b>相关设定（{others.length}）</b>
                {others.map((m) => (
                  <div key={m.id} style={{ marginTop: 5 }}>
                    <span className="chip plain">{m.type}</span>{' '}
                    <span style={{ fontSize: 12.5 }}>{m.title}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="side-card">
              <b>本章伏笔（{mine.length}）</b>
              {mine.length === 0 && <div className="muted">本章没有登记埋点或回收</div>}
              {mine.map((f) => (
                <div key={f.id} style={{ marginTop: 6 }}>
                  <div style={{ fontSize: 12.5 }}>
                    {f.plantChapterId === chapter.id ? <span className="chip a">埋点</span> : <span className="chip g">回收</span>}{' '}
                    {f.desc}
                  </div>
                </div>
              ))}
              <button
                className="btn ghost sm"
                style={{ marginTop: 8 }}
                onClick={() =>
                  addForeshadow(work.id, { desc: '', plantChapterId: chapter.id, status: '已埋未收' })
                }
              >
                ＋ 把本章登记为伏笔埋点
              </button>
            </div>

            <div className="side-card">
              <b>未回收伏笔（{open.length}）</b>
              <span className="t">按已过章节数排序，琥珀色为超过 30 章未回收</span>
              {open.map((f) => (
                <div key={f.id} style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--line-2)' }}>
                  <div style={{ fontSize: 12.5 }}>{f.desc || '（未描述）'}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <span className={'badge ' + (f.overdue ? 'a' : '')}>已过 {f.passed} 章</span>
                    <button
                      className="btn ghost sm"
                      onClick={() => updateForeshadow(f.id, { payoffChapterId: chapter.id, status: '已回收' })}
                    >
                      标记为本章回收
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="side-card">
              <b>章节操作</b>
              <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                <button
                  className="btn sm"
                  onClick={() => {
                    const t = (chapter.title || '第' + (idx + 1) + '章').replace(/\s+$/, '')
                    updateChapterMeta(chapter.id, { title: t })
                  }}
                >
                  整理标题
                </button>
                <button
                  className="btn sm warn"
                  onClick={() => {
                    if (confirm(`删除「${chapter.title}」及其版本记录？此操作不可撤销。`)) {
                      deleteChapter(chapter.id)
                      onDelete()
                    }
                  }}
                >
                  删除本章
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="side-card">
              <b>版本快照</b>
              <span className="t">
                自动保存时按需生成；每章最多保留 20 个，可对重要版本设为永久保留
              </span>
            </div>
            {versions.length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>还没有版本快照</div>}
            {versions.map((v) => (
              <div key={v.id} className="side-card">
                <b style={{ fontSize: 12.5 }}>{fmtTime(v.createdAt)}</b>
                <div className="t">
                  {fmtNum(v.wordCount)} 字 {v.keepForever && <span className="chip a">永久保留</span>}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <button
                    className="btn ghost sm"
                    onClick={() => {
                      if (confirm('回滚到该版本？当前内容会先被存为一个新版本。')) {
                        rollbackVersion(chapter.id, v.id)
                        alert('已回滚，请查看正文。')
                      }
                    }}
                  >
                    回滚
                  </button>
                  <button className="btn ghost sm" onClick={() => toggleKeepForever(v.id)}>
                    {v.keepForever ? '取消永久' : '设为永久'}
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </aside>
  )
}
