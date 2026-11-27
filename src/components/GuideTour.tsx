import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store'
import type { El } from '../types'

/**
 * 처음 쓰는 사람을 위한 단계별 안내. 화면의 해당 버튼·영역을 은은한 테두리로 짚고 옆에 말풍선을 띄운다.
 * 직접 해 보면(예: 그리드를 켜면) 알아서 다음 단계로. '다음'·'건너뛰기'도 언제나 있다.
 */

const GUIDE_KEY = 'dotlyt:guide'

type State = ReturnType<typeof useStore.getState>
const count = (s: State, type: El['type']) => s.pages.reduce((n, p) => n + p.elements.filter((e) => e.type === type).length, 0)

interface Step {
  /** 짚을 곳 (없거나 화면에 없으면 말풍선만 아래 가운데에) */
  target?: string
  title: string
  body: string
  /** 이 단계에서 해 보라는 것을 했는지: 단계를 시작할 때 값과 비교 */
  measure?: (s: State) => number | boolean
}

const STEPS: Step[] = [
  {
    target: '.page-wrap .page',
    title: '빈 칸을 눌러 써 보세요',
    body: '도트 칸 아무 데나 누르고 타이핑하면 그 칸부터 글자가 써져요. Enter를 누르면 다음 줄로.',
    measure: (s) => count(s, 'text') + count(s, 'box'),
  },
  {
    target: '.page-wrap .page',
    title: '할 일은 기호로',
    body: '빈 칸을 두 번 누르면 기호 창이 떠요. 글자를 쓰기 전에 빈 칸에서 * 와 띄어쓰기를 쳐도 할 일 기호가 생겨요.',
    measure: (s) => count(s, 'bullet'),
  },
  {
    target: '.page-wrap .page',
    title: '점에서 끌면 선이 그어져요',
    body: '점 가까이에서 가로나 세로로 끌어 보세요. 칸 가운데에서 끌면 제목처럼 큰 글자를 쓰는 네모칸이 생겨요.',
    measure: (s) => count(s, 'line') + count(s, 'box'),
  },
  {
    target: '.toolbar [data-tip="분할 그리드"]',
    title: '그리드를 켜 보세요!',
    body: '종이 가장자리에 ½ ⅓ ⅔ 지점이 표시돼서 페이지를 나누어 쓰기 쉬워요. 단축키 G',
    measure: (s) => s.showGuides,
  },
  {
    target: '.toolbar [data-tip="형광펜"]',
    title: '형광펜으로 강조',
    body: '형광펜을 켜고 글자 위를 끌면 곧게 칠해져요. 한 칸만 누르면 콕 찍은 점. 단축키 H',
    measure: (s) => count(s, 'mark'),
  },
  {
    target: '[data-shortcut="style"]',
    title: '글씨체와 정렬',
    body: '글자를 쓰거나 고른 다음 Aa에서 손글씨 글씨체, 크기, 정렬을 바꿀 수 있어요. 단축키 T',
  },
  {
    target: '.index-tab.add',
    title: '인덱스 스티커 붙이기',
    body: '노트 오른쪽 + 스티커로 이 페이지에 인덱스를 붙여 두면, 어느 페이지에서든 스티커를 눌러 바로 와요.',
    measure: (s) => s.pages.filter((p) => p.index).length,
  },
  {
    // PC는 노트 옆 버튼, 휴대폰은 위쪽 › (앞에 쓴 것부터 화면에 보이는 것을 짚는다)
    target: '.turn-btn.next | .pager [data-tip="다음 페이지"]',
    title: '다음 장으로',
    body: '노트 옆이나 위쪽 › 를 누르면 넘어가요. 마지막 장에서는 + 로 새 장을 이어 쓸 수 있어요.',
  },
  {
    title: '이제 자유롭게 써 보세요',
    body: '? 를 누르면(휴대폰은 위쪽 ⋯ → 도움말) 단축키 목록이 나와요. 이 안내도 그 창에서 다시 볼 수 있어요.',
  },
]

export const guideDone = () => {
  try {
    return localStorage.getItem(GUIDE_KEY) === 'done'
  } catch {
    return true
  }
}
const markDone = () => {
  try {
    localStorage.setItem(GUIDE_KEY, 'done')
  } catch {
    /* 저장 못 해도 이번엔 닫힌다 */
  }
}

type Rect = { left: number; top: number; width: number; height: number }

