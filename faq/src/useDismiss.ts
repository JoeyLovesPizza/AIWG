import { useEffect, useLayoutEffect, useState, type RefObject } from 'react'

// Closes a small popover on Escape or a pointer press outside `ref`, and
// returns focus to the trigger on Escape so keyboard users aren't stranded.
export function useDismiss(
  open: boolean,
  ref: RefObject<HTMLElement | null>,
  trigger: RefObject<HTMLElement | null>,
  close: () => void,
) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        close()
        trigger.current?.focus()
      }
    }
    function onDown(e: PointerEvent) {
      const t = e.target as Node
      if (!ref.current?.contains(t) && !trigger.current?.contains(t)) close()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open, ref, trigger, close])
}

// Picks which side of its trigger a popover opens on: below by default,
// above when the space below the trigger can't fit it but the space above
// can. Measured each time it opens, so scrolling between opens is handled.
export function usePopoverSide(
  open: boolean,
  panel: RefObject<HTMLElement | null>,
  trigger: RefObject<HTMLElement | null>,
  gap = 10,
  margin = 16,
): 'bottom' | 'top' {
  const [side, setSide] = useState<'bottom' | 'top'>('bottom')
  useLayoutEffect(() => {
    if (!open || !panel.current || !trigger.current) return
    const t = trigger.current.getBoundingClientRect()
    const h = panel.current.offsetHeight
    const below = window.innerHeight - t.bottom - gap - margin
    const above = t.top - gap - margin
    setSide(h > below && above > below ? 'top' : 'bottom')
  }, [open, panel, trigger, gap, margin])
  return side
}
