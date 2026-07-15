/**
 * Bill-splitting math for the Recap tab.
 *
 * Model:
 *  - Every spend has a participant list with a weight per member.
 *    Weight 1 = full share, 0.5 = half share (e.g. skipped the alcohol),
 *    not on the list = pays nothing for that spend.
 *  - Deposits are amounts a guest handed to the ORGANIZER before/during
 *    the hangout, so they reduce what the guest owes and increase what
 *    the organizer is owed back.
 *  - A share override replaces a member's computed share entirely (e.g.
 *    someone generously covers more). The difference is redistributed
 *    across the non-overridden members proportionally to their computed
 *    shares, so the total always balances.
 */

export interface SplitMember {
  id: string
  name: string
  deposit: number
  override: number | null
  isDepositHolder: boolean
}

export interface SplitSpend {
  id: string
  amount: number
  spenderMemberId: string
  shares: { memberId: string; weight: number }[]
}

export interface MemberRecap {
  memberId: string
  name: string
  /** Sum of spends this member fronted. */
  paid: number
  deposit: number
  /** Share before overrides. */
  rawShare: number
  /** Final share after overrides + redistribution. */
  share: number
  overridden: boolean
  /** Positive = still owes money; negative = should get money back. */
  balance: number
}

export interface Settlement {
  fromId: string
  fromName: string
  toId: string
  toName: string
  amount: number
}

export interface RecapResult {
  rows: MemberRecap[]
  total: number
  settlements: Settlement[]
}

const roundTo = (n: number, decimals: number) => {
  const f = 10 ** decimals
  return Math.round(n * f) / f
}

export function computeRecap(
  members: SplitMember[],
  spends: SplitSpend[],
  /** Currency minor-unit digits: 2 for USD, 0 for VND/JPY. */
  decimals = 2,
): RecapResult {
  const rnd = (n: number) => roundTo(n, decimals)
  const byId = new Map(members.map((m) => [m.id, m]))
  const rawShare = new Map<string, number>(members.map((m) => [m.id, 0]))
  const paid = new Map<string, number>(members.map((m) => [m.id, 0]))
  let total = 0

  for (const spend of spends) {
    total += spend.amount
    if (byId.has(spend.spenderMemberId)) {
      paid.set(spend.spenderMemberId, (paid.get(spend.spenderMemberId) ?? 0) + spend.amount)
    }
    const valid = spend.shares.filter((s) => byId.has(s.memberId) && s.weight > 0)
    const totalWeight = valid.reduce((sum, s) => sum + s.weight, 0)
    if (totalWeight <= 0) continue
    for (const s of valid) {
      rawShare.set(s.memberId, (rawShare.get(s.memberId) ?? 0) + (spend.amount * s.weight) / totalWeight)
    }
  }

  // Apply overrides: shift the difference onto non-overridden members,
  // proportionally to their raw shares (equally when raw shares are all 0).
  const overridden = members.filter((m) => m.override !== null)
  const free = members.filter((m) => m.override === null)
  const finalShare = new Map<string, number>()
  let diff = 0 // amount removed from (negative: added to) the pool by overrides
  for (const m of overridden) {
    finalShare.set(m.id, m.override as number)
    diff += (rawShare.get(m.id) ?? 0) - (m.override as number)
  }
  const freeRawTotal = free.reduce((sum, m) => sum + (rawShare.get(m.id) ?? 0), 0)
  for (const m of free) {
    const raw = rawShare.get(m.id) ?? 0
    const extra = free.length === 0 ? 0 : freeRawTotal > 0 ? diff * (raw / freeRawTotal) : diff / free.length
    finalShare.set(m.id, raw + extra)
  }

  // Deposits: guests handed them to the deposit holder (organizer), so the
  // holder's balance absorbs everyone else's deposits.
  const holder = members.find((m) => m.isDepositHolder)
  const depositsToHolder = members
    .filter((m) => m.id !== holder?.id)
    .reduce((sum, m) => sum + m.deposit, 0)

  const rows: MemberRecap[] = members.map((m) => {
    const share = finalShare.get(m.id) ?? 0
    const memberPaid = paid.get(m.id) ?? 0
    const deposit = m.id === holder?.id ? 0 : m.deposit
    let balance = share - memberPaid - deposit
    if (m.id === holder?.id) balance += depositsToHolder
    return {
      memberId: m.id,
      name: m.name,
      paid: rnd(memberPaid),
      deposit: rnd(deposit),
      rawShare: rnd(rawShare.get(m.id) ?? 0),
      share: rnd(share),
      overridden: m.override !== null,
      balance: rnd(balance),
    }
  })

  // Rounding each balance can leave the set summing to a few minor units off
  // zero, which would strand a cent in settlement. Push that residue onto the
  // largest balance (where a cent is noise) so debts and credits reconcile.
  const residual = rnd(rows.reduce((sum, r) => sum + r.balance, 0))
  if (residual !== 0 && rows.length > 0) {
    let idx = 0
    for (let i = 1; i < rows.length; i++) {
      if (Math.abs(rows[i].balance) > Math.abs(rows[idx].balance)) idx = i
    }
    rows[idx].balance = rnd(rows[idx].balance - residual)
  }

  return { rows, total: rnd(total), settlements: settle(rows, decimals) }
}

/** Greedy settlement: largest debtor pays largest creditor until settled. */
function settle(rows: MemberRecap[], decimals: number): Settlement[] {
  const eps = 0.5 / 10 ** decimals // half a minor unit
  const debtors = rows
    .filter((r) => r.balance > eps)
    .map((r) => ({ ...r, left: r.balance }))
    .sort((a, b) => b.left - a.left)
  const creditors = rows
    .filter((r) => r.balance < -eps)
    .map((r) => ({ ...r, left: -r.balance }))
    .sort((a, b) => b.left - a.left)

  const out: Settlement[] = []
  let d = 0
  let c = 0
  while (d < debtors.length && c < creditors.length) {
    const amount = Math.min(debtors[d].left, creditors[c].left)
    if (amount > eps) {
      out.push({
        fromId: debtors[d].memberId,
        fromName: debtors[d].name,
        toId: creditors[c].memberId,
        toName: creditors[c].name,
        amount: roundTo(amount, decimals),
      })
    }
    debtors[d].left -= amount
    creditors[c].left -= amount
    if (debtors[d].left <= eps) d++
    if (creditors[c].left <= eps) c++
  }
  return out
}
