import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { communeDemandee } from '../perimetre.js';
import { notifierPublication } from '../services/notifications.js';

export const communicationRouter = Router();

/**
 * Module 5 — Communication & relation citoyen.
 *
 * Trois fonctions du cahier des charges — sondages (5.2), projets (5.3),
 * notifications ciblées (5.4) — pour une seule ressource : une publication,
 * un périmètre, des destinataires. Voir l'en-tête de la migration 035 pour
 * le raisonnement.
 *
 * CE QUE CE ROUTEUR NE REND JAMAIS : la liste des citoyens d'un périmètre.
 * Il rend leur nombre. Un agent communal a besoin de savoir COMBIEN de foyers
 * son message touche, pour juger s'il part au bon endroit ; il n'a aucun
 * besoin opérationnel de savoir QUI habite dans le polygone qu'il vient de
 * dessiner (décret-loi n° 2022-54).
 */

const TYPES = ['sondage', 'projet', 'notification'] as const;
const STATUTS = ['brouillon', 'publiee', 'close', 'archivee'] as const;
const PERIMETRES = ['commune', 'zones', 'circuits', 'polygone'] as const;
const TYPES_FOYER = ['menage', 'commerce', 'administration', 'industrie'] as const;

const PUBLICATION_SELECT = `
  SELECT p.*,
         d.joignables, d.sans_adresse, d.desabonnes,
         (SELECT count(*) FROM sondage_questions q WHERE q.publication_id = p.id) AS questions,
         (SELECT count(DISTINCT r.citoyen_id) FROM sondage_reponses r WHERE r.publication_id = p.id) AS repondants,
         (SELECT count(*) FROM publication_documents dc WHERE dc.publication_id = p.id) AS documents,
         (SELECT max(e.created_at) FROM envois_notification e WHERE e.publication_id = p.id) AS dernier_envoi
    FROM publications p
    CROSS JOIN LATERAL app.destinataires_publication(p.id) d
`;

// Les brouillons d'abord : ce sont eux qui attendent une décision. Une liste
// qui s'ouvre sur l'archive fait chercher au milieu de ce qui est fini.
const ORDRE = `
  ORDER BY CASE p.statut WHEN 'brouillon' THEN 0 WHEN 'publiee' THEN 1
                         WHEN 'close' THEN 2 ELSE 3 END,
           p.created_at DESC
`;

// --- Liste ------------------------------------------------------------------

communicationRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise.');

    const conditions = ['p.deleted_at IS NULL', 'p.commune_id = $1'];
    const valeurs: unknown[] = [communeId];
    if (typeof req.query.type === 'string' && req.query.type !== '') {
      valeurs.push(req.query.type);
      conditions.push(`p.type = $${valeurs.length}`);
    }
    if (typeof req.query.statut === 'string' && req.query.statut !== '') {
      valeurs.push(req.query.statut);
      conditions.push(`p.statut = $${valeurs.length}`);
    }
    res.json(await query(`${PUBLICATION_SELECT} WHERE ${conditions.join(' AND ')} ${ORDRE}`, valeurs));
  })
);

// --- Routes littérales, déclarées AVANT « /:id » -----------------------------
//
// Le piège s'est présenté cinq fois dans ce projet : sans cet ordre, Express
// prend « apercu », « envois » et « coherence » pour des identifiants.

/**
 * L'aperçu AVANT d'enregistrer quoi que ce soit.
 *
 * C'est la route la plus importante du module. Un agent qui dessine un
 * polygone doit savoir, avant d'écrire son message, combien de foyers il
 * touche — et surtout combien il rate faute d'adresse renseignée. Sans cela
 * il publie dans le vide et n'en saura jamais rien.
 */
communicationRouter.get(
  '/apercu',
  requireAuth,
  asyncHandler(async (req, res) => {
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise.');

    const q = z
      .object({
        perimetreType: z.enum(PERIMETRES).default('commune'),
        zoneIds: z.string().optional(),
        circuitIds: z.string().optional(),
        perimetre: z.string().optional(),   // GeoJSON
        cibleTypes: z.string().optional(),
      })
      .parse(req.query);

    const liste = (v?: string) =>
      v && v.trim() !== '' ? v.split(',').map((x) => x.trim()).filter(Boolean) : null;

    const compte = await queryOne(
      `SELECT * FROM app.compter_destinataires($1, $2, $3::uuid[], $4::uuid[],
              CASE WHEN $5::text IS NULL THEN NULL
                   ELSE ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($5), 4326)) END,
              $6::text[])`,
      [communeId, q.perimetreType, liste(q.zoneIds), liste(q.circuitIds),
       q.perimetre ?? null, liste(q.cibleTypes)]
    );
    res.json(compte);
  })
);

