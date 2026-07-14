import { UserPlus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { OwlLogo } from '../components/OwlLogo'
import { Avatar, Button, ErrorNote, Input, PageLoader, cn } from '../components/ui'
import { useApp } from '../context/AppContext'
import { dateRange } from '../lib/format'
import { getCachedName } from '../lib/identity'
import { supabase } from '../lib/supabase'
import { useAsync } from '../lib/useAsync'
import type { Hangout, Member } from '../types'

/**
 * Landing page for a scanned QR code (/join/:code). A guest can either
 * claim a seat the organizer already named for them, or join as someone
 * new. First-timers type their name once; it's cached so next time they
 * walk straight in.
 */
export function JoinPage() {
  const { code } = useParams<{ code: string }>()
  const { ready, userId, profile, setName } = useApp()
  const navigate = useNavigate()
  const [nameInput, setNameInput] = useState(() => profile?.display_name || getCachedName() || '')
  const [showNew, setShowNew] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data, loading } = useAsync(async () => {
    if (!code) return null
    const { data: hangout, error } = await supabase
      .from('hangouts')
      .select('*, hangout_members(*)')
      .eq('code', code)
      .maybeSingle()
    if (error) throw error
    return hangout as (Hangout & { hangout_members: Member[] }) | null
  }, [code, ready])

  const hangout = data
  const members = hangout?.hangout_members ?? []
  const alreadyMember = !!userId && members.some((m) => m.profile_id === userId)
  const unclaimed = members.filter((m) => m.profile_id === null)
  const knownName = profile?.display_name || getCachedName() || ''

  async function finish(name: string) {
    if (profile && profile.display_name !== name && name) await setName(name)
    navigate(`/hangout/${hangout!.id}`, { replace: true })
  }

  /** Take over a placeholder seat the organizer named. */
  async function claim(member: Member) {
    if (!hangout || !userId) return
    setBusy(true)
    setError(null)
    try {
      const { error } = await supabase
        .from('hangout_members')
        .update({ profile_id: userId })
        .eq('id', member.id)
        .is('profile_id', null)
      if (error) throw error
      await finish(member.display_name)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  /** Join as a brand-new person (not on the organizer's list). */
  async function joinNew() {
    if (!hangout || !userId) return
    const name = (knownName || nameInput).trim()
    if (!name) return
    setBusy(true)
    setError(null)
    try {
      const { error } = await supabase
        .from('hangout_members')
        .insert({ hangout_id: hangout.id, profile_id: userId, display_name: name })
      if (error && error.code !== '23505') throw error // 23505 = already joined
      await finish(name)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg p-6">
      <div className="w-full max-w-sm rounded-xl3 bg-surface p-8 text-center shadow-pop">
        <div className="mb-5 flex justify-center">
          <OwlLogo size={64} />
        </div>

        {!ready || loading ? (
          <PageLoader />
        ) : !hangout ? (
          <>
            <h1 className="text-xl font-black text-ink">Hangout not found</h1>
            <p className="mt-2 text-sm text-muted">
              This invite link doesn't match any hangout. Ask the organizer for a fresh QR code.
            </p>
            <Link to="/" className="mt-6 block">
              <Button variant="outline" full>
                Go home
              </Button>
            </Link>
          </>
        ) : (
          <>
            <p className="text-sm font-bold text-muted">You're invited to</p>
            <h1 className="mt-1 text-2xl font-black text-ink">{hangout.name}</h1>
            <p className="mt-1 text-sm font-semibold text-muted">
              {dateRange(hangout.starts_on, hangout.ends_on)}
            </p>

            <div className="mt-6 space-y-3 text-left">
              {alreadyMember ? (
                <Button variant="accent" full size="lg" onClick={() => navigate(`/hangout/${hangout.id}`)}>
                  You're in — open it
                </Button>
              ) : knownName && !showNew ? (
                <>
                  <ErrorNote message={error} />
                  <Button variant="accent" full size="lg" onClick={() => void joinNew()} disabled={busy}>
                    {busy ? 'Joining…' : `Join as ${knownName}`}
                  </Button>
                  {unclaimed.length > 0 && (
                    <button
                      onClick={() => setShowNew(false)}
                      className="w-full text-center text-xs font-bold text-muted"
                    >
                      or pick your name from the list below
                    </button>
                  )}
                  <ClaimList members={unclaimed} busy={busy} onClaim={claim} />
                </>
              ) : (
                <>
                  <ClaimList members={unclaimed} busy={busy} onClaim={claim} heading />
                  <div>
                    <p className="mb-1.5 text-xs font-extrabold uppercase tracking-wide text-muted">
                      {unclaimed.length > 0 ? 'Not on the list?' : 'What should we call you?'}
                    </p>
                    <Input
                      autoFocus
                      placeholder="Your name"
                      maxLength={40}
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                    />
                  </div>
                  <ErrorNote message={error} />
                  <Button variant="accent" full size="lg" onClick={() => void joinNew()} disabled={busy || !nameInput.trim()}>
                    <UserPlus size={16} />
                    {busy ? 'Joining…' : 'Join as someone new'}
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ClaimList({
  members,
  busy,
  onClaim,
  heading,
}: {
  members: Member[]
  busy: boolean
  onClaim: (m: Member) => void
  heading?: boolean
}) {
  if (members.length === 0) return null
  return (
    <div className="space-y-2">
      {heading && (
        <p className="text-xs font-extrabold uppercase tracking-wide text-muted">Which one are you?</p>
      )}
      <div className="space-y-1.5">
        {members.map((m) => (
          <button
            key={m.id}
            disabled={busy}
            onClick={() => onClaim(m)}
            className={cn(
              'flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-3 py-2.5 text-left transition',
              'hover:border-primary hover:bg-primary-soft disabled:opacity-50',
            )}
          >
            <Avatar name={m.display_name} size="sm" />
            <span className="flex-1 truncate text-sm font-bold text-ink">{m.display_name}</span>
            <span className="text-xs font-extrabold text-primary">That's me</span>
          </button>
        ))}
      </div>
    </div>
  )
}
