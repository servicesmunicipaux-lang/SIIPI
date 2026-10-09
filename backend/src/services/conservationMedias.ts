// Conservation des photos (décision FNCT D-FNCT-4, 9 octobre 2026).
//
// À 36 mois, une photo est recompressée (JPEG qualité 70, 500 Ko au plus) ; la
// version compressée reste en ligne indéfiniment, l'original part dans
// l'archive froide, où il est conservé sans limite, et la FNCT peut en demander
// la restauration. Les fiches ne sont jamais réécrites (migration 066).
//
// L'ORDRE DES GESTES EST LA GARANTIE. Pour chaque photo : relire l'original et
// vérifier son empreinte ; le copier dans l'archive, relire la copie, la
// vérifier ; écrire la version compressée ; marquer la fiche ; et seulement
// alors retirer l'original du volume courant. Une interruption à n'importe quel
// endroit laisse au pire un fichier en double — jamais une photo sans original.
//
// L'ARCHIVE DOIT ÊTRE MONTÉE, ET LE DIRE. Un dossier absent se crée tout seul :
// si le volume de l'archive n'était pas monté, la tâche écrirait les originaux
// dans le système de fichiers du conteneur, qui disparaît à sa reconstruction —
// et les croirait archivés. La tâche exige donc un fichier témoin, posé une fois
// par `npm run medias:archive:initialiser` sur le vrai volume. Sans lui, elle
// refuse le passage et ne touche à rien.

