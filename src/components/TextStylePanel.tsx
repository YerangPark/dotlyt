import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { currentPage, useStore } from '../store'
import { DEFAULT_FONT, FONTS, fontOf, type FontInfo } from '../fonts'
import type { TextAlign, TextSize, TextVAlign } from '../types'
import { tip } from './Tooltip'

const SIZES: { size: TextSize; label: string; px: number }[] = [
  { size: 'm', label: '보통', px: 17 },
  { size: 's', label: '작게', px: 13.5 },
  { size: 'xs', label: '아주 작게', px: 10.5 },
]

const ALIGNS: { align: TextAlign; label: string; d: string }[] = [
  { align: 'left', label: '왼쪽', d: 'M4 6h16M4 10h10M4 14h16M4 18h10' },
  { align: 'center', label: '가운데', d: 'M4 6h16M7 10h10M4 14h16M7 18h10' },
  { align: 'right', label: '오른쪽', d: 'M4 6h16M10 10h10M4 14h16M10 18h10' },
  { align: 'justify', label: '양쪽', d: 'M4 6h16M4 10h16M4 14h16M4 18h16' },
]

const VALIGNS: { valign: TextVAlign; label: string; d: string }[] = [
  { valign: 'top', label: '위', d: 'M4 4h16M12 8v12M8 12l4-4 4 4' },
  { valign: 'middle', label: '가운데', d: 'M4 12h16M12 3v5M9 6l3 2 3-2M12 21v-5M9 18l3-2 3 2' },
  { valign: 'bottom', label: '아래', d: 'M4 20h16M12 4v12M8 12l4 4 4-4' },
]

/** 지금 쓰고 있거나 고른 글자의 스타일. 없으면 앞으로 쓸 글자의 기본값. */
function useCurrentStyle() {
  return useStore((s) => {
    const page = currentPage(s)
    const ids = s.cursor?.editId ? [s.cursor.editId] : s.selection
    const t = page?.elements.find((e) => ids.includes(e.id) && (e.type === 'text' || e.type === 'box'))
    const hasTarget = !!t
    const bold = t && (t.type === 'text' || t.type === 'box') ? !!t.bold : s.textBold
    const size = t && (t.type === 'text' || t.type === 'box') ? (t.size ?? 'm') : s.textSize
    const align = t && (t.type === 'text' || t.type === 'box') ? (t.align ?? 'left') : s.boxAlign
    const font = t && (t.type === 'text' || t.type === 'box') ? (t.font ?? DEFAULT_FONT) : s.textFont
    const valign = t && (t.type === 'text' || t.type === 'box') ? (t.valign ?? 'middle') : s.textValign
    return `${hasTarget ? 1 : 0}|${bold ? 1 : 0}|${size}|${align}|${font}|${valign}`
  })
}

/** 글씨체가 많아서 탭으로 나눠 보여준다 (열린 탭의 글씨체만 미리보기를 위해 불러온다) */
const FONT_TABS: { key: string; label: string; groups: FontInfo['group'][] }[] = [
  { key: 'hand', label: '손글씨', groups: ['손글씨'] },
  { key: 'plain', label: '고딕·명조', groups: ['고딕', '명조'] },
  { key: 'deco', label: '제목·고정폭', groups: ['제목용', '고정폭'] },
]
const tabOf = (font: string) => FONT_TABS.find((t) => t.groups.includes(fontOf(font).group))?.key ?? 'hand'

type Rect = { left: number; top: number; right: number; bottom: number }

/** 지금 고쳐지는 글자들이 화면에서 차지하는 영역 (고른 것 표시, 글자 입력창) */
function targetRect(): Rect | null {
  const els = [
    ...document.querySelectorAll<Element>('.sel-box, .sel-line'),
    ...[...document.querySelectorAll<HTMLElement>('.ink-input')].filter((i) => i.offsetLeft > -1000),
  ]
  const rs = els.map((e) => e.getBoundingClientRect()).filter((r) => r.width || r.height)
  if (!rs.length) return null
  return {
    left: Math.min(...rs.map((r) => r.left)),
    top: Math.min(...rs.map((r) => r.top)),
    right: Math.max(...rs.map((r) => r.right)),
    bottom: Math.max(...rs.map((r) => r.bottom)),
  }
}

