import { ArrowRight, ChevronDown, Crown, Info, Pencil, PiggyBank } from 'lucide-react'
import { useMemo, useState } from 'react'
import { currencyDecimals, fmtMoney } from '../../lib/format'
import { canEditRecap } from '../../lib/permissions'
import { computeRecap, type MemberRecap, type Settlement } from '../../lib/split'
import { supabase } from '../../lib/supabase'
import type { Member } from '../../types'
import type { HangoutData } from '../../pages/Hangout'
import { Avatar, Button, ErrorNote, Field, Input, Modal, Toggle, cn } from '../ui'

/**
 * Final tally: everyone's share (partial shares included), minus their
 * deposit and what they already fronted, plus suggested payback transfers.
 */
export function RecapTab({ data }: { data: HangoutData }) {
  const { hangout, me, members, spends } = data
  const [editingMember, setEditingMember] = useState<Member | null>(null)

  const recap = useMemo(
    () =>
      computeRecap(
        members.map((m) => ({
          id: m.id,
          name: m.display_name,
          deposit: Number(m.deposit),
          override: m.share_override === null ? null : Number(m.share_override),
          isDepositHolder: m.is_admin,
        })),
        spends.map((s) => ({
          id: s.id,
          amount: Number(s.amount),
          spenderMemberId: s.spender_member_id,
          shares: s.spend_shares.map((sh) => ({ memberId: sh.member_id, weight: Number(sh.weight) })),
        })),
        currencyDecimals(hangout.currency),
      ),
        [members, spends, hangout.currency],
  )

  const editable = canEditRecap(hangout, me)
  const memberById = new Map(members.map((m) => [m.id, m]))
  const cur = hangout.currency

  return (
    <div className="space-y-4">
      {/* Total summary card */}
      <div className="rounded-2xl sm:rounded-3xl border border-line/60 bg-surface p-5 sm:p-6 shadow-card">
        <p className="text-[11px] font-black uppercase tracking-wider text-muted">Hangout Total Spent</p>
        <p className="mt-0.5 text-3xl sm:text-4xl font-black tabular-nums text-ink">{fmtMoney(recap.total, cur)}</p>
        <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-muted">
          <Info size={14} className="shrink-0 text-primary" />
          Tap any person's card below to see their exact share breakdown and payback details.
        </p>
      </div>

      {/* Member settlement cards */}
      <div className="space-y-2.5">
        {recap.rows.map((row) => (
          <PersonCard
            key={row.memberId}
            row={row}
            member={memberById.get(row.memberId)}
            currency={cur}
            settlements={recap.settlements}
            onEdit={editable ? () => setEditingMember(memberById.get(row.memberId) ?? null) : undefined}
          />
        ))}
      </div>

      {editingMember && (
        <AdjustModal
          member={editingMember}
          currency={cur}
          onClose={() => setEditingMember(null)}
          onSaved={data.reload}
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
  onEdit,
}: {
  row: MemberRecap
  member: Member | undefined
  currency: string
  settlements: Settlement[]
  onEdit?: () => void
}) {
  const [open, setOpen] = useState(false)
  const owes = row.balance > 0.005
  const receives = row.balance < -0.005
  const tone = owes ? 'text-danger' : receives ? 'text-success' : 'text-muted'
  const pays = settlements.filter((s) => s.fromId === row.memberId)
  const getsFrom = settlements.filter((s) => s.toId === row.memberId)

  return (
    <div className="overflow-hidden rounded-2xl border border-line/60 bg-surface shadow-card transition-all">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 sm:gap-3.5 p-4 text-left transition hover:bg-surface-2/60 select-none"
        aria-expanded={open}
      >
        <Avatar name={row.name} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm sm:text-base font-black text-ink">{row.name}</span>
            {member?.is_admin && <Crown size={13} className="shrink-0 text-warning" />}
          </div>
          <span className={cn('text-[11px] font-black uppercase tracking-wider', tone)}>
            {owes ? 'Owes' : receives ? 'Gets back' : 'Settled'}
          </span>
        </div>
        <span className={cn('shrink-0 text-base sm:text-lg font-black tabular-nums', tone)}>
          {owes || receives ? fmtMoney(Math.abs(row.balance), currency) : '—'}
        </span>
        <ChevronDown
          size={16}
          className={cn('shrink-0 text-muted transition-transform duration-200', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="space-y-3.5 border-t border-line/50 bg-surface-2/30 px-4 py-3.5">
          {/* Money breakdown */}
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

          {/* Who to settle with */}
          <div className="space-y-2">
            {!owes && !receives ? (
              <p className="text-xs font-bold text-muted">All settled — nothing to transfer.</p>
            ) : owes ? (
              pays.map((s, i) => (
                <div key={i} className="flex items-center justify-between rounded-xl border border-danger/20 bg-danger-soft/40 px-3.5 py-2.5">
                  <span className="flex items-center gap-2 text-xs font-black text-ink">
                    <ArrowRight size={14} className="text-danger" />
                    Pay {s.toName}
                  </span>
                  <span className="text-xs font-black tabular-nums text-danger">
                    {fmtMoney(s.amount, currency)}
                  </span>
                </div>
              ))
            ) : (
              getsFrom.map((s, i) => (
                <div key={i} className="flex items-center justify-between rounded-xl border border-success/20 bg-success-soft/40 px-3.5 py-2.5">
                  <span className="flex items-center gap-2 text-xs font-black text-ink">
                    <Avatar name={s.fromName} size="sm" className="!h-5 !w-5 !text-[9px] !ring-0" />
                    {s.fromName} pays you
                  </span>
                  <span className="text-xs font-black tabular-nums text-success">
                    {fmtMoney(s.amount, currency)}
                  </span>
                </div>
              ))
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
  onClose,
  onSaved,
}: {
  member: Member
  currency: string
  onClose: () => void
  onSaved: () => void
}) {
  const isHolder = member.is_admin
  const [deposit, setDeposit] = useState(String(member.deposit ?? 0))
  const [useOverride, setUseOverride] = useState(member.share_override !== null)
  const [override, setOverride] = useState(member.share_override === null ? '' : String(member.share_override))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    const dep = isHolder ? 0 : Number(deposit)
    const ovr = useOverride ? Number(override) : null
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
        {isHolder ? (
          <div className="flex items-start gap-2.5 rounded-2xl border border-primary/30 bg-primary-soft/60 p-3.5">
            <PiggyBank size={18} className="mt-0.5 shrink-0 text-primary" />
            <p className="text-xs font-bold text-ink">
              You're the organizer, so you <span className="font-black">hold</span> the group's
              deposits — you can't deposit to yourself. Open each{' '}
              <span className="font-black">guest</span> instead and enter what they handed you
              upfront.
            </p>
          </div>
        ) : (
          <Field
            label={`Deposit (${currency})`}
            hint="Money this person already handed to the organizer upfront."
          >
            <div className="flex items-center gap-2">
              <PiggyBank size={20} className="shrink-0 text-primary" />
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={deposit}
                onChange={(e) => setDeposit(e.target.value)}
              />
            </div>
          </Field>
        )}

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
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                placeholder={`Share in ${currency}`}
                value={override}
                onChange={(e) => setOverride(e.target.value)}
              />
            </div>
          )}
        </div>

        <ErrorNote message={error} />
      </div>
    </Modal>
  )
}
