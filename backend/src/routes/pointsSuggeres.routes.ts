// Points de collecte proposés par les citoyens (TDR M3.1, sous-module 5.5.2).
//
// LA SEULE CHOSE QUI COMPTE DANS CE FICHIER : une proposition citoyenne se
// TERMINE. Elle est retenue et devient un arrêt de tournée, ou elle est
// refusée avec un motif que son auteur peut lire. Une demande qui reste « en
// attente » indéfiniment est pire qu'un formulaire absent : elle a coûté à
// quelqu'un le temps de sortir son téléphone et de photographier sa rue.
//
// Deux publics, deux routeurs. Le citoyen propose et suit ; la commune
// instruit. Ils ne partagent aucune route, parce qu'ils ne voient pas les
// mêmes lignes : la liste des propositions d'une commune dessinerait, par
// recoupement, où habitent ceux qui les ont faites.

import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { communeDemandee } from '../perimetre.js';

export const pointsSuggeresRouter = Router();
export const pointsSuggeresCitoyenRouter = Router();

// La distance au point existant le plus proche accompagne CHAQUE proposition.
// Sans elle, l'agent devrait ouvrir la carte, chercher, comparer — pour une
// information que la base calcule en une milliseconde. C'est ce chiffre qui
// distingue en une seconde un doublon d'un vrai manque.
const SUGGESTION_SELECT = `
  SELECT s.id, s.commune_id, s.nom, s.commentaire,
         ST_Y(s.geom) AS lat, ST_X(s.geom) AS lng,
         s.precision_m, s.photo_url, s.statut, s.motif_refus,
         s.decide_le, s.point_collecte_id, s.created_at,
         v.nom        AS voisin_nom,
         v.circuit    AS voisin_circuit,
         v.distance_m AS voisin_distance_m
    FROM points_suggeres s
    LEFT JOIN LATERAL app.point_voisin(s.commune_id, s.geom) v ON true
`;

// ---------------------------------------------------------------------------
// Côté citoyen
// ---------------------------------------------------------------------------

const propositionSchema = z.object({
  communeId: z.string().min(1),
  nom: z.string().max(200).optional(),
  commentaire: z.string().max(1000).optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  /** Précision du relevé du téléphone, en mètres, telle que l'appareil la donne. */
  precisionM: z.number().min(0).max(10000).optional(),
  /** Chemin rendu par le dépôt du fichier : « /fichiers/<id> ». */
  photoUrl: z.string().max(300).optional(),
});

pointsSuggeresCitoyenRouter.post(
  '/points-suggeres',
  requireAuth,
  requireRole('citoyen', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = propositionSchema.parse(req.body);

    const citoyen = await queryOne<{ id: string }>(
      'SELECT id FROM citoyens WHERE user_id = $1',
      [req.user!.sub]
    );
    if (!citoyen) throw new ApiError(404, 'Aucun profil citoyen rattaché à ce compte.');

    const cree = await queryOne<{ id: string }>(
      `INSERT INTO points_suggeres
         (commune_id, citoyen_id, nom, commentaire, geom, precision_m, photo_url)
       VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326), $7, $8)
       RETURNING id`,
      [
        d.communeId,
        citoyen.id,
        d.nom ?? null,
        d.commentaire ?? null,
        d.lng,
        d.lat,
        d.precisionM ?? null,
        d.photoUrl ?? null,
      ]
    );
    res.status(201).json(await queryOne(`${SUGGESTION_SELECT} WHERE s.id = $1`, [cree!.id]));
  })
);

// Ses propositions, et ce qu'elles sont devenues. C'est la moitié qui manque
// le plus souvent aux dispositifs de participation : on peut proposer, on ne
// peut pas savoir.
pointsSuggeresCitoyenRouter.get(
  '/points-suggeres',
  requireAuth,
  requireRole('citoyen', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    res.json(
      await query(
        `${SUGGESTION_SELECT}
          WHERE s.deleted_at IS NULL
            AND s.citoyen_id = (SELECT id FROM citoyens WHERE user_id = $1)
          ORDER BY s.created_at DESC`,
        [req.user!.sub]
      )
    );
  })
);

// ---------------------------------------------------------------------------
// Côté commune
// ---------------------------------------------------------------------------

pointsSuggeresRouter.get(
  '/',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise.');
    const q = z
      .object({ statut: z.enum(['en_attente', 'valide', 'refuse']).optional() })
      .parse(req.query);

    res.json(
      await query(
        `${SUGGESTION_SELECT}
          WHERE s.deleted_at IS NULL AND s.commune_id = $1
            AND ($2::text IS NULL OR s.statut = $2)
          -- Les demandes en attente d'abord : ce sont elles qui attendent une
          -- décision. Et les plus anciennes en tête, parce qu'une proposition
          -- vieille de trois mois est celle qui a le plus abîmé la confiance.
          ORDER BY CASE s.statut WHEN 'en_attente' THEN 0 ELSE 1 END, s.created_at`,
        [communeId, q.statut ?? null]
      )
    );
  })
);

const validationSchema = z.object({
  circuitId: z.string().uuid(),
  voyage: z.number().int().min(1).max(6).optional(),
  /** Rang dans la tournée. Omis, il est déduit du voisin le plus proche. */
  ordre: z.number().int().min(1).optional(),
  /** Le nom que la commune retient, s'il diffère de celui du citoyen. */
  nom: z.string().max(200).optional(),
});

