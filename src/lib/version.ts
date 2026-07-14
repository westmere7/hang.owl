import { useEffect, useState } from 'react'

/** Build-time version info, injected by Vite (see vite.config.ts). */
export const APP_VERSION = __APP_VERSION__
export const BUILD_COMMIT = __BUILD_COMMIT__
export const BUILD_TIME = __BUILD_TIME__

interface VersionInfo {
  version: string
  commit: string
  buildTime: string
}

/**
 * Detects when a newer build has been deployed than the one this tab is
 * running. Polls the deployed /version.json (emitted at build time) on an
 * interval and when the tab regains focus. SPAs cache their JS bundle, so
 * without this a long-lived tab would silently run stale code.
 */
export function useUpdateAvailable(): boolean {
  const [available, setAvailable] = useState(false)

  useEffect(() => {
    // No deployed version.json in dev, and nothing to update to.
    if (import.meta.env.DEV) return
    let stopped = false

    const check = async () => {
      try {
        const res = await fetch(`/version.json?_=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) return
        const info = (await res.json()) as VersionInfo
        // buildTime is unique per build — the reliable "did it change" signal.
        if (!stopped && info.buildTime && info.buildTime !== BUILD_TIME) {
          setAvailable(true)
        }
      } catch {
        /* offline / transient — try again next tick */
      }
    }

    void check()
    const id = window.setInterval(check, 5 * 60 * 1000)
    const onFocus = () => void check()
    window.addEventListener('focus', onFocus)
    return () => {
      stopped = true
      window.clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  return available
}
