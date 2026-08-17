import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'

// Register the service worker so the app shell is cached and the app can be
// installed + launched on any device without a server running.
// Skipped when opened via file:// (double-click), where service workers are
// not available — the app still runs fully in offline mode.
if (
  'serviceWorker' in navigator &&
  (window.location.protocol === 'http:' || window.location.protocol === 'https:')
) {
  registerSW({ immediate: true })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
