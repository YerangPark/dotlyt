import { useRef, useState } from 'react'
import { useStore } from '../store'
import { STICKER_COLORS, isLight, type Page } from '../types'
import { ModalClose } from './ModalClose'

const STEP = 27 // 탭 하나의 세로 간격(px)
const TOP = 18

/** 손으로 붙인 듯 살짝 비뚤게: 페이지 id로 고정되는 -1.2° ~ 1.2° */
function tilt(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return ((Math.abs(h) % 25) - 12) / 10
}

const flagStyle = (color: string) =>
  ({ ['--c' as string]: color, color: isLight(color) ? '#2b2a28' : '#fbf8f1' }) as React.CSSProperties

/**
 * 노트 오른쪽 가장자리에 붙은 인덱스 스티커들. 실제 노트처럼 페이지 순서대로 위에서부터 붙는다.
 * 누르면 이동, 우클릭·길게 누르면 수정. 순서는 모든 페이지 모아보기에서 페이지를 옮기면 따라 바뀐다.
 */
export function IndexTabs({ shownIds, narrow, onEdit }: {
  shownIds: string[]
  narrow: boolean
  onEdit: (pageId: string) => void
}) {
  const pages = useStore((s) => s.pages)
  const currentId = useStore((s) => s.currentPageId)
  const tabs = pages.filter((p) => p.index)
  const longPress = useRef<number | undefined>(undefined)
  const pressed = useRef<string | null>(null)
  // 맨 아래 회색 + 스티커: 지금 펼친 면(한 장 또는 양쪽)에 아직 인덱스가 하나도 없을 때만. 붙이면 지금 페이지에
  const shownHasIndex = shownIds.some((id) => pages.find((p) => p.id === id)?.index)
  const addFor = shownHasIndex ? null : currentId && shownIds.includes(currentId) ? currentId : (shownIds[0] ?? null)

  return (
    <div className={'index-tabs' + (narrow ? ' narrow' : '')}>
      {tabs.map((p, slot) => {
        const tab = p.index!
        const current = shownIds.includes(p.id)
        return (
          <button
            key={p.id}
            className={'index-tab' + (current ? ' current' : '') + (tab.name ? '' : ' empty')}
            style={{ top: TOP + slot * STEP, ...flagStyle(tab.color), transform: `rotate(${tilt(p.id)}deg)` }}
            title={(tab.name || `${pages.findIndex((x) => x.id === p.id) + 1}쪽`) + (current ? ' · 눌러서 수정' : ' · 눌러서 이동')}
            onPointerDown={(e) => {
              if (e.pointerType === 'mouse' && e.button !== 0) return
              pressed.current = p.id
              window.clearTimeout(longPress.current)
              if (e.pointerType !== 'mouse') {
                longPress.current = window.setTimeout(() => {
                  pressed.current = null
                  onEdit(p.id)
                }, 550)
              }
            }}
            onPointerUp={() => {
              window.clearTimeout(longPress.current)
              if (pressed.current !== p.id) return
              pressed.current = null
              // 지금 펼친 페이지의 스티커를 누르면 수정, 다른 페이지 스티커면 그 페이지로 (한 번 더 누르면 수정)
              if (current) onEdit(p.id)
              else useStore.getState().goToPage(p.id)
            }}
            onPointerCancel={() => {
              window.clearTimeout(longPress.current)
              pressed.current = null
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
      {addFor && (
        <button
          className="index-tab add"
          style={{ top: TOP + tabs.length * STEP }}
          onClick={() => onEdit(addFor)}
          aria-label="이 페이지에 인덱스 붙이기"
          title="이 페이지에 인덱스 붙이기"
        >
          <span className="index-tab-name" aria-hidden>
            +
          </span>
        </button>
      )}
    </div>
  )
}

/** 인덱스 붙이기 / 수정 / 떼기 */
export function IndexEditor({ page, onClose }: { page: Page; onClose: () => void }) {
  const setIndex = useStore((s) => s.setIndex)
  const [name, setName] = useState(page.index?.name ?? '')
  const [color, setColor] = useState(page.index?.color ?? STICKER_COLORS[0].color)
  const pageNo = useStore((s) => s.pages.findIndex((p) => p.id === page.id) + 1)

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="modal small"
        role="dialog"
        aria-label="인덱스 스티커"
        onSubmit={(e) => {
          e.preventDefault()
          // 이름 없이 색 스티커만 붙여도 된다
          setIndex(page.id, { name: name.trim(), color })
          onClose()
        }}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <ModalClose onClose={onClose} />
        <h2>{page.index ? '인덱스 수정' : '인덱스 붙이기'}</h2>
        <p className="hint">{pageNo}쪽에 붙어요. 어느 페이지에서든 노트 오른쪽 가장자리에서 눌러 바로 이동해요.</p>
        <div className="index-preview">
          <span className="index-tab current preview" style={flagStyle(color)}>
            <span className="index-tab-name">{name}</span>
          </span>
        </div>
        <label className="field">
          <span>이름</span>
          <input autoFocus value={name} maxLength={8} placeholder="비워 두면 색만 (예: SEP, 독서 목록)" onChange={(e) => setName(e.target.value)} />
        </label>
        <fieldset className="field">
          <legend>색</legend>
          <div className="cover-row">
            {STICKER_COLORS.map((c) => (
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
          <button type="submit" className="btn primary">
            {page.index ? '저장' : '붙이기'}
          </button>
        </div>
      </form>
    </div>
  )
}
