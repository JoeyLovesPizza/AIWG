import { useEffect, useRef } from 'react'
import { footerExposure } from './reveal'

// The footer "A.I.@" drawn as particles. The text is rendered once to an
// offscreen canvas in Geist Pixel, sampled on a grid, and each lit sample
// becomes a particle with a home position. The pointer pushes particles away;
// a spring pulls them home. The loop only runs while something is moving or
// the pointer is over the mark, so a resting footer costs nothing.
//
// Intro: particles start scattered and sweep into the letters left to right
// each time the footer is fully revealed (the drawer above has slid off it).
// Once the drawer covers most of it again, the particles quietly re-scatter
// so the next reveal plays it again. Reduced motion skips it.

// Tuned on a DialKit panel with Joe; these are the settled values.
const PARAMS = {
  shape: {
    fontSize: 149,
    step: 2, // sample spacing in CSS px
    dot: 1,
    pad: 52, // room for particles to trail without clipping
  },
  pointer: {
    radius: 37,
    // A gentle outward push, plus a drag along the pointer's own motion:
    // the drag is what makes particles trail after the cursor.
    push: 2.1,
    drag: 0.69,
    trailDecay: 0.98, // how long the pointer's motion lingers
  },
  physics: {
    spring: 0.005,
    damping: 0.76,
  },
  intro: {
    scatter: 90, // how far from home particles start, in px
    sweep: 40, // frames between the left and right edges starting
    jitter: 10, // random extra start delay per particle, in frames
  },
}

// Revealed at 98% of the footer exposed; re-armed once it's 30% or less.
const REVEAL = 0.98
const REARM = 0.3

type Particle = { x: number; y: number; vx: number; vy: number; hx: number; hy: number; delay: number }

export function ParticleMark({ text = 'A.I.@' }: { text?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const revealed = useRef(false)
  const { fontSize, step: STEP, pad: PAD } = PARAMS.shape

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
      const { radius: RADIUS, push: PUSH, drag: DRAG, trailDecay } = PARAMS.pointer
      const { spring: SPRING, damping: DAMPING } = PARAMS.physics
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

    document.fonts.load(font).then(() => {
      if (!cancelled) build()
    })
    function onScroll() {
      if (still.matches || !particles.length) return
      const e = footerExposure()
      if (!revealed.current && e >= REVEAL) {
        revealed.current = true
        tick = 0
        wake()
      } else if (revealed.current && e <= REARM) {
        revealed.current = false
        cancelAnimationFrame(frame)
        frame = 0
        scatter()
        draw()
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerleave', onLeave)
    canvas.addEventListener('pointercancel', onLeave)
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerleave', onLeave)
      canvas.removeEventListener('pointercancel', onLeave)
    }
  }, [text, fontSize, STEP, PAD])


  return <canvas ref={ref} className="footer-mark" aria-hidden style={{ margin: -PAD }} />
}
