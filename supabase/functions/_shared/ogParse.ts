// Pure OpenGraph/meta parser shared by BOTH runtimes:
//  - the deployed Supabase Edge Function (Deno), and
//  - the Vite dev-server middleware (Node), see vite.config.ts.
// Uses only universal JS (regex + URL) so it runs identically in each.

export interface LinkPreview {
  title?: string
  description?: string
  image?: string
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, '/')
}

function pickMeta(html: string, ...names: string[]): string | undefined {
  for (const name of names) {
    // Match <meta property="og:title" content="…"> in either attribute order.
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']*)["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${name}["']`, 'i'),
    ]
    for (const re of patterns) {
      const m = html.match(re)
      if (m?.[1]) return decodeEntities(m[1].trim())
    }
  }
  return undefined
}

/** Extract title / description / image from an HTML document. */
export function parseOpenGraph(html: string, baseUrl: string): LinkPreview {
  const title =
    pickMeta(html, 'og:title', 'twitter:title') ??
    (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim()
      ? decodeEntities(html.match(/<title[^>]*>([^<]*)<\/title>/i)![1].trim())
      : undefined)

  const description = pickMeta(html, 'og:description', 'twitter:description', 'description')

  let image = pickMeta(html, 'og:image:secure_url', 'og:image', 'twitter:image')
  if (image && !/^https?:\/\//i.test(image)) {
    try {
      image = new URL(image, baseUrl).toString()
    } catch {
      image = undefined
    }
  }

  return { title, description, image }
}
