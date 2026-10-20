// ---------------------------------------------------------------------------
// Les normales climatiques par gouvernorat, pour la couche WaPla : les feuilles
// NOAA des normales OMM 1991-2020, station par station.
//
//   npm run seed:normales-climat -- [--dossier <d>] [--correspondance <f>]
//                                   [--manifeste <f>] [--date-effet AAAA-MM-JJ] [--essai]
//
// LA DÉCISION (DECISIONS_2026-10-16.md, amendement du 20/10/2026). Le climat de
// WaPla est une référence par GOUVERNORAT, saisie par la FNCT. Source : les
// normales OMM 1991-2020 publiées par la NOAA pour 27 stations tunisiennes
// (« Single Station Data Sheet »). Une seule période. Chargées en base une fois,
// versionnées par leur date d'effet ; aucune dépendance externe à l'exécution.
// La commune peut surcharger le climat de son bilan, rien ne l'y oblige.
//
// CE QUI EST LU. Trois fichiers, déposés dans seed/data/ :
// - noaa_1991_2020/ : les feuilles brutes, une par station, telles que publiées ;
// - manifest.csv : fichier ; sha256 ; url ; date_telechargement ; source ; wmo ;
//   station — l'empreinte de chaque feuille, contrôlée avant toute lecture ;
// - mapping_station_gouvernorat.csv : gouvernorat ; wmo ; station ;
//   methode_rattachement ; distance_km ; label — une ligne par gouvernorat.
// D'une feuille, seuls deux blocs comptent : Precipitation_Total (paramètre 1,
// « Sum », colonne Annual, mm/an) donne APY ; Daily_Mean_Temperature (paramètre
// 5, « Mean », colonne Annual, °C) donne ATY. Les paramètres 2, 3, 4, 6 et 7
// sont ignorés. La période se lit dans l'en-tête (« Climate Normals for
// 1991-2020 »), et la date d'effet par défaut en découle : le 1er janvier qui
// suit la fin de la période.
//
// CE QUI EST REFUSÉ, avant toute écriture — l'ensemble entier, jamais à moitié :
// une feuille absente du manifeste ou dont l'empreinte diffère ; un WMO qui ne
// correspond pas à la station (manifeste, en-tête de la feuille, lignes de
// données) ; un des deux blocs absent, ou sa valeur Annual vide ; des feuilles
// de périodes différentes ; un gouvernorat absent, inconnu ou en double dans la
// correspondance ; une station de la correspondance qu'aucune feuille ne porte ;
// une méthode ou un label inconnus, ou incohérents entre eux (station_unique →
// stationnaire, plus_proche_voisin → estimee) ; une distance saisie qui ne
// concorde pas avec la distance calculée. La liste des gouvernorats est celle
// de la base (communes réelles),
// jamais une liste écrite ici : le découpage vit dans la base (D-FNCT-2).
//
// REJOUÉ, IL NE CHANGE RIEN. Une normale en vigueur à la même date d'effet et
// identique est laissée telle quelle ; DIFFÉRENTE, elle est refusée : une
// référence nationale ne se réécrit pas en silence (règle 1.5). On la retire
// d'abord, avec son motif (POST /wapla/facteurs-reference/{id}/retrait).
// --essai valide tout et dit ce qui serait écrit, sans rien écrire.
//
// LA DISTANCE D'UNE NORMALE ESTIMÉE EST CALCULÉE, jamais recopiée : la distance
// haversine (sphère de 6 371 km) entre la station — ses coordonnées sont dans
// l'en-tête de sa feuille — et le centre géométrique du gouvernorat — le
// centroïde des limites de ses communes, en base. Arrondie au dixième de
// kilomètre. La colonne distance_km de la correspondance peut rester vide ;
// remplie, elle doit concorder à 1 km près, sinon l'ensemble est refusé : deux
// distances qui se contredisent ne se départagent pas en silence (règle 1.5).
// ---------------------------------------------------------------------------

process.env.SIIPI_DB_CONTEXT = 'server';
const { readFileSync, readdirSync, existsSync } = await import('node:fs');
const { createHash } = await import('node:crypto');
const { join } = await import('node:path');
const { pool, query } = await import('../src/db.js');

