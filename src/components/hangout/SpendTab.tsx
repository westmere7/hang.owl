import { Camera, Plus, Receipt, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { SPEND_CATEGORIES, spendCategory } from '../../lib/categories'
import { fmtDateFull, fmtMoney, fmtTime, toLocalInput } from '../../lib/format'
import { canAddSpend, canEditSpend } from '../../lib/permissions'
import { billUrl, supabase } from '../../lib/supabase'
import type { Member, Spend, SpendCategory } from '../../types'
import type { HangoutData } from '../../pages/Hangout'
import { Avatar, Button, Chip, EmptyState, ErrorNote, Field, Input, Modal, Select, Textarea, cn } from '../ui'

export function SpendTab({ data }: { data: HangoutData }) {
  const { hangout, me, members, spends, reload } = data
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Spend | null>(null)

  const total = spends.reduce((sum, s) => sum + Number(s.amount), 0)
  const byCategory = useMemo(() => {
    const map = new Map<SpendCategory, number>()
    for (const s of spends) map.set(s.category, (map.get(s.category) ?? 0) + Number(s.amount))
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [spends])

  const byDay = useMemo(() => {
    const groups = new Map<string, Spend[]>()
    for (const s of spends) {
      const day = new Date(s.spent_at).toDateString()
      groups.set(day, [...(groups.get(day) ?? []), s])
    }
    return [...groups.entries()]
  }, [spends])

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])

  return (
    <div className="space-y-4">
      {/* Total card */}
      <div className="rounded-xl3 bg-surface p-5 shadow-card">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-muted">Total spent</p>
            <p className="mt-0.5 text-3xl font-black tabular-nums text-ink">
              {fmtMoney(total, hangout.currency)}
            </p>
          </div>
          {canAddSpend(hangout, me) && (
            <Button variant="accent" onClick={() => setAdding(true)}>
              <Plus size={16} />
              Add spending
            </Button>
          )}
        </div>
        {byCategory.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {byCategory.map(([cat, amount]) => {
              const meta = spendCategory(cat)
              const Icon = meta.icon
              return (
                <span
                  key={cat}
                  className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-bold text-muted"
                >
                  <Icon size={13} className="text-primary" />
                  {meta.label}
                  <span className="tabular-nums text-ink">{fmtMoney(amount, hangout.currency)}</span>
                </span>
              )
            })}
          </div>
        )}
      </div>

      {spends.length === 0 ? (
        <EmptyState
          icon={<Receipt size={26} />}
          title="No spendings yet"
          text="Log who paid for what — HangOwl figures out everyone's share in the recap."
        />
      ) : (
        byDay.map(([day, daySpends]) => (
          <section key={day} className="space-y-2">
            <h3 className="px-1 text-xs font-extrabold uppercase tracking-wide text-muted">
              {fmtDateFull(daySpends[0].spent_at)}
            </h3>
            {daySpends.map((s) => (
              <SpendRow
                key={s.id}
                spend={s}
                currency={hangout.currency}
                spender={memberById.get(s.spender_member_id)}
                membersCount={members.length}
                onEdit={canEditSpend(hangout, me, s) ? () => setEditing(s) : undefined}
              />
            ))}
          </section>
        ))
      )}

      {(adding || editing) && (
        <SpendForm
          hangoutId={hangout.id}
          currency={hangout.currency}
          members={members}
          me={me}
          spend={editing}
          onClose={() => {
            setAdding(false)
            setEditing(null)
          }}
          onSaved={reload}
        />
      )}
    </div>
  )
}

