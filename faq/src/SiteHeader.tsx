import { useCallback, useRef, useState } from 'react'
import { useDismiss } from './useDismiss'
import menu from './assets/icons/menu.svg'

// The "AI at Wolf" product menu. Only the FAQ exists; the rest are
// placeholders for the presentation, so they are marked "Soon" and go nowhere.
const PRODUCTS = [
  { id: 'faq', name: 'FAQ', blurb: 'How the firm uses AI, answered', live: true },
  { id: 'policy', name: 'AI policy', blurb: 'The rules, in plain language', live: false },
  { id: 'tools', name: 'Approved tools', blurb: 'What you can use, and for what', live: false },
  { id: 'prompts', name: 'Prompt library', blurb: 'Tested prompts for common tasks', live: false },
  { id: 'training', name: 'Training', blurb: 'Courses and office hours', live: false },
  { id: 'request', name: 'Request a tool', blurb: 'Propose something for review', live: false },
  { id: 'updates', name: 'Updates', blurb: 'What changed, and when', live: false },
]

export function SiteHeader() {
  const [open, setOpen] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(open, panel, trigger, close)

  return (
    <header className="site-header">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <a className="wordmark" href="#">
        AI at wolf greenfield
      </a>
      <div className="popover-anchor">
        <button
          ref={trigger}
          type="button"
          className="icon-button"
          aria-label="AI at Wolf products"
          aria-expanded={open}
          aria-controls="site-menu"
          onClick={() => setOpen((o) => !o)}
        >
          <img src={menu} alt="" width={23} height={23} />
        </button>
        <nav
          ref={panel}
          id="site-menu"
          className="popover popover-menu"
          data-open={open || undefined}
          inert={!open}
          aria-label="AI at Wolf products"
        >
          <p className="popover-label">AI at Wolf</p>
          <ul>
            {PRODUCTS.map((p) => (
              <li key={p.id}>
                <a
                  className="popover-item product-item"
                  href={p.live ? '#' : undefined}
                  aria-current={p.live ? 'page' : undefined}
                  aria-disabled={p.live ? undefined : true}
                  onClick={() => p.live && setOpen(false)}
                >
                  <span className="popover-item-text">
                    <span className="product-name">{p.name}</span>
                    <span className="product-blurb">{p.blurb}</span>
                  </span>
                  {p.live ? (
                    <span className="product-tag product-tag-current">Current</span>
                  ) : (
                    <span className="product-tag">Soon</span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  )
}
