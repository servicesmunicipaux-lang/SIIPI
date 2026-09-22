/* Service worker de l'application citoyenne.
 *
 * Deux objectifs, et deux seulement :
 *
 *  1. que l'application s'ouvre sans réseau — on la consulte dans la rue, le
 *     soir, avec une barre de signal ;
 *  2. que les horaires de collecte restent lisibles hors ligne, parce que
 *     c'est l'unique information dont on a besoin au moment précis où l'on
 *     n'a pas de réseau.
 *
 * Ce qu'il ne fait PAS : mettre en cache les écritures. Un signalement qui
 * semblerait « envoyé » alors qu'il dort dans un cache serait pire que pas de
 * signalement du tout — le citoyen croirait la commune prévenue.
 */

const VERSION = 'siipi-v1';
const COQUILLE = `${VERSION}-coquille`;
const DONNEES = `${VERSION}-donnees`;

// Chemins de l'API dont la dernière réponse connue peut être resservie hors
// ligne. Liste explicite : rien n'y entre par accident.
const LECTURES_HORS_LIGNE = ['/citoyen/horaires', '/citoyen/adresse', '/citoyen/annonces'];

self.addEventListener('install', (evenement) => {
  evenement.waitUntil(
    caches.open(COQUILLE).then((cache) => cache.addAll(['/', '/index.html', '/manifest.webmanifest']))
  );
  void self.skipWaiting();
});

self.addEventListener('activate', (evenement) => {
  evenement.waitUntil(
    caches
      .keys()
      .then((cles) =>
        Promise.all(cles.filter((c) => !c.startsWith(VERSION)).map((c) => caches.delete(c)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evenement) => {
  const requete = evenement.request;
  if (requete.method !== 'GET') return; // les écritures passent toujours par le réseau

  const url = new URL(requete.url);

  // Données de l'API : le réseau d'abord (l'horaire a pu changer ce matin),
  // le cache seulement s'il est injoignable.
  if (LECTURES_HORS_LIGNE.some((chemin) => url.pathname.endsWith(chemin))) {
    evenement.respondWith(
      fetch(requete)
        .then((reponse) => {
          const copie = reponse.clone();
          void caches.open(DONNEES).then((cache) => cache.put(requete, copie));
          return reponse;
        })
        .catch(() => caches.match(requete).then((c) => c || Response.error()))
    );
    return;
  }

  // Tuiles de fond de carte : le cache d'abord, elles ne changent jamais.
  if (url.hostname.endsWith('tile.openstreetmap.org')) {
    evenement.respondWith(
      caches.match(requete).then(
        (cache) =>
          cache ||
          fetch(requete).then((reponse) => {
            const copie = reponse.clone();
            void caches.open(DONNEES).then((c) => c.put(requete, copie));
            return reponse;
          })
      )
    );
    return;
  }

  // Coquille de l'application : cache d'abord, réseau en secours.
  if (url.origin === self.location.origin) {
    evenement.respondWith(
      caches.match(requete).then(
        (cache) =>
          cache ||
          fetch(requete)
            .then((reponse) => {
              const copie = reponse.clone();
              void caches.open(COQUILLE).then((c) => c.put(requete, copie));
              return reponse;
            })
            .catch(() => caches.match('/index.html'))
      )
    );
  }
});
