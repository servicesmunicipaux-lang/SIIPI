/* Service worker de SIIPI : portail communal, observatoire et espace citoyen,
 * qui partagent une seule origine.
 *
 * Deux objectifs, et deux seulement :
 *
 *  1. que l'application s'ouvre sans réseau — on la consulte dans la rue, le
 *     soir, avec une barre de signal ;
 *  2. que les horaires de collecte restent lisibles hors ligne, parce que
 *     c'est l'unique information dont on a besoin au moment précis où l'on
 *     n'a pas de réseau.
 *
 * Ce qu'il ne fait PAS :
 *
 *  - mettre en cache les écritures. Un signalement qui semblerait « envoyé »
 *    alors qu'il dort dans un cache serait pire que pas de signalement du
 *    tout — le citoyen croirait la commune prévenue ;
 *  - servir l'API. Depuis que l'API est sous /api, sur l'origine du site, la
 *    version précédente resservait toute réponse lue une fois, indéfiniment,
 *    rangée sous son adresse sans le jeton : le compte suivant d'un appareil
 *    partagé lisait celle du précédent, un 401 ou un 500 passait pour une
 *    réponse, et le « no-store » des impressions était contourné (E1). Seules
 *    les trois lectures citoyennes ci-dessous passent par lui, réseau d'abord ;
 *  - garder les tuiles des fonds de carte. Elles se gardent dans le cache HTTP
 *    du navigateur, qui respecte la durée que leur fixe le serveur de tuiles ;
 *    le cache du service worker les gardait sans fin, et une tuile d'une autre
 *    origine y pèse bien plus que ses octets.
 */

// La version est apposée à la construction (web/scripts/version-service-worker.mjs) :
// elle change avec le front. Figée, elle laissait chaque appareil déjà venu sur
// la première version installée, pour toujours (E2).
const VERSION = 'siipi-__VERSION_CONSTRUCTION__';
const COQUILLE = `${VERSION}-coquille`;
// Le suffixe « -donnees » est aussi celui que la page purge quand le jeton
// change (web/src/lib/api.ts) : ne pas le renommer d'un seul côté.
const DONNEES = `${VERSION}-donnees`;

// Chemins de l'API dont la dernière réponse connue peut être resservie hors
// ligne. Liste explicite, chemins exacts : rien n'y entre par accident.
const LECTURES_HORS_LIGNE = ['/api/citoyen/horaires', '/api/citoyen/adresse', '/api/citoyen/annonces'];

// Une réponse ne se range que si elle est bonne et que le serveur ne l'interdit
// pas : une erreur rangée serait resservie hors ligne comme si elle était vraie.
function rangeable(reponse) {
  return reponse.status === 200 && !/no-store/i.test(reponse.headers.get('Cache-Control') || '');
}

async function ranger(nomCache, requete, reponse) {
  const cache = await caches.open(nomCache);
  await cache.put(requete, reponse);
}

async function garde(nomCache, requete) {
  const cache = await caches.open(nomCache);
  return cache.match(requete);
}

// L'index et les fichiers qu'il charge : sans eux, l'application ne s'ouvrirait
// pas hors ligne la première fois, puisque la page qui a installé le service
// worker les avait déjà reçus sans passer par lui.
async function installerCoquille() {
  const cache = await caches.open(COQUILLE);
  const reponse = await fetch('/index.html');
  if (!rangeable(reponse)) throw new Error(`index.html : ${reponse.status}`);
  const texte = await reponse.clone().text();
  const fichiers = new Set(['/manifest.webmanifest']);
  for (const [, chemin] of texte.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)) fichiers.add(chemin);
  await cache.put('/index.html', reponse);
  await cache.addAll([...fichiers]);
}

self.addEventListener('install', (evenement) => {
  evenement.waitUntil(installerCoquille());
  void self.skipWaiting();
});

