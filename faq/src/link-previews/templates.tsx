/*
 * Link Previews: share image templates.
 *
 * Every share image is one 1200×630 frame, drawn by one template here and
 * captured at 2× (2400×1260) by the dev-only Link Previews tool. The tool's
 * previews, its All grid, its Template gallery and the capture all render
 * these same components; there is no second renderer.
 *
 * Adding a template:
 *  1. Add its name and `uses` to shared.ts (TEMPLATE_NAMES, TEMPLATE_USES,
 *     TEMPLATE_LABELS). The save endpoint validates names from there.
 *  2. Write a Frame component below from the shared parts (FrameRoot,
 *     TextColumn, FittedTitle, Panel) and add one entry to TEMPLATES with
 *     its titleBox and imageBox.
 *  3. Don't change an existing template: every saved image was drawn by one.
 *  It appears in the tool's Template view.
 *
 * Rules every template keeps:
 *  - Inline styles only, every element carrying its own box model (the
 *    capture serializes the DOM, so classes and host resets can't travel).
 *  - A plain <img>, never a framework image component, because the capture
 *    needs the real source URL. This is the one place the site uses plain
 *    <img> for that reason.
 *  - The title drawn through FittedTitle, so the tool and the capture fit it
 *    the same way. No negative tracking.
 *  - Type only when entry.image is null, never a placeholder. Sheets and both
 *    themes handled. The text's bottom inset is system.textBottom.
 *  - Values come from the manifest's system block; geometry is in frame px.
 */
import type { CSSProperties, ReactNode } from 'react'
import { familyCss, fitTitle, type Fit } from './fit'
import {
  TEMPLATE_LABELS,
  TEMPLATE_USES,
  isSheet,
  isSingle,
  layoutOf,
  templateName,
  type Entry,
  type Image,
  type System,
  type TemplateName,
  type Uses,
} from './shared'

export type Box = { x: number; y: number; width: number; height: number }
export type TitleSlot = { text: string; style: CSSProperties; fit: Fit }
export type FrameProps = {
  entry: Entry
  system: System
  ready: boolean
  /** The tool passes this to make the title editable; the capture leaves it out. */
  renderTitle?: (slot: TitleSlot) => ReactNode
}

