import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { communeDemandee } from '../perimetre.js';

export const personnelRouter = Router();

/**
 * Module 4 — les gens qui font le travail.
 *
 * CE QUE CE ROUTEUR NE FAIT PAS, ET NE DOIT JAMAIS FAIRE. Il n'expose aucun
 * salaire individuel, aucun numéro de CIN, aucun téléphone, aucune donnée de
 * santé. Ce n'est pas une omission qu'on comblera plus tard : la table
 * `personnel` ne porte pas ces colonnes, précisément pour qu'aucune route ne
 * puisse un jour les servir par inadvertance (décret-loi n° 2022-54,
 * minimisation).
 *
 * L'argent existe dans ce module, mais au niveau du SERVICE et de l'ANNÉE :
 * /personnel/cout. Aucune jointure ne redescend de là vers une personne.
 */

const AGENT_SELECT = `
  SELECT p.*,
         (SELECT count(*) FROM circuit_equipe ce
           WHERE ce.personnel_id = p.id AND ce.date_fin IS NULL) AS circuits_affectes,
         (SELECT string_agg(c.nom, ', ' ORDER BY c.nom)
            FROM circuit_equipe ce JOIN circuits c ON c.id = ce.circuit_id
           WHERE ce.personnel_id = p.id AND ce.date_fin IS NULL) AS circuits
    FROM personnel p
`;

// Un service de soixante personnes se lit par équipe, pas par ordre
// alphabétique : l'encadrement d'abord, puis les chauffeurs — ceux dont
// l'absence arrête une tournée entière.
const ORDRE_AGENTS = `
  ORDER BY CASE p.fonction
             WHEN 'encadrement'  THEN 0
             WHEN 'chef_equipe'  THEN 1
             WHEN 'chauffeur'    THEN 2
             WHEN 'tractoriste'  THEN 3
             ELSE 4 END,
           p.nom_complet
`;

const FONCTIONS = [
  'chauffeur', 'agent', 'chef_equipe', 'agent_balayage', 'encadrement',
  'ripeur', 'tractoriste', 'mecanicien', 'jardinier',
  'agent_hygiene', 'magasinier', 'gardien', 'administratif',
] as const;

const SERVICES = ['proprete', 'espaces_verts', 'hygiene', 'atelier', 'administratif'] as const;
const STATUTS  = ['titulaire', 'contractuel', 'occasionnel', 'mise_a_disposition', 'prestataire'] as const;
const AFFECTATIONS = ['circuit', 'balayage', 'point_fixe', 'atelier', 'encadrement', 'administratif'] as const;
const MOTIFS_ABSENCE = [
  'conge', 'repos', 'formation', 'absence_justifiee',
  'absence_non_justifiee', 'detachement', 'autre',
] as const;

// --- Liste ------------------------------------------------------------------

personnelRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const communeId = communeDemandee(req) ?? undefined;
    const conditions = ['p.deleted_at IS NULL'];
    const valeurs: unknown[] = [];

    if (communeId) { valeurs.push(communeId); conditions.push(`p.commune_id = $${valeurs.length}`); }
    if (typeof req.query.service === 'string' && req.query.service !== '') {
      valeurs.push(req.query.service); conditions.push(`p.service = $${valeurs.length}`);
    }
    if (typeof req.query.fonction === 'string' && req.query.fonction !== '') {
      valeurs.push(req.query.fonction); conditions.push(`p.fonction = $${valeurs.length}`);
    }
    // Par défaut on ne montre que l'effectif vivant. Les départs restent
    // consultables — un registre qui efface les partants ne permet plus de
    // relire une tournée d'il y a six mois.
    if (req.query.inclureInactifs !== 'true') conditions.push('p.actif');

    res.json(await query(`${AGENT_SELECT} WHERE ${conditions.join(' AND ')} ${ORDRE_AGENTS}`, valeurs));
  })
);

