import { Check, ExternalLink, MapPin, Pencil, Trash2 } from 'lucide-react'
import { bookmarkCategory } from '../lib/categories'
import { domainOf, mapsUrl } from '../lib/format'
import type { BookmarkCategory } from '../types'
import { cn } from './ui'

export interface BookmarkLike {
  id: string
  url: string | null
  title: string
  description: string | null
  image_url: string | null
  category: BookmarkCategory
  location: string | null
  notes: string | null
  done?: boolean
}

interface Props {
  bookmark: BookmarkLike
  onEdit?: () => void
  onDelete?: () => void
  onToggleDone?: () => void
}

export function BookmarkCard({ bookmark, onEdit, onDelete, onToggleDone }: Props) {
  const cat = bookmarkCategory(bookmark.category)
  const Icon = cat.icon
  const domain = domainOf(bookmark.url)

  return (
    <div
      className={cn(
        'group flex gap-3.5 rounded-2xl border border-line/60 bg-surface p-3.5 shadow-card transition-all hover:border-primary/40',
        bookmark.done && 'opacity-65 bg-surface/50',
      )}
    >
      {bookmark.image_url ? (
        <img
          src={bookmark.image_url}
          alt=""
          loading="lazy"
          className="h-20 w-20 shrink-0 rounded-2xl object-cover border border-line/40 shadow-sm"
        />
      ) : (
        <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary shadow-sm border border-primary/20">
          <Icon size={26} />
        </span>
      )}

      <div className="min-w-0 flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-start justify-between gap-2">
            <p className={cn('truncate text-sm sm:text-base font-black text-ink', bookmark.done && 'line-through opacity-70')}>
              {bookmark.title}
            </p>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary-soft border border-primary/20 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-primary">
              <Icon size={10} />
              {cat.label}
            </span>
          </div>

          {(domain || bookmark.location) && (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
              {domain && (
                <a
                  href={bookmark.url ?? '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-bold text-accent hover:underline"
                >
                  <ExternalLink size={11} />
                  {domain}
                </a>
              )}
              {bookmark.location && (
                <a
                  href={mapsUrl(bookmark.location)}
                  target="_blank"
                  rel="noreferrer"
                  title={`Open in Maps: ${bookmark.location}`}
                  className="inline-flex max-w-[12rem] items-center gap-1 text-xs font-bold text-primary hover:underline"
                >
                  <MapPin size={11} className="shrink-0" />
                  <span className="truncate">{bookmark.location}</span>
                </a>
              )}
            </div>
          )}
          {(bookmark.notes || bookmark.description) && (
            <p className="mt-1 line-clamp-2 text-xs font-medium text-muted">{bookmark.notes || bookmark.description}</p>
          )}
        </div>

        <div className="mt-2.5 flex items-center gap-1.5 pt-1">
          {onToggleDone && (
            <button
              onClick={onToggleDone}
              className={cn(
                'inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-[11px] font-black transition-all select-none',
                bookmark.done
                  ? 'bg-success-soft text-success border border-success/30'
                  : 'bg-surface-2 text-muted hover:text-ink border border-line/50',
              )}
            >
              <Check size={12} />
              {bookmark.done ? 'Done' : 'Mark done'}
            </button>
          )}
          <span className="flex-1" />
          {onEdit && (
            <button
              onClick={onEdit}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-surface-2/60 text-muted transition hover:bg-surface-2 hover:text-ink"
              aria-label="Edit"
            >
              <Pencil size={14} />
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-surface-2/60 text-muted transition hover:bg-danger-soft hover:text-danger"
              aria-label="Delete"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
