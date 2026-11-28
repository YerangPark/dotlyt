import type { PenType } from '../../types'

/** 볼펜, 연필 모양 마우스 커서 (끝이 왼쪽 아래) */
export const svgCursor = (svg: string, fallback: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(svg)}") 4 27, ${fallback}`
export const CURSORS: Record<PenType, string> = {
  pencil: svgCursor(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g transform="rotate(45 16 16)"><rect x="12.5" y="0" width="7" height="20" rx="1" fill="#f2c14e" stroke="#3a3328" stroke-width="1.2"/><rect x="12.5" y="0" width="7" height="4" rx="1" fill="#e79b9b" stroke="#3a3328" stroke-width="1.2"/><rect x="12.5" y="4" width="7" height="2" fill="#c9c3b5" stroke="#3a3328" stroke-width="1"/><path d="M12.5 20 L19.5 20 L16 28.5 Z" fill="#f4dcb4" stroke="#3a3328" stroke-width="1.2" stroke-linejoin="round"/><path d="M14.6 25.3 L17.4 25.3 L16 28.5 Z" fill="#3a3328"/></g></svg>`,
    'crosshair',
  ),
  ballpoint: svgCursor(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g transform="rotate(45 16 16)"><rect x="13" y="0" width="6" height="19" rx="2.5" fill="#2f3a52" stroke="#1d2333" stroke-width="1.1"/><rect x="18.6" y="2" width="1.8" height="9" rx="0.9" fill="#c9ccd3" stroke="#1d2333" stroke-width="0.8"/><path d="M13 19 L19 19 L17.2 25 L14.8 25 Z" fill="#d8dbe0" stroke="#1d2333" stroke-width="1.1" stroke-linejoin="round"/><path d="M14.8 25 L17.2 25 L16 28.6 Z" fill="#1d2333"/></g></svg>`,
    'crosshair',
  ),
}

/** 칸 가운데: 끌면 네모칸이 생긴다는 뜻의 십자 + 네모 */
export const BOX_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g stroke="#fff" stroke-width="3" stroke-linecap="round"><path d="M10 2v16M2 10h16"/></g><g stroke="#2b2a28" stroke-width="1.4" stroke-linecap="round"><path d="M10 2v16M2 10h16"/></g><rect x="15" y="15" width="13" height="10" rx="1.5" fill="rgba(35,131,226,0.15)" stroke="#2383e2" stroke-width="1.4" stroke-dasharray="2.5 2"/><text x="18.5" y="23.3" font-size="8" font-family="sans-serif" font-weight="700" fill="#2383e2">T</text></svg>`,
)}") 10 10, crosshair`

/** 형광펜 커서: 몸통과 펜촉이 지금 고른 형광펜 색. 지우기(색 없음)면 흰 펜촉에 빨간 사선 */
const hlCache = new Map<string, string>()
export function highlighterCursor(color: string | null): string {
  const key = color ?? 'erase'
  const hit = hlCache.get(key)
  if (hit) return hit
  const body = color ?? '#ece9e3'
  const tip = color ?? '#ffffff'
  const slash = color ? '' : '<path d="M13 27.5l6-5" stroke="#c2412d" stroke-width="1.4" stroke-linecap="round"/>'
  const cur = svgCursor(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g transform="rotate(45 16 16)"><rect x="11.5" y="1" width="9" height="17" rx="2" fill="${body}" stroke="#3a3328" stroke-width="1.2"/><rect x="11.5" y="14" width="9" height="4" fill="#3a3328" opacity=".25"/><path d="M12.5 18h7l-1.5 5h-4z" fill="#f7f1e1" stroke="#3a3328" stroke-width="1.2" stroke-linejoin="round"/><path d="M14 23h4l-.6 4.5h-2.8z" fill="${tip}" stroke="#3a3328" stroke-width="1"/>${slash}</g></svg>`,
    'cell',
  )
  hlCache.set(key, cur)
  return cur
}

/**
 * 지우개 커서: 흰 고무 끝(짧게) + 분홍빛 빨간 띠(길게). 커서 기준점은 흰 끝 면의 가운데 = 실제로 지워지는 자리
 */
export const ERASER_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g transform="rotate(-45 16 16)"><rect x="6" y="11" width="22" height="10" rx="2" fill="#f2b6ae" stroke="#2b2a28" stroke-width="1.3"/><path d="M8 11h4v10H8a2 2 0 01-2-2v-6a2 2 0 012-2z" fill="#fff" stroke="#2b2a28" stroke-width="1.3" stroke-linejoin="round"/></g></svg>`,
)}") 9 23, cell`

/**
 * 맥 크롬은 SVG 그림 커서를 화면이 조금만 바뀌어도(파란 점 미리보기 등) 다시 그리면서 기본 커서로 깜박인다.
 * 그래서 처음 쓸 때 PNG(선명하게 2배 크기 포함)로 바꿔 두고 그걸 쓴다. 바꾸는 동안은 SVG 그대로.
 */
const pngCache = new Map<string, string>()
const pending = new Set<string>()
const listeners = new Set<() => void>()
let version = 0
export const subscribeCursors = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
export const cursorsVersion = () => version

const rasterize = (svgUrl: string, size: number) =>
  new Promise<string>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = c.height = size
      const ctx = c.getContext('2d')
      if (!ctx) return reject(new Error('no canvas'))
      ctx.drawImage(img, 0, 0, size, size)
      resolve(c.toDataURL('image/png'))
    }
    img.onerror = reject
    img.src = svgUrl
  })

export function pngCursor(css: string): string {
  const m = css.match(/^url\("(data:image\/svg\+xml,[^"]+)"\) (\d+) (\d+), (.+)$/)
  if (!m) return css
  const hit = pngCache.get(css)
  if (hit) return hit
  if (!pending.has(css)) {
    pending.add(css)
    const [, url, hx, hy, fallback] = m
    Promise.all([rasterize(url, 32), rasterize(url, 64)])
      .then(([p1, p2]) => {
        // 1배 PNG를 기본으로, 레티나는 2배 PNG (image-set을 모르는 브라우저는 앞의 url을 쓴다)
        pngCache.set(css, `-webkit-image-set(url("${p1}") 1x, url("${p2}") 2x) ${hx} ${hy}, url("${p1}") ${hx} ${hy}, ${fallback}`)
        version++
        listeners.forEach((f) => f())
      })
      .catch(() => {})
  }
  return css
}
