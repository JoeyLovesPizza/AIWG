import { useEffect, useRef, useState, type RefObject } from 'react'
import { useDialKit, type DialConfig } from 'dialkit'

// The footer "A.I.@" drawn as particles. The text is rendered once to an
// offscreen canvas in Geist Pixel, sampled on a grid, and each lit sample
// becomes a particle with a home position. The pointer pushes particles away;
// a spring pulls them home. The loop only runs while something is moving or
// the pointer is over the mark, so a resting footer costs nothing. On touch
// screens a tap pushes the particles out instead.
//
// Intro: particles start scattered and sweep into the letters left to right
// the moment any of the letters comes on screen (scrolled into view on a
// phone, or uncovered by the drawer on desktop). Once they're fully out of
// view again, the particles quietly re-scatter so the next reveal replays it.
// Reduced motion skips it.

// Shape and intro were tuned with Joe on DialKit and settled here.
const PARAMS = {
  shape: {
    fontSize: 149,
    step: 2, // sample spacing in CSS px
    dot: 1,
    pad: 52, // room for particles to trail without clipping
  },
  intro: {
    scatter: 90, // how far from home particles start, in px
    sweep: 40, // frames between the left and right edges starting
    jitter: 10, // random extra start delay per particle, in frames
  },
}

// The mouse and touch interactions are on the "A.I.@ interaction" DialKit
// panel (dev server only). The loop reads them live, so a slider retunes the
// running effect. Settle values there and copy them back as these defaults.
const DIALS = {
  mouse: {
    radius: [46, 5, 200, 1], // px around the cursor that feel it
    // A gentle outward push, plus a drag along the cursor's own motion: the
    // drag is what makes particles trail after it.
    push: [0.65, 0, 8, 0.05],
    drag: [0.24, 0, 1, 0.01],
    trailDecay: [0.115, 0, 0.995, 0.005], // how long the cursor's motion lingers
  },
  // Touch screens have no hover, so a tap pushes the particles out from the
  // finger in one burst and the spring brings them home.
  touch: {
    radius: [110, 20, 300, 1], // px around the finger that feel the push
    push: [21, 0, 40, 0.5], // outward velocity at the centre, px per frame
    testTap: { type: 'action', label: 'Test tap' },
  },
  // How both settle back into the letters.
  physics: {
    spring: [0.001, 0.0002, 0.2, 0.0002],
    damping: [0.99, 0.5, 0.998, 0.001],
  },
} satisfies DialConfig

type Particle = { x: number; y: number; vx: number; vy: number; hx: number; hy: number; delay: number }

