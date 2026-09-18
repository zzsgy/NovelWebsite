import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  useDB,
  getPlan,
  updatePlan,
  addPlanCard,
  updatePlanCard,
  deletePlanCard,
  movePlanCard,
  composeChecklist,
  composeProgress,
  updateWork,
  workVolumes,
  workChapters,
  addVolume,
  updateVolume,
  deleteVolume,
  addChapter,
  updateChapterMeta,
  deleteChapter,
  addMaterial,
} from '../store'
import { countWords, fmtNum } from '../lib'
import { MaterialEditor, MaterialViewer } from '../components/MaterialDialog'
import { MaterialMiniCard } from '../components/MaterialPreview'
import type { ID, Material, Work, WorkPlan } from '../types'

/* ------------------------------ 板块定义 ------------------------------ */

type Section = 'overview' | 'world' | 'cast' | 'docs' | 'ideas' | 'outline'

const SECTIONS: { key: Section; mark: string; label: string; hint: string }[] = [
  { key: 'overview', mark: '概', label: '作品概览', hint: '定位与一句话故事' },
  { key: 'world', mark: '世', label: '世界观设定', hint: '规则与力量体系' },
  { key: 'cast', mark: '人', label: '人物阵容', hint: '主角 · 配角 · 反派' },
  { key: 'docs', mark: '资', label: '资料与考据', hint: '参考、名词、地名' },
  { key: 'ideas', mark: '思', label: '思路池', hint: '想法先记下来' },
  { key: 'outline', mark: '纲', label: '分卷大纲', hint: '每卷每章一句话' },
]

/** 支持 #write/outline 这类二级锚点，方便把某一板块存成书签 */
function initialSection(): Section {
  const p = (location.hash || '').replace('#', '').split('/')[1] as Section
  return SECTIONS.some((s) => s.key === p) ? p : 'overview'
}

type PlanTextField =
  | 'logline'
  | 'sellingPoint'
  | 'conflict'
  | 'audience'
  | 'tone'
  | 'ending'
  | 'worldview'
  | 'powerSystem'
  | 'notes'

const CAST_GROUPS = ['主角', '配角', '反派', '其他']

function castGroup(m: Material): string {
  const t = (m.tags || [])[0]
  return CAST_GROUPS.includes(t) ? t : '其他'
}

/* ------------------------------ 主组件 ------------------------------ */

