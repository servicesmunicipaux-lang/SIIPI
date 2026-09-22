import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './i18n';
import './index.css';
import { App } from './App';
import { FournisseurAuth } from './lib/auth';

// Service worker : l'application citoyenne doit s'ouvrir sans réseau et
// garder les horaires lisibles hors ligne. Enregistré après le premier rendu
// pour ne pas retarder l'affichage, et silencieux en cas d'échec — un
// navigateur qui le refuse doit simplement voir une application normale.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}

createRoot(document.getElementById('racine')!).render(
  <StrictMode>
    <FournisseurAuth>
      <App />
    </FournisseurAuth>
  </StrictMode>
);
