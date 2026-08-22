import { ArrowRight, Check, ChevronDown, Copy, SearchX, Users } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Avatar, PageLoader, cn } from '../components/ui'
import { useApp } from '../context/AppContext'
import { spendCategory } from '../lib/categories'
import { currencyDecimals, dateRange, fmtDate, fmtMoney, fmtTime } from '../lib/format'
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

interface RowDetail {
  /** This person's portion of each spend they joined (sums to their share). */
  breakdown: { title: string; amount: number }[]
  isHolder: boolean
  ownDeposit: number
  heldDeposits: number
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
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-muted">
          <SearchX size={26} />
        </span>
        <h1 className="text-xl font-black text-ink">Bill not found</h1>
        <p className="max-w-xs text-sm font-semibold text-muted">
          This link doesn't match any hangout. Ask whoever shared it for a fresh one.
        </p>
      </div>
    )
  }

  const cur = data.currency
  const decimals = currencyDecimals(cur)
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
    decimals,
  )

  // Per-person share of each spend they joined — the "why is my share this much".
  const breakdown = new Map<string, { title: string; amount: number }[]>()
  for (const m of data.members) breakdown.set(m.id, [])
  for (const s of data.spends) {
    const valid = s.shares.filter((sh) => Number(sh.weight) > 0)
    const totalW = valid.reduce((sum, sh) => sum + Number(sh.weight), 0)
    if (totalW <= 0) continue
    for (const sh of valid) {
      const portion = (Number(s.amount) * Number(sh.weight)) / totalW
      breakdown.get(sh.member_id)?.push({ title: s.title, amount: portion })
    }
  }
  const heldDeposits = data.members
    .filter((m) => m.id !== holderId)
    .reduce((sum, m) => sum + Number(m.deposit), 0)
  const detailFor = (id: string): RowDetail => ({
    breakdown: breakdown.get(id) ?? [],
    isHolder: id === holderId,
    ownDeposit: Number(data.members.find((m) => m.id === id)?.deposit ?? 0),
    heldDeposits,
  })

  // Who pays first, then who's owed, then settled — most actionable on top.
  const rank = (r: MemberRecap) => (r.balance > 0.005 ? 0 : r.balance < -0.005 ? 1 : 2)
  const rows = [...recap.rows].sort((a, b) => rank(a) - rank(b) || Math.abs(b.balance) - Math.abs(a.balance))

  return (
    <div className="min-h-dvh bg-bg">
      <div className="mx-auto w-full max-w-lg px-4 pb-14 pt-6 sm:pt-8">
        {/* Hangout hero */}
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

        {/* Who pays what — the headline section */}
        <div className="mb-3 mt-8 px-0.5">
          <h2 className="text-xl font-black tracking-tight text-ink">Who pays what</h2>
          <p className="text-xs font-semibold text-muted">Tap a name to see how it adds up.</p>
        </div>
        <div className="space-y-2.5">
          {rows.map((row) => (
            <PersonRow
              key={row.memberId}
              row={row}
              currency={cur}
              decimals={decimals}
              settlements={recap.settlements}
              memberName={memberName}
              detail={detailFor(row.memberId)}
            />
          ))}
        </div>

        {/* Spendings */}
        {data.spends.length > 0 && (
          <>
            <h2 className="mb-2 mt-8 px-0.5 text-xs font-black uppercase tracking-wider text-muted">
              Spendings ({data.spends.length})
            </h2>
            <div className="space-y-1.5">
              {data.spends.map((s) => {
                const meta = spendCategory(s.category)
                const Icon = meta.icon
                const joined = s.shares.filter((sh) => Number(sh.weight) > 0).length
                return (
                  <div key={s.id} className="flex items-center gap-3 rounded-2xl border border-line/60 bg-surface p-3 shadow-card">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                      <Icon size={17} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-extrabold text-ink">{s.title}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-semibold text-muted">
                        <span>{memberName.get(s.spender_member_id) ?? 'Someone'} paid</span>
                        <span className="inline-flex items-center gap-1">
                          <Users size={11} />
                          {joined} sharing
                        </span>
                        <span>
                          {fmtDate(s.spent_at)} · {fmtTime(s.spent_at)}
                        </span>
                      </p>
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
      </div>
    </div>
  )
}

function CopyBtn({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        navigator.clipboard
          .writeText(value)
          .then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1200)
          })
          .catch(() => {})
      }}
      aria-label="Copy amount"
      title="Copy amount"
      className={cn(
        'shrink-0 rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-ink active:scale-90',
        copied && 'text-success',
        className,
      )}
    >
      {copied ? <Check size={14} strokeWidth={3} /> : <Copy size={14} />}
    </button>
  )
}

