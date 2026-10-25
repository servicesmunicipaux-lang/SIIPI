// Le connecteur GPS, vu par la commune et par la FNCT (lot 17.4a ; migration 085,
// services/gps.ts).
//
//   /gps/configuration                     le fournisseur de la commune : lu par elle et
//                                          par la FNCT, écrit par la commune SEULE ;
//                                          le jeton s'écrit, il ne se relit jamais
//   /gps/configuration/essai               lire sans rien enregistrer (régler la
//                                          correspondance des champs)
//   /gps/configuration/interroger          une interrogation maintenant, enregistrée
//   /gps/configuration/secret-webhook      un secret de webhook neuf, montré UNE fois
//   /gps/boitiers                          boîtier → engin, daté ; se clôt, ne s'efface pas
//   /gps/non-rattachees                    les positions signalées, par boîtier
//   /gps/traces                            la dernière position de chaque engin, ou la
//                                          trace d'un jour
//   /gps/webhook/:fournisseurId            l'envoi d'un fournisseur : sans compte, SIGNÉ
//
// Le prestataire ne lit rien de tout cela (décision du 23/10/2026) ; une commune
// hors de son périmètre est introuvable (404), jamais « refusée ».
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { query, queryOne } from '../db.js';
import { config } from '../config.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { communeDemandee } from '../perimetre.js';
import { chiffrerSecret, nouveauSecretWebhook } from '../services/secretsGps.js';
import { ErreurGps, interrogerFournisseur, recevoirWebhook, traduirePositions, type Correspondance } from '../services/gps.js';

export const gpsRouter = Router();

const LECTEURS = ['admin_commune', 'super_admin_fnct'] as const;
const chemin = z.string().trim().max(200).regex(/^[A-Za-z0-9_.-]*$/, 'Un chemin de champ : lettres, chiffres, « _ », « - » et « . » seulement.');
const cheminRequis = chemin.min(1, 'Ce champ de la correspondance est requis.');

export const correspondanceSchema = z
  .object({
    liste: chemin,
    boitier: cheminRequis,
    latitude: cheminRequis,
    longitude: cheminRequis,
    horodatage: cheminRequis,
    format_horodatage: z.enum(['iso', 'epoch_s', 'epoch_ms']),
    vitesse: chemin.nullable().optional(),
    cap: chemin.nullable().optional(),
  })
  .strict();

