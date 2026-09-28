// Contacts (TDR §3.2.7) — l'annuaire de travail d'une commune.
//
// Des interlocuteurs externes, sans compte sur la plateforme : l'ANGeD, le
// gouvernorat, le prestataire, une association, un fournisseur. Leurs
// coordonnées sont des données personnelles de tiers : seules la commune qui
// les tient et la FNCT les lisent — pas le prestataire rattaché (voir la
// migration 045). Retrait logique, comme partout.

import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, withTransaction } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { exportable } from '../services/export.js';
import { lireTableau, messageLecture, messagesValidation, normaliser } from '../services/import.js';
import { JEU_CONTACTS } from '../services/jeuxExport.js';
import { communeDemandee } from '../perimetre.js';

export const contactsRouter = Router();

const CATEGORIES = ['administration', 'prestataire', 'association', 'fournisseur', 'elu', 'autre'] as const;

const COLONNES = `
  id, commune_id, nom_complet, organisation, fonction, categorie,
  telephone, email, notes, created_at, updated_at
`;

const vide = (v: string | null | undefined) => (v === undefined || v === null || v.trim() === '' ? null : v.trim());

const champs = {
  nomComplet: z.string().trim().min(2).max(200),
  organisation: z.string().max(200).nullable().optional(),
  fonction: z.string().max(200).nullable().optional(),
  categorie: z.enum(CATEGORIES).optional(),
  telephone: z.string().max(30).nullable().optional(),
  email: z.union([z.string().trim().email().max(200), z.literal('')]).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
};

const contactSchema = z
  .object(champs)
  .refine((d) => vide(d.telephone) !== null || vide(d.email) !== null, {
    message: 'Un contact doit porter au moins un téléphone ou un courriel.',
    path: ['telephone'],
  });

const majContactSchema = z.object(champs).partial();

contactsRouter.get(
  '/',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  exportable(JEU_CONTACTS, (req) => communeDemandee(req) ?? undefined),
  asyncHandler(async (req, res) => {
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise.');
    const q = z
      .object({ categorie: z.enum(CATEGORIES).optional(), q: z.string().max(100).optional() })
      .parse(req.query);
    const recherche = vide(q.q);

    res.json(
      await query(
        `SELECT ${COLONNES} FROM contacts
          WHERE deleted_at IS NULL AND commune_id = $1
            AND ($2::text IS NULL OR categorie = $2)
            AND ($3::text IS NULL
                 OR nom_complet ILIKE '%' || $3 || '%'
                 OR organisation ILIKE '%' || $3 || '%'
                 OR fonction ILIKE '%' || $3 || '%')
          ORDER BY nom_complet`,
        [communeId, q.categorie ?? null, recherche]
      )
    );
  })
);

contactsRouter.post(
  '/',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise.');
    const d = contactSchema.parse(req.body);
    const cree = await queryOne(
      `INSERT INTO contacts
         (commune_id, nom_complet, organisation, fonction, categorie, telephone, email, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${COLONNES}`,
      [
        communeId,
        d.nomComplet,
        vide(d.organisation),
        vide(d.fonction),
        d.categorie ?? 'autre',
        vide(d.telephone),
        vide(d.email),
        vide(d.notes),
        req.user!.sub,
      ]
    );
    res.status(201).json(cree);
  })
);

// --- Import CSV (C1.4) -------------------------------------------------------
//
// Deux temps, comme l'import KML des points : un aperçu qui ne touche à rien,
// puis la validation (`valider: true`) qui écrit, en une transaction, les
// seules lignes marquées « créer ». Un contact déjà présent (même nom, et même
// téléphone ou même courriel) n'est pas recréé : réimporter un export ne double
// pas l'annuaire.

const importSchema = z.object({
  nomFichier: z.string().min(1).max(255),
  /** Le fichier en base64, comme pour POST /fichiers. */
  contenu: z.string().min(1).max(4_000_000),
  valider: z.boolean().default(false),
});

const chiffres = (tel: unknown) => (typeof tel === 'string' ? tel.replace(/\D/g, '') : '');

