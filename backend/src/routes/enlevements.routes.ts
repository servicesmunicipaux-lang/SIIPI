// Flux occasionnels : déchets verts, DDC (démolition et construction), encombrants.
//
// Aucun circuit ne passe pour ces déchets-là. Le citoyen demande, la commune
// répond avec un montant et une date, ou l'oriente vers un collecteur agréé
// ANGeD. Le collecteur informel étant désormais illégal, ces deux routes
// constituent l'alternative que l'interdiction suppose : sans elles,
// l'application renvoie l'usager vers la filière qu'on vient de lui fermer.

import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';

export const enlevementsRouter = Router();

const TYPES = ['vert', 'ddc', 'encombrant', 'metal', 'autre'] as const;

// ---------------------------------------------------------------------------
// Annuaire des collecteurs agréés
// ---------------------------------------------------------------------------

const collecteurSchema = z.object({
  communeId: z.string().min(1),
  raisonSociale: z.string().min(2),
  agrementAnged: z.string().nullable().optional(),
  agrementValideJusqua: z.string().nullable().optional(),
  typesDechets: z.array(z.enum(TYPES)).default([]),
  telephone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  adresse: z.string().nullable().optional(),
  zoneIntervention: z.string().nullable().optional(),
  tarifIndicatif: z.string().nullable().optional(),
  actif: z.boolean().default(true),
  remarque: z.string().nullable().optional(),
});

enlevementsRouter.post(
  '/collecteurs',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = collecteurSchema.parse(req.body);
    const collecteur = await queryOne(
      `INSERT INTO collecteurs_agrees
         (commune_id, raison_sociale, agrement_anged, agrement_valide_jusqua, types_dechets,
          telephone, email, adresse, zone_intervention, tarif_indicatif, actif, remarque, created_by)
       VALUES ($1, $2, $3, $4::date, $5::text[], $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id, commune_id, raison_sociale, agrement_anged, agrement_valide_jusqua,
                 types_dechets, telephone, email, adresse, zone_intervention,
                 tarif_indicatif, actif, created_at`,
      [
        d.communeId,
        d.raisonSociale,
        d.agrementAnged ?? null,
        d.agrementValideJusqua ?? null,
        d.typesDechets,
        d.telephone ?? null,
        d.email ?? null,
        d.adresse ?? null,
        d.zoneIntervention ?? null,
        d.tarifIndicatif ?? null,
        d.actif,
        d.remarque ?? null,
        req.user!.sub,
      ]
    );
    res.status(201).json(collecteur);
  })
);

enlevementsRouter.get(
  '/collecteurs',
  requireAuth,
  asyncHandler(async (req, res) => {
    const communeId =
      typeof req.query.communeId === 'string' ? req.query.communeId : req.user?.communeId ?? null;
    const type = typeof req.query.type === 'string' ? req.query.type : null;

    const lignes = await query(
      `SELECT g.id, g.commune_id, c.name AS commune_nom, g.raison_sociale, g.agrement_anged,
              g.agrement_valide_jusqua, g.types_dechets, g.telephone, g.email, g.adresse,
              g.zone_intervention, g.tarif_indicatif, g.actif, g.remarque, g.created_at
         FROM collecteurs_agrees g
         JOIN communes c ON c.id = g.commune_id
        WHERE g.deleted_at IS NULL
          AND ($1::text IS NULL OR g.commune_id = $1)
          AND ($2::text IS NULL OR $2 = ANY (g.types_dechets))
        ORDER BY g.actif DESC, g.raison_sociale`,
      [communeId, type]
    );
    res.json(lignes);
  })
);

const majCollecteurSchema = collecteurSchema.partial().omit({ communeId: true });

enlevementsRouter.patch(
  '/collecteurs/:id',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = majCollecteurSchema.parse(req.body);
    const collecteur = await queryOne(
      `UPDATE collecteurs_agrees
          SET raison_sociale         = COALESCE($2, raison_sociale),
              agrement_anged         = COALESCE($3, agrement_anged),
              agrement_valide_jusqua = COALESCE($4::date, agrement_valide_jusqua),
              types_dechets          = COALESCE($5::text[], types_dechets),
              telephone              = COALESCE($6, telephone),
              email                  = COALESCE($7, email),
              adresse                = COALESCE($8, adresse),
              zone_intervention      = COALESCE($9, zone_intervention),
              tarif_indicatif        = COALESCE($10, tarif_indicatif),
              actif                  = COALESCE($11, actif),
              remarque               = COALESCE($12, remarque)
        WHERE id = $1 AND deleted_at IS NULL
      RETURNING id, commune_id, raison_sociale, agrement_anged, types_dechets,
                telephone, email, actif`,
      [
        req.params.id,
        d.raisonSociale ?? null,
        d.agrementAnged ?? null,
        d.agrementValideJusqua ?? null,
        d.typesDechets ?? null,
        d.telephone ?? null,
        d.email ?? null,
        d.adresse ?? null,
        d.zoneIntervention ?? null,
        d.tarifIndicatif ?? null,
        d.actif ?? null,
        d.remarque ?? null,
      ]
    );
    if (!collecteur) throw new ApiError(404, 'Collecteur introuvable.');
    res.json(collecteur);
  })
);

enlevementsRouter.delete(
  '/collecteurs/:id',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const [resultat] = await query<{ supprimer: boolean }>(
      'SELECT app.supprimer($1, $2) AS supprimer',
      ['collecteurs_agrees', req.params.id]
    );
    if (!resultat?.supprimer) throw new ApiError(404, 'Collecteur introuvable.');
    res.status(204).send();
  })
);

// ---------------------------------------------------------------------------
// Demandes d'enlèvement
// ---------------------------------------------------------------------------

