import { Check, Crown, Plus, Trash2, UserRound } from 'lucide-react'
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Member } from '../../types'
import { Avatar, Button, ErrorNote, Input, Modal, cn } from '../ui'

interface Props {
  open: boolean
  onClose: () => void
  hangoutId: string
  members: Member[]
  reload: () => void
}

/**
 * Admin roster management: add named guests, rename anyone, remove people.
 * Named guests are placeholder members (no profile_id) until they scan the
 * QR — but they can be assigned spends and billed right away.
 */
export function ManageGuestsModal({ open, onClose, hangoutId, members, reload }: Props) {
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function addGuest() {
    const name = newName.trim()
    if (!name) return
    setBusy(true)
    setError(null)
    try {
      const { error } = await supabase
        .from('hangout_members')
        .insert({ hangout_id: hangoutId, display_name: name })
      if (error) throw error
      setNewName('')
      reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function rename(member: Member, name: string) {
    const clean = name.trim()
    if (!clean || clean === member.display_name) return
    const { error } = await supabase
      .from('hangout_members')
      .update({ display_name: clean })
      .eq('id', member.id)
    if (error) setError(error.message)
    else reload()
  }

  async function remove(member: Member) {
    if (
      !window.confirm(
        `Remove ${member.display_name}? Any spends they paid for will be deleted too. This can't be undone.`,
      )
    )
      return
    const { error } = await supabase.from('hangout_members').delete().eq('id', member.id)
    if (error) setError(error.message)
    else reload()
  }

  return (
    <Modal open={open} onClose={onClose} title="Guests">
      <div className="space-y-4 pb-2">
        <p className="text-sm text-muted">
          Add people by name to assign and bill them now — they can claim their spot later by scanning
          the invite QR.
        </p>

        <div className="space-y-1.5">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-2.5 rounded-2xl bg-surface-2 px-3 py-2">
              <Avatar name={m.display_name} size="sm" />
              <Input
                className="flex-1 !bg-surface"
                defaultValue={m.display_name}
                maxLength={40}
                disabled={m.is_admin}
                onBlur={(e) => void rename(m, e.target.value)}
              />
              <span
                className={cn(
                  'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase',
                  m.is_admin
                    ? 'bg-accent-soft text-accent-deep'
                    : m.profile_id
                      ? 'bg-success-soft text-success'
                      : 'bg-primary-soft text-primary',
                )}
              >
                {m.is_admin ? (
                  <>
                    <Crown size={10} /> You
                  </>
                ) : m.profile_id ? (
                  <>
                    <Check size={10} /> Joined
                  </>
                ) : (
                  <>
                    <UserRound size={10} /> Named
                  </>
                )}
              </span>
              {!m.is_admin && (
                <button
                  onClick={() => void remove(m)}
                  className="rounded-full p-1.5 text-muted transition hover:bg-danger-soft hover:text-danger"
                  aria-label={`Remove ${m.display_name}`}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Input
            placeholder="Add a guest by name"
            value={newName}
            maxLength={40}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void addGuest()
            }}
          />
          <Button variant="soft" size="icon" onClick={() => void addGuest()} disabled={busy || !newName.trim()}>
            <Plus size={18} />
          </Button>
        </div>

        <ErrorNote message={error} />
      </div>
    </Modal>
  )
}
