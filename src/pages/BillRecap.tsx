import { ArrowDownLeft, ArrowRight, ArrowUpRight, Check, ChevronDown, Copy, Download, QrCode, Receipt, SearchX, Share2, UserCheck, Users } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { BillViewerModal } from '../components/hangout/BillViewerModal'
import { VietQRModal } from '../components/VietQRModal'
import { Avatar, PageLoader, cn } from '../components/ui'
import { OwlLogo } from '../components/OwlLogo'
import { useApp } from '../context/AppContext'
import { spendCategory } from '../lib/categories'
import { currencyDecimals, dateRange, fmtDate, fmtMoney, fmtTime } from '../lib/format'
import { computeRecap, type MemberRecap, type Settlement } from '../lib/split'
import { supabase } from '../lib/supabase'
import { useAsync } from '../lib/useAsync'
import { buildVietQRUrl, formatTransferMemo } from '../lib/vietqr'
import type { SpendCategory } from '../types'

interface BillMember {
  id: string
  display_name: string
  deposit: number
  share_override: number | null
  is_admin: boolean
  bank_code?: string | null
  bank_name?: string | null
  bank_account_no?: string | null
  bank_account_name?: string | null
}
interface BillSpend {
  id: string
  title: string
  category: SpendCategory
  amount: number
  spent_at: string
  spender_member_id: string
  bill_path?: string | null
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
  payment_receiver_id?: string | null
  bill_paths?: string[] | null
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
  const [viewingBill, setViewingBill] = useState(false)
  const [billInitialIndex, setBillInitialIndex] = useState(0)
  const [spendsOpen, setSpendsOpen] = useState(true)
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null)

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

  const billPaths: string[] = []
  if (data.bill_paths) {
    for (const p of data.bill_paths) {
      if (p && !billPaths.includes(p)) billPaths.push(p)
    }
  }
  for (const s of data.spends) {
    if (s.bill_path && !billPaths.includes(s.bill_path)) billPaths.push(s.bill_path)
  }

  const overrideReceiver = data.members.find((m) => m.id === data.payment_receiver_id)

  const activeSettlements: Settlement[] = !overrideReceiver
    ? recap.settlements
    : recap.rows
        .filter((r) => r.balance > 0.005 && r.memberId !== overrideReceiver.id)
        .map((p) => ({
          fromId: p.memberId,
          fromName: p.name,
          toId: overrideReceiver.id,
          toName: overrideReceiver.display_name,
          amount: p.balance,
        }))

  // Who pays first, then who's owed, then settled — most actionable on top.
  const rank = (r: MemberRecap) => (r.balance > 0.005 ? 0 : r.balance < -0.005 ? 1 : 2)
  const rows = [...recap.rows].sort((a, b) => rank(a) - rank(b) || Math.abs(b.balance) - Math.abs(a.balance))

  return (
    <div className="min-h-dvh bg-bg">
      <div className="mx-auto w-full max-w-lg px-4 pb-14 pt-6 sm:pt-8">
        {/* Atmospheric ambient glow (open, floating on canvas) */}
        <div className="relative mb-7">
          <div className="pointer-events-none absolute -top-16 -right-6 h-52 w-52 rounded-full bg-primary/20 blur-3xl animate-glow-pulse" />
          <div className="pointer-events-none absolute -top-10 -left-6 h-40 w-40 rounded-full bg-accent/15 blur-2xl animate-glow-pulse [animation-delay:2.5s]" />

          {/* Open, un-boxy header */}
          <div className="relative pt-1">
            {/* Top row: Live status / Date on left, Action pills on right */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
                </span>
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-muted">
                  {dateRange(data.starts_on, data.ends_on) || 'Bill Ready'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {billPaths.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setBillInitialIndex(0)
                      setViewingBill(true)
                    }}
                    className="group inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary-soft/80 px-3 py-1.5 text-xs font-black text-primary transition-all duration-200 hover:bg-primary hover:text-white hover:shadow-glow active:scale-95 shadow-xs"
                    title="View actual bills"
                    aria-label="View actual bills"
                  >
                    <Receipt size={13} className="transition-transform group-hover:scale-110" />
                    <span>View actual bills</span>
                    {billPaths.length > 1 && (
                      <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary text-[10px] font-black text-on-primary px-1">
                        {billPaths.length}
                      </span>
                    )}
                  </button>
                )}
                <ShareLinkButton />
              </div>
            </div>

            {/* Hangout Title with Emblem */}
            <div className="mt-4 flex items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary shadow-xs">
                <OwlLogo size={18} />
              </span>
              <h1 className="truncate text-base sm:text-lg font-black tracking-tight text-ink">
                {data.name}
              </h1>
            </div>

            {/* Total display with luxury gradient luster */}
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
              <span className="text-4xl sm:text-5xl font-black tabular-nums tracking-tight bg-gradient-to-r from-ink via-ink to-primary/90 bg-clip-text text-transparent">
                {fmtMoney(recap.total, cur)}
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-muted/70">
                total
              </span>
            </div>

            {/* Clean inline summary line */}
            <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-muted">
              <span>{data.members.length} people</span>
              <span>·</span>
              <span>{data.spends.length} spends</span>
              {overrideReceiver && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1 text-primary font-bold">
                    <UserCheck size={12} />
                    Collector: {overrideReceiver.display_name}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Who pays what — single unified grouped ledger */}
        <div className="mb-3 mt-7 flex items-center justify-between px-1">
          <h2 className="text-xl font-black tracking-tight text-ink">Who pays what</h2>
          <span className="text-xs font-semibold text-muted">Tap to expand</span>
        </div>

        <div className="overflow-hidden rounded-3xl border border-line/50 bg-surface/80 backdrop-blur-sm divide-y divide-line/35 shadow-card">
          {rows.map((row) => (
            <PersonRow
              key={row.memberId}
              row={row}
              currency={cur}
              decimals={decimals}
              settlements={activeSettlements}
              memberName={memberName}
              members={data.members}
              hangoutName={data.name}
              detail={detailFor(row.memberId)}
              isOverrideCollector={overrideReceiver?.id === row.memberId}
              isOpen={expandedMemberId === row.memberId}
              onToggle={() =>
                setExpandedMemberId((cur) => (cur === row.memberId ? null : row.memberId))
              }
            />
          ))}
        </div>

        {/* Spendings (collapsible continuous receipt ledger) */}
        {data.spends.length > 0 && (
          <div className="mt-8">
            <button
              type="button"
              onClick={() => setSpendsOpen((v) => !v)}
              className="mb-3 flex w-full items-center justify-between px-1 text-left select-none group cursor-pointer"
              aria-expanded={spendsOpen}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-muted group-hover:text-ink transition">
                  Spendings
                </span>
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-black text-muted border border-line/50">
                  {data.spends.length}
                </span>
              </div>
              <div className="flex items-center gap-1 text-xs font-bold text-muted group-hover:text-ink transition">
                <span>{spendsOpen ? 'Hide' : 'Show all'}</span>
                <ChevronDown
                  size={15}
                  className={cn('transition-transform duration-200', spendsOpen && 'rotate-180')}
                />
              </div>
            </button>

            {spendsOpen && (
              <div className="overflow-hidden rounded-2xl border border-line/40 bg-surface/75 backdrop-blur-sm divide-y divide-line/25 shadow-xs">
                {data.spends.map((s) => {
                  const meta = spendCategory(s.category)
                  const Icon = meta.icon
                  const joined = s.shares.filter((sh) => Number(sh.weight) > 0).length
                  const spender = memberName.get(s.spender_member_id) ?? 'Someone'
                  return (
                    <div
                      key={s.id}
                      className="flex items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-surface-2/35"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-2/80 text-muted">
                        <Icon size={13} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-xs sm:text-sm font-bold text-ink">{s.title}</p>
                          <span className="shrink-0 text-xs sm:text-sm font-black tabular-nums text-ink">
                            {fmtMoney(Number(s.amount), cur)}
                          </span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] sm:text-[11px] font-medium text-muted">
                          <span className="font-semibold text-ink/75">{spender} paid</span>
                          <span>·</span>
                          <span className="inline-flex items-center gap-0.5">
                            <Users size={10} className="shrink-0 opacity-70" />
                            <span>{joined} sharing</span>
                          </span>
                          <span>·</span>
                          <span>
                            {fmtDate(s.spent_at)} · {fmtTime(s.spent_at)}
                          </span>
                          {s.bill_path && (
                            <>
                              <span>·</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  const idx = billPaths.indexOf(s.bill_path!)
                                  setBillInitialIndex(idx >= 0 ? idx : 0)
                                  setViewingBill(true)
                                }}
                                className="inline-flex items-center gap-1 rounded bg-primary-soft px-1.5 py-0.2 text-[10px] font-black text-primary hover:bg-primary hover:text-white transition cursor-pointer"
                                title="View receipt photo"
                              >
                                <Receipt size={9} />
                                <span>Receipt</span>
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {viewingBill && billPaths.length > 0 && (
        <BillViewerModal
          open={viewingBill}
          onClose={() => setViewingBill(false)}
          billPaths={billPaths}
          initialIndex={billInitialIndex}
          title={`${data.name} · Receipt`}
        />
      )}
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

/** Copies this page's link — for resharing the bill. */
function ShareLinkButton() {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard
          .writeText(window.location.href)
          .then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1400)
          })
          .catch(() => {})
      }}
      title="Copy link"
      aria-label="Copy link"
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line/70 bg-surface-2/80 transition-all duration-200 hover:border-primary/40 hover:text-ink active:scale-90 shadow-xs',
        copied ? 'text-success border-success/40 bg-success-soft/50' : 'text-muted',
      )}
    >
      {copied ? <Check size={14} strokeWidth={3} /> : <Share2 size={14} />}
    </button>
  )
}

