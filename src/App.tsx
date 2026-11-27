import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { IndexEditor, IndexTabs } from './components/IndexTabs'
import { CoverScreen } from './components/CoverScreen'
import { DeletePageDialog } from './components/DeletePageDialog'
import NotebookForm from './components/NotebookForm'
import { PagesOverview } from './components/PagesOverview'
import PageView from './components/PageView'
import Toolbar from './components/Toolbar'
import { currentPage, spreadStart, useStore } from './store'
import { HIGHLIGHT_COLORS, INK_COLORS, isLight } from './types'
import { matchShortcut } from './shortcuts'
import { ShortcutHelp } from './components/ShortcutHelp'
import { FindBar } from './components/FindBar'
import { TemplatesPanel } from './components/TemplatesPanel'
import { PageTurn, type Turn } from './components/PageTurn'
import { GuideTour, guideDone } from './components/GuideTour'
import { TooltipLayer, tip } from './components/Tooltip'
import { ModalClose } from './components/ModalClose'
import { MoreMenu } from './components/MoreMenu'
import { AccountDialog } from './components/AccountDialog'
import { useSync } from './sync'

export default function App() {
  const notebook = useStore((s) => s.notebook)
  const createNotebook = useStore((s) => s.createNotebook)
  // 첫 화면은 표지. 노트를 막 만들었으면 바로 펼친다.
  const [view, setView] = useState<'cover' | 'notebook'>('cover')
  const [fromCover, setFromCover] = useState(false)
  const [backToCover, setBackToCover] = useState(false)
  const [setupLeaving, setSetupLeaving] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const sync = useSync()
  const [justCreated, setJustCreated] = useState(false)

  if (!notebook || setupLeaving) {
    return (
      <div className={'setup' + (setupLeaving ? ' leaving' : '')}>
        <h1 className="brand">Dotlyt</h1>
        <p className="setup-sub">도트지 노트를 한 권 만들어요.</p>
        <NotebookForm
          submitLabel="노트 만들기"
          onSubmit={(nb) => {
            if (setupLeaving) return
            // 만들기 화면이 스르륵 사라진 뒤 → 새 노트 표지가 나타나고 → 저절로 펼쳐진다
            const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
            setSetupLeaving(true)
            window.setTimeout(
              () => {
                createNotebook(nb)
                setJustCreated(true)
                setView('cover')
                setSetupLeaving(false)
              },
              reduce ? 0 : 320,
            )
          }}
        />
        {sync.enabled && (
          <p className="setup-account">
            {sync.email ? (
              <>{sync.email}로 로그인했어요. 만든 노트는 계정에 저장돼요.</>
            ) : (
              <>
                로그인 없이도 쓸 수 있지만, 노트가 이 브라우저에만 저장돼서 많이 쓰지는 못하고 다른 기기에서는 이어지지 않아요.{' '}
                <button type="button" className="link-btn" onClick={() => setAccountOpen(true)}>
                  로그인하기
                </button>
              </>
            )}
          </p>
        )}
        {accountOpen && <AccountDialog onClose={() => setAccountOpen(false)} />}
      </div>
    )
  }
  if (view === 'cover')
    return (
      <CoverScreen
        closing={backToCover}
        autoOpen={justCreated}
        onOpen={() => {
          setJustCreated(false)
          setBackToCover(false)
          setFromCover(true)
          setView('notebook')
        }}
      />
    )
  return (
    <Workspace
      fromCover={fromCover}
      onHome={() => {
        const st = useStore.getState()
        st.closeCursor()
        st.setSelection([])
        setBackToCover(true)
        setView('cover')
      }}
    />
  )
}

