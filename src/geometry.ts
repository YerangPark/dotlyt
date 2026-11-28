import { fontOf, type FontKey } from './fonts'
import type { BoxEl, BulletEl, El, LineEl, Pt, TextEl, TextSize, TextVAlign } from './types'

export const FONT_FAMILY = fontOf().family
/** 글자 크기 (격자 칸 높이 대비) */
export const FONT_SIZE = 0.72
/** 칸 왼쪽 가장자리에서 글자까지 여백 (칸 단위) */
export const TEXT_PAD = 0.12
/** 이 거리(칸)보다 짧게 끌면 클릭으로 본다 */
export const DRAG_THRESHOLD = 0.6
/** 점에서 이 거리(칸) 안에서 끌기 시작하면 선, 그보다 칸 안쪽이면 네모칸 */
export const DOT_GRAB = 0.34
/** 네모칸 안쪽 여백 (칸 단위) */
export const BOX_PAD = 0.25
/** 네모칸 좌우 여백: 넓은 칸은 0.25칸, 좁은 칸은 얇게 (1칸 네모에 두 자리 숫자도 거의 같은 크기로 들어가게) */
export const boxPad = (w: number) => Math.min(BOX_PAD, w * 0.05)

/** 줄 글자 크기 (칸 높이 대비) */
export const FONT_SIZES: Record<TextSize, number> = { xs: 0.38, s: 0.5, m: 0.62 }
/** 네모칸 글자: 높이에 맞춘 크기에 곱하는 비율 */
const BOX_SCALE: Record<TextSize, number> = { xs: 0.5, s: 0.7, m: 1 }
export const fontSizeOf = (size?: TextSize) => FONT_SIZES[size ?? 'm']

/** 크기까지 반영한 글자 폭 (칸 단위) */
export function textWidth(text: string, bold = false, size?: TextSize, font?: FontKey) {
  return (measureText(text, bold, font) * fontSizeOf(size)) / FONT_SIZE
}

/** 네모칸 글자 크기: 칸 높이에 맞추고, 넓이를 넘으면 줄인다 */
export function boxFontSize(b: Pick<BoxEl, 'w' | 'h' | 'text' | 'bold' | 'size' | 'font'>) {
  const lines = boxLines(b.text)
  const pitch = boxLinePitch(b.h, lines.length)
  // 줄마다 칸 줄(pitch칸)에 맞추는 경우는 한 줄이 그 칸 높이에 맞게, 아니면 줄 수만큼 높이를 나눠 쓴다
  const byH = pitch
    ? pitch * 0.85 * BOX_SCALE[b.size ?? 'm']
    : (b.h * 0.85 * BOX_SCALE[b.size ?? 'm']) / (1 + (lines.length - 1) * BOX_LINE_GAP)
  const perUnit = Math.max(...lines.map((l) => measureText(l || '가', b.bold, b.font))) / FONT_SIZE
  const byW = (b.w - boxPad(b.w) * 2) / Math.max(perUnit, 0.01)
  return Math.max(0.3, Math.min(byH, byW))
}

/** 네모칸 줄 간격 (글자 크기 대비) */
export const BOX_LINE_GAP = 1.25
/** 네모칸 글자는 Shift+Enter로 줄을 바꿀 수 있다 */
export const boxLines = (text: string) => text.split('\n')

/**
 * 여러 줄이고 줄 수만큼 칸이 있으면, 한 줄이 차지할 칸 수 (칸 줄에 딱 맞춰 쓰기).
 * 예: 높이 2칸에 두 줄 → 1칸씩, 4칸에 두 줄 → 2칸씩. 칸이 모자라면 0 (글자 크기로 줄 간격을 정한다).
 */
export function boxLinePitch(h: number, n: number) {
  return n > 1 && n <= h ? Math.floor(h / n) : 0
}

/** 네모칸 여러 줄의 각 줄 가운데 y (네모칸 위 기준). fs: 실제 글자 크기(글씨체 배율 포함) */
export function boxLineYs(valign: TextVAlign | undefined, fs: number, h: number, n: number) {
  const pitch = boxLinePitch(h, n)
  if (pitch) {
    // 칸 줄에 맞춘다: 줄 묶음을 위·가운데·아래 칸에 놓고, 줄마다 자기 칸 가운데에
    const block = n * pitch
    const start = valign === 'top' ? 0 : valign === 'bottom' ? h - block : Math.floor((h - block) / 2)
    const mid = textMidY('middle', fs, pitch)
    return Array.from({ length: n }, (_, i) => start + i * pitch + mid)
  }
  const step = fs * BOX_LINE_GAP
  const block = fs + (n - 1) * step
  const mid = textMidY(valign, block, h)
  return Array.from({ length: n }, (_, i) => mid - ((n - 1) * step) / 2 + i * step)
}

export function distToDot(p: Pt) {
  return Math.hypot(p.x - Math.round(p.x), p.y - Math.round(p.y))
}

let ctx: CanvasRenderingContext2D | null = null
const cache = new Map<string, number>()

