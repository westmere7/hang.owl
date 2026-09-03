import { ChevronLeft, ChevronRight, ExternalLink, Receipt, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { billUrl } from '../../lib/supabase'
import { Spinner, cn } from '../ui'

interface BillViewerModalProps {
  open: boolean
  onClose: () => void
  billPaths: string[]
  initialIndex?: number
  title?: string
}

export function BillViewerModal({
  open,
  onClose,
  billPaths,
  initialIndex = 0,
  title = 'Bill Receipt',
}: BillViewerModalProps) {
  const [index, setIndex] = useState(initialIndex)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [zoom, setZoom] = useState(1)

  // Reset index and zoom when modal opens or initialIndex changes
  useEffect(() => {
    if (open) {
      setIndex(Math.min(Math.max(0, initialIndex), Math.max(0, billPaths.length - 1)))
      setZoom(1)
    }
  }, [open, initialIndex, billPaths.length])

  // Load signed URLs for all paths
  useEffect(() => {
    if (!open || billPaths.length === 0) return
    let active = true
    setLoading(true)

    void Promise.all(
      billPaths.map(async (path) => {
        const u = await billUrl(path)
        return [path, u] as const
      }),
    ).then((pairs) => {
      if (!active) return
      const map: Record<string, string> = {}
      for (const [path, u] of pairs) {
        if (u) map[path] = u
      }
      setUrls(map)
      setLoading(false)
    })

    return () => {
      active = false
    }
  }, [open, billPaths])

  // Keyboard navigation
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && index > 0) {
        setIndex((i) => i - 1)
        setZoom(1)
      } else if (e.key === 'ArrowRight' && index < billPaths.length - 1) {
        setIndex((i) => i + 1)
        setZoom(1)
      }
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose, index, billPaths.length])

  if (!open || billPaths.length === 0) return null

  const currentPath = billPaths[index]
  const currentUrl = currentPath ? urls[currentPath] : null
  const count = billPaths.length

  const zoomIn = () => setZoom((z) => Math.min(3, Math.round((z + 0.3) * 10) / 10))
  const zoomOut = () => setZoom((z) => Math.max(0.6, Math.round((z - 0.3) * 10) / 10))
  const resetZoom = () => setZoom(1)

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-black/85 backdrop-blur-md text-white select-none animate-in fade-in duration-200">
      {/* Top action bar */}
      <div className="flex h-14 sm:h-16 items-center justify-between border-b border-white/10 px-4 sm:px-6 shrink-0 bg-black/40">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-primary">
            <Receipt size={17} />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm sm:text-base font-black truncate">{title}</h3>
            {count > 1 && (
              <p className="text-[11px] font-semibold text-white/60">
                Receipt {index + 1} of {count}
              </p>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Zoom controls */}
          <div className="hidden sm:flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 mr-2 border border-white/10">
            <button
              type="button"
              onClick={zoomOut}
              disabled={zoom <= 0.6}
              className="p-1 rounded-full text-white/80 hover:text-white disabled:opacity-30 transition"
              title="Zoom out"
              aria-label="Zoom out"
            >
              <ZoomOut size={16} />
            </button>
            <span className="text-xs font-mono font-bold px-1 min-w-[3rem] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={zoomIn}
              disabled={zoom >= 3}
              className="p-1 rounded-full text-white/80 hover:text-white disabled:opacity-30 transition"
              title="Zoom in"
              aria-label="Zoom in"
            >
              <ZoomIn size={16} />
            </button>
            {zoom !== 1 && (
              <button
                type="button"
                onClick={resetZoom}
                className="p-1 rounded-full text-white/60 hover:text-white ml-1 border-l border-white/10 pl-1.5 transition"
                title="Reset zoom"
                aria-label="Reset zoom"
              >
                <RotateCcw size={13} />
              </button>
            )}
          </div>

          {currentUrl && (
            <a
              href={currentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 hover:text-white hover:bg-white/20 transition"
              title="Open full image in new tab"
              aria-label="Open original image in new tab"
            >
              <ExternalLink size={16} />
            </a>
          )}

          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 hover:text-white hover:bg-white/20 transition ml-1"
            title="Close"
            aria-label="Close bill preview"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Main image viewer stage */}
      <div className="relative flex-1 overflow-auto flex items-center justify-center p-2 sm:p-6 min-h-0">
        {loading ? (
          <div className="flex flex-col items-center gap-3 text-white/60">
            <Spinner className="h-8 w-8 text-primary" />
            <span className="text-xs font-semibold">Loading receipt...</span>
          </div>
        ) : !currentUrl ? (
          <div className="text-center p-6 text-white/60">
            <p className="font-semibold">Unable to load bill photo</p>
          </div>
        ) : (
          <div
            className="flex items-center justify-center transition-transform duration-150"
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: 'center center',
            }}
          >
            <img
              src={currentUrl}
              alt={`Bill receipt ${index + 1}`}
              className="max-h-[75vh] sm:max-h-[80vh] w-auto max-w-full rounded-xl object-contain shadow-2xl transition-all"
              onClick={() => (zoom === 1 ? zoomIn() : resetZoom())}
              title="Click to toggle zoom"
            />
          </div>
        )}

        {/* Previous button */}
        {count > 1 && (
          <button
            type="button"
            onClick={() => {
              setIndex((i) => Math.max(0, i - 1))
              setZoom(1)
            }}
            disabled={index === 0}
            className={cn(
              'absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md transition hover:bg-black/80 hover:scale-105 active:scale-95 border border-white/10',
              index === 0 && 'opacity-0 pointer-events-none',
            )}
            title="Previous receipt"
            aria-label="Previous receipt"
          >
            <ChevronLeft size={24} />
          </button>
        )}

        {/* Next button */}
        {count > 1 && (
          <button
            type="button"
            onClick={() => {
              setIndex((i) => Math.min(count - 1, i + 1))
              setZoom(1)
            }}
            disabled={index === count - 1}
            className={cn(
              'absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md transition hover:bg-black/80 hover:scale-105 active:scale-95 border border-white/10',
              index === count - 1 && 'opacity-0 pointer-events-none',
            )}
            title="Next receipt"
            aria-label="Next receipt"
          >
            <ChevronRight size={24} />
          </button>
        )}
      </div>

      {/* Bottom thumbnail strip (if multiple) */}
      {count > 1 && (
        <div className="h-18 sm:h-20 shrink-0 border-t border-white/10 bg-black/40 px-4 flex items-center justify-center gap-2.5 overflow-x-auto">
          {billPaths.map((path, i) => {
            const thumbUrl = urls[path]
            const active = i === index
            return (
              <button
                key={path}
                type="button"
                onClick={() => {
                  setIndex(i)
                  setZoom(1)
                }}
                className={cn(
                  'relative h-12 w-12 sm:h-14 sm:w-14 rounded-lg overflow-hidden border-2 transition shrink-0 bg-white/5',
                  active
                    ? 'border-primary shadow-glow scale-105'
                    : 'border-transparent opacity-60 hover:opacity-100',
                )}
                aria-label={`View receipt ${i + 1}`}
              >
                {thumbUrl ? (
                  <img src={thumbUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-xs font-bold text-white/50">
                    {i + 1}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>,
    document.body,
  )
}
