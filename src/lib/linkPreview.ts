import { supabase } from './supabase'

export interface LinkPreview {
  title?: string
  description?: string
  image?: string
}

/**
 * Auto-fill bookmark info from a pasted link. Browsers can't fetch
 * cross-origin HTML, so we go through a server-side helper first and fall
 * back to the public microlink.io API.
 *
 * In dev the helper is the Vite middleware at /api/link-preview; in prod
 * it's the deployed `link-preview` Supabase Edge Function. Both run the
 * same parser (supabase/functions/_shared/ogParse.ts).
 */
export async function fetchLinkPreview(rawUrl: string): Promise<LinkPreview | null> {
  const url = normalizeUrl(rawUrl)
  if (!url) return null

  try {
    if (import.meta.env.DEV) {
      const res = await fetch('/api/link-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data && (data.title || data.image)) return data as LinkPreview
      }
    } else {
      const { data, error } = await supabase.functions.invoke('link-preview', { body: { url } })
      if (!error && data && (data.title || data.image)) return data as LinkPreview
    }
  } catch {
    /* fall through to microlink */
  }

  try {
    const res = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`)
    if (!res.ok) return null
    const json = await res.json()
    if (json.status !== 'success') return null
    return {
      title: json.data?.title ?? undefined,
      description: json.data?.description ?? undefined,
      image: json.data?.image?.url ?? undefined,
    }
  } catch {
    return null
  }
}

export function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    return new URL(withProto).toString()
  } catch {
    return null
  }
}
