/** 모든 창(모달) 오른쪽 위 닫기 버튼. 창을 스크롤해도 위에 붙어 있다 */
export function ModalClose({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-x-row">
      <button type="button" className="modal-x" onClick={onClose} aria-label="닫기" title="닫기 (Esc)">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  )
}