// --- Vues agrégées ----------------------------------------------------------
//
// DÉCLARÉES AVANT « /:id » : sans cela Express prend « effectif », « equipes »
// et « cout » pour des identifiants d'agent. Le piège s'est présenté quatre
// fois dans ce projet ; il ne se présentera pas une cinquième.

personnelRouter.get(
  '/effectif',
  requireAuth,
  asyncHandler(async (req, res) => {
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise.');
    res.json(await query('SELECT * FROM app.effectif_commune($1)', [communeId]));
  })
);

personnelRouter.get(
  '/equipes',
  requireAuth,
  asyncHandler(async (req, res) => {
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise.');
    const jour = typeof req.query.jour === 'string' && req.query.jour !== '' ? req.query.jour : null;
    res.json(
      jour
        ? await query('SELECT * FROM app.equipes_du_jour($1, $2::date)', [communeId, jour])
        : await query('SELECT * FROM app.equipes_du_jour($1)', [communeId])
    );
  })
);

personnelRouter.get(
  '/cout',
  requireAuth,
  asyncHandler(async (req, res) => {
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise.');
    const service = typeof req.query.service === 'string' && req.query.service !== ''
      ? req.query.service : 'proprete';
    res.json(await query('SELECT * FROM app.cout_service($1, $2)', [communeId, service]));
  })
);

// --- Présence du jour -------------------------------------------------------

personnelRouter.get(
  '/presences',
  requireAuth,
  asyncHandler(async (req, res) => {
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise.');
    const jour = typeof req.query.jour === 'string' && req.query.jour !== ''
      ? req.query.jour : new Date().toISOString().slice(0, 10);

    // On rend TOUT l'effectif, pointé ou non. Un écran qui n'affiche que les
    // lignes déjà saisies ne montre jamais ceux qu'on a oubliés — or c'est
    // exactement ce que le responsable cherche à voir le matin.
    // La feuille montre l'AFFECTATION COURANTE de l'agent, pas seulement le
    // circuit éventuellement inscrit sur la ligne de pointage. C'est ce que le
    // chef de service a sous les yeux : « untel, chauffeur, Jadid matin puis
    // Barnousa l'après-midi » — de quoi vérifier au passage que la tournée du
    // jour a bien qui il lui faut. Un agent peut servir deux circuits dans la
    // journée : on les rend tous les deux plutôt que d'en choisir un.
    res.json(
      await query(
        `SELECT p.id AS personnel_id, p.nom_complet, p.fonction, p.service,
                pr.id AS presence_id, pr.present, pr.motif_absence,
                pr.circuit_id, pr.voyage, pr.observation,
                COALESCE(
                  (SELECT string_agg(ca.nom, ', ' ORDER BY ca.heure_depart NULLS LAST, ca.nom)
                     FROM circuit_equipe ce
                     JOIN circuits ca ON ca.id = ce.circuit_id
                    WHERE ce.personnel_id = p.id
                      AND ce.date_debut <= $2::date
                      AND (ce.date_fin IS NULL OR ce.date_fin >= $2::date)
                      AND ca.deleted_at IS NULL AND ca.actif),
                  c.nom
                ) AS circuit
           FROM personnel p
           LEFT JOIN presences pr ON pr.personnel_id = p.id AND pr.jour = $2::date
           LEFT JOIN circuits  c  ON c.id = pr.circuit_id
          WHERE p.commune_id = $1 AND p.deleted_at IS NULL AND p.actif
          ${ORDRE_AGENTS}`,
        [communeId, jour]
      )
    );
  })
);

const presenceSchema = z.object({
  personnelId: z.string().uuid(),
  jour: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  present: z.boolean(),
  motifAbsence: z.enum(MOTIFS_ABSENCE).nullable().optional(),
  circuitId: z.string().uuid().nullable().optional(),
  voyage: z.number().int().min(1).optional(),
  observation: z.string().max(500).nullable().optional(),
});

