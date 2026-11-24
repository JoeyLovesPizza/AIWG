import { useCallback, useRef, useState } from 'react'
import { sections } from './data'
import { useDismiss, usePopoverSide } from './useDismiss'
import listIcon from './assets/icons/activity-log.svg'

// The toolbar's list button: every section in the FAQ, with its question
// count. Picking one clears any search and jumps to that section.
export function SectionsPopover({ onPick }: { onPick: (sectionId: string) => void }) {
  const [open, setOpen] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(open, panel, trigger, close)
  const side = usePopoverSide(open, panel, trigger)

  return (
    <div className="popover-anchor">
      <button
        ref={trigger}
        type="button"
        className="round-button"
        aria-label="All sections"
        aria-expanded={open}
        aria-controls="sections-panel"
        onClick={() => setOpen((o) => !o)}
      >
        <img src={listIcon} alt="" width={17} height={17} />
      </button>
      <nav
        ref={panel}
        id="sections-panel"
        className="popover"
        data-open={open || undefined}
        data-side={side}
        inert={!open}
        aria-label="All sections"
      >
        <p className="popover-label">Sections</p>
        <ul>
          {sections.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                className="popover-item"
                onClick={() => {
                  setOpen(false)
                  onPick(s.id)
                }}
              >
                <span className="popover-item-num">{String(i + 1).padStart(2, '0')}</span>
                <span className="popover-item-text">{s.title}</span>
                <span className="popover-item-date">{s.questions.length}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
