import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** True when both env vars are present; the app shows a setup screen otherwise. */
export const isConfigured = Boolean(url && anonKey)

// The placeholder values are never used: the app gates all data access
// behind `isConfigured`.
export const supabase = createClient(
  url ?? 'https://placeholder.supabase.co',
  anonKey ?? 'placeholder',
)

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>()

/**
 * Short-lived signed URL for a file in the private `bills` bucket. Only
 * members of the owning hangout can mint one (enforced by storage RLS).
 * Cached in memory so the URL remains stable across re-renders and actions.
 * Returns null if the file is gone or access is denied.
 */
export async function billUrl(path: string, expiresInSeconds = 3600): Promise<string | null> {
  const cached = signedUrlCache.get(path)
  const now = Date.now()
  if (cached && cached.expiresAt > now + 60_000) {
    return cached.url
  }
  const { data, error } = await supabase.storage.from('bills').createSignedUrl(path, expiresInSeconds)
  if (error || !data?.signedUrl) {
    const pub = supabase.storage.from('bills').getPublicUrl(path).data.publicUrl
    return pub
  }
  signedUrlCache.set(path, { url: data.signedUrl, expiresAt: now + expiresInSeconds * 1000 })
  return data.signedUrl
}
