import { useEffect, useRef, useState, type FormEvent } from 'react'
import { citations, splitSentences, type Question } from './data'
import { SourceBadge } from './SourceStack'

const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

type Props = {
  question: Question | null
  onClose: () => void
}

// A native <dialog> opened with showModal() gives us the focus trap, Escape
// to close, inert background and focus return to the trigger for free.
export function DetailSheet({ question, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  // Keep showing the last question while the sheet slides out, instead of
  // animating an empty panel.
  const shown = useRef(question)
  if (question) shown.current = question
  const q = shown.current

  // Source highlighting: hovering or focusing a source previews the sentences
  // it supports; clicking pins it until clicked again.
  const [hovered, setHovered] = useState<number | null>(null)
  const [pinned, setPinned] = useState<number | null>(null)
  const active = hovered ?? pinned

  const [followUp, setFollowUp] = useState('')
  const [sent, setSent] = useState(false)
  const sentTimer = useRef(0)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (question && !d.open) {
      setHovered(null)
      setPinned(null)
      setFollowUp('')
      setSent(false)
      d.showModal()
    }
    if (!question && d.open) d.close()
  }, [question])
  useEffect(() => () => clearTimeout(sentTimer.current), [])

  function send(e: FormEvent) {
    e.preventDefault()
    if (!followUp.trim()) return
    // Prototype: nothing is sent; clear the field and confirm on the button.
    setFollowUp('')
    setSent(true)
    clearTimeout(sentTimer.current)
    sentTimer.current = window.setTimeout(() => setSent(false), 1800)
  }

  const sentences = q ? splitSentences(q.answer) : []
  const cited = q ? citations(q) : []
  const lit = active === null ? null : new Set(cited[active])

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby="sheet-title"
      onClose={onClose}
      onClick={(e) => {
        // Clicks on the backdrop land on the dialog element itself.
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {q && (
        <div className="sheet-inner">
          <div className="sheet-top">
            <p className="sheet-kicker">Updated {dateFmt.format(new Date(q.updated + 'T12:00:00'))}</p>
            <button type="button" className="pill pill-ghost sheet-close" onClick={onClose}>
              Close
            </button>
          </div>
          <h2 id="sheet-title" className="sheet-title">
            {q.question}
          </h2>
          <p className="sheet-answer" data-focus={lit ? true : undefined}>
            {sentences.map((t, n) => (
              <span key={n} className="sheet-sentence" data-cited={lit?.has(n) || undefined}>
                {t}
              </span>
            ))}
          </p>

          <h3 className="sheet-label">Sources</h3>
          <ul className="sheet-sources">
            {q.sources.map((s, i) => (
              <li key={s.title}>
                <button
                  type="button"
                  className="sheet-source"
                  aria-pressed={pinned === i}
                  data-active={active === i || undefined}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(i)}
                  onBlur={() => setHovered(null)}
                  onClick={() => setPinned((p) => (p === i ? null : i))}
                >
                  <SourceBadge kind={s.kind} />
                  <span>
                    <span className="sheet-source-title">{s.title}</span>
                    <span className="sheet-source-detail">{s.detail}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <form className="sheet-foot" onSubmit={send}>
            <label htmlFor="sheet-follow-up" className="sr-only">
              Ask a follow up
            </label>
            <input
              id="sheet-follow-up"
              className="sheet-input"
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
              placeholder="Ask a follow up"
              autoComplete="off"
            />
            <button
              type="submit"
              className="send-icon"
              aria-label={sent ? 'Follow-up sent' : 'Send follow-up'}
              // Nothing to send until there's text; the check state stays lit.
              disabled={!sent && !followUp.trim()}
              data-sent={sent || undefined}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                {sent ? (
                  <path d="M4 9.5 7.5 13 14 5.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                ) : (
                  <path d="M9 14.5v-11M4.5 8 9 3.5 13.5 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                )}
              </svg>
            </button>
            <p className="sr-only" role="status">
              {sent ? 'Follow-up sent.' : ''}
            </p>
          </form>
        </div>
      )}
    </dialog>
  )
}
