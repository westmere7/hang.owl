import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { parseOpenGraph } from './supabase/functions/_shared/ogParse'

// ---- Build/version info, injected at build time ----
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version: string
}
const version = pkg.version
// Vercel exposes the commit SHA during the build; fall back to "local".
const commit = (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7) || 'local'
const buildTime = new Date().toISOString()
const versionInfo = { version, commit, buildTime }

/**
 * Runs the `link-preview` edge function locally during `npm run dev`, so
 * bookmark auto-fill works without deploying to Supabase. Same parser as
 * the deployed function (supabase/functions/link-preview).
 */
function linkPreviewDev(): Plugin {
  return {
    name: 'hangowl-link-preview-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/link-preview', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          res.setHeader('Content-Type', 'application/json')
          try {
            const { url } = JSON.parse(body || '{}')
            const parsed = new URL(url)
            if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Invalid protocol')

            const controller = new AbortController()
            const timer = setTimeout(() => controller.abort(), 8000)
            const upstream = await fetch(parsed.toString(), {
              signal: controller.signal,
              headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; HangOwlBot/1.0; +https://hangowl.app)',
                Accept: 'text/html,application/xhtml+xml',
              },
            })
            clearTimeout(timer)
            const html = (await upstream.text()).slice(0, 200_000)
            res.end(JSON.stringify(parseOpenGraph(html, parsed.toString())))
          } catch (e) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: String(e) }))
          }
        })
      })
    },
  }
}

/** Emits dist/version.json so a running client can detect new deploys. */
function emitVersion(): Plugin {
  return {
    name: 'hangowl-version',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(versionInfo) })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), linkPreviewDev(), emitVersion()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __BUILD_COMMIT__: JSON.stringify(commit),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
})
