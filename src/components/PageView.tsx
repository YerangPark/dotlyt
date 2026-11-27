import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { BOX_LINE_GAP, BOX_PAD, DOT_GRAB, boxLineYs, boxLines, DRAG_THRESHOLD, FONT_SIZE, TEXT_PAD, axisEnd, boxFontSize, boxTouches, distToDot, elBox, hitTest, fontSizeOf, textWidth, textAnchor, textMidY, textInk, nearestDot, textCells } from '../geometry'
import { fontOf } from '../fonts'
import { placeSelection } from '../move'
import { uid, useStore } from '../store'
import type { El, MarkEl, Page, Pt } from '../types'
import { BOX_CURSOR, CURSORS, ERASER_CURSOR, highlighterCursor } from './page/cursors'
import { addPaintCells, cellOf, useLinger, vPlace } from './page/helpers'
import { BoxText, BulletGlyph, IconGlyph, InkLine, LivePreview, MarkGlyph, boldCss, boldProps } from './page/glyphs'
import { GuideMarks, MarqueeRect } from './page/overlays'
import { SymbolPopup } from './page/SymbolPopup'
import { SelectionBar } from './page/SelectionBar'
import { IconPicker } from './page/IconPicker'
import { ContextMenu, type CtxMenu } from './page/ContextMenu'

type Drag =
  | { kind: 'pending'; start: Pt; hit: El | null; onSelected: boolean; grab: 'dot' | 'cell' }
  | { kind: 'line'; a: Pt; b: Pt; id: string; cross: { pageId: string; a: Pt; b: Pt } | null }
  | { kind: 'box'; a: Pt; b: Pt }
  | { kind: 'marquee'; ca: Pt; cb: Pt; additive: boolean; hit: El | null } // 화면 좌표: 양쪽 페이지에 걸쳐 고를 수 있게
  | { kind: 'move'; start: Pt } // 옮기는 양은 화면 픽셀로 store.moveDelta에
  | { kind: 'erase'; ids: string[]; last: Pt }
  | { kind: 'paint'; start: Pt } // 형광펜: 시작점에서 가로나 세로 한 줄로만. 칠할 칸은 store.paintPreview에 (양쪽 페이지)
  | { kind: 'resize'; id: string; corner: Corner; orig: Rect; r: Rect } // 네모칸 모서리 손잡이로 크기 바꾸기

/**
 * 바깥쪽 종이 단면 두께(px): 그쪽에 남은 페이지 수만큼. 왼쪽 페이지는 앞에 지난 페이지, 오른쪽(한 장 보기)은 뒤에 남은 페이지.
 * 아무것도 없으면 표지 판 모서리만 살짝(2px), 많을수록 두꺼워지다 60쪽쯤에서 가장 두껍게.
 */
export function stackPx(side: 'single' | 'left' | 'right', index: number, total: number) {
  const n = side === 'left' ? index : total - 1 - index
  return Math.round((2 + 11 * Math.min(1, Math.sqrt(Math.max(0, n) / 60))) * 10) / 10
}

type Corner = 'nw' | 'ne' | 'sw' | 'se'
type Rect = { x: number; y: number; w: number; h: number }
const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se']

/** 손잡이를 끈 곳에 맞춰 네모칸을 칸 경계에 맞춘다 (최소 1×1, 페이지 안) */
function resizeRect(o: Rect, corner: Corner, p: Pt, cols: number, rows: number): Rect {
  let x1 = o.x
  let y1 = o.y
  let x2 = o.x + o.w
  let y2 = o.y + o.h
  if (corner.includes('w')) x1 = Math.max(0, Math.min(x2 - 1, Math.round(p.x)))
  if (corner.includes('e')) x2 = Math.min(cols, Math.max(x1 + 1, Math.round(p.x)))
  if (corner.includes('n')) y1 = Math.max(0, Math.min(y2 - 1, Math.round(p.y)))
  if (corner.includes('s')) y2 = Math.min(rows, Math.max(y1 + 1, Math.round(p.y)))
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
}

interface Props {
  page: Page
  cell: number
  active: boolean
  side: 'single' | 'left' | 'right'
  guides: boolean
  /** 고른 것 위 막대를 이 페이지에 띄울지 (양쪽에 걸쳐 고르면 한쪽에만) */
  selBar: boolean
}

