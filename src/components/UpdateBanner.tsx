import { RefreshCw } from 'lucide-react'
import { useUpdateAvailable } from '../lib/version'

/** Floating prompt shown when a newer build has been deployed. */
export function UpdateBanner() {
  const available = useUpdateAvailable()
  if (!available) return null
  return (
    <div className="fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 md:bottom-6">
      <div className="flex items-center gap-3 rounded-full bg-primary py-2 pl-4 pr-2 text-on-primary shadow-pop">
        <RefreshCw size={16} />
        <span className="text-sm font-bold">A new version is available</span>
        <button
          onClick={() => window.location.reload()}
          className="rounded-full bg-white/20 px-3.5 py-1.5 text-sm font-extrabold transition hover:bg-white/30"
        >
          Reload
        </button>
      </div>
    </div>
  )
}