personnelRouter.put(
  '/presences',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    // On accepte une ligne ou la feuille entière : le pointage du matin se
    // fait d'un seul geste, pas agent par agent.
    const corps = Array.isArray(req.body) ? req.body : [req.body];
    const lignes = z.array(presenceSchema).min(1).max(500).parse(corps);

    const agent = await queryOne<{ commune_id: string }>(
      'SELECT commune_id FROM personnel WHERE id = $1 AND deleted_at IS NULL',
      [lignes[0].personnelId]
    );
    if (!agent) throw new ApiError(404, 'Agent introuvable.');

    const resultats = [];
    for (const l of lignes) {
      if (l.present && l.motifAbsence) {
        throw new ApiError(400, 'Un agent présent ne porte pas de motif d’absence.');
      }
      if (!l.present && !l.motifAbsence) {
        throw new ApiError(400, 'Une absence doit porter un motif.');
      }
      const ligne = await queryOne(
        `INSERT INTO presences (commune_id, personnel_id, jour, present, motif_absence,
                                circuit_id, voyage, observation, saisi_par)
         VALUES ((SELECT commune_id FROM personnel WHERE id = $1),
                 $1, COALESCE($2::date, CURRENT_DATE), $3, $4, $5, COALESCE($6, 1), $7, $8)
         ON CONFLICT (personnel_id, jour) DO UPDATE
            SET present = EXCLUDED.present,
                motif_absence = EXCLUDED.motif_absence,
                circuit_id = EXCLUDED.circuit_id,
                voyage = EXCLUDED.voyage,
                observation = EXCLUDED.observation,
                saisi_par = EXCLUDED.saisi_par,
                updated_at = now()
         RETURNING *`,
        [l.personnelId, l.jour ?? null, l.present, l.motifAbsence ?? null,
         l.circuitId ?? null, l.voyage ?? null, l.observation ?? null, req.user!.sub]
      );
      resultats.push(ligne);
    }
    res.json(Array.isArray(req.body) ? resultats : resultats[0]);
  })
);

// --- Effectif et masse salariale du service ---------------------------------

const effectifSchema = z.object({
  annee: z.number().int().min(2000).max(2100),
  service: z.enum(SERVICES).optional(),
  effectifOuvriers: z.number().int().min(0).nullable().optional(),
  effectifEncadrement: z.number().int().min(0).nullable().optional(),
  effectifContractuels: z.number().int().min(0).nullable().optional(),
  masseSalarialeTnd: z.number().min(0).nullable().optional(),
  masseSalarialeOuvriersTnd: z.number().min(0).nullable().optional(),
  source: z.string().max(200).nullable().optional(),
  observation: z.string().max(500).nullable().optional(),
});

personnelRouter.put(
  '/effectifs',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = effectifSchema.parse(req.body);
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise.');

    res.json(
      await queryOne(
        `INSERT INTO effectifs_service
           (commune_id, annee, service, effectif_ouvriers, effectif_encadrement,
            effectif_contractuels, masse_salariale_tnd, masse_salariale_ouvriers_tnd,
            source, observation, saisi_par)
         VALUES ($1, $2, COALESCE($3, 'proprete'), $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (commune_id, annee, service) DO UPDATE
            SET effectif_ouvriers = EXCLUDED.effectif_ouvriers,
                effectif_encadrement = EXCLUDED.effectif_encadrement,
                effectif_contractuels = EXCLUDED.effectif_contractuels,
                masse_salariale_tnd = EXCLUDED.masse_salariale_tnd,
                masse_salariale_ouvriers_tnd = EXCLUDED.masse_salariale_ouvriers_tnd,
                source = EXCLUDED.source,
                observation = EXCLUDED.observation,
                saisi_par = EXCLUDED.saisi_par,
                updated_at = now()
         RETURNING *`,
        [communeId, d.annee, d.service ?? null, d.effectifOuvriers ?? null,
         d.effectifEncadrement ?? null, d.effectifContractuels ?? null,
         d.masseSalarialeTnd ?? null, d.masseSalarialeOuvriersTnd ?? null,
         d.source ?? null, d.observation ?? null, req.user!.sub]
      )
    );
  })
);

