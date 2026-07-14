import {
  BedDouble,
  CarFront,
  CupSoda,
  MapPin,
  Shapes,
  Ticket,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react'
import type { BookmarkCategory, SpendCategory } from '../types'

export const BOOKMARK_CATEGORIES: { value: BookmarkCategory; label: string; icon: LucideIcon }[] = [
  { value: 'visit', label: 'To visit', icon: MapPin },
  { value: 'eat', label: 'To eat', icon: UtensilsCrossed },
  { value: 'drink', label: 'To drink', icon: CupSoda },
  { value: 'do', label: 'To do', icon: Ticket },
]

export const SPEND_CATEGORIES: { value: SpendCategory; label: string; icon: LucideIcon }[] = [
  { value: 'accommodation', label: 'Stay', icon: BedDouble },
  { value: 'eat_drink', label: 'Eat & drink', icon: UtensilsCrossed },
  { value: 'transport', label: 'Transport', icon: CarFront },
  { value: 'activity', label: 'Activity', icon: Ticket },
  { value: 'misc', label: 'Misc', icon: Shapes },
]

export function bookmarkCategory(value: BookmarkCategory) {
  return BOOKMARK_CATEGORIES.find((c) => c.value === value) ?? BOOKMARK_CATEGORIES[0]
}

export function spendCategory(value: SpendCategory) {
  return SPEND_CATEGORIES.find((c) => c.value === value) ?? SPEND_CATEGORIES[SPEND_CATEGORIES.length - 1]
}

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'VND', 'JPY', 'KRW', 'THB', 'SGD', 'AUD', 'CAD']
