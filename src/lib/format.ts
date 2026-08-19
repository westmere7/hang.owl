export function fmtMoney(amount: number, currency: string): string {
  const cur = (currency || 'USD').toUpperCase()
  try {
    if (cur === 'VND') {
      return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND',
        maximumFractionDigits: 0,
      }).format(Math.round(amount))
    }
    if (cur === 'AUD') {
      return new Intl.NumberFormat('en-AU', {
        style: 'currency',
        currency: 'AUD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount)
    }
    if (cur === 'USD') {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount)
    }
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(amount)
  } catch {
    const dec = currencyDecimals(cur)
    return `${amount.toFixed(dec)} ${cur}`
  }
}

/** Minor-unit digit count for a currency (VND → 0, USD/AUD → 2). */
export function currencyDecimals(currency: string): number {
  const cur = (currency || 'USD').toUpperCase()
  if (cur === 'VND') return 0
  if (cur === 'USD' || cur === 'AUD') return 2
  try {
    return (
      new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).resolvedOptions()
        .maximumFractionDigits ?? 2
    )
  } catch {
    return 2
  }
}

/**
 * Format a raw or formatted string into display string with suitable thousand/decimal separators.
 * For VND: integer only, grouped with commas (e.g. 1000000 -> 1,000,000).
 * For USD/AUD: up to 2 decimal places, grouped with commas (e.g. 1000.5 -> 1,000.5, 1000.50 -> 1,000.50).
 */
export function formatCurrencyInput(value: string | number, currency: string): string {
  if (value === '' || value === null || value === undefined) return ''
  const str = String(value)
  const cur = (currency || 'USD').toUpperCase()
  const isZeroDecimal = cur === 'VND'

  // Remove everything except digits and decimal point
  const cleaned = str.replace(/[^\d.]/g, '')
  if (!cleaned) return ''

  if (isZeroDecimal) {
    const intOnly = cleaned.replace(/\./g, '')
    if (!intOnly) return ''
    const parts = intOnly.replace(/^0+(?=\d)/, '')
    return Number(parts || 0).toLocaleString('en-US')
  }

  const parts = cleaned.split('.')
  const intRaw = parts[0].replace(/^0+(?=\d)/, '')
  const integerPart = intRaw ? Number(intRaw).toLocaleString('en-US') : parts[0] === '0' ? '0' : ''

  if (parts.length > 1) {
    const decimalPart = parts.slice(1).join('').slice(0, 2)
    return `${integerPart || '0'}.${decimalPart}`
  }

  return integerPart
}

/** Parse formatted currency input back into a plain numeric number or 0 */
export function parseCurrencyInput(value: string): number {
  if (!value) return 0
  const cleaned = value.replace(/,/g, '').trim()
  const num = Number(cleaned)
  return isNaN(num) ? 0 : num
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
