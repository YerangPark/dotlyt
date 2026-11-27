import { useStore } from '../store'
import { ModalClose } from './ModalClose'

/** 페이지(펼침면) 지우기 확인. 되돌릴 수 없어서 쓴 내용과 스티커 수를 보여준다. */
export function DeletePageDialog({ ids, label, onClose }: { ids: string[]; label: string; onClose: () => void }) {
  const allPages = useStore((s) => s.pages)
  const pages = allPages.filter((p) => ids.includes(p.id))
  const deletePages = useStore((s) => s.deletePages)
  const count = pages.reduce((n, p) => n + p.elements.length, 0)
  const stickers = pages.filter((p) => p.index).map((p) => p.index!.name)
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal small" role="alertdialog" aria-label="페이지 지우기" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <ModalClose onClose={onClose} />
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