// --- Fiche d'un agent -------------------------------------------------------

const agentSchema = z.object({
  nomComplet: z.string().min(2).max(120),
  matricule: z.string().max(40).nullable().optional(),
  fonction: z.enum(FONCTIONS),
  grade: z.string().max(80).nullable().optional(),
  classe: z.number().int().min(1).max(15).nullable().optional(),
  echelon: z.number().int().min(1).max(30).nullable().optional(),
  statut: z.enum(STATUTS).optional(),
  service: z.enum(SERVICES).optional(),
  affectation: z.enum(AFFECTATIONS).nullable().optional(),
  dateRecrutement: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  dateDepart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  permis: z.array(z.string().max(8)).max(10).nullable().optional(),
  observation: z.string().max(500).nullable().optional(),
  actif: z.boolean().optional(),
});

const COLONNES_AGENT: Record<string, string> = {
  nomComplet: 'nom_complet',
  matricule: 'matricule',
  fonction: 'fonction',
  grade: 'grade',
  classe: 'classe',
  echelon: 'echelon',
  statut: 'statut',
  service: 'service',
  affectation: 'affectation',
  dateRecrutement: 'date_recrutement',
  dateDepart: 'date_depart',
  permis: 'permis',
  observation: 'observation',
  actif: 'actif',
};

const typerAgent = (cle: string, pos: number) => {
  if (cle === 'dateRecrutement' || cle === 'dateDepart') return `$${pos}::date`;
  if (cle === 'permis') return `$${pos}::text[]`;
  if (cle === 'classe' || cle === 'echelon') return `$${pos}::smallint`;
  return `$${pos}`;
};

personnelRouter.post(
  '/',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = agentSchema.parse(req.body) as Record<string, unknown>;
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise.');

    const colonnes = ['commune_id'];
    const emplacements = ['$1'];
    const valeurs: unknown[] = [communeId];
    for (const [cle, colonne] of Object.entries(COLONNES_AGENT)) {
      if (!(cle in d) || d[cle] === undefined) continue;
      valeurs.push(d[cle]);
      colonnes.push(colonne);
      emplacements.push(typerAgent(cle, valeurs.length));
    }
    const cree = await queryOne<{ id: string }>(
      `INSERT INTO personnel (${colonnes.join(', ')}) VALUES (${emplacements.join(', ')}) RETURNING id`,
      valeurs
    );
    res.status(201).json(await queryOne(`${AGENT_SELECT} WHERE p.id = $1`, [cree!.id]));
  })
);

personnelRouter.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const agent = await queryOne(`${AGENT_SELECT} WHERE p.id = $1 AND p.deleted_at IS NULL`, [req.params.id]);
    if (!agent) throw new ApiError(404, 'Agent introuvable.');
    res.json(agent);
  })
);

personnelRouter.patch(
  '/:id',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = agentSchema.partial().parse(req.body) as Record<string, unknown>;
    const clauses: string[] = [];
    const valeurs: unknown[] = [];
    for (const [cle, colonne] of Object.entries(COLONNES_AGENT)) {
      if (!(cle in d)) continue;
      valeurs.push(d[cle]);
      clauses.push(`${colonne} = ${typerAgent(cle, valeurs.length)}`);
    }
    if (clauses.length === 0) throw new ApiError(400, 'Aucun champ à mettre à jour.');
    valeurs.push(req.params.id);

    const modifie = await queryOne<{ id: string }>(
      `UPDATE personnel SET ${clauses.join(', ')}, updated_at = now()
        WHERE id = $${valeurs.length} AND deleted_at IS NULL RETURNING id`,
      valeurs
    );
    if (!modifie) throw new ApiError(404, 'Agent introuvable.');
    res.json(await queryOne(`${AGENT_SELECT} WHERE p.id = $1`, [req.params.id]));
  })
);

