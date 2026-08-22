import { ArrowRight, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { OwlLogo } from '../components/OwlLogo'
import { Avatar, PageLoader, cn } from '../components/ui'
import { useApp } from '../context/AppContext'
import { spendCategory } from '../lib/categories'
import { currencyDecimals, dateRange, fmtMoney } from '../lib/format'
import { computeRecap, type MemberRecap, type Settlement } from '../lib/split'
import { supabase } from '../lib/supabase'
import { useAsync } from '../lib/useAsync'
import type { SpendCategory } from '../types'

interface BillMember {
  id: string
  display_name: string
  deposit: number
  share_override: number | null
  is_admin: boolean
}
interface BillSpend {
  id: string
  title: string
  category: SpendCategory
  amount: number
  spent_at: string
  spender_member_id: string
  shares: { member_id: string; weight: number }[]
}
interface BillData {
  id: string
  name: string
  currency: string
  starts_on: string | null
  ends_on: string | null
  status: string
  deposit_holder_id: string | null
  members: BillMember[]
  spends: BillSpend[]
}

/** Public, read-only bill breakdown for /bill/:code. No account required. */
export function BillRecapPage() {
  const { code } = useParams<{ code: string }>()
  const { ready } = useApp()

  const { data, loading } = useAsync(async () => {
    if (!code) return null
    const { data: result, error } = await supabase.rpc('get_bill_recap', { p_code: code })
    if (error) throw error
    return (result as BillData | null) ?? null
  }, [code, ready])

  if (!ready || loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg">
        <PageLoader />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-bg p-6 text-center">
        <OwlLogo size={56} />
        <h1 className="text-xl font-black text-ink">Bill not found</h1>
        <p className="max-w-xs text-sm font-semibold text-muted">
          This link doesn't match any hangout. Ask whoever shared it for a fresh one.
        </p>
      </div>
    )
  }

  const cur = data.currency
  const adminId = data.members.find((m) => m.is_admin)?.id
  const holderId = data.deposit_holder_id ?? adminId ?? ''
  const memberName = new Map(data.members.map((m) => [m.id, m.display_name]))

  const recap = computeRecap(
    data.members.map((m) => ({
      id: m.id,
      name: m.display_name,
      deposit: Number(m.deposit),
      override: m.share_override === null ? null : Number(m.share_override),
      isDepositHolder: m.id === holderId,
    })),
    data.spends.map((s) => ({
      id: s.id,
      amount: Number(s.amount),
      spenderMemberId: s.spender_member_id,
      shares: s.shares.map((sh) => ({ memberId: sh.member_id, weight: Number(sh.weight) })),
    })),
    currencyDecimals(cur),
  )

  // Who pays first, then who's owed, then settled — most actionable on top.
  const rank = (r: MemberRecap) => (r.balance > 0.005 ? 0 : r.balance < -0.005 ? 1 : 2)
  const rows = [...recap.rows].sort((a, b) => rank(a) - rank(b) || Math.abs(b.balance) - Math.abs(a.balance))

  return (
    <div className="min-h-dvh bg-bg">
      <div className="mx-auto w-full max-w-lg px-4 pb-16 pt-6 sm:pt-10">
        {/* Header */}
        <div className="mb-5 flex items-center gap-2.5">
          <OwlLogo size={34} />
          <span className="text-sm font-black tracking-tight text-ink">
            Hang<span className="text-primary">Owl</span>
          </span>
        </div>

        <div className="rounded-3xl bg-gradient-to-br from-primary to-primary-deep p-5 text-white shadow-pop">
          <p className="text-xs font-bold text-white/70">{dateRange(data.starts_on, data.ends_on)}</p>
          <h1 className="mt-0.5 text-2xl font-black tracking-tight">{data.name}</h1>
          <div className="mt-3 flex items-end justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-white/60">Total bill</p>
              <p className="text-3xl font-black tabular-nums">{fmtMoney(recap.total, cur)}</p>
            </div>
            <p className="text-xs font-bold text-white/70">
              {data.members.length} people · {data.spends.length} spends
            </p>
          </div>
        </div>

        {/* Who pays — most prominent, on top */}
        <h2 className="mb-2 mt-6 px-1 text-xs font-black uppercase tracking-wider text-muted">Who pays what</h2>
        <div className="space-y-2">
          {rows.map((row) => (
            <PersonRow
              key={row.memberId}
              row={row}
              currency={cur}
              settlements={recap.settlements}
              memberName={memberName}
            />
          ))}
        </div>

        {/* Spendings */}
        {data.spends.length > 0 && (
          <>
            <h2 className="mb-2 mt-7 px-1 text-xs font-black uppercase tracking-wider text-muted">Spendings</h2>
            <div className="space-y-1.5">
              {data.spends.map((s) => {
                const meta = spendCategory(s.category)
                const Icon = meta.icon
                return (
                  <div key={s.id} className="flex items-center gap-3 rounded-2xl border border-line/60 bg-surface p-3 shadow-card">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                      <Icon size={17} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-extrabold text-ink">{s.title}</p>
                      <p className="text-xs text-muted">{memberName.get(s.spender_member_id) ?? 'Someone'} paid</p>
                    </div>
                    <span className="shrink-0 text-sm font-black tabular-nums text-ink">
                      {fmtMoney(Number(s.amount), cur)}
                    </span>
                  </div>
                )
              })}
            </div>
          </>
        )}

        <p className="mt-8 text-center text-xs font-semibold text-muted">Shared with HangOwl 🦉</p>
      </div>
    </div>
  )
}

