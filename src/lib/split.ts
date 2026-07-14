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

const round2 = (n: number) => Math.round(n * 100) / 100

export function computeRecap(members: SplitMember[], spends: SplitSpend[]): RecapResult {
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
      paid: round2(memberPaid),
      deposit: round2(deposit),
      rawShare: round2(rawShare.get(m.id) ?? 0),
      share: round2(share),
      overridden: m.override !== null,
      balance: round2(balance),
    }
  })

  return { rows, total: round2(total), settlements: settle(rows) }
}

/** Greedy settlement: largest debtor pays largest creditor until settled. */
function settle(rows: MemberRecap[]): Settlement[] {
  const debtors = rows
    .filter((r) => r.balance > 0.005)
    .map((r) => ({ ...r, left: r.balance }))
    .sort((a, b) => b.left - a.left)
  const creditors = rows
    .filter((r) => r.balance < -0.005)
    .map((r) => ({ ...r, left: -r.balance }))
    .sort((a, b) => b.left - a.left)

  const out: Settlement[] = []
  let d = 0
  let c = 0
  while (d < debtors.length && c < creditors.length) {
    const amount = Math.min(debtors[d].left, creditors[c].left)
    if (amount > 0.005) {
      out.push({
        fromId: debtors[d].memberId,
        fromName: debtors[d].name,
        toId: creditors[c].memberId,
        toName: creditors[c].name,
        amount: round2(amount),
      })
    }
    debtors[d].left -= amount
    creditors[c].left -= amount
    if (debtors[d].left <= 0.005) d++
    if (creditors[c].left <= 0.005) c++
  }
  return out
}
