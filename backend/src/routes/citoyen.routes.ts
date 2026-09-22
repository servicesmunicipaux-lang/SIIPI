// Espace citoyen : horaires de collecte, annonces, carte publique.
//
// L'ordre des routes de ce fichier reflète l'ordre d'usage réel : on cherche
// d'abord à savoir quand sortir ses poubelles, et seulement ensuite à signaler
// un problème. Le module de réclamation (tickets.routes.ts) existait déjà ;
// c'est l'horaire qui manquait, et c'est lui qui fait ouvrir l'application.

import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { config } from '../config.js';

export const citoyenRouter = Router();

// ---------------------------------------------------------------------------
// 1. Adresse du citoyen
// ---------------------------------------------------------------------------

const adresseSchema = z.object({
  communeId: z.string().min(1),
  adresse: z.string().min(3).max(300),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

// Le citoyen déclare son domicile. C'est le lien qui manquait entre un compte
// et un circuit : sans lui, « quand passe-t-on chez moi ? » n'a pas de réponse.
citoyenRouter.post(
  '/adresse',
  requireAuth,
  requireRole('citoyen', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = adresseSchema.parse(req.body);
    try {
      const profil = await queryOne(
        'SELECT * FROM app.enregistrer_adresse($1, $2, $3, $4)',
        [d.communeId, d.adresse, d.lat ?? null, d.lng ?? null]
      );
      res.json(profil);
    } catch (err: any) {
      if (err?.message?.includes('COMMUNE_INCONNUE')) {
        throw new ApiError(404, 'Commune inconnue.');
      }
      if (err?.message?.includes('PROFIL_CITOYEN_INTROUVABLE')) {
        throw new ApiError(404, 'Aucun profil citoyen rattaché à ce compte.');
      }
      throw err;
    }
  })
);

citoyenRouter.get(
  '/adresse',
  requireAuth,
  requireRole('citoyen', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const profil = await queryOne(
      `SELECT c.id AS citizen_id, c.commune_id, co.name AS commune_nom,
              c.adresse, c.zone_id, c.notifications, c.adresse_maj,
              ST_Y(c.position) AS lat, ST_X(c.position) AS lng
         FROM citoyens c
         LEFT JOIN communes co ON co.id = c.commune_id
        WHERE c.user_id = $1`,
      [req.user!.sub]
    );
    if (!profil) throw new ApiError(404, 'Aucun profil citoyen rattaché à ce compte.');
    res.json(profil);
  })
);

// ---------------------------------------------------------------------------
// 2. Horaires
// ---------------------------------------------------------------------------

citoyenRouter.get(
  '/horaires',
  requireAuth,
  requireRole('citoyen', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const jours = Number.parseInt(String(req.query.jours ?? '14'), 10);
    const fenetre = Number.isFinite(jours) ? Math.min(Math.max(jours, 1), 60) : 14;
    const lignes = await query('SELECT * FROM app.horaires_citoyen($1)', [fenetre]);
    res.json(lignes);
  })
);

// ---------------------------------------------------------------------------
// 3. Annonces de collecte
//
// Écrites par la commune, lues par tous. Le jour férié et la panne de benne
// sont la moitié de l'information utile : un calendrier théorique que la
// réalité dément une fois sur trois cesse d'être consulté.
// ---------------------------------------------------------------------------

const annonceSchema = z.object({
  communeId: z.string().min(1),
  circuitId: z.string().uuid().nullable().optional(),
  type: z.enum(['suppression', 'report', 'ajout', 'information']),
  dateDebut: z.string(),
  dateFin: z.string(),
  dateReport: z.string().nullable().optional(),
  messageFr: z.string().min(3),
  messageAr: z.string().nullable().optional(),
  publiee: z.boolean().default(true),
});

