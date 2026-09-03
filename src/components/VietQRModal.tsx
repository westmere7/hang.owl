import { Check, Copy, Download } from 'lucide-react'
import { useState } from 'react'
import { fmtMoney } from '../lib/format'
import { Modal, Spinner } from './ui'

interface VietQRModalProps {
  open: boolean
  onClose: () => void
  qrUrl: string
  bankName: string
  bankCode: string
  accountNo: string
  accountName?: string | null
  amount?: number | null
  currency?: string
  memo?: string | null
  payerName?: string
  receiverName?: string
}

export function VietQRModal({
  open,
  onClose,
  qrUrl,
  bankName,
  bankCode,
  accountNo,
  accountName,
  amount,
  currency = 'VND',
  memo,
  receiverName,
}: VietQRModalProps) {
  const [copiedAcc, setCopiedAcc] = useState(false)
  const [copiedAmount, setCopiedAmount] = useState(false)
  const [copiedMemo, setCopiedMemo] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloaded, setDownloaded] = useState(false)

  function copy(text: string, setCopied: (v: boolean) => void) {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1400)
      })
      .catch(() => {})
  }

  async function handleDownload() {
    setDownloading(true)
    try {
      const res = await fetch(qrUrl)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      const safeName = (receiverName || accountName || 'vietqr').toLowerCase().replace(/\s+/g, '-')
      a.download = `vietqr-${safeName}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
      setDownloaded(true)
      setTimeout(() => setDownloaded(false), 1800)
    } catch {
      // Direct window open fallback
      window.open(qrUrl, '_blank')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="VietQR Payment">
      <div className="space-y-4 pb-2">
        {/* QR image centered */}
        <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-surface-2/60 border border-line/60">
          <div className="relative group w-full max-w-[320px]">
            <img
              src={qrUrl}
              alt={`VietQR ${bankCode} ${accountNo}`}
              className="w-full rounded-xl shadow-md bg-white p-2 object-contain"
            />
            {/* Small download button on the QR image */}
            <button
              type="button"
              onClick={() => void handleDownload()}
              disabled={downloading}
              title="Download QR code image"
              aria-label="Download QR code image"
              className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-lg border border-line/60 bg-surface/90 px-2.5 py-1 text-xs font-bold text-ink shadow-sm backdrop-blur-sm transition hover:bg-surface hover:text-primary hover:border-primary/40 active:scale-95 cursor-pointer"
            >
              {downloading ? (
                <Spinner className="h-3.5 w-3.5 text-primary" />
              ) : downloaded ? (
                <>
                  <Check size={12} className="text-success" />
                  <span className="text-[10px] font-bold text-success">Saved</span>
                </>
              ) : (
                <>
                  <Download size={12} />
                  <span className="text-[10px] font-bold">Save QR</span>
                </>
              )}
            </button>
          </div>
          <p className="mt-2.5 text-center text-xs font-semibold text-muted">
            Please notify once transferred
          </p>
        </div>

        {/* Transfer details */}
        <div className="space-y-2 rounded-2xl border border-line/60 bg-surface p-3.5 text-xs">
          {/* Receiver */}
          <div className="flex items-center justify-between py-1 border-b border-line/40">
            <span className="font-semibold text-muted">Receiver</span>
            <span className="font-black text-ink">{receiverName || accountName || 'Receiver'}</span>
          </div>

          {/* Bank */}
          <div className="flex items-center justify-between py-1 border-b border-line/40">
            <span className="font-semibold text-muted">Bank</span>
            <span className="font-black text-ink">
              {bankName} ({bankCode})
            </span>
          </div>

          {/* Account Number */}
          <div className="flex items-center justify-between py-1 border-b border-line/40">
            <span className="font-semibold text-muted">Account number</span>
            <div className="flex items-center gap-1.5">
              <span className="font-mono font-black text-ink text-sm">{accountNo}</span>
              <button
                type="button"
                onClick={() => copy(accountNo, setCopiedAcc)}
                className="p-1 text-muted hover:text-ink transition rounded"
                title="Copy account number"
              >
                {copiedAcc ? <Check size={13} className="text-success" /> : <Copy size={13} />}
              </button>
            </div>
          </div>

          {/* Amount */}
          {amount && (
            <div className="flex items-center justify-between py-1 border-b border-line/40">
              <span className="font-semibold text-muted">Amount</span>
              <div className="flex items-center gap-1.5">
                <span className="font-black text-danger text-sm tabular-nums">
                  {fmtMoney(amount, currency)}
                </span>
                <button
                  type="button"
                  onClick={() => copy(String(Math.round(amount)), setCopiedAmount)}
                  className="p-1 text-muted hover:text-ink transition rounded"
                  title="Copy amount"
                >
                  {copiedAmount ? <Check size={13} className="text-success" /> : <Copy size={13} />}
                </button>
              </div>
            </div>
          )}

          {/* Transfer Memo */}
          {memo && (
            <div className="flex items-center justify-between py-1">
              <span className="font-semibold text-muted">Transfer memo</span>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-ink truncate max-w-[180px]">{memo}</span>
                <button
                  type="button"
                  onClick={() => copy(memo, setCopiedMemo)}
                  className="p-1 text-muted hover:text-ink transition rounded"
                  title="Copy memo"
                >
                  {copiedMemo ? <Check size={13} className="text-success" /> : <Copy size={13} />}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
