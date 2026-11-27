import { elBox, translate } from './geometry'
import type { El, Page } from './types'

export interface Placement {
  el: El
  from: string
  to: string
}

/**
 * 불러올 때 쓰는 가벼운 보정: 시작 칸만 페이지 안으로.
 * 줄 글자 폭은 글씨체가 아직 안 불러와졌으면 다른 글씨체로 재져서 틀리므로, 폭으로는 밀지 않는다
 * (예전엔 여기서 오른쪽 끝 글자가 저장·불러오기마다 한 칸씩 왼쪽으로 밀렸다).
 */
export function clampStart(el: El, page: Pick<Page, 'cols' | 'rows'>): El {
  if (el.type !== 'text') return clampInto(el, page)
  const x = Math.max(0, Math.min(page.cols - 1, el.x))
  const y = Math.max(0, Math.min(page.rows - 1, el.y))
  return x !== el.x || y !== el.y ? { ...el, x, y } : el
}

/** 항목이 페이지 안에 다 보이도록 밀어 넣는다 (선은 점 위에, 나머지는 칸 안에) */
export function clampInto(el: El, page: Pick<Page, 'cols' | 'rows'>): El {
  const b = elBox(el)
  const lo = el.type === 'line' ? 1 : 0
  const hiX = el.type === 'line' ? page.cols - 1 : page.cols
  const hiY = el.type === 'line' ? page.rows - 1 : page.rows
  let dx = 0
  let dy = 0
  if (b.x1 < lo) dx = lo - b.x1
  else if (b.x2 > hiX) dx = Math.max(lo - b.x1, Math.floor(hiX - b.x2))
  if (b.y1 < lo) dy = lo - b.y1
  else if (b.y2 > hiY) dy = Math.max(lo - b.y1, Math.floor(hiY - b.y2))
  dx = Math.round(dx)
  dy = Math.round(dy)
  return dx || dy ? translate(el, dx, dy) : el
}

/**
 * 고른 항목들을 화면에서 (dxPx, dyPx)만큼 옮겼을 때 놓일 자리.
 * 항목 가운데가 올라간 페이지로 넘어가고(펼침면의 왼쪽 ↔ 오른쪽), 칸에 맞춰지며, 페이지 밖으로 나가지 않는다.
 */
export function placeSelection(pages: Page[], selection: string[], dxPx: number, dyPx: number): Placement[] {
  const svgs = [...document.querySelectorAll<SVGSVGElement>('.page-svg')]
    .map((svg) => ({ id: svg.dataset.pageId!, r: svg.getBoundingClientRect(), page: pages.find((p) => p.id === svg.dataset.pageId) }))
    .filter((s): s is { id: string; r: DOMRect; page: Page } => !!s.page)
  const out: Placement[] = []
  for (const s of svgs) {
    const cell = s.r.width / s.page.cols
    for (const el of s.page.elements) {
      if (!selection.includes(el.id)) continue
      const b = elBox(el)
      const cx = s.r.left + ((b.x1 + b.x2) / 2) * cell + dxPx
      // 가운데가 올라간 페이지, 없으면(가운데 접히는 곳 등) 가로로 가장 가까운 페이지
      const t =
        svgs.find((o) => cx >= o.r.left && cx <= o.r.right) ??
        svgs.reduce((best, o) =>
          Math.min(Math.abs(cx - o.r.left), Math.abs(cx - o.r.right)) <
          Math.min(Math.abs(cx - best.r.left), Math.abs(cx - best.r.right))
            ? o
            : best,
        )
      const tc = t.r.width / t.page.cols
      const ox = el.type === 'line' ? el.x1 : el.x
      const oy = el.type === 'line' ? el.y1 : el.y
      const nx = Math.round((s.r.left + ox * cell + dxPx - t.r.left) / tc)
      const ny = Math.round((s.r.top + oy * cell + dyPx - t.r.top) / tc)
      out.push({ el: translate(el, nx - ox, ny - oy), from: s.id, to: t.id })
    }
  }
  // 같은 페이지로 가는 것들은 한 묶음으로, 묶음 전체가 페이지 안에 들어오게 같이 민다 (서로 겹치지 않게)
  for (const t of svgs) {
    const group = out.filter((pl) => pl.to === t.id)
    if (!group.length) continue
    const fitted = clampGroup(
      group.map((pl) => pl.el),
      t.page,
    )
    group.forEach((pl, i) => (pl.el = fitted[i]))
  }
  return out
}

/** 여러 항목을 한 묶음으로, 배치를 지킨 채 페이지 안에 들어오게 같이 민다. 묶음이 페이지보다 크면 각자 안쪽으로. */
export function clampGroup(els: El[], page: Pick<Page, 'cols' | 'rows'>): El[] {
  if (!els.length) return els
  const boxes = els.map((e) => elBox(e))
  const hasLine = els.some((e) => e.type === 'line')
  const lo = hasLine ? 1 : 0
  const hiX = hasLine ? page.cols - 1 : page.cols
  const hiY = hasLine ? page.rows - 1 : page.rows
  const x1 = Math.min(...boxes.map((b) => b.x1))
  const x2 = Math.max(...boxes.map((b) => b.x2))
  const y1 = Math.min(...boxes.map((b) => b.y1))
  const y2 = Math.max(...boxes.map((b) => b.y2))
  const dx = x1 < lo ? Math.ceil(lo - x1) : x2 > hiX ? Math.max(Math.ceil(lo - x1), Math.floor(hiX - x2)) : 0
  const dy = y1 < lo ? Math.ceil(lo - y1) : y2 > hiY ? Math.max(Math.ceil(lo - y1), Math.floor(hiY - y2)) : 0
  return els.map((e) => clampInto(dx || dy ? translate(e, dx, dy) : e, page))
}
