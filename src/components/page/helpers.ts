import { useEffect, useRef, useState } from 'react'
import { textMidY } from '../../geometry'
import type { Pt, TextVAlign } from '../../types'

export function cellOf(p: Pt, cols: number, rows: number): Pt {
  return { x: Math.max(0, Math.min(cols - 1, Math.floor(p.x))), y: Math.max(0, Math.min(rows - 1, Math.floor(p.y))) }
}

/**
 * 형광펜: 화면 좌표 a→b를 촘촘히 훑어, 지나간 칸을 페이지별로 모은다 (펼침면 양쪽 페이지에 걸쳐 칠할 수 있게).
 * 칸은 "x,y" 문자열.
 */
export function addPaintCells(prev: Record<string, string[]>, a: Pt, b: Pt): Record<string, string[]> {
  const svgs = [...document.querySelectorAll<SVGSVGElement>('.page-svg')].map((svg) => ({
    id: svg.dataset.pageId!,
    side: svg.closest('.page-wrap.left') ? 'left' : svg.closest('.page-wrap.right') ? 'right' : 'single',
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
  // 펼침면 양쪽에 걸쳐 칠하면 선처럼 가운데 접히는 곳은 비운다: 왼쪽 페이지 맨 오른쪽 칸, 오른쪽 페이지 맨 왼쪽 칸은 칠하지 않는다
  const ids = Object.keys(next).filter((id) => next[id].size)
  if (ids.length === 2) {
    for (const sv of svgs) {
      const set = next[sv.id]
      if (!set) continue
      const edge = sv.side === 'left' ? sv.cols - 1 : sv.side === 'right' ? 0 : -1
      for (const k of [...set]) if (+k.split(',')[0] === edge) set.delete(k)
    }
  }
  return Object.fromEntries(Object.entries(next).map(([id, set]) => [id, [...set]]))
}

/** 입력칸 안에서 글자 세로 위치: 가운데면 줄 높이로, 위·아래면 위쪽 여백으로 맞춘다 */
export function vPlace(valign: TextVAlign | undefined, fs: number, h: number, cell: number): React.CSSProperties {
  if (!valign || valign === 'middle') return { lineHeight: `${h * cell}px`, paddingTop: 0, paddingBottom: 0 }
  const lh = fs * 1.25 * cell
  return { lineHeight: `${lh}px`, paddingTop: Math.max(0, textMidY(valign, fs, h) * cell - lh / 2), paddingBottom: 0 }
}

/**
 * 닫힐 때 애니메이션용: value가 null이 되어도 ms 동안 마지막 값을 그대로 두고 leaving=true.
 * (팝업이 바로 사라지지 않고 스르륵 닫히게)
 */
export function useLinger<T>(value: T | null, ms = 130): { value: T | null; leaving: boolean } {
  const last = useRef<T | null>(value)
  if (value !== null) last.current = value
  const open = value !== null
  const [leaving, setLeaving] = useState(false)
  const wasOpen = useRef(open)
  useEffect(() => {
    if (open) {
      wasOpen.current = true
      setLeaving(false)
      return
    }
    if (!wasOpen.current) return
    wasOpen.current = false
    setLeaving(true)
    const t = window.setTimeout(() => setLeaving(false), ms)
    return () => window.clearTimeout(t)
  }, [open, ms])
  if (open) return { value, leaving: false }
  return leaving ? { value: last.current, leaving: true } : { value: null, leaving: false }
}