// Les caches d'une autre version partent, données comprises : une version
// nouvelle ne lit rien de ce qu'une ancienne a rangé.
self.addEventListener('activate', (evenement) => {
  evenement.waitUntil(
    caches
      .keys()
      .then((cles) =>
        Promise.all(
          cles
            .filter((c) => c.startsWith('siipi-') && c !== COQUILLE && c !== DONNEES)
            .map((c) => caches.delete(c))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Le réseau d'abord : l'horaire a pu changer ce matin. Le cache seulement si le
// réseau est injoignable — une réponse du serveur, même une erreur, est rendue
// telle quelle.
async function reseauDAbord(requete, nomCache) {
  let reponse;
  try {
    reponse = await fetch(requete);
  } catch {
    return (await garde(nomCache, requete)) || Response.error();
  }
  if (rangeable(reponse)) await ranger(nomCache, requete, reponse.clone());
  return reponse;
}

// Une page : toujours le réseau, pour qu'une version nouvelle du front arrive
// au premier chargement ; l'index gardé seulement hors ligne. La page de
// maintenance (503) passe donc telle quelle.
async function page(requete) {
  try {
    return await fetch(requete);
  } catch {
    return (await garde(COQUILLE, '/index.html')) || Response.error();
  }
}

// Un fichier construit porte son empreinte dans son nom : il ne change jamais.
// Le frontal rend l'index (200, HTML) pour un fichier qui n'existe plus : il ne
// se range pas sous le nom d'un script.
async function fichierConstruit(requete) {
  const deja = await garde(COQUILLE, requete);
  if (deja) return deja;
  const reponse = await fetch(requete);
  const html = (reponse.headers.get('Content-Type') || '').startsWith('text/html');
  if (rangeable(reponse) && !html) await ranger(COQUILLE, requete, reponse.clone());
  return reponse;
}

self.addEventListener('fetch', (evenement) => {
  const requete = evenement.request;
  if (requete.method !== 'GET') return; // les écritures passent toujours par le réseau

  const url = new URL(requete.url);
  if (url.origin !== self.location.origin) return;

  if (LECTURES_HORS_LIGNE.includes(url.pathname)) {
    evenement.respondWith(reseauDAbord(requete, DONNEES));
    return;
  }
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return;

  if (requete.mode === 'navigate') {
    evenement.respondWith(page(requete));
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    evenement.respondWith(fichierConstruit(requete));
    return;
  }
  // Le reste de l'origine (manifeste, icônes) : réseau d'abord.
  evenement.respondWith(reseauDAbord(requete, COQUILLE));
});

/* Notifications push (Jalon 2, lot 1).
 *
 * Le contenu vient du serveur tel quel (titre, corps, lien) — le service
 * worker ne fait qu'afficher ce qu'on lui donne, il ne décide de rien.
 * Si la charge utile est illisible (JSON malformé), on affiche un message
 * générique plutôt que de laisser l'événement échouer en silence : un push
 * reçu et non affiché serait pire qu'un push jamais envoyé. */
self.addEventListener('push', (evenement) => {
  let donnees = { titre: 'Propreté Intercommunale', corps: '', lien: '/' };
  try {
    if (evenement.data) donnees = { ...donnees, ...evenement.data.json() };
  } catch {
    donnees.corps = 'Une nouvelle notification est disponible.';
  }
  evenement.waitUntil(
    self.registration.showNotification(donnees.titre, {
      body: donnees.corps,
      icon: '/icones/icone-192.png',
      badge: '/icones/icone-192.png',
      data: { lien: donnees.lien || '/' },
    })
  );
});

// Un clic ouvre l'onglet existant s'il y en a un, sinon en ouvre un nouveau —
// jamais un doublon de l'application citoyenne.
self.addEventListener('notificationclick', (evenement) => {
  evenement.notification.close();
  const lien = evenement.notification.data?.lien || '/';
  evenement.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow(lien);
    })
  );
});
