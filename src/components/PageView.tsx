import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import {
  BOX_PAD,
  DOT_GRAB,
  DRAG_THRESHOLD,
  FONT_FAMILY,
  FONT_SIZE,
  TEXT_PAD,
  axisEnd,
  boxFontSize,
  boxTouches,
  distToDot,
  elBox,
  hitTest,
  itemTextOf,
  measureText,
  nearestDot,
  textCells,
  translate,
} from '../geometry'
import { strokePaths } from '../ink'
import { uid, useStore } from '../store'
import type { BulletEl, BulletState, El, LineEl, Page, PenType, Pt } from '../types'

type Drag =
  | { kind: 'pending'; start: Pt; hit: El | null; onSelected: boolean; grab: 'dot' | 'cell' }
  | { kind: 'line'; a: Pt; b: Pt; id: string }
  | { kind: 'box'; a: Pt; b: Pt }
  | { kind: 'marquee'; a: Pt; b: Pt; additive: boolean }
  | { kind: 'move'; start: Pt; dx: number; dy: number }
  | { kind: 'erase'; ids: string[]; last: Pt }

/** 볼펜, 연필 모양 마우스 커서 (끝이 왼쪽 아래) */
const svgCursor = (svg: string, fallback: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(svg)}") 4 27, ${fallback}`
const CURSORS: Record<PenType, string> = {
  pencil: svgCursor(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g transform="rotate(45 16 16)"><rect x="12.5" y="0" width="7" height="20" rx="1" fill="#f2c14e" stroke="#3a3328" stroke-width="1.2"/><rect x="12.5" y="0" width="7" height="4" rx="1" fill="#e79b9b" stroke="#3a3328" stroke-width="1.2"/><rect x="12.5" y="4" width="7" height="2" fill="#c9c3b5" stroke="#3a3328" stroke-width="1"/><path d="M12.5 20 L19.5 20 L16 28.5 Z" fill="#f4dcb4" stroke="#3a3328" stroke-width="1.2" stroke-linejoin="round"/><path d="M14.6 25.3 L17.4 25.3 L16 28.5 Z" fill="#3a3328"/></g></svg>`,
    'crosshair',
  ),
  ballpoint: svgCursor(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g transform="rotate(45 16 16)"><rect x="13" y="0" width="6" height="19" rx="2.5" fill="#2f3a52" stroke="#1d2333" stroke-width="1.1"/><rect x="18.6" y="2" width="1.8" height="9" rx="0.9" fill="#c9ccd3" stroke="#1d2333" stroke-width="0.8"/><path d="M13 19 L19 19 L17.2 25 L14.8 25 Z" fill="#d8dbe0" stroke="#1d2333" stroke-width="1.1" stroke-linejoin="round"/><path d="M14.8 25 L17.2 25 L16 28.6 Z" fill="#1d2333"/></g></svg>`,
    'crosshair',
  ),
}

/** 칸 가운데: 끌면 네모칸이 생긴다는 뜻의 십자 + 네모 */
const BOX_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g stroke="#fff" stroke-width="3" stroke-linecap="round"><path d="M10 2v16M2 10h16"/></g><g stroke="#2b2a28" stroke-width="1.4" stroke-linecap="round"><path d="M10 2v16M2 10h16"/></g><rect x="15" y="15" width="13" height="10" rx="1.5" fill="rgba(47,93,158,0.15)" stroke="#2f5d9e" stroke-width="1.4" stroke-dasharray="2.5 2"/><text x="18.5" y="23.3" font-size="8" font-family="sans-serif" font-weight="700" fill="#2f5d9e">T</text></svg>`,
)}") 10 10, crosshair`

const ERASER_CURSOR = svgCursor(
  `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g transform="rotate(45 16 16)"><rect x="10" y="4" width="12" height="22" rx="2.5" fill="#f3f0ea" stroke="#3a3328" stroke-width="1.3"/><rect x="10" y="4" width="12" height="9" rx="2.5" fill="#6f8fb8" stroke="#3a3328" stroke-width="1.3"/></g></svg>`,
  'cell',
)

interface Props {
  page: Page
  cell: number
  active: boolean
  side: 'single' | 'left' | 'right'
  guides: boolean
}

