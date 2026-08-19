import { QRCodeSVG } from 'qrcode.react'
import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import type { Hangout } from '../../types'
import { Button, Modal } from '../ui'

export function QRModal({ open, onClose, hangout }: { open: boolean; onClose: () => void; hangout: Hangout }) {
  const [copied, setCopied] = useState(false)
  const url = `${window.location.origin}/join/${hangout.code}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      window.prompt('Copy this invite link:', url)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Invite guests">
      <div className="flex flex-col items-center gap-4 pb-4 text-center">
        <p className="text-xs sm:text-sm font-semibold text-muted max-w-xs">
          Guests scan this code, enter their name once, and they're in immediately.
        </p>
        <div className="rounded-2xl bg-white p-5 shadow-pop border-4 border-primary/30">
          <QRCodeSVG value={url} size={208} fgColor="#11121d" level="M" />
        </div>
        <p className="text-xs font-black uppercase tracking-wider text-muted">
          Invite Code · <span className="text-primary font-mono text-sm">{hangout.code}</span>
        </p>
        <Button variant="primary" onClick={() => void copy()} full size="lg" className="shadow-glow">
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? 'Link copied!' : 'Copy invite link'}
        </Button>
      </div>
    </Modal>
  )
}
