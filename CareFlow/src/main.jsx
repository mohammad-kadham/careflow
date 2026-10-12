import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { startPublicAnalytics } from './analytics'

// The initial HTML is pre-rendered for crawlers; React owns metadata after startup.
document.querySelectorAll('[data-seo]').forEach(element => element.remove())
startPublicAnalytics()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
