import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { communeDemandee } from '../perimetre.js';

export const trucksRouter = Router();

// L'ordre de lecture n'est pas alphabétique : ce qui est immobilisé passe
// devant. Un parc dont 45 % est à l'arrêt se consulte pour savoir ce qui ne
// roule pas, et faire chercher ces lignes au milieu des autres serait ranger
// l'information par commodité de tri plutôt que par ordre d'importance.
const VEHICULE_SELECT = `
  SELECT v.*,
         a.registration AS attele_a_immat,
         EXTRACT(year FROM age(CURRENT_DATE, v.date_premiere_circulation))::integer AS age_annees
    FROM vehicules v
    LEFT JOIN vehicules a ON a.id = v.attele_a
`;
const ORDRE = `
  ORDER BY CASE v.etat WHEN 'en_panne' THEN 0 WHEN 'a_reformer' THEN 1
                       WHEN 'en_service' THEN 2 ELSE 3 END,
           v.categorie, v.registration
`;

trucksRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const communeId = communeDemandee(req) ?? undefined;
    const rows = communeId
      ? await query(`${VEHICULE_SELECT} WHERE v.commune_id = $1 AND v.deleted_at IS NULL ${ORDRE}`, [communeId])
      : await query(`${VEHICULE_SELECT} WHERE v.deleted_at IS NULL ${ORDRE}`);
    res.json(rows);
  })
);

// --- État du parc -----------------------------------------------------------
//
// DÉCLARÉE AVANT « /:id/... » : « /etat » serait sinon pris pour un
// identifiant de véhicule. Le piège s'est présenté trois fois dans ce projet.
trucksRouter.get(
  '/etat',
  requireAuth,
  asyncHandler(async (req, res) => {
    const communeId = communeDemandee(req);
    const lignes = await query('SELECT * FROM app.etat_du_parc($1)', [communeId]);
    // Une commune sans aucun engin ne doit pas renvoyer un tableau vide que le
    // front lira comme une panne : on rend un état à zéro, explicitement.
    res.json(
      lignes[0] ?? {
        commune_id: communeId,
        total: 0,
        en_service: 0,
        en_panne: 0,
        a_reformer: 0,
        reforme: 0,
        remorques: 0,
        taux_disponibilite: null,
        age_moyen_annees: null,
        valeur_parc_tnd: null,
        immobilises_sans_motif: 0,
      }
    );
  })
);

// --- Fiche d'un engin -------------------------------------------------------

const vehiculeSchema = z.object({
  registration: z.string().min(2),
  type: z.enum([
    'benne_tasseuse', 'camion', 'camion_ampliroll', 'camion_remorque', 'balayeuse',
    'tracteur', 'tracteur_remorque', 'remorque', 'chargeuse_pelleteuse', 'chargeuse',
    'mini_chargeuse', 'niveleuse', 'autre',
  ]),
  categorie: z.enum(['poids_lourd', 'engin_lourd', 'tracteur', 'remorque']).nullable().optional(),
  marque: z.string().max(80).nullable().optional(),
  datePremiereCirculation: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  valeurAchatTnd: z.number().min(0).nullable().optional(),
  chargeUtileT: z.number().min(0).nullable().optional(),
  capacityM3: z.number().min(0).nullable().optional(),
  domaineEmploi: z.string().max(200).nullable().optional(),
  etat: z.enum(['en_service', 'en_panne', 'a_reformer', 'reforme']).optional(),
  etatDepuis: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  motifImmobilisation: z.string().max(500).nullable().optional(),
  atteleA: z.string().nullable().optional(),
});

const COLONNES_VEHICULE: Record<string, string> = {
  registration: 'registration',
  type: 'type',
  categorie: 'categorie',
  marque: 'marque',
  datePremiereCirculation: 'date_premiere_circulation',
  valeurAchatTnd: 'valeur_achat_tnd',
  chargeUtileT: 'charge_utile_t',
  capacityM3: 'capacity_m3',
  domaineEmploi: 'domaine_emploi',
  etat: 'etat',
  etatDepuis: 'etat_depuis',
  motifImmobilisation: 'motif_immobilisation',
  atteleA: 'attele_a',
};

const typerVehicule = (cle: string, pos: number) =>
  cle === 'datePremiereCirculation' || cle === 'etatDepuis' ? `$${pos}::date` : `$${pos}`;

trucksRouter.post(
  '/',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = vehiculeSchema.parse(req.body) as Record<string, unknown>;
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise.');

    // Identifiant dérivé de l'immatriculation : deux saisies du même engin ne
    // créent pas deux lignes, et l'on retrouve la fiche sans connaître l'UUID.
    const id = `${communeId.slice(0, 12)}-${String(d.registration).replace(/\s+/g, '')}`;
    const existe = await queryOne('SELECT id FROM vehicules WHERE id = $1', [id]);
    if (existe) throw new ApiError(409, 'Un engin portant cette immatriculation existe déjà.');

    const colonnes = ['id', 'commune_id'];
    const emplacements = ['$1', '$2'];
    const valeurs: unknown[] = [id, communeId];
    for (const [cle, colonne] of Object.entries(COLONNES_VEHICULE)) {
      if (!(cle in d) || d[cle] === undefined) continue;
      valeurs.push(d[cle]);
      colonnes.push(colonne);
      emplacements.push(typerVehicule(cle, valeurs.length));
    }
    await query(
      `INSERT INTO vehicules (${colonnes.join(', ')}) VALUES (${emplacements.join(', ')})`,
      valeurs
    );
    res.status(201).json(await queryOne(`${VEHICULE_SELECT} WHERE v.id = $1`, [id]));
  })
);

