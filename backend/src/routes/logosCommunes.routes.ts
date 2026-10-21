// ---------------------------------------------------------------------------
// Le logo d'une commune (jalon D, lot D1 ; migration 083).
//
// La commune dépose son logo elle-même, depuis son portail ; la FNCT le dépose
// en secours, depuis l'annuaire national. Le logo s'affiche en tête du portail
// de la commune. Il est un fichier du stockage existant (usage logo_commune) :
// reconnu par ses octets, ses métadonnées retirées, 1 Mo au plus ; JPEG, PNG,
// WebP, ou SVG statique — un SVG qui contient un script, un gestionnaire
// d'événement ou un lien extérieur est REFUSÉ, jamais réécrit.
//
// Remplacer un logo retire l'ancien et inscrit le nouveau dans une seule
// transaction (règle 1.4 : l'ancien reste dans l'historique). Les octets sont
// écrits dans cette transaction : si le disque refuse, rien n'est inscrit.
// ---------------------------------------------------------------------------

import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, withTransaction } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import {
  cheminRelatif,
  ecrire,
  empreinte,
  estSvg,
  lire,
  nettoyer,
  reconnaitreType,
  svgStatique,
  tailleMaxPour,
  type TypeFichier,
} from '../services/fichiers.js';

export const logosCommunesRouter = Router();

export const depotLogoSchema = z
  .object({
    nomFichier: z.string().trim().min(1).max(255),
    /** Les octets du logo, en base64 ; un préfixe « data:…;base64, » est toléré et ignoré. */
    contenu: z.string().min(1),
  })
  .strict();

const ImageLogo = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'] as const;

/** La commune, si l'appelant la voit : hors périmètre, elle est introuvable (404), jamais « refusée ». */
async function communeVisible(id: string): Promise<{ id: string; name: string }> {
  const c = await queryOne<{ id: string; name: string }>(
    'SELECT id, name FROM communes WHERE id = $1 AND app.can_read_commune(id)',
    [id]
  );
  if (!c) throw new ApiError(404, 'Commune introuvable.');
  return c;
}

logosCommunesRouter.post(
  '/:id/logo',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const commune = await communeVisible(String(req.params.id));
    const d = depotLogoSchema.parse(req.body);
    const qui = req.user?.sub;
    if (!qui) throw new ApiError(401, 'Authentification requise.');

    let octets: Buffer;
    try {
      octets = Buffer.from(d.contenu.replace(/^data:[^;,]*;base64,/, ''), 'base64');
    } catch {
      throw new ApiError(400, 'Contenu illisible : un encodage base64 est attendu.');
    }
    if (octets.length === 0) throw new ApiError(400, 'Fichier vide.');
    const plafond = tailleMaxPour('logo_commune');
    if (octets.length > plafond) {
      throw new ApiError(
        413,
        `Logo trop volumineux : ${Math.round((octets.length / 1024 / 1024) * 10) / 10} Mo pour un maximum de 1 Mo. Enregistrez-le à une définition plus petite (500 pixels de large suffisent pour l'en-tête).`
      );
    }

    // Le type réel, d'après les octets ; le SVG, pour ce seul usage, et statique.
    let type: TypeFichier | null = reconnaitreType(octets);
    if (!type && estSvg(octets)) {
      const motif = svgStatique(octets);
      if (motif) {
        throw new ApiError(
          415,
          `Ce SVG n'est pas accepté : ${motif}. Un logo doit être une image statique — exportez-le sans script ni lien, ou déposez-le en PNG.`
        );
      }
      type = 'image/svg+xml';
    }
    if (!type || !(ImageLogo as readonly string[]).includes(type)) {
      throw new ApiError(
        415,
        "Ce fichier n'est pas une image. Un logo se dépose en PNG, JPEG, WebP ou SVG — reconnu d'après son contenu, non d'après son nom."
      );
    }
    const propre = nettoyer(octets, type);

    const resultat = await withTransaction(async (client) => {
      const id = (await client.query<{ id: string }>('SELECT gen_random_uuid() AS id')).rows[0].id;
      const chemin = cheminRelatif(commune.id, id, type);
      // Publique : le logo est l'identité de la commune, lisible de tout compte.
      await client.query(
        `INSERT INTO fichiers (id, commune_id, nom_original, type_mime, taille_octets, sha256, chemin_relatif, usage, televerse_par, visibilite)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'logo_commune', $8, 'publique')`,
        [id, commune.id, d.nomFichier.slice(0, 255), type, propre.octets.length, empreinte(propre.octets), chemin, qui]
      );
      const retire = await client.query<{ id: string }>(
        `UPDATE logos_communes SET retire_le = now(), retire_par = $2
          WHERE commune_id = $1 AND retire_le IS NULL RETURNING id`,
        [commune.id, qui]
      );
      const logo = await client.query<{ id: string }>(
        'INSERT INTO logos_communes (commune_id, fichier_id, depose_par) VALUES ($1, $2, $3) RETURNING id',
        [commune.id, id, qui]
      );
      try {
        await ecrire(chemin, propre.octets);
      } catch {
        throw new ApiError(
          503,
          "Le logo n'a pas pu être écrit sur le volume de stockage : rien n'a été enregistré. Vérifier que le volume est monté et accessible en écriture."
        );
      }
      return { logoId: logo.rows[0].id, fichierId: id, type, remplace: retire.rows.length > 0 };
    });

    res.status(201).json({
      id: resultat.logoId,
      communeId: commune.id,
      fichierId: resultat.fichierId,
      type: resultat.type,
      tailleOctets: propre.octets.length,
      remplace: resultat.remplace,
    });
  })
);

