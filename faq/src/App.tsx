import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { sections, type Question } from './data'
import { QuestionRow } from './QuestionRow'
import { DetailSheet } from './DetailSheet'
import { AskForm, type AskFormHandle } from './AskForm'
import { SiteHeader } from './SiteHeader'
import { SiteFooter } from './SiteFooter'
import { SectionsPopover } from './SectionsPopover'
import { scrollBehavior } from './motion'
import { HeroGraphic } from './HeroGraphic'
import { useDrawerReveal } from './useDrawerReveal'
import { parse, match, isEmpty, RELATIVE_CUTOFF } from './search'
import searchIcon from './assets/icons/search.svg'

export default function App() {
  // Every question starts closed.
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [detail, setDetail] = useState<Question | null>(null)
  const formRef = useRef<AskFormHandle>(null)
  const drawerRef = useRef<HTMLDivElement>(null)
  useDrawerReveal(drawerRef)

  // Fuzzy search (search.ts). Results keep their sections and are ranked
  // within each one, best match first.
  const parsed = useMemo(() => parse(deferredQuery), [deferredQuery])
  const searching = !isEmpty(parsed)
  const filtered = useMemo(() => {
    if (!searching) return sections.map((s, i) => ({ ...s, num: i + 1, visible: s.questions }))
    const scored = sections.map((s, i) => {
      const ranked = s.questions
        .map((q) => ({ q, score: match(parsed, q)?.score ?? -1 }))
        .filter((x) => x.score >= 0)
        .sort((a, b) => b.score - a.score)
      return { ...s, num: i + 1, ranked }
    })
    const top = Math.max(0, ...scored.flatMap((s) => s.ranked.map((x) => x.score)))
    return scored
      .map((s) => {
        const kept = s.ranked.filter((x) => x.score >= top * RELATIVE_CUTOFF)
        return { ...s, best: kept[0]?.score ?? 0, visible: kept.map((x) => x.q) }
      })
      .sort((a, b) => b.best - a.best)
  }, [parsed, searching])
  // A row that matched only in its TL;DR or answer is opened, so the reader
  // can see why it's in the results.
  useEffect(() => {
    if (!searching) return
    const ids = sections
      .flatMap((s) => s.questions)
      .filter((q) => {
        const m = match(parsed, q)
        return m && !m.inQuestion
      })
      .map((q) => q.id)
    if (ids.length) setOpen((prev) => new Set([...prev, ...ids]))
  }, [parsed, searching])

  const total = filtered.reduce((n, s) => n + s.visible.length, 0)

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // A jump clears the search first. The list renders from the deferred query,
  // so the target may not exist until that low-priority render commits; the
  // effect below waits for it instead of guessing with a frame delay.
  const [pendingJump, setPendingJump] = useState<{ id: string; fromSearch: boolean } | null>(null)
  const jumpTimer = useRef(0)

  useEffect(() => {
    if (!pendingJump || deferredQuery !== '') return
    const { id, fromSearch } = pendingJump
    if (!document.getElementById(`s-${id}`)) return
    setPendingJump(null)
    // Clearing a search brings back rows that may be mid-way through their
    // 250ms open animation, which would push the target after we scroll.
    // Wait for them to settle first. The timer lives in a ref, not the
    // effect's cleanup, because clearing pendingJump re-runs this effect.
    clearTimeout(jumpTimer.current)
    jumpTimer.current = window.setTimeout(
      () => {
        document.getElementById(`s-${id}`)?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' })
        document.getElementById(`s-${id}-title`)?.focus({ preventScroll: true })
      },
      fromSearch ? 280 : 0,
    )
  }, [pendingJump, deferredQuery, filtered])
  useEffect(() => () => clearTimeout(jumpTimer.current), [])

  function jumpToSection(id: string) {
    setPendingJump({ id, fromSearch: query.trim() !== '' })
    setQuery('')
  }


  function askAbout(text: string) {
    formRef.current?.prefill(text)
  }

  return (
    <>
      <SiteHeader />

      {/* The drawer slides up off the footer, which is pinned behind it. */}
      <div className="drawer" ref={drawerRef}>
      <main id="main" className="page">
        <section className="hero">
          <HeroGraphic />
          <div className="hero-copy">
            <h1 className="hero-title">Frequently asked questions</h1>
            <p className="hero-lede">
              We answer common questions about how Wolf Greenfield uses artificial intelligence (AI) in our legal work.
            </p>
            <p className="hero-note">Concept prototype · placeholder answers, not the firm’s official position</p>
          </div>
        </section>

        <section className="faq" aria-label="Questions">
          <div className="toolbar">
            <label className="search">
              <img src={searchIcon} alt="" width={20} height={20} />
              <span className="sr-only">Search questions</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by keyword or question"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <SectionsPopover onPick={jumpToSection} />
          </div>

          <p className="sr-only" aria-live="polite">
            {searching ? `${total} ${total === 1 ? 'question matches' : 'questions match'}` : ''}
          </p>

          {searching && total === 0 ? (
            <div className="empty">
              <p className="empty-title">No questions match “{deferredQuery.trim()}”.</p>
              <p className="empty-body">Try a shorter keyword, or send the question to the AI team and we’ll answer it.</p>
              <button type="button" className="pill pill-solid" onClick={() => askAbout(deferredQuery.trim())}>
                Ask the AI team
              </button>
            </div>
          ) : (
            <div className="sections">
              {filtered.map((s) =>
                s.visible.length === 0 ? null : (
                  <section key={s.id} id={`s-${s.id}`} className="section" aria-labelledby={`s-${s.id}-title`}>
                    <header className="section-head">
                      <span className="section-num">{String(s.num).padStart(2, '0')}</span>
                      <h2 id={`s-${s.id}-title`} className="section-title" tabIndex={-1}>
                        {s.title}
                      </h2>
                      <span className="section-count">
                        {searching ? `${s.visible.length} of ${s.questions.length}` : s.questions.length} questions
                      </span>
                    </header>
                    <ul className="questions">
                      {s.visible.map((q) => (
                        <QuestionRow
                          key={q.id}
                          q={q}
                          open={open.has(q.id)}
                          query={deferredQuery}
                          onToggle={() => toggle(q.id)}
                          onDetails={() => setDetail(q)}
                        />
                      ))}
                    </ul>
                  </section>
                ),
              )}
            </div>
          )}
        </section>

        <AskForm ref={formRef} />
      </main>
      </div>

      <SiteFooter />

      <DetailSheet question={detail} onClose={() => setDetail(null)} />
    </>
  )
}
