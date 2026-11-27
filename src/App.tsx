import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { IndexEditor, IndexList, IndexTabs } from './components/IndexTabs'
import NotebookForm from './components/NotebookForm'
import PageView from './components/PageView'
import Toolbar from './components/Toolbar'
import { currentPage, spreadStart, useStore } from './store'
import { isLight } from './types'

export default function App() {
  const notebook = useStore((s) => s.notebook)
  const createNotebook = useStore((s) => s.createNotebook)

  if (!notebook) {
    return (
      <div className="setup">
        <h1 className="brand">Dotlyt</h1>
        <p className="setup-sub">도트지 노트를 한 권 만들어요.</p>
        <NotebookForm submitLabel="노트 만들기" onSubmit={createNotebook} />
      </div>
    )
  }
  return <Workspace />
}

function Workspace() {
  const notebook = useStore((s) => s.notebook)!
  const page = useStore(currentPage)
  const pages = useStore((s) => s.pages)
  const pageCount = pages.length
  const pageIndex = useStore((s) => s.pages.findIndex((p) => p.id === s.currentPageId))
  const spread = useStore((s) => s.spread)
  const setSpread = useStore((s) => s.setSpread)
  const showGuides = useStore((s) => s.showGuides)
  const saveStatus = useStore((s) => s.saveStatus)
  const goRelative = useStore((s) => s.goRelative)
  const addPage = useStore((s) => s.addPage)
  const updateNotebook = useStore((s) => s.updateNotebook)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [indexEditFor, setIndexEditFor] = useState<string | null>(null)
  const [indexListOpen, setIndexListOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const deskRef = useRef<HTMLDivElement>(null)
  const [desk, setDesk] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = deskRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect
      setDesk({ w: r.width, h: r.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 키보드 단축키
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useStore.getState()
      const mod = e.metaKey || e.ctrlKey
      if (document.querySelector('.modal')) return
      if (mod && e.key.toLowerCase() === 'z') {
        if (e.isComposing) return
        e.preventDefault()
        if (e.shiftKey) st.redo()
        else st.undo()
        return
      }
      if (mod && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        st.toggleBold()
        return
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        st.redo()
        return
      }
      const t = e.target as HTMLElement | null
      if (t?.closest('input, textarea, select')) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && st.selection.length) {
        e.preventDefault()
        st.deleteSelection()
      } else if (e.key === 'Escape') {
        st.setSelection([])
        st.closeCursor()
        st.setSelectMode(false)
        st.setEraserMode(false)
      } else if (e.key === 'ArrowLeft') {
        st.goRelative(-1)
      } else if (e.key === 'ArrowRight') {
        st.goRelative(1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // PC 넓은 화면은 양쪽 펼침면
  const wide = desk.w >= 760
  useEffect(() => setSpread(wide), [wide, setSpread])

  const start = spread ? spreadStart(pageIndex) : pageIndex
  const shownPages = (spread ? [pages[start], pages[start + 1]] : [page]).filter(Boolean) as NonNullable<typeof page>[]

  // 페이지를 화면에 맞게. 격자 칸 수는 그대로, 칸 크기(px)만 바뀐다.
  // 가로 여백: 남은 종이 두께 + 오른쪽 인덱스 스티커 자리
  const narrow = desk.w < 600
  const padW = (showGuides ? 70 : 28) + (spread ? 30 : 18) + (narrow ? 12 : 72)
  const padH = (showGuides ? 70 : 28) + 14
  const totalCols = shownPages.reduce((n, p) => n + p.cols, 0)
  const maxRows = Math.max(1, ...shownPages.map((p) => p.rows))
  const cell = totalCols
    ? Math.max(8, Math.min(30, Math.floor(Math.min((desk.w - padW) / totalCols, (desk.h - padH) / maxRows))))
    : 20
  const indexEditPage = indexEditFor ? pages.find((p) => p.id === indexEditFor) : undefined

  const light = isLight(notebook.cover)

  return (
    <div className="app" style={{ ['--cover' as string]: notebook.cover, ['--cover-ink' as string]: light ? '#2b2a28' : '#f6f1e7' }}>
      <header className="topbar">
        <div className="nb-chip" title={notebook.name}>
          <span className="nb-chip-dot" />
          <span className="nb-chip-name">{notebook.name}</span>
        </div>
        <nav className="pager" aria-label="페이지 이동">
          <button className="icon-btn" onClick={() => goRelative(-1)} disabled={pageIndex <= 0} aria-label="이전 페이지">
            ‹
          </button>
          <span className="page-no">
            {spread ? `${start + 1}–${start + 2}` : pageIndex + 1} <span className="muted">/ {pageCount}</span>
          </span>
          <button
            className="icon-btn"
            onClick={() => goRelative(1)}
            disabled={(spread ? start + 2 : pageIndex + 1) >= pageCount}
            aria-label="다음 페이지"
          >
            ›
          </button>
          <button className="icon-btn add" onClick={addPage} title={spread ? '이 펼침면 뒤에 새 펼침면' : '이 페이지 뒤에 새 페이지'} aria-label="새 페이지">
            +
          </button>
          <button
            className="icon-btn del"
            onClick={() => setConfirmDelete(true)}
            title={spread ? '이 펼침면 지우기' : '이 페이지 지우기'}
            aria-label="페이지 지우기"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13" />
            </svg>
          </button>
        </nav>
        <div className="topbar-right">
          <button
            className={'icon-btn' + (page?.index ? ' on' : '')}
            onClick={() => (narrow ? setIndexListOpen(true) : page && setIndexEditFor(page.id))}
            aria-label="인덱스 스티커"
            title={page?.index ? '이 페이지 인덱스 수정' : '이 페이지에 인덱스 붙이기'}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
              <path d="M5 4h9l5 4-5 4H5z" fill={page?.index ? 'currentColor' : 'none'} />
              <path d="M5 4v17" strokeLinecap="round" />
            </svg>
          </button>
          <span className={'save ' + saveStatus}>
            {saveStatus === 'saving' ? '저장 중…' : saveStatus === 'saved' ? '저장됨' : '저장 실패'}
          </span>
          <button className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="노트 설정" title="노트 설정">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
            </svg>
          </button>
        </div>
      </header>

      <main className="workspace">
        <div className="desk" ref={deskRef}>
          {page && desk.w > 0 && (
            <div className={'notebook' + (spread ? ' spread' : '')} style={{ marginRight: narrow ? 10 : 60 }}>
              {shownPages.map((p, i) => (
                <PageView
                  key={p.id}
                  page={p}
                  cell={cell}
                  active={p.id === page.id}
                  side={spread ? (i === 0 ? 'left' : 'right') : 'single'}
                  guides={showGuides}
                />
              ))}
              <IndexTabs
                shownIds={shownPages.map((p) => p.id)}
                narrow={narrow}
                onEdit={setIndexEditFor}
                onOpenList={() => setIndexListOpen(true)}
              />
            </div>
          )}
        </div>
        <Toolbar />
      </main>

      {confirmDelete && (
        <DeletePageDialog
          ids={shownPages.map((p) => p.id)}
          label={spread ? `${start + 1}–${start + 2}쪽 펼침면` : `${pageIndex + 1}쪽`}
          onClose={() => setConfirmDelete(false)}
        />
      )}
      {indexEditPage && <IndexEditor page={indexEditPage} onClose={() => setIndexEditFor(null)} />}
      {indexListOpen && (
        <IndexList
          onClose={() => setIndexListOpen(false)}
          onAdd={() => {
            setIndexListOpen(false)
            if (page) setIndexEditFor(page.id)
          }}
        />
      )}
      {settingsOpen && (
        <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && setSettingsOpen(false)}>
          <div className="modal" role="dialog" aria-label="노트 설정">
            <h2>노트 설정</h2>
            <NotebookForm
              initial={notebook}
              submitLabel="저장"
              onCancel={() => setSettingsOpen(false)}
              onSubmit={(nb) => {
                updateNotebook(nb)
                setSettingsOpen(false)
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

/** 페이지(펼침면) 지우기 확인. 되돌릴 수 없어서 쓴 내용과 스티커 수를 보여준다. */
function DeletePageDialog({ ids, label, onClose }: { ids: string[]; label: string; onClose: () => void }) {
  const allPages = useStore((s) => s.pages)
  const pages = allPages.filter((p) => ids.includes(p.id))
  const deletePages = useStore((s) => s.deletePages)
  const count = pages.reduce((n, p) => n + p.elements.length, 0)
  const stickers = pages.filter((p) => p.index).map((p) => p.index!.name)
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal small" role="alertdialog" aria-label="페이지 지우기" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <h2>{label}을 지울까요?</h2>
        <p className="hint">
          {count ? `쓴 내용 ${count}개` : '빈 페이지'}
          {stickers.length ? `와 인덱스 스티커(${stickers.join(', ')})` : ''}가 함께 사라지고, 되돌릴 수 없어요. 뒤 페이지들이 앞으로 당겨져요.
        </p>
        <div className="form-actions">
          <button type="button" className="btn ghost" autoFocus onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className="btn primary danger-fill"
            onClick={() => {
              deletePages(ids)
              onClose()
            }}
          >
            지우기
          </button>
        </div>
      </div>
    </div>
  )
}
