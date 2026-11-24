// Link Previews: everything the tool and the dev server's save endpoint must
// agree on. No DOM and no framework code, so Node (the Vite plugin) and the
// browser (the tool) import the same file.

export const TEMPLATE_NAMES = ['plate', 'poster', 'inset'] as const
export type TemplateName = (typeof TEMPLATE_NAMES)[number]
export type Uses = { theme: boolean; image: boolean; color: boolean }

/** Which controls each template shows, and whether the site color counts toward staleness. */
export const TEMPLATE_USES: Record<TemplateName, Uses> = {
  plate: { theme: true, image: true, color: false },
  poster: { theme: false, image: false, color: true },
  inset: { theme: true, image: true, color: false },
}
export const TEMPLATE_LABELS: Record<TemplateName, string> = { plate: 'Plate', poster: 'Poster', inset: 'Inset' }
export const DEFAULT_TEMPLATE: TemplateName = 'plate'

export function templateName(name: unknown): TemplateName {
  return (TEMPLATE_NAMES as readonly unknown[]).includes(name) ? (name as TemplateName) : DEFAULT_TEMPLATE
}

export type Focus = { x: number; y: number }
export type Single = { src: string; focus: Focus; zoom?: number }
export type Sheet = { sheet: string[]; columns: number }
export type Image = Single | Sheet | null
export type Layout = 'type-only' | 'type-and-image' | 'image-only'
export type Theme = 'light' | 'dark'
export type Video = { src: string; type: 'video/mp4'; width: number; height: number; version?: string }

export type Entry = {
  id: string
  path: string
  title: string
  group: string
  theme: Theme
  image: Image
  alt?: string
  layout?: Layout
  version: string | null
  savedHash: string | null
  video?: Video
}

export type Palette = { background: string; ink: string; label: string }
export type System = {
  template: string
  color?: string
  domain: string
  font: { family: string; titleWeight: number; labelWeight: number }
  colors: { light: Palette; dark: Palette; panel: string }
  margin: number
  textBottom?: number
  panelGap: number
  panelWidth: number
  labelSize: number
  labelLineHeight: number
  labelGap: number
  lineHeight: number
  titleSize: { min: number; max: number }
  maxLines: number
}
export type Manifest = { system: System; entries: Entry[] }

export const isSheet = (image: Image): image is Sheet => !!image && 'sheet' in image
export const isSingle = (image: Image): image is Single => !!image && 'src' in image

/** A page with no image is Type only whatever it says; otherwise its layout, defaulting to Type and image. */
export function layoutOf(entry: Pick<Entry, 'image' | 'layout'>): Layout {
  if (!entry.image) return 'type-only'
  return entry.layout ?? 'type-and-image'
}

/** JSON with object keys sorted and undefined values dropped, so key order never matters. */
export function canonical(value: unknown): string {
  if (value === undefined) return 'null'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? 'null' : canonical(v))).join(',')}]`
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(',')}}`
}

/** 32-bit FNV-1a over UTF-16 code units, as 8 hex digits. */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/** The entry in the one normalized form both sides hash: no zoom of 1, lowercase color, no undefined keys. */
export function normalizeImage(image: Image): Image {
  if (!image) return null
  if (isSheet(image)) return { sheet: [...image.sheet], columns: image.columns }
  const out: Single = { src: image.src, focus: { x: image.focus.x, y: image.focus.y } }
  if (image.zoom !== undefined && image.zoom !== 1) out.zoom = image.zoom
  return out
}

/** The `system` block as it's being saved: this template, and the color only when it uses color. */
export function systemFor(system: System, template: TemplateName, color: string | undefined): System {
  const out: System = { ...system, template }
  if (TEMPLATE_USES[template].color && color) out.color = color.toLowerCase()
  else delete out.color
  return out
}

/** What a saved image was drawn from, so the tool can tell when it's stale. */
export function definitionHash(entry: Entry, system: System, template: TemplateName, color: string | undefined): string {
  const layout = layoutOf(entry)
  const image = normalizeImage(entry.image)
  const drawn: Record<string, unknown> =
    layout === 'image-only'
      ? { title: entry.title, layout, image }
      : {
          title: entry.title,
          theme: entry.theme,
          layout,
          image: layout === 'type-only' ? null : image,
          system: systemFor(system, template, color),
        }
  if (entry.alt !== undefined) drawn.alt = entry.alt
  return fnv1a(canonical(drawn))
}

/** Width and height from a PNG's IHDR chunk, or null if it isn't a PNG. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (bytes.length < 24 || sig.some((b, i) => bytes[i] !== b)) return null
  if (String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]) !== 'IHDR') return null
  const read = (o: number) => ((bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]) >>> 0
  return { width: read(16), height: read(20) }
}

/** At most 2400×1260 and within 1% of the frame's 1200:630 shape. */
export function fitsFrame(width: number, height: number): boolean {
  if (width > 2400 || height > 1260 || !width || !height) return false
  return Math.abs(width / height / (1200 / 630) - 1) <= 0.01
}

export type SaveMethod = 'capture' | 'source-bytes' | 'source-redraw'

/** How a page's PNG is made: captured from the frame, or the source itself for an untouched Image only page. */
export function saveMethod(o: {
  width: number
  height: number
  zoom?: number
  sheet: boolean
  layout: Layout
  png: boolean
}): SaveMethod {
  if (o.layout !== 'image-only' || o.sheet || (o.zoom !== undefined && o.zoom !== 1)) return 'capture'
  if (!fitsFrame(o.width, o.height)) return 'capture'
  return o.png ? 'source-bytes' : 'source-redraw'
}

export const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const PATH_RE = /^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/
export const SOURCE_FILE_RE = /^[a-z0-9-]+\.(png|jpe?g|webp)$/
