import { ChevronRight, PartyPopper, Plus, Users, X } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthModal } from '../components/AuthModal'
import { Avatar, Button, EmptyState, ErrorNote, Field, Input, Modal, PageLoader, Select, Stepper, cn } from '../components/ui'
import { useApp } from '../context/AppContext'
import { CURRENCIES } from '../lib/categories'
import { dateRange } from '../lib/format'
import { supabase } from '../lib/supabase'
import { useAsync } from '../lib/useAsync'
import type { Hangout } from '../types'

type HangoutWithMembers = Hangout & { hangout_members: { id: string; display_name: string }[] }

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return Array.from(bytes, (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('')
}

export function HomePage() {
  const { userId, profile, isAuthed } = useApp()
  const [creating, setCreating] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)

  // Anyone can browse & join, but creating a hangout needs a real account.
  const startCreate = () => (isAuthed ? setCreating(true) : setAuthOpen(true))

  const { data, loading, error, reload } = useAsync(async () => {
    if (!userId) return []
    const { data, error } = await supabase
      .from('hangout_members')
      .select('hangout:hangouts(*, hangout_members(id, display_name))')
      .eq('profile_id', userId)
    if (error) throw error
    const hangouts = (data ?? [])
      .map((row) => row.hangout as unknown as HangoutWithMembers)
      .filter(Boolean)
    return hangouts.sort((a, b) => b.created_at.localeCompare(a.created_at))
  }, [userId])

  const active = (data ?? []).filter((h) => h.status === 'active')

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-xl3 bg-gradient-to-br from-primary to-primary-deep p-6 text-white shadow-pop">
        <div className="absolute -right-8 -top-10 h-40 w-40 rounded-full bg-white/10" />
        <div className="absolute -bottom-14 right-16 h-32 w-32 rounded-full bg-accent/30 blur-2xl" />
        <p className="text-sm font-bold text-white/70">
          {profile?.display_name ? `Hey ${profile.display_name} 🦉` : 'Hey there 🦉'}
        </p>
        <h1 className="mt-1 text-3xl font-black tracking-tight">
          {active.length === 0
            ? 'Time to plan a hangout'
            : `${active.length} hangout${active.length > 1 ? 's' : ''} in flight`}
        </h1>
        <Button variant="accent" className="mt-5" onClick={startCreate}>
          <Plus size={16} />
          New hangout
        </Button>
        {!isAuthed && (
          <p className="mt-2 text-xs font-semibold text-white/60">Sign in to start a hangout.</p>
        )}
      </div>

      <ErrorNote message={error} />
      {loading ? (
        <PageLoader />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          icon={<PartyPopper size={26} />}
          title="No hangouts yet"
          text="Create one for your next trip or dining night, then let everyone join by scanning its QR code."
          action={
            <Button variant="accent" onClick={startCreate}>
              <Plus size={16} /> New hangout
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {(data ?? []).map((h) => (
            <HangoutRow key={h.id} hangout={h} />
          ))}
        </div>
      )}

      {creating && <CreateHangoutModal onClose={() => setCreating(false)} onCreated={reload} />}
      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        reason="Create an account to start a hangout. It only takes a moment, and everything you've added as a guest stays with you."
      />
    </div>
  )
}

function HangoutRow({ hangout }: { hangout: HangoutWithMembers }) {
  const navigate = useNavigate()
  const members = hangout.hangout_members ?? []
  const ended = hangout.status === 'ended'
  return (
    <button
      onClick={() => navigate(`/hangout/${hangout.id}`)}
      className="flex w-full items-center gap-4 rounded-xl3 bg-surface p-4 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-pop"
    >
      <span
        className={cn(
          'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl',
          ended ? 'bg-surface-2 text-muted' : 'bg-primary-soft text-primary',
        )}
      >
        <Users size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-base font-extrabold text-ink">{hangout.name}</span>
          {ended && (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-extrabold uppercase text-muted">
              Ended
            </span>
          )}
        </span>
        <span className="block text-xs font-semibold text-muted">
          {dateRange(hangout.starts_on, hangout.ends_on)} · {members.length}/{hangout.expected_guests} guests
        </span>
      </span>
      <span className="flex -space-x-2">
        {members.slice(0, 4).map((m) => (
          <Avatar key={m.id} name={m.display_name} size="sm" />
        ))}
        {members.length > 4 && (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-2 text-[10px] font-extrabold text-muted ring-2 ring-surface">
            +{members.length - 4}
          </span>
        )}
      </span>
      <ChevronRight size={18} className="shrink-0 text-muted" />
    </button>
  )
}

function CreateHangoutModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { userId, profile } = useApp()
  const navigate = useNavigate()
  const organizerName = profile?.display_name || 'You'
  const [name, setName] = useState('')
  const [startsOn, setStartsOn] = useState('')
  const [endsOn, setEndsOn] = useState('')
  // Names of the OTHER people (the organizer is always the first member).
  const [guestNames, setGuestNames] = useState<string[]>(['', '', ''])
  const [currency, setCurrency] = useState('USD')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const headcount = guestNames.length + 1 // organizer + named slots

  function setHeadcount(next: number) {
    const others = Math.max(0, Math.min(49, next - 1))
    setGuestNames((prev) => {
      if (others === prev.length) return prev
      if (others < prev.length) return prev.slice(0, others)
      return [...prev, ...Array(others - prev.length).fill('')]
    })
  }

  async function create() {
    if (!userId || !name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const { data: hangout, error: hErr } = await supabase
        .from('hangouts')
        .insert({
          name: name.trim(),
          code: newCode(),
          starts_on: startsOn || null,
          ends_on: endsOn || null,
          expected_guests: headcount,
          currency,
          admin_id: userId,
        })
        .select('*')
        .single()
      if (hErr) throw hErr

      // The organizer is the admin member; named guests become placeholder
      // members (profile_id null) they can claim later by scanning the QR.
      const { error: mErr } = await supabase.from('hangout_members').insert({
        hangout_id: hangout.id,
        profile_id: userId,
        display_name: organizerName,
        is_admin: true,
      })
      if (mErr) throw mErr

      const placeholders = guestNames
        .map((n, i) => n.trim() || `Guest ${i + 1}`)
        .map((display_name) => ({ hangout_id: hangout.id, display_name }))
      if (placeholders.length) {
        const { error: pErr } = await supabase.from('hangout_members').insert(placeholders)
        if (pErr) throw pErr
      }

      onCreated()
      navigate(`/hangout/${hangout.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="New hangout"
      footer={
        <Button variant="accent" full size="lg" onClick={() => void create()} disabled={saving || !name.trim()}>
          {saving ? 'Creating…' : 'Create hangout'}
        </Button>
      }
    >
      <div className="space-y-4 pb-2">
        <Field label="Name">
          <Input
            autoFocus
            placeholder="e.g. Da Lat trip, Friday BBQ night"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />
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
          <Field label="How many people?">
            <Stepper value={headcount} min={1} max={50} onChange={setHeadcount} />
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

        <Field label="Who's coming?" hint="Name them now so you can assign spends right away — they can still join later by QR. Leave blank to fill in later.">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 rounded-2xl bg-primary-soft/60 px-3 py-2">
              <Avatar name={organizerName} size="sm" />
              <span className="flex-1 truncate text-sm font-bold text-ink">{organizerName}</span>
              <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-extrabold uppercase text-on-primary">
                You
              </span>
            </div>
            {guestNames.map((value, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <Avatar name={value.trim() || `${i + 1}`} size="sm" />
                <Input
                  placeholder={`Guest ${i + 1}`}
                  value={value}
                  maxLength={40}
                  onChange={(e) =>
                    setGuestNames((prev) => prev.map((n, j) => (j === i ? e.target.value : n)))
                  }
                />
                <button
                  type="button"
                  onClick={() => setGuestNames((prev) => prev.filter((_, j) => j !== i))}
                  className="rounded-full p-1.5 text-muted transition hover:bg-danger-soft hover:text-danger"
                  aria-label={`Remove guest ${i + 1}`}
                >
                  <X size={16} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setGuestNames((prev) => [...prev, ''])}
              className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3.5 py-1.5 text-sm font-bold text-primary transition hover:bg-primary-soft"
            >
              <Plus size={15} />
              Add someone
            </button>
          </div>
        </Field>

        <ErrorNote message={error} />
      </div>
    </Modal>
  )
}