// Sources in the sources folder load through the dev-only source route; any
// other source is a path under the served folder.
let resolveSource = (src: string) => '/' + src.replace(/^public\//, '')
export function setSourceResolver(fn: (src: string) => string) {
  resolveSource = fn
}
export const sourceUrl = (src: string) => resolveSource(src)

const RESET: CSSProperties = {
  boxSizing: 'border-box',
  margin: 0,
  padding: 0,
  border: 0,
  minWidth: 0,
  letterSpacing: 'normal',
  textTransform: 'none',
  textAlign: 'left',
  fontStyle: 'normal',
}

// ---------- Geometry ----------

const labelLine = (s: System) => Math.round(s.labelSize * s.labelLineHeight)
const textBottom = (s: System) => s.textBottom ?? s.margin
const titleHeight = (s: System) => 630 - s.margin - textBottom(s) - labelLine(s) - s.labelGap
const fullTitle = (s: System) => ({ width: 1200 - 2 * s.margin, height: titleHeight(s) })

// ---------- Shared parts ----------

function FrameRoot({ background, system, children }: { background: string; system: System; children: ReactNode }) {
  return (
    <div
      data-og-frame=""
      style={{
        ...RESET,
        position: 'relative',
        display: 'flex',
        width: 1200,
        height: 630,
        overflow: 'hidden',
        background,
        fontFamily: familyCss(system.font.family),
        fontOpticalSizing: 'auto',
      }}
    >
      {children}
    </div>
  )
}

function TextColumn(props: {
  width: number
  padding: [number, number, number, number]
  system: System
  labelColor: string
  children: ReactNode
}) {
  const { system } = props
  return (
    <div
      style={{
        ...RESET,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        flex: 'none',
        width: props.width,
        height: 630,
        padding: props.padding.map((n) => `${n}px`).join(' '),
      }}
    >
      <div
        style={{
          ...RESET,
          flex: 'none',
          fontWeight: system.font.labelWeight,
          fontSize: system.labelSize,
          lineHeight: system.labelLineHeight,
          color: props.labelColor,
          whiteSpace: 'nowrap',
        }}
      >
        {system.domain}
      </div>
      <div style={{ ...RESET, flexGrow: 1 }} />
      {props.children}
    </div>
  )
}

export function FittedTitle(props: {
  text: string
  color: string
  box: { width: number; height: number }
  system: System
  ready: boolean
  renderTitle?: (slot: TitleSlot) => ReactNode
}) {
  const { system, box } = props
  const fit = props.ready ? fitTitle(props.text, system, box) : { size: system.titleSize.max, lines: 1, overflow: false }
  const style: CSSProperties = {
    ...RESET,
    display: 'block',
    width: box.width,
    fontFamily: familyCss(system.font.family),
    fontOpticalSizing: 'auto',
    fontWeight: system.font.titleWeight,
    fontSize: fit.size,
    lineHeight: system.lineHeight,
    color: props.color,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'normal',
    wordBreak: 'normal',
    visibility: props.ready ? 'visible' : 'hidden',
  }
  if (props.renderTitle) return <>{props.renderTitle({ text: props.text, style, fit })}</>
  return (
    <span data-og-title="" style={style}>
      {props.text}
    </span>
  )
}

function Img({ src, style }: { src: string; style: CSSProperties }) {
  return (
    <img
      src={sourceUrl(src)}
      alt=""
      draggable={false}
      style={{ ...RESET, display: 'block', maxWidth: 'none', maxHeight: 'none', objectFit: 'cover', ...style }}
    />
  )
}

export function Panel({ image, box, system, style }: { image: Image; box: Box; system: System; style?: CSSProperties }) {
  if (!image) return null
  let content: ReactNode = null
  if (isSingle(image)) {
    const pos = `${image.focus.x * 100}% ${image.focus.y * 100}%`
    const zoom = image.zoom && image.zoom !== 1 ? image.zoom : null
    content = (
      <Img
        src={image.src}
        style={{
          width: box.width,
          height: box.height,
          objectPosition: pos,
          transformOrigin: pos,
          transform: zoom ? `scale(${zoom})` : 'none',
        }}
      />
    )
  } else if (isSheet(image)) {
    const n = image.sheet.length
    const cols = Math.max(1, image.columns)
    const rows = Math.ceil(n / cols)
    const cw = Math.floor(box.width / cols)
    const ch = Math.floor(box.height / rows)
    content = image.sheet.map((src, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      return (
        <Img
          key={i}
          src={src}
          style={{
            position: 'absolute',
            left: col * cw,
            top: row * ch,
            width: col === cols - 1 ? box.width - cw * (cols - 1) : cw,
            height: row === rows - 1 ? box.height - ch * (rows - 1) : ch,
          }}
        />
      )
    })
  }
  return (
    <div
      data-og-panel=""
      style={{
        ...RESET,
        position: 'relative',
        flex: 'none',
        width: box.width,
        height: box.height,
        overflow: 'hidden',
        background: system.colors.panel,
        ...style,
      }}
    >
      {content}
    </div>
  )
}

// ---------- Plate ----------

function plateTitle(entry: Entry, s: System) {
  return entry.image ? { width: 1200 - s.panelWidth - s.margin - s.panelGap, height: titleHeight(s) } : fullTitle(s)
}
function plateImage(entry: Entry, s: System): Box | null {
  return entry.image ? { x: 1200 - s.panelWidth, y: 0, width: s.panelWidth, height: 630 } : null
}
function Plate({ entry, system, ready, renderTitle }: FrameProps) {
  const c = system.colors[entry.theme]
  const box = plateImage(entry, system)
  return (
    <FrameRoot background={c.background} system={system}>
      <TextColumn
        width={box ? 1200 - system.panelWidth : 1200}
        padding={[system.margin, box ? system.panelGap : system.margin, textBottom(system), system.margin]}
        system={system}
        labelColor={c.label}
      >
        <FittedTitle text={entry.title} color={c.ink} box={plateTitle(entry, system)} system={system} ready={ready} renderTitle={renderTitle} />
      </TextColumn>
      {box && <Panel image={entry.image} box={box} system={system} />}
    </FrameRoot>
  )
}

// ---------- Poster ----------

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
function contrast(a: string, b: string) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}
function mix(ink: string, bg: string, a: number) {
  const ch = (hex: string, i: number) => parseInt(hex.slice(i, i + 2), 16)
  return (
    '#' +
    [1, 3, 5]
      .map((i) => Math.round(ch(ink, i) * a + ch(bg, i) * (1 - a)))
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  )
}
const HEX = /^#[0-9a-f]{6}$/i
export function posterColors(system: System) {
  const background = system.color && HEX.test(system.color) ? system.color.toLowerCase() : '#000000'
  const light = system.colors.dark.ink
  const dark = system.colors.light.ink
  const useLight = !HEX.test(dark) || (HEX.test(light) && contrast(light, background) >= contrast(dark, background))
  const ink = useLight ? light : dark
  let label = ink
  if (HEX.test(ink)) {
    const mixed = mix(ink, background, useLight ? 0.72 : 0.6)
    if (contrast(mixed, background) >= 4.5) label = mixed
  }
  return { background, ink, label }
}
function Poster({ entry, system, ready, renderTitle }: FrameProps) {
  const c = posterColors(system)
  return (
    <FrameRoot background={c.background} system={system}>
      <TextColumn width={1200} padding={[system.margin, system.margin, textBottom(system), system.margin]} system={system} labelColor={c.label}>
        <FittedTitle text={entry.title} color={c.ink} box={fullTitle(system)} system={system} ready={ready} renderTitle={renderTitle} />
      </TextColumn>
    </FrameRoot>
  )
}

