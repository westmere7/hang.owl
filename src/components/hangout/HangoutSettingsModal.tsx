import { Target, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CURRENCIES, CURRENCY_LABELS } from '../../lib/categories'
import { formatCurrencyInput, parseCurrencyInput } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import type { Hangout, Member } from '../../types'
import { Button, ErrorNote, Field, Input, Modal, Select, Toggle, cn } from '../ui'

interface Props {
  open: boolean
  onClose: () => void
  hangout: Hangout
  members: Member[]
  reload: () => void
}

/** Admin-only: rename, dates, guest count, currency, budget cap, guest permissions, end/delete. */
export function HangoutSettingsModal({ open, onClose, hangout, reload }: Props) {
  const navigate = useNavigate()
  const [name, setName] = useState(hangout.name)
  const [startsOn, setStartsOn] = useState(hangout.starts_on ?? '')
  const [endsOn, setEndsOn] = useState(hangout.ends_on ?? '')
  const [guests, setGuests] = useState(hangout.expected_guests)
  const [currency, setCurrency] = useState(hangout.currency)

  const [capInput, setCapInput] = useState(() => {
    const raw = localStorage.getItem(`hangowl_cap_${hangout.id}`)
    return raw && Number(raw) > 0 ? formatCurrencyInput(Number(raw), hangout.currency) : ''
  })

  const [perms, setPerms] = useState({
    guest_can_add_spend: hangout.guest_can_add_spend,
    guest_can_edit_spend: hangout.guest_can_edit_spend,
    guest_can_add_bookmark: hangout.guest_can_add_bookmark,
    guest_can_edit_recap: hangout.guest_can_edit_recap,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName(hangout.name)
      setStartsOn(hangout.starts_on ?? '')
      setEndsOn(hangout.ends_on ?? '')
      setGuests(hangout.expected_guests)
      setCurrency(hangout.currency)
      const raw = localStorage.getItem(`hangowl_cap_${hangout.id}`)
      setCapInput(raw && Number(raw) > 0 ? formatCurrencyInput(Number(raw), hangout.currency) : '')
      setPerms({
        guest_can_add_spend: hangout.guest_can_add_spend,
        guest_can_edit_spend: hangout.guest_can_edit_spend,
        guest_can_add_bookmark: hangout.guest_can_add_bookmark,
        guest_can_edit_recap: hangout.guest_can_edit_recap,
      })
      setError(null)
    }
  }, [open, hangout])

  // Track if any changes have been made compared to initial values
  const initialCap = localStorage.getItem(`hangowl_cap_${hangout.id}`) || ''
  const initialCapFormatted = initialCap && Number(initialCap) > 0 ? formatCurrencyInput(Number(initialCap), hangout.currency) : ''

  const hasNameChanged = name.trim() !== hangout.name
  const hasStartsChanged = startsOn !== (hangout.starts_on ?? '')
  const hasEndsChanged = endsOn !== (hangout.ends_on ?? '')
  const hasGuestsChanged = guests !== hangout.expected_guests
  const hasCurrencyChanged = currency !== hangout.currency
  const hasCapChanged = capInput.trim() !== initialCapFormatted.trim()
  const hasPermsChanged =
    perms.guest_can_add_spend !== hangout.guest_can_add_spend ||
    perms.guest_can_edit_spend !== hangout.guest_can_edit_spend ||
    perms.guest_can_add_bookmark !== hangout.guest_can_add_bookmark ||
    perms.guest_can_edit_recap !== hangout.guest_can_edit_recap

  const hasChanges =
    hasNameChanged ||
    hasStartsChanged ||
    hasEndsChanged ||
    hasGuestsChanged ||
    hasCurrencyChanged ||
    hasCapChanged ||
    hasPermsChanged

  async function save() {
    if (!name.trim() || !hasChanges) return
    setSaving(true)
    setError(null)
    try {
      const parsedCap = parseCurrencyInput(capInput)
      const capVal = Number.isFinite(parsedCap) && parsedCap > 0 ? parsedCap : null

      const { error } = await supabase
        .from('hangouts')
        .update({
          name: name.trim(),
          starts_on: startsOn || null,
          ends_on: endsOn || null,
          expected_guests: guests,
          currency,
          spending_cap: capVal,
          ...perms,
        })
        .eq('id', hangout.id)
      if (error) throw error

      if (capVal) {
        localStorage.setItem(`hangowl_cap_${hangout.id}`, String(capVal))
      } else {
        localStorage.removeItem(`hangowl_cap_${hangout.id}`)
      }

      // Broadcast sync event to all connected devices
      void supabase.channel(`hangout_realtime_${hangout.id}`).send({
        type: 'broadcast',
        event: 'sync',
        payload: { cap: capVal },
      })

      reload()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }


  async function remove() {
    if (!window.confirm(`Delete "${hangout.name}" and all its spends & bookmarks? This cannot be undone.`)) return
    const { error } = await supabase.from('hangouts').delete().eq('id', hangout.id)
    if (error) {
      setError(error.message)
      return
    }
    navigate('/', { replace: true })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Hangout settings"
      wide
      footer={
        <div className="space-y-2.5">
          {/* Primary full-width Save button */}
          <Button
            type="button"
            variant="primary"
            size="lg"
            full
            onClick={() => void save()}
            disabled={saving || !hasChanges || !name.trim()}
            className={cn(
              'font-black transition-all duration-300 py-3.5 shadow-lg',
              hasChanges
                ? 'shadow-glow ring-2 ring-primary/40 brightness-110'
                : 'opacity-40 cursor-not-allowed bg-muted/20 text-muted border-line/40'
            )}
          >
            {saving ? 'Saving changes…' : hasChanges ? 'Save changes' : 'Save changes'}
          </Button>

          {/* Secondary actions row: Cancel & Delete */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={onClose}
              disabled={saving}
              className="px-2 text-xs sm:text-sm font-black truncate"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="md"
              onClick={() => void remove()}
              disabled={saving}
              className="px-2 text-xs sm:text-sm font-black truncate shadow-sm"
            >
              Delete hangout
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 pb-2">
        <Field label="Name">
          <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts">
            <Input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
          </Field>
          <Field label="Ends">
            <Input type="date" value={endsOn} min={startsOn || undefined} onChange={(e) => setEndsOn(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Guests">
            <Input
              type="number"
              min={1}
              max={99}
              value={guests}
              onChange={(e) => setGuests(Math.max(1, Number(e.target.value) || 1))}
            />
          </Field>
          <Field label="Currency">
            <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {CURRENCY_LABELS[c] || c}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field
          label={`Spending cap / Budget (${currency})`}
          hint="Optional budget limit. Displays progress in the total spent recap."
          action={
            capInput ? (
              <button
                type="button"
                onClick={() => setCapInput('')}
                className="flex items-center gap-1 text-[11px] font-black text-muted hover:text-danger transition select-none"
              >
                <X size={12} /> Clear
              </button>
            ) : undefined
          }
        >
          <div className="relative flex items-center">
            <Target size={18} className="absolute left-3.5 text-primary pointer-events-none" />
            <Input
              type="text"
              inputMode="decimal"
              placeholder={currency === 'VND' ? '0' : '0.00'}
              value={capInput}
              onChange={(e) => setCapInput(formatCurrencyInput(e.target.value, currency))}
              className="pl-10 pr-9"
            />
            {capInput && (
              <button
                type="button"
                onClick={() => setCapInput('')}
                className="absolute right-2.5 flex h-6 w-6 items-center justify-center rounded-full bg-surface-2 text-muted hover:bg-line/60 hover:text-ink transition"
                title="Clear spending cap"
              >
                <X size={13} strokeWidth={2.5} />
              </button>
            )}
          </div>
        </Field>

        <div className="rounded-2xl border border-line/60 bg-surface-2/60 p-3">
          <p className="mb-2 px-1 text-xs font-black uppercase tracking-wider text-muted">
            What guests can do
          </p>
          <Toggle
            checked={perms.guest_can_add_spend}
            onChange={(v) => setPerms((p) => ({ ...p, guest_can_add_spend: v }))}
            label="Add spendings"
          />
          <Toggle
            checked={perms.guest_can_edit_spend}
            onChange={(v) => setPerms((p) => ({ ...p, guest_can_edit_spend: v }))}
            label="Edit anyone's spendings"
            description="Guests can always edit entries they created."
          />
          <Toggle
            checked={perms.guest_can_add_bookmark}
            onChange={(v) => setPerms((p) => ({ ...p, guest_can_add_bookmark: v }))}
            label="Add & edit bookmarks"
          />
          <Toggle
            checked={perms.guest_can_edit_recap}
            onChange={(v) => setPerms((p) => ({ ...p, guest_can_edit_recap: v }))}
            label="Edit deposits & overrides"
            description="Recap adjustments — off means organizer only."
          />
        </div>

        <ErrorNote message={error} />
      </div>
    </Modal>
  )
}
