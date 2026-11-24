import { useEffect, type RefObject } from 'react'
import { footerExposure } from './reveal'

// As the footer is uncovered, the drawer narrows: its sides clip inward
// (keeping the rounded corners) and it can scale down slightly from its
// bottom edge, like a sheet receding. Progress comes from footerExposure();
// the scroll handler writes CSS variables straight onto the drawer, so
// scrolling never re-renders React. Values were tuned with Joe on a DialKit
// panel, since removed.
const PARAMS = {
  inset: 40, // px clipped from each side at full reveal
  scale: 0.96, // drawer scale at full reveal
  radius: 30, // bottom corner radius, px
  start: 0.07, // share of the footer uncovered when narrowing starts
  end: 1, // share uncovered when it's fully narrowed
  ease: [0.64, 0.33, 0.68, 0.63], // cubic-bezier for the narrowing across the reveal
}

// Evaluates a CSS-style cubic-bezier(x1, y1, x2, y2) at progress x, by
// solving for the curve parameter with Newton steps and a bisection fallback.
function cubicBezier([x1, y1, x2, y2]: number[], x: number) {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const coord = (t: number, a: number, b: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t ** 2 * (1 - t) + t ** 3
  const slope = (t: number, a: number, b: number) =>
    3 * a * (1 - t) ** 2 + 6 * (b - a) * t * (1 - t) + 3 * (1 - b) * t ** 2
  let t = x
  for (let i = 0; i < 8; i++) {
    const err = coord(t, x1, x2) - x
    if (Math.abs(err) < 1e-5) return coord(t, y1, y2)
    const d = slope(t, x1, x2)
    if (Math.abs(d) < 1e-6) break
    t -= err / d
  }
  let lo = 0
  let hi = 1
  t = x
  for (let i = 0; i < 30; i++) {
    const v = coord(t, x1, x2)
    if (Math.abs(v - x) < 1e-5) break
    if (v < x) lo = t
    else hi = t
    t = (lo + hi) / 2
  }
  return coord(t, y1, y2)
}

export function useDrawerReveal(drawer: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = drawer.current
    if (!el) return
    const still = matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0

    function apply() {
      frame = 0
      const { inset, scale, radius, start, end, ease } = PARAMS
      const span = Math.max(0.001, end - start)
      const linear = still.matches ? 0 : Math.min(1, Math.max(0, (footerExposure() - start) / span))
      const p = cubicBezier(ease, linear)
      const x = inset * p
      // No clip at all while the drawer is full width: a clip-path's
      // anti-aliased edges otherwise leave a hairline of the orange page
      // showing down the sides. The top edge extends 1px past the element for
      // the same reason; the bottom stays at 0 so the corners clip round.
      el!.style.setProperty(
        '--drawer-clip',
        x < 0.05 ? 'none' : `inset(-1px ${x.toFixed(2)}px 0 ${x.toFixed(2)}px round 0 0 ${radius}px ${radius}px)`,
      )
      el!.style.setProperty('--drawer-scale', `${1 - (1 - scale) * p}`)
      el!.style.setProperty('--drawer-radius', `${radius}px`)
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(apply)
    }

    apply()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [drawer])

}
