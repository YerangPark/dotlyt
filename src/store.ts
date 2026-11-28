import { create } from 'zustand'
import { elBox, findBulletAt, findTextAt, resetMeasureCache, textCells, translate } from './geometry'
import { clampGroup, clampInto, clampStart, type Placement } from './move'
import {
  HIGHLIGHT_COLORS,
  INK_COLORS,
  OLD_STICKER_COLORS,
  SIZES,
  type BoxEl,
  type BulletEl,
  type BulletState,
  type El,
  type LineEl,
  type MarkEl,
  type Notebook,
  type Page,
  type PenType,
  type Pt,
  type Template,
  type TextAlign,
  type TextVAlign,
  type TextSize,
} from './types'
import { DEFAULT_FONT, fontOf, type FontKey } from './fonts'

const STORAGE_KEY = 'dotlyt:v1'
const UI_KEY = 'dotlyt:ui'
const TEMPLATES_KEY = 'dotlyt:templates'
const CLIP_KEY = 'dotlyt:clipboard'

/**
 * 시스템 클립보드에도: 다른 앱에는 글자로, Dotlyt(다른 브라우저·프로필 포함)에는 html 안에 숨긴 항목 데이터로 붙는다
 */
function writeSystemClip(clip: NonNullable<State['clipboard']>, text: string) {
  const cb = navigator.clipboard
  if (!cb) return
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const html = `<meta charset="utf-8"><span data-dotlyt="${encodeURIComponent(JSON.stringify(clip))}">${esc(text) || '&nbsp;'}</span>`
  try {
    if (typeof ClipboardItem !== 'undefined' && cb.write) {
      cb.write([
        new ClipboardItem({
          'text/plain': new Blob([text], { type: 'text/plain' }),
          'text/html': new Blob([html], { type: 'text/html' }),
        }),
      ]).catch(() => {
        if (text) cb.writeText(text).catch(() => {})
      })
      return
    }
  } catch {
    /* 아래로 */
  }
  if (text) cb.writeText(text).catch(() => {})
}

/** 시스템 클립보드 html에서 Dotlyt 항목을 꺼낸다 (없으면 null) */
export function clipFromHtml(html: string | null | undefined): State['clipboard'] {
  const m = html?.match(/data-dotlyt="([^"]+)"/)
  if (!m) return null
  try {
    const c = JSON.parse(decodeURIComponent(m[1]))
    return c && Array.isArray(c.els) && c.origin ? c : null
  } catch {
    return null
  }
}

/** 다른 탭에서 복사한 것 (마지막으로 복사한 탭의 것이 남아 있다) */
function sharedClip(): State['clipboard'] {
  try {
    return JSON.parse(localStorage.getItem(CLIP_KEY) || 'null')
  } catch {
    return null
  }
}

function loadTemplates(): Template[] {
  try {
    const d = JSON.parse(localStorage.getItem(TEMPLATES_KEY) || '[]')
    return Array.isArray(d) ? d : []
  } catch {
    return []
  }
}
function saveTemplates(list: Template[]) {
  try {
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(list))
    return true
  } catch {
    return false
  }
}

/** 요소를 새 id로 복사해서 페이지 크기에 맞춘다 */
function cloneInto(els: El[], page: Pick<Page, 'cols' | 'rows'>): El[] {
  return clampGroup(
    els.map((e) => ({ ...e, id: uid() }) as El),
    page,
  )
}
const HISTORY_LIMIT = 200

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

interface Persisted {
  notebook: Notebook | null
  pages: Page[]
  currentPageId: string | null
  /** 저장 형식 판. 2부터 형광펜은 한 획(가로·세로 띠, 점)씩 저장한다 */
  v?: number
}
const DATA_VERSION = 2