logosCommunesRouter.post(
  '/:id/logo/retrait',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const commune = await communeVisible(String(req.params.id));
    const ligne = await queryOne<{ id: string }>(
      `UPDATE logos_communes SET retire_le = now(), retire_par = $2
        WHERE commune_id = $1 AND retire_le IS NULL RETURNING id`,
      [commune.id, req.user?.sub ?? null]
    );
    if (!ligne) throw new ApiError(404, "La commune n'a pas de logo en vigueur.");
    res.status(204).end();
  })
);

logosCommunesRouter.get(
  '/:id/logo',
  requireAuth,
  asyncHandler(async (req, res) => {
    const f = await queryOne<{ chemin_relatif: string; type_mime: string; sha256: string }>(
      `SELECT f.chemin_relatif, f.type_mime, f.sha256
         FROM logos_communes l JOIN fichiers f ON f.id = l.fichier_id
        WHERE l.commune_id = $1 AND l.retire_le IS NULL AND f.deleted_at IS NULL`,
      [String(req.params.id)]
    );
    // Sans logo, 404 : l'écran affiche alors l'emblème aux initiales.
    if (!f) throw new ApiError(404, "La commune n'a pas de logo.");
    let octets: Buffer;
    try {
      octets = await lire(f.chemin_relatif);
    } catch {
      throw new ApiError(503, "Le logo est inscrit mais ses octets sont introuvables sur le volume de stockage. Vérifier que le volume est bien monté.");
    }
    res.setHeader('Content-Type', f.type_mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline');
    // Une image, rien d'autre : même ouvert seul dans un onglet, un SVG ne peut
    // ni exécuter de script ni charger quoi que ce soit.
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox");
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('ETag', `"${f.sha256}"`);
    if (req.headers['if-none-match'] === `"${f.sha256}"`) {
      res.status(304).end();
      return;
    }
    res.send(octets);
  })
);

logosCommunesRouter.get(
  '/:id/logos',
  requireAuth,
  asyncHandler(async (req, res) => {
    const commune = await communeVisible(String(req.params.id));
    const lignes = await query(
      `SELECT l.id, l.fichier_id, f.nom_original, f.type_mime, f.taille_octets, l.depose_le, l.retire_le,
              (l.retire_le IS NULL) AS en_vigueur
         FROM logos_communes l JOIN fichiers f ON f.id = l.fichier_id
        WHERE l.commune_id = $1
        ORDER BY l.depose_le DESC`,
      [commune.id]
    );
    res.json(lignes);
  })
);
