import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { AuthModal } from './AuthModal'
import { OwlLogo } from './OwlLogo'
import { Button, ErrorNote, Input } from './ui'

/**
 * First-run gate: everything in HangOwl is name-based, so before doing
 * anything we ask for a name — exactly once. The join page has its own
 * name step, so it is exempt.
 */
export function NameGate() {
  const { ready, profile, setName } = useApp()
  const location = useLocation()
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [authOpen, setAuthOpen] = useState(false)

  const onJoinPage = location.pathname.startsWith('/join/')
  if (!ready || !profile || profile.display_name || onJoinPage) return null

  async function submit() {
    const name = value.trim()
    if (!name) return
    setSaving(true)
    setError(null)
    try {
      await setName(name)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/95 backdrop-blur-md p-4 sm:p-6">
      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl sm:rounded-3xl border border-line/60 bg-surface p-6 sm:p-8 shadow-pop">
        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/20 blur-2xl pointer-events-none" />

        <div className="relative mb-6 flex flex-col items-center gap-3 text-center">
          <OwlLogo size={64} />
          <h1 className="text-2xl font-black tracking-tight text-ink">
            Welcome to Hang<span className="text-primary">Owl</span>
          </h1>
          <p className="text-xs sm:text-sm font-semibold text-muted">What should your friends call you?</p>
        </div>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <Input
            autoFocus
            placeholder="Your name"
            maxLength={40}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <ErrorNote message={error} />
          <Button type="submit" variant="primary" full size="lg" disabled={!value.trim() || saving} className="shadow-glow">
            {saving ? 'Saving…' : "Let's hang"}
          </Button>
        </form>
        <button
          onClick={() => setAuthOpen(true)}
          className="mt-4 w-full text-center text-xs sm:text-sm font-bold text-muted transition hover:text-ink"
        >
          Already have an account? <span className="text-primary font-black">Sign in</span>
        </button>
      </div>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} initialMode="signin" />
    </div>
  )
}
