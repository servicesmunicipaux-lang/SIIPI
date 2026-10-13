-- =========================================================================
-- 070 — Les indicateurs dans le temps, et ce qui leur manque (refonte, lot 3a ;
-- docs/specs_metier/SPEC_refonte_indicateurs_saisie.md § 3.1 et § 3.2).
--
-- 1. UN SEUL CALCUL, POUR TOUTE PÉRIODE. Les corps de app.mesures_kpi (063) et
--    app.mesures_kpi_auto (051) deviennent des fonctions internes qui prennent
--    une période et une liste de communes. Les fonctions annuelles d'origine
--    les appellent : la valeur d'une année et la série de ses mois sortent du
--    même code, et rien ne bouge pour les écrans existants. Seuls changements
--    de corps : la période, le filtre des communes, et les effectifs (annuels)
--    qui ne se lisent que sur une année entière — un mois ne porte pas la
--    masse salariale d'une année. Le tonnage dit en plus ses jours couverts.
--
-- 2. LA SÉRIE (app.serie_indicateur) : une ligne par période qui a une valeur,
--    AUCUNE pour une période sans donnée (règle d'or 1.1) — un mois sans
--    pesée est un trou dans la courbe, jamais un point à zéro. Chaque point
--    porte sa source : mesuré, ou déclaré.
--
-- 3. CE QUI MANQUE (app.manques_indicateur) : les dépendances de chaque
--    indicateur sont une DONNÉE du catalogue (dependances_indicateurs), pas du
--    code dispersé dans les écrans. Un indicateur calculé se complète par ses
--    données sources, jamais en tapant le résultat.
--
-- 4. LE REPÈRE DU GOUVERNORAT (app.reference_gouvernorat) : la moyenne des
--    communes du gouvernorat qui ont une valeur, seulement à partir de cinq
--    (parametres_kpi.seuil_reference_gouvernorat), sans nommer aucune commune.
-- =========================================================================

-- ---------------------------------------------------------------------------
-- 1. Le calcul, pour une période et une liste de communes
-- ---------------------------------------------------------------------------

-- Internes : elles ne filtrent PAS par droit d'accès — ce sont les fonctions
-- publiques qui leur passent les communes autorisées. Aucun droit pour siipi_app.
CREATE OR REPLACE FUNCTION app._mesures_kpi_periode(p_debut date, p_fin date, p_communes text[])
  RETURNS TABLE (commune_id text, code text, valeur numeric, note numeric, detail jsonb)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
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
  -- La population RETENUE (lot 17.1) : celle que la commune déclare, sinon le
  -- recensement. Sans cela, la fiche des cinq axes et l'écran des pesées
  -- donneraient deux kilos par habitant pour la même commune.
  communes_vues AS (
    SELECT c.id,
           COALESCE(pc.population_permanente, NULLIF(c.population, 0)) AS population,
           CASE WHEN pc.population_permanente IS NOT NULL THEN 'declaree'
                WHEN NULLIF(c.population, 0) IS NOT NULL THEN 'recensement' END AS source_population,
           c.activee
      FROM communes c
      LEFT JOIN parametres_commune pc ON pc.commune_id = c.id
     WHERE c.id = ANY(p_communes)
  ),

  -- M1-2 : les contrôles terrain de l'année.
  controles AS (
    SELECT ct.commune_id,
           count(*) AS n,
           count(*) FILTER (WHERE ct.etat = 'fait') AS faits,
           count(*) FILTER (WHERE ct.etat = 'partiel') AS partiels
      FROM controles_terrain ct, bornes b
     WHERE ct.deleted_at IS NULL AND ct.date_controle BETWEEN b.debut AND b.fin
     GROUP BY ct.commune_id
  ),

  -- M1-3 : calendrier, information, consultation.
  calendrier AS (
    SELECT ci.commune_id, bool_or(ci.actif AND cardinality(ci.jours_passage) > 0) AS publie, count(*) AS circuits
      FROM circuits ci WHERE ci.deleted_at IS NULL GROUP BY ci.commune_id
  ),
  information AS (
    SELECT x.commune_id, sum(x.n) AS n
      FROM (
        SELECT a.commune_id, count(*) AS n FROM annonces_collecte a, bornes b
         WHERE a.deleted_at IS NULL AND a.publiee AND a.created_at::date BETWEEN b.debut AND b.fin GROUP BY a.commune_id
        UNION ALL
        SELECT p.commune_id, count(*) FROM publications p, bornes b
         WHERE p.deleted_at IS NULL AND p.type = 'notification' AND p.publiee_le IS NOT NULL
           AND NOT p.est_exemple AND p.publiee_le::date BETWEEN b.debut AND b.fin GROUP BY p.commune_id
      ) x GROUP BY x.commune_id
  ),
  consultation AS (
    SELECT p.commune_id, count(*) AS n FROM publications p, bornes b
     WHERE p.deleted_at IS NULL AND p.type IN ('sondage', 'projet') AND p.publiee_le IS NOT NULL
       AND NOT p.est_exemple AND p.publiee_le::date BETWEEN b.debut AND b.fin
     GROUP BY p.commune_id
  ),
  -- Une commune qui n'a jamais publié ni circuit ni annonce ni publication
  -- n'est pas « à zéro » : elle n'utilise pas ces modules.
  communication_utilisee AS (
    SELECT id AS commune_id FROM communes_vues cv
     WHERE EXISTS (SELECT 1 FROM circuits ci WHERE ci.commune_id = cv.id AND ci.deleted_at IS NULL)
        OR EXISTS (SELECT 1 FROM annonces_collecte a WHERE a.commune_id = cv.id AND a.deleted_at IS NULL)
        OR EXISTS (SELECT 1 FROM publications p WHERE p.commune_id = cv.id AND p.deleted_at IS NULL AND NOT p.est_exemple)
  ),

  -- M1-5 : les demandes de déchets verts et de démolition.
  enlevements AS (
    SELECT d.commune_id,
           count(*) FILTER (WHERE d.statut <> 'annulee') AS n,
           count(*) FILTER (WHERE d.statut IN ('realisee', 'orientee_collecteur')) AS traitees
      FROM demandes_enlevement d, bornes b
     WHERE d.deleted_at IS NULL AND d.type_dechet IN ('vert', 'ddc') AND d.created_at::date BETWEEN b.debut AND b.fin
     GROUP BY d.commune_id
  ),

  -- M1-7 : les plans d'entretien évaluables (« à vérifier » ne l'est pas).
  entretien AS (
    SELECT cv.id AS commune_id,
           count(*) FILTER (WHERE e.statut IN ('a_jour', 'a_prevoir', 'en_retard')) AS n,
           count(*) FILTER (WHERE e.statut IN ('a_jour', 'a_prevoir')) AS a_jour
      FROM communes_vues cv
      CROSS JOIN LATERAL app.echeances_entretien(cv.id) e
     WHERE EXISTS (SELECT 1 FROM plans_entretien pe WHERE pe.commune_id = cv.id AND pe.deleted_at IS NULL)
     GROUP BY cv.id
  ),

  -- M3-1 : les réclamations de l'année, et leur délai.
  reclamations AS (
    SELECT t.commune_id,
           count(*) FILTER (WHERE t.status <> 'rejete') AS n,
           count(*) FILTER (WHERE t.status = 'resolu') AS resolues,
           count(*) FILTER (WHERE t.status = 'resolu' AND t.resolved_at IS NOT NULL
                              AND t.resolved_at - t.created_at <= make_interval(days => COALESCE(pc.delai_reclamation_jours, 7))) AS dans_delai,
           avg(extract(epoch FROM t.resolved_at - t.created_at) / 86400)
             FILTER (WHERE t.status = 'resolu' AND t.resolved_at IS NOT NULL) AS delai_moyen_j,
           max(COALESCE(pc.delai_reclamation_jours, 7)) AS delai
      FROM tickets t
      CROSS JOIN bornes b
      LEFT JOIN parametres_commune pc ON pc.commune_id = t.commune_id
     WHERE t.deleted_at IS NULL AND t.created_at::date BETWEEN b.debut AND b.fin
     GROUP BY t.commune_id
  ),

  -- M3-3 : les modules réellement utilisés dans l'année.
  usage AS (
    SELECT cv.id AS commune_id, cv.activee,
           EXISTS (SELECT 1 FROM points_collecte pt JOIN circuits ci ON ci.id = pt.circuit_id
                    WHERE pt.commune_id = cv.id AND pt.deleted_at IS NULL AND ci.deleted_at IS NULL) AS u_circuits,
           EXISTS (SELECT 1 FROM controles_terrain ct, bornes b WHERE ct.commune_id = cv.id AND ct.deleted_at IS NULL
                      AND ct.date_controle BETWEEN b.debut AND b.fin) AS u_controles,
           EXISTS (SELECT 1 FROM pesees pe, bornes b WHERE pe.commune_id = cv.id AND pe.deleted_at IS NULL
                      AND pe.date_pesee BETWEEN b.debut AND b.fin) AS u_pesees,
           EXISTS (SELECT 1 FROM tickets t, bornes b WHERE t.commune_id = cv.id AND t.deleted_at IS NULL AND t.status = 'resolu'
                      AND t.resolved_at::date BETWEEN b.debut AND b.fin) AS u_reclamations,
           EXISTS (SELECT 1 FROM presences pr, bornes b WHERE pr.commune_id = cv.id AND pr.jour BETWEEN b.debut AND b.fin) AS u_presences,
           EXISTS (SELECT 1 FROM vehicules v WHERE v.commune_id = cv.id AND v.deleted_at IS NULL) AS u_parc
      FROM communes_vues cv
  ),

  -- Tonnages : les pesées de l'année ; le ratio par habitant se rapporte aux
  -- seuls mois pesés, comme le coût à la tonne du module 6 — diviser les
  -- pesées d'un mois par une année entière le rendrait douze fois trop bas.
  pesees_an AS (
    SELECT pe.commune_id,
           sum(pe.poids_net_kg) AS kg,
           sum(pe.poids_net_kg) FILTER (WHERE pe.type_dechet IN ('tri', 'vert')) AS kg_separe,
           count(DISTINCT date_trunc('month', pe.date_pesee)) AS mois
      FROM pesees pe, bornes b
     WHERE pe.deleted_at IS NULL AND pe.date_pesee BETWEEN b.debut AND b.fin
     GROUP BY pe.commune_id
  ),
  jours_pesees AS (
    SELECT pe.commune_id,
           sum(LEAST((m + interval '1 month')::date - 1, b.fin) - m::date + 1) AS jours
      FROM (SELECT DISTINCT commune_id, date_trunc('month', date_pesee) AS m FROM pesees, bornes b
             WHERE deleted_at IS NULL AND date_pesee BETWEEN b.debut AND b.fin) pe, bornes b
     GROUP BY pe.commune_id
  ),

  -- Axe 4 et 5 : effectifs, masse salariale, maintenance, présences.
  effectifs AS (
    SELECT es.commune_id, sum(es.effectif_ouvriers) AS ouvriers, sum(es.effectif_encadrement) AS encadrement,
           sum(es.masse_salariale_tnd) AS masse
      FROM effectifs_service es
     WHERE es.annee = (SELECT annee FROM bornes) AND es.service = 'proprete'
     GROUP BY es.commune_id
  ),
  maintenance AS (
    SELECT im.commune_id, count(*) AS n, sum(im.cout_tnd) AS cout, count(im.cout_tnd) AS n_cout
      FROM interventions_maintenance im, bornes b
     WHERE im.deleted_at IS NULL AND im.date_intervention BETWEEN b.debut AND b.fin
     GROUP BY im.commune_id
  ),
  presences_an AS (
    SELECT pr.commune_id, count(*) AS n,
           count(*) FILTER (WHERE NOT pr.present AND COALESCE(pr.motif_absence, 'autre') NOT IN ('conge', 'repos', 'formation', 'detachement')) AS absences
      FROM presences pr, bornes b
     WHERE pr.jour BETWEEN b.debut AND b.fin
     GROUP BY pr.commune_id
  )

  -- Les indicateurs et la préparation DMA.
  SELECT c.commune_id, 'M1-2', round(100.0 * (c.faits + 0.5 * c.partiels) / c.n, 1),
         (c.faits + 0.5 * c.partiels)::numeric / c.n,
         jsonb_build_object('controles', c.n, 'faits', c.faits, 'partiels', c.partiels)
    FROM controles c JOIN communes_vues cv ON cv.id = c.commune_id WHERE c.n > 0
  UNION ALL
  SELECT u.commune_id, 'M1-3',
         round(100 * (CASE WHEN COALESCE(ca.publie, false) THEN 1 ELSE 0 END
                      + LEAST(COALESCE(i.n, 0), 4) / 4.0
                      + CASE WHEN COALESCE(co.n, 0) > 0 THEN 1 ELSE 0 END) / 3.0, 1),
         (CASE WHEN COALESCE(ca.publie, false) THEN 1 ELSE 0 END
          + LEAST(COALESCE(i.n, 0), 4) / 4.0
          + CASE WHEN COALESCE(co.n, 0) > 0 THEN 1 ELSE 0 END) / 3.0,
         jsonb_build_object('calendrier_publie', COALESCE(ca.publie, false), 'informations', COALESCE(i.n, 0),
                            'consultations', COALESCE(co.n, 0))
    FROM communication_utilisee u
    LEFT JOIN calendrier ca ON ca.commune_id = u.commune_id
    LEFT JOIN information i ON i.commune_id = u.commune_id
    LEFT JOIN consultation co ON co.commune_id = u.commune_id
  UNION ALL
  SELECT e.commune_id, 'M1-5', round(100.0 * e.traitees / e.n, 1), e.traitees::numeric / e.n,
         jsonb_build_object('demandes', e.n, 'traitees', e.traitees)
    FROM enlevements e JOIN communes_vues cv ON cv.id = e.commune_id WHERE e.n > 0
  UNION ALL
  SELECT m.commune_id, 'M1-7', round(100.0 * m.a_jour / m.n, 1), m.a_jour::numeric / m.n,
         jsonb_build_object('plans', m.n, 'a_jour', m.a_jour)
    FROM entretien m WHERE m.n > 0
  UNION ALL
  SELECT r.commune_id, 'M3-1', round(100.0 * r.resolues / r.n, 1),
         (r.resolues::numeric / r.n + CASE WHEN r.resolues > 0 THEN r.dans_delai::numeric / r.resolues ELSE 0 END) / 2,
         jsonb_build_object('reclamations', r.n, 'resolues', r.resolues, 'dans_delai', r.dans_delai,
                            'delai_jours', r.delai, 'delai_moyen_jours', round(r.delai_moyen_j, 1))
    FROM reclamations r JOIN communes_vues cv ON cv.id = r.commune_id WHERE r.n > 0
  UNION ALL
  SELECT u.commune_id, 'M3-3',
         round(100 * (u.u_circuits::int + u.u_controles::int + u.u_pesees::int + u.u_reclamations::int
                      + u.u_presences::int + u.u_parc::int) / 6.0, 1),
         (u.u_circuits::int + u.u_controles::int + u.u_pesees::int + u.u_reclamations::int
          + u.u_presences::int + u.u_parc::int) / 6.0,
         jsonb_build_object('circuits', u.u_circuits, 'controles', u.u_controles, 'pesees', u.u_pesees,
                            'reclamations', u.u_reclamations, 'presences', u.u_presences, 'parc', u.u_parc)
    -- Une commune qui n'a jamais rien saisi n'est pas « digitalisée à 0 % » :
    -- on ne sait rien de ses outils. La mesure attend un premier usage.
    FROM usage u
   WHERE u.activee AND (u.u_circuits OR u.u_controles OR u.u_pesees OR u.u_reclamations OR u.u_presences OR u.u_parc)
  UNION ALL
  SELECT p.commune_id, 'DMA-4', round(100 * COALESCE(p.kg_separe, 0) / p.kg, 1), COALESCE(p.kg_separe, 0) / p.kg,
         jsonb_build_object('kg', p.kg, 'kg_separe', COALESCE(p.kg_separe, 0))
    FROM pesees_an p JOIN communes_vues cv ON cv.id = p.commune_id WHERE p.kg > 0

  -- Les mesures qui nourrissent les axes sans être notées.
  UNION ALL
  SELECT p.commune_id, 'TONNAGE_T', round(p.kg / 1000, 3), NULL,
         jsonb_build_object('mois_peses', p.mois, 'jours_couverts', j.jours)
    FROM pesees_an p JOIN communes_vues cv ON cv.id = p.commune_id
    LEFT JOIN jours_pesees j ON j.commune_id = p.commune_id
   WHERE p.kg > 0
  UNION ALL
  SELECT p.commune_id, 'KG_HAB_J', round(p.kg / cv.population / j.jours, 3), NULL,
         jsonb_build_object('jours_couverts', j.jours, 'population', cv.population,
                            'source_population', cv.source_population)
    FROM pesees_an p JOIN communes_vues cv ON cv.id = p.commune_id JOIN jours_pesees j ON j.commune_id = p.commune_id
   WHERE p.kg > 0 AND cv.population > 0 AND j.jours > 0
  UNION ALL
  SELECT ca.commune_id, 'CIRCUITS', ca.circuits, NULL, '{}'::jsonb
    FROM calendrier ca JOIN communes_vues cv ON cv.id = ca.commune_id
  UNION ALL
  SELECT r.commune_id, 'RECLAMATIONS', r.n, NULL, '{}'::jsonb
    FROM reclamations r JOIN communes_vues cv ON cv.id = r.commune_id WHERE r.n > 0
  UNION ALL
  SELECT r.commune_id, 'DELAI_MOYEN_J', round(r.delai_moyen_j, 1), NULL, '{}'::jsonb
    FROM reclamations r JOIN communes_vues cv ON cv.id = r.commune_id WHERE r.delai_moyen_j IS NOT NULL
  UNION ALL
  SELECT e.commune_id, 'MASSE_SALARIALE', e.masse, NULL, '{}'::jsonb
    FROM effectifs e JOIN communes_vues cv ON cv.id = e.commune_id WHERE e.masse IS NOT NULL
  UNION ALL
  SELECT e.commune_id, 'EFFECTIF_OUVRIERS', e.ouvriers, NULL, '{}'::jsonb
    FROM effectifs e JOIN communes_vues cv ON cv.id = e.commune_id WHERE e.ouvriers IS NOT NULL
  UNION ALL
  SELECT e.commune_id, 'ENCADREMENT', round(e.encadrement::numeric / e.ouvriers, 3), NULL,
         jsonb_build_object('encadrement', e.encadrement, 'ouvriers', e.ouvriers)
    FROM effectifs e JOIN communes_vues cv ON cv.id = e.commune_id WHERE e.ouvriers > 0 AND e.encadrement IS NOT NULL
  UNION ALL
  -- Un coût de maintenance ne se donne que si CHAQUE intervention de l'année
  -- porte son coût : une somme de coûts partiels se lirait comme complète.
  SELECT m.commune_id, 'COUT_MAINTENANCE', m.cout, NULL, jsonb_build_object('interventions', m.n)
    FROM maintenance m JOIN communes_vues cv ON cv.id = m.commune_id WHERE m.n > 0 AND m.n_cout = m.n
  UNION ALL
  SELECT p.commune_id, 'ABSENTEISME', round(100.0 * p.absences / p.n, 1), NULL,
         jsonb_build_object('jours_saisis', p.n, 'absences', p.absences)
    FROM presences_an p JOIN communes_vues cv ON cv.id = p.commune_id WHERE p.n > 0
