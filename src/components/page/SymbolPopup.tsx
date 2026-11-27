import { useEffect } from 'react'
import { iconOf } from '../../icons'
import { useStore } from '../../store'
import type { BulletEl, BulletState, El } from '../../types'
import { Glyph } from './glyphs'

/**
 * 기호 키. 자판 위치(e.code)로 맞춰서 한글 자판이어도 한영 전환 없이 된다.
 * codes: 'KeyX'는 Shift 상관없이, 'Shift+Period'처럼 쓰면 Shift를 누른 것만, 'Period'만 쓰면 Shift 없이만.
 */
type Opt = { state: BulletState; label: string; key: string; codes: string[] }
export const INSERT_OPTIONS: Opt[] = [
  { state: 'task', label: '할 일', key: '*', codes: ['Shift+Digit8', 'NumpadMultiply', 'KeyT', 'Period'] },
  { state: 'event', label: '일정', key: 'O', codes: ['KeyO'] },
  { state: 'note', label: '메모', key: '-', codes: ['Minus', 'NumpadSubtract'] },
]

export const STATE_OPTIONS: Opt[] = [
  { state: 'task', label: '할 일', key: 'T', codes: ['KeyT', 'Shift+Digit8', 'NumpadMultiply', 'Period'] },
  { state: 'done', label: '완료', key: 'X', codes: ['KeyX'] },
  { state: 'migrated', label: '미룸', key: '>', codes: ['Shift+Period'] },
  { state: 'scheduled', label: '일정으로', key: '<', codes: ['Shift+Comma'] },
  { state: 'event', label: '일정', key: 'O', codes: ['KeyO'] },
  { state: 'note', label: '메모', key: '-', codes: ['Minus', 'NumpadSubtract'] },
]

/** 키 입력이 codes 중 하나인지. 글자 키(KeyX)는 Shift와 상관없이, 기호 키는 Shift 여부까지 본다 */
function matches(e: KeyboardEvent, codes: string[]) {
  return codes.some((c) => {
    if (c.startsWith('Shift+')) return e.shiftKey && e.code === c.slice(6)
    if (c.startsWith('Key') || c.startsWith('Numpad')) return e.code === c
    return !e.shiftKey && e.code === c
  })
}

/** 기호 바로 위에 뜨는 팝업. 바깥을 누르거나 Esc로 닫힌다. PC는 키 하나로 고른다. */
export type SymPopup = Exclude<NonNullable<ReturnType<typeof useStore.getState>['popup']>, { kind: 'icon' }>

export function SymbolPopup({ popup, elements, cell }: { popup: SymPopup; elements: El[]; cell: number }) {
  const bullet = popup.kind === 'state' ? (elements.find((e) => e.id === popup.id) as BulletEl | undefined) : undefined
  const x = popup.kind === 'insert' ? popup.x : bullet?.x ?? 0
  const y = popup.kind === 'insert' ? popup.y : bullet?.y ?? 0
  // 미리보기 색: 새로 넣으면 지금 고른 펜 색, 이미 있는 기호면 그 기호 색
  const penColor = useStore((s) => s.lineStyle.color)
  const glyphColor = bullet?.color ?? (popup.kind === 'insert' ? penColor : undefined)

  // 팝업이 떠 있는 동안은 글자 입력칸에서 손을 뗀다: 한글 자판이면 입력칸이 'ㅌ'처럼 글자를 조합해 버려서 키를 못 받는다
  useEffect(() => {
    const active = document.activeElement as HTMLElement | null
    if (active?.classList.contains('ink-input')) active.blur()
    return () => {
      // 닫히면 쓰던 자리로 다시 (커서가 남아 있을 때)
      if (useStore.getState().cursor) document.querySelector<HTMLElement>('.ink-input')?.focus({ preventScroll: true })
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return
      const st = useStore.getState()
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        st.setPopup(null)
        return
      }
      const opts = popup.kind === 'insert' ? INSERT_OPTIONS : STATE_OPTIONS
      const hit = opts.find((o) => matches(e, o.codes))
      if (hit) {
        e.preventDefault()
        e.stopPropagation()
        if (popup.kind === 'insert') st.addBullet(hit.state)
        else st.setBulletState(popup.id, hit.state)
        return
      }
      if (popup.kind === 'state' && (e.code === 'KeyC' || e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault()
        e.stopPropagation()
        if (e.code === 'KeyC') st.toggleCancel(popup.id)
        else st.deleteElement(popup.id)
        return
      }
      // 그 밖의 글자 키: 도구 단축키(H, E 등)로 새지 않게 막고,
      // 기호 넣기 팝업이면 닫고 평소처럼 쓴다 (입력칸으로 돌아가 그 글자가 들어가게)
      if (e.key.length === 1 || e.key === 'Process') {
        e.stopPropagation()
        if (popup.kind === 'insert') {
          st.setPopup(null)
          document.querySelector<HTMLElement>('.ink-input')?.focus({ preventScroll: true })
        }
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [popup])

  if (popup.kind === 'state' && !bullet) return null
  const st = useStore.getState()
  const hasClip = !!st.clipboard
  const below = y < 3
  const opts = popup.kind === 'insert' ? INSERT_OPTIONS : STATE_OPTIONS

  return (
    <div
      className={'sym-popup' + (below ? ' below' : '')}
      style={{ left: (x + 0.5) * cell, top: below ? (y + 1) * cell + 6 : y * cell - 6 }}
      onPointerDown={(e) => e.preventDefault()}
      role="menu"
    >
      {opts.map((o) => (
        <button
          key={o.state}
          role="menuitem"
          className={'sym-opt' + (bullet?.state === o.state ? ' on' : '')}
          onClick={() => (popup.kind === 'insert' ? st.addBullet(o.state) : st.setBulletState(popup.id, o.state))}
        >
          <svg viewBox="0 0 1 1" width="22" height="22">
            <Glyph state={o.state} cx={0.5} cy={0.5} color={glyphColor} />
          </svg>
          <span className="sym-label">{o.label}</span>
          <kbd>{o.key}</kbd>
        </button>
      ))}
      {popup.kind === 'insert' && (
        <>
          <span className="sym-sep" />
          <button role="menuitem" className="sym-opt" onClick={() => st.setPopup({ kind: 'icon', x: popup.x, y: popup.y })}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d={iconOf('sun').d} />
            </svg>
            <span className="sym-label">아이콘</span>
          </button>
        </>
      )}
      {popup.kind === 'insert' && hasClip && (
        <>
          <span className="sym-sep" />
          <button role="menuitem" className="sym-opt" onClick={() => st.paste()}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
              <rect x="6" y="4" width="12" height="17" rx="2" />
              <path d="M9 4V3h6v1M9 10h6M9 14h4" strokeLinecap="round" />
            </svg>
            <span className="sym-label">붙여넣기</span>
            <kbd>⌘V</kbd>
          </button>
        </>
      )}
      {bullet && (
        <>
          <span className="sym-sep" />
          <button role="menuitem" className={'sym-opt' + (bullet.cancelled ? ' on' : '')} onClick={() => st.toggleCancel(bullet.id)}>
            <span className="sym-strike">가</span>
            <span className="sym-label">취소</span>
            <kbd>C</kbd>
          </button>
          <button role="menuitem" className="sym-opt" onClick={() => st.deleteElement(bullet.id)}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13" />
            </svg>
            <span className="sym-label">지우기</span>
            <kbd>Del</kbd>
          </button>
        </>
      )}
    </div>
  )
}
