// ---------------------------------------------------------------------------
// Points de collecte et import des relevés KML/KMZ.
//
// L'import se fait en DEUX temps, volontairement : un aperçu qui ne touche
// à rien, puis une validation. Un fichier de Dar Chaabane porte jusqu'à 113
// points ; les écrire d'un trait au premier clic obligerait l'administrateur
// municipal à défaire à la main ce qu'il n'a pas pu relire. L'aperçu lui
// montre ce qui sera créé, ce qui a été écarté et pourquoi, et il décide.
// ---------------------------------------------------------------------------

import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, withTransaction } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { exportable } from '../services/export.js';
import { JEU_POINTS, jeuPointsAvecChamps } from '../services/jeuxExport.js';
import { champsDeCommune } from './attributsPoints.routes.js';
import { lireKml } from '../services/kml.js';
import {
  FORMATS_FICHIER,
  TYPES_MIME,
  nomFichier,
  versGeoJson,
  versGpx,
  versKml,
  type CircuitFichier,
  type PointFichier,
} from '../services/fichierCircuit.js';
import { communeDemandee } from '../perimetre.js';

export const pointsRouter = Router();

const POINT_SELECT = `
  SELECT p.id, p.circuit_id, p.commune_id, p.voyage, p.ordre, p.nom, p.type,
         (SELECT cc.nom FROM circuits cc WHERE cc.id = p.circuit_id) AS circuit_nom,
         ST_Y(p.geom)::double precision AS lat,
         ST_X(p.geom)::double precision AS lng,
         p.precision_m, p.heure_observee, p.heure_estimee,
         p.observation, p.source, p.actif, p.created_at, p.updated_at,
         -- Champs libres et étiquettes (Jalon 6). Une étiquette retirée
         -- n'est plus rendue : elle reste seulement dans l'historique.
         p.attributs,
         ARRAY(SELECT u.e FROM unnest(p.etiquettes) WITH ORDINALITY AS u(e, rang)
                WHERE EXISTS (SELECT 1 FROM etiquettes_points t WHERE t.id = u.e AND t.deleted_at IS NULL)
                ORDER BY u.rang) AS etiquettes
    FROM points_collecte p
`;

// --- Tous les arrêts d'une commune -----------------------------------------
//
// DÉCLARÉE AVANT « /:id/points » : « /points » serait autrement capté par
// « /:id/points » avec id = « points », et PostgreSQL refuserait l'identifiant.
// C'est le même piège que « /comptes/moi », et il ne se voit qu'à l'exécution.
//
// Sert la carte communale, qui montre tous les arrêts de la commune quel que
// soit leur circuit : c'est la vue qu'on ouvre pour savoir ce qui est desservi
// et ce qui ne l'est pas.

// Filtres facultatifs (B3.6) : l'export reprend exactement la même sélection
// que l'écran, puisqu'il passe par cette même route.
//
// Jalon 6 : par étiquette(s), par valeur d'un champ libre, par action
// planifiée. Même route, donc même export : filtrer « accès camion = non »
// puis exporter sort exactement ces points-là.
const filtresPointsSchema = z.object({
  circuitId: z.string().uuid().optional(),
  type: z.string().max(40).optional(),
  actif: z.enum(['true', 'false']).optional(),
  // Plusieurs étiquettes, séparées par des virgules : le point les porte TOUTES.
  etiquettes: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((x) => x.trim()).filter(Boolean) : []))
    .pipe(z.array(z.string().uuid('Étiquette invalide.'))),
  champId: z.string().uuid().optional(),
  // egal (par défaut hors texte), contient (par défaut pour un texte),
  // renseigne (par défaut sans valeur), vide.
  operateur: z.enum(['egal', 'contient', 'renseigne', 'vide']).optional(),
  valeur: z.string().max(500).optional(),
  actionId: z.string().uuid().optional(),
});

