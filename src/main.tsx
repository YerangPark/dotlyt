import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { resetMeasureCache } from './geometry'
import { persist, useStore } from './store'
import './styles.css'

// 자동 저장: 입력이 1초 멈추면 브라우저(localStorage)에 저장
let timer: number | undefined
useStore.subscribe((s, prev) => {
  if (s.notebook === prev.notebook && s.pages === prev.pages && s.currentPageId === prev.currentPageId) return
  if (s.saveStatus !== 'saving') useStore.setState({ saveStatus: 'saving' })
  window.clearTimeout(timer)
  timer = window.setTimeout(() => useStore.setState({ saveStatus: persist() ? 'saved' : 'error' }), 1000)
})
window.addEventListener('pagehide', () => {
  if (useStore.getState().saveStatus === 'saving') persist()
})

// 글꼴이 늦게 로드되면 글자 폭을 다시 잰다
document.fonts?.load('16px "Gowun Dodum"', '가A').finally(() => {
  resetMeasureCache()
  useStore.setState((s) => ({ fontsVersion: s.fontsVersion + 1 }))
})

if (import.meta.env.DEV) (window as unknown as { __dotlyt: typeof useStore }).__dotlyt = useStore

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
