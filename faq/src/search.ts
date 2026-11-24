import type { Question } from './data'

// Fuzzy search for the FAQ. Each meaningful word of the query is matched on
// its own against the words of a question, its TL;DR and its full answer. A
// query word matches a text word by prefix ("confid" → "confidentiality"),
// shared stem ("reviewing" → "reviewed"), a small typo ("atorney"), or a
// plain-language synonym ("lawyer" → "attorney"). A row is a result when at
// least half the query's words match; question hits rank above answer hits.
// The caller also drops weak tails (see RELATIVE_CUTOFF).

/** Results scoring under this share of the best result are dropped. */
export const RELATIVE_CUTOFF = 0.3

const STOP = new Set(
  [
    'a an and are as at be by can could do does for from have how i if in is it its me my of on or our should so that the their them they this to us was we what when where which who why will with would you your',
    // Words in nearly every question here; matching on them finds everything.
    'ai firm firms wolf greenfield use uses used using',
  ]
    .join(' ')
    .split(' '),
)

// Everyday words people search with, mapped to the words the answers use.
const SYNONYMS: Record<string, string[]> = {
  lawyer: ['attorney'],
  lawyers: ['attorneys'],
  counsel: ['attorney'],
  case: ['matter'],
  cases: ['matters'],
  permission: ['consent'],
  allow: ['consent', 'approved'],
  check: ['review', 'checks'],
  checked: ['reviewed'],
  verify: ['review', 'checks'],
  private: ['confidential', 'confidentiality'],
  privacy: ['confidential', 'confidentiality'],
  data: ['information', 'confidential'],
  secure: ['security', 'confidential'],
  stop: ['opt'],
  refuse: ['opt'],
  avoid: ['opt', 'limit'],
  chatgpt: ['tools', 'ai'],
  llm: ['ai', 'tools'],
  rules: ['policy', 'ethics', 'rules'],
  ethical: ['ethics'],
  invention: ['patent'],
  claims: ['claims', 'patent'],
  cost: ['fees'],
  costs: ['fees'],
  bill: ['fees'],
  billing: ['fees'],
  people: ['attorneys', 'staff'],
}

const WORD = /[a-z0-9]+(?:['’][a-z]+)?/g

export function words(text: string): string[] {
  return text.toLowerCase().match(WORD) ?? []
}

function stem(w: string) {
  return w.length > 4 ? w.replace(/(?:ing|ed|es|s)$/, '') : w
}

function editDistance(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      rowMin = Math.min(rowMin, cur[j])
    }
    if (rowMin > max) return max + 1
    prev = cur
  }
  return prev[b.length]
}

function close(term: string, word: string) {
  if (word === term) return true
  if (term.length >= 3 && word.startsWith(term)) return true
  if (stem(term) === stem(word)) return true
  if (term.length >= 5) return editDistance(term, word, term.length >= 8 ? 2 : 1) <= (term.length >= 8 ? 2 : 1)
  return false
}

export type Query = { terms: string[][] } // one list of alternatives per query word

export function parse(query: string): Query {
  const terms = words(query)
    .filter((w) => !STOP.has(w))
    .map((w) => [w, ...(SYNONYMS[w] ?? [])])
  return { terms }
}

export function isEmpty(q: Query) {
  return q.terms.length === 0
}

/** True when a single text word matches any query word. Used for highlighting. */
export function wordMatches(q: Query, word: string) {
  const w = word.toLowerCase()
  return q.terms.some((alts) => alts.some((t) => close(t, w)))
}

function hits(q: Query, text: string) {
  const ws = words(text)
  return q.terms.map((alts) => ws.some((w) => alts.some((t) => close(t, w))))
}

export type Match = { score: number; inQuestion: boolean; inTldr: boolean; inAnswer: boolean }

export function match(q: Query, item: Question): Match | null {
  if (isEmpty(q)) return { score: 0, inQuestion: false, inTldr: false, inAnswer: false }
  const hq = hits(q, item.question)
  const ht = hits(q, item.tldr)
  const ha = hits(q, item.answer)
  let matched = 0
  let score = 0
  q.terms.forEach((_, i) => {
    if (hq[i] || ht[i] || ha[i]) matched++
    score += (hq[i] ? 3 : 0) + (ht[i] ? 2 : 0) + (ha[i] ? 1 : 0)
  })
  if (matched < Math.ceil(q.terms.length / 2)) return null
  return { score, inQuestion: hq.some(Boolean), inTldr: ht.some(Boolean), inAnswer: ha.some(Boolean) }
}
