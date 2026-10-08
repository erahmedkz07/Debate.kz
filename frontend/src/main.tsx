import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { i18nReady } from './lib/i18n'
import './index.css'
import App from './App'

// offline app shell for judges at venues with bad Wi-Fi; production builds only (dev relies on HMR)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => undefined) })
}

// the saved language (Kazakh loads on demand) is ready before the first paint
void i18nReady.then(() => createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
))