export const configurationSchema = z
  .object({
    nom: z.string().trim().min(1).max(120),
    mode: z.enum(['pull', 'push']),
    url: z.string().trim().url().max(500).regex(/^https?:\/\//, 'Adresse http ou https attendue.').nullable().optional(),
    cadenceMinutes: z.number().int().min(1).max(1440).default(5),
    authentification: z.enum(['bearer', 'entete', 'parametre', 'aucune']).default('bearer'),
    nomChampAuth: z.string().trim().regex(/^[A-Za-z0-9_-]{1,64}$/, 'Nom de champ : lettres, chiffres, « _ » et « - ».').nullable().optional(),
    correspondance: correspondanceSchema,
    actif: z.boolean().default(false),
    // Écrit seulement : absent, le jeton enregistré reste ; il n'est jamais relu.
    jeton: z.string().min(1).max(2000).optional(),
  })
  .strict();

export const essaiSchema = z.object({ exemple: z.unknown().optional() }).strict();
export const boitierSchema = z
  .object({
    identifiant: z.string().trim().min(1).max(120),
    vehiculeId: z.string().min(1),
    dateDebut: z.string().datetime({ offset: true }).optional(),
  })
  .strict();
export const clotureSchema = z.object({ dateFin: z.string().datetime({ offset: true }).optional() }).strict();
export const tracesSchema = z.object({
  vehiculeId: z.string().optional(),
  jour: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Jour attendu au format AAAA-MM-JJ.').optional(),
});

/** La commune demandée, dans le périmètre de l'appelant — sinon introuvable. */
async function communePermise(req: Parameters<typeof communeDemandee>[0]): Promise<string> {
  const c = communeDemandee(req);
  if (!c) throw new ApiError(400, 'Commune requise (paramètre communeId).');
  const lit = await queryOne<{ ok: boolean }>('SELECT app.gps_lit($1) AS ok', [c]);
  if (!lit?.ok) throw new ApiError(404, 'Commune introuvable.');
  return c;
}

interface LigneFournisseur {
  id: string;
  commune_id: string;
  nom: string;
  mode: 'pull' | 'push';
  url: string | null;
  cadence_minutes: number;
  authentification: string;
  nom_champ_auth: string | null;
  correspondance: Correspondance;
  actif: boolean;
  derniere_interrogation_le: string | null;
  dernier_releve_recu_le: string | null;
  dernier_echec_le: string | null;
  dernier_echec_message: string | null;
  updated_at: string;
}

const fournisseurDe = (commune: string) =>
  queryOne<LigneFournisseur>('SELECT * FROM gps_fournisseurs WHERE commune_id = $1 AND deleted_at IS NULL', [commune]);

/** La configuration telle qu'elle se montre : jamais un secret, seulement s'il est enregistré et quand. */
async function vue(commune: string) {
  const f = await fournisseurDe(commune);
  if (!f) return { configure: false as const, commune_id: commune };
  const secrets = await query<{ nature: string; enregistre_le: string }>('SELECT * FROM app.gps_secrets_enregistres($1)', [f.id]);
  const le = (n: string) => secrets.find((s) => s.nature === n)?.enregistre_le ?? null;
  return {
    configure: true as const,
    commune_id: commune,
    id: f.id,
    nom: f.nom,
    mode: f.mode,
    url: f.url,
    cadence_minutes: f.cadence_minutes,
    authentification: f.authentification,
    nom_champ_auth: f.nom_champ_auth,
    correspondance: f.correspondance,
    actif: f.actif,
    jeton_enregistre_le: le('jeton'),
    secret_webhook_enregistre_le: le('webhook'),
    webhook_chemin: f.mode === 'push' ? `/gps/webhook/${f.id}` : null,
    derniere_interrogation_le: f.derniere_interrogation_le,
    dernier_releve_recu_le: f.dernier_releve_recu_le,
    dernier_echec_le: f.dernier_echec_le,
    dernier_echec_message: f.dernier_echec_message,
    mis_a_jour_le: f.updated_at,
  };
}

/** Les refus de la base (migration 085), en messages qui disent quoi faire. */
function refusBase(err: unknown): never {
  const e = err as { message?: string; constraint?: string; code?: string };
  if (e.message?.includes('GPS_ENGIN_AUTRE_COMMUNE')) throw new ApiError(400, 'Cet engin n’est pas un engin de la commune : un boîtier ne se rattache qu’à un engin de sa commune.');
  if (e.message?.includes('GPS_FOURNISSEUR_AUTRE_COMMUNE')) throw new ApiError(400, 'Ce fournisseur n’est pas celui de la commune.');
  if (e.message?.includes('GPS_BOITIER_FIGE')) throw new ApiError(400, 'Une correspondance ne se réécrit pas : clôturez-la et saisissez la nouvelle.');
  if (e.constraint === 'uq_gps_boitier_actif') throw new ApiError(409, 'Ce boîtier équipe déjà un engin : clôturez cette correspondance avant d’en saisir une autre.');
  if (e.constraint === 'gps_url_en_pull') throw new ApiError(400, 'En interrogation (pull), l’adresse du fournisseur est requise.');
  if (e.constraint === 'gps_champ_auth_nomme') throw new ApiError(400, 'Nommez l’en-tête ou le paramètre qui porte le jeton.');
  if (e.code === '23503') throw new ApiError(400, 'Engin introuvable.');
  throw err;
}

// ---------------------------------------------------------------------------
// La configuration
// ---------------------------------------------------------------------------

gpsRouter.get(
  '/configuration',
  requireAuth,
  requireRole(...LECTEURS),
  asyncHandler(async (req, res) => {
    res.json(await vue(await communePermise(req)));
  })
);

gpsRouter.put(
  '/configuration',
  requireAuth,
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const commune = await communePermise(req);
    const d = configurationSchema.parse(req.body);
    const existant = await fournisseurDe(commune);
    let id = existant?.id;
    try {
      if (existant) {
        await query(
          `UPDATE gps_fournisseurs SET nom = $2, mode = $3, url = $4, cadence_minutes = $5, authentification = $6,
                  nom_champ_auth = $7, correspondance = $8, actif = $9, updated_at = now()
            WHERE id = $1`,
          [existant.id, d.nom, d.mode, d.url ?? null, d.cadenceMinutes, d.authentification, d.nomChampAuth ?? null, d.correspondance, d.actif]
        );
      } else {
        const ligne = await queryOne<{ id: string }>(
          `INSERT INTO gps_fournisseurs (commune_id, nom, mode, url, cadence_minutes, authentification, nom_champ_auth, correspondance, actif, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, app.current_user_id()) RETURNING id`,
          [commune, d.nom, d.mode, d.url ?? null, d.cadenceMinutes, d.authentification, d.nomChampAuth ?? null, d.correspondance, d.actif]
        );
        id = ligne?.id;
      }
      if (d.jeton && id) await query('SELECT app.gps_enregistrer_secret($1, $2, $3)', [id, 'jeton', chiffrerSecret(d.jeton)]);
    } catch (err) {
      refusBase(err);
    }
    res.json(await vue(commune));
  })
);

