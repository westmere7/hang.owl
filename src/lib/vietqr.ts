/**
 * Vietnamese banking and VietQR helpers.
 * Generates standards-compliant VietQR images via img.vietqr.io.
 */

export interface BankInfo {
  code: string
  shortName: string
  name: string
  bin?: string
}

/**
 * Top Vietnamese commercial banks supported by NAPAS and VietQR.
 */
export const VIETNAM_BANKS: BankInfo[] = [
  { code: 'VCB', shortName: 'Vietcombank', name: 'Ngoại Thương Việt Nam', bin: '970436' },
  { code: 'TCB', shortName: 'Techcombank', name: 'Kỹ Thương Việt Nam', bin: '970407' },
  { code: 'MB', shortName: 'MBBank', name: 'Quân Đội', bin: '970422' },
  { code: 'ACB', shortName: 'ACB', name: 'Á Châu', bin: '970416' },
  { code: 'VPB', shortName: 'VPBank', name: 'Việt Nam Thịnh Vượng', bin: '970432' },
  { code: 'TPB', shortName: 'TPBank', name: 'Tiên Phong', bin: '970423' },
  { code: 'BIDV', shortName: 'BIDV', name: 'Đầu tư và Phát triển Việt Nam', bin: '970418' },
  { code: 'CTG', shortName: 'VietinBank', name: 'Công Thương Việt Nam', bin: '970415' },
  { code: 'VIB', shortName: 'VIB', name: 'Quốc Tế Việt Nam', bin: '970441' },
  { code: 'STB', shortName: 'Sacombank', name: 'Sài Gòn Thương Tín', bin: '970403' },
  { code: 'HDB', shortName: 'HDBank', name: 'Phát triển TP.HCM', bin: '970437' },
  { code: 'OCB', shortName: 'OCB', name: 'Phương Đông', bin: '970448' },
  { code: 'MSB', shortName: 'MSB', name: 'Hàng Hải Việt Nam', bin: '970426' },
  { code: 'SHB', shortName: 'SHB', name: 'Sài Gòn - Hà Nội', bin: '970443' },
  { code: 'LPB', shortName: 'LPBank', name: 'Lộc Phát Việt Nam', bin: '970449' },
  { code: 'CAKE', shortName: 'CAKE', name: 'CAKE by VPBank', bin: '546034' },
  { code: 'TIMO', shortName: 'Timo', name: 'Timo by BVBank', bin: '963388' },
  { code: 'VCCB', shortName: 'BVBank', name: 'Bản Việt', bin: '970454' },
  { code: 'SEAB', shortName: 'SeABank', name: 'Đông Nam Á', bin: '970440' },
  { code: 'BAB', shortName: 'Bac A Bank', name: 'Bắc Á', bin: '970409' },
  { code: 'NCB', shortName: 'NCB', name: 'Quốc Dân', bin: '970419' },
  { code: 'ABB', shortName: 'ABBank', name: 'An Bình', bin: '970425' },
  { code: 'VIETBANK', shortName: 'VietBank', name: 'Việt Nam Thương Tín', bin: '970433' },
  { code: 'BVB', shortName: 'BaoVietBank', name: 'Bảo Việt', bin: '970438' },
  { code: 'PVCOMBANK', shortName: 'PVcomBank', name: 'Đại Chúng Việt Nam', bin: '970412' },
]

export function findBank(codeOrName: string | null | undefined): BankInfo | undefined {
  if (!codeOrName) return undefined
  const q = codeOrName.trim().toUpperCase()
  return VIETNAM_BANKS.find(
    (b) => b.code.toUpperCase() === q || b.shortName.toUpperCase() === q,
  )
}

/**
 * Formats transfer memo / addInfo per NAPAS & VietQR rules:
 * - Uses Hangout Name + Payer Name (e.g. "RM-Ate-T #11" + "Danh" -> "RM-Ate-T 11 Danh")
 * - Strips Vietnamese accents and special characters (#, @, etc.)
 * - Capped to maxLen (default 30 characters) to ensure compatibility across all banking apps.
 */
export function formatTransferMemo(hangoutName: string, payerName: string, maxLen = 30): string {
  const stripAccents = (str: string) =>
    str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')

  const combined = `${hangoutName} ${payerName}`
  const cleaned = stripAccents(combined)
    .replace(/[^a-zA-Z0-9\s-]/g, ' ') // replace punctuation/symbols with space
    .replace(/\s+/g, ' ') // collapse multiple spaces
    .trim()

  return cleaned.slice(0, maxLen).trim()
}

/**
 * Builds standard VietQR QuickLink image URL.
 * Template options:
 * - 'compact2': full card with bank logo, QR, account details, amount, memo (recommended)
 * - 'compact': compact card with QR and logo
 * - 'qr_only': QR code image only
 */
export function buildVietQRUrl({
  bankCode,
  accountNo,
  accountName,
  amount,
  memo,
  template = 'compact2',
}: {
  bankCode: string
  accountNo: string
  accountName?: string | null
  amount?: number | null
  memo?: string | null
  template?: 'compact2' | 'compact' | 'qr_only' | 'print'
}): string {
  const cleanBank = bankCode.trim().toUpperCase()
  const cleanAcc = accountNo.trim().replace(/\s+/g, '')

  let url = `https://img.vietqr.io/image/${encodeURIComponent(cleanBank)}-${encodeURIComponent(cleanAcc)}-${template}.png`

  const params = new URLSearchParams()
  if (amount && Number.isFinite(amount) && amount > 0) {
    params.set('amount', String(Math.round(amount)))
  }
  if (memo && memo.trim()) {
    params.set('addInfo', memo.trim())
  }
  if (accountName && accountName.trim()) {
    params.set('accountName', accountName.trim().toUpperCase())
  }

  const qs = params.toString()
  return qs ? `${url}?${qs}` : url
}