/** « % » et « _ » saisis se cherchent tels quels, pas comme jokers. */
const echapperLike = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`);

const OUI = ['true', 'oui', '1', 'نعم'];
const NON = ['false', 'non', '0', 'لا'];

/** La clause SQL d'un filtre sur un champ libre ; pousse ses paramètres. */
function filtreSurChamp(
  champ: { id: string; type: string },
  f: { operateur?: string; valeur?: string },
  valeurs: unknown[]
): string {
  const sansValeur = f.valeur === undefined || f.valeur.trim() === '';
  const op = f.operateur ?? (sansValeur ? 'renseigne' : champ.type === 'texte' ? 'contient' : 'egal');
  valeurs.push(champ.id);
  const cle = `$${valeurs.length}::text`;
  if (op === 'renseigne') return `AND p.attributs ? ${cle}`;
  if (op === 'vide') return `AND NOT (p.attributs ? ${cle})`;
  if (sansValeur) throw new ApiError(400, 'Valeur requise pour ce filtre.');
  const v = f.valeur!.trim();
  if (op === 'contient') {
    valeurs.push(`%${echapperLike(v)}%`);
    return `AND p.attributs ->> ${cle} ILIKE $${valeurs.length}`;
  }
  if (champ.type === 'oui_non') {
    const t = v.toLowerCase();
    if (!OUI.includes(t) && !NON.includes(t)) throw new ApiError(400, 'Valeur attendue : oui ou non.');
    valeurs.push(OUI.includes(t));
    return `AND p.attributs -> ${cle} = to_jsonb($${valeurs.length}::boolean)`;
  }
  if (champ.type === 'nombre') {
    const n = Number(v.replace(',', '.'));
    if (!Number.isFinite(n)) throw new ApiError(400, 'Valeur attendue : un nombre.');
    valeurs.push(n);
    return `AND jsonb_typeof(p.attributs -> ${cle}) = 'number' AND (p.attributs ->> ${cle})::numeric = $${valeurs.length}::numeric`;
  }
  // Texte, liste, date : égalité, sans tenir compte de la casse.
  valeurs.push(v);
  return `AND lower(p.attributs ->> ${cle}) = lower($${valeurs.length})`;
}

pointsRouter.get(
  '/points',
  requireAuth,
  exportable(JEU_POINTS, (req) => communeDemandee(req) ?? undefined),
  asyncHandler(async (req, res) => {
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise.');
    const f = filtresPointsSchema.parse(req.query);
    const champs = await champsDeCommune(communeId);

    const valeurs: unknown[] = [
      communeId,
      f.circuitId ?? null,
      f.type ?? null,
      f.actif === undefined ? null : f.actif === 'true',
      f.etiquettes,
      f.actionId ?? null,
    ];
    // Une étiquette retirée reste inscrite sur les points (pour l'historique) :
    // filtrer dessus rendrait des points qui ne l'affichent plus.
    if (f.etiquettes.length) {
      const vivantes = await query(
        'SELECT 1 FROM etiquettes_points WHERE id = ANY($1::uuid[]) AND commune_id = $2 AND deleted_at IS NULL',
        [[...new Set(f.etiquettes)], communeId]
      );
      if (vivantes.length !== new Set(f.etiquettes).size) throw new ApiError(400, 'Étiquette inconnue dans cette commune.');
    }
    let clauseChamp = '';
    if (f.champId) {
      const champ = champs.find((c) => c.id === f.champId);
      // Un champ d'une autre commune, ou retiré, n'existe pas ici.
      if (!champ) throw new ApiError(400, 'Champ inconnu dans cette commune.');
      clauseChamp = filtreSurChamp(champ, f, valeurs);
    }

    const lignes = await query<Record<string, unknown>>(
      `${POINT_SELECT}
         JOIN circuits c ON c.id = p.circuit_id
        WHERE p.commune_id = $1 AND p.deleted_at IS NULL AND c.deleted_at IS NULL
          AND ($2::uuid IS NULL OR p.circuit_id = $2)
          AND ($3::text IS NULL OR p.type = $3)
          AND ($4::boolean IS NULL OR p.actif = $4)
          AND p.etiquettes @> $5::uuid[]
          AND ($6::uuid IS NULL OR EXISTS (
                SELECT 1 FROM actions_points ap
                  JOIN actions_planifiees a ON a.id = ap.action_id AND a.deleted_at IS NULL
                 WHERE ap.point_id = p.id AND ap.action_id = $6))
          ${clauseChamp}
        ORDER BY c.nom, p.voyage, p.ordre`,
      valeurs
    );

    if (req.query.format !== undefined) {
      // L'export prend les colonnes libres de la commune, et le nom des
      // étiquettes plutôt que leur identifiant.
      const noms = new Map(
        (
          await query<{ id: string; nom: string }>(
            'SELECT id, nom FROM etiquettes_points WHERE commune_id = $1 AND deleted_at IS NULL',
            [communeId]
          )
        ).map((e) => [e.id, e.nom])
      );
      res.locals.jeuExport = jeuPointsAvecChamps(champs);
      for (const l of lignes) {
        l.etiquettes_noms = ((l.etiquettes as string[]) ?? []).map((id) => noms.get(id)).filter(Boolean);
        const attributs = (l.attributs ?? {}) as Record<string, unknown>;
        for (const c of champs) l[`champ_${c.id}`] = attributs[c.id] ?? null;
      }
    }
    res.json(lignes);
  })
);

// --- Lecture ---------------------------------------------------------------

pointsRouter.get(
  '/:id/points',
  requireAuth,
  asyncHandler(async (req, res) => {
    const lignes = await query(
      `${POINT_SELECT} WHERE p.circuit_id = $1 AND p.deleted_at IS NULL ORDER BY p.ordre`,
      [req.params.id]
    );
    res.json(lignes);
  })
);

// --- Saisie manuelle d'un point -------------------------------------------

const pointSchema = z.object({
  nom: z.string().optional(),
  type: z
    .enum([
      'porte_a_porte',
      'point_de_collecte',
      'debut_collecte',
      'fin_collecte',
      'point_noir',
      'centre_transfert',
      'hors_conteneur',
      'parc_municipal',
      'autre',
    ])
    .default('porte_a_porte'),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  voyage: z.number().int().min(1).max(6).default(1),
  // Rang souhaité. Absent, le point se place à la fin du voyage.
  ordre: z.number().int().positive().optional(),
  heureEstimee: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  observation: z.string().optional(),
});

pointsRouter.post(
  '/:id/points',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = pointSchema.parse(req.body);
    const circuit = await queryOne<{ commune_id: string }>(
      'SELECT commune_id FROM circuits WHERE id = $1 AND deleted_at IS NULL',
      [req.params.id]
    );
    if (!circuit) throw new ApiError(404, 'Circuit introuvable.');

    const cree = await queryOne<{ id: string }>(
      `INSERT INTO points_collecte
         (circuit_id, commune_id, voyage, ordre, nom, type, geom, heure_estimee, observation, source)
       VALUES ($1, $2, $3,
               COALESCE($4, (SELECT COALESCE(max(ordre), 0) + 1 FROM points_collecte
                              WHERE circuit_id = $1 AND voyage = $3 AND deleted_at IS NULL)),
               $5, $6, ST_SetSRID(ST_MakePoint($7, $8), 4326), $9::time, $10, 'saisie')
       RETURNING id`,
      [
        req.params.id,
        circuit.commune_id,
        d.voyage,
        d.ordre ?? null,
        d.nom ?? null,
        d.type,
        d.lng,
        d.lat,
        d.heureEstimee ?? null,
        d.observation ?? null,
      ]
    );
    res.status(201).json(await queryOne(`${POINT_SELECT} WHERE p.id = $1`, [cree!.id]));
  })
);

pointsRouter.patch(
  '/:id/points/:pointId',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = pointSchema.partial().parse(req.body);
    const champs: [string, unknown][] = [];
    if (d.nom !== undefined) champs.push(['nom = $N', d.nom]);
    if (d.type !== undefined) champs.push(['type = $N', d.type]);
    if (d.ordre !== undefined) champs.push(['ordre = $N', d.ordre]);
    if (d.voyage !== undefined) champs.push(['voyage = $N', d.voyage]);
    if (d.heureEstimee !== undefined) champs.push(['heure_estimee = $N::time', d.heureEstimee]);
    if (d.observation !== undefined) champs.push(['observation = $N', d.observation]);
    if (d.lat !== undefined && d.lng !== undefined) {
      champs.push(['geom = ST_SetSRID(ST_MakePoint($N, $M), 4326)', [d.lng, d.lat]]);
    }
    if (champs.length === 0) throw new ApiError(400, 'Aucun champ à mettre à jour.');

    const clauses: string[] = [];
    const valeurs: unknown[] = [];
    for (const [modele, valeur] of champs) {
      if (Array.isArray(valeur)) {
        valeurs.push(valeur[0], valeur[1]);
        clauses.push(modele.replace('$N', `$${valeurs.length - 1}`).replace('$M', `$${valeurs.length}`));
      } else {
        valeurs.push(valeur);
        clauses.push(modele.replace('$N', `$${valeurs.length}`));
      }
    }
    clauses.push('updated_at = now()');
    valeurs.push(req.params.pointId, req.params.id);

    const modifie = await queryOne<{ id: string }>(
      `UPDATE points_collecte SET ${clauses.join(', ')}
        WHERE id = $${valeurs.length - 1} AND circuit_id = $${valeurs.length} AND deleted_at IS NULL
        RETURNING id`,
      valeurs
    );
    if (!modifie) throw new ApiError(404, 'Point introuvable.');
    res.json(await queryOne(`${POINT_SELECT} WHERE p.id = $1`, [req.params.pointId]));
  })
);

pointsRouter.delete(
  '/:id/points/:pointId',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const supprime = await queryOne<{ id: string }>(
      `UPDATE points_collecte SET deleted_at = now(), deleted_by = $1
        WHERE id = $2 AND circuit_id = $3 AND deleted_at IS NULL RETURNING id`,
      [req.user!.sub, req.params.pointId, req.params.id]
    );
    if (!supprime) throw new ApiError(404, 'Point introuvable.');
    res.status(204).end();
  })
);

// --- Défaire un import ------------------------------------------------------
//
// POURQUOI CES DEUX ROUTES EXISTENT. On pouvait poser un itinéraire et
// quatre-vingt-deux arrêts d'un clic, et rien ne permettait de revenir en
// arrière autrement qu'en supprimant les arrêts un par un. Se tromper de
// fichier est la chose la plus banale du monde — deux relevés du même secteur,
// deux voyages du même matin — et la plateforme punissait cette erreur d'une
// heure de travail.
//
// Ce ne sont PAS des effacements. Les arrêts partent en suppression logique,
// comme partout ailleurs : un point retiré aujourd'hui doit rester lisible
// dans le contrôle terrain d'il y a trois semaines. Seule la provenance est
// réellement remise à zéro, parce qu'une provenance périmée ment.

pointsRouter.delete(
  '/:id/trace',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const efface = await queryOne<{ id: string }>(
      `UPDATE circuits
          SET trace = NULL,
              trace_source = NULL,
              trace_importee_le = NULL,
              trace_fichier = NULL,
              updated_at = now()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id`,
      [req.params.id]
    );
    if (!efface) throw new ApiError(404, 'Circuit introuvable.');
    res.status(204).end();
  })
);

pointsRouter.delete(
  '/:id/points',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const circuit = await queryOne<{ id: string }>(
      'SELECT id FROM circuits WHERE id = $1 AND deleted_at IS NULL',
      [req.params.id]
    );
    if (!circuit) throw new ApiError(404, 'Circuit introuvable.');

    const retires = await query<{ id: string }>(
      `UPDATE points_collecte SET deleted_at = now(), deleted_by = $1
        WHERE circuit_id = $2 AND deleted_at IS NULL
        RETURNING id`,
      [req.user!.sub, req.params.id]
    );

    // La provenance ne survit pas aux arrêts qu'elle décrivait : laisser
    // « importés le 3 mai depuis GPSWpts.kml » au-dessus d'une liste vide
    // ferait chercher longtemps ce qui est arrivé à ce fichier.
    await query(
      `UPDATE circuits SET points_importes_le = NULL, points_fichier = NULL, updated_at = now()
        WHERE id = $1`,
      [req.params.id]
    );

    res.json({ retires: retires.length });
  })
);

// --- Import d'un relevé ----------------------------------------------------

const importSchema = z.object({
  nomFichier: z.string().min(1),
  // Le fichier voyage en base64 : cela couvre d'un même format le KML (texte)
  // et le KMZ (archive binaire), sans imposer un envoi multipart au front.
  contenu: z.string().min(1),
  // false = aperçu, rien n'est écrit. C'est la valeur par défaut, à dessein :
  // un import qui écrit sans qu'on l'ait demandé est un import qu'on subit.
  valider: z.boolean().default(false),
  // À la validation : remplacer les points existants, ou les compléter.
  remplacer: z.boolean().default(true),
  // CE QUE L'ON POSE.
  //
  // Un circuit a un itinéraire ET des arrêts, et les deux arrivent dans des
  // fichiers distincts : à Dar Chaabane, le KMZ « مسلك 2 » porte l'itinéraire
  // dessiné, le KML « GPSWpts » porte les arrêts relevés. Jusqu'ici l'import
  // devinait, et posait tout ce qu'il trouvait. Deviner suffit tant qu'on
  // donne un fichier pur ; cela se retourne dès qu'un relevé GPS contient à la
  // fois une trace et des repères — il écrasait alors l'itinéraire prévu par
  // le trajet réellement suivi un matin de mai, sans que personne l'ait
  // demandé.
  //
  // « auto » reste le comportement d'avant, pour ne rien casser.
  cible: z.enum(['auto', 'trace', 'points']).default('auto'),
});

pointsRouter.post(
  '/:id/import-kml',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = importSchema.parse(req.body);
    const circuit = await queryOne<{ commune_id: string; nom: string }>(
      'SELECT commune_id, nom FROM circuits WHERE id = $1 AND deleted_at IS NULL',
      [req.params.id]
    );
    if (!circuit) throw new ApiError(404, 'Circuit introuvable.');

    let lu;
    try {
      lu = lireKml(Buffer.from(d.contenu, 'base64'));
    } catch (err) {
      throw new ApiError(
        400,
        `Fichier illisible : ${err instanceof Error ? err.message : 'format non reconnu'}.`
      );
    }

    // Ce que le fichier permet de poser, et ce que l'appelant a demandé.
    const posePoints = d.cible !== 'trace' && lu.points.length > 0;
    // Un relevé d'arrêts peut porter un tracé en plus (export SIIPI, dessin
    // Google Earth). En « auto », il ne le pose pas : c'est ce que faisait
    // l'import avant de savoir le lire, et un itinéraire prévu ne doit pas
    // être remplacé sans qu'on l'ait demandé. Déposé comme itinéraire, si.
    const poseTrace =
      d.cible !== 'points' && lu.trace.length >= 2 && !(d.cible === 'auto' && lu.famille === 'waypoints');

    const avertissements = [...lu.avertissements];
    if (d.cible === 'points' && lu.points.length === 0) {
      avertissements.push(
        "Vous avez demandé des points de collecte : ce fichier n'en contient aucun. " +
          (lu.trace.length >= 2
            ? "Il ne porte qu'un tracé — importez-le comme itinéraire."
            : '')
      );
    }
    if (d.cible === 'trace' && lu.trace.length < 2) {
      avertissements.push(
        "Vous avez demandé un itinéraire : ce fichier n'en contient pas. " +
          (lu.points.length > 0 ? 'Il ne porte que des arrêts — importez-le comme points de collecte.' : '')
      );
    }
    // Ces deux avis n'ont de sens que si quelque chose est effectivement posé.
    // Annoncer « le tracé sera ignoré » quand rien ne le sera laisse croire
    // qu'un import a eu lieu.
    if (poseTrace && lu.points.length > 0) {
      avertissements.push(
        `Les ${lu.points.length} arrêt(s) de ce fichier seront ignorés : seul l'itinéraire sera posé.`
      );
    }
    if (posePoints && lu.trace.length >= 2) {
      avertissements.push("Le tracé de ce fichier sera ignoré : seuls les arrêts seront posés.");
    }

    const apercu = {
      fichier: d.nomFichier,
      cible: d.cible,
      poseraPoints: posePoints,
      poseraTrace: poseTrace,
      famille: lu.famille,
      nomReleve: lu.nom,
      nbPoints: lu.points.length,
      nbVoyages: lu.points.length ? Math.max(...lu.points.map((p) => p.voyage)) : 0,
      nbSommetsTrace: lu.trace.length,
      statistiques: lu.statistiques,
      avertissements,
      points: lu.points,
    };

    if (!d.valider) {
      // Aperçu : la base n'est pas touchée. On renvoie exactement ce qui
      // serait écrit, pour que la décision se prenne en connaissance de cause.
      return res.json({ ...apercu, ecrit: false });
    }

    if (!posePoints && !poseTrace) {
      throw new ApiError(
        400,
        d.cible === 'auto'
          ? "Ce fichier ne contient ni arrêt ni tracé : rien à importer."
          : `Ce fichier ne contient pas ${d.cible === 'trace' ? "d'itinéraire" : "d'arrêts"} : rien à importer.`
      );
    }

    const resultat = await withTransaction(async (client) => {
      let remplaces = 0;
      if (d.remplacer && posePoints) {
        const r = await client.query(
          `UPDATE points_collecte SET deleted_at = now(), deleted_by = $1
            WHERE circuit_id = $2 AND deleted_at IS NULL`,
          [req.user!.sub, req.params.id]
        );
        remplaces = r.rowCount ?? 0;
      }

      // En mode complément, les nouveaux points prennent la suite.
      const depart = d.remplacer
        ? 0
        : Number(
            (
              await client.query(
                `SELECT COALESCE(max(ordre), 0) AS m FROM points_collecte
                  WHERE circuit_id = $1 AND deleted_at IS NULL`,
                [req.params.id]
              )
            ).rows[0].m
          );

      for (const p of posePoints ? lu.points : []) {
        await client.query(
          `INSERT INTO points_collecte
             (circuit_id, commune_id, voyage, ordre, nom, type, geom, precision_m,
              heure_observee, observation, source)
           VALUES ($1,$2,$3,$4,$5,$6, ST_SetSRID(ST_MakePoint($7,$8),4326), $9, $10::time, $11, 'import_kml')`,
          [
            req.params.id,
            circuit.commune_id,
            p.voyage,
            depart + p.ordre,
            p.nom,
            p.type,
            p.lng,
            p.lat,
            p.precisionM,
            p.heureObservee,
            p.observation,
          ]
        );
      }

      // Le tracé ne porte aucune logique métier : c'est un fond de plan. Sa
      // provenance est conservée pour qu'on ne confonde jamais un itinéraire
      // dessiné avec un trajet relevé au GPS.
      if (poseTrace) {
        const wkt = `LINESTRING(${lu.trace.map(([x, y]) => `${x} ${y}`).join(',')})`;
        await client.query(
          `UPDATE circuits
              SET trace = ST_Multi(ST_SetSRID(ST_GeomFromText($1), 4326)),
                  trace_source = $2,
                  trace_importee_le = now(),
                  trace_fichier = $3,
                  updated_at = now()
            WHERE id = $4`,
          [
            wkt,
            lu.famille === 'itineraire_dessine' || lu.famille === 'geojson' ? 'kmz_prevu' : 'gps_observe',
            d.nomFichier,
            req.params.id,
          ]
        );
      }
      if (posePoints) {
        // « Arrêts importés le 3 mai depuis GPSWpts.kml » vaut mieux que deux
        // cases vides identiques six mois plus tard.
        await client.query(
          `UPDATE circuits SET points_importes_le = now(), points_fichier = $1, updated_at = now()
            WHERE id = $2`,
          [d.nomFichier, req.params.id]
        );
      }

      return { remplaces, crees: posePoints ? lu.points.length : 0 };
    });

    res.status(201).json({ ...apercu, ecrit: true, ...resultat });
  })
);

