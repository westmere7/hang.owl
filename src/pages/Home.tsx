import { ChevronRight, PartyPopper, Plus, Target, Users, X } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthModal } from '../components/AuthModal'
import { Avatar, Button, EmptyState, ErrorNote, Field, Input, Modal, PageLoader, Select, Stepper, cn } from '../components/ui'
import { useApp } from '../context/AppContext'
import { CURRENCIES, CURRENCY_LABELS } from '../lib/categories'
import { dateRange, formatCurrencyInput, parseCurrencyInput } from '../lib/format'
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
    <div className="space-y-6">
      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-line/60 bg-gradient-to-br from-surface via-surface to-surface-2 p-5 sm:p-7 shadow-pop">
        <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 right-20 h-40 w-40 rounded-full bg-accent/20 blur-3xl pointer-events-none" />

        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-line/60 bg-surface-2/80 px-3 py-1 text-xs font-black text-muted mb-3">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span>{profile?.display_name ? `Hey, ${profile.display_name}` : 'Welcome to HangOwl'}</span>
          </div>

          <h1 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight text-ink">
            {active.length === 0
              ? 'Time to plan a hangout'
              : `${active.length} hangout${active.length > 1 ? 's' : ''} in flight`}
          </h1>
          <p className="mt-1 text-xs sm:text-sm font-semibold text-muted max-w-md">
            Save places to visit, record who paid for what, and let HangOwl split the bill effortlessly.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button variant="primary" size="lg" onClick={startCreate} className="shadow-glow">
              <Plus size={18} />
              New hangout
            </Button>
            {!isAuthed && (
              <span className="text-xs font-bold text-muted">
                (Guests can join anytime via QR)
              </span>
            )}
          </div>
        </div>
      </div>

      <ErrorNote message={error} />
      {loading ? (
        <PageLoader />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          icon={<PartyPopper size={30} />}
          title="No hangouts yet"
          text="Create one for your next trip or dining night, then invite everyone to join by scanning its QR code."
          action={
            <Button variant="primary" size="md" onClick={startCreate}>
              <Plus size={16} /> New hangout
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-black uppercase tracking-wider text-muted">Your Hangouts</h2>
            <span className="text-xs font-bold text-muted tabular-nums">{(data ?? []).length} total</span>
          </div>
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
      className="flex w-full items-center gap-3.5 sm:gap-4 rounded-2xl sm:rounded-3xl border border-line/60 bg-surface p-4 text-left shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-pop active:scale-[0.99]"
    >
      <span
        className={cn(
          'flex h-12 w-12 sm:h-13 sm:w-13 shrink-0 items-center justify-center rounded-2xl shadow-sm',
          ended ? 'bg-surface-2 text-muted' : 'bg-primary-soft text-primary shadow-glow',
        )}
      >
        <Users size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm sm:text-base font-black text-ink">{hangout.name}</span>
          {ended ? (
            <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[10px] font-black uppercase text-muted border border-line/40">
              Ended
            </span>
          ) : (
            <span className="rounded-full bg-success-soft px-2.5 py-0.5 text-[10px] font-black uppercase text-success border border-success/30">
              Active
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-xs font-semibold text-muted">
          {dateRange(hangout.starts_on, hangout.ends_on)} · {members.length}/{hangout.expected_guests} guests
        </span>
      </span>
      <span className="flex -space-x-2.5">
        {members.slice(0, 3).map((m) => (
          <Avatar key={m.id} name={m.display_name} size="sm" />
        ))}
        {members.length > 3 && (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-[10px] font-black text-muted ring-2 ring-surface border border-line">
            +{members.length - 3}
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
  const [capInput, setCapInput] = useState('')
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
      const initialCap = parseCurrencyInput(capInput)
      const capVal = Number.isFinite(initialCap) && initialCap > 0 ? initialCap : null

      let { data: hangout, error: hErr } = await supabase
        .from('hangouts')
        .insert({
          name: name.trim(),
          code: newCode(),
          starts_on: startsOn || null,
          ends_on: endsOn || null,
          expected_guests: headcount,
          currency,
          admin_id: userId,
          spending_cap: capVal,
        })
        .select('*')
        .single()

      if (hErr && (hErr.message?.includes('spending_cap') || hErr.code === '42703')) {
        const { data: hFallback, error: fallbackErr } = await supabase
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
        hangout = hFallback
        hErr = fallbackErr
      }
      if (hErr || !hangout) throw (hErr || new Error('Failed to create hangout'))

      if (capVal) {
        localStorage.setItem(`hangowl_cap_${hangout.id}`, String(capVal))
      }

      // The organizer is the admin member; named guests become placeholder
      // members (profile_id null) they can claim later by scanning the QR.
      const { error: mErr } = await supabase.from('hangout_members').insert({
        hangout_id: hangout.id,
        profile_id: userId,
        display_name: organizerName,
        deposit: 0,
        is_admin: true,
      })
      if (mErr) throw mErr

      const placeholders = guestNames
        .map((n, i) => n.trim() || `Guest ${i + 1}`)
        .map((display_name) => ({ hangout_id: hangout.id, display_name, deposit: 0 }))
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
      wide
      footer={
        <Button variant="primary" full size="lg" onClick={() => void create()} disabled={saving || !name.trim()}>
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
                  {CURRENCY_LABELS[c] || c}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field
          label={`Spending cap / Budget (${currency})`}
          hint="Optional budget cap. Shows visual progress as spendings are recorded."
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

        <Field label="Who's coming?" hint="Name them now so you can assign spends right away — they can still join later by QR.">
          <div className="space-y-2.5">
            {/* Organizer Row */}
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-line/60 bg-surface-2/70 px-3.5 py-2.5 shadow-sm">
              <div className="flex items-center gap-2.5 min-w-0">
                <Avatar name={organizerName} size="sm" />
                <span className="truncate text-sm font-extrabold text-ink">{organizerName}</span>
              </div>
              <span className="rounded-full bg-primary/20 text-primary border border-primary/30 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider shrink-0">
                Organizer
              </span>
            </div>

            {/* Guest Rows */}
            {guestNames.map((value, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="relative flex-1">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 flex shrink-0 items-center justify-center pointer-events-none">
                    <Avatar name={value.trim() || `${i + 1}`} size="sm" />
                  </div>
                  <Input
                    placeholder={`Guest ${i + 1}`}
                    value={value}
                    maxLength={40}
                    onChange={(e) =>
                      setGuestNames((prev) => prev.map((n, j) => (j === i ? e.target.value : n)))
                    }
                    className="pl-14"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setGuestNames((prev) => prev.filter((_, j) => j !== i))}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-line/50 bg-surface-2/80 text-muted transition hover:bg-danger-soft hover:text-danger hover:border-danger/40 active:scale-95"
                  aria-label={`Remove guest ${i + 1}`}
                  title="Remove guest"
                >
                  <X size={15} strokeWidth={2.5} />
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={() => setGuestNames((prev) => [...prev, ''])}
              className="inline-flex items-center gap-1.5 rounded-2xl border border-line/60 bg-surface-2/80 px-4 py-2.5 text-xs font-black text-primary transition hover:bg-primary-soft active:scale-95"
            >
              <Plus size={15} strokeWidth={2.5} />
              Add guest slot
            </button>
          </div>
        </Field>

        <ErrorNote message={error} />
      </div>
    </Modal>
  )
}