function SpendRow({
  spend,
  currency,
  spender,
  membersCount,
  onEdit,
}: {
  spend: Spend
  currency: string
  spender: Member | undefined
  membersCount: number
  onEdit?: () => void
}) {
  const meta = spendCategory(spend.category)
  const Icon = meta.icon
  const shareCount = spend.spend_shares.filter((s) => s.weight > 0).length
  const partial = shareCount > 0 && shareCount < membersCount

  return (
    <button
      onClick={onEdit}
      disabled={!onEdit}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl3 bg-surface p-3.5 text-left shadow-card transition',
        onEdit && 'hover:-translate-y-0.5 hover:shadow-pop',
      )}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">
        <Icon size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-extrabold text-ink">{spend.title}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-semibold text-muted">
          {spender && (
            <span className="inline-flex items-center gap-1">
              <Avatar name={spender.display_name} size="sm" className="!h-4.5 !w-4.5 !text-[8px] !ring-0" />
              {spender.display_name}
            </span>
          )}
          <span>{fmtTime(spend.spent_at)}</span>
          <span className={cn('inline-flex items-center gap-1', partial && 'text-accent-deep')}>
            <Users size={11} />
            {shareCount}
            {partial && ' (partial)'}
          </span>
          {spend.bill_path && (
            <span className="inline-flex items-center gap-1 text-primary">
              <Camera size={11} />
              bill
            </span>
          )}
        </span>
      </span>
      <span className="shrink-0 text-base font-black tabular-nums text-ink">
        {fmtMoney(Number(spend.amount), currency)}
      </span>
    </button>
  )
}

/* ---------------- Add / edit form ---------------- */

const WEIGHT_OPTIONS = [
  { value: 0, label: 'Skip' },
  { value: 0.5, label: '½' },
  { value: 1, label: '1×' },
  { value: 2, label: '2×' },
]