// --- Historique des modifications ------------------------------------------
//
// Le journal d'audit existe depuis la migration 014 et suit déjà la table
// circuits. On l'expose ici plutôt que de tenir un second historique : deux
// registres du même fait finissent toujours par diverger.

pointsRouter.get(
  '/:id/historique',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const circuit = await queryOne<{ id: string }>(
      'SELECT id FROM circuits WHERE id = $1',
      [req.params.id]
    );
    if (!circuit) throw new ApiError(404, 'Circuit introuvable.');

    const lignes = await query(
      `SELECT a.operation, a.changed_at, a.changed_by_role, a.changed_fields,
              a.old_data, a.new_data, u.full_name AS auteur
         FROM audit_log a
         LEFT JOIN users u ON u.id = a.changed_by
        WHERE a.table_name IN ('circuits', 'points_collecte')
          -- Typé des deux côtés : record_id est un texte, circuit_id un uuid,
          -- et PostgreSQL refusait de deviner (« uuid = text », erreur 500).
          AND (a.record_id = $1::text
               OR a.record_id IN (SELECT id::text FROM points_collecte WHERE circuit_id = $1::uuid))
        ORDER BY a.changed_at DESC
        LIMIT 200`,
      [req.params.id]
    );
    res.json(lignes);
  })
);

