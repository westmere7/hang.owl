import type { Hangout, Member, Spend } from '../types'

/** The admin can always act; guests are gated by the hangout's flags. */

export function canAddSpend(h: Hangout, me: Member | null): boolean {
  return !!me && (me.is_admin || h.guest_can_add_spend)
}

export function canEditSpend(h: Hangout, me: Member | null, spend: Spend): boolean {
  if (!me) return false
  if (me.is_admin) return true
  // Guests can always fix their own entries; editing others' needs the flag.
  if (spend.created_by === me.profile_id) return true
  return h.guest_can_edit_spend
}

export function canAddBookmark(h: Hangout, me: Member | null): boolean {
  return !!me && (me.is_admin || h.guest_can_add_bookmark)
}

export function canEditRecap(h: Hangout, me: Member | null): boolean {
  return !!me && (me.is_admin || h.guest_can_edit_recap)
}
