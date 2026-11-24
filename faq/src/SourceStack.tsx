import type { SourceKind } from './data'
import globe from './assets/icons/globe.svg'
import doc from './assets/icons/document.svg'
import microscope from './assets/icons/microscope.svg'

const ICON: Record<SourceKind, string> = { web: globe, document: doc, research: microscope }

export function SourceBadge({ kind }: { kind: SourceKind }) {
  return (
    <span className={`source-badge source-${kind}`}>
      <img src={ICON[kind]} alt="" width={14} height={14} />
    </span>
  )
}

// The overlapping avatars in the pill show one badge per kind, in the order
// the sketch uses (web, document, research).
export function SourceStack({ kinds }: { kinds: SourceKind[] }) {
  const order: SourceKind[] = ['web', 'document', 'research']
  const shown = order.filter((k) => kinds.includes(k))
  return (
    <span className="source-stack" aria-hidden>
      {shown.map((k) => (
        <SourceBadge key={k} kind={k} />
      ))}
    </span>
  )
}
