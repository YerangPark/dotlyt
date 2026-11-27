import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { FONTS } from './fonts'
import { resetMeasureCache } from './geometry'
import { persist, useStore } from './store'
import { initSync, markLocalEdit } from './sync'
import './styles.css'

// 자동 저장: 입력이 1초 멈추면 브라우저(localStorage)에 저장
let timer: number | undefined
useStore.subscribe((s, prev) => {
  if (s.notebook === prev.notebook && s.pages === prev.pages && s.currentPageId === prev.currentPageId) return
  // 로그인했으면 서버에도 (지금 펼친 페이지만 바뀐 건 올리지 않는다)
  if (s.notebook !== prev.notebook || s.pages !== prev.pages) markLocalEdit()
  if (s.saveStatus !== 'saving') useStore.setState({ saveStatus: 'saving' })
  window.clearTimeout(timer)
  timer = window.setTimeout(() => useStore.setState({ saveStatus: persist() ? 'saved' : 'error' }), 1000)
})
window.addEventListener('pagehide', () => {
  if (useStore.getState().saveStatus === 'saving') persist()
})

// 글씨체가 늦게 로드되면 글자 폭을 다시 잰다 (한글 글씨체는 쓰는 글자에 따라 조금씩 더 불러온다)
const remeasure = () => {
  resetMeasureCache()
  useStore.setState((s) => ({ fontsVersion: s.fontsVersion + 1 }))
}
if (document.fonts) {
  Promise.allSettled(FONTS.filter((f) => !f.lazy).map((f) => document.fonts.load(`16px "${f.load}"`, '가A1'))).then(remeasure)
  document.fonts.addEventListener('loadingdone', remeasure)
}

initSync()

if (import.meta.env.DEV) (window as unknown as { __dotlyt: typeof useStore }).__dotlyt = useStore

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