export function resetMeasureCache() {
  cache.clear()
  inkCache.clear()
}

/** 글자 폭 (칸 단위) */
/** 글자 폭 (칸 단위, 보통 크기 기준). 글씨체 배율까지 반영. */
export function measureText(text: string, bold = false, font?: FontKey): number {
  const f = fontOf(font)
  const key = f.key + (bold ? '|b|' : '|r|') + text
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  if (!ctx) ctx = document.createElement('canvas').getContext('2d')
  let w = text.length * FONT_SIZE
  if (ctx) {
    ctx.font = `100px ${f.family}`
    w = (ctx.measureText(text).width / 100) * FONT_SIZE * f.scale + (bold ? 0.04 : 0)
  }
  cache.set(key, w)
  return w
}

/** 글자가 차지하는 칸 수 */
export function textCells(text: string, bold = false, size?: TextSize, font?: FontKey) {
  return Math.max(1, Math.ceil(TEXT_PAD + textWidth(text, bold, size, font) - 0.05))
}

/** 줄 글자가 실제로 찍히는 위치: 차지한 칸(n칸) 안에서 왼쪽·가운데·오른쪽 */
export function textInk(el: Pick<TextEl, 'x' | 'text' | 'bold' | 'size' | 'align' | 'font'>) {
  const w = textWidth(el.text, el.bold, el.size, el.font)
  const n = textCells(el.text, el.bold, el.size, el.font)
  const { x, anchor } = textAnchor(el)
  const start = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x
  return { start, end: start + w, n, w }
}

const inkCache = new Map<string, number>()

/**
 * 글자 획이 글자 폭 가운데에서 얼마나 치우쳐 있는지 (보통 크기 기준, 칸 단위).
 * 예: 숫자 1은 획이 왼쪽에 몰려 있어서, 가운데 정렬할 때 이만큼 밀어야 눈으로 보기에 가운데다.
 */
