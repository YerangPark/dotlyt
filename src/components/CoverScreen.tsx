import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { SIZES, isLight } from '../types'
import { Notebook3D } from './NotebookForm'

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** 펼친 책(표지 + 속지 두 쪽)이 화면 가운데에 오고, 좁은 화면에서도 다 들어오게 옮길 거리와 배율 */
function setOpenVars(book: HTMLElement) {
  const r = book.getBoundingClientRect()
  const w = book.offsetWidth
  const h = book.offsetHeight
  // 펼친 모습이 노트 화면의 펼침면과 비슷한 크기가 되게: 위아래·양옆에 여유를 둔다
  const scale = Math.min(0.92, (window.innerWidth - 80) / (w * 2), (window.innerHeight - 160) / h)
  const cx = r.left + r.width / 2
  const cy = r.top + r.height / 2
  // 책등(왼쪽 끝)이 화면 가운데에 오도록: 책 중심을 가운데보다 반 폭만큼 오른쪽에
  book.style.setProperty('--open-dx', `${window.innerWidth / 2 + (w * scale) / 2 - cx}px`)
  book.style.setProperty('--open-dy', `${window.innerHeight / 2 - cy}px`)
  book.style.setProperty('--open-scale', String(scale))
}

/** 표지 화면에서 가만히 있을 때의 책 높이: 화면에 맞춰 크게 */
function idleBookHeight(ratio: number) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (vw < 720) return Math.round(Math.max(220, Math.min(380, vh * 0.4, (vw - 120) / ratio)))
  return Math.round(Math.max(300, Math.min(600, vh * 0.62, (vw * 0.4) / ratio)))
}

/**
 * 메인 화면(표지): 노트를 누르거나 "노트 펼치기"를 누르면 표지가 넘어가며 마지막으로 쓰던 페이지가 열린다.
 * closing이면(노트에서 돌아올 때) 펼친 책이 닫히면서 시작한다.
 */
export function CoverScreen({ onOpen, closing = false, autoOpen = false }: { onOpen: () => void; closing?: boolean; autoOpen?: boolean }) {
  const notebook = useStore((s) => s.notebook)!
  const pages = useStore((s) => s.pages)
  const [phase, setPhase] = useState<'idle' | 'opening' | 'closing'>('idle')
  const [leaving, setLeaving] = useState(false)
  const bookBtn = useRef<HTMLButtonElement>(null)
  const s = SIZES[notebook.size]
  const ratio = s.cols / s.rows
  const [bookH, setBookH] = useState(() => idleBookHeight(ratio))
  const opening = phase === 'opening'

  useEffect(() => {
    const onResize = () => setBookH(idleBookHeight(ratio))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [ratio])

  // 노트에서 돌아왔으면: 펼친 상태에서 시작해 닫힌다 (그리기 전에 자리를 잡는다)
  useLayoutEffect(() => {
    if (!closing || reduceMotion()) return
    const book = bookBtn.current?.querySelector<HTMLElement>('.book')
    if (!book) return
    setOpenVars(book)
    setPhase('closing')
    const t = window.setTimeout(() => setPhase('idle'), 1500)
    return () => window.clearTimeout(t)
  }, [closing])

  const open = () => {
    if (phase !== 'idle') return
    if (reduceMotion()) return onOpen()
    const book = bookBtn.current?.querySelector<HTMLElement>('.book')
    if (book) setOpenVars(book)
    setPhase('opening')
    // 표지(0.7초) → 속지 차르륵(~0.85초) → 화면 전환
    window.setTimeout(() => setLeaving(true), 1250)
    window.setTimeout(onOpen, 1450)
  }

  // 노트를 막 만들었으면: 표지가 나타나고 잠깐 보여 준 뒤 저절로 펼친다
  const openRef = useRef(open)
  openRef.current = open
  useEffect(() => {
    if (!autoOpen) return
    const t = window.setTimeout(() => openRef.current(), reduceMotion() ? 0 : 1000)
    return () => window.clearTimeout(t)
  }, [autoOpen])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        open()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const written = pages.filter((p) => p.elements.length).length
  const last = Math.max(...pages.map((p) => p.updatedAt))
  const lastText = new Date(last).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
  const hour = new Date().getHours()
  const greeting = hour < 11 ? '좋은 아침이에요,' : hour < 17 ? '오늘 오후도 한 장,' : hour < 22 ? '하루를 정리할 시간,' : '자기 전에 한 줄만,'

  return (
    <div className={'cover-screen' + (opening ? ' opening' : '') + (phase === 'closing' ? ' closing' : '') + (leaving ? ' leaving' : '') + (autoOpen ? ' fresh' : '')}>
      <header className="cover-head">
        <div className="brand-mark" aria-label="Dotlyt">
          <svg viewBox="0 0 28 28" width="26" height="26" aria-hidden>
            <rect x="2" y="2" width="24" height="24" rx="7" fill="none" stroke="currentColor" strokeWidth="2" />
            {[8.5, 14, 19.5].map((x) => [8.5, 14, 19.5].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r={1.6} fill="currentColor" />))}
          </svg>
          <span>Dotlyt</span>
        </div>
        <button className="btn cover-head-cta" onClick={open}>
          노트 펼치기
        </button>
      </header>

      <main className="cover-hero">
        <section className="cover-text">
          <p className="cover-caption">{greeting}</p>
          {notebook.name && <h1 className="cover-title">{notebook.name}</h1>}
          <p className="cover-body-copy">
            {written === 0 ? (
              <>
                아직 비어 있는 {pages.length}쪽짜리 노트예요. <span className="marker">첫 장</span>을 채워 볼까요?
              </>
            ) : (
              <>
                {pages.length}쪽 중 {written}쪽을 썼어요. 마지막으로 쓴 날은 <span className="marker">{lastText}</span>.
              </>
            )}
          </p>
          <div className="cover-actions">
            <button className="btn primary cover-open" onClick={open}>
              펼쳐서 쓰기
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
            <p className="cover-hint">
              표지를 눌러도<span className="pc-only">, Enter를 눌러도</span> 펼쳐져요.
            </p>
          </div>
        </section>

        <div className="cover-stage">
          <button className="cover-book" ref={bookBtn} onClick={open} aria-label="노트 펼치기">
            <Notebook3D
              cover={notebook.cover}
              light={isLight(notebook.cover)}
              title={notebook.name}
              year={new Date().getFullYear()}
              ratio={ratio}
              height={bookH}
              opening={opening}
              closing={phase === 'closing'}
            />
          </button>
        </div>
      </main>

      <footer className="cover-band">
        <span className="band-brand">Dotlyt</span>
        <span className="band-copy">점 위에 하루를 적는 노트</span>
        <a className="band-link" href="/privacy">
          개인정보처리방침
        </a>
      </footer>
    </div>
  )
}
