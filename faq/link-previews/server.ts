// Link Previews: the dev server side, as Vite plugins.
//
// linkPreviewsDev (apply: 'serve') answers /link-previews/* only under
// `npm run dev`: the tool's state, the save, upload and video endpoints that
// write into the repo, and the source route. It never exists in a build.
//
// linkPreviewsMeta runs in dev and build, writing the Open Graph and Twitter
// tags for "/" into index.html from the manifest. The site is a single page
// with no server, and link crawlers don't run JavaScript, so the tags must be
// in the HTML itself.
import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { promises as fs, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {
  ID_RE,
  PATH_RE,
  SOURCE_FILE_RE,
  TEMPLATE_NAMES,
  TEMPLATE_USES,
  definitionHash,
  fitsFrame,
  isSheet,
  normalizeImage,
  pngSize,
  type Entry,
  type Image,
  type Layout,
  type Manifest,
  type TemplateName,
} from '../src/link-previews/shared'

type Options = {
  /** The faq project root. */
  root: string
  /** Absolute site URL with no trailing slash, e.g. https://example.com/sub */
  siteUrl: string
  siteName: string
  /** Description for "/" (pages pass their own; this site has one page). */
  description: string
}

const TOOL = '/link-previews'
const MANIFEST = 'og-images.json'
const SOURCES = 'og/sources'
const SERVED = 'public'
const REGISTRY = 'faq/src/link-previews/templates.tsx'
const MiB = 1024 * 1024

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

// ---------- Request helpers ----------

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

const LOCAL_HOST = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/
const LOCAL_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

function assertLocal(req: IncomingMessage, message = 'Local requests only.') {
  const host = req.headers.host ?? ''
  const fwdHost = req.headers['x-forwarded-host']
  const fwdFor = [req.headers['x-forwarded-for'], req.headers['x-real-ip']]
    .flat()
    .filter(Boolean)
    .flatMap((v) => String(v).split(','))
    .map((v) => v.trim())
  if (
    !LOCAL_HOST.test(host) ||
    req.headers.forwarded ||
    (fwdHost && fwdHost !== host) ||
    fwdFor.some((ip) => !LOCAL_IPS.has(ip))
  ) {
    throw new HttpError(403, message)
  }
}

/** The shared guard for every write endpoint. */
function assertWriter(req: IncomingMessage, contentTypes: string[]) {
  if (process.env.NODE_ENV === 'production') throw new HttpError(403, 'Development only.')
  if (req.method !== 'POST') throw new HttpError(403, 'POST only.')
  assertLocal(req)
  const host = req.headers.host ?? ''
  if (
    req.headers.origin !== `http://${host}` ||
    req.headers['sec-fetch-site'] !== 'same-origin' ||
    req.headers['x-link-previews'] !== '1'
  ) {
    throw new HttpError(403, 'Use the Link Previews tool.')
  }
  const type = (req.headers['content-type'] ?? '').split(';')[0].trim()
  if (!contentTypes.includes(type)) throw new HttpError(403, 'Send JSON.')
  return type
}

async function readBody(req: IncomingMessage, limit: number, tooLarge: string): Promise<Buffer> {
  const declared = Number(req.headers['content-length'])
  if (declared > limit) throw new HttpError(413, tooLarge)
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    total += (chunk as Buffer).length
    if (total > limit) throw new HttpError(413, tooLarge)
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks)
}

const sha12 = (buf: Buffer) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12)

async function writeAtomic(file: string, data: Buffer | string) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(tmp, data)
  await fs.rename(tmp, file)
}

// One manifest write at a time, across save and video.
let queue: Promise<unknown> = Promise.resolve()
function serially<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn)
  queue = next.catch(() => undefined)
  return next
}

// ---------- Dev plugin ----------

