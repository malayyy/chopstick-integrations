/**
 * Post-hero section reveals. Content is semantic static HTML (no
 * JS-injected markup — SEO/LCP first); this only toggles a class.
 *
 * IntersectionObserver handles the natural scroll case. A rAF-throttled
 * sweep complements it so content SKIPPED by fast jumps (find-in-page,
 * deep hash restore, programmatic scrollTo) is revealed the moment it is
 * at-or-above the viewport instead of staying invisible forever.
 */
export function initReveal(): void {
  const elements = Array.from(document.querySelectorAll<HTMLElement>('.reveal'))
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const show = (el: HTMLElement): boolean => {
    if (el.classList.contains('is-visible')) return false
    el.classList.add('is-visible')
    return true
  }

  if (reduced) {
    elements.forEach(show)
    return
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          show(entry.target as HTMLElement)
          observer.unobserve(entry.target)
        }
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
  )

  // Sweep reveal for anything already above the viewport (skip-overs),
  // then keep re-sweeping on scroll until every element has settled.
  let ticking = false
  const sweep = (): void => {
    let remaining = 0
    for (const el of elements) {
      if (el.classList.contains('is-visible')) continue
      if (el.getBoundingClientRect().bottom < 0) {
        show(el)
      } else {
        remaining++
      }
    }
    if (remaining === 0) {
      window.removeEventListener('scroll', onScroll)
    }
  }
  const onScroll = (): void => {
    if (ticking) return
    ticking = true
    requestAnimationFrame(() => {
      ticking = false
      sweep()
    })
  }

  const attach = (): void => {
    window.addEventListener('scroll', onScroll, { passive: true })
  }
  const observe = observer.observe.bind(observer)

  for (const el of elements) {
    if (el.classList.contains('is-visible')) continue
    if (el.getBoundingClientRect().bottom < 0) {
      show(el) // mid-page restore: content above the viewport shows instantly
    } else {
      observe(el)
    }
  }
  attach()
  sweep()
}
