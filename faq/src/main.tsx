import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'dialkit/styles.css'
import './fonts.css'
import './styles.css'
import { DialRoot } from 'dialkit'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    {/* Tuning panels; DialRoot renders nothing in production builds. */}
    <DialRoot position="bottom-right" />
  </StrictMode>,
)
