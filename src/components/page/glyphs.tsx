import { BOX_PAD, FONT_SIZE, boxFontSize, boxLineYs, boxLines, itemTextOf, measureText, textInk } from '../../geometry'
import { fontOf } from '../../fonts'
import { iconOf } from '../../icons'
import { strokePaths } from '../../ink'
import { useStore } from '../../store'
import type { BoxEl, BulletEl, BulletState, El, IconEl, LineEl, MarkEl, Pt } from '../../types'

export function InkLine({ line, filterId, live }: { line: LineEl; filterId: string; live?: boolean }) {
  const pen = line.pen ?? 'ballpoint'
  const paths = strokePaths(line.x1, line.y1, line.x2, line.y2, {
    width: line.width,
    dash: line.dash,
    double: line.double,
    pen,
    seed: line.id,
    settle: !live,
  })
  return (
    <g
      fill={line.color}
      filter={pen === 'pencil' ? `url(#${filterId})` : undefined}
      opacity={pen === 'pencil' ? 0.82 : 0.94}
    >
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </g>
  )
}

/** 긋는 동안: 펜 끝을 따라 선이 쓱 늘어난다 */
export function LivePreview({ drag, filterId }: { drag: { a: Pt; b: Pt; id: string }; filterId: string }) {
  const style = useStore((s) => s.lineStyle)
  const line: LineEl = { id: drag.id, type: 'line', x1: drag.a.x, y1: drag.a.y, x2: drag.b.x, y2: drag.b.y, ...style }
  const end = { x: Math.round(drag.b.x), y: Math.round(drag.b.y) }
  return (
    <>
      <InkLine line={line} filterId={filterId} live />
      <circle cx={end.x} cy={end.y} r={0.13} className="snap-dot" />
    </>
  )
}

export const INK = '#2b2a28'

/** 불렛 기호 하나. 펜으로 찍은 것처럼 약간 두툼하게. */
export function Glyph({ state, cx, cy, color = INK }: { state: BulletState; cx: number; cy: number; color?: string }) {
  const sw = 0.075
  switch (state) {
    case 'task':
      return <circle cx={cx} cy={cy} r={0.105} fill={color} />
    case 'done':
      return (
        <g stroke={color} strokeWidth={sw} strokeLinecap="round">
          <line x1={cx - 0.19} y1={cy - 0.19} x2={cx + 0.19} y2={cy + 0.19} />
          <line x1={cx + 0.19} y1={cy - 0.19} x2={cx - 0.19} y2={cy + 0.19} />
        </g>
      )
    case 'migrated':
      return (
        <polyline
          points={`${cx - 0.1},${cy - 0.2} ${cx + 0.13},${cy} ${cx - 0.1},${cy + 0.2}`}
          fill="none"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )
    case 'scheduled':
      return (
        <polyline
          points={`${cx + 0.1},${cy - 0.2} ${cx - 0.13},${cy} ${cx + 0.1},${cy + 0.2}`}
          fill="none"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )
    case 'event':
      return <circle cx={cx} cy={cy} r={0.17} fill="none" stroke={color} strokeWidth={0.065} />
    case 'note':
      return <line x1={cx - 0.17} y1={cy} x2={cx + 0.17} y2={cy} stroke={color} strokeWidth={sw} strokeLinecap="round" />
  }
}

export function BulletGlyph({ b, elements }: { b: BulletEl; elements: El[] }) {
  const item = b.cancelled ? itemTextOf(elements, b) : null
  const strike = item
    ? strokePaths(textInk(item).start - 0.1, item.y + 0.55, textInk(item).end + 0.12, item.y + 0.5, {
        width: 1,
        dash: false,
        pen: 'ballpoint',
        seed: b.id + 'strike',
      })
    : []
  return (
    <g>
      <Glyph state={b.state} cx={b.x + 0.5} cy={b.y + 0.52} color={b.color ?? INK} />
      {strike.map((d, i) => (
        <path key={i} d={d} fill={b.color ?? INK} opacity={0.9} />
      ))}
    </g>
  )
}