// --- Retrait d'un agent du registre -----------------------------------------
//
// Suppression LOGIQUE, comme partout ailleurs : la feuille de pointage du mois
// dernier et les tournées déjà faites gardent l'agent qui les a faites.
//
// Le refus quand l'agent tient encore un poste est délibéré, et il NOMME les
// circuits. Retirer en silence un chauffeur affecté laisserait une tournée
// apparemment pourvue par quelqu'un qui n'est plus au registre — exactement le
// genre d'écran qui ment sans rien signaler. À l'utilisateur de clore
// l'affectation d'abord : c'est une décision d'organisation, pas un détail
// technique à régler à sa place.

personnelRouter.delete(
  '/:id',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const postes = await query<{ nom: string }>(
      `SELECT c.nom
         FROM circuit_equipe ce
         JOIN circuits c ON c.id = ce.circuit_id AND c.deleted_at IS NULL
        WHERE ce.personnel_id = $1 AND ce.date_fin IS NULL
        ORDER BY c.nom`,
      [req.params.id]
    );
    if (postes.length > 0) {
      throw new ApiError(
        409,
        `Cet agent est encore affecté à ${postes.length > 1 ? 'ces circuits' : 'ce circuit'} : ` +
          `${postes.map((c) => c.nom).join(', ')}. Clore l'affectation avant de le retirer du registre.`
      );
    }

    const [resultat] = await query<{ supprimer: boolean }>(
      'SELECT app.supprimer($1, $2) AS supprimer',
      ['personnel', req.params.id]
    );
    if (!resultat?.supprimer) throw new ApiError(404, 'Agent introuvable.');
    res.status(204).end();
  })
);

// --- Affectation d'un agent à un circuit ------------------------------------

const affectationSchema = z.object({
  circuitId: z.string().uuid(),
  role: z.enum(['chauffeur', 'agent', 'chef_equipe']).optional(),
  dateDebut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

personnelRouter.post(
  '/:id/affectations',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = affectationSchema.parse(req.body);
    const ligne = await queryOne(
      `INSERT INTO circuit_equipe (circuit_id, personnel_id, role, date_debut)
       VALUES ($1, $2, COALESCE($3, 'agent'), COALESCE($4::date, CURRENT_DATE))
       RETURNING *`,
      [d.circuitId, req.params.id, d.role ?? null, d.dateDebut ?? null]
    );
    res.status(201).json(ligne);
  })
);

// On ne supprime pas une affectation : on la clôt. La tournée de la semaine
// dernière doit rester lisible avec l'équipe qui l'a réellement faite.
personnelRouter.patch(
  '/:id/affectations/:affectationId',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = z.object({
      dateFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      role: z.enum(['chauffeur', 'agent', 'chef_equipe']).optional(),
    }).parse(req.body);

    const clauses: string[] = [];
    const valeurs: unknown[] = [];
    if ('dateFin' in d) { valeurs.push(d.dateFin ?? null); clauses.push(`date_fin = $${valeurs.length}::date`); }
    if ('role'    in d) { valeurs.push(d.role); clauses.push(`role = $${valeurs.length}`); }
    if (clauses.length === 0) throw new ApiError(400, 'Aucun champ à mettre à jour.');

    valeurs.push(req.params.affectationId, req.params.id);
    const modifie = await queryOne(
      `UPDATE circuit_equipe SET ${clauses.join(', ')}
        WHERE id = $${valeurs.length - 1} AND personnel_id = $${valeurs.length} RETURNING *`,
      valeurs
    );
    if (!modifie) throw new ApiError(404, 'Affectation introuvable.');
    res.json(modifie);
  })
);
