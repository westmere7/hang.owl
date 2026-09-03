import { Check, CheckCircle2, ChevronDown, Copy, Crown, ExternalLink, Eye, Minus, Pencil, PiggyBank, Plus, QrCode, Receipt, Trash2, Upload, UserCheck, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { currencyDecimals, fmtMoney, formatCurrencyInput, parseCurrencyInput } from '../../lib/format'
import { canEditRecap } from '../../lib/permissions'
import { computeRecap, type MemberRecap, type Settlement } from '../../lib/split'
import { billUrl, supabase } from '../../lib/supabase'
import type { Hangout, Member } from '../../types'
import type { HangoutData } from '../../pages/Hangout'
import { Avatar, Button, ErrorNote, Field, Input, Modal, Segmented, Spinner, Toggle, cn } from '../ui'
import { BillViewerModal } from './BillViewerModal'
import { compressImageToWebP } from '../../lib/image'
import { buildVietQRUrl, findBank, formatTransferMemo, VIETNAM_BANKS } from '../../lib/vietqr'
import { useSavedBankAccounts } from '../../lib/useSavedBankAccounts'
import { VietQRModal } from '../VietQRModal'

function getSettlementKey(s: Settlement): string {
  // Keyed by the member pair only (not amount) so a "paid" mark survives when
  // amounts recompute after a spend changes.
  return `${s.fromId}->${s.toId}`
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
  // Shared deposit holder (from the DB); falls back to the admin when unset.
  const depositHolderId = hangout.deposit_holder_id ?? adminMember?.id ?? ''

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

  // Settlement "paid" marks live in the DB (shared by the whole group), keyed
  // by the from->to member pair. Loaded here and refreshed when the tab regains
  // focus so everyone sees the same progress.
  const [settledKeys, setSettledKeys] = useState<Set<string>>(new Set())
  useEffect(() => {
    let active = true
    const load = async () => {
      const { data: rows } = await supabase
        .from('settlement_marks')
        .select('from_member_id, to_member_id')
        .eq('hangout_id', hangout.id)
      if (active) {
        setSettledKeys(new Set((rows ?? []).map((r) => `${r.from_member_id}->${r.to_member_id}`)))
      }
    }
    void load()
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    return () => {
      active = false
      window.removeEventListener('focus', onFocus)
    }
  }, [hangout.id])

  // Separate payers (owe money) and receivers (get back money). Filter out neutral ($0)
  const payers = recap.rows.filter((r) => r.balance > 0.005)
  const receivers = recap.rows.filter((r) => r.balance < -0.005)

  const totalOwed = payers.reduce((sum, r) => sum + r.balance, 0)
  const totalReceiving = receivers.reduce((sum, r) => sum + Math.abs(r.balance), 0)

  const { accounts } = useSavedBankAccounts()

  // In-memory bank resolution: if a member in hangout_members doesn't have bank details yet,
  // resolve it immediately from saved_bank_accounts (matching profile_id or display_name)
  const resolvedMembers = useMemo(() => {
    return members.map((m) => {
      if (m.bank_code && m.bank_account_no) return m
      const match = accounts.find(
        (a) =>
          (m.profile_id && a.user_id === m.profile_id) ||
          a.name.trim().toLowerCase() === m.display_name.trim().toLowerCase(),
      )
      if (!match) return m
      return {
        ...m,
        bank_code: match.bank_code,
        bank_name: match.bank_name,
        bank_account_no: match.account_no,
        bank_account_name: match.account_name,
      }
    })
  }, [members, accounts])

  // Payment receiver override (if an admin/member is designated to collect all payments)
  const overrideReceiver = resolvedMembers.find((m) => m.id === hangout.payment_receiver_id)

  const activeSettlements: Settlement[] = useMemo(() => {
    if (!overrideReceiver) return recap.settlements
    return payers
      .filter((p) => p.memberId !== overrideReceiver.id)
      .map((p) => ({
        fromId: p.memberId,
        fromName: p.name,
        toId: overrideReceiver.id,
        toName: overrideReceiver.display_name,
        amount: p.balance,
      }))
  }, [overrideReceiver, recap.settlements, payers])

  const totalSettlements = activeSettlements.length
  const settledCount = activeSettlements.filter((s) => settledKeys.has(getSettlementKey(s))).length
  const allSettled = totalSettlements > 0 && settledCount === totalSettlements
  const settlePercent = totalSettlements > 0 ? Math.round((settledCount / totalSettlements) * 100) : 0

  const [savingReceiver, setSavingReceiver] = useState(false)

  async function handleSetPaymentReceiver(memberId: string | null) {
    setSavingReceiver(true)
    try {
      const { error } = await supabase.rpc('set_payment_receiver', {
        p_hangout: hangout.id,
        p_member: memberId,
      })
      if (error) throw error
      reload()
    } catch (e) {
      console.error('Failed to set payment receiver:', e)
    } finally {
      setSavingReceiver(false)
    }
  }

  async function toggleSettlement(key: string) {
    const [fromId, toId] = key.split('->')
    const has = settledKeys.has(key)
    setSettledKeys((prev) => {
      const next = new Set(prev)
      if (has) next.delete(key)
      else next.add(key)
      return next
    })
    if (has) {
      await supabase
        .from('settlement_marks')
        .delete()
        .eq('hangout_id', hangout.id)
        .eq('from_member_id', fromId)
        .eq('to_member_id', toId)
    } else {
      await supabase
        .from('settlement_marks')
        .upsert({ hangout_id: hangout.id, from_member_id: fromId, to_member_id: toId })
    }
  }

  async function toggleAllForMember(memberId: string, isPayer: boolean) {
    const memberSettlements = isPayer
      ? activeSettlements.filter((s) => s.fromId === memberId)
      : activeSettlements.filter((s) => s.toId === memberId)
    if (memberSettlements.length === 0) return

    const keys = memberSettlements.map(getSettlementKey)
    const allDone = keys.every((k) => settledKeys.has(k))

    setSettledKeys((prev) => {
      const next = new Set(prev)
      for (const k of keys) {
        if (allDone) next.delete(k)
        else next.add(k)
      }
      return next
    })

    if (allDone) {
      await Promise.all(
        memberSettlements.map((s) =>
          supabase
            .from('settlement_marks')
            .delete()
            .eq('hangout_id', hangout.id)
            .eq('from_member_id', s.fromId)
            .eq('to_member_id', s.toId),
        ),
      )
    } else {
      await supabase.from('settlement_marks').upsert(
        memberSettlements.map((s) => ({
          hangout_id: hangout.id,
          from_member_id: s.fromId,
          to_member_id: s.toId,
        })),
      )
    }
  }

  const editable = canEditRecap(hangout, me)
  const memberById = new Map(resolvedMembers.map((m) => [m.id, m]))

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
              Every member has transferred their share.
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
          {/* A real link (not window.open) so popup blockers don't eat it. */}
          <a
            href={`/bill/${hangout.code}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-full border border-primary/40 bg-surface px-5 py-2.5 text-sm font-black text-primary transition-colors hover:bg-primary-soft"
          >
            <ExternalLink size={16} />
            Open payment page
          </a>
        </div>
      </div>

      {/* Bill Receipts Upload & Preview Section */}
      <BillSection hangout={hangout} canEdit={editable} onReload={reload} />

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
          {/* Payment Receiver Setting (Default vs Custom Override) */}
          <div className="rounded-2xl border border-line/60 bg-surface p-4 shadow-card space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <UserCheck size={16} />
                </span>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-ink">Payment Receiver</h4>
                  <p className="text-[11px] font-semibold text-muted">
                    Who receives money from members who need to pay.
                  </p>
                </div>
              </div>

              {editable && (
                <div className="flex items-center gap-2">
                  <Segmented
                    value={hangout.payment_receiver_id ? 'override' : 'default'}
                    onChange={(val) => {
                      if (val === 'default') {
                        void handleSetPaymentReceiver(null)
                      } else {
                        const candidate = members.find((m) => m.id !== hangout.payment_receiver_id) ?? members[0]
                        if (candidate) void handleSetPaymentReceiver(candidate.id)
                      }
                    }}
                    options={[
                      { value: 'default', label: 'Default receivers' },
                      { value: 'override', label: 'Override person' },
                    ]}
                  />
                </div>
              )}
            </div>

            {overrideReceiver ? (
              <div className="space-y-2 pt-1 border-t border-line/40">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Avatar name={overrideReceiver.display_name} size="sm" />
                    <div className="min-w-0">
                      <p className="text-xs font-black text-ink flex items-center gap-1.5">
                        <span>{overrideReceiver.display_name}</span>
                        {overrideReceiver.bank_code && (
                          <span className="rounded bg-primary-soft text-primary font-black px-1.5 py-0.2 text-[10px]">
                            {overrideReceiver.bank_code} ···{overrideReceiver.bank_account_no?.slice(-4)}
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] font-medium text-muted">
                        Collects all payments on behalf of the group and will settle directly with the bill payer.
                      </p>
                    </div>
                  </div>

                  {editable && (
                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        aria-label="Select override receiver"
                        value={overrideReceiver.id}
                        disabled={savingReceiver}
                        onChange={(e) => void handleSetPaymentReceiver(e.target.value)}
                        className="rounded-xl border border-line/60 bg-surface-2 px-2.5 py-1.5 text-xs font-bold text-ink outline-none focus:border-primary/50"
                      >
                        {resolvedMembers.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.display_name} {m.bank_code ? `(${m.bank_code})` : '(no bank info)'}
                          </option>
                        ))}
                      </select>
                      {!overrideReceiver.bank_code && (
                        <Button
                          variant="soft"
                          size="sm"
                          onClick={() => setEditingMember(overrideReceiver)}
                          className="!text-[11px] !py-1"
                        >
                          + Add bank
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {!overrideReceiver.bank_code && (
                  <p className="text-[11px] font-bold text-warning flex items-center gap-1">
                    ⚠️ {overrideReceiver.display_name} hasn't added bank details yet. Add bank details so members can scan VietQR.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-[11px] font-medium text-muted pt-1 border-t border-line/40">
                Payments are made directly to the members who paid for the spends ({receivers.map((r) => r.name).join(', ') || 'spenders'}).
              </p>
            )}
          </div>

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
                    hangout={hangout}
                    memberById={memberById}
                    currency={cur}
                    settlements={activeSettlements}
                    settledKeys={settledKeys}
                    onToggleSettlement={toggleSettlement}
                    onToggleAll={() => toggleAllForMember(row.memberId, true)}
                    onEdit={editable ? () => setEditingMember(memberById.get(row.memberId) ?? null) : undefined}
                    onEditReceiver={editable ? (m) => setEditingMember(m) : undefined}
                    isOverrideCollector={overrideReceiver?.id === row.memberId}
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
                    hangout={hangout}
                    memberById={memberById}
                    currency={cur}
                    settlements={activeSettlements}
                    settledKeys={settledKeys}
                    onToggleSettlement={toggleSettlement}
                    onToggleAll={() => toggleAllForMember(row.memberId, false)}
                    onEdit={editable ? () => setEditingMember(memberById.get(row.memberId) ?? null) : undefined}
                    isOverrideCollector={overrideReceiver?.id === row.memberId}
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
          onSetDepositHolder={async (isHolder) => {
            const nextId = isHolder ? editingMember.id : null
            const { error } = await supabase.rpc('set_deposit_holder', {
              p_hangout: hangout.id,
              p_member: nextId,
            })
            if (!error) reload()
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
  hangout,
  memberById,
  currency,
  settlements,
  settledKeys,
  onToggleSettlement,
  onToggleAll,
  onEdit,
  onEditReceiver,
  isOverrideCollector,
}: {
  row: MemberRecap
  member: Member | undefined
  hangout: Hangout
  memberById: Map<string, Member>
  currency: string
  settlements: Settlement[]
  settledKeys: Set<string>
  onToggleSettlement?: (key: string) => void
  onToggleAll?: () => void
  onEdit?: () => void
  onEditReceiver?: (m: Member) => void
  isOverrideCollector?: boolean
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
            <span className={cn('text-[11px] font-black uppercase tracking-wider', isOverrideCollector ? 'text-primary' : tone)}>
              {isOverrideCollector
                ? 'Group collector'
                : isAllSettled
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
              isAllSettled ? 'line-through text-muted' : isOverrideCollector ? 'text-primary' : tone,
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
            {isOverrideCollector ? (
              <div className="rounded-xl border border-primary/30 bg-primary-soft/50 p-3 text-xs text-ink space-y-1">
                <p className="font-black text-primary flex items-center gap-1.5">
                  <UserCheck size={14} /> Group Payment Collector
                </p>
                <p className="font-semibold text-muted">
                  You are designated to collect payments on behalf of the group. Members transfer directly to your account, and you will settle directly with the bill payer.
                </p>
              </div>
            ) : !owes && !receives ? (
              <p className="text-xs font-bold text-muted">All settled — nothing to transfer.</p>
            ) : owes ? (
              pays.map((s) => {
                const key = getSettlementKey(s)
                const isChecked = settledKeys.has(key)
                const receiver = memberById.get(s.toId)

                return (
                  <TransferPaymentCard
                    key={key}
                    settlement={s}
                    payerName={row.name}
                    receiver={receiver}
                    hangoutName={hangout.name}
                    currency={currency}
                    isChecked={isChecked}
                    onToggleSettlement={() => onToggleSettlement?.(key)}
                    onEditReceiverBank={
                      onEditReceiver && receiver ? () => onEditReceiver(receiver) : undefined
                    }
                    canEdit={Boolean(onEditReceiver)}
                  />
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

function TransferPaymentCard({
  settlement,
  payerName,
  receiver,
  hangoutName,
  currency,
  isChecked,
  onToggleSettlement,
  onEditReceiverBank,
  canEdit,
}: {
  settlement: Settlement
  payerName: string
  receiver?: Member
  hangoutName: string
  currency: string
  isChecked: boolean
  onToggleSettlement?: () => void
  onEditReceiverBank?: () => void
  canEdit?: boolean
}) {
  const [qrModalOpen, setQrModalOpen] = useState(false)
  const [copiedAcc, setCopiedAcc] = useState(false)
  const [copiedAmount, setCopiedAmount] = useState(false)
  const [copiedMemo, setCopiedMemo] = useState(false)

  const memo = formatTransferMemo(hangoutName, payerName)
  const hasBank = Boolean(receiver?.bank_code && receiver?.bank_account_no)

  const qrUrl = hasBank
    ? buildVietQRUrl({
        bankCode: receiver!.bank_code!,
        accountNo: receiver!.bank_account_no!,
        accountName: receiver!.bank_account_name,
        amount: currency === 'VND' ? Math.round(settlement.amount) : null,
        memo,
        template: 'compact2',
      })
    : null

  function copy(text: string, setCopied: (v: boolean) => void) {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1400)
      })
      .catch(() => {})
  }

  return (
    <div
      className={cn(
        'rounded-2xl border transition-all overflow-hidden',
        isChecked
          ? 'border-success/30 bg-success-soft/20 opacity-80'
          : 'border-line/70 bg-surface shadow-xs',
      )}
    >
      {/* Header bar: Checkbox + Receiver Name + Amount */}
      <div className="flex items-center justify-between gap-2.5 p-3 sm:p-3.5 border-b border-line/40">
        <button
          type="button"
          onClick={onToggleSettlement}
          className="flex items-center gap-2.5 min-w-0 text-left select-none group"
        >
          <div
            className={cn(
              'flex h-5 w-5 items-center justify-center rounded-lg border-2 transition-all shrink-0',
              isChecked
                ? 'border-success bg-success text-white shadow-glow-success'
                : 'border-line/90 bg-surface group-hover:border-primary',
            )}
          >
            {isChecked && <Check size={13} strokeWidth={3.5} />}
          </div>
          <div className="min-w-0">
            <span
              className={cn(
                'text-xs sm:text-sm font-black text-ink truncate block',
                isChecked && 'line-through text-muted',
              )}
            >
              Pay {settlement.toName}
            </span>
          </div>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          <span
            className={cn(
              'text-xs sm:text-sm font-black tabular-nums',
              isChecked ? 'text-success line-through' : 'text-danger',
            )}
          >
            {fmtMoney(settlement.amount, currency)}
          </span>
          <button
            type="button"
            onClick={() => copy(String(Math.round(settlement.amount)), setCopiedAmount)}
            className="p-1 text-muted hover:text-ink transition rounded active:scale-90"
            title="Copy amount"
          >
            {copiedAmount ? <Check size={13} className="text-success" /> : <Copy size={13} />}
          </button>
        </div>
      </div>

      {/* Payment Info Section */}
      {!isChecked && (
        <div className="p-3 sm:p-3.5 bg-surface-2/30">
          {hasBank && qrUrl ? (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {/* QR Preview Thumbnail */}
              <button
                type="button"
                onClick={() => setQrModalOpen(true)}
                className="group relative flex shrink-0 items-center justify-center rounded-xl border border-line/60 bg-white p-1 shadow-sm transition hover:shadow-md hover:scale-[1.02] cursor-pointer self-center sm:self-auto"
                title="Click to view large QR code"
              >
                <img
                  src={qrUrl}
                  alt={`VietQR ${receiver?.bank_code}`}
                  className="h-28 w-28 sm:h-32 sm:w-32 object-contain"
                />
                <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white rounded-xl opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-[1px] text-[11px] font-black gap-1">
                  <QrCode size={14} /> Scan
                </span>
              </button>

              {/* Bank Details & Copyable Fields */}
              <div className="min-w-0 flex-1 space-y-1.5 text-xs">
                {/* Bank badge */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-md bg-primary-soft text-primary font-black px-1.5 py-0.5 text-[10px] border border-primary/20">
                      {receiver?.bank_code}
                    </span>
                    <span className="font-extrabold text-ink truncate">
                      {receiver?.bank_name || receiver?.bank_code}
                    </span>
                  </div>
                  {canEdit && onEditReceiverBank && (
                    <button
                      type="button"
                      onClick={onEditReceiverBank}
                      className="text-[10px] font-bold text-muted hover:text-primary transition"
                    >
                      Edit bank
                    </button>
                  )}
                </div>

                {/* Account Number */}
                <div className="flex items-center justify-between gap-1 rounded-lg bg-surface border border-line/40 px-2.5 py-1.5">
                  <span className="font-mono font-black text-ink text-xs sm:text-sm">
                    {receiver?.bank_account_no}
                  </span>
                  <button
                    type="button"
                    onClick={() => copy(receiver!.bank_account_no!, setCopiedAcc)}
                    className="inline-flex items-center gap-1 text-[10px] font-black text-primary hover:underline"
                  >
                    {copiedAcc ? <Check size={11} className="text-success" /> : <Copy size={11} />}
                    <span>{copiedAcc ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>

                {/* Account Name */}
                {receiver?.bank_account_name && (
                  <p className="text-[11px] font-bold text-muted uppercase truncate px-0.5">
                    {receiver.bank_account_name}
                  </p>
                )}

                {/* Formatted Memo */}
                <div className="flex items-center justify-between gap-1 rounded-lg bg-surface border border-line/40 px-2.5 py-1">
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] text-muted block font-semibold">Transfer memo</span>
                    <span className="font-bold text-ink text-xs truncate block">{memo}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => copy(memo, setCopiedMemo)}
                    className="inline-flex items-center gap-1 text-[10px] font-black text-primary hover:underline shrink-0"
                  >
                    {copiedMemo ? <Check size={11} className="text-success" /> : <Copy size={11} />}
                    <span>{copiedMemo ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 py-1">
              <div className="text-xs">
                <p className="font-bold text-muted">No bank info for {settlement.toName}</p>
                <p className="text-[11px] text-muted/80">
                  Add bank details to generate VietQR and auto-fill transfer info.
                </p>
              </div>
              {canEdit && onEditReceiverBank && (
                <Button variant="soft" size="sm" onClick={onEditReceiverBank}>
                  <Plus size={13} /> Add bank
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal for large QR view */}
      {hasBank && qrUrl && (
        <VietQRModal
          open={qrModalOpen}
          onClose={() => setQrModalOpen(false)}
          qrUrl={qrUrl}
          bankName={receiver?.bank_name || receiver?.bank_code || ''}
          bankCode={receiver?.bank_code || ''}
          accountNo={receiver?.bank_account_no || ''}
          accountName={receiver?.bank_account_name}
          amount={settlement.amount}
          currency={currency}
          memo={memo}
          payerName={payerName}
          receiverName={settlement.toName}
        />
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
  const { accounts } = useSavedBankAccounts()
  const [deposit, setDeposit] = useState(() => (member.deposit ? formatCurrencyInput(member.deposit, currency) : ''))
  const [useOverride, setUseOverride] = useState(member.share_override !== null)
  const [override, setOverride] = useState(() =>
    member.share_override !== null ? formatCurrencyInput(member.share_override, currency) : '',
  )
  const [holder, setHolder] = useState(isDepositHolder)
  const [bankCode, setBankCode] = useState(member.bank_code ?? '')
  const [bankName, setBankName] = useState(member.bank_name ?? '')
  const [accountNo, setAccountNo] = useState(member.bank_account_no ?? '')
  const [accountName, setAccountName] = useState(member.bank_account_name ?? '')
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
        .update({
          deposit: dep,
          share_override: ovr,
          bank_code: bankCode.trim() || null,
          bank_name: bankName.trim() || null,
          bank_account_no: accountNo.trim() || null,
          bank_account_name: accountName.trim().toUpperCase() || null,
        })
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

        {/* Bank Account Details for VietQR */}
        <div className="rounded-2xl border border-line/60 bg-surface-2/60 p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-muted">
              Bank Account (for receiving money)
            </span>
          </div>

          {accounts.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-muted">Pick from saved accounts:</span>
              <div className="flex flex-wrap gap-1.5">
                {accounts.map((acc) => (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => {
                      setBankCode(acc.bank_code)
                      setBankName(acc.bank_name || acc.bank_code)
                      setAccountNo(acc.account_no)
                      setAccountName(acc.account_name)
                    }}
                    className="inline-flex items-center gap-1 rounded-full bg-primary-soft/90 hover:bg-primary hover:text-white px-2.5 py-1 text-xs font-bold text-primary transition active:scale-95 cursor-pointer shadow-xs"
                  >
                    <span>{acc.name}</span>
                    <span className="text-[10px] opacity-75">({acc.bank_code})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-bold text-muted mb-1 block">Bank</label>
              <select
                value={bankCode}
                onChange={(e) => {
                  const b = findBank(e.target.value)
                  setBankCode(e.target.value)
                  setBankName(b?.shortName ?? e.target.value)
                }}
                className="w-full rounded-xl border border-line/60 bg-surface px-2.5 py-2 text-xs font-bold text-ink outline-none focus:border-primary/50"
              >
                <option value="">-- No bank selected --</option>
                {VIETNAM_BANKS.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.shortName} ({b.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold text-muted mb-1 block">Account Number</label>
              <Input
                value={accountNo}
                onChange={(e) => setAccountNo(e.target.value.replace(/\s+/g, ''))}
                placeholder="Account number"
                className="!py-1.5 !text-xs"
              />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-bold text-muted mb-1 block">Account Name</label>
            <Input
              value={accountName}
              onChange={(e) => setAccountName(e.target.value.toUpperCase())}
              placeholder="Account holder name (e.g. NGUYEN VAN A)"
              className="!py-1.5 !text-xs"
            />
          </div>
        </div>

        <ErrorNote message={error} />
      </div>
    </Modal>
  )
}

function BillSection({
  hangout,
  canEdit,
  onReload,
}: {
  hangout: Hangout
  canEdit: boolean
  onReload: () => void
}) {
  const [uploading, setUploading] = useState(false)
  const [deletingPath, setDeletingPath] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [viewingIndex, setViewingIndex] = useState<number | null>(null)

  const billPaths = hangout.bill_paths ?? []

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    setUploading(true)
    setError(null)
    try {
      const newPaths: string[] = []
      for (const file of Array.from(files)) {
        // Compress image to WebP format before uploading
        const { blob } = await compressImageToWebP(file, file.name)
        const path = `${hangout.id}/${crypto.randomUUID()}.webp`
        const { error: upErr } = await supabase.storage.from('bills').upload(path, blob, {
          contentType: 'image/webp',
          upsert: true,
        })
        if (upErr) throw upErr
        newPaths.push(path)
      }

      const nextPaths = [...billPaths, ...newPaths]
      const { error: rpcErr } = await supabase.rpc('update_hangout_bills', {
        p_hangout: hangout.id,
        p_bill_paths: nextPaths,
      })
      if (rpcErr) {
        const { error: upErr } = await supabase
          .from('hangouts')
          .update({ bill_paths: nextPaths })
          .eq('id', hangout.id)
        if (upErr) throw upErr
      }

      onReload()
    } catch (err: any) {
      setError(err?.message ?? 'Failed to upload bill photo')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function handleDelete(pathToDelete: string) {
    if (!window.confirm('Delete this bill photo?')) return
    setDeletingPath(pathToDelete)
    setError(null)
    try {
      billThumbnailCache.delete(pathToDelete)
      await supabase.storage.from('bills').remove([pathToDelete])
      const nextPaths = billPaths.filter((p) => p !== pathToDelete)
      const { error: rpcErr } = await supabase.rpc('update_hangout_bills', {
        p_hangout: hangout.id,
        p_bill_paths: nextPaths,
      })
      if (rpcErr) {
        const { error: upErr } = await supabase
          .from('hangouts')
          .update({ bill_paths: nextPaths })
          .eq('id', hangout.id)
        if (upErr) throw upErr
      }
      onReload()
    } catch (err: any) {
      setError(err?.message ?? 'Failed to delete bill photo')
    } finally {
      setDeletingPath(null)
    }
  }

  return (
    <div className="rounded-2xl sm:rounded-3xl border border-line/60 bg-surface p-5 sm:p-6 shadow-card space-y-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary shadow-sm">
            <Receipt size={18} />
          </span>
          <div>
            <h3 className="text-sm sm:text-base font-black text-ink">Bill Receipts</h3>
            <p className="text-[11px] font-semibold text-muted">
              {billPaths.length === 0
                ? 'Attach receipt photos so everyone can verify the total on the payment page'
                : `${billPaths.length} receipt photo${billPaths.length > 1 ? 's' : ''} uploaded`}
            </p>
          </div>
        </div>

        {canEdit && billPaths.length > 0 && (
          <label className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary-soft/80 px-3.5 py-1.5 text-xs font-black text-primary hover:bg-primary hover:text-white transition cursor-pointer shadow-sm shrink-0">
            {uploading ? (
              <Spinner className="h-3.5 w-3.5" />
            ) : (
              <>
                <Plus size={14} strokeWidth={2.5} />
                <span>Add photo</span>
              </>
            )}
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={uploading}
              onChange={handleFiles}
              className="hidden"
            />
          </label>
        )}
      </div>

      <ErrorNote message={error} />

      {billPaths.length === 0 ? (
        canEdit ? (
          <label className="flex flex-col items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed border-line/80 bg-surface-2/40 p-6 text-center cursor-pointer hover:border-primary/60 hover:bg-surface-2/70 transition group">
            {uploading ? (
              <div className="flex flex-col items-center gap-2 py-2 text-muted">
                <Spinner className="h-7 w-7 text-primary" />
                <span className="text-xs font-bold">Uploading receipt photo...</span>
              </div>
            ) : (
              <>
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary group-hover:scale-110 transition shadow-sm">
                  <Upload size={22} />
                </span>
                <div>
                  <p className="text-sm font-black text-ink">Upload bill receipt</p>
                  <p className="text-xs font-semibold text-muted mt-0.5">
                    Click to select one or more photos (JPG, PNG, WebP)
                  </p>
                </div>
              </>
            )}
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={uploading}
              onChange={handleFiles}
              className="hidden"
            />
          </label>
        ) : (
          <p className="text-xs font-semibold text-muted text-center py-4 bg-surface-2/30 rounded-2xl">
            No bill receipts have been uploaded for this hangout yet.
          </p>
        )
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 pt-1">
          {billPaths.map((path, idx) => (
            <BillThumbnail
              key={path}
              path={path}
              index={idx}
              onView={() => setViewingIndex(idx)}
              onDelete={() => handleDelete(path)}
              canEdit={canEdit}
              deleting={deletingPath === path}
            />
          ))}

          {canEdit && (
            <label className="flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-line/80 bg-surface-2/30 aspect-[4/3] cursor-pointer hover:border-primary/60 hover:bg-surface-2/60 transition group">
              {uploading ? (
                <Spinner className="h-5 w-5 text-primary" />
              ) : (
                <>
                  <Plus size={20} className="text-muted group-hover:text-primary transition" />
                  <span className="text-[11px] font-black text-muted group-hover:text-ink transition">
                    Add photo
                  </span>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                multiple
                disabled={uploading}
                onChange={handleFiles}
                className="hidden"
              />
            </label>
          )}
        </div>
      )}

      {viewingIndex !== null && (
        <BillViewerModal
          open={viewingIndex !== null}
          onClose={() => setViewingIndex(null)}
          billPaths={billPaths}
          initialIndex={viewingIndex}
          title={`${hangout.name} · Receipt`}
        />
      )}
    </div>
  )
}

const billThumbnailCache = new Map<string, string>()

function BillThumbnail({
  path,
  index,
  onView,
  onDelete,
  canEdit,
  deleting,
}: {
  path: string
  index: number
  onView: () => void
  onDelete: () => void
  canEdit: boolean
  deleting: boolean
}) {
  const [url, setUrl] = useState<string | null>(() => billThumbnailCache.get(path) ?? null)

  useEffect(() => {
    let active = true
    if (!billThumbnailCache.has(path)) {
      void billUrl(path).then((u) => {
        if (active && u) {
          billThumbnailCache.set(path, u)
          setUrl(u)
        }
      })
    } else {
      const cached = billThumbnailCache.get(path)!
      if (cached !== url) setUrl(cached)
    }
    return () => {
      active = false
    }
  }, [path, url])

  return (
    <div
      onClick={onView}
      className="group relative aspect-[4/3] rounded-xl overflow-hidden border border-line/60 bg-surface-2 cursor-pointer shadow-sm hover:shadow-md transition-all hover:scale-[1.02]"
    >
      {url ? (
        <img src={url} alt={`Bill receipt ${index + 1}`} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Spinner className="h-5 w-5 text-primary" />
        </div>
      )}

      {/* Index badge */}
      <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/60 backdrop-blur-sm px-1.5 py-0.5 text-[10px] font-black text-white">
        #{index + 1}
      </span>

      {/* Hover preview indicator */}
      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <span className="flex items-center gap-1 rounded-full bg-black/70 px-2.5 py-1 text-xs font-black text-white backdrop-blur-sm shadow-sm">
          <Eye size={13} /> View
        </span>
      </div>

      {/* Delete button */}
      {canEdit && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          disabled={deleting}
          className="absolute top-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white/90 hover:bg-danger hover:text-white backdrop-blur-sm transition active:scale-90 shadow-md"
          title="Delete receipt"
          aria-label="Delete receipt"
        >
          {deleting ? <Spinner className="h-3.5 w-3.5" /> : <Trash2 size={13} />}
        </button>
      )}
    </div>
  )
}

// The full-bill recap now lives on the public /bill/:code page (BillRecap.tsx);
// the "Open payment page" button opens it directly.