/** 글꼴에 굵은 굵기가 없어서, 획 바깥에 같은 색 외곽선을 둘러 굵게 보이게 한다 */
export const BOLD_STROKE = 0.04

export function boldProps(bold?: boolean, scale = 1, color = INK) {
  return bold ? { stroke: color, strokeWidth: BOLD_STROKE * scale, paintOrder: 'stroke' as const, strokeLinejoin: 'round' as const } : {}
}

export function boldCss(bold: boolean, cell: number, scale = 1, color = INK): React.CSSProperties {
  return bold ? { WebkitTextStroke: `${BOLD_STROKE * cell * scale}px ${color}`, paintOrder: 'stroke' } : {}
}

/** 단색 선 아이콘 하나. 칸을 꽉 채우지 않게 둘레를 넉넉히 띄워 그린다 (1칸이면 칸의 6할 남짓) */
export function IconGlyph({ el }: { el: IconEl }) {
  const pad = 0.14 + 0.04 * el.size
  const k = (el.size - pad * 2) / 24
  return (
    <g transform={`translate(${el.x + pad} ${el.y + pad}) scale(${k})`}>
      <path
        d={iconOf(el.icon).d}
        fill="none"
        stroke={el.color}
        // 가는 펜으로 그린 듯 얇게. 크게 넣을수록 선도 같이 커지니 더 얇게
        strokeWidth={el.size === 1 ? 1.8 : el.size === 2 ? 1.4 : 1.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  )
}

/** 네모칸 글자: 여러 줄이면 줄마다 tspan. 페이지와 미리보기가 같이 쓴다. */
export function BoxText({ el, hidden }: { el: BoxEl; hidden?: boolean }) {
  const f = fontOf(el.font)
  const fs = boxFontSize(el) * f.scale
  const lines = boxLines(el.text)
  const ys = boxLineYs(el.valign, fs, el.h, lines.length)
  const x = el.align === 'center' ? el.x + el.w / 2 : el.align === 'right' ? el.x + el.w - BOX_PAD : el.x + BOX_PAD
  // 양쪽 정렬: 줄마다 낱말 사이(띄어쓰기)를 벌려 네모칸 안쪽 폭에 맞춘다. 띄어쓰기 없는 줄은 왼쪽 (쓰는 중 입력칸과 같게)
  const justify = el.align === 'justify'
  const inner = el.w - BOX_PAD * 2
  const wordGap = (line: string) => {
    const spaces = (line.trim().match(/ /g) ?? []).length
    if (!justify || !spaces) return undefined
    const w = (measureText(line.trim(), el.bold, el.font) * boxFontSize(el)) / FONT_SIZE
    const gap = (inner - w) / spaces
    return gap > 0 ? gap : undefined
  }
  return (
    <text
      textAnchor={el.align === 'center' ? 'middle' : el.align === 'right' ? 'end' : 'start'}
      dominantBaseline="central"
      fontSize={fs}
      fontFamily={f.family}
      {...boldProps(el.bold, fs / FONT_SIZE, el.color)}
      className="ink-text"
      style={el.color ? { fill: el.color } : undefined}
      visibility={hidden ? 'hidden' : undefined}
      xmlSpace="preserve"
    >
      {lines.map((line, i) => (
        <tspan
          key={i}
          x={x}
          y={el.y + ys[i]}
          wordSpacing={wordGap(line)}
        >
          {line}
        </tspan>
      ))}
    </text>
  )
}

/** 요소 id로 고정되는 작은 난수 (형광펜 끝 모양이 다시 그려도 같게) */
function seeded(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return () => {
    h ^= h << 13
    h ^= h >>> 17
    h ^= h << 5
    return ((h >>> 0) % 10000) / 10000
  }
}

/** 형광펜 띠 높이: 칸 위·아래로 이만큼 비운다 (글자 아래쪽에 깔리게 아래를 덜 비운다) */
const MARK_TOP = 0.3
const MARK_BOTTOM = 0.08

/**
 * 형광펜: 칸을 꽉 채우지 않고 마커로 그은 띠처럼.
 * 가로로 칠한 줄은 칸 높이의 6할쯤 되는 띠(글자 아래쪽), 끝은 살짝 거칠게.
 * 세로로 칠한 줄은 세로 띠, 칸 하나는 콕 찍은 점. 획마다 따로 그려서 옆 획과 합쳐지지 않는다.
 */
export function MarkGlyph({ el, preview }: { el: MarkEl; preview?: boolean }) {
  // 한 획씩 그린다: 세로로 칠한 것(한 칸 폭, 여러 칸 높이)은 세로 띠, 한 칸은 점, 나머지는 가로 띠
  const vertical = el.w === 1 && el.h > 1
  const r = seeded(el.id)
  const j = (a: number) => (r() - 0.5) * 2 * a
  const f3 = (n: number) => Math.round(n * 1000) / 1000
  // 칸 하나만: 마커를 콕 찍은 작은 점 (살짝 찌그러지게). 찍은 가운데는 잉크가 고여 조금 더 진하다
  if (!vertical && el.w === 1 && el.h === 1) {
    const cx = el.x + 0.5 + j(0.03)
    const cy = el.y + 0.56 + j(0.03)
    const tilt = r() * Math.PI
    const blob = (radius: number, ox: number, oy: number, wobble: number) => {
      const n = 14
      return (
        'M' +
        Array.from({ length: n }, (_, i) => {
          const a = (i / n) * Math.PI * 2
          const rad = radius * (1 + 0.07 * Math.cos(2 * (a - tilt))) + j(wobble)
          return `${f3(cx + ox + Math.cos(a) * rad)} ${f3(cy + oy + Math.sin(a) * rad)}`
        }).join('L') +
        'Z'
      )
    }
    // 고인 자리는 가운데에서 아주 조금 비켜 있다
    const px = j(0.025)
    const py = j(0.025)
    return (
      <g className={'hl-dab' + (preview ? ' preview' : '')}>
        <path d={blob(0.22, 0, 0, 0.01)} fill={el.color} className="hl-mark" />
        <path d={blob(0.14, px, py, 0.006)} fill={el.color} className="hl-pool" />
        <path d={blob(0.08, px, py, 0.004)} fill={el.color} className="hl-pool" />
      </g>
    )
  }
  let x1 = el.x
  let x2 = el.x + el.w
  let y1 = el.y + MARK_TOP
  let y2 = el.y + el.h - MARK_BOTTOM
  if (vertical) {
    // 세로 줄: 폭을 조금 줄이고 위아래 끝만 거칠게
    x1 = el.x + 0.14
    x2 = el.x + 0.86
    y1 = el.y + 0.12
    y2 = el.y + el.h - 0.1
  }
  const f = (n: number) => Math.round(n * 1000) / 1000
  const pts: [number, number][] = vertical
    ? [
        [x1 + j(0.02), y1 + 0.05 + j(0.03)],
        [(x1 + x2) / 2, y1 + j(0.04)],
        [x2 + j(0.02), y1 + 0.03 + j(0.03)],
        [x2 + j(0.015), y2 - 0.04 - j(0.03)],
        [(x1 + x2) / 2, y2 + j(0.04)],
        [x1 + j(0.015), y2 - 0.02 - j(0.03)],
      ]
    : [
        // 왼쪽 끝 (살짝 비스듬하고 거칠게) → 윗변 → 오른쪽 끝 → 아랫변
        [x1 + 0.06 + j(0.03), y1 + j(0.015)],
        [(x1 + x2) / 2, y1 + j(0.02)],
        [x2 - 0.04 + j(0.03), y1 + j(0.015)],
        [x2 + 0.02 + j(0.02), (y1 + y2) / 2 + j(0.05)],
        [x2 - 0.02 + j(0.03), y2 + j(0.015)],
        [(x1 + x2) / 2, y2 + j(0.02)],
        [x1 + 0.02 + j(0.03), y2 + j(0.015)],
        [x1 - 0.02 + j(0.02), (y1 + y2) / 2 + j(0.05)],
      ]
  return <path d={'M' + pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L') + 'Z'} fill={el.color} className={'hl-mark' + (preview ? ' preview' : '')} />
}
