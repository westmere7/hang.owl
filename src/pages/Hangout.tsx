import { Bookmark, CalendarDays, QrCode, Receipt, Scale, Settings2, Users, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
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
  const shared: HangoutData = { ...data, me, reload }
  const ended = hangout.status === 'ended'

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-line/60 bg-gradient-to-br from-surface via-surface to-surface-2 p-5 sm:p-7 shadow-pop">
        <div className="absolute -right-10 -top-12 h-44 w-44 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 right-20 h-36 w-36 rounded-full bg-accent/20 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl sm:text-2xl md:text-3xl font-black tracking-tight text-ink">
                {hangout.name}
              </h1>
              {ended ? (
                <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-muted border border-line/40">
                  Ended
                </span>
              ) : (
                <span className="rounded-full bg-success-soft px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-success border border-success/30">
                  Active
                </span>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm font-semibold text-muted">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays size={14} className="text-primary" />
                {dateRange(hangout.starts_on, hangout.ends_on)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Users size={14} className="text-primary" />
                {members.length}/{hangout.expected_guests} guests
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => setQrOpen(true)}
              className="flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-xs font-black text-white shadow-glow transition hover:brightness-110 active:scale-95"
              aria-label="Show invite QR code"
            >
              <QrCode size={16} />
              <span>Invite</span>
            </button>
            {me?.is_admin && (
              <>
                <button
                  onClick={() => setGuestsOpen(true)}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-line/60 bg-surface-2/80 text-muted transition hover:text-ink hover:border-primary/40 active:scale-95"
                  aria-label="Manage guests"
                  title="Manage roster"
                >
                  <UsersRound size={18} />
                </button>
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-line/60 bg-surface-2/80 text-muted transition hover:text-ink hover:border-primary/40 active:scale-95"
                  aria-label="Hangout settings"
                  title="Hangout settings"
                >
                  <Settings2 size={18} />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Member Avatars */}
        <div className="relative z-10 mt-5 flex items-center -space-x-2 overflow-x-auto pb-1 no-scrollbar">
          {members.map((m) => (
            <Avatar key={m.id} name={m.display_name} size="sm" />
          ))}
          <button
            onClick={() => setQrOpen(true)}
            className="!ml-3 inline-flex items-center gap-1 rounded-full border border-dashed border-line bg-surface-2/60 px-3 py-1 text-xs font-black text-muted transition hover:text-primary hover:border-primary"
          >
            + Invite friend
          </button>
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

      {/* Tabs */}
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          {
            value: 'spend',
            label: (
              <span className="inline-flex items-center gap-1.5">
                <Receipt size={15} /> Spend
              </span>
            ),
          },
          {
            value: 'bookmarks',
            label: (
              <span className="inline-flex items-center gap-1.5">
                <Bookmark size={15} /> Places
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

      {tab === 'bookmarks' && <BookmarksTab data={shared} />}
      {tab === 'spend' && <SpendTab data={shared} />}
      {tab === 'recap' && <RecapTab data={shared} />}

      <QRModal open={qrOpen} onClose={() => setQrOpen(false)} hangout={hangout} />
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
            reload={reload}
          />
        </>
      )}
    </div>
  )
}