communicationRouter.get(
  '/envois',
  requireAuth,
  asyncHandler(async (req, res) => {
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise.');
    res.json(
      await query(
        `SELECT e.*, p.titre_fr, p.type
           FROM envois_notification e
           JOIN publications p ON p.id = e.publication_id
          WHERE e.commune_id = $1
          ORDER BY e.created_at DESC
          LIMIT 200`,
        [communeId]
      )
    );
  })
);

communicationRouter.get(
  '/coherence',
  requireAuth,
  asyncHandler(async (req, res) => {
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise.');
    res.json(await query('SELECT * FROM app.incoherences_communication($1)', [communeId]));
  })
);

// --- Création et modification -----------------------------------------------

const publicationSchema = z.object({
  type: z.enum(TYPES),
  titreFr: z.string().min(2).max(200),
  titreAr: z.string().max(200).nullable().optional(),
  contenuFr: z.string().max(5000).nullable().optional(),
  contenuAr: z.string().max(5000).nullable().optional(),
  perimetreType: z.enum(PERIMETRES).optional(),
  zoneIds: z.array(z.string().uuid()).nullable().optional(),
  circuitIds: z.array(z.string().uuid()).nullable().optional(),
  perimetre: z.unknown().nullable().optional(),   // GeoJSON Polygon/MultiPolygon
  cibleTypes: z.array(z.enum(TYPES_FOYER)).nullable().optional(),
  dateDebut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  dateFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  projetNature: z.enum(['communal', 'associatif']).nullable().optional(),
  projetEtat: z.enum(['en_preparation', 'actif', 'termine']).nullable().optional(),
  visibleCitoyen: z.boolean().optional(),
  estExemple: z.boolean().optional(),
});

const COLONNES: Record<string, string> = {
  type: 'type',
  titreFr: 'titre_fr',
  titreAr: 'titre_ar',
  contenuFr: 'contenu_fr',
  contenuAr: 'contenu_ar',
  perimetreType: 'perimetre_type',
  zoneIds: 'zone_ids',
  circuitIds: 'circuit_ids',
  perimetre: 'perimetre',
  cibleTypes: 'cible_types',
  dateDebut: 'date_debut',
  dateFin: 'date_fin',
  projetNature: 'projet_nature',
  projetEtat: 'projet_etat',
  visibleCitoyen: 'visible_citoyen',
  estExemple: 'est_exemple',
};

function typer(cle: string, pos: number): string {
  if (cle === 'zoneIds' || cle === 'circuitIds') return `$${pos}::uuid[]`;
  if (cle === 'cibleTypes') return `$${pos}::text[]`;
  if (cle === 'dateDebut' || cle === 'dateFin') return `$${pos}::date`;
  // Le périmètre arrive en GeoJSON et repart en MultiPolygon : un agent peut
  // dessiner un simple polygone, la colonne en attend un multiple.
  if (cle === 'perimetre') {
    return `CASE WHEN $${pos}::text IS NULL THEN NULL
                 ELSE ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($${pos}), 4326)) END`;
  }
  return `$${pos}`;
}

const valeurPour = (cle: string, v: unknown) =>
  cle === 'perimetre' && v !== null && v !== undefined ? JSON.stringify(v) : v;

communicationRouter.post(
  '/',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = publicationSchema.parse(req.body) as Record<string, unknown>;
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise.');

    const colonnes = ['commune_id', 'cree_par'];
    const emplacements = ['$1', '$2'];
    const valeurs: unknown[] = [communeId, req.user!.sub];
    for (const [cle, colonne] of Object.entries(COLONNES)) {
      if (!(cle in d) || d[cle] === undefined) continue;
      valeurs.push(valeurPour(cle, d[cle]));
      colonnes.push(colonne);
      emplacements.push(typer(cle, valeurs.length));
    }
    const cree = await queryOne<{ id: string }>(
      `INSERT INTO publications (${colonnes.join(', ')}) VALUES (${emplacements.join(', ')}) RETURNING id`,
      valeurs
    );
    res.status(201).json(await queryOne(`${PUBLICATION_SELECT} WHERE p.id = $1`, [cree!.id]));
  })
);

communicationRouter.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const p = await queryOne(`${PUBLICATION_SELECT} WHERE p.id = $1 AND p.deleted_at IS NULL`, [req.params.id]);
    if (!p) throw new ApiError(404, 'Publication introuvable.');
    res.json(p);
  })
);

