// Le connecteur GPS générique (lot 17.4a ; DECISIONS_2026-10-20.md § 8).
//
// PARAMÉTRÉ, PAS PROGRAMMÉ. Aucun code ici ne connaît un fournisseur : chaque
// commune décrit le sien (URL, authentification, correspondance des champs JSON),
// et ce service ne fait que lire selon cette description.
//
// DEUX CHEMINS, UNE SEULE ENTRÉE. L'interrogation (pull, par le planificateur ou à
// la demande) et le webhook (push, signé) traduisent les positions puis les
// remettent à app.enregistrer_positions_gps() (migration 085) : c'est la base qui
// décide du sort de chacune — tracée, doublon ou signalée. Ce service n'écrit
// jamais une trace lui-même.
//
// L'HORODATAGE ILLISIBLE RESTE ILLISIBLE. Un fournisseur qui change son format de
// date ne doit pas voir ses positions datées de leur réception : une date qu'on
// ne sait pas lire devient null, et la base la signale (« horodatage_invalide »).
// Remplacer l'illisible par « maintenant » fabriquerait une trace fausse.
//
// LES SECRETS NE SORTENT PAS. Le jeton n'est déchiffré qu'au moment d'interroger ;
// il est retiré de tout message d'échec, avec les paramètres de l'adresse.
//
// Ce service travaille sans utilisateur (planificateur, webhook) : il lit la
// configuration et ses secrets par le compte du serveur, sans contexte de requête,
// comme la tâche de conservation des photos.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { pool } from '../db.js';
import { config } from '../config.js';
import { dechiffrerSecret } from './secretsGps.js';

export interface Correspondance {
  liste: string;
  boitier: string;
  latitude: string;
  longitude: string;
  horodatage: string;
  format_horodatage: 'iso' | 'epoch_s' | 'epoch_ms';
  vitesse?: string | null;
  cap?: string | null;
}

export interface PositionLue {
  boitier: string | null;
  lat: number | null;
  lng: number | null;
  horodatage: string | null;
  horodatage_brut: string | null;
  vitesse: number | null;
  cap: number | null;
}

export interface Bilan {
  recues: number;
  enregistrees: number;
  doublons: number;
  signalees: number;
}

interface FournisseurServeur {
  id: string;
  commune_id: string;
  mode: 'pull' | 'push';
  url: string | null;
  authentification: 'bearer' | 'entete' | 'parametre' | 'aucune';
  nom_champ_auth: string | null;
  correspondance: Correspondance;
  actif: boolean;
  jeton: Buffer | null;
  secret_webhook: Buffer | null;
}

/** Au-delà, un envoi n'est pas un relevé mais un défaut : il est refusé en le disant. */
export const POSITIONS_MAX = 5000;

/** Une erreur dont le message peut être montré à la commune tel quel. */
export class ErreurGps extends Error {}

// ---------------------------------------------------------------------------
// Lire selon la correspondance
// ---------------------------------------------------------------------------

/** La valeur au bout d'un chemin pointé (« data.positions », « pos.0.lat ») ; « » : l'objet lui-même. */
export function lireChemin(objet: unknown, chemin: string): unknown {
  if (!chemin) return objet;
  let courant: unknown = objet;
  for (const morceau of chemin.split('.')) {
    if (courant === null || typeof courant !== 'object') return undefined;
    courant = Array.isArray(courant) ? courant[Number(morceau)] : (courant as Record<string, unknown>)[morceau];
  }
  return courant;
}

const nombre = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v);
  return null;
};

const ISO = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;

/**
 * L'horodatage du fournisseur en ISO 8601, ou null s'il est illisible.
 * Une date sans fuseau est lue à l'heure de Tunis (UTC+1). Une date de calendrier
 * impossible (« 2026-13-45 ») est illisible, jamais « corrigée » en une autre.
 */
