import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { keyOf, type ShortcutId } from '../shortcuts'

/**
 * 버튼에 붙이는 툴팁 속성. 브라우저 기본 title 대신 우리 툴팁이 뜬다.
 * name: 무슨 도구인지, desc: 한 줄 설명, key: 단축키
 */
export function tip(name: string, desc?: string, key?: ShortcutId) {
  return {
    'aria-label': name,
    'data-tip': name,
    ...(desc ? { 'data-tip-desc': desc } : {}),
    ...(key ? { 'data-tip-key': keyOf(key) } : {}),
  }
}

type Shown = { name: string; desc?: string; key?: string; r: DOMRect; side: 'left' | 'right' | 'top' | 'bottom' }

/** 처음 뜰 때 잠깐 기다리고, 바로 옆 도구로 옮기면 기다리지 않는다 (도구 모음을 훑을 때 자연스럽게) */
const DELAY = 380
const WARM = 500

/**
 * 화면에 하나만 있는 툴팁. [data-tip] 요소에 마우스를 올리거나 키보드로 옮기면 뜬다.
 * 도구 모음(오른쪽)이면 왼쪽에, 위 막대면 아래에, 휴대폰 아래 도구 모음이면 위에.
 */
export function TooltipLayer() {
  const [shown, setShown] = useState<Shown | null>(null)
  const timer = useRef(0)
  const lastHide = useRef(0)
  const current = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const sideOf = (el: HTMLElement, r: DOMRect): Shown['side'] => {
      if (el.closest('.toolbar')) {
        // 휴대폰에선 도구 모음이 아래에 가로로 있다
        return r.top > window.innerHeight * 0.7 && r.width < window.innerWidth / 3 && window.innerWidth < 720 ? 'top' : 'left'
      }
      if (r.top < 80) return 'bottom'
      return r.left > window.innerWidth / 2 ? 'left' : 'right'
    }
    const show = (el: HTMLElement) => {
      const r = el.getBoundingClientRect()
      setShown({
        name: el.dataset.tip!,
        desc: el.dataset.tipDesc,
        key: el.dataset.tipKey,
        r,
        side: sideOf(el, r),
      })
    }
    const enter = (el: HTMLElement) => {
      if (current.current === el) return
      current.current = el
      window.clearTimeout(timer.current)
      const warm = performance.now() - lastHide.current < WARM || shownRef.current
      timer.current = window.setTimeout(() => show(el), warm ? 0 : DELAY)
    }
    const leave = () => {
      window.clearTimeout(timer.current)
      if (current.current) lastHide.current = performance.now()
      current.current = null
      setShown(null)
    }
    const onOver = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tip]')
      if (el) enter(el)
      else if (current.current) leave()
    }
    const onFocus = (e: FocusEvent) => {
      const el = (e.target as HTMLElement).closest?.<HTMLElement>('[data-tip]')
      if (el && el.matches(':focus-visible')) enter(el)
    }
    const onDown = () => {
      // 누르면 바로 숨긴다 (누른 뒤엔 결과를 봐야 하니까)
      window.clearTimeout(timer.current)
      setShown(null)
    }
    document.addEventListener('pointerover', onOver)
    document.addEventListener('focusin', onFocus)
    document.addEventListener('focusout', leave)
    document.addEventListener('pointerdown', onDown, true)
    window.addEventListener('scroll', leave, true)
    window.addEventListener('blur', leave)
    return () => {
      document.removeEventListener('pointerover', onOver)
      document.removeEventListener('focusin', onFocus)
      document.removeEventListener('focusout', leave)
      document.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('scroll', leave, true)
      window.removeEventListener('blur', leave)
      window.clearTimeout(timer.current)
    }
  }, [])

  const shownRef = useRef(false)
  shownRef.current = !!shown

  if (!shown) return null
  const { r, side } = shown
  const gap = 8
  const style: React.CSSProperties =
    side === 'left'
      ? { top: r.top + r.height / 2, right: window.innerWidth - r.left + gap }
      : side === 'right'
        ? { top: r.top + r.height / 2, left: r.right + gap }
        : side === 'bottom'
          ? { top: r.bottom + gap, left: Math.min(Math.max(8, r.left + r.width / 2), window.innerWidth - 8) }
          : { bottom: window.innerHeight - r.top + gap, left: Math.min(Math.max(8, r.left + r.width / 2), window.innerWidth - 8) }
  return createPortal(
    <div className={'tooltip ' + side} style={style} role="tooltip">
      <div className="tooltip-inner">
        <span className="tooltip-name">
          {shown.name}
          {shown.key && <kbd>{shown.key}</kbd>}
        </span>
        {shown.desc && <span className="tooltip-desc">{shown.desc}</span>}
      </div>
    </div>,
    document.body,
  )
}
