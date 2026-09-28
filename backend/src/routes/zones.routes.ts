// Module "Découpage communal" — secteurs/zones de collecte internes à une
// commune (base pour l'affectation des tournées et le futur GeoTracker, CDC).
//
// Depuis le Jalon 7 (TDR §3.2.8, C2.5), LE DÉCOUPAGE SE VALIDE. Ce qui le
// définit — le tracé d'un secteur, son nom, son code, sa création ou son
// retrait — ne s'écrit plus directement par la commune : elle le propose
// (POST /decoupage/propositions) et la FNCT valide. Les attributs de service
// (couleur, fréquence, population, prestataire, statut) restent à la main de
// la commune. La FNCT peut encore corriger directement ; chaque correction
// crée une version du découpage (migration 049), pour que l'historique
// n'ignore rien de ce qui a changé.
//
// Le Gestionnaire Prestataire consulte en lecture seule les zones de la
// commune où il opère (utile pour situer ses tournées).
import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, withTransaction } from '../db.js';
import { requireAuth, requireRole, requireCommuneAccess } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';

export const zonesRouter = Router();

const ZONE_SELECT = `
  SELECT z.id, z.commune_id, z.name, z.code, z.description, z.color,
         z.collection_frequency, z.estimated_population, z.status,
         z.assigned_prestataire_id, p.full_name AS assigned_prestataire_name,
         ST_AsGeoJSON(z.geom)::json AS geometry,
         z.created_at, z.updated_at
    FROM zones_collecte z
    LEFT JOIN users p ON p.id = z.assigned_prestataire_id
`;

// GET /zones?communeId=xxx — liste des zones d'une commune (lecture ouverte à
// tout utilisateur authentifié, comme pour /tickets : le Gestionnaire
// Prestataire doit pouvoir situer les zones de la commune où il opère).
zonesRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const communeId = typeof req.query.communeId === 'string' ? req.query.communeId : req.user?.communeId ?? undefined;
    if (!communeId) {
      throw new ApiError(400, 'communeId requis.');
    }
    const rows = await query(`${ZONE_SELECT} WHERE z.commune_id = $1 ORDER BY z.name`, [communeId]);
    res.json(rows);
  })
);

zonesRouter.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const zone = await queryOne(`${ZONE_SELECT} WHERE z.id = $1`, [req.params.id]);
    if (!zone) throw new ApiError(404, 'Zone introuvable.');
    res.json(zone);
  })
);

interface ZoneRow {
  id: string;
  commune_id: string;
  name: string;
}

async function loadZoneOrThrow(id: string): Promise<ZoneRow> {
  const zone = await queryOne<ZoneRow>('SELECT id, commune_id, name FROM zones_collecte WHERE id = $1', [id]);
  if (!zone) throw new ApiError(404, 'Zone introuvable.');
  return zone;
}

const PAR_PROPOSITION =
  'Le découpage se modifie par une proposition soumise à la FNCT (onglet Découpage, POST /decoupage/propositions).';

/**
 * Une correction directe de la FNCT : l'état présent est figé en version 1
 * s'il n'en existe aucune, l'écriture a lieu, puis le nouvel état devient une
 * version — le tout d'un bloc.
 */
async function correctionFnct<T>(communeId: string, note: string, ecrire: (client: import('pg').PoolClient) => Promise<T>) {
  return withTransaction(async (client) => {
    await client.query('SELECT app.avant_correction_fnct($1)', [communeId]);
    const resultat = await ecrire(client);
    await client.query('SELECT app.apres_correction_fnct($1, $2)', [communeId, note]);
    return resultat;
  });
}

const geometrySchema = z.object({
  type: z.enum(['Polygon', 'MultiPolygon']),
  coordinates: z.array(z.any()).min(1),
});

async function assertPrestataireInCommune(prestataireUserId: string | null | undefined, communeId: string) {
  if (!prestataireUserId) return;
  const prestataire = await queryOne<{ id: string; role: string; commune_id: string | null }>(
    'SELECT id, role, commune_id FROM users WHERE id = $1',
    [prestataireUserId]
  );
  if (!prestataire || prestataire.role !== 'gestionnaire_prestataire') {
    throw new ApiError(400, "L'utilisateur désigné n'est pas un Gestionnaire Prestataire.");
  }
  if (prestataire.commune_id !== communeId) {
    throw new ApiError(400, "Ce Gestionnaire Prestataire n'est pas rattaché à cette commune.");
  }
}

const createSchema = z.object({
  communeId: z.string(),
  name: z.string().min(2),
  code: z.string().optional(),
  description: z.string().optional(),
  color: z.string().optional(),
  collectionFrequency: z.string().optional(),
  estimatedPopulation: z.number().int().nonnegative().optional(),
  assignedPrestataireId: z.string().uuid().optional().nullable(),
  geometry: geometrySchema,
});

