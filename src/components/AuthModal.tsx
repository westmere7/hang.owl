import { MailCheck } from 'lucide-react'
import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { Button, ErrorNote, Field, Input, Modal, Segmented } from './ui'

type Mode = 'signup' | 'signin'

/**
 * Email + password auth. "Sign up" upgrades the current anonymous guest
 * session into a permanent account (same user id, so their data carries
 * over). "Sign in" logs into an existing account.
 */
export function AuthModal({
  open,
  onClose,
  reason,
  initialMode = 'signup',
}: {
  open: boolean
  onClose: () => void
  /** Optional line explaining why we're asking (e.g. gating hangout creation). */
  reason?: string
  initialMode?: Mode
}) {
  const { profile, signUp, signIn } = useApp()
  const [mode, setMode] = useState<Mode>(initialMode)
  const [name, setName] = useState(profile?.display_name ?? '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmSent, setConfirmSent] = useState(false)

  function reset() {
    setError(null)
    setBusy(false)
  }

  async function submit() {
    setError(null)
    const mail = email.trim()
    if (!mail || !password) {
      setError('Enter your email and password.')
      return
    }
    if (mode === 'signup') {
      if (!name.trim()) {
        setError('Add your name so your team knows who you are.')
        return
      }
      if (password.length < 6) {
        setError('Use a password of at least 6 characters.')
        return
      }
    }
    setBusy(true)
    try {
      if (mode === 'signup') {
        const { active, needsEmailConfirm } = await signUp(mail, password, name.trim())
        if (needsEmailConfirm) {
          setConfirmSent(true)
          return
        }
        if (active) onClose()
      } else {
        await signIn(mail, password)
        onClose()
      }
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  if (confirmSent) {
    return (
      <Modal open={open} onClose={onClose} title="Confirm your email">
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <MailCheck size={30} />
          </span>
          <p className="text-sm text-muted">
            We sent a confirmation link to <span className="font-bold text-ink">{email}</span>. Click
            it, then come back — you'll be able to create hangouts.
          </p>
          <Button variant="outline" full onClick={onClose}>
            Got it
          </Button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'signup' ? 'Create your account' : 'Welcome back'}
      footer={
        <Button variant="accent" full size="lg" onClick={() => void submit()} disabled={busy}>
          {busy ? 'Just a sec…' : mode === 'signup' ? 'Create account' : 'Sign in'}
        </Button>
      }
    >
      <div className="space-y-4 pb-2">
        {reason && (
          <p className="rounded-2xl bg-primary-soft/60 px-4 py-2.5 text-sm font-semibold text-ink">
            {reason}
          </p>
        )}

        <Segmented<Mode>
          value={mode}
          onChange={(m) => {
            setMode(m)
            reset()
          }}
          options={[
            { value: 'signup', label: 'Sign up' },
            { value: 'signin', label: 'Sign in' },
          ]}
        />

        {mode === 'signup' && (
          <Field label="Your name">
            <Input
              placeholder="Your name"
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
        )}

        <Field label="Email">
          <Input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field label="Password" hint={mode === 'signup' ? 'At least 6 characters.' : undefined}>
          <Input
            type="password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit()
            }}
          />
        </Field>

        <ErrorNote message={error} />

        {mode === 'signup' && (
          <p className="text-center text-xs text-muted">
            Signing up keeps everything you've already added as a guest.
          </p>
        )}
      </div>
    </Modal>
  )
}

function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (/already registered|already been registered|email_exists/i.test(msg))
    return 'That email is already in use. Try signing in instead.'
  if (/invalid login credentials/i.test(msg)) return 'Wrong email or password.'
  if (/email.*not confirmed/i.test(msg)) return 'Please confirm your email first, then sign in.'
  return msg
}
