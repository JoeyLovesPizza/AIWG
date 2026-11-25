import { useSyncExternalStore } from 'react'

// True at the phone layout's width (the 900px breakpoint in styles.css), for
// the few differences CSS can't express, such as placeholder copy.
const QUERY = '(max-width: 900px)'

function subscribe(onChange: () => void) {
  const mq = matchMedia(QUERY)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

export function useNarrow() {
  return useSyncExternalStore(subscribe, () => matchMedia(QUERY).matches)
}
