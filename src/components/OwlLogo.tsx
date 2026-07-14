import { cn } from './ui'

/** The HangOwl mascot. `onDark` renders the face in white-on-purple. */
export function OwlLogo({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={cn('shrink-0', className)}
      aria-hidden
    >
      <rect width="64" height="64" rx="16" fill="var(--primary)" />
      <path
        d="M14 24c0-4 3-9 6-11 1 2 3 3 5 3h14c2 0 4-1 5-3 3 2 6 7 6 11v14c0 10-8 16-18 16S14 48 14 38V24z"
        fill="#ffffff"
      />
      <circle cx="24.5" cy="30" r="7.5" fill="#efeafe" />
      <circle cx="39.5" cy="30" r="7.5" fill="#efeafe" />
      <circle cx="24.5" cy="30" r="3.4" fill="#2a2153" />
      <circle cx="39.5" cy="30" r="3.4" fill="#2a2153" />
      <path
        d="M32 34l-3.6 5.2c-.5.8 0 1.8 1 1.8h5.2c1 0 1.5-1 1-1.8L32 34z"
        fill="var(--accent)"
      />
      <path
        d="M22 51c2 1.6 6 2.6 10 2.6s8-1 10-2.6"
        stroke="var(--primary)"
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}

export function Wordmark({ size = 36 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2.5">
      <OwlLogo size={size} />
      <span className="text-xl font-black tracking-tight text-ink">
        Hang<span className="text-primary">Owl</span>
      </span>
    </span>
  )
}
