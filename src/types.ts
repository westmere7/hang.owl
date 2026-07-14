export type BookmarkCategory = 'visit' | 'eat' | 'drink' | 'do'

export type SpendCategory =
  | 'accommodation'
  | 'eat_drink'
  | 'transport'
  | 'activity'
  | 'misc'

export interface Profile {
  id: string
  display_name: string
  created_at: string
}

/** Global bookmark — shared by the whole team, not tied to a hangout. */
export interface Bookmark {
  id: string
  url: string | null
  title: string
  description: string | null
  image_url: string | null
  category: BookmarkCategory
  location: string | null
  notes: string | null
  created_by: string | null
  created_at: string
}

export interface Hangout {
  id: string
  name: string
  code: string
  starts_on: string | null
  ends_on: string | null
  expected_guests: number
  currency: string
  status: 'active' | 'ended'
  admin_id: string
  guest_can_add_spend: boolean
  guest_can_edit_spend: boolean
  guest_can_add_bookmark: boolean
  guest_can_edit_recap: boolean
  created_at: string
}

export interface Member {
  id: string
  hangout_id: string
  /** null for a placeholder guest who hasn't scanned the QR to claim their seat. */
  profile_id: string | null
  display_name: string
  deposit: number
  share_override: number | null
  is_admin: boolean
  joined_at: string
}

/** Bookmark inside a hangout (To visit / To eat / To drink / To do). */
export interface HangoutBookmark {
  id: string
  hangout_id: string
  category: BookmarkCategory
  url: string | null
  title: string
  description: string | null
  image_url: string | null
  location: string | null
  notes: string | null
  done: boolean
  created_by: string | null
  created_at: string
}

export interface SpendShare {
  spend_id: string
  member_id: string
  weight: number
}

export interface Spend {
  id: string
  hangout_id: string
  spender_member_id: string
  title: string
  category: SpendCategory
  amount: number
  spent_at: string
  note: string | null
  bill_path: string | null
  created_by: string | null
  created_at: string
  spend_shares: SpendShare[]
}
