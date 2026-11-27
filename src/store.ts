import { create } from 'zustand'
import { findBulletAt, findTextAt, translate } from './geometry'
import {
  INK_COLORS,
  SIZES,
  type BoxEl,
  type BulletEl,
  type BulletState,
  type El,
  type LineEl,
  type Notebook,
  type Page,
  type PenType,
  type Pt,
} from './types'

const STORAGE_KEY = 'dotlyt:v1'
const UI_KEY = 'dotlyt:ui'
const HISTORY_LIMIT = 200

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

interface Persisted {
  notebook: Notebook | null
  pages: Page[]
  currentPageId: string | null
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const d = JSON.parse(raw) as Persisted
      if (d && Array.isArray(d.pages)) {
        // 글자 없이 남은 네모칸(편집 중에 창을 닫은 경우)은 치운다
        d.pages = d.pages.map((p) => ({
          ...p,
          elements: p.elements.filter((e) => !(e.type === 'box' && !e.text.trim())),
        }))
        return d
      }
    }
  } catch {
    /* 저장된 게 없거나 깨졌으면 새로 시작 */
  }
  return { notebook: null, pages: [], currentPageId: null }
}

interface UiPrefs {
  showGuides: boolean
  lineStyle: LineStyle
}

function loadUi(): Partial<UiPrefs> {
  try {
    return JSON.parse(localStorage.getItem(UI_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveUi() {
  const { showGuides, lineStyle } = useStore.getState()
  try {
    localStorage.setItem(UI_KEY, JSON.stringify({ showGuides, lineStyle }))
  } catch {
    /* 무시 */
  }
}

export function persist(): boolean {
  const { notebook, pages, currentPageId } = useStore.getState()
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ notebook, pages, currentPageId }))
    return true
  } catch {
    return false
  }
}

function newPage(nb: Notebook): Page {
  const { cols, rows } = SIZES[nb.size]
  const now = Date.now()
  return { id: uid(), cols, rows, elements: [], createdAt: now, updatedAt: now }
}

/** 글자 입력 커서. editId: 지금 고치고 있는 글자/네모칸, dirty: 이번 입력에서 이미 되돌리기 기록을 남겼는지 */
export interface Cursor {
  x: number
  y: number
  editId: string | null
  dirty: boolean
}

export interface LineStyle {
  width: 1 | 2
  dash: boolean
  color: string
  pen: PenType
}

type History = Record<string, { past: El[][]; future: El[][] }>

/** 기호 팝업: 빈 칸에 기호 넣기, 또는 기호 상태 바꾸기 */
export type Popup = { kind: 'insert'; x: number; y: number } | { kind: 'state'; id: string } | null

/** 줄 맨 앞 빠른 입력 */
const QUICK: Record<string, BulletState> = { '* ': 'task', 'o ': 'event', 'O ': 'event', '- ': 'note' }

interface State extends Persisted {
  cursor: Cursor | null
  selection: string[]
  lineStyle: LineStyle
  selectMode: boolean
  eraserMode: boolean
  showGuides: boolean
  /** PC 넓은 화면: 양쪽 펼침면 */
  spread: boolean
  history: History
  saveStatus: 'saved' | 'saving' | 'error'
  fontsVersion: number
  /** 새로 쓰는 글자를 굵게 */
  textBold: boolean
  popup: Popup

  createNotebook: (nb: Notebook) => void
  updateNotebook: (nb: Notebook) => void
  setSpread: (on: boolean) => void
  addPage: () => void
  goRelative: (delta: number) => void
  goToPage: (id: string) => void
  focusPage: (id: string) => void
  setIndex: (pageId: string, tab: { name: string; color: string } | null) => void
  reorderIndex: (pageIds: string[]) => void

  openAt: (x: number, y: number) => void
  editElement: (id: string) => void
  closeCursor: () => void
  typeText: (value: string) => void
  toggleBold: () => void

  setPopup: (p: Popup) => void
  addBullet: (state: BulletState) => void
  setBulletState: (id: string, state: BulletState) => void
  toggleCancel: (id: string) => void
  deleteElement: (id: string) => void