function SpendForm({
  hangoutId,
  currency,
  members,
  me,
  spend,
  onClose,
  onSaved,
}: {
  hangoutId: string
  currency: string
  members: Member[]
  me: Member | null
  spend: Spend | null
  onClose: () => void
  onSaved: () => void
}) {
  const { userId } = useApp()
  const [title, setTitle] = useState(spend?.title ?? '')
  const [amount, setAmount] = useState(spend ? String(spend.amount) : '')
  const [category, setCategory] = useState<SpendCategory>(spend?.category ?? 'eat_drink')
  const [spenderId, setSpenderId] = useState(spend?.spender_member_id ?? me?.id ?? members[0]?.id ?? '')
  const [spentAt, setSpentAt] = useState(() => toLocalInput(spend?.spent_at ?? new Date().toISOString()))
  const [note, setNote] = useState(spend?.note ?? '')
  const [billFile, setBillFile] = useState<File | null>(null)
  const [billPreview, setBillPreview] = useState<string | null>(spend?.bill_path ? billUrl(spend.bill_path) : null)
  const [removeBill, setRemoveBill] = useState(false)
  const [weights, setWeights] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {}
    for (const m of members) {
      const existing = spend?.spend_shares.find((s) => s.member_id === m.id)
      initial[m.id] = spend ? (existing?.weight ?? 0) : 1 // new spends: everyone in
    }
    return initial
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const included = Object.values(weights).filter((w) => w > 0).length

  function pickBill(file: File | null) {
    setBillFile(file)
    setRemoveBill(false)
    setBillPreview(file ? URL.createObjectURL(file) : null)
  }

  async function save() {
    const value = Number(amount)
    if (!title.trim() || !Number.isFinite(value) || value <= 0 || !spenderId) {
      setError('A title, a positive amount and a spender are required.')
      return
    }
    if (included === 0) {
      setError('At least one person has to share this spending.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      // Upload the bill photo first, if any.
      let billPath = removeBill ? null : (spend?.bill_path ?? null)
      if (billFile) {
        const ext = billFile.name.split('.').pop()?.toLowerCase() || 'jpg'
        const path = `${hangoutId}/${crypto.randomUUID()}.${ext}`
        const { error: upErr } = await supabase.storage.from('bills').upload(path, billFile)
        if (upErr) throw upErr
        billPath = path
      }

      const payload = {
        hangout_id: hangoutId,
        title: title.trim(),
        amount: value,
        category,
        spender_member_id: spenderId,
        spent_at: new Date(spentAt).toISOString(),
        note: note.trim() || null,
        bill_path: billPath,
      }

      let spendId = spend?.id
      if (spend) {
        const { error } = await supabase.from('spends').update(payload).eq('id', spend.id)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('spends')
          .insert({ ...payload, created_by: userId })
          .select('id')
          .single()
        if (error) throw error
        spendId = data.id
      }

      // Replace the share list wholesale — simplest way to stay consistent.
      const { error: delErr } = await supabase.from('spend_shares').delete().eq('spend_id', spendId)
      if (delErr) throw delErr
      const shares = members
        .filter((m) => (weights[m.id] ?? 0) > 0)
        .map((m) => ({ spend_id: spendId, member_id: m.id, weight: weights[m.id] }))
      const { error: shareErr } = await supabase.from('spend_shares').insert(shares)
      if (shareErr) throw shareErr

      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  async function remove() {
    if (!spend || !window.confirm(`Delete "${spend.title}"?`)) return
    const { error } = await supabase.from('spends').delete().eq('id', spend.id)
    if (error) {
      setError(error.message)
      return
    }
    onSaved()
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={spend ? 'Edit spending' : 'Add spending'}
      wide
      footer={
        <div className="flex gap-3">
          {spend && (
            <Button variant="danger" onClick={() => void remove()}>
              Delete
            </Button>
          )}
          <Button variant="accent" full onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving…' : spend ? 'Save changes' : 'Add spending'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pb-2">
        <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
          <Field label="What was it?">
            <Input
              autoFocus={!spend}
              placeholder="e.g. Seafood dinner, Grab to airport"
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field label={`Amount (${currency})`}>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Category">
          <div className="flex flex-wrap gap-2">
            {SPEND_CATEGORIES.map(({ value, label, icon: Icon }) => (
              <Chip key={value} active={category === value} onClick={() => setCategory(value)}>
                <Icon size={14} />
                {label}
              </Chip>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Who paid?">
            <Select value={spenderId} onChange={(e) => setSpenderId(e.target.value)}>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="When">
            <Input type="datetime-local" value={spentAt} onChange={(e) => setSpentAt(e.target.value)} />
          </Field>
        </div>

        <Field
          label={`Who shares it? (${included}/${members.length})`}
          hint="½ = half share (e.g. skipped the drinks). Skip = not included."
        >
          <div className="space-y-1.5">
            {members.map((m) => {
              const w = weights[m.id] ?? 0
              return (
                <div key={m.id} className="flex items-center gap-2.5 rounded-2xl bg-surface-2 px-3 py-2">
                  <Avatar name={m.display_name} size="sm" />
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate text-sm font-bold',
                      w > 0 ? 'text-ink' : 'text-muted line-through',
                    )}
                  >
                    {m.display_name}
                  </span>
                  <div className="flex gap-1">
                    {WEIGHT_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setWeights((prev) => ({ ...prev, [m.id]: opt.value }))}
                        className={cn(
                          'rounded-full px-2.5 py-1 text-xs font-extrabold transition-colors',
                          w === opt.value
                            ? opt.value === 0
                              ? 'bg-danger-soft text-danger'
                              : 'bg-primary text-on-primary'
                            : 'bg-surface text-muted hover:text-ink',
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </Field>

        <Field label="Bill photo">
          {billPreview ? (
            <div className="relative overflow-hidden rounded-2xl">
              <img src={billPreview} alt="Bill" className="max-h-56 w-full object-cover" />
              <button
                type="button"
                onClick={() => {
                  pickBill(null)
                  setRemoveBill(true)
                }}
                className="absolute right-2 top-2 rounded-full bg-black/55 px-2.5 py-1 text-xs font-bold text-white"
              >
                Remove
              </button>
            </div>
          ) : (
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line bg-surface-2 px-4 py-6 text-sm font-bold text-muted transition hover:border-primary hover:text-primary">
              <Camera size={18} />
              Upload the bill
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => pickBill(e.target.files?.[0] ?? null)}
              />
            </label>
          )}
        </Field>

        <Field label="Note">
          <Textarea placeholder="Optional details…" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>

        <ErrorNote message={error} />
      </div>
    </Modal>
  )
}
