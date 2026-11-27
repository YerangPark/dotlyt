import { useRef, useState } from 'react'
import { useStore } from '../store'
import { COVERS, isLight, type Page } from '../types'

const STEP = 34 // 탭 하나의 세로 간격(px)
const TOP = 16

/** 노트 오른쪽 가장자리에 붙은 인덱스 스티커들. 누르면 이동, 끌면 순서 바꾸기, 우클릭·길게 누르면 수정. */
export function IndexTabs({ shownIds, narrow, onEdit, onOpenList }: {
  shownIds: string[]
  narrow: boolean
  onEdit: (pageId: string) => void
  onOpenList: () => void
}) {
  const pages = useStore((s) => s.pages)
  const tabs = pages.filter((p) => p.index).sort((a, b) => a.index!.order - b.index!.order)
  const [drag, setDrag] = useState<{ id: string; startY: number; dy: number; moved: boolean } | null>(null)
  const longPress = useRef<number | undefined>(undefined)

  if (!tabs.length) return null

  const targetIndex = (from: number, dy: number) => Math.max(0, Math.min(tabs.length - 1, Math.round(from + dy / STEP)))

  // 끄는 중이면 나머지 탭이 자리를 비켜준다
  const order = tabs.map((t) => t.id)
  if (drag?.moved) {
    const from = order.indexOf(drag.id)
    const to = targetIndex(from, drag.dy)
    order.splice(from, 1)
    order.splice(to, 0, drag.id)
  }

  return (
    <div className={'index-tabs' + (narrow ? ' narrow' : '')}>
      {tabs.map((p) => {
        const tab = p.index!
        const isDragging = drag?.id === p.id && drag.moved
        const slot = isDragging ? tabs.findIndex((t) => t.id === p.id) : order.indexOf(p.id)
        const top = TOP + slot * STEP + (isDragging ? drag!.dy : 0)
        const current = shownIds.includes(p.id)
        return (
          <button
            key={p.id}
            className={'index-tab' + (current ? ' current' : '') + (isDragging ? ' dragging' : '')}
            style={{ top, background: tab.color, color: isLight(tab.color) ? '#2b2a28' : '#f6f1e7' }}
            title={tab.name}
            onPointerDown={(e) => {
              if (e.pointerType === 'mouse' && e.button !== 0) return
              ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
              setDrag({ id: p.id, startY: e.clientY, dy: 0, moved: false })
              window.clearTimeout(longPress.current)
              if (e.pointerType !== 'mouse') {
                longPress.current = window.setTimeout(() => {
                  setDrag(null)
                  onEdit(p.id)
                }, 550)
              }
            }}
            onPointerMove={(e) => {
              if (!drag || drag.id !== p.id) return
              const dy = e.clientY - drag.startY
              if (!drag.moved && Math.abs(dy) < 5) return
              window.clearTimeout(longPress.current)
              setDrag({ ...drag, dy, moved: true })
            }}
            onPointerUp={() => {
              window.clearTimeout(longPress.current)
              const d = drag
              setDrag(null)
              if (!d || d.id !== p.id) return
              if (d.moved) {
                useStore.getState().reorderIndex(order)
              } else if (narrow) {
                onOpenList()
              } else {
                useStore.getState().goToPage(p.id)
              }
            }}
            onPointerCancel={() => {
              window.clearTimeout(longPress.current)
              setDrag(null)
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              onEdit(p.id)
            }}
          >
            <span className="index-tab-name">{tab.name}</span>
          </button>
        )
      })}
    </div>
  )
}

/** 인덱스 붙이기 / 수정 / 떼기 */
export function IndexEditor({ page, onClose }: { page: Page; onClose: () => void }) {
  const cover = useStore((s) => s.notebook?.cover ?? COVERS[0].color)
  const setIndex = useStore((s) => s.setIndex)
  const [name, setName] = useState(page.index?.name ?? '')
  const [color, setColor] = useState(page.index?.color ?? cover)
  const pageNo = useStore((s) => s.pages.findIndex((p) => p.id === page.id) + 1)
  const ink = isLight(color) ? '#2b2a28' : '#f6f1e7'

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="modal small"
        role="dialog"
        aria-label="인덱스 스티커"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          setIndex(page.id, { name: name.trim(), color })
          onClose()
        }}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <h2>{page.index ? '인덱스 수정' : '인덱스 붙이기'}</h2>
        <p className="hint">{pageNo}쪽에 붙어요. 어느 페이지에서든 노트 오른쪽 가장자리에서 눌러 바로 이동해요.</p>
        <div className="index-preview">
          <span className="index-tab current preview" style={{ background: color, color: ink }}>
            <span className="index-tab-name">{name || '이름'}</span>
          </span>
        </div>
        <label className="field">
          <span>이름</span>
          <input autoFocus value={name} maxLength={8} placeholder="예: SEP, 독서 목록" onChange={(e) => setName(e.target.value)} />
        </label>
        <fieldset className="field">
          <legend>색</legend>
          <div className="cover-row">
            {COVERS.map((c) => (
              <button
                type="button"
                key={c.color}
                className={'swatch' + (c.color === color ? ' on' : '')}
                style={{ background: c.color }}
                title={c.name}
                aria-label={c.name}
                aria-pressed={c.color === color}
                onClick={() => setColor(c.color)}
              />
            ))}
          </div>
        </fieldset>
        <div className="form-actions">
          {page.index && (
            <button
              type="button"
              className="btn ghost danger"
              onClick={() => {
                setIndex(page.id, null)
                onClose()
              }}
            >
              떼기
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" className="btn ghost" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="btn primary" disabled={!name.trim()}>
            {page.index ? '저장' : '붙이기'}
          </button>
        </div>
      </form>
    </div>
  )
}

/** 모바일: 인덱스 목록 */
export function IndexList({ onClose, onAdd }: { onClose: () => void; onAdd: () => void }) {
  const pages = useStore((s) => s.pages)
  const hasIndex = useStore((s) => !!s.pages.find((p) => p.id === s.currentPageId)?.index)
  const tabs = pages
    .map((p, i) => ({ p, no: i + 1 }))
    .filter(({ p }) => p.index)
    .sort((a, b) => a.p.index!.order - b.p.index!.order)
  return (
    <div className="modal-backdrop sheet" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal small" role="dialog" aria-label="인덱스">
        <h2>인덱스</h2>
        {tabs.length === 0 && <p className="hint">아직 붙인 인덱스가 없어요.</p>}
        <ul className="index-list">
          {tabs.map(({ p, no }) => (
            <li key={p.id}>
              <button
                onClick={() => {
                  useStore.getState().goToPage(p.id)
                  onClose()
                }}
              >
                <span className="index-chip" style={{ background: p.index!.color }} />
                <span className="index-list-name">{p.index!.name}</span>
                <span className="muted">{no}쪽</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            닫기
          </button>
          <button type="button" className="btn primary" onClick={onAdd}>
            {hasIndex ? '이 페이지 인덱스 수정' : '이 페이지에 붙이기'}
          </button>
        </div>
      </div>
    </div>
  )
}
