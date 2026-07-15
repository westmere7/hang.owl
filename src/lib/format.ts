export function fmtMoney(amount: number, currency: string): string {
  try {
    // Let Intl use each currency's natural precision (VND/JPY = 0 decimals, USD = 2).
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

/** Minor-unit digit count for a currency (VND/JPY → 0, USD → 2). */
export function currencyDecimals(currency: string): number {
  try {
    return (
      new Intl.NumberFormat(undefined, { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    )
  } catch {
    return 2
  }
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function fmtDateFull(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function dateRange(start: string | null, end: string | null): string {
  if (start && end) return `${fmtDate(start)} – ${fmtDate(end)}`
  if (start) return `From ${fmtDate(start)}`
  if (end) return `Until ${fmtDate(end)}`
  return 'No dates yet'
}

/** "example.com" from any URL, for compact bookmark cards. */
export function domainOf(url: string | null): string {
  if (!url) return ''
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/**
 * A link that opens the given location. If it's already a URL (e.g. a
 * pasted Google Maps link) use it directly; otherwise search Maps for the
 * address/place name.
 */
export function mapsUrl(location: string): string {
  const trimmed = location.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}`
}

/** datetime-local input value from an ISO string (local time). */
export function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
