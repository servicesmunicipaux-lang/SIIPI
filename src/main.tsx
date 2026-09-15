import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
// Feuilles de style Leaflet (carte GIS + dessin de secteurs) chargées via le bundle
// plutôt que par CDN (voir index.html) : évite toute dépendance réseau externe au
// chargement de l'application, plus fiable en environnement de production/pare-feu.
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