export default function PageView({ page, cell, active, side, guides }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const uidPrefix = useId().replace(/:/g, '')
  const dotsId = 'dots' + uidPrefix
  const pencilId = 'pencil' + uidPrefix
  const storeCursor = useStore((s) => s.cursor)
  const storeSelection = useStore((s) => s.selection)
  const pen = useStore((s) => s.lineStyle.pen)
  const selectMode = useStore((s) => s.selectMode)
  const eraserMode = useStore((s) => s.eraserMode)
  const textBold = useStore((s) => s.textBold)
  const storePopup = useStore((s) => s.popup)
  const popup = active ? storePopup : null
  useStore((s) => s.fontsVersion) // 글꼴이 늦게 로드되면 폭을 다시 잰다
  const cursor = active ? storeCursor : null
  const selection = active ? storeSelection : EMPTY

  const [drag, setDragState] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const setDrag = (d: Drag | null) => {
    dragRef.current = d
    setDragState(d)
  }
  /** 마우스가 무엇 위에 있는지: 고른 것 / 그려둔 항목 / 점(선 긋기) / 칸 가운데(네모칸) */
  const [hover, setHover] = useState<{ dot: Pt | null; zone: 'selected' | 'item' | 'dot' | 'cell' } | null>(null)
  const composingEnter = useRef(false)

  const { cols, rows, elements } = page
  const editing = cursor?.editId ? elements.find((e) => e.id === cursor.editId) : undefined
  const inputValue = editing && (editing.type === 'text' || editing.type === 'box') ? editing.text : ''
  const inputBold = editing && (editing.type === 'text' || editing.type === 'box') ? !!editing.bold : textBold

  // 칸이 바뀌면 커서를 글자 끝으로
  useLayoutEffect(() => {
    const input = inputRef.current
    if (!input) return
    if (cursor) {
      if (document.activeElement !== input) input.focus({ preventScroll: true })
      const len = input.value.length
      input.setSelectionRange(len, len)
    } else if (document.activeElement === input) {
      input.blur()
    }
  }, [cursor?.x, cursor?.y, cursor?.editId, cursor === null])

  useEffect(() => setDrag(null), [page.id])

  const toGrid = (e: React.PointerEvent): Pt => {
    const r = svgRef.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left) / cell, y: (e.clientY - r.top) / cell }
  }

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    if (dragRef.current) {
      // 두 번째 손가락: 지금 하던 동작 취소
      setDrag(null)
      return
    }
    const st = useStore.getState()
    st.focusPage(page.id) // 펼침면에서 다른 쪽 페이지를 누르면 그 페이지로
    if (st.popup) st.setPopup(null)
    const sel = useStore.getState().selection
    const p = toGrid(e)
    try {
      svgRef.current!.setPointerCapture(e.pointerId)
    } catch {
      /* 일부 환경에서는 캡처가 안 될 수 있다 */
    }
    if (st.eraserMode) {
      const first = hitTest(elements, p)
      setDrag({ kind: 'erase', ids: first ? [first.id] : [], last: p })
      return
    }
    const hit = hitTest(elements, p, sel)
    const onSelected = !!hit && sel.includes(hit.id)
    if ((st.selectMode || e.shiftKey) && !onSelected) {
      st.closeCursor()
      setDrag({ kind: 'marquee', a: p, b: p, additive: e.shiftKey })
      return
    }
    setDrag({ kind: 'pending', start: p, hit, onSelected, grab: distToDot(p) <= DOT_GRAB ? 'dot' : 'cell' })
  }

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = dragRef.current
    const p = toGrid(e)
    if (!d) {
      if (e.pointerType !== 'mouse') return
      const st = useStore.getState()
      const sel = active ? st.selection : EMPTY
      const hit = hitTest(elements, p, sel)
      const nearDot = distToDot(p) <= DOT_GRAB
      // 선 끝은 점 위에 있어서, 선 위라도 점 근처면 이어서 그을 수 있게 펜으로
      const zone =
        hit && sel.includes(hit.id)
          ? 'selected'
          : hit && !(hit.type === 'line' && nearDot)
            ? 'item'
            : nearDot
              ? 'dot'
              : 'cell'
      const dot = !st.selectMode && !st.eraserMode && zone === 'dot' ? nearestDot(p, cols, rows) : null
      if (hover?.zone !== zone || hover?.dot?.x !== dot?.x || hover?.dot?.y !== dot?.y) {
        setHover({ dot, zone })
      }
      return
    }
    const st = useStore.getState()
    switch (d.kind) {
      case 'pending': {
        if (Math.hypot(p.x - d.start.x, p.y - d.start.y) < DRAG_THRESHOLD) return
        st.closeCursor()
        if (d.onSelected) {
          setDrag({ kind: 'move', start: d.start, dx: Math.round(p.x - d.start.x), dy: Math.round(p.y - d.start.y) })
          return
        }
        st.setSelection([])
        if (d.grab === 'dot') {
          const a = nearestDot(d.start, cols, rows)
          setDrag({ kind: 'line', a, b: axisEnd(a, p, cols, rows), id: uid() })
        } else {
          setDrag({ kind: 'box', a: cellOf(d.start, cols, rows), b: cellOf(p, cols, rows) })
        }
        return
      }
      case 'line':
        setDrag({ ...d, b: axisEnd(d.a, p, cols, rows) })
        return
      case 'box':
        setDrag({ ...d, b: cellOf(p, cols, rows) })
        return
      case 'marquee':
        setDrag({ ...d, b: p })
        return
      case 'move':
        setDrag({ ...d, dx: Math.round(p.x - d.start.x), dy: Math.round(p.y - d.start.y) })
        return
      case 'erase': {
        // 지나간 길을 촘촘히 훑어서 닿은 것을 모두 지운다
        const ids = new Set(d.ids)
        const steps = Math.max(1, Math.ceil(Math.hypot(p.x - d.last.x, p.y - d.last.y) / 0.2))
        for (let i = 1; i <= steps; i++) {
          const q = { x: d.last.x + ((p.x - d.last.x) * i) / steps, y: d.last.y + ((p.y - d.last.y) * i) / steps }
          const h = hitTest(
            elements.filter((el) => !ids.has(el.id)),
            q,
          )
          if (h) ids.add(h.id)
        }
        setDrag({ kind: 'erase', ids: [...ids], last: p })
        return
      }
    }
  }

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = dragRef.current
    setDrag(null)
    if (!d) return
    const st = useStore.getState()
    const p = toGrid(e)
    switch (d.kind) {
      case 'pending': {
        if (d.hit?.type === 'line') {
          st.closeCursor()
          st.setSelection([d.hit.id])
          return
        }
        if (d.hit?.type === 'bullet') {
          // 기호를 누르면 상태 팝업
          st.closeCursor()
          st.setSelection([])
          st.setPopup({ kind: 'state', id: d.hit.id })
          return
        }
        if (d.hit?.type === 'box') st.editElement(d.hit.id)
        else {
          const cx = Math.floor(p.x)
          const cy = Math.floor(p.y)
          const sameEmptyCell = st.cursor && !st.cursor.editId && st.cursor.x === cx && st.cursor.y === cy
          // 커서가 있는 빈 칸을 한 번 더 누르면 기호 넣기 팝업
          if (sameEmptyCell && d.hit?.type !== 'text') st.setPopup({ kind: 'insert', x: cx, y: cy })
          else st.openAt(cx, cy)
        }
        // 모바일에서 키보드를 띄우려면 사용자 동작 안에서 바로 focus 해야 한다
        inputRef.current?.focus({ preventScroll: true })
        return
      }
      case 'line': {
        const b = { x: Math.round(d.b.x), y: Math.round(d.b.y) }
        if (d.a.x !== b.x || d.a.y !== b.y) st.addLine(d.a, b, d.id)
        return
      }
      case 'box': {
        const x = Math.min(d.a.x, d.b.x)
        const y = Math.min(d.a.y, d.b.y)
        st.addBox(x, y, Math.abs(d.b.x - d.a.x) + 1, Math.abs(d.b.y - d.a.y) + 1)
        inputRef.current?.focus({ preventScroll: true })
        return
      }
      case 'marquee': {
        const box = {
          x1: Math.min(d.a.x, d.b.x),
          y1: Math.min(d.a.y, d.b.y),
          x2: Math.max(d.a.x, d.b.x),
          y2: Math.max(d.a.y, d.b.y),
        }
        const ids = elements.filter((el) => boxTouches(elBox(el), box)).map((el) => el.id)
        st.setSelection(d.additive ? Array.from(new Set([...st.selection, ...ids])) : ids)
        return
      }
      case 'move':
        st.moveSelection(d.dx, d.dy)
        return
      case 'erase':
        st.deleteIds(d.ids)
        return
    }
  }

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const st = useStore.getState()
    const c = st.cursor
    if (!c) return
    // 한글 조합 중 Enter는 조합만 끝낸다. 줄바꿈은 keyup에서 처리.
    if (e.nativeEvent.isComposing || e.keyCode === 229) {
      if (e.key === 'Enter') composingEnter.current = true
      return
    }
    if (e.metaKey || e.ctrlKey) return // ⌘B, ⌘Z 등은 전체 단축키에서 처리
    // 팝업 단축키는 팝업이 먼저 처리한다. 그 밖의 키를 누르면 팝업을 닫고 평소처럼 쓴다.
    if (st.popup) st.setPopup(null)
    if (editing?.type === 'box') {
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault()
        st.closeCursor()
      }
      return
    }
    const input = e.currentTarget
    const atStart = input.selectionStart === 0 && input.selectionEnd === 0
    const atEnd = input.selectionStart === input.value.length
    switch (e.key) {
      case 'Enter':
        e.preventDefault()
        st.openAt(c.x, c.y + 1)
        break
      case 'Escape':
        e.preventDefault()
        st.closeCursor()
        break
      case 'ArrowUp':
        e.preventDefault()
        st.openAt(c.x, c.y - 1)
        break
      case 'ArrowDown':
        e.preventDefault()
        st.openAt(c.x, c.y + 1)
        break
      case 'ArrowLeft':
        if (atStart) {
          e.preventDefault()
          st.openAt(c.x - 1, c.y)
        }
        break
      case 'ArrowRight':
        if (atEnd) {
          e.preventDefault()
          st.openAt(c.x + (input.value ? textCells(input.value, inputBold) : 1), c.y)
        }
        break
      case 'Backspace':
        if (input.value === '' && c.x > 0) {
          e.preventDefault()
          st.openAt(c.x - 1, c.y)
        }
        break
    }
  }

  const onInputKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && composingEnter.current) {
      composingEnter.current = false
      const st = useStore.getState()
      const c = st.cursor
      if (!c) return
      if (editing?.type === 'box') st.closeCursor()
      else st.openAt(c.x, c.y + 1)
    }
  }

  const moving = drag?.kind === 'move' ? drag : null
  const erasing = drag?.kind === 'erase' ? drag.ids : null
  const shown = moving
    ? elements.map((el) => (selection.includes(el.id) ? translate(el, moving.dx, moving.dy) : el))
    : erasing
      ? elements.filter((el) => !erasing.includes(el.id))
      : elements

  // 커서: 지우개 / 옮기는 중 / 고른 것(잡기) / 그려둔 항목(손가락) / 선 긋기(펜) / 네모칸(네모 커서)
  const svgCursorStyle = eraserMode
    ? ERASER_CURSOR
    : moving
      ? 'grabbing'
      : hover?.zone === 'selected'
        ? 'grab'
        : selectMode || drag?.kind === 'marquee'
          ? 'crosshair'
          : drag?.kind === 'line'
            ? CURSORS[pen]
            : drag?.kind === 'box'
              ? BOX_CURSOR
              : hover?.zone === 'item'
                ? 'pointer'
                : hover?.zone === 'cell'
                  ? BOX_CURSOR
                  : CURSORS[pen]

  let inputStyle: React.CSSProperties = { left: -9999, top: 0, width: 10, height: 10, opacity: 0, pointerEvents: 'none' }
  if (cursor && editing?.type === 'box') {
    const fs = boxFontSize({ ...editing, text: inputValue })
    inputStyle = {
      left: editing.x * cell,
      top: editing.y * cell,
      width: editing.w * cell,
      height: editing.h * cell,
      lineHeight: `${editing.h * cell}px`,
      fontSize: fs * cell,
      fontFamily: FONT_FAMILY,
      ...boldCss(inputBold, cell, fs / FONT_SIZE),
      paddingLeft: BOX_PAD * cell,
      paddingRight: BOX_PAD * cell,
      pointerEvents: inputValue && !selectMode && !eraserMode ? 'auto' : 'none',
    }
  } else if (cursor) {
    const w = Math.min(Math.max(TEXT_PAD + measureText(inputValue, inputBold) + 1, 1.5), cols - cursor.x)
    inputStyle = {
      left: cursor.x * cell,
      top: cursor.y * cell,
      width: w * cell,
      height: cell,
      lineHeight: `${cell}px`,
      fontSize: FONT_SIZE * cell,
      fontFamily: FONT_FAMILY,
      ...boldCss(inputBold, cell),
      paddingLeft: TEXT_PAD * cell,
      // 빈 칸이면 클릭이 도트지로 가게 (같은 칸을 한 번 더 누르면 기호 팝업)
      pointerEvents: inputValue && !selectMode && !eraserMode ? 'auto' : 'none',
    }
  }

  return (
    <div className={'page-wrap ' + side} style={{ width: cols * cell, height: rows * cell }}>
      <div className="stack-side" />
      <div className="stack-bottom" />
      {guides && <Guides cols={cols} rows={rows} cell={cell} side={side} />}
      <div className="page">
        <svg
          ref={svgRef}
          className="page-svg"
          style={{ cursor: svgCursorStyle }}
          width={cols * cell}
          height={rows * cell}
          viewBox={`0 0 ${cols} ${rows}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => setDrag(null)}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            <pattern id={dotsId} x={-0.5} y={-0.5} width={1} height={1} patternUnits="userSpaceOnUse">
              <circle cx={0.5} cy={0.5} r={Math.max(0.05, 1.1 / cell)} className="dot" />
            </pattern>
            {/* 연필: 종이 결에 따라 흑연이 듬성듬성 묻는 느낌 */}
            <filter id={pencilId} x="-20%" y="-20%" width="140%" height="140%" filterUnits="objectBoundingBox">
              <feTurbulence type="fractalNoise" baseFrequency="9" numOctaves="2" seed="3" result="grain" />
              <feColorMatrix
                in="grain"
                type="matrix"
                values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.5 1.5"
                result="mask"
              />
              <feComposite in="SourceGraphic" in2="mask" operator="in" />
            </filter>
          </defs>
          <rect width={cols} height={rows} className="paper" />
          <rect x={0.5} y={0.5} width={cols - 1} height={rows - 1} fill={`url(#${dotsId})`} />

          {cursor && !cursor.editId && (
            <rect x={cursor.x} y={cursor.y} width={1} height={1} rx={0.12} className="cursor-cell" />
          )}

          {/* 선택 표시 (요소 뒤에) */}
          {shown
            .filter((el) => selection.includes(el.id))
            .map((el) =>
              el.type === 'line' ? (
                <line key={'sel' + el.id} x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} className="sel-line" strokeWidth={0.42} />
              ) : el.type === 'box' ? (
                <rect key={'sel' + el.id} x={el.x} y={el.y} width={el.w} height={el.h} rx={0.15} className="sel-box" />
              ) : el.type === 'bullet' ? (
                <rect key={'sel' + el.id} x={el.x + 0.05} y={el.y + 0.05} width={0.9} height={0.9} rx={0.15} className="sel-box" />
              ) : (
                <rect
                  key={'sel' + el.id}
                  x={el.x}
                  y={el.y + 0.06}
                  width={TEXT_PAD * 2 + measureText(el.text, el.bold)}
                  height={0.88}
                  rx={0.15}
                  className="sel-box"
                />
              ),
            )}

          {shown.map((el) => {
            if (el.type === 'line') return <InkLine key={el.id} line={el} filterId={pencilId} />
            if (el.type === 'bullet') return <BulletGlyph key={el.id} b={el} elements={shown} />
            if (el.type === 'box') {
              const isEditing = cursor?.editId === el.id
              return (
                <g key={el.id}>
                  {isEditing && <rect x={el.x} y={el.y} width={el.w} height={el.h} rx={0.15} className="box-edit" />}
                  <text
                    x={el.x + BOX_PAD}
                    y={el.y + el.h / 2 + 0.04 * el.h}
                    dominantBaseline="central"
                    fontSize={boxFontSize(el)}
                    fontFamily={FONT_FAMILY}
                    {...boldProps(el.bold, boxFontSize(el) / FONT_SIZE)}
                    className="ink-text"
                    visibility={isEditing ? 'hidden' : undefined}
                  >
                    {el.text}
                  </text>
                </g>
              )
            }
            return (
              <text
                key={el.id}
                x={el.x + TEXT_PAD}
                y={el.y + 0.52}
                dominantBaseline="central"
                fontSize={FONT_SIZE}
                fontFamily={FONT_FAMILY}
                {...boldProps(el.bold)}
                className="ink-text"
                visibility={cursor?.editId === el.id ? 'hidden' : undefined}
              >
                {el.text}
              </text>
            )
          })}

          {popup?.kind === 'insert' && (
            <rect x={popup.x} y={popup.y} width={1} height={1} rx={0.12} className="cursor-cell" />
          )}
          {hover?.dot && !drag && <circle cx={hover.dot.x} cy={hover.dot.y} r={0.2} className="hover-dot" />}

          {drag?.kind === 'line' && <LivePreview drag={drag} filterId={pencilId} />}
          {drag?.kind === 'box' && (
            <rect
              x={Math.min(drag.a.x, drag.b.x)}
              y={Math.min(drag.a.y, drag.b.y)}
              width={Math.abs(drag.b.x - drag.a.x) + 1}
              height={Math.abs(drag.b.y - drag.a.y) + 1}
              rx={0.15}
              className="box-preview"
            />
          )}
          {drag?.kind === 'marquee' && (
            <rect
              x={Math.min(drag.a.x, drag.b.x)}
              y={Math.min(drag.a.y, drag.b.y)}
              width={Math.abs(drag.b.x - drag.a.x)}
              height={Math.abs(drag.b.y - drag.a.y)}
              className="marquee"
            />
          )}
        </svg>

        <input
          ref={inputRef}
          className="ink-input"
          aria-label="글자 입력"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          value={inputValue}
          onChange={(e) => useStore.getState().typeText(e.target.value)}
          onKeyDown={onInputKeyDown}
          onKeyUp={onInputKeyUp}
          style={inputStyle}
        />
      </div>
      {popup && <SymbolPopup popup={popup} elements={elements} cell={cell} />}
      {!drag && selection.length > 0 && <SelectionBar elements={shown} selection={selection} cell={cell} cols={cols} />}
    </div>
  )
}

