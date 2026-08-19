import { ArrowRight, Check, CheckCircle2, ChevronDown, Copy, Crown, Download, FileText, Minus, Pencil, PiggyBank, Receipt, Share2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { currencyDecimals, fmtMoney, formatCurrencyInput, parseCurrencyInput } from '../../lib/format'
import { spendCategory } from '../../lib/categories'
import { canEditRecap } from '../../lib/permissions'
import { computeRecap, type MemberRecap, type Settlement } from '../../lib/split'
import { supabase } from '../../lib/supabase'
import type { Member } from '../../types'
import type { HangoutData } from '../../pages/Hangout'
import { Avatar, Button, ErrorNote, Field, Input, Modal, Toggle, cn } from '../ui'

function getSettlementKey(s: Settlement): string {
  return `${s.fromId}->${s.toId}:${s.amount}`
}

/**
 * Combined settlement recap: separates payers from receivers, uses rounded box
 * checkboxes with partial "-" state, and allows expanding details for all groups.
 */
export function RecapTab({ data }: { data: HangoutData }) {
  const { hangout, me, members, spends, reload } = data
  const [editingMember, setEditingMember] = useState<Member | null>(null)
  const [showFullRecap, setShowFullRecap] = useState(false)
  const cur = hangout.currency

  const adminMember = members.find((m) => m.is_admin) || members[0]
  const [depositHolderId, setDepositHolderId] = useState<string>(() => {
    return localStorage.getItem(`hangowl_holder_${hangout.id}`) || adminMember?.id || ''
  })

  const recap = useMemo(
    () =>
      computeRecap(
        members.map((m) => ({
          id: m.id,
          name: m.display_name,
          deposit: Number(m.deposit),
          override: m.share_override === null ? null : Number(m.share_override),
          isDepositHolder: m.id === depositHolderId,
        })),
        spends.map((s) => ({
          id: s.id,
          amount: Number(s.amount),
          spenderMemberId: s.spender_member_id,
          shares: s.spend_shares.map((sh) => ({ memberId: sh.member_id, weight: Number(sh.weight) })),
        })),
        currencyDecimals(hangout.currency),
      ),
    [members, spends, hangout.currency, depositHolderId],
  )

  // Track checked settlements in localStorage
  const [settledKeys, setSettledKeys] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(`hangowl_settled_${hangout.id}`)
      return raw ? new Set(JSON.parse(raw)) : new Set()
    } catch {
      return new Set()
    }
  })

  // Separate payers (owe money) and receivers (get back money). Filter out neutral ($0)
  const payers = recap.rows.filter((r) => r.balance > 0.005)
  const receivers = recap.rows.filter((r) => r.balance < -0.005)

  const totalOwed = payers.reduce((sum, r) => sum + r.balance, 0)
  const totalReceiving = receivers.reduce((sum, r) => sum + Math.abs(r.balance), 0)

  const totalSettlements = recap.settlements.length
  const settledCount = recap.settlements.filter((s) => settledKeys.has(getSettlementKey(s))).length
  const allSettled = totalSettlements > 0 && settledCount === totalSettlements
  const settlePercent = totalSettlements > 0 ? Math.round((settledCount / totalSettlements) * 100) : 0

  async function toggleSettlement(key: string) {
    const next = new Set(settledKeys)
    if (next.has(key)) {
      next.delete(key)
    } else {
      next.add(key)
    }
    setSettledKeys(next)
    try {
      localStorage.setItem(`hangowl_settled_${hangout.id}`, JSON.stringify(Array.from(next)))
    } catch {}

    const isComplete = recap.settlements.length > 0 && recap.settlements.every((s) => next.has(getSettlementKey(s)))

    if (isComplete && hangout.status !== 'ended') {
      await supabase.from('hangouts').update({ status: 'ended' }).eq('id', hangout.id)
      reload()
    } else if (!isComplete && hangout.status === 'ended') {
      await supabase.from('hangouts').update({ status: 'active' }).eq('id', hangout.id)
      reload()
    }
  }

  async function toggleAllForMember(memberId: string, isPayer: boolean) {
    const next = new Set(settledKeys)
    const memberSettlements = isPayer
      ? recap.settlements.filter((s) => s.fromId === memberId)
      : recap.settlements.filter((s) => s.toId === memberId)

    if (memberSettlements.length === 0) return

    const allMemberDone = memberSettlements.every((s) => next.has(getSettlementKey(s)))

    for (const s of memberSettlements) {
      const key = getSettlementKey(s)
      if (allMemberDone) {
        next.delete(key)
      } else {
        next.add(key)
      }
    }

    setSettledKeys(next)
    try {
      localStorage.setItem(`hangowl_settled_${hangout.id}`, JSON.stringify(Array.from(next)))
    } catch {}

    const isComplete = recap.settlements.length > 0 && recap.settlements.every((s) => next.has(getSettlementKey(s)))

    if (isComplete && hangout.status !== 'ended') {
      await supabase.from('hangouts').update({ status: 'ended' }).eq('id', hangout.id)
      reload()
    } else if (!isComplete && hangout.status === 'ended') {
      await supabase.from('hangouts').update({ status: 'active' }).eq('id', hangout.id)
      reload()
    }
  }

  const editable = canEditRecap(hangout, me)
  const memberById = new Map(members.map((m) => [m.id, m]))

  return (
    <div className="space-y-5">
      {/* All Settled Completion Banner */}
      {allSettled && (
        <div className="flex items-center gap-3.5 rounded-2xl sm:rounded-3xl border border-success/40 bg-gradient-to-r from-success-soft/90 to-surface p-4 sm:p-5 shadow-glow-success">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-success text-on-primary shadow-sm">
            <CheckCircle2 size={24} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="text-sm sm:text-base font-black text-ink">All payments settled!</h4>
              <span className="rounded-full bg-success px-2 py-0.5 text-[10px] font-black uppercase text-on-primary">
                Completed
              </span>
            </div>
            <p className="text-xs font-semibold text-muted mt-0.5">
              Every member has transferred their share. This hangout is marked as completed.
            </p>
          </div>
        </div>
      )}

      {/* Total spent summary card */}
      <div className="rounded-2xl sm:rounded-3xl border border-line/60 bg-surface p-5 sm:p-6 shadow-card space-y-3.5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-wider text-muted">Hangout Total Spent</p>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-black tabular-nums text-ink">{fmtMoney(recap.total, cur)}</span>
            </div>
          </div>
          {totalSettlements > 0 && (
            <span
              className={cn(
                'rounded-full px-3 py-1 text-xs font-black tabular-nums transition-all shrink-0',
                allSettled
                  ? 'bg-success-soft text-success border border-success/30'
                  : 'bg-surface-2 text-ink border border-line/50',
              )}
            >
              {settledCount}/{totalSettlements} settled
            </span>
          )}
        </div>

        {/* Settlement Status Progress Bar */}
        {totalSettlements > 0 && (
          <div className="space-y-1.5 pt-0.5">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="text-muted flex items-center gap-1.5">
                <CheckCircle2 size={13} className={allSettled ? 'text-success' : 'text-primary'} />
                Settlement status
              </span>
              <span className={cn('tabular-nums font-black', allSettled ? 'text-success' : 'text-ink')}>
                {allSettled
                  ? 'All settled 🎉'
                  : `${settledCount} of ${totalSettlements} settled (${settlePercent}%)`}
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className={cn(
                  'h-full transition-all duration-500 rounded-full',
                  allSettled
                    ? 'bg-success shadow-glow-success'
                    : settledCount > 0
                      ? 'bg-gradient-to-r from-primary to-success shadow-glow'
                      : 'bg-primary/50',
                )}
                style={{ width: `${Math.max(settledCount > 0 ? 4 : 0, (settledCount / totalSettlements) * 100)}%` }}
              />
            </div>
          </div>
        )}

        <div className="pt-2 border-t border-line/40">
          <Button
            type="button"
            variant="outline"
            size="md"
            full
            onClick={() => setShowFullRecap(true)}
            className="font-black gap-2 border-primary/40 text-primary hover:bg-primary-soft"
          >
            <FileText size={16} />
            Full bill recap
          </Button>
        </div>
      </div>

      <FullBillRecapModal
        open={showFullRecap}
        onClose={() => setShowFullRecap(false)}
        data={data}
        recap={recap}
      />

      {/* Payers & Receivers Unified Split Lists */}
      {payers.length === 0 && receivers.length === 0 ? (
        <div className="rounded-2xl sm:rounded-3xl border border-line/60 bg-surface p-8 text-center shadow-card">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-success-soft text-success shadow-sm">
            <CheckCircle2 size={24} />
          </div>
          <h4 className="text-base font-black text-ink">All Settled</h4>
          <p className="mt-1 text-xs font-semibold text-muted">
            {recap.total === 0
              ? 'No spendings logged yet. Add spends in the Spend tab to see calculations.'
              : 'Every member has paid their exact share. No transfers required.'}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Section 1: Need to Pay */}
          {payers.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-black uppercase tracking-wider text-muted">Need to Pay</h3>
                  <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[10px] font-black text-danger border border-danger/30">
                    {payers.length}
                  </span>
                </div>
                <span className="text-xs font-bold text-muted tabular-nums">
                  Total: {fmtMoney(totalOwed, cur)}
                </span>
              </div>
              <div className="space-y-2">
                {payers.map((row) => (
                  <PersonCard
                    key={row.memberId}
                    row={row}
                    member={memberById.get(row.memberId)}
                    currency={cur}
                    settlements={recap.settlements}
                    settledKeys={settledKeys}
                    onToggleSettlement={toggleSettlement}
                    onToggleAll={() => toggleAllForMember(row.memberId, true)}
                    onEdit={editable ? () => setEditingMember(memberById.get(row.memberId) ?? null) : undefined}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Section 2: Get Back */}
          {receivers.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-black uppercase tracking-wider text-muted">Get Back</h3>
                  <span className="rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-black text-success border border-success/30">
                    {receivers.length}
                  </span>
                </div>
                <span className="text-xs font-bold text-muted tabular-nums">
                  Total: {fmtMoney(totalReceiving, cur)}
                </span>
              </div>
              <div className="space-y-2">
                {receivers.map((row) => (
                  <PersonCard
                    key={row.memberId}
                    row={row}
                    member={memberById.get(row.memberId)}
                    currency={cur}
                    settlements={recap.settlements}
                    settledKeys={settledKeys}
                    onToggleSettlement={toggleSettlement}
                    onToggleAll={() => toggleAllForMember(row.memberId, false)}
                    onEdit={editable ? () => setEditingMember(memberById.get(row.memberId) ?? null) : undefined}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {editingMember && (
        <AdjustModal
          member={editingMember}
          currency={cur}
          isDepositHolder={editingMember.id === depositHolderId}
          onSetDepositHolder={(isHolder) => {
            const nextId = isHolder ? editingMember.id : adminMember?.id || ''
            setDepositHolderId(nextId)
            localStorage.setItem(`hangowl_holder_${hangout.id}`, nextId)
          }}
          onClose={() => setEditingMember(null)}
          onSaved={reload}
        />
      )}
    </div>
  )
}

function PersonCard({
  row,
  member,
  currency,
  settlements,
  settledKeys,
  onToggleSettlement,
  onToggleAll,
  onEdit,
}: {
  row: MemberRecap
  member: Member | undefined
  currency: string
  settlements: Settlement[]
  settledKeys: Set<string>
  onToggleSettlement?: (key: string) => void
  onToggleAll?: () => void
  onEdit?: () => void
}) {
  const [open, setOpen] = useState(false)
  const owes = row.balance > 0.005
  const receives = row.balance < -0.005

  const pays = settlements.filter((s) => s.fromId === row.memberId)
  const getsFrom = settlements.filter((s) => s.toId === row.memberId)
  const relevant = owes ? pays : getsFrom
  const totalCount = relevant.length
  const settledCount = relevant.filter((s) => settledKeys.has(getSettlementKey(s))).length

  const isAllSettled = totalCount > 0 && settledCount === totalCount
  const isPartialSettled = settledCount > 0 && settledCount < totalCount

  const tone = isAllSettled
    ? 'text-success'
    : isPartialSettled
      ? 'text-primary'
      : owes
        ? 'text-danger'
        : receives
          ? 'text-success'
          : 'text-muted'

  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border transition-all shadow-card',
        isAllSettled
          ? 'border-success/30 bg-surface/90 opacity-80'
          : isPartialSettled
            ? 'border-primary/40 bg-surface'
            : 'border-line/60 bg-surface',
      )}
    >
      <div className="flex items-center gap-3 sm:gap-3.5 p-3.5 sm:p-4">
        {/* Rounded Box Checkbox (with full check or partial "-" dash) */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggleAll?.()
          }}
          className="shrink-0 select-none p-0.5 transition-transform hover:scale-105 active:scale-95"
          title={
            isAllSettled
              ? 'Mark as unpaid'
              : isPartialSettled
                ? `${settledCount}/${totalCount} settled — click to complete all`
                : 'Mark as paid'
          }
        >
          <div
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-lg border-2 transition-all',
              isAllSettled
                ? 'border-success bg-success text-white shadow-glow-success'
                : isPartialSettled
                  ? 'border-primary bg-primary text-white shadow-glow'
                  : 'border-line/90 bg-surface-2/70 hover:border-primary/60',
            )}
          >
            {isAllSettled && <Check size={14} strokeWidth={3.5} />}
            {isPartialSettled && <Minus size={14} strokeWidth={3.5} />}
          </div>
        </button>

        {/* Expandable row content */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left select-none"
          aria-expanded={open}
        >
          <Avatar name={row.name} size="md" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  'truncate text-sm sm:text-base font-black',
                  isAllSettled ? 'line-through text-muted' : 'text-ink',
                )}
              >
                {row.name}
              </span>
              {member?.is_admin && <Crown size={13} className="shrink-0 text-warning" />}
            </div>
            <span className={cn('text-[11px] font-black uppercase tracking-wider', tone)}>
              {isAllSettled
                ? 'Settled'
                : isPartialSettled
                  ? `Partial (${settledCount}/${totalCount})`
                  : owes
                    ? 'Owes'
                    : receives
                      ? 'Gets back'
                      : 'Settled'}
            </span>
          </div>

          <span
            className={cn(
              'shrink-0 text-base sm:text-lg font-black tabular-nums',
              isAllSettled ? 'line-through text-muted' : tone,
            )}
          >
            {owes || receives ? fmtMoney(Math.abs(row.balance), currency) : '—'}
          </span>

          <ChevronDown
            size={16}
            className={cn('shrink-0 text-muted transition-transform duration-200', open && 'rotate-180')}
          />
        </button>
      </div>

      {/* Expandable breakdown section */}
      {open && (
        <div className="space-y-3.5 border-t border-line/50 bg-surface-2/30 px-4 py-3.5">
          {/* Money breakdown chips */}
          <div className="flex flex-wrap gap-2 text-xs">
            <div className="rounded-xl border border-line/50 bg-surface-2/80 px-3 py-1.5">
              <span className="text-muted font-bold">Share: </span>
              <span className={cn('font-black tabular-nums', row.overridden ? 'text-accent' : 'text-ink')}>
                {fmtMoney(row.share, currency)}
              </span>
              {row.overridden && <span className="text-accent font-bold"> (fixed)</span>}
            </div>
            <div className="rounded-xl border border-line/50 bg-surface-2/80 px-3 py-1.5">
              <span className="text-muted font-bold">Paid: </span>
              <span className="font-black tabular-nums text-ink">{fmtMoney(row.paid, currency)}</span>
            </div>
            {row.deposit > 0 && (
              <div className="rounded-xl border border-line/50 bg-surface-2/80 px-3 py-1.5">
                <span className="text-muted font-bold">Deposit: </span>
                <span className="font-black tabular-nums text-ink">{fmtMoney(row.deposit, currency)}</span>
              </div>
            )}
          </div>

          {/* Transfers list: Interactive Checklist for both Payers and Receivers */}
          <div className="space-y-2">
            {!owes && !receives ? (
              <p className="text-xs font-bold text-muted">All settled — nothing to transfer.</p>
            ) : owes ? (
              pays.map((s) => {
                const key = getSettlementKey(s)
                const isChecked = settledKeys.has(key)

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onToggleSettlement?.(key)}
                    className={cn(
                      'flex items-center justify-between rounded-xl border p-2.5 w-full text-left transition select-none',
                      isChecked
                        ? 'border-success/20 bg-success-soft/30 opacity-75'
                        : 'border-danger/20 bg-danger-soft/40 hover:border-danger/40',
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={cn(
                          'flex h-4.5 w-4.5 items-center justify-center rounded-md border-2 transition-all shrink-0',
                          isChecked
                            ? 'border-success bg-success text-white'
                            : 'border-line/90 bg-surface',
                        )}
                      >
                        {isChecked && <Check size={11} strokeWidth={3.5} />}
                      </div>
                      <span className={cn('text-xs font-black text-ink truncate', isChecked && 'line-through text-muted')}>
                        Pay {s.toName}
                      </span>
                    </div>
                    <span
                      className={cn(
                        'text-xs font-black tabular-nums shrink-0',
                        isChecked ? 'text-success line-through' : 'text-danger',
                      )}
                    >
                      {fmtMoney(s.amount, currency)}
                    </span>
                  </button>
                )
              })
            ) : (
              getsFrom.map((s) => {
                const key = getSettlementKey(s)
                const isChecked = settledKeys.has(key)

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onToggleSettlement?.(key)}
                    className={cn(
                      'flex items-center justify-between rounded-xl border p-2.5 w-full text-left transition select-none',
                      isChecked
                        ? 'border-success/20 bg-success-soft/30 opacity-75'
                        : 'border-success/20 bg-success-soft/40 hover:border-success/50',
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={cn(
                          'flex h-4.5 w-4.5 items-center justify-center rounded-md border-2 transition-all shrink-0',
                          isChecked
                            ? 'border-success bg-success text-white'
                            : 'border-line/90 bg-surface',
                        )}
                      >
                        {isChecked && <Check size={11} strokeWidth={3.5} />}
                      </div>
                      <Avatar name={s.fromName} size="sm" className="!h-5 !w-5 !text-[9px] !ring-0 shrink-0" />
                      <span className={cn('text-xs font-black text-ink truncate', isChecked && 'line-through text-muted')}>
                        {s.fromName} pays you
                      </span>
                    </div>
                    <span
                      className={cn(
                        'text-xs font-black tabular-nums shrink-0',
                        isChecked ? 'text-success line-through' : 'text-success',
                      )}
                    >
                      {fmtMoney(s.amount, currency)}
                    </span>
                  </button>
                )
              })
            )}
          </div>

          {onEdit && (
            <Button variant="soft" size="sm" onClick={onEdit} full>
              <Pencil size={14} />
              Adjust deposit / share
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

/** Edit one member's deposit + share override. */
function AdjustModal({
  member,
  currency,
  isDepositHolder,
  onSetDepositHolder,
  onClose,
  onSaved,
}: {
  member: Member
  currency: string
  isDepositHolder: boolean
  onSetDepositHolder: (isHolder: boolean) => void
  onClose: () => void
  onSaved: () => void
}) {
  const [deposit, setDeposit] = useState(() => (member.deposit ? formatCurrencyInput(member.deposit, currency) : ''))
  const [useOverride, setUseOverride] = useState(member.share_override !== null)
  const [override, setOverride] = useState(() =>
    member.share_override !== null ? formatCurrencyInput(member.share_override, currency) : '',
  )
  const [holder, setHolder] = useState(isDepositHolder)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    const dep = parseCurrencyInput(deposit)
    const ovr = useOverride ? parseCurrencyInput(override) : null
    if (!Number.isFinite(dep) || dep < 0 || (useOverride && (!Number.isFinite(ovr!) || ovr! < 0))) {
      setError('Amounts must be valid non-negative numbers.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const { error } = await supabase
        .from('hangout_members')
        .update({ deposit: dep, share_override: ovr })
        .eq('id', member.id)
      if (error) throw error

      if (holder !== isDepositHolder) {
        onSetDepositHolder(holder)
      }

      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Adjust — ${member.display_name}`}
      footer={
        <Button variant="primary" full size="lg" onClick={() => void save()} disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      }
    >
      <div className="space-y-4 pb-2">
        <Field
          label={`Deposit (${currency})`}
          hint="Money this person contributed upfront as a deposit."
          action={
            deposit ? (
              <button
                type="button"
                onClick={() => setDeposit('')}
                className="flex items-center gap-1 text-[11px] font-black text-muted hover:text-danger transition select-none"
              >
                <X size={12} /> Clear
              </button>
            ) : undefined
          }
        >
          <div className="relative flex items-center">
            <PiggyBank size={18} className="absolute left-3.5 text-primary pointer-events-none" />
            <Input
              type="text"
              inputMode="decimal"
              placeholder={currency === 'VND' ? '0' : '0.00'}
              value={deposit}
              onChange={(e) => setDeposit(formatCurrencyInput(e.target.value, currency))}
              className="pl-10 pr-9"
            />
            {deposit && (
              <button
                type="button"
                onClick={() => setDeposit('')}
                className="absolute right-2.5 flex h-6 w-6 items-center justify-center rounded-full bg-surface-2 text-muted hover:bg-line/60 hover:text-ink transition"
                title="Clear deposit"
              >
                <X size={13} strokeWidth={2.5} />
              </button>
            )}
          </div>
        </Field>

        <div className="rounded-2xl border border-line/60 bg-surface-2/60 p-3">
          <Toggle
            checked={holder}
            onChange={setHolder}
            label="Holds the group deposit"
            description="If enabled, this person holds the collected upfront cash pool for the group."
          />
        </div>

        <div className="rounded-2xl border border-line/60 bg-surface-2/60 p-3">
          <Toggle
            checked={useOverride}
            onChange={setUseOverride}
            label="Override their share"
            description="Fix this person's total share (e.g. they generously offered to cover more). The difference is spread across everyone else."
          />
          {useOverride && (
            <div className="px-1 pb-1 pt-2">
              <Input
                type="text"
                inputMode="decimal"
                placeholder={`Share in ${currency}`}
                value={override}
                onChange={(e) => setOverride(formatCurrencyInput(e.target.value, currency))}
              />
            </div>
          )}
        </div>

        <ErrorNote message={error} />
      </div>
    </Modal>
  )
}

function FullBillRecapModal({
  open,
  onClose,
  data,
  recap,
}: {
  open: boolean
  onClose: () => void
  data: HangoutData
  recap: ReturnType<typeof computeRecap>
}) {
  const { hangout, members, spends } = data
  const cur = hangout.currency
  const memberMap = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
  const [copied, setCopied] = useState(false)

  const textReport = useMemo(() => {
    let text = `📊 FULL FINANCIAL RECAP - ${hangout.name.toUpperCase()}\n`
    text += `===============================\n`
    text += `💰 Total Spent: ${fmtMoney(recap.total, cur)}\n`
    text += `👥 Members (${members.length}): ${members.map((m) => m.display_name).join(', ')}\n`
    text += `🧾 Total Spends Logged: ${spends.length}\n\n`

    if (spends.length > 0) {
      text += `-------------------------------\n`
      text += `📝 ITEMIZED SPENDINGS:\n`
      spends.forEach((s, idx) => {
        const spender = memberMap.get(s.spender_member_id)?.display_name || 'Someone'
        text += `${idx + 1}. ${s.title}: ${fmtMoney(Number(s.amount), cur)} (Paid by ${spender})\n`
      })
      text += `\n`
    }

    text += `-------------------------------\n`
    text += `👤 MEMBER FINANCIAL BREAKDOWN:\n`
    recap.rows.forEach((r) => {
      const balStr =
        r.balance > 0.005
          ? `owes ${fmtMoney(r.balance, cur)}`
          : r.balance < -0.005
            ? `gets back ${fmtMoney(Math.abs(r.balance), cur)}`
            : `all clear`
      text += `• ${r.name}: Paid ${fmtMoney(r.paid, cur)} | Fair Share ${fmtMoney(r.share, cur)} (${balStr})\n`
    })

    text += `\n-------------------------------\n`
    text += `💸 FINAL PAYBACK TRANSFERS:\n`
    if (recap.settlements.length === 0) {
      text += `🎉 No transfers needed! All settled.\n`
    } else {
      recap.settlements.forEach((s, idx) => {
        const fromName = memberMap.get(s.fromId)?.display_name || s.fromId
        const toName = memberMap.get(s.toId)?.display_name || s.toId
        text += `${idx + 1}. ${fromName} ➔ ${toName}: ${fmtMoney(s.amount, cur)}\n`
      })
    }

    text += `\n===============================\n`
    text += `Generated by HangOwl 🦉`
    return text
  }, [hangout.name, recap, cur, members, spends, memberMap])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(textReport)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Full Bill Recap - ${hangout.name}`,
          text: textReport,
        })
      } catch {}
    } else {
      void handleCopy()
    }
  }

  const [generatingImg, setGeneratingImg] = useState(false)

  async function handleSaveImage() {
    setGeneratingImg(true)
    try {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // Phone portrait target dimensions (9:16 ratio)
      const width = 1080
      const padding = 60
      let y = padding

      // Calculate content height dynamically
      let calculatedHeight = padding + 180 + 80 // Header & Hero
      calculatedHeight += 60 + spends.length * 64 + 40 // Spends
      calculatedHeight += 60 + recap.rows.length * 64 + 40 // Summary
      calculatedHeight += 60 + (recap.settlements.length || 1) * 64 + 100 // Transfers & Footer

      // Ensure min height matches 9:16 phone ratio (1080 x 1920)
      const targetHeight = Math.max(1920, calculatedHeight)
      canvas.width = width
      canvas.height = targetHeight

      // Background gradient
      const bgGrad = ctx.createLinearGradient(0, 0, 0, targetHeight)
      bgGrad.addColorStop(0, '#0F121D')
      bgGrad.addColorStop(0.5, '#161A2B')
      bgGrad.addColorStop(1, '#0D0F18')
      ctx.fillStyle = bgGrad
      ctx.fillRect(0, 0, width, targetHeight)

      // Header Brand
      ctx.fillStyle = '#6C5CE7'
      ctx.font = '900 36px "Plus Jakarta Sans", sans-serif'
      ctx.fillText('HangOwl 🦉', padding, y + 36)

      ctx.fillStyle = '#A0A5BD'
      ctx.font = '800 24px "Plus Jakarta Sans", sans-serif'
      ctx.fillText('FULL FINANCIAL RECAP', padding, y + 70)
      y += 110

      // Hero Total Spent Box
      const heroHeight = 140
      ctx.fillStyle = '#1D2236'
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.roundRect(padding, y, width - padding * 2, heroHeight, 28)
      ctx.fill()
      ctx.stroke()

      ctx.fillStyle = '#A0A5BD'
      ctx.font = '900 20px "Plus Jakarta Sans", sans-serif'
      ctx.fillText(hangout.name.toUpperCase(), padding + 30, y + 42)

      ctx.fillStyle = '#FFFFFF'
      ctx.font = '900 52px "Plus Jakarta Sans", sans-serif'
      ctx.fillText(fmtMoney(recap.total, cur), padding + 30, y + 104)

      const infoText = `${members.length} members • ${spends.length} spends`
      ctx.fillStyle = '#6C5CE7'
      ctx.font = '800 22px "Plus Jakarta Sans", sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText(infoText, width - padding - 30, y + 78)
      ctx.textAlign = 'left'
      y += heroHeight + 50

      // Helper for rounded card rows
      const drawRow = (title: string, sub: string, val: string, valColor = '#FFFFFF') => {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.04)'
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.roundRect(padding, y, width - padding * 2, 56, 18)
        ctx.fill()
        ctx.stroke()

        ctx.fillStyle = '#FFFFFF'
        ctx.font = '800 22px "Plus Jakarta Sans", sans-serif'
        ctx.fillText(title, padding + 24, y + 36)

        if (sub) {
          ctx.fillStyle = '#8E94B0'
          ctx.font = '600 18px "Plus Jakarta Sans", sans-serif'
          ctx.fillText(sub, padding + 24 + ctx.measureText(title).width + 16, y + 36)
        }

        ctx.fillStyle = valColor
        ctx.font = '900 22px "Plus Jakarta Sans", sans-serif'
        ctx.textAlign = 'right'
        ctx.fillText(val, width - padding - 24, y + 36)
        ctx.textAlign = 'left'
        y += 66
      }

      // Section: Itemized Spends
      if (spends.length > 0) {
        ctx.fillStyle = '#A0A5BD'
        ctx.font = '900 20px "Plus Jakarta Sans", sans-serif'
        ctx.fillText(`ITEMIZED SPENDINGS (${spends.length})`, padding, y)
        y += 32

        spends.forEach((s) => {
          const spender = memberMap.get(s.spender_member_id)?.display_name || 'Someone'
          drawRow(s.title, `Paid by ${spender}`, fmtMoney(Number(s.amount), cur))
        })
        y += 24
      }

      // Section: Member Financial Summary
      ctx.fillStyle = '#A0A5BD'
      ctx.font = '900 20px "Plus Jakarta Sans", sans-serif'
      ctx.fillText('MEMBER FINANCIAL SUMMARY', padding, y)
      y += 32

      recap.rows.forEach((r) => {
        const isOwed = r.balance < -0.005
        const owes = r.balance > 0.005
        const valStr = isOwed
          ? `+${fmtMoney(Math.abs(r.balance), cur)}`
          : owes
            ? `-${fmtMoney(r.balance, cur)}`
            : 'Settled'
        const valColor = isOwed ? '#00E5A3' : owes ? '#FF5376' : '#8E94B0'

        drawRow(r.name, `Paid ${fmtMoney(r.paid, cur)} · Share ${fmtMoney(r.share, cur)}`, valStr, valColor)
      })
      y += 24

      // Section: Payback Transfer Plan
      ctx.fillStyle = '#A0A5BD'
      ctx.font = '900 20px "Plus Jakarta Sans", sans-serif'
      ctx.fillText(`PAYBACK TRANSFER PLAN (${recap.settlements.length})`, padding, y)
      y += 32

      if (recap.settlements.length === 0) {
        drawRow('All settled!', 'No transfers needed', '🎉', '#00E5A3')
      } else {
        recap.settlements.forEach((s) => {
          const fromName = memberMap.get(s.fromId)?.display_name || s.fromId
          const toName = memberMap.get(s.toId)?.display_name || s.toId
          drawRow(`${fromName} ➔ ${toName}`, '', fmtMoney(s.amount, cur), '#6C5CE7')
        })
      }
      y += 40

      // Footer Watermark
      ctx.fillStyle = '#5A607A'
      ctx.font = '700 18px "Plus Jakarta Sans", sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('Generated by HangOwl App 🦉 · hangowl.app', width / 2, Math.max(y + 20, targetHeight - 40))
      ctx.textAlign = 'left'

      // Export Canvas to PNG Image Download
      const dataUrl = canvas.toDataURL('image/png')
      const link = document.createElement('a')
      link.download = `hangowl-recap-${hangout.name.toLowerCase().replace(/\s+/g, '-')}.png`
      link.href = dataUrl
      link.click()
    } catch (e) {
      console.error('Failed to generate image:', e)
    } finally {
      setGeneratingImg(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Full bill & trip financial recap"
      wide
      footer={
        <div className="flex flex-col sm:flex-row gap-2.5">
          <Button
            type="button"
            variant="primary"
            size="lg"
            full
            onClick={() => void handleSaveImage()}
            disabled={generatingImg}
            className="font-black gap-2 shadow-glow"
          >
            <Download size={18} />
            {generatingImg ? 'Generating image…' : 'Save as Phone Image (9:16)'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => void handleCopy()}
            className="font-black gap-2 shrink-0"
          >
            {copied ? <Check size={18} /> : <Copy size={18} />}
            {copied ? 'Copied!' : 'Copy text'}
          </Button>
          {typeof navigator !== 'undefined' && 'share' in navigator && (
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => void handleShare()}
              className="font-black gap-2 shrink-0"
            >
              <Share2 size={18} />
              Share
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-6 pb-2">
        {/* Hangout Summary Hero */}
        <div className="rounded-2xl sm:rounded-3xl border border-line/60 bg-surface-2/60 p-5 shadow-sm space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-muted">{hangout.name}</p>
              <h3 className="text-2xl sm:text-3xl font-black tabular-nums text-ink mt-0.5">
                {fmtMoney(recap.total, cur)}
              </h3>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-line/50 bg-surface px-3 py-1 text-xs font-black text-muted">
              <span>{members.length} members</span>
              <span>•</span>
              <span>{spends.length} spends</span>
            </div>
          </div>
        </div>

        {/* Itemized Spends List */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black uppercase tracking-wider text-muted flex items-center gap-1.5">
              <Receipt size={14} className="text-primary" />
              Itemized Spends ({spends.length})
            </h4>
          </div>
          {spends.length === 0 ? (
            <div className="rounded-2xl border border-line/50 bg-surface-2/40 p-4 text-center text-xs font-semibold text-muted">
              No spendings logged for this hangout yet.
            </div>
          ) : (
            <div className="space-y-2">
              {spends.map((s) => {
                const meta = spendCategory(s.category as any)
                const Icon = meta.icon
                const spender = memberMap.get(s.spender_member_id)
                return (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-line/50 bg-surface-2/40 px-4 py-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-primary border border-line/40">
                        <Icon size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-extrabold text-ink">{s.title}</p>
                        <p className="text-xs font-semibold text-muted">
                          Paid by {spender?.display_name || 'Someone'}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-black tabular-nums text-ink shrink-0">
                      {fmtMoney(Number(s.amount), cur)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Member Financial Breakdown */}
        <section className="space-y-3">
          <h4 className="text-xs font-black uppercase tracking-wider text-muted">
            Member Financial Summary
          </h4>
          <div className="space-y-2">
            {recap.rows.map((r) => {
              const isOwed = r.balance < -0.005
              const owes = r.balance > 0.005
              return (
                <div
                  key={r.memberId}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-line/50 bg-surface-2/40 px-4 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar name={r.name} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold text-ink">{r.name}</p>
                      <p className="text-xs font-semibold text-muted">
                        Paid {fmtMoney(r.paid, cur)} • Share {fmtMoney(r.share, cur)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className={cn(
                        'text-sm font-black tabular-nums',
                        isOwed ? 'text-success' : owes ? 'text-danger' : 'text-muted',
                      )}
                    >
                      {isOwed
                        ? `+${fmtMoney(Math.abs(r.balance), cur)}`
                        : owes
                          ? `-${fmtMoney(r.balance, cur)}`
                          : 'Settled'}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Payback Transfers */}
        <section className="space-y-3">
          <h4 className="text-xs font-black uppercase tracking-wider text-muted">
            Payback Transfer Plan ({recap.settlements.length})
          </h4>
          {recap.settlements.length === 0 ? (
            <div className="rounded-2xl border border-line/50 bg-surface-2/40 p-4 text-center text-xs font-semibold text-muted">
              🎉 All settled! No payback transfers required.
            </div>
          ) : (
            <div className="space-y-2">
              {recap.settlements.map((s, idx) => {
                const fromName = memberMap.get(s.fromId)?.display_name || s.fromId
                const toName = memberMap.get(s.toId)?.display_name || s.toId
                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-line/50 bg-surface-2/60 px-4 py-3"
                  >
                    <div className="flex items-center gap-2 text-sm font-extrabold text-ink">
                      <span>{fromName}</span>
                      <ArrowRight size={14} className="text-primary" />
                      <span>{toName}</span>
                    </div>
                    <span className="text-sm font-black tabular-nums text-primary">
                      {fmtMoney(s.amount, cur)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </Modal>
  )
}
