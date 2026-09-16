import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { preloadCanvasWebfonts } from './app/constants/fonts'
import App from './App.tsx'

preloadCanvasWebfonts()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
