// Supabase Edge Function: link-preview
// Fetches a URL server-side and returns its OpenGraph title / description /
// image so the app can auto-fill bookmark cards from a pasted link.
// The parsing logic is shared with the local Vite dev middleware — see
// ../_shared/ogParse.ts and vite.config.ts.
// Deploy with: supabase functions deploy link-preview --no-verify-jwt

import { parseOpenGraph } from '../_shared/ogParse.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { url } = await req.json()
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Invalid protocol')

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(parsed.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HangOwlBot/1.0; +https://hangowl.app)',
        Accept: 'text/html,application/xhtml+xml',
      },
    })
    clearTimeout(timer)

    // Only read the first chunk — meta tags live in <head>.
    const html = (await res.text()).slice(0, 200_000)
    const preview = parseOpenGraph(html, parsed.toString())

    return new Response(JSON.stringify(preview), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
