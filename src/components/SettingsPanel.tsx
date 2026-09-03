import { LogOut, Monitor, Moon, Pencil, Plus, Sun, Trash2, UserCircle2 } from 'lucide-react'
import { useState } from 'react'
import { useApp, type ThemePref, type UiScale } from '../context/AppContext'
import { APP_VERSION, BUILD_COMMIT, BUILD_TIME } from '../lib/version'
import { useSavedBankAccounts } from '../lib/useSavedBankAccounts'
import type { SavedBankAccount } from '../types'
import { AuthModal } from './AuthModal'
import { BankAccountModal } from './BankAccountModal'
import { Avatar, Button, ErrorNote, Field, Input, Modal, Segmented, Spinner } from './ui'
import { OwlLogo } from './OwlLogo'

export function SettingsPanel() {
  const { settingsOpen, setSettingsOpen, theme, setTheme, uiScale, setUiScale, profile, setName, isAuthed, email, signOut } =
    useApp()
  const [name, setNameInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [authOpen, setAuthOpen] = useState(false)

  const { accounts, loading: loadingAccounts, saveAccount, deleteAccount } = useSavedBankAccounts()
  const [accountModalOpen, setAccountModalOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<SavedBankAccount | null>(null)

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

          <section className="space-y-2">
            <Field
              label="Interface Scale (Local view)"
              hint="Adjust zoom & text size for this device only."
            >
              <Segmented<string>
                value={String(uiScale)}
                onChange={(v) => setUiScale(Number(v) as UiScale)}
                options={[
                  { value: '90', label: '90%' },
                  { value: '100', label: '100%' },
                  { value: '110', label: '110%' },
                  { value: '120', label: '120%' },
                  { value: '130', label: '130%' },
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

          {/* Payment Accounts (VietQR) */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-muted">Payment Accounts (VietQR)</p>
                <p className="text-[11px] font-semibold text-muted">
                  Saved bank accounts to receive money and generate VietQR codes.
                </p>
              </div>
              <Button
                variant="soft"
                size="sm"
                onClick={() => {
                  setEditingAccount(null)
                  setAccountModalOpen(true)
                }}
              >
                <Plus size={14} /> Add
              </Button>
            </div>

            {loadingAccounts ? (
              <div className="flex justify-center py-4">
                <Spinner className="h-5 w-5 text-primary" />
              </div>
            ) : accounts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-line/80 bg-surface-2/30 p-4 text-center">
                <p className="text-xs font-semibold text-muted">No bank accounts saved yet.</p>
                <button
                  type="button"
                  onClick={() => {
                    setEditingAccount(null)
                    setAccountModalOpen(true)
                  }}
                  className="mt-1 text-xs font-black text-primary hover:underline"
                >
                  + Add your first account
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {accounts.map((acc) => (
                  <div
                    key={acc.id}
                    className="flex items-center gap-3 rounded-2xl border border-line/60 bg-surface-2/60 p-3"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft font-black text-xs text-primary border border-primary/20">
                      {acc.bank_code}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-extrabold text-ink truncate">{acc.name}</p>
                        <span className="rounded-md bg-surface px-1.5 py-0.5 text-[10px] font-black text-muted border border-line/40">
                          {acc.bank_name || acc.bank_code}
                        </span>
                      </div>
                      <p className="text-xs font-mono font-bold text-muted flex items-center gap-1.5 mt-0.5">
                        <span>{acc.account_no}</span>
                        {acc.account_name && <span>· {acc.account_name}</span>}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingAccount(acc)
                          setAccountModalOpen(true)
                        }}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-ink transition"
                        title="Edit account"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Delete ${acc.name} (${acc.bank_code})?`)) {
                            void deleteAccount(acc.id)
                          }
                        }}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger transition"
                        title="Delete account"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <p className="text-xs font-black uppercase tracking-wider text-muted">Account</p>
            {isAuthed ? (
              <div className="flex items-center gap-3 rounded-2xl border border-line/60 bg-surface-2/60 p-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-success-soft text-success border border-success/30">
                  <UserCircle2 size={22} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-ink">Signed in</p>
                  <p className="truncate text-xs font-semibold text-muted">{email}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => void signOut()}>
                  <LogOut size={15} />
                  Sign out
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-2xl border border-line/60 bg-surface-2/60 p-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft text-primary border border-primary/20">
                  <UserCircle2 size={22} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-ink">Guest</p>
                  <p className="text-xs font-semibold text-muted">Sign in to create your own hangouts.</p>
                </div>
                <Button variant="primary" size="sm" onClick={() => setAuthOpen(true)}>
                  Sign in
                </Button>
              </div>
            )}
          </section>

          <section className="flex items-center gap-3 rounded-2xl border border-line/60 bg-surface-2/60 p-4">
            <OwlLogo size={40} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-ink">HangOwl</p>
              <p className="text-xs font-semibold text-muted">Plan hangouts, save places, split the bill.</p>
            </div>
            <span
              className="shrink-0 rounded-full border border-line bg-surface px-2.5 py-1 font-mono text-[11px] font-bold text-muted"
              title={`Commit ${BUILD_COMMIT} · built ${new Date(BUILD_TIME).toLocaleString()}`}
            >
              v{APP_VERSION}
            </span>
          </section>
        </div>
      </Modal>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} initialMode="signin" />

      {accountModalOpen && (
        <BankAccountModal
          open={accountModalOpen}
          initial={editingAccount}
          onClose={() => {
            setAccountModalOpen(false)
            setEditingAccount(null)
          }}
          onSave={saveAccount}
        />
      )}
    </>
  )
}
