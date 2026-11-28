export type NotebookSize = 'pocket' | 'paperback' | 'medium' | 'composition'

/** 실제 불렛저널 규격 (Leuchtturm1917 기준), 도트 간격 5mm */
/**
 * cols·rows: 종이 전체 칸 수. 점은 가장자리에서 한 칸 안쪽부터 찍혀서, 점 안쪽 격자는 (cols − 2) × (rows − 2)칸.
 * 점 안쪽 격자가 5mm 칸으로 센 크기(예: A6 18 × 30)가 되도록 가장자리 한 칸씩을 더했다.
 */
export const SIZES: Record<NotebookSize, { label: string; mm: string; cols: number; rows: number }> = {
  pocket: { label: 'Pocket (A6)', mm: '90 × 150', cols: 20, rows: 32 },
  paperback: { label: 'Paperback (B6+)', mm: '125 × 190', cols: 27, rows: 40 },
  medium: { label: 'Medium (A5)', mm: '145 × 210', cols: 31, rows: 44 },
  composition: { label: 'Composition (B5)', mm: '178 × 254', cols: 37, rows: 52 },
}

/** 예전 규격(종이 전체를 5mm 칸으로 센 것) → 점 안쪽이 그만큼 되게 가장자리 한 칸씩 늘린다 */
export const OLD_PAGE_SIZES = ['18x30', '25x38', '29x42', '35x50']

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

/** 인덱스 스티커 색: 서비스 컬러웨이(마커 오렌지 + 스티커 색 + 잉크색) */
export const STICKER_COLORS = [
  // 먼지 낀 파스텔: 회색이 살짝 섞여 크림 종이와 어울리는 차분한 색
  { name: '로즈', color: '#d9a39b' },
  { name: '살구', color: '#e6bd94' },
  { name: '머스터드', color: '#d9c78f' },
  { name: '세이지', color: '#a9c3a1' },
  { name: '더스티 블루', color: '#a0bccc' },
  { name: '라벤더', color: '#b9acca' },
  { name: '오트', color: '#d3ccc1' },
  { name: '스톤', color: '#7f7a74' },
]

/** 예전 쨍한 스티커 색 → 비슷한 새 색 (불러올 때 바꿔 준다) */
export const OLD_STICKER_COLORS: Record<string, string> = {
  '#ff6f1e': '#e6bd94',
  '#ce500a': '#d9a39b',
  '#3b82f6': '#a0bccc',
  '#ff66cf': '#d9a39b',
  '#22c55e': '#a9c3a1',
  '#f7efe9': '#d3ccc1',
  '#2b1a07': '#7f7a74',
  '#171717': '#7f7a74',
}

/** 형광펜 색 */
export const HIGHLIGHT_COLORS = [
  { name: '노랑', color: '#ffe066' },
  { name: '분홍', color: '#ffb3c7' },
  { name: '초록', color: '#b6e3a8' },
  { name: '하늘', color: '#a6d8f5' },
  { name: '주황', color: '#ffc78a' },
  { name: '보라', color: '#d4c1f2' },
  { name: '회색', color: '#d6d3cf' },
]

export const INK_COLORS = [
  { name: '먹색', color: '#2b2a28' },
  { name: '파랑', color: '#2f5d9e' },
  { name: '빨강', color: '#c2412d' },
  { name: '초록', color: '#2e7d5b' },
  { name: '회색', color: '#8a8781' },
]

export interface Notebook {
  name: string
  size: NotebookSize
  cover: string
}

/** 좌표는 모두 격자 칸 단위. 글자는 칸 (x, y)에서 시작, 선은 점 (x1,y1)–(x2,y2)을 잇는다. */
import type { FontKey } from './fonts'

/** 글자 크기: 아주 작게, 작게, 보통 (없으면 보통) */
export type TextSize = 'xs' | 's' | 'm'
/** justify(양쪽): 네모칸 줄마다 네모칸 폭에 맞춰 글자 사이를 벌린다. 줄 글자는 왼쪽과 같다 */
export type TextAlign = 'left' | 'center' | 'right' | 'justify'
/** 세로 정렬: 줄 글자는 자기 칸 안에서, 네모칸 글자는 네모칸 안에서 */
export type TextVAlign = 'top' | 'middle' | 'bottom'

export interface TextEl {
  id: string
  type: 'text'
  x: number
  y: number
  text: string
  bold?: boolean
  size?: TextSize
  /** 글씨체 (없으면 기본 글씨체) */
  font?: FontKey
  /** 글자가 차지한 칸들 안에서의 정렬 (칸 하나에 숫자를 가운데 쓰는 용도) */
  align?: TextAlign
  valign?: TextVAlign
  /** 글자 색 (없으면 먹색) */
  color?: string
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
  /** 두 줄 (나란한 선 두 개) */
  double?: boolean
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
  /** 네모칸 높이에 맞춘 크기에 곱하는 비율 */
  size?: TextSize
  font?: FontKey
  align?: TextAlign
  valign?: TextVAlign
  /** 글자 색 (없으면 먹색) */
  color?: string
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
  /** 기호 색 (넣을 때 고른 펜 색). 없으면 먹색 */
  color?: string
}

/** 단색 선 아이콘 (해, 달, 밥 등). size칸 × size칸 */
export interface IconEl {
  id: string
  type: 'icon'
  x: number
  y: number
  icon: string
  size: 1 | 2 | 3
  color: string
}

/** 형광펜으로 칠한 칸들 (한 줄에서 이어진 칸을 하나로 묶어 저장). 글자 뒤에 깔린다. */
export interface MarkEl {
  id: string
  type: 'mark'
  x: number
  y: number
  w: number
  h: number
  color: string
}

export type El = TextEl | LineEl | BoxEl | BulletEl | IconEl | MarkEl

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

/** 템플릿: 페이지(한 장 또는 펼침면 두 장)의 내용을 저장해 두고 새 페이지에 다시 쓰기 */
export interface Template {
  id: string
  name: string
  pages: { cols: number; rows: number; elements: El[] }[]
  createdAt: number
}