export function lireHorodatage(brut: unknown, format: Correspondance['format_horodatage']): string | null {
  if (brut === null || brut === undefined || brut === '') return null;
  if (format === 'epoch_s' || format === 'epoch_ms') {
    const n = nombre(brut);
    if (n === null) return null;
    const d = new Date(format === 'epoch_s' ? n * 1000 : n);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof brut !== 'string') return null;
  const m = ISO.exec(brut.trim());
  if (!m) return null;
  const [, a, mo, j, h, mi, s] = m;
  const annee = Number(a), mois = Number(mo), jour = Number(j), heure = Number(h), minute = Number(mi), seconde = Number(s ?? 0);
  const controle = new Date(Date.UTC(annee, mois - 1, jour));
  if (controle.getUTCMonth() !== mois - 1 || controle.getUTCDate() !== jour || heure > 23 || minute > 59 || seconde > 59) return null;
  const texte = m[7] ? brut.trim() : `${brut.trim()}+01:00`;
  const d = new Date(texte.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Les positions d'un corps de fournisseur, lues selon sa correspondance. */
export function traduirePositions(corps: unknown, c: Correspondance): PositionLue[] {
  const liste = lireChemin(corps, c.liste);
  if (!Array.isArray(liste)) {
    throw new ErreurGps(`Le chemin « ${c.liste || '(racine)'} » de la correspondance ne mène pas à une liste de positions.`);
  }
  if (liste.length > POSITIONS_MAX) {
    throw new ErreurGps(`${liste.length} positions en un envoi : au plus ${POSITIONS_MAX}. Le fournisseur doit découper ses envois.`);
  }
  return liste.map((element) => {
    const boitier = lireChemin(element, c.boitier);
    const horodatageBrut = lireChemin(element, c.horodatage);
    return {
      boitier: boitier === undefined || boitier === null ? null : String(boitier),
      lat: nombre(lireChemin(element, c.latitude)),
      lng: nombre(lireChemin(element, c.longitude)),
      horodatage: lireHorodatage(horodatageBrut, c.format_horodatage),
      horodatage_brut: horodatageBrut === undefined || horodatageBrut === null ? null : String(horodatageBrut).slice(0, 120),
      vitesse: c.vitesse ? nombre(lireChemin(element, c.vitesse)) : null,
      cap: c.cap ? nombre(lireChemin(element, c.cap)) : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Ce que le serveur lit, et ce qu'il écrit
// ---------------------------------------------------------------------------

async function fournisseurServeur(id: string): Promise<FournisseurServeur | null> {
  const { rows } = await pool.query<FournisseurServeur>(
    `SELECT f.id, f.commune_id, f.mode, f.url, f.authentification, f.nom_champ_auth, f.correspondance, f.actif,
            (SELECT valeur FROM gps_secrets s WHERE s.fournisseur_id = f.id AND s.nature = 'jeton') AS jeton,
            (SELECT valeur FROM gps_secrets s WHERE s.fournisseur_id = f.id AND s.nature = 'webhook') AS secret_webhook
       FROM gps_fournisseurs f WHERE f.id = $1 AND f.deleted_at IS NULL`,
    [id]
  );
  return rows[0] ?? null;
}

/** Remet des positions lues à la base, qui décide de leur sort. */
export async function enregistrerPositions(fournisseurId: string, positions: PositionLue[]): Promise<Bilan> {
  const { rows } = await pool.query<Bilan>('SELECT * FROM app.enregistrer_positions_gps($1, $2::jsonb)', [
    fournisseurId,
    JSON.stringify(positions),
  ]);
  return rows[0];
}

/** Un message d'échec, sans aucun secret ni paramètre d'adresse. */
function sansSecret(message: string, secrets: Array<string | null | undefined>): string {
  let m = message;
  for (const s of secrets) if (s) m = m.split(s).join('•••');
  return m.replace(/(https?:\/\/[^\s?#]+)\?[^\s]*/g, '$1?•••').slice(0, 300);
}

async function noterEchec(id: string, message: string): Promise<void> {
  await pool.query(
    `UPDATE gps_fournisseurs SET dernier_echec_le = now(), dernier_echec_message = $2, derniere_interrogation_le = now() WHERE id = $1`,
    [id, message]
  );
}

// ---------------------------------------------------------------------------
// L'interrogation (pull)
// ---------------------------------------------------------------------------

async function interrogerUrl(f: FournisseurServeur, jeton: string | null): Promise<unknown> {
  if (!f.url) throw new ErreurGps('Aucune adresse à interroger.');
  const url = new URL(f.url);
  const entetes: Record<string, string> = { Accept: 'application/json' };
  if (f.authentification !== 'aucune' && !jeton) throw new ErreurGps('Aucun jeton enregistré pour ce fournisseur.');
  if (f.authentification === 'bearer') entetes.Authorization = `Bearer ${jeton}`;
  if (f.authentification === 'entete' && f.nom_champ_auth) entetes[f.nom_champ_auth] = jeton ?? '';
  if (f.authentification === 'parametre' && f.nom_champ_auth) url.searchParams.set(f.nom_champ_auth, jeton ?? '');
  let reponse: Response;
  try {
    reponse = await fetch(url, { headers: entetes, signal: AbortSignal.timeout(10_000) });
  } catch (err) {
    throw new ErreurGps(
      err instanceof Error && err.name === 'TimeoutError' ? 'Le fournisseur ne répond pas en 10 secondes.' : 'Le fournisseur est injoignable.'
    );
  }
  if (!reponse.ok) throw new ErreurGps(`Le fournisseur a répondu ${reponse.status}.`);
  const texte = await reponse.text();
  if (texte.length > 20_000_000) throw new ErreurGps('Réponse de plus de 20 Mo : refusée.');
  try {
    return JSON.parse(texte);
  } catch {
    throw new ErreurGps('Réponse illisible : ce n’est pas du JSON.');
  }
}

export type ResultatInterrogation =
  | ({ statut: 'ok' } & Bilan)
  | { statut: 'essai'; lues: number; apercu: PositionLue[] }
  | { statut: 'echec'; message: string };

/**
 * Interroge le fournisseur une fois. En essai, rien n'est enregistré : la commune
 * voit les cinq premières positions telles que la correspondance les lit.
 */
export async function interrogerFournisseur(id: string, enregistrer: boolean): Promise<ResultatInterrogation> {
  const f = await fournisseurServeur(id);
  if (!f) throw new ErreurGps('Fournisseur introuvable.');
  if (f.mode !== 'pull') throw new ErreurGps('Ce fournisseur envoie ses positions (webhook) : il ne s’interroge pas.');
  let jeton: string | null = null;
  try {
    jeton = f.jeton ? dechiffrerSecret(f.jeton) : null;
    const corps = await interrogerUrl(f, jeton);
    const positions = traduirePositions(corps, f.correspondance);
    if (!enregistrer) return { statut: 'essai', lues: positions.length, apercu: positions.slice(0, 5) };
    const bilan = await enregistrerPositions(f.id, positions);
    await pool.query('UPDATE gps_fournisseurs SET derniere_interrogation_le = now() WHERE id = $1', [f.id]);
    return { statut: 'ok', ...bilan };
  } catch (err) {
    const brut = err instanceof ErreurGps ? err.message : 'Échec inattendu de l’interrogation.';
    const message = sansSecret(brut, [jeton]);
    if (!(err instanceof ErreurGps)) console.error(`[gps] interrogation de ${f.id} : ${sansSecret(String(err), [jeton])}`);
    if (enregistrer) await noterEchec(f.id, message);
    return { statut: 'echec', message };
  }
}

// ---------------------------------------------------------------------------
// Le webhook (push), signé
// ---------------------------------------------------------------------------

/** La fenêtre au-delà de laquelle un envoi signé est un rejeu : 5 minutes. */
const FENETRE_MS = 5 * 60 * 1000;

/**
 * La signature d'un envoi : HMAC-SHA256, avec le secret de la commune, de
 * « <horodatage>.<corps> » — l'horodatage signé empêche de rejouer un envoi ancien.
 */
export function signer(secret: string, horodatage: string, corps: Buffer): string {
  return 'sha256=' + createHmac('sha256', secret).update(`${horodatage}.`).update(corps).digest('hex');
}

export function signatureValide(secret: string, horodatage: string | undefined, corps: Buffer, signature: string | undefined): boolean {
  if (!horodatage || !signature || !/^\d{9,11}$/.test(horodatage)) return false;
  if (Math.abs(Date.now() - Number(horodatage) * 1000) > FENETRE_MS) return false;
  const attendue = Buffer.from(signer(secret, horodatage, corps));
  const recue = Buffer.from(signature);
  return attendue.length === recue.length && timingSafeEqual(attendue, recue);
}

export type ResultatWebhook = { code: 200; bilan: Bilan } | { code: 400 | 401 | 404; message: string };

export async function recevoirWebhook(id: string, horodatage?: string, signature?: string, corps?: Buffer): Promise<ResultatWebhook> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return { code: 404, message: 'Fournisseur introuvable.' };
  const f = await fournisseurServeur(id);
  // Un fournisseur inconnu, interrogé (pull), éteint, ou sans secret : introuvable, sans en dire plus.
  if (!f || f.mode !== 'push' || !f.actif || !f.secret_webhook) return { code: 404, message: 'Fournisseur introuvable.' };
  const secret = dechiffrerSecret(f.secret_webhook);
  if (!Buffer.isBuffer(corps) || !signatureValide(secret, horodatage, corps, signature)) {
    return { code: 401, message: 'Signature absente, fausse ou trop ancienne : envoi refusé.' };
  }
  let json: unknown;
  try {
    json = JSON.parse(corps.toString('utf8'));
  } catch {
    await noterEchec(f.id, 'Envoi illisible : ce n’est pas du JSON.');
    return { code: 400, message: 'Corps illisible : du JSON est attendu.' };
  }
  let positions: PositionLue[];
  try {
    positions = traduirePositions(json, f.correspondance);
  } catch (err) {
    const message = err instanceof ErreurGps ? err.message : 'Envoi illisible.';
    await noterEchec(f.id, message);
    return { code: 400, message };
  }
  return { code: 200, bilan: await enregistrerPositions(f.id, positions) };
}

// ---------------------------------------------------------------------------
// Le planificateur des interrogations
// ---------------------------------------------------------------------------

/** Un seul planificateur à la fois, même si plusieurs API servent la même base. */
const VERROU = 17_041;

export function demarrerPlanificateurGps(): void {
  if (!config.gps.planificateur) return;
  const tic = async () => {
    const c = await pool.connect();
    try {
      const { rows: [{ ok }] } = await c.query<{ ok: boolean }>('SELECT pg_try_advisory_lock($1) AS ok', [VERROU]);
      if (!ok) return;
      try {
        const { rows } = await c.query<{ id: string }>(
          `SELECT id FROM gps_fournisseurs
            WHERE deleted_at IS NULL AND actif AND mode = 'pull'
              AND (derniere_interrogation_le IS NULL
                   OR derniere_interrogation_le <= now() - make_interval(mins => cadence_minutes))`
        );
        // Un fournisseur en panne n'arrête pas les autres : chacun note son propre échec.
        for (const { id } of rows) await interrogerFournisseur(id, true);
      } finally {
        await c.query('SELECT pg_advisory_unlock($1)', [VERROU]);
      }
    } catch (err) {
      console.error('[gps] tour du planificateur interrompu', err instanceof Error ? err.message : err);
    } finally {
      c.release();
    }
  };
  setInterval(() => void tic(), Math.max(1, config.gps.ticSecondes) * 1000).unref();
  console.log(`[gps] Planificateur des interrogations actif (un tour toutes les ${config.gps.ticSecondes} s).`);
}
