// How much of the footer is uncovered, 0 to 1: the part below the drawer's
// bottom edge and inside the viewport. Works whether or not the footer is
// pinned behind the drawer. Shared by the particle intro and the drawer's
// narrowing, so both respond to the same reveal.
export function footerExposure(): number {
  const footer = document.querySelector('footer')
  if (!footer) return 1
  const drawer = document.querySelector('.drawer')
  const f = footer.getBoundingClientRect()
  const top = Math.max(f.top, drawer?.getBoundingClientRect().bottom ?? f.top, 0)
  const bottom = Math.min(f.bottom, window.innerHeight)
  return Math.max(0, bottom - top) / f.height
}
