import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import {
  BOX_PAD,
  DOT_GRAB,
  DRAG_THRESHOLD,
  FONT_SIZE,
  TEXT_PAD,
  axisEnd,
  boxFontSize,
  boxTouches,
  distToDot,
  elBox,
  hitTest,
  itemTextOf,
  fontSizeOf,
  textWidth,
  textAnchor,
  textMidY,
  textInk,
  nearestDot,
  textCells,
} from '../geometry'
import { fontOf } from '../fonts'
import { ICONS, ICON_GROUPS, iconOf } from '../icons'
import { strokePaths } from '../ink'
import { placeSelection } from '../move'
import { TextStyleButton } from './TextStylePanel'
import { uid, useStore } from '../store'
import type { BulletEl, BulletState, El, IconEl, LineEl, Page, PenType, Pt, TextVAlign } from '../types'

type Drag =
  | { kind: 'pending'; start: Pt; hit: El | null; onSelected: boolean; grab: 'dot' | 'cell' }
  | { kind: 'line'; a: Pt; b: Pt; id: string; cross: { pageId: string; a: Pt; b: Pt } | null }
  | { kind: 'box'; a: Pt; b: Pt }
  | { kind: 'marquee'; ca: Pt; cb: Pt; additive: boolean; hit: El | null } // 화면 좌표: 양쪽 페이지에 걸쳐 고를 수 있게
  | { kind: 'move'; start: Pt } // 옮기는 양은 화면 픽셀로 store.moveDelta에
  | { kind: 'erase'; ids: string[]; last: Pt }
  | { kind: 'paint'; start: Pt } // 형광펜: 시작점에서 가로나 세로 한 줄로만. 칠할 칸은 store.paintPreview에 (양쪽 페이지)

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
  `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g stroke="#fff" stroke-width="3" stroke-linecap="round"><path d="M10 2v16M2 10h16"/></g><g stroke="#2b2a28" stroke-width="1.4" stroke-linecap="round"><path d="M10 2v16M2 10h16"/></g><rect x="15" y="15" width="13" height="10" rx="1.5" fill="rgba(35,131,226,0.15)" stroke="#2383e2" stroke-width="1.4" stroke-dasharray="2.5 2"/><text x="18.5" y="23.3" font-size="8" font-family="sans-serif" font-weight="700" fill="#2383e2">T</text></svg>`,
)}") 10 10, crosshair`

const HIGHLIGHTER_CURSOR = svgCursor(
  `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g transform="rotate(45 16 16)"><rect x="11.5" y="1" width="9" height="17" rx="2" fill="#f2d24b" stroke="#3a3328" stroke-width="1.2"/><rect x="11.5" y="14" width="9" height="4" fill="#3a3328" opacity=".25"/><path d="M12.5 18h7l-1.5 5h-4z" fill="#f7f1e1" stroke="#3a3328" stroke-width="1.2" stroke-linejoin="round"/><path d="M14 23h4l-.6 4.5h-2.8z" fill="#f2d24b" stroke="#3a3328" stroke-width="1"/></g></svg>`,
  'cell',
)

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
  /** 고른 것 위 막대를 이 페이지에 띄울지 (양쪽에 걸쳐 고르면 한쪽에만) */
  selBar: boolean
}

