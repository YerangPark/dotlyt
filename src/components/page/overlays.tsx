
/** 분할 그리드: 종이 가장자리 여백(첫 점 줄 바깥 한 칸)에 ⅓ ½ ⅔ 지점을 표시. 위치는 가장 가까운 점에 맞춘다. */
export function GuideMarks({ cols, rows, side }: { cols: number; rows: number; side: 'left' | 'right' | 'single' }) {
  const marks = [
    { f: 1 / 3, label: '⅓', major: false },
    { f: 1 / 2, label: '½', major: true },
    { f: 2 / 3, label: '⅔', major: false },
  ]
  const snap = (v: number, n: number) => Math.max(1, Math.min(n - 1, Math.round(v)))
  // 세로 위치 표시는 바깥쪽 여백에 (펼침면 오른쪽 페이지는 오른쪽 여백)
  const outerRight = side === 'right'
  return (
    <g className="guide-marks" aria-hidden>
      {marks.map((m) => {
        const x = snap(m.f * cols, cols)
        return (
          <g key={'x' + m.f} className={m.major ? 'major' : undefined}>
            <line x1={x} y1={m.major ? 0.12 : 0.3} x2={x} y2={0.82} />
            <text x={x + 0.22} y={0.4} fontSize={0.4} dominantBaseline="central">
              {m.label}
            </text>
          </g>
        )
      })}
      {marks.map((m) => {
        const y = snap(m.f * rows, rows)
        const from = m.major ? 0.12 : 0.3
        return (
          <g key={'y' + m.f} className={m.major ? 'major' : undefined}>
            <line
              x1={outerRight ? cols - from : from}
              y1={y}
              x2={outerRight ? cols - 0.82 : 0.82}
              y2={y}
            />
            <text
              x={outerRight ? cols - 0.42 : 0.42}
              y={y - 0.42}
              fontSize={0.4}
              textAnchor="middle"
              dominantBaseline="central"
            >
              {m.label}
            </text>
          </g>
        )
      })}
    </g>
  )
}

/** 양쪽 페이지에 걸친 고르기 사각형 중 이 페이지에 걸친 부분 */
export function MarqueeRect({ m, svg, cell }: { m: { x1: number; y1: number; x2: number; y2: number }; svg: SVGSVGElement; cell: number }) {
  const r = svg.getBoundingClientRect()
  return (
    <rect
      x={(m.x1 - r.left) / cell}
      y={(m.y1 - r.top) / cell}
      width={(m.x2 - m.x1) / cell}
      height={(m.y2 - m.y1) / cell}
      className="marquee"
    />
  )
}