const EMPTY: string[] = []

function cellOf(p: Pt, cols: number, rows: number): Pt {
  return { x: Math.max(0, Math.min(cols - 1, Math.floor(p.x))), y: Math.max(0, Math.min(rows - 1, Math.floor(p.y))) }
}

function InkLine({ line, filterId, live }: { line: LineEl; filterId: string; live?: boolean }) {
  const pen = line.pen ?? 'ballpoint'
  const paths = strokePaths(line.x1, line.y1, line.x2, line.y2, {
    width: line.width,
    dash: line.dash,
    pen,
    seed: line.id,
    settle: !live,
  })
  return (
    <g
      fill={line.color}
      filter={pen === 'pencil' ? `url(#${filterId})` : undefined}
      opacity={pen === 'pencil' ? 0.82 : 0.94}
    >
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </g>
  )
}

/** 긋는 동안: 펜 끝을 따라 선이 쓱 늘어난다 */
function LivePreview({ drag, filterId }: { drag: { a: Pt; b: Pt; id: string }; filterId: string }) {
  const style = useStore((s) => s.lineStyle)
  const line: LineEl = { id: drag.id, type: 'line', x1: drag.a.x, y1: drag.a.y, x2: drag.b.x, y2: drag.b.y, ...style }
  const end = { x: Math.round(drag.b.x), y: Math.round(drag.b.y) }
  return (
    <>
      <InkLine line={line} filterId={filterId} live />
      <circle cx={end.x} cy={end.y} r={0.13} className="snap-dot" />
    </>
  )
}

