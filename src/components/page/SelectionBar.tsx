import { useLayoutEffect, useRef, useState } from 'react'
import { elBox } from '../../geometry'
import { TextStyleButton } from '../TextStylePanel'
import { useStore } from '../../store'
import { HIGHLIGHT_COLORS, INK_COLORS, type El } from '../../types'

/** 고른 것 위에 뜨는 작은 막대: 지우기, 복제, 굵게, 고르기 해제 */
export function SelectionBar({ elements, selection, cell, cols, leaving }: { elements: El[]; selection: string[]; cell: number; cols: number; leaving?: boolean }) {
  const barRef = useRef<HTMLDivElement>(null)
  const [shift, setShift] = useState(0)
  const sel = elements.filter((e) => selection.includes(e.id))
  // 화면 밖으로 나가지 않게 좌우로 밀어 넣는다
  useLayoutEffect(() => {
    const el = barRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const base = r.left - shift
    const fix = base < 8 ? 8 - base : base + r.width > window.innerWidth - 8 ? window.innerWidth - 8 - (base + r.width) : 0
    if (Math.abs(fix - shift) > 0.5) setShift(fix)
  })
  if (!sel.length) return null
  const boxes = sel.map(elBox)
  const x1 = Math.min(...boxes.map((b) => b.x1))
  const x2 = Math.max(...boxes.map((b) => b.x2))
  const y1 = Math.min(...boxes.map((b) => b.y1))
  const y2 = Math.max(...boxes.map((b) => b.y2))
  const below = y1 < 2.5
  const cx = Math.min(Math.max((x1 + x2) / 2, 3), cols - 3)
  const hasText = sel.some((e) => e.type === 'text' || e.type === 'box')
  // 색을 바꿀 수 있는 것: 펜 색(글자·네모칸·아이콘·기호·선)과 형광펜 색은 고를 색이 달라서 따로
  const ink = sel.filter((e) => e.type === 'text' || e.type === 'box' || e.type === 'icon' || e.type === 'bullet' || e.type === 'line')
  const marks = sel.filter((e) => e.type === 'mark')
  const st = useStore.getState()
  return (
    <div
      ref={barRef}
      className={'sel-bar' + (below ? ' below' : '') + (leaving ? ' leaving' : '')}
      style={{ left: cx * cell + shift, top: below ? y2 * cell + 8 : y1 * cell - 8 }}
      onPointerDown={(e) => e.preventDefault()}
    >
      <span className="sel-count">{selection.length}개</span>
      <button onClick={() => st.deleteSelection()} title="지우기 (Delete)">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13" />
        </svg>
        지우기
      </button>
      <button onClick={() => st.copySelection()} title="복사 (⌘C) — 빈 칸을 고르고 ⌘V, 또는 칸을 한 번 더 눌러 붙여넣기">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
          <rect x="8" y="3" width="12" height="15" rx="2" />
          <path d="M5 7v12a2 2 0 002 2h9" />
        </svg>
        복사
      </button>
      <button onClick={() => st.duplicateSelection()} title="복제 (한 칸 옆에)">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7">
          <rect x="8" y="8" width="12" height="12" rx="2" />
          <path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3" />
        </svg>
        복제
      </button>
      {hasText && <TextStyleButton className="sel-style" label="글자" />}
      {ink.length > 0 && <ColorDot items={ink} colors={INK_COLORS} fallback={INK_COLORS[0].color} label="색" below={below} onPick={(c) => st.recolorSelection(c, 'ink')} />}
      {marks.length > 0 && (
        <ColorDot items={marks} colors={HIGHLIGHT_COLORS} fallback={HIGHLIGHT_COLORS[0].color} label="형광펜 색" below={below} onPick={(c) => st.recolorSelection(c, 'mark')} />
      )}
      <button onClick={() => st.setSelection([])} title="고르기 해제 (Esc)" aria-label="고르기 해제">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  )
}

/** 고른 것 막대의 컬러점: 지금 색을 보여주고, 누르면 고를 색들이 펼쳐진다. 색이 섞여 있으면 여러 색 점 */
function ColorDot({
  items,
  colors,
  fallback,
  label,
  below,
  onPick,
}: {
  items: El[]
  colors: { name: string; color: string }[]
  fallback: string
  label: string
  below: boolean
  onPick: (color: string) => void
}) {
  const [open, setOpen] = useState(false)
  const colorOf = (e: El) => (e as { color?: string }).color ?? fallback
  const cur = colorOf(items[0])
  const mixed = items.some((e) => colorOf(e) !== cur)
  return (
    <span className="sel-color-wrap">
      <button className={'sel-color' + (open ? ' on' : '')} onClick={() => setOpen((v) => !v)} title={label + ' 바꾸기'} aria-label={label + ' 바꾸기'} aria-expanded={open}>
        <span
          className={'sel-color-dot' + (mixed ? ' mixed' : '')}
          style={mixed ? { background: `conic-gradient(${colors.slice(0, 4).map((c, i) => `${c.color} 0 ${(i + 1) * 25}%`).join(', ')})` } : { background: cur }}
        />
      </button>
      {open && (
        <span className={'sel-palette' + (below ? ' below' : '')} role="listbox" aria-label={label}>
          {colors.map((c) => (
            <button
              key={c.color}
              role="option"
              aria-selected={!mixed && c.color === cur}
              className={!mixed && c.color === cur ? 'on' : undefined}
              onClick={() => {
                onPick(c.color)
                setOpen(false)
              }}
              title={c.name}
              aria-label={c.name}
            >
              <span className="sel-color-dot" style={{ background: c.color }} />
            </button>
          ))}
        </span>
      )}
    </span>
  )
}
