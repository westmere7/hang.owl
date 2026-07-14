import { ArrowRight, ChevronDown, Crown, HandCoins, Info, Pencil, PiggyBank } from 'lucide-react'
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
  const [showDetails, setShowDetails] = useState(false)

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
      </div>

      {/* Settle up is the default view; per-person detail expands from here. */}
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
              <li key={i} className="flex items-center gap-3 rounded-2xl bg-surface-2 px-4 py-3">
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

        <button
          onClick={() => setShowDetails((v) => !v)}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-2xl py-2 text-xs font-extrabold uppercase tracking-wide text-muted transition hover:bg-surface-2 hover:text-ink"
          aria-expanded={showDetails}
        >
          <ChevronDown size={15} className={cn('transition-transform', showDetails && 'rotate-180')} />
          {showDetails ? 'Hide breakdown' : 'Per-person breakdown'}
        </button>

        {showDetails && (
          <div className="mt-2 space-y-2 border-t border-line pt-3">
            {editable && (
              <p className="flex items-center gap-1.5 px-1 pb-1 text-xs text-muted">
                <Info size={13} className="shrink-0" />
                Tap a person to set a deposit or override their share.
              </p>
            )}
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
        'flex w-full items-center gap-3 rounded-2xl bg-surface-2 p-3 text-left transition',
        onEdit && 'hover:bg-primary-soft/40',
      )}
    >
      <Avatar name={row.name} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-extrabold text-ink">{row.name}</span>
          {member?.is_admin && <Crown size={12} className="shrink-0 text-accent-deep" />}
        </div>
        {/* Breakdown — only the non-zero parts, so most rows stay to one short line. */}
        <p className="mt-0.5 text-xs text-muted">
          <span className={cn(row.overridden && 'font-bold text-accent-deep')}>
            Share {fmtMoney(row.share, currency)}
            {row.overridden && ' (adjusted)'}
          </span>
          {row.paid > 0 && <> · Paid {fmtMoney(row.paid, currency)}</>}
          {row.deposit > 0 && <> · Deposit {fmtMoney(row.deposit, currency)}</>}
        </p>
      </div>

      <div className="shrink-0 text-right">
        {owes || receives ? (
          <>
            <span
              className={cn(
                'block text-[10px] font-extrabold uppercase tracking-wide',
                owes ? 'text-danger' : 'text-success',
              )}
            >
              {owes ? 'Owes' : 'Gets back'}
            </span>
            <span
              className={cn(
                'block text-base font-black tabular-nums',
                owes ? 'text-danger' : 'text-success',
              )}
            >
              {fmtMoney(owes ? row.balance : -row.balance, currency)}
            </span>
          </>
        ) : (
          <span className="text-xs font-extrabold uppercase tracking-wide text-muted">Settled</span>
        )}
      </div>

      {onEdit && <Pencil size={14} className="shrink-0 self-center text-muted" />}
    </button>
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
