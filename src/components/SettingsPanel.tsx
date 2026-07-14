import { LogOut, Monitor, Moon, Sun, UserCircle2 } from 'lucide-react'
import { useState } from 'react'
import { useApp, type ThemePref } from '../context/AppContext'
import { APP_VERSION, BUILD_COMMIT, BUILD_TIME } from '../lib/version'
import { AuthModal } from './AuthModal'
import { Avatar, Button, ErrorNote, Field, Input, Modal, Segmented } from './ui'
import { OwlLogo } from './OwlLogo'

export function SettingsPanel() {
  const { settingsOpen, setSettingsOpen, theme, setTheme, profile, setName, isAuthed, email, signOut } =
    useApp()
  const [name, setNameInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [authOpen, setAuthOpen] = useState(false)

  const currentName = profile?.display_name ?? ''

  async function saveName() {
    const next = name.trim()
    if (!next || next === currentName) return
    setSaving(true)
    setError(null)
    try {
      await setName(next)
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Settings">
        <div className="space-y-6 pb-2">
          <section className="space-y-2">
            <Field label="Theme">
              <Segmented<ThemePref>
                value={theme}
                onChange={setTheme}
                options={[
                  { value: 'light', label: <span className="inline-flex items-center gap-1.5"><Sun size={15} /> Light</span> },
                  { value: 'dark', label: <span className="inline-flex items-center gap-1.5"><Moon size={15} /> Dark</span> },
                  { value: 'system', label: <span className="inline-flex items-center gap-1.5"><Monitor size={15} /> Auto</span> },
                ]}
              />
            </Field>
          </section>

          {profile && (
            <section className="space-y-3">
              <Field label="Your name" hint="Shown to everyone in your hangouts.">
                <div className="flex items-center gap-3">
                  <Avatar name={name.trim() || currentName || '?'} />
                  <Input
                    defaultValue={currentName}
                    placeholder="Your name"
                    maxLength={40}
                    onChange={(e) => setNameInput(e.target.value)}
                    onFocus={(e) => setNameInput(e.target.value)}
                  />
                  <Button size="sm" onClick={saveName} disabled={saving || !name.trim() || name.trim() === currentName}>
                    {saved ? 'Saved!' : 'Save'}
                  </Button>
                </div>
              </Field>
              <ErrorNote message={error} />
            </section>
          )}

          <section className="space-y-2">
            <p className="text-xs font-extrabold uppercase tracking-wide text-muted">Account</p>
            {isAuthed ? (
              <div className="flex items-center gap-3 rounded-xl3 bg-surface-2 p-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-success-soft text-success">
                  <UserCircle2 size={22} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-extrabold text-ink">Signed in</p>
                  <p className="truncate text-xs text-muted">{email}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => void signOut()}>
                  <LogOut size={15} />
                  Sign out
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-xl3 bg-surface-2 p-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft text-primary">
                  <UserCircle2 size={22} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-extrabold text-ink">Guest</p>
                  <p className="text-xs text-muted">Sign in to create your own hangouts.</p>
                </div>
                <Button size="sm" onClick={() => setAuthOpen(true)}>
                  Sign in
                </Button>
              </div>
            )}
          </section>

          <section className="flex items-center gap-3 rounded-xl3 bg-surface-2 p-4">
            <OwlLogo size={40} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold text-ink">HangOwl</p>
              <p className="text-xs text-muted">Plan hangouts, save places, split the bill.</p>
            </div>
            <span
              className="shrink-0 rounded-full bg-surface px-2.5 py-1 font-mono text-[11px] font-bold text-muted"
              title={`Commit ${BUILD_COMMIT} · built ${new Date(BUILD_TIME).toLocaleString()}`}
            >
              v{APP_VERSION}
            </span>
          </section>
        </div>
      </Modal>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} initialMode="signin" />
    </>
  )
}
