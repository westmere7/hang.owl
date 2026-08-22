import { ArrowLeft, Bookmark, Check, History, QrCode, Receipt, Scale, Settings2, Share2, UsersRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ActivityLogModal } from '../components/hangout/ActivityLogModal'
import { BookmarksTab } from '../components/hangout/BookmarksTab'
import { HangoutSettingsModal } from '../components/hangout/HangoutSettingsModal'
import { ManageGuestsModal } from '../components/hangout/ManageGuestsModal'
import { QRModal } from '../components/hangout/QRModal'
import { RecapTab } from '../components/hangout/RecapTab'
import { SpendTab } from '../components/hangout/SpendTab'
import { Avatar, Button, ErrorNote, PageLoader, Segmented } from '../components/ui'
import { useApp } from '../context/AppContext'
import { dateRange } from '../lib/format'
import { supabase } from '../lib/supabase'
import { useAsync } from '../lib/useAsync'
import type { Hangout, HangoutBookmark, Member, Spend } from '../types'

export interface HangoutData {
  hangout: Hangout
  members: Member[]
  me: Member | null
  spends: Spend[]
  bookmarks: HangoutBookmark[]
  reload: () => void
}

type Tab = 'bookmarks' | 'spend' | 'recap'

export function HangoutPage() {
  const { id } = useParams<{ id: string }>()
  const { userId } = useApp()
  const [tab, setTab] = useState<Tab>('spend')
  const [qrOpen, setQrOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [guestsOpen, setGuestsOpen] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const [copiedShare, setCopiedShare] = useState(false)
  const [rev, setRev] = useState(0)

  const { data, loading, error, reload } = useAsync(async () => {
    if (!id) return null
    const [h, m, s, b] = await Promise.all([
      supabase.from('hangouts').select('*').eq('id', id).maybeSingle(),
      supabase.from('hangout_members').select('*').eq('hangout_id', id).order('joined_at'),
      supabase
        .from('spends')
        .select('*, spend_shares(*)')
        .eq('hangout_id', id)
        .order('spent_at', { ascending: false }),
      supabase
        .from('hangout_bookmarks')
        .select('*')
        .eq('hangout_id', id)
        .order('created_at', { ascending: false }),
    ])
    for (const r of [h, m, s, b]) if (r.error) throw r.error
    if (!h.data) return null
    return {
      hangout: h.data as Hangout,
      members: (m.data ?? []) as Member[],
      spends: (s.data ?? []) as Spend[],
      bookmarks: (b.data ?? []) as HangoutBookmark[],
    }
  }, [id, userId])

  const refresh = () => {
    setRev((r) => r + 1)
    reload()
  }

  // Realtime multi-device sync
  useEffect(() => {
    if (!id) return
    const channel = supabase
      .channel(`hangout_realtime_${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hangouts', filter: `id=eq.${id}` },
        (payload) => {
          const newCap = (payload?.new as Hangout | undefined)?.spending_cap
          if (newCap !== undefined) {
            if (newCap && Number(newCap) > 0) {
              localStorage.setItem(`hangowl_cap_${id}`, String(newCap))
            } else {
              localStorage.removeItem(`hangowl_cap_${id}`)
            }
          }
          refresh()
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'spends', filter: `hangout_id=eq.${id}` },
        () => refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hangout_members', filter: `hangout_id=eq.${id}` },
        () => refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hangout_bookmarks', filter: `hangout_id=eq.${id}` },
        () => refresh(),
      )
      .on(
        'broadcast',
        { event: 'sync' },
        (payload) => {
          if (payload?.payload?.cap !== undefined) {
            if (payload.payload.cap && Number(payload.payload.cap) > 0) {
              localStorage.setItem(`hangowl_cap_${id}`, String(payload.payload.cap))
            } else {
              localStorage.removeItem(`hangowl_cap_${id}`)
            }
          }
          refresh()
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [id])

  if (loading) return <PageLoader />
  if (error) return <ErrorNote message={error} />
  if (!data) {
    return (
      <div className="py-16 text-center">
        <p className="text-lg font-black text-ink">Hangout not found</p>
        <p className="mt-1 text-sm text-muted">It may have been deleted by its organizer.</p>
        <Link to="/" className="mt-5 inline-block">
          <Button variant="outline">Back to hangouts</Button>
        </Link>
      </div>
    )
  }

  const { hangout, members } = data
  const me = members.find((mm) => mm.profile_id === userId) ?? null
  const shared: HangoutData = { ...data, me, reload: refresh }
  const ended = hangout.status === 'ended'

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Streamlined Compact Header Bar */}
      <div className="rounded-2xl border border-line/60 bg-surface p-3 sm:p-3.5 shadow-card">
        <div className="flex items-center justify-between gap-3">
          {/* Left: Back button + Hangout name & info */}
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <Link
              to="/"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line/60 bg-surface-2/80 text-muted transition hover:border-primary/40 hover:bg-surface-2 hover:text-ink active:scale-95 group"
              title="Exit hangout"
            >
              <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-0.5 group-hover:text-primary" />
            </Link>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-base sm:text-lg font-black tracking-tight text-ink">
                  {hangout.name}
                </h1>
                {ended ? (
                  <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-black uppercase text-muted border border-line/40">
                    Ended
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-black uppercase text-success border border-success/30">
                    Active
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted truncate">
                {hangout.starts_on && (
                  <>
                    <span>{dateRange(hangout.starts_on, hangout.ends_on)}</span>
                    <span>·</span>
                  </>
                )}
                <span>{members.length}/{hangout.expected_guests} guests</span>
              </div>
            </div>
          </div>

          {/* Right: Action Buttons & Avatar Roster Shortcut */}
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {/* Mini Avatar Stack (clickable to view roster) */}
            <button
              type="button"
              onClick={() => (me?.is_admin ? setGuestsOpen(true) : setQrOpen(true))}
              className="hidden sm:flex items-center -space-x-2 mr-1 transition-opacity hover:opacity-80"
              title="View roster"
            >
              {members.slice(0, 3).map((m) => (
                <Avatar key={m.id} name={m.display_name} size="sm" className="!h-7 !w-7 !text-[10px]" />
              ))}
              {members.length > 3 && (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-2 text-[10px] font-black text-muted ring-2 ring-surface border border-line">
                  +{members.length - 3}
                </span>
              )}
            </button>

            {/* Invite button */}
            <button
              type="button"
              onClick={() => setQrOpen(true)}
              className="flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-black text-white shadow-glow transition hover:brightness-110 active:scale-95"
              title="Invite members"
            >
              <QrCode size={15} />
              <span className="hidden sm:inline">Invite</span>
            </button>

            {me && (
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard
                    .writeText(`${window.location.origin}/bill/${hangout.code}`)
                    .then(() => {
                      setCopiedShare(true)
                      setTimeout(() => setCopiedShare(false), 1500)
                    })
                    .catch(() => {})
                }}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-line/60 bg-surface-2/80 text-muted transition hover:text-ink hover:border-primary/40 active:scale-95"
                title="Copy payment link"
                aria-label="Copy payment link"
              >
                {copiedShare ? <Check size={16} className="text-success" /> : <Share2 size={16} />}
              </button>
            )}

            {me && (
              <button
                type="button"
                onClick={() => setLogOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-line/60 bg-surface-2/80 text-muted transition hover:text-ink hover:border-primary/40 active:scale-95"
                title="Activity log"
                aria-label="Activity log"
              >
                <History size={16} />
              </button>
            )}

            {me?.is_admin && (
              <>
                <button
                  type="button"
                  onClick={() => setGuestsOpen(true)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-line/60 bg-surface-2/80 text-muted transition hover:text-ink hover:border-primary/40 active:scale-95"
                  title="Manage roster"
                  aria-label="Manage guests"
                >
                  <UsersRound size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-line/60 bg-surface-2/80 text-muted transition hover:text-ink hover:border-primary/40 active:scale-95"
                  title="Hangout settings"
                  aria-label="Hangout settings"
                >
                  <Settings2 size={16} />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {!me && (
        <div className="flex flex-col items-center gap-3 rounded-2xl sm:rounded-3xl border border-line/60 bg-surface p-6 text-center shadow-card">
          <p className="text-sm font-black text-ink">You're not part of this hangout yet.</p>
          <Link to={`/join/${hangout.code}`}>
            <Button variant="primary">Join it</Button>
          </Link>
        </div>
      )}

      {/* Tabs: Places, Spend, Recap (Spend landed by default) */}
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          {
            value: 'bookmarks',
            label: (
              <span className="inline-flex items-center gap-1.5">
                <Bookmark size={15} /> Places
              </span>
            ),
          },
          {
            value: 'spend',
            label: (
              <span className="inline-flex items-center gap-1.5">
                <Receipt size={15} /> Spend
              </span>
            ),
          },
          {
            value: 'recap',
            label: (
              <span className="inline-flex items-center gap-1.5">
                <Scale size={15} /> Recap
              </span>
            ),
          },
        ]}
      />

      {tab === 'bookmarks' && <BookmarksTab key={rev} data={shared} />}
      {tab === 'spend' && <SpendTab key={rev} data={shared} />}
      {tab === 'recap' && <RecapTab key={rev} data={shared} />}

      <QRModal open={qrOpen} onClose={() => setQrOpen(false)} hangout={hangout} />
      {me && <ActivityLogModal open={logOpen} onClose={() => setLogOpen(false)} hangoutId={hangout.id} />}
      {me?.is_admin && (
        <>
          <ManageGuestsModal
            open={guestsOpen}
            onClose={() => setGuestsOpen(false)}
            hangoutId={hangout.id}
            members={members}
            reload={reload}
          />
          <HangoutSettingsModal
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            hangout={hangout}
            members={members}
            reload={reload}
          />
        </>
      )}
    </div>
  )
}
