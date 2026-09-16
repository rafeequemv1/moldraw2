import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { preloadCanvasWebfonts } from './app/constants/fonts'
import App from './App.tsx'

preloadCanvasWebfonts()

/** Old CRA/Workbox workers kept serving stale JS after the Vite move. */
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistrations().then(regs => {
    for (const reg of regs) void reg.unregister();
  });
  if (typeof caches !== 'undefined') {
    void caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key))));
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
