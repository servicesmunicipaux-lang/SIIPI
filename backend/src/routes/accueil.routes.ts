// L'accueil du portail communal (jalon D, lot D2 ; SPEC_D_pret_a_presenter.md).
//
// Une seule réponse pour l'écran d'arrivée, au lieu de six appels qui se
// seraient chacun lus à un instant différent : ce qui va bien, ce qui demande
// une action, et où en est le constat du jour. Rien n'est calculé ici qui ne
// le soit déjà ailleurs — les indicateurs viennent du service des 5 axes, les
// registres de « Ma commune dans SIIPI », les écarts de « À vérifier », les
// entretiens du carnet de bord du parc. La route ne fait que les réunir, si
// bien que l'accueil ne peut pas dire autre chose que l'écran où l'on agit.
//
// CE QUE CET ÉCRAN NE FAIT PAS.
//   - Il ne donne ni total, ni pourcentage, ni note : un score de « ce qui va
//     bien » recréerait le palmarès retiré au lot 1 de la refonte.
//   - Il ne range jamais dans « ce qui va bien » un indicateur qui n'a pas de
//     source (règle d'or 1.1). Un indicateur sans objectif déclaré n'est pas
//     « au-dessus de l'objectif » : il est « calculé », sans jugement.
//   - Une commune qui n'a encore rien saisi n'a pas un tableau de zéros : la
//     réponse le dit (`commune_vide`) et l'écran ouvre le parcours de démarrage.
//
// Un enregistrement hors du périmètre de l'appelant est introuvable (404).

import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { calculerCommune, charger, type Resultat } from '../services/kpi5Axes.js';
import { avecTraduction } from '../services/avisAr.js';

export const accueilRouter = Router();

/** Le jour à Tunis (UTC+1), au format AAAA-MM-JJ : règle 1.3. */
const jourTunis = () => new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);

/** Les éléments de « Ma commune dans SIIPI » qui viennent du référentiel national, pas du travail de la commune. */
const DU_REFERENTIEL = new Set(['population', 'perimetre']);

/** Les statuts d'entretien qui demandent quelque chose ; « a_jour » n'a rien à dire. */
const ENTRETIEN_A_TRAITER = new Set(['en_retard', 'a_prevoir', 'a_verifier']);
const RANG_ENTRETIEN: Record<string, number> = { en_retard: 0, a_prevoir: 1, a_verifier: 2 };

interface LigneCompletude {
  code: string;
  rubrique: 'reference' | 'registre_mois';
  libelle_fr: string;
  libelle_ar: string;
  present: boolean;
  nombre: string | null;
}

interface LigneEcheance {
  plan_id: string;
  vehicule_id: string;
  registration: string;
  libelle: string;
  echeance_date: string | null;
  jours_restants: number | null;
  statut: string;
}

const indicateur = (r: Resultat) => ({
  code: r.code,
  libelle_fr: r.libelle_fr,
  libelle_ar: r.libelle_ar,
  unite: r.unite,
  valeur: r.valeur,
  cible: r.cible,
  taux_atteinte: r.taux_atteinte,
  source: r.source,
});

export const accueilSchema = z.object({ id: z.string().min(1) });

accueilRouter.get(
  '/:id/accueil',
  requireAuth,
  requireRole('admin_commune', 'super_admin_fnct'),
  asyncHandler(async (req, res) => {
    const { id } = accueilSchema.parse(req.params);
    // Lue sous la RLS de l'appelant : une commune qu'il ne voit pas n'existe pas pour lui.
    const commune = await queryOne<{ id: string }>('SELECT id FROM communes WHERE id = $1 AND app.can_read_commune(id)', [id]);
    if (!commune) throw new ApiError(404, 'Commune introuvable.');

    const jour = jourTunis();
    const annee = Number(jour.slice(0, 4));
    // getUTCDay() rend 0 pour dimanche ; la base compte 1 = lundi … 7 = dimanche.
    const jourSemaine = new Date(`${jour}T00:00:00Z`).getUTCDay() || 7;

    const ctx = await charger(annee, [id]);
    const kpi = calculerCommune(ctx, id);
    const indicateurs = kpi.indicateurs.filter((r) => r.famille === 'indicateur');

    const [completude, ecarts, echeances, constat] = await Promise.all([
      query<LigneCompletude>(
        `SELECT code, rubrique, libelle_fr, libelle_ar, present, nombre FROM app.completude_commune($1, $2::date) ORDER BY rubrique, ordre`,
        [id, jour]
      ),
      query<{ sujet: string; constat: string; quoi_faire: string }>(`SELECT * FROM app.incoherences_commune($1)`, [id]),
      query<LigneEcheance>(
        `SELECT plan_id, vehicule_id, registration, libelle, echeance_date, jours_restants, statut FROM app.echeances_entretien($1)`,
        [id]
      ),
      // Les circuits attendus aujourd'hui, et ceux dont le constat est posé : les mêmes lectures que l'écran du constat.
      queryOne<{ attendus: string; saisis: string }>(
        `SELECT count(*) AS attendus,
                count(*) FILTER (WHERE EXISTS (
                  SELECT 1 FROM controles_terrain ct
                   WHERE ct.circuit_id = c.id AND ct.date_controle = $2::date AND ct.deleted_at IS NULL)) AS saisis
           FROM circuits c
          WHERE c.commune_id = $1 AND c.actif AND c.deleted_at IS NULL AND $3::smallint = ANY (c.jours_passage)`,
        [id, jour, jourSemaine]
      ),
    ]);

    const renseignes = indicateurs.filter((r) => r.statut === 'renseigne' && r.valeur != null);
    const atteints = renseignes.filter((r) => r.taux_atteinte != null && r.taux_atteinte >= 1);
    const codesAtteints = new Set(atteints.map((r) => r.code));

    res.json({
      jour,
      annee,
      // Vide : rien de ce que la commune a elle-même saisi (population et périmètre viennent du référentiel).
      commune_vide: !completude.some((e) => e.present && !DU_REFERENTIEL.has(e.code)),
      constat: { attendus: Number(constat?.attendus ?? 0), saisis: Number(constat?.saisis ?? 0) },
      va_bien: {
        objectif_atteint: atteints.map(indicateur),
        calcules: renseignes.filter((r) => !codesAtteints.has(r.code)).map(indicateur),
        registres: completude
          .filter((e) => e.rubrique === 'registre_mois' && e.present)
          .map((e) => ({ code: e.code, libelle_fr: e.libelle_fr, libelle_ar: e.libelle_ar, nombre: e.nombre == null ? null : Number(e.nombre) })),
      },
      a_agir: {
        a_verifier: ecarts.map(avecTraduction),
        non_renseignes: indicateurs
          .filter((r) => r.statut === 'non_renseigne')
          .map((r) => ({ code: r.code, libelle_fr: r.libelle_fr, libelle_ar: r.libelle_ar })),
        entretiens: echeances
          .filter((e) => ENTRETIEN_A_TRAITER.has(e.statut))
          .sort((a, b) => (RANG_ENTRETIEN[a.statut] ?? 9) - (RANG_ENTRETIEN[b.statut] ?? 9)),
      },
    });
  })
);
