/**
 * 키보드 단축키 한곳 정리: 키 처리(App), 툴팁, 단축키 목록 창이 모두 여기를 본다.
 * 글자 키는 글자를 쓰고 있지 않을 때만 듣는다. 한글 자판이어도 되게 e.code(자판 위치)로 맞춘다.
 */

export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
export const MOD = IS_MAC ? '⌘' : 'Ctrl+'
export const SHIFT = IS_MAC ? '⇧' : 'Shift+'

export type ShortcutId =
  | 'pen'
  | 'width'
  | 'dash'
  | 'double'
  | 'color'
  | 'highlight'
  | 'eraser'
  | 'select'
  | 'guides'
  | 'style'
  | 'bold'
  | 'undo'
  | 'redo'
  | 'copy'
  | 'cut'
  | 'paste'
  | 'duplicate'
  | 'delete'
  | 'escape'
  | 'prevPage'
  | 'nextPage'
  | 'newPage'
  | 'overview'
  | 'find'
  | 'templates'
  | 'help'

export interface Shortcut {
  id: ShortcutId
  /** 화면에 보이는 키 */
  label: string
  /** 무엇을 하는지 */
  name: string
  group: '도구' | '글자' | '편집' | '페이지' | '기타'
  /** 글자 키(수정 키 없이): e.code */
  code?: string
  /** ⌘/Ctrl과 같이 누르는 키: e.code */
  modCode?: string
  shift?: boolean
}

export const SHORTCUTS: Shortcut[] = [
  { id: 'pen', label: 'P', name: '볼펜 ↔ 연필', group: '도구', code: 'KeyP' },
  { id: 'width', label: 'W', name: '선 굵기 바꾸기', group: '도구', code: 'KeyW' },
  { id: 'dash', label: 'D', name: '점선 켜고 끄기', group: '도구', code: 'KeyD' },
  { id: 'double', label: `${SHIFT}D`, name: '두 줄 켜고 끄기', group: '도구', code: 'KeyD', shift: true },
  { id: 'color', label: 'C', name: '다음 색 (형광펜이면 형광펜 색)', group: '도구', code: 'KeyC' },
  { id: 'highlight', label: 'H', name: '형광펜', group: '도구', code: 'KeyH' },
  { id: 'eraser', label: 'E', name: '지우개', group: '도구', code: 'KeyE' },
  { id: 'select', label: 'V', name: '고르기', group: '도구', code: 'KeyV' },
  { id: 'guides', label: 'G', name: '분할 그리드 보기', group: '도구', code: 'KeyG' },
  { id: 'style', label: 'T', name: '글자 스타일', group: '글자', code: 'KeyT' },
  { id: 'bold', label: `${MOD}B`, name: '굵게', group: '글자', modCode: 'KeyB' },
  { id: 'undo', label: `${MOD}Z`, name: '되돌리기', group: '편집', modCode: 'KeyZ' },
  { id: 'redo', label: `${SHIFT}${MOD}Z`, name: '다시 실행', group: '편집', modCode: 'KeyZ', shift: true },
  { id: 'copy', label: `${MOD}C`, name: '복사', group: '편집', modCode: 'KeyC' },
  { id: 'cut', label: `${MOD}X`, name: '잘라내기', group: '편집', modCode: 'KeyX' },
  { id: 'paste', label: `${MOD}V`, name: '붙여넣기', group: '편집', modCode: 'KeyV' },
  { id: 'duplicate', label: `${MOD}D`, name: '복제', group: '편집', modCode: 'KeyD' },
  { id: 'delete', label: 'Delete', name: '고른 것 지우기', group: '편집' },
  { id: 'escape', label: 'Esc', name: '고르기·도구 끄기, 쓰기 마치기', group: '편집' },
  { id: 'prevPage', label: '←', name: '이전 페이지', group: '페이지' },
  { id: 'nextPage', label: '→', name: '다음 페이지', group: '페이지' },
  { id: 'newPage', label: 'N', name: '새 페이지', group: '페이지', code: 'KeyN' },
  { id: 'overview', label: 'O', name: '모든 페이지 모아보기', group: '페이지', code: 'KeyO' },
  { id: 'find', label: `${MOD}F`, name: '노트에서 글자 찾기', group: '기타', modCode: 'KeyF' },
  { id: 'templates', label: 'L', name: '템플릿 (저장·불러오기)', group: '기타', code: 'KeyL' },
  { id: 'help', label: '?', name: '단축키 목록', group: '기타', code: 'Slash', shift: true },
]

const BY_ID = Object.fromEntries(SHORTCUTS.map((s) => [s.id, s])) as Record<ShortcutId, Shortcut>
export const keyOf = (id: ShortcutId) => BY_ID[id].label

/** 키 입력이 어떤 단축키인지 (글자를 쓰는 중인지는 부르는 쪽에서 거른다) */
export function matchShortcut(e: KeyboardEvent): ShortcutId | null {
  const mod = e.metaKey || e.ctrlKey
  for (const s of SHORTCUTS) {
    if (mod && s.modCode === e.code && !!s.shift === e.shiftKey) return s.id
    if (!mod && !e.altKey && s.code === e.code && !!s.shift === e.shiftKey) return s.id
  }
  return null
}