const demandeSchema = z.object({
  typeDechet: z.enum(TYPES),
  volumeM3: z.number().positive().max(100).nullable().optional(),
  description: z.string().nullable().optional(),
  adresse: z.string().nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  acces: z.enum(['rue', 'cour', 'etage', 'difficile']).nullable().optional(),
  dateSouhaitee: z.string().nullable().optional(),
  photoUrl: z.string().nullable().optional(),
});

enlevementsRouter.post(
  '/',
  requireAuth,
  requireRole('citoyen', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = demandeSchema.parse(req.body);
    try {
      const demande = await queryOne(
        `SELECT * FROM app.deposer_demande_enlevement($1, $2, $3, $4, $5, $6, $7, $8::date, $9)`,
        [
          d.typeDechet,
          d.volumeM3 ?? null,
          d.description ?? null,
          d.adresse ?? null,
          d.lat ?? null,
          d.lng ?? null,
          d.acces ?? null,
          d.dateSouhaitee ?? null,
          d.photoUrl ?? null,
        ]
      );
      res.status(201).json(demande);
    } catch (err: any) {
      if (err?.message?.includes('ADRESSE_NON_RENSEIGNEE')) {
        throw new ApiError(400, 'Renseignez votre adresse avant de demander un enlèvement.');
      }
      if (err?.message?.includes('PROFIL_CITOYEN_INTROUVABLE')) {
        throw new ApiError(404, 'Aucun profil citoyen rattaché à ce compte.');
      }
      throw err;
    }
  })
);

enlevementsRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    // Un citoyen voit les siennes, une commune voit celles de son territoire :
    // c'est la politique RLS qui tranche, la requête ne filtre pas par rôle.
    const communeId = typeof req.query.communeId === 'string' ? req.query.communeId : null;
    const statut = typeof req.query.statut === 'string' ? req.query.statut : null;

    const lignes = await query(
      `SELECT e.id, e.numero, e.commune_id, e.type_dechet, e.volume_estime_m3, e.description,
              e.adresse, ST_Y(e.position) AS lat, ST_X(e.position) AS lng, e.acces,
              e.statut, e.date_souhaitee, e.date_prevue, e.date_realisation,
              e.montant_dt, e.reponse_commune, e.collecteur_id,
              g.raison_sociale AS collecteur_nom, g.telephone AS collecteur_telephone,
              e.paiement_statut, e.paiement_mode, e.paiement_le, e.photo_url, e.created_at
         FROM demandes_enlevement e
         LEFT JOIN collecteurs_agrees g ON g.id = e.collecteur_id
        WHERE e.deleted_at IS NULL
          AND ($1::text IS NULL OR e.commune_id = $1)
          AND ($2::text IS NULL OR e.statut = $2)
        ORDER BY e.created_at DESC`,
      [communeId, statut]
    );
    res.json(lignes);
  })
);

// Réponse de la commune : montant, date, ou orientation vers un collecteur.
const reponseSchema = z.object({
  statut: z
    .enum(['recue', 'planifiee', 'realisee', 'orientee_collecteur', 'refusee', 'annulee'])
    .optional(),
  datePrevue: z.string().nullable().optional(),
  dateRealisation: z.string().nullable().optional(),
  montantDt: z.number().nonnegative().nullable().optional(),
  reponseCommune: z.string().nullable().optional(),
  collecteurId: z.string().uuid().nullable().optional(),
  paiementStatut: z.enum(['non_du', 'du', 'regle']).optional(),
  paiementMode: z.enum(['espece', 'en_ligne', 'virement', 'autre']).nullable().optional(),
  paiementReference: z.string().nullable().optional(),
});

enlevementsRouter.patch(
  '/:id',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = reponseSchema.parse(req.body);

    // Une orientation sans collecteur désigné laisse le citoyen exactement où
    // il était : avec ses DDC et un statut qui ne lui dit rien.
    if (d.statut === 'orientee_collecteur' && !d.collecteurId) {
      throw new ApiError(400, 'Indiquez le collecteur agréé vers lequel la demande est orientée.');
    }

    const demande = await queryOne(
      `UPDATE demandes_enlevement
          SET statut            = COALESCE($2, statut),
              date_prevue       = COALESCE($3::date, date_prevue),
              date_realisation  = COALESCE($4::date, date_realisation),
              montant_dt        = COALESCE($5, montant_dt),
              reponse_commune   = COALESCE($6, reponse_commune),
              collecteur_id     = COALESCE($7::uuid, collecteur_id),
              paiement_statut   = COALESCE($8, paiement_statut),
              paiement_mode     = COALESCE($9, paiement_mode),
              paiement_reference = COALESCE($10, paiement_reference),
              -- La date de paiement est posée par le serveur au moment où le
              -- règlement est constaté : une date d'encaissement saisie à la
              -- main est une date qu'on peut arranger.
              paiement_le       = CASE WHEN $8 = 'regle' AND paiement_le IS NULL
                                       THEN now() ELSE paiement_le END,
              traite_par        = $11
        WHERE id = $1 AND deleted_at IS NULL
      RETURNING id, numero, statut, date_prevue, date_realisation, montant_dt,
                reponse_commune, collecteur_id, paiement_statut, paiement_le`,
      [
        req.params.id,
        d.statut ?? null,
        d.datePrevue ?? null,
        d.dateRealisation ?? null,
        d.montantDt ?? null,
        d.reponseCommune ?? null,
        d.collecteurId ?? null,
        d.paiementStatut ?? null,
        d.paiementMode ?? null,
        d.paiementReference ?? null,
        req.user!.sub,
      ]
    );
    if (!demande) throw new ApiError(404, 'Demande introuvable.');
    res.json(demande);
  })
);

export { collecteurSchema, majCollecteurSchema, demandeSchema, reponseSchema };
