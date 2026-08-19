import { useEffect, useRef } from 'react'

/**
 * Adds an elastic physics rubber-band spring bounce when scrolling past
 * the top or bottom of the viewport on touch and wheel/trackpad.
 */
export function useElasticScroll<T extends HTMLElement = HTMLElement>() {
  const containerRef = useRef<T | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    let touchStartY = 0
    let isPulling = false
    let currentOffset = 0
    let wheelTimeout: number | undefined

    function getDampedOffset(pull: number): number {
      const maxPull = 90
      const sign = Math.sign(pull)
      const abs = Math.abs(pull)
      // Damped logarithmic curve
      const damped = Math.pow(abs, 0.72) * 1.5
      return sign * Math.min(maxPull, damped)
    }

    function applyTransform(offset: number, animate = false) {
      if (!el) return
      currentOffset = offset
      if (animate) {
        el.style.transition = 'transform 0.45s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
      } else {
        el.style.transition = 'none'
      }
      el.style.transform = offset === 0 ? '' : `translate3d(0, ${offset}px, 0)`
    }

    function isModalActive(): boolean {
      return !!(
        document.body.style.overflow === 'hidden' ||
        document.querySelectorAll('[role="dialog"]').length > 0
      )
    }

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1 || isModalActive()) return
      touchStartY = e.touches[0].clientY
      isPulling = false
    }

    function onTouchMove(e: TouchEvent) {
      if (e.touches.length !== 1 || isModalActive()) {
        if (isPulling) {
          applyTransform(0, true)
          isPulling = false
        }
        return
      }
      const touchY = e.touches[0].clientY
      const deltaY = touchY - touchStartY

      const isAtTop = window.scrollY <= 1
      const isAtBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2

      if ((isAtTop && deltaY > 0) || (isAtBottom && deltaY < 0)) {
        isPulling = true
        const offset = getDampedOffset(deltaY)
        applyTransform(offset, false)
      } else if (isPulling) {
        applyTransform(0, false)
        isPulling = false
      }
    }

    function onTouchEnd() {
      if (isPulling || currentOffset !== 0) {
        applyTransform(0, true)
        isPulling = false
      }
    }

    function onWheel(e: WheelEvent) {
      if (isModalActive()) return
      const isAtTop = window.scrollY <= 1 && e.deltaY < 0
      const isAtBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2 && e.deltaY > 0

      if (isAtTop || isAtBottom) {
        const pull = -e.deltaY * 0.35
        const offset = getDampedOffset(currentOffset + pull)
        applyTransform(offset, false)

        window.clearTimeout(wheelTimeout)
        wheelTimeout = window.setTimeout(() => {
          applyTransform(0, true)
        }, 100)
      }
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    window.addEventListener('touchcancel', onTouchEnd, { passive: true })
    window.addEventListener('wheel', onWheel, { passive: true })

    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchEnd)
      window.removeEventListener('wheel', onWheel)
      window.clearTimeout(wheelTimeout)
    }
  }, [])

  return containerRef
}