pointsSuggeresRouter.patch(
  '/:id/valider',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = validationSchema.parse(req.body);

    const s = await queryOne<{
      id: string; commune_id: string; statut: string; nom: string | null;
      lat: number; lng: number; precision_m: string | null; photo_url: string | null;
    }>(
      `SELECT id, commune_id, statut, nom, ST_Y(geom) AS lat, ST_X(geom) AS lng,
              precision_m, photo_url
         FROM points_suggeres WHERE id = $1 AND deleted_at IS NULL`,
      [req.params.id]
    );
    if (!s) throw new ApiError(404, 'Proposition introuvable.');
    if (s.statut !== 'en_attente') {
      throw new ApiError(409, `Cette proposition a déjà été instruite (statut : « ${s.statut} »).`);
    }

    const circuit = await queryOne<{ id: string; commune_id: string; nom: string }>(
      'SELECT id, commune_id, nom FROM circuits WHERE id = $1 AND deleted_at IS NULL',
      [d.circuitId]
    );
    if (!circuit) throw new ApiError(404, 'Circuit introuvable.');
    if (circuit.commune_id !== s.commune_id) {
      throw new ApiError(400, "Ce circuit n'appartient pas à la commune de la proposition.");
    }

    const voyage = d.voyage ?? 1;

    // LE RANG DANS LA TOURNÉE, ET POURQUOI IL EST DÉDUIT PLUTÔT QUE POSÉ À LA
    // FIN. Un arrêt ajouté en queue de tournée prétend que le camion y passe
    // en dernier — ce qui est faux dès que le point est au milieu du secteur,
    // et fausse aussitôt les horaires annoncés aux habitants. À défaut de
    // savoir, on insère derrière le point existant le plus proche : c'est
    // l'hypothèse la moins fausse, et la seule qui se vérifie d'un coup d'œil
    // sur la carte.
    //
    // La déduction est ÉCRITE dans l'observation du point. Une hypothèse qui
    // ne se signale pas devient une donnée au bout de trois semaines.
    let ordre = d.ordre ?? null;
    let deduit = false;
    if (ordre === null) {
      const voisin = await queryOne<{ ordre: number }>(
        `SELECT pc.ordre
           FROM points_collecte pc
          WHERE pc.circuit_id = $1 AND pc.voyage = $2 AND pc.deleted_at IS NULL
          ORDER BY pc.geom <-> ST_SetSRID(ST_MakePoint($3, $4), 4326)
          LIMIT 1`,
        [d.circuitId, voyage, s.lng, s.lat]
      );
      if (voisin) {
        ordre = voisin.ordre + 1;
        deduit = true;
      } else {
        // Première étape de cette rotation : aucun voisin, donc aucune
        // hypothèse à signaler.
        ordre = 1;
      }
    }

    // Les rangs suivants sont décalés pour faire place. Fait en une requête :
    // l'index unique (circuit, voyage, ordre) refuserait une insertion au
    // milieu sans ce décalage.
    await query(
      `UPDATE points_collecte SET ordre = ordre + 1
        WHERE circuit_id = $1 AND voyage = $2 AND ordre >= $3 AND deleted_at IS NULL`,
      [d.circuitId, voyage, ordre]
    );

    const observation =
      `Proposé par un habitant le ${new Date().toISOString().slice(0, 10)}` +
      (deduit ? ", rang déduit du point voisin le plus proche — à confirmer." : '.');

    const point = await queryOne<{ id: string }>(
      `INSERT INTO points_collecte
         (circuit_id, commune_id, voyage, ordre, nom, geom, precision_m,
          observation, source)
       VALUES ($1, $2, $3, $4, $5, ST_SetSRID(ST_MakePoint($6, $7), 4326), $8, $9,
               'suggestion_citoyen')
       RETURNING id`,
      [
        d.circuitId,
        s.commune_id,
        voyage,
        ordre,
        d.nom ?? s.nom ?? null,
        s.lng,
        s.lat,
        s.precision_m,
        observation,
      ]
    );

    await query(
      `UPDATE points_suggeres
          SET statut = 'valide', point_collecte_id = $1, decide_par = $2, decide_le = now()
        WHERE id = $3`,
      [point!.id, req.user!.sub, req.params.id]
    );

    res.json({
      ...(await queryOne(`${SUGGESTION_SELECT} WHERE s.id = $1`, [req.params.id])),
      circuit: circuit.nom,
      voyage,
      ordre,
      // Rendu explicitement : l'écran doit pouvoir dire « inséré au rang 4,
      // déduit de la proximité » plutôt que laisser croire à un choix.
      ordreDeduit: deduit,
    });
  })
);

const refusSchema = z.object({
  // Obligatoire, et non vide. Un refus sans motif transforme un outil de
  // participation en boîte noire, et la fois suivante plus personne ne
  // propose rien. La base pose la même exigence, pour que personne n'ait à se
  // fier à un écran pour l'imposer.
  motif: z.string().trim().min(3).max(500),
});

pointsSuggeresRouter.patch(
  '/:id/refuser',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = refusSchema.parse(req.body);
    const s = await queryOne<{ statut: string }>(
      'SELECT statut FROM points_suggeres WHERE id = $1 AND deleted_at IS NULL',
      [req.params.id]
    );
    if (!s) throw new ApiError(404, 'Proposition introuvable.');
    if (s.statut !== 'en_attente') {
      throw new ApiError(409, `Cette proposition a déjà été instruite (statut : « ${s.statut} »).`);
    }

    await query(
      `UPDATE points_suggeres
          SET statut = 'refuse', motif_refus = $1, decide_par = $2, decide_le = now()
        WHERE id = $3`,
      [d.motif, req.user!.sub, req.params.id]
    );
    res.json(await queryOne(`${SUGGESTION_SELECT} WHERE s.id = $1`, [req.params.id]));
  })
);

export { propositionSchema, validationSchema, refusSchema };
