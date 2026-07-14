import { OwlLogo } from '../components/OwlLogo'

export function NotConfigured() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg p-6">
      <div className="w-full max-w-lg rounded-xl3 bg-surface p-8 shadow-pop">
        <div className="flex items-center gap-3">
          <OwlLogo size={48} />
          <h1 className="text-2xl font-black text-ink">
            Hang<span className="text-primary">Owl</span>
          </h1>
        </div>
        <h2 className="mt-6 text-lg font-extrabold text-ink">Almost there — connect Supabase</h2>
        <p className="mt-2 text-sm text-muted">
          The app needs your Supabase project credentials. Copy{' '}
          <code className="rounded bg-surface-2 px-1.5 py-0.5 font-bold text-primary">.env.example</code> to{' '}
          <code className="rounded bg-surface-2 px-1.5 py-0.5 font-bold text-primary">.env</code> and fill in:
        </p>
        <pre className="mt-4 overflow-x-auto rounded-2xl bg-surface-2 p-4 text-xs font-bold text-ink">
{`VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon public key>`}
        </pre>
        <p className="mt-4 text-sm text-muted">
          Full setup steps (schema, storage, edge function, keep-alive cron) are in the README.
        </p>
      </div>
    </div>
  )
}
