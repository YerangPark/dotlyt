import { useEffect, useId, useRef, useState } from 'react'
import { fontOf } from '../fonts'
import { FONT_SIZE, fontSizeOf, textAnchor, textMidY } from '../geometry'
import { spreadStart, useStore } from '../store'
import { isLight, type Page } from '../types'
import { DeletePageDialog } from './DeletePageDialog'
import { BoxText, BulletGlyph, IconGlyph, InkLine, MarkGlyph, boldProps } from './page/glyphs'

/** 페이지 한 장을 작게 그린 미리보기 (읽기 전용) */
export function PageThumb({ page, no }: { page: Page; no?: number }) {
  const uid = useId().replace(/:/g, '')
  const dots = 'tdots' + uid
  const pencil = 'tpencil' + uid
  const { cols, rows, elements } = page
  return (
    <svg className="thumb-svg" viewBox={`0 0 ${cols} ${rows}`} preserveAspectRatio="xMidYMid meet" aria-hidden>
      <defs>
        <pattern id={dots} x={-0.5} y={-0.5} width={1} height={1} patternUnits="userSpaceOnUse">
          <circle cx={0.5} cy={0.5} r={0.055} className="dot" />
        </pattern>
        <filter id={pencil} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="9" numOctaves="2" seed="3" result="grain" />
          <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.5 1.5" result="mask" />
          <feComposite in="SourceGraphic" in2="mask" operator="in" />
        </filter>
      </defs>
      <rect width={cols} height={rows} className="paper" />
      <rect x={0.5} y={0.5} width={cols - 1} height={rows - 1} fill={`url(#${dots})`} />
      {no !== undefined && (
        <text x={cols / 2} y={rows - 0.42} fontSize={0.36} textAnchor="middle" dominantBaseline="central" className="page-no-mark">
          {no}
        </text>
      )}
      {elements.map((el) => {
        if (el.type === 'mark') return <MarkGlyph key={el.id} el={el} />
        if (el.type === 'line') return <InkLine key={el.id} line={el} filterId={pencil} />
        if (el.type === 'bullet') return <BulletGlyph key={el.id} b={el} elements={elements} />
        if (el.type === 'icon') return <IconGlyph key={el.id} el={el} />
        if (el.type === 'box') return <BoxText key={el.id} el={el} />
        const f = fontOf(el.font)
        const fs = fontSizeOf(el.size) * f.scale
        return (
          <text
            key={el.id}
            x={textAnchor(el).x}
            textAnchor={textAnchor(el).anchor}
            y={el.y + textMidY(el.valign, fontSizeOf(el.size) * fontOf(el.font).scale)}
            dominantBaseline="central"
            fontSize={fs}
            fontFamily={f.family}
            className="ink-text"
            {...boldProps(el.bold, fs / FONT_SIZE, el.color)}
            style={el.color ? { fill: el.color } : undefined}
          >
            {el.text}
          </text>
        )
      })}
    </svg>
  )
}

/**
 * 모든 페이지 모아보기: 누르면 그 페이지로, 끌면 순서 바꾸기, 체크해서 여러 장 지우기.
 * 펼침면(PC)에서는 두 장씩 짝지어 보여준다.
 */
