import { useState } from 'react'
import { ModalClose } from './ModalClose'
import { signInWithEmail, signInWithGoogle, signOut, useSync } from '../sync'

const STATE_LABEL = { off: '', syncing: '맞추는 중…', synced: '모든 기기와 맞춰졌어요', offline: '인터넷이 끊겼어요. 다시 연결되면 맞출게요', error: '맞추지 못했어요. 잠시 뒤 다시 할게요' }

/** 로그인·계정 창. 로그인은 선택: 안 해도 이 브라우저에서는 그대로 쓸 수 있다 */
export function AccountDialog({ onClose }: { onClose: () => void }) {
  const { email, state } = useSync()
  const [addr, setAddr] = useState('')
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal small account" role="dialog" aria-label={email ? '계정' : '로그인'} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <ModalClose onClose={onClose} />
        {email ? (
          <>
            <h2>계정</h2>
            <p className="account-email">{email}</p>
            <p className={'account-state ' + state}>{STATE_LABEL[state]}</p>
            <p className="hint">이 계정으로 로그인한 기기에서는 모두 같은 노트를 이어서 쓸 수 있어요.</p>
            <div className="form-actions">
              <button type="button" className="btn ghost" onClick={() => signOut()}>
                로그아웃
              </button>
              <button type="button" className="btn primary" onClick={onClose}>
                닫기
              </button>
            </div>
          </>
        ) : (
          <>
            <h2>로그인</h2>
            <p className="hint">로그인하면 노트가 계정에 저장돼서 PC, 휴대폰, 태블릿 어디서나 같은 노트를 이어서 쓸 수 있어요.</p>
            <ul className="account-note">
              <li>로그인 없이도 쓸 수 있어요.</li>
              <li>다만 노트가 이 브라우저에만 저장돼서, 브라우저 저장 공간 때문에 많이 쓰지는 못해요.</li>
              <li>다른 기기나 브라우저에서 열면 이어지지 않아요.</li>
            </ul>
            <button type="button" className="btn account-google" onClick={() => signInWithGoogle()}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
                <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.4-.2-2H12v3.9h6c-.1 1-.8 2.5-2.3 3.5v2.8h3.7c2.1-2 3.2-4.9 3.2-8.2z" />
                <path fill="#34A853" d="M12 23c3 0 5.6-1 7.4-2.7l-3.7-2.8c-1 .7-2.3 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2v2.9C3.8 20.6 7.6 23 12 23z" />
                <path fill="#FBBC05" d="M5.8 14.1c-.2-.7-.4-1.4-.4-2.1s.1-1.4.4-2.1V7H2C1.4 8.5 1 10.2 1 12s.4 3.5 1 5l3.8-2.9z" />
                <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2C17.6 2.1 15 1 12 1 7.6 1 3.8 3.4 2 7l3.8 2.9C6.7 7.3 9.1 5.4 12 5.4z" />
              </svg>
              Google로 계속하기
            </button>
            <div className="account-or">
              <span>또는 이메일로</span>
            </div>
            {sent ? (
              <p className="hint">
                <b>{addr}</b>로 로그인 링크를 보냈어요. 메일의 링크를 누르면 로그인돼요.
              </p>
            ) : (
              <form
                className="account-email-form"
                onSubmit={async (e) => {
                  e.preventDefault()
                  if (!/^\S+@\S+\.\S+$/.test(addr)) return setErr('이메일 주소를 확인해 주세요')
                  setBusy(true)
                  const msg = await signInWithEmail(addr.trim())
                  setBusy(false)
                  if (msg) setErr('링크를 보내지 못했어요. 잠시 뒤 다시 해 주세요')
                  else setSent(true)
                }}
              >
                <input
                  type="email"
                  className="input"
                  placeholder="name@example.com"
                  value={addr}
                  onChange={(e) => {
                    setAddr(e.target.value)
                    setErr(null)
                  }}
                  aria-label="이메일"
                />
                <button type="submit" className="btn primary" disabled={busy}>
                  링크 받기
                </button>
              </form>
            )}
            {err && <p className="account-err">{err}</p>}
            <p className="account-privacy">
              로그인하면{' '}
              <a href="/privacy" target="_blank" rel="noreferrer">
                개인정보처리방침
              </a>
              에 동의하는 것으로 봐요.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
