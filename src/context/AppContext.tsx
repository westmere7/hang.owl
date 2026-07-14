import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { User } from '@supabase/supabase-js'
import type { Profile } from '../types'
import { isConfigured, supabase } from '../lib/supabase'
import { errorMessage, retry } from '../lib/errors'
import {
  cacheName,
  ensureSession,
  loadOrCreateProfile,
  saveDisplayName,
} from '../lib/identity'

export type ThemePref = 'light' | 'dark' | 'system'
const THEME_KEY = 'hangowl.theme'

export interface SignUpResult {
  /** True once the account is active and can create hangouts. */
  active: boolean
  /** Set when Supabase requires the user to confirm their email first. */
  needsEmailConfirm: boolean
}

interface AppState {
  ready: boolean
  bootError: string | null
  userId: string | null
  profile: Profile | null
  /** Signed in with a real account (not an anonymous guest session). */
  isAuthed: boolean
  email: string | null
  setName: (name: string) => Promise<void>
  signUp: (email: string, password: string, name: string) => Promise<SignUpResult>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  theme: ThemePref
  setTheme: (t: ThemePref) => void
  settingsOpen: boolean
  setSettingsOpen: (open: boolean) => void
}

const Ctx = createContext<AppState | null>(null)

export function useApp(): AppState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useApp outside AppProvider')
  return ctx
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [bootError, setBootError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isAnon, setIsAnon] = useState(true)
  const [email, setEmail] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [theme, setThemeState] = useState<ThemePref>(() => {
    const stored = localStorage.getItem(THEME_KEY)
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
  })
  const cancelledRef = useRef(false)

  // Apply .dark on <html>, tracking the OS preference in "system" mode.
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches)
      document.documentElement.classList.toggle('dark', dark)
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])

  const setTheme = useCallback((t: ThemePref) => {
    localStorage.setItem(THEME_KEY, t)
    setThemeState(t)
  }, [])

  // Mirror a Supabase user (anonymous or permanent) into app state.
  const applyUser = useCallback(async (user: User) => {
    const prof = await loadOrCreateProfile(user.id)
    if (cancelledRef.current) return
    setUserId(user.id)
    setProfile(prof)
    setIsAnon(!!user.is_anonymous)
    setEmail(user.email ?? null)
    if (prof.display_name) cacheName(prof.display_name)
  }, [])

  // Bootstrap: ensure a session (anonymous if none), then track auth changes.
  useEffect(() => {
    if (!isConfigured) {
      setReady(true)
      return
    }
    cancelledRef.current = false
    ;(async () => {
      try {
        // The first Supabase call can blip on a cold start — retry before
        // giving up so a single transient failure doesn't wall off the app.
        const session = await retry(() => ensureSession())
        await applyUser(session.user)
      } catch (e) {
        if (!cancelledRef.current) setBootError(errorMessage(e))
      } finally {
        if (!cancelledRef.current) setReady(true)
      }
    })()

    // Keeps state in sync on sign-in / sign-up (USER_UPDATED) / token refresh.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelledRef.current || event === 'SIGNED_OUT') return
      if (session?.user) void applyUser(session.user)
    })

    return () => {
      cancelledRef.current = true
      sub.subscription.unsubscribe()
    }
  }, [applyUser])

  const setName = useCallback(
    async (name: string) => {
      if (!userId) return
      await saveDisplayName(userId, name)
      setProfile((p) => (p ? { ...p, display_name: name } : p))
    },
    [userId],
  )

  // Upgrade the current anonymous session into a permanent account, keeping
  // the same user id — so hangouts/memberships made as a guest carry over.
  const signUp = useCallback(
    async (emailInput: string, password: string, name: string): Promise<SignUpResult> => {
      const { data, error } = await supabase.auth.updateUser({
        email: emailInput,
        password,
        data: { display_name: name },
      })
      if (error) throw error
      if (name && userId) await saveDisplayName(userId, name)
      const user = data.user
      const active = !!user && !user.is_anonymous && !!user.email
      return { active, needsEmailConfirm: !active }
    },
    [userId],
  )

  const signIn = useCallback(async (emailInput: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: emailInput, password })
    if (error) throw error
    // applyUser runs via the SIGNED_IN auth-state event.
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    // Drop back to a fresh anonymous guest session so the app stays usable.
    const { data } = await supabase.auth.signInAnonymously()
    if (data.user) await applyUser(data.user)
  }, [applyUser])

  const value = useMemo(
    () => ({
      ready,
      bootError,
      userId,
      profile,
      isAuthed: !!userId && !isAnon,
      email,
      setName,
      signUp,
      signIn,
      signOut,
      theme,
      setTheme,
      settingsOpen,
      setSettingsOpen,
    }),
    [ready, bootError, userId, profile, isAnon, email, setName, signUp, signIn, signOut, theme, setTheme, settingsOpen],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
