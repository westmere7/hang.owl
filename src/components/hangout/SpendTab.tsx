import { Camera, Pencil, Plus, Receipt, RotateCcw, Users, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { SPEND_CATEGORIES, spendCategory } from '../../lib/categories'
import { fmtDateFull, fmtMoney, fmtTime, formatCurrencyInput, parseCurrencyInput, toLocalInput } from '../../lib/format'
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
      <div className="rounded-2xl sm:rounded-3xl border border-line/60 bg-surface p-5 sm:p-6 shadow-card">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-wider text-muted">Total spent</p>
            <p className="mt-0.5 text-3xl sm:text-4xl font-black tabular-nums text-ink">
              {fmtMoney(total, hangout.currency)}
            </p>
          </div>
          {canAddSpend(hangout, me) && (
            <Button variant="primary" onClick={() => setAdding(true)} className="shadow-glow">
              <Plus size={16} />
              Add spending
            </Button>
          )}
        </div>
        {byCategory.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2 pt-3 border-t border-line/50">
            {byCategory.map(([cat, amount]) => {
              const meta = spendCategory(cat)
              const Icon = meta.icon
              return (
                <span
                  key={cat}
                  className="inline-flex items-center gap-1.5 rounded-full bg-surface-2/90 border border-line/50 px-3 py-1.5 text-xs font-black text-muted"
                >
                  <Icon size={13} className="text-primary" />
                  <span>{meta.label}</span>
                  <span className="tabular-nums text-ink">{fmtMoney(amount, hangout.currency)}</span>
                </span>
              )
            })}
          </div>
        )}
      </div>

      {spends.length === 0 ? (
        <EmptyState
          icon={<Receipt size={28} />}
          title="No spendings yet"
          text="Log who paid for what — HangOwl automatically figures out everyone's fair share in the recap."
          action={
            canAddSpend(hangout, me) ? (
              <Button variant="primary" size="md" onClick={() => setAdding(true)}>
                <Plus size={16} /> Add first spend
              </Button>
            ) : undefined
          }
        />
      ) : (
        byDay.map(([day, daySpends]) => (
          <section key={day} className="space-y-2">
            <h3 className="px-1 text-[11px] font-black uppercase tracking-wider text-muted">
              {fmtDateFull(daySpends[0].spent_at)}
            </h3>
            <div className="space-y-2">
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
            </div>
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
        'flex w-full items-center gap-3 sm:gap-3.5 rounded-2xl border border-line/60 bg-surface p-3.5 text-left shadow-card transition-all select-none',
        onEdit && 'hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-pop active:scale-[0.99]',
      )}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary shadow-sm">
        <Icon size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm sm:text-base font-black text-ink">{spend.title}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs font-semibold text-muted">
          {spender && (
            <span className="inline-flex items-center gap-1">
              <Avatar name={spender.display_name} size="sm" className="!h-4.5 !w-4.5 !text-[8px] !ring-0" />
              <span className="truncate max-w-[8rem]">{spender.display_name}</span>
            </span>
          )}
          <span>·</span>
          <span>{fmtTime(spend.spent_at)}</span>
          <span>·</span>
          <span className={cn('inline-flex items-center gap-1', partial && 'text-accent font-bold')}>
            <Users size={11} />
            {shareCount}
            {partial && ' (split)'}
          </span>
          {spend.bill_path && (
            <span className="inline-flex items-center gap-1 text-primary font-bold">
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

interface MemberShareState {
  mode: 'equal' | 'skip' | 'custom'
  customAmount: number
}

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
  const [amount, setAmount] = useState(() => (spend ? formatCurrencyInput(spend.amount, currency) : ''))
  const [category, setCategory] = useState<SpendCategory>(spend?.category ?? 'eat_drink')
  const [spenderId, setSpenderId] = useState(spend?.spender_member_id ?? me?.id ?? members[0]?.id ?? '')
  const [spentAt, setSpentAt] = useState(() => toLocalInput(spend?.spent_at ?? new Date().toISOString()))
  const [note, setNote] = useState(spend?.note ?? '')
  const [billFile, setBillFile] = useState<File | null>(null)
  const [billPreview, setBillPreview] = useState<string | null>(spend?.bill_path ? billUrl(spend.bill_path) : null)
  const [removeBill, setRemoveBill] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Track each member's share mode: 'equal' | 'skip' | 'custom'
  const [shareModes, setShareModes] = useState<Record<string, MemberShareState>>(() => {
    const initial: Record<string, MemberShareState> = {}
    if (!spend) {
      for (const m of members) {
        initial[m.id] = { mode: 'equal', customAmount: 0 }
      }
    } else {
      const totalW = spend.spend_shares.reduce((sum, sh) => sum + Number(sh.weight), 0)
      const activeShares = spend.spend_shares.filter((sh) => Number(sh.weight) > 0)
      const allEqual =
        activeShares.length > 0 &&
        activeShares.every((sh) => Number(sh.weight) === Number(activeShares[0].weight))

      for (const m of members) {
        const sh = spend.spend_shares.find((s) => s.member_id === m.id)
        const w = sh ? Number(sh.weight) : 0
        if (w <= 0) {
          initial[m.id] = { mode: 'skip', customAmount: 0 }
        } else if (allEqual) {
          initial[m.id] = { mode: 'equal', customAmount: 0 }
        } else {
          const dollarShare = totalW > 0 ? (spend.amount * w) / totalW : 0
          initial[m.id] = { mode: 'custom', customAmount: dollarShare }
        }
      }
    }
    return initial
  })

  // State for inline custom amount editing
  const [editingCustomId, setEditingCustomId] = useState<string | null>(null)
  const [tempCustomInput, setTempCustomInput] = useState<string>('')
  const [customError, setCustomError] = useState<string | null>(null)

  const totalBill = parseCurrencyInput(amount)

  // Calculate live numbers
  const customMembers = members.filter(
    (m) => shareModes[m.id]?.mode === 'custom' && (shareModes[m.id]?.customAmount ?? 0) > 0,
  )
  const skipMembers = members.filter((m) => shareModes[m.id]?.mode === 'skip')
  const equalMembers = members.filter(
    (m) =>
      shareModes[m.id]?.mode === 'equal' ||
      (shareModes[m.id]?.mode === 'custom' && (shareModes[m.id]?.customAmount ?? 0) === 0),
  )

  const sumCustom = customMembers.reduce(
    (sum, m) => sum + (shareModes[m.id]?.customAmount ?? 0),
    0,
  )
  const remainingBill = Math.max(0, totalBill - sumCustom)
  const equalShare = equalMembers.length > 0 ? remainingBill / equalMembers.length : 0
  const activeCount = members.length - skipMembers.length

  function toggleSkip(memberId: string) {
    setShareModes((prev) => {
      const current = prev[memberId]?.mode
      if (current === 'skip') {
        return { ...prev, [memberId]: { mode: 'equal', customAmount: 0 } }
      } else {
        if (editingCustomId === memberId) {
          setEditingCustomId(null)
          setCustomError(null)
        }
        return { ...prev, [memberId]: { mode: 'skip', customAmount: 0 } }
      }
    })
  }

  function openCustomInput(memberId: string) {
    if (editingCustomId === memberId) {
      setEditingCustomId(null)
      setCustomError(null)
      return
    }
    const curr = shareModes[memberId]
    const initialVal =
      curr?.mode === 'custom' && curr.customAmount > 0
        ? formatCurrencyInput(curr.customAmount, currency)
        : equalShare > 0
          ? formatCurrencyInput(Math.round(equalShare * 100) / 100, currency)
          : ''
    setTempCustomInput(initialVal)
    setEditingCustomId(memberId)
    setCustomError(null)
  }

  function saveCustomInput(memberId: string) {
    const val = parseCurrencyInput(tempCustomInput)
    if (isNaN(val) || val < 0) {
      setCustomError('Please enter a valid non-negative amount.')
      return
    }
    if (totalBill > 0 && val > totalBill) {
      setCustomError(`Custom amount cannot exceed bill total (${fmtMoney(totalBill, currency)}).`)
      return
    }

    const otherCustoms = members
      .filter((m) => m.id !== memberId && shareModes[m.id]?.mode === 'custom')
      .reduce((sum, m) => sum + (shareModes[m.id]?.customAmount ?? 0), 0)

    if (totalBill > 0 && otherCustoms + val > totalBill) {
      setCustomError(
        `Total custom amounts (${fmtMoney(otherCustoms + val, currency)}) cannot exceed bill total (${fmtMoney(totalBill, currency)}).`,
      )
      return
    }

    if (val === 0) {
      setShareModes((prev) => ({ ...prev, [memberId]: { mode: 'equal', customAmount: 0 } }))
    } else {
      setShareModes((prev) => ({ ...prev, [memberId]: { mode: 'custom', customAmount: val } }))
    }
    setEditingCustomId(null)
    setCustomError(null)
  }

  function resetToEqual(memberId: string) {
    setShareModes((prev) => ({ ...prev, [memberId]: { mode: 'equal', customAmount: 0 } }))
    setEditingCustomId(null)
    setCustomError(null)
  }

  function resetAllToEqual() {
    const initial: Record<string, MemberShareState> = {}
    for (const m of members) {
      initial[m.id] = { mode: 'equal', customAmount: 0 }
    }
    setShareModes(initial)
    setEditingCustomId(null)
    setCustomError(null)
  }

  const hasCustomOrSkipped = members.some(
    (m) =>
      shareModes[m.id]?.mode === 'skip' ||
      (shareModes[m.id]?.mode === 'custom' && (shareModes[m.id]?.customAmount ?? 0) > 0),
  )

  function pickBill(file: File | null) {
    setBillFile(file)
    setRemoveBill(false)
    setBillPreview(file ? URL.createObjectURL(file) : null)
  }

  async function save() {
    const value = parseCurrencyInput(amount)
    if (!title.trim() || !Number.isFinite(value) || value <= 0 || !spenderId) {
      setError('A title, a positive amount and a spender are required.')
      return
    }
    if (activeCount === 0) {
      setError('At least one person has to share this spending.')
      return
    }
    if (sumCustom > value) {
      setError(
        `Total custom amounts (${fmtMoney(sumCustom, currency)}) exceed the bill total (${fmtMoney(value, currency)}).`,
      )
      return
    }

    setSaving(true)
    setError(null)
    try {
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

      const { error: delErr } = await supabase.from('spend_shares').delete().eq('spend_id', spendId)
      if (delErr) throw delErr

      const shares = members
        .map((m) => {
          const st = shareModes[m.id]
          let weight = 0
          if (st?.mode === 'skip') {
            weight = 0
          } else if (st?.mode === 'custom' && (st.customAmount ?? 0) > 0) {
            weight = st.customAmount
          } else {
            weight = equalShare
          }
          return { spend_id: spendId, member_id: m.id, weight }
        })
        .filter((s) => s.weight > 0)

      if (shares.length > 0) {
        const { error: shareErr } = await supabase.from('spend_shares').insert(shares)
        if (shareErr) throw shareErr
      }

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
          <Button variant="primary" full size="lg" onClick={() => void save()} disabled={saving}>
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
              type="text"
              inputMode="decimal"
              placeholder={currency === 'VND' ? '0' : '0.00'}
              value={amount}
              onChange={(e) => setAmount(formatCurrencyInput(e.target.value, currency))}
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          label={`Who shares it? (${activeCount}/${members.length})`}
          action={
            hasCustomOrSkipped ? (
              <button
                type="button"
                onClick={resetAllToEqual}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-black text-primary hover:bg-primary-soft transition active:scale-95"
                title="Reset everyone to full equal split"
              >
                <RotateCcw size={12} />
                <span>Reset to equal split</span>
              </button>
            ) : undefined
          }
          hint="Skip = doesn't pay for this bill. Custom amount = pays a fixed amount; the rest is split equally."
        >
          <div className="space-y-2">
            {members.map((m) => {
              const st = shareModes[m.id] ?? { mode: 'equal', customAmount: 0 }
              const isSkipped = st.mode === 'skip'
              const isCustom = st.mode === 'custom' && st.customAmount > 0
              const isEditingThis = editingCustomId === m.id

              return (
                <div
                  key={m.id}
                  className={cn(
                    'flex flex-col gap-2 rounded-2xl border bg-surface-2/80 p-3 transition-all',
                    isEditingThis
                      ? 'border-primary/50 shadow-glow'
                      : isCustom
                        ? 'border-primary/30'
                        : isSkipped
                          ? 'border-danger/20 opacity-70'
                          : 'border-line/50',
                  )}
                >
                  <div className="flex items-center justify-between gap-2.5">
                    {/* Member info */}
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <Avatar name={m.display_name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <span
                          className={cn(
                            'block truncate text-sm font-extrabold',
                            isSkipped ? 'text-muted line-through opacity-60' : 'text-ink',
                          )}
                        >
                          {m.display_name}
                        </span>
                        <span className="text-[11px] font-semibold text-muted tabular-nums">
                          {isSkipped
                            ? 'Skipped'
                            : isCustom
                              ? `Custom: ${fmtMoney(st.customAmount, currency)}`
                              : totalBill > 0
                                ? `Equal share: ~${fmtMoney(equalShare, currency)}`
                                : 'Equal share'}
                        </span>
                      </div>
                    </div>

                    {/* Action buttons: Skip & Custom amount */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => toggleSkip(m.id)}
                        className={cn(
                          'rounded-xl px-3 py-1.5 text-xs font-black transition-all select-none',
                          isSkipped
                            ? 'bg-danger-soft text-danger border border-danger/40 shadow-sm'
                            : 'bg-surface text-muted hover:text-ink border border-line/40',
                        )}
                      >
                        Skip
                      </button>

                      <button
                        type="button"
                        onClick={() => openCustomInput(m.id)}
                        className={cn(
                          'rounded-xl px-3 py-1.5 text-xs font-black transition-all select-none flex items-center gap-1.5',
                          isCustom
                            ? 'bg-primary text-on-primary shadow-glow border border-primary'
                            : isEditingThis
                              ? 'bg-primary-soft text-primary border border-primary/40'
                              : 'bg-surface text-muted hover:text-ink border border-line/40',
                        )}
                      >
                        {isCustom ? (
                          <>
                            <Pencil size={11} className="shrink-0" />
                            <span>{fmtMoney(st.customAmount, currency)}</span>
                          </>
                        ) : (
                          <span>Custom amount</span>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Inline custom input field */}
                  {isEditingThis && (
                    <div className="mt-1.5 flex flex-col gap-1.5 rounded-xl border border-primary/30 bg-surface/90 p-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-primary shrink-0 px-1">{currency}</span>
                        <Input
                          autoFocus
                          type="text"
                          inputMode="decimal"
                          placeholder={
                            totalBill > 0
                              ? `Max ${fmtMoney(totalBill, currency)}`
                              : currency === 'VND'
                                ? '0'
                                : '0.00'
                          }
                          value={tempCustomInput}
                          onChange={(e) => {
                            setTempCustomInput(formatCurrencyInput(e.target.value, currency))
                            setCustomError(null)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              saveCustomInput(m.id)
                            } else if (e.key === 'Escape') {
                              setEditingCustomId(null)
                              setCustomError(null)
                            }
                          }}
                          className="!py-1.5 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => saveCustomInput(m.id)}
                          className="rounded-xl bg-primary px-3.5 py-2 text-xs font-black text-on-primary shadow-glow shrink-0 transition hover:brightness-110 active:scale-95"
                        >
                          Set
                        </button>
                        {isCustom && (
                          <button
                            type="button"
                            onClick={() => resetToEqual(m.id)}
                            className="rounded-xl border border-line/50 bg-surface-2 px-2.5 py-2 text-xs font-bold text-muted hover:text-ink shrink-0 transition"
                            title="Reset to equal share"
                          >
                            Reset
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCustomId(null)
                            setCustomError(null)
                          }}
                          className="rounded-xl p-2 text-muted hover:text-ink shrink-0 transition"
                          aria-label="Cancel"
                        >
                          <X size={15} />
                        </button>
                      </div>
                      {customError && (
                        <p className="text-[11px] font-bold text-danger px-1">{customError}</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Field>

        <Field label="Bill photo">
          {billPreview ? (
            <div className="relative overflow-hidden rounded-2xl border border-line/60">
              <img src={billPreview} alt="Bill" className="max-h-56 w-full object-cover" />
              <button
                type="button"
                onClick={() => {
                  pickBill(null)
                  setRemoveBill(true)
                }}
                className="absolute right-2 top-2 rounded-full bg-black/70 px-3 py-1 text-xs font-black text-white backdrop-blur-sm"
              >
                Remove
              </button>
            </div>
          ) : (
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line bg-surface-2/60 px-4 py-6 text-sm font-extrabold text-muted transition hover:border-primary hover:text-primary">
              <Camera size={18} />
              Upload receipt / bill photo
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
