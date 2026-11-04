// Banc du service worker : exécute LE fichier web/public/sw.js, version apposée
// par la fonction de la construction (web/scripts/version-service-worker.mjs),
// dans un contexte isolé où le réseau et les caches sont simulés.
//
// Il ne juge rien : il rend une ligne « clé|valeur » par constat, et la campagne
// `service-worker` les compare à ce qu'elle attend. Chaque scénario part d'un
// appareil neuf (aucun cache), sauf mention contraire.
//
//   node tests/outils/banc_service_worker.mjs /web/public/sw.js /web/scripts/version-service-worker.mjs

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

const [cheminSw, cheminVersion] = process.argv.slice(2);
const { apposerVersion } = await import(pathToFileURL(cheminVersion).href);
const ORIGINE = 'https://siipi.test';
const VERSION = 'essai0123456789ab';
const source = apposerVersion(readFileSync(cheminSw, 'utf8'), VERSION);

const INDEX = '<!doctype html><script type="module" src="/assets/app-1a2b.js"></script><link rel="stylesheet" href="/assets/app-3c4d.css"><div id="racine"></div>';

function adresse(x) {
  return typeof x === 'string' ? new URL(x, ORIGINE).href : x.url;
}

// Un appareil : ses caches (qui survivent d'un service worker à l'autre), le
// réseau qu'il voit, et un service worker chargé.
function appareil(caches = new Map()) {
  const reseau = new Map();
  const etat = { horsLigne: false, appels: [] };
  const servir = (chemin, statut, corps, entetes = {}) =>
    reseau.set(new URL(chemin, ORIGINE).href, { statut, corps, entetes });
  servir('/index.html', 200, INDEX, { 'Content-Type': 'text/html' });
  servir('/manifest.webmanifest', 200, '{}', { 'Content-Type': 'application/manifest+json' });
  servir('/assets/app-1a2b.js', 200, 'console.log(1)', { 'Content-Type': 'text/javascript' });
  servir('/assets/app-3c4d.css', 200, 'body{}', { 'Content-Type': 'text/css' });

  async function fetchSimule(x) {
    const url = adresse(x);
    etat.appels.push(url);
    if (etat.horsLigne) throw new TypeError('Failed to fetch');
    const r = reseau.get(url) || { statut: 404, corps: 'introuvable', entetes: {} };
    return new Response(r.corps, { status: r.statut, headers: r.entetes });
  }

  const ouvrir = (nom) => {
    if (!caches.has(nom)) caches.set(nom, new Map());
    const contenu = caches.get(nom);
    return {
      async put(x, reponse) {
        contenu.set(adresse(x), {
          statut: reponse.status,
          entetes: Object.fromEntries(reponse.headers),
          corps: await reponse.text(),
        });
      },
      async match(x) {
        const g = contenu.get(adresse(x));
        return g ? new Response(g.corps, { status: g.statut, headers: g.entetes }) : undefined;
      },
      async addAll(liste) {
        for (const x of liste) {
          const r = await fetchSimule(x);
          if (!r.ok) throw new TypeError(`addAll : ${r.status}`);
          await this.put(x, r);
        }
      },
    };
  };
  const cachesSimules = {
    open: async (nom) => ouvrir(nom),
    keys: async () => [...caches.keys()],
    delete: async (nom) => caches.delete(nom),
    match: async (x) => {
      for (const nom of caches.keys()) {
        const r = await ouvrir(nom).match(x);
        if (r) return r;
      }
      return undefined;
    },
  };

  const ecouteurs = {};
  const notifications = [];
  const contexte = {
    caches: cachesSimules,
    fetch: fetchSimule,
    Request,
    Response,
    Headers,
    URL,
    Set,
    Promise,
    console,
    location: new URL('/sw.js', ORIGINE),
    addEventListener: (type, f) => (ecouteurs[type] = f),
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined, matchAll: async () => [], openWindow: async () => undefined },
    registration: { showNotification: async (titre, options) => notifications.push({ titre, ...options }) },
  };
  contexte.self = contexte;
  vm.createContext(contexte);
  vm.runInContext(source, contexte, { filename: 'sw.js' });

  async function declencher(type, init = {}) {
    const attentes = [];
    let reponse = null;
    const evenement = {
      ...init,
      waitUntil: (p) => attentes.push(p),
      respondWith: (p) => (reponse = p),
    };
    ecouteurs[type](evenement);
    await Promise.all(attentes);
    return reponse;
  }

  // Une requête GET (ou autre) : « non » si le service worker la laisse au
  // navigateur, sinon ce qu'il rend.
  async function demander(chemin, { methode = 'GET', navigation = false } = {}) {
    const requete = new Request(new URL(chemin, ORIGINE), { method: methode });
    if (navigation) Object.defineProperty(requete, 'mode', { value: 'navigate' });
    const promesse = await declencher('fetch', { request: requete });
    if (!promesse) return { interceptee: 'non' };
    const r = await promesse;
    return { interceptee: 'oui', statut: r.type === 'error' ? 'erreur-reseau' : r.status, corps: r.type === 'error' ? '' : await r.text() };
  }

  const range = (chemin) =>
    [...caches.values()].some((c) => c.has(new URL(chemin, ORIGINE).href)) ? 'oui' : 'non';

  return { caches, etat, servir, declencher, demander, range, notifications };
}