/** 분할 그리드: 페이지 바깥에 1/3, 1/2, 2/3 지점을 연하게 표시 */
function Guides({ cols, rows, cell, side }: { cols: number; rows: number; cell: number; side: Props['side'] }) {
  const marks = [
    { f: 1 / 3, label: '⅓', major: false },
    { f: 1 / 2, label: '½', major: true },
    { f: 2 / 3, label: '⅔', major: false },
  ]
  const W = cols * cell
  const H = rows * cell
  return (
    <div className="guides" aria-hidden>
      {marks.map((m) => (
        <div key={'t' + m.f}>
          <span className={'g-tick v top' + (m.major ? ' major' : '')} style={{ left: m.f * W }} />
          <span className={'g-tick v bottom' + (m.major ? ' major' : '')} style={{ left: m.f * W }} />
          <span className="g-label top" style={{ left: m.f * W }}>
            {m.label}
          </span>
        </div>
      ))}
      {marks.map((m) => (
        <div key={'s' + m.f}>
          {side !== 'right' && (
            <>
              <span className={'g-tick h left' + (m.major ? ' major' : '')} style={{ top: m.f * H }} />
              <span className="g-label left" style={{ top: m.f * H }}>
                {m.label}
              </span>
            </>
          )}
          {side !== 'left' && (
            <>
              <span className={'g-tick h right' + (m.major ? ' major' : '')} style={{ top: m.f * H }} />
              <span className="g-label right" style={{ top: m.f * H }}>
                {m.label}
              </span>
            </>
          )}
        </div>
      ))}
    </div>
  )
}

