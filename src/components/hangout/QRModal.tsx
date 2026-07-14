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
        <p className="text-sm text-muted">
          Guests scan this code, type their name once, and they're in.
        </p>
        <div className="rounded-xl3 bg-white p-5 shadow-card">
          <QRCodeSVG value={url} size={208} fgColor="#2a2153" level="M" />
        </div>
        <p className="text-xs font-bold uppercase tracking-widest text-muted">
          Code · <span className="text-primary">{hangout.code}</span>
        </p>
        <Button variant="soft" onClick={() => void copy()} full>
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? 'Link copied!' : 'Copy invite link'}
        </Button>
      </div>
    </Modal>
  )
}
