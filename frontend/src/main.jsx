import { createRoot } from 'react-dom/client'
import './styles/globals.css'
import App from './App.jsx'

// Note: StrictMode removed — lightweight-charts uses imperative DOM APIs
// that conflict with React's double-mount behaviour in development.
createRoot(document.getElementById('root')).render(<App />)