trucksRouter.patch(
  '/:id',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = vehiculeSchema.partial().parse(req.body) as Record<string, unknown>;
    const clauses: string[] = [];
    const valeurs: unknown[] = [];
    for (const [cle, colonne] of Object.entries(COLONNES_VEHICULE)) {
      if (!(cle in d)) continue;
      valeurs.push(d[cle]);
      clauses.push(`${colonne} = ${typerVehicule(cle, valeurs.length)}`);
    }
    if (clauses.length === 0) throw new ApiError(400, 'Aucun champ à mettre à jour.');
    // Changer l'état sans dire depuis quand laisse un parc dont on ne sait pas
    // s'il est immobilisé depuis hier ou depuis deux ans. À défaut de date
    // fournie, on prend aujourd'hui — l'agent saisit au moment où il constate.
    if ('etat' in d && !('etatDepuis' in d)) {
      clauses.push('etat_depuis = CURRENT_DATE');
    }
    valeurs.push(req.params.id);

    const modifie = await queryOne<{ id: string }>(
      `UPDATE vehicules SET ${clauses.join(', ')}, last_update = now()
        WHERE id = $${valeurs.length} AND deleted_at IS NULL RETURNING id`,
      valeurs
    );
    if (!modifie) throw new ApiError(404, 'Engin introuvable.');
    res.json(await queryOne(`${VEHICULE_SELECT} WHERE v.id = $1`, [req.params.id]));
  })
);

const positionSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  currentSpeedKmH: z.number().optional(),
  fuelLevelPercent: z.number().optional(),
  currentWeightTons: z.number().optional(),
  status: z.enum(['en_tournee', 'au_depot', 'en_decharge', 'en_maintenance']).optional(),
  completedStops: z.number().int().optional(),
});

// PATCH /trucks/:id/position — ingestion télématique (à appeler depuis le futur module GPS embarqué).
// Rôles autorisés selon le CDC : Admin Commune (rubrique "Engins & GMAO", §B2) et
// Gestionnaire Prestataire (privé) pour les véhicules de sa flotte sous contrat.
// (Il n'existe pas de rôle de connexion "agent de terrain" distinct dans la matrice RBAC du CDC.)
trucksRouter.patch(
  '/:id/position',
  requireAuth,
  requireRole('admin_commune', 'gestionnaire_prestataire', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const truck = await queryOne<{ commune_id: string }>('SELECT commune_id FROM vehicules WHERE id = $1', [req.params.id]);
    if (!truck) throw new ApiError(404, 'Véhicule introuvable.');

    // Un directeur municipal ou un gestionnaire prestataire ne peut mettre à jour que les véhicules de sa propre commune.
    if (req.user!.role !== 'super_admin_fnct' && req.user!.communeId !== truck.commune_id) {
      throw new ApiError(403, "Vous n'êtes pas autorisé à agir sur ce véhicule.");
    }

    const data = positionSchema.parse(req.body);
    const updated = await queryOne(
      `UPDATE vehicules
          SET lat = $1, lng = $2,
              current_speed_kmh = COALESCE($3, current_speed_kmh),
              fuel_level_percent = COALESCE($4, fuel_level_percent),
              current_weight_tons = COALESCE($5, current_weight_tons),
              status = COALESCE($6, status),
              completed_stops = COALESCE($7, completed_stops)
        WHERE id = $8
        RETURNING *`,
      [
        data.lat,
        data.lng,
        data.currentSpeedKmH ?? null,
        data.fuelLevelPercent ?? null,
        data.currentWeightTons ?? null,
        data.status ?? null,
        data.completedStops ?? null,
        req.params.id,
      ]
    );
    res.json(updated);
  })
);

// --- Retrait d'un engin de l'inventaire -------------------------------------
//
// Un engin réformé n'est pas un engin retiré : « réformé » est un ÉTAT du parc,
// qui se déclare par `etat` et se lit au tableau du matériel. Cette route sert
// à l'autre cas — la ligne saisie par erreur, le doublon d'immatriculation.
// Elle aussi est logique : les pesées et les tournées passées continuent de
// désigner l'engin qui les a réellement faites.
//
// Le refus nomme les circuits, pour la même raison que côté personnel : un
// circuit dont l'engin a disparu de l'inventaire n'aurait plus aucun moyen
// d'être compris depuis l'écran.

trucksRouter.delete(
  '/:id',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const circuits = await query<{ nom: string }>(
      `SELECT nom FROM circuits
        WHERE vehicule_id = $1 AND deleted_at IS NULL AND actif
        ORDER BY nom`,
      [req.params.id]
    );
    if (circuits.length > 0) {
      throw new ApiError(
        409,
        `Cet engin assure encore ${circuits.length > 1 ? 'ces circuits' : 'ce circuit'} : ` +
          `${circuits.map((c) => c.nom).join(', ')}. Désigner un autre engin avant de le retirer de l'inventaire.`
      );
    }

    const [resultat] = await query<{ supprimer: boolean }>(
      'SELECT app.supprimer($1, $2) AS supprimer',
      ['vehicules', req.params.id]
    );
    if (!resultat?.supprimer) throw new ApiError(404, 'Engin introuvable.');
    res.status(204).end();
  })
);

// Schémas exposés à la documentation OpenAPI (src/openapi/document.ts).
// La documentation importe les schémas de validation EUX-MÊMES : elle ne peut
// donc pas décrire un format différent de celui réellement contrôlé à l'exécution.
export {
  positionSchema as truckPositionSchema,
};
