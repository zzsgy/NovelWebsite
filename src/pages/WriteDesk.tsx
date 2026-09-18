import { useEffect, useState } from 'react'
import { composeProgress, draftWords, getDB, useDB } from '../store'
import { fmtNum } from '../lib'
import type { ID, Work } from '../types'
import Compose from './Compose'
import Workbench from './Workbench'

type Phase = 'compose' | 'draft'

const K_PHASE = 'novel-studio:phase:'

/**
 * 写作台外壳：把「构思」和「写正文」拆成两个阶段。
 * 新建作品默认先落在构思台——先把设定、思路、资料、大纲想清楚，再动笔写正文。
 */
export default function WriteDesk({
  work,
  onGoShelf,
  onOpenMaterial,
}: {
  work: Work | null
  onGoShelf: () => void
  /** 打开素材库；带 id 时直接拉开那张卡 */
  onOpenMaterial: (id?: ID) => void
}) {
  const db = useDB()
  const [phase, setPhase] = useState<Phase>('compose')
  const [jumpCh, setJumpCh] = useState<ID | null>(null)

  const workId = work?.id || null

  useEffect(() => {
    if (!workId) return
    const decide = () => {
      // 地址栏带板块深链（#write/<板块>）时，强制落在构思台——不论阶段记忆与字数
      const board = location.hash.replace(/^#write\/?/, '')
      if (board) {
        setPhase('compose')
        return
      }
      const saved = localStorage.getItem(K_PHASE + workId)
      if (saved === 'compose' || saved === 'draft') {
        setPhase(saved)
        return
      }
      // 没写过正文的作品，默认进构思台
      setPhase(draftWords(getDB(), workId) > 0 ? 'draft' : 'compose')
    }
    decide()
    const onHash = () => {
      // 会话内把地址改成 #write/<板块> 时（含前进后退），也切到构思台
      if (location.hash.replace(/^#write\/?/, '')) setPhase('compose')
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [workId])

  const pick = (p: Phase) => {
    setPhase(p)
    if (workId) localStorage.setItem(K_PHASE + workId, p)
  }

  if (!work || workId === null) {
    return (
      <div className="page">
        <div className="card empty">
          <b>还没有作品</b>
          <div style={{ marginBottom: 16 }}>先去书架新建一部作品，再回来构思和写作。</div>
          <button className="btn primary" onClick={onGoShelf}>去书架</button>
        </div>
      </div>
    )
  }

  const progress = composeProgress(db, workId)
  const words = draftWords(db, workId)

  return (
    <div className="desk">
      <div className="phase-bar">
        <div className="seg">
          <button
            className={'seg-btn' + (phase === 'compose' ? ' on' : '')}
            onClick={() => pick('compose')}
          >
            构思台
          </button>
          <button
            className={'seg-btn' + (phase === 'draft' ? ' on' : '')}
            onClick={() => pick('draft')}
          >
            正文写作
          </button>
        </div>

        <span className="muted" style={{ fontSize: 12 }}>
          {phase === 'compose'
            ? '先把题材定位、世界观、人物、资料和大纲想清楚，再动笔'
            : '正文会自动保存，并按节奏生成版本快照'}
        </span>

        <div className="spacer" />

        <div className="phase-meter" title="构思完成度">
          <span className="muted" style={{ fontSize: 11.5 }}>构思</span>
          <span className="progress-strip" style={{ maxWidth: 90 }}>
            <i style={{ width: progress.pct + '%' }} />
          </span>
          <span style={{ fontSize: 11.5 }}>{progress.pct}%</span>
        </div>
        <span className="muted" style={{ fontSize: 11.5 }}>正文 {fmtNum(words)} 字</span>

        {phase === 'compose' ? (
          <button className="btn primary sm" onClick={() => pick('draft')}>开始写正文 →</button>
        ) : (
          <button className="btn sm" onClick={() => pick('compose')}>返回构思台</button>
        )}
      </div>

      {phase === 'compose' ? (
        <Compose
          work={work}
          onStartDraft={() => pick('draft')}
          onOpenMaterial={onOpenMaterial}
          onWriteChapter={(id) => {
            setJumpCh(id)
            pick('draft')
          }}
        />
      ) : (
        <Workbench work={work} onGoShelf={onGoShelf} jumpToChapterId={jumpCh} />
      )}
    </div>
  )
}
