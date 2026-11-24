// Hero illustration: an isometric card index. A lens sweeps over the stack,
// settles, and one card slides out with its tab lit: "this is where the
// answer is." Geometry is computed once from 3D points so every line agrees
// with the same isometric projection; motion is plain CSS (styles.css, "Hero
// graphic") on whole groups, translated along the same iso axes.

const CX = 136
const CY = 186
const COS = Math.cos(Math.PI / 6)
const SIN = 0.5

function iso(x: number, y: number, z: number): [number, number] {
  return [CX + (x - y) * COS, CY + (x + y) * SIN - z]
}
function poly(pts: [number, number, number][]) {
  return pts.map((p) => iso(...p).map((n) => n.toFixed(1)).join(',')).join(' ')
}
function line(a: [number, number, number], b: [number, number, number]) {
  const [x1, y1] = iso(...a)
  const [x2, y2] = iso(...b)
  return { x1, y1, x2, y2 }
}

const W = 65 // half card width (x)
const D = 45 // half card depth (y)
const GAP = 12
const CARDS = 7
const TARGET = 3
// Index tabs sit on the front-right edge at staggered positions, like a real
// file; the target card slides out that way, tab first.
const TAB_Y = [-38, -10, 18, -24, 4, -38, 18]

function Card({ i, target = false }: { i: number; target?: boolean }) {
  const z = i * GAP
  const ty = TAB_Y[i]
  return (
    <g className={target ? 'hg-card hg-target' : 'hg-card'}>
      <polygon className="hg-face" points={poly([[-W, -D, z], [W, -D, z], [W, D, z], [-W, D, z]])} />
      <polygon
        className={target ? 'hg-tab hg-tab-target' : 'hg-tab'}
        points={poly([[W, ty, z], [W + 10, ty, z], [W + 10, ty + 20, z], [W, ty + 20, z]])}
      />
      {/* two ruled lines on each card, like an index card */}
      <line className="hg-rule" {...line([-W + 12, -D + 18, z], [W - 30, -D + 18, z])} />
      <line className="hg-rule" {...line([-W + 12, -D + 30, z], [W - 50, -D + 30, z])} />
    </g>
  )
}

export function HeroGraphic() {
  const top = (CARDS - 1) * GAP
  const corners: [number, number][] = [[-W, -D], [W, -D], [W, D], [-W, D]]
  const ticks = Array.from({ length: 27 }, (_, k) => -W + k * 5)
  const lensZ = top + 52
  const [lx, ly] = iso(0, 0, lensZ)
  const [gx, gy] = iso(0, 0, top)
  const r = 30
  const [labelX, labelY] = iso(W + 55, D, TARGET * GAP)

  return (
    <svg className="hero-art" viewBox="6 16 280 280" role="img" aria-label="A lens finding one card in a card index">
      {/* base plate and construction lines */}
      <polygon className="hg-dash" points={poly([[-W - 14, -D - 14, -8], [W + 14, -D - 14, -8], [W + 14, D + 14, -8], [-W - 14, D + 14, -8]])} />
      {corners.map(([x, y]) => (
        <line key={`${x}${y}`} className="hg-dash" {...line([x, y, -8], [x, y, top])} />
      ))}

      {/* ruler along the back edge of the plate */}
      <line className="hg-line" {...line([-W, -D - 14, -8], [W, -D - 14, -8])} />
      {ticks.map((x, k) => (
        <line key={x} className="hg-tick" {...line([x, -D - 14, -8], [x, -D - 14 - (k % 5 === 0 ? 7 : 4), -8])} />
      ))}

      {/* the stack, bottom card first so each face hides the one below */}
      {Array.from({ length: CARDS }, (_, i) =>
        i === TARGET ? (
          <g key={i} className="hg-pull">
            <Card i={i} target />
          </g>
        ) : (
          <Card key={i} i={i} />
        ),
      )}

      {/* label for the found card */}
      <g className="hg-label">
        <line className="hg-dash" x1={labelX} y1={labelY + 4} x2={labelX} y2={labelY + 22} />
        <text x={labelX - 2} y={labelY + 34} className="hg-text">
          Q.04
        </text>
        <text x={labelX - 2} y={labelY + 46} className="hg-text hg-text-dim">
          Answer
        </text>
      </g>

      {/* lens: an iso circle hovering over the stack, with a drop line */}
      <g className="hg-lens">
        <line className="hg-dash" x1={lx} y1={ly} x2={gx} y2={gy} />
        <ellipse className="hg-lens-ring" cx={lx} cy={ly} rx={r * Math.SQRT2 * COS} ry={r * Math.SQRT2 * SIN} />
        <ellipse className="hg-line" cx={lx} cy={ly} rx={(r - 6) * Math.SQRT2 * COS} ry={(r - 6) * Math.SQRT2 * SIN} />
        <line className="hg-tick" x1={lx - 6} y1={ly} x2={lx + 6} y2={ly} />
        <line className="hg-tick" x1={lx} y1={ly - 4} x2={lx} y2={ly + 4} />
        <line
          className="hg-line"
          x1={lx + r * Math.SQRT2 * COS * 0.72}
          y1={ly + r * Math.SQRT2 * SIN * 0.72}
          x2={lx + r * Math.SQRT2 * COS * 1.5}
          y2={ly + r * Math.SQRT2 * SIN * 1.5}
        />
      </g>
    </svg>
  )
}