export function PagesOverview({ onClose }: { onClose: () => void }) {
  const pages = useStore((s) => s.pages)
  const currentPageId = useStore((s) => s.currentPageId)
  const spread = useStore((s) => s.spread)
  const movePage = useStore((s) => s.movePage)
  const goToPage = useStore((s) => s.goToPage)
  const [checked, setChecked] = useState<string[]>([])
  const [confirm, setConfirm] = useState(false)
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; sx: number; sy: number; moved: boolean } | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  // 지운 페이지는 체크에서 뺀다
  const live = checked.filter((id) => pages.some((p) => p.id === id))
  const allChecked = live.length === pages.length && pages.length > 0

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !confirm) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, confirm])

  const curIdx = pages.findIndex((p) => p.id === currentPageId)
  const curSpread = spread ? spreadStart(curIdx) : curIdx

  /** 끄는 중인 손 위치에 따라 끼워 넣을 자리 (0 ~ pages.length) */
  const targetIndex = (clientX: number, clientY: number) => {
    const cards = [...(gridRef.current?.querySelectorAll<HTMLElement>('.ov-card') ?? [])]
    let best = pages.length
    let bestDist = Infinity
    cards.forEach((c) => {
      const r = c.getBoundingClientRect()
      const i = Number(c.dataset.index)
      // 같은 줄(세로로 겹치는) 카드 기준으로 왼쪽 절반이면 앞에, 오른쪽 절반이면 뒤에
      const dy = clientY < r.top ? r.top - clientY : clientY > r.bottom ? clientY - r.bottom : 0
      const dx = clientX < r.left ? r.left - clientX : clientX > r.right ? clientX - r.right : 0
      const d = dy * 3 + dx
      if (d < bestDist) {
        bestDist = d
        best = clientX < r.left + r.width / 2 ? i : i + 1
      }
    })
    return best
  }

  const toggle = (id: string) => setChecked((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))

  // 펼침면이면 두 장씩 묶어서 보여준다
  const groups: { start: number; pages: Page[] }[] = []
  const step = spread ? 2 : 1
  for (let i = 0; i < pages.length; i += step) groups.push({ start: i, pages: pages.slice(i, i + step) })

  const dragging = drag?.moved ? pages.find((p) => p.id === drag.id) : undefined

  return (
    <div className="overview" role="dialog" aria-label="모든 페이지">
      <header className="ov-head">
        <div className="ov-title">
          <h2>모든 페이지</h2>
          <span className="muted">{pages.length}쪽 · 끌어서 순서 바꾸기</span>
        </div>
        <div className="ov-actions">
          <button className="btn ghost" onClick={() => setChecked(allChecked ? [] : pages.map((p) => p.id))}>
            {allChecked ? '선택 해제' : '전체 선택'}
          </button>
          <button className="btn primary danger-fill" disabled={!live.length} onClick={() => setConfirm(true)}>
            {live.length ? `${live.length}장 지우기` : '지우기'}
          </button>
          <button className="icon-btn" onClick={onClose} aria-label="닫기" title="닫기 (Esc)">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </header>

      <div
        className={'ov-grid' + (spread ? ' spread' : '')}
        ref={gridRef}
        onPointerMove={(e) => {
          if (!drag) return
          const moved = drag.moved || Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6
          setDrag({ ...drag, x: e.clientX, y: e.clientY, moved })
          if (moved) setDropAt(targetIndex(e.clientX, e.clientY))
        }}
        onPointerUp={() => {
          if (!drag) return
          if (drag.moved && dropAt !== null) {
            const from = pages.findIndex((p) => p.id === drag.id)
            movePage(drag.id, dropAt > from ? dropAt - 1 : dropAt)
          } else if (!drag.moved) {
            goToPage(drag.id)
            onClose()
          }
          setDrag(null)
          setDropAt(null)
        }}
        onPointerCancel={() => {
          setDrag(null)
          setDropAt(null)
        }}
      >
        {groups.map((g) => (
          <div key={g.pages[0].id} className={'ov-group' + (g.start === curSpread ? ' current' : '')}>
            {g.pages.map((p, k) => {
              const i = g.start + k
              const on = live.includes(p.id)
              return (
                <div
                  key={p.id}
                  className={
                    'ov-card' +
                    (on ? ' checked' : '') +
                    (drag?.moved && drag.id === p.id ? ' lifted' : '') +
                    (dropAt === i ? ' drop-before' : '') +
                    (dropAt === i + 1 && i === pages.length - 1 ? ' drop-after' : '')
                  }
                  data-index={i}
                  onPointerDown={(e) => {
                    if (e.pointerType === 'mouse' && e.button !== 0) return
                    if ((e.target as HTMLElement).closest('.ov-check')) return
                    e.preventDefault()
                    gridRef.current?.setPointerCapture?.(e.pointerId)
                    setDrag({ id: p.id, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false })
                  }}
                >
                  <div className="ov-thumb" style={{ aspectRatio: `${p.cols} / ${p.rows}` }}>
                    <PageThumb page={p} />
                    {p.index && (
                      <span
                        className="ov-tab"
                        style={{ background: p.index.color, color: isLight(p.index.color) ? '#2b2a28' : '#fbf8f1' }}
                      >
                        {p.index.name}
                      </span>
                    )}
                  </div>
                  <div className="ov-meta">
                    <label className="ov-check" onPointerDown={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={on} onChange={() => toggle(p.id)} aria-label={`${i + 1}쪽 선택`} />
                    </label>
                    <span className="ov-no">{i + 1}쪽</span>
                    {p.elements.length === 0 && <span className="ov-empty">빈 페이지</span>}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {dragging && drag && (
        <div className="ov-ghost" style={{ left: drag.x, top: drag.y, aspectRatio: `${dragging.cols} / ${dragging.rows}` }}>
          <PageThumb page={dragging} />
        </div>
      )}

      {confirm && (
        <DeletePageDialog
          ids={live}
          label={live.length === 1 ? `${pages.findIndex((p) => p.id === live[0]) + 1}쪽` : `고른 ${live.length}장`}
          onClose={() => setConfirm(false)}
        />
      )}
    </div>
  )
}
