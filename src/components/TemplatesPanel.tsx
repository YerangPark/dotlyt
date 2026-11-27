import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { PageThumb } from './PagesOverview'
import { ModalClose } from './ModalClose'

/**
 * 템플릿: 지금 페이지(펼침면)를 이름 붙여 저장하고, 나중에 새 페이지로 추가하거나 지금 페이지에 넣는다.
 * 저장은 이 브라우저에만 된다 (노트 데이터와 따로).
 */
export function TemplatesPanel({ onClose }: { onClose: () => void }) {
  const templates = useStore((s) => s.templates)
  const spread = useStore((s) => s.spread)
  const [name, setName] = useState('')
  const [scope, setScope] = useState<'page' | 'spread'>(spread ? 'spread' : 'page')
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const save = () => {
    const ok = useStore.getState().saveTemplate(name, scope)
    if (ok) {
      setName('')
      setError('')
    } else setError('저장하지 못했어요. 브라우저 저장 공간이 가득 찼을 수 있어요.')
  }
  const apply = (id: string, mode: 'new' | 'here') => {
    useStore.getState().applyTemplate(id, mode)
    onClose()
  }

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal templates" role="dialog" aria-label="템플릿">
        <ModalClose onClose={onClose} />
        <h2>템플릿</h2>

        <form
          className="tpl-save"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <label className="field">
            <span>지금 {scope === 'spread' ? '펼침면' : '페이지'}을 템플릿으로 저장</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 주간 계획, 습관 기록" maxLength={30} autoFocus />
          </label>
          <div className="tpl-save-row">
            {spread && (
              <div className="seg" role="radiogroup" aria-label="저장 범위">
                <button type="button" role="radio" aria-checked={scope === 'spread'} className={scope === 'spread' ? 'on' : ''} onClick={() => setScope('spread')}>
                  펼침면 (2쪽)
                </button>
                <button type="button" role="radio" aria-checked={scope === 'page'} className={scope === 'page' ? 'on' : ''} onClick={() => setScope('page')}>
                  지금 페이지만
                </button>
              </div>
            )}
            <button className="btn primary" type="submit">
              저장
            </button>
          </div>
          {error && <p className="tpl-error">{error}</p>}
        </form>

        <div className="tpl-list-head">
          <span>저장한 템플릿</span>
          <span className="muted">{templates.length}개</span>
        </div>
        {templates.length === 0 ? (
          <p className="tpl-empty muted">아직 없어요. 월간 달력, 주간 계획처럼 자주 그리는 틀을 한 번 그려 두고 저장해 보세요.</p>
        ) : (
          <ul className="tpl-list">
            {templates.map((t) => (
              <li key={t.id} className="tpl-card">
                <div className={'tpl-thumbs' + (t.pages.length > 1 ? ' two' : '')}>
                  {t.pages.map((p, i) => (
                    <div key={i} className="tpl-thumb" style={{ aspectRatio: `${p.cols} / ${p.rows}` }}>
                      <PageThumb page={{ id: t.id + i, cols: p.cols, rows: p.rows, elements: p.elements, createdAt: 0, updatedAt: 0 }} />
                    </div>
                  ))}
                </div>
                <div className="tpl-meta">
                  <strong>{t.name}</strong>
                  <span className="muted">{t.pages.length > 1 ? '펼침면' : '한 쪽'}</span>
                </div>
                {confirmDel === t.id ? (
                  <div className="tpl-actions">
                    <span className="tpl-ask">지울까요?</span>
                    <button className="btn ghost" onClick={() => setConfirmDel(null)}>
                      취소
                    </button>
                    <button
                      className="btn primary danger-fill"
                      onClick={() => {
                        useStore.getState().deleteTemplate(t.id)
                        setConfirmDel(null)
                      }}
                    >
                      지우기
                    </button>
                  </div>
                ) : (
                  <div className="tpl-actions">
                    <button className="btn primary" onClick={() => apply(t.id, 'new')}>
                      새 페이지로
                    </button>
                    <button className="btn" onClick={() => apply(t.id, 'here')} title="지금 페이지에 겹쳐 넣어요 (⌘Z로 되돌리기)">
                      현재 페이지에 삽입
                    </button>
                    <button className="icon-btn" onClick={() => setConfirmDel(t.id)} aria-label={`${t.name} 지우기`}>
                      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                        <path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13" />
                      </svg>
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="form-actions">
          <button className="btn ghost" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}
