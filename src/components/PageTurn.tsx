import { useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Page } from '../types'
import { PageThumb } from './PagesOverview'
import { useStore } from '../store'

export interface Turn {
  key: number
  dir: 1 | -1
  /** 넘기기 전 보이던 페이지 (펼침면이면 [왼쪽, 오른쪽]) */
  from: Page[]
  /** 넘긴 뒤 보이는 페이지 */
  to: Page[]
  spread: boolean
}

type R = { left: number; top: number; width: number; height: number }

/**
 * 페이지 자리를 노트 기준 좌표로 잰다. 노트가 크기를 바꾸며 움직이는 중(transform)이어도
 * 같은 비율로 나눠서 노트 안 좌표를 구하므로, 넘기는 장이 노트와 함께 움직인다.
 */
const rectIn = (host: HTMLElement, id: string): R | null => {
  const el = document.querySelector<SVGSVGElement>(`.page-svg[data-page-id="${id}"]`)
  if (!el) return null
  const h = host.getBoundingClientRect()
  // 크기 변화는 가로·세로 비율이 다를 수 있다
  const kx = host.offsetWidth ? h.width / host.offsetWidth : 1
  const ky = host.offsetHeight ? h.height / host.offsetHeight : 1
  const r = el.getBoundingClientRect()
  return { left: (r.left - h.left) / kx, top: (r.top - h.top) / ky, width: r.width / kx, height: r.height / ky }
}

/**
 * 페이지 넘기기: 책장 한 장이 책등을 축으로 넘어간다.
 * - 펼침면 다음: 오른쪽 장(앞면 = 지난 오른쪽, 뒷면 = 새 왼쪽)이 왼쪽으로 넘어가고, 반쯤 넘어갈 때까지 아래에 지난 왼쪽이 보인다.
 * - 펼침면 이전: 거꾸로.
 * - 한 장씩 보기: 지난 장이 왼쪽으로 넘어가거나(다음), 새 장이 왼쪽에서 넘어온다(이전).
 * 실제 페이지는 이미 새 페이지로 바뀌어 있고, 그 위에 미리보기로 그린 종이를 잠깐 얹는다.
 * 노트 요소 안에 그려서, 넘기며 노트 크기가 바뀌어도(부드럽게 커지고 작아짐) 함께 움직인다.
 */
export function PageTurn({ turn, host, onDone }: { turn: Turn; host: HTMLElement; onDone: () => void }) {
  const [slots, setSlots] = useState<R[] | null>(null)
  const pages = useStore((s) => s.pages)
  const noOf = (p: Page) => pages.findIndex((x) => x.id === p.id) + 1

  useLayoutEffect(() => {
    const rs = turn.to.map((p) => rectIn(host, p.id))
    if (rs.some((r) => !r)) return onDone()
    setSlots(rs as R[])
    // 애니메이션 끝 이벤트를 못 받는 경우(탭이 가려짐 등)에도 반드시 걷어낸다
    const t = window.setTimeout(onDone, 900)
    return () => window.clearTimeout(t)
  }, [turn, host, onDone])

  if (!slots) return null
  const thumb = (p: Page | undefined) =>
    p ? <PageThumb page={p} no={noOf(p)} /> : <div className="turn-blank" />

  if (turn.spread && slots.length === 2) {
    const [L, Rr] = slots
    const next = turn.dir === 1
    // 넘어가는 장: 다음이면 오른쪽 자리에서 시작, 이전이면 왼쪽 자리에서 시작
    const leaf = next ? Rr : L
    const under = next ? L : Rr
    const front = next ? turn.from[1] : turn.from[0]
    const back = next ? turn.to[0] : turn.to[1]
    const underPage = next ? turn.from[0] : turn.from[1]
    const box = { left: L.left, top: Math.min(L.top, Rr.top), width: Rr.left + Rr.width - L.left, height: Math.max(L.height, Rr.height) }
    return createPortal(
      <div className="page-turn" style={{ ...box, perspectiveOrigin: `${Rr.left - L.left}px 50%` }} aria-hidden>
        <div className={'turn-under ' + (next ? 'pg-left' : 'pg-right')} style={{ left: under.left - box.left, top: under.top - box.top, width: under.width, height: under.height }}>
          {thumb(underPage)}
        </div>
        <div
          className={'turn-leaf ' + (next ? 'to-left' : 'to-right')}
          style={{ left: leaf.left - box.left, top: leaf.top - box.top, width: leaf.width, height: leaf.height }}
          onAnimationEnd={(e) => e.target === e.currentTarget && onDone()}
        >
          <div className={'turn-face front ' + (next ? 'pg-right' : 'pg-left')}>{thumb(front)}</div>
          <div className={'turn-face back ' + (next ? 'pg-left' : 'pg-right')}>{thumb(back)}</div>
        </div>
      </div>,
      host,
    )
  }

  // 한 장씩 보기
  const S = slots[0]
  const next = turn.dir === 1
  return createPortal(
    <div className="page-turn" style={{ left: S.left, top: S.top, width: S.width, height: S.height }} aria-hidden>
      {!next && (
        <div className="turn-under pg-single" style={{ left: 0, top: 0, width: S.width, height: S.height }}>
          {thumb(turn.from[0])}
        </div>
      )}
      <div
        className={'turn-leaf single ' + (next ? 'out' : 'in')}
        style={{ left: 0, top: 0, width: S.width, height: S.height }}
        onAnimationEnd={(e) => e.target === e.currentTarget && onDone()}
      >
        <div className="turn-face front pg-single">{thumb(next ? turn.from[0] : turn.to[0])}</div>
      </div>
    </div>,
    host,
  )
}