/** 판 1(예전)에는 세로로 칠한 형광펜이 한 칸짜리로 쌓여 저장됐다: 한 획(세로 띠)으로 묶는다. 판 2부터는 점이 진짜 점이라 묶지 않는다 */
function joinVerticalMarks(els: El[]): El[] {
  const singles = els.filter((e): e is MarkEl => e.type === 'mark' && e.w === 1 && e.h === 1)
  if (singles.length < 2) return els
  const used = new Set<string>()
  const joined: MarkEl[] = []
  const at = new Map(singles.map((m) => [`${m.x},${m.y},${m.color}`, m]))
  for (const m of [...singles].sort((a, b) => a.x - b.x || a.y - b.y)) {
    if (used.has(m.id) || at.has(`${m.x},${m.y - 1},${m.color}`)) continue
    let h = 1
    while (at.has(`${m.x},${m.y + h},${m.color}`)) h++
    if (h < 2) continue
    for (let i = 0; i < h; i++) used.add(at.get(`${m.x},${m.y + i},${m.color}`)!.id)
    joined.push({ ...m, h })
  }
  return joined.length ? [...joined, ...els.filter((e) => !used.has(e.id))] : els
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const d = JSON.parse(raw) as Persisted
      if (d && Array.isArray(d.pages)) {
        // 예전 판인지: 판 번호가 없고, 한 칸보다 높은 형광펜(새 판의 세로 획)도 없을 때만
        const legacyMarks = (d.v ?? 1) < 2 && !d.pages.some((p) => p.elements.some((e) => e.type === 'mark' && e.h > 1))
        // 글자 없이 남은 네모칸(편집 중에 창을 닫은 경우)은 치운다
        // 페이지 밖으로 밀려나 안 보이던 것(예전 옮기기)은 가장자리 안쪽으로 되돌린다
        d.pages = d.pages.map((p) => ({
          ...p,
          // 예전 쨍한 인덱스 색은 새 차분한 색으로
          index: p.index && OLD_STICKER_COLORS[p.index.color.toLowerCase()] ? { ...p.index, color: OLD_STICKER_COLORS[p.index.color.toLowerCase()] } : p.index,
          elements: ((els: El[]) => (legacyMarks ? joinVerticalMarks(els) : els))(
            p.elements.filter((e) => !(e.type === 'box' && !e.text.trim()) && !(e.type === 'text' && e.text === '')).map((e) => clampStart(e, p)),
          ),
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
  /** 앞으로 쓸 글씨체 (예전 이름 textFont는 고운돋움이 기본이던 때라 무시) */
  defaultFont: FontKey
}

function loadUi(): Partial<UiPrefs> {
  try {
    return JSON.parse(localStorage.getItem(UI_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveUi() {
  const { showGuides, lineStyle, textFont } = useStore.getState()
  try {
    localStorage.setItem(UI_KEY, JSON.stringify({ showGuides, lineStyle, defaultFont: textFont }))
  } catch {
    /* 무시 */
  }
}

export function persist(): boolean {
  const { notebook, pages, currentPageId } = useStore.getState()
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ notebook, pages, currentPageId, v: DATA_VERSION }))
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
  double: boolean
  color: string
  pen: PenType
}

/**
 * 되돌리기 기록 (페이지마다). 양쪽 페이지에 걸친 선처럼 여러 페이지를 한 번에 바꾼 건 같은 group으로 묶어서 함께 되돌린다.
 * t: 바꾼 순서(모든 페이지 통틀어), u: 되돌린 순서. 펼침면에서 양쪽 페이지를 오가며 그려도 그린 순서대로 되돌린다.
 */
type Snap = { els: El[]; group?: string; t?: number; u?: number }
type History = Record<string, { past: Snap[]; future: Snap[] }>

let seq = 0
const nextSeq = () => ++seq

/** 새로 바꾸면 모든 페이지의 '다시 실행'을 비운다 (되돌리기는 한 줄로 이어진 기록) */
function freshHistory(h: History): History {
  const out: History = {}
  for (const [id, v] of Object.entries(h)) out[id] = v.future.length ? { past: v.past, future: [] } : v
  return out
}

/** 양쪽 페이지에 걸친 선을 긋는 중일 때, 반대쪽 페이지에 보여줄 미리보기 */
export type CrossPreview = { pageId: string; a: Pt; b: Pt; id: string } | null

/** 기호 팝업: 빈 칸에 기호 넣기, 또는 기호 상태 바꾸기 */
export type Popup =
  | { kind: 'insert'; x: number; y: number }
  | { kind: 'state'; id: string }
  /** 아이콘 고르기. replaceId가 있으면 그 아이콘을 바꾼다 */
  | { kind: 'icon'; x: number; y: number; replaceId?: string }
  | null

/** 줄 맨 앞 빠른 입력 */
// 한글 자판에서 o는 ㅐ, Shift+o는 ㅒ라서 같이 받는다 (한영 전환 없이)
const QUICK: Record<string, BulletState> = { '* ': 'task', 'o ': 'event', 'O ': 'event', 'ㅐ ': 'event', 'ㅒ ': 'event', '- ': 'note' }

interface State extends Persisted {
  cursor: Cursor | null
  selection: string[]
  lineStyle: LineStyle
  selectMode: boolean
  eraserMode: boolean
  /** 형광펜: 켜고 문지르면 지나간 칸에 색이 칠해진다 */
  highlightMode: boolean
  /** 형광펜 색. null이면 칠한 칸 지우기 */
  hlColor: string | null
  showGuides: boolean
  /** PC 넓은 화면: 양쪽 펼침면 */
  spread: boolean
  history: History
  saveStatus: 'saved' | 'saving' | 'error'
  fontsVersion: number
  /** 새로 쓰는 글자를 굵게 */
  textBold: boolean
  /** 앞으로 쓸 글자 크기와 정렬 (줄 글자는 차지한 칸 안에서, 네모칸은 네모칸 안에서) */
  textSize: TextSize
  boxAlign: TextAlign
  /** 앞으로 쓸 글자의 세로 정렬 */
  textValign: TextVAlign
  textFont: FontKey
  popup: Popup

  createNotebook: (nb: Notebook) => void
  updateNotebook: (nb: Notebook) => void
  setSpread: (on: boolean) => void
  addPage: () => void
  goRelative: (delta: number) => void
  goToPage: (id: string) => void
  /** keepSelection: 펼침면에서 이미 고른 것을 다른 쪽 페이지에서 잡아 옮길 때 */
  focusPage: (id: string, keepSelection?: boolean) => void
  /** 양쪽 페이지에 걸친 고르기 사각형 (화면 좌표) */
  marquee: { x1: number; y1: number; x2: number; y2: number } | null
  setMarquee: (m: State['marquee']) => void
  /** 고른 것을 옮기는 중일 때 모든 페이지가 함께 보여줄 이동량 */
  moveDelta: { dx: number; dy: number } | null
  setMoveDelta: (d: State['moveDelta']) => void
  setIndex: (pageId: string, tab: { name: string; color: string } | null) => void
  templates: Template[]
  /** scope: 지금 페이지 한 장, 또는 펼침면 두 장. 저장 못 하면 false */
  saveTemplate: (name: string, scope: 'page' | 'spread') => boolean
  deleteTemplate: (id: string) => void
  /** new: 지금 페이지(펼침면) 뒤에 새 페이지로, here: 지금 페이지(펼침면)에 겹쳐 넣기 (되돌리기 가능) */
  applyTemplate: (id: string, mode: 'new' | 'here') => void

  openAt: (x: number, y: number) => void
  editElement: (id: string) => void
  closeCursor: () => void
  typeText: (value: string) => void
  toggleBold: () => void
  /** 쓰고 있는 글자나 고른 글자에 크기·정렬 적용. 대상이 없으면 앞으로 쓸 글자의 기본값으로 */
  setTextSize: (size: TextSize) => void
  setAlign: (align: TextAlign) => void
  setValign: (valign: TextVAlign) => void
  setFont: (font: FontKey) => void

  setPopup: (p: Popup) => void
  addBullet: (state: BulletState) => void
  iconSize: 1 | 2 | 3
  setIconSize: (size: 1 | 2 | 3) => void
  /** 아이콘 고르기 창에서 고른 아이콘을 칸에 넣거나, 있던 아이콘을 바꾼다 */
  addIcon: (icon: string) => void
  setBulletState: (id: string, state: BulletState) => void
  toggleCancel: (id: string) => void
  deleteElement: (id: string) => void

  setSelection: (ids: string[]) => void
  setSelectMode: (on: boolean) => void
  setEraserMode: (on: boolean) => void
  setHighlightMode: (on: boolean) => void
  setHlColor: (c: string | null) => void
  /** 형광펜으로 문지르는 중인 칸 (페이지별 "x,y") */
  paintPreview: Record<string, string[]> | null
  setPaintPreview: (p: Record<string, string[]> | null) => void
  /** 페이지별 칸들을 형광펜 색으로 칠하거나(color) 지운다(null) */
  paintCells: (cells: Record<string, { x: number; y: number }[]>, color: string | null) => void
  deleteIds: (ids: string[]) => void
  duplicateSelection: () => void
  deletePages: (ids: string[]) => void
  /** 페이지 순서 바꾸기: id 페이지를 toIndex 자리로 */
  movePage: (id: string, toIndex: number) => void
  openInsertPopup: () => boolean
  setShowGuides: (on: boolean) => void
  setLineStyle: (patch: Partial<LineStyle>) => void
  /** 고른 것의 색만 바꾼다 (펜 색은 그대로). ink: 글자·네모칸·아이콘·기호·선, mark: 형광펜 */
  recolorSelection: (color: string, target?: 'ink' | 'mark') => void
  /** 지정한 항목들의 색만 바꾼다 (기호 팝업 등) */
  recolorIds: (ids: string[], color: string) => void
  addLine: (a: Pt, b: Pt, id?: string) => void
  /** 여러 페이지에 선을 한 번에 (되돌리기 한 번으로 함께 사라짐) */
  addLinePieces: (pieces: { pageId: string; a: Pt; b: Pt; id?: string }[]) => void
  crossPreview: CrossPreview
  setCrossPreview: (c: CrossPreview) => void
  /** 지우개로 문지르는 중 지워질 것 (펼침면 양쪽 페이지에서 함께 숨긴다) */
  erasing: string[] | null
  setErasing: (ids: string[] | null) => void
  addBox: (x: number, y: number, w: number, h: number) => void
  /** 네모칸 크기·위치 바꾸기 (모서리 손잡이로 끌기). 되돌리기 한 번 */
  resizeBox: (id: string, r: { x: number; y: number; w: number; h: number }) => void
  /** 고른 것을 옮긴 결과 적용 (펼침면 반대쪽 페이지로 넘어가는 것 포함) */
  applyPlacements: (placements: Placement[]) => void
  /** 복사해 둔 항목. 좌표는 묶음 왼쪽 위(0,0) 기준, origin은 복사한 자리 */
  /** split: 펼침면 양쪽에서 복사했으면 오른쪽 페이지 것이 시작하는 x (묶음 기준). 붙일 때 다시 양쪽으로 나눈다 */
  clipboard: { els: El[]; pageId: string; origin: Pt; split?: number } | null
  copySelection: () => boolean
  cutSelection: () => boolean
  /** 커서가 있는 빈 칸이 있으면 거기에, 없으면 복사한 자리에서 한 칸씩 비켜서 붙인다 */
  paste: () => boolean
  deleteSelection: () => void
  undo: () => void
  redo: () => void
}

export const currentPage = (s: Pick<State, 'pages' | 'currentPageId'>) =>
  s.pages.find((p) => p.id === s.currentPageId) ?? null

/** 두 페이지가 같은 펼침면인지 */
const sameSpread = (pages: Page[], a: string, b: string) => {
  const i = pages.findIndex((p) => p.id === a)
  const j = pages.findIndex((p) => p.id === b)
  return i >= 0 && j >= 0 && spreadStart(i) === spreadStart(j)
}

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
      ? { ...freshHistory(s.history), [page.id]: { past: [...h.past, { els: page.elements, t: nextSeq() }].slice(-HISTORY_LIMIT), future: [] } }
      : s.history,
  }
}

/** 글자를 안 쓰고 떠난 빈 네모칸, 다 지운 글자는 없앤다 */
function leaveCursor(s: State): Partial<State> {
  const c = s.cursor
  const page = currentPage(s)
  if (!c?.editId || !page) return { cursor: null, popup: null }
  const el = page.elements.find((e) => e.id === c.editId)
  if ((el?.type === 'box' && !el.text.trim()) || (el?.type === 'text' && el.text === '')) {
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

/** 글자 스타일을 바꿀 대상: 지금 쓰고 있는 글자, 없으면 고른 글자들 */
function textTargetsOf(s: State) {
  const ids = s.cursor?.editId ? [s.cursor.editId] : s.selection
  return s.pages.flatMap((p) => p.elements).filter((e) => ids.includes(e.id) && (e.type === 'text' || e.type === 'box'))
}

/** 여러 페이지의 요소를 한 번에 바꾼다. 두 쪽 이상 바뀌면 되돌리기 한 번으로 묶는다. */
function withPages(s: State, fn: (els: El[], pageId: string) => El[] | null): Partial<State> {
  const changed: Record<string, El[]> = {}
  for (const p of s.pages) {
    const next = fn(p.elements, p.id)
    if (next && next !== p.elements) changed[p.id] = next
  }
  const ids = Object.keys(changed)
  if (!ids.length) return {}
  const group = ids.length > 1 ? uid() : undefined
  const t = nextSeq()
  const history = freshHistory(s.history)
  const pages = s.pages.map((p) => {
    if (!changed[p.id]) return p
    const h = history[p.id] ?? { past: [], future: [] }
    history[p.id] = { past: [...h.past, { els: p.elements, group, t }].slice(-HISTORY_LIMIT), future: [] }
    return { ...p, elements: changed[p.id], updatedAt: Date.now() }
  })
  return { pages, history }
}

/** mapIds + 바뀐 뒤 넓어져서 페이지 밖으로 나가면 안쪽으로 민다 (크기·글씨체·굵게) */
const mapFit = (s: State, ids: string[], fn: (e: El) => El) => (els: El[], pageId: string) => {
  const pg = s.pages.find((p) => p.id === pageId)
  return els.some((e) => ids.includes(e.id))
    ? els.map((e) => (ids.includes(e.id) ? (pg ? clampInto(fn(e), pg) : fn(e)) : e))
    : null
}

const initial = load()
const ui = loadUi()

/** 지금 보이는 페이지들 (펼침면이면 양쪽) */
function visiblePageIds(s: State): string[] {
  const idx = s.pages.findIndex((p) => p.id === s.currentPageId)
  if (idx < 0) return []
  return (s.spread ? s.pages.slice(spreadStart(idx), spreadStart(idx) + 2) : [s.pages[idx]]).map((p) => p.id)
}

/** 되돌릴 페이지: 보이는 페이지 중 가장 최근에 바꾼 곳 */
export function undoTarget(s: State): string | null {
  let best: string | null = null
  let bestT = -1
  for (const id of visiblePageIds(s)) {
    const last = s.history[id]?.past.slice(-1)[0]
    if (last && (last.t ?? 0) > bestT) {
      bestT = last.t ?? 0
      best = id
    }
  }
  return best
}

/** 다시 실행할 페이지: 보이는 페이지 중 가장 최근에 되돌린 곳 */
export function redoTarget(s: State): string | null {
  let best: string | null = null
  let bestU = -1
  for (const id of visiblePageIds(s)) {
    const first = s.history[id]?.future[0]
    if (first && (first.u ?? 0) > bestU) {
      bestU = first.u ?? 0
      best = id
    }
  }
  return best
}

export const useStore = create<State>()((set, get) => ({
  ...initial,
  cursor: null,
  selection: [],
  lineStyle: { width: 1, dash: false, double: false, color: INK_COLORS[0].color, pen: 'ballpoint', ...ui.lineStyle },
  selectMode: false,
  eraserMode: false,
  highlightMode: false,
  hlColor: HIGHLIGHT_COLORS[0].color,
  showGuides: ui.showGuides ?? false,
  spread: false,
  history: {},
  saveStatus: 'saved',
  fontsVersion: 0,
  textBold: false,
  iconSize: 1,
  clipboard: sharedClip(),
  crossPreview: null,
  setCrossPreview: (crossPreview) => set({ crossPreview }),
  erasing: null,
  setErasing: (erasing) => set({ erasing }),
  textSize: 'm',
  boxAlign: 'left',
  textValign: 'middle',
  textFont: ui.defaultFont ?? DEFAULT_FONT,
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
  templates: loadTemplates(),
  saveTemplate: (name, scope) => {
    const s = get()
    const idx = s.pages.findIndex((p) => p.id === s.currentPageId)
    if (idx < 0) return false
    const src = scope === 'spread' && s.spread ? s.pages.slice(spreadStart(idx), spreadStart(idx) + 2) : [s.pages[idx]]
    const t: Template = {
      id: uid(),
      name: name.trim() || '이름 없는 템플릿',
      pages: src.map((p) => ({ cols: p.cols, rows: p.rows, elements: p.elements.map((e) => ({ ...e })) })),
      createdAt: Date.now(),
    }
    const templates = [t, ...s.templates]
    if (!saveTemplates(templates)) return false
    set({ templates })
    return true
  },
  deleteTemplate: (id) => {
    const templates = get().templates.filter((t) => t.id !== id)
    saveTemplates(templates)
    set({ templates })
  },
  applyTemplate: (id, mode) => {
    const s = get()
    const t = s.templates.find((x) => x.id === id)
    if (!t || !s.notebook) return
    const idx = s.pages.findIndex((p) => p.id === s.currentPageId)
    if (mode === 'new') {
      // 펼침면이면 두 장씩 짝이 맞게 넣는다 (템플릿이 한 장이어도 빈 오른쪽 페이지를 같이)
      const count = s.spread ? 2 : t.pages.length
      const added = Array.from({ length: count }, (_, i) => {
        const p = newPage(s.notebook!)
        const tp = t.pages[i]
        return tp ? { ...p, elements: cloneInto(tp.elements, p) } : p
      })
      const pages = [...s.pages]
      pages.splice(s.spread ? spreadStart(idx) + 2 : idx + 1, 0, ...added)
      set({ ...leaveCursor(s), pages, currentPageId: added[0].id, selection: [] })
      return
    }
    const s1 = { ...s, ...leaveCursor(s) } as State
    const targets = s.spread ? s1.pages.slice(spreadStart(idx), spreadStart(idx) + 2) : [s1.pages[idx]]
    const fresh: string[] = []
    set({
      ...leaveCursor(s),
      ...withPages(s1, (els, pid) => {
        const k = targets.findIndex((p) => p.id === pid)
        const tp = t.pages[k]
        if (k < 0 || !tp) return null
        const add = cloneInto(tp.elements, targets[k])
        fresh.push(...add.map((e) => e.id))
        return [...els, ...add]
      }),
      selection: fresh,
    })
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

  focusPage: (id, keepSelection) => {
    const s = get()
    if (s.currentPageId === id) return
    set({ ...leaveCursor(s), currentPageId: id, selection: keepSelection ? s.selection : [] })
  },
  marquee: null,
  setMarquee: (marquee) => set({ marquee }),
  moveDelta: null,
  setMoveDelta: (moveDelta) => set({ moveDelta }),

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
      // 오른쪽 끝을 넘기는 입력은 받지 않는다 (지우는 건 언제나 가능)
      if (editing?.type === 'text' && value.length > editing.text.length && editing.x + textCells(value, editing.bold, editing.size, editing.font) > page.cols) return
      // 다 지워도 바로 없애지 않는다: 이어서 쓰면 지우기 전 글씨 스타일을 그대로 따른다 (떠날 때 없앰)
      els = els.map((e) => (e.id === editId && e.type === 'text' ? { ...e, text: value } : e))
    } else if (value !== '') {
      if (c.x + textCells(value, s.textBold, s.textSize, s.textFont) > page.cols) return
      editId = uid()
      els = [...els, { id: editId, type: 'text', x: c.x, y: c.y, text: value, ...(s.textBold ? { bold: true } : {}), ...(s.textSize !== 'm' ? { size: s.textSize } : {}), ...(s.boxAlign !== 'left' ? { align: s.boxAlign } : {}), ...(s.textValign !== 'middle' ? { valign: s.textValign } : {}), ...(s.textFont !== DEFAULT_FONT ? { font: s.textFont } : {}) }]
    } else return
    // 줄 맨 앞에서 "* ", "o ", "- " → 기호로 바꾸고 오른쪽 칸에서 이어 쓴다
    const quick = QUICK[value]
    const isFresh = !editing || (editing.type === 'text' && editing.text.length < value.length && editing.text.length <= 1)
    if (quick && isFresh && editId && !findBulletAt(els, c.x, c.y) && c.x < page.cols - 1) {
      els = els.filter((e) => e.id !== editId)
      const bullet: BulletEl = { id: uid(), type: 'bullet', x: c.x, y: c.y, state: quick, cancelled: false, color: s.lineStyle.color }
      els = [...els, bullet]
      set({ ...withElements(s, els, !c.dirty), cursor: { x: c.x + 1, y: c.y, editId: null, dirty: false } })
      return
    }
    set({ ...withElements(s, els, !c.dirty), cursor: { ...c, editId, dirty: true }, popup: null })
  },

  // 1) 지금 쓰고 있는 글자 2) 고른 글자들(양쪽 페이지 포함) 3) 앞으로 쓸 글자
  toggleBold: () => {
    const s = get()
    const targets = textTargetsOf(s)
    if (!targets.length) return set({ textBold: !s.textBold })
    const allBold = targets.every((e) => (e as { bold?: boolean }).bold)
    set(withPages(s, mapFit(s, targets.map((t) => t.id), (e) => ({ ...e, bold: !allBold }) as El)))
  },
  setTextSize: (size) => {
    const s = get()
    const targets = textTargetsOf(s)
    if (!targets.length) return set({ textSize: size })
    set(withPages(s, mapFit(s, targets.map((t) => t.id), (e) => ({ ...e, size }) as El)))
  },
  setFont: (font) => {
    const s = get()
    const targets = textTargetsOf(s)
    if (!targets.length) {
      set({ textFont: font })
      saveUi()
      return
    }
    const ids = targets.map((t) => t.id)
    const apply = () => {
      const now = get()
      set(withPages(now, mapFit(now, ids, (e) => ({ ...e, font }) as El)))
    }
    // 아직 안 불러온 글씨체면 불러온 뒤에 폭을 재서 맞춘다 (먼저 재면 다른 글씨체 폭으로 밀려난다)
    const f = fontOf(font)
    if (typeof document !== 'undefined' && document.fonts && !document.fonts.check(`16px "${f.load}"`, '가A')) {
      document.fonts.load(`16px "${f.load}"`, '가나A1').then(() => {
        resetMeasureCache()
        apply()
      }, apply)
    } else apply()
  },
  setValign: (valign) => {
    const s = get()
    const targets = textTargetsOf(s)
    if (!targets.length) return set({ textValign: valign })
    set(withPages(s, mapFit(s, targets.map((t) => t.id), (e) => ({ ...e, valign }) as El)))
  },
  setAlign: (align) => {
    const s = get()
    const targets = textTargetsOf(s)
    if (!targets.length) return set({ boxAlign: align })
    set(withPages(s, mapFit(s, targets.map((t) => t.id), (e) => ({ ...e, align }) as El)))
  },

  setPopup: (popup) => set({ popup }),
  setIconSize: (iconSize) => {
    const s = get()
    const p = s.popup
    // 바꾸는 중인 아이콘이 있으면 크기도 바로 적용
    if (p?.kind === 'icon' && p.replaceId) {
      const pg = currentPage(s)
      set({ iconSize, ...withPages(s, (els, pid) => (pid === pg?.id ? els.map((e) => (e.id === p.replaceId && e.type === 'icon' ? clampInto({ ...e, size: iconSize }, pg) : e)) : null)) })
    } else set({ iconSize })
  },
  addIcon: (icon) => {
    const s = get()
    const p = s.popup
    const page = currentPage(s)
    if (p?.kind !== 'icon' || !page) return
    if (p.replaceId) {
      set({ ...withElements(s, page.elements.map((e) => (e.id === p.replaceId && e.type === 'icon' ? { ...e, icon } : e))), popup: null })
      return
    }
    const el = clampInto({ id: uid(), type: 'icon', x: p.x, y: p.y, icon, size: s.iconSize, color: s.lineStyle.color }, page)
    set({ ...leaveCursor(s), ...withElements({ ...s, ...leaveCursor(s) } as State, [...page.elements, el]), popup: null, selection: [] })
  },
  addBullet: (state) => {
    const s = get()
    const page = currentPage(s)
    const p = s.popup
    if (!page || p?.kind !== 'insert') return
    const els = page.elements.filter((e) => !(e.type === 'bullet' && e.x === p.x && e.y === p.y))
    const bullet: BulletEl = { id: uid(), type: 'bullet', x: p.x, y: p.y, state, cancelled: false, color: s.lineStyle.color }
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
  setSelectMode: (on) =>
    set(on ? { selectMode: true, eraserMode: false, highlightMode: false, ...leaveCursor(get()) } : { selectMode: false }),
  setHighlightMode: (on) =>
    set(
      on
        ? { highlightMode: true, selectMode: false, eraserMode: false, selection: [], ...leaveCursor(get()) }
        : { highlightMode: false },
    ),
  setHlColor: (hlColor) => set({ hlColor }),
  paintPreview: null,
  setPaintPreview: (paintPreview) => set({ paintPreview }),
  paintCells: (cells, color) => {
    const s = get()
    set(
      withPages(s, (els, pageId) => {
        const todo = cells[pageId]
        if (!todo?.length) return null
        const marks = els.filter((e): e is MarkEl => e.type === 'mark')
        const others = els.filter((e) => e.type !== 'mark')
        if (color) {
          // 한 번 그은 것은 한 획: 가로 띠, 세로 띠, 또는 콕 찍은 점. 이미 있는 형광펜과 합치지 않는다
          const xs = todo.map((c) => c.x)
          const ys = todo.map((c) => c.y)
          const stroke: MarkEl = {
            id: uid(),
            type: 'mark',
            x: Math.min(...xs),
            y: Math.min(...ys),
            w: Math.max(...xs) - Math.min(...xs) + 1,
            h: Math.max(...ys) - Math.min(...ys) + 1,
            color,
          }
          // 같은 자리를 다시 그으면 덮어쓴다 (새 획 안에 다 들어가는 예전 획은 뺀다)
          const inside = (m: MarkEl) => m.x >= stroke.x && m.y >= stroke.y && m.x + m.w <= stroke.x + stroke.w && m.y + m.h <= stroke.y + stroke.h
          return [...marks.filter((m) => !inside(m)), stroke, ...others]
        }
        // 지우기: 문지른 칸만 빼고, 남은 부분은 같은 방향의 획으로 나눠 남긴다
        const hit = new Set(todo.map((c) => `${c.x},${c.y}`))
        let changed = false
        const next: MarkEl[] = []
        for (const m of marks) {
          const vertical = m.w === 1 && m.h > 1
          const cellsOf: { x: number; y: number }[] = []
          for (let dy = 0; dy < m.h; dy++) for (let dx = 0; dx < m.w; dx++) cellsOf.push({ x: m.x + dx, y: m.y + dy })
          const keep = cellsOf.filter((c) => !hit.has(`${c.x},${c.y}`))
          if (keep.length === cellsOf.length) {
            next.push(m)
            continue
          }
          changed = true
          // 남은 칸을 줄(세로 획이면 열) 단위로 이어진 조각으로
          for (const c of keep) {
            const last = next[next.length - 1]
            const joins = last && last.color === m.color && (vertical
              ? last.x === c.x && last.w === 1 && last.y + last.h === c.y && last.id.startsWith(m.id)
              : last.y === c.y && last.h === 1 && last.x + last.w === c.x && last.id.startsWith(m.id))
            if (joins) {
              if (vertical) last.h++
              else last.w++
            } else next.push({ id: m.id + '-' + uid(), type: 'mark', x: c.x, y: c.y, w: 1, h: 1, color: m.color })
          }
        }
        return changed ? [...next, ...others] : null
      }),
    )
  },
  setEraserMode: (on) =>
    set(
      on
        ? { eraserMode: true, selectMode: false, highlightMode: false, selection: [], ...leaveCursor(get()) }
        : { eraserMode: false },
    ),

  // 어느 페이지에 있든 지운다 (지우개를 펼침면 양쪽에 걸쳐 문질러도 되돌리기 한 번에 함께)
  deleteIds: (ids) => {
    const s = get()
    if (!ids.length) return
    set({ ...withPages(s, (els) => (els.some((e) => ids.includes(e.id)) ? els.filter((e) => !ids.includes(e.id)) : null)), selection: [] })
  },

  // 고른 것을 한 칸 오른쪽 아래에 복제하고, 복제한 것을 고른 상태로
  duplicateSelection: () => {
    const s = get()
    if (!s.selection.length) return
    const copyIds: string[] = []
    const change = withPages(s, (els, pageId) => {
      const pg = s.pages.find((p) => p.id === pageId)!
      const copies = clampGroup(
        els.filter((e) => s.selection.includes(e.id)).map((e) => ({ ...translate(e, 1, 1), id: uid() }) as El),
        pg,
      )
      if (!copies.length) return null
      copyIds.push(...copies.map((c) => c.id))
      return [...els, ...copies]
    })
    set({ ...change, selection: copyIds })
  },

  movePage: (id, toIndex) => {
    const s = get()
    const from = s.pages.findIndex((p) => p.id === id)
    if (from < 0) return
    const pages = [...s.pages]
    const [pg] = pages.splice(from, 1)
    pages.splice(Math.max(0, Math.min(pages.length, toIndex)), 0, pg)
    set({ pages })
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

  recolorIds: (ids, color) => {
    const s = get()
    set(withPages(s, (els) => (els.some((e) => ids.includes(e.id)) ? els.map((e) => (ids.includes(e.id) ? ({ ...e, color } as El) : e)) : null)))
  },
  recolorSelection: (color, target = 'ink') => {
    const s = get()
    const kinds: El['type'][] = target === 'mark' ? ['mark'] : ['text', 'box', 'icon', 'bullet', 'line']
    const ids = s.pages
      .flatMap((p) => p.elements)
      .filter((e) => s.selection.includes(e.id) && kinds.includes(e.type))
      .map((e) => e.id)
    if (!ids.length) return
    set(withPages(s, (els) => (els.some((e) => ids.includes(e.id)) ? els.map((e) => (ids.includes(e.id) ? ({ ...e, color } as El) : e)) : null)))
  },
  setLineStyle: (patch) => {
    const s = get()
    const lineStyle = { ...s.lineStyle, ...patch }
    const sel = s.pages.flatMap((p) => p.elements).filter((e) => s.selection.includes(e.id))
    const lineIds = sel.filter((e) => e.type === 'line').map((e) => e.id)
    // 아이콘·기호는 색만 따라간다
    const iconIds = patch.color ? sel.filter((e) => e.type === 'icon' || e.type === 'bullet').map((e) => e.id) : []
    set({
      lineStyle,
      ...withPages(s, (els) => {
        if (!els.some((e) => lineIds.includes(e.id) || iconIds.includes(e.id))) return null
        return els.map((e) =>
          lineIds.includes(e.id) ? ({ ...e, ...patch } as El) : iconIds.includes(e.id) ? ({ ...e, color: patch.color! } as El) : e,
        )
      }),
    })
    saveUi()
  },

  addLine: (a, b, id) => {
    const s = get()
    const page = currentPage(s)
    if (!page) return
    const line: LineEl = { id: id ?? uid(), type: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, ...s.lineStyle }
    set(withElements(s, [...page.elements, line]))
  },

  addLinePieces: (pieces) => {
    const s = get()
    const group = pieces.length > 1 ? uid() : undefined
    const t = nextSeq()
    const history = freshHistory(s.history)
    const pages = s.pages.map((p) => {
      const mine = pieces.filter((pc) => pc.pageId === p.id)
      if (!mine.length) return p
      const lines: LineEl[] = mine.map((pc) => ({
        id: pc.id ?? uid(),
        type: 'line',
        x1: pc.a.x,
        y1: pc.a.y,
        x2: pc.b.x,
        y2: pc.b.y,
        ...s.lineStyle,
      }))
      const h = history[p.id] ?? { past: [], future: [] }
      history[p.id] = { past: [...h.past, { els: p.elements, group, t }].slice(-HISTORY_LIMIT), future: [] }
      return { ...p, elements: [...p.elements, ...lines], updatedAt: Date.now() }
    })
    set({ pages, history, crossPreview: null })
  },

  resizeBox: (id, r) => {
    const s = get()
    const page = currentPage(s)
    const el = page?.elements.find((e) => e.id === id)
    if (!page || el?.type !== 'box') return
    if (el.x === r.x && el.y === r.y && el.w === r.w && el.h === r.h) return
    set(withElements(s, page.elements.map((e) => (e.id === id ? { ...el, ...r } : e))))
  },

  // 네모칸을 만들고 바로 글자 입력을 시작한다
  addBox: (x, y, w, h) => {
    const s = get()
    set(leaveCursor(s))
    const s2 = get()
    const page = currentPage(s2)
    if (!page) return
    const box: BoxEl = {
      id: uid(),
      type: 'box',
      x,
      y,
      w,
      h,
      text: '',
      ...(s2.textBold ? { bold: true } : {}),
      ...(s2.textSize !== 'm' ? { size: s2.textSize } : {}),
      ...(s2.boxAlign !== 'left' ? { align: s2.boxAlign } : {}),
      ...(s2.textValign !== 'middle' ? { valign: s2.textValign } : {}),
      ...(s2.textFont !== DEFAULT_FONT ? { font: s2.textFont } : {}),
    }
    set({
      ...withElements(s2, [...page.elements, box]),
      cursor: { x, y, editId: box.id, dirty: true },
      selection: [],
    })
  },

  copySelection: () => {
    const s = get()
    if (!s.selection.length) return false
    // 펼침면 양쪽에서 고른 것은 왼쪽 페이지 오른쪽에 이어 붙인 것처럼 한 판으로 모은다
    const els: El[] = []
    let offset = 0
    let firstPage = ''
    let split: number | undefined
    for (const p of s.pages) {
      const mine = p.elements.filter((e) => s.selection.includes(e.id))
      if (!mine.length) continue
      if (!firstPage) firstPage = p.id
      else if (split === undefined) split = offset
      els.push(...mine.map((e) => translate(e, offset, 0)))
      offset += p.cols + 1
    }
    const boxes = els.map((e) => elBox(e))
    const origin = { x: Math.floor(Math.min(...boxes.map((b) => b.x1))), y: Math.floor(Math.min(...boxes.map((b) => b.y1))) }
    const clipboard = {
      els: els.map((e) => translate(e, -origin.x, -origin.y)),
      pageId: firstPage,
      origin,
      ...(split !== undefined ? { split: split - origin.x } : {}),
    }
    set({ clipboard })
    // 같은 브라우저의 다른 탭에서도 붙여넣을 수 있게 브라우저 저장소에도 (탭마다 메모리가 따로라서)
    try {
      localStorage.setItem(CLIP_KEY, JSON.stringify(clipboard))
    } catch {
      /* 저장 못 해도 이 탭에서는 붙여넣기 된다 */
    }
    // 다른 앱에 붙여넣을 수 있게 글자는 시스템 클립보드에도
    const text = els
      .filter((e) => e.type === 'text' || e.type === 'box')
      .sort((a, b) => (a as { y: number }).y - (b as { y: number }).y || (a as { x: number }).x - (b as { x: number }).x)
      .map((e) => (e as { text: string }).text)
      .join('\n')
    writeSystemClip(clipboard, text)
    return true
  },
  cutSelection: () => {
    if (!get().copySelection()) return false
    get().deleteSelection()
    return true
  },
  paste: () => {
    const s = get()
    const clip = s.clipboard ?? sharedClip()
    const page = currentPage(s)
    if (!clip || !page) return false
    const c = s.cursor
    // 커서가 있는 빈 칸 → 거기에 / 같은 페이지 → 마지막으로 붙인(복사한) 자리에서 한 칸 비켜서 / 다른 페이지 → 같은 자리에
    const at =
      c && !c.editId
        ? { x: c.x, y: c.y }
        : clip.pageId === page.id || (clip.split !== undefined && sameSpread(s.pages, clip.pageId, page.id))
          ? { x: clip.origin.x + 1, y: clip.origin.y + 1 }
          : { x: clip.origin.x, y: clip.origin.y }
    // 펼침면 양쪽에서 복사한 것: 왼쪽 몫은 펼침면 왼쪽 페이지에, 오른쪽 몫은 오른쪽 페이지에 같은 자리로
    const idx = s.pages.findIndex((p) => p.id === page.id)
    const L = s.pages[spreadStart(idx)]
    const R = s.pages[spreadStart(idx) + 1]
    if (clip.split !== undefined && L && R) {
      const split = clip.split
      const d = { x: at.x - clip.origin.x, y: at.y - clip.origin.y }
      const isRight = (e: El) => elBox(e).x1 >= split
      const fresh = (e: El, dx: number) => ({ ...translate(e, clip.origin.x + dx, clip.origin.y + d.y), id: uid() }) as El
      const left = clampGroup(clip.els.filter((e) => !isRight(e)).map((e) => fresh(e, d.x)), L)
      const right = clampGroup(clip.els.filter(isRight).map((e) => fresh(e, d.x - clip.origin.x - split)), R)
      const base = { ...s, ...leaveCursor(s) } as State
      set({
        ...leaveCursor(s),
        ...withPages(base, (cur, pid) => (pid === L.id && left.length ? [...cur, ...left] : pid === R.id && right.length ? [...cur, ...right] : null)),
        selection: [...left, ...right].map((e) => e.id),
        clipboard: { ...clip, pageId: page.id, origin: at },
      })
      return true
    }
    const els = clampGroup(
      clip.els.map((e) => ({ ...translate(e, at.x, at.y), id: uid() }) as El),
      page,
    )
    set({
      ...leaveCursor(s),
      ...withPages({ ...s, ...leaveCursor(s) } as State, (cur, pid) => (pid === page.id ? [...cur, ...els] : null)),
      selection: els.map((e) => e.id),
      clipboard: { ...clip, pageId: page.id, origin: at },
    })
    return true
  },

  applyPlacements: (placements) => {
    const s = get()
    const moved = new Map(placements.map((p) => [p.el.id, p]))
    const unchanged = placements.every((p) => p.from === p.to && s.pages.find((pg) => pg.id === p.from)?.elements.includes(p.el))
    if (!placements.length || unchanged) return set({ moveDelta: null })
    set({
      ...withPages(s, (els, pageId) => {
        const touches = els.some((e) => moved.has(e.id)) || placements.some((p) => p.to === pageId)
        if (!touches) return null
        const kept = els.filter((e) => !moved.has(e.id)).map((e) => e)
        // 이 페이지에 머무는 것은 원래 자리 순서대로, 넘어온 것은 뒤에
        const staying = els.filter((e) => moved.get(e.id)?.to === pageId).map((e) => moved.get(e.id)!.el)
        const arriving = placements.filter((p) => p.to === pageId && p.from !== pageId).map((p) => p.el)
        return [...kept, ...staying, ...arriving]
      }),
      moveDelta: null,
    })
  },

  deleteSelection: () => {
    const s = get()
    if (!s.selection.length) return
    const sel = s.selection
    set({
      ...withPages(s, (els) => (els.some((e) => sel.includes(e.id)) ? els.filter((e) => !sel.includes(e.id)) : null)),
      selection: [],
    })
  },

  undo: () => {
    const s = get()
    const target = undoTarget(s)
    if (!target) return
    const ph0 = s.history[target]
    const group = ph0.past[ph0.past.length - 1].group
    // 같은 묶음으로 바뀐 다른 페이지도 함께 되돌린다
    const ids = group ? s.pages.filter((p) => (s.history[p.id]?.past ?? []).slice(-1)[0]?.group === group).map((p) => p.id) : [target]
    const u = nextSeq()
    const history = { ...s.history }
    const pages = s.pages.map((p) => {
      if (!ids.includes(p.id)) return p
      const ph = history[p.id]
      const prev = ph.past[ph.past.length - 1]
      history[p.id] = { past: ph.past.slice(0, -1), future: [{ els: p.elements, group: prev.group, t: prev.t, u }, ...ph.future] }
      return { ...p, elements: prev.els, updatedAt: Date.now() }
    })
    set({ pages, history, currentPageId: target, cursor: null, selection: [], popup: null })
  },
  redo: () => {
    const s = get()
    const target = redoTarget(s)
    if (!target) return
    const group = s.history[target].future[0].group
    const ids = group ? s.pages.filter((p) => s.history[p.id]?.future[0]?.group === group).map((p) => p.id) : [target]
    const history = { ...s.history }
    const pages = s.pages.map((p) => {
      if (!ids.includes(p.id)) return p
      const ph = history[p.id]
      const [next, ...rest] = ph.future
      history[p.id] = { past: [...ph.past, { els: p.elements, group: next.group, t: next.t }], future: rest }
      return { ...p, elements: next.els, updatedAt: Date.now() }
    })
    set({ pages, history, currentPageId: target, cursor: null, selection: [], popup: null })
  },
}))

// 다른 탭에서 복사하면 이 탭의 클립보드도 그것으로 (마지막에 복사한 것을 붙인다)
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === CLIP_KEY) useStore.setState({ clipboard: sharedClip() })
  })
}