const INK = '#2b2a28'

/** 불렛 기호 하나. 펜으로 찍은 것처럼 약간 두툼하게. */
function Glyph({ state, cx, cy }: { state: BulletState; cx: number; cy: number }) {
  const sw = 0.075
  switch (state) {
    case 'task':
      return <circle cx={cx} cy={cy} r={0.105} fill={INK} />
    case 'done':
      return (
        <g stroke={INK} strokeWidth={sw} strokeLinecap="round">
          <line x1={cx - 0.19} y1={cy - 0.19} x2={cx + 0.19} y2={cy + 0.19} />
          <line x1={cx + 0.19} y1={cy - 0.19} x2={cx - 0.19} y2={cy + 0.19} />
        </g>
      )
    case 'migrated':
      return (
        <polyline
          points={`${cx - 0.1},${cy - 0.2} ${cx + 0.13},${cy} ${cx - 0.1},${cy + 0.2}`}
          fill="none"
          stroke={INK}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )
    case 'scheduled':
      return (
        <polyline
          points={`${cx + 0.1},${cy - 0.2} ${cx - 0.13},${cy} ${cx + 0.1},${cy + 0.2}`}
          fill="none"
          stroke={INK}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )
    case 'event':
      return <circle cx={cx} cy={cy} r={0.17} fill="none" stroke={INK} strokeWidth={0.065} />
    case 'note':
      return <line x1={cx - 0.17} y1={cy} x2={cx + 0.17} y2={cy} stroke={INK} strokeWidth={sw} strokeLinecap="round" />
  }
}

