import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { keyOf } from '../shortcuts'

interface Hit {
  pageId: string
  pageNo: number
  elId: string | null
  text: string
  /** 찾은 글자 위치 */
  at: number
  kind: 'text' | 'index'
}

/** 대소문자·띄어쓰기 차이는 무시하고 찾는다 */
const fold = (s: string) => s.toLowerCase()

/**
 * 노트에서 글자 찾기 (⌘F). 모든 페이지의 글자·네모칸·인덱스 이름에서 찾고,
 * 고르면 그 페이지로 가서 그 글자를 골라 보여준다. ↑↓ 또는 Enter로 다음 결과.
 */
export function FindBar({ onClose }: { onClose: () => void }) {
  const pages = useStore((s) => s.pages)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  // Enter를 처음 누르면 첫 결과로, 그다음부터 다음 결과로
  const wasShown = useRef(false)

  const hits = useMemo<Hit[]>(() => {
    const needle = fold(q.trim())
    if (!needle) return []
    const out: Hit[] = []
    pages.forEach((p, i) => {
      if (p.index && fold(p.index.name).includes(needle))
        out.push({ pageId: p.id, pageNo: i + 1, elId: null, text: p.index.name, at: fold(p.index.name).indexOf(needle), kind: 'index' })
      // 위에서 아래, 왼쪽에서 오른쪽 순서로
      const els = p.elements
        .filter((e): e is Extract<typeof e, { type: 'text' | 'box' }> => (e.type === 'text' || e.type === 'box') && fold(e.text).includes(needle))
        .sort((a, b) => a.y - b.y || a.x - b.x)
      for (const e of els) out.push({ pageId: p.id, pageNo: i + 1, elId: e.id, text: e.text, at: fold(e.text).indexOf(needle), kind: 'text' })
    })
    return out
  }, [pages, q])

  const go = (i: number) => {
    const h = hits[i]
    if (!h) return
    setActive(i)
    const st = useStore.getState()
    st.closeCursor()
    st.goToPage(h.pageId)
    st.setSelection(h.elId ? [h.elId] : [])
  }

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])
  // ⌘F를 다시 누르면 찾는 칸으로
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyF') {
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => {
    setActive(0)
    wasShown.current = false
  }, [q])
  useEffect(() => {
    listRef.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  return (
    <div className="find-bar" role="search" onPointerDown={(e) => e.stopPropagation()}>
      <div className="find-row">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l4.5 4.5" />
        </svg>
        <input
          ref={inputRef}
          value={q}
          placeholder="노트에서 찾기"
          aria-label="노트에서 찾기"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return
            if (e.key === 'Escape') {
              e.preventDefault()
              onClose()
            } else if (e.key === 'Enter' || e.key === 'ArrowDown') {
              e.preventDefault()
              if (hits.length) go(e.key === 'Enter' && e.shiftKey ? (active - 1 + hits.length) % hits.length : e.key === 'Enter' && hits[active] && !wasShown.current ? active : (active + 1) % hits.length)
              wasShown.current = true
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              if (hits.length) go((active - 1 + hits.length) % hits.length)
              wasShown.current = true
            }
          }}
        />
        <span className="find-count">{q.trim() ? (hits.length ? `${Math.min(active + 1, hits.length)} / ${hits.length}` : '없음') : <kbd>{keyOf('find')}</kbd>}</span>
        <button className="icon-btn" onClick={onClose} aria-label="찾기 닫기">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      {hits.length > 0 && (
        <ul className="find-list" ref={listRef}>
          {hits.map((h, i) => (
            <li key={h.pageId + (h.elId ?? 'index') + i}>
              <button className={i === active ? 'on' : undefined} onClick={() => go(i)}>
                <span className="find-page">{h.pageNo}쪽</span>
                <span className="find-text">
                  {h.kind === 'index' && <em className="find-tag">인덱스</em>}
                  {snippet(h.text, h.at, q.trim().length)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function snippet(text: string, at: number, len: number) {
  const start = Math.max(0, at - 14)
  const end = Math.min(text.length, at + len + 24)
  return (
    <>
      {start > 0 && '…'}
      {text.slice(start, at)}
      <mark>{text.slice(at, at + len)}</mark>
      {text.slice(at + len, end)}
      {end < text.length && '…'}
    </>
  )
}
