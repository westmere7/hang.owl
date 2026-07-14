import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Profile } from '../types'

const NAME_KEY = 'hangowl.name'

/**
 * Guests never see a login screen: we silently create an anonymous
 * Supabase session (persisted in localStorage) and hang a profile row
 * off it. The display name is additionally mirrored to a cookie +
 * localStorage so a returning guest is never asked for it again.
 */
export async function ensureSession(): Promise<Session> {
  const { data } = await supabase.auth.getSession()
  if (data.session) return data.session
  const { data: anon, error } = await supabase.auth.signInAnonymously()
  if (error || !anon.session) {
    throw new Error(
      `Could not start a session (is Anonymous sign-in enabled in Supabase Auth settings?): ${error?.message ?? 'unknown error'}`,
    )
  }
  return anon.session
}

export async function loadOrCreateProfile(userId: string): Promise<Profile> {
  const { data: existing } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (existing) return existing as Profile

  // A returning guest on a fresh session still has their name cached.
  const name = getCachedName() ?? ''
  const { data: created, error } = await supabase
    .from('profiles')
    .insert({ id: userId, display_name: name })
    .select('*')
    .single()
  if (error) throw error
  return created as Profile
}

export async function saveDisplayName(userId: string, name: string): Promise<void> {
  cacheName(name)
  const { error } = await supabase
    .from('profiles')
    .update({ display_name: name })
    .eq('id', userId)
  if (error) throw error
}

export function cacheName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name)
    // 1-year cookie, as a second layer of persistence for guests.
    document.cookie = `${NAME_KEY}=${encodeURIComponent(name)};path=/;max-age=31536000;SameSite=Lax`
  } catch {
    /* storage unavailable (private mode) — non-fatal */
  }
}

export function getCachedName(): string | null {
  try {
    const fromStorage = localStorage.getItem(NAME_KEY)
    if (fromStorage) return fromStorage
    const match = document.cookie.match(new RegExp(`(?:^|; )${NAME_KEY.replace('.', '\\.')}=([^;]*)`))
    return match ? decodeURIComponent(match[1]) : null
  } catch {
    return null
  }
}