function BulletGlyph({ b, elements }: { b: BulletEl; elements: El[] }) {
  const item = b.cancelled ? itemTextOf(elements, b) : null
  const strike = item
    ? strokePaths(item.x + 0.02, item.y + 0.55, item.x + TEXT_PAD + measureText(item.text, item.bold) + 0.12, item.y + 0.5, {
        width: 1,
        dash: false,
        pen: 'ballpoint',
        seed: b.id + 'strike',
      })
    : []
  return (
    <g>
      <Glyph state={b.state} cx={b.x + 0.5} cy={b.y + 0.52} />
      {strike.map((d, i) => (
        <path key={i} d={d} fill={INK} opacity={0.9} />
      ))}
    </g>
  )
}

const INSERT_OPTIONS: { state: BulletState; label: string; key: string; keys: string[] }[] = [
  { state: 'task', label: '할 일', key: '*', keys: ['*', 't', '.'] },
  { state: 'event', label: '일정', key: 'O', keys: ['o'] },
  { state: 'note', label: '메모', key: '-', keys: ['-'] },
]

const STATE_OPTIONS: { state: BulletState; label: string; key: string; keys: string[] }[] = [
  { state: 'task', label: '할 일', key: 'T', keys: ['t', '*', '.'] },
  { state: 'done', label: '완료', key: 'X', keys: ['x'] },
  { state: 'migrated', label: '미룸', key: '>', keys: ['>'] },
  { state: 'scheduled', label: '일정으로', key: '<', keys: ['<'] },
  { state: 'event', label: '일정', key: 'O', keys: ['o'] },
  { state: 'note', label: '메모', key: '-', keys: ['-'] },
]