// ---------- Inset ----------

function insetCard(s: System): Box {
  const height = 630 - 2 * s.margin
  const width = Math.round((height * s.panelWidth) / 630)
  return { x: 1200 - s.margin - width, y: s.margin, width, height }
}
function insetTitle(entry: Entry, s: System) {
  return entry.image ? { width: insetCard(s).x - s.margin - s.panelGap, height: titleHeight(s) } : fullTitle(s)
}
function Inset({ entry, system, ready, renderTitle }: FrameProps) {
  const c = system.colors[entry.theme]
  const card = entry.image ? insetCard(system) : null
  return (
    <FrameRoot background={c.background} system={system}>
      <TextColumn
        width={card ? card.x : 1200}
        padding={[system.margin, card ? system.panelGap : system.margin, textBottom(system), system.margin]}
        system={system}
        labelColor={c.label}
      >
        <FittedTitle text={entry.title} color={c.ink} box={insetTitle(entry, system)} system={system} ready={ready} renderTitle={renderTitle} />
      </TextColumn>
      {card && (
        <Panel image={entry.image} box={card} system={system} style={{ position: 'absolute', left: card.x, top: card.y, borderRadius: 24 }} />
      )}
    </FrameRoot>
  )
}

// ---------- Image only (skips the template) ----------

export const FULL_FRAME: Box = { x: 0, y: 0, width: 1200, height: 630 }
function ImageOnly({ entry, system }: FrameProps) {
  return (
    <FrameRoot background={system.colors.panel} system={system}>
      <Panel image={entry.image} box={FULL_FRAME} system={system} />
    </FrameRoot>
  )
}

// ---------- Registry ----------

export type Template = {
  label: string
  uses: Uses
  titleBox: (entry: Entry, system: System) => { width: number; height: number }
  imageBox: (entry: Entry, system: System) => Box | null
  Frame: (props: FrameProps) => ReactNode
}

export const TEMPLATES: Record<TemplateName, Template> = {
  plate: { label: TEMPLATE_LABELS.plate, uses: TEMPLATE_USES.plate, titleBox: plateTitle, imageBox: plateImage, Frame: Plate },
  poster: { label: TEMPLATE_LABELS.poster, uses: TEMPLATE_USES.poster, titleBox: (_e, s) => fullTitle(s), imageBox: () => null, Frame: Poster },
  inset: {
    label: TEMPLATE_LABELS.inset,
    uses: TEMPLATE_USES.inset,
    titleBox: insetTitle,
    imageBox: (e, s) => (e.image ? insetCard(s) : null),
    Frame: Inset,
  },
}

/** The entry as a template draws it: Type only pages arrive with no image. */
export function drawnEntry(entry: Entry): Entry {
  return layoutOf(entry) === 'type-only' ? { ...entry, image: null } : entry
}

/** The one frame every view renders: Image only, or the template's own. */
export function Frame(props: FrameProps & { template: TemplateName }) {
  if (layoutOf(props.entry) === 'image-only') return <ImageOnly {...props} />
  const T = TEMPLATES[templateName(props.template)]
  return <T.Frame {...props} entry={drawnEntry(props.entry)} />
}

/** Where a page's title is fitted, or null for Image only. */
export function titleBoxFor(entry: Entry, system: System, template: TemplateName) {
  if (layoutOf(entry) === 'image-only') return null
  return TEMPLATES[template].titleBox(drawnEntry(entry), system)
}
/** Where a page's image sits, for the crop target. */
export function imageBoxFor(entry: Entry, system: System, template: TemplateName) {
  if (layoutOf(entry) === 'image-only') return entry.image ? FULL_FRAME : null
  return TEMPLATES[template].imageBox(drawnEntry(entry), system)
}
