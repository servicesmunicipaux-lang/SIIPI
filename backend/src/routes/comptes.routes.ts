// ---------------------------------------------------------------------------
// Comptes et accès — tenus par la commune, pas par un fichier de démarrage.
//
// Le cadre du service propreté sait qui entre et qui part ; un référentiel des
// accès tenu par des développeurs est faux le lendemain de la livraison. Ces
// routes lui donnent la main.
//
// Ce qu'elles ne font délibérément pas :
//   - envoyer le mot de passe par courriel. Le serveur de messagerie n'est pas
//     encore décidé, et un mot de passe qui voyage en clair dans un courriel
//     est un mot de passe public. Il s'affiche une fois à l'écran, au cadre,
//     qui le transmet de vive voix.
//   - permettre de LIRE un mot de passe existant. Aucun n'est stocké en clair,
//     et c'est voulu : on réinitialise, on ne consulte pas.
// ---------------------------------------------------------------------------

import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { query, queryOne } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { communeDemandee } from '../perimetre.js';

export const comptesRouter = Router();

const COMPTE_SELECT = `
  SELECT u.id, u.email, u.full_name, u.role, u.commune_id, c.name AS commune_nom,
         u.phone, u.is_active, u.mot_de_passe_provisoire, u.derniere_connexion,
         u.created_at, a.full_name AS cree_par_nom
    FROM users u
    LEFT JOIN communes c ON c.id = u.commune_id
    LEFT JOIN users a    ON a.id = u.cree_par
`;

// Rôles qu'une commune peut attribuer. « super_admin_fnct » en est absent, et
// le déclencheur de la migration 030 le refuserait de toute façon : la règle
// est posée deux fois, dont une fois là où elle ne se contourne pas.
const ROLES_COMMUNAUX = ['admin_commune', 'gestionnaire_prestataire', 'citoyen'] as const;

/**
 * Mot de passe provisoire lisible à voix haute : ni « l » ni « 1 », ni « O »
 * ni « 0 ». Le cadre le dicte à son agent — s'il faut épeler trois fois, il
 * finira par écrire « Azerty123 » sur un papier.
 */
function motDePasseProvisoire(): string {
  const lettres = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const minuscules = 'abcdefghijkmnpqrstuvwxyz';
  const chiffres = '23456789';
  const tirer = (source: string, n: number) =>
    Array.from({ length: n }, () => source[randomInt(source.length)]).join('');
  return `${tirer(lettres, 1)}${tirer(minuscules, 5)}-${tirer(chiffres, 4)}`;
}

// --- Liste ------------------------------------------------------------------

comptesRouter.get(
  '/',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const communeId = communeDemandee(req);
    const lignes = communeId
      ? await query(
          `${COMPTE_SELECT} WHERE u.deleted_at IS NULL AND u.commune_id = $1 ORDER BY u.role, u.full_name`,
          [communeId]
        )
      : await query(`${COMPTE_SELECT} WHERE u.deleted_at IS NULL ORDER BY u.commune_id, u.role, u.full_name`);
    res.json(lignes);
  })
);

// --- Création ---------------------------------------------------------------

const creationSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(3),
  role: z.enum(ROLES_COMMUNAUX),
  communeId: z.string().optional(),
  phone: z.string().optional(),
});

comptesRouter.post(
  '/',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = creationSchema.parse(req.body);
    const commune = d.communeId ?? communeDemandee(req);
    if (!commune) throw new ApiError(400, 'Commune de rattachement requise.');

    const existant = await queryOne<{ id: string; deleted_at: string | null }>(
      'SELECT id, deleted_at FROM users WHERE lower(email) = lower($1)',
      [d.email]
    );
    if (existant) {
      // On ne réactive pas silencieusement un compte supprimé : la personne
      // qui revient dans le service mérite une décision explicite, pas un
      // effet de bord.
      throw new ApiError(409, 'Cette adresse électronique est déjà utilisée par un compte.');
    }

    const provisoire = motDePasseProvisoire();
    const cree = await queryOne<{ id: string }>(
      `INSERT INTO users (email, password_hash, full_name, role, commune_id, phone,
                          mot_de_passe_provisoire, cree_par)
       VALUES (lower($1), $2, $3, $4, $5, $6, true, $7)
       RETURNING id`,
      [d.email, await bcrypt.hash(provisoire, 12), d.fullName, d.role, commune, d.phone ?? null, req.user!.sub]
    );

    const compte = await queryOne(`${COMPTE_SELECT} WHERE u.id = $1`, [cree!.id]);
    // Le mot de passe n'apparaît QUE dans cette réponse : il n'est stocké nulle
    // part en clair et ne pourra pas être relu.
    res.status(201).json({ ...(compte as object), motDePasseProvisoire: provisoire });
  })
);