gpsRouter.post(
  '/configuration/secret-webhook',
  requireAuth,
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const commune = await communePermise(req);
    const f = await fournisseurDe(commune);
    if (!f) throw new ApiError(404, 'Aucun fournisseur GPS configuré pour cette commune.');
    if (f.mode !== 'push') throw new ApiError(400, 'Le secret de webhook ne sert qu’à un fournisseur qui envoie (push).');
    const secret = nouveauSecretWebhook();
    await query('SELECT app.gps_enregistrer_secret($1, $2, $3)', [f.id, 'webhook', chiffrerSecret(secret)]);
    res.status(201).json({
      secret,
      webhook_chemin: `/gps/webhook/${f.id}`,
      avertissement: 'Ce secret ne sera plus jamais affiché : transmettez-le maintenant au fournisseur. En générer un nouveau remplace celui-ci.',
    });
  })
);

gpsRouter.post(
  '/configuration/essai',
  requireAuth,
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const commune = await communePermise(req);
    const { exemple } = essaiSchema.parse(req.body ?? {});
    const f = await fournisseurDe(commune);
    if (!f) throw new ApiError(404, 'Aucun fournisseur GPS configuré pour cette commune.');
    // Un exemple collé (un envoi de webhook, une réponse copiée) se lit sans rien interroger.
    if (exemple !== undefined) {
      try {
        const positions = traduirePositions(exemple, f.correspondance);
        res.json({ statut: 'essai', lues: positions.length, apercu: positions.slice(0, 5) });
      } catch (err) {
        res.json({ statut: 'echec', message: err instanceof ErreurGps ? err.message : 'Exemple illisible.' });
      }
      return;
    }
    if (f.mode !== 'pull') throw new ApiError(400, 'Un fournisseur qui envoie (push) s’essaie avec un exemple de ses envois.');
    res.json(await interrogerFournisseur(f.id, false));
  })
);

gpsRouter.post(
  '/configuration/interroger',
  requireAuth,
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const commune = await communePermise(req);
    const f = await fournisseurDe(commune);
    if (!f) throw new ApiError(404, 'Aucun fournisseur GPS configuré pour cette commune.');
    if (f.mode !== 'pull') throw new ApiError(400, 'Ce fournisseur envoie ses positions (webhook) : il ne s’interroge pas.');
    res.json(await interrogerFournisseur(f.id, true));
  })
);

// ---------------------------------------------------------------------------
// Les boîtiers
// ---------------------------------------------------------------------------

gpsRouter.get(
  '/boitiers',
  requireAuth,
  requireRole(...LECTEURS),
  asyncHandler(async (req, res) => {
    const commune = await communePermise(req);
    res.json(
      await query(
        `SELECT b.id, b.identifiant, b.vehicule_id, v.registration, b.date_debut, b.date_fin, (b.date_fin IS NULL) AS actif
           FROM gps_boitiers b LEFT JOIN vehicules v ON v.id = b.vehicule_id
          WHERE b.commune_id = $1
          ORDER BY (b.date_fin IS NULL) DESC, b.identifiant, b.date_debut DESC`,
        [commune]
      )
    );
  })
);

gpsRouter.post(
  '/boitiers',
  requireAuth,
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const commune = await communePermise(req);
    const d = boitierSchema.parse(req.body);
    const f = await fournisseurDe(commune);
    if (!f) throw new ApiError(404, 'Aucun fournisseur GPS configuré pour cette commune.');
    try {
      const ligne = await queryOne(
        `INSERT INTO gps_boitiers (commune_id, fournisseur_id, identifiant, vehicule_id, date_debut, created_by)
         VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now()), app.current_user_id())
         RETURNING id, identifiant, vehicule_id, date_debut, date_fin`,
        [commune, f.id, d.identifiant, d.vehiculeId, d.dateDebut ?? null]
      );
      res.status(201).json(ligne);
    } catch (err) {
      refusBase(err);
    }
  })
);

