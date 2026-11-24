import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Only the site's font definitions, none of its page styles, so the tool's
// chrome isn't moved by the site's element rules.
import '../fonts.css'
import './tool.css'
import { Tool } from './Tool'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Tool />
  </StrictMode>,
)
