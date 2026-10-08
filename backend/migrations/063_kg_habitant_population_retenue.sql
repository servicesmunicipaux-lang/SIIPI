-- =========================================================================
-- 063 — Un kilo par habitant, pas deux (correctif v0.15.12).
--
-- Le lot 17.1 (migration 061) a donné à la commune une population permanente
-- RETENUE, avec sa source. L'écran des pesées l'utilise ; la fiche des cinq
-- axes (app.mesures_kpi, migration 050) divisait encore par le recensement.
-- Deux écrans, deux kilos par habitant pour la même commune : celui des axes
-- prend désormais la population retenue (déclarée, sinon recensement), et le
-- détail de la mesure dit laquelle.
--
-- Corps repris tel quel de la migration 050, à ces deux endroits près
-- (`communes_vues`, détail de KG_HAB_J). Le type de retour ne change pas.
-- =========================================================================

CREATE OR REPLACE FUNCTION app.mesures_kpi(p_annee integer)
  RETURNS TABLE (commune_id text, code text, valeur numeric, note numeric, detail jsonb)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  WITH bornes AS (
    SELECT make_date(p_annee, 1, 1) AS debut,
           LEAST(make_date(p_annee, 12, 31), (now() AT TIME ZONE 'Africa/Tunis')::date) AS fin
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
     WHERE app.can_write_commune(c.id)
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
     WHERE es.annee = p_annee AND es.service = 'proprete'
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

  -- Les indicateurs notés du Concours et de la préparation DMA.
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
  SELECT p.commune_id, 'TONNAGE_T', round(p.kg / 1000, 3), NULL, jsonb_build_object('mois_peses', p.mois)
    FROM pesees_an p JOIN communes_vues cv ON cv.id = p.commune_id WHERE p.kg > 0
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

COMMENT ON FUNCTION app.mesures_kpi(integer) IS
  'Ce que SIIPI mesure lui-même pour une année, commune par commune (celles que l''appelant peut lire). Une mesure dont la source n''existe pas n''a pas de ligne : jamais un zéro par défaut. KG_HAB_J divise par la population retenue (déclarée au lot 17.1, sinon recensement) ; le détail dit laquelle.';

GRANT EXECUTE ON FUNCTION app.mesures_kpi(integer) TO siipi_app;
