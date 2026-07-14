import { CalendarDays, QrCode, Settings2, Users, UsersRound } from 'lucide-react'
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
        <p className="text-lg font-extrabold text-ink">Hangout not found</p>
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
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl3 bg-gradient-to-br from-primary to-primary-deep p-5 text-white shadow-pop sm:p-6">
        <div className="absolute -right-10 -top-12 h-44 w-44 rounded-full bg-white/10" />
        <div className="absolute -bottom-16 right-20 h-36 w-36 rounded-full bg-accent/30 blur-2xl" />

        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-black tracking-tight">{hangout.name}</h1>
              {ended && (
                <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide">
                  Ended
                </span>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-semibold text-white/75">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays size={14} />
                {dateRange(hangout.starts_on, hangout.ends_on)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Users size={14} />
                {members.length}/{hangout.expected_guests} guests
              </span>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => setQrOpen(true)}
              className="rounded-full bg-accent p-2.5 text-white shadow-card transition hover:bg-accent-deep"
              aria-label="Show invite QR code"
            >
              <QrCode size={18} />
            </button>
            {me?.is_admin && (
              <>
                <button
                  onClick={() => setGuestsOpen(true)}
                  className="rounded-full bg-white/15 p-2.5 text-white transition hover:bg-white/25"
                  aria-label="Manage guests"
                >
                  <UsersRound size={18} />
                </button>
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="rounded-full bg-white/15 p-2.5 text-white transition hover:bg-white/25"
                  aria-label="Hangout settings"
                >
                  <Settings2 size={18} />
                </button>
              </>
            )}
          </div>
        </div>

        <div className="relative mt-4 flex items-center -space-x-2">
          {members.map((m) => (
            <Avatar key={m.id} name={m.display_name} className="ring-primary-deep" />
          ))}
          <button
            onClick={() => setQrOpen(true)}
            className="!ml-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-extrabold text-white transition hover:bg-white/25"
          >
            + Invite
          </button>
        </div>
      </div>

      {!me && (
        <div className="flex flex-col items-center gap-3 rounded-xl3 bg-surface p-6 text-center shadow-card">
          <p className="text-sm font-bold text-ink">You're not part of this hangout yet.</p>
          <Link to={`/join/${hangout.code}`}>
            <Button variant="accent">Join it</Button>
          </Link>
        </div>
      )}

      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'bookmarks', label: 'Bookmarks' },
          { value: 'spend', label: 'Spend' },
          { value: 'recap', label: 'Recap' },
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
