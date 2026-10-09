// Dépôt et lecture des fichiers.
//
// Six tables portaient une colonne `photo_url` sans que rien ne stocke
// d'octets : la preuve de traitement d'une réclamation, la photo d'un
// signalement, celle d'une suggestion de point, le constat de terrain et les
// documents d'un projet attendaient tous cette brique.
//
// LE FICHIER VOYAGE EN BASE64, comme le relevé KML du module 2. C'est plus
// volumineux d'un tiers qu'un envoi multipart, et c'est assumé : une seule
// façon de poster dans toute l'API, pas de dépendance supplémentaire, et un
// appel qui se rejoue à la main depuis la documentation. Le plafond porte sur
// le fichier DÉCODÉ, seule taille qui ait un sens.
//
// CE QUE LA RÉPONSE REND, ET POURQUOI. Outre la fiche, elle rend la position
// que l'appareil avait écrite dans la photo — alors même que la plateforme ne
// la conserve pas. C'est délibéré : l'écran peut alors proposer « utiliser la
// position de la photo ? » et ne l'enregistrer que si la personne accepte. La
// différence entre une donnée fournie et une donnée prélevée tient tout
// entière dans cette question posée.

import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { communeDemandee } from '../perimetre.js';
import {
  cheminRelatif,
  ecrire,
  empreinte,
  lire,
  nettoyer,
  reconnaitreType,
  tailleMaxPour,
} from '../services/fichiers.js';

export const fichiersRouter = Router();

const USAGES = [
  'reclamation', 'preuve_traitement', 'constat_terrain', 'passage',
  'incident', 'suggestion_point', 'document_projet', 'enlevement',
  'rapport_etude', 'declassement', 'autre',
] as const;

const FICHE = `
  SELECT f.id, f.commune_id, f.nom_original, f.type_mime, f.taille_octets,
         f.sha256, f.visibilite, f.destinataire_citoyen_id, f.usage,
         f.televerse_par, f.created_at, f.compressee_le, f.taille_compressee_octets,
         f.original_restaure_le
    FROM fichiers f
`;

const depotSchema = z.object({
  nomFichier: z.string().min(1).max(255),
  /** Le fichier encodé en base64, avec ou sans préfixe « data: ». */
  contenu: z.string().min(1),
  usage: z.enum(USAGES).optional(),
  /**
   * Destiné à un citoyen nommément désigné — la preuve de traitement qu'il
   * doit pouvoir consulter. Sans lui, le fichier reste au service.
   */
  destinataireCitoyenId: z.string().uuid().optional(),
});

fichiersRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise.');

    const d = depotSchema.parse(req.body);

    // Le préfixe « data:image/jpeg;base64, » des navigateurs est toléré, et le
    // type qu'il annonce est ignoré : seuls les octets décident.
    const brut = d.contenu.replace(/^data:[^;,]*;base64,/, '');
    let octets: Buffer;
    try {
      octets = Buffer.from(brut, 'base64');
    } catch {
      throw new ApiError(400, 'Contenu illisible : un encodage base64 est attendu.');
    }
    if (octets.length === 0) throw new ApiError(400, 'Fichier vide.');
    const tailleMax = tailleMaxPour(d.usage);
    if (octets.length > tailleMax) {
      throw new ApiError(
        413,
        `Fichier trop volumineux : ${Math.round(octets.length / 1024 / 1024 * 10) / 10} Mo pour un maximum de ${tailleMax / 1024 / 1024} Mo. Réduire la définition de la photo avant l'envoi.`
      );
    }

    // Le type réel, et lui seul. Un exécutable renommé « photo.jpg »
    // s'arrête ici.
    const type = reconnaitreType(octets);
    if (!type) {
      throw new ApiError(
        415,
        d.usage === 'rapport_etude'
          ? "Format non reconnu. Seuls les images JPEG, PNG et WebP, les PDF, et les documents Word, Excel ou PowerPoint (.docx, .xlsx, .pptx) sont acceptés — d'après le contenu du fichier, non d'après son nom."
          : "Format non reconnu. Seules les images JPEG, PNG et WebP et les documents PDF sont acceptés — d'après le contenu du fichier, non d'après son nom."
      );
    }
    // Les documents Office ne sont ouverts que pour un rapport ou une étude :
    // une preuve de traitement de réclamation en .pptx n'aurait pas de sens,
    // et élargir l'acceptation à tout usage aurait ouvert cette porte partout.
    if (type !== 'image/jpeg' && type !== 'image/png' && type !== 'image/webp' &&
        type !== 'application/pdf' && d.usage !== 'rapport_etude') {
      throw new ApiError(
        415,
        "Les documents Word, Excel et PowerPoint ne sont acceptés que pour un rapport ou une étude (usage « rapport_etude »)."
      );
    }

    const propre = nettoyer(octets, type);

    // L'ORDRE DES TROIS ÉCRITURES EST RÉFLÉCHI. L'identifiant est tiré d'abord,
    // pour construire le chemin ; la fiche est posée ensuite, et c'est elle qui
    // passe devant le cloisonnement — un dépôt pour une commune interdite est
    // refusé ici, avant qu'un seul octet ne touche le disque ; les octets
    // viennent en dernier.
    //
    // Si le disque refuse, la fiche est retirée dans la foulée : mieux vaut
    // aucune trace qu'une fiche qui promet des octets absents. L'inverse — les
    // octets d'abord — laisserait sur le volume un fichier que plus rien ne
    // nomme à chaque refus de la base.
    const tirage = await queryOne<{ id: string }>('SELECT gen_random_uuid() AS id');
    const id = tirage!.id;
    const chemin = cheminRelatif(communeId, id, type);

    await query(
      `INSERT INTO fichiers
         (id, commune_id, nom_original, type_mime, taille_octets, sha256,
          chemin_relatif, usage, televerse_par, visibilite, destinataire_citoyen_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        id,
        communeId,
        d.nomFichier.slice(0, 255),
        type,
        propre.octets.length,
        empreinte(propre.octets),
        chemin,
        d.usage ?? null,
        req.user!.sub,
        d.destinataireCitoyenId ? 'citoyen' : 'commune',
        d.destinataireCitoyenId ?? null,
      ]
    );

    try {
      await ecrire(chemin, propre.octets);
    } catch (err) {
      await query('SELECT app.supprimer($1, $2)', ['fichiers', id]).catch(() => undefined);
      throw new ApiError(
        503,
        "Le fichier n'a pas pu être écrit sur le volume de stockage. Vérifier que le volume est monté et accessible en écriture."
      );
    }

    const complet = await queryOne(`${FICHE} WHERE f.id = $1`, [id]);
    res.status(201).json({
      ...complet,
      url: `/fichiers/${id}`,
      // Lue dans la photo, jamais conservée. À proposer, pas à appliquer.
      positionPhoto: propre.position,
    });
  })
);

// DÉCLARÉE AVANT « /:id » : sans cela Express prend « occupation » pour un
// identifiant de fichier. Le piège s'est présenté quatre fois dans ce projet.
fichiersRouter.get(
  '/occupation',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise.');
    res.json(await query('SELECT * FROM app.occupation_fichiers($1)', [communeId]));
  })
);

// La conservation des photos (D-FNCT-4), vue de la FNCT : les passages de la
// tâche mensuelle, les demandes de restauration et leur échéance. Déclarée
// avant « /:id », comme « /occupation ».
fichiersRouter.get(
  '/conservation',
  requireAuth,
  requireRole('super_admin_fnct'),
  asyncHandler(async (_req, res) => {
    const [parametres, passages, demandes, compteurs] = await Promise.all([
      query(`SELECT cle, valeur FROM app_parametres WHERE cle LIKE 'medias.%' ORDER BY cle`),
      query(
        `SELECT p.id::int AS id, p.debut, p.fin, p.declenche_par, p.perimetre, c.name AS perimetre_nom, c.name_ar AS perimetre_nom_ar,
                p.statut, p.motif_refus, p.photos_eligibles, p.photos_compressees,
                p.octets_avant::float8 AS octets_avant, p.octets_apres::float8 AS octets_apres, p.anomalies
           FROM passages_conservation_medias p
           LEFT JOIN communes c ON c.id = p.perimetre
          ORDER BY p.debut DESC LIMIT 12`
      ),
      query(
        `SELECT d.id, d.fichier_id, d.commune_id, c.name AS commune, c.name_ar AS commune_ar, f.nom_original, d.motif,
                d.demandee_le, d.echeance, d.statut, d.restauree_le, d.tentatives,
                d.derniere_tentative_le, d.derniere_erreur,
                (d.statut = 'demandee' AND d.echeance < now()) AS en_retard
           FROM demandes_restauration d
           JOIN fichiers f ON f.id = d.fichier_id
           JOIN communes c ON c.id = d.commune_id
          ORDER BY (d.statut = 'demandee') DESC, d.demandee_le DESC
          LIMIT 100`
      ),
      queryOne(
        `SELECT count(*) FILTER (WHERE compressee_le IS NOT NULL)::int AS photos_compressees,
                count(*) FILTER (WHERE compressee_le IS NULL
                                   AND type_mime IN ('image/jpeg', 'image/png', 'image/webp')
                                   AND coalesce(usage, 'autre') NOT IN ('rapport_etude', 'document_projet')
                                   AND created_at < now() - (SELECT valeur::interval FROM app_parametres
                                                               WHERE cle = 'medias.delai_compression')
                               )::int AS photos_en_attente
           FROM fichiers`
      ),
    ]);
    res.json({ parametres, passages, demandes, ...compteurs });
  })
);

fichiersRouter.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const f = await queryOne<{
      chemin_relatif: string; type_mime: string; nom_original: string; sha256: string;
      chemin_compresse: string | null; sha256_compresse: string | null;
    }>(
      `SELECT chemin_relatif, type_mime, nom_original, sha256, chemin_compresse, sha256_compresse
         FROM fichiers WHERE id = $1 AND deleted_at IS NULL`,
      [req.params.id]
    );
    // Les politiques de cloisonnement ont déjà filtré : un fichier d'une autre
    // commune est introuvable, et non « refusé ». Un refus renseignerait sur
    // son existence.
    if (!f) throw new ApiError(404, 'Fichier introuvable.');

    // Une photo de plus de 36 mois est servie dans sa version compressée
    // (D-FNCT-4) : le citoyen la consulte toujours, à la même adresse. La fiche,
    // elle, garde le type et l'empreinte de l'original.
    const servi = f.chemin_compresse && f.sha256_compresse
      ? { chemin: f.chemin_compresse, type: 'image/jpeg', etag: f.sha256_compresse }
      : { chemin: f.chemin_relatif, type: f.type_mime, etag: f.sha256 };

    let octets: Buffer;
    try {
      octets = await lire(servi.chemin);
    } catch {
      // La fiche existe, les octets non. C'est un volume non monté ou une
      // sauvegarde restaurée à moitié — à dire franchement plutôt qu'à
      // déguiser en 404, qui enverrait chercher au mauvais endroit.
      throw new ApiError(
        503,
        "La fiche de ce fichier existe mais ses octets sont introuvables sur le volume de stockage. Vérifier que le volume est bien monté."
      );
    }

    res.setHeader('Content-Type', servi.type);
    // « inline » pour qu'une photo s'affiche, mais en interdisant au navigateur
    // de deviner un autre type que celui annoncé : un fichier servi depuis un
    // stockage d'utilisateurs ne doit jamais pouvoir être pris pour du HTML.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline');
    // Privé : ces octets ne sont pas publics, et aucun cache intermédiaire ne
    // doit en garder copie. Le contenu ne changeant jamais, l'empreinte sert
    // d'ETag et évite de le retransmettre à chaque affichage.
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('ETag', `"${servi.etag}"`);
    if (req.headers['if-none-match'] === `"${servi.etag}"`) {
      res.status(304).end();
      return;
    }
    res.send(octets);
  })
);

// Demander la restauration de l'original d'une photo compressée (D-FNCT-4).
// La base porte les règles (app.demander_restauration, migration 066) ; la
// restauration elle-même est faite par la tâche de conservation, dès que
// l'archive froide est accessible — l'échéance est de 48 heures.
const ERREURS_RESTAURATION: Record<string, number> = {
  RESTAURATION_FICHIER_INTROUVABLE: 404,
  RESTAURATION_NON_COMPRESSEE: 409,
  RESTAURATION_DEJA_FAITE: 409,
  RESTAURATION_DEJA_DEMANDEE: 409,
  RESTAURATION_MOTIF: 400,
};

export const demandeRestaurationSchema = z.object({
  motif: z.string().trim().min(10).max(1000),
}).strict();

fichiersRouter.post(
  '/:id/restauration',
  requireAuth,
  requireRole('super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = demandeRestaurationSchema.parse(req.body);
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw new ApiError(404, 'Fichier introuvable.');
    try {
      const demande = await queryOne('SELECT * FROM app.demander_restauration($1, $2)', [req.params.id, d.motif]);
      res.status(201).json(demande);
    } catch (err) {
      const m = (err as { message?: string }).message ?? '';
      const code = m.split(':')[0];
      const statut = ERREURS_RESTAURATION[code];
      if (statut) throw new ApiError(statut, m.slice(code.length + 2));
      throw err;
    }
  })
);

// L'original restauré, pour la FNCT seule : la version compressée reste celle
// que tout le monde voit.
fichiersRouter.get(
  '/:id/original',
  requireAuth,
  requireRole('super_admin_fnct'),
  asyncHandler(async (req, res) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw new ApiError(404, 'Fichier introuvable.');
    const f = await queryOne<{
      chemin_relatif: string; type_mime: string; compressee_le: string | null; original_restaure_le: string | null;
    }>(
      `SELECT chemin_relatif, type_mime, compressee_le, original_restaure_le
         FROM fichiers WHERE id = $1`,
      [req.params.id]
    );
    if (!f) throw new ApiError(404, 'Fichier introuvable.');
    if (!f.compressee_le) {
      throw new ApiError(409, "Ce fichier n'a pas été compressé : son original est celui que sert GET /fichiers/{id}.");
    }
    if (!f.original_restaure_le) {
      throw new ApiError(
        409,
        "L'original de cette photo est dans l'archive froide. Demander sa restauration (POST /fichiers/{id}/restauration) ; elle est faite sous 48 heures."
      );
    }
    let octets: Buffer;
    try {
      octets = await lire(f.chemin_relatif);
    } catch {
      throw new ApiError(503, "L'original a été restauré mais ses octets sont introuvables sur le volume de stockage. Vérifier que le volume est bien monté.");
    }
    res.setHeader('Content-Type', f.type_mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(octets);
  })
);

// Rendre une photo publique — ou la retirer de la carte publique. C'est une
// décision de la commune, jamais du déposant : la politique d'écriture de la
// table s'en assure, mais la route le dit aussi, pour que ce soit lisible.
fichiersRouter.patch(
  '/:id',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = z
      .object({
        visibilite: z.enum(['commune', 'citoyen', 'publique']),
        destinataireCitoyenId: z.string().uuid().nullable().optional(),
      })
      .parse(req.body);

    if (d.visibilite === 'citoyen' && !d.destinataireCitoyenId) {
      throw new ApiError(
        400,
        "Une visibilité « citoyen » sans citoyen désigné équivaudrait à « commune » tout en laissant croire qu'un citoyen y a accès."
      );
    }

    const modifie = await queryOne(
      `UPDATE fichiers
          SET visibilite = $1,
              destinataire_citoyen_id = CASE WHEN $1 = 'citoyen' THEN $2::uuid ELSE NULL END
        WHERE id = $3 AND deleted_at IS NULL
        RETURNING id`,
      [d.visibilite, d.destinataireCitoyenId ?? null, req.params.id]
    );
    if (!modifie) throw new ApiError(404, 'Fichier introuvable.');
    res.json(await queryOne(`${FICHE} WHERE f.id = $1`, [req.params.id]));
  })
);

// Retrait LOGIQUE. Les octets restent sur le volume : les effacer relève d'une
// purge datée, pas du geste d'un utilisateur. Tant qu'elle n'existe pas, mieux
// vaut un disque qui grossit qu'une pièce justificative qui disparaît d'un
// clic.
fichiersRouter.delete(
  '/:id',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    let resultat: { supprimer: boolean } | undefined;
    try {
      [resultat] = await query<{ supprimer: boolean }>(
        'SELECT app.supprimer($1, $2) AS supprimer',
        ['fichiers', req.params.id]
      );
    } catch (err) {
      // La pièce d'un dossier de déclassement (migration 059) ne se retire
      // pas par ici : le dossier pointerait vers des octets illisibles.
      const m = (err as { message?: string }).message ?? '';
      if (m.startsWith('FICHIER_PIECE_DECLASSEMENT: ')) throw new ApiError(409, m.slice('FICHIER_PIECE_DECLASSEMENT: '.length));
      throw err;
    }
    if (!resultat?.supprimer) throw new ApiError(404, 'Fichier introuvable.');
    res.status(204).end();
  })
);

export { depotSchema as fichierDepotSchema };
