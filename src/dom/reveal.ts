import { useEffect, useRef } from 'react'

/**
 * A section after the film that rises in once, when it first enters the viewport: one
 * IntersectionObserver sets data-in, CSS runs the staggered entrance. The still sequence (and a
 * browser without the observer) shows it complete at once.
 */
export function useReveal<T extends HTMLElement>(mode: 'film' | 'stills') {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (mode === 'stills' || !('IntersectionObserver' in window)) {
      el.dataset.in = 'true'
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          el.dataset.in = 'true'
          io.disconnect()
        }
      },
      { rootMargin: '0px 0px -16% 0px', threshold: 0.1 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [mode])
  return ref
}
