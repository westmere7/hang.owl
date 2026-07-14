import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CURRENCIES } from '../../lib/categories'
import { supabase } from '../../lib/supabase'
import type { Hangout } from '../../types'
import { Button, ErrorNote, Field, Input, Modal, Select, Toggle } from '../ui'

interface Props {
  open: boolean
  onClose: () => void
  hangout: Hangout
  reload: () => void
}

/** Admin-only: rename, dates, guest count, currency, guest permissions, end/delete. */
export function HangoutSettingsModal({ open, onClose, hangout, reload }: Props) {
  const navigate = useNavigate()
  const [name, setName] = useState(hangout.name)
  const [startsOn, setStartsOn] = useState(hangout.starts_on ?? '')
  const [endsOn, setEndsOn] = useState(hangout.ends_on ?? '')
  const [guests, setGuests] = useState(hangout.expected_guests)
  const [currency, setCurrency] = useState(hangout.currency)
  const [perms, setPerms] = useState({
    guest_can_add_spend: hangout.guest_can_add_spend,
    guest_can_edit_spend: hangout.guest_can_edit_spend,
    guest_can_add_bookmark: hangout.guest_can_add_bookmark,
    guest_can_edit_recap: hangout.guest_can_edit_recap,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const { error } = await supabase
        .from('hangouts')
        .update({
          name: name.trim(),
          starts_on: startsOn || null,
          ends_on: endsOn || null,
          expected_guests: guests,
          currency,
          ...perms,
        })
        .eq('id', hangout.id)
      if (error) throw error
      reload()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  async function toggleEnded() {
    const next = hangout.status === 'active' ? 'ended' : 'active'
    const { error } = await supabase.from('hangouts').update({ status: next }).eq('id', hangout.id)
    if (error) {
      setError(error.message)
      return
    }
    reload()
    onClose()
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
      footer={
        <Button variant="accent" full onClick={() => void save()} disabled={saving || !name.trim()}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
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
                  {c}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="rounded-xl3 bg-surface-2 p-3">
          <p className="mb-1 px-1 text-xs font-extrabold uppercase tracking-wide text-muted">
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

        <div className="flex gap-3 pt-1">
          <Button variant="outline" full onClick={() => void toggleEnded()}>
            {hangout.status === 'active' ? 'End hangout' : 'Reopen hangout'}
          </Button>
          <Button variant="danger" full onClick={() => void remove()}>
            Delete
          </Button>
        </div>
      </div>
    </Modal>
  )
}