citoyenRouter.post(
  '/annonces',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = annonceSchema.parse(req.body);
    if (d.type === 'report' && !d.dateReport) {
      throw new ApiError(400, 'Un report doit indiquer la date à laquelle le passage est déplacé.');
    }
    const annonce = await queryOne(
      `INSERT INTO annonces_collecte
         (commune_id, circuit_id, type, date_debut, date_fin, date_report,
          message_fr, message_ar, publiee, publiee_par)
       VALUES ($1, $2, $3, $4::date, $5::date, $6::date, $7, $8, $9, $10)
       RETURNING id, commune_id, circuit_id, type, date_debut, date_fin, date_report,
                 message_fr, message_ar, publiee, created_at`,
      [
        d.communeId,
        d.circuitId ?? null,
        d.type,
        d.dateDebut,
        d.dateFin,
        d.dateReport ?? null,
        d.messageFr,
        d.messageAr ?? null,
        d.publiee,
        req.user!.sub,
      ]
    );
    res.status(201).json(annonce);
  })
);

citoyenRouter.get(
  '/annonces',
  requireAuth,
  asyncHandler(async (req, res) => {
    const communeId =
      typeof req.query.communeId === 'string' ? req.query.communeId : req.user?.communeId ?? null;
    // Par défaut on ne renvoie que ce qui est encore d'actualité : une annonce
    // périmée affichée en tête d'écran fait douter de tout le reste.
    const archivees = req.query.archivees === 'true';

    const lignes = await query(
      `SELECT a.id, a.commune_id, a.circuit_id, c.nom AS circuit_nom, a.type,
              a.date_debut, a.date_fin, a.date_report, a.message_fr, a.message_ar,
              a.publiee, a.created_at
         FROM annonces_collecte a
         LEFT JOIN circuits c ON c.id = a.circuit_id
        WHERE a.deleted_at IS NULL
          AND ($1::text IS NULL OR a.commune_id = $1)
          AND ($2::boolean OR a.date_fin >= CURRENT_DATE)
        ORDER BY a.date_debut DESC`,
      [communeId, archivees]
    );
    res.json(lignes);
  })
);

const majAnnonceSchema = annonceSchema.partial().omit({ communeId: true });

citoyenRouter.patch(
  '/annonces/:id',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = majAnnonceSchema.parse(req.body);
    const annonce = await queryOne(
      `UPDATE annonces_collecte
          SET type        = COALESCE($2, type),
              date_debut  = COALESCE($3::date, date_debut),
              date_fin    = COALESCE($4::date, date_fin),
              date_report = COALESCE($5::date, date_report),
              message_fr  = COALESCE($6, message_fr),
              message_ar  = COALESCE($7, message_ar),
              publiee     = COALESCE($8, publiee)
        WHERE id = $1 AND deleted_at IS NULL
      RETURNING id, commune_id, circuit_id, type, date_debut, date_fin, date_report,
                message_fr, message_ar, publiee`,
      [
        req.params.id,
        d.type ?? null,
        d.dateDebut ?? null,
        d.dateFin ?? null,
        d.dateReport ?? null,
        d.messageFr ?? null,
        d.messageAr ?? null,
        d.publiee ?? null,
      ]
    );
    if (!annonce) throw new ApiError(404, 'Annonce introuvable.');
    res.json(annonce);
  })
);

citoyenRouter.delete(
  '/annonces/:id',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const [resultat] = await query<{ supprimer: boolean }>(
      'SELECT app.supprimer($1, $2) AS supprimer',
      ['annonces_collecte', req.params.id]
    );
    if (!resultat?.supprimer) throw new ApiError(404, 'Annonce introuvable.');
    res.status(204).send();
  })
);

// ---------------------------------------------------------------------------
// 4. Carte publique des signalements
//
// Ouverte sans authentification : c'est une carte publique. Ce n'est pas la
// table tickets qui s'ouvre — elle reste fermée par RLS — mais une fonction
// qui n'en laisse sortir ni nom, ni téléphone, ni description libre, et qui
// arrondit la position à environ 110 m. La couverture est complète ; c'est
// l'identification du déclarant qui est retirée (décret-loi 2022-54).
// ---------------------------------------------------------------------------