export default function Compose({
  work,
  onStartDraft,
  onOpenMaterial,
  onWriteChapter,
}: {
  work: Work
  onStartDraft: () => void
  onOpenMaterial: (id?: ID) => void
  onWriteChapter: (id: ID) => void
}) {
  const db = useDB()
  const [sec, setSec] = useState<Section>(initialSection)
  /** 就地编辑素材卡，不再跳去素材库 */
  const [editing, setEditing] = useState<Material | null>(null)
  const [isNew, setIsNew] = useState(false)
  /** 点卡片看完整预览（居中弹窗） */
  const [viewing, setViewing] = useState<Material | null>(null)
  /** 默认只显示属于本书的素材 */
  const [includeGlobal, setIncludeGlobal] = useState(false)

  const go = (k: Section) => {
    setSec(k)
    history.replaceState(null, '', '#write/' + k)
  }

  // 地址栏里改二级锚点（或前进/后退）时，板块跟着切
  useEffect(() => {
    const onHash = () => {
      const p = (location.hash || '').replace('#', '').split('/')[1] as Section
      if (SECTIONS.some((s) => s.key === p)) setSec(p)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const plan = useMemo(() => getPlan(db, work.id), [db, work.id])
  const checklist = useMemo(() => composeChecklist(db, work.id), [db, work.id])
  const progress = useMemo(() => composeProgress(db, work.id), [db, work.id])
  const volumes = useMemo(() => workVolumes(db, work.id), [db, work.id])
  const chapters = useMemo(() => workChapters(db, work.id), [db, work.id])
  const inScope = (m: Material) =>
    m.workId === work.id || (includeGlobal && !m.workId)

  const people = useMemo(
    () => db.materials.filter((m) => m.type === '人物' && inScope(m)),
    [db.materials, work.id, includeGlobal]
  )
  const docs = useMemo(
    () => db.materials.filter((m) => m.type !== '人物' && inScope(m)),
    [db.materials, work.id, includeGlobal]
  )
  const framed = chapters.filter((c) => (c.outline || '').trim().length >= 5)

  return (
    <div className="writer">
      {/* 构思导航 */}
      <aside className="writer-side" style={{ width: 236, flex: '0 0 236px' }}>
        <div className="side-head">
          <b>构思</b>
          <span className="muted" style={{ fontSize: 11.5 }}>先想清楚再动笔</span>
        </div>
        <div className="side-body">
          {SECTIONS.map((s) => {
            const undone = checklist.filter((t) => t.section === s.key && !t.done).length
            const total = checklist.filter((t) => t.section === s.key).length
            return (
              <button
                key={s.key}
                className={'compose-nav' + (sec === s.key ? ' on' : '')}
                onClick={() => go(s.key)}
              >
                <i className="cm-mark">{s.mark}</i>
                <span className="cm-text">
                  <b>{s.label}</b>
                  <span>{s.hint}</span>
                </span>
                <div className="spacer" />
                {total > 0 &&
                  (undone === 0 ? (
                    <span className="badge g">已完成</span>
                  ) : (
                    <span className="badge">待填 {undone}</span>
                  ))}
              </button>
            )
          })}

          <div className="compose-tip">
            <b>构思案与正文分开存</b>
            <span>
              这里写的东西不计入字数，也不会生成版本快照。改起来没有心理负担，想到什么写什么。
            </span>
          </div>
        </div>
      </aside>

      {/* 中间内容 */}
      <div className="writer-main">
        <div className="editor-bar">
          <b style={{ fontSize: 13 }}>{SECTIONS.find((s) => s.key === sec)!.label}</b>
          <span className="muted">·</span>
          <span>{SECTIONS.find((s) => s.key === sec)!.hint}</span>
          <div className="spacer" />
          {sec === 'outline' && (
            <>
              <span className="muted">{framed.length}/{chapters.length} 章已有梗概</span>
              <button className="btn ghost sm" onClick={() => addVolume(work.id)}>＋ 卷</button>
            </>
          )}
          {(sec === 'cast' || sec === 'docs') && (
            <>
              <button
                className="btn ghost sm"
                title="「全局」素材指归属设为全局、所有作品都能看到；默认只看属于本书的"
                onClick={() => setIncludeGlobal(!includeGlobal)}
              >
                {includeGlobal ? '含全局素材 ✓' : '只看本书'}
              </button>
              {sec === 'cast' && (
                <button
                  className="btn ghost sm"
                  onClick={() => {
                    setIsNew(true)
                    setEditing(addMaterial('人物', work.id))
                  }}
                >
                  ＋ 新建人物
                </button>
              )}
              <button className="btn ghost sm" onClick={() => onOpenMaterial()} title="打开素材库管理全部卡片">
                素材库 →
              </button>
            </>
          )}
          {sec === 'ideas' && (
            <button className="btn ghost sm" onClick={() => addPlanCard(work.id)}>＋ 添加想法</button>
          )}
        </div>

        <div className="page compose-page">
          {sec === 'overview' && <Overview work={work} plan={plan} />}
          {sec === 'world' && <World plan={plan} workId={work.id} />}
          {sec === 'cast' && (
            <Cast
              people={people}
              onOpen={setViewing}
              onNew={() => {
                setIsNew(true)
                setEditing(addMaterial('人物', work.id))
              }}
            />
          )}
          {sec === 'docs' && <Docs workId={work.id} plan={plan} docs={docs} onOpen={setViewing} />}
          {sec === 'ideas' && <Ideas workId={work.id} plan={plan} />}
          {sec === 'outline' && (
            <Outline work={work} volumes={volumes} chapters={chapters} onWriteChapter={onWriteChapter} />
          )}
        </div>
      </div>

      {/* 右侧：完成度 */}
      <aside className="writer-side right">
        <div className="side-head">
          <b>构思完成度</b>
          <div className="spacer" />
          <span className="muted" style={{ fontSize: 11.5 }}>
            {progress.done}/{progress.total} 项
          </span>
        </div>
        <div className="side-body">
          <div className="side-card" style={{ padding: '14px 14px 12px' }}>
            <div className="compose-score">
              <b>{progress.pct}%</b>
              <span>构思完成度</span>
            </div>
            <div className="progress" style={{ marginTop: 10 }}>
              <i style={{ width: progress.pct + '%' }} />
            </div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
              {progress.pct >= 100
                ? '清单已全部完成，可以放心开写正文了。'
                : '不要求全部完成，但每一勾都是后面少改一次的理由。'}
            </div>
          </div>

          {checklist.map((t) => (
            <button
              key={t.key}
              className={'check-row' + (t.done ? ' done' : '')}
              onClick={() => go(t.section)}
            >
              <i className="check-dot">{t.done ? '✓' : ''}</i>
              <span className="check-text">
                <b>{t.label}</b>
                <span>{t.hint}</span>
              </span>
            </button>
          ))}

          <div className="side-card" style={{ marginTop: 12 }}>
            <b>准备好了就写正文</b>
            <span className="t">正文写作台支持自动保存、版本回滚与人物高亮</span>
            <button className="btn primary" style={{ width: '100%', justifyContent: 'center' }} onClick={onStartDraft}>
              开始写正文 →
            </button>
            {progress.pct < 60 && (
              <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
                提示：构思还没到 60%，也可以先写几章找找手感，随时回来补。
              </div>
            )}
          </div>
        </div>
      </aside>

      {editing && <MaterialEditor item={editing} isNew={isNew} onClose={() => setEditing(null)} />}
      {viewing && !editing && (
        <MaterialViewer
          item={viewing}
          onClose={() => setViewing(null)}
          onEdit={() => {
            setIsNew(false)
            setEditing(viewing)
            setViewing(null)
          }}
        />
      )}
    </div>
  )
}

/* ------------------------------ 可复用输入 ------------------------------ */

function LineInput({
  value,
  placeholder,
  onCommit,
  style,
  autoFocus,
}: {
  value: string
  placeholder?: string
  onCommit: (v: string) => void
  style?: CSSProperties
  autoFocus?: boolean
}) {
  const [v, setV] = useState(value)
  const last = useRef(value)
  useEffect(() => {
    if (value !== last.current) {
      last.current = value
      setV(value)
    }
  }, [value])
  return (
    <input
      className="input"
      style={style}
      autoFocus={autoFocus}
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        if (v !== last.current) {
          last.current = v
          onCommit(v)
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
    />
  )
}

function CommitTextarea({
  value,
  rows = 3,
  placeholder,
  onCommit,
  style,
}: {
  value: string
  rows?: number
  placeholder?: string
  onCommit: (v: string) => void
  style?: CSSProperties
}) {
  const [v, setV] = useState(value)
  const last = useRef(value)
  useEffect(() => {
    if (value !== last.current) {
      last.current = value
      setV(value)
    }
  }, [value])
  return (
    <textarea
      className="textarea"
      rows={rows}
      style={style}
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        if (v !== last.current) {
          last.current = v
          onCommit(v)
        }
      }}
    />
  )
}

/** 构思案长文输入：本地即时响应 + 500ms 防抖落库，避免每敲一个字就重写整个库 */
function PlanText({
  workId,
  field,
  rows = 4,
  placeholder,
  style,
}: {
  workId: ID
  field: PlanTextField
  rows?: number
  placeholder?: string
  style?: CSSProperties
}) {
  const db = useDB()
  const [v, setV] = useState<string>(() => String(getPlan(db, workId)[field] || ''))
  const timer = useRef<number | null>(null)
  const latest = useRef(v)
  latest.current = v

  useEffect(() => {
    return () => {
      if (timer.current) {
        window.clearTimeout(timer.current)
        updatePlan(workId, { [field]: latest.current } as Partial<WorkPlan>)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workId, field])

  const words = countWords(v)

  return (
    <>
      <textarea
        className="textarea"
        rows={rows}
        style={style}
        value={v}
        placeholder={placeholder}
        onChange={(e) => {
          setV(e.target.value)
          if (timer.current) window.clearTimeout(timer.current)
          timer.current = window.setTimeout(() => {
            timer.current = null
            updatePlan(workId, { [field]: e.target.value } as Partial<WorkPlan>)
          }, 500)
        }}
      />
      {words > 0 && (
        <div className="muted" style={{ fontSize: 11, marginTop: 3, textAlign: 'right' }}>{fmtNum(words)} 字</div>
      )}
    </>
  )
}

/* ------------------------------ 01 作品概览 ------------------------------ */

function Overview({ work, plan }: { work: Work; plan: WorkPlan }) {
  return (
    <div style={{ maxWidth: 940, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <section className="card">
        <div className="sec-title">
          <b>基本信息</b>
          <span>这些会显示在书架和写作台顶部</span>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <div className="field">
            <label>作品名</label>
            <LineInput value={work.title} onCommit={(v) => updateWork(work.id, { title: v || '未命名长篇' })} />
          </div>
          <div className="field">
            <label>笔名</label>
            <LineInput value={work.penName} placeholder="发布时使用的笔名" onCommit={(v) => updateWork(work.id, { penName: v })} />
          </div>
        </div>
        <div className="row">
          <div className="field">
            <label>题材</label>
            <LineInput value={work.genre} placeholder="玄幻 / 都市 / 悬疑…" onCommit={(v) => updateWork(work.id, { genre: v })} />
          </div>
          <div className="field">
            <label>连载状态</label>
            <select
              className="select"
              value={work.status}
              onChange={(e) => updateWork(work.id, { status: e.target.value as Work['status'] })}
            >
              {['构思', '连载', '完结', '搁置'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="row">
          <div className="field">
            <label>目标字数下限（万字）</label>
            <LineInput
              value={String(Math.round(work.targetMin / 10000))}
              onCommit={(v) => updateWork(work.id, { targetMin: Math.max(1, Number(v) || 100) * 10000 })}
            />
          </div>
          <div className="field">
            <label>目标字数上限（万字）</label>
            <LineInput
              value={String(Math.round(work.targetMax / 10000))}
              onCommit={(v) => updateWork(work.id, { targetMax: Math.max(1, Number(v) || 200) * 10000 })}
            />
          </div>
        </div>
      </section>

      <section className="card">
        <div className="sec-title">
          <b>故事内核</b>
          <span>写不清这三行，后面三十万字都会漂</span>
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <label>一句话故事 · 主角是谁、想要什么、被什么挡住</label>
          <PlanText
            workId={work.id}
            field="logline"
            rows={3}
            placeholder="例：一个守着旧书铺的年轻人，为查父亲失踪的真相，带着一枚被磨去字的铜钱一路北上。"
          />
        </div>
        <div className="row">
          <div className="field">
            <label>核心卖点 · 读者为什么追这本书</label>
            <PlanText workId={work.id} field="sellingPoint" rows={3} placeholder="爽点、悬念、情绪价值，挑最狠的两三条" />
          </div>
          <div className="field">
            <label>核心矛盾 · 贯穿全书的对抗线</label>
            <PlanText workId={work.id} field="conflict" rows={3} placeholder="谁挡着主角，为什么挡，什么时候能翻过去" />
          </div>
        </div>
        <div className="row">
          <div className="field">
            <label>目标读者</label>
            <PlanText workId={work.id} field="audience" rows={2} placeholder="男频/女频、偏好、阅读场景" />
          </div>
          <div className="field">
            <label>风格基调</label>
            <PlanText workId={work.id} field="tone" rows={2} placeholder="例：克制、阴冷、留白多，少用感叹句" />
          </div>
        </div>
        <div className="field">
          <label>预定结局 · 哪怕只有一句，也先钉住</label>
          <PlanText workId={work.id} field="ending" rows={2} placeholder="结局定不下来，中段就会反复推翻重写" />
        </div>
      </section>
    </div>
  )
}

/* ------------------------------ 02 世界观 ------------------------------ */

function World({ plan, workId }: { plan: WorkPlan; workId: ID }) {
  return (
    <div style={{ maxWidth: 940, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <section className="card">
        <div className="sec-title">
          <b>世界观与规则</b>
          <span>这个世界的硬规则，写正文时要反复回来核对</span>
        </div>
        <div style={{ marginTop: 10 }}>
          <PlanText
            workId={workId}
            field="worldview"
            rows={14}
            placeholder={
              '建议写清六件事：\n' +
              '1. 时代与技术水平（有没有火器、电报、修行）\n' +
              '2. 地理格局（几大区域、边界在哪、谁管哪）\n' +
              '3. 势力分布（朝廷、宗门、商会、外敌）\n' +
              '4. 规则与禁忌（什么能做、什么一做就死）\n' +
              '5. 货币与度量（一两银子能买什么，几百里要走几天）\n' +
              '6. 信息传递速度（消息多久能传到对面，这决定很多情节能不能成立）'
            }
          />
        </div>
      </section>

      <section className="card">
        <div className="sec-title">
          <b>力量 / 等级体系</b>
          <span>升级线是网文的主心骨，级差要能换算成战力</span>
        </div>
        <div style={{ marginTop: 10 }}>
          <PlanText
            workId={workId}
            field="powerSystem"
            rows={10}
            placeholder={
              '每一境写三样：怎么升、能干什么、代价是什么。\n' +
              '再补一条：越级挑战的边界在哪（能不能打、怎么打）。'
            }
          />
        </div>
      </section>

      <section className="card">
        <div className="sec-title"><b>写这块时的三个常见坑</b></div>
        <ul className="tips">
          <li>只有设定没有代价——能力越强越要付出，否则冲突立不住。</li>
          <li>规则前后不一致——写进正文前，先确认它没和前面某章冲突。</li>
          <li>信息传递过慢或过快——这直接决定「救援来不及」这类桥段成不成立。</li>
        </ul>
      </section>
    </div>
  )
}

/* ------------------------------ 03 人物阵容 ------------------------------ */

function Cast({
  people,
  onOpen,
  onNew,
}: {
  people: Material[]
  onOpen: (m: Material) => void
  onNew: () => void
}) {
  const grouped = CAST_GROUPS.map((g) => ({
    group: g,
    list: people
      .filter((m) => castGroup(m) === g)
      .sort((a, b) => (a.title || '').localeCompare(b.title || '', 'zh')),
  })).filter((x) => x.list.length > 0)

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto' }}>
      {people.length === 0 ? (
        <div className="card empty">
          <b>本书还没有登记人物</b>
          <div style={{ marginBottom: 14 }}>
            点下面的按钮直接在这里建卡，不用切到素材库。卡片用自由文本写，参考图可以直接拖进去。
          </div>
          <button className="btn primary" onClick={onNew}>＋ 新建主角</button>
        </div>
      ) : (
        <>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
            共 {people.length} 人。标签第一位填「主角 / 配角 / 反派」会自动分组；点卡片看完整预览，在预览里点「编辑」改。
          </div>
          {grouped.map(({ group, list }) => (
            <section key={group} style={{ marginBottom: 18 }}>
              <div className="sec-title" style={{ marginBottom: 8 }}>
                <b>{group}</b>
                <span>{list.length} 人</span>
              </div>
              <div className="grid grid-cast">
                {list.map((m) => (
                  <MaterialMiniCard
                    key={m.id}
                    item={m}
                    badge={group}
                    onClick={() => onOpen(m)}
                  />
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  )
}

/* ------------------------------ 04 资料 ------------------------------ */

function Docs({
  workId,
  plan,
  docs,
  onOpen,
}: {
  workId: ID
  plan: WorkPlan
  docs: Material[]
  onOpen: (m: Material) => void
}) {
  const byType = useMemo(() => {
    const m = new Map<string, Material[]>()
    docs.forEach((d) => {
      const list = m.get(d.type) || []
      list.push(d)
      m.set(d.type, list)
    })
    return Array.from(m.entries())
  }, [docs])

  return (
    <div style={{ maxWidth: 940, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <section className="card">
        <div className="sec-title">
          <b>资料笔记</b>
          <span>考据、参考来源、还没查清的问题，都可以堆在这里</span>
        </div>
        <div style={{ marginTop: 10 }}>
          <PlanText
            workId={workId}
            field="notes"
            rows={12}
            placeholder={
              '可以按这几类记：\n' +
              '· 参考书目 / 资料出处\n' +
              '· 需要核实的事实（写完这段前必须查清）\n' +
              '· 已有素材里没覆盖、但正文会反复用到的名词'
            }
          />
        </div>
      </section>

      <section className="card">
        <div className="sec-title">
          <b>本书资料 · 按类型</b>
          <span>共 {docs.length} 条，点名称看完整预览</span>
        </div>
        {docs.length === 0 ? (
          <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
            还没有地点、势力、词条类资料。在素材库里建卡时「归属」选本书，就会出现在这里。
          </div>
        ) : (
          byType.map(([type, list]) => (
            <div key={type} style={{ marginTop: 12 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                {type} · {list.length} 条
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {list.map((m) => (
                  <button key={m.id} className="pill" onClick={() => onOpen(m)}>
                    {m.title || '（未命名）'}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  )
}

/* ------------------------------ 05 思路池 ------------------------------ */

function Ideas({ workId, plan }: { workId: ID; plan: WorkPlan }) {
  const list = [...plan.ideas].sort((a, b) => a.order - b.order)
  const adopted = list.filter((c) => c.adopted).length

  return (
    <div style={{ maxWidth: 940, margin: '0 auto' }}>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
        共 {list.length} 条，已采用 {adopted} 条。不用管顺序好不好，先记下来；被采用的条目可以再往大纲里落。
      </div>
      {list.length === 0 ? (
        <div className="card empty">
          <b>思路池是空的</b>
          <div style={{ marginBottom: 14 }}>灵感一现的时候先丢进来，别让它停在脑子里。</div>
          <button className="btn primary" onClick={() => addPlanCard(workId)}>＋ 添加第一条想法</button>
        </div>
      ) : (
        list.map((c) => (
          <div className={'idea-card' + (c.adopted ? ' adopted' : '')} key={c.id}>
            <div className="idea-head">
              <span className="muted" style={{ fontSize: 11.5 }}>{String(c.order).padStart(2, '0')}</span>
              <LineInput
                value={c.title}
                placeholder="一句话标题，例如：铜钱上的字分四次给出"
                onCommit={(v) => updatePlanCard(workId, c.id, { title: v })}
              />
              <div className="spacer" />
              <button
                className={'btn sm ' + (c.adopted ? 'primary' : '')}
                onClick={() => updatePlanCard(workId, c.id, { adopted: !c.adopted })}
              >
                {c.adopted ? '已采用' : '采用'}
              </button>
            </div>
            <CommitTextarea
              value={c.body}
              rows={2}
              placeholder="展开写：这条想法怎么用、用在哪一卷"
              onCommit={(v) => updatePlanCard(workId, c.id, { body: v })}
            />
            <div className="idea-foot">
              <button className="btn ghost sm" onClick={() => movePlanCard(workId, c.id, -1)}>↑ 上移</button>
              <button className="btn ghost sm" onClick={() => movePlanCard(workId, c.id, 1)}>↓ 下移</button>
              <div className="spacer" />
              <button
                className="btn ghost sm"
                onClick={() => {
                  if (confirm('删除这条想法？')) deletePlanCard(workId, c.id)
                }}
              >
                删除
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  )
}

/* ------------------------------ 06 分卷大纲 ------------------------------ */

function Outline({
  work,
  volumes,
  chapters,
  onWriteChapter,
}: {
  work: Work
  volumes: ReturnType<typeof workVolumes>
  chapters: ReturnType<typeof workChapters>
  onWriteChapter: (id: ID) => void
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  return (
    <div style={{ maxWidth: 940, margin: '0 auto' }}>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
        大纲与正文共用同一套卷章结构：改标题、加章节在这里做，正文那边会同步。每章填一句话梗概，写作台右侧也会显示同一段文字。
      </div>

      {volumes.length === 0 && (
        <div className="card empty">
          <b>还没有分卷</b>
          <button className="btn primary" onClick={() => addVolume(work.id)}>＋ 新建第一卷</button>
        </div>
      )}

      {volumes.map((v) => {
        const list = chapters.filter((c) => c.volumeId === v.id)
        const open = !collapsed[v.id]
        const done = list.filter((c) => (c.outline || '').trim().length >= 5).length
        return (
          <section className="card vol-card" key={v.id}>
            <div className="vol-head">
              <button className="btn ghost sm" onClick={() => setCollapsed({ ...collapsed, [v.id]: open })}>
                {open ? '收起' : '展开'}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <LineInput value={v.title} onCommit={(t) => updateVolume(v.id, { title: t })} />
              </div>
              <span className="muted nowrap" style={{ fontSize: 12 }}>
                {list.length} 章 · {done} 章有梗概
              </span>
              <button
                className="btn ghost sm"
                onClick={() => {
                  const c = addChapter(work.id, v.id)
                  onWriteChapter(c.id)
                }}
              >
                ＋ 章
              </button>
              <button
                className="btn ghost sm"
                onClick={() => {
                  if (confirm(`删除「${v.title}」及其下 ${list.length} 章正文？此操作不可撤销。`)) deleteVolume(v.id)
                }}
              >
                ×
              </button>
            </div>

            <div className="field" style={{ marginTop: 8 }}>
              <label>本卷梗概 · 这一卷要讲完什么</label>
              <CommitTextarea
                value={v.outline || ''}
                rows={2}
                placeholder="例：雨夜叩门起笔，一枚断字铜钱牵出父亲失踪的旧事，主角被迫离城北上。"
                onCommit={(t) => updateVolume(v.id, { outline: t })}
              />
            </div>

            {open && (
              <div className="outline-list">
                {list.map((c, i) => {
                  const hasOutline = (c.outline || '').trim().length >= 5
                  const words = countWords(c.content)
                  return (
                    <div className="outline-row" key={c.id}>
                      <div className="ol-no">{i + 1}</div>
                      <div className="ol-title">
                        <LineInput value={c.title} onCommit={(t) => updateChapterMeta(c.id, { title: t })} />
                      </div>
                      <div className="ol-body">
                        <CommitTextarea
                          value={c.outline || ''}
                          rows={1}
                          placeholder="这一章发生了什么 · 一句话就够"
                          onCommit={(t) => updateChapterMeta(c.id, { outline: t })}
                        />
                      </div>
                      <div className="ol-state">
                        {hasOutline ? <span className="badge g">已规划</span> : <span className="badge a">待规划</span>}
                        <span className="muted" style={{ fontSize: 11 }}>{fmtNum(words)} 字</span>
                      </div>
                      <div className="ol-act">
                        <button className="btn ghost sm" onClick={() => onWriteChapter(c.id)}>
                          {words > 0 ? '继续写' : '开写'}
                        </button>
                        <button
                          className="btn ghost sm"
                          onClick={() => {
                            if (confirm(`删除「${c.title}」及其版本记录？此操作不可撤销。`)) deleteChapter(c.id)
                          }}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  )
                })}
                {list.length === 0 && (
                  <div className="muted" style={{ fontSize: 12.5, padding: '6px 2px' }}>本卷还没有章节</div>
                )}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
