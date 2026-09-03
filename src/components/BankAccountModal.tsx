import { Check, QrCode } from 'lucide-react'
import { useState } from 'react'
import { VIETNAM_BANKS, buildVietQRUrl, findBank } from '../lib/vietqr'
import type { SavedBankAccount } from '../types'
import { Button, ErrorNote, Field, Input, Modal } from './ui'

interface BankAccountModalProps {
  open: boolean
  onClose: () => void
  initial?: Partial<SavedBankAccount> | null
  onSave: (account: {
    id?: string
    name: string
    bank_code: string
    bank_name: string
    account_no: string
    account_name: string
  }) => Promise<void>
}

export function BankAccountModal({ open, onClose, initial, onSave }: BankAccountModalProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [bankCode, setBankCode] = useState(initial?.bank_code ?? 'TCB')
  const [accountNo, setAccountNo] = useState(initial?.account_no ?? '')
  const [accountName, setAccountName] = useState(initial?.account_name ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedBank = findBank(bankCode)

  const previewQrUrl =
    bankCode && accountNo.trim()
      ? buildVietQRUrl({
          bankCode,
          accountNo,
          accountName,
          amount: 100000,
          memo: 'HangOwl Test',
          template: 'compact2',
        })
      : null

  async function handleSave() {
    if (!name.trim()) {
      setError('Please provide a name or label for this account.')
      return
    }
    if (!bankCode) {
      setError('Please select a bank.')
      return
    }
    if (!accountNo.trim()) {
      setError('Please enter the bank account number.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      await onSave({
        id: initial?.id,
        name: name.trim(),
        bank_code: bankCode,
        bank_name: selectedBank?.shortName ?? bankCode,
        account_no: accountNo.trim(),
        account_name: accountName.trim().toUpperCase(),
      })
      onClose()
    } catch (e: any) {
      setError(e?.message ?? 'Failed to save bank account')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial?.id ? 'Edit Bank Account' : 'Add Bank Account'}
      footer={
        <Button variant="primary" full size="lg" onClick={handleSave} disabled={saving || !name.trim() || !accountNo.trim()}>
          {saving ? 'Saving…' : initial?.id ? 'Save changes' : 'Add account'}
        </Button>
      }
    >
      <div className="space-y-4 pb-1">
        <Field label="Person or Label Name" hint="e.g. Chị Vân Anh, Danh, or Techcombank">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Chị Vân Anh"
            maxLength={50}
          />
        </Field>

        <Field label="Bank">
          <div className="relative">
            <select
              value={bankCode}
              onChange={(e) => setBankCode(e.target.value)}
              className="w-full rounded-2xl border border-line/60 bg-surface px-3.5 py-2.5 text-sm font-bold text-ink outline-none focus:border-primary/50"
            >
              {VIETNAM_BANKS.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.shortName} ({b.code}) — {b.name}
                </option>
              ))}
            </select>
          </div>
        </Field>

        <Field label="Account Number">
          <Input
            value={accountNo}
            onChange={(e) => setAccountNo(e.target.value.replace(/\s+/g, ''))}
            placeholder="e.g. 19036512345018"
            inputMode="numeric"
            maxLength={30}
          />
        </Field>

        <Field label="Account Holder Name (Optional)" hint="Full name as printed on card / banking app">
          <Input
            value={accountName}
            onChange={(e) => setAccountName(e.target.value.toUpperCase())}
            placeholder="e.g. NGUYEN VAN A"
            maxLength={50}
          />
        </Field>

        {/* Live VietQR Preview */}
        {previewQrUrl && (
          <div className="rounded-2xl border border-line/60 bg-surface-2/40 p-3.5 space-y-2">
            <div className="flex items-center gap-2 text-xs font-black text-ink">
              <QrCode size={15} className="text-primary" />
              <span>VietQR Preview</span>
            </div>
            <div className="flex items-center gap-3">
              <img
                src={previewQrUrl}
                alt="VietQR Preview"
                className="h-28 w-auto rounded-xl border border-line/40 bg-white p-1 shadow-sm object-contain"
              />
              <div className="text-xs space-y-0.5 text-muted">
                <p className="font-bold text-ink">
                  {selectedBank?.shortName} ({bankCode})
                </p>
                <p className="font-mono font-semibold">{accountNo}</p>
                {accountName && <p className="font-bold uppercase text-ink">{accountName}</p>}
                <p className="text-[11px] text-success font-semibold flex items-center gap-1 pt-1">
                  <Check size={12} strokeWidth={3} /> Auto VietQR Ready
                </p>
              </div>
            </div>
          </div>
        )}

        <ErrorNote message={error} />
      </div>
    </Modal>
  )
}
