// Link Previews: the dev-only tool. Lists every page from the manifest, lets
// the person adjust each share image (title, crop, theme, layout, source) and
// pick a template, and saves each as a static PNG through the dev server.
// Drafts, the drafted template and color, and undo history live in memory.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Frame, TEMPLATES, imageBoxFor, setSourceResolver, sourceUrl, titleBoxFor, type Box, type TitleSlot } from './templates'
import { fitTitle, useFontsReady } from './fit'
import { capture } from './capture'
import {
  TEMPLATE_NAMES,
  TEMPLATE_USES,
  canonical,
  definitionHash,
  isSheet,
  isSingle,
  layoutOf,
  saveMethod,
  templateName,
  type Entry,
  type Image,
  type Layout,
  type Manifest,
  type Sheet,
  type Single,
  type TemplateName,
  type Theme,
} from './shared'

const API = '/link-previews'
const SOURCES = 'og/sources/'
setSourceResolver((src) =>
  src.startsWith(SOURCES) ? `${API}/source?file=${encodeURIComponent(src.slice(SOURCES.length))}` : '/' + src.replace(/^public\//, ''),
)

type SourceItem = { src: string; label: string; folder: string }
type ServerState = {
  manifest: Manifest
  exists: Record<string, boolean>
  sizes: Record<string, { image: number | null; video: number | null }>
  sources: SourceItem[]
  registry: string
}
type Page = { id: string; path: string; group: string; fromSitemap: boolean }
type Status = 'missing' | 'draft' | 'saved' | 'stale'
type View = 'all' | 'template' | string
type Doc = { drafts: Record<string, Entry>; template: TemplateName; color: string | undefined }
type Snapshot = Doc & { view: View }
type Kind = 'title' | 'crop' | 'nudge' | 'color' | 'theme' | 'layout' | 'source' | 'template'
type Step = { key: string; kind: Kind; at: number; lines?: number; before: Snapshot; after: Snapshot }

const STATUS_LABEL: Record<Status, string> = { missing: 'Missing', draft: 'Draft', saved: 'Saved', stale: 'Stale' }
const MERGEABLE: Kind[] = ['title', 'crop', 'nudge', 'color']
const MiB = 1024 * 1024
const mb = (n: number) => `${(n / 1e6).toFixed(n < 1e5 ? 2 : 1)} MB`
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const round3 = (v: number) => Math.round(v * 1000) / 1000
const newlines = (s: string) => (s.match(/\n/g) ?? []).length

async function post<T>(path: string, body: BodyInit, type = 'application/json'): Promise<T> {
  const res = await fetch(`${API}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': type, 'x-link-previews': '1' },
    body,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? 'Something went wrong. Try again.')
  return data as T
}

const readAsDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })

// ---------- Boot ----------

export function Tool() {
  const [boot, setBoot] = useState<ServerState | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    fetch(`${API}/state`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setBoot)
      .catch(() => setError('Could not load the manifest. Is the dev server running?'))
  }, [])
  if (!boot)
    return (
      <div className="lp">
        <div />
        <main className="lp-canvas">
          <div className="lp-header">
            <h1>Link Previews</h1>
            <p className="lp-note" role="status">
              {error || 'Loading…'}
            </p>
          </div>
        </main>
      </div>
    )
  return <Editor boot={boot} />
}

// ---------- Sitemap ----------

async function loadSitemap(): Promise<string[]> {
  const fetchXml = async (url: string) => {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok || !/xml/.test(res.headers.get('content-type') ?? '')) throw new Error('no sitemap')
    const doc = new DOMParser().parseFromString(await res.text(), 'application/xml')
    if (doc.querySelector('parsererror')) throw new Error('bad sitemap')
    return doc
  }
  const toPath = (loc: string) => {
    try {
      const p = decodeURIComponent(new URL(loc.trim(), location.origin).pathname)
      return p.length > 1 ? p.replace(/\/$/, '') : p
    } catch {
      return null
    }
  }
  try {
    const doc = await fetchXml('/sitemap.xml')
    const out: string[] = []
    if (doc.documentElement.localName === 'sitemapindex') {
      for (const loc of Array.from(doc.getElementsByTagName('loc'))) {
        const child = toPath(loc.textContent ?? '')
        if (!child) continue
        const sub = await fetchXml(child).catch(() => null)
        sub && out.push(...Array.from(sub.getElementsByTagName('loc')).map((l) => toPath(l.textContent ?? '') ?? ''))
      }
    } else {
      out.push(...Array.from(doc.getElementsByTagName('loc')).map((l) => toPath(l.textContent ?? '') ?? ''))
    }
    return [...new Set(out.filter(Boolean))]
  } catch {
    return []
  }
}

function groupFor(path: string) {
  const first = path.split('/').filter(Boolean)
  if (first.length < 2) return 'Pages'
  return first[0].replace(/(^|-)([a-z])/g, (_m, d, c: string) => (d ? ' ' : '') + c.toUpperCase())
}

function defaultDraft(page: Page): Entry {
  const last = page.path.split('/').filter(Boolean).pop()
  const title = last ? last.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : 'Home'
  return { id: page.id, path: page.path, title, group: page.group, theme: 'light', image: null, version: null, savedHash: null }
}

// ---------- Hooks ----------

function useNatural(src: string | null) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => {
    setSize(null)
    if (!src) return
    const img = new Image()
    img.onload = () => setSize({ w: img.naturalWidth, h: img.naturalHeight })
    img.src = sourceUrl(src)
  }, [src])
  return size
}

// ---------- Editor ----------

function Editor({ boot }: { boot: ServerState }) {
  const system = boot.manifest.system
  const ready = useFontsReady(system)

  const [saved, setSaved] = useState<Record<string, Entry>>(() => Object.fromEntries(boot.manifest.entries.map((e) => [e.id, e])))
  const originalSheets = useRef<Record<string, Sheet>>(
    Object.fromEntries(boot.manifest.entries.filter((e) => isSheet(e.image)).map((e) => [e.id, e.image as Sheet])),
  )
  const [doc, setDoc] = useState<Doc>(() => ({
    drafts: Object.fromEntries(boot.manifest.entries.map((e) => [e.id, e])),
    template: templateName(system.template),
    color: system.color,
  }))
  const [view, setView] = useState<View>('all')
  const [, setHistory] = useState<{ past: Step[]; future: Step[] }>({ past: [], future: [] })
  const [exists, setExists] = useState(boot.exists)
  const [sizes, setSizes] = useState(boot.sizes)
  const [sources, setSources] = useState(boot.sources)
  const [sitemap, setSitemap] = useState<string[]>([])
  const [saving, setSaving] = useState<{ id: string } | { batch: number; of: number } | null>(null)
  const [pageErrors, setPageErrors] = useState<Record<string, string>>({})
  const [batchNote, setBatchNote] = useState('')

  useEffect(() => {
    loadSitemap().then(setSitemap)
  }, [])

  const docRef = useRef(doc)
  docRef.current = doc
  const viewRef = useRef(view)
  viewRef.current = view

  // Pages: manifest entries, then sitemap pages with no entry, grouped.
  const pages = useMemo<Page[]>(() => {
    const out: Page[] = boot.manifest.entries.map((e) => ({ id: e.id, path: e.path, group: e.group, fromSitemap: false }))
    for (const id of Object.keys(saved)) if (!out.some((p) => p.id === id)) out.push({ id, path: saved[id].path, group: saved[id].group, fromSitemap: false })
    const taken = new Set(out.map((p) => p.id))
    for (const path of sitemap) {
      if (out.some((p) => p.path === path)) continue
      let id = path === '/' ? 'home' : path.slice(1).replace(/\//g, '-')
      for (let n = 2; taken.has(id); n++) id = `${id.replace(/-\d+$/, '')}-${n}`
      taken.add(id)
      out.push({ id, path, group: groupFor(path), fromSitemap: true })
    }
    const groups: string[] = []
    for (const p of out) if (!groups.includes(p.group)) groups.push(p.group)
    return groups.flatMap((g) => out.filter((p) => p.group === g))
  }, [boot.manifest.entries, saved, sitemap])

  const pageById = useMemo(() => Object.fromEntries(pages.map((p) => [p.id, p])), [pages])
  const entryOf = useCallback((id: string, d: Doc = doc) => d.drafts[id] ?? defaultDraft(pageById[id]), [doc, pageById])
  const draftSystem = useMemo(() => ({ ...system, template: doc.template, color: doc.color }), [system, doc.template, doc.color])

  const statusOf = useCallback(
    (id: string): Status => {
      const copy = saved[id]
      const draft = doc.drafts[id]
      if (!copy && !draft) return 'missing'
      if (!copy || !exists[id] || canonical(draft) !== canonical(copy)) return 'draft'
      if (copy.savedHash == null) return layoutOf(draft) === 'image-only' ? 'saved' : 'stale'
      return copy.savedHash !== definitionHash(draft, system, doc.template, doc.color) ? 'stale' : 'saved'
    },
    [saved, doc, exists, system],
  )
  const needsSaving = pages.filter((p) => statusOf(p.id) !== 'saved')

  // ---------- History ----------

  const commit = useCallback(
    (kind: Kind, id: string, next: Partial<Doc>, extra: { key?: string; lines?: number; view?: View } = {}) => {
      const before: Snapshot = { ...docRef.current, view: viewRef.current }
      const after: Snapshot = { ...before, ...next, view: extra.view ?? viewRef.current }
      const strip = (s: Snapshot) => canonical({ drafts: s.drafts, template: s.template, color: s.color })
      if (strip(before) === strip(after)) return
      const key = extra.key ?? `${kind}:${id}`
      const now = Date.now()
      setHistory((h) => {
        const last = h.past.at(-1)
        const merge =
          last &&
          last.key === key &&
          now - last.at <= 1000 &&
          MERGEABLE.includes(kind) &&
          (kind !== 'title' || last.lines === extra.lines)
        const past = merge
          ? [...h.past.slice(0, -1), { ...last, at: now, after, lines: extra.lines }]
          : [...h.past, { key, kind, at: now, lines: extra.lines, before, after }]
        return { past, future: [] }
      })
      setDoc({ drafts: after.drafts, template: after.template, color: after.color })
      if (extra.view) setView(extra.view)
    },
    [],
  )

  const editEntry = useCallback(
    (kind: Kind, id: string, update: (e: Entry) => Entry, extra: { key?: string; lines?: number } = {}) => {
      const current = docRef.current.drafts[id] ?? defaultDraft(pageById[id])
      commit(kind, id, { drafts: { ...docRef.current.drafts, [id]: update(current) } }, extra)
    },
    [commit, pageById],
  )

  const viewExists = useCallback((v: View) => v === 'all' || v === 'template' || !!pageById[v], [pageById])
  const restore = useCallback(
    (s: Snapshot) => {
      setDoc({ drafts: s.drafts, template: s.template, color: s.color })
      setView(viewExists(s.view) ? s.view : 'all')
    },
    [viewExists],
  )
  const undo = useCallback(() => {
    setHistory((h) => {
      const step = h.past.at(-1)
      if (!step) return h
      restore(step.before)
      return { past: h.past.slice(0, -1), future: [...h.future, step] }
    })
  }, [restore])
  const redo = useCallback(() => {
    setHistory((h) => {
      const step = h.future.at(-1)
      if (!step) return h
      restore(step.after)
      return { past: [...h.past, step], future: h.future.slice(0, -1) }
    })
  }, [restore])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey) return
      const t = e.target as HTMLElement
      const textInput =
        t instanceof HTMLTextAreaElement ||
        (t instanceof HTMLInputElement && ['text', 'search', 'url', 'tel', 'email', 'password', 'number'].includes(t.type))
      if (textInput) return
      const mod = e.metaKey || e.ctrlKey
      const k = e.key.toLowerCase()
      if (mod && k === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((mod && k === 'z' && e.shiftKey) || (e.ctrlKey && !e.metaKey && k === 'y')) {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [undo, redo])

  // ---------- Saving ----------

  const makePng = useCallback(
    async (entry: Entry, d: Doc) => {
      const layout = layoutOf(entry)
      if (layout === 'image-only' && isSingle(entry.image) && !entry.image.zoom) {
        const blob = await (await fetch(sourceUrl(entry.image.src), { cache: 'no-store' })).blob()
        const head = new Uint8Array(await blob.slice(0, 8).arrayBuffer())
        const png = head[0] === 0x89 && head[1] === 0x50
        const bitmap = await createImageBitmap(blob)
        const method = saveMethod({ width: bitmap.width, height: bitmap.height, zoom: entry.image.zoom, sheet: false, layout, png })
        if (method === 'source-bytes') return readAsDataUrl(blob)
        if (method === 'source-redraw') {
          const canvas = document.createElement('canvas')
          canvas.width = bitmap.width
          canvas.height = bitmap.height
          canvas.getContext('2d')!.drawImage(bitmap, 0, 0)
          return canvas.toDataURL('image/png')
        }
      }
      return capture(entry, { ...system, template: d.template, color: d.color }, d.template)
    },
    [system],
  )

  const saveOne = useCallback(
    async (id: string) => {
      const d = docRef.current
      const entry = d.drafts[id] ?? defaultDraft(pageById[id])
      const png = await makePng(entry, d)
      const color = TEMPLATE_USES[d.template].color || system.color !== undefined ? d.color : undefined
      const res = await post<{ entry: Entry; file: string; bytes: number }>(
        'save',
        JSON.stringify({ entry, png, template: d.template, ...(color ? { color } : {}) }),
      )
      const stamp = (e: Entry | undefined) => (e ? { ...e, version: res.entry.version, savedHash: res.entry.savedHash } : e)
      setSaved((s) => ({ ...s, [id]: res.entry }))
      setExists((x) => ({ ...x, [id]: true }))
      setSizes((x) => ({ ...x, [id]: { image: res.bytes, video: x[id]?.video ?? null } }))
      setDoc((cur) => {
        const now = cur.drafts[id]
        const adopted = !now || canonical(now) === canonical(entry) ? res.entry : stamp(now)!
        return { ...cur, drafts: { ...cur.drafts, [id]: adopted } }
      })
      // Saves aren't undo steps; write the new stamp through every step.
      const restamp = (s: Snapshot) => (s.drafts[id] ? { ...s, drafts: { ...s.drafts, [id]: stamp(s.drafts[id])! } } : s)
      setHistory((h) => ({
        past: h.past.map((st) => ({ ...st, before: restamp(st.before), after: restamp(st.after) })),
        future: h.future.map((st) => ({ ...st, before: restamp(st.before), after: restamp(st.after) })),
      }))
    },
    [makePng, pageById, system.color],
  )

  const save = async (id: string) => {
    setSaving({ id })
    setPageErrors((e) => ({ ...e, [id]: '' }))
    try {
      await saveOne(id)
    } catch (err) {
      setPageErrors((e) => ({ ...e, [id]: (err as Error).message }))
    } finally {
      setSaving(null)
    }
  }

  const saveAll = async () => {
    const queue = needsSaving.map((p) => p.id)
    const failures: string[] = []
    for (let i = 0; i < queue.length; i++) {
      setSaving({ batch: i + 1, of: queue.length })
      try {
        await saveOne(queue[i])
        setPageErrors((e) => ({ ...e, [queue[i]]: '' }))
      } catch (err) {
        failures.push((err as Error).message)
        setPageErrors((e) => ({ ...e, [queue[i]]: (err as Error).message }))
      }
    }
    setSaving(null)
    setBatchNote(failures.length ? `${failures.length} of ${queue.length} couldn’t be saved: ${failures[0]}` : '')
  }

  // ---------- Render ----------

  const groups = [...new Set(pages.map((p) => p.group))]
  const page = view !== 'all' && view !== 'template' ? pageById[view] : null
  const busy = saving !== null
  let action: ReactNode = null
  if (page) {
    if (statusOf(page.id) !== 'saved' || (saving && 'id' in saving && saving.id === page.id)) {
      action = (
        <button type="button" className="lp-primary" disabled={busy} onClick={() => save(page.id)}>
          {saving && 'id' in saving ? 'Saving…' : 'Save'}
        </button>
      )
    }
  } else if (needsSaving.length || (saving && 'batch' in saving)) {
    action = (
      <button type="button" className="lp-primary" disabled={busy} onClick={saveAll}>
        {saving && 'batch' in saving ? `Saving ${saving.batch} of ${saving.of}…` : 'Save all'}
      </button>
    )
  }
  const note = page ? pageErrors[page.id] : batchNote

  return (
    <div className="lp">
      <aside className="lp-sidebar">
        <nav className="lp-nav" aria-label="Link previews">
          {(['all', 'template'] as const).map((v) => (
            <button key={v} type="button" className="lp-row" aria-current={view === v ? 'page' : undefined} onClick={() => setView(v)}>
              <span className="lp-label lp-ellipsis">{v === 'all' ? 'All' : 'Template'}</span>
            </button>
          ))}
          {groups.map((g) => (
            <div key={g} style={{ display: 'contents' }}>
              {groups.length > 1 && <h2 className="lp-group">{g}</h2>}
              {pages
                .filter((p) => p.group === g)
                .map((p) => (
                  <button key={p.id} type="button" className="lp-row" aria-current={view === p.id ? 'page' : undefined} onClick={() => setView(p.id)}>
                    <span className="lp-label lp-ellipsis">{p.path}</span>
                    <Dot status={statusOf(p.id)} />
                  </button>
                ))}
            </div>
          ))}
        </nav>
      </aside>
      <main className="lp-canvas">
        <header className="lp-header">
          <h1 className="lp-ellipsis">{page ? page.path : view === 'template' ? 'Template' : 'All'}</h1>
          <div className="lp-actions">
            {note ? (
              <p className="lp-note" role="status">
                {note}
              </p>
            ) : null}
            {action}
          </div>
        </header>
        <div className="lp-content">
          {view === 'all' && (
            <div className="lp-grid">
              {pages.map((p) => (
                <figure key={p.id} className="lp-card">
                  <Scaled>
                    <Frame entry={entryOf(p.id)} system={draftSystem} template={doc.template} ready={ready} />
                  </Scaled>
                  <figcaption className="lp-caption">
                    <span className="lp-ellipsis">{p.path}</span>
                    {doc.drafts[p.id]?.video && <span>Video</span>}
                    <Dot status={statusOf(p.id)} />
                  </figcaption>
                  <button type="button" className="lp-card-button" onClick={() => setView(p.id)}>
                    <span className="lp-sr">Edit {p.path}</span>
                  </button>
                </figure>
              ))}
            </div>
          )}
          {view === 'template' && (
            <TemplateGallery
              doc={doc}
              system={system}
              ready={ready}
              sample={sampleEntry(pages, entryOf)}
              registry={boot.registry}
              onTemplate={(t) => commit('template', 'all', { template: t })}
              onColor={(c) => commit('color', 'color', { color: c }, { key: 'color' })}
            />
          )}
          {page && (
            <PageView
              key={page.id}
              page={page}
              entry={entryOf(page.id)}
              hasEntry={!!saved[page.id]}
              originalSheet={originalSheets.current[page.id]}
              system={draftSystem}
              template={doc.template}
              ready={ready}
              sources={sources}
              imageBytes={sizes[page.id]?.image ?? null}
              videoBytes={sizes[page.id]?.video ?? null}
              onEdit={(kind, update, extra) => editEntry(kind, page.id, update, extra)}
              onUploaded={(s) => setSources((all) => (all.some((x) => x.src === s.src) ? all : [...all, s].sort((a, b) => a.label.localeCompare(b.label))))}
              onVideo={(video, bytes) => {
                const apply = (e: Entry | undefined) => {
                  if (!e) return e
                  const next = { ...e }
                  if (video) next.video = video
                  else delete next.video
                  return next
                }
                setSaved((s) => ({ ...s, [page.id]: apply(s[page.id])! }))
                setDoc((cur) => ({ ...cur, drafts: { ...cur.drafts, [page.id]: apply(cur.drafts[page.id])! } }))
                setSizes((x) => ({ ...x, [page.id]: { image: x[page.id]?.image ?? null, video: bytes } }))
              }}
            />
          )}
        </div>
      </main>
    </div>
  )
}

function sampleEntry(pages: Page[], entryOf: (id: string) => Entry): Entry {
  const all = pages.map((p) => entryOf(p.id))
  return (
    all.find((e) => layoutOf(e) === 'type-and-image' && isSingle(e.image)) ??
    all[0] ?? { id: 'sample', path: '/', title: 'Your page title', group: 'Pages', theme: 'light', image: null, version: null, savedHash: null }
  )
}

function Dot({ status }: { status: Status }) {
  if (status === 'saved') return null
  return <span className="lp-dot" data-status={status} role="img" aria-label={STATUS_LABEL[status]} title={STATUS_LABEL[status]} />
}

// ---------- Scaled frame ----------

function Scaled({ children, overlay, frameProps }: { children: ReactNode; overlay?: ReactNode; frameProps?: React.HTMLAttributes<HTMLDivElement> & { [k: `data-${string}`]: unknown } }) {
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState<number | null>(null)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setScale(el.clientWidth / 1200)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={box} className="lp-frame" {...frameProps}>
      <div
        className="lp-frame-layer"
        style={{ transform: `scale(${scale ?? 1})`, visibility: scale === null ? 'hidden' : 'visible', ['--frame-scale' as string]: scale ?? 1 } as CSSProperties}
      >
        {children}
        {overlay}
      </div>
    </div>
  )
}

// ---------- Segmented ----------

function Segmented<T extends string>(props: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const wrap = useRef<HTMLDivElement>(null)
  const thumb = useRef<HTMLSpanElement>(null)
  const placed = useRef(false)
  const place = useCallback(() => {
    const el = wrap.current?.querySelector<HTMLElement>('[aria-checked="true"]')
    const t = thumb.current
    if (!el || !t) return
    t.style.transform = `translateX(${el.offsetLeft}px)`
    t.style.width = `${el.offsetWidth}px`
    if (!placed.current) {
      placed.current = true
      requestAnimationFrame(() => t.setAttribute('data-placed', ''))
    }
  }, [])
  useLayoutEffect(place, [place, props.value])
  useEffect(() => {
    const ro = new ResizeObserver(place)
    if (wrap.current) ro.observe(wrap.current)
    return () => ro.disconnect()
  }, [place])
  const move = (dir: number) => {
    const i = props.options.findIndex((o) => o.value === props.value)
    const next = props.options[(i + dir + props.options.length) % props.options.length]
    props.onChange(next.value)
    requestAnimationFrame(() => wrap.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus())
  }
  return (
    <div
      ref={wrap}
      className="lp-seg"
      role="radiogroup"
      aria-label={props.label}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault()
          move(-1)
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault()
          move(1)
        }
      }}
    >
      <span ref={thumb} className="lp-seg-thumb" />
      {props.options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          className="lp-seg-option"
          aria-checked={o.value === props.value}
          tabIndex={o.value === props.value ? 0 : -1}
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

const Chevron = () => (
  <svg className="lp-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
    <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

// ---------- Editable title ----------

function insertAtCaret(el: HTMLElement, text: string) {
  const sel = getSelection()
  if (!sel || !sel.rangeCount) return
  const range = sel.getRangeAt(0)
  if (!el.contains(range.startContainer)) return
  range.deleteContents()
  const node = document.createTextNode(text)
  range.insertNode(node)
  range.setStartAfter(node)
  range.collapse(true)
  sel.removeAllRanges()
  sel.addRange(range)
}

function syncSentinel(el: HTMLElement, text: string) {
  const last = el.lastChild
  const has = last instanceof HTMLBRElement
  if (text.endsWith('\n') && !has) el.appendChild(document.createElement('br'))
  if (!text.endsWith('\n') && has) last.remove()
}

function EditableTitle({ slot, onChange }: { slot: TitleSlot; onChange: (text: string) => void }) {
  const ref = useRef<HTMLSpanElement>(null)
  const held = useRef<string | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || held.current === slot.text) return
    el.textContent = slot.text
    syncSentinel(el, slot.text)
    held.current = slot.text
    if (document.activeElement === el) {
      const sel = getSelection()
      sel?.selectAllChildren(el)
      sel?.collapseToEnd()
    }
  }, [slot.text])
  const read = () => {
    const el = ref.current!
    const text = (el.textContent ?? '').replace(/ /g, ' ')
    syncSentinel(el, text)
    held.current = text
    onChange(text)
  }
  return (
    <span
      ref={ref}
      className="lp-title-edit"
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      role="textbox"
      aria-label="Title"
      aria-multiline="true"
      tabIndex={0}
      spellCheck={false}
      style={{ ...slot.style, position: 'relative', zIndex: 2, cursor: 'text' }}
      onInput={read}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          insertAtCaret(e.currentTarget, '\n')
          read()
        }
      }}
      onPaste={(e) => {
        e.preventDefault()
        insertAtCaret(e.currentTarget, e.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n'))
        read()
      }}
      onDrop={(e) => e.preventDefault()}
    />
  )
}

// ---------- Crop target ----------

function CropTarget({ box, image, onFocus }: { box: Box; image: Single; onFocus: (f: { x: number; y: number }, kind: 'crop' | 'nudge', key?: string) => void }) {
  const natural = useNatural(image.src)
  const drag = useRef<{ x: number; y: number; focus: { x: number; y: number }; key: string; last: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const slack = () => {
    if (!natural) return { x: 0, y: 0 }
    const cover = Math.max(box.width / natural.w, box.height / natural.h) * (image.zoom ?? 1)
    return { x: natural.w * cover - box.width, y: natural.h * cover - box.height }
  }
  const moveBy = (dx: number, dy: number, start: { x: number; y: number }) => {
    const s = slack()
    return {
      x: s.x > 0.5 ? round3(clamp(start.x - dx / s.x, 0, 1)) : start.x,
      y: s.y > 0.5 ? round3(clamp(start.y - dy / s.y, 0, 1)) : start.y,
    }
  }
  return (
    <div
      className="lp-crop"
      data-dragging={dragging || undefined}
      tabIndex={0}
      role="group"
      aria-label="Image crop. Drag or use the arrow keys to move the image."
      style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.currentTarget.setPointerCapture(e.pointerId)
        e.currentTarget.focus()
        drag.current = { x: e.clientX, y: e.clientY, focus: { ...image.focus }, key: `crop:${Date.now()}`, last: Date.now() }
        setDragging(true)
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d) return
        const now = Date.now()
        // Holding still over a second mid-drag starts a new undo step.
        if (now - d.last > 1000) d.key = `crop:${now}`
        d.last = now
        const onScreen = e.currentTarget.getBoundingClientRect().width / box.width
        onFocus(moveBy((e.clientX - d.x) / onScreen, (e.clientY - d.y) / onScreen, d.focus), 'crop', d.key)
      }}
      onPointerUp={() => {
        drag.current = null
        setDragging(false)
      }}
      onPointerCancel={() => {
        drag.current = null
        setDragging(false)
      }}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 50 : 10
        const delta = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key]
        if (!delta) return
        e.preventDefault()
        onFocus(moveBy(delta[0], delta[1], image.focus), 'nudge')
      }}
    />
  )
}

// ---------- Picker ----------

async function uploadImage(file: File): Promise<SourceItem> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Upload a PNG, JPEG or WebP image.')
  if (file.size > 10 * MiB) throw new Error('Images can be up to 10 MB.')
  const res = await post<{ source: SourceItem }>('upload', JSON.stringify({ name: file.name, data: await readAsDataUrl(file) }))
  return res.source
}

function Picker(props: {
  current: Image
  originalSheet?: Sheet
  sources: SourceItem[]
  extra: string[]
  open: boolean
  setOpen: (o: boolean) => void
  onChoose: (choice: string | 'sheet') => void
  onUploaded: (s: SourceItem) => void
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const file = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const options = [
    ...(props.originalSheet ? [{ value: 'sheet', label: `Sheet of ${props.originalSheet.sheet.length}`, thumb: props.originalSheet.sheet[0] }] : []),
    ...props.sources.map((s) => ({ value: s.src, label: s.label, thumb: s.src })),
    ...props.extra.filter((src) => !props.sources.some((s) => s.src === src)).map((src) => ({ value: src, label: src.split('/').pop()!, thumb: src })),
  ]
  const selected = isSheet(props.current) ? 'sheet' : isSingle(props.current) ? props.current.src : null
  const currentLabel = options.find((o) => o.value === selected)?.label ?? 'Choose an image'
  const currentThumb = options.find((o) => o.value === selected)?.thumb

  useEffect(() => {
    if (!props.open) return
    const el = wrap.current?.querySelector<HTMLElement>('[aria-selected="true"]') ?? wrap.current?.querySelector<HTMLElement>('[role="option"]')
    el?.focus()
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) props.setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [props.open])

  const choose = (value: string) => {
    props.onChoose(value)
    props.setOpen(false)
    button.current?.focus()
  }

  return (
    <div className="lp-picker" ref={wrap}>
      <button
        ref={button}
        type="button"
        className="lp-picker-button"
        aria-haspopup="listbox"
        aria-expanded={props.open}
        aria-label={`Image source: ${currentLabel}`}
        onClick={() => props.setOpen(!props.open)}
      >
        {currentThumb ? <img src={sourceUrl(currentThumb)} alt="" /> : <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--lp-fill)', flex: 'none' }} />}
        <span className="lp-ellipsis">{currentLabel}</span>
        <Chevron />
      </button>
      {props.open && (
        <div
          className="lp-popover"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              props.setOpen(false)
              button.current?.focus()
            }
          }}
        >
          <div className="lp-options" role="listbox" aria-label="Image source">
            {options.map((o) => (
              <button key={o.value} type="button" role="option" className="lp-option" aria-selected={o.value === selected} onClick={() => choose(o.value)}>
                <img src={sourceUrl(o.thumb)} alt="" loading="lazy" />
                <span className="lp-ellipsis">{o.label}</span>
              </button>
            ))}
          </div>
          <div className="lp-popover-foot">
            <button type="button" className="lp-quiet" disabled={uploading} onClick={() => file.current?.click()}>
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
            <span>{error || 'PNG, JPEG or WebP, up to 10 MB'}</span>
            <input
              ref={file}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (!f) return
                setUploading(true)
                setError('')
                try {
                  const s = await uploadImage(f)
                  props.onUploaded(s)
                  choose(s.src)
                } catch (err) {
                  setError((err as Error).message)
                } finally {
                  setUploading(false)
                }
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- Page view ----------

type Video = NonNullable<Entry['video']>

function PageView(props: {
  page: Page
  entry: Entry
  hasEntry: boolean
  originalSheet?: Sheet
  system: Manifest['system']
  template: TemplateName
  ready: boolean
  sources: SourceItem[]
  imageBytes: number | null
  videoBytes: number | null
  onEdit: (kind: Kind, update: (e: Entry) => Entry, extra?: { key?: string; lines?: number }) => void
  onUploaded: (s: SourceItem) => void
  onVideo: (video: Video | null, bytes: number | null) => void
}) {
  const { entry, system, template } = props
  const uses = TEMPLATE_USES[template]
  const layout = layoutOf(entry)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pending, setPending] = useState<Layout | null>(null)
  const [note, setNote] = useState('')
  const [videoNote, setVideoNote] = useState('')
  const [videoBusy, setVideoBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const videoInput = useRef<HTMLInputElement>(null)

  const titleBox = titleBoxFor(entry, system, template)
  const fit = props.ready && titleBox ? fitTitle(entry.title, system, titleBox) : null
  const imageBox = imageBoxFor(entry, system, template)
  const canCrop = imageBox && isSingle(entry.image) && (layout === 'image-only' || uses.image)
  const firstSource = props.sources[0]?.src
  const canVideo = props.hasEntry

  const chooseLayout = (next: Layout) => {
    if (next === layout && !(next !== 'type-only' && !entry.image)) return
    if (next === 'type-only') {
      setPending(null)
      return props.onEdit('layout', (e) => ({ ...e, layout: 'type-only' }))
    }
    const image: Image = entry.image ?? props.originalSheet ?? (firstSource ? { src: firstSource, focus: { x: 0.5, y: 0.5 } } : null)
    if (!image) {
      setPending(next)
      setPickerOpen(true)
      return
    }
    setPending(null)
    props.onEdit('layout', (e) => ({ ...e, image, layout: next }))
  }

  const chooseSource = (value: string | 'sheet') => {
    const image: Image = value === 'sheet' ? (props.originalSheet ?? null) : { src: value, focus: { x: 0.5, y: 0.5 } }
    if (!image) return
    const same = (value === 'sheet' && isSheet(entry.image)) || (isSingle(entry.image) && entry.image.src === value)
    const target: Layout = pending ?? (layout === 'type-only' ? (uses.image ? 'type-and-image' : 'image-only') : layout)
    setPending(null)
    if (same && target === layout) return
    props.onEdit('source', (e) => ({ ...e, image: same ? e.image : image, layout: target }))
  }

  const dropAccepted = layout !== 'type-only' || uses.image
  const onDrop = async (files: FileList) => {
    const list = Array.from(files)
    const video = list.find((f) => f.type.startsWith('video/') || /\.(mp4|m4v|mov|webm)$/i.test(f.name))
    if (video) {
      if (!canVideo) return setNote('Save this page’s image before adding a video.')
      return addVideo(video)
    }
    const image = list.find((f) => /^image\/(png|jpeg|webp)$/.test(f.type))
    if (!image || !dropAccepted) {
      return setNote(
        !dropAccepted
          ? 'Drop an MP4 video.'
          : canVideo
            ? 'Drop a PNG, JPEG or WebP image, or an MP4 video.'
            : 'Drop a PNG, JPEG or WebP image. A video can be added once this page’s image is saved.',
      )
    }
    setNote('Uploading…')
    try {
      const s = await uploadImage(image)
      props.onUploaded(s)
      chooseSource(s.src)
      setNote('')
    } catch (err) {
      setNote((err as Error).message)
    }
  }

  const addVideo = async (file: File) => {
    const head = new Uint8Array(await file.slice(0, 12).arrayBuffer())
    const ftyp = String.fromCharCode(...head.slice(4, 8)) === 'ftyp'
    if (!ftyp) return setVideoNote('That isn’t an MP4 video. Export it as MP4 (H.264) and try again.')
    if (file.size > 8 * MiB) return setVideoNote(`Videos can be up to 8.4 MB. This one is ${mb(file.size)}.`)
    const url = URL.createObjectURL(file)
    const dims = await new Promise<{ w: number; h: number } | string>((resolve) => {
      const v = document.createElement('video')
      v.muted = true
      v.preload = 'metadata'
      v.onloadedmetadata = () => resolve(v.videoWidth && v.videoHeight ? { w: v.videoWidth, h: v.videoHeight } : 'This video has no picture.')
      v.onerror = () => resolve('This browser can’t read that video.')
      v.src = url
    })
    URL.revokeObjectURL(url)
    if (typeof dims === 'string') return setVideoNote(dims)
    setVideoBusy(true)
    setVideoNote('Uploading the video…')
    try {
      const res = await post<{ video: Video; bytes: number }>(`video?id=${props.page.id}&width=${dims.w}&height=${dims.h}`, file, 'video/mp4')
      props.onVideo(res.video, res.bytes)
      setVideoNote('')
    } catch (err) {
      setVideoNote((err as Error).message || 'The video could not be saved. Try again.')
    } finally {
      setVideoBusy(false)
    }
  }

  const removeVideo = async () => {
    setVideoBusy(true)
    try {
      const res = await post<{ kept?: string }>('video', JSON.stringify({ id: props.page.id, remove: true }))
      props.onVideo(null, null)
      setVideoNote(res.kept ? `Video removed. The file is still at ${res.kept}.` : '')
    } catch (err) {
      setVideoNote((err as Error).message || 'The video could not be removed. Try again.')
    } finally {
      setVideoBusy(false)
    }
  }

  const layoutOptions: { value: Layout; label: string }[] = uses.image
    ? [
        { value: 'type-only', label: 'Text' },
        { value: 'type-and-image', label: 'Text & Image' },
        { value: 'image-only', label: 'Image' },
      ]
    : [
        { value: 'type-only', label: 'Text' },
        { value: 'image-only', label: 'Image' },
      ]
  const shownLayout: Layout = !uses.image && layout === 'type-and-image' ? 'type-only' : layout
  const extraSources = [...new Set((props.originalSheet?.sheet ?? []).concat(isSingle(entry.image) ? [entry.image.src] : []))]
  const statusNote = note || videoNote
  const video = entry.video
  const overLimit = video && props.imageBytes !== null && props.videoBytes !== null && props.imageBytes + props.videoBytes > 10_000_000

  return (
    <div className="lp-workspace">
      <Scaled
        frameProps={{
          'data-dragover': dragOver || undefined,
          onDragOver: (e) => {
            if (!Array.from(e.dataTransfer.types).includes('Files')) return
            e.preventDefault()
            setDragOver(true)
          },
          onDragLeave: () => setDragOver(false),
          onDrop: (e) => {
            e.preventDefault()
            setDragOver(false)
            onDrop(e.dataTransfer.files)
          },
        }}
        overlay={
          canCrop && isSingle(entry.image) ? (
            <CropTarget
              box={imageBox!}
              image={entry.image}
              onFocus={(focus, kind, key) => props.onEdit(kind, (e) => (isSingle(e.image) ? { ...e, image: { ...e.image, focus } } : e), { key })}
            />
          ) : null
        }
      >
        <Frame
          entry={entry}
          system={system}
          template={template}
          ready={props.ready}
          renderTitle={(slot) => (
            <EditableTitle slot={slot} onChange={(text) => props.onEdit('title', (e) => ({ ...e, title: text }), { lines: newlines(text) })} />
          )}
        />
      </Scaled>

      <div className="lp-controls">
        {uses.theme && layout !== 'image-only' && (
          <Segmented<Theme>
            label="Theme"
            value={entry.theme}
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
            onChange={(t) => props.onEdit('theme', (e) => ({ ...e, theme: t }))}
          />
        )}
        <Segmented<Layout> label="Layout" value={pending ?? shownLayout} options={layoutOptions} onChange={chooseLayout} />
        {(layout !== 'type-only' || pending) && (
          <Picker
            current={entry.image}
            originalSheet={props.originalSheet}
            sources={props.sources}
            extra={extraSources}
            open={pickerOpen}
            setOpen={setPickerOpen}
            onChoose={chooseSource}
            onUploaded={props.onUploaded}
          />
        )}
        {canVideo && (
          <>
            {video ? (
              <>
                <button type="button" className="lp-quiet" disabled={videoBusy} onClick={() => videoInput.current?.click()}>
                  Replace video
                </button>
                <button type="button" className="lp-quiet" disabled={videoBusy} onClick={removeVideo}>
                  Remove video
                </button>
              </>
            ) : (
              <button type="button" className="lp-quiet" disabled={videoBusy} onClick={() => videoInput.current?.click()}>
                Add video
              </button>
            )}
            <input
              ref={videoInput}
              type="file"
              accept="video/mp4"
              aria-label="Video file"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) addVideo(f)
              }}
            />
          </>
        )}
      </div>

      {video && (
        <div className="lp-video">
          <video src={`/${video.src.replace(/^public\//, '')}?v=${video.version ?? ''}`} muted loop autoPlay playsInline aria-label="Video preview" />
          <div className="lp-video-meta">
            <span className="lp-num">
              {props.videoBytes === null ? `File missing: ${video.src}, ` : `${mb(props.videoBytes)}, `}
              {video.width}×{video.height}
            </span>
            <span>Plays in Messages. Other apps show the image.</span>
            {overLimit && (
              <span className="lp-alert" role="alert">
                <span className="lp-dot" />
                The saved image and this video come to {mb(props.imageBytes! + props.videoBytes!)}, over the 10 MB Messages loads for one link.
              </span>
            )}
          </div>
        </div>
      )}

      {(fit?.overflow || statusNote) && (
        <div className="lp-status">
          {fit?.overflow && layout !== 'image-only' && (
            <span className="lp-alert" role="alert">
              <span className="lp-dot" />
              The title doesn’t fit, even at 40px. Shorten it or break it differently.
            </span>
          )}
          {statusNote && <span role="status">{statusNote}</span>}
        </div>
      )}
    </div>
  )
}

// ---------- Template view ----------

function promptFor(registry: string) {
  return {
    before: 'I want a new share image template for this site.\n\nWhat I want: ',
    slot: '[Describe it: where the title and image go, the colors, the type, anything else.]',
    after: `\n\nRead the comment at the top of ${registry || 'the file that defines the share image templates'} first. It explains how templates work and the rules to keep. Add mine there as a new template, and don't change the existing ones. It will appear in the Template gallery of the Link Previews tool.`,
  }
}

function TemplateGallery(props: {
  doc: Doc
  system: Manifest['system']
  ready: boolean
  sample: Entry
  registry: string
  onTemplate: (t: TemplateName) => void
  onColor: (c: string) => void
}) {
  const [copied, setCopied] = useState(false)
  const prompt = promptFor(props.registry)
  const copy = async () => {
    const text = prompt.before + prompt.slot + prompt.after
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }
  const color = props.doc.color ?? '#000000'
  return (
    <div className="lp-gallery">
      {TEMPLATE_NAMES.map((name) => {
        const t = TEMPLATES[name]
        const current = props.doc.template === name
        return (
          <figure key={name} className="lp-card" data-current={current || undefined}>
            <Scaled>
              <Frame
                entry={props.sample}
                system={{ ...props.system, template: name, color: props.doc.color }}
                template={name}
                ready={props.ready}
              />
            </Scaled>
            <figcaption className="lp-caption">
              <span className="lp-ellipsis">{t.label}</span>
              {t.uses.color && (
                <label className="lp-color">
                  <span className="lp-color-dot" style={{ background: color }} />
                  {color.toUpperCase()}
                  <Chevron />
                  <input type="color" aria-label={`${t.label} background color`} value={color} onChange={(e) => props.onColor(e.target.value.toLowerCase())} />
                </label>
              )}
              {current && <span className="lp-current">Current</span>}
            </figcaption>
            <button type="button" className="lp-card-button" aria-pressed={current} onClick={() => !current && props.onTemplate(name)}>
              <span className="lp-sr">{current ? `${t.label}, the current template` : `Use ${t.label} for every page`}</span>
            </button>
          </figure>
        )
      })}
      <figure className="lp-card">
        <div className="lp-prompt">
          <p className="lp-prompt-text">
            {prompt.before}
            <span className="lp-slot">{prompt.slot}</span>
            {prompt.after}
          </p>
          <button type="button" className="lp-quiet" onClick={copy}>
            {copied ? 'Copied' : 'Copy prompt'}
          </button>
        </div>
        <figcaption className="lp-caption">
          <span className="lp-ellipsis">Make your own</span>
        </figcaption>
      </figure>
    </div>
  )
}