function PersonRow({
  row,
  currency,
  settlements,
  memberName,
}: {
  row: MemberRecap
  currency: string
  settlements: Settlement[]
  memberName: Map<string, string>
}) {
  const [open, setOpen] = useState(false)
  const owes = row.balance > 0.005
  const gets = row.balance < -0.005
  const tone = owes ? 'text-danger' : gets ? 'text-success' : 'text-muted'
  const pays = settlements.filter((s) => s.fromId === row.memberId)
  const getsFrom = settlements.filter((s) => s.toId === row.memberId)

  return (
    <div className="overflow-hidden rounded-2xl border border-line/60 bg-surface shadow-card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 p-3.5 text-left transition hover:bg-surface-2/60"
        aria-expanded={open}
      >
        <Avatar name={row.name} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-ink">{row.name}</p>
          <p className={cn('text-[11px] font-black uppercase tracking-wider', tone)}>
            {owes ? 'Pays' : gets ? 'Gets back' : 'All settled'}
          </p>
        </div>
        <span className={cn('shrink-0 text-lg font-black tabular-nums', tone)}>
          {owes || gets ? fmtMoney(Math.abs(row.balance), currency) : '—'}
        </span>
        <ChevronDown size={16} className={cn('shrink-0 text-muted transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="space-y-3 border-t border-line/50 bg-surface-2/30 px-3.5 py-3">
          {/* How the number is worked out */}
          <div className="flex flex-wrap gap-2 text-xs">
            <Chip label="Fair share" value={fmtMoney(row.share, currency)} accent={row.overridden} />
            <Chip label="Paid" value={fmtMoney(row.paid, currency)} />
            {row.deposit > 0 && <Chip label="Deposit" value={fmtMoney(row.deposit, currency)} />}
          </div>

          {/* Who to pay / who pays them */}
          {owes && pays.length > 0 && (
            <div className="space-y-1.5">
              {pays.map((s, i) => (
                <div key={i} className="flex items-center justify-between rounded-xl bg-surface px-3 py-2">
                  <span className="flex items-center gap-1.5 text-xs font-black text-ink">
                    <ArrowRight size={13} className="text-danger" />
                    Pay {memberName.get(s.toId) ?? s.toName}
                  </span>
                  <span className="text-xs font-black tabular-nums text-danger">{fmtMoney(s.amount, currency)}</span>
                </div>
              ))}
            </div>
          )}
          {gets && getsFrom.length > 0 && (
            <div className="space-y-1.5">
              {getsFrom.map((s, i) => (
                <div key={i} className="flex items-center justify-between rounded-xl bg-surface px-3 py-2">
                  <span className="flex items-center gap-2 text-xs font-black text-ink">
                    <Avatar name={s.fromName} size="sm" className="!h-5 !w-5 !text-[9px] !ring-0" />
                    {memberName.get(s.fromId) ?? s.fromName} pays you
                  </span>
                  <span className="text-xs font-black tabular-nums text-success">{fmtMoney(s.amount, currency)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Chip({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-line/50 bg-surface px-3 py-1.5">
      <span className="font-bold text-muted">{label}: </span>
      <span className={cn('font-black tabular-nums', accent ? 'text-accent' : 'text-ink')}>{value}</span>
    </div>
  )
}
