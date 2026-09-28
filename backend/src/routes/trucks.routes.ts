import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, withTransaction } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { exportable } from '../services/export.js';
import { JEU_PARC } from '../services/jeuxExport.js';
import { lireTableau, messageLecture, messagesValidation } from '../services/import.js';
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
  exportable(JEU_PARC, (req) => communeDemandee(req) ?? undefined),
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

// Identifiant d'un engin CRÉÉ par l'API, dérivé de l'immatriculation. Il ne
// sert pas à reconnaître un engin existant : les fiches chargées par les seeds
// portent d'autres identifiants (« dcef-02220943 », « trk-04 »). Un engin se
// reconnaît à son immatriculation, espaces et casse mis à part.
const idVehicule = (communeId: string, immat: string) => `${communeId.slice(0, 12)}-${immat.replace(/\s+/g, '')}`;
const cleImmat = (immat: string) => immat.replace(/\s+/g, '').toUpperCase();
const MEME_IMMAT = "upper(regexp_replace(registration, '\\s+', '', 'g'))";

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

    const id = idVehicule(communeId, String(d.registration));
    const existe = await queryOne(
      `SELECT id FROM vehicules WHERE id = $1 OR (commune_id = $2 AND deleted_at IS NULL AND ${MEME_IMMAT} = $3)`,
      [id, communeId, cleImmat(String(d.registration))]
    );
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

// --- Import CSV du parc (B2.4) ---------------------------------------------
//
// Deux temps, comme les autres imports : aperçu, puis `valider: true`. Un
// engin se reconnaît à son immatriculation — c'est d'elle que la création
// dérive l'identifiant. Pour un engin connu, seules les cases REMPLIES du
// fichier sont comparées : une case vide ne gomme jamais une valeur saisie à
// l'écran, et réimporter un export tel quel ne change rien (« inchangé »).

const importParcSchema = z.object({
  nomFichier: z.string().min(1).max(255),
  contenu: z.string().min(1).max(4_000_000),
  valider: z.boolean().default(false),
});

/** Deux valeurs sont-elles la même, une fois ramenées à une forme comparable ? */
function identiques(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined || a === '') return b === null || b === undefined || b === '';
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
  return String(a).trim() === String(b).trim();
}

trucksRouter.post(
  '/import',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const communeId = communeDemandee(req);
    if (!communeId) throw new ApiError(400, 'Commune requise.');
    const d = importParcSchema.parse(req.body);

    let tableau;
    try {
      tableau = lireTableau(JEU_PARC, Buffer.from(d.contenu, 'base64'));
    } catch (err) {
      throw new ApiError(400, messageLecture(err));
    }

    const existants = new Map(
      (
        await query<Record<string, unknown> & { id: string }>(
          `SELECT id, ${Object.values(COLONNES_VEHICULE).filter((c) => c !== 'attele_a' && c !== 'registration').join(', ')}, registration
             FROM vehicules WHERE commune_id = $1 AND deleted_at IS NULL`,
          [communeId]
        )
      ).map((v) => [cleImmat(String(v.registration)), v])
    );
    const vusDansLeFichier = new Map<string, number>();

    const lignes = tableau.lignes.map((l) => {
      const v = Object.fromEntries(Object.entries(l.valeurs).filter(([, x]) => x !== null));
      const libelle = String(v.registration ?? '');
      const erreur = (erreurs: string[]) => ({ numero: l.numero, action: 'erreur' as const, libelle, erreurs, champs: [], saisie: null });
      if (l.erreurs.length > 0) return erreur(l.erreurs);
      if (!v.registration) return erreur(['« Immatriculation » est obligatoire.']);

      const cle = cleImmat(String(v.registration));
      const deja = vusDansLeFichier.get(cle);
      if (deja) return erreur([`Immatriculation déjà présente ligne ${deja} du fichier.`]);
      vusDansLeFichier.set(cle, l.numero);

      const existant = existants.get(cle);
      const id = existant ? existant.id : idVehicule(communeId, String(v.registration));
      if (!existant) {
        const r = vehiculeSchema.safeParse(v);
        if (!r.success) return erreur(messagesValidation(JEU_PARC, r.error.issues as never));
        return { numero: l.numero, action: 'creer' as const, libelle, erreurs: [], champs: [], saisie: { id, ...r.data } as Record<string, unknown> };
      }

      const r = vehiculeSchema.partial().safeParse(v);
      if (!r.success) return erreur(messagesValidation(JEU_PARC, r.error.issues as never));
      const modifies = Object.entries(r.data as Record<string, unknown>).filter(
        ([cle, valeur]) => cle !== 'registration' && !identiques(valeur, existant[COLONNES_VEHICULE[cle]])
      );
      if (modifies.length === 0) {
        return { numero: l.numero, action: 'inchange' as const, libelle, erreurs: [], champs: [], saisie: null };
      }
      return {
        numero: l.numero,
        action: 'maj' as const,
        libelle,
        erreurs: [],
        champs: modifies.map(([cle]) => JEU_PARC.colonnes.find((c) => c.import === cle)?.fr ?? cle),
        saisie: { id, ...Object.fromEntries(modifies), _etatAvant: existant.etat } as Record<string, unknown>,
      };
    });

    const compter = (a: string) => lignes.filter((l) => l.action === a).length;
    const resume = { creer: compter('creer'), maj: compter('maj'), inchange: compter('inchange'), erreur: compter('erreur') };
    const apercu = {
      fichier: d.nomFichier,
      colonnesReconnues: tableau.colonnesReconnues,
      colonnesIgnorees: tableau.colonnesIgnorees,
      avertissements: tableau.avertissements,
      resume,
      lignes: lignes.map(({ saisie: _saisie, ...l }) => l),
    };
    if (!d.valider) return res.json({ ...apercu, ecrit: false });
    if (resume.creer + resume.maj === 0) throw new ApiError(400, 'Rien à créer ni à modifier dans ce fichier.');

    await withTransaction(async (client) => {
      for (const l of lignes) {
        if (!l.saisie) continue;
        const { id, _etatAvant, ...champs } = l.saisie;
        const valeurs: unknown[] = [];
        const colonnes: string[] = [];
        const emplacements: string[] = [];
        for (const [cle, colonne] of Object.entries(COLONNES_VEHICULE)) {
          if (!(cle in champs)) continue;
          valeurs.push(champs[cle]);
          colonnes.push(colonne);
          emplacements.push(typerVehicule(cle, valeurs.length + 2));
        }
        if (l.action === 'creer') {
          await client.query(
            `INSERT INTO vehicules (id, commune_id, ${colonnes.join(', ')}) VALUES ($1, $2, ${emplacements.join(', ')})`,
            [id, communeId, ...valeurs]
          );
        } else {
          // Même règle que la modification à l'écran : un changement d'état
          // sans date dit « depuis aujourd'hui ».
          const depuis =
            'etat' in champs && !('etatDepuis' in champs) && champs.etat !== _etatAvant ? ', etat_depuis = CURRENT_DATE' : '';
          await client.query(
            `UPDATE vehicules SET ${colonnes.map((c, i) => `${c} = ${emplacements[i]}`).join(', ')}${depuis}, last_update = now()
              WHERE id = $1 AND commune_id = $2 AND deleted_at IS NULL`,
            [id, communeId, ...valeurs]
          );
        }
      }
    });
    res.status(201).json({ ...apercu, ecrit: true, crees: resume.creer, modifies: resume.maj });
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
  importParcSchema,
};
