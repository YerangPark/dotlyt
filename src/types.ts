export type NotebookSize = 'pocket' | 'paperback' | 'medium' | 'composition'

/** 실제 불렛저널 규격 (Leuchtturm1917 기준), 도트 간격 5mm */
export const SIZES: Record<NotebookSize, { label: string; mm: string; cols: number; rows: number }> = {
  pocket: { label: 'Pocket (A6)', mm: '90 × 150', cols: 18, rows: 30 },
  paperback: { label: 'Paperback (B6+)', mm: '125 × 190', cols: 25, rows: 38 },
  medium: { label: 'Medium (A5)', mm: '145 × 210', cols: 29, rows: 42 },
  composition: { label: 'Composition (B5)', mm: '178 × 254', cols: 35, rows: 50 },
}

export const SIZE_ORDER: NotebookSize[] = ['pocket', 'paperback', 'medium', 'composition']

export const COVERS = [
  { name: '블랙', color: '#1f1f1f' },
  { name: '네이비', color: '#1e2a44' },
  { name: '에메랄드', color: '#1f5c4d' },
  { name: '버건디', color: '#6b1f2a' },
  { name: '머스타드', color: '#c9962b' },
  { name: '세이지', color: '#9aaa8c' },
  { name: '파우더 핑크', color: '#e8c4c0' },
  { name: '스카이 블루', color: '#a9c7e0' },
]

export const INK_COLORS = [
  { name: '먹색', color: '#2b2a28' },
  { name: '파랑', color: '#2f5d9e' },
  { name: '빨강', color: '#c2412d' },
  { name: '초록', color: '#2e7d5b' },
]

export interface Notebook {
  name: string
  size: NotebookSize
  cover: string
}

/** 좌표는 모두 격자 칸 단위. 글자는 칸 (x, y)에서 시작, 선은 점 (x1,y1)–(x2,y2)을 잇는다. */
export interface TextEl {
  id: string
  type: 'text'
  x: number
  y: number
  text: string
  bold?: boolean
}

export type PenType = 'ballpoint' | 'pencil'

export interface LineEl {
  id: string
  type: 'line'
  x1: number
  y1: number
  x2: number
  y2: number
  width: 1 | 2
  dash: boolean
  color: string
  /** 없으면 볼펜 (예전 데이터) */
  pen?: PenType
}

/** 칸 중앙에서 끌어 만든 네모칸. 글자는 칸 높이에 맞춰 크게 쓴다. */
export interface BoxEl {
  id: string
  type: 'box'
  x: number
  y: number
  w: number
  h: number
  text: string
  bold?: boolean
}

/** 불렛저널 기호: 할 일 •, 완료 ×, 미룸 >, 일정으로 옮김 <, 일정 ○, 메모 – */
export type BulletState = 'task' | 'done' | 'migrated' | 'scheduled' | 'event' | 'note'

export interface BulletEl {
  id: string
  type: 'bullet'
  x: number
  y: number
  state: BulletState
  /** 취소: 기호는 그대로, 오른쪽 글자에 취소선 */
  cancelled: boolean
}

export type El = TextEl | LineEl | BoxEl | BulletEl

/** 인덱스 스티커: 노트 오른쪽 가장자리에 붙는 탭 */
export interface IndexTab {
  name: string
  color: string
  order: number
}

export interface Page {
  id: string
  cols: number
  rows: number
  elements: El[]
  index?: IndexTab | null
  createdAt: number
  updatedAt: number
}

export interface Pt {
  x: number
  y: number
}

/** 밝은 표지에서는 글자를 어둡게 */
export function isLight(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return 0.299 * r + 0.587 * g + 0.114 * b > 150
}
