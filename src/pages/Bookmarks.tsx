import { Bookmark as BookmarkIcon, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { BookmarkCard } from '../components/BookmarkCard'
import { BookmarkForm, type BookmarkValues } from '../components/BookmarkForm'
import { Button, Chip, EmptyState, ErrorNote, PageLoader } from '../components/ui'
import { useApp } from '../context/AppContext'
import { BOOKMARK_CATEGORIES } from '../lib/categories'
import { supabase } from '../lib/supabase'
import { useAsync } from '../lib/useAsync'
import type { Bookmark, BookmarkCategory } from '../types'

/** Global, team-wide bookmark list — not tied to any hangout. */
export function BookmarksPage() {
  const { userId } = useApp()
  const [filter, setFilter] = useState<BookmarkCategory | 'all'>('all')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Bookmark | null>(null)

  const { data, loading, error, reload } = useAsync(async () => {
    const { data, error } = await supabase
      .from('bookmarks')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data as Bookmark[]
  }, [])

  const visible = useMemo(
    () => (data ?? []).filter((b) => filter === 'all' || b.category === filter),
    [data, filter],
  )

  async function create(values: BookmarkValues) {
    const { error } = await supabase.from('bookmarks').insert({ ...values, created_by: userId })
    if (error) throw error
    reload()
  }

  async function update(id: string, values: BookmarkValues) {
    const { error } = await supabase.from('bookmarks').update(values).eq('id', id)
    if (error) throw error
    reload()
  }

  async function remove(bookmark: Bookmark) {
    if (!window.confirm(`Delete "${bookmark.title}"?`)) return
    const { error } = await supabase.from('bookmarks').delete().eq('id', bookmark.id)
    if (error) {
      window.alert(error.message)
      return
    }
    reload()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-ink">Bookmarks</h1>
          <p className="text-sm text-muted">Places the team wants to visit, eat, drink & do.</p>
        </div>
        <Button variant="accent" onClick={() => setAdding(true)}>
          <Plus size={16} />
          <span className="hidden sm:inline">Add place</span>
          <span className="sm:hidden">Add</span>
        </Button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
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

      <ErrorNote message={error} />
      {loading ? (
        <PageLoader />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<BookmarkIcon size={26} />}
          title="Nothing saved yet"
          text="Paste a link to a restaurant, bar or spot — HangOwl fills in the title and photo for you."
          action={
            <Button variant="accent" onClick={() => setAdding(true)}>
              <Plus size={16} /> Add your first place
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visible.map((b) => (
            <BookmarkCard
              key={b.id}
              bookmark={b}
              onEdit={() => setEditing(b)}
              onDelete={() => void remove(b)}
            />
          ))}
        </div>
      )}

      {adding && (
        <BookmarkForm open onClose={() => setAdding(false)} onSubmit={create} heading="Add a place" />
      )}
      {editing && (
        <BookmarkForm
          open
          onClose={() => setEditing(null)}
          onSubmit={(v) => update(editing.id, v)}
          initial={editing}
          heading="Edit place"
        />
      )}
    </div>
  )
}
