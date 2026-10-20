// ---------------------------------------------------------------------------
// Les normales climatiques de l'INM, par gouvernorat, pour la couche WaPla.
//
//   npm run seed:normales-inm -- [--fichier <chemin>] [--date-effet AAAA-MM-JJ]
//
// LA DÉCISION (DECISIONS_2026-10-16.md, amendement du 20/10/2026). Le climat de
// WaPla est une référence par GOUVERNORAT, la maille officielle de l'INM : les
// normales 1981-2010, publiées en open data sous licence OTL (data.gov.tn).
// Elles sont chargées en base une fois, puis versionnées par leur date d'effet ;
// aucune dépendance à l'INM à l'exécution. La commune peut surcharger le climat
// de son bilan par sa météo locale, rien ne l'y oblige. Le moteur n'attend que
// deux grandeurs : les précipitations annuelles (APY, mm) et la température
// moyenne annuelle (ATY, °C).
//
// LE FICHIER : UTF-8, séparateur « ; », point décimal, une ligne par
// gouvernorat, colonnes gouvernorat ; precipitations_annuelles_mm ;
// temperature_moyenne_c ; station ; periode ; source ; licence.
//
// CE QUI EST REFUSÉ, avant toute écriture — le fichier entier, jamais à moitié :
// un gouvernorat absent, un gouvernorat que le référentiel ne connaît pas, deux
// lignes pour le même, une valeur vide ou illisible (une virgule décimale
// comprise : « 18,5 » lu comme 18 serait faux sans bruit), une source, une
// station, une période ou une licence vide. La liste des gouvernorats est celle
// de la base (communes réelles), jamais une liste écrite ici : le découpage
// vit dans la base (D-FNCT-2).
//
// REJOUÉ, IL NE CHANGE RIEN. Une normale déjà en vigueur à la même date d'effet
// et à la même valeur est laissée telle quelle. Une valeur DIFFÉRENTE à la même
// date est refusée : une référence nationale ne se réécrit pas en silence (règle
// 1.5). On la retire d'abord, avec son motif (POST
// /wapla/facteurs-reference/{id}/retrait), puis on recharge. Un autre jeu de
// normales (1991-2020, le jour où il sera publié) s'ajoute sous une autre date
// d'effet : les bilans déjà ouverts gardent les entrées qu'ils ont reçues.
// ---------------------------------------------------------------------------

process.env.SIIPI_DB_CONTEXT = 'server';
const { readFileSync } = await import('node:fs');
const { pool, query } = await import('../src/db.js');

const COLONNES = [
  'gouvernorat', 'precipitations_annuelles_mm', 'temperature_moyenne_c', 'station', 'periode', 'source', 'licence',
] as const;
type Ligne = Record<(typeof COLONNES)[number], string>;

/** Les mêmes bornes que la base (migration 074) : une faute de frappe est refusée ici, avec sa ligne. */
const BORNES = {
  precipitations_annuelles_mm: { min: 0, max: 3000, unite: 'mm' },
  temperature_moyenne_c: { min: -10, max: 40, unite: '°C' },
} as const;

function argument(nom: string): string | undefined {
  const i = process.argv.indexOf(`--${nom}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const fichier = argument('fichier') ?? 'seed/data/normales_inm_1981_2010.csv';
// Le jeu 1981-2010 vaut à partir du lendemain de sa période : un exercice lit
// la normale la plus récente dont la date d'effet le précède (migration 074).
const dateEffet = argument('date-effet') ?? '2011-01-01';

class FichierRefuse extends Error {}

function lire(chemin: string): Ligne[] {
  let texte: string;
  try {
    texte = readFileSync(chemin, 'utf8');
  } catch {
    throw new FichierRefuse(`Fichier introuvable : ${chemin}. Déposez les normales INM 1981-2010 (voir l'en-tête de ce script).`);
  }
  // Un BOM en tête (Excel l'ajoute) ferait de la première colonne « ﻿gouvernorat ».
  const lignes = texte.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lignes.length < 2) throw new FichierRefuse(`${chemin} : aucune ligne de données.`);
  const entete = lignes[0].split(';').map((c) => c.trim());
  const manquantes = COLONNES.filter((c) => !entete.includes(c));
  if (manquantes.length) {
    throw new FichierRefuse(`${chemin} : colonne(s) absente(s) : ${manquantes.join(', ')}. Attendues, séparées par « ; » : ${COLONNES.join(' ; ')}.`);
  }
  return lignes.slice(1).map((brut, i) => {
    const cases = brut.split(';').map((c) => c.trim());
    if (cases.length !== entete.length) {
      throw new FichierRefuse(`${chemin}, ligne ${i + 2} : ${cases.length} case(s) pour ${entete.length} colonnes. Une case ne contient pas de « ; » : dans une source, remplacez-le par une virgule.`);
    }
    return Object.fromEntries(COLONNES.map((c) => [c, cases[entete.indexOf(c)]])) as Ligne;
  });
}

