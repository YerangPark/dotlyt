import type { PenType } from './types'

/** 요소 id로 고정되는 난수. 다시 그려도 같은 흔들림이 나온다. */
function rng(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return () => {
    h ^= h << 13
    h ^= h >>> 17
    h ^= h << 5
    return ((h >>> 0) % 100000) / 100000
  }
}

export const PEN_WIDTH: Record<PenType, Record<1 | 2, number>> = {
  ballpoint: { 1: 0.07, 2: 0.13 },
  pencil: { 1: 0.085, 2: 0.15 },
}

const f2 = (n: number) => Math.round(n * 1000) / 1000

/**
 * 볼펜, 연필로 그은 것 같은 선을 채운 다각형(path d)들로 만든다.
 * - 아주 살짝 휘고 떨리는 중심선
 * - 누르는 힘처럼 굵기가 조금씩 변하고, 시작과 끝은 가늘어진다
 * - 끝이 점에 딱 맞지 않고 조금 모자라거나 넘친다
 */
export function strokePaths(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opts: { width: 1 | 2; dash: boolean; double?: boolean; pen: PenType; seed: string; settle?: boolean },
): string[] {
  // 두 줄: 같은 방향으로 나란히 두 번 긋는다 (각자 조금씩 다르게 떨리게 씨앗을 달리)
  if (opts.double) {
    const L0 = Math.hypot(x2 - x1, y2 - y1)
    if (L0 < 0.01) return []
    const gap = opts.width === 2 ? 0.13 : 0.1
    const ox = (-(y2 - y1) / L0) * gap
    const oy = ((x2 - x1) / L0) * gap
    const one = { ...opts, double: false }
    return [
      ...strokePaths(x1 + ox, y1 + oy, x2 + ox, y2 + oy, { ...one, seed: opts.seed + 'a' }),
      ...strokePaths(x1 - ox, y1 - oy, x2 - ox, y2 - oy, { ...one, seed: opts.seed + 'b' }),
    ]
  }
  const L = Math.hypot(x2 - x1, y2 - y1)
  if (L < 0.01) return []
  const ux = (x2 - x1) / L
  const uy = (y2 - y1) / L
  const nx = -uy
  const ny = ux
  const r = rng(opts.seed)
  const pencil = opts.pen === 'pencil'

  const s0 = -0.015 + r() * 0.03
  const s1 = L - 0.01 + r() * 0.035
  const amp = pencil ? 0.005 : 0.003
  const p1 = r() * Math.PI * 2
  const p2 = r() * Math.PI * 2
  const p3 = r() * Math.PI * 2
  const fr1 = 0.08 + r() * 0.08
  const fr2 = 0.9 + r() * 0.6
  // 손목이 그리는 아주 완만한 활 모양 (다 그은 뒤에만)
  const bow = opts.settle === false ? 0 : (r() - 0.5) * Math.min(0.016, 0.0018 * L)
  const base = PEN_WIDTH[opts.pen][opts.width]

  const off = (s: number) =>
    amp * (0.92 * Math.sin(2 * Math.PI * fr1 * s + p1) + 0.08 * Math.sin(2 * Math.PI * fr2 * s + p2)) +
    bow * Math.sin((Math.PI * (s - s0)) / (s1 - s0))

  const width = (s: number, a: number, b: number) => {
    const press = pencil
      ? 0.92 + 0.08 * Math.sin(2 * Math.PI * 0.25 * s + p3)
      : 0.97 + 0.03 * Math.sin(2 * Math.PI * 0.2 * s + p3)
    // 끝을 뭉툭하게: 거의 가늘어지지 않고 아주 짧게만
    const taperIn = Math.min(1, 0.85 + ((s - a) / 0.12) * 0.15)
    const taperOut = Math.min(1, 0.8 + ((b - s) / 0.15) * 0.2)
    return base * press * Math.min(taperIn, taperOut)
  }

  const segs: [number, number][] = []
  if (opts.dash) {
    for (let s = s0; s < s1; s += 0.5) segs.push([s, Math.min(s + 0.28 + r() * 0.04, s1)])
  } else segs.push([s0, s1])

  return segs.map(([a, b]) => {
    const n = Math.max(2, Math.ceil((b - a) / 0.12))
    const left: string[] = []
    const right: string[] = []
    let w0 = 0
    let w1 = 0
    for (let i = 0; i <= n; i++) {
      const s = a + ((b - a) * i) / n
      const o = off(s)
      const cx = x1 + ux * s + nx * o
      const cy = y1 + uy * s + ny * o
      const w = width(s, a, b) / 2
      if (i === 0) w0 = w
      if (i === n) w1 = w
      left.push(`${f2(cx + nx * w)} ${f2(cy + ny * w)}`)
      right.push(`${f2(cx - nx * w)} ${f2(cy - ny * w)}`)
    }
    right.reverse()
    // 양 끝은 펜 끝처럼 둥글게 (반원으로 잇는다)
    return `M${left.join('L')}A${f2(w1)} ${f2(w1)} 0 0 0 ${right[0]}L${right.join('L')}A${f2(w0)} ${f2(w0)} 0 0 0 ${left[0]}Z`
  })
}