import { createHash } from 'node:crypto';
import { access, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import type pg from 'pg';
import sharp from 'sharp';
import { pool } from '../db.js';
import { cheminAbsolu, racine } from './fichiers.js';

export const TEMOIN_ARCHIVE = '.siipi-archive-froide';

/** Racine de l'archive froide, absolue. */
export function racineArchive(): string {
  return resolve(process.env.SIIPI_ARCHIVE_DIR ?? '/var/siipi/archive');
}

function cheminArchive(relatif: string): string {
  const base = racineArchive();
  const complet = resolve(base, relatif);
  if (!complet.startsWith(base + sep)) {
    throw new Error(`Chemin hors de l'archive froide : ${relatif}`);
  }
  return complet;
}

function empreinte(octets: Buffer): string {
  return createHash('sha256').update(octets).digest('hex');
}

/**
 * Pourquoi l'archive ne peut pas servir, ou null si elle le peut. Une archive
 * rangée SOUS le volume courant n'en est pas une : elle partirait avec lui.
 */
export async function archiveIndisponible(): Promise<string | null> {
  const archive = racineArchive();
  const courant = racine();
  if (archive === courant || archive.startsWith(courant + sep) || courant.startsWith(archive + sep)) {
    return `L'archive froide (${archive}) et le volume courant (${courant}) se recouvrent : l'archive doit être un volume à part.`;
  }
  try {
    await access(resolve(archive, TEMOIN_ARCHIVE));
    return null;
  } catch {
    return `Archive froide non initialisée : le fichier témoin ${TEMOIN_ARCHIVE} est absent de ${archive}. Monter le volume de l'archive, puis lancer « npm run medias:archive:initialiser ».`;
  }
}

/** Pose le témoin : à lancer une fois, sur le volume réellement monté. */
export async function initialiserArchive(): Promise<string> {
  const archive = racineArchive();
  await mkdir(archive, { recursive: true });
  const temoin = resolve(archive, TEMOIN_ARCHIVE);
  await writeFile(
    temoin,
    `Archive froide des originaux de photos SIIPI (D-FNCT-4).\nInitialisée le ${new Date().toISOString()}.\n` +
      `Ne pas effacer : sans ce fichier, la tâche de conservation refuse de compresser.\n`,
    { flag: 'wx' }
  ).catch((err: NodeJS.ErrnoException) => {
    if (err.code !== 'EEXIST') throw err;
  });
  return temoin;
}

type Parametres = { delai: string; qualite: number; tailleMaxOctets: number };

async function lireParametres(c: pg.PoolClient): Promise<Parametres> {
  const { rows } = await c.query<{ cle: string; valeur: string }>(
    `SELECT cle, valeur FROM app_parametres WHERE cle LIKE 'medias.%'`
  );
  const p = Object.fromEntries(rows.map((r) => [r.cle, r.valeur]));
  return {
    delai: p['medias.delai_compression'] ?? '36 months',
    qualite: Number(p['medias.qualite_jpeg'] ?? 70),
    tailleMaxOctets: Number(p['medias.taille_max_compressee_ko'] ?? 500) * 1024,
  };
}

/**
 * La version compressée : toujours un JPEG, à la qualité fixée, et réduite par
 * paliers tant qu'elle dépasse le poids maximal. Un PNG transparent reçoit un
 * fond blanc — le JPEG n'a pas de transparence, et un fond noir par défaut
 * rendrait illisible une capture d'écran.
 */
export async function compresser(octets: Buffer, qualite: number, tailleMax: number): Promise<Buffer> {
  const { width } = await sharp(octets).metadata();
  let largeur = width ?? 0;
  const encoder = (l?: number) => {
    let image = sharp(octets).rotate().flatten({ background: '#ffffff' });
    if (l) image = image.resize({ width: l, withoutEnlargement: true });
    return image.jpeg({ quality: qualite }).toBuffer();
  };
  let sortie = await encoder();
  while (sortie.length > tailleMax && largeur > 64) {
    largeur = Math.floor(largeur * 0.85);
    sortie = await encoder(largeur);
  }
  if (sortie.length > tailleMax) throw new Error('compression_insuffisante');
  return sortie;
}

/** <commune>/<aaaa>/<mm>/<id>.png → <commune>/<aaaa>/<mm>/<id>.compresse.jpg */
function cheminCompresse(relatif: string): string {
  return relatif.replace(/\.[a-z0-9]+$/i, '') + '.compresse.jpg';
}

/**
 * Une connexion avec les droits d'administration, et un rôle nommé pour le
 * journal d'audit : la compression d'une photo y apparaît comme le fait de la
 * tâche, pas d'un utilisateur.
 */
async function connexionTache(): Promise<pg.PoolClient> {
  const c = await pool.connect();
  await c.query(`SELECT set_config('app.role', 'tache_conservation_medias', false),
                        set_config('app.user_id', '', false)`);
  return c;
}

async function liberer(c: pg.PoolClient): Promise<void> {
  // Le rôle nommé ne doit pas suivre la connexion dans le pool.
  try {
    await c.query(`RESET app.role; RESET app.user_id`);
  } finally {
    c.release();
  }
}

export type BilanPassage = {
  passage: number;
  statut: 'termine' | 'refuse';
  motifRefus: string | null;
  eligibles: number;
  compressees: number;
  octetsAvant: number;
  octetsApres: number;
  anomalies: Array<{ fichier: string; raison: string }>;
};

type Eligible = { id: string; chemin_relatif: string; sha256: string; taille_octets: number; created_at: string };

/**
 * Le passage de la tâche : toutes les photos qui ont l'âge, une à une.
 *
 * `commune` restreint le passage à une commune. Le planificateur ne s'en sert
 * jamais ; la campagne `purge-media` s'en sert pour ne compresser que ses
 * propres photos d'essai — sur une base qui en porterait d'autres, un passage
 * national lancé par un test aurait archivé des photos réelles.
 */
export async function compresserPhotosAnciennes(
  declenchePar: 'planificateur' | 'commande',
  commune: string | null = null
): Promise<BilanPassage> {
  const c = await connexionTache();
  try {
    const p = await lireParametres(c);
    const { rows: [{ id: passage }] } = await c.query<{ id: number }>(
      `INSERT INTO passages_conservation_medias (declenche_par, perimetre) VALUES ($1, $2) RETURNING id`,
      [declenchePar, commune]
    );
    const bilan: BilanPassage = {
      passage, statut: 'termine', motifRefus: null, eligibles: 0, compressees: 0,
      octetsAvant: 0, octetsApres: 0, anomalies: [],
    };

    const { rows: [{ n }] } = await c.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM fichiers
        WHERE compressee_le IS NULL
          AND type_mime IN ('image/jpeg', 'image/png', 'image/webp')
          AND coalesce(usage, 'autre') NOT IN ('rapport_etude', 'document_projet')
          AND created_at < now() - $1::interval
          AND ($2::text IS NULL OR commune_id = $2)`,
      [p.delai, commune]
    );
    bilan.eligibles = n;

    const refus = await archiveIndisponible();
    if (refus) {
      bilan.statut = 'refuse';
      bilan.motifRefus = refus;
    } else {
      // Par lots, dans l'ordre d'âge, en reprenant après le dernier vu : une
      // photo en anomalie reste « à compresser » et ne doit pas être reprise à
      // l'infini dans le même passage.
      let apres = null as { created_at: string; id: string } | null;
      for (;;) {
        const { rows }: { rows: Eligible[] } = await c.query<Eligible>(
          `SELECT id, chemin_relatif, sha256, taille_octets, created_at::text AS created_at
             FROM fichiers
            WHERE compressee_le IS NULL
              AND type_mime IN ('image/jpeg', 'image/png', 'image/webp')
              AND coalesce(usage, 'autre') NOT IN ('rapport_etude', 'document_projet')
              AND created_at < now() - $1::interval
              AND ($4::text IS NULL OR commune_id = $4)
              AND ($2::timestamptz IS NULL OR (created_at, id) > ($2::timestamptz, $3::uuid))
            ORDER BY created_at, id
            LIMIT 100`,
          [p.delai, apres?.created_at ?? null, apres?.id ?? null, commune]
        );
        if (rows.length === 0) break;
        for (const f of rows) {
          // Une erreur imprévue sur une photo ne doit pas laisser le passage
          // « en cours » pour toujours : elle devient une anomalie de plus.
          const anomalie = await compresserUne(c, f, p, bilan)
            .catch((err: Error) => `erreur : ${err.message}`.slice(0, 300));
          if (anomalie) bilan.anomalies.push({ fichier: f.id, raison: anomalie });
        }
        apres = rows[rows.length - 1];
      }
    }

    await c.query(
      `UPDATE passages_conservation_medias
          SET fin = now(), statut = $2, motif_refus = $3, photos_eligibles = $4,
              photos_compressees = $5, octets_avant = $6, octets_apres = $7, anomalies = $8
        WHERE id = $1`,
      [passage, bilan.statut, bilan.motifRefus, bilan.eligibles, bilan.compressees,
       bilan.octetsAvant, bilan.octetsApres, JSON.stringify(bilan.anomalies)]
    );
    return bilan;
  } finally {
    await liberer(c);
  }
}

/** Une photo. Rend la raison d'une anomalie, ou null si tout s'est passé. */
async function compresserUne(c: pg.PoolClient, f: Eligible, p: Parametres, bilan: BilanPassage): Promise<string | null> {
  let original: Buffer;
  try {
    original = await readFile(cheminAbsolu(f.chemin_relatif));
  } catch {
    return 'original_introuvable';
  }
  // Un original qui ne correspond plus à sa fiche n'est ni archivé ni
  // compressé : ce serait figer une altération comme si elle était la photo.
  if (empreinte(original) !== f.sha256) return 'empreinte_differente';

  let compresse: Buffer;
  try {
    compresse = await compresser(original, p.qualite, p.tailleMaxOctets);
  } catch {
    return 'image_illisible';
  }

  // Dans l'archive : copie, relecture, vérification. Une copie déjà présente
  // (passage interrompu) est acceptée si elle est identique, jamais écrasée.
  const enArchive = cheminArchive(f.chemin_relatif);
  try {
    const deja = await readFile(enArchive);
    if (empreinte(deja) !== f.sha256) return 'archive_occupee';
  } catch {
    await mkdir(dirname(enArchive), { recursive: true });
    await writeFile(enArchive, original, { mode: 0o440, flag: 'wx' });
  }
  if (empreinte(await readFile(enArchive)) !== f.sha256) return 'archive_illisible';

  const relCompresse = cheminCompresse(f.chemin_relatif);
  const absCompresse = cheminAbsolu(relCompresse);
  await mkdir(dirname(absCompresse), { recursive: true });
  await writeFile(absCompresse, compresse, { mode: 0o640 });

  const { rowCount } = await c.query(
    `UPDATE fichiers
        SET compressee_le = now(), chemin_compresse = $2, taille_compressee_octets = $3,
            sha256_compresse = $4, chemin_archive = $5
      WHERE id = $1 AND compressee_le IS NULL`,
    [f.id, relCompresse, compresse.length, empreinte(compresse), f.chemin_relatif]
  );
  if (rowCount !== 1) return 'deja_compressee';

  bilan.compressees += 1;
  bilan.octetsAvant += f.taille_octets;
  bilan.octetsApres += compresse.length;

  // L'original est à l'abri dans l'archive : il quitte le volume courant. S'il
  // ne le peut pas, rien n'est perdu — seulement de la place.
  try {
    await unlink(cheminAbsolu(f.chemin_relatif));
  } catch {
    return 'original_non_retire_du_volume';
  }
  return null;
}

export type BilanRestaurations = { traitees: number; restaurees: number; echecs: Array<{ demande: string; raison: string }> };

/** Les demandes ouvertes, servies si l'archive le permet (d'une commune, ou toutes). */
export async function servirRestaurations(commune: string | null = null): Promise<BilanRestaurations> {
  const c = await connexionTache();
  const bilan: BilanRestaurations = { traitees: 0, restaurees: 0, echecs: [] };
  try {
    const { rows } = await c.query<{ id: string; fichier_id: string; chemin_relatif: string; chemin_archive: string; sha256: string }>(
      `SELECT d.id, d.fichier_id, f.chemin_relatif, f.chemin_archive, f.sha256
         FROM demandes_restauration d JOIN fichiers f ON f.id = d.fichier_id
        WHERE d.statut = 'demandee' AND ($1::text IS NULL OR d.commune_id = $1)
        ORDER BY d.demandee_le`,
      [commune]
    );
    const refus = rows.length ? await archiveIndisponible() : null;
    for (const d of rows) {
      bilan.traitees += 1;
      let raison: string | null = refus ? 'archive_absente' : null;
      let original: Buffer | null = null;
      if (!raison) {
        try {
          original = await readFile(cheminArchive(d.chemin_archive));
        } catch {
          raison = 'original_introuvable';
        }
      }
      if (!raison && original && empreinte(original) !== d.sha256) raison = 'empreinte_differente';

      if (!raison && original) {
        const abs = cheminAbsolu(d.chemin_relatif);
        await mkdir(dirname(abs), { recursive: true });
        await writeFile(abs, original, { mode: 0o640 });
        await c.query('BEGIN');
        try {
          await c.query(`UPDATE fichiers SET original_restaure_le = now() WHERE id = $1`, [d.fichier_id]);
          await c.query(
            `UPDATE demandes_restauration
                SET statut = 'restauree', restauree_le = now(), tentatives = tentatives + 1,
                    derniere_tentative_le = now(), derniere_erreur = NULL
              WHERE id = $1`,
            [d.id]
          );
          await c.query('COMMIT');
        } catch (err) {
          await c.query('ROLLBACK');
          throw err;
        }
        bilan.restaurees += 1;
      } else {
        await c.query(
          `UPDATE demandes_restauration
              SET tentatives = tentatives + 1, derniere_tentative_le = now(), derniere_erreur = $2
            WHERE id = $1`,
          [d.id, raison]
        );
        bilan.echecs.push({ demande: d.id, raison: raison ?? 'inconnue' });
      }
    }
    return bilan;
  } finally {
    await liberer(c);
  }
}

// --- Planificateur ------------------------------------------------------------

const VERROU = 6604; // pg_try_advisory_lock : une seule instance travaille à la fois

/**
 * Une vérification par heure : les demandes de restauration ouvertes sont
 * servies, et le passage mensuel a lieu s'il n'a pas encore abouti ce mois-ci
 * (heure de Tunis). Un passage refusé n'est retenté qu'au bout d'un jour, pour
 * ne pas remplir la table d'un refus par heure tant que l'archive manque.
 *
 * Activé par SIIPI_CONSERVATION_MEDIAS=active : hors production, une base de
 * développement n'a ni photos anciennes ni archive froide à remplir.
 */
export function demarrerPlanificateurConservation(): void {
  if (process.env.SIIPI_CONSERVATION_MEDIAS !== 'active') return;
  const tic = async () => {
    const c = await pool.connect();
    try {
      const { rows: [{ ok }] } = await c.query<{ ok: boolean }>('SELECT pg_try_advisory_lock($1) AS ok', [VERROU]);
      if (!ok) return;
      try {
        await servirRestaurations();
        const { rows: [{ du_mois, refus_recent }] } = await c.query<{ du_mois: boolean; refus_recent: boolean }>(
          `SELECT EXISTS (SELECT 1 FROM passages_conservation_medias
                           WHERE statut = 'termine' AND perimetre IS NULL
                             AND date_trunc('month', debut AT TIME ZONE 'Africa/Tunis')
                               = date_trunc('month', now() AT TIME ZONE 'Africa/Tunis')) AS du_mois,
                  EXISTS (SELECT 1 FROM passages_conservation_medias
                           WHERE statut = 'refuse' AND perimetre IS NULL
                             AND debut > now() - interval '1 day') AS refus_recent`
        );
        if (!du_mois && !refus_recent) {
          const b = await compresserPhotosAnciennes('planificateur');
          console.log(`[conservation] passage ${b.passage} : ${b.statut}, ${b.compressees}/${b.eligibles} photo(s) compressée(s).`);
        }
      } finally {
        await c.query('SELECT pg_advisory_unlock($1)', [VERROU]);
      }
    } catch (err) {
      console.error('[conservation] Passage interrompu', err);
    } finally {
      c.release();
    }
  };
  setTimeout(tic, 60_000).unref();
  setInterval(tic, 60 * 60 * 1000).unref();
  console.log('[conservation] Tâche de conservation des photos active (vérification horaire).');
}