function nombre(l: Ligne, n: number, colonne: keyof typeof BORNES): number {
  const brut = l[colonne];
  // Un nombre écrit à la française (« 18,5 ») est refusé, pas deviné : selon le
  // lecteur, il deviendrait 18, 185 ou rien.
  if (!/^-?\d+(\.\d+)?$/.test(brut)) {
    throw new FichierRefuse(`Ligne ${n} (${l.gouvernorat || '?'}) : « ${colonne} » vaut « ${brut} » — un nombre au point décimal est attendu (18.5, pas 18,5), jamais une case vide.`);
  }
  const v = Number(brut);
  const b = BORNES[colonne];
  if (v < b.min || v > b.max) {
    throw new FichierRefuse(`Ligne ${n} (${l.gouvernorat}) : ${v} ${b.unite} pour « ${colonne} », hors des bornes de la Tunisie (${b.min} à ${b.max}).`);
  }
  return v;
}

async function charger() {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateEffet)) throw new FichierRefuse(`Date d'effet illisible : « ${dateEffet} » (AAAA-MM-JJ).`);
  const lignes = lire(fichier);

  // Le référentiel : les gouvernorats des communes réelles, ni de test ni de démonstration.
  const connus = new Set(
    (await query<{ gouvernorat: string }>(
      `SELECT DISTINCT gouvernorat FROM communes
        WHERE deleted_at IS NULL AND NOT est_demo AND id NOT LIKE 'test%' AND gouvernorat IS NOT NULL`
    )).map((r) => r.gouvernorat)
  );

  const vus = new Map<string, { apy: number; aty: number; source: string }>();
  lignes.forEach((l, i) => {
    const n = i + 2;
    if (!connus.has(l.gouvernorat)) {
      throw new FichierRefuse(`Ligne ${n} : « ${l.gouvernorat} » n'est pas un gouvernorat du référentiel. Écrivez-le comme la base (${[...connus].sort().slice(0, 3).join(', ')}…).`);
    }
    if (vus.has(l.gouvernorat)) throw new FichierRefuse(`Ligne ${n} : « ${l.gouvernorat} » figure deux fois.`);
    for (const c of ['station', 'periode', 'source', 'licence'] as const) {
      if (!l[c]) throw new FichierRefuse(`Ligne ${n} (${l.gouvernorat}) : « ${c} » est vide. Un chiffre sans source ne se discute pas.`);
    }
    const apy = nombre(l, n, 'precipitations_annuelles_mm');
    const aty = nombre(l, n, 'temperature_moyenne_c');
    // Le trou de la classe climatique de l'outil d'origine (ATY > 20 °C et APY =
    // 400 mm exactement) : signalé, pas corrigé — le mode corrigé du moteur ferme la borne.
    if (aty > 20 && apy === 400) {
      console.warn(`[normales] ${l.gouvernorat} : 400 mm et ${aty} °C tombent dans le trou de la classe climatique de l'outil d'origine (défaut 6) ; le mode corrigé de SIIPI le traite.`);
    }
    vus.set(l.gouvernorat, {
      apy, aty,
      source: `INM, normales ${l.periode}, station ${l.station} — ${l.source} (licence ${l.licence})`,
    });
  });
  const absents = [...connus].filter((g) => !vus.has(g)).sort();
  if (absents.length) {
    throw new FichierRefuse(`${absents.length} gouvernorat(s) sans normales : ${absents.join(', ')}. Le fichier doit couvrir les ${connus.size} gouvernorats du référentiel.`);
  }

  // L'écriture : une seule transaction, sous le contexte FNCT du script
  // (SIIPI_DB_CONTEXT=server) — la politique d'ajout de la table l'exige.
  const client = await pool.connect();
  let ajoutees = 0;
  let inchangees = 0;
  try {
    await client.query('BEGIN');
    for (const [gouvernorat, v] of [...vus.entries()].sort()) {
      for (const [code, valeur] of [['precipitations_annuelles_mm', v.apy], ['temperature_moyenne_c', v.aty]] as const) {
        const enVigueur = await client.query<{ valeur: string; source: string }>(
          `SELECT valeur::text, source FROM wapla.facteurs_reference
            WHERE code = $1 AND gouvernorat = $2 AND date_effet = $3 AND retire_le IS NULL`,
          [code, gouvernorat, dateEffet]
        );
        const e = enVigueur.rows[0];
        if (e) {
          if (Number(e.valeur) === valeur && e.source === v.source) {
            inchangees++;
            continue;
          }
          throw new FichierRefuse(
            `${gouvernorat}, ${code} : la normale en vigueur au ${dateEffet} vaut ${e.valeur} (« ${e.source} »), le fichier donne ${valeur}. ` +
            `Une référence nationale ne se réécrit pas : retirez d'abord l'ancienne, avec son motif (POST /wapla/facteurs-reference/{id}/retrait), puis rechargez.`
          );
        }
        await client.query(
          `INSERT INTO wapla.facteurs_reference (code, gouvernorat, valeur, source, date_effet, saisi_par)
           VALUES ($1, $2, $3, $4, $5, NULL)`,
          [code, gouvernorat, valeur, v.source, dateEffet]
        );
        ajoutees++;
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  console.log(`[normales] ${vus.size} gouvernorats, date d'effet ${dateEffet} : ${ajoutees} valeur(s) ajoutée(s), ${inchangees} déjà en vigueur.`);
}

try {
  await charger();
} catch (err) {
  if (err instanceof FichierRefuse) {
    console.error(`[normales] REFUSÉ, rien n'est écrit. ${err.message}`);
    process.exitCode = 1;
  } else {
    throw err;
  }
} finally {
  await pool.end();
}