// --- Le fichier géographique du circuit -------------------------------------
//
// Le circuit tel qu'il est en base — tracé et arrêts — en GPX, KML ou
// GeoJSON, prêt à ouvrir dans QGIS, Google Earth ou un GPS, et à réimporter
// dans SIIPI. Lecture seule : quiconque voit le circuit peut le télécharger.

const fichierSchema = z.object({ format: z.enum(FORMATS_FICHIER).default('geojson') });

pointsRouter.get(
  '/:id/fichier',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { format } = fichierSchema.parse(req.query);
    const circuit = await queryOne<{
      commune_id: string;
      nom: string;
      code: string | null;
      date_reference: string | null;
      trace_source: string | null;
      trace: { type: string; coordinates: [number, number][][] } | null;
    }>(
      `SELECT commune_id, nom, code, COALESCE(etude_date, date_debut)::text AS date_reference, trace_source,
              ST_AsGeoJSON(ST_Multi(trace))::json AS trace
         FROM circuits WHERE id = $1 AND deleted_at IS NULL`,
      [req.params.id]
    );
    if (!circuit) throw new ApiError(404, 'Circuit introuvable.');

    const [points, champs, etiquettes] = await Promise.all([
      query<any>(`${POINT_SELECT} WHERE p.circuit_id = $1 AND p.deleted_at IS NULL ORDER BY p.voyage, p.ordre`, [
        req.params.id,
      ]),
      champsDeCommune(circuit.commune_id),
      query<{ id: string; nom: string }>('SELECT id, nom FROM etiquettes_points WHERE commune_id = $1', [
        circuit.commune_id,
      ]),
    ]);
    const libelleChamp = new Map(champs.map((c) => [c.id, c.libelle]));
    const nomEtiquette = new Map(etiquettes.map((e) => [e.id, e.nom]));

    const c: CircuitFichier = {
      nom: circuit.nom,
      code: circuit.code,
      dateReference: circuit.date_reference,
      traceSource: circuit.trace_source,
      lignes: circuit.trace?.coordinates ?? [],
    };
    const arrets: PointFichier[] = points.map((p) => ({
      voyage: p.voyage,
      ordre: p.ordre,
      nom: p.nom,
      type: p.type,
      lat: p.lat,
      lng: p.lng,
      precision_m: p.precision_m,
      heure_observee: p.heure_observee,
      heure_estimee: p.heure_estimee,
      observation: p.observation,
      // Un champ retiré par la commune n'est plus exporté.
      champs: Object.fromEntries(
        Object.entries((p.attributs ?? {}) as Record<string, unknown>)
          .filter(([id]) => libelleChamp.has(id))
          .map(([id, v]) => [libelleChamp.get(id)!, v])
      ),
      etiquettes: ((p.etiquettes ?? []) as string[]).map((id) => nomEtiquette.get(id)).filter((n): n is string => !!n),
    }));

    const contenu =
      format === 'gpx' ? versGpx(c, arrets) : format === 'kml' ? versKml(c, arrets) : versGeoJson(c, arrets);
    const nom = nomFichier(c, format);
    res.setHeader('Content-Type', `${TYPES_MIME[format]}; charset=utf-8`);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${nom.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(nom)}`
    );
    res.send(contenu);
  })
);
