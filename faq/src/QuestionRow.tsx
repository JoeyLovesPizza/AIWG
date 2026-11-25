import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Question } from './data'
import { Highlight } from './Highlight'
import { parse, match } from './search'
import { SourceStack } from './SourceStack'
import chevron from './assets/icons/chevron-down.svg'
import expand from './assets/icons/height.svg'

type Props = {
  q: Question
  open: boolean
  query: string
  onToggle: () => void
  onDetails: () => void
}

export function QuestionRow({ q, open, query, onToggle, onDetails }: Props) {
  const panelId = `a-${q.id}`
  // Answers open on their TL;DR; the gutter icon swaps to the full answer.
  const [full, setFull] = useState(false)
  // Only fade the text in after a switch, never on first render.
  const [swapped, setSwapped] = useState(false)
  const answerRef = useRef<HTMLDivElement>(null)
  const lastHeight = useRef(0)

  // A search hit that only exists in the full answer switches to it, so the
  // highlighted match is actually on screen.
  useEffect(() => {
    const m = match(parse(query), q)
    if (m && m.inAnswer && !m.inTldr && query.trim()) setFull(true)
  }, [query, q])

  // Ease the height between the two lengths instead of jumping. Declared
  // before the measuring effect below so it still sees the old height.
  useLayoutEffect(() => {
    const el = answerRef.current
    if (!el || !lastHeight.current || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const to = el.offsetHeight
    if (to === lastHeight.current) return
    el.animate([{ height: `${lastHeight.current}px` }, { height: `${to}px` }], {
      duration: 250,
      easing: 'cubic-bezier(0.32, 0.72, 0, 1)',
    })
  }, [full])
  useLayoutEffect(() => {
    if (answerRef.current) lastHeight.current = answerRef.current.offsetHeight
  })

  const label = full ? 'Show TL;DR' : 'Show full answer'
  const toggleLength = () => {
    setFull((f) => !f)
    setSwapped(true)
  }

  return (
    <li id={`q-${q.id}`} className="q" data-open={open || undefined}>
      {/* The gutter control only shows while open, matching the sketch. */}
      <div className="q-gutter" inert={!open}>
        <button
          type="button"
          className="icon-button q-details"
          onClick={toggleLength}
          aria-label={label}
          aria-controls={panelId}
        >
          <img src={expand} alt="" width={33} height={33} />
          <span className="tooltip" aria-hidden>
            {label}
          </span>
        </button>
      </div>

      <div className="q-body">
        <h3 className="q-heading">
          <button
            type="button"
            className="q-trigger"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={onToggle}
          >
            <span className="q-text">
              <Highlight text={q.question} query={query} />
            </span>
            <img className="q-chevron" src={chevron} alt="" width={29} height={29} />
          </button>
        </h3>

        <div id={panelId} className="q-panel" inert={!open}>
          <div className="q-panel-inner">
            <div ref={answerRef} className="q-answer-wrap">
              <p className="q-mode">{full ? 'Full answer' : 'TL;DR'}</p>
              {/* Keyed so the new text fades in when the length switches. */}
              <p key={full ? 'full' : 'tldr'} className={swapped ? 'q-answer q-answer-swapped' : 'q-answer'}>
                <Highlight text={full ? q.answer : q.tldr} query={query} />
              </p>
            </div>
            <div className="q-pills">
              <button type="button" className="sources-pill" onClick={onDetails}>
                <SourceStack kinds={q.sources.map((s) => s.kind)} />
                {q.sources.length} {q.sources.length === 1 ? 'source' : 'sources'}
              </button>
              {/* Phones have no room for the gutter icon, so the length switch
                  sits here as a pill instead (hidden on wider screens). */}
              <button type="button" className="sources-pill q-length-pill" onClick={toggleLength} aria-controls={panelId}>
                {full ? 'TL;DR' : 'Full answer'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </li>
  )
}
