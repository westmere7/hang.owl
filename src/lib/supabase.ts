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

/** Public URL for a file in the `bills` storage bucket. */
export function billUrl(path: string): string {
  return supabase.storage.from('bills').getPublicUrl(path).data.publicUrl
}
