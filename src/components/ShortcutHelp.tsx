import { useEffect } from 'react'
import { SHORTCUTS, type Shortcut } from '../shortcuts'
import { ModalClose } from './ModalClose'

const GROUPS: Shortcut['group'][] = ['도구', '글자', '편집', '페이지', '기타']

/** 단축키 목록 (? 키) */
export function ShortcutHelp({ onClose, onGuide }: { onClose: () => void; onGuide?: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal shortcut-help" role="dialog" aria-label="단축키">
        <ModalClose onClose={onClose} />
        <h2>단축키</h2>
        <p className="muted shortcut-note">글자 키는 글자를 쓰고 있지 않을 때 돼요. 한글 자판이어도 돼요.</p>
        <div className="shortcut-cols">
          {GROUPS.map((g) => (
            <section key={g}>
              <h3>{g}</h3>
              <dl>
                {SHORTCUTS.filter((s) => s.group === g).map((s) => (
                  <div key={s.id} className="shortcut-row">
                    <dt>{s.name}</dt>
                    <dd>
                      <kbd>{s.label}</kbd>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <div className="form-actions">
          {onGuide && (
            <button className="btn ghost" onClick={onGuide}>
              사용 안내 다시 보기
            </button>
          )}
          <button className="btn primary" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}
