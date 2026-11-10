-- =============================================================================
-- 101 — M2-2 : la cible d'une période ne compte que les établissements déjà inscrits
--
-- Constaté le 10 novembre 2026 en vérifiant à l'écran la v0.15.92 : la cible de
-- M2-2 comptait les établissements selon leur statut d'AUJOURD'HUI, sans borne de
-- période. Un établissement inscrit aujourd'hui entrait dans la cible de 2022, de
-- 2023… ; la série (« Évolution », « Les données du graphique ») disait alors
-- « 0 établissement sous convention, mesuré » pour des années où le registre
-- n'existait pas. Un zéro mesuré là où rien n'était tenu : règle 1.1. Le défaut
-- date de 051 et de 070 ; 099 et 100 l'ont gardé.
--
-- La règle : une période ne connaît que les établissements inscrits au registre
-- au plus tard à sa fin (`created_at`, jour de Tunis). Avant la première
-- inscription, M2-2 ne rend aucune ligne, et le registre n'est pas tenu : la
-- période dit « non renseigné ».
--
-- Ce qui ne change pas (100) : un « à vérifier » sous convention dans la période
-- reste compté ; sans convention, il reste hors de la cible ; un fermé n'est
-- jamais compté. La fermeture n'est PAS rejouée dans le passé : la table ne garde
-- que le dernier statut (une réouverture efface `ferme_le`, l'historique est au
-- journal d'audit), si bien qu'elle ne sait pas dire quel était le statut d'un
-- établissement en 2023. L'inscription, elle, est un fait daté qui ne bouge pas.
--
-- Aucune donnée ne change : deux fonctions sont réécrites depuis leur définition
-- en base après 100 (pg_get_functiondef), sur les seuls passages de M2-2 et de
-- la source « commerces ». `app._element_completude` (100) n'est pas touchée :
-- elle compte le registre au jour demandé. Les droits d'exécution sont gardés
-- par CREATE OR REPLACE.
-- =============================================================================

CREATE OR REPLACE FUNCTION app._mesures_kpi_auto_periode_base(p_debut date, p_fin date, p_communes text[])
 RETURNS TABLE(commune_id text, code text, valeur numeric, note numeric, detail jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH bornes AS (
    -- `annee` n'est renseignée que si la période est une année entière (jusqu'à
    -- aujourd'hui pour l'année en cours) : les effectifs sont annuels, et un
    -- mois ne porte pas la masse salariale d'une année.
    SELECT p_debut AS debut, p_fin AS fin,
           CASE WHEN p_debut = make_date(extract(year FROM p_debut)::int, 1, 1)
                 AND extract(year FROM p_fin) = extract(year FROM p_debut)
                 AND p_fin >= LEAST(make_date(extract(year FROM p_debut)::int, 12, 31), (now() AT TIME ZONE 'Africa/Tunis')::date)
                THEN extract(year FROM p_debut)::int END AS annee
  ),
  communes_vues AS (SELECT c.id FROM communes c WHERE c.id = ANY(p_communes)),

  -- M1-1 : les mètres linéaires des nettoyages terminés, par jour, depuis le
  -- premier nettoyage mesuré de l'année (rapporter à l'année entière une
  -- mesure commencée en septembre la diluerait).
  balayage AS (
    SELECT a.commune_id, sum(a.metres_lineaires) AS ml, min(a.date_prevue) AS depuis, count(*) AS n
      FROM actions_planifiees a, bornes b
     WHERE a.deleted_at IS NULL AND a.type = 'nettoyage' AND a.statut = 'terminee'
       AND a.metres_lineaires IS NOT NULL AND a.date_prevue BETWEEN b.debut AND b.fin
     GROUP BY a.commune_id
  ),

  -- M2-3, M2-4, M2-5 : les nettoyages échus sur les lieux d'un type.
  lieux AS (
    SELECT a.commune_id, p.type,
           count(*) AS echus,
           count(*) FILTER (WHERE a.statut = 'terminee') AS faits
      FROM actions_planifiees a JOIN poi p ON p.id = a.poi_id AND p.deleted_at IS NULL, bornes b
     WHERE a.deleted_at IS NULL AND a.type = 'nettoyage' AND a.statut <> 'annulee'
       AND a.date_prevue BETWEEN b.debut AND b.fin
       AND p.type IN ('cimetiere', 'marche', 'abattoir')
     GROUP BY a.commune_id, p.type
  ),

  -- M1-9 : les fins de poste de la période.
  bachage AS (
    SELECT f.commune_id, count(*) AS n, count(*) FILTER (WHERE f.benne_bachee) AS bachees
      FROM fins_de_poste f, bornes b
     WHERE f.deleted_at IS NULL AND f.jour BETWEEN b.debut AND b.fin
     GROUP BY f.commune_id
  ),

  -- M1-6 : les agents de terrain dotés d'EPI en cours à la fin de la période,
  -- sur l'effectif de terrain — seulement si le registre est tenu.
  terrain AS (
    SELECT pe.commune_id, count(*) AS effectif
      FROM personnel pe
     WHERE pe.deleted_at IS NULL AND pe.actif AND COALESCE(pe.service, 'proprete') = 'proprete'
       AND pe.fonction IN ('chauffeur', 'agent', 'chef_equipe', 'agent_balayage', 'ripeur',
                           'tractoriste', 'jardinier', 'agent_hygiene', 'mecanicien')
     GROUP BY pe.commune_id
  ),
  dotes AS (
    SELECT d.commune_id, count(DISTINCT d.personnel_id) AS dotes
      FROM dotations_epi d JOIN personnel pe ON pe.id = d.personnel_id AND pe.deleted_at IS NULL AND pe.actif, bornes b
     WHERE d.deleted_at IS NULL AND d.date_remise <= b.fin
       AND (d.date_renouvellement IS NULL OR d.date_renouvellement >= b.fin)
     GROUP BY d.commune_id
  ),
  registre_epi AS (
    SELECT DISTINCT d.commune_id FROM dotations_epi d, bornes b WHERE d.deleted_at IS NULL AND d.date_remise <= b.fin
  ),

  -- M2-2 : les établissements sous convention active pendant la période (100).
  -- « À vérifier » porte sur l'identité (un doublon probable), pas sur la
  -- convention : un établissement à vérifier qui a une convention reste compté,
  -- et le détail le dit (dont_a_verifier). Sans convention, il reste hors de la
  -- cible : un doublon probable ne la gonfle pas. Un fermé n'y est jamais.
  -- Une période ne connaît que les établissements inscrits au registre à sa fin
  -- (101, jour de Tunis) : sans cette borne, un établissement inscrit aujourd'hui
  -- entrait dans la cible de 2022, et l'année où le registre n'existait pas
  -- disait « 0 sous convention, mesuré ». Une convention datée d'avant
  -- l'inscription n'y ramène pas l'établissement : la cible de cette période-là
  -- (tous les établissements d'alors) n'est pas connue, et 1 sur 1 serait aussi
  -- faux que 0 sur 1.
  conventions_periode AS (
    SELECT DISTINCT c.commune_id, c.id, c.statut
      FROM conventions_commerciales cv JOIN commerces c ON c.id = cv.commerce_id AND c.deleted_at IS NULL, bornes b
     WHERE cv.deleted_at IS NULL AND cv.date_debut <= b.fin AND (cv.date_fin IS NULL OR cv.date_fin >= b.debut)
       AND c.statut IN ('actif', 'a_verifier')
       AND (c.created_at AT TIME ZONE 'Africa/Tunis')::date <= b.fin
  ),
  commerces_actifs AS (
    SELECT x.commune_id, count(*) AS cibles
      FROM (SELECT c.commune_id, c.id FROM commerces c, bornes b
             WHERE c.deleted_at IS NULL AND c.statut = 'actif' AND (c.created_at AT TIME ZONE 'Africa/Tunis')::date <= b.fin
            UNION
            SELECT p.commune_id, p.id FROM conventions_periode p) x
     GROUP BY x.commune_id
  ),
  conventionnes AS (
    SELECT p.commune_id, count(*) AS n, count(*) FILTER (WHERE p.statut = 'a_verifier') AS a_verifier
      FROM conventions_periode p GROUP BY p.commune_id
  ),

  -- Carburant et incidents du travail.
  carburant AS (
    SELECT f.commune_id, sum(f.montant_tnd) AS montant, sum(f.litres) AS litres, count(*) AS n
      FROM fuel_logs f, bornes b
     WHERE f.deleted_at IS NULL AND f.date_plein BETWEEN b.debut AND b.fin
     GROUP BY f.commune_id
  ),
  incidents AS (
    SELECT i.commune_id, count(*) AS lignes,
           count(*) FILTER (WHERE i.type = 'accident') AS accidents,
           sum(COALESCE(i.jours_arret, 0)) FILTER (WHERE i.type = 'accident') AS jours_arret
      FROM incidents_travail i, bornes b
     WHERE i.deleted_at IS NULL AND i.date_incident BETWEEN b.debut AND b.fin
     GROUP BY i.commune_id
  )

  SELECT b.commune_id, 'M1-1', round(b.ml / (bo.fin - b.depuis + 1), 1),
         CASE WHEN pc.objectif_balayage_ml_j > 0 THEN LEAST(1, b.ml / (bo.fin - b.depuis + 1) / pc.objectif_balayage_ml_j) END,
         jsonb_build_object('cible', pc.objectif_balayage_ml_j, 'metres', b.ml, 'jours', bo.fin - b.depuis + 1, 'nettoyages', b.n)
    FROM balayage b JOIN communes_vues cv ON cv.id = b.commune_id CROSS JOIN bornes bo
    LEFT JOIN parametres_commune pc ON pc.commune_id = b.commune_id
  UNION ALL
  SELECT l.commune_id, CASE l.type WHEN 'cimetiere' THEN 'M2-3' WHEN 'marche' THEN 'M2-4' ELSE 'M2-5' END,
         round(100.0 * l.faits / l.echus, 1), l.faits::numeric / l.echus,
         jsonb_build_object('nettoyages_echus', l.echus, 'faits', l.faits)
    FROM lieux l JOIN communes_vues cv ON cv.id = l.commune_id WHERE l.echus > 0
  UNION ALL
  SELECT x.commune_id, 'M1-9', x.bachees, x.bachees::numeric / x.n,
         jsonb_build_object('cible', x.n, 'fins_de_poste', x.n)
    FROM bachage x JOIN communes_vues cv ON cv.id = x.commune_id WHERE x.n > 0
  UNION ALL
  SELECT t.commune_id, 'M1-6', COALESCE(d.dotes, 0), LEAST(1, COALESCE(d.dotes, 0)::numeric / t.effectif),
         jsonb_build_object('cible', t.effectif)
    FROM terrain t JOIN communes_vues cv ON cv.id = t.commune_id
    JOIN registre_epi r ON r.commune_id = t.commune_id
    LEFT JOIN dotes d ON d.commune_id = t.commune_id
   WHERE t.effectif > 0
  UNION ALL
  SELECT ca.commune_id, 'M2-2', COALESCE(n.n, 0), LEAST(1, COALESCE(n.n, 0)::numeric / ca.cibles),
         jsonb_build_object('cible', ca.cibles, 'sous_convention', COALESCE(n.n, 0), 'dont_a_verifier', COALESCE(n.a_verifier, 0))
    FROM commerces_actifs ca JOIN communes_vues cv ON cv.id = ca.commune_id
    LEFT JOIN conventionnes n ON n.commune_id = ca.commune_id
   WHERE ca.cibles > 0
  UNION ALL
  SELECT c.commune_id, 'ECO-CARBURANT', c.montant, NULL, jsonb_build_object('pleins', c.n, 'litres', c.litres)
    FROM carburant c JOIN communes_vues cv ON cv.id = c.commune_id WHERE c.n > 0
  UNION ALL
  -- Un journal tenu cette année, même sans accident, dit « 0 accident ». Un
  -- journal vide ne dit rien.
  SELECT i.commune_id, 'RH-ACCIDENTS', i.accidents, NULL,
         jsonb_build_object('lignes_au_journal', i.lignes, 'jours_arret', COALESCE(i.jours_arret, 0))
    FROM incidents i JOIN communes_vues cv ON cv.id = i.commune_id WHERE i.lignes > 0
$function$;

CREATE OR REPLACE FUNCTION app._source_tenue_base(p_commune text, p_source text, p_debut date, p_fin date, p_declare text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_annee int := extract(year FROM p_debut)::int;
BEGIN
  RETURN CASE p_source
    WHEN 'pesees' THEN EXISTS (SELECT 1 FROM pesees pe WHERE pe.commune_id = p_commune AND pe.deleted_at IS NULL
                                 AND pe.poids_net_kg > 0 AND pe.date_pesee BETWEEN p_debut AND p_fin)
    WHEN 'population' THEN EXISTS (SELECT 1 FROM communes c LEFT JOIN parametres_commune pc ON pc.commune_id = c.id
                                    WHERE c.id = p_commune AND COALESCE(pc.population_permanente, NULLIF(c.population, 0)) > 0)
    WHEN 'controles' THEN EXISTS (SELECT 1 FROM controles_terrain ct WHERE ct.commune_id = p_commune AND ct.deleted_at IS NULL
                                    AND ct.date_controle BETWEEN p_debut AND p_fin)
    WHEN 'communication' THEN EXISTS (SELECT 1 FROM circuits ci WHERE ci.commune_id = p_commune AND ci.deleted_at IS NULL)
                            OR EXISTS (SELECT 1 FROM annonces_collecte a WHERE a.commune_id = p_commune AND a.deleted_at IS NULL)
                            OR EXISTS (SELECT 1 FROM publications p WHERE p.commune_id = p_commune AND p.deleted_at IS NULL AND NOT p.est_exemple)
    WHEN 'enlevements' THEN EXISTS (SELECT 1 FROM demandes_enlevement d WHERE d.commune_id = p_commune AND d.deleted_at IS NULL
                                      AND d.type_dechet IN ('vert', 'ddc') AND d.statut <> 'annulee'
                                      AND d.created_at::date BETWEEN p_debut AND p_fin)
    WHEN 'plans_entretien' THEN EXISTS (SELECT 1 FROM plans_entretien pe WHERE pe.commune_id = p_commune AND pe.deleted_at IS NULL)
                              AND EXISTS (SELECT 1 FROM app.echeances_entretien(p_commune) e WHERE e.statut IN ('a_jour', 'a_prevoir', 'en_retard'))
    WHEN 'reclamations' THEN EXISTS (SELECT 1 FROM tickets t WHERE t.commune_id = p_commune AND t.deleted_at IS NULL
                                       AND t.status <> 'rejete' AND t.created_at::date BETWEEN p_debut AND p_fin)
    WHEN 'reclamations_resolues' THEN EXISTS (SELECT 1 FROM tickets t WHERE t.commune_id = p_commune AND t.deleted_at IS NULL
                                       AND t.status = 'resolu' AND t.resolved_at IS NOT NULL AND t.created_at::date BETWEEN p_debut AND p_fin)
    WHEN 'activation' THEN EXISTS (SELECT 1 FROM communes c WHERE c.id = p_commune AND c.activee)
    WHEN 'usage_numerique' THEN
         EXISTS (SELECT 1 FROM points_collecte pt JOIN circuits ci ON ci.id = pt.circuit_id
                  WHERE pt.commune_id = p_commune AND pt.deleted_at IS NULL AND ci.deleted_at IS NULL)
      OR EXISTS (SELECT 1 FROM controles_terrain ct WHERE ct.commune_id = p_commune AND ct.deleted_at IS NULL AND ct.date_controle BETWEEN p_debut AND p_fin)
      OR EXISTS (SELECT 1 FROM pesees pe WHERE pe.commune_id = p_commune AND pe.deleted_at IS NULL AND pe.date_pesee BETWEEN p_debut AND p_fin)
      OR EXISTS (SELECT 1 FROM tickets t WHERE t.commune_id = p_commune AND t.deleted_at IS NULL AND t.status = 'resolu'
                  AND t.resolved_at::date BETWEEN p_debut AND p_fin)
      OR EXISTS (SELECT 1 FROM presences pr WHERE pr.commune_id = p_commune AND pr.jour BETWEEN p_debut AND p_fin)
      OR EXISTS (SELECT 1 FROM vehicules v WHERE v.commune_id = p_commune AND v.deleted_at IS NULL)
    WHEN 'masse_salariale' THEN EXISTS (SELECT 1 FROM effectifs_service es WHERE es.commune_id = p_commune AND es.annee = v_annee
                                          AND es.service = 'proprete' AND es.masse_salariale_tnd IS NOT NULL)
    WHEN 'effectif_ouvriers' THEN EXISTS (SELECT 1 FROM effectifs_service es WHERE es.commune_id = p_commune AND es.annee = v_annee
                                          AND es.service = 'proprete' AND es.effectif_ouvriers > 0)
    WHEN 'effectif_encadrement' THEN EXISTS (SELECT 1 FROM effectifs_service es WHERE es.commune_id = p_commune AND es.annee = v_annee
                                          AND es.service = 'proprete' AND es.effectif_encadrement IS NOT NULL)
    WHEN 'maintenance' THEN EXISTS (SELECT 1 FROM interventions_maintenance im WHERE im.commune_id = p_commune AND im.deleted_at IS NULL
                                      AND im.date_intervention BETWEEN p_debut AND p_fin)
                       AND NOT EXISTS (SELECT 1 FROM interventions_maintenance im WHERE im.commune_id = p_commune AND im.deleted_at IS NULL
                                      AND im.date_intervention BETWEEN p_debut AND p_fin AND im.cout_tnd IS NULL)
    WHEN 'presences' THEN EXISTS (SELECT 1 FROM presences pr WHERE pr.commune_id = p_commune AND pr.jour BETWEEN p_debut AND p_fin)
    WHEN 'balayage' THEN EXISTS (SELECT 1 FROM actions_planifiees a WHERE a.commune_id = p_commune AND a.deleted_at IS NULL
                                   AND a.type = 'nettoyage' AND a.statut = 'terminee' AND a.metres_lineaires IS NOT NULL
                                   AND a.date_prevue BETWEEN p_debut AND p_fin)
    WHEN 'objectif_balayage' THEN EXISTS (SELECT 1 FROM parametres_commune pc WHERE pc.commune_id = p_commune AND pc.objectif_balayage_ml_j > 0)
    WHEN 'nettoyages_cimetieres' THEN EXISTS (SELECT 1 FROM actions_planifiees a JOIN poi p ON p.id = a.poi_id AND p.deleted_at IS NULL
                                   WHERE a.commune_id = p_commune AND a.deleted_at IS NULL AND a.type = 'nettoyage' AND a.statut <> 'annulee'
                                     AND a.date_prevue BETWEEN p_debut AND p_fin AND p.type = 'cimetiere')
    WHEN 'nettoyages_marches' THEN EXISTS (SELECT 1 FROM actions_planifiees a JOIN poi p ON p.id = a.poi_id AND p.deleted_at IS NULL
                                   WHERE a.commune_id = p_commune AND a.deleted_at IS NULL AND a.type = 'nettoyage' AND a.statut <> 'annulee'
                                     AND a.date_prevue BETWEEN p_debut AND p_fin AND p.type = 'marche')
    WHEN 'nettoyages_abattoirs' THEN EXISTS (SELECT 1 FROM actions_planifiees a JOIN poi p ON p.id = a.poi_id AND p.deleted_at IS NULL
                                   WHERE a.commune_id = p_commune AND a.deleted_at IS NULL AND a.type = 'nettoyage' AND a.statut <> 'annulee'
                                     AND a.date_prevue BETWEEN p_debut AND p_fin AND p.type = 'abattoir')
    WHEN 'fins_de_poste' THEN EXISTS (SELECT 1 FROM fins_de_poste f WHERE f.commune_id = p_commune AND f.deleted_at IS NULL
                                        AND f.jour BETWEEN p_debut AND p_fin)
    WHEN 'epi' THEN EXISTS (SELECT 1 FROM dotations_epi d WHERE d.commune_id = p_commune AND d.deleted_at IS NULL AND d.date_remise <= p_fin)
    WHEN 'agents_terrain' THEN EXISTS (SELECT 1 FROM personnel pe WHERE pe.commune_id = p_commune AND pe.deleted_at IS NULL AND pe.actif
                                         AND COALESCE(pe.service, 'proprete') = 'proprete'
                                         AND pe.fonction IN ('chauffeur', 'agent', 'chef_equipe', 'agent_balayage', 'ripeur',
                                                             'tractoriste', 'jardinier', 'agent_hygiene', 'mecanicien'))
    -- La même borne que M2-2 (101) : avant la première inscription, le registre
    -- n'est pas tenu, et la période dit « non renseigné ».
    WHEN 'commerces' THEN EXISTS (SELECT 1 FROM commerces c WHERE c.commune_id = p_commune AND c.deleted_at IS NULL AND c.statut = 'actif'
                                    AND (c.created_at AT TIME ZONE 'Africa/Tunis')::date <= p_fin)
                          OR EXISTS (SELECT 1 FROM conventions_commerciales cv JOIN commerces c ON c.id = cv.commerce_id AND c.deleted_at IS NULL
                                      WHERE cv.commune_id = p_commune AND cv.deleted_at IS NULL AND c.statut = 'a_verifier'
                                        AND (c.created_at AT TIME ZONE 'Africa/Tunis')::date <= p_fin
                                        AND cv.date_debut <= p_fin AND (cv.date_fin IS NULL OR cv.date_fin >= p_debut))
    WHEN 'carburant' THEN EXISTS (SELECT 1 FROM fuel_logs f WHERE f.commune_id = p_commune AND f.deleted_at IS NULL
                                    AND f.date_plein BETWEEN p_debut AND p_fin)
    WHEN 'incidents' THEN EXISTS (SELECT 1 FROM incidents_travail i WHERE i.commune_id = p_commune AND i.deleted_at IS NULL
                                    AND i.date_incident BETWEEN p_debut AND p_fin)
    WHEN 'circuits' THEN EXISTS (SELECT 1 FROM circuits ci WHERE ci.commune_id = p_commune AND ci.deleted_at IS NULL)
    WHEN 'declaration' THEN EXISTS (SELECT 1 FROM declarations_indicateurs d WHERE d.commune_id = p_commune AND d.deleted_at IS NULL
                                      AND d.indicateur_code = p_declare AND d.annee = v_annee AND d.mois IS NULL)
    ELSE NULL
  END;
END;
$function$;

COMMENT ON COLUMN commerces.created_at IS 'Inscription au registre. M2-2 et la source « commerces » ne connaissent, pour une période, que les établissements inscrits au plus tard à sa fin, jour de Tunis (migration 101).';
