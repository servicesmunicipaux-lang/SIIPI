import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { apposerVersion, versionDeConstruction } from './scripts/version-service-worker.mjs';

// Le service worker est copié tel quel depuis public/ : sa version s'appose une
// fois tout écrit, quand l'index construit existe.
function versionnerServiceWorker(): Plugin {
  let sortie = 'dist';
  return {
    name: 'siipi-version-service-worker',
    apply: 'build',
    configResolved(config) {
      sortie = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const chemin = join(sortie, 'sw.js');
      const serviceWorker = readFileSync(chemin, 'utf8');
      const version = versionDeConstruction(readFileSync(join(sortie, 'index.html')), serviceWorker);
      writeFileSync(chemin, apposerVersion(serviceWorker, version));
    },
  };
}

// Cible de l'API, vue depuis le serveur de développement — pas depuis le
// navigateur. Dans Docker, l'API s'appelle « api » sur le réseau interne ;
// hors Docker, elle tourne sur la machine de développement.
const CIBLE_API = process.env.SIIPI_API_TARGET || 'http://localhost:4000';

export default defineConfig({
  plugins: [react(), tailwindcss(), versionnerServiceWorker()],
  server: {
    port: 3000,
    host: '0.0.0.0',
    // Dans un conteneur monté sur un dossier Windows, les événements du système
    // de fichiers de l'hôte ne remontent pas : le polling garantit le
    // rechargement à chaud.
    watch: { usePolling: true },

    // L'API est servie sous /api par le serveur de développement lui-même.
    //
    // Le navigateur ne s'adresse donc qu'à une seule origine, celle de la
    // page. Trois conséquences, et aucune n'est cosmétique :
    //
    //   — plus aucune requête entre origines, donc plus de CORS à configurer
    //     en développement, ni de navigateur ou d'extension qui bloque un
    //     appel vers un autre port de localhost (ERR_BLOCKED_BY_CLIENT) ;
    //   — le chemin /api est exactement celui du déploiement derrière un
    //     reverse proxy, déjà déclaré dans le contrat OpenAPI : on développe
    //     sur la même forme d'URL que celle qui servira en production ;
    //   — un poste de travail n'a plus besoin d'exposer le port 4000 du tout.
    proxy: {
      '/api': {
        target: CIBLE_API,
        changeOrigin: true,
        rewrite: (chemin) => chemin.replace(/^\/api/, ''),
      },
    },
  },
});
