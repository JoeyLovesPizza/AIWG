import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { Frame, titleBoxFor } from './templates'
import { familyCss, fitTitle } from './fit'
import { pngSize, type Entry, type System, type TemplateName } from './shared'

// Captures a page's frame to a 2400×1260 PNG in the browser, with no library:
// render a clean frame offscreen, inline its images and font, wrap it in an
// SVG foreignObject, and draw that onto a 2× canvas.

export class CaptureError extends Error {}

const fontCache = new Map<string, string>()

async function toDataUrl(url: string): Promise<string> {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(String(res.status))
  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

const FORMAT_BY_EXT: Record<string, string> = { woff2: 'woff2', woff: 'woff', ttf: 'truetype', otf: 'opentype' }

async function inlineFont(family: string): Promise<string> {
  const names = family
    .split(',')
    .map((f) => f.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean)
  const key = names.join('|')
  const hit = fontCache.get(key)
  if (hit !== undefined) return hit

  let found = false
  const css: string[] = []
  try {
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList
      try {
        rules = sheet.cssRules
      } catch {
        continue
      }
      for (const rule of Array.from(rules)) {
        if (!(rule instanceof CSSFontFaceRule)) continue
        const fam = rule.style.getPropertyValue('font-family').trim().replace(/^["']|["']$/g, '')
        if (!names.includes(fam)) continue
        found = true
        const style = rule.style.getPropertyValue('font-style').trim() || 'normal'
        if (style !== 'normal') continue
        const src = rule.style.getPropertyValue('src')
        for (const part of src.split(/,(?![^(]*\))/)) {
          const url = /url\(\s*["']?([^"')]+)["']?\s*\)/.exec(part)?.[1]
          if (!url) continue
          const declared = /format\(\s*["']?([a-z0-9-]+)["']?\s*\)/i.exec(part)?.[1]?.replace(/-variations$/, '')
          const ext = /\.([a-z0-9]+)(?:[?#]|$)/i.exec(url)?.[1]?.toLowerCase() ?? ''
          const format = declared ?? FORMAT_BY_EXT[ext]
          if (!format || !['woff2', 'woff', 'truetype', 'opentype'].includes(format)) continue
          const abs = new URL(url, sheet.href ?? document.baseURI).href
          const data = await toDataUrl(abs)
          const weight = rule.style.getPropertyValue('font-weight').trim() || '400'
          css.push(`@font-face{font-family:"${fam}";src:url(${data}) format("${format}");font-weight:${weight};font-style:normal;}`)
          break
        }
      }
    }
  } catch (err) {
    fontCache.delete(key)
    throw err
  }
  if (found && css.length === 0) throw new CaptureError(`Could not find the ${names[0]} font on this page.`)
  const out = css.join('')
  fontCache.set(key, out)
  return out
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(null)))

export async function capture(entry: Entry, system: System, template: TemplateName): Promise<string> {
  // 1. Refuse early when the title can't fit.
  const box = titleBoxFor(entry, system, template)
  if (box) {
    await document.fonts.ready
    if (fitTitle(entry.title, system, box).overflow) {
      throw new CaptureError('The title doesn’t fit, even at 40px. Shorten it or break it differently, then save.')
    }
  }

  // 2. A clean frame, offscreen.
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.inert = true
  Object.assign(host.style, {
    position: 'fixed',
    left: '-20000px',
    top: '0',
    width: '1200px',
    height: '630px',
    pointerEvents: 'none',
  })
  document.body.appendChild(host)
  const root = createRoot(host)
  try {
    flushSync(() => root.render(createElement(Frame, { entry, system, template, ready: true })))
    const frame = host.firstElementChild as HTMLElement | null
    if (!frame) throw new CaptureError('The frame could not be drawn.')

    // 3. Wait for images.
    const imgs = Array.from(frame.querySelectorAll('img'))
    for (const img of imgs) {
      try {
        await img.decode()
      } catch {
        throw new CaptureError(`Could not load ${img.getAttribute('src')}.`)
      }
    }

    // 4. Inline images on a clone.
    const clone = frame.cloneNode(true) as HTMLElement
    const cloned = Array.from(clone.querySelectorAll('img'))
    await Promise.all(
      cloned.map(async (img, i) => {
        const original = imgs[i]
        img.setAttribute('src', await toDataUrl(original.currentSrc || original.src))
      }),
    )

    // 5. Inline the font, 6. wrap in SVG.
    const fontCss = await inlineFont(familyCss(system.font.family))
    const xhtml = new XMLSerializer().serializeToString(clone)
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1260" viewBox="0 0 1200 630">` +
      `<foreignObject x="0" y="0" width="1200" height="630">` +
      `<div xmlns="http://www.w3.org/1999/xhtml" style="width:1200px;height:630px;margin:0;padding:0;overflow:hidden">` +
      `<style>${fontCss}</style>${xhtml}</div></foreignObject></svg>`

    // 7. Draw at 2×, twice (Safari paints foreignObject fonts late).
    const image = new Image()
    image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = 2400
    canvas.height = 1260
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new CaptureError('This browser can’t draw the image.')
    ctx.drawImage(image, 0, 0, 2400, 1260)
    await nextFrame()
    ctx.clearRect(0, 0, 2400, 1260)
    ctx.drawImage(image, 0, 0, 2400, 1260)

    // 8. Export and check the size.
    const png = canvas.toDataURL('image/png')
    const bytes = Uint8Array.from(atob(png.slice(png.indexOf(',') + 1, png.indexOf(',') + 1 + 44)), (c) => c.charCodeAt(0))
    const size = pngSize(bytes)
    if (!size || size.width !== 2400 || size.height !== 1260) {
      throw new CaptureError(`The capture came out ${size?.width ?? 0}×${size?.height ?? 0}, not 2400×1260.`)
    }
    return png
  } finally {
    root.unmount()
    host.remove()
  }
}