communicationRouter.patch(
  '/:id',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = publicationSchema.partial().parse(req.body) as Record<string, unknown>;
    const clauses: string[] = [];
    const valeurs: unknown[] = [];
    for (const [cle, colonne] of Object.entries(COLONNES)) {
      if (!(cle in d)) continue;
      valeurs.push(valeurPour(cle, d[cle]));
      clauses.push(`${colonne} = ${typer(cle, valeurs.length)}`);
    }
    if (clauses.length === 0) throw new ApiError(400, 'Aucun champ à mettre à jour.');
    valeurs.push(req.params.id);

    const modifie = await queryOne<{ id: string }>(
      `UPDATE publications SET ${clauses.join(', ')}
        WHERE id = $${valeurs.length} AND deleted_at IS NULL RETURNING id`,
      valeurs
    );
    if (!modifie) throw new ApiError(404, 'Publication introuvable.');
    res.json(await queryOne(`${PUBLICATION_SELECT} WHERE p.id = $1`, [req.params.id]));
  })
);

// --- Publier, puis envoyer --------------------------------------------------
//
// Deux gestes distincts, et c'est voulu. Publier rend le contenu visible dans
// l'application citoyenne. Envoyer pousse une notification. On peut vouloir
// l'un sans l'autre : un projet s'affiche sans réveiller les téléphones.

communicationRouter.post(
  '/:id/publier',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = z.object({ statut: z.enum(STATUTS).default('publiee') }).parse(req.body ?? {});
    const modifie = await queryOne<{ id: string }>(
      `UPDATE publications SET statut = $1 WHERE id = $2 AND deleted_at IS NULL RETURNING id`,
      [d.statut, req.params.id]
    );
    if (!modifie) throw new ApiError(404, 'Publication introuvable.');
    res.json(await queryOne(`${PUBLICATION_SELECT} WHERE p.id = $1`, [req.params.id]));
  })
);

