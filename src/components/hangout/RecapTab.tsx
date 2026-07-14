import { ArrowRight, Crown, HandCoins, Info, Pencil, PiggyBank } from 'lucide-react'
import { useMemo, useState } from 'react'
import { fmtMoney } from '../../lib/format'
import { canEditRecap } from '../../lib/permissions'
import { computeRecap, type MemberRecap } from '../../lib/split'
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
      ),
    [members, spends],
  )

  const editable = canEditRecap(hangout, me)
  const memberById = new Map(members.map((m) => [m.id, m]))
  const cur = hangout.currency

  return (
    <div className="space-y-4">
      <div className="rounded-xl3 bg-surface p-5 shadow-card">
        <p className="text-xs font-extrabold uppercase tracking-wide text-muted">Hangout total</p>
        <p className="mt-0.5 text-3xl font-black tabular-nums text-ink">{fmtMoney(recap.total, cur)}</p>
        <p className="mt-2 flex items-start gap-1.5 text-xs text-muted">
          <Info size={13} className="mt-0.5 shrink-0" />
          Deposits are treated as money handed to the organizer. Tap a person to adjust their deposit
          or override their share.
        </p>
      </div>

      <div className="space-y-2">
        {recap.rows.map((row) => (
          <MemberRow
            key={row.memberId}
            row={row}
            member={memberById.get(row.memberId)}
            currency={cur}
            onEdit={editable ? () => setEditingMember(memberById.get(row.memberId) ?? null) : undefined}
          />
        ))}
      </div>

      {/* Settle up */}
      <div className="rounded-xl3 bg-surface p-5 shadow-card">
        <h3 className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-muted">
          <HandCoins size={15} className="text-accent-deep" />
          Settle up
        </h3>
        {recap.settlements.length === 0 ? (
          <p className="mt-3 text-sm font-semibold text-muted">
            {recap.total === 0 ? 'Nothing to settle yet — add some spendings first.' : 'All squared away! 🎉'}
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {recap.settlements.map((s, i) => (
              <li
                key={i}
                className="flex items-center gap-3 rounded-2xl bg-surface-2 px-4 py-3"
              >
                <Avatar name={s.fromName} size="sm" />
                <span className="text-sm font-bold text-ink">{s.fromName}</span>
                <ArrowRight size={15} className="text-muted" />
                <Avatar name={s.toName} size="sm" />
                <span className="text-sm font-bold text-ink">{s.toName}</span>
                <span className="ml-auto text-sm font-black tabular-nums text-accent-deep">
                  {fmtMoney(s.amount, cur)}
                </span>
              </li>
            ))}
          </ul>
        )}
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

function MemberRow({
  row,
  member,
  currency,
  onEdit,
}: {
  row: MemberRecap
  member: Member | undefined
  currency: string
  onEdit?: () => void
}) {
  const owes = row.balance > 0.005
  const receives = row.balance < -0.005
  return (
    <button
      onClick={onEdit}
      disabled={!onEdit}
      className={cn(
        'w-full rounded-xl3 bg-surface p-4 text-left shadow-card transition',
        onEdit && 'hover:-translate-y-0.5 hover:shadow-pop',
      )}
    >
      <div className="flex items-center gap-3">
        <Avatar name={row.name} />
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="truncate text-sm font-extrabold text-ink">{row.name}</span>
          {member?.is_admin && <Crown size={13} className="shrink-0 text-accent-deep" />}
        </span>
        <span
          className={cn(
            'rounded-full px-3 py-1 text-sm font-black tabular-nums',
            owes && 'bg-danger-soft text-danger',
            receives && 'bg-success-soft text-success',
            !owes && !receives && 'bg-surface-2 text-muted',
          )}
        >
          {owes
            ? `owes ${fmtMoney(row.balance, currency)}`
            : receives
              ? `gets ${fmtMoney(-row.balance, currency)}`
              : 'settled'}
        </span>
        {onEdit && <Pencil size={14} className="shrink-0 text-muted" />}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Stat label="Share" value={fmtMoney(row.share, currency)} highlight={row.overridden} />
        <Stat label="Paid" value={fmtMoney(row.paid, currency)} />
        <Stat label="Deposit" value={fmtMoney(row.deposit, currency)} />
      </div>
      {row.overridden && (
        <p className="mt-2 text-center text-[11px] font-bold text-accent-deep">
          Share manually overridden (auto would be {fmtMoney(row.rawShare, currency)})
        </p>
      )}
    </button>
  )
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn('rounded-2xl px-2 py-2', highlight ? 'bg-accent-soft' : 'bg-surface-2')}>
      <p className="text-[10px] font-extrabold uppercase tracking-wide text-muted">{label}</p>
      <p className={cn('mt-0.5 text-sm font-black tabular-nums', highlight ? 'text-accent-deep' : 'text-ink')}>
        {value}
      </p>
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
  // The organizer holds everyone's deposits, so a deposit "to themselves" is
  // meaningless (see computeRecap). Don't offer them the field.
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
        <Button variant="accent" full onClick={() => void save()} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      }
    >
      <div className="space-y-4 pb-2">
        {isHolder ? (
          <div className="flex items-start gap-2.5 rounded-xl3 bg-primary-soft/60 p-3.5">
            <PiggyBank size={18} className="mt-0.5 shrink-0 text-primary" />
            <p className="text-xs font-semibold text-ink">
              You're the organizer, so you <span className="font-extrabold">hold</span> the group's
              deposits — you can't deposit to yourself. Open each{' '}
              <span className="font-extrabold">guest</span> instead and enter what they handed you
              before the hangout; that reduces what they owe and what you're owed back.
            </p>
          </div>
        ) : (
          <Field
            label={`Deposit (${currency})`}
            hint="Money this person already handed to the organizer before/during the hangout."
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

        <div className="rounded-xl3 bg-surface-2 p-3">
          <Toggle
            checked={useOverride}
            onChange={setUseOverride}
            label="Override their share"
            description="Fix this person's total share (e.g. they offered to cover more). The difference is spread across everyone else."
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
