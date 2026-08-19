import { Minus, Plus, X } from 'lucide-react'
import {
  useEffect,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

/* ---------------- Button ---------------- */

export type ButtonVariant = 'primary' | 'accent' | 'soft' | 'outline' | 'ghost' | 'danger' | 'success'

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-r from-primary to-primary-deep text-white shadow-glow hover:brightness-110 active:scale-[0.98]',
  accent:
    'bg-gradient-to-r from-accent to-accent-deep text-white shadow-glow-accent hover:brightness-110 active:scale-[0.98]',
  soft: 'bg-primary-soft text-primary dark:text-[#a29bfe] hover:bg-primary/20 dark:hover:bg-primary/30 active:scale-[0.98]',
  outline: 'border border-line bg-surface text-ink hover:bg-surface-2 hover:border-primary/40 active:scale-[0.98]',
  ghost: 'text-muted hover:bg-surface-2 hover:text-ink active:scale-[0.98]',
  danger: 'bg-danger-soft text-danger hover:bg-danger hover:text-white active:scale-[0.98]',
  success: 'bg-success-soft text-success hover:bg-success hover:text-black active:scale-[0.98]',
}

export function Button({
  variant = 'primary',
  size = 'md',
  full,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: 'sm' | 'md' | 'lg' | 'icon'
  full?: boolean
}) {
  const sizes = {
    sm: 'px-3.5 py-1.5 text-xs min-h-[36px]',
    md: 'px-5 py-2.5 text-sm min-h-[44px]',
    lg: 'px-6 py-3.5 text-base min-h-[50px]',
    icon: 'p-2.5 min-h-[40px] min-w-[40px] flex items-center justify-center',
  }
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full font-extrabold transition-all select-none',
        'disabled:pointer-events-none disabled:opacity-40',
        buttonVariants[variant],
        sizes[size],
        full && 'w-full',
        className,
      )}
      {...props}
    />
  )
}

/* ---------------- Form fields ---------------- */

const fieldBase =
  'w-full rounded-2xl border border-line bg-surface-2/80 px-4 py-2.5 text-sm text-ink placeholder:text-muted outline-none transition focus:border-primary focus:bg-surface focus:ring-2 focus:ring-primary/25'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldBase, className)} {...props} />
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldBase, 'min-h-24 resize-y', className)} {...props} />
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(fieldBase, 'appearance-none cursor-pointer', className)} {...props}>
      {children}
    </select>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs font-semibold text-muted">{hint}</span>}
    </label>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-2xl p-2 text-left transition hover:bg-surface-2/60"
    >
      <span>
        <span className="block text-sm font-extrabold text-ink">{label}</span>
        {description && <span className="block text-xs font-semibold text-muted">{description}</span>}
      </span>
      <span
        className={cn(
          'relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ease-in-out',
          checked ? 'bg-success shadow-glow-success' : 'bg-surface-2 border border-line',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-md transition-transform duration-200 ease-in-out',
            checked ? 'translate-x-5.5' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  )
}

/* ---------------- Chips & tabs ---------------- */

