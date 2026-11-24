import type { ReactNode } from 'react'
import { parse, isEmpty, wordMatches } from './search'

// Marks every word in `text` that fuzzy-matches the search, using the same
// rules as the search itself (see search.ts).
export function Highlight({ text, query }: { text: string; query: string }) {
  const q = parse(query)
  if (isEmpty(q)) return <>{text}</>
  const parts: ReactNode[] = []
  let from = 0
  for (const m of text.matchAll(/[A-Za-z0-9]+(?:['’][A-Za-z]+)?/g)) {
    if (!wordMatches(q, m[0])) continue
    const at = m.index ?? 0
    if (at > from) parts.push(text.slice(from, at))
    parts.push(<mark key={at}>{m[0]}</mark>)
    from = at + m[0].length
  }
  parts.push(text.slice(from))
  return <>{parts}</>
}