export function linkPreviewsDev(opts: Options): Plugin {
  const root = opts.root
  const manifestPath = path.join(root, MANIFEST)
  const sourcesDir = path.join(root, SOURCES)
  const servedOg = path.join(root, SERVED, 'og')

  const readManifest = async (): Promise<Manifest> => JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  const writeManifest = (m: Manifest) => writeAtomic(manifestPath, JSON.stringify(m, null, 2) + '\n')

  // Folders a source may come from: the sources folder, plus the folders of
  // images entries already used when the plugin started.
  const allowedFolders = new Set<string>([SOURCES])
  try {
    const m = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest
    for (const e of m.entries) for (const src of sourcesOf(e.image)) allowedFolders.add(path.posix.dirname(src))
  } catch {
    /* no manifest yet */
  }

  async function listSources() {
    const out: { src: string; label: string; folder: string }[] = []
    for (const folder of allowedFolders) {
      let files: string[] = []
      try {
        files = await fs.readdir(path.join(root, folder))
      } catch {
        continue
      }
      for (const f of files.sort()) {
        if (/^[A-Za-z0-9._-]+$/.test(f) && !f.startsWith('.') && /\.(png|jpe?g|webp)$/i.test(f)) {
          out.push({ src: `${folder}/${f}`, label: f, folder })
        }
      }
    }
    return out
  }

  async function fileSize(rel: string) {
    try {
      return (await fs.stat(path.join(root, rel))).size
    } catch {
      return null
    }
  }

  async function state() {
    const manifest = await readManifest()
    const exists: Record<string, boolean> = {}
    const sizes: Record<string, { image: number | null; video: number | null }> = {}
    for (const e of manifest.entries) {
      const image = await fileSize(`${SERVED}/og/${e.id}.png`)
      exists[e.id] = image !== null
      sizes[e.id] = { image, video: e.video ? await fileSize(e.video.src) : null }
    }
    return { manifest, exists, sizes, sources: await listSources(), registry: REGISTRY }
  }

  function checkSource(src: unknown) {
    const bad = new HttpError(400, 'Use an image from the picker.')
    if (typeof src !== 'string' || src.length > 300 || path.posix.normalize(src) !== src) throw bad
    const folder = path.posix.dirname(src)
    const name = path.posix.basename(src)
    if (!allowedFolders.has(folder)) throw bad
    if (!/^[A-Za-z0-9._-]+$/.test(name) || name.startsWith('.') || !/\.(png|jpe?g|webp)$/i.test(name)) throw bad
    if (!existsSync(path.join(root, src))) throw bad
    return src
  }

  function checkImage(image: unknown): Image {
    if (image === null) return null
    if (!image || typeof image !== 'object') throw new HttpError(400, 'Use an image from the picker.')
    const img = image as Record<string, unknown>
    if (Array.isArray(img.sheet)) {
      const cols = img.columns
      if (img.sheet.length < 1 || img.sheet.length > 12 || !Number.isInteger(cols) || (cols as number) < 1 || (cols as number) > 6) {
        throw new HttpError(400, 'A sheet needs 1 to 12 images in 1 to 6 columns.')
      }
      return { sheet: img.sheet.map(checkSource), columns: cols as number }
    }
    const focus = img.focus as Record<string, unknown> | undefined
    const inRange = (v: unknown) => typeof v === 'number' && v >= 0 && v <= 1
    if (!focus || !inRange(focus.x) || !inRange(focus.y)) throw new HttpError(400, 'The image focus must be between 0 and 1.')
    const zoom = img.zoom
    if (zoom !== undefined && (typeof zoom !== 'number' || zoom < 1 || zoom > 4)) throw new HttpError(400, 'Zoom must be 1 to 4.')
    return normalizeImage({ src: checkSource(img.src), focus: { x: focus.x as number, y: focus.y as number }, zoom: zoom as number | undefined })
  }

  async function save(req: IncomingMessage) {
    assertWriter(req, ['application/json'])
    const body = JSON.parse((await readBody(req, 10 * MiB, 'The image is too large to save.')).toString('utf8'))
    const e = body.entry ?? {}

    if (typeof e.id !== 'string' || e.id.length > 64 || !ID_RE.test(e.id)) throw new HttpError(400, 'Use an id such as notes, lowercase.')
    if (typeof e.path !== 'string' || e.path.length > 200 || !PATH_RE.test(e.path)) {
      throw new HttpError(400, 'Use a path such as /notes, lowercase, without a query or hash.')
    }
    if (typeof e.title !== 'string' || !e.title.trim() || e.title.length > 200) throw new HttpError(400, 'Add a title.')
    let alt: string | undefined
    if (e.alt !== undefined) {
      alt = typeof e.alt === 'string' ? e.alt.trim() : ''
      if (alt.length < 1 || alt.length > 420) throw new HttpError(400, 'The alt text must be 1 to 420 characters.')
    }
    if (typeof e.group !== 'string' || !e.group.trim() || e.group.trim().length > 40) throw new HttpError(400, 'Add a group of up to 40 characters.')
    if (e.theme !== 'light' && e.theme !== 'dark') throw new HttpError(400, 'Choose a theme: light or dark.')
    const image = checkImage(e.image)
    const layout: Layout = e.layout ?? (image ? 'type-and-image' : 'type-only')
    if (!['type-only', 'type-and-image', 'image-only'].includes(layout)) {
      throw new HttpError(400, 'Choose a layout: type-only, type-and-image, image-only.')
    }
    if (layout !== 'type-only' && !image) throw new HttpError(400, 'Choose an image for this layout.')
    if (!(TEMPLATE_NAMES as readonly string[]).includes(body.template)) {
      throw new HttpError(400, `Choose a template: ${TEMPLATE_NAMES.join(', ')}.`)
    }
    const template = body.template as TemplateName
    let color: string | undefined
    if (body.color !== undefined) {
      if (typeof body.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(body.color)) {
        throw new HttpError(400, 'The color must be a six-digit hex, such as #000000.')
      }
      color = body.color.toLowerCase()
    }

    const png = typeof body.png === 'string' && body.png.startsWith('data:image/png;base64,') ? Buffer.from(body.png.slice(22), 'base64') : null
    const size = png ? pngSize(new Uint8Array(png)) : null
    if (!png || !size) throw new HttpError(400, 'Send the image as a PNG.')
    const sourceOnly = layout === 'image-only' && image && !isSheet(image) && !image.zoom
    if (sourceOnly) {
      if (!fitsFrame(size.width, size.height)) {
        throw new HttpError(400, 'The PNG must have the frame’s shape (1200:630, within 1%) and be at most 2400×1260.')
      }
    } else if (size.width !== 2400 || size.height !== 1260) {
      throw new HttpError(400, 'The PNG must be exactly 2400×1260.')
    }
    if (e.path !== '/') throw new HttpError(422, `${e.path} has no page yet. Create the page first, then save its image.`)

    return serially(async () => {
      const manifest = await readManifest()
      if (manifest.entries.some((x) => x.path === e.path && x.id !== e.id)) throw new HttpError(409, `Another page already uses ${e.path}.`)
      manifest.system.template = template
      if (color !== undefined) manifest.system.color = color
      const old = manifest.entries.find((x) => x.id === e.id)
      const entry: Entry = {
        id: e.id,
        path: e.path,
        title: e.title,
        group: e.group.trim(),
        theme: e.theme,
        image,
        ...(alt !== undefined ? { alt } : {}),
        layout,
        version: sha12(png),
        savedHash: null,
        ...(old?.video ? { video: old.video } : {}),
      }
      entry.savedHash = definitionHash(entry, manifest.system, template, TEMPLATE_USES[template].color ? manifest.system.color : undefined)
      if (old) manifest.entries[manifest.entries.indexOf(old)] = entry
      else manifest.entries.push(entry)
      const file = `${SERVED}/og/${entry.id}.png`
      await writeAtomic(path.join(root, file), png)
      await writeManifest(manifest)
      return { entry, file, bytes: png.length }
    })
  }

  async function upload(req: IncomingMessage) {
    assertWriter(req, ['application/json'])
    const limit = Math.ceil((10 * MiB * 4) / 3) + 64 * 1024
    const body = JSON.parse((await readBody(req, limit, 'Images can be up to 10 MB.')).toString('utf8'))
    if (typeof body.name !== 'string' || body.name.length > 200 || typeof body.data !== 'string') throw new HttpError(400, 'Upload a PNG, JPEG or WebP image.')
    const data = Buffer.from(body.data.slice(body.data.indexOf(',') + 1), 'base64')
    if (data.length > 10 * MiB) throw new HttpError(413, 'Images can be up to 10 MB.')
    const ext =
      data[0] === 0x89 && data.subarray(1, 4).toString('latin1') === 'PNG'
        ? 'png'
        : data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff
          ? 'jpg'
          : data.subarray(0, 4).toString('latin1') === 'RIFF' && data.subarray(8, 12).toString('latin1') === 'WEBP'
            ? 'webp'
            : null
    if (!ext) throw new HttpError(415, 'Upload a PNG, JPEG or WebP image.')
    const base =
      body.name
        .replace(/\.[^.]*$/, '')
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60)
        .replace(/-+$/, '') || 'image'
    await fs.mkdir(sourcesDir, { recursive: true })
    const tmp = path.join(sourcesDir, `.upload-${process.pid}-${Date.now()}.tmp`)
    await fs.writeFile(tmp, data)
    try {
      for (let i = 1; i <= 999; i++) {
        const name = `${base}${i === 1 ? '' : `-${i}`}.${ext}`
        try {
          await fs.link(tmp, path.join(sourcesDir, name))
          return { source: { src: `${SOURCES}/${name}`, label: name, folder: SOURCES } }
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
        }
      }
      throw new HttpError(409, 'Too many files with this name.')
    } finally {
      await fs.rm(tmp, { force: true })
    }
  }

  async function video(req: IncomingMessage, url: URL) {
    const type = assertWriter(req, ['application/json', 'video/mp4'])
    if (type === 'application/json') {
      const body = JSON.parse((await readBody(req, 4 * 1024, 'Send a video, or { id, remove: true }.')).toString('utf8'))
      if (!body || body.remove !== true || typeof body.id !== 'string') throw new HttpError(400, 'Send a video, or { id, remove: true }.')
      if (!ID_RE.test(body.id)) throw new HttpError(400, 'Choose a page.')
      return serially(async () => {
        const manifest = await readManifest()
        const entry = manifest.entries.find((x) => x.id === body.id)
        if (!entry) throw new HttpError(404, `No page has the id ${body.id}.`)
        const kept = entry.video?.src
        delete entry.video
        await writeManifest(manifest)
        return kept ? { kept } : {}
      })
    }
    const id = url.searchParams.get('id') ?? ''
    if (!ID_RE.test(id)) throw new HttpError(400, 'Choose a page.')
    const width = Number(url.searchParams.get('width'))
    const height = Number(url.searchParams.get('height'))
    if (!Number.isInteger(width) || width < 1 || width > 8192) throw new HttpError(400, 'Send the video’s width in pixels.')
    if (!Number.isInteger(height) || height < 1 || height > 8192) throw new HttpError(400, 'Send the video’s height in pixels.')
    const declared = Number(req.headers['content-length'])
    const mb = (n: number) => `${(n / 1e6).toFixed(1)} MB`
    const tooBig = `Videos can be up to 8.4 MB.${declared ? ` This one is ${mb(declared)}.` : ''}`
    const data = await readBody(req, 8 * MiB, tooBig)
    if (!data.length) throw new HttpError(400, 'Nothing was sent.')
    const brand = data.subarray(8, 12).toString('latin1')
    const brands = ['isom', 'iso2', 'iso3', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V ', 'mmp4', 'MSNV', 'dash']
    if (data.subarray(4, 8).toString('latin1') !== 'ftyp' || !brands.includes(brand)) throw new HttpError(415, 'That isn’t an MP4 video.')
    return serially(async () => {
      const manifest = await readManifest()
      const entry = manifest.entries.find((x) => x.id === id)
      if (!entry) throw new HttpError(404, `No page has the id ${id}. Save the page’s image first.`)
      const src = `${SERVED}/og/${id}.mp4`
      if (manifest.entries.some((x) => x.id !== id && x.video?.src === src)) throw new HttpError(409, `Another page already uses ${src}.`)
      await writeAtomic(path.join(root, src), data)
      entry.video = { src, type: 'video/mp4', width, height, version: sha12(data) }
      await writeManifest(manifest)
      return { video: entry.video, bytes: data.length }
    })
  }

  async function source(req: IncomingMessage, res: ServerResponse, url: URL) {
    assertLocal(req, 'Local requests only')
    const file = url.searchParams.get('file') ?? ''
    if (!SOURCE_FILE_RE.test(file) || !existsSync(path.join(sourcesDir, file))) {
      res.statusCode = 404
      return res.end()
    }
    const ext = path.extname(file).slice(1)
    res.setHeader('Content-Type', ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Robots-Tag', 'noindex')
    res.end(await fs.readFile(path.join(sourcesDir, file)))
  }

  return {
    name: 'link-previews-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const route = url.pathname
        if (!route.startsWith(`${TOOL}/`)) return next()
        try {
          if (route === `${TOOL}/state` && req.method === 'GET') {
            assertLocal(req)
            return send(res, 200, await state())
          }
          if (route === `${TOOL}/source` && req.method === 'GET') return await source(req, res, url)
          if (route === `${TOOL}/save`) return send(res, 200, await save(req))
          if (route === `${TOOL}/upload`) return send(res, 200, await upload(req))
          if (route === `${TOOL}/video`) return send(res, 200, await video(req, url))
          return next()
        } catch (err) {
          if (err instanceof HttpError) return send(res, err.status, { error: err.message })
          server.config.logger.error(`[link-previews] ${(err as Error).stack ?? err}`)
          const failure = route.endsWith('/video') ? 'The video could not be saved. Try again.' : 'The image could not be saved. Your draft is still here; try again.'
          return send(res, 500, { error: failure })
        }
      })
    },
  }
}