contactsRouter.post(
  '/import',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise.');
    const d = importSchema.parse(req.body);

    let tableau;
    try {
      tableau = lireTableau(JEU_CONTACTS, Buffer.from(d.contenu, 'base64'));
    } catch (err) {
      throw new ApiError(400, messageLecture(err));
    }

    const existants = await query<{ nom_complet: string; telephone: string | null; email: string | null }>(
      'SELECT nom_complet, telephone, email FROM contacts WHERE deleted_at IS NULL AND commune_id = $1',
      [communeId]
    );
    const connus = new Set<string>();
    const retenir = (nom: unknown, tel: unknown, email: unknown) => {
      const n = normaliser(String(nom ?? ''));
      if (chiffres(tel)) connus.add(`${n}|t|${chiffres(tel)}`);
      if (email) connus.add(`${n}|e|${normaliser(String(email))}`);
    };
    const dejaConnu = (nom: unknown, tel: unknown, email: unknown) => {
      const n = normaliser(String(nom ?? ''));
      return (
        (chiffres(tel) !== '' && connus.has(`${n}|t|${chiffres(tel)}`)) ||
        (Boolean(email) && connus.has(`${n}|e|${normaliser(String(email))}`))
      );
    };
    for (const c of existants) retenir(c.nom_complet, c.telephone, c.email);

    const lignes = tableau.lignes.map((l) => {
      const v = Object.fromEntries(Object.entries(l.valeurs).filter(([, x]) => x !== null));
      if (l.erreurs.length > 0) {
        return { numero: l.numero, action: 'erreur' as const, libelle: String(v.nomComplet ?? ''), erreurs: l.erreurs, saisie: null };
      }
      const r = contactSchema.safeParse(v);
      if (!r.success) {
        return {
          numero: l.numero,
          action: 'erreur' as const,
          libelle: String(v.nomComplet ?? ''),
          erreurs: messagesValidation(JEU_CONTACTS, r.error.issues as never),
          saisie: null,
        };
      }
      if (dejaConnu(r.data.nomComplet, r.data.telephone, r.data.email)) {
        return { numero: l.numero, action: 'doublon' as const, libelle: r.data.nomComplet, erreurs: [], saisie: null };
      }
      // Un doublon À L'INTÉRIEUR du fichier compte aussi : la seconde ligne
      // serait une deuxième fiche pour la même personne.
      retenir(r.data.nomComplet, r.data.telephone, r.data.email);
      return { numero: l.numero, action: 'creer' as const, libelle: r.data.nomComplet, erreurs: [], saisie: r.data };
    });

    const resume = {
      creer: lignes.filter((l) => l.action === 'creer').length,
      doublon: lignes.filter((l) => l.action === 'doublon').length,
      erreur: lignes.filter((l) => l.action === 'erreur').length,
    };
    const apercu = {
      fichier: d.nomFichier,
      colonnesReconnues: tableau.colonnesReconnues,
      colonnesIgnorees: tableau.colonnesIgnorees,
      avertissements: tableau.avertissements,
      resume,
      lignes: lignes.map(({ saisie: _saisie, ...l }) => l),
    };
    if (!d.valider) return res.json({ ...apercu, ecrit: false });
    if (resume.creer === 0) throw new ApiError(400, 'Aucune ligne à créer dans ce fichier.');

    await withTransaction(async (client) => {
      for (const l of lignes) {
        if (l.action !== 'creer' || !l.saisie) continue;
        const s = l.saisie;
        await client.query(
          `INSERT INTO contacts
             (commune_id, nom_complet, organisation, fonction, categorie, telephone, email, notes, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [communeId, s.nomComplet, vide(s.organisation), vide(s.fonction), s.categorie ?? 'autre',
           vide(s.telephone), vide(s.email), vide(s.notes), req.user!.sub]
        );
      }
    });
    res.status(201).json({ ...apercu, ecrit: true, crees: resume.creer });
  })
);

contactsRouter.patch(
  '/:id',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const d = majContactSchema.parse(req.body);
    // Un champ absent ne change pas ; un champ vidé explicitement (« » ou
    // null) s'efface. La contrainte « joignable » de la base refuse qu'on
    // efface à la fois le téléphone et le courriel.
    const fourni = (cle: keyof typeof d) => Object.prototype.hasOwnProperty.call(d, cle);
    const contact = await queryOne(
      `UPDATE contacts
          SET nom_complet  = COALESCE($2, nom_complet),
              organisation = CASE WHEN $3 THEN $4 ELSE organisation END,
              fonction     = CASE WHEN $5 THEN $6 ELSE fonction END,
              categorie    = COALESCE($7, categorie),
              telephone    = CASE WHEN $8 THEN $9 ELSE telephone END,
              email        = CASE WHEN $10 THEN $11 ELSE email END,
              notes        = CASE WHEN $12 THEN $13 ELSE notes END
        WHERE id = $1 AND deleted_at IS NULL
      RETURNING ${COLONNES}`,
      [
        req.params.id,
        d.nomComplet ?? null,
        fourni('organisation'), vide(d.organisation),
        fourni('fonction'), vide(d.fonction),
        d.categorie ?? null,
        fourni('telephone'), vide(d.telephone),
        fourni('email'), vide(d.email),
        fourni('notes'), vide(d.notes),
      ]
    );
    if (!contact) throw new ApiError(404, 'Contact introuvable.');
    res.json(contact);
  })
);

contactsRouter.delete(
  '/:id',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    // Lecture sous RLS d'abord : app.supprimer (SECURITY DEFINER) voit la
    // fiche d'une autre commune et répondrait 403 — ce qui révélerait qu'elle
    // existe. Invisible doit rester introuvable.
    const visible = await queryOne('SELECT id FROM contacts WHERE id = $1', [req.params.id]);
    if (!visible) throw new ApiError(404, 'Contact introuvable.');
    const [resultat] = await query<{ supprimer: boolean }>(
      'SELECT app.supprimer($1, $2) AS supprimer',
      ['contacts', req.params.id]
    );
    if (!resultat?.supprimer) throw new ApiError(404, 'Contact introuvable.');
    res.status(204).end();
  })
);

export { contactSchema, majContactSchema, importSchema as importContactsSchema };
