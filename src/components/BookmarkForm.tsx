import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import { BOOKMARK_CATEGORIES } from '../lib/categories'
import { fetchLinkPreview, normalizeUrl } from '../lib/linkPreview'
import type { BookmarkCategory } from '../types'
import { Button, Chip, ErrorNote, Field, Input, Modal, Spinner, Textarea } from './ui'

export interface BookmarkValues {
  url: string | null
  title: string
  description: string | null
  image_url: string | null
  category: BookmarkCategory
  notes: string | null
}

interface Props {
  open: boolean
  onClose: () => void
  onSubmit: (values: BookmarkValues) => Promise<void>
  initial?: Partial<BookmarkValues>
  heading: string
}

/**
 * Add/edit form for both global and in-hangout bookmarks. Pasting just a
 * link is enough — "Auto-fill" pulls the page title + thumbnail.
 */
export function BookmarkForm({ open, onClose, onSubmit, initial, heading }: Props) {
  const [url, setUrl] = useState(initial?.url ?? '')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [description, setDescription] = useState(initial?.description ?? null)
  const [imageUrl, setImageUrl] = useState(initial?.image_url ?? null)
  const [category, setCategory] = useState<BookmarkCategory>(initial?.category ?? 'visit')
  const [fetching, setFetching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function autoFill(force = false) {
    const normalized = normalizeUrl(url)
    if (!normalized || fetching) return
    if (!force && title.trim()) return // don't clobber what the user typed
    setFetching(true)
    const preview = await fetchLinkPreview(normalized)
    setFetching(false)
    if (!preview) return
    if (preview.title && (force || !title.trim())) setTitle(preview.title)
    if (preview.description) setDescription(preview.description)
    if (preview.image) setImageUrl(preview.image)
  }

  async function submit() {
    const cleanTitle = title.trim() || domainFallback()
    if (!cleanTitle) {
      setError('Add a title or a link first.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSubmit({
        url: normalizeUrl(url),
        title: cleanTitle,
        description: description?.trim() || null,
        image_url: imageUrl,
        category,
        notes: notes.trim() || null,
      })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  function domainFallback(): string {
    const normalized = normalizeUrl(url)
    if (!normalized) return ''
    try {
      return new URL(normalized).hostname.replace(/^www\./, '')
    } catch {
      return ''
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={heading}
      footer={
        <div className="flex gap-3">
          <Button variant="outline" onClick={onClose} full>
            Cancel
          </Button>
          <Button variant="accent" onClick={submit} disabled={saving} full>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pb-2">
        <Field label="Link" hint="Optional — paste a link and we'll grab the title & photo.">
          <div className="flex gap-2">
            <Input
              placeholder="https://…"
              inputMode="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onBlur={() => void autoFill()}
            />
            <Button
              variant="soft"
              size="icon"
              type="button"
              title="Auto-fill from link"
              onClick={() => void autoFill(true)}
              disabled={fetching || !url.trim()}
            >
              {fetching ? <Spinner className="h-4.5 w-4.5" /> : <Sparkles size={18} />}
            </Button>
          </div>
        </Field>

        {imageUrl && (
          <div className="relative overflow-hidden rounded-2xl">
            <img src={imageUrl} alt="" className="h-36 w-full object-cover" />
            <button
              type="button"
              onClick={() => setImageUrl(null)}
              className="absolute right-2 top-2 rounded-full bg-black/55 px-2.5 py-1 text-xs font-bold text-white"
            >
              Remove
            </button>
          </div>
        )}

        <Field label="Title">
          <Input
            placeholder="e.g. Phở Thìn Lò Đúc"
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>

        <Field label="Type">
          <div className="flex flex-wrap gap-2">
            {BOOKMARK_CATEGORIES.map(({ value, label, icon: Icon }) => (
              <Chip key={value} active={category === value} onClick={() => setCategory(value)}>
                <Icon size={14} />
                {label}
              </Chip>
            ))}
          </div>
        </Field>

        <Field label="Notes">
          <Textarea
            placeholder="Anything the team should know…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        <ErrorNote message={error} />
      </div>
    </Modal>
  )
}
