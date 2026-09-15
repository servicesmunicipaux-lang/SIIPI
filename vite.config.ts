import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    // Dans un conteneur, le bind-mount du dossier projet ne propage pas
    // toujours les événements du système de fichiers de l'hôte Windows :
    // le polling garantit que le rechargement à chaud fonctionne.
    watch: { usePolling: true },
  },
});