$$;

CREATE OR REPLACE FUNCTION app._mesures_kpi_auto_periode(p_debut date, p_fin date, p_communes text[])
  RETURNS TABLE (commune_id text, code text, valeur numeric, note numeric, detail jsonb)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
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

  -- M2-2 : les commerces sous convention active pendant la période.
  commerces_actifs AS (
    SELECT c.commune_id, count(*) AS cibles FROM commerces c WHERE c.deleted_at IS NULL AND c.actif GROUP BY c.commune_id
  ),
  conventionnes AS (
    SELECT cv.commune_id, count(DISTINCT cv.commerce_id) AS n
      FROM conventions_commerciales cv JOIN commerces c ON c.id = cv.commerce_id AND c.deleted_at IS NULL AND c.actif, bornes b
     WHERE cv.deleted_at IS NULL AND cv.date_debut <= b.fin AND (cv.date_fin IS NULL OR cv.date_fin >= b.debut)
     GROUP BY cv.commune_id
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
         jsonb_build_object('cible', ca.cibles)
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
$$;

REVOKE ALL ON FUNCTION app._mesures_kpi_periode(date, date, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION app._mesures_kpi_auto_periode(date, date, text[]) FROM PUBLIC;
COMMENT ON FUNCTION app._mesures_kpi_periode(date, date, text[]) IS
  'Interne (lot 3a) : les mesures des indicateurs calculés pour une période et des communes données, sans contrôle d''accès. Appelée par app.mesures_kpi, app.serie_indicateur et app.reference_gouvernorat.';
COMMENT ON FUNCTION app._mesures_kpi_auto_periode(date, date, text[]) IS
  'Interne (lot 3a) : les mesures automatiques des indicateurs déclarables (registres) pour une période et des communes données, sans contrôle d''accès.';

-- Les fonctions annuelles d'origine : même signature, mêmes colonnes, mêmes
-- communes (celles que l'appelant peut écrire), même fenêtre (l'année, jusqu'à
-- aujourd'hui pour l'année en cours).
CREATE OR REPLACE FUNCTION app.mesures_kpi(p_annee integer)
  RETURNS TABLE (commune_id text, code text, valeur numeric, note numeric, detail jsonb)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT * FROM app._mesures_kpi_periode(
    make_date(p_annee, 1, 1),
    LEAST(make_date(p_annee, 12, 31), (now() AT TIME ZONE 'Africa/Tunis')::date),
    ARRAY(SELECT c.id FROM communes c WHERE app.can_write_commune(c.id)))
$$;

CREATE OR REPLACE FUNCTION app.mesures_kpi_auto(p_annee integer)
  RETURNS TABLE (commune_id text, code text, valeur numeric, note numeric, detail jsonb)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT * FROM app._mesures_kpi_auto_periode(
    make_date(p_annee, 1, 1),
    LEAST(make_date(p_annee, 12, 31), (now() AT TIME ZONE 'Africa/Tunis')::date),
    ARRAY(SELECT c.id FROM communes c WHERE app.can_write_commune(c.id)))
$$;

GRANT EXECUTE ON FUNCTION app.mesures_kpi(integer) TO siipi_app;
GRANT EXECUTE ON FUNCTION app.mesures_kpi_auto(integer) TO siipi_app;

-- Les mêmes, pour des communes nommées : l'écran d'une commune n'a pas à
-- calculer les 350 communes que la FNCT peut lire pour n'en garder qu'une.
-- Le droit d'accès reste celui des fonctions annuelles (can_write_commune).
CREATE OR REPLACE FUNCTION app.mesures_kpi_communes(p_annee integer, p_communes text[])
  RETURNS TABLE (commune_id text, code text, valeur numeric, note numeric, detail jsonb)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT * FROM app._mesures_kpi_periode(
    make_date(p_annee, 1, 1),
    LEAST(make_date(p_annee, 12, 31), (now() AT TIME ZONE 'Africa/Tunis')::date),
    ARRAY(SELECT c.id FROM communes c WHERE c.id = ANY(p_communes) AND app.can_write_commune(c.id)))
$$;

CREATE OR REPLACE FUNCTION app.mesures_kpi_auto_communes(p_annee integer, p_communes text[])
  RETURNS TABLE (commune_id text, code text, valeur numeric, note numeric, detail jsonb)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT * FROM app._mesures_kpi_auto_periode(
    make_date(p_annee, 1, 1),
    LEAST(make_date(p_annee, 12, 31), (now() AT TIME ZONE 'Africa/Tunis')::date),
    ARRAY(SELECT c.id FROM communes c WHERE c.id = ANY(p_communes) AND app.can_write_commune(c.id)))
$$;

GRANT EXECUTE ON FUNCTION app.mesures_kpi_communes(integer, text[]) TO siipi_app;
GRANT EXECUTE ON FUNCTION app.mesures_kpi_auto_communes(integer, text[]) TO siipi_app;
COMMENT ON FUNCTION app.mesures_kpi_communes(integer, text[]) IS 'app.mesures_kpi restreinte aux communes nommées (lot 3a), même droit d''accès.';
COMMENT ON FUNCTION app.mesures_kpi_auto_communes(integer, text[]) IS 'app.mesures_kpi_auto restreinte aux communes nommées (lot 3a), même droit d''accès.';

-- ---------------------------------------------------------------------------
-- 2. Le catalogue : granularité et formule en arabe
-- ---------------------------------------------------------------------------

ALTER TABLE indicateurs_kpi ADD COLUMN IF NOT EXISTS granularite TEXT NOT NULL DEFAULT 'annuelle';
ALTER TABLE indicateurs_kpi DROP CONSTRAINT IF EXISTS indicateurs_kpi_granularite;
ALTER TABLE indicateurs_kpi ADD CONSTRAINT indicateurs_kpi_granularite CHECK (granularite IN ('mensuelle', 'annuelle', 'actuelle'));
ALTER TABLE indicateurs_kpi ADD COLUMN IF NOT EXISTS description_ar TEXT;

COMMENT ON COLUMN indicateurs_kpi.granularite IS
  'Le pas le plus fin auquel la valeur a un sens : « mensuelle » (registres datés), « annuelle » (effectifs, déclarations, états sans date), « actuelle » (un état d''aujourd''hui, qui ne se reporte pas sur les mois passés).';
COMMENT ON COLUMN indicateurs_kpi.description_ar IS 'La formule et les sources, en arabe (la colonne « description » les donne en français).';

UPDATE indicateurs_kpi SET granularite = 'mensuelle' WHERE code IN (
  'M1-1', 'M1-2', 'M1-5', 'M1-9', 'M2-3', 'M2-4', 'M2-5', 'M3-1', 'DMA-4',
  'TONNAGE_T', 'KG_HAB_J', 'RECLAMATIONS', 'DELAI_MOYEN_J', 'COUT_MAINTENANCE', 'ABSENTEISME',
  'ECO-CARBURANT', 'RH-ACCIDENTS');
UPDATE indicateurs_kpi SET granularite = 'actuelle' WHERE code IN ('M1-7', 'CIRCUITS');

UPDATE indicateurs_kpi k SET description_ar = v.texte FROM (VALUES
  ('M1-1', 'الأمتار الطولية المكنوسة يوميًا في وسط المدينة والطرقات الرئيسية، مقارنة بالهدف المحدد حسب حجم البلدية.'),
  ('M1-2', 'المراقبات الميدانية للفترة: المرور «المنجز» يُحتسب 1، و«الجزئي» نصفًا، و«غير المنجز» صفرًا. غير مُدخل دون أي مراقبة.'),
  ('M1-3', 'ثلاثة أثلاث: رزنامة جمع منشورة، وإعلام منتظم (إعلانات وإشعارات)، واستشارة (استطلاعات ومشاريع).'),
  ('M1-4', 'نسبة إنجاز برنامج إزالة الأعشاب وتنظيف المجاري.'),
  ('M1-5', 'طلبات رفع الفضلات الخضراء وفضلات البناء المعالجة (المنجزة أو الموجّهة إلى جامع مرخّص)، من مجموع الطلبات غير الملغاة.'),
  ('M1-6', 'العمال المتمتعون بمعدات وقاية فردية سارية، من مجموع عمال الميدان.'),
  ('M1-7', 'مخططات الصيانة غير المتأخرة، من مجموع المخططات القابلة للتقييم. غير مُدخل دون مخطط صيانة.'),
  ('M1-8', 'طريقة استغلال المصب النهائي حين تتصرف فيه البلدية، ومخطط الوقاية من الحرائق. لا ينطبق إذا كان المصب تحت إشراف الوكالة الوطنية للتصرف في النفايات.'),
  ('M1-9', 'نهايات المناوبة التي كانت فيها الشاحنة مغطاة أثناء النقل، من مجموع نهايات المناوبة المسجلة.'),
  ('M1-10', 'المشاريع المجددة والشراكات الدولية أو الجمعياتية من أجل استدامة الخدمة.'),
  ('M2-1', 'نظافة المساحات الخضراء والساحات وتجهيزها بالحاويات الصغيرة.'),
  ('M2-2', 'المؤسسات (محلات تجارية ومؤسسات عمومية) المشمولة باتفاقية نظافة، من مجموع المؤسسات المستهدفة.'),
  ('M2-3', 'عمليات تنظيف المقابر المنجزة، من مجموع العمليات المبرمجة التي حلّ أجلها.'),
  ('M2-4', 'عمليات تنظيف الأسواق البلدية المنجزة، من مجموع العمليات المبرمجة التي حلّ أجلها.'),
  ('M2-5', 'عمليات تنظيف المسالخ البلدية المنجزة، من مجموع العمليات المبرمجة التي حلّ أجلها. لا ينطبق دون مسلخ بلدي.'),
  ('M3-1', 'نصفان: الإبلاغات المعالجة (دون المرفوضة)، والمعالجة في الأجل الذي تحدده البلدية.'),
  ('M3-2', 'الأنشطة والمسابقات مع الشباب والكشافة والجمعيات المحلية، مقارنة بالهدف السنوي.'),
  ('M3-3', 'وحدات المنصة المستعملة فعليًا خلال السنة من أصل ستة: المسالك ونقاط التجميع، والمراقبة الميدانية، والوزن، ومعالجة الإبلاغات، والحضور، والحظيرة.'),
  ('M3-4', 'الاتفاقيات بين البلديات ولجان الأحياء الناشطة، مقارنة بالهدف.'),
  ('DMA-1', 'الحاويات المطابقة لألوان الأمر المرتقب (أخضر للعضوي، أزرق للجاف، أحمر للخطِر)، من مجموع الحاويات.'),
  ('DMA-2', 'القطاعات التي يُجرَّب فيها الجمع المنفصل، من مجموع قطاعات البلدية.'),
  ('DMA-3', 'حملات التحسيس بالفرز المنجزة خلال السنة، مقارنة بالهدف.'),
  ('DMA-4', 'أوزان «الفرز» و«الفضلات الخضراء»، من مجموع الأوزان. غير مُدخل دون وزن.'),
  ('RH-FORMATION', 'ساعات التكوين التي تابعها أعوان المصلحة خلال السنة.'),
  ('RH-ACCIDENTS', 'حوادث الشغل المسجلة. يُكتب الصفر صراحة: الخانة الفارغة تعني «غير مُدخل» لا «لا حادث».'),
  ('ECO-CARBURANT', 'مصاريف المحروقات لمصلحة النظافة.'),
  ('ECO-DECHARGE', 'المعاليم المدفوعة للإيداع بالمصب والتحويل والوزن.'),
  ('TONNAGE_T', 'مجموع الأوزان المسجلة خلال الفترة.'),
  ('KG_HAB_J', 'الكيلوغرامات الموزونة لكل ساكن في اليوم، منسوبة إلى الأشهر الموزونة فقط.'),
  ('CIRCUITS', 'مسالك الجمع المسجلة في المنصة.'),
  ('RECLAMATIONS', 'الإبلاغات الواردة خلال الفترة، دون المرفوضة.'),
  ('DELAI_MOYEN_J', 'متوسط المدة بين ورود الإبلاغ ومعالجته، للإبلاغات المعالجة.'),
  ('MASSE_SALARIALE', 'كتلة الأجور المصرّح بها لمصلحة النظافة (وحدة الأعوان).'),
  ('COUT_MAINTENANCE', 'مجموع كلفة تدخلات الصيانة. غير مُدخل إذا كان تدخل دون كلفة: مجموع جزئي سيُقرأ كأنه كامل.'),
  ('COUT_TONNE', 'كتلة الأجور والمحروقات والصيانة والمعاليم، منسوبة إلى أيام الوزن، مقسومة على الكمية الموزونة. غير مُدخل ما دام أحد هذه المكونات ناقصًا.'),
  ('EFFECTIF_OUVRIERS', 'عمال مصلحة النظافة المصرّح بهم للسنة.'),
  ('ENCADREMENT', 'أعوان التأطير لكل عامل.'),
  ('ABSENTEISME', 'الغيابات دون العطل والراحة والتكوين والإلحاق، من مجموع الأيام المسجلة في الحضور.')
) AS v(code, texte)
WHERE k.code = v.code;

-- ---------------------------------------------------------------------------
-- 3. Les sources de données et les dépendances de chaque indicateur
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sources_indicateurs (
    code        TEXT PRIMARY KEY,
    libelle_fr  TEXT NOT NULL,
    libelle_ar  TEXT NOT NULL,
    nature      TEXT NOT NULL,
    cible       TEXT,
    CONSTRAINT sources_indicateurs_nature CHECK (nature IN ('formulaire', 'ecran', 'parametre', 'declaration', 'citoyen', 'fnct'))
);
COMMENT ON TABLE sources_indicateurs IS
  'Les données dont dépendent les indicateurs (lot 3a). « nature » dit comment la compléter : un formulaire du registre d''ajout (cible = son type), un écran du portail (cible = l''écran), un paramètre de la commune, la déclaration elle-même, ou rien que la commune puisse saisir (les citoyens, la FNCT).';
COMMENT ON COLUMN sources_indicateurs.cible IS
  'Selon la nature : le type du formulaire d''ajout (web/src/composants/ajout/appels-creation.json), l''écran du portail communal, ou le paramètre de la commune.';

CREATE TABLE IF NOT EXISTS dependances_indicateurs (
    indicateur_code TEXT NOT NULL REFERENCES indicateurs_kpi(code),
    groupe          SMALLINT NOT NULL CHECK (groupe > 0),
    ordre           SMALLINT NOT NULL CHECK (ordre > 0),
    source          TEXT NOT NULL REFERENCES sources_indicateurs(code),
    declare_code    TEXT REFERENCES indicateurs_kpi(code),
    PRIMARY KEY (indicateur_code, groupe, ordre),
    CONSTRAINT dependances_declaration CHECK ((source = 'declaration') = (declare_code IS NOT NULL))
);
COMMENT ON TABLE dependances_indicateurs IS
  'Ce dont un indicateur a besoin pour se calculer (lot 3a). Les groupes s''additionnent (il faut chacun) ; dans un groupe, une seule source suffit (par exemple : le registre carburant, OU la déclaration de la dépense de carburant).';
COMMENT ON COLUMN dependances_indicateurs.declare_code IS 'Pour une source « declaration » : l''indicateur dont la déclaration suffit.';

ALTER TABLE sources_indicateurs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources_indicateurs FORCE ROW LEVEL SECURITY;
ALTER TABLE dependances_indicateurs ENABLE ROW LEVEL SECURITY;
ALTER TABLE dependances_indicateurs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sources_indicateurs_lecture ON sources_indicateurs;
CREATE POLICY sources_indicateurs_lecture ON sources_indicateurs FOR SELECT USING (app.is_authenticated());
DROP POLICY IF EXISTS dependances_indicateurs_lecture ON dependances_indicateurs;
CREATE POLICY dependances_indicateurs_lecture ON dependances_indicateurs FOR SELECT USING (app.is_authenticated());
GRANT SELECT ON sources_indicateurs, dependances_indicateurs TO siipi_app;
REVOKE INSERT, UPDATE, DELETE ON sources_indicateurs, dependances_indicateurs FROM siipi_app;

INSERT INTO sources_indicateurs (code, libelle_fr, libelle_ar, nature, cible) VALUES
  ('pesees', 'Pesées de la période', 'أوزان الفترة', 'ecran', 'pesees'),
  ('population', 'Population de la commune', 'عدد سكان البلدية', 'parametre', 'population'),
  ('controles', 'Contrôles terrain des circuits', 'المراقبة الميدانية للمسالك', 'ecran', 'constat'),
  ('communication', 'Un circuit, une annonce ou une publication', 'مسلك أو إعلان أو منشور', 'ecran', 'communication'),
  ('enlevements', 'Demandes d''enlèvement de déchets verts ou de démolition (des citoyens)', 'طلبات رفع الفضلات الخضراء أو فضلات البناء (من المواطنين)', 'citoyen', NULL),
  ('plans_entretien', 'Plans d''entretien des engins', 'مخططات صيانة المعدات', 'ecran', 'parc'),
  ('reclamations', 'Réclamations reçues dans la période (des citoyens)', 'الإبلاغات الواردة خلال الفترة (من المواطنين)', 'citoyen', NULL),
  ('reclamations_resolues', 'Réclamations résolues dans la période', 'الإبلاغات المعالجة خلال الفترة', 'ecran', 'reclamations'),
  ('activation', 'Commune activée sur la plateforme (par la FNCT)', 'تفعيل البلدية في المنصة (من الجامعة)', 'fnct', NULL),
  ('usage_numerique', 'Un module utilisé : circuits, contrôles, pesées, réclamations, pointage ou parc', 'استعمال وحدة واحدة على الأقل: المسالك أو المراقبة أو الوزن أو الإبلاغات أو الحضور أو الحظيرة', 'ecran', 'circuits'),
  ('masse_salariale', 'Masse salariale du service pour l''année', 'كتلة أجور المصلحة للسنة', 'ecran', 'personnel'),
  ('effectif_ouvriers', 'Effectif ouvrier du service pour l''année', 'عدد عمال المصلحة للسنة', 'ecran', 'personnel'),
  ('effectif_encadrement', 'Effectif d''encadrement pour l''année', 'عدد أعوان التأطير للسنة', 'ecran', 'personnel'),
  ('maintenance', 'Interventions d''entretien de la période, chacune avec son coût', 'تدخلات الصيانة خلال الفترة، كل منها بكلفته', 'ecran', 'parc'),
  ('presences', 'Pointage des agents', 'تسجيل حضور الأعوان', 'ecran', 'personnel'),
  ('balayage', 'Nettoyages terminés avec leurs mètres linéaires', 'عمليات التنظيف المنجزة بأمتارها الطولية', 'ecran', 'registres'),
  ('objectif_balayage', 'Objectif de balayage (mètres linéaires par jour)', 'هدف الكنس (متر طولي في اليوم)', 'parametre', 'objectif_balayage'),
  ('nettoyages_cimetieres', 'Nettoyages planifiés des cimetières', 'عمليات تنظيف المقابر المبرمجة', 'ecran', 'registres'),
  ('nettoyages_marches', 'Nettoyages planifiés des marchés', 'عمليات تنظيف الأسواق المبرمجة', 'ecran', 'registres'),
  ('nettoyages_abattoirs', 'Nettoyages planifiés des abattoirs', 'عمليات تنظيف المسالخ المبرمجة', 'ecran', 'registres'),
  ('fins_de_poste', 'Registre des fins de poste', 'سجل نهاية المناوبة', 'formulaire', 'fin-de-poste'),
  ('epi', 'Registre des dotations EPI', 'سجل التمكين من معدات الوقاية', 'formulaire', 'dotation-epi'),
  ('agents_terrain', 'Agents de terrain enregistrés', 'أعوان الميدان المسجلون', 'formulaire', 'agent'),
  ('commerces', 'Registre des commerces', 'سجل المحلات', 'formulaire', 'commerce'),
  ('carburant', 'Registre carburant (pleins)', 'سجل المحروقات (التزوّد)', 'formulaire', 'plein-carburant'),
  ('incidents', 'Journal des incidents du travail', 'سجل حوادث الشغل', 'formulaire', 'incident'),
  ('circuits', 'Circuits enregistrés', 'المسالك المسجلة', 'formulaire', 'circuit'),
  ('declaration', 'Déclaration de la commune', 'تصريح البلدية', 'declaration', NULL)
ON CONFLICT (code) DO UPDATE SET libelle_fr = EXCLUDED.libelle_fr, libelle_ar = EXCLUDED.libelle_ar,
                                 nature = EXCLUDED.nature, cible = EXCLUDED.cible;

DELETE FROM dependances_indicateurs;
INSERT INTO dependances_indicateurs (indicateur_code, groupe, ordre, source, declare_code) VALUES
  -- Les indicateurs déclarables mesurés par un registre : le registre, ou la déclaration.
  ('M1-1', 1, 1, 'balayage', NULL), ('M1-1', 1, 2, 'declaration', 'M1-1'),
  ('M1-1', 2, 1, 'objectif_balayage', NULL), ('M1-1', 2, 2, 'declaration', 'M1-1'),
  ('M1-6', 1, 1, 'epi', NULL), ('M1-6', 1, 2, 'declaration', 'M1-6'),
  ('M1-6', 2, 1, 'agents_terrain', NULL), ('M1-6', 2, 2, 'declaration', 'M1-6'),
  ('M1-9', 1, 1, 'fins_de_poste', NULL), ('M1-9', 1, 2, 'declaration', 'M1-9'),
  ('M2-2', 1, 1, 'commerces', NULL), ('M2-2', 1, 2, 'declaration', 'M2-2'),
  ('M2-3', 1, 1, 'nettoyages_cimetieres', NULL), ('M2-3', 1, 2, 'declaration', 'M2-3'),
  ('M2-4', 1, 1, 'nettoyages_marches', NULL), ('M2-4', 1, 2, 'declaration', 'M2-4'),
  ('M2-5', 1, 1, 'nettoyages_abattoirs', NULL), ('M2-5', 1, 2, 'declaration', 'M2-5'),
  ('ECO-CARBURANT', 1, 1, 'carburant', NULL), ('ECO-CARBURANT', 1, 2, 'declaration', 'ECO-CARBURANT'),
  ('RH-ACCIDENTS', 1, 1, 'incidents', NULL), ('RH-ACCIDENTS', 1, 2, 'declaration', 'RH-ACCIDENTS'),
  -- Les indicateurs seulement déclarés.
  ('M1-4', 1, 1, 'declaration', 'M1-4'), ('M1-8', 1, 1, 'declaration', 'M1-8'),
  ('M1-10', 1, 1, 'declaration', 'M1-10'), ('M2-1', 1, 1, 'declaration', 'M2-1'),
  ('M3-2', 1, 1, 'declaration', 'M3-2'), ('M3-4', 1, 1, 'declaration', 'M3-4'),
  ('DMA-1', 1, 1, 'declaration', 'DMA-1'), ('DMA-2', 1, 1, 'declaration', 'DMA-2'),
  ('DMA-3', 1, 1, 'declaration', 'DMA-3'),
  ('RH-FORMATION', 1, 1, 'declaration', 'RH-FORMATION'), ('ECO-DECHARGE', 1, 1, 'declaration', 'ECO-DECHARGE'),
  -- Les indicateurs calculés : leurs données sources, jamais le résultat.
  ('M1-2', 1, 1, 'controles', NULL),
  ('M1-3', 1, 1, 'communication', NULL),
  ('M1-5', 1, 1, 'enlevements', NULL),
  ('M1-7', 1, 1, 'plans_entretien', NULL),
  ('M3-1', 1, 1, 'reclamations', NULL),
  ('M3-3', 1, 1, 'activation', NULL), ('M3-3', 2, 1, 'usage_numerique', NULL),
  ('DMA-4', 1, 1, 'pesees', NULL),
  ('TONNAGE_T', 1, 1, 'pesees', NULL),
  ('KG_HAB_J', 1, 1, 'pesees', NULL), ('KG_HAB_J', 2, 1, 'population', NULL),
  ('CIRCUITS', 1, 1, 'circuits', NULL),
  ('RECLAMATIONS', 1, 1, 'reclamations', NULL),
  ('DELAI_MOYEN_J', 1, 1, 'reclamations_resolues', NULL),
  ('MASSE_SALARIALE', 1, 1, 'masse_salariale', NULL),
  ('EFFECTIF_OUVRIERS', 1, 1, 'effectif_ouvriers', NULL),
  ('ENCADREMENT', 1, 1, 'effectif_ouvriers', NULL), ('ENCADREMENT', 2, 1, 'effectif_encadrement', NULL),
  ('COUT_MAINTENANCE', 1, 1, 'maintenance', NULL),
  ('ABSENTEISME', 1, 1, 'presences', NULL),
  -- Le coût global à la tonne (SPEC § 3.2) : pesées, masse salariale, carburant
  -- (registre ou déclaration), maintenance, redevances (déclarées).
  ('COUT_TONNE', 1, 1, 'pesees', NULL),
  ('COUT_TONNE', 2, 1, 'masse_salariale', NULL),
  ('COUT_TONNE', 3, 1, 'carburant', NULL), ('COUT_TONNE', 3, 2, 'declaration', 'ECO-CARBURANT'),
  ('COUT_TONNE', 4, 1, 'maintenance', NULL),
  ('COUT_TONNE', 5, 1, 'declaration', 'ECO-DECHARGE');

-- Le seuil du repère de gouvernorat (SPEC § 6, décideur : la FNCT).
INSERT INTO parametres_kpi (cle, valeur, libelle) VALUES
  ('seuil_reference_gouvernorat', 5, 'Nombre de communes du gouvernorat qui doivent avoir une valeur pour que leur moyenne s''affiche en repère sur les graphiques (aucune commune n''y est nommée).')
ON CONFLICT (cle) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Une source est-elle tenue ? (interne)
-- ---------------------------------------------------------------------------
--
-- Chaque condition reprend celle du calcul (_mesures_kpi_periode,
-- _mesures_kpi_auto_periode) : la campagne « series-indicateurs » vérifie que
-- « non renseigné » et « il manque quelque chose » vont toujours ensemble.

CREATE OR REPLACE FUNCTION app.source_tenue(p_commune text, p_source text, p_debut date, p_fin date, p_declare text DEFAULT NULL)
  RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$fn$
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
    WHEN 'commerces' THEN EXISTS (SELECT 1 FROM commerces c WHERE c.commune_id = p_commune AND c.deleted_at IS NULL AND c.actif)
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
$fn$;
REVOKE ALL ON FUNCTION app.source_tenue(text, text, date, date, text) FROM PUBLIC;
COMMENT ON FUNCTION app.source_tenue(text, text, date, date, text) IS
  'Interne (lot 3a) : la source de données est-elle tenue par la commune sur la période ? Les conditions reprennent celles du calcul des indicateurs.';

-- ---------------------------------------------------------------------------
-- 5. Ce qui manque à un indicateur
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS app.manques_indicateur(text, text, date, date);
CREATE FUNCTION app.manques_indicateur(p_commune text, p_code text, p_debut date, p_fin date)
  RETURNS TABLE (groupe smallint, ordre smallint, source text, nature text, cible text, declare_code text,
                 libelle_fr text, libelle_ar text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  -- Un indicateur « sans objet » pour la commune ne manque de rien.
  WITH profil AS (
    SELECT (p_code = 'M1-8' AND pc.decharge_controlee_anged IS TRUE)
        OR (p_code = 'M2-5' AND pc.a_abattoir IS FALSE) AS sans_objet
      FROM (SELECT 1) un LEFT JOIN parametres_commune pc ON pc.commune_id = p_commune
  )
  SELECT d.groupe, d.ordre, s.code, s.nature,
         CASE WHEN s.nature = 'declaration' THEN d.declare_code ELSE s.cible END,
         d.declare_code,
         CASE WHEN s.nature = 'declaration' THEN s.libelle_fr || ' : ' || k.libelle_fr ELSE s.libelle_fr END,
         CASE WHEN s.nature = 'declaration' THEN s.libelle_ar || ': ' || k.libelle_ar ELSE s.libelle_ar END
    FROM dependances_indicateurs d
    JOIN sources_indicateurs s ON s.code = d.source
    LEFT JOIN indicateurs_kpi k ON k.code = d.declare_code
   WHERE d.indicateur_code = p_code
     AND app.can_read_commune(p_commune)
     AND NOT (SELECT sans_objet FROM profil)
     -- Un groupe manque quand AUCUNE de ses sources n'est tenue.
     AND NOT EXISTS (SELECT 1 FROM dependances_indicateurs d2
                      WHERE d2.indicateur_code = d.indicateur_code AND d2.groupe = d.groupe
                        AND app.source_tenue(p_commune, d2.source, p_debut, p_fin, d2.declare_code))
   ORDER BY d.groupe, d.ordre
$$;
GRANT EXECUTE ON FUNCTION app.manques_indicateur(text, text, date, date) TO siipi_app;
COMMENT ON FUNCTION app.manques_indicateur(text, text, date, date) IS
  'Ce qui manque à un indicateur pour se calculer sur la période (SPEC refonte § 3.2) : un élément par source, groupés (il faut chaque groupe ; une source du groupe suffit), avec le formulaire, l''écran ou le paramètre qui la complète. Rien pour un indicateur calculable ou sans objet.';

-- ---------------------------------------------------------------------------
-- 6. La série d'un indicateur
-- ---------------------------------------------------------------------------

-- Interne : la série pour une liste de communes. Une ligne par commune et par
-- période qui a une valeur ; aucune sinon. La mesure prime sur la déclaration.
CREATE OR REPLACE FUNCTION app._serie(p_communes text[], p_code text, p_debut date, p_fin date, p_pas text)
  RETURNS TABLE (commune_id text, periode_debut date, periode_fin date, valeur numeric, note numeric, source text, detail jsonb)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  WITH ind AS (SELECT * FROM indicateurs_kpi WHERE code = p_code),
  aujourdhui AS (SELECT (now() AT TIME ZONE 'Africa/Tunis')::date AS j),
  -- Les périodes entières (un mois, une année), jusqu'à aujourd'hui : une année
  -- n'est pas tronquée à la borne demandée, sans quoi ses effectifs (annuels)
  -- disparaîtraient.
  periodes AS (
    SELECT d::date AS debut,
           LEAST((d + CASE p_pas WHEN 'mois' THEN interval '1 month' ELSE interval '1 year' END)::date - 1, a.j) AS fin
      FROM aujourdhui a,
           generate_series(date_trunc(CASE p_pas WHEN 'mois' THEN 'month' ELSE 'year' END, p_debut::timestamp),
                           p_fin::timestamp,
                           CASE p_pas WHEN 'mois' THEN interval '1 month' ELSE interval '1 year' END) d
     WHERE d::date <= a.j
  ),
  mesures AS (
    SELECT pe.debut, pe.fin, m.commune_id, m.valeur, m.note, m.detail
      FROM periodes pe CROSS JOIN ind CROSS JOIN aujourdhui a
      CROSS JOIN LATERAL (
        SELECT * FROM app._mesures_kpi_periode(pe.debut, pe.fin, p_communes)
        UNION ALL
        SELECT * FROM app._mesures_kpi_auto_periode(pe.debut, pe.fin, p_communes)
      ) m
     WHERE m.code = p_code
       -- Une valeur annuelle ne se découpe pas en mois ; un état d'aujourd'hui
       -- ne se reporte pas sur les périodes passées.
       AND (p_pas = 'annee' OR ind.granularite = 'mensuelle')
       AND (ind.granularite <> 'actuelle' OR a.j BETWEEN pe.debut AND pe.fin)
  ),
  declarees AS (
    SELECT pe.debut, pe.fin, d.commune_id, d.valeur, d.cible, ind.saisie
      FROM periodes pe CROSS JOIN ind
      JOIN declarations_indicateurs d
        ON d.indicateur_code = p_code AND d.commune_id = ANY(p_communes) AND d.deleted_at IS NULL
       AND d.annee = extract(year FROM pe.debut)
       AND (CASE p_pas WHEN 'mois' THEN d.mois = extract(month FROM pe.debut) ELSE d.mois IS NULL END)
  )
  SELECT m.commune_id, m.debut, m.fin, m.valeur, m.note, 'mesure', m.detail FROM mesures m
  UNION ALL
  SELECT d.commune_id, d.debut, d.fin, d.valeur,
         CASE d.saisie WHEN 'ratio' THEN LEAST(1, d.valeur / NULLIF(d.cible, 0)) WHEN 'taux' THEN d.valeur / 100 END,
         'declare', jsonb_build_object('cible', d.cible)
    FROM declarees d
   WHERE NOT EXISTS (SELECT 1 FROM mesures m WHERE m.commune_id = d.commune_id AND m.debut = d.debut)
$$;
REVOKE ALL ON FUNCTION app._serie(text[], text, date, date, text) FROM PUBLIC;

-- Les contrôles communs à la série et au repère : ils lèvent une erreur
-- codée, que la route traduit en 400.
CREATE OR REPLACE FUNCTION app._controler_serie(p_code text, p_debut date, p_fin date, p_pas text) RETURNS void
  LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS
$fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM indicateurs_kpi WHERE code = p_code) THEN
    RAISE EXCEPTION 'SERIE_INDICATEUR: indicateur inconnu : %.', p_code;
  END IF;
  IF p_pas IS NULL OR p_pas NOT IN ('mois', 'annee') THEN
    RAISE EXCEPTION 'SERIE_PAS: le pas est « mois » ou « annee ».';
  END IF;
  IF p_debut IS NULL OR p_fin IS NULL OR p_debut > p_fin THEN
    RAISE EXCEPTION 'SERIE_BORNES: le début doit précéder la fin.';
  END IF;
  IF (p_pas = 'mois' AND p_fin > (p_debut + interval '36 months')::date)
     OR (p_pas = 'annee' AND p_fin > (p_debut + interval '10 years')::date) THEN
    RAISE EXCEPTION 'SERIE_ETENDUE: une série couvre au plus 36 mois, ou 10 ans.';
  END IF;
END;
$fn$;
REVOKE ALL ON FUNCTION app._controler_serie(text, date, date, text) FROM PUBLIC;

DROP FUNCTION IF EXISTS app.serie_indicateur(text, text, date, date, text);
CREATE FUNCTION app.serie_indicateur(p_commune text, p_code text, p_debut date, p_fin date, p_pas text)
  RETURNS TABLE (periode_debut date, periode_fin date, valeur numeric, note numeric, source text, detail jsonb)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$fn$
BEGIN
  PERFORM app._controler_serie(p_code, p_debut, p_fin, p_pas);
  -- Une commune que l'appelant ne lit pas n'a pas de série (la route répond 404).
  IF NOT app.can_read_commune(p_commune) THEN RETURN; END IF;
  RETURN QUERY
    SELECT s.periode_debut, s.periode_fin, s.valeur, s.note, s.source, s.detail
      FROM app._serie(ARRAY[p_commune], p_code, p_debut, p_fin, p_pas) s
     ORDER BY s.periode_debut;
END;
$fn$;
GRANT EXECUTE ON FUNCTION app.serie_indicateur(text, text, date, date, text) TO siipi_app;
COMMENT ON FUNCTION app.serie_indicateur(text, text, date, date, text) IS
  'La série d''un indicateur pour une commune (SPEC refonte § 3.1) : une ligne par période (mois ou année) qui a une valeur, aucune sinon — un mois sans donnée est un trou, jamais un zéro. La source dit « mesure » ou « declare ».';

-- ---------------------------------------------------------------------------
-- 7. Le repère du gouvernorat
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS app.reference_gouvernorat(text, text, date, date, text);
CREATE FUNCTION app.reference_gouvernorat(p_commune text, p_code text, p_debut date, p_fin date, p_pas text)
  RETURNS TABLE (periode_debut date, periode_fin date, moyenne numeric, communes integer)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$fn$
DECLARE
  v_seuil integer := COALESCE((SELECT valeur FROM parametres_kpi WHERE cle = 'seuil_reference_gouvernorat'), 5)::int;
BEGIN
  PERFORM app._controler_serie(p_code, p_debut, p_fin, p_pas);
  IF NOT app.can_read_commune(p_commune) THEN RETURN; END IF;
  -- La moyenne des communes RÉELLES du gouvernorat qui ont une valeur ; rien
  -- en dessous du seuil. Aucune commune n'est nommée : seule la moyenne et le
  -- nombre de communes sortent de cette fonction.
  RETURN QUERY
    SELECT s.periode_debut, s.periode_fin, round(avg(s.valeur), 3), count(*)::int
      FROM app._serie(ARRAY(SELECT c.id FROM communes c JOIN communes moi ON moi.id = p_commune
                             WHERE c.gouvernorat = moi.gouvernorat AND c.deleted_at IS NULL AND NOT c.est_demo),
                      p_code, p_debut, p_fin, p_pas) s
     GROUP BY s.periode_debut, s.periode_fin
    HAVING count(*) >= v_seuil
     ORDER BY s.periode_debut;
END;
$fn$;
GRANT EXECUTE ON FUNCTION app.reference_gouvernorat(text, text, date, date, text) TO siipi_app;
COMMENT ON FUNCTION app.reference_gouvernorat(text, text, date, date, text) IS
  'Le repère du gouvernorat sur le graphique d''un indicateur (SPEC refonte § 3.3) : par période, la moyenne des communes du gouvernorat qui ont une valeur, seulement si elles sont au moins parametres_kpi.seuil_reference_gouvernorat (5). Ne nomme aucune commune.';