export function ParticleMark({ text = 'A.I.@' }: { text?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const revealed = useRef(false)
  const dial = useDialKit('A.I.@ interaction', DIALS, {
    onAction: (action) => {
      if (action.endsWith('testTap')) ref.current?.dispatchEvent(new Event('testtap'))
    },
  })
  const live = useRef(dial)
  live.current = dial
  const { step: STEP, pad: PAD } = PARAMS.shape
  const fontSize = useFittedSize(ref, text)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    let cancelled = false
    let frame = 0
    let tick = 0 // frames since the intro started; particles wait for their delay
    let particles: Particle[] = []
    let width = 0
    let height = 0
    // vx/vy is the pointer's motion per frame; it decays after the pointer
    // stops or leaves, so the last movement still carries particles with it.
    const pointer = { x: 0, y: 0, vx: 0, vy: 0, inside: false }
    const still = matchMedia('(prefers-reduced-motion: reduce)')
    const font = `${fontSize}px "Geist Pixel Line"`

    function build() {
      const dpr = window.devicePixelRatio || 1
      ctx!.font = font
      width = Math.ceil(ctx!.measureText(text).width) + PAD * 2
      height = fontSize + PAD * 2
      canvas!.width = width * dpr
      canvas!.height = height * dpr
      canvas!.style.width = `${width}px`
      canvas!.style.height = `${height}px`

      // Sample at 1 CSS px per pixel so STEP is in CSS units.
      const off = document.createElement('canvas')
      off.width = width
      off.height = height
      const o = off.getContext('2d', { willReadFrequently: true })!
      o.font = font
      // Draw on the alphabetic baseline, lowered by the text's real ascent, so
      // the tops of the glyphs sit exactly PAD from the canvas top. That lets
      // CSS line the letters up with neighbouring text by their tops.
      const ascent = o.measureText(text).actualBoundingBoxAscent
      // Only the alpha channel is sampled, so the colour here is irrelevant.
      o.fillStyle = 'white'
      o.fillText(text, PAD, PAD + ascent)
      const data = o.getImageData(0, 0, width, height).data
      particles = []
      for (let y = 0; y < height; y += STEP) {
        for (let x = 0; x < width; x += STEP) {
          if (data[(y * width + x) * 4 + 3] > 128) particles.push({ x, y, vx: 0, vy: 0, hx: x, hy: y, delay: 0 })
        }
      }
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (!revealed.current && !still.matches) scatter()
      draw()
      onScroll()
    }

    function scatter() {
      const { scatter: dist, sweep, jitter } = PARAMS.intro
      tick = 0
      for (const p of particles) {
        const a = Math.random() * Math.PI * 2
        const r = dist * (0.35 + Math.random() * 0.65)
        p.x = p.hx + Math.cos(a) * r
        p.y = p.hy + Math.sin(a) * r
        p.vx = 0
        p.vy = 0
        p.delay = (p.hx / width) * sweep + Math.random() * jitter
      }
    }

    function draw() {
      ctx!.clearRect(0, 0, width, height)
      ctx!.fillStyle = getComputedStyle(canvas!).color
      const dot = PARAMS.shape.dot
      for (const p of particles) ctx!.fillRect(p.x, p.y, dot, dot)
    }

    function step() {
      frame = 0
      const { radius: RADIUS, push: PUSH, drag: DRAG, trailDecay } = live.current.mouse
      const { spring: SPRING, damping: DAMPING } = live.current.physics
      let moving = false
      const active = pointer.inside || Math.abs(pointer.vx) + Math.abs(pointer.vy) > 0.05
      tick++
      for (const p of particles) {
        if (p.delay > tick) {
          moving = true
          continue
        }
        if (active) {
          const dx = p.x - pointer.x
          const dy = p.y - pointer.y
          const d = Math.hypot(dx, dy)
          if (d < RADIUS && d > 0.01) {
            const falloff = 1 - d / RADIUS
            const push = pointer.inside ? falloff * PUSH : 0
            p.vx += (dx / d) * push + pointer.vx * falloff * DRAG
            p.vy += (dy / d) * push + pointer.vy * falloff * DRAG
          }
        }
        p.vx = (p.vx + (p.hx - p.x) * SPRING) * DAMPING
        p.vy = (p.vy + (p.hy - p.y) * SPRING) * DAMPING
        p.x += p.vx
        p.y += p.vy
        if (!moving && (Math.abs(p.vx) > 0.02 || Math.abs(p.vy) > 0.02 || Math.abs(p.hx - p.x) > 0.05)) moving = true
      }
      // Keep moving the ghost pointer along its last heading as it decays,
      // so particles keep being pulled after the cursor has left.
      if (!pointer.inside) {
        pointer.x += pointer.vx
        pointer.y += pointer.vy
      }
      pointer.vx *= trailDecay
      pointer.vy *= trailDecay
      draw()
      if (moving || active) frame = requestAnimationFrame(step)
    }

    function wake() {
      if (!frame && !still.matches) frame = requestAnimationFrame(step)
    }

    function onMove(e: PointerEvent) {
      // Hover is a mouse thing; a finger moving over the mark is a scroll.
      if (e.pointerType !== 'mouse') return
      const r = canvas!.getBoundingClientRect()
      const x = e.clientX - r.left
      const y = e.clientY - r.top
      if (pointer.inside) {
        // Smooth the velocity so one jumpy event doesn't fling the field.
        pointer.vx = pointer.vx * 0.5 + (x - pointer.x) * 0.5
        pointer.vy = pointer.vy * 0.5 + (y - pointer.y) * 0.5
      }
      pointer.x = x
      pointer.y = y
      pointer.inside = true
      wake()
    }
    function onLeave() {
      pointer.inside = false
    }
    // One outward burst from a point, strongest at the centre.
    function burst(x: number, y: number) {
      if (still.matches) return
      const { radius, push } = live.current.touch
      for (const p of particles) {
        const dx = p.x - x
        const dy = p.y - y
        const d = Math.hypot(dx, dy)
        if (d >= radius) continue
        // At the exact centre there's no direction, so pick a random one.
        const a = d > 0.01 ? Math.atan2(dy, dx) : Math.random() * Math.PI * 2
        const f = (1 - d / radius) * push
        p.vx += Math.cos(a) * f
        p.vy += Math.sin(a) * f
      }
      wake()
    }
    function onTap(e: PointerEvent) {
      if (e.pointerType === 'mouse') return
      const r = canvas!.getBoundingClientRect()
      burst(e.clientX - r.left, e.clientY - r.top)
    }
    // The panel's "Test tap", so the touch burst can be tuned with a mouse.
    const testTap = () => burst(width / 2, height / 2)

    document.fonts.load(font).then(() => {
      if (!cancelled) build()
    })
    // How much of the letters themselves (the canvas minus its trail room) is
    // on screen and uncovered: below the drawer's bottom edge, inside the
    // viewport. The intro starts the moment any of it shows and re-arms once
    // none does, so it plays on every reveal.
    const drawer = document.querySelector('.drawer')
    function letterExposure() {
      const r = canvas!.getBoundingClientRect()
      const top = Math.max(r.top + PAD, drawer?.getBoundingClientRect().bottom ?? 0, 0)
      const bottom = Math.min(r.bottom - PAD, window.innerHeight)
      return Math.max(0, bottom - top)
    }
    function onScroll() {
      if (still.matches || !particles.length) return
      const e = letterExposure()
      if (!revealed.current && e > 0) {
        revealed.current = true
        tick = 0
        wake()
      } else if (revealed.current && e === 0) {
        revealed.current = false
        cancelAnimationFrame(frame)
        frame = 0
        scatter()
        draw()
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    canvas.addEventListener('pointerdown', onTap)
    canvas.addEventListener('testtap', testTap)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerleave', onLeave)
    canvas.addEventListener('pointercancel', onLeave)
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      canvas.removeEventListener('pointerdown', onTap)
      canvas.removeEventListener('testtap', testTap)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerleave', onLeave)
      canvas.removeEventListener('pointercancel', onLeave)
    }
  }, [text, fontSize, STEP, PAD])


  return <canvas ref={ref} className="footer-mark" aria-hidden style={{ margin: -PAD }} />
}

// On phones the mark fills the footer's width, as in the mobile design;
// wider screens use the fixed size from PARAMS. Measured from the canvas's
// parent, so it follows rotation and resizing.
function useFittedSize(ref: RefObject<HTMLCanvasElement | null>, text: string) {
  const [size, setSize] = useState(PARAMS.shape.fontSize)
  useEffect(() => {
    const parent = ref.current?.parentElement
    if (!parent) return
    const narrow = matchMedia('(max-width: 900px)')
    const probe = document.createElement('canvas').getContext('2d')!
    let alive = true
    const update = () => {
      if (!narrow.matches) return setSize(PARAMS.shape.fontSize)
      probe.font = '100px "Geist Pixel Line"'
      const per100 = probe.measureText(text).width
      if (per100 > 0) setSize(Math.floor((parent.clientWidth / per100) * 100))
    }
    document.fonts.load('100px "Geist Pixel Line"').then(() => alive && update())
    const ro = new ResizeObserver(update)
    ro.observe(parent)
    narrow.addEventListener('change', update)
    return () => {
      alive = false
      ro.disconnect()
      narrow.removeEventListener('change', update)
    }
  }, [ref, text])
  return size
}