export function Chip({
  active,
  onClick,
  children,
  className,
}: {
  active?: boolean
  onClick?: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-xs sm:text-sm font-extrabold transition-all select-none active:scale-[0.96]',
        active
          ? 'bg-primary text-on-primary shadow-glow'
          : 'bg-surface-2 text-muted hover:text-ink hover:bg-surface-2/80 border border-line/60',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 99,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n))
  return (
    <div className="flex items-center justify-between rounded-2xl border border-line bg-surface-2/80 px-2 py-1.5">
      <button
        type="button"
        onClick={() => onChange(clamp(value - 1))}
        disabled={value <= min}
        className="flex h-9 w-9 items-center justify-center rounded-xl text-primary transition hover:bg-primary-soft disabled:opacity-30"
        aria-label="Decrease"
      >
        <Minus size={16} />
      </button>
      <span className="min-w-8 text-center text-base font-black tabular-nums text-ink">{value}</span>
      <button
        type="button"
        onClick={() => onChange(clamp(value + 1))}
        disabled={value >= max}
        className="flex h-9 w-9 items-center justify-center rounded-xl text-primary transition hover:bg-primary-soft disabled:opacity-30"
        aria-label="Increase"
      >
        <Plus size={16} />
      </button>
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode }[]
}) {
  return (
    <div className="flex rounded-2xl bg-surface-2/90 p-1 border border-line/50">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'flex-1 rounded-xl py-2 px-3 text-xs sm:text-sm font-extrabold transition-all duration-150',
            value === o.value
              ? 'bg-surface text-primary shadow-sm border border-line/40'
              : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ---------------- Badges ---------------- */

export function Badge({
  children,
  variant = 'muted',
  className,
}: {
  children: ReactNode
  variant?: 'primary' | 'accent' | 'success' | 'danger' | 'warning' | 'muted'
  className?: string
}) {
  const styles = {
    primary: 'bg-primary-soft text-primary dark:text-[#a29bfe]',
    accent: 'bg-accent-soft text-accent dark:text-[#ff7597]',
    success: 'bg-success-soft text-success dark:text-[#00e5a3]',
    danger: 'bg-danger-soft text-danger dark:text-[#ff6b7d]',
    warning: 'bg-warning-soft text-warning dark:text-[#ffbe3d]',
    muted: 'bg-surface-2 text-muted',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider',
        styles[variant],
        className,
      )}
    >
      {children}
    </span>
  )
}

/* ---------------- Cards / misc ---------------- */

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('rounded-2xl sm:rounded-3xl border border-line/60 bg-surface shadow-card', className)}>
      {children}
    </div>
  )
}

const avatarGradients = [
  'from-[#6c5ce7] to-[#a29bfe] text-white',
  'from-[#ff5376] to-[#ffa502] text-white',
  'from-[#00e5a3] to-[#00b894] text-black',
  'from-[#0984e3] to-[#74b9ff] text-white',
  'from-[#e84393] to-[#fd79a8] text-white',
]

export function Avatar({
  name,
  size = 'md',
  className,
}: {
  name: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || '?'
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  const color = avatarGradients[Math.abs(hash) % avatarGradients.length]
  const sizes = {
    sm: 'h-8 w-8 text-[11px]',
    md: 'h-10 w-10 text-xs',
    lg: 'h-13 w-13 text-sm',
  }
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-black bg-gradient-to-br shadow-sm ring-2 ring-surface ring-offset-1 ring-offset-border/40',
        color,
        sizes[size],
        className,
      )}
      title={name}
    >
      {initials}
    </span>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-block h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent',
        className,
      )}
    />
  )
}

export function PageLoader() {
  return (
    <div className="flex h-44 items-center justify-center">
      <Spinner className="h-8 w-8" />
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: ReactNode
  title: string
  text?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3.5 rounded-2xl sm:rounded-3xl border border-dashed border-line bg-surface/40 px-6 py-12 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-soft text-primary shadow-glow">
        {icon}
      </span>
      <p className="text-base sm:text-lg font-black text-ink">{title}</p>
      {text && <p className="max-w-sm text-xs sm:text-sm font-semibold text-muted">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

/* ---------------- Modal (smooth bottom sheet on mobile) ---------------- */

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md transition-opacity duration-200"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal
        className={cn(
          'relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[1.75rem] border-t border-line/60 bg-surface shadow-pop sm:rounded-3xl sm:border sm:border-line/60',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md',
        )}
      >
        {/* Mobile drag handle indicator */}
        <div className="flex justify-center pt-2.5 pb-1 sm:hidden">
          <div className="h-1.5 w-12 rounded-full bg-muted/30" />
        </div>

        <div className="flex items-center justify-between gap-4 px-5 pb-2 pt-3 sm:pt-5">
          <h2 className="text-lg font-black text-ink">{title}</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-muted transition hover:text-ink hover:bg-surface-2/80"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">{children}</div>
        {footer && <div className="border-t border-line/60 bg-surface-2/30 px-5 py-4 pb-safe">{footer}</div>}
      </div>
    </div>
  )
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p className="rounded-2xl border border-danger/30 bg-danger-soft px-4 py-3 text-xs sm:text-sm font-bold text-danger">
      {message}
    </p>
  )
}
