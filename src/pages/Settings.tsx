import { useRef, useState } from 'react'
import {
  useDB,
  updateSettings,
  getDB,
  replaceDB,
  wipeAll,
  loadSample,
  adapter,
  hydrate,
} from '../store'
import { getImage, putImageFromDataURL, clearImages } from '../files'
import { cloudEnabled } from '../cloud'
import { useCloudStatus, stopCloud } from '../cloudStore'
import { countWords } from '../lib'
import type { Settings } from '../types'

const FONTS: { name: string; stack: string }[] = [
  {
    name: '阿里巴巴普惠体',
    stack: '"Alibaba PuHuiTi","AlibabaPuHuiTi-3","阿里巴巴普惠体","Microsoft YaHei",system-ui,sans-serif',
  },
  { name: '微软雅黑', stack: '"Microsoft YaHei","Microsoft YaHei UI",system-ui,sans-serif' },
  { name: '思源宋体', stack: '"Source Han Serif SC","Noto Serif CJK SC",SimSun,serif' },
  { name: '系统黑体', stack: '"Microsoft YaHei UI",SimHei,system-ui,sans-serif' },
]

const THEMES: { key: Settings['theme']; name: string; bg: string; panel: string; ink: string }[] = [
  { key: 'light', name: '浅色', bg: '#f4f7fa', panel: '#ffffff', ink: '#12233a' },
  { key: 'dark', name: '深色', bg: '#0e141c', panel: '#161f2a', ink: '#e8eef5' },
  { key: 'amber', name: '护眼黄', bg: '#efe7d3', panel: '#fbf6e9', ink: '#3a2f1c' },
  { key: 'green', name: '护眼绿', bg: '#e7efe4', panel: '#f7fbf5', ink: '#20301f' },
]

