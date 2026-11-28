import { createClient, type Session } from '@supabase/supabase-js'
import { create } from 'zustand'
import { DATA_VERSION, useStore, widenOldPage } from './store'
import type { Notebook, Page } from './types'

/**
 * 로그인하면 노트를 Supabase에 저장해서 여러 기기에서 같이 쓴다.
 * - 로그인 없이도 지금처럼 이 브라우저에 저장된다 (로그인은 선택).
 * - 고치면 잠시 뒤 서버에 올리고, 앱으로 돌아올 때마다 서버 것을 확인한다.
 * - 두 기기에서 고쳤으면 나중에 고친 쪽이 이긴다. 서버 것으로 바꾸기 전 이 기기 것은 따로 남겨 둔다(dotlyt:v1:backup).
 */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const supabase = url && key ? createClient(url, key) : null

const META_KEY = 'dotlyt:sync'
const BACKUP_KEY = 'dotlyt:v1:backup'

type SyncState = 'off' | 'syncing' | 'synced' | 'offline' | 'error'
export const useSync = create<{ enabled: boolean; email: string | null; state: SyncState }>(() => ({
  enabled: !!supabase,
  email: null,
  state: 'off',
}))

/** editedAt: 이 기기에서 마지막으로 고친 때, syncedAt: 서버와 같아진 때 (서버 updated_at 기준) */
type Meta = { editedAt: number; syncedAt: number; userId?: string }
const readMeta = (): Meta | null => {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) || 'null')
  } catch {
    return null
  }
}
const writeMeta = (m: Meta) => {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m))
  } catch {
    /* 무시 */
  }
}
const lastPageEdit = () => Math.max(0, ...useStore.getState().pages.map((p) => p.updatedAt ?? 0))
const meta = (): Meta => readMeta() ?? { editedAt: lastPageEdit(), syncedAt: 0 }

let session: Session | null = null
let ready = false // 처음 서버와 맞추기 전에는 올리지 않는다 (새 기기의 빈 노트로 서버를 덮지 않게)
let applying = false
let pushTimer: number | undefined
const set = (s: Partial<ReturnType<typeof useSync.getState>>) => useSync.setState(s)

/** 노트를 고칠 때마다 (main.tsx에서) */
export function markLocalEdit() {
  if (applying) return
  writeMeta({ ...meta(), editedAt: Date.now() })
  if (!session || !ready) return
  window.clearTimeout(pushTimer)
  set({ state: 'syncing' })
  pushTimer = window.setTimeout(push, 1500)
}

async function push() {
  if (!supabase || !session) return
  const { notebook, pages } = useStore.getState()
  if (!notebook) return set({ state: 'synced' })
  const m = meta()
  const at = m.editedAt || Date.now()
  set({ state: 'syncing' })
  const { error } = await supabase
    .from('notebooks')
    .upsert({ user_id: session.user.id, data: { notebook, pages, v: DATA_VERSION }, updated_at: new Date(at).toISOString() })
  if (error) return set({ state: navigator.onLine ? 'error' : 'offline' })
  // 올리는 사이에 또 고쳤으면 그 시간은 그대로 둔다
  writeMeta({ ...meta(), syncedAt: at, userId: session.user.id })
  set({ state: meta().editedAt > at ? 'syncing' : 'synced' })
}

function apply(data: { notebook: Notebook | null; pages: Page[] }, at: number) {
  const s = useStore.getState()
  if (s.notebook) {
    try {
      localStorage.setItem(BACKUP_KEY, JSON.stringify({ notebook: s.notebook, pages: s.pages, savedAt: Date.now() }))
    } catch {
      /* 무시 */
    }
  }
  // 다른 기기가 예전 규격으로 올린 것도 새 규격으로
  data = { ...data, pages: data.pages.map(widenOldPage) }
  const keep = data.pages.some((p) => p.id === s.currentPageId)
  applying = true
  useStore.setState({
    notebook: data.notebook,
    pages: data.pages,
    currentPageId: keep ? s.currentPageId : (data.pages[data.pages.length - 1]?.id ?? null),
    history: {},
    selection: [],
    cursor: null,
    popup: null,
  })
  applying = false
  writeMeta({ editedAt: at, syncedAt: at, userId: session?.user.id })
}

/** 서버 것과 이 기기 것을 맞춘다: 나중에 고친 쪽이 이긴다 */
async function reconcile() {
  if (!supabase || !session) return
  set({ state: 'syncing' })
  const { data, error } = await supabase.from('notebooks').select('data, updated_at').eq('user_id', session.user.id).maybeSingle()
  if (error) return set({ state: navigator.onLine ? 'error' : 'offline' })
  ready = true
  const m = meta()
  // 다른 계정으로 맞춘 적이 있는 기기면 이 기기 것은 아직 이 계정과 맞춘 적이 없는 것으로
  const synced = m.userId === session.user.id ? m.syncedAt : 0
  const local = useStore.getState()
  if (!data) return local.notebook ? push() : set({ state: 'synced' })
  const remoteAt = Date.parse(data.updated_at)
  if (remoteAt === synced) return m.editedAt > synced ? push() : set({ state: 'synced' })
  // 이 기기가 이 계정과 처음 맞추는 거면 계정에 있는 노트를 쓴다 (새 기기에서 만든 빈 노트로 덮지 않게, 이 기기 것은 백업)
  const localNewer = synced > 0 && !!local.notebook && m.editedAt > synced && m.editedAt > remoteAt
  if (localNewer) return push()
  apply(data.data as { notebook: Notebook | null; pages: Page[] }, remoteAt)
  set({ state: 'synced' })
}

export async function signInWithGoogle() {
  await supabase?.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } })
}

/** 이메일로 받은 링크를 누르면 로그인 (비밀번호 없음) */
export async function signInWithEmail(email: string): Promise<string | null> {
  if (!supabase) return '연결 설정이 없어요'
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } })
  return error ? error.message : null
}

export async function signOut() {
  await supabase?.auth.signOut()
}

export function initSync() {
  if (!supabase) return
  const onSession = (s: Session | null) => {
    const was = session?.user.id
    session = s
    set({ email: s?.user.email ?? null, state: s ? useSync.getState().state : 'off' })
    if (s && s.user.id !== was) {
      ready = false
      void reconcile()
    }
  }
  supabase.auth.getSession().then(({ data }) => onSession(data.session))
  supabase.auth.onAuthStateChange((_e, s) => onSession(s))
  // 다른 기기에서 고친 것: 앱으로 돌아올 때 확인
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && session) void reconcile()
  })
  window.addEventListener('online', () => session && void reconcile())
  window.addEventListener('offline', () => session && set({ state: 'offline' }))
}
