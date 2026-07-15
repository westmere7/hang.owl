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
      <div className="rounded-xl3 bg-surface p-5 shadow-card">
        <p className="text-xs font-extrabold uppercase tracking-wide text-muted">Hangout total</p>
        <p className="mt-0.5 text-3xl font-black tabular-nums text-ink">{fmtMoney(recap.total, cur)}</p>
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
          <Info size={13} className="shrink-0" />
          Tap a person to see their breakdown and who to settle with.
        </p>
      </div>

      {/* Every person gets a card — including those who come out even. Tap to
          expand their breakdown + who they pay / get paid by. */}
      <div className="space-y-2">
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

/** One expandable card per person. Collapsed: net owes/gets/even. Expanded:
 *  money breakdown + who they settle with + (admin) an adjust button. */
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
    <div className="overflow-hidden rounded-xl3 bg-surface shadow-card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 p-3.5 text-left transition hover:bg-surface-2"
        aria-expanded={open}
      >
        <Avatar name={row.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-extrabold text-ink">{row.name}</span>
            {member?.is_admin && <Crown size={12} className="shrink-0 text-accent-deep" />}
          </div>
          <span className={cn('text-[11px] font-extrabold uppercase tracking-wide', tone)}>
            {owes ? 'Owes' : receives ? 'Gets back' : 'Even'}
          </span>
        </div>
        <span className={cn('shrink-0 text-base font-black tabular-nums', tone)}>
          {owes || receives ? fmtMoney(Math.abs(row.balance), currency) : '—'}
        </span>
        <ChevronDown
          size={16}
          className={cn('shrink-0 text-muted transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="space-y-3 border-t border-line px-3.5 py-3">
          {/* Money breakdown */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span>
              <span className="text-muted">Share </span>
              <span className={cn('font-bold tabular-nums', row.overridden ? 'text-accent-deep' : 'text-ink')}>
                {fmtMoney(row.share, currency)}
              </span>
              {row.overridden && <span className="text-accent-deep"> (adjusted)</span>}
            </span>
            <span>
              <span className="text-muted">Paid </span>
              <span className="font-bold tabular-nums text-ink">{fmtMoney(row.paid, currency)}</span>
            </span>
            {row.deposit > 0 && (
              <span>
                <span className="text-muted">Deposit </span>
                <span className="font-bold tabular-nums text-ink">{fmtMoney(row.deposit, currency)}</span>
              </span>
            )}
          </div>

          {/* Who to settle with */}
          <div className="space-y-1.5">
            {!owes && !receives ? (
              <p className="text-xs font-semibold text-muted">All settled — nothing to pay.</p>
            ) : owes ? (
              pays.map((s, i) => (
                <div key={i} className="flex items-center justify-between rounded-2xl bg-surface-2 px-3 py-2">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-ink">
                    <ArrowRight size={13} className="text-danger" />
                    Pay {s.toName}
                  </span>
                  <span className="text-xs font-black tabular-nums text-danger">
                    {fmtMoney(s.amount, currency)}
                  </span>
                </div>
              ))
            ) : (
              getsFrom.map((s, i) => (
                <div key={i} className="flex items-center justify-between rounded-2xl bg-surface-2 px-3 py-2">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-ink">
                    <Avatar name={s.fromName} size="sm" className="!h-4.5 !w-4.5 !text-[8px] !ring-0" />
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
