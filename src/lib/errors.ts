/** Best-effort human-readable message from anything thrown (Error, Supabase
 * error object, string, …). Avoids the "[object Object]" that String() gives
 * for plain error objects. */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  if (e && typeof e === 'object') {
    const m = (e as { message?: unknown }).message
    if (typeof m === 'string' && m) return m
    try {
      return JSON.stringify(e)
    } catch {
      return String(e)
    }
  }
  return String(e)
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Run `fn`, retrying up to `attempts` times with linear backoff. Useful for
 * the initial Supabase handshake, which can blip on a cold start. */
export async function retry<T>(fn: () => Promise<T>, attempts = 3, baseDelayMs = 600): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      if (i < attempts - 1) await sleep(baseDelayMs * (i + 1))
    }
  }
  throw lastErr
}
