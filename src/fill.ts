import { textCells } from './geometry'
import { uid } from './store'
import type { El, Page, Pt } from './types'

/**
 * 엑셀처럼 숫자 이어 쓰기: 숫자가 든 글자(또는 네모칸)를 Shift를 누른 채 끌면 그 방향으로 한 칸씩 1, 2, 3…
 * 오른쪽·아래로 끌면 커지고, 왼쪽·위로 끌면 작아진다. 글자 모양(글씨체·크기·굵기·색·정렬)은 처음 것을 그대로 따른다.
 */

type Fillable = Extract<El, { type: 'text' | 'box' }>

/** 글자 안의 마지막 숫자 (앞뒤 글자는 그대로 둔다: "1일" → "2일", "Day 01" → "Day 02") */
const NUM = /(-?\d+)(?!.*\d)/

export function fillSource(el: El | null | undefined): Fillable | null {
  if (!el || (el.type !== 'text' && el.type !== 'box')) return null
  return NUM.test(el.text) ? el : null
}

function nthText(text: string, k: number): string {
  return text.replace(NUM, (m) => {
    const v = parseInt(m, 10) + k
    // 01, 02…처럼 앞에 0을 붙여 쓴 건 자릿수를 지킨다
    const digits = m.replace('-', '').length
    const pad = m.replace('-', '').startsWith('0') && digits > 1 ? digits : 0
    const s = String(Math.abs(v)).padStart(pad, '0')
    return (v < 0 ? '-' : '') + s
  })
}

const widthOf = (el: Fillable, text: string) => (el.type === 'box' ? el.w : textCells(text, el.bold, el.size, el.font))

/**
 * 시작한 칸(start)에서 지금 칸(p)까지 끈 만큼 이어 쓸 것들. 더 많이 움직인 방향(가로·세로)으로만, 페이지 밖은 뺀다.
 * 한 칸 간격(stride)은 가로면 이어 쓸 숫자 중 가장 넓은 것, 세로면 높이(글자 1칸, 네모칸은 높이).
 */
export function seriesFor(src: Fillable, start: Pt, p: Pt, page: Pick<Page, 'cols' | 'rows'>): El[] {
  const dx = p.x - start.x
  const dy = p.y - start.y
  const horizontal = Math.abs(dx) >= Math.abs(dy)
  const delta = horizontal ? dx : dy
  const sign = delta < 0 ? -1 : 1
  const h = src.type === 'box' ? src.h : 1
  // 넉넉히 셀 개수를 먼저 정하고 (가장 넓은 숫자로 간격), 그 간격으로 몇 개가 들어가는지
  const guess = Math.max(0, Math.floor(Math.abs(delta) / (horizontal ? widthOf(src, src.text) : h) + 0.5))
  if (!guess) return []
  const texts = Array.from({ length: guess }, (_, i) => nthText(src.text, (i + 1) * sign))
  const stride = horizontal ? Math.max(widthOf(src, src.text), ...texts.map((t) => widthOf(src, t))) : h
  const n = Math.max(0, Math.floor(Math.abs(delta) / stride + 0.5))
  const out: El[] = []
  for (let k = 1; k <= n; k++) {
    const text = nthText(src.text, k * sign)
    const x = src.x + (horizontal ? k * sign * stride : 0)
    const y = src.y + (horizontal ? 0 : k * sign * h)
    const w = widthOf(src, text)
    if (x < 0 || y < 0 || x + w > page.cols || y + h > page.rows) break
    out.push({ ...src, id: uid(), x, y, text } as El)
  }
  return out
}
