import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useStore } from '../../store'

/** 달력 넣기: 달을 고르고 하루 칸 폭을 정하면, 누른 칸을 왼쪽 위로 M T W T F S S 달력이 그려진다 */
export function CalendarPicker({ x, y, cols, rows, cell }: { x: number; y: number; cols: number; rows: number; cell: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const now = new Date()
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() })
  // 점 안쪽 오른쪽 끝까지 남은 칸으로 하루 폭을 정한다 (2칸이 들어가면 2칸)
  const room = cols - 1 - x
  const [dayW, setDayW] = useState(room >= 14 ? 2 : 1)
  const [shift, setShift] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        useStore.getState().setPopup(null)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        useStore.getState().addCalendar(ym.y, ym.m, dayW)
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        e.stopPropagation()
        step(e.key === 'ArrowLeft' ? -1 : 1)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const bx = r.left - shift.x
    const by = r.top - shift.y
    const nx = bx < 8 ? 8 - bx : bx + r.width > window.innerWidth - 8 ? window.innerWidth - 8 - (bx + r.width) : 0
    const ny = by < 8 ? 8 - by : by + r.height > window.innerHeight - 8 ? window.innerHeight - 8 - (by + r.height) : 0
    if (Math.abs(nx - shift.x) > 0.5 || Math.abs(ny - shift.y) > 0.5) setShift({ x: nx, y: ny })
  })

  const step = (d: number) => setYm(({ y, m }) => ({ y: y + Math.floor((m + d) / 12), m: (m + d + 12) % 12 }))
  const offset = (new Date(ym.y, ym.m, 1).getDay() + 6) % 7
  const days = new Date(ym.y, ym.m + 1, 0).getDate()
  const weeks = Math.ceil((offset + days) / 7)
  const below = y < rows / 2
  const fits = 7 * dayW <= room && weeks + 1 <= rows - 1 - y

  return (
    <div
      ref={ref}
      className="icon-picker cal-picker"
      style={{
        left: (x + 0.5) * cell + shift.x,
        top: (below ? (y + 1) * cell + 8 : y * cell - 8) + shift.y,
        transform: below ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
      }}
      onPointerDown={(e) => e.preventDefault()}
      role="dialog"
      aria-label="달력 넣기"
    >
      <div className="ip-head">
        <span>달력 넣기</span>
        <div className="ip-sizes" role="group" aria-label="하루 칸 폭">
          {[1, 2].map((n) => (
            <button key={n} className={'ip-size' + (dayW === n ? ' on' : '')} onClick={() => setDayW(n)} aria-pressed={dayW === n}>
              하루 {n}칸
            </button>
          ))}
        </div>
      </div>
      <div className="cal-month">
        <button className="cal-nav" onClick={() => step(-1)} aria-label="이전 달">
          ‹
        </button>
        <span>
          {ym.y}년 {ym.m + 1}월
        </span>
        <button className="cal-nav" onClick={() => step(1)} aria-label="다음 달">
          ›
        </button>
      </div>
      <div className="cal-preview" aria-hidden>
        {[...'MTWTFSS'].map((d, i) => (
          <b key={'h' + i}>{d}</b>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <span key={'e' + i} />
        ))}
        {Array.from({ length: days }, (_, i) => (
          <span key={i}>{i + 1}</span>
        ))}
      </div>
      <p className="cal-note">
        {7 * dayW}칸 × {weeks + 1}줄{fits ? '' : ' · 자리가 모자라면 안쪽으로 맞춰 넣어요'}
      </p>
      <button className="btn primary cal-add" onClick={() => useStore.getState().addCalendar(ym.y, ym.m, dayW)}>
        넣기
      </button>
    </div>
  )
}