// POST /zones — crée un secteur de collecte (dessiné sur la carte côté Portail Municipal).
zonesRouter.post(
  '/',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  requireCommuneAccess((req) => req.body?.communeId),
  asyncHandler(async (req, res) => {
    if (req.user!.role !== 'super_admin_fnct') throw new ApiError(403, PAR_PROPOSITION);
    const data = createSchema.parse(req.body);
    await assertPrestataireInCommune(data.assignedPrestataireId, data.communeId);

    const created = await correctionFnct(data.communeId, `Secteur « ${data.name} » créé directement par la FNCT.`, async (client) =>
      (await client.query<{ id: string }>(
      `INSERT INTO zones_collecte
         (commune_id, name, code, description, color, collection_frequency, estimated_population, assigned_prestataire_id, geom, created_by)
       VALUES ($1,$2,$3,$4,COALESCE($5,'#2563eb'),$6,$7,$8, ST_SetSRID(ST_Multi(ST_GeomFromGeoJSON($9)), 4326), $10)
       RETURNING id`,
      [
        data.communeId,
        data.name,
        data.code ?? null,
        data.description ?? null,
        data.color ?? null,
        data.collectionFrequency ?? null,
        data.estimatedPopulation ?? null,
        data.assignedPrestataireId ?? null,
        JSON.stringify(data.geometry),
        req.user!.sub,
      ]
    )).rows[0]
    );
    const zone = await queryOne(`${ZONE_SELECT} WHERE z.id = $1`, [created!.id]);
    res.status(201).json(zone);
  })
);

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  code: z.string().optional(),
  description: z.string().optional(),
  color: z.string().optional(),
  collectionFrequency: z.string().optional(),
  estimatedPopulation: z.number().int().nonnegative().optional(),
  assignedPrestataireId: z.string().uuid().nullable().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  geometry: geometrySchema.optional(),
});

// PATCH /zones/:id — modifie les attributs et/ou le tracé d'une zone existante.
zonesRouter.patch(
  '/:id',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const zone = await loadZoneOrThrow(req.params.id);
    if (req.user!.role !== 'super_admin_fnct' && req.user!.communeId !== zone.commune_id) {
      throw new ApiError(403, "Vous n'êtes pas autorisé à modifier les zones de cette commune.");
    }
    const data = updateSchema.parse(req.body);
    const definition = data.name !== undefined || data.code !== undefined || data.geometry !== undefined;
    if (definition && req.user!.role !== 'super_admin_fnct') throw new ApiError(403, PAR_PROPOSITION);
    if ('assignedPrestataireId' in data) {
      await assertPrestataireInCommune(data.assignedPrestataireId, zone.commune_id);
    }

    const fieldsMap: Record<string, string> = {
      name: 'name',
      code: 'code',
      description: 'description',
      color: 'color',
      collectionFrequency: 'collection_frequency',
      estimatedPopulation: 'estimated_population',
      assignedPrestataireId: 'assigned_prestataire_id',
      status: 'status',
    };

    const setClauses: string[] = [];
    const values: any[] = [];
    for (const [key, column] of Object.entries(fieldsMap)) {
      if (key in data) {
        values.push((data as any)[key]);
        setClauses.push(`${column} = $${values.length}`);
      }
    }
    if (data.geometry) {
      values.push(JSON.stringify(data.geometry));
      setClauses.push(`geom = ST_SetSRID(ST_Multi(ST_GeomFromGeoJSON($${values.length})), 4326)`);
    }
    if (setClauses.length === 0) {
      throw new ApiError(400, 'Aucun champ à mettre à jour.');
    }
    values.push(req.params.id);

    const sql = `UPDATE zones_collecte SET ${setClauses.join(', ')} WHERE id = $${values.length} AND deleted_at IS NULL`;
    const modifie = definition
      ? await correctionFnct(zone.commune_id, `Secteur « ${zone.name} » modifié directement par la FNCT.`, async (client) => (await client.query(sql, values)).rowCount)
      : (await query(sql + ' RETURNING id', values)).length;
    if (!modifie) throw new ApiError(404, 'Zone introuvable.');
    const updated = await queryOne(`${ZONE_SELECT} WHERE z.id = $1`, [req.params.id]);
    res.json(updated);
  })
);

// DELETE /zones/:id
zonesRouter.delete(
  '/:id',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const zone = await loadZoneOrThrow(req.params.id);
    if (req.user!.role !== 'super_admin_fnct' && req.user!.communeId !== zone.commune_id) {
      throw new ApiError(403, "Vous n'êtes pas autorisé à supprimer les zones de cette commune.");
    }
    if (req.user!.role !== 'super_admin_fnct') throw new ApiError(403, PAR_PROPOSITION);
    // Suppression logique : la zone disparaît des écrans mais reste en base.
    // Le TDR (§3.2.8, C2.6) demande un historique du découpage communal avec
    // retour arrière possible, ce qu'un effacement rendrait impossible.
    // app.supprimer horodate et attribue l'opération, qui est ensuite tracée
    // par le journal d'audit.
    await correctionFnct(zone.commune_id, `Secteur « ${zone.name} » retiré directement par la FNCT.`, (client) =>
      client.query('SELECT app.supprimer($1, $2)', ['zones_collecte', req.params.id])
    );
    res.status(204).send();
  })
);

// Schémas exposés à la documentation OpenAPI (src/openapi/document.ts).
// La documentation importe les schémas de validation EUX-MÊMES : elle ne peut
// donc pas décrire un format différent de celui réellement contrôlé à l'exécution.
export {
  createSchema as zoneCreateSchema,
  updateSchema as zoneUpdateSchema,
  geometrySchema as zoneGeometrySchema,
};