export function inkShift(text: string, font?: FontKey, size?: TextSize) {
  const f = fontOf(font)
  const key = f.key + '|' + text
  let v = inkCache.get(key)
  if (v === undefined) {
    v = 0
    if (!ctx) ctx = document.createElement('canvas').getContext('2d')
    if (ctx) {
      ctx.font = `100px ${f.family}`
      const m = ctx.measureText(text)
      const inkCenter = (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2
      v = ((m.width / 2 - inkCenter) / 100) * FONT_SIZE * f.scale
    }
    inkCache.set(key, v)
  }
  return (v * fontSizeOf(size)) / FONT_SIZE
}

/**
 * 줄 글자를 그릴 위치. 가운데·오른쪽 정렬은 글자 폭을 재서 시작점을 계산하지 않고
 * 칸 중심(오른쪽 끝)에 바로 맞춘다 (글꼴이 늦게 불려 와 폭을 잘못 재도 어긋나지 않게).
 */
export function textAnchor(el: Pick<TextEl, 'x' | 'text' | 'bold' | 'size' | 'align' | 'font'>) {
  // 줄 글자의 양쪽 정렬은 차지한 칸이 곧 글자 폭이라 왼쪽과 같다
  const a = el.align === 'justify' ? 'left' : (el.align ?? 'left')
  if (a === 'left') return { x: el.x + TEXT_PAD, anchor: 'start' as const }
  const n = textCells(el.text, el.bold, el.size, el.font)
  if (a === 'right') return { x: el.x + n - TEXT_PAD, anchor: 'end' as const }
  return { x: el.x + n / 2 + inkShift(el.text, el.font, el.size), anchor: 'middle' as const }
}

/**
 * 글자 한가운데의 세로 위치 (칸·네모칸 위쪽 끝에서 잰 거리, 칸 단위).
 * fs: 실제 글자 크기(칸 단위), h: 칸이면 1, 네모칸이면 그 높이.
 */
export function textMidY(valign: TextVAlign | undefined, fs: number, h = 1) {
  const pad = h > 1 ? 0.15 : 0.06
  if (valign === 'top') return pad + fs / 2
  if (valign === 'bottom') return h - pad - fs / 2 + 0.03
  return h > 1 ? h / 2 + 0.04 * h : 0.52
}

export interface Box {
  x1: number
  y1: number
  x2: number
  y2: number
}

export function elBox(el: El): Box {
  if (el.type === 'box') return { x1: el.x, y1: el.y, x2: el.x + el.w, y2: el.y + el.h }
  if (el.type === 'bullet') return { x1: el.x, y1: el.y, x2: el.x + 1, y2: el.y + 1 }
  if (el.type === 'icon') return { x1: el.x, y1: el.y, x2: el.x + el.size, y2: el.y + el.size }
  if (el.type === 'mark') return { x1: el.x, y1: el.y, x2: el.x + el.w, y2: el.y + el.h }
  if (el.type === 'text') {
    const ink = textInk(el)
    return { x1: el.x, y1: el.y, x2: el.align && el.align !== 'left' && el.align !== 'justify' ? el.x + ink.n : ink.end, y2: el.y + 1 }
  }
  return {
    x1: Math.min(el.x1, el.x2),
    y1: Math.min(el.y1, el.y2),
    x2: Math.max(el.x1, el.x2),
    y2: Math.max(el.y1, el.y2),
  }
}

export function distToSegment(p: Pt, a: Pt, b: Pt) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

function hitLine(l: LineEl, p: Pt, tol: number) {
  return distToSegment(p, { x: l.x1, y: l.y1 }, { x: l.x2, y: l.y2 }) <= tol
}

function hitText(t: TextEl, p: Pt) {
  const b = elBox(t)
  return p.x >= b.x1 && p.x <= b.x2 + 0.1 && p.y >= b.y1 && p.y < b.y2
}

/**
 * 위에 그려진 것부터, 선택된 요소를 우선해서 찾는다.
 * 형광펜 칸은 글자를 쓰는 데 방해되지 않게 기본으로는 안 잡히고, withMarks일 때(지우개)만 맨 나중에 잡힌다.
 */
export function hitTest(els: El[], p: Pt, preferIds: string[] = [], withMarks = false): El | null {
  const marks = els.filter((e) => e.type === 'mark')
  if (marks.length) els = els.filter((e) => e.type !== 'mark')
  const found = hitTestInner(els, p, preferIds)
  if (found || !withMarks) return found
  return marks.find((m) => m.type === 'mark' && p.x >= m.x && p.x <= m.x + m.w && p.y >= m.y && p.y <= m.y + m.h) ?? null
}

function hitTestInner(els: El[], p: Pt, preferIds: string[]): El | null {
  const test = (el: El) =>
    el.type === 'line'
      ? hitLine(el, p, 0.28)
      : el.type === 'text'
        ? hitText(el, p)
        : el.type === 'bullet'
          ? Math.floor(p.x) === el.x && Math.floor(p.y) === el.y
          : el.type === 'icon'
            ? p.x >= el.x && p.x <= el.x + el.size && p.y >= el.y && p.y <= el.y + el.size
            : p.x >= el.x && p.x <= el.x + el.w && p.y >= el.y && p.y <= el.y + el.h
  for (let i = els.length - 1; i >= 0; i--) {
    if (preferIds.includes(els[i].id) && test(els[i])) return els[i]
  }
  for (let i = els.length - 1; i >= 0; i--) {
    if (test(els[i])) return els[i]
  }
  return null
}

/** 칸 (x, y)에 걸쳐 있는 글자 */
export function findTextAt(els: El[], x: number, y: number): TextEl | null {
  for (let i = els.length - 1; i >= 0; i--) {
    const el = els[i]
    if (el.type === 'text' && el.y === y && x >= el.x && x < el.x + textCells(el.text, el.bold, el.size, el.font)) return el
  }
  return null
}

/** 칸 (x, y)의 기호 */
export function findBulletAt(els: El[], x: number, y: number): BulletEl | null {
  for (let i = els.length - 1; i >= 0; i--) {
    const el = els[i]
    if (el.type === 'bullet' && el.x === x && el.y === y) return el
  }
  return null
}

/** 기호 바로 오른쪽 칸에서 시작하는 글자 = 그 기호의 항목 */
export function itemTextOf(els: El[], b: BulletEl): TextEl | null {
  for (const el of els) if (el.type === 'text' && el.y === b.y && el.x === b.x + 1) return el
  return null
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** 가장 가까운 점 (가장자리 바깥 줄에는 점이 없다) */
export function nearestDot(p: Pt, cols: number, rows: number): Pt {
  return { x: clamp(Math.round(p.x), 1, cols - 1), y: clamp(Math.round(p.y), 1, rows - 1) }
}

/** 선은 가로 또는 세로만. 끄는 방향 중 더 많이 움직인 쪽으로 고정하고, 끝점은 손을 따라 부드럽게 움직인다. */
export function axisEnd(a: Pt, p: Pt, cols: number, rows: number): Pt {
  if (Math.abs(p.x - a.x) >= Math.abs(p.y - a.y)) return { x: clamp(p.x, 1, cols - 1), y: a.y }
  return { x: a.x, y: clamp(p.y, 1, rows - 1) }
}

/** 영역 선택: 사각형에 조금이라도 걸치면 고른다 */
export function boxTouches(a: Box, b: Box) {
  return a.x1 <= b.x2 && a.x2 >= b.x1 && a.y1 <= b.y2 && a.y2 >= b.y1
}

export function boxInside(inner: Box, outer: Box) {
  return inner.x1 >= outer.x1 - 0.01 && inner.y1 >= outer.y1 - 0.01 && inner.x2 <= outer.x2 + 0.01 && inner.y2 <= outer.y2 + 0.01
}

export function translate(el: El, dx: number, dy: number): El {
  if (el.type !== 'line') return { ...el, x: el.x + dx, y: el.y + dy }
  return { ...el, x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy }
}
