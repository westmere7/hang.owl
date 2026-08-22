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

/**
 * Short-lived signed URL for a file in the private `bills` bucket. Only
 * members of the owning hangout can mint one (enforced by storage RLS).
 * Returns null if the file is gone or access is denied.
 */
export async function billUrl(path: string, expiresInSeconds = 3600): Promise<string | null> {
  const { data, error } = await supabase.storage.from('bills').createSignedUrl(path, expiresInSeconds)
  if (error) return null
  return data.signedUrl
}