  setSelection: (ids: string[]) => void
  setSelectMode: (on: boolean) => void
  setEraserMode: (on: boolean) => void
  deleteIds: (ids: string[]) => void
  duplicateSelection: () => void
  deletePages: (ids: string[]) => void
  openInsertPopup: () => boolean
  setShowGuides: (on: boolean) => void
  setLineStyle: (patch: Partial<LineStyle>) => void
  addLine: (a: Pt, b: Pt, id?: string) => void
  addBox: (x: number, y: number, w: number, h: number) => void
  moveSelection: (dx: number, dy: number) => void
  deleteSelection: () => void
  undo: () => void
  redo: () => void
}

export const currentPage = (s: Pick<State, 'pages' | 'currentPageId'>) =>
  s.pages.find((p) => p.id === s.currentPageId) ?? null

/** 펼침면의 왼쪽 페이지 번호 */
export const spreadStart = (index: number) => index - (index % 2)

/** 현재 페이지 요소를 바꾸고, 필요하면 되돌리기 기록을 남긴다 */
function withElements(s: State, next: El[], record = true): Partial<State> {
  const page = currentPage(s)
  if (!page) return {}
  const h = s.history[page.id] ?? { past: [], future: [] }
  return {
    pages: s.pages.map((p) => (p.id === page.id ? { ...p, elements: next, updatedAt: Date.now() } : p)),
    history: record
      ? { ...s.history, [page.id]: { past: [...h.past, page.elements].slice(-HISTORY_LIMIT), future: [] } }
      : s.history,
  }
}

/** 글자를 안 쓰고 떠난 빈 네모칸은 없앤다 */
function leaveCursor(s: State): Partial<State> {
  const c = s.cursor
  const page = currentPage(s)
  if (!c?.editId || !page) return { cursor: null, popup: null }
  const el = page.elements.find((e) => e.id === c.editId)
  if (el?.type === 'box' && !el.text.trim()) {
    return {
      ...withElements(
        s,
        page.elements.filter((e) => e.id !== el.id),
        false,
      ),
      cursor: null,
      popup: null,
    }
  }
  return { cursor: null, popup: null }
}

const initial = load()
const ui = loadUi()

