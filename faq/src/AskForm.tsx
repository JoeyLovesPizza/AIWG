import { useEffect, useImperativeHandle, useRef, useState, type FormEvent, type Ref } from 'react'
import { scrollBehavior } from './motion'

export type AskFormHandle = { prefill: (text: string) => void }

type Mode = 'ask' | 'suggest'

// idle → leaving (Send flips to "Sent" while each field's text fades up and
// out) → sent (values cleared, fields fade back in on their placeholders,
// Send holds its success state) → idle.
type Phase = 'idle' | 'leaving' | 'sent'

// Matches the CSS: a 180ms fade, staggered 40ms across up to four fields.
const LEAVE_MS = 300
const SENT_MS = 2400

function reducedMotion() {
  return matchMedia('(prefers-reduced-motion: reduce)').matches
}

// Nothing is sent anywhere: this is a presentation prototype, so sending
// only plays the clear-and-confirm sequence.
export function AskForm({ ref }: { ref: Ref<AskFormHandle> }) {
  const [mode, setMode] = useState<Mode>('ask')
  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [error, setError] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [announcement, setAnnouncement] = useState('')
  const questionRef = useRef<HTMLTextAreaElement>(null)
  const rootRef = useRef<HTMLElement>(null)
  const timers = useRef<number[]>([])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  useImperativeHandle(ref, () => ({
    prefill(text) {
      setMode('ask')
      setError(false)
      setQuestion(text)
      rootRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: 'center' })
      // Focus after the scroll starts so the caret lands at the end of the text.
      setTimeout(() => {
        const el = questionRef.current
        if (!el) return
        el.focus({ preventScroll: true })
        el.setSelectionRange(el.value.length, el.value.length)
      }, 50)
    },
  }))

  function clearFields() {
    setName('')
    setTitle('')
    setQuestion('')
    setAnswer('')
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (phase !== 'idle') return
    if (!question.trim()) {
      setError(true)
      questionRef.current?.focus()
      return
    }
    setAnnouncement(
      mode === 'ask'
        ? 'Question sent. The AI team will reply by email within two working days.'
        : 'Suggestion sent. The AI team reviews suggestions every Friday.',
    )
    const leave = reducedMotion() ? 0 : LEAVE_MS
    setPhase('leaving')
    timers.current.push(
      window.setTimeout(() => {
        clearFields()
        setPhase('sent')
      }, leave),
      window.setTimeout(() => {
        setPhase('idle')
        // Clear so the next send changes the live region and is announced.
        setAnnouncement('')
      }, leave + SENT_MS),
    )
  }

  const busy = phase !== 'idle'
  const sendLabel = mode === 'ask' ? 'Send' : 'Send suggestion'

  return (
    <section id="ask" ref={rootRef} className="ask" aria-labelledby="ask-title">
      <h2 id="ask-title" className="ask-title">
        Can’t find what you’re looking for?
        <br />
        Let us know.
      </h2>

      <div className="ask-card">
        <form className="ask-form" onSubmit={submit} noValidate data-phase={phase}>
          <div className="field">
            <label htmlFor="f-name">Name:</label>
            <input
              id="f-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Smith"
              autoComplete="name"
              readOnly={phase === 'leaving'}
            />
          </div>
          <div className="field">
            <label htmlFor="f-title">Title:</label>
            <input
              id="f-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Lead attorney of the practice management group"
              autoComplete="organization-title"
              readOnly={phase === 'leaving'}
            />
          </div>
          <div className="field field-grow" data-invalid={error || undefined}>
            <label htmlFor="f-question">Question:</label>
            <div className="field-stack">
              <textarea
                id="f-question"
                ref={questionRef}
                value={question}
                onChange={(e) => {
                  setQuestion(e.target.value)
                  if (error) setError(false)
                }}
                placeholder="Are attorneys and staff trained to use AI?"
                rows={mode === 'suggest' ? 2 : 4}
                aria-invalid={error}
                aria-describedby={error ? 'f-question-error' : undefined}
                readOnly={phase === 'leaving'}
              />
              {error && (
                <p id="f-question-error" className="field-error">
                  <span aria-hidden>!</span> Write your question before sending.
                </p>
              )}
            </div>
          </div>
          {mode === 'suggest' && (
            <div className="field field-grow">
              <label htmlFor="f-answer">Answer:</label>
              <textarea
                id="f-answer"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Optional. Draft an answer if you have one."
                rows={3}
                readOnly={phase === 'leaving'}
              />
            </div>
          )}

          <div className="ask-actions">
            {/* Both labels share one grid cell, so the pill is always as wide
                as the longer one and doesn't jump when it swaps. */}
            <button type="submit" className="pill pill-solid send-button" aria-disabled={busy}>
              <span className="send-label" aria-hidden={busy}>
                {sendLabel}
              </span>
              <span className="send-done" aria-hidden={!busy}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path
                    className="send-check"
                    d="M3 8.5 6.5 12 13 4.5"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    pathLength={1}
                  />
                </svg>
                Sent
              </span>
            </button>
            <button
              type="button"
              className="pill pill-ghost"
              disabled={busy}
              onClick={() => {
                setMode(mode === 'ask' ? 'suggest' : 'ask')
                setError(false)
              }}
            >
              {mode === 'ask' ? 'Submit your own FAQ' : 'Ask a question instead'}
            </button>
          </div>
          <p className="sr-only" role="status">
            {announcement}
          </p>
        </form>
      </div>
    </section>
  )
}