export function GuideTour({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0)
  const [cheer, setCheer] = useState(false)
  const [rect, setRect] = useState<Rect | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number; side: 'right' | 'left' | 'top' | 'bottom' | 'center' }>({ left: 0, top: 0, side: 'center' })
  const bubbleRef = useRef<HTMLDivElement>(null)
  const step = STEPS[i]
  const last = i === STEPS.length - 1

  const finish = () => {
    markDone()
    onClose()
  }
  const next = () => (last ? finish() : setI((n) => n + 1))

  // 해 보라는 것을 하면 칭찬하고 다음으로
  useEffect(() => {
    setCheer(false)
    if (!step.measure) return
    const start = step.measure(useStore.getState())
    let t = 0
    const unsub = useStore.subscribe((s) => {
      const v = step.measure!(s)
      const did = typeof v === 'boolean' ? v && !start : v > (start as number)
      if (did && !t) {
        setCheer(true)
        t = window.setTimeout(() => setI((n) => Math.min(n + 1, STEPS.length - 1)), 900)
      }
    })
    return () => {
      unsub()
      window.clearTimeout(t)
    }
  }, [i]) // eslint-disable-line react-hooks/exhaustive-deps

  // 짚을 곳을 따라간다 (창 크기·페이지 넘기기 등으로 움직이므로 매 프레임)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      // 같은 버튼이 PC·휴대폰 도구 모음에 둘 다 있을 수 있어서 화면에 보이는 것을, ' | '로 나눈 후보는 앞에서부터
      const visible = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)].find((e) => e.getBoundingClientRect().width > 0)
      const el = step.target ? step.target.split(' | ').map(visible).find(Boolean) ?? null : null
      const r = el?.getBoundingClientRect()
      const next = r && r.width > 0 ? { left: r.left, top: r.top, width: r.width, height: r.height } : null
      setRect((prev) =>
        prev && next && Math.abs(prev.left - next.left) < 0.5 && Math.abs(prev.top - next.top) < 0.5 && Math.abs(prev.width - next.width) < 0.5 && Math.abs(prev.height - next.height) < 0.5
          ? prev
          : next,
      )
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [step.target])

  // 말풍선 자리: 짚은 곳 옆에서 화면 안에 들어가는 쪽 (오른쪽 → 왼쪽 → 아래 → 위). 없으면 아래 가운데
  useLayoutEffect(() => {
    const b = bubbleRef.current
    if (!b) return
    const bw = b.offsetWidth
    const bh = b.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight
    const gap = 14
    // 휴대폰은 도구 모음이 아래에 가로로 있다: 말풍선이 그 위를 덮지 않게 그 위까지만
    const tb = document.querySelector('.toolbar')?.getBoundingClientRect()
    const bottomBar = tb && tb.width > tb.height ? tb.top : vh
    const clampX = (x: number) => Math.min(Math.max(12, x), vw - bw - 12)
    const clampY = (y: number) => Math.min(Math.max(12, y), bottomBar - bh - 12)
    if (!rect) return setPos({ left: (vw - bw) / 2, top: bottomBar - bh - 16, side: 'center' })
    // 페이지처럼 큰 곳은 안쪽 위에 얹는다
    if (rect.width > vw * 0.3 && rect.height > vh * 0.3)
      return setPos({ left: clampX(rect.left + rect.width / 2 - bw / 2), top: clampY(rect.top + Math.min(rect.height * 0.55, rect.height - bh - 24)), side: 'center' })
    const cy = rect.top + rect.height / 2
    const cx = rect.left + rect.width / 2
    const opts = [
      { side: 'left' as const, left: rect.left - gap - bw, top: clampY(cy - bh / 2), ok: rect.left - gap - bw >= 12 },
      { side: 'right' as const, left: rect.left + rect.width + gap, top: clampY(cy - bh / 2), ok: rect.left + rect.width + gap + bw <= vw - 12 },
      { side: 'bottom' as const, left: clampX(cx - bw / 2), top: rect.top + rect.height + gap, ok: rect.top + rect.height + gap + bh <= vh - 12 },
      { side: 'top' as const, left: clampX(cx - bw / 2), top: rect.top - gap - bh, ok: rect.top - gap - bh >= 12 },
    ]
    // 아래 가로 도구 모음(휴대폰) 안의 버튼이면 위에, 그 밖에는 왼쪽 → 오른쪽 → 아래 → 위
    const inBottomBar = tb && tb.width > tb.height && rect.top >= tb.top - 1
    // 위쪽 막대 버튼이면 아래에
    const inTopBar = rect.top + rect.height < 90
    const order = inBottomBar ? [opts[3], opts[0], opts[1], opts[2]] : inTopBar ? [opts[2], opts[0], opts[1], opts[3]] : opts
    const pick = order.find((o) => o.ok) ?? opts[3]
    setPos({ left: pick.left, top: pick.top, side: pick.side })
  }, [rect, i, cheer])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.modal, .overview, .style-panel, .sym-popup')) {
        e.stopPropagation()
        finish()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  const big = rect && rect.width > window.innerWidth * 0.3 && rect.height > window.innerHeight * 0.3
  return createPortal(
    <>
      {rect && (
        <div
          className={'guide-ring' + (big ? ' big' : '')}
          style={{ left: rect.left - 4, top: rect.top - 4, width: rect.width + 8, height: rect.height + 8 }}
          aria-hidden
        />
      )}
      <div key={i} ref={bubbleRef} className={'guide-bubble ' + pos.side} style={{ left: pos.left, top: pos.top }} role="dialog" aria-label="사용 안내">
        <div className="guide-top">
          <span className="guide-step">
            {i + 1} / {STEPS.length}
          </span>
          <button className="guide-skip" onClick={finish}>
            {last ? '닫기' : '건너뛰기'}
          </button>
        </div>
        <h3 className="guide-title">{cheer ? '잘했어요!' : step.title}</h3>
        <p className="guide-body">{step.body}</p>
        <div className="guide-dots" aria-hidden>
          {STEPS.map((_, k) => (
            <span key={k} className={k === i ? 'on' : k < i ? 'done' : undefined} />
          ))}
        </div>
        <div className="guide-actions">
          {i > 0 && (
            <button className="btn ghost" onClick={() => setI((n) => n - 1)}>
              이전
            </button>
          )}
          <button className="btn primary" onClick={next}>
            {last ? '시작하기' : step.measure ? '다음' : '알겠어요'}
          </button>
        </div>
      </div>
    </>,
    document.body,
  )
}