communicationRouter.post(
  '/:id/envoyer',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = z.object({ canal: z.enum(['push', 'sms', 'email']).default('push') }).parse(req.body ?? {});

    const p = await queryOne<{
      id: string; commune_id: string; statut: string; est_exemple: boolean; perimetre_type: string;
      type: string; titre_fr: string; contenu_fr: string | null;
    }>(
      'SELECT id, commune_id, statut, est_exemple, perimetre_type, type, titre_fr, contenu_fr FROM publications WHERE id = $1 AND deleted_at IS NULL',
      [req.params.id]
    );
    if (!p) throw new ApiError(404, 'Publication introuvable.');
    if (p.est_exemple) throw new ApiError(400, 'Un contenu marqué « exemple » ne s’envoie pas aux citoyens.');
    if (p.statut !== 'publiee') throw new ApiError(400, 'Publier le contenu avant de l’envoyer.');

    const compte = await queryOne<{ joignables: number; sans_adresse: number; desabonnes: number }>(
      'SELECT * FROM app.destinataires_publication($1)',
      [req.params.id]
    );
    // Un envoi vers zéro destinataire est un envoi raté, pas un envoi réussi.
    // On le refuse plutôt que d'inscrire « 0 destinataires » à l'historique et
    // de laisser l'agent croire que c'est parti.
    if (!compte || compte.joignables === 0) {
      throw new ApiError(
        400,
        'Aucun destinataire dans ce périmètre : rien ne serait envoyé. Élargir le périmètre, ou vérifier que les citoyens de ce secteur ont renseigné leur adresse.'
      );
    }

    const envoi = await queryOne(
      `INSERT INTO envois_notification
         (publication_id, commune_id, canal, destinataires, sans_adresse, desabonnes,
          perimetre_resume, envoye_par)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [req.params.id, p.commune_id, d.canal, compte.joignables, compte.sans_adresse,
       compte.desabonnes, p.perimetre_type, req.user!.sub]
    );

    // L'envoi RÉEL, pour l'instant réservé au push (B5.4.3 : le SMS et le
    // courriel restent enregistrables comme canal choisi, mais rien ne part
    // encore derrière — décision distincte, liée au fournisseur SMS de M1).
    // Un échec du service d'émission ne défait pas l'agrégat déjà écrit
    // ci-dessus : l'agent voit « envoyé », et un envoi individuel manqué se
    // lit dans notifications_envoyees plutôt que de faire échouer ce geste.
    if (d.canal === 'push') {
      const contexte = p.type === 'sondage' ? 'invitation_sondage' : 'notification_ciblee';
      const titre = p.titre_fr;
      const corps = p.contenu_fr ?? p.titre_fr;
      try {
        await notifierPublication(p.commune_id, p.id, contexte, titre, corps);
      } catch (err) {
        console.error('[communication] envoi push non abouti :', err);
      }
    }

    res.status(201).json(envoi);
  })
);

// --- Le questionnaire -------------------------------------------------------

communicationRouter.get(
  '/:id/questions',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(
      await query(
        'SELECT * FROM sondage_questions WHERE publication_id = $1 ORDER BY ordre',
        [req.params.id]
      )
    );
  })
);

const questionSchema = z
  .object({
    libelleFr: z.string().min(2).max(300),
    libelleAr: z.string().max(300).nullable().optional(),
    type: z.enum(['choix_unique', 'choix_multiple', 'texte', 'note']).default('choix_unique'),
    optionsFr: z.array(z.string().max(200)).nullable().optional(),
    optionsAr: z.array(z.string().max(200)).nullable().optional(),
    obligatoire: z.boolean().optional(),
  })
  // Les deux règles ci-dessous existent AUSSI en contrainte de base. On les
  // redit ici pour que le refus soit un 400 accompagné du champ en cause,
  // plutôt qu'une erreur de contrainte remontée en 500 : celui qui compose un
  // questionnaire doit lire ce qui ne va pas, pas un code SQL.
  .refine(
    (q) => !['choix_unique', 'choix_multiple'].includes(q.type)
           || (q.optionsFr != null && q.optionsFr.length >= 2),
    { path: ['optionsFr'], message: 'Une question à choix demande au moins deux réponses proposées.' }
  )
  .refine(
    (q) => q.optionsAr == null || q.optionsFr == null || q.optionsAr.length === q.optionsFr.length,
    {
      path: ['optionsAr'],
      message:
        'Les listes française et arabe doivent avoir le même nombre de réponses : décalées d’un cran, l’arabophone ne coche pas ce qu’il croit cocher.',
    }
  );

/**
 * Le questionnaire se remplace en entier, pas question par question.
 *
 * Modifier une question déjà répondue change rétroactivement le sens des
 * réponses : « êtes-vous satisfait ? » devenu « êtes-vous mécontent ? » et
 * les mêmes « oui » comptés à l'envers. La route refuse donc de toucher à un
 * sondage qui a commencé à recevoir des réponses.
 */
communicationRouter.put(
  '/:id/questions',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const questions = z.array(questionSchema).min(1).max(30).parse(req.body);

    const dejaRepondu = await queryOne<{ n: string }>(
      'SELECT count(*) AS n FROM sondage_reponses WHERE publication_id = $1',
      [req.params.id]
    );
    if (Number(dejaRepondu?.n ?? 0) > 0) {
      throw new ApiError(
        409,
        'Ce sondage a déjà reçu des réponses : modifier les questions changerait rétroactivement le sens de ce qui a été répondu.'
      );
    }

    await query('DELETE FROM sondage_questions WHERE publication_id = $1', [req.params.id]);
    for (const [i, q] of questions.entries()) {
      await query(
        `INSERT INTO sondage_questions
           (publication_id, ordre, libelle_fr, libelle_ar, type, options_fr, options_ar, obligatoire)
         VALUES ($1, $2::smallint, $3, $4, $5, $6::text[], $7::text[], COALESCE($8, true))`,
        [req.params.id, i + 1, q.libelleFr, q.libelleAr ?? null, q.type,
         q.optionsFr ?? null, q.optionsAr ?? null, q.obligatoire ?? null]
      );
    }
    res.json(
      await query('SELECT * FROM sondage_questions WHERE publication_id = $1 ORDER BY ordre', [req.params.id])
    );
  })
);

communicationRouter.get(
  '/:id/depouillement',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await query('SELECT * FROM app.depouillement_sondage($1)', [req.params.id]));
  })
);

// --- Les pièces jointes d'un projet -----------------------------------------

communicationRouter.get(
  '/:id/documents',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(
      await query('SELECT * FROM publication_documents WHERE publication_id = $1 ORDER BY created_at', [req.params.id])
    );
  })
);

communicationRouter.post(
  '/:id/documents',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = z
      .object({
        nom: z.string().min(1).max(200),
        url: z.string().min(1).max(1000),
        typeMime: z.string().max(100).nullable().optional(),
        tailleOctets: z.number().int().positive().nullable().optional(),
      })
      .parse(req.body);

    res.status(201).json(
      await queryOne(
        `INSERT INTO publication_documents (publication_id, nom, url, type_mime, taille_octets, depose_par)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [req.params.id, d.nom, d.url, d.typeMime ?? null, d.tailleOctets ?? null, req.user!.sub]
      )
    );
  })
);
