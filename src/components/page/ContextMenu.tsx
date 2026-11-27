import { useEffect, useRef } from 'react'
import { useStore } from '../../store'
import { MOD } from '../../shortcuts'

export interface CtxMenu {
  /** 페이지(page-wrap) 안 화면 위치(px) */
  left: number
  top: number
  /** 누른 칸 */
  cx: number
  cy: number
  /** 항목 위에서 눌렀는지 */
  onItem: boolean
}

/**
 * 오른쪽 클릭 메뉴: 브라우저 기본 메뉴 대신.
 * 항목 위면 복사·잘라내기·복제·지우기(+붙여넣기), 빈 칸이면 그 칸에 붙여넣기.
 */
export function ContextMenu({ menu, onClose, leaving }: { menu: CtxMenu; onClose: () => void; leaving?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const hasClip = useStore((s) => !!s.clipboard)

  useEffect(() => {
    if (leaving) return
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('resize', onClose)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose, leaving])

  // 화면 밖으로 나가지 않게
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (r.right > window.innerWidth - 8) el.style.transform = `translateX(${window.innerWidth - 8 - r.right}px)`
    if (r.bottom > window.innerHeight - 8) el.style.marginTop = `${window.innerHeight - 8 - r.bottom}px`
  }, [])

  const st = useStore.getState()
  const run = (fn: () => void) => () => {
    fn()
    onClose()
  }
  const paste = run(() => {
    const s = useStore.getState()
    // 빈 칸에서 눌렀으면 그 칸에 붙인다 (붙여넣기는 커서가 있는 빈 칸을 쓴다)
    if (!menu.onItem) s.openAt(menu.cx, menu.cy)
    s.paste()
  })

  return (
    <div
      ref={ref}
      className={'ctx-menu' + (leaving ? ' leaving' : '')}
      role="menu"
      style={{ left: menu.left, top: menu.top }}
      onPointerDown={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {menu.onItem && (
        <>
          <button role="menuitem" onClick={run(() => st.copySelection())}>
            복사 <kbd>{MOD}C</kbd>
          </button>
          <button role="menuitem" onClick={run(() => st.cutSelection())}>
            잘라내기 <kbd>{MOD}X</kbd>
          </button>
        </>
      )}
      <button role="menuitem" onClick={paste} disabled={!hasClip}>
        붙여넣기 <kbd>{MOD}V</kbd>
      </button>
      {menu.onItem && (
        <>
          <button role="menuitem" onClick={run(() => st.duplicateSelection())}>
            복제 <kbd>{MOD}D</kbd>
          </button>
          <span className="ctx-sep" />
          <button role="menuitem" className="danger" onClick={run(() => st.deleteSelection())}>
            지우기 <kbd>Delete</kbd>
          </button>
        </>
      )}
    </div>
  )
}
