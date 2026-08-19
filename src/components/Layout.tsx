import { Bookmark, Home, Settings } from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { Avatar } from './ui'
import { OwlLogo, Wordmark } from './OwlLogo'
import { cn } from './ui'

const navItems = [
  { to: '/', label: 'Hangouts', icon: Home },
  { to: '/bookmarks', label: 'Places', icon: Bookmark },
]

function navClass(isActive: boolean, mobile: boolean): string {
  if (mobile) {
    return cn(
      'flex flex-1 flex-col items-center justify-center gap-1 rounded-xl py-2 text-[11px] font-black transition-all select-none',
      isActive
        ? 'text-primary'
        : 'text-muted hover:text-ink',
    )
  }
  return cn(
    'flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-extrabold transition-all select-none',
    isActive
      ? 'bg-primary text-on-primary shadow-glow'
      : 'text-muted hover:bg-surface-2 hover:text-ink',
  )
}

/** Mobile: top brand bar + bottom tab bar. Desktop (md+): left sidebar. */
export function Layout({ children }: { children: ReactNode }) {
  const { setSettingsOpen, profile } = useApp()

  return (
    <div className="min-h-dvh md:flex bg-bg">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col justify-between border-r border-line/60 bg-surface/80 px-4 py-6 backdrop-blur-md md:flex">
        <div className="space-y-8">
          <div className="px-2">
            <Wordmark />
          </div>
          <nav className="flex flex-col gap-1.5">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => navClass(isActive, false)}>
                <Icon size={18} />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>

        <button
          onClick={() => setSettingsOpen(true)}
          className="flex items-center gap-3 rounded-2xl border border-line/40 bg-surface-2/60 px-3.5 py-3 text-sm font-extrabold text-ink transition-all hover:bg-surface-2 hover:border-primary/40"
        >
          {profile?.display_name ? (
            <Avatar name={profile.display_name} size="sm" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-primary">
              <Settings size={16} />
            </div>
          )}
          <span className="flex-1 truncate text-left">{profile?.display_name || 'Settings'}</span>
          <Settings size={16} className="text-muted" />
        </button>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line/60 bg-surface/85 px-4 py-3 backdrop-blur-xl md:hidden">
        <NavLink to="/" className="flex items-center gap-2">
          <OwlLogo size={32} />
          <span className="text-lg font-black tracking-tight text-ink">
            Hang<span className="text-primary">Owl</span>
          </span>
        </NavLink>
        <button
          onClick={() => setSettingsOpen(true)}
          className="flex items-center gap-2 rounded-full p-1.5 transition hover:bg-surface-2"
          aria-label="Settings"
        >
          {profile?.display_name ? (
            <Avatar name={profile.display_name} size="sm" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-muted">
              <Settings size={18} />
            </div>
          )}
        </button>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto w-full max-w-4xl flex-1 px-3.5 pb-28 pt-4 sm:px-6 md:px-8 md:pb-12 md:pt-8">
        {children}
      </main>

      {/* Mobile bottom nav dock */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line/60 bg-surface/90 px-3 pb-safe pt-1.5 backdrop-blur-xl md:hidden">
        <div className="mx-auto flex max-w-md items-center justify-around">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => navClass(isActive, true)}>
              {({ isActive }) => (
                <>
                  <div className={cn('relative flex h-8 w-8 items-center justify-center rounded-xl transition-all', isActive && 'bg-primary-soft text-primary shadow-sm')}>
                    <Icon size={18} />
                  </div>
                  <span>{label}</span>
                  {isActive && <div className="h-1 w-3 rounded-full bg-primary" />}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
