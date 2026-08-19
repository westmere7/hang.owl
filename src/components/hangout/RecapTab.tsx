import { Check, CheckCircle2, ChevronDown, Crown, Minus, Pencil, PiggyBank, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { currencyDecimals, fmtMoney, formatCurrencyInput, parseCurrencyInput } from '../../lib/format'
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
      </div>

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
