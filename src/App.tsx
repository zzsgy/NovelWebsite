import { useEffect, useMemo, useState } from 'react'
import { useDB, searchAll, adapter, getDB } from './store'
import Shelf from './pages/Shelf'
import WriteDesk from './pages/WriteDesk'
import Materials from './pages/Materials'
import Foreshadows from './pages/Foreshadows'
import Stats from './pages/Stats'
import SettingsPage from './pages/Settings'

export type View = 'shelf' | 'write' | 'materials' | 'foreshadow' | 'stats' | 'settings'

const NAV: { key: View; label: string; hint: string }[] = [
  { key: 'shelf', label: '书架', hint: '作品管理' },
  { key: 'write', label: '写作台', hint: '构思 + 正文' },
  { key: 'materials', label: '素材库', hint: '设定中心' },
  { key: 'foreshadow', label: '伏笔台账', hint: '埋点与回收' },
  { key: 'stats', label: '写作统计', hint: '进度与节奏' },
  { key: 'settings', label: '设置', hint: '界面与数据' },
]

const K_CUR = 'novel-studio:current'
const K_VIEW = 'novel-studio:view'
const VIEWS: View[] = ['shelf', 'write', 'materials', 'foreshadow', 'stats', 'settings']

/** 支持用地址栏锚点直达某一页，例如 index.html#write，可存成桌面快捷方式 */
function initialView(): View {
  const h = (location.hash || '').replace('#', '').split('/')[0] as View
  if (VIEWS.includes(h)) return h
  const saved = localStorage.getItem(K_VIEW) as View
  return VIEWS.includes(saved) ? saved : 'shelf'
}

export default function App() {
  const db = useDB()
  const [view, setView] = useState<View>(initialView)
  const [curId, setCurId] = useState<string | null>(() => localStorage.getItem(K_CUR))
  const [searchOpen, setSearchOpen] = useState(false)
  const [matOpenId, setMatOpenId] = useState<string | null>(null)

  useEffect(() => {
    localStorage.setItem(K_VIEW, view)
    // 只保留一级锚点，二级锚点（如 #write/outline）由页面自己维护
    const cur = (location.hash || '').replace('#', '').split('/')[0]
    if (cur !== view) {
      history.replaceState(null, '', '#' + view)
    }
  }, [view])

  // 允许直接改地址栏、或用浏览器前进/后退在原页面内切视图
  useEffect(() => {
    const onHash = () => {
      const v = (location.hash || '').replace('#', '').split('/')[0] as View
      if (VIEWS.includes(v)) setView(v)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const curWork = useMemo(() => {
    return db.works.find((w) => w.id === curId) || db.works[0] || null
  }, [db.works, curId])

  useEffect(() => {
    if (curWork && curWork.id !== curId) {
      setCurId(curWork.id)
      localStorage.setItem(K_CUR, curWork.id)
    }
  }, [curWork, curId])

  // 主题与排版变量
  useEffect(() => {
    const s = db.settings
    const root = document.documentElement
    root.setAttribute('data-theme', s.theme)
    root.style.setProperty('--font-ui', s.fontFamily)
    root.style.setProperty('--editor-font', s.fontFamily)
    root.style.setProperty('--editor-size', s.fontSize + 'px')
    root.style.setProperty('--editor-leading', String(s.lineHeight))
    root.style.setProperty('--page-width', s.pageWidth + 'px')
  }, [db.settings])

  // 快捷键
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
      }
      if (e.key === 'Escape') setSearchOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const pickWork = (id: string) => {
    setCurId(id)
    localStorage.setItem(K_CUR, id)
  }

  const title =
    view === 'shelf'
      ? '书架'
      : view === 'write'
      ? curWork
        ? curWork.title
        : '写作台'
      : NAV.find((n) => n.key === view)!.label

  return (
    <div className="app">
      <aside className="rail">
        <div className="brand">
          <div className="brand-mark" />
          <div className="brand-text">
            <b>小说创作工作台</b>
            <span>网文长篇 · 全流程</span>
          </div>
        </div>
        <nav className="nav">
          {NAV.map((n) => (
            <button
              key={n.key}
              className={'nav-item' + (view === n.key ? ' on' : '')}
              onClick={() => setView(n.key)}
            >
              <i className="nav-dot" />
              <span>{n.label}</span>
              <span className="spacer" />
              <span style={{ fontSize: 11, opacity: 0.6 }}>{n.hint}</span>
            </button>
          ))}
        </nav>
        <div className="rail-foot">
          <div>存储：{adapter.label}</div>
          <div style={{ marginTop: 4 }}>Ctrl + K 全局搜索</div>
        </div>
      </aside>

      <div className="content">
        <header className="topbar">
          <h1>{title}</h1>
          {view === 'write' && curWork && (
            <span className="sub">
              {curWork.penName || '未署名'} · {curWork.genre} · {curWork.status}
            </span>
          )}
          <span className="sub" />
          <div className="spacer" />
          <button className="btn ghost sm" onClick={() => setSearchOpen(true)}>
            搜索 Ctrl+K
          </button>
          {db.works.length > 0 && view !== 'shelf' && view !== 'settings' && (
            <select
              className="select"
              style={{ width: 200 }}
              value={curWork?.id || ''}
              onChange={(e) => pickWork(e.target.value)}
            >
              {db.works.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.title}
                </option>
              ))}
            </select>
          )}
        </header>

        {view === 'shelf' && <Shelf onOpen={(id) => { pickWork(id); setView('write') }} />}
        {view === 'write' && (
          <WriteDesk
            work={curWork}
            onGoShelf={() => setView('shelf')}
            onOpenMaterial={(id) => {
              setMatOpenId(id || null)
              setView('materials')
            }}
          />
        )}
        {view === 'materials' && (
          <Materials work={curWork} openId={matOpenId} onOpened={() => setMatOpenId(null)} />
        )}
        {view === 'foreshadow' && <Foreshadows work={curWork} />}
        {view === 'stats' && <Stats work={curWork} />}
        {view === 'settings' && <SettingsPage />}
      </div>

      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} onGo={setView} />}
    </div>
  )
}