const overlaps = (a: Rect, b: Rect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top

/**
 * 패널 자리: 고친 결과가 보이도록 고른 글자를 가리지 않고, 누른 버튼도 가리지 않는 곳.
 * 글자 오른쪽 → 왼쪽 → 아래 → 위 순으로 화면 안에 들어가는 첫 자리. 고른 게 없으면 버튼 옆.
 */
function placePanel(btn: DOMRect, w: number, h: number, target: Rect | null): React.CSSProperties {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const gap = 12
  const clampX = (x: number) => Math.min(Math.max(8, x), vw - w - 8)
  const clampY = (y: number) => Math.min(Math.max(8, y), vh - h - 8)
  if (target) {
    const candidates = [
      { left: target.right + gap, top: clampY(target.top - 8) },
      { left: target.left - gap - w, top: clampY(target.top - 8) },
      { left: clampX(target.left), top: target.bottom + gap },
      { left: clampX(target.left), top: target.top - gap - h },
    ]
    // 1차: 글자도 버튼도 안 가리는 자리, 2차: 글자만 안 가리는 자리
    for (const avoidBtn of [true, false]) {
      for (const c of candidates) {
        const r = { left: c.left, top: c.top, right: c.left + w, bottom: c.top + h }
        const fits = r.left >= 8 && r.right <= vw - 8 && r.top >= 8 && r.bottom <= vh - 8
        if (fits && !overlaps(r, target) && !(avoidBtn && overlaps(r, btn))) return { left: r.left, top: r.top }
      }
    }
    // 어디에도 다 안 들어가면: 글자에서 공간이 더 넓은 쪽 끝으로
    const roomRight = vw - target.right
    const roomLeft = target.left
    return { left: roomRight >= roomLeft ? vw - w - 8 : 8, top: clampY(target.top - 8) }
  }
  if (vw < 720) {
    // 아래 도구 모음 위쪽으로
    return { left: clampX(btn.left + btn.width / 2 - w / 2), bottom: vh - btn.top + 8 }
  }
  // 버튼 왼쪽으로
  return { right: vw - btn.left + 10, top: clampY(btn.top + btn.height / 2 - h / 2) }
}

/** 글자 스타일 패널: 굵게, 글씨체, 크기, 가로·세로 정렬. 버튼 옆에 떠서 바깥을 누르면 닫힌다. */
export function TextStylePanel({ anchor, onClose }: { anchor: HTMLElement; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<React.CSSProperties>({ visibility: 'hidden' })
  const [hasTarget, bold, size, align, font, valign] = useCurrentStyle().split('|')
  const st = useStore.getState()
  const [tab, setTab] = useState(() => tabOf(font))
  const fontTab = FONT_TABS.find((t) => t.key === tab)!

  useLayoutEffect(() => {
    const panel = ref.current!.getBoundingClientRect()
    setPos(placePanel(anchor.getBoundingClientRect(), panel.width, panel.height, targetRect()))
  }, [anchor])

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t) || anchor.contains(t)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [anchor, onClose])

  return createPortal(
    <div
      ref={ref}
      className="style-panel"
      style={pos}
      role="dialog"
      aria-label="글자 스타일"
      // 눌러도 글자 입력 커서가 사라지지 않게
      onPointerDown={(e) => e.preventDefault()}
    >
      <p className="style-target">{hasTarget === '1' ? '고른 글자에 적용' : '앞으로 쓸 글자에 적용'}</p>

      <div className="style-row">
        <button className={'style-btn bold' + (bold === '1' ? ' on' : '')} onClick={() => st.toggleBold()} aria-pressed={bold === '1'}>
          <b>B</b>
          <span>굵게</span>
        </button>
      </div>

      <div className="style-label">글씨체</div>
      <div className="font-tabs" role="tablist">
        {FONT_TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            className={'font-tab' + (tab === t.key ? ' on' : '')}
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {tabOf(font) === t.key && <i className="font-tab-dot" aria-label="지금 글씨체" />}
          </button>
        ))}
      </div>
      <div className="font-grid" role="tabpanel">
        {FONTS.filter((f) => fontTab.groups.includes(f.group)).map((f) => (
          <button
            key={f.key}
            className={'font-btn' + (font === f.key ? ' on' : '')}
            onClick={() => st.setFont(f.key)}
            aria-pressed={font === f.key}
            title={f.latinOnly ? `${f.label} · 영문·숫자 전용 (한글은 다른 글씨체로)` : f.label}
          >
            <span className="font-sample" style={{ fontFamily: f.family, fontSize: 16 * f.scale }}>
              {f.latinOnly ? 'Hello 123' : '오늘 하루 Aa'}
            </span>
            <span className="font-name">
              {f.label}
              {f.latinOnly && <em className="font-tag">영문</em>}
            </span>
          </button>
        ))}
      </div>

      <div className="style-label">크기</div>
      <div className="style-row">
        {SIZES.map((o) => (
          <button
            key={o.size}
            className={'style-btn' + (size === o.size ? ' on' : '')}
            onClick={() => st.setTextSize(o.size)}
            aria-pressed={size === o.size}
          >
            <span className="style-glyph" style={{ fontSize: o.px }}>
              가
            </span>
            <span>{o.label}</span>
          </button>
        ))}
      </div>

      <div className="style-label">
        가로 정렬 <span className="muted">· 글자가 차지한 칸 안에서, 양쪽은 네모칸에</span>
      </div>
      <div className="style-row">
        {ALIGNS.map((o) => (
          <button
            key={o.align}
            className={'style-btn' + (align === o.align ? ' on' : '')}
            onClick={() => st.setAlign(o.align)}
            aria-pressed={align === o.align}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d={o.d} />
            </svg>
            <span>{o.label}</span>
          </button>
        ))}
      </div>
      <div className="style-label">세로 정렬</div>
      <div className="style-row">
        {VALIGNS.map((o) => (
          <button
            key={o.valign}
            className={'style-btn' + (valign === o.valign ? ' on' : '')}
            onClick={() => st.setValign(o.valign)}
            aria-pressed={valign === o.valign}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d={o.d} />
            </svg>
            <span>{o.label}</span>
          </button>
        ))}
      </div>
    </div>,
    document.body,
  )
}

/** 도구 모음용: 열고 닫는 버튼 + 패널 */
export function TextStyleButton({ className = 'tool', label }: { className?: string; label?: string }) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null)
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        ref={setAnchor}
        className={className + (open ? ' on' : '')}
        onClick={() => setOpen((v) => !v)}
        {...tip('글자 스타일', '굵게 · 글씨체 · 크기 · 정렬', 'style')}
        data-shortcut="style"
        aria-expanded={open}
      >
        <span className="aa">
          A<small>a</small>
        </span>
        {label && <span>{label}</span>}
      </button>
      {open && anchor && <TextStylePanel anchor={anchor} onClose={() => setOpen(false)} />}
    </>
  )
}
