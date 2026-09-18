import { useEffect, useState } from 'react'
import { resolveImageURL } from '../files'
import { parseCard, type CardSection } from '../card'
import { fmtTime } from '../lib'
import type { Material } from '../types'

/** 小节标记的配色轮换：只用蓝 / 绿 / 琥珀三系 */
const MARKS = ['g', 'b', 'a'] as const

/**
 * 卡片预览。
 * 把自由文本排版成一张「档案」：头部是封面 + 名称 + 关键信息，
 * 下面每个小节一块，小节内是「标签｜内容」的行。
 */
export function MaterialPreview({
  item,
  appearances,
}: {
  item: Material
  appearances?: number
}) {
  const parsed = parseCard(item.body || '')
  const cover = item.images?.[0] || null
  const rest = (item.images || []).slice(1)
  const hasAny = parsed.head.length > 0 || parsed.lead.length > 0 || parsed.sections.length > 0

  // 顶栏字段：优先用头部字段；头部为空时把正文里第一个字段块自动提到顶栏展示
  let promoted: { section: number; block: number; rows: { k: string; v: string }[] } | null = null
  if (parsed.head.length === 0) {
    for (let si = 0; si < parsed.sections.length; si++) {
      const bi = parsed.sections[si].blocks.findIndex((b) => b.kind === 'fields')
      if (bi >= 0) {
        const b = parsed.sections[si].blocks[bi]
        promoted = { section: si, block: bi, rows: b.kind === 'fields' ? b.rows : [] }
        break
      }
    }
  }
  const topRows = parsed.head.length > 0 ? parsed.head : promoted?.rows ?? []
  const viewSections = parsed.sections
    .map((s, si) =>
      promoted && si === promoted.section
        ? { ...s, blocks: s.blocks.filter((_, bi) => bi !== promoted.block) }
        : s
    )
    .filter((s) => s.blocks.length > 0)

  return (
    <div className="mp">
      <div className={'mp-top' + (cover ? '' : ' no-cover')}>
        {cover && (
          <div className="mp-cover">
            <CoverImage id={cover} />
          </div>
        )}
        <div className="mp-topinfo">
          <div className="mp-chips">
            <span className="chip plain">{item.type}</span>
            {(item.tags || []).map((t) => (
              <span key={t} className="chip">{t}</span>
            ))}
          </div>
          <h2 className="mp-name">{item.title || '（未命名）'}</h2>
          {item.aliases && (
            <div className="mp-alias">
              <span>别名</span>
              <b>{item.aliases}</b>
            </div>
          )}
          {topRows.length > 0 && (
            <div className="mp-fields mp-head">
              {topRows.map((r, i) => (
                <div className="mp-field" key={i}>
                  <span className="k">{r.k}</span>
                  <span className="v">{r.v || '—'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {parsed.lead.length > 0 && (
        <div className="mp-lead">
          {parsed.lead.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      )}

      {viewSections.length > 0 && (
        <div className="mp-sections">
          {viewSections.map((s, i) => (
            <SectionView key={i} section={s} mark={MARKS[i % MARKS.length]} />
          ))}
        </div>
      )}

      {rest.length > 0 && (
        <div className="mp-gallery">
          {rest.map((id) => (
            <CoverImage key={id} id={id} small />
          ))}
        </div>
      )}

      {!hasAny && (
        <div className="mp-blank">这张卡还没有内容，点「编辑」写点什么。</div>
      )}

      <div className="mp-foot">
        {appearances !== undefined && <span>正文出现 {appearances} 次</span>}
        <span>更新于 {fmtTime(item.updatedAt)}</span>
      </div>
    </div>
  )
}

function SectionView({ section, mark }: { section: CardSection; mark: (typeof MARKS)[number] }) {
  return (
    <section className={'mp-sec' + (mark === 'g' ? ' g' : mark === 'a' ? ' a' : '')}>
      <div className="mp-sec-head">
        <i className="mp-sec-mark" />
        <b>{section.title}</b>
      </div>
      <div className="mp-sec-body">
        {section.blocks.map((b, i) => {
          if (b.kind === 'fields') {
            return (
              <div className="mp-fields" key={i}>
                {b.rows.map((r, j) => (
                  <div className="mp-field" key={j}>
                    <span className="k">{r.k}</span>
                    <span className="v">{r.v || '—'}</span>
                  </div>
                ))}
              </div>
            )
          }
          if (b.kind === 'list') {
            return (
              <ul className="mp-list" key={i}>
                {b.items.map((it, j) => (
                  <li key={j}>{it}</li>
                ))}
              </ul>
            )
          }
          return (
            <p className="mp-para" key={i}>
              {b.text}
            </p>
          )
        })}
        {section.blocks.length === 0 && <div className="mp-empty">这一节还没写</div>}
      </div>
    </section>
  )
}

function CoverImage({ id, small }: { id: string; small?: boolean }) {
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

  if (!url) return <div className={'mp-img' + (small ? ' sm' : '') + ' loading'} />
  return <img className={'mp-img' + (small ? ' sm' : '')} src={url} alt="" />
}

/**
 * 列表里用的小卡：封面缩略图 + 名称 + 关键字段。
 * 和详情预览同一套解析逻辑，所以写正文的写法在这边也能看出结构。
 */
export function MaterialMiniCard({
  item,
  onClick,
  appearances,
  badge,
}: {
  item: Material
  onClick?: () => void
  appearances?: number
  badge?: string
}) {
  const parsed = parseCard(item.body || '')
  const cover = item.images?.[0] || null
  const firstFields = parsed.sections.flatMap((s) => s.blocks).find((b) => b.kind === 'fields')
  const rows = (parsed.head.length
    ? parsed.head
    : firstFields && firstFields.kind === 'fields'
    ? firstFields.rows
    : []
  ).slice(0, 4)
  const secCount = parsed.sections.length
  const text = parsed.lead[0] || ''
  const empty = !text && rows.length === 0 && secCount === 0

  return (
    <div className="mc" onClick={onClick}>
      {cover && (
        <div className="mc-cover">
          <CoverImage id={cover} />
        </div>
      )}
      <div className="mc-body">
        <div className="mc-top">
          {badge && <span className="chip plain">{badge}</span>}
          <b className="mc-name">{item.title || '（未命名）'}</b>
          {secCount > 0 && <span className="badge">{secCount} 节</span>}
        </div>
        {item.aliases && <div className="mc-alias">别名：{item.aliases}</div>}
        {text && <div className="mc-text">{text}</div>}
        {empty && <div className="mc-text muted">还没有内容</div>}
        {rows.length > 0 && (
          <div className="mc-rows">
            {rows.map((r, i) => (
              <span key={i} className="mc-row">
                <i>{r.k}</i>
                {r.v || '—'}
              </span>
            ))}
          </div>
        )}
        <div className="mc-foot">
          {(item.tags || []).map((t) => (
            <span key={t} className="chip plain">{t}</span>
          ))}
          <div className="spacer" />
          {appearances !== undefined && <span className="muted">正文 {appearances} 次</span>}
        </div>
      </div>
    </div>
  )
}