/** 기호 바로 위에 뜨는 팝업. 바깥을 누르거나 Esc로 닫힌다. PC는 키 하나로 고른다. */
function SymbolPopup({ popup, elements, cell }: { popup: NonNullable<ReturnType<typeof useStore.getState>['popup']>; elements: El[]; cell: number }) {
  const bullet = popup.kind === 'state' ? (elements.find((e) => e.id === popup.id) as BulletEl | undefined) : undefined
  const x = popup.kind === 'insert' ? popup.x : bullet?.x ?? 0
  const y = popup.kind === 'insert' ? popup.y : bullet?.y ?? 0

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return
      const st = useStore.getState()
      const k = e.key.toLowerCase()
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        st.setPopup(null)
        return
      }
      const opts = popup.kind === 'insert' ? INSERT_OPTIONS : STATE_OPTIONS
      const hit = opts.find((o) => o.keys.includes(k))
      if (hit) {
        e.preventDefault()
        e.stopPropagation()
        if (popup.kind === 'insert') st.addBullet(hit.state)
        else st.setBulletState(popup.id, hit.state)
        return
      }
      if (popup.kind === 'state' && (k === 'c' || e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault()
        e.stopPropagation()
        if (k === 'c') st.toggleCancel(popup.id)
        else st.deleteElement(popup.id)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [popup])

  if (popup.kind === 'state' && !bullet) return null
  const st = useStore.getState()
  const below = y < 3
  const opts = popup.kind === 'insert' ? INSERT_OPTIONS : STATE_OPTIONS

  return (
    <div
      className={'sym-popup' + (below ? ' below' : '')}
      style={{ left: (x + 0.5) * cell, top: below ? (y + 1) * cell + 6 : y * cell - 6 }}
      onPointerDown={(e) => e.preventDefault()}
      role="menu"
    >
      {opts.map((o) => (
        <button
          key={o.state}
          role="menuitem"
          className={'sym-opt' + (bullet?.state === o.state ? ' on' : '')}
          onClick={() => (popup.kind === 'insert' ? st.addBullet(o.state) : st.setBulletState(popup.id, o.state))}
        >
          <svg viewBox="0 0 1 1" width="22" height="22">
            <Glyph state={o.state} cx={0.5} cy={0.5} />
          </svg>
          <span className="sym-label">{o.label}</span>
          <kbd>{o.key}</kbd>
        </button>
      ))}
      {bullet && (
        <>
          <span className="sym-sep" />
          <button role="menuitem" className={'sym-opt' + (bullet.cancelled ? ' on' : '')} onClick={() => st.toggleCancel(bullet.id)}>
            <span className="sym-strike">가</span>
            <span className="sym-label">취소</span>
            <kbd>C</kbd>
          </button>
          <button role="menuitem" className="sym-opt" onClick={() => st.deleteElement(bullet.id)}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13" />
            </svg>
            <span className="sym-label">지우기</span>
            <kbd>Del</kbd>
          </button>
        </>
      )}
    </div>
  )
}