function Workspace({ onHome, fromCover }: { onHome: () => void; fromCover: boolean }) {
  const notebook = useStore((s) => s.notebook)!
  const page = useStore(currentPage)
  const pages = useStore((s) => s.pages)
  const pageCount = pages.length
  const pageIndex = useStore((s) => s.pages.findIndex((p) => p.id === s.currentPageId))
  const spread = useStore((s) => s.spread)
  const setSpread = useStore((s) => s.setSpread)
  const showGuides = useStore((s) => s.showGuides)
  const saveStatus = useStore((s) => s.saveStatus)
  const goRelative = useStore((s) => s.goRelative)
  const addPage = useStore((s) => s.addPage)
  const updateNotebook = useStore((s) => s.updateNotebook)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const sync = useSync()
  const [indexEditFor, setIndexEditFor] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [overviewOpen, setOverviewOpen] = useState(false)

  const deskRef = useRef<HTMLDivElement>(null)
  const [desk, setDesk] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = deskRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect
      setDesk({ w: r.width, h: r.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 키보드 단축키 (목록은 shortcuts.ts)
  const [helpOpen, setHelpOpen] = useState(false)
  const [findOpen, setFindOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  // 처음 쓰는 사람을 위한 안내: 아직 끝내지 않았으면 노트를 펼친 뒤 잠깐 있다가 자동으로
  const [guideOpen, setGuideOpen] = useState(false)
  useEffect(() => {
    if (guideDone()) return
    const t = window.setTimeout(() => setGuideOpen(true), fromCover ? 1200 : 500)
    return () => window.clearTimeout(t)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useStore.getState()
      if (e.isComposing) return
      const id = matchShortcut(e)
      // 찾기는 창이 열려 있어도 (다시 누르면 찾는 칸으로)
      if (id === 'find') {
        e.preventDefault()
        setFindOpen(true)
        return
      }
      if (document.querySelector('.modal, .overview')) return
      const t = e.target instanceof Element ? e.target : null
      const inField = !!t?.closest('input, textarea, select')
      // 글자를 쓰는 중(입력칸에 글자가 있음)이면 복사·붙여넣기 등은 입력칸 기본 동작
      const typing = inField && !(t instanceof HTMLInputElement && t.classList.contains('ink-input') && !t.value)
      switch (id) {
        case 'undo':
          e.preventDefault()
          return st.undo()
        case 'redo':
          e.preventDefault()
          return st.redo()
        case 'bold':
          e.preventDefault()
          return st.toggleBold()
        case 'copy':
          if (!typing && st.copySelection()) e.preventDefault()
          return
        case 'cut':
          if (!typing && st.cutSelection()) e.preventDefault()
          return
        case 'paste':
          if (!typing && st.paste()) e.preventDefault()
          return
        case 'duplicate':
          if (!typing && st.selection.length) {
            e.preventDefault()
            st.duplicateSelection()
          }
          return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        return st.redo()
      }
      // 여기부터는 글자를 쓰고 있지 않을 때만 (빈 입력칸 포함: 글자 키는 글자로 써야 하니 입력칸이면 안 받음)
      if (inField) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && st.selection.length) {
        e.preventDefault()
        return st.deleteSelection()
      }
      if (e.key === 'Escape') {
        st.setSelection([])
        st.closeCursor()
        st.setSelectMode(false)
        st.setEraserMode(false)
        st.setHighlightMode(false)
        return
      }
      // 글자나 네모칸 하나를 고른 상태에서 Enter: 그 글자 고치기
      if (e.key === 'Enter' && st.selection.length === 1) {
        const el = st.pages.flatMap((p) => p.elements).find((x) => x.id === st.selection[0])
        if (el && (el.type === 'text' || el.type === 'box')) {
          e.preventDefault()
          const pg = st.pages.find((p) => p.elements.includes(el))
          if (pg && pg.id !== st.currentPageId) st.focusPage(pg.id)
          return st.editElement(el.id)
        }
      }
      if (e.key === 'ArrowLeft') return st.goRelative(-1)
      if (e.key === 'ArrowRight') return st.goRelative(1)
      if (!id) return
      e.preventDefault()
      const ls = st.lineStyle
      switch (id) {
        case 'pen':
          return st.setLineStyle({ pen: ls.pen === 'ballpoint' ? 'pencil' : 'ballpoint' })
        case 'width':
          return st.setLineStyle({ width: ls.width === 1 ? 2 : 1 })
        case 'dash':
          return st.setLineStyle({ dash: !ls.dash })
        case 'double':
          return st.setLineStyle({ double: !ls.double })
        case 'color': {
          if (st.highlightMode) {
            const opts = [...HIGHLIGHT_COLORS.map((c) => c.color), null]
            return st.setHlColor(opts[(opts.indexOf(st.hlColor) + 1) % opts.length])
          }
          const i = INK_COLORS.findIndex((c) => c.color === ls.color)
          return st.setLineStyle({ color: INK_COLORS[(i + 1) % INK_COLORS.length].color })
        }
        case 'highlight':
          return st.setHighlightMode(!st.highlightMode)
        case 'eraser':
          return st.setEraserMode(!st.eraserMode)
        case 'select':
          return st.setSelectMode(!st.selectMode)
        case 'guides':
          return st.setShowGuides(!st.showGuides)
        case 'style':
          return document.querySelector<HTMLButtonElement>('[data-shortcut="style"]')?.click()
        case 'newPage':
          return st.addPage()
        case 'overview':
          return setOverviewOpen(true)
        case 'templates':
          return setTemplatesOpen(true)
        case 'help':
          return setHelpOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // PC 넓은 화면은 양쪽 펼침면
  // 넓은 화면, 또는 휴대폰을 가로로 눕혔을 때(가로가 세로보다 길고 어느 정도 넓으면) 양쪽 펼침면
  const wide = desk.w >= 760 || (desk.w > desk.h * 1.2 && desk.w >= 560)
  useEffect(() => setSpread(wide), [wide, setSpread])

  const start = spread ? spreadStart(pageIndex) : pageIndex
  const shownPages = (spread ? [pages[start], pages[start + 1]] : [page]).filter(Boolean) as NonNullable<typeof page>[]

  // 페이지를 화면에 맞게. 격자 칸 수는 그대로, 칸 크기(px)만 바뀐다.
  // 가로 여백: 남은 종이 두께 + 오른쪽 인덱스 스티커 자리
  const narrow = desk.w < 600
  // 한 장씩 볼 때도 실제 노트처럼: 펼침면의 왼쪽 페이지(짝수 번째)는 왼쪽 페이지 모양, 아니면 오른쪽 페이지 모양
  const singleSide: 'left' | 'right' = pageIndex % 2 === 0 ? 'left' : 'right'
  // 넓은 화면은 노트 양옆에 넘기기 버튼 자리(48px씩)도 비운다
  // 노트 양옆 넘기기 버튼 자리: 넓은 화면은 넉넉히(인덱스 자리 맞춤 포함), 휴대폰은 가는 띠만큼
  const padW = 28 + (spread ? 30 : 18) + (narrow ? 34 : 56) + (narrow ? 2 * 26 : 96 + 44)
  const padH = 28 + 14
  const totalCols = shownPages.reduce((n, p) => n + p.cols, 0)
  const maxRows = Math.max(1, ...shownPages.map((p) => p.rows))
  const fitCell = totalCols
    ? Math.max(8, Math.min(30, Math.floor(Math.min((desk.w - padW) / totalCols, (desk.h - padH) / maxRows))))
    : 20
  // 확대(휴대폰에서 두 손가락으로 벌리기, 또는 확대 버튼): 칸 크기를 키우고 책상을 스크롤
  const [zoom, setZoom] = useState(1)
  const cell = zoom > 1 ? Math.round(fitCell * zoom) : fitCell
  const pendingScroll = useRef<{ x: number; y: number } | null>(null)
  useLayoutEffect(() => {
    const el = deskRef.current
    const p = pendingScroll.current
    if (!el || !p) return
    el.scrollLeft = p.x
    el.scrollTop = p.y
    pendingScroll.current = null
  })
  /** 화면의 (cx, cy)를 기준으로 확대 배율을 바꾼다 (그 자리가 손가락 아래 그대로 있게) */
  const zoomAt = useCallback(
    (next: number, cx: number, cy: number, from = zoom, scroll?: { x: number; y: number }, at?: { x: number; y: number }) => {
      const el = deskRef.current
      if (!el) return
      const z = Math.min(3, Math.max(1, next))
      const r = el.getBoundingClientRect()
      const sx = scroll?.x ?? el.scrollLeft
      const sy = scroll?.y ?? el.scrollTop
      const ax = (at?.x ?? cx) - r.left
      const ay = (at?.y ?? cy) - r.top
      const k = z / from
      const target = z === 1 ? { x: 0, y: 0 } : { x: (sx + ax) * k - (cx - r.left), y: (sy + ay) * k - (cy - r.top) }
      if (z === zoom) {
        // 배율이 그대로면(두 손가락 이동만) 바로 스크롤
        el.scrollLeft = target.x
        el.scrollTop = target.y
        return
      }
      pendingScroll.current = target
      setZoom(z)
    },
    [zoom],
  )
  // 두 손가락: 벌리고 오므리면 확대·축소, 같이 움직이면 이동 (한 손가락은 그대로 쓰기·그리기)
  useEffect(() => {
    const el = deskRef.current
    if (!el) return
    const touches = new Map<number, { x: number; y: number }>()
    let g: { d0: number; z0: number; c0: { x: number; y: number }; s0: { x: number; y: number } } | null = null
    const zoomNow = { v: 1 }
    const pts = () => [...touches.values()]
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (touches.size >= 2) {
        // 두 손가락이면 화면 움직이기: 첫 손가락이 시작한 그리기(선·네모칸·형광펜 등)는 취소하고, 이 손가락은 종이에 전하지 않는다
        e.stopPropagation()
        window.dispatchEvent(new Event('dotlyt:cancel-draw'))
      }
      if (touches.size === 2) {
        const [a, b] = pts()
        g = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: zoomNow.v, c0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, s0: { x: el.scrollLeft, y: el.scrollTop } }
      }
    }
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || !touches.has(e.pointerId)) return
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (!g || touches.size < 2) return
      e.preventDefault()
      e.stopPropagation()
      const [a, b] = pts()
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      zoomAtRef.current(g.z0 * (d / g.d0), c.x, c.y, g.z0, g.s0, g.c0)
    }
    const up = (e: PointerEvent) => {
      touches.delete(e.pointerId)
      if (touches.size < 2) g = null
    }
    zoomNowRef.current = zoomNow
    el.addEventListener('pointerdown', down, true)
    el.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', up, true)
    return () => {
      el.removeEventListener('pointerdown', down, true)
      el.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', up, true)
    }
  }, [])
  const zoomAtRef = useRef(zoomAt)
  zoomAtRef.current = zoomAt
  const zoomNowRef = useRef<{ v: number } | null>(null)
  if (zoomNowRef.current) zoomNowRef.current.v = zoom
  const zoomBy = (step: number) => {
    const r = deskRef.current?.getBoundingClientRect()
    if (!r) return
    zoomAt(Math.round((zoom + step) * 2) / 2, r.left + r.width / 2, r.top + r.height / 2)
  }
  const shownKey = shownPages.map((p) => p.id).join(',')
  // 넘긴 페이지 크기가 달라 노트 크기가 바뀌면, 툭 바뀌지 않고 살짝 부드럽게 (이전 크기에서 새 크기로)
  const nbRef = useRef<HTMLDivElement>(null)
  const lastBox = useRef<{ key: string; current: string | null; r: { left: number; top: number; width: number; height: number } } | null>(null)
  useLayoutEffect(() => {
    const el = nbRef.current
    if (!el) return
    // 움직이는 중(transform)에도 틀리지 않게 레이아웃 크기로 잰다
    const r = { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight }
    const prev = lastBox.current
    lastBox.current = { key: shownKey, current: page?.id ?? null, r }
    // 창 크기만 바뀐 경우·순서만 바꾼 경우는 그대로 (페이지를 넘길 때만)
    if (!prev || prev.key === shownKey || prev.current === (page?.id ?? null) || overviewOpen) return
    if (Math.abs(prev.r.width - r.width) < 2 && Math.abs(prev.r.height - r.height) < 2) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    el.animate(
      [
        { transformOrigin: '0 0', transform: `translate(${prev.r.left - r.left}px, ${prev.r.top - r.top}px) scale(${prev.r.width / r.width}, ${prev.r.height / r.height})` },
        { transformOrigin: '0 0', transform: 'none' },
      ],
      { duration: 320, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' },
    )
  })

  // 페이지 넘기기 애니메이션: 보이는 페이지가 바뀌면 (지운 경우·펼침면 전환은 빼고)
  const [turn, setTurn] = useState<Turn | null>(null)
  const prevShown = useRef<{ ids: string[]; spread: boolean; current: string | null } | null>(null)
  useLayoutEffect(() => {
    const prev = prevShown.current
    const current = page?.id ?? null
    prevShown.current = { ids: shownPages.map((p) => p.id), spread, current }
    if (!prev || prev.spread !== spread || prev.ids.join(',') === shownKey || !shownPages.length) return
    // 넘긴 게 아니면(모아보기에서 순서만 바꿈 등) 넘기는 모습 없이
    if (prev.current === current || overviewOpen) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const from = prev.ids.map((id) => pages.find((p) => p.id === id))
    if (from.some((p) => !p)) return
    const before = pages.findIndex((p) => p.id === prev.ids[0])
    const now = pages.findIndex((p) => p.id === shownPages[0].id)
    // 한 장씩 볼 때 같은 펼침면 안(왼쪽 ↔ 오른쪽)이면 시선을 옮기듯 밀고, 다른 펼침면이면 책장을 넘긴다
    const slide = !spread && Math.floor(before / 2) === Math.floor(now / 2)
    setTurn({ key: performance.now(), dir: now > before ? 1 : -1, from: from as typeof shownPages, to: shownPages, spread, slide })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey, spread, page?.id])
  const endTurn = useCallback(() => setTurn(null), [])

  const indexEditPage = indexEditFor ? pages.find((p) => p.id === indexEditFor) : undefined
  // 양쪽에 걸쳐 고르면 막대는 고른 것이 있는 첫 페이지에만
  const selection = useStore((s) => s.selection)
  const selBarPage = shownPages.find((p) => p.elements.some((e) => selection.includes(e.id)))?.id

  const light = isLight(notebook.cover)
  const atStart = (spread ? start : pageIndex) <= 0
  // 넘기기 버튼의 은은한 빛이 마우스를 따라오게 (버튼 안 위치를 CSS 변수로)
  const followGlow = (e: React.PointerEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    e.currentTarget.style.setProperty('--gx', `${e.clientX - r.left}px`)
    e.currentTarget.style.setProperty('--gy', `${e.clientY - r.top}px`)
  }
  const atEnd = (spread ? start + 2 : pageIndex + 1) >= pageCount

  return (
    <div className={'app' + (fromCover ? ' from-cover' : '')} style={{ ['--cover' as string]: notebook.cover, ['--cover-ink' as string]: light ? '#2b2a28' : '#f6f1e7' }}>
      <header className="topbar">
        <button className="nb-chip home" onClick={onHome} {...tip('표지로', '메인 화면으로 돌아가요')}>
          <svg className="home-arrow" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 5l-7 7 7 7" />
          </svg>
          <span className="nb-chip-dot" />
          <span className="nb-chip-name">{notebook.name}</span>
        </button>
        <nav className="pager" aria-label="페이지 이동">
          <button className="icon-btn" onClick={() => setOverviewOpen(true)} {...tip('모든 페이지', '모아보기 · 순서 바꾸기 · 여러 장 지우기', 'overview')}>
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.6">
              <rect x="3.5" y="3.5" width="7" height="7" rx="1.2" />
              <rect x="13.5" y="3.5" width="7" height="7" rx="1.2" />
              <rect x="3.5" y="13.5" width="7" height="7" rx="1.2" />
              <rect x="13.5" y="13.5" width="7" height="7" rx="1.2" />
            </svg>
          </button>
          <button className="icon-btn" onClick={() => goRelative(-1)} disabled={pageIndex <= 0} {...tip('이전 페이지', undefined, 'prevPage')}>
            ‹
          </button>
          <span className="page-no">
            {spread ? `${start + 1}–${start + 2}` : pageIndex + 1} <span className="muted">/ {pageCount}</span>
          </span>
          <button
            className="icon-btn"
            onClick={() => goRelative(1)}
            disabled={(spread ? start + 2 : pageIndex + 1) >= pageCount}
            {...tip('다음 페이지', undefined, 'nextPage')}
          >
            ›
          </button>
          <button className="icon-btn add" onClick={addPage} {...tip('새 페이지', spread ? '이 펼침면 뒤에 새 펼침면' : '이 페이지 뒤에 새 페이지', 'newPage')}>
            +
          </button>
          <button
            className="icon-btn del bar-wide"
            onClick={() => setConfirmDelete(true)}
            {...tip('페이지 지우기', spread ? '이 펼침면을 지워요' : '이 페이지를 지워요')}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13" />
            </svg>
          </button>
        </nav>
        <div className="topbar-right">
          <button className="icon-btn bar-wide" onClick={() => setTemplatesOpen(true)} {...tip('템플릿', '페이지 틀 저장하고 불러오기', 'templates')}>
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
              <rect x="4" y="3.5" width="16" height="17" rx="2" />
              <path d="M4 9h16M10 9v11.5" />
            </svg>
          </button>
          <button className={'icon-btn bar-wide' + (findOpen ? ' on' : '')} onClick={() => setFindOpen((v) => !v)} {...tip('찾기', '노트 전체에서 글자 찾기', 'find')}>
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <circle cx="11" cy="11" r="6.5" />
              <path d="M16 16l4.5 4.5" />
            </svg>
          </button>
          <span className={'save ' + saveStatus}>
            {saveStatus === 'saving' ? '저장 중…' : saveStatus === 'saved' ? '저장됨' : '저장 실패'}
          </span>
          {/* 휴대폰: 자주 안 쓰는 것은 ⋯ 메뉴로 */}
          <MoreMenu
            items={[
              { label: '찾기', onClick: () => setFindOpen(true) },
              { label: '템플릿', onClick: () => setTemplatesOpen(true) },
              { label: spread ? '이 펼침면 지우기' : '이 페이지 지우기', onClick: () => setConfirmDelete(true), danger: true },
              { label: '노트 설정', onClick: () => setSettingsOpen(true) },
              // 휴대폰은 ? 키를 누를 수 없으니 여기서 (사용 안내 다시 보기도 이 창에 있다)
              { label: '도움말', onClick: () => setHelpOpen(true) },
              ...(sync.enabled ? [{ label: sync.email ? '계정' : '로그인', onClick: () => setAccountOpen(true) }] : []),
            ]}
          />
          {sync.enabled && (
            <button
              className={'icon-btn bar-wide account-btn ' + (sync.email ? sync.state : 'out')}
              onClick={() => setAccountOpen(true)}
              {...tip(sync.email ? '계정' : '로그인', sync.email ? sync.email : '여러 기기에서 같은 노트 쓰기')}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8.5" r="3.5" />
                <path d="M5 20c.8-3.4 3.6-5.5 7-5.5s6.2 2.1 7 5.5" />
              </svg>
              {sync.email && <span className="account-dot" aria-hidden />}
            </button>
          )}
          <button className="icon-btn bar-wide" onClick={() => setSettingsOpen(true)} {...tip('노트 설정', '이름 · 크기 · 표지 색')}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
            </svg>
          </button>
        </div>
      </header>

      <main className="workspace">
        <div className={'desk' + (zoom > 1 ? ' zoomed' : '')} ref={deskRef}>
          {page && desk.w > 0 && (
            // 노트 바깥 왼쪽: 앞으로 넘기기 (첫 페이지면 자리만 차지하고 숨김)
            <button
              className={'turn-btn prev' + (narrow ? ' slim' : '')}
              onPointerMove={followGlow}
              // 오른쪽은 노트와 버튼 사이에 인덱스 스티커 자리(44px)가 있어서, 왼쪽도 같은 만큼 띄워 양쪽 여백을 맞춘다
              style={{ visibility: atStart ? 'hidden' : undefined, marginRight: narrow ? 4 : 50 }}
              onClick={() => goRelative(-1)}
              {...tip(spread ? '이전 펼침면' : '이전 페이지', undefined, 'prevPage')}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 5l-7 7 7 7" />
              </svg>
            </button>
          )}
          {page && desk.w > 0 && (
            <div
              ref={nbRef}
              className={'notebook' + (spread ? ' spread' : singleSide === 'left' ? ' single-left' : '')}
              // 휴대폰: 스티커가 노트 밖으로 나온 만큼(왼쪽 쪽은 표지 판이 없어서 더 나온다) 띄워서, 왼쪽 버튼 간격(4px)과 맞춘다
              style={{ marginRight: narrow ? (!spread && singleSide === 'left' ? 29 : 13) : 44 }}
            >
              {shownPages.map((p, i) => (
                <PageView
                  key={p.id}
                  page={p}
                  cell={cell}
                  active={p.id === page.id}
                  side={spread ? (i === 0 ? 'left' : 'right') : singleSide}
                  guides={showGuides}
                  selBar={p.id === selBarPage}
                />
              ))}
              <IndexTabs
                shownIds={shownPages.map((p) => p.id)}
                narrow={narrow}
                onEdit={setIndexEditFor}
              />
            </div>
          )}
          {page && desk.w > 0 && (
            // 노트 바깥 오른쪽: 다음으로 넘기기. 마지막이면 새 펼침면을 만들어 바로 넘어간다
            <button
              className={'turn-btn next' + (atEnd ? ' add' : '') + (narrow ? ' slim' : '')}
              onPointerMove={followGlow}
              onClick={() => (atEnd ? addPage() : goRelative(1))}
              {...(atEnd
                ? tip(spread ? '새 펼침면' : '새 페이지', '마지막 페이지예요. 눌러서 새로 이어 쓰기', 'newPage')
                : tip(spread ? '다음 펼침면' : '다음 페이지', undefined, 'nextPage'))}
            >
              {atEnd ? (
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M12 6v12M6 12h12" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 5l7 7-7 7" />
                </svg>
              )}
            </button>
          )}
        </div>
        {narrow && (
          <div className="zoom-ctl" role="group" aria-label="확대">
            <button onClick={() => zoomBy(-0.5)} disabled={zoom <= 1} aria-label="축소">
              −
            </button>
            <button className="zoom-val" onClick={() => zoomAt(1, 0, 0)} aria-label="원래 크기로">
              {Math.round(zoom * 100)}%
            </button>
            <button onClick={() => zoomBy(0.5)} disabled={zoom >= 3} aria-label="확대">
              +
            </button>
          </div>
        )}
        <Toolbar />
      </main>
      {turn && nbRef.current && <PageTurn key={turn.key} turn={turn} host={nbRef.current} onDone={endTurn} />}
      <TooltipLayer />
      {helpOpen && (
        <ShortcutHelp
          onClose={() => setHelpOpen(false)}
          onGuide={() => {
            setHelpOpen(false)
            setGuideOpen(true)
          }}
        />
      )}
      {accountOpen && <AccountDialog onClose={() => setAccountOpen(false)} />}
      {guideOpen && <GuideTour onClose={() => setGuideOpen(false)} />}
      {findOpen && <FindBar onClose={() => setFindOpen(false)} />}
      {templatesOpen && <TemplatesPanel onClose={() => setTemplatesOpen(false)} />}

      {overviewOpen && <PagesOverview onClose={() => setOverviewOpen(false)} />}
      {confirmDelete && (
        <DeletePageDialog
          ids={shownPages.map((p) => p.id)}
          label={spread ? `${start + 1}–${start + 2}쪽 펼침면` : `${pageIndex + 1}쪽`}
          onClose={() => setConfirmDelete(false)}
        />
      )}
      {indexEditPage && <IndexEditor page={indexEditPage} onClose={() => setIndexEditFor(null)} />}
      {settingsOpen && (
        <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && setSettingsOpen(false)}>
          <div className="modal" role="dialog" aria-label="노트 설정">
            <ModalClose onClose={() => setSettingsOpen(false)} />
            <h2>노트 설정</h2>
            <NotebookForm
              initial={notebook}
              submitLabel="저장"
              onCancel={() => setSettingsOpen(false)}
              onSubmit={(nb) => {
                updateNotebook(nb)
                setSettingsOpen(false)
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