citoyenRouter.get(
  '/carte',
  asyncHandler(async (req, res) => {
    const communeId = typeof req.query.communeId === 'string' ? req.query.communeId : null;
    const depuis = typeof req.query.depuis === 'string' ? req.query.depuis : null;
    const lignes = await query('SELECT * FROM app.carte_publique($1, $2::date)', [
      communeId,
      depuis,
    ]);
    res.json(lignes);
  })
);

// Validation de la photo par la commune : le geste qui autorise sa
// publication. Un clic dans l'écran de traitement, pas un travail de
// modération — la commune regarde déjà la photo pour traiter le signalement.
const photoSchema = z.object({ photoPublique: z.boolean() });

citoyenRouter.patch(
  '/signalements/:id/photo',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = photoSchema.parse(req.body);
    const ticket = await queryOne(
      `UPDATE tickets
          SET photo_publique    = $2,
              photo_validee_par = CASE WHEN $2 THEN $3::uuid ELSE NULL END,
              photo_validee_le  = CASE WHEN $2 THEN now() ELSE NULL END
        WHERE id = $1 AND deleted_at IS NULL
      RETURNING id, commune_id, photo_publique, photo_validee_le`,
      [req.params.id, d.photoPublique, req.user!.sub]
    );
    if (!ticket) throw new ApiError(404, 'Signalement introuvable.');
    res.json(ticket);
  })
);

// ---------------------------------------------------------------------------
// Souscription aux notifications push (Jalon 2, lot 1).
//
// Le citoyen enregistre lui-même son navigateur — jamais une commune pour
// lui. La clé publique VAPID n'est pas un secret (elle est faite pour être
// distribuée aux navigateurs) ; elle n'est simplement pas codée en dur côté
// front pour rester changeable sans nouvelle mise en production du portail.
// ---------------------------------------------------------------------------

citoyenRouter.get(
  '/push/cle-publique',
  requireAuth,
  requireRole('citoyen', 'super_admin_fnct'),
  asyncHandler(async (_req, res) => {
    res.json({ clePublique: config.vapidPublicKey || null });
  })
);

const souscriptionSchema = z.object({
  endpoint: z.string().min(1).max(2000),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  userAgent: z.string().max(300).optional(),
});

citoyenRouter.post(
  '/push/souscriptions',
  requireAuth,
  requireRole('citoyen', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = souscriptionSchema.parse(req.body);
    const citoyen = await queryOne<{ id: string }>('SELECT id FROM citoyens WHERE user_id = $1', [req.user!.sub]);
    if (!citoyen) throw new ApiError(404, 'Aucun profil citoyen rattaché à ce compte.');

    // Un même navigateur qui se réabonne (clés renouvelées par le
    // navigateur lui-même) remplace sa fiche plutôt que d'en accumuler une
    // seconde : la contrainte d'unicité (citoyen_id, endpoint) le permet
    // directement via ON CONFLICT.
    await query(
      `INSERT INTO push_souscriptions (citoyen_id, endpoint, p256dh, auth, user_agent)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (citoyen_id, endpoint) DO UPDATE
         SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent`,
      [citoyen.id, d.endpoint, d.keys.p256dh, d.keys.auth, d.userAgent ?? null]
    );
    res.status(201).json({ ok: true });
  })
);

citoyenRouter.delete(
  '/push/souscriptions',
  requireAuth,
  requireRole('citoyen', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = z.object({ endpoint: z.string().min(1) }).parse(req.body ?? {});
    await query('DELETE FROM push_souscriptions WHERE endpoint = $1', [d.endpoint]);
    res.status(204).end();
  })
);

export { adresseSchema, annonceSchema, majAnnonceSchema, photoSchema, souscriptionSchema };
