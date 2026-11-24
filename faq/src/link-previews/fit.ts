import { useEffect, useState } from 'react'
import type { System } from './shared'

// Title fitting, in the browser with the real font. Steps the size down 1px
// from titleSize.max until the title fits the box in at most maxLines, then
// prefers fewer lines within 10% below that size. Never adds tracking.

export type Fit = { size: number; lines: number; overflow: boolean }
type Box = { width: number; height: number }

const cache = new Map<string, Fit>()
let probe: HTMLDivElement | null = null

/** Font families as CSS: each named family quoted, generic keywords bare. */
export function familyCss(family: string): string {
  const generic = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-[a-z-]+|emoji|math|fangsong)$/
  return family
    .split(',')
    .map((f) => f.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean)
    .map((f) => (generic.test(f) ? f : `"${f}"`))
    .join(', ')
}

function getProbe() {
  if (probe) return probe
  probe = document.createElement('div')
  probe.setAttribute('aria-hidden', 'true')
  Object.assign(probe.style, {
    position: 'fixed',
    left: '-20000px',
    top: '0',
    visibility: 'hidden',
    pointerEvents: 'none',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'normal',
    wordBreak: 'normal',
    letterSpacing: 'normal',
    fontOpticalSizing: 'auto',
    margin: '0',
    padding: '0',
    border: '0',
    boxSizing: 'border-box',
  })
  document.body.appendChild(probe)
  return probe
}

export function fitTitle(text: string, system: System, box: Box): Fit {
  const family = familyCss(system.font.family)
  const weight = system.font.titleWeight
  const key = [family, weight, box.width, box.height, text].join('|')
  const hit = cache.get(key)
  if (hit) return hit

  const el = getProbe()
  el.style.fontFamily = family
  el.style.fontWeight = String(weight)
  el.style.lineHeight = String(system.lineHeight)
  el.style.width = `${box.width}px`
  // A trailing line break needs a character after it to take up a line.
  el.textContent = text.endsWith('\n') ? `${text}​` : text || '​'

  const { min, max } = system.titleSize
  const measure = (size: number) => {
    el.style.fontSize = `${size}px`
    const height = el.getBoundingClientRect().height
    const lines = Math.max(1, Math.round(height / (size * system.lineHeight)))
    const fits = !(el.scrollWidth > el.clientWidth + 0.5) && lines <= system.maxLines && height <= box.height + 0.5
    return { fits, lines }
  }

  let result: Fit | null = null
  for (let size = max; size >= min; size--) {
    const m = measure(size)
    if (m.fits) {
      result = { size, lines: m.lines, overflow: false }
      break
    }
  }
  if (result) {
    const floor = Math.max(min, Math.ceil(0.9 * result.size))
    for (let size = result.size - 1; size >= floor; size--) {
      const m = measure(size)
      if (m.fits && m.lines < result.lines) {
        result = { size, lines: m.lines, overflow: false }
        break
      }
    }
  } else {
    result = { size: min, lines: measure(min).lines, overflow: true }
  }
  cache.set(key, result)
  return result
}

/** True once the title and label weights are loaded; clears the fit cache then. */
export function useFontsReady(system: System): boolean {
  const [ready, setReady] = useState(false)
  const family = familyCss(system.font.family)
  const { titleWeight, labelWeight } = system.font
  useEffect(() => {
    let alive = true
    Promise.all([
      document.fonts.load(`${titleWeight} 150px ${family}`),
      document.fonts.load(`${labelWeight} 24px ${family}`),
    ])
      .catch(() => undefined)
      .then(() => document.fonts.ready)
      .then(() => {
        cache.clear()
        if (alive) setReady(true)
      })
    return () => {
      alive = false
    }
  }, [family, titleWeight, labelWeight])
  return ready
}
