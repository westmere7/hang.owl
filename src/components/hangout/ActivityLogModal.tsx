import { Bookmark, CheckCircle2, Receipt, Settings2, UsersRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Modal, PageLoader } from '../ui'

interface LogEntry {
  id: string
  actor_name: string
  action: string
  summary: string
  created_at: string
}

function iconFor(action: string) {
  if (action.startsWith('spend')) return Receipt
  if (action.startsWith('bookmark')) return Bookmark
  if (action.startsWith('settle')) return CheckCircle2
  if (action.startsWith('member')) return UsersRound
  return Settings2
}

function timeAgo(iso: string): string {
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (secs < 60) return 'just now'
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** Read-only feed of every change made in a hangout (written by DB triggers). */
export function ActivityLogModal({
  open,
  onClose,
  hangoutId,
}: {
  open: boolean
  onClose: () => void
  hangoutId: string
}) {
  const [entries, setEntries] = useState<LogEntry[] | null>(null)

  useEffect(() => {
    if (!open) return
    let active = true
    setEntries(null)
    void supabase
      .from('activity_log')
      .select('id, actor_name, action, summary, created_at')
      .eq('hangout_id', hangoutId)
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => {
        if (active) setEntries((data ?? []) as LogEntry[])
      })
    return () => {
      active = false
    }
  }, [open, hangoutId])

  return (
    <Modal open={open} onClose={onClose} title="Activity log">
      {entries === null ? (
        <PageLoader />
      ) : entries.length === 0 ? (
        <p className="py-10 text-center text-sm font-semibold text-muted">
          No activity yet. Every change to this hangout will show up here.
        </p>
      ) : (
        <div className="space-y-1.5 pb-2">
          {entries.map((e) => {
            const Icon = iconFor(e.action)
            return (
              <div
                key={e.id}
                className="flex items-start gap-3 rounded-2xl border border-line/60 bg-surface-2/50 px-3 py-2.5"
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <Icon size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug text-ink">
                    <span className="font-black">{e.actor_name}</span>{' '}
                    <span className="text-muted">{e.summary}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-muted">
                    {timeAgo(e.created_at)}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