// --- Changement de son propre mot de passe ----------------------------------
//
// DÉCLARÉE AVANT « /:id » — et c'est la raison d'être de ce commentaire.
// Express retient la première route qui correspond : « /:id/mot-de-passe »
// placée plus haut aurait capté « /moi/mot-de-passe » avec id = « moi », que
// PostgreSQL aurait ensuite refusé comme identifiant invalide. L'utilisateur
// aurait lu « erreur du serveur » en essayant de changer son mot de passe, et
// rien dans le message n'aurait indiqué l'ordre des routes.
//
// Ouverte à tous les rôles : c'est ce qui permet à un agent de remplacer le
// mot de passe provisoire que son cadre lui a dicté, sans repasser par lui.

const changementSchema = z.object({
  motDePasseActuel: z.string().min(1),
  nouveauMotDePasse: z.string().min(10, 'Dix caractères au minimum.'),
});

comptesRouter.post(
  '/moi/mot-de-passe',
  requireAuth,
  asyncHandler(async (req, res) => {
    const d = changementSchema.parse(req.body);
    const moi = await queryOne<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE id = $1 AND deleted_at IS NULL',
      [req.user!.sub]
    );
    if (!moi || !(await bcrypt.compare(d.motDePasseActuel, moi.password_hash))) {
      throw new ApiError(401, 'Mot de passe actuel incorrect.');
    }
    if (d.motDePasseActuel === d.nouveauMotDePasse) {
      throw new ApiError(400, 'Le nouveau mot de passe doit différer de l’actuel.');
    }
    await query(
      `UPDATE users SET password_hash = $1, mot_de_passe_provisoire = false, updated_at = now()
        WHERE id = $2`,
      [await bcrypt.hash(d.nouveauMotDePasse, 12), req.user!.sub]
    );
    res.status(204).end();
  })
);


// --- Modification -----------------------------------------------------------

const modificationSchema = z.object({
  fullName: z.string().min(3).optional(),
  role: z.enum(ROLES_COMMUNAUX).optional(),
  phone: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

comptesRouter.patch(
  '/:id',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = modificationSchema.parse(req.body);
    if (req.params.id === req.user!.sub && d.isActive === false) {
      // Se désactiver soi-même ferme la porte de l'intérieur : plus personne
      // pour rouvrir si c'est le seul administrateur de la commune.
      throw new ApiError(400, 'Vous ne pouvez pas désactiver votre propre compte.');
    }

    const champs: Record<string, unknown> = {};
    if (d.fullName !== undefined) champs.full_name = d.fullName;
    if (d.role !== undefined) champs.role = d.role;
    if (d.phone !== undefined) champs.phone = d.phone;
    if (d.isActive !== undefined) champs.is_active = d.isActive;
    if (Object.keys(champs).length === 0) throw new ApiError(400, 'Aucun champ à mettre à jour.');

    const colonnes = Object.keys(champs);
    const valeurs = Object.values(champs);
    const modifie = await queryOne<{ id: string }>(
      `UPDATE users SET ${colonnes.map((c, i) => `${c} = $${i + 1}`).join(', ')}, updated_at = now()
        WHERE id = $${valeurs.length + 1} AND deleted_at IS NULL RETURNING id`,
      [...valeurs, req.params.id]
    );
    if (!modifie) throw new ApiError(404, 'Compte introuvable.');
    res.json(await queryOne(`${COMPTE_SELECT} WHERE u.id = $1`, [req.params.id]));
  })
);

// --- Réinitialisation du mot de passe ---------------------------------------

comptesRouter.post(
  '/:id/mot-de-passe',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const provisoire = motDePasseProvisoire();
    const modifie = await queryOne<{ id: string; full_name: string }>(
      `UPDATE users SET password_hash = $1, mot_de_passe_provisoire = true, updated_at = now()
        WHERE id = $2 AND deleted_at IS NULL RETURNING id, full_name`,
      [await bcrypt.hash(provisoire, 12), req.params.id]
    );
    if (!modifie) throw new ApiError(404, 'Compte introuvable.');
    res.json({ id: modifie.id, full_name: modifie.full_name, motDePasseProvisoire: provisoire });
  })
);

// --- Suppression logique ----------------------------------------------------

comptesRouter.delete(
  '/:id',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user!.sub) {
      throw new ApiError(400, 'Vous ne pouvez pas supprimer votre propre compte.');
    }
    // Suppression logique : un compte effacé emporterait l'imputabilité de
    // tout ce qu'il a saisi, et le journal d'audit deviendrait illisible.
    const supprime = await queryOne<{ id: string }>(
      `UPDATE users SET deleted_at = now(), deleted_by = $1, is_active = false
        WHERE id = $2 AND deleted_at IS NULL RETURNING id`,
      [req.user!.sub, req.params.id]
    );
    if (!supprime) throw new ApiError(404, 'Compte introuvable.');
    res.status(204).end();
  })
);