gpsRouter.post(
  '/boitiers/:id/cloture',
  requireAuth,
  requireRole('admin_commune'),
  asyncHandler(async (req, res) => {
    const d = clotureSchema.parse(req.body ?? {});
    const ligne = await queryOne(
      `UPDATE gps_boitiers SET date_fin = COALESCE($2::timestamptz, now())
        WHERE id = $1 AND date_fin IS NULL
        RETURNING id, identifiant, vehicule_id, date_debut, date_fin`,
      [req.params.id, d.dateFin ?? null]
    ).catch((err) => {
      if ((err as { constraint?: string }).constraint === 'gps_boitier_periode') throw new ApiError(400, 'La fin doit suivre le début.');
      throw err;
    });
    if (!ligne) throw new ApiError(404, 'Correspondance introuvable, ou déjà close.');
    res.json(ligne);
  })
);

// ---------------------------------------------------------------------------
// Les positions signalées, et les traces
// ---------------------------------------------------------------------------

gpsRouter.get(
  '/non-rattachees',
  requireAuth,
  requireRole(...LECTEURS),
  asyncHandler(async (req, res) => {
    const commune = await communePermise(req);
    res.json(
      await query(
        `SELECT n.boitier, n.motif, count(*)::int AS nombre, min(n.recu_le) AS premiere_recue, max(n.recu_le) AS derniere_recue,
                (array_agg(n.horodatage_brut ORDER BY n.recu_le DESC))[1] AS dernier_horodatage_brut
           FROM gps_positions_non_rattachees n
          WHERE n.commune_id = $1
          GROUP BY n.boitier, n.motif
          ORDER BY max(n.recu_le) DESC
          LIMIT 500`,
        [commune]
      )
    );
  })
);

gpsRouter.get(
  '/traces',
  requireAuth,
  requireRole(...LECTEURS),
  asyncHandler(async (req, res) => {
    const commune = await communePermise(req);
    const q = tracesSchema.parse(req.query);
    if (q.vehiculeId) {
      const jour = q.jour ?? new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
      // Le jour de Tunis (UTC+1), de minuit à minuit.
      const points = await query(
        `SELECT horodatage, ST_Y(geom) AS lat, ST_X(geom) AS lng, vitesse_kmh::float AS vitesse_kmh, cap
           FROM traces_engins
          WHERE commune_id = $1 AND vehicule_id = $2
            AND horodatage >= ($3::date)::timestamp AT TIME ZONE 'Africa/Tunis'
            AND horodatage <  ($3::date + 1)::timestamp AT TIME ZONE 'Africa/Tunis'
          ORDER BY horodatage
          LIMIT 5000`,
        [commune, q.vehiculeId, jour]
      );
      res.json({ vehicule_id: q.vehiculeId, jour, points });
      return;
    }
    res.json({
      dernieres: await query(
        `SELECT DISTINCT ON (t.vehicule_id) t.vehicule_id, v.registration, t.horodatage, ST_Y(t.geom) AS lat, ST_X(t.geom) AS lng,
                t.vitesse_kmh::float AS vitesse_kmh
           FROM traces_engins t LEFT JOIN vehicules v ON v.id = t.vehicule_id
          WHERE t.commune_id = $1
          ORDER BY t.vehicule_id, t.horodatage DESC`,
        [commune]
      ),
    });
  })
);

// ---------------------------------------------------------------------------
// Le webhook : sans compte, signé, limité
// ---------------------------------------------------------------------------

const limiteWebhook = rateLimit({
  windowMs: 60_000,
  limit: () => config.gps.webhookParMinute,
  // Par fournisseur : un fournisseur bavard n'épuise pas la limite d'un autre.
  keyGenerator: (req) => `gps:${req.params.fournisseurId}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop d’envois pour ce fournisseur : au plus quelques-uns par seconde. Réessayez dans une minute.' },
});

gpsRouter.post(
  '/webhook/:fournisseurId',
  limiteWebhook,
  asyncHandler(async (req, res) => {
    const r = await recevoirWebhook(
      String(req.params.fournisseurId),
      req.get('X-SIIPI-Horodatage') ?? undefined,
      req.get('X-SIIPI-Signature') ?? undefined,
      Buffer.isBuffer(req.body) ? req.body : undefined
    );
    if (r.code === 200) res.json(r.bilan);
    else res.status(r.code).json({ error: r.message });
  })
);
