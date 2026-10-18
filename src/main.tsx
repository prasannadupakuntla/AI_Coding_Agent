import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// StrictMode removed — it double-invokes callbacks/effects in dev which
// causes duplicate coin events. Safe to re-enable in production if needed.
createRoot(document.getElementById('root')!).render(<App />)