function argument(nom: string): string | undefined {
  const i = process.argv.indexOf(`--${nom}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const dossier = argument('dossier') ?? 'seed/data/noaa_1991_2020';
const fichierCorrespondance = argument('correspondance') ?? 'seed/data/mapping_station_gouvernorat.csv';
const fichierManifeste = argument('manifeste') ?? 'seed/data/manifest.csv';
const essai = process.argv.includes('--essai');

class Refus extends Error {}

/** Une ligne CSV, guillemets compris (les feuilles NOAA mettent leurs titres entre guillemets). */
function cases(ligne: string, separateur: string): string[] {
  const sortie: string[] = [];
  let courant = '';
  let entreGuillemets = false;
  for (const c of ligne) {
    if (c === '"') entreGuillemets = !entreGuillemets;
    else if (c === separateur && !entreGuillemets) { sortie.push(courant.trim()); courant = ''; }
    else courant += c;
  }
  sortie.push(courant.trim());
  return sortie;
}

function lireTexte(chemin: string): string {
  if (!existsSync(chemin)) throw new Refus(`Fichier introuvable : ${chemin}.`);
  // Un BOM en tête (Excel l'ajoute) collerait à la première colonne.
  return readFileSync(chemin, 'utf8').replace(/^﻿/, '');
}

/** Un tableau « ; » à en-tête : chaque ligne en objet, les colonnes attendues vérifiées. */
function tableau<C extends string>(chemin: string, colonnes: readonly C[]): Array<Record<C, string> & { _ligne: number }> {
  const lignes = lireTexte(chemin).split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lignes.length < 2) throw new Refus(`${chemin} : aucune ligne de données.`);
  const entete = cases(lignes[0], ';');
  const manquantes = colonnes.filter((c) => !entete.includes(c));
  if (manquantes.length) throw new Refus(`${chemin} : colonne(s) absente(s) : ${manquantes.join(', ')}. Attendues, séparées par « ; » : ${colonnes.join(' ; ')}.`);
  return lignes.slice(1).map((brut, i) => {
    const c = cases(brut, ';');
    return Object.assign(Object.fromEntries(colonnes.map((nom) => [nom, c[entete.indexOf(nom)] ?? ''])), { _ligne: i + 2 }) as Record<C, string> & { _ligne: number };
  });
}

type Feuille = { fichier: string; station: string; wmo: string; periode: string; apy: number; aty: number; lat: number; lon: number };

/** « 36|50|N » : degrés et minutes, l'hémisphère donne le signe. */
function coordonnee(brut: string): number | null {
  const m = brut.match(/^(\d{1,3})\|(\d{1,2})\|([NSEW])$/);
  if (!m) return null;
  const v = Number(m[1]) + Number(m[2]) / 60;
  return m[3] === 'S' || m[3] === 'W' ? -v : v;
}

/** La distance haversine, en km, sur la sphère de 6 371 km. */
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = (x: number) => (x * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

/** Une feuille NOAA « Single Station Data Sheet » : la station, la période, APY et ATY. */
function lireFeuille(chemin: string, fichier: string): Feuille {
  const lignes = lireTexte(chemin).split(/\r?\n/).map((l) => cases(l, ','));
  const periode = lignes.slice(0, 3).map((l) => l[0]).join(' ').match(/Climate Normals for (\d{4})-(\d{4})/);
  if (!periode) throw new Refus(`${fichier} : l'en-tête ne dit pas la période (« Climate Normals for AAAA-AAAA »). Est-ce une feuille NOAA ?`);
  const station = lignes.find((l) => l[0] === 'Station_Name')?.[1] ?? '';
  const iEntete = lignes.findIndex((l) => l[0] === 'WMO_Number' && l[1] === 'Latitude');
  const wmo = iEntete >= 0 ? (lignes[iEntete + 1]?.[0] ?? '') : '';
  if (!station || !/^\d{5}$/.test(wmo)) throw new Refus(`${fichier} : le nom de la station ou son numéro WMO est illisible dans l'en-tête.`);
  const lat = coordonnee(lignes[iEntete + 1]?.[1] ?? '');
  const lon = coordonnee(lignes[iEntete + 1]?.[2] ?? '');
  if (lat == null || lon == null) throw new Refus(`${fichier} : les coordonnées de la station sont illisibles dans l'en-tête (attendu « 36|50|N », « 10|14|E »).`);

  // Chaque bloc : une ligne d'en-tête « WMO_Number, Parameter_Code, Calculation_Name, … Annual », puis sa ligne de valeurs.
  const bloc = (code: string, calcul: string, nom: string): number => {
    for (let i = 0; i < lignes.length - 1; i++) {
      const l = lignes[i];
      if (l[0] !== 'WMO_Number' || l[1] !== 'Parameter_Code') continue;
      const v = lignes[i + 1];
      if (v[1] !== code || v[2] !== calcul) continue;
      if (v[0] !== wmo) throw new Refus(`${fichier} : le bloc ${nom} porte le WMO ${v[0]}, l'en-tête ${wmo}.`);
      const annuel = v[l.indexOf('Annual')] ?? '';
      if (!/^-?\d+(\.\d+)?$/.test(annuel)) throw new Refus(`${fichier} : ${nom}, colonne Annual vide ou illisible (« ${annuel} »).`);
      return Number(annuel);
    }
    throw new Refus(`${fichier} : le bloc ${nom} (paramètre ${code}, « ${calcul} ») est absent.`);
  };
  return {
    fichier, station, wmo, periode: `${periode[1]}-${periode[2]}`, lat, lon,
    apy: bloc('1', 'Sum', 'Precipitation_Total'),
    aty: bloc('5', 'Mean', 'Daily_Mean_Temperature'),
  };
}

/** Les mêmes bornes que la base (migration 074). */
function dansLesBornes(f: Feuille) {
  if (f.apy < 0 || f.apy > 3000) throw new Refus(`${f.fichier} : ${f.apy} mm de précipitations annuelles, hors des bornes (0 à 3 000).`);
  if (f.aty < -10 || f.aty > 40) throw new Refus(`${f.fichier} : ${f.aty} °C de température moyenne, hors des bornes (−10 à 40).`);
}

async function charger() {
  // 1. Le manifeste, et l'empreinte de chaque feuille avant toute lecture.
  const manifeste = tableau(fichierManifeste, ['fichier', 'sha256', 'url', 'date_telechargement', 'source', 'wmo', 'station'] as const);
  if (!existsSync(dossier)) throw new Refus(`Dossier introuvable : ${dossier}.`);
  const presents = readdirSync(dossier).filter((f) => f.toLowerCase().endsWith('.csv')).sort();
  const parFichier = new Map(manifeste.map((m) => [m.fichier, m]));
  const horsManifeste = presents.filter((f) => !parFichier.has(f));
  if (horsManifeste.length) throw new Refus(`Feuille(s) absente(s) du manifeste : ${horsManifeste.join(', ')}. Chaque feuille chargée a son empreinte.`);
  const feuilles = new Map<string, Feuille & { url: string; telechargee: string }>();
  for (const m of manifeste) {
    const chemin = join(dossier, m.fichier);
    if (!existsSync(chemin)) throw new Refus(`Manifeste, ligne ${m._ligne} : la feuille ${m.fichier} est absente de ${dossier}.`);
    const empreinte = createHash('sha256').update(readFileSync(chemin)).digest('hex');
    if (empreinte !== m.sha256.toLowerCase()) {
      throw new Refus(`${m.fichier} : empreinte SHA-256 ${empreinte.slice(0, 12)}…, le manifeste dit ${m.sha256.slice(0, 12)}… La feuille a changé depuis son téléchargement.`);
    }
    const f = lireFeuille(chemin, m.fichier);
    if (f.wmo !== m.wmo || f.station !== m.station) {
      throw new Refus(`${m.fichier} : la feuille est la station ${f.station} (WMO ${f.wmo}), le manifeste dit ${m.station} (WMO ${m.wmo}).`);
    }
    dansLesBornes(f);
    if (!m.url || !m.source || !m.date_telechargement) throw new Refus(`Manifeste, ligne ${m._ligne} : url, source et date de téléchargement sont obligatoires.`);
    feuilles.set(f.station, { ...f, url: m.url, telechargee: m.date_telechargement });
  }
  const periodes = new Set([...feuilles.values()].map((f) => f.periode));
  if (periodes.size !== 1) throw new Refus(`Les feuilles mêlent plusieurs périodes (${[...periodes].join(', ')}) : une seule par chargement.`);
  const periode = [...periodes][0];
  const dateEffet = argument('date-effet') ?? `${Number(periode.slice(5)) + 1}-01-01`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateEffet)) throw new Refus(`Date d'effet illisible : « ${dateEffet} » (AAAA-MM-JJ).`);

  // 2. La correspondance station → gouvernorat, contre le référentiel de la base.
  const connus = new Set(
    (await query<{ gouvernorat: string }>(
      `SELECT DISTINCT gouvernorat FROM communes
        WHERE deleted_at IS NULL AND NOT est_demo AND id NOT LIKE 'test%' AND gouvernorat IS NOT NULL`
    )).map((r) => r.gouvernorat)
  );
  // Le centre géométrique de chaque gouvernorat : le centroïde des limites de ses communes.
  const centres = new Map(
    (await query<{ gouvernorat: string; lat: number; lon: number }>(
      `SELECT gouvernorat, ST_Y(ST_Centroid(ST_Collect(boundary_geom))) AS lat, ST_X(ST_Centroid(ST_Collect(boundary_geom))) AS lon
         FROM communes
        WHERE deleted_at IS NULL AND NOT est_demo AND id NOT LIKE 'test%' AND boundary_geom IS NOT NULL
        GROUP BY gouvernorat`
    )).map((r) => [r.gouvernorat, { lat: Number(r.lat), lon: Number(r.lon) }])
  );
  const correspondance = tableau(fichierCorrespondance, ['gouvernorat', 'wmo', 'station', 'methode_rattachement', 'distance_km', 'label'] as const);
  const lignes: Array<{ gouvernorat: string; f: Feuille & { url: string }; methode: string; distance: number | null; label: string }> = [];
  const vus = new Set<string>();
  for (const c of correspondance) {
    const ici = `Correspondance, ligne ${c._ligne} (${c.gouvernorat || '?'})`;
    if (!connus.has(c.gouvernorat)) throw new Refus(`${ici} : « ${c.gouvernorat} » n'est pas un gouvernorat du référentiel.`);
    if (vus.has(c.gouvernorat)) throw new Refus(`${ici} : le gouvernorat figure deux fois.`);
    vus.add(c.gouvernorat);
    if (!c.station) throw new Refus(`${ici} : aucune station. Une normale, stationnaire ou estimée, dit toujours de quelle station elle vient.`);
    const f = feuilles.get(c.station);
    if (!f) throw new Refus(`${ici} : aucune feuille pour la station ${c.station}.`);
    if (f.wmo !== c.wmo) throw new Refus(`${ici} : la station ${c.station} est le WMO ${f.wmo}, la correspondance dit ${c.wmo}.`);
    if (!['station_unique', 'plus_proche_voisin'].includes(c.methode_rattachement)) {
      throw new Refus(`${ici} : méthode « ${c.methode_rattachement} » inconnue (station_unique ou plus_proche_voisin).`);
    }
    if (!['stationnaire', 'estimee'].includes(c.label)) throw new Refus(`${ici} : label « ${c.label} » inconnu (stationnaire ou estimee).`);
    const attendu = c.methode_rattachement === 'station_unique' ? 'stationnaire' : 'estimee';
    if (c.label !== attendu) {
      throw new Refus(`${ici} : le label « ${c.label} » ne va pas avec la méthode ${c.methode_rattachement}, qui donne une normale « ${attendu} ».`);
    }
    if (c.distance_km !== '' && !/^\d+(\.\d+)?$/.test(c.distance_km)) throw new Refus(`${ici} : distance « ${c.distance_km} » illisible (km, point décimal).`);
    let distance: number | null = null;
    if (c.methode_rattachement === 'plus_proche_voisin') {
      const centre = centres.get(c.gouvernorat);
      if (!centre) throw new Refus(`${ici} : aucune commune du gouvernorat n'a de limite en base ; la distance à la station ne se calcule pas.`);
      distance = Math.round(haversine(centre.lat, centre.lon, f.lat, f.lon) * 10) / 10;
      if (c.distance_km !== '' && Math.abs(Number(c.distance_km) - distance) > 1) {
        throw new Refus(`${ici} : la correspondance dit ${c.distance_km} km, la distance haversine entre la station ${c.station} et le centre du gouvernorat est de ${distance} km. Corrigez la colonne, ou laissez-la vide.`);
      }
    } else if (c.distance_km !== '') {
      throw new Refus(`${ici} : une distance pour une station du gouvernorat (station_unique) ; elle n'a de sens que pour une station voisine.`);
    }
    lignes.push({ gouvernorat: c.gouvernorat, f, methode: c.methode_rattachement, distance, label: c.label });
  }
  const absents = [...connus].filter((g) => !vus.has(g)).sort();
  if (absents.length) throw new Refus(`${absents.length} gouvernorat(s) sans station : ${absents.join(', ')}. La correspondance couvre les ${connus.size} gouvernorats du référentiel.`);

  // 3. L'écriture : une transaction, sous le contexte FNCT du script.
  const client = await pool.connect();
  let ajoutees = 0;
  let inchangees = 0;
  try {
    await client.query('BEGIN');
    for (const l of lignes.sort((a, b) => a.gouvernorat.localeCompare(b.gouvernorat))) {
      const source = `INM/OMM-NOAA, normales ${periode}, station ${l.f.station} (WMO ${l.f.wmo}) — ${l.f.url}`;
      for (const [code, valeur] of [['precipitations_annuelles_mm', l.f.apy], ['temperature_moyenne_c', l.f.aty]] as const) {
        const enVigueur = await client.query<{ valeur: string; source: string; periode: string | null; methode_rattachement: string | null;
                                                stations_utilisees: string[] | null; distance_km: string | null; label: string | null }>(
          `SELECT valeur::text, source, periode, methode_rattachement, stations_utilisees, distance_km::text, label
             FROM wapla.facteurs_reference
            WHERE code = $1 AND gouvernorat = $2 AND date_effet = $3 AND retire_le IS NULL`,
          [code, l.gouvernorat, dateEffet]
        );
        const e = enVigueur.rows[0];
        if (e) {
          const identique = Number(e.valeur) === valeur && e.source === source && e.periode === periode
            && e.methode_rattachement === l.methode && e.label === l.label
            && JSON.stringify(e.stations_utilisees) === JSON.stringify([l.f.station])
            && (e.distance_km == null ? l.distance == null : Number(e.distance_km) === l.distance);
          if (identique) { inchangees++; continue; }
          throw new Refus(`${l.gouvernorat}, ${code} : la normale en vigueur au ${dateEffet} (${e.valeur}, « ${e.source} ») diffère de celle du chargement (${valeur}). ` +
            'Une référence nationale ne se réécrit pas : retirez d\'abord l\'ancienne, avec son motif (POST /wapla/facteurs-reference/{id}/retrait), puis rechargez.');
        }
        await client.query(
          `INSERT INTO wapla.facteurs_reference
             (code, gouvernorat, valeur, source, date_effet, saisi_par, periode, methode_rattachement, stations_utilisees, distance_km, label)
           VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $8, $9, $10)`,
          [code, l.gouvernorat, valeur, source, dateEffet, periode, l.methode, [l.f.station], l.distance, l.label]
        );
        ajoutees++;
      }
    }
    if (essai) await client.query('ROLLBACK');
    else await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  const estimees = lignes.filter((l) => l.label === 'estimee').map((l) => `${l.gouvernorat} ← ${l.f.station} (${l.distance} km)`);
  console.log(`[normales] ${essai ? 'ESSAI, rien n\'est écrit — ' : ''}période ${periode}, date d'effet ${dateEffet}, ${feuilles.size} feuille(s), ` +
    `${lignes.length} gouvernorats : ${ajoutees} valeur(s) ${essai ? 'à ajouter' : 'ajoutée(s)'}, ${inchangees} déjà en vigueur.`);
  if (estimees.length) console.log(`[normales] normales estimées (station voisine) : ${estimees.join(' ; ')}.`);
}

try {
  await charger();
} catch (err) {
  if (err instanceof Refus) {
    console.error(`[normales] REFUSÉ, rien n'est écrit. ${err.message}`);
    process.exitCode = 1;
  } else {
    throw err;
  }
} finally {
  await pool.end();
}