function sourcesOf(image: Image): string[] {
  if (!image) return []
  return isSheet(image) ? image.sheet : [image.src]
}

// ---------- Metadata ----------

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/** The share tags for a path, from the manifest; no image tags when no file is saved. */
export function linkPreviewTags(opts: Options, pathname: string, page: { title: string; description: string }) {
  const manifest = JSON.parse(readFileSync(path.join(opts.root, MANIFEST), 'utf8')) as Manifest
  const entry = manifest.entries.find((e) => e.path === pathname)
  const url = `${opts.siteUrl}${pathname === '/' ? '/' : pathname}`
  const tags: [string, string, string][] = [
    ['property', 'og:title', page.title],
    ['property', 'og:description', page.description],
    ['property', 'og:url', url],
    ['property', 'og:site_name', opts.siteName],
    ['property', 'og:type', 'website'],
    ['name', 'twitter:card', 'summary_large_image'],
    ['name', 'twitter:title', page.title],
    ['name', 'twitter:description', page.description],
  ]
  const file = entry ? path.join(opts.root, SERVED, 'og', `${entry.id}.png`) : null
  if (entry && entry.version && file && existsSync(file)) {
    const size = pngSize(new Uint8Array(readFileSync(file).subarray(0, 24)))
    const imageUrl = `${opts.siteUrl}/og/${entry.id}.png?v=${entry.version}`
    const alt = (entry.alt ?? entry.title).replace(/\s*\n\s*/g, ' ')
    tags.push(
      ['property', 'og:image', imageUrl],
      ['property', 'og:image:width', String(size?.width ?? 2400)],
      ['property', 'og:image:height', String(size?.height ?? 1260)],
      ['property', 'og:image:type', 'image/png'],
      ['property', 'og:image:alt', alt],
      ['name', 'twitter:image', imageUrl],
      ['name', 'twitter:image:alt', alt],
    )
    if (entry.video) {
      const videoUrl = `${opts.siteUrl}/${entry.video.src.replace(/^public\//, '')}${entry.video.version ? `?v=${entry.video.version}` : ''}`
      tags.push(
        ['property', 'og:video', videoUrl],
        ['property', 'og:video:type', 'video/mp4'],
        ['property', 'og:video:width', String(entry.video.width)],
        ['property', 'og:video:height', String(entry.video.height)],
      )
    }
  }
  return tags.map(([attr, key, value]) => `<meta ${attr}="${key}" content="${esc(value)}" />`).join('\n    ')
}

export function linkPreviewsMeta(opts: Options & { title: string }): Plugin {
  return {
    name: 'link-previews-meta',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        // Only the site's own page; the dev tool's HTML gets none.
        if (!/(^|\/)index\.html$/.test(ctx.filename) || ctx.filename.includes(`${path.sep}link-previews${path.sep}`)) return html
        const tags = linkPreviewTags(opts, '/', { title: opts.title, description: opts.description })
        return html.replace('</head>', `    <meta name="description" content="${esc(opts.description)}" />\n    ${tags}\n  </head>`)
      },
    },
  }
}

