import { currentPage, useStore } from '../store'
import { TextStyleButton } from './TextStylePanel'
import { HIGHLIGHT_COLORS, INK_COLORS, type PenType } from '../types'

const PEN_LABEL: Record<PenType, string> = { ballpoint: '볼펜', pencil: '연필' }

function PenIcon({ pen }: { pen: PenType }) {
  return pen === 'pencil' ? (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M15.5 3.5l5 5L9 20H4v-5z" />
      <path d="M13 6l5 5M4 15l5 5" />
      <path d="M4 20l1.6-3.4L7.4 18.4z" fill="currentColor" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M17 2.8l4.2 4.2-11 11-4.2-4.2z" />
      <path d="M6 13.8L4 20l6.2-2z" />
      <path d="M19 5l-2.5-2.5" />
    </svg>
  )
}

function StrokeIcon({ width, dash }: { width: 1 | 2; dash: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22">
      <line
        x1="4"
        y1="12"
        x2="20"
        y2="12"
        stroke="currentColor"
        strokeWidth={width === 1 ? 1.6 : 3.6}
        strokeLinecap="round"
        strokeDasharray={dash ? '3 3.5' : undefined}
      />
    </svg>
  )
}

export default function Toolbar() {
  const lineStyle = useStore((s) => s.lineStyle)
  const setLineStyle = useStore((s) => s.setLineStyle)
  const selectMode = useStore((s) => s.selectMode)
  const setSelectMode = useStore((s) => s.setSelectMode)
  const showGuides = useStore((s) => s.showGuides)
  // 쓰고 있는 글자가 있으면 그 글자의 굵기, 없으면 앞으로 쓸 글자의 굵기
  const textBold = useStore((s) => {
    const id = s.cursor?.editId
    const el = id ? currentPage(s)?.elements.find((e) => e.id === id) : undefined
    return el && (el.type === 'text' || el.type === 'box') ? !!el.bold : s.textBold
  })
  const toggleBold = useStore((s) => s.toggleBold)
  const setShowGuides = useStore((s) => s.setShowGuides)
  const hasSelection = useStore((s) => s.selection.length > 0)
  const eraserMode = useStore((s) => s.eraserMode)
  const highlightMode = useStore((s) => s.highlightMode)
  const setHighlightMode = useStore((s) => s.setHighlightMode)
  const hlColor = useStore((s) => s.hlColor)
  const setHlColor = useStore((s) => s.setHlColor)
  const setEraserMode = useStore((s) => s.setEraserMode)
  const hasCursor = useStore((s) => !!s.cursor)
  const popupOpen = useStore((s) => s.popup?.kind === 'insert')
  const deleteSelection = useStore((s) => s.deleteSelection)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const canUndo = useStore((s) => {
    const p = currentPage(s)
    return !!p && (s.history[p.id]?.past.length ?? 0) > 0
  })
  const canRedo = useStore((s) => {
    const p = currentPage(s)
    return !!p && (s.history[p.id]?.future.length ?? 0) > 0
  })

  // 버튼을 눌러도 글자 입력 커서가 사라지지 않게
  const keep = (e: React.PointerEvent) => e.preventDefault()
  const nextPen: PenType = lineStyle.pen === 'ballpoint' ? 'pencil' : 'ballpoint'

  return (
    <div className="toolbar" onPointerDown={keep}>
      {/* 모바일: 누를 때마다 바뀌는 버튼 하나씩 */}
      <div className="tool-group compact-only">
        <button className="tool" onClick={() => setLineStyle({ pen: nextPen })} title={`${PEN_LABEL[lineStyle.pen]} (누르면 ${PEN_LABEL[nextPen]})`}>
          <PenIcon pen={lineStyle.pen} />
        </button>
        <button
          className="tool"
          onClick={() => setLineStyle({ width: lineStyle.width === 1 ? 2 : 1 })}
          title={lineStyle.width === 1 ? '얇은 선 (누르면 굵게)' : '굵은 선 (누르면 얇게)'}
        >
          <StrokeIcon width={lineStyle.width} dash={false} />
        </button>
        <button
          className={'tool' + (lineStyle.dash ? ' on' : '')}
          onClick={() => setLineStyle({ dash: !lineStyle.dash })}
          title="점선"
          aria-pressed={lineStyle.dash}
        >
          <StrokeIcon width={1} dash />
        </button>
        {highlightMode ? (
          <button
            className="tool"
            onClick={() => {
              // 형광펜 색 → … → 지우기 순서로
              const opts = [...HIGHLIGHT_COLORS.map((c) => c.color), null]
              setHlColor(opts[(opts.indexOf(hlColor) + 1) % opts.length])
            }}
            title="형광펜 색 (누르면 다음 색, 마지막은 지우기)"
          >
            {hlColor ? <span className="ink-dot hl" style={{ background: hlColor }} /> : <span className="ink-dot hl-none" />}
          </button>
        ) : (
          <button
            className="tool"
            onClick={() => {
              const i = INK_COLORS.findIndex((c) => c.color === lineStyle.color)
              setLineStyle({ color: INK_COLORS[(i + 1) % INK_COLORS.length].color })
            }}
            title="선 색 (누르면 다음 색)"
          >
            <span className="ink-dot" style={{ background: lineStyle.color }} />
          </button>
        )}
      </div>

      <div className="tool-group full-only" role="group" aria-label="펜 종류">
        {(['ballpoint', 'pencil'] as const).map((p) => (
          <button
            key={p}
            className={'tool' + (lineStyle.pen === p ? ' on' : '')}
            onClick={() => setLineStyle({ pen: p })}
            title={PEN_LABEL[p]}
            aria-pressed={lineStyle.pen === p}
          >
            <PenIcon pen={p} />
          </button>
        ))}
      </div>

      <div className="tool-group full-only" role="group" aria-label="선 굵기">
        {([1, 2] as const).map((w) => (
          <button
            key={w}
            className={'tool' + (lineStyle.width === w ? ' on' : '')}
            onClick={() => setLineStyle({ width: w })}
            title={w === 1 ? '얇은 선' : '굵은 선'}
            aria-pressed={lineStyle.width === w}
          >
            <StrokeIcon width={w} dash={false} />
          </button>
        ))}
        <button
          className={'tool' + (lineStyle.dash ? ' on' : '')}
          onClick={() => setLineStyle({ dash: !lineStyle.dash })}
          title="점선"
          aria-pressed={lineStyle.dash}
        >
          <StrokeIcon width={1} dash />
        </button>
      </div>

      {highlightMode ? (
        <div className="tool-group full-only" role="group" aria-label="형광펜 색">
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c.color}
              className={'tool color' + (hlColor === c.color ? ' on' : '')}
              onClick={() => setHlColor(c.color)}
              title={'형광펜 ' + c.name}
              aria-label={'형광펜 ' + c.name}
              aria-pressed={hlColor === c.color}
            >
              <span className="ink-dot hl" style={{ background: c.color }} />
            </button>
          ))}
          <button
            className={'tool color' + (hlColor === null ? ' on' : '')}
            onClick={() => setHlColor(null)}
            title="칠한 칸 지우기"
            aria-label="칠한 칸 지우기"
            aria-pressed={hlColor === null}
          >
            <span className="ink-dot hl-none" />
          </button>
        </div>
      ) : (
      <div className="tool-group full-only" role="group" aria-label="선 색">
        {INK_COLORS.map((c) => (
          <button
            key={c.color}
            className={'tool color' + (lineStyle.color === c.color ? ' on' : '')}
            onClick={() => setLineStyle({ color: c.color })}
            title={c.name}
            aria-label={c.name}
            aria-pressed={lineStyle.color === c.color}
          >
            <span className="ink-dot" style={{ background: c.color }} />
          </button>
        ))}
      </div>
      )}

      <div className="tool-group">
        <TextStyleButton />
        <button
          className={'tool bold-btn full-only' + (textBold ? ' on' : '')}
          onClick={toggleBold}
          title="굵게 (⌘B) — 쓰고 있는 글자나 고른 글자에 적용"
          aria-pressed={textBold}
        >
          B
        </button>
        <button
          className={'tool' + (popupOpen ? ' on' : '')}
          onClick={() => {
            const st = useStore.getState()
            if (st.popup) st.setPopup(null)
            else st.openInsertPopup()
          }}
          disabled={!hasCursor}
          title="기호 넣기 • ○ – (칸을 고르고 누르거나, 같은 칸을 한 번 더 클릭)"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <circle cx="6" cy="7" r="1.8" fill="currentColor" stroke="none" />
            <circle cx="6" cy="12.5" r="2.2" />
            <path d="M4 18h4" />
            <path d="M11 7h9M11 12.5h9M11 18h9" opacity="0.45" />
          </svg>
        </button>
        <button
          className={'tool' + (selectMode ? ' on' : '')}
          onClick={() => setSelectMode(!selectMode)}
          title="고르기: 끌어서 영역 안 항목 고르기 (PC는 Shift + 끌기)"
          aria-pressed={selectMode}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="4" y="4" width="16" height="16" rx="2" strokeDasharray="3 2.5" />
          </svg>
        </button>
        <button
          className={'tool' + (highlightMode ? ' on' : '')}
          onClick={() => setHighlightMode(!highlightMode)}
          title="형광펜: 칸 위를 문지르면 색이 칠해져요"
          aria-pressed={highlightMode}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
            <path d="M14.5 4.5l5 5-7.5 7.5h-3l-2-2v-3z" />
            <path d="M7 14.5L4.5 17l2.5 2.5L9.5 17" />
            <path d="M13 20.5h7.5" stroke={hlColor ?? 'currentColor'} strokeWidth="3" opacity="0.7" />
          </svg>
        </button>
        <button
          className={'tool' + (eraserMode ? ' on' : '')}
          onClick={() => setEraserMode(!eraserMode)}
          title="지우개: 문지르면 닿은 것을 지워요"
          aria-pressed={eraserMode}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
            <path d="M14.5 4.5l5 5-9 9H6l-2.5-2.5a1.4 1.4 0 010-2z" />
            <path d="M9.5 9.5l5 5" />
            <path d="M11 18.5h9" strokeLinecap="round" />
          </svg>
        </button>
        <button className="tool full-only" onClick={deleteSelection} disabled={!hasSelection} title="고른 것 지우기 (Delete)">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13" />
          </svg>
        </button>
        <button
          className={'tool full-only' + (showGuides ? ' on' : '')}
          onClick={() => setShowGuides(!showGuides)}
          title="분할 그리드 보기 (½, ⅓, ⅔)"
          aria-pressed={showGuides}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="5" y="5" width="14" height="14" rx="1" />
            <path d="M12 1.5v3M12 19.5v3M9.3 2.5v2M14.7 2.5v2M1.5 12h3M19.5 12h3" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="tool-group">
        <button className="tool" onClick={undo} disabled={!canUndo} title="되돌리기 (⌘Z)">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 14L4 9l5-5" />
            <path d="M4 9h10a6 6 0 010 12h-3" />
          </svg>
        </button>
        <button className="tool" onClick={redo} disabled={!canRedo} title="다시 실행 (⇧⌘Z)">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 14l5-5-5-5" />
            <path d="M20 9H10a6 6 0 000 12h3" />
          </svg>
        </button>
      </div>
    </div>
  )
}