/** 글꼴에 굵은 굵기가 없어서, 획 바깥에 같은 색 외곽선을 둘러 굵게 보이게 한다 */
const BOLD_STROKE = 0.04
function boldProps(bold?: boolean, scale = 1) {
  return bold ? { stroke: INK, strokeWidth: BOLD_STROKE * scale, paintOrder: 'stroke' as const, strokeLinejoin: 'round' as const } : {}
}
function boldCss(bold: boolean, cell: number, scale = 1): React.CSSProperties {
  return bold ? { WebkitTextStroke: `${BOLD_STROKE * cell * scale}px ${INK}`, paintOrder: 'stroke' } : {}
}

/** 고른 것 위에 뜨는 작은 막대: 지우기, 복제, 굵게, 고르기 해제 */
function SelectionBar({ elements, selection, cell, cols }: { elements: El[]; selection: string[]; cell: number; cols: number }) {
  const sel = elements.filter((e) => selection.includes(e.id))
  if (!sel.length) return null
  const boxes = sel.map(elBox)
  const x1 = Math.min(...boxes.map((b) => b.x1))
  const x2 = Math.max(...boxes.map((b) => b.x2))
  const y1 = Math.min(...boxes.map((b) => b.y1))
  const y2 = Math.max(...boxes.map((b) => b.y2))
  const below = y1 < 2.5
  const cx = Math.min(Math.max((x1 + x2) / 2, 3), cols - 3)
  const hasText = sel.some((e) => e.type === 'text' || e.type === 'box')
  const st = useStore.getState()
  return (
    <div
      className={'sel-bar' + (below ? ' below' : '')}
      style={{ left: cx * cell, top: below ? y2 * cell + 8 : y1 * cell - 8 }}
      onPointerDown={(e) => e.preventDefault()}
    >
      <span className="sel-count">{sel.length}개</span>
      <button onClick={() => st.deleteSelection()} title="지우기 (Delete)">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13" />
        </svg>
        지우기
      </button>
      <button onClick={() => st.duplicateSelection()} title="복제 (한 칸 옆에)">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7">
          <rect x="8" y="8" width="12" height="12" rx="2" />
          <path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3" />
        </svg>
        복제
      </button>
      {hasText && (
        <button onClick={() => st.toggleBold()} title="굵게 (⌘B)">
          <b className="sel-b">B</b>
          굵게
        </button>
      )}
      <button onClick={() => st.setSelection([])} title="고르기 해제 (Esc)" aria-label="고르기 해제">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  )
}