function CalcLine({
  label,
  amount,
  currency,
  sign = '',
  result,
  tone,
}: {
  label: string
  amount: number
  currency: string
  sign?: '' | '−' | '+'
  result?: boolean
  tone?: string
}) {
  return (
    <div className={cn('flex items-center justify-between', result && 'mt-1 border-t border-line/50 pt-1.5')}>
      <span className={cn('text-xs', result ? 'font-black text-ink' : 'font-semibold text-muted')}>{label}</span>
      <span className={cn('text-xs font-black tabular-nums', result ? tone : 'text-ink')}>
        {sign}
        {fmtMoney(amount, currency)}
      </span>
    </div>
  )
}

function PersonRow({
  row,
  currency,
  decimals,
  settlements,
  memberName,
  detail,
}: {
  row: MemberRecap
  currency: string
  decimals: number
  settlements: Settlement[]
  memberName: Map<string, string>
  detail: RowDetail
}) {
  const [open, setOpen] = useState(false)
  const owes = row.balance > 0.005
  const gets = row.balance < -0.005
  const tone = owes ? 'text-danger' : gets ? 'text-success' : 'text-muted'
  const pays = settlements.filter((s) => s.fromId === row.memberId)
  const getsFrom = settlements.filter((s) => s.toId === row.memberId)
  const plainAmount = Math.abs(row.balance).toFixed(decimals)

  const nameOf = (id: string, fallback: string) => memberName.get(id) ?? fallback
  const label = owes
    ? pays.length === 1
      ? `Pays ${nameOf(pays[0].toId, pays[0].toName)}`
      : pays.length > 1
        ? `Pays ${nameOf(pays[0].toId, pays[0].toName)} +${pays.length - 1}`
        : 'Pays'
    : gets
      ? getsFrom.length === 1
        ? `Gets from ${nameOf(getsFrom[0].fromId, getsFrom[0].fromName)}`
        : 'Gets back'
      : 'All settled'

  return (
    <div className="overflow-hidden rounded-2xl border border-line/60 bg-surface shadow-card">
      {/* Header: left toggles, amount + copy + chevron on the right */}
      <div className="flex items-center gap-2.5 p-3.5 sm:p-4">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-3.5 text-left"
          aria-expanded={open}
        >
          <Avatar name={row.name} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-black text-ink">{row.name}</p>
            <p className={cn('text-xs font-black uppercase tracking-wider', tone)}>{label}</p>
          </div>
        </button>
        <span className={cn('shrink-0 text-xl font-black tabular-nums', tone)}>
          {owes || gets ? fmtMoney(Math.abs(row.balance), currency) : '—'}
        </span>
        {(owes || gets) && <CopyBtn value={plainAmount} />}
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Collapse' : 'Expand'}
          className="shrink-0 rounded-lg p-1 text-muted transition hover:text-ink"
        >
          <ChevronDown size={18} className={cn('transition-transform', open && 'rotate-180')} />
        </button>
      </div>

      {open && (
        <div className="space-y-3.5 border-t border-line/40 bg-surface-2/30 px-4 py-3.5">
          {/* Share breakdown — how the fair share is built from each spend */}
          {detail.breakdown.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-black uppercase tracking-wider text-muted">Share of each spend</p>
              <div className="space-y-1">
                {detail.breakdown.map((b, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="truncate pr-3 text-muted">{b.title}</span>
                    <span className="shrink-0 font-bold tabular-nums text-ink">{fmtMoney(b.amount, currency)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* The balance equation */}
          <div className="rounded-xl border border-line/50 bg-surface px-3 py-2.5">
            <CalcLine label="Fair share" amount={row.share} currency={currency} />
            {row.paid > 0 && <CalcLine label="You paid" amount={row.paid} currency={currency} sign="−" />}
            {!detail.isHolder && detail.ownDeposit > 0 && (
              <CalcLine label="Your deposit" amount={detail.ownDeposit} currency={currency} sign="−" />
            )}
            {detail.isHolder && detail.heldDeposits > 0 && (
              <CalcLine label="Deposits you hold" amount={detail.heldDeposits} currency={currency} sign="+" />
            )}
            <CalcLine
              label={owes ? 'You pay' : gets ? 'You get back' : 'Settled'}
              amount={Math.abs(row.balance)}
              currency={currency}
              result
              tone={tone}
            />
          </div>

          {/* Who to pay (each is a real transfer amount — copyable) */}
          {owes && pays.length > 0 && (
            <div className="space-y-1.5">
              {pays.map((s, i) => (
                <div key={i} className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2">
                  <span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-black text-ink">
                    <ArrowRight size={13} className="shrink-0 text-danger" />
                    <span className="truncate">Pay {nameOf(s.toId, s.toName)}</span>
                  </span>
                  <span className="shrink-0 text-xs font-black tabular-nums text-danger">
                    {fmtMoney(s.amount, currency)}
                  </span>
                  <CopyBtn value={s.amount.toFixed(decimals)} />
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
                    {nameOf(s.fromId, s.fromName)} pays you
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
