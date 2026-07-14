import { Bookmark as BookmarkIcon, FolderInput, Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { BOOKMARK_CATEGORIES } from '../../lib/categories'
import { canAddBookmark } from '../../lib/permissions'
import { supabase } from '../../lib/supabase'
import type { Bookmark, BookmarkCategory, HangoutBookmark } from '../../types'
import type { HangoutData } from '../../pages/Hangout'
import { BookmarkCard } from '../BookmarkCard'
import { BookmarkForm, type BookmarkValues } from '../BookmarkForm'
import { Button, Chip, EmptyState, Modal, PageLoader, Spinner } from '../ui'

/** In-hangout wishlist: To visit / To eat / To drink / To do. */
export function BookmarksTab({ data }: { data: HangoutData }) {
  const { userId } = useApp()
  const { hangout, me, bookmarks, reload } = data
  const [filter, setFilter] = useState<BookmarkCategory | 'all'>('all')
  const [adding, setAdding] = useState(false)
  const [importing, setImporting] = useState(false)
  const [editing, setEditing] = useState<HangoutBookmark | null>(null)

  const allowed = canAddBookmark(hangout, me)
  const visible = useMemo(
    () => bookmarks.filter((b) => filter === 'all' || b.category === filter),
    [bookmarks, filter],
  )

  async function create(values: BookmarkValues) {
    const { error } = await supabase
      .from('hangout_bookmarks')
      .insert({ ...values, hangout_id: hangout.id, created_by: userId })
    if (error) throw error
    reload()
  }

  async function update(id: string, values: Partial<BookmarkValues> & { done?: boolean }) {
    const { error } = await supabase.from('hangout_bookmarks').update(values).eq('id', id)
    if (error) throw error
    reload()
  }

  async function remove(b: HangoutBookmark) {
    if (!window.confirm(`Remove "${b.title}" from this hangout?`)) return
    const { error } = await supabase.from('hangout_bookmarks').delete().eq('id', b.id)
    if (error) {
      window.alert(error.message)
      return
    }
    reload()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-1 gap-2 overflow-x-auto pb-1">
          <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
            All
          </Chip>
          {BOOKMARK_CATEGORIES.map(({ value, label, icon: Icon }) => (
            <Chip key={value} active={filter === value} onClick={() => setFilter(value)}>
              <Icon size={14} />
              {label}
            </Chip>
          ))}
        </div>
        {allowed && (
          <div className="flex gap-2">
            <Button variant="soft" size="sm" onClick={() => setImporting(true)}>
              <FolderInput size={15} />
              From saved
            </Button>
            <Button variant="accent" size="sm" onClick={() => setAdding(true)}>
              <Plus size={15} />
              Add
            </Button>
          </div>
        )}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<BookmarkIcon size={26} />}
          title="Nothing planned yet"
          text="Add places to visit, eat, drink or things to do — or pull them in from the team's saved bookmarks."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visible.map((b) => (
            <BookmarkCard
              key={b.id}
              bookmark={b}
              onToggleDone={allowed ? () => void update(b.id, { done: !b.done }) : undefined}
              onEdit={allowed ? () => setEditing(b) : undefined}
              onDelete={allowed ? () => void remove(b) : undefined}
            />
          ))}
        </div>
      )}

      {adding && (
        <BookmarkForm open onClose={() => setAdding(false)} onSubmit={create} heading="Add to this hangout" />
      )}
      {editing && (
        <BookmarkForm
          open
          onClose={() => setEditing(null)}
          onSubmit={(v) => update(editing.id, v)}
          initial={editing}
          heading="Edit bookmark"
        />
      )}
      {importing && (
        <ImportPicker
          onClose={() => setImporting(false)}
          existing={bookmarks}
          onPick={async (b) => {
            await create({
              url: b.url,
              title: b.title,
              description: b.description,
              image_url: b.image_url,
              category: b.category,
              location: b.location,
              notes: b.notes,
            })
          }}
        />
      )}
    </div>
  )
}

/** Copies items from the global bookmark list into this hangout. */
function ImportPicker({
  onClose,
  onPick,
  existing,
}: {
  onClose: () => void
  onPick: (b: Bookmark) => Promise<void>
  existing: HangoutBookmark[]
}) {
  const [items, setItems] = useState<Bookmark[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [added, setAdded] = useState<Set<string>>(new Set())

  useEffect(() => {
    void supabase
      .from('bookmarks')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => setItems((data ?? []) as Bookmark[]))
  }, [])

  const alreadyIn = new Set(existing.map((b) => `${b.title}|${b.url ?? ''}`))

  return (
    <Modal open onClose={onClose} title="Add from saved bookmarks">
      {items === null ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <p className="pb-6 text-center text-sm text-muted">The team's bookmark list is empty.</p>
      ) : (
        <div className="space-y-2 pb-4">
          {items.map((b) => {
            const dup = added.has(b.id) || alreadyIn.has(`${b.title}|${b.url ?? ''}`)
            return (
              <button
                key={b.id}
                disabled={dup || busy === b.id}
                onClick={async () => {
                  setBusy(b.id)
                  try {
                    await onPick(b)
                    setAdded((s) => new Set(s).add(b.id))
                  } finally {
                    setBusy(null)
                  }
                }}
                className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-3 py-2.5 text-left transition hover:bg-surface-2 disabled:opacity-50"
              >
                {b.image_url ? (
                  <img src={b.image_url} alt="" className="h-10 w-10 rounded-xl object-cover" />
                ) : (
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                    <BookmarkIcon size={16} />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-ink">{b.title}</span>
                  <span className="block text-xs text-muted">
                    {BOOKMARK_CATEGORIES.find((c) => c.value === b.category)?.label}
                  </span>
                </span>
                {busy === b.id ? (
                  <Spinner className="h-4 w-4" />
                ) : (
                  <span className="text-xs font-extrabold text-primary">{dup ? 'Added' : '+ Add'}</span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