export default function PageView({ page, cell, active, side, guides, selBar }: Props) {
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
  const composingEnter = useRef(false)

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
    const p = toGrid(e)
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
    const hit = hitTest(elements, p, sel)
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
      if (e.pointerType !== 'mouse') return
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

  // 옮기는 중: 고른 것은 실제로 놓일 페이지·칸에 보여준다 (반대쪽 페이지로 넘어가는 것 포함)
  const placements = moveDelta ? placeSelection(allPages, selection, moveDelta.dx, moveDelta.dy) : null
  const erasing = drag?.kind === 'erase' ? drag.ids : null
  const shown = placements
    ? [...elements.filter((el) => !selection.includes(el.id)), ...placements.filter((pl) => pl.to === page.id).map((pl) => pl.el)]
    : erasing
      ? elements.filter((el) => !erasing.includes(el.id))
      : elements

  // 커서: 지우개 / 옮기는 중 / 고른 것(잡기) / 그려둔 항목(손가락) / 선 긋기(펜) / 네모칸(네모 커서)
  const svgCursorStyle = highlightMode
    ? HIGHLIGHTER_CURSOR
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
    inputStyle = {
      left: editing.x * cell,
      top: editing.y * cell,
      width: editing.w * cell,
      height: editing.h * cell,
      ...vPlace(editing.valign, fs * inputFont.scale, editing.h, cell),
      fontSize: fs * inputFont.scale * cell,
      fontFamily: inputFont.family,
      ...boldCss(inputBold, cell, (fs * inputFont.scale) / FONT_SIZE),
      paddingLeft: BOX_PAD * cell,
      paddingRight: BOX_PAD * cell,
      textAlign: editing.align ?? 'left',
      pointerEvents: inputValue && !selectMode && !eraserMode ? 'auto' : 'none',
    }
  } else if (cursor) {
    const align = editing?.type === 'text' ? (editing.align ?? 'left') : boxAlign
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
      ...boldCss(inputBold, cell, (fontSizeOf(inputSize) * inputFont.scale) / FONT_SIZE),
      paddingLeft: align === 'left' ? TEXT_PAD * cell : 0,
      // 빈 칸이면 클릭이 도트지로 가게 (같은 칸을 한 번 더 누르면 기호 팝업)
      pointerEvents: inputValue && !selectMode && !eraserMode ? 'auto' : 'none',
    }
  }

  return (
    <div className={'page-wrap ' + side} style={{ width: cols * cell, height: rows * cell }}>
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
          {guides && <GuideMarks cols={cols} rows={rows} side={side} />}

          {/* 형광펜 칸: 글자·선 뒤에 */}
          {shown.map((el) =>
            el.type === 'mark' ? (
              <rect key={el.id} x={el.x} y={el.y} width={el.w} height={el.h} fill={el.color} className="hl-mark" />
            ) : null,
          )}
          {paintPreview?.[page.id]?.map((k) => {
            const [px, py] = k.split(',').map(Number)
            return hlColor ? (
              <rect key={'pv' + k} x={px} y={py} width={1} height={1} fill={hlColor} className="hl-mark preview" />
            ) : (
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
                  <text
                    x={el.align === 'center' ? el.x + el.w / 2 : el.align === 'right' ? el.x + el.w - BOX_PAD : el.x + BOX_PAD}
                    textAnchor={el.align === 'center' ? 'middle' : el.align === 'right' ? 'end' : 'start'}
                    y={el.y + textMidY(el.valign, boxFontSize(el) * fontOf(el.font).scale, el.h)}
                    dominantBaseline="central"
                    fontSize={boxFontSize(el) * fontOf(el.font).scale}
                    fontFamily={fontOf(el.font).family}
                    {...boldProps(el.bold, (boxFontSize(el) * fontOf(el.font).scale) / FONT_SIZE)}
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
                x={textAnchor(el).x}
                textAnchor={textAnchor(el).anchor}
                y={el.y + textMidY(el.valign, fontSizeOf(el.size) * fontOf(el.font).scale)}
                dominantBaseline="central"
                fontSize={fontSizeOf(el.size) * fontOf(el.font).scale}
                fontFamily={fontOf(el.font).family}
                {...boldProps(el.bold, (fontSizeOf(el.size) * fontOf(el.font).scale) / FONT_SIZE)}
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
      {popup && popup.kind !== 'icon' && <SymbolPopup popup={popup} elements={elements} cell={cell} />}
      {popup?.kind === 'icon' && <IconPicker x={popup.x} y={popup.y} cols={cols} rows={rows} cell={cell} replacing={!!popup.replaceId} />}
      {!drag && !moveDelta && !marquee && selBar && selection.length > 0 && (
        <SelectionBar elements={shown} selection={selection} cell={cell} cols={cols} />
      )}
    </div>
  )
}


function cellOf(p: Pt, cols: number, rows: number): Pt {
  return { x: Math.max(0, Math.min(cols - 1, Math.floor(p.x))), y: Math.max(0, Math.min(rows - 1, Math.floor(p.y))) }
}

export function InkLine({ line, filterId, live }: { line: LineEl; filterId: string; live?: boolean }) {
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

/** 분할 그리드: 종이 가장자리 여백(첫 점 줄 바깥 한 칸)에 ⅓ ½ ⅔ 지점을 표시. 위치는 가장 가까운 점에 맞춘다. */
function GuideMarks({ cols, rows, side }: { cols: number; rows: number; side: Props['side'] }) {
  const marks = [
    { f: 1 / 3, label: '⅓', major: false },
    { f: 1 / 2, label: '½', major: true },
    { f: 2 / 3, label: '⅔', major: false },
  ]
  const snap = (v: number, n: number) => Math.max(1, Math.min(n - 1, Math.round(v)))
  // 세로 위치 표시는 바깥쪽 여백에 (펼침면 오른쪽 페이지는 오른쪽 여백)
  const outerRight = side === 'right'
  return (
    <g className="guide-marks" aria-hidden>
      {marks.map((m) => {
        const x = snap(m.f * cols, cols)
        return (
          <g key={'x' + m.f} className={m.major ? 'major' : undefined}>
            <line x1={x} y1={m.major ? 0.12 : 0.3} x2={x} y2={0.82} />
            <text x={x + 0.22} y={0.4} fontSize={0.4} dominantBaseline="central">
              {m.label}
            </text>
          </g>
        )
      })}
      {marks.map((m) => {
        const y = snap(m.f * rows, rows)
        const from = m.major ? 0.12 : 0.3
        return (
          <g key={'y' + m.f} className={m.major ? 'major' : undefined}>
            <line
              x1={outerRight ? cols - from : from}
              y1={y}
              x2={outerRight ? cols - 0.82 : 0.82}
              y2={y}
            />
            <text
              x={outerRight ? cols - 0.42 : 0.42}
              y={y - 0.42}
              fontSize={0.4}
              textAnchor="middle"
              dominantBaseline="central"
            >
              {m.label}
            </text>
          </g>
        )
      })}
    </g>
  )
}

const INK = '#2b2a28'

/** 불렛 기호 하나. 펜으로 찍은 것처럼 약간 두툼하게. */
export function Glyph({ state, cx, cy }: { state: BulletState; cx: number; cy: number }) {
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

export function BulletGlyph({ b, elements }: { b: BulletEl; elements: El[] }) {
  const item = b.cancelled ? itemTextOf(elements, b) : null
  const strike = item
    ? strokePaths(textInk(item).start - 0.1, item.y + 0.55, textInk(item).end + 0.12, item.y + 0.5, {
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
type SymPopup = Exclude<NonNullable<ReturnType<typeof useStore.getState>['popup']>, { kind: 'icon' }>
function SymbolPopup({ popup, elements, cell }: { popup: SymPopup; elements: El[]; cell: number }) {
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
  const hasClip = !!st.clipboard
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
      {popup.kind === 'insert' && (
        <>
          <span className="sym-sep" />
          <button role="menuitem" className="sym-opt" onClick={() => st.setPopup({ kind: 'icon', x: popup.x, y: popup.y })}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d={iconOf('sun').d} />
            </svg>
            <span className="sym-label">아이콘</span>
          </button>
        </>
      )}
      {popup.kind === 'insert' && hasClip && (
        <>
          <span className="sym-sep" />
          <button role="menuitem" className="sym-opt" onClick={() => st.paste()}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
              <rect x="6" y="4" width="12" height="17" rx="2" />
              <path d="M9 4V3h6v1M9 10h6M9 14h4" strokeLinecap="round" />
            </svg>
            <span className="sym-label">붙여넣기</span>
            <kbd>⌘V</kbd>
          </button>
        </>
      )}
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
export function boldProps(bold?: boolean, scale = 1) {
  return bold ? { stroke: INK, strokeWidth: BOLD_STROKE * scale, paintOrder: 'stroke' as const, strokeLinejoin: 'round' as const } : {}
}
function boldCss(bold: boolean, cell: number, scale = 1): React.CSSProperties {
  return bold ? { WebkitTextStroke: `${BOLD_STROKE * cell * scale}px ${INK}`, paintOrder: 'stroke' } : {}
}

/** 고른 것 위에 뜨는 작은 막대: 지우기, 복제, 굵게, 고르기 해제 */
function SelectionBar({ elements, selection, cell, cols }: { elements: El[]; selection: string[]; cell: number; cols: number }) {
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
  const st = useStore.getState()
  return (
    <div
      ref={barRef}
      className={'sel-bar' + (below ? ' below' : '')}
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
      <button onClick={() => st.setSelection([])} title="고르기 해제 (Esc)" aria-label="고르기 해제">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  )
}

/** 양쪽 페이지에 걸친 고르기 사각형 중 이 페이지에 걸친 부분 */
function MarqueeRect({ m, svg, cell }: { m: { x1: number; y1: number; x2: number; y2: number }; svg: SVGSVGElement; cell: number }) {
  const r = svg.getBoundingClientRect()
  return (
    <rect
      x={(m.x1 - r.left) / cell}
      y={(m.y1 - r.top) / cell}
      width={(m.x2 - m.x1) / cell}
      height={(m.y2 - m.y1) / cell}
      className="marquee"
    />
  )
}

/** 단색 선 아이콘 하나. 칸 가장자리에서 조금 띄워 그린다. */
export function IconGlyph({ el }: { el: IconEl }) {
  const pad = 0.08 * el.size
  const k = (el.size - pad * 2) / 24
  return (
    <g transform={`translate(${el.x + pad} ${el.y + pad}) scale(${k})`}>
      <path
        d={iconOf(el.icon).d}
        fill="none"
        stroke={el.color}
        strokeWidth={el.size === 1 ? 2 : 1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  )
}

/** 아이콘 고르기: 칸 옆에 떠서, 크기(1~3칸)를 정하고 아이콘을 누르면 그 칸에 들어간다 */
function IconPicker({ x, y, cols, rows, cell, replacing }: { x: number; y: number; cols: number; rows: number; cell: number; replacing: boolean }) {
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
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
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

/**
 * 형광펜: 화면 좌표 a→b를 촘촘히 훑어, 지나간 칸을 페이지별로 모은다 (펼침면 양쪽 페이지에 걸쳐 칠할 수 있게).
 * 칸은 "x,y" 문자열.
 */
function addPaintCells(prev: Record<string, string[]>, a: Pt, b: Pt): Record<string, string[]> {
  const svgs = [...document.querySelectorAll<SVGSVGElement>('.page-svg')].map((svg) => ({
    id: svg.dataset.pageId!,
    r: svg.getBoundingClientRect(),
    cols: svg.viewBox.baseVal.width,
    rows: svg.viewBox.baseVal.height,
  }))
  const next: Record<string, Set<string>> = {}
  for (const [id, keys] of Object.entries(prev)) next[id] = new Set(keys)
  const cellPx = svgs[0] ? svgs[0].r.width / svgs[0].cols : 10
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (cellPx / 3)))
  for (let i = 0; i <= steps; i++) {
    const x = a.x + ((b.x - a.x) * i) / steps
    const y = a.y + ((b.y - a.y) * i) / steps
    const sv = svgs.find((o) => x >= o.r.left && x < o.r.right && y >= o.r.top && y < o.r.bottom)
    if (!sv) continue
    const c = sv.r.width / sv.cols
    const cx = Math.floor((x - sv.r.left) / c)
    const cy = Math.floor((y - sv.r.top) / c)
    if (cx < 0 || cy < 0 || cx >= sv.cols || cy >= sv.rows) continue
    ;(next[sv.id] ??= new Set()).add(`${cx},${cy}`)
  }
  return Object.fromEntries(Object.entries(next).map(([id, set]) => [id, [...set]]))
}

/** 입력칸 안에서 글자 세로 위치: 가운데면 줄 높이로, 위·아래면 위쪽 여백으로 맞춘다 */
function vPlace(valign: TextVAlign | undefined, fs: number, h: number, cell: number): React.CSSProperties {
  if (!valign || valign === 'middle') return { lineHeight: `${h * cell}px`, paddingTop: 0, paddingBottom: 0 }
  const lh = fs * 1.25 * cell
  return { lineHeight: `${lh}px`, paddingTop: Math.max(0, textMidY(valign, fs, h) * cell - lh / 2), paddingBottom: 0 }
}
