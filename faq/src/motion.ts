// The CSS reduced-motion block can't reach scrollIntoView calls, so every
// scripted scroll asks here.
export function scrollBehavior(): ScrollBehavior {
  return matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}
