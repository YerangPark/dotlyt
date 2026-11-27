import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ICONS, ICON_GROUPS } from '../../icons'
import { useStore } from '../../store'

/** 아이콘 고르기: 칸 옆에 떠서, 크기(1~3칸)를 정하고 아이콘을 누르면 그 칸에 들어간다 */
export function IconPicker({ x, y, cols, rows, cell, replacing }: { x: number; y: number; cols: number; rows: number; cell: number; replacing: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const size = useStore((s) => s.iconSize)
  const color = useStore((s) => s.lineStyle.color)
  const [shift, setShift] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        useStore.getState().setPopup(null)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  // 화면 밖으로 나가지 않게
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const bx = r.left - shift.x
    const by = r.top - shift.y
    const nx = bx < 8 ? 8 - bx : bx + r.width > window.innerWidth - 8 ? window.innerWidth - 8 - (bx + r.width) : 0
    const ny = by < 8 ? 8 - by : by + r.height > window.innerHeight - 8 ? window.innerHeight - 8 - (by + r.height) : 0
    if (Math.abs(nx - shift.x) > 0.5 || Math.abs(ny - shift.y) > 0.5) setShift({ x: nx, y: ny })
  })

  const below = y < rows / 2
  const st = useStore.getState()
  void cols
  return (
    <div
      ref={ref}
      className="icon-picker"
      style={{
        left: (x + 0.5) * cell + shift.x,
        top: (below ? (y + 1) * cell + 8 : y * cell - 8) + shift.y,
        transform: below ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
      }}
      onPointerDown={(e) => e.preventDefault()}
      role="dialog"
      aria-label="아이콘 고르기"
    >
      <div className="ip-head">
        <span>{replacing ? '아이콘 바꾸기' : '아이콘 넣기'}</span>
        <div className="ip-sizes" role="group" aria-label="크기">
          {([1, 2, 3] as const).map((n) => (
            <button key={n} className={'ip-size' + (size === n ? ' on' : '')} onClick={() => st.setIconSize(n)} aria-pressed={size === n}>
              {n}칸
            </button>
          ))}
        </div>
      </div>
      <div className="ip-body">
        {ICON_GROUPS.map((g) => (
          <div key={g} className="ip-group">
            <div className="ip-label">{g}</div>
            <div className="ip-grid">
              {ICONS.filter((i) => i.group === g).map((i) => (
                <button key={i.key} className="ip-icon" title={i.label} aria-label={i.label} onClick={() => st.addIcon(i.key)}>
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d={i.d} />
                  </svg>
                  <span>{i.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
