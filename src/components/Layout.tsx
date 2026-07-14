import { Bookmark, Home, Settings } from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { OwlLogo, Wordmark } from './OwlLogo'
import { cn } from './ui'

const navItems = [
  { to: '/', label: 'Hangouts', icon: Home },
  { to: '/bookmarks', label: 'Bookmarks', icon: Bookmark },
]

function navClass(isActive: boolean, mobile: boolean): string {
  if (mobile) {
    return cn(
      'flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2 text-[11px] font-bold transition-colors',
      isActive ? 'text-primary' : 'text-muted hover:text-ink',
    )
  }
  return cn(
    'flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-bold transition-colors',
    isActive ? 'bg-primary-soft text-primary' : 'text-muted hover:bg-surface-2 hover:text-ink',
  )
}

/** Mobile: top brand bar + bottom tab bar. Desktop (md+): left sidebar. */
export function Layout({ children }: { children: ReactNode }) {
  const { setSettingsOpen } = useApp()

  return (
    <div className="min-h-dvh md:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-8 border-r border-line bg-surface px-4 py-6 md:flex">
        <div className="px-2">
          <Wordmark />
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => navClass(isActive, false)}>
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={() => setSettingsOpen(true)}
          className="flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-bold text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <Settings size={18} />
          Settings
        </button>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface/85 px-4 py-3 backdrop-blur md:hidden">
        <NavLink to="/" className="flex items-center gap-2">
          <OwlLogo size={30} />
          <span className="text-lg font-black tracking-tight text-ink">
            Hang<span className="text-primary">Owl</span>
          </span>
        </NavLink>
        <button
          onClick={() => setSettingsOpen(true)}
          className="rounded-full p-2 text-muted transition hover:bg-surface-2 hover:text-ink"
          aria-label="Settings"
        >
          <Settings size={20} />
        </button>
      </header>

      {/* Content */}
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-28 pt-5 md:px-8 md:pb-12 md:pt-8">
        {children}
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 pb-safe pt-1 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-md">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => navClass(isActive, true)}>
              <Icon size={20} />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