const constats = [];
const dire = (cle, valeur) => constats.push(`${cle}|${valeur}`);

// 1. Ce que le service worker laisse au réseau.
{
  const a = appareil();
  await a.declencher('install');
  for (const [cle, chemin] of [
    ['api_ordinaire', '/api/communes'],
    ['api_impression', '/api/documents/3f2c/impression'],
    ['api_session', '/api/auth/moi'],
    ['api_racine', '/api'],
    ['api_voisine_de_la_liste', '/api/citoyen/horaires-anciennes'],
    ['tuile_osm', 'https://tile.openstreetmap.org/12/2140/1600.png'],
    ['tuile_esri', 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/12/1600/2140'],
  ]) {
    dire(`laisse.${cle}`, (await a.demander(chemin)).interceptee);
  }
  dire('laisse.ecriture_citoyenne', (await a.demander('/api/citoyen/horaires', { methode: 'POST' })).interceptee);
}

// 2. Une erreur n'est jamais rangée, et hors ligne elle n'est pas resservie.
for (const [cle, statut, entetes] of [
  ['401', 401, {}],
  ['500', 500, {}],
  ['no_store', 200, { 'Cache-Control': 'no-store' }],
]) {
  const a = appareil();
  await a.declencher('install');
  a.servir('/api/citoyen/horaires', statut, `REPONSE-${cle}`, entetes);
  const enLigne = await a.demander('/api/citoyen/horaires');
  dire(`erreur.${cle}.en_ligne`, `${enLigne.statut}`);
  dire(`erreur.${cle}.rangee`, a.range('/api/citoyen/horaires'));
  a.etat.horsLigne = true;
  dire(`erreur.${cle}.hors_ligne`, (await a.demander('/api/citoyen/horaires')).statut);
}

// 3. Une lecture citoyenne : le réseau d'abord, la dernière réponse hors ligne.
{
  const a = appareil();
  await a.declencher('install');
  a.servir('/api/citoyen/horaires?commune=c1', 200, 'HORAIRES-MARDI', { 'Content-Type': 'application/json' });
  dire('citoyen.premiere', (await a.demander('/api/citoyen/horaires?commune=c1')).corps);
  dire('citoyen.rangee', a.range('/api/citoyen/horaires?commune=c1'));
  a.etat.horsLigne = true;
  dire('citoyen.hors_ligne', (await a.demander('/api/citoyen/horaires?commune=c1')).corps);
  a.etat.horsLigne = false;
  a.servir('/api/citoyen/horaires?commune=c1', 200, 'HORAIRES-JEUDI', { 'Content-Type': 'application/json' });
  dire('citoyen.reseau_d_abord', (await a.demander('/api/citoyen/horaires?commune=c1')).corps);
  dire('citoyen.cache_de_donnees', [...a.caches.keys()].filter((c) => c.endsWith('-donnees')).join(','));
  for (const chemin of ['/api/citoyen/adresse', '/api/citoyen/annonces']) {
    a.servir(chemin, 200, `LU-${chemin}`, {});
    await a.demander(chemin);
    dire(`citoyen.liste${chemin.replace('/api/citoyen', '')}`, a.range(chemin));
  }
}

// 4. L'installation garde de quoi s'ouvrir hors ligne.
{
  const a = appareil();
  await a.declencher('install');
  dire('installation.caches', [...a.caches.keys()].join(','));
  dire(
    'installation.coquille',
    ['/index.html', '/manifest.webmanifest', '/assets/app-1a2b.js', '/assets/app-3c4d.css'].map((c) => a.range(c)).join(',')
  );
}

// 5. Une page : toujours le réseau ; l'index gardé seulement hors ligne.
{
  const a = appareil();
  await a.declencher('install');
  a.servir('/observatoire/bibliotheque', 200, 'INDEX-NOUVEAU', { 'Content-Type': 'text/html' });
  dire('page.en_ligne', (await a.demander('/observatoire/bibliotheque', { navigation: true })).corps);
  a.servir('/communes', 503, 'MAINTENANCE', { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
  dire('page.maintenance', (await a.demander('/communes', { navigation: true })).statut);
  a.etat.horsLigne = true;
  const horsLigne = await a.demander('/observatoire/carte', { navigation: true });
  dire('page.hors_ligne', horsLigne.corps === INDEX ? 'index' : horsLigne.corps);
}

// 6. Un fichier construit : gardé une fois lu ; l'index rendu à sa place n'est pas gardé.
{
  const a = appareil();
  await a.declencher('install');
  a.servir('/assets/vue-9z8y.js', 200, 'VUE', { 'Content-Type': 'text/javascript' });
  await a.demander('/assets/vue-9z8y.js');
  a.etat.horsLigne = true;
  dire('fichier.hors_ligne', (await a.demander('/assets/vue-9z8y.js')).corps);
  a.etat.horsLigne = false;
  a.servir('/assets/disparu-0000.js', 200, INDEX, { 'Content-Type': 'text/html' });
  await a.demander('/assets/disparu-0000.js');
  dire('fichier.index_a_la_place', a.range('/assets/disparu-0000.js'));
}

// 7. Une version nouvelle : les caches des autres versions partent, ceux d'un
//    autre site non.
{
  const caches = new Map([
    ['siipi-v1-coquille', new Map()],
    ['siipi-v1-donnees', new Map([[`${ORIGINE}/citoyen/horaires`, { statut: 200, entetes: {}, corps: 'ANCIEN' }]])],
    ['siipi-0000000000000000-donnees', new Map()],
    ['autre-application', new Map()],
  ]);
  const a = appareil(caches);
  await a.declencher('install');
  await a.declencher('activate');
  dire('version.caches_apres_activation', [...a.caches.keys()].sort().join(','));
}

// 8. Les notifications : affichées telles que le serveur les envoie.
{
  const a = appareil();
  await a.declencher('push', { data: { json: () => ({ titre: 'Collecte décalée', corps: 'Jeudi', lien: '/citoyen' }) } });
  await a.declencher('push', { data: { json: () => { throw new SyntaxError('illisible'); } } });
  dire('push', a.notifications.map((n) => `${n.titre}:${n.body}`).join(';'));
}

console.log(`version|${VERSION}`);
for (const c of constats) console.log(c);