function SearchOverlay({ onClose, onGo }: { onClose: () => void; onGo: (v: View) => void }) {
  const db = getDB()
  const [q, setQ] = useState('')
  const res = useMemo(() => searchAll(db, q), [q])

  return (
    <div className="mask center" onClick={onClose}>
      <div className="modal" style={{ width: 680 }} onClick={(e) => e.stopPropagation()}>
        <input
          className="input"
          autoFocus
          placeholder="搜索正文、素材、伏笔…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div style={{ maxHeight: 420, overflow: 'auto', marginTop: 14 }}>
          {!q && <div className="muted" style={{ fontSize: 13 }}>输入关键词开始搜索</div>}
          {q && res.chapters.length === 0 && res.materials.length === 0 && res.foreshadows.length === 0 && (
            <div className="muted" style={{ fontSize: 13 }}>没有找到「{q}」</div>
          )}
          {res.chapters.length > 0 && (
            <>
              <div className="muted" style={{ fontSize: 12, margin: '10px 0 4px' }}>正文 · {res.chapters.length} 处</div>
              {res.chapters.map((c) => (
                <div key={c.id} className="side-card" style={{ background: 'var(--panel-2)', cursor: 'pointer' }}
                  onClick={() => { onGo('write'); onClose() }}>
                  <b>{c.work} / {c.title}</b>
                  <span className="t">{c.snippet}</span>
                </div>
              ))}
            </>
          )}
          {res.materials.length > 0 && (
            <>
              <div className="muted" style={{ fontSize: 12, margin: '10px 0 4px' }}>素材 · {res.materials.length} 条</div>
              {res.materials.map((m) => (
                <div key={m.id} className="side-card" style={{ background: 'var(--panel-2)', cursor: 'pointer' }}
                  onClick={() => { onGo('materials'); onClose() }}>
                  <b>{m.title || '（未命名）'} <span className="chip plain">{m.type}</span></b>
                  <span className="t">{m.snippet}</span>
                </div>
              ))}
            </>
          )}
          {res.foreshadows.length > 0 && (
            <>
              <div className="muted" style={{ fontSize: 12, margin: '10px 0 4px' }}>伏笔 · {res.foreshadows.length} 条</div>
              {res.foreshadows.map((f) => (
                <div key={f.id} className="side-card" style={{ background: 'var(--panel-2)', cursor: 'pointer' }}
                  onClick={() => { onGo('foreshadow'); onClose() }}>
                  <b>{f.desc}</b>
                  <span className="t">{f.status}</span>
                </div>
              ))}
            </>
          )}
        </div>
        <div className="right" style={{ marginTop: 12 }}>
          <button className="btn ghost sm" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  )
}
