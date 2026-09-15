// Portail national — l'observatoire de la FNCT.
//
// Ces points d'entrée servent un usage précis : suivre le déploiement de la
// plateforme sur les 350 communes, et situer chaque gouvernorat. Ils renvoient
// des agrégats déjà calculés par la base, pour que l'interface n'ait pas à
// recomposer 24 gouvernorats à partir de 350 fiches à chaque affichage.

import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';

export const observatoireRouter = Router();

// GET /observatoire/gouvernorats — une ligne par gouvernorat, tout l'écran national.
observatoireRouter.get(
  '/gouvernorats',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const lignes = await query('SELECT * FROM app.tableau_gouvernorats()');
    res.json(lignes);
  })
);

// GET /observatoire/deploiement — statut de chaque commune (actif / incomplet /
// désactivé), déduit de l'activité réelle et non d'une saisie manuelle.
observatoireRouter.get(
  '/deploiement',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const lignes = await query(`
      SELECT s.commune_id, c.name, c.name_ar, c.gouvernorat, c.population,
             c.is_pilot, c.donnees_source, c.pcgd_status,
             s.statut, s.derniere_activite, s.ecritures_30j, s.a_des_pesees
        FROM app.statut_communes() s
        JOIN communes c ON c.id = s.commune_id
       ORDER BY c.gouvernorat, c.name
    `);
    res.json(lignes);
  })
);

// PATCH /observatoire/communes/:id/provenance — qualifier la provenance des
// données d'une commune. Réservé à la FNCT : c'est elle qui atteste qu'une
// valeur cesse d'être une estimation.
const provenanceSchema = z.object({
  donneesSource: z.enum(['estime', 'declare', 'mesure']),
});

observatoireRouter.patch(
  '/communes/:id/provenance',
  requireAuth,
  requireRole('super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const { donneesSource } = provenanceSchema.parse(req.body);
    const [commune] = await query(
      `UPDATE communes
          SET donnees_source = $2,
              donnees_qualifiees_le = now(),
              donnees_qualifiees_par = $3
        WHERE id = $1
      RETURNING id, name, donnees_source, donnees_qualifiees_le`,
      [req.params.id, donneesSource, req.user!.sub]
    );
    // Aucune ligne modifiée : commune inexistante, ou hors du périmètre de
    // l'appelant. Sans ce contrôle, la requête répondrait 200 avec un corps
    // vide et laisserait croire que la qualification a eu lieu.
    if (!commune) throw new ApiError(404, 'Commune introuvable.');
    res.json(commune);
  })
);

export { provenanceSchema };