export const useStore = create<State>()((set, get) => ({
  ...initial,
  cursor: null,
  selection: [],
  lineStyle: { width: 1, dash: false, color: INK_COLORS[0].color, pen: 'ballpoint', ...ui.lineStyle },
  selectMode: false,
  eraserMode: false,
  showGuides: ui.showGuides ?? false,
  spread: false,
  history: {},
  saveStatus: 'saved',
  fontsVersion: 0,
  textBold: false,
  popup: null,

  // 펼침면 하나(두 장)로 시작
  createNotebook: (nb) => {
    const pages = [newPage(nb), newPage(nb)]
    set({ notebook: nb, pages, currentPageId: pages[0].id })
  },
  // 크기를 바꾸면 새로 만드는 페이지부터 적용 (이미 쓴 페이지는 자기 cols, rows를 유지)
  updateNotebook: (nb) => set({ notebook: nb }),

  setSpread: (on) => {
    const s = get()
    if (s.spread === on) return
    // 펼침면은 두 장씩이라 페이지 수를 짝수로 맞춘다
    if (on && s.notebook && s.pages.length % 2 === 1) {
      set({ spread: on, pages: [...s.pages, newPage(s.notebook)] })
    } else set({ spread: on })
  },

  addPage: () => {
    const s = get()
    if (!s.notebook) return
    const idx = s.pages.findIndex((p) => p.id === s.currentPageId)
    const pages = [...s.pages]
    if (s.spread) {
      const added = [newPage(s.notebook), newPage(s.notebook)]
      pages.splice(spreadStart(idx) + 2, 0, ...added)
      set({ ...leaveCursor(s), pages, currentPageId: added[0].id, selection: [] })
    } else {
      const page = newPage(s.notebook)
      pages.splice(idx + 1, 0, page)
      set({ ...leaveCursor(s), pages, currentPageId: page.id, selection: [] })
    }
  },
  goRelative: (delta) => {
    const s = get()
    const idx = s.pages.findIndex((p) => p.id === s.currentPageId)
    const target = s.spread ? spreadStart(idx) + delta * 2 : idx + delta
    const next = s.pages[target]
    if (next) set({ ...leaveCursor(s), currentPageId: next.id, selection: [] })
  },
  goToPage: (id) => {
    const s = get()
    if (s.currentPageId === id || !s.pages.some((p) => p.id === id)) return
    set({ ...leaveCursor(s), currentPageId: id, selection: [] })
  },
  setIndex: (pageId, tab) => {
    const s = get()
    const maxOrder = Math.max(-1, ...s.pages.map((p) => p.index?.order ?? -1))
    set({
      pages: s.pages.map((p) =>
        p.id !== pageId ? p : { ...p, index: tab ? { ...tab, order: p.index?.order ?? maxOrder + 1 } : null },
      ),
    })
  },
  reorderIndex: (pageIds) => {
    const s = get()
    set({
      pages: s.pages.map((p) => {
        const i = pageIds.indexOf(p.id)
        return i >= 0 && p.index ? { ...p, index: { ...p.index, order: i } } : p
      }),
    })
  },
  focusPage: (id) => {
    const s = get()
    if (s.currentPageId === id) return
    set({ ...leaveCursor(s), currentPageId: id, selection: [] })
  },

  openAt: (x, y) => {
    const s0 = get()
    set(leaveCursor(s0))
    const page = currentPage(get())
    if (!page) return
    const cx = Math.max(0, Math.min(page.cols - 1, x))
    const cy = Math.max(0, Math.min(page.rows - 1, y))
    const t = findTextAt(page.elements, cx, cy)
    set({
      cursor: t ? { x: t.x, y: t.y, editId: t.id, dirty: false } : { x: cx, y: cy, editId: null, dirty: false },
      selection: [],
    })
  },
  editElement: (id) => {
    const s0 = get()
    if (s0.cursor?.editId === id) return
    set(leaveCursor(s0))
    const el = currentPage(get())?.elements.find((e) => e.id === id)
    if (!el || (el.type !== 'text' && el.type !== 'box')) return
    set({ cursor: { x: el.x, y: el.y, editId: el.id, dirty: false }, selection: [] })
  },
  closeCursor: () => set(leaveCursor(get())),

  // 입력할 때마다 요소에 바로 반영한다. 한 번 칸을 잡고 쓰는 동안은 되돌리기 한 번으로 묶인다.
  typeText: (value) => {
    const s = get()
    const c = s.cursor
    const page = currentPage(s)
    if (!c || !page) return
    let els = page.elements
    let editId = c.editId
    const editing = editId ? els.find((e) => e.id === editId) : undefined
    if (editing?.type === 'box') {
      els = els.map((e) => (e.id === editId ? { ...e, text: value } : e))
    } else if (editId) {
      if (value === '') {
        els = els.filter((e) => e.id !== editId)
        editId = null
      } else {
        els = els.map((e) => (e.id === editId && e.type === 'text' ? { ...e, text: value } : e))
      }
    } else if (value !== '') {
      editId = uid()
      els = [...els, { id: editId, type: 'text', x: c.x, y: c.y, text: value, ...(s.textBold ? { bold: true } : {}) }]
    } else return
    // 줄 맨 앞에서 "* ", "o ", "- " → 기호로 바꾸고 오른쪽 칸에서 이어 쓴다
    const quick = QUICK[value]
    const isFresh = !editing || (editing.type === 'text' && editing.text.length < value.length && editing.text.length <= 1)
    if (quick && isFresh && editId && !findBulletAt(els, c.x, c.y) && c.x < page.cols - 1) {
      els = els.filter((e) => e.id !== editId)
      const bullet: BulletEl = { id: uid(), type: 'bullet', x: c.x, y: c.y, state: quick, cancelled: false }
      els = [...els, bullet]
      set({ ...withElements(s, els, !c.dirty), cursor: { x: c.x + 1, y: c.y, editId: null, dirty: false } })
      return
    }
    set({ ...withElements(s, els, !c.dirty), cursor: { ...c, editId, dirty: true }, popup: null })
  },

  toggleBold: () => {
    const s = get()
    const page = currentPage(s)
    if (!page) return
    // 1) 지금 쓰고 있는 글자 2) 고른 글자들 3) 앞으로 쓸 글자
    const editId = s.cursor?.editId
    const targets = editId ? [editId] : s.selection
    const textTargets = page.elements.filter((e) => targets.includes(e.id) && (e.type === 'text' || e.type === 'box'))
    if (textTargets.length) {
      const allBold = textTargets.every((e) => (e as { bold?: boolean }).bold)
      const els = page.elements.map((e) =>
        textTargets.includes(e) ? ({ ...e, bold: !allBold } as El) : e,
      )
      set(withElements(s, els))
    } else set({ textBold: !s.textBold })
  },

  setPopup: (popup) => set({ popup }),
  addBullet: (state) => {
    const s = get()
    const page = currentPage(s)
    const p = s.popup
    if (!page || p?.kind !== 'insert') return
    const els = page.elements.filter((e) => !(e.type === 'bullet' && e.x === p.x && e.y === p.y))
    const bullet: BulletEl = { id: uid(), type: 'bullet', x: p.x, y: p.y, state, cancelled: false }
    set({
      ...withElements(s, [...els, bullet]),
      popup: null,
      cursor: p.x < page.cols - 1 ? { x: p.x + 1, y: p.y, editId: null, dirty: false } : null,
      selection: [],
    })
    // 오른쪽 칸에 이미 글자가 있으면 그 글자를 이어서 고친다
    const after = currentPage(get())
    const t = after && findTextAt(after.elements, p.x + 1, p.y)
    if (t && t.x === p.x + 1) set({ cursor: { x: t.x, y: t.y, editId: t.id, dirty: false } })
  },
  setBulletState: (id, state) => {
    const s = get()
    const page = currentPage(s)
    if (!page) return
    set({ ...withElements(s, page.elements.map((e) => (e.id === id && e.type === 'bullet' ? { ...e, state } : e))), popup: null })
  },
  toggleCancel: (id) => {
    const s = get()
    const page = currentPage(s)
    if (!page) return
    set({
      ...withElements(s, page.elements.map((e) => (e.id === id && e.type === 'bullet' ? { ...e, cancelled: !e.cancelled } : e))),
      popup: null,
    })
  },
  deleteElement: (id) => {
    const s = get()
    const page = currentPage(s)
    if (!page) return
    set({ ...withElements(s, page.elements.filter((e) => e.id !== id)), popup: null, selection: [] })
  },

  setSelection: (ids) => set({ selection: ids }),
  setSelectMode: (on) => set(on ? { selectMode: true, eraserMode: false, ...leaveCursor(get()) } : { selectMode: false }),
  setEraserMode: (on) =>
    set(on ? { eraserMode: true, selectMode: false, selection: [], ...leaveCursor(get()) } : { eraserMode: false }),

  deleteIds: (ids) => {
    const s = get()
    const page = currentPage(s)
    if (!page || !ids.length) return
    set({ ...withElements(s, page.elements.filter((e) => !ids.includes(e.id))), selection: [] })
  },

  // 고른 것을 한 칸 오른쪽 아래에 복제하고, 복제한 것을 고른 상태로
  duplicateSelection: () => {
    const s = get()
    const page = currentPage(s)
    if (!page || !s.selection.length) return
    const copies = page.elements
      .filter((e) => s.selection.includes(e.id))
      .map((e) => ({ ...translate(e, 1, 1), id: uid() }) as El)
    set({ ...withElements(s, [...page.elements, ...copies]), selection: copies.map((c) => c.id) })
  },

  deletePages: (ids) => {
    const s = get()
    if (!s.notebook) return
    const idx = s.pages.findIndex((p) => p.id === s.currentPageId)
    let pages = s.pages.filter((p) => !ids.includes(p.id))
    if (!pages.length) pages = s.spread ? [newPage(s.notebook), newPage(s.notebook)] : [newPage(s.notebook)]
    if (s.spread && pages.length % 2 === 1) pages.push(newPage(s.notebook))
    const firstRemoved = Math.min(...ids.map((id) => s.pages.findIndex((p) => p.id === id)).filter((i) => i >= 0), idx)
    const next = pages[Math.min(Math.max(0, firstRemoved - (s.spread ? 2 : 1)), pages.length - 1)]
    const history = { ...s.history }
    ids.forEach((id) => delete history[id])
    set({ pages, history, currentPageId: next.id, cursor: null, popup: null, selection: [] })
  },

  // 도구 모음의 기호 버튼: 커서가 있는 빈 칸, 또는 쓰고 있는 글자 바로 왼쪽 칸에 기호 넣기 팝업
  openInsertPopup: () => {
    const s = get()
    const c = s.cursor
    const page = currentPage(s)
    if (!c || !page) return false
    if (!c.editId) {
      set({ popup: { kind: 'insert', x: c.x, y: c.y } })
      return true
    }
    const el = page.elements.find((e) => e.id === c.editId)
    if (el?.type === 'text' && el.x > 0 && !findBulletAt(page.elements, el.x - 1, el.y)) {
      set({ popup: { kind: 'insert', x: el.x - 1, y: el.y } })
      return true
    }
    return false
  },
  setShowGuides: (on) => {
    set({ showGuides: on })
    saveUi()
  },

  setLineStyle: (patch) => {
    const s = get()
    const lineStyle = { ...s.lineStyle, ...patch }
    const page = currentPage(s)
    const selectedLines = page?.elements.filter((e) => e.type === 'line' && s.selection.includes(e.id)) ?? []
    if (page && selectedLines.length) {
      const els = page.elements.map((e) => (e.type === 'line' && s.selection.includes(e.id) ? { ...e, ...patch } : e))
      set({ lineStyle, ...withElements(s, els) })
    } else set({ lineStyle })
    saveUi()
  },

  addLine: (a, b, id) => {
    const s = get()
    const page = currentPage(s)
    if (!page) return
    const line: LineEl = { id: id ?? uid(), type: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, ...s.lineStyle }
    set(withElements(s, [...page.elements, line]))
  },

  // 네모칸을 만들고 바로 글자 입력을 시작한다
  addBox: (x, y, w, h) => {
    const s = get()
    set(leaveCursor(s))
    const s2 = get()
    const page = currentPage(s2)
    if (!page) return
    const box: BoxEl = { id: uid(), type: 'box', x, y, w, h, text: '' }
    set({
      ...withElements(s2, [...page.elements, box]),
      cursor: { x, y, editId: box.id, dirty: true },
      selection: [],
    })
  },

  moveSelection: (dx, dy) => {
    const s = get()
    const page = currentPage(s)
    if (!page || (!dx && !dy)) return
    const els = page.elements.map((e) => (s.selection.includes(e.id) ? translate(e, dx, dy) : e))
    set(withElements(s, els))
  },

  deleteSelection: () => {
    const s = get()
    const page = currentPage(s)
    if (!page || !s.selection.length) return
    set({ ...withElements(s, page.elements.filter((e) => !s.selection.includes(e.id))), selection: [] })
  },

  undo: () => {
    const s = get()
    const page = currentPage(s)
    const h = page && s.history[page.id]
    if (!page || !h || !h.past.length) return
    const prev = h.past[h.past.length - 1]
    set({
      pages: s.pages.map((p) => (p.id === page.id ? { ...p, elements: prev, updatedAt: Date.now() } : p)),
      history: { ...s.history, [page.id]: { past: h.past.slice(0, -1), future: [page.elements, ...h.future] } },
      cursor: null,
      selection: [],
    })
  },
  redo: () => {
    const s = get()
    const page = currentPage(s)
    const h = page && s.history[page.id]
    if (!page || !h || !h.future.length) return
    const [next, ...rest] = h.future
    set({
      pages: s.pages.map((p) => (p.id === page.id ? { ...p, elements: next, updatedAt: Date.now() } : p)),
      history: { ...s.history, [page.id]: { past: [...h.past, page.elements], future: rest } },
      cursor: null,
      selection: [],
    })
  },
}))