export default function SettingsPage() {
  const db = useDB()
  const s = db.settings
  const cloud = useCloudStatus()
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')
  const [wordInput, setWordInput] = useState('')

  const set = (patch: Partial<Settings>) => updateSettings(patch)

  const totalWords = db.chapters.reduce((n, c) => n + countWords(c.content), 0)

  const exportJSON = async () => {
    setMsg('正在收集图片附件…')
    const db = getDB()
    // 把 IndexedDB 里的图片一并转成 dataURL 嵌进备份，卡片只留 id 不丢图
    const ids = [...new Set(db.materials.flatMap((m) => m.images || []))]
    const images: { id: string; name: string; dataURL: string }[] = []
    for (const id of ids) {
      const rec = await getImage(id)
      if (!rec) continue
      const dataURL = await new Promise<string | null>((resolve) => {
        const fr = new FileReader()
        fr.onload = () => resolve(String(fr.result))
        fr.onerror = () => resolve(null)
        fr.readAsDataURL(rec.blob)
      })
      if (dataURL) images.push({ id, name: rec.name || id, dataURL })
    }
    const payload = { app: 'novel-studio', version: 2, db, images }
    const data = JSON.stringify(payload, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `小说创作工作台-备份-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    setMsg(`已导出备份文件${images.length > 0 ? `（含 ${images.length} 张图片）` : ''}。`)
  }

  const importJSON = async (f: File) => {
    try {
      const text = await f.text()
      const data = JSON.parse(text)
      // 兼容两种格式：新版 { app, version, db, images } 与旧版（直接就是 DB 对象）
      let dbData: any
      let images: { id: string; dataURL: string; name?: string }[] = []
      if (data && Array.isArray(data.works)) {
        dbData = data
      } else if (data && data.app === 'novel-studio' && data.db && Array.isArray(data.db.works)) {
        dbData = data.db
        images = Array.isArray(data.images) ? data.images : []
      } else {
        throw new Error('格式不对')
      }
      replaceDB(dbData)
      let restored = 0
      if (images.length > 0) {
        await clearImages()
        for (const img of images) {
          if (img && img.id && img.dataURL) {
            await putImageFromDataURL(img.dataURL, img.name || img.id, img.id)
            restored++
          }
        }
      }
      setMsg(
        `导入完成：${dbData.works.length} 部作品、${(dbData.chapters || []).length} 章` +
          (restored > 0 ? `、${restored} 张图片` : '') +
          '。'
      )
    } catch (e: any) {
      setMsg('导入失败：' + (e?.message || '文件无法解析'))
    }
  }

  return (
    <div className="page">
      <div className="page narrow">
        <div className="card" style={{ marginBottom: 16 }}>
          <b style={{ fontSize: 15 }}>界面与排版</b>
          <div className="setting-row">
            <div className="lab">主题</div>
            <div className="ctl">
              <div className="theme-pick">
                {THEMES.map((t) => (
                  <button
                    key={t.key}
                    className={s.theme === t.key ? 'on' : ''}
                    style={{ background: t.bg, position: 'relative' }}
                    title={t.name}
                    onClick={() => set({ theme: t.key })}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        inset: '8px 8px 8px 8px',
                        borderRadius: 5,
                        background: t.panel,
                        border: '1px solid ' + t.ink + '33',
                      }}
                    />
                  </button>
                ))}
              </div>
              <span className="muted" style={{ fontSize: 12.5 }}>
                {THEMES.find((t) => t.key === s.theme)?.name}
              </span>
            </div>
          </div>
          <div className="setting-row">
            <div className="lab">正文字体</div>
            <div className="ctl">
              <select className="select" style={{ maxWidth: 260 }} value={s.fontFamily} onChange={(e) => set({ fontFamily: e.target.value })}>
                {FONTS.map((f) => (
                  <option key={f.name} value={f.stack}>{f.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="setting-row">
            <div className="lab">字号</div>
            <div className="ctl">
              <input type="range" min={14} max={24} step={1} value={s.fontSize} onChange={(e) => set({ fontSize: Number(e.target.value) })} style={{ maxWidth: 240 }} />
              <span className="mono">{s.fontSize}px</span>
            </div>
          </div>
          <div className="setting-row">
            <div className="lab">行距</div>
            <div className="ctl">
              <input type="range" min={1.5} max={2.2} step={0.05} value={s.lineHeight} onChange={(e) => set({ lineHeight: Number(e.target.value) })} style={{ maxWidth: 240 }} />
              <span className="mono">{s.lineHeight.toFixed(2)}</span>
            </div>
          </div>
          <div className="setting-row">
            <div className="lab">编辑区页宽</div>
            <div className="ctl">
              <input type="range" min={700} max={1200} step={20} value={s.pageWidth} onChange={(e) => set({ pageWidth: Number(e.target.value) })} style={{ maxWidth: 240 }} />
              <span className="mono">{s.pageWidth}px</span>
            </div>
          </div>
          <div className="setting-row">
            <div className="lab">段首自动缩进</div>
            <div className="ctl">
              <button className={'switch' + (s.autoIndent ? ' on' : '')} onClick={() => set({ autoIndent: !s.autoIndent })} />
              <span className="muted" style={{ fontSize: 12.5 }}>每段首加两个全角空格（网文标准排版，导出时保留）</span>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <b style={{ fontSize: 15 }}>写作辅助</b>
          <div className="setting-row">
            <div className="lab">人物名高亮</div>
            <div className="ctl">
              <button className={'switch' + (s.highlightNames ? ' on' : '')} onClick={() => set({ highlightNames: !s.highlightNames })} />
              <span className="muted" style={{ fontSize: 12.5 }}>正文中已建卡的人物名以绿色标出</span>
            </div>
          </div>
          <div className="setting-row">
            <div className="lab">禁词提示</div>
            <div className="ctl">
              <button className={'switch' + (s.forbiddenCheck ? ' on' : '')} onClick={() => set({ forbiddenCheck: !s.forbiddenCheck })} />
              <span className="muted" style={{ fontSize: 12.5 }}>命中禁词库的词以琥珀色标出</span>
            </div>
          </div>
          <div className="setting-row">
            <div className="lab">打字机模式</div>
            <div className="ctl">
              <button className={'switch' + (s.typewriter ? ' on' : '')} onClick={() => set({ typewriter: !s.typewriter })} />
              <span className="muted" style={{ fontSize: 12.5 }}>正文上方留白，让光标始终靠中</span>
            </div>
          </div>
          <div className="setting-row">
            <div className="lab">显示字数进度</div>
            <div className="ctl">
              <button className={'switch' + (s.showWordProgress ? ' on' : '')} onClick={() => set({ showWordProgress: !s.showWordProgress })} />
            </div>
          </div>
          <div className="setting-row">
            <div className="lab">显示码字速度</div>
            <div className="ctl">
              <button className={'switch' + (s.showSpeed ? ' on' : '')} onClick={() => set({ showSpeed: !s.showSpeed })} />
            </div>
          </div>
          <div className="setting-row">
            <div className="lab">禁词库</div>
            <div className="ctl" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="input"
                  placeholder="输入一个词后回车或点添加"
                  value={wordInput}
                  onChange={(e) => setWordInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && wordInput.trim()) {
                      set({ forbiddenWords: Array.from(new Set([...s.forbiddenWords, wordInput.trim()])) })
                      setWordInput('')
                    }
                  }}
                />
                <button
                  className="btn"
                  onClick={() => {
                    if (wordInput.trim()) {
                      set({ forbiddenWords: Array.from(new Set([...s.forbiddenWords, wordInput.trim()])) })
                      setWordInput('')
                    }
                  }}
                >
                  添加
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {s.forbiddenWords.length === 0 && (
                  <span className="muted" style={{ fontSize: 12.5 }}>
                    还没有词。把平台容易判违规的词加进来，写作时会实时划线提示。
                  </span>
                )}
                {s.forbiddenWords.map((w) => (
                  <span key={w} className="chip a" style={{ cursor: 'pointer' }} onClick={() => set({ forbiddenWords: s.forbiddenWords.filter((x) => x !== w) })}>
                    {w} ×
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <b style={{ fontSize: 15 }}>写作目标</b>
          <div className="row" style={{ marginTop: 12 }}>
            <div className="field">
              <label>日更目标字数</label>
              <input className="input" type="number" value={s.dailyGoal} onChange={(e) => set({ dailyGoal: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label>单章目标字数</label>
              <input className="input" type="number" value={s.chapterGoal} onChange={(e) => set({ chapterGoal: Number(e.target.value) })} />
            </div>
          </div>
          <div className="muted" style={{ fontSize: 12.5 }}>
            当前为日更 {s.dailyGoal} 字、单章 {s.chapterGoal} 字。若两者不一致，统计页会按日更目标折算存稿可支撑天数。
          </div>
        </div>

        <div className="card">
          <b style={{ fontSize: 15 }}>数据与存储</b>
          {cloudEnabled ? (
            <div className="cloud-box">
              <div className="cloud-line">
                <span className={'dot' + (cloud.state === 'error' ? ' saving' : cloud.state === 'ok' || cloud.state === 'syncing' ? '' : ' off')} />
                <b>云端同步已开启</b>
                {cloud.user?.email && <span className="muted">{cloud.user.email}</span>}
              </div>
              <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.8 }}>
                {cloud.state === 'syncing' && '正在写入云端…'}
                {cloud.state === 'ok' && (cloud.message || '最近一次写入已同步。换台电脑用同一账号登录，即可接着写。')}
                {cloud.state === 'error' && cloud.message}
                {cloud.state === 'off' && '未登录。'}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                <button
                  className="btn sm"
                  onClick={async () => {
                    await hydrate()
                    setMsg('已从云端重新拉取最新数据。')
                  }}
                >
                  从云端重新拉取
                </button>
                <button
                  className="btn warn sm"
                  onClick={async () => {
                    if (confirm('退出登录？本机缓存会保留，重新登录后从云端同步。')) {
                      await stopCloud()
                      location.reload()
                    }
                  }}
                >
                  退出登录
                </button>
              </div>
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 12.5, margin: '10px 0 0', lineHeight: 1.9 }}>
              当前是本地开发环境，数据保存在浏览器本地。通过发布后的网址访问时，登录账号即可开启云端同步。
            </div>
          )}
          <div className="muted" style={{ fontSize: 12.5, margin: '12px 0 14px', lineHeight: 1.9 }}>
            当前数据保存在 <b>{adapter.label}</b>：{db.works.length} 部作品、{db.chapters.length} 章、
            {db.materials.length} 条素材、{db.foreshadows.length} 条伏笔，合计 {totalWords.toLocaleString('zh-CN')} 字。<br />
            备份文件包含全部文字内容与图片附件，可用于换机迁移或存档。
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn primary" onClick={exportJSON}>导出整库备份</button>
            <button className="btn" onClick={() => fileRef.current?.click()}>导入备份</button>
            <button className="btn" onClick={() => { loadSample(); setMsg('已载入示例数据，去书架看看。') }}>载入示例数据</button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) importJSON(f)
                e.target.value = ''
              }}
            />
            <div className="spacer" />
            <button
              className="btn warn"
              onClick={async () => {
                if (confirm('清空全部数据？包括所有作品、章节、素材与伏笔，且无法恢复。建议先导出备份。')) {
                  await wipeAll()
                  setMsg('已清空。')
                }
              }}
            >
              清空全部数据
            </button>
          </div>
          {msg && <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--blue)' }}>{msg}</div>}
        </div>
      </div>
    </div>
  )
}