export default function PageView({ page, cell, active, side, guides, selBar }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  // 줄 글자는 input, 네모칸은 줄바꿈(Shift+Enter)이 되는 textarea
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const uidPrefix = useId().replace(/:/g, '')
  const dotsId = 'dots' + uidPrefix
  const pencilId = 'pencil' + uidPrefix
  const storeCursor = useStore((s) => s.cursor)
  const storeSelection = useStore((s) => s.selection)
  const pen = useStore((s) => s.lineStyle.pen)
  const selectMode = useStore((s) => s.selectMode)
  const eraserMode = useStore((s) => s.eraserMode)
  const highlightMode = useStore((s) => s.highlightMode)
  const hlColor = useStore((s) => s.hlColor)
  const paintPreview = useStore((s) => s.paintPreview)
  const textBold = useStore((s) => s.textBold)
  const textSize = useStore((s) => s.textSize)
  const boxAlign = useStore((s) => s.boxAlign)
  const textFont = useStore((s) => s.textFont)
  const textValign = useStore((s) => s.textValign)
  const storePopup = useStore((s) => s.popup)
  const crossPreview = useStore((s) => s.crossPreview)
  const popup = active ? storePopup : null
  useStore((s) => s.fontsVersion) // 글꼴이 늦게 로드되면 폭을 다시 잰다
  const cursor = active ? storeCursor : null
  // id는 페이지마다 겹치지 않아서, 고른 것은 펼침면 양쪽 페이지에 함께 있을 수 있다
  const selection = storeSelection
  const marquee = useStore((s) => s.marquee)
  const moveDelta = useStore((s) => s.moveDelta)
  const allPages = useStore((s) => s.pages)

  const [drag, setDragState] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const setDrag = (d: Drag | null) => {
    dragRef.current = d
    setDragState(d)
  }
  /** 마우스가 무엇 위에 있는지: 고른 것 / 그려둔 항목 / 점(선 긋기) / 칸 가운데(네모칸) */
  const [hover, setHover] = useState<{ dot: Pt | null; zone: 'selected' | 'item' | 'dot' | 'cell' } | null>(null)
  const composingEnter = useRef<boolean | 'shift'>(false)
  // 오른쪽 클릭 메뉴
  const [ctx, setCtx] = useState<CtxMenu | null>(null)
  const closeCtx = useCallback(() => setCtx(null), [])

  const { cols, rows, elements } = page
  const editing = cursor?.editId ? elements.find((e) => e.id === cursor.editId) : undefined
  const inputValue = editing && (editing.type === 'text' || editing.type === 'box') ? editing.text : ''
  const inputBold = editing && (editing.type === 'text' || editing.type === 'box') ? !!editing.bold : textBold
  const inputSize = editing && (editing.type === 'text' || editing.type === 'box') ? editing.size : textSize
  const inputFont = fontOf(editing && (editing.type === 'text' || editing.type === 'box') ? editing.font : textFont)

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
  }, [cursor?.x, cursor?.y, cursor?.editId, cursor === null, editing?.type === 'box'])

  useEffect(() => setDrag(null), [page.id])
  // 휴대폰에서 두 번째 손가락이 닿으면(확대·이동) 하던 그리기를 미리보기까지 지운다
  useEffect(() => {
    const cancel = () => {
      if (!dragRef.current) return
      setDrag(null)
      const st = useStore.getState()
      st.setMarquee(null)
      st.setPaintPreview(null)
      st.setCrossPreview(null)
    }
    window.addEventListener('dotlyt:cancel-draw', cancel)
    return () => window.removeEventListener('dotlyt:cancel-draw', cancel)
  }, [])

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
    const p = toGrid(e)
    // 네모칸 모서리 손잡이: 크기 바꾸기 (쓰는 중이면 쓰기는 그대로 둔다)
    const handle = (e.target as Element).closest?.<SVGElement>('[data-handle]')
    if (handle) {
      const box = elements.find((el) => el.id === handle.dataset.id)
      if (box?.type === 'box') {
        try {
          svgRef.current!.setPointerCapture(e.pointerId)
        } catch {
          /* 캡처가 안 되는 환경 */
        }
        const orig = { x: box.x, y: box.y, w: box.w, h: box.h }
        setDrag({ kind: 'resize', id: box.id, corner: handle.dataset.handle as Corner, orig, r: orig })
        return
      }
    }
    // 펼침면에서 다른 쪽 페이지를 누르면 그 페이지로. 이미 고른 것을 잡았으면 고른 상태를 유지한다.
    const pre = hitTest(elements, p, st.selection)
    // Shift를 누르고 있으면 반대쪽 페이지를 눌러도 이미 고른 것을 유지 (양쪽에 걸쳐 하나씩 추가)
    st.focusPage(page.id, e.shiftKey || (!!pre && st.selection.includes(pre.id)))
    if (st.popup) st.setPopup(null)
    const sel = useStore.getState().selection
    try {
      svgRef.current!.setPointerCapture(e.pointerId)
    } catch {
      /* 일부 환경에서는 캡처가 안 될 수 있다 */
    }
    if (st.highlightMode) {
      const c = { x: e.clientX, y: e.clientY }
      st.setPaintPreview(addPaintCells({}, c, c))
      setDrag({ kind: 'paint', start: c })
      return
    }
    if (st.eraserMode) {
      const first = hitTest(elements, p, [], true)
      setDrag({ kind: 'erase', ids: first ? [first.id] : [], last: p })
      return
    }
    // 고르기 도구에서는 형광펜도 눌러서 고를 수 있다 (평소에는 칠한 칸 위에도 글자를 쓰게 형광펜은 건너뛴다)
    const hit = hitTest(elements, p, sel, st.selectMode)
    const onSelected = !!hit && sel.includes(hit.id)
    // Shift: 항상 고르기(끌면 사각형, 누르면 하나 넣고 빼기). 고르기 도구: 고른 것을 잡으면 옮기기
    if (e.shiftKey || (st.selectMode && !onSelected)) {
      st.closeCursor()
      const c = { x: e.clientX, y: e.clientY }
      setDrag({ kind: 'marquee', ca: c, cb: c, additive: e.shiftKey, hit })
      st.setMarquee({ x1: c.x, y1: c.y, x2: c.x, y2: c.y })
      return
    }
    setDrag({ kind: 'pending', start: p, hit, onSelected, grab: distToDot(p) <= DOT_GRAB ? 'dot' : 'cell' })
  }

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = dragRef.current
    const p = toGrid(e)
    if (!d) {
      // 마우스와 펜(애플펜슬을 화면 가까이 띄우면 호버가 온다)만. 손가락은 닿을 때만 이벤트가 와서 미리보기가 의미 없다
      if (e.pointerType === 'touch') return
      const st = useStore.getState()
      const sel = st.selection
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
      // 선을 그을 수 있는 점 미리보기: 고르기·지우개·형광펜일 때는 선을 긋지 않으니 안 보인다
      const dot = !st.selectMode && !st.eraserMode && !st.highlightMode && zone === 'dot' ? nearestDot(p, cols, rows) : null
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
          setDrag({ kind: 'move', start: d.start })
          st.setMoveDelta({ dx: (p.x - d.start.x) * cell, dy: (p.y - d.start.y) * cell })
          return
        }
        st.setSelection([])
        if (d.grab === 'dot') {
          const a = nearestDot(d.start, cols, rows)
          setDrag({ kind: 'line', a, b: axisEnd(a, p, cols, rows), id: uid(), cross: null })
        } else {
          setDrag({ kind: 'box', a: cellOf(d.start, cols, rows), b: cellOf(p, cols, rows) })
        }
        return
      }
      case 'line': {
        // 펼침면: 가로로 긋다가 반대쪽 페이지로 넘어가면 이 페이지는 끝 점까지, 반대쪽은 첫 점부터
        const cross = crossTarget(e, d.a, p)
        const b = cross ? { x: side === 'left' ? cols - 1 : 1, y: d.a.y } : axisEnd(d.a, p, cols, rows)
        setDrag({ ...d, b, cross })
        st.setCrossPreview(cross && cross.b.x !== cross.a.x ? { ...cross, id: d.id + 'x' } : null)
        return
      }
      case 'box':
        setDrag({ ...d, b: cellOf(p, cols, rows) })
        return
      case 'marquee': {
        const cb = { x: e.clientX, y: e.clientY }
        setDrag({ ...d, cb })
        st.setMarquee({ x1: Math.min(d.ca.x, cb.x), y1: Math.min(d.ca.y, cb.y), x2: Math.max(d.ca.x, cb.x), y2: Math.max(d.ca.y, cb.y) })
        return
      }
      case 'move':
        st.setMoveDelta({ dx: (p.x - d.start.x) * cell, dy: (p.y - d.start.y) * cell })
        return
      case 'resize':
        setDrag({ ...d, r: resizeRect(d.orig, d.corner, p, cols, rows) })
        return
      case 'paint': {
        // 더 많이 움직인 방향(가로/세로)으로만 곧게 칠한다
        const a = d.start
        const dx = e.clientX - a.x
        const dy = e.clientY - a.y
        const b = Math.abs(dx) >= Math.abs(dy) ? { x: e.clientX, y: a.y } : { x: a.x, y: e.clientY }
        st.setPaintPreview(addPaintCells({}, a, b))
        return
      }
      case 'erase': {
        // 지나간 길을 촘촘히 훑어서 닿은 것을 모두 지운다
        const ids = new Set(d.ids)
        const steps = Math.max(1, Math.ceil(Math.hypot(p.x - d.last.x, p.y - d.last.y) / 0.2))
        for (let i = 1; i <= steps; i++) {
          const q = { x: d.last.x + ((p.x - d.last.x) * i) / steps, y: d.last.y + ((p.y - d.last.y) * i) / steps }
          const h = hitTest(
            elements.filter((el) => !ids.has(el.id)),
            q,
            [],
            true,
          )
          if (h) ids.add(h.id)
        }
        setDrag({ kind: 'erase', ids: [...ids], last: p })
        return
      }
    }
  }

  /** 반대쪽 페이지에 이어 그릴 부분. 가운데 접히는 부분은 비우고, 양쪽 페이지의 점들 사이에만 긋는다. */
  const crossTarget = (e: React.PointerEvent, a: Pt, p: Pt) => {
    if (side === 'single') return null
    if (Math.abs(p.x - a.x) < Math.abs(p.y - a.y)) return null // 세로 선은 넘어가지 않음
    if (side === 'left' ? p.x <= cols : p.x >= 0) return null // 아직 이 페이지 안
    const other = document.querySelector<SVGSVGElement>(`.page-wrap.${side === 'left' ? 'right' : 'left'} .page-svg`)
    const pageId = other?.dataset.pageId
    if (!other || !pageId) return null
    const ocols = other.viewBox.baseVal.width
    const orows = other.viewBox.baseVal.height
    if (a.y < 1 || a.y > orows - 1) return null
    const r = other.getBoundingClientRect()
    const ox = (e.clientX - r.left) / cell
    const first = side === 'left' ? 1 : ocols - 1
    const reached = side === 'left' ? ox > 1 : ox < ocols - 1
    const bx = Math.max(1, Math.min(ocols - 1, ox))
    return { pageId, a: { x: first, y: a.y }, b: { x: reached ? bx : first, y: a.y } }
  }

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = dragRef.current
    setDrag(null)
    if (!d) return
    const st = useStore.getState()
    const p = toGrid(e)
    switch (d.kind) {
      case 'pending': {
        if (d.hit?.type === 'line' || d.hit?.type === 'icon') {
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
        const pieces: { pageId: string; a: Pt; b: Pt; id: string }[] = []
        if (d.a.x !== b.x || d.a.y !== b.y) pieces.push({ pageId: page.id, a: d.a, b, id: d.id })
        if (d.cross) {
          const cb = { x: Math.round(d.cross.b.x), y: d.cross.a.y }
          if (cb.x !== d.cross.a.x) pieces.push({ pageId: d.cross.pageId, a: d.cross.a, b: cb, id: d.id + 'x' })
        }
        st.setCrossPreview(null)
        if (pieces.length) st.addLinePieces(pieces)
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
        // 거의 안 움직이고 뗐으면 클릭: 누른 항목 하나를 넣거나(Shift면 넣고 빼기) 고르기 해제
        if (Math.hypot(e.clientX - d.ca.x, e.clientY - d.ca.y) < 5) {
          st.setMarquee(null)
          const cur = st.selection
          if (!d.hit) st.setSelection(d.additive ? cur : [])
          else if (!d.additive) st.setSelection([d.hit.id])
          else st.setSelection(cur.includes(d.hit.id) ? cur.filter((id) => id !== d.hit!.id) : [...cur, d.hit.id])
          return
        }
        // 화면에 펼쳐진 모든 페이지에서, 사각형에 걸친 것을 고른다
        const m = { x1: Math.min(d.ca.x, e.clientX), y1: Math.min(d.ca.y, e.clientY), x2: Math.max(d.ca.x, e.clientX), y2: Math.max(d.ca.y, e.clientY) }
        const ids: string[] = []
        document.querySelectorAll<SVGSVGElement>('.page-svg').forEach((svg) => {
          const pg = st.pages.find((x) => x.id === svg.dataset.pageId)
          if (!pg) return
          const r = svg.getBoundingClientRect()
          const c = r.width / svg.viewBox.baseVal.width
          const box = { x1: (m.x1 - r.left) / c, y1: (m.y1 - r.top) / c, x2: (m.x2 - r.left) / c, y2: (m.y2 - r.top) / c }
          if (box.x2 < 0 || box.x1 > pg.cols || box.y2 < 0 || box.y1 > pg.rows) return
          ids.push(...pg.elements.filter((el) => boxTouches(elBox(el), box)).map((el) => el.id))
        })
        st.setMarquee(null)
        st.setSelection(d.additive ? Array.from(new Set([...st.selection, ...ids])) : ids)
        return
      }
      case 'resize': {
        st.resizeBox(d.id, d.r)
        if (st.cursor?.editId === d.id) inputRef.current?.focus({ preventScroll: true })
        return
      }
      case 'move': {
        const all = st.pages
        st.applyPlacements(placeSelection(all, st.selection, (p.x - d.start.x) * cell, (p.y - d.start.y) * cell))
        return
      }
      case 'erase':
        st.deleteIds(d.ids)
        return
      case 'paint': {
        const pv = st.paintPreview ?? {}
        st.setPaintPreview(null)
        st.paintCells(
          Object.fromEntries(Object.entries(pv).map(([id, keys]) => [id, keys.map((k) => ({ x: +k.split(',')[0], y: +k.split(',')[1] }))])),
          st.hlColor,
        )
        return
      }
    }
  }

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const st = useStore.getState()
    const c = st.cursor
    if (!c) return
    // 한글 조합 중 Enter는 조합만 끝낸다. 줄바꿈은 keyup에서 처리.
    if (e.nativeEvent.isComposing || e.keyCode === 229) {
      if (e.key === 'Enter') composingEnter.current = e.shiftKey ? 'shift' : true
      return
    }
    if (e.metaKey || e.ctrlKey) return // ⌘B, ⌘Z 등은 전체 단축키에서 처리
    // 팝업 단축키는 팝업이 먼저 처리한다. 그 밖의 키를 누르면 팝업을 닫고 평소처럼 쓴다.
    if (st.popup) st.setPopup(null)
    if (editing?.type === 'box') {
      // Shift+Enter: 네모칸 안에서 줄바꿈 (textarea 기본 동작). Enter·Esc: 쓰기 마치기
      if (e.key === 'Enter' && e.shiftKey) {
        composingEnter.current = false
        return
      }
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault()
        composingEnter.current = false
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
        // 조합 중 Enter 뒤에 일반 Enter가 또 오는 브라우저(크롬): 여기서 한 번만 내려가고 keyup에선 안 내려간다
        composingEnter.current = false
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
          st.openAt(c.x + (input.value ? textCells(input.value, inputBold, inputSize, inputFont.key) : 1), c.y)
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

  const onInputKeyUp = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && composingEnter.current) {
      const shift = composingEnter.current === 'shift'
      composingEnter.current = false
      const st = useStore.getState()
      const c = st.cursor
      if (!c) return
      if (editing?.type === 'box') {
        if (!shift) return st.closeCursor()
        // 한글 조합 중 Shift+Enter: 조합만 끝났으니 줄바꿈을 직접 넣는다
        const t = e.currentTarget
        const at = t.selectionStart ?? t.value.length
        if (t.value[at - 1] === '\n') return // 브라우저가 이미 넣었으면 그대로
        const v = t.value.slice(0, at) + '\n' + t.value.slice(t.selectionEnd ?? at)
        st.typeText(v)
        requestAnimationFrame(() => t.setSelectionRange(at + 1, at + 1))
      } else st.openAt(c.x, c.y + 1)
    }
  }

  // 옮기는 중: 고른 것은 실제로 놓일 페이지·칸에 보여준다 (반대쪽 페이지로 넘어가는 것 포함)
  const placements = moveDelta ? placeSelection(allPages, selection, moveDelta.dx, moveDelta.dy) : null
  const erasing = drag?.kind === 'erase' ? drag.ids : null
  const resizing = drag?.kind === 'resize' ? drag : null
  const shown = placements
    ? [...elements.filter((el) => !selection.includes(el.id)), ...placements.filter((pl) => pl.to === page.id).map((pl) => pl.el)]
    : erasing
      ? elements.filter((el) => !erasing.includes(el.id))
      : resizing
        ? elements.map((el) => (el.id === resizing.id ? ({ ...el, ...resizing.r } as El) : el))
        : elements
  // 고른 것 막대·오른쪽 클릭 메뉴는 닫힐 때도 잠깐 남아 스르륵 사라진다
  const barLinger = useLinger(!drag && !moveDelta && !marquee && selBar && selection.length > 0 ? { elements: shown, selection } : null)
  const ctxLinger = useLinger(ctx)
  // 크기를 바꿀 수 있는 네모칸: 쓰고 있거나 혼자 고른 것, 1×1보다 클 때
  const resizable = shown.find(
    (el): el is Extract<El, { type: 'box' }> =>
      el.type === 'box' &&
      (el.w > 1 || el.h > 1 || resizing?.id === el.id) &&
      (cursor?.editId === el.id || (selection.length === 1 && selection[0] === el.id)) &&
      !highlightMode &&
      !eraserMode &&
      !moveDelta,
  )

  // 커서: 지우개 / 옮기는 중 / 고른 것(잡기) / 그려둔 항목(손가락) / 선 긋기(펜) / 네모칸(네모 커서)
  const svgCursorStyle = highlightMode
    ? highlighterCursor(hlColor)
    : eraserMode
    ? ERASER_CURSOR
    : moveDelta
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
    const fsR = fs * inputFont.scale
    const n = boxLines(inputValue).length
    // 그려지는 글자와 같은 줄 간격·같은 세로 자리에 오게
    const ys = boxLineYs(editing.valign, fsR, editing.h, n)
    const firstY = ys[0]
    // 줄 간격: 그려지는 줄 사이 거리 그대로 (칸 줄에 맞춘 경우는 칸 높이)
    const lh = n > 1 ? ys[1] - ys[0] : fsR * BOX_LINE_GAP
    inputStyle = {
      left: editing.x * cell,
      top: editing.y * cell,
      width: editing.w * cell,
      height: editing.h * cell,
      lineHeight: `${lh * cell}px`,
      paddingTop: Math.max(0, (firstY - lh / 2) * cell),
      paddingBottom: 0,
      fontSize: fs * inputFont.scale * cell,
      fontFamily: inputFont.family,
      ...boldCss(inputBold, cell, (fs * inputFont.scale) / FONT_SIZE, editing.color),
      ...(editing.color ? { color: editing.color } : {}),
      paddingLeft: BOX_PAD * cell,
      paddingRight: BOX_PAD * cell,
      textAlign: editing.align ?? 'left',
      // 양쪽 정렬: 직접 줄을 바꾼 줄도 그려지는 글자처럼 양쪽으로 벌린다
      ...(editing.align === 'justify' ? { textAlignLast: 'justify' as const } : {}),
      // 크기를 바꾸는 동안은 그려진 미리보기를 보여준다
      visibility: resizing?.id === editing.id ? 'hidden' : undefined,
      pointerEvents: inputValue && !selectMode && !eraserMode ? 'auto' : 'none',
    }
  } else if (cursor) {
    const align0 = editing?.type === 'text' ? (editing.align ?? 'left') : boxAlign
    // 줄 글자의 양쪽 정렬은 왼쪽과 같다
    const align = align0 === 'justify' ? 'left' : align0
    const n = textInk({ x: cursor.x, text: inputValue, bold: inputBold, size: inputSize, align, font: inputFont.key }).n
    // 왼쪽 정렬: 오른쪽으로 늘어나는 입력칸 / 가운데·오른쪽: 글자가 차지한 칸에 딱 맞춘 입력칸
    const w =
      align === 'left'
        ? Math.min(Math.max(TEXT_PAD + textWidth(inputValue, inputBold, inputSize, inputFont.key) + 1, 1.5), cols - cursor.x)
        : Math.min(n, cols - cursor.x)
    inputStyle = {
      textAlign: align,
      paddingRight: align === 'right' ? TEXT_PAD * cell : 0,
      left: cursor.x * cell,
      top: cursor.y * cell,
      width: w * cell,
      height: cell,
      ...vPlace(editing?.type === 'text' ? editing.valign : textValign, fontSizeOf(inputSize) * inputFont.scale, 1, cell),
      fontSize: fontSizeOf(inputSize) * inputFont.scale * cell,
      fontFamily: inputFont.family,
      ...boldCss(inputBold, cell, (fontSizeOf(inputSize) * inputFont.scale) / FONT_SIZE, editing?.type === 'text' ? editing.color : undefined),
      ...(editing?.type === 'text' && editing.color ? { color: editing.color } : {}),
      paddingLeft: align === 'left' ? TEXT_PAD * cell : 0,
      // 빈 칸이면 클릭이 도트지로 가게 (같은 칸을 한 번 더 누르면 기호 팝업)
      pointerEvents: inputValue && !selectMode && !eraserMode ? 'auto' : 'none',
    }
  }

  return (
    <div
      className={'page-wrap ' + side}
      style={{ width: cols * cell, height: rows * cell, ['--stack' as string]: `${stackPx(side, allPages.findIndex((p) => p.id === page.id), allPages.length)}px` }}
    >
      <div className="stack-side" />
      <div className="stack-bottom" />
      <div className="page">
        <svg
          ref={svgRef}
          className="page-svg"
          data-page-id={page.id}
          style={{ cursor: svgCursorStyle }}
          width={cols * cell}
          height={rows * cell}
          viewBox={`0 0 ${cols} ${rows}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            setDrag(null)
            const st = useStore.getState()
            st.setCrossPreview(null)
            st.setMarquee(null)
            st.setMoveDelta(null)
          }}
          onPointerLeave={() => setHover(null)}
          onContextMenu={(e) => {
            e.preventDefault()
            const st = useStore.getState()
            if (dragRef.current) return
            const p = toGrid(e as unknown as React.PointerEvent)
            st.focusPage(page.id, true)
            st.setPopup(null)
            const hit = hitTest(elements, p, st.selection, true)
            if (hit && !st.selection.includes(hit.id)) {
              st.closeCursor()
              st.setSelection([hit.id])
            }
            const wrap = svgRef.current!.getBoundingClientRect()
            setCtx({ left: e.clientX - wrap.left, top: e.clientY - wrap.top, cx: Math.floor(p.x), cy: Math.floor(p.y), onItem: !!hit })
          }}
        >
          <defs>
            <pattern id={dotsId} x={-0.5} y={-0.5} width={1} height={1} patternUnits="userSpaceOnUse">
              <circle cx={0.5} cy={0.5} r={Math.max(0.04, 0.85 / cell)} className="dot" />
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
          {guides && <GuideMarks cols={cols} rows={rows} side={side} />}
          {/* 쪽번호: 마지막 점 줄 아래 여백 가운데 */}
          <text x={cols / 2} y={rows - 0.42} fontSize={Math.max(0.36, 9 / cell)} textAnchor="middle" dominantBaseline="central" className="page-no-mark">
            {allPages.findIndex((p) => p.id === page.id) + 1}
          </text>

          {/* 형광펜 칸: 글자·선 뒤에 */}
          {shown.map((el) => (el.type === 'mark' ? <MarkGlyph key={el.id} el={el} /> : null))}
          {hlColor &&
            paintPreview?.[page.id]?.length &&
            (() => {
              // 칠하는 중에도 마커 획으로: 지나간 칸을 한 획으로 묶어서
              const cells = paintPreview[page.id].map((k) => k.split(',').map(Number) as [number, number])
              const xs = cells.map((c) => c[0])
              const ys = cells.map((c) => c[1])
              const m: MarkEl = { id: 'pv', type: 'mark', x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs) + 1, h: Math.max(...ys) - Math.min(...ys) + 1, color: hlColor }
              return <MarkGlyph el={m} preview />
            })()}
          {paintPreview?.[page.id]?.map((k) => {
            const [px, py] = k.split(',').map(Number)
            return hlColor ? null : (
              <rect key={'pv' + k} x={px + 0.06} y={py + 0.06} width={0.88} height={0.88} rx={0.1} className="hl-erase" />
            )
          })}
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
              ) : el.type === 'mark' ? (
                <rect key={'sel' + el.id} x={el.x} y={el.y} width={el.w} height={el.h} className="sel-box" />
              ) : el.type === 'icon' ? (
                <rect key={'sel' + el.id} x={el.x} y={el.y} width={el.size} height={el.size} rx={0.15} className="sel-box" />
              ) : el.type === 'bullet' ? (
                <rect key={'sel' + el.id} x={el.x + 0.05} y={el.y + 0.05} width={0.9} height={0.9} rx={0.15} className="sel-box" />
              ) : (
                <rect
                  key={'sel' + el.id}
                  x={textInk(el).start - TEXT_PAD}
                  y={el.y + 0.06}
                  width={TEXT_PAD * 2 + textWidth(el.text, el.bold, el.size, el.font)}
                  height={0.88}
                  rx={0.15}
                  className="sel-box"
                />
              ),
            )}

          {shown.map((el) => {
            if (el.type === 'mark') return null
            if (el.type === 'line') return <InkLine key={el.id} line={el} filterId={pencilId} />
            if (el.type === 'bullet') return <BulletGlyph key={el.id} b={el} elements={shown} />
            if (el.type === 'icon') return <IconGlyph key={el.id} el={el} />
            if (el.type === 'box') {
              const isEditing = cursor?.editId === el.id
              return (
                <g key={el.id}>
                  {isEditing && <rect x={el.x} y={el.y} width={el.w} height={el.h} rx={0.15} className="box-edit" />}
                  <BoxText el={el} hidden={isEditing && resizing?.id !== el.id} />
                </g>
              )
            }
            return (
              <text
                key={el.id}
                x={textAnchor(el).x}
                textAnchor={textAnchor(el).anchor}
                y={el.y + textMidY(el.valign, fontSizeOf(el.size) * fontOf(el.font).scale)}
                dominantBaseline="central"
                fontSize={fontSizeOf(el.size) * fontOf(el.font).scale}
                fontFamily={fontOf(el.font).family}
                {...boldProps(el.bold, (fontSizeOf(el.size) * fontOf(el.font).scale) / FONT_SIZE, el.color)}
                style={el.color ? { fill: el.color } : undefined}
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
          {hover?.dot && !drag && !highlightMode && <circle cx={hover.dot.x} cy={hover.dot.y} r={0.2} className="hover-dot" />}
          {resizable &&
            CORNERS.map((c) => {
              const hx = resizable.x + (c.includes('e') ? resizable.w : 0)
              const hy = resizable.y + (c.includes('s') ? resizable.h : 0)
              // 보이는 손잡이는 작게, 잡는 곳은 넉넉하게
              const vis = Math.max(0.28, 9 / cell)
              const grab = Math.max(0.8, 22 / cell)
              return (
                <g key={c} className={'box-handle ' + c} data-handle={c} data-id={resizable.id}>
                  <rect x={hx - grab / 2} y={hy - grab / 2} width={grab} height={grab} fill="transparent" />
                  <rect x={hx - vis / 2} y={hy - vis / 2} width={vis} height={vis} rx={vis * 0.25} className="box-handle-dot" />
                </g>
              )
            })}

          {drag?.kind === 'line' && <LivePreview drag={drag} filterId={pencilId} />}
          {crossPreview?.pageId === page.id && <LivePreview drag={crossPreview} filterId={pencilId} />}
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
          {marquee && svgRef.current && <MarqueeRect m={marquee} svg={svgRef.current} cell={cell} />}
        </svg>

        {editing?.type === 'box' ? (
          <textarea
            ref={inputRef}
            className="ink-input box-input"
            aria-label="네모칸 글자 입력 (Shift+Enter 줄바꿈)"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            rows={1}
            value={inputValue}
            onChange={(e) => useStore.getState().typeText(e.target.value)}
            onKeyDown={onInputKeyDown}
            onKeyUp={onInputKeyUp}
            style={inputStyle}
          />
        ) : (
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
        )}
      </div>
      {popup && popup.kind !== 'icon' && <SymbolPopup popup={popup} elements={elements} cell={cell} />}
      {ctxLinger.value && <ContextMenu menu={ctxLinger.value} onClose={closeCtx} leaving={ctxLinger.leaving} />}
      {popup?.kind === 'icon' && <IconPicker x={popup.x} y={popup.y} cols={cols} rows={rows} cell={cell} replacing={!!popup.replaceId} />}
      {barLinger.value && <SelectionBar elements={barLinger.value.elements} selection={barLinger.value.selection} cell={cell} cols={cols} leaving={barLinger.leaving} />}
    </div>
  )
}