async function downloadQrImage(url: string, filename = 'vietqr.png') {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = filename.toLowerCase().replace(/\s+/g, '-')
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(blobUrl)
  } catch {
    window.open(url, '_blank')
  }
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
  members,
  hangoutName,
  detail,
  isOverrideCollector,
  isOpen,
  onToggle,
}: {
  row: MemberRecap
  currency: string
  decimals: number
  settlements: Settlement[]
  memberName: Map<string, string>
  members: BillMember[]
  hangoutName: string
  detail: RowDetail
  isOverrideCollector?: boolean
  isOpen: boolean
  onToggle: () => void
}) {
  const [viewingQr, setViewingQr] = useState<{
    qrUrl: string
    bankName: string
    bankCode: string
    accountNo: string
    accountName?: string | null
    amount: number | null
    currency: string
    memo: string
    receiverName: string
  } | null>(null)

  const owes = row.balance > 0.005
  const gets = row.balance < -0.005
  const tone = isOverrideCollector
    ? 'text-primary'
    : owes
      ? 'text-danger'
      : gets
        ? 'text-success'
        : 'text-muted'
  const pays = settlements.filter((s) => s.fromId === row.memberId)
  const getsFrom = settlements.filter((s) => s.toId === row.memberId)
  const plainAmount = Math.abs(row.balance).toFixed(decimals)

  const nameOf = (id: string, fallback: string) => memberName.get(id) ?? fallback
  const label = isOverrideCollector
    ? 'Group collector'
    : owes
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

  // Build target QR data for header QR button
  const firstTransfer = pays[0]
  // Only people who have to pay get a QR (pre-filled with their amount and
  // name); receivers and settled members have nobody to pay, so no button.
  const targetReceiver = firstTransfer ? members.find((m) => m.id === firstTransfer.toId) : null
  const targetAmount = firstTransfer ? firstTransfer.amount : null
  const targetMemo = formatTransferMemo(hangoutName, row.name)
  const targetReceiverName = firstTransfer ? nameOf(firstTransfer.toId, firstTransfer.toName) : row.name

  const hasBank = Boolean(targetReceiver?.bank_code && targetReceiver?.bank_account_no)
  const qrUrl = hasBank
    ? buildVietQRUrl({
        bankCode: targetReceiver!.bank_code!,
        accountNo: targetReceiver!.bank_account_no!,
        accountName: targetReceiver!.bank_account_name,
        amount: currency === 'VND' && targetAmount !== null ? Math.round(targetAmount) : null,
        memo: targetMemo,
        template: 'compact2',
      })
    : null

  const qrData = hasBank && qrUrl
    ? {
        qrUrl,
        bankName: targetReceiver?.bank_name || targetReceiver?.bank_code || '',
        bankCode: targetReceiver?.bank_code || '',
        accountNo: targetReceiver?.bank_account_no || '',
        accountName: targetReceiver?.bank_account_name,
        amount: targetAmount,
        currency,
        memo: targetMemo,
        receiverName: targetReceiverName,
      }
    : null

  return (
    <div
      className={cn(
        'relative transition-all duration-200',
        isOpen ? 'bg-surface-2/45 dark:bg-surface-2/35' : 'hover:bg-surface-2/20',
      )}
    >
      {/* Accent left indicator line when expanded */}
      {isOpen && (
        <span
          className="absolute inset-y-0 left-0 w-1 bg-primary rounded-r z-10"
          aria-hidden="true"
        />
      )}

      {/* Row Header: clean, interactive, and highlighted when active */}
      <div
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onToggle()
          }
        }}
        aria-expanded={isOpen}
        className={cn(
          'flex items-center gap-3 p-3.5 sm:p-4 cursor-pointer select-none transition-colors',
          isOpen && 'bg-surface-2/20',
        )}
      >
        <span
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all duration-200',
            isOpen && 'scale-105 shadow-sm ring-2 ring-primary/20',
            isOverrideCollector
              ? 'bg-primary-soft text-primary'
              : owes
                ? 'bg-danger-soft text-danger'
                : gets
                  ? 'bg-success-soft text-success'
                  : 'bg-surface-2 text-muted',
          )}
        >
          {isOverrideCollector ? (
            <UserCheck size={20} strokeWidth={2.75} />
          ) : owes ? (
            <ArrowUpRight size={20} strokeWidth={2.75} />
          ) : gets ? (
            <ArrowDownLeft size={20} strokeWidth={2.75} />
          ) : (
            <Check size={18} strokeWidth={2.75} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'truncate text-base font-black transition-colors',
              isOpen ? 'text-primary' : 'text-ink',
            )}
          >
            {row.name}
          </p>
          <p className={cn('text-xs font-black uppercase tracking-wider', tone)}>{label}</p>
        </div>

        <span className={cn('shrink-0 text-xl font-black tabular-nums', tone)}>
          {owes || gets ? fmtMoney(Math.abs(row.balance), currency) : '—'}
        </span>

        {/* QR Button (or Copy button if no QR) */}
        {qrData ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setViewingQr(qrData)
            }}
            aria-label="View QR code"
            title="Scan VietQR"
            className="shrink-0 rounded-xl border border-line/60 bg-surface-2/80 p-2 text-primary hover:bg-primary hover:text-white transition active:scale-90 shadow-xs"
          >
            <QrCode size={16} />
          </button>
        ) : (
          owes && (
            <div onClick={(e) => e.stopPropagation()}>
              <CopyBtn value={plainAmount} />
            </div>
          )
        )}

        <div
          className={cn(
            'shrink-0 rounded-lg p-1 transition-colors duration-200',
            isOpen ? 'text-primary' : 'text-muted',
          )}
        >
          <ChevronDown
            size={18}
            className={cn('transition-transform duration-200', isOpen && 'rotate-180')}
          />
        </div>
      </div>

      {isOpen && (
        <div className="space-y-3 border-t border-line/30 bg-surface-2/20 px-4 py-3.5">
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

          {/* The balance equation (borderless soft fill) */}
          <div className="rounded-2xl bg-surface/70 p-3 space-y-1">
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

          {isOverrideCollector && (
            <div className="rounded-2xl bg-primary-soft/60 p-3 text-xs text-ink space-y-1">
              <p className="font-black text-primary flex items-center gap-1.5">
                <UserCheck size={14} /> Group Payment Collector
              </p>
              <p className="font-semibold text-muted">
                Designated to collect all payments on behalf of the group and settle directly with the bill payer.
              </p>
            </div>
          )}

          {/* Who to pay — with payment info and VietQR */}
          {/* With a single payee the header already says who and how much, so
              the "Pay X" line is only shown to tell several payees apart. */}
          {!isOverrideCollector && owes && (pays.length > 1 || (pays.length === 1 && hasBank)) && (
            <div className="space-y-2">
              <p className="text-[11px] font-black uppercase tracking-wider text-muted">
                {pays.length === 1 ? 'Payment details' : 'Who to pay'}
              </p>
              {pays.map((s, i) => {
                const receiver = members.find((m) => m.id === s.toId)
                const memo = formatTransferMemo(hangoutName, row.name)
                const hasBank = Boolean(receiver?.bank_code && receiver?.bank_account_no)
                const qrUrl = hasBank
                  ? buildVietQRUrl({
                      bankCode: receiver!.bank_code!,
                      accountNo: receiver!.bank_account_no!,
                      accountName: receiver!.bank_account_name,
                      amount: currency === 'VND' ? Math.round(s.amount) : null,
                      memo,
                      template: 'compact2',
                    })
                  : null

                return (
                  <div key={i} className="rounded-2xl bg-surface/85 p-3.5 space-y-2.5">
                    {pays.length > 1 && (
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-xs font-black text-ink">
                          <ArrowRight size={13} className="shrink-0 text-danger" />
                          <span>Pay {nameOf(s.toId, s.toName)}</span>
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-black tabular-nums text-danger">
                            {fmtMoney(s.amount, currency)}
                          </span>
                          <CopyBtn value={s.amount.toFixed(decimals)} />
                        </div>
                      </div>
                    )}

                    {hasBank && qrUrl && (
                      <div
                        className={cn(
                          'flex items-center gap-3',
                          pays.length > 1 && 'pt-2 border-t border-line/30',
                        )}
                      >
                        <div className="flex flex-col items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              setViewingQr({
                                qrUrl,
                                bankName: receiver?.bank_name || receiver?.bank_code || '',
                                bankCode: receiver?.bank_code || '',
                                accountNo: receiver?.bank_account_no || '',
                                accountName: receiver?.bank_account_name,
                                amount: s.amount,
                                currency,
                                memo,
                                receiverName: nameOf(s.toId, s.toName),
                              })
                            }
                            className="group relative rounded-2xl border border-line/50 bg-white p-1.5 shadow-xs hover:shadow-md transition cursor-pointer"
                            title="Tap to zoom VietQR"
                          >
                            <img src={qrUrl} alt="VietQR" className="h-20 w-20 object-contain" />
                            <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-[1px] text-[10px] font-black gap-1">
                              <QrCode size={12} /> Zoom
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              void downloadQrImage(qrUrl, `vietqr-${nameOf(s.toId, s.toName)}.png`)
                            }}
                            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-muted hover:text-primary hover:bg-surface-2 transition active:scale-95 cursor-pointer"
                            title="Download QR image"
                            aria-label="Download QR image"
                          >
                            <Download size={11} />
                            <span>Save QR</span>
                          </button>
                        </div>
                        <div className="min-w-0 flex-1 text-xs space-y-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="rounded bg-primary-soft text-primary font-black px-1.5 py-0.5 text-[10px] border border-primary/20">
                              {receiver?.bank_code}
                            </span>
                            <span className="font-extrabold text-ink truncate">
                              {receiver?.bank_name || receiver?.bank_code}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-1 rounded-xl bg-surface-2/50 px-2.5 py-1 font-mono font-bold text-ink text-xs">
                            <span className="truncate">{receiver?.bank_account_no}</span>
                            <CopyBtn value={receiver!.bank_account_no!} />
                          </div>
                          {receiver?.bank_account_name && (
                            <p className="text-[10px] uppercase font-bold text-muted truncate px-0.5">
                              {receiver.bank_account_name}
                            </p>
                          )}
                          <div className="flex items-center justify-between gap-1 rounded-xl bg-surface-2/50 px-2.5 py-1 text-[11px] text-muted">
                            <span className="truncate">Memo: {memo}</span>
                            <CopyBtn value={memo} />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          {gets && getsFrom.length > 1 && (
            <div className="space-y-1.5">
              {getsFrom.map((s, i) => (
                <div key={i} className="flex items-center justify-between rounded-2xl bg-surface/80 px-3 py-2">
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

      {viewingQr && (
        <VietQRModal
          open={Boolean(viewingQr)}
          onClose={() => setViewingQr(null)}
          qrUrl={viewingQr.qrUrl}
          bankName={viewingQr.bankName}
          bankCode={viewingQr.bankCode}
          accountNo={viewingQr.accountNo}
          accountName={viewingQr.accountName}
          amount={viewingQr.amount}
          currency={viewingQr.currency}
          memo={viewingQr.memo}
          receiverName={viewingQr.receiverName}
        />
      )}
    </div>
  )
}
