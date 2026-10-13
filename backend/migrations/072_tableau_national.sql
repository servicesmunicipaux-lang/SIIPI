-- =========================================================================
-- 072 — Le tableau de bord national (refonte, lot 4a ;
-- docs/specs_metier/SPEC_refonte_indicateurs_saisie.md § 4).
--
-- 1. CE QU'EST UNE SAISIE DE LA COMMUNE (app._saisies_communales). Une écriture
--    de la commune elle-même (son directeur, ou le prestataire qui travaille
--    pour elle), une pesée qu'elle enregistre, un pointage de ses agents. Pas
--    une écriture de la FNCT sur la fiche de la commune (qualifier sa
--    provenance n'est pas utiliser la plateforme), pas une réclamation d'un
--    citoyen, pas un script d'administration. Jusqu'ici, « active » comptait
--    toute écriture au journal d'audit — FNCT comprise — et ignorait les
--    pesées du module 6, que ce journal ne voit pas.
--
-- 2. LE DÉPLOIEMENT MOIS PAR MOIS (app.activite_communes) : pour chaque mois et
--    chaque commune réelle, si elle est activée, si elle a déjà commencé à
--    saisir, et combien de saisies dans le mois. La commune de démonstration
--    et les communes retirées n'y sont pas. L'activation est celle
--    d'aujourd'hui : la base n'en garde pas l'historique comme une donnée.
--
-- 3. UN TONNAGE ESTIMÉ NE S'ADDITIONNE JAMAIS À UN TONNAGE PESÉ.
--    app.tableau_gouvernorats additionnait les tonnages de référence de toutes
--    les communes, qu'ils soient estimés, déclarés ou mesurés. Il les donne
--    désormais séparément, et le tonnage PESÉ (pesées réelles des douze
--    derniers mois) à part, avec le nombre de communes derrière chacun.
--
-- 4. LES CONTOURS DES GOUVERNORATS (app.contours_gouvernorats), dissous à partir
--    des communes : la carte nationale n'a pas d'autre source.
-- =========================================================================

-- ---------------------------------------------------------------------------
-- 1. Les saisies de la commune (interne)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app._saisies_communales()
  RETURNS TABLE (commune_id text, quand timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT a.commune_id, a.changed_at
    FROM audit_log a
   WHERE a.commune_id IS NOT NULL
     AND a.changed_by_role IN ('admin_commune', 'gestionnaire_prestataire')
  UNION ALL
  -- Les pesées du module 6 ne passent pas par le journal d'audit.
  SELECT p.commune_id, p.created_at
    FROM pesees p JOIN users u ON u.id = p.saisi_par
   WHERE p.deleted_at IS NULL AND p.provenance = 'reel'
     AND u.role IN ('admin_commune', 'gestionnaire_prestataire')
  UNION ALL
  SELECT pr.commune_id, pr.created_at
    FROM presences pr JOIN users u ON u.id = pr.saisi_par
   WHERE u.role IN ('admin_commune', 'gestionnaire_prestataire')
$$;
REVOKE ALL ON FUNCTION app._saisies_communales() FROM PUBLIC;
COMMENT ON FUNCTION app._saisies_communales() IS
  'Interne (lot 4a) : les saisies faites par la commune elle-même (directeur ou prestataire) — écritures au journal, pesées réelles, pointages. Ni la FNCT, ni les citoyens, ni les scripts.';

-- Le statut d'une commune repose sur la même définition. Corps repris de la
-- migration 065, à la source de l'activité près.
CREATE OR REPLACE FUNCTION app.statut_communes()
 RETURNS TABLE(commune_id text, statut text, derniere_activite timestamp with time zone, ecritures_30j bigint, a_des_pesees boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH activite AS (
    SELECT s.commune_id,
           max(s.quand) AS derniere,
           count(*) FILTER (WHERE s.quand > now() - interval '30 days') AS recentes
      FROM app._saisies_communales() s
     GROUP BY s.commune_id
  ),
  pesees AS (
    SELECT p.commune_id, true AS presentes
      FROM pesees_anged p
     WHERE p.deleted_at IS NULL
     GROUP BY p.commune_id
  )
  SELECT c.id,
         CASE
           WHEN NOT c.activee                                    THEN 'desactivee'
           WHEN a.derniere IS NOT NULL OR p.presentes             THEN 'active'
           ELSE 'incomplete'
         END,
         a.derniere,
         COALESCE(a.recentes, 0),
         COALESCE(p.presentes, false)
    FROM communes c
    LEFT JOIN activite a ON a.commune_id = c.id
    LEFT JOIN pesees   p ON p.commune_id = c.id
   -- La commune de démonstration n'est pas déployée : elle n'existe pas.
   -- Une commune retirée du référentiel (065) non plus.
   WHERE NOT c.est_demo AND c.deleted_at IS NULL;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Le déploiement, mois par mois (FNCT)
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS app.activite_communes(date, date);
CREATE FUNCTION app.activite_communes(p_debut date, p_fin date)
  RETURNS TABLE (mois date, commune_id text, gouvernorat text, district text, activee boolean,
                 premiere_saisie date, saisies bigint)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$fn$
BEGIN
  IF p_debut IS NULL OR p_fin IS NULL OR p_debut > p_fin THEN
    RAISE EXCEPTION 'ACTIVITE_BORNES: le début doit précéder la fin.';
  END IF;
  IF p_fin > (p_debut + interval '24 months')::date THEN
    RAISE EXCEPTION 'ACTIVITE_ETENDUE: le suivi du déploiement couvre au plus 24 mois.';
  END IF;
  -- Le détail par commune est réservé à la FNCT (la route le dit aussi).
  IF NOT app.is_fnct() THEN RETURN; END IF;
  RETURN QUERY
    WITH s AS (
      SELECT x.commune_id, (x.quand AT TIME ZONE 'Africa/Tunis')::date AS jour FROM app._saisies_communales() x
    ),
    premiere AS (SELECT s.commune_id, min(s.jour) AS jour FROM s GROUP BY s.commune_id),
    les_mois AS (
      SELECT m::date AS m FROM generate_series(date_trunc('month', p_debut::timestamp), p_fin::timestamp, interval '1 month') m
    ),
    par_mois AS (
      SELECT s.commune_id, date_trunc('month', s.jour)::date AS m, count(*) AS n
        FROM s
       WHERE s.jour BETWEEN date_trunc('month', p_debut::timestamp)::date AND p_fin
       GROUP BY 1, 2
    )
    SELECT lm.m, c.id, c.gouvernorat, gd.district_code, c.activee, pr.jour, COALESCE(pm.n, 0)
      FROM les_mois lm
      CROSS JOIN communes c
      LEFT JOIN gouvernorats_district gd ON gd.gouvernorat = c.gouvernorat
      LEFT JOIN premiere pr ON pr.commune_id = c.id
      LEFT JOIN par_mois pm ON pm.commune_id = c.id AND pm.m = lm.m
     WHERE NOT c.est_demo AND c.deleted_at IS NULL
     ORDER BY lm.m, c.id;
END;
$fn$;
GRANT EXECUTE ON FUNCTION app.activite_communes(date, date) TO siipi_app;
COMMENT ON FUNCTION app.activite_communes(date, date) IS
  'Le déploiement mois par mois (lot 4a, FNCT seule) : pour chaque commune réelle, son activation (d''aujourd''hui), sa première saisie et ses saisies du mois. Ni la commune de démonstration, ni les communes retirées.';

-- ---------------------------------------------------------------------------
-- 3. Le tableau par gouvernorat : les tonnages, chacun à sa place
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS app.tableau_gouvernorats();
CREATE FUNCTION app.tableau_gouvernorats()
  RETURNS TABLE (
    gouvernorat                text,
    communes                   bigint,
    communes_actives           bigint,
    communes_incompletes       bigint,
    communes_desactivees       bigint,
    population                 bigint,
    tonnage_jour_estime        double precision,
    tonnage_jour_declare       double precision,
    tonnage_jour_mesure        double precision,
    tonnage_pese_12m_t         double precision,
    communes_pesees            bigint,
    taux_collecte              double precision,
    indice_proprete            double precision,
    pcgd_valides               bigint,
    reclamations_ouvertes      bigint,
    reclamations_30j           bigint,
    delai_traitement_jours     double precision,
    communes_donnees_mesurees  bigint,
    communes_donnees_declarees bigint,
    communes_donnees_estimees  bigint,
    derniere_activite          timestamptz
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  WITH statuts AS (SELECT * FROM app.statut_communes()),
  reclamations AS (
    SELECT t.commune_id,
           count(*) FILTER (WHERE t.status IN ('recu', 'en_cours', 'assigne')) AS ouvertes,
           count(*) FILTER (WHERE t.created_at > now() - interval '30 days')   AS recentes,
           avg(EXTRACT(EPOCH FROM (t.resolved_at - t.created_at)) / 86400.0)
             FILTER (WHERE t.resolved_at IS NOT NULL)                          AS delai_jours
      FROM tickets t
     WHERE t.deleted_at IS NULL
     GROUP BY t.commune_id
  ),
  -- Le tonnage PESÉ : les pesées réelles des douze derniers mois, en tonnes.
  pese AS (
    SELECT p.commune_id, sum(p.poids_net_kg) / 1000.0 AS tonnes
      FROM pesees p
     WHERE p.deleted_at IS NULL AND p.provenance = 'reel'
       AND p.date_pesee > (now() AT TIME ZONE 'Africa/Tunis')::date - interval '12 months'
     GROUP BY p.commune_id
  )
  SELECT
    c.gouvernorat,
    count(*),
    count(*) FILTER (WHERE s.statut = 'active'),
    count(*) FILTER (WHERE s.statut = 'incomplete'),
    count(*) FILTER (WHERE s.statut = 'desactivee'),
    sum(c.population)::bigint,
    -- Chaque provenance à part : NULL quand aucune commune n'en relève.
    round((sum(c.waste_tons_per_day) FILTER (WHERE c.donnees_source = 'estime'))::numeric, 1)::double precision,
    round((sum(c.waste_tons_per_day) FILTER (WHERE c.donnees_source = 'declare'))::numeric, 1)::double precision,
    round((sum(c.waste_tons_per_day) FILTER (WHERE c.donnees_source = 'mesure'))::numeric, 1)::double precision,
    round((sum(pe.tonnes))::numeric, 3)::double precision,
    count(pe.tonnes),
    round((sum(c.collection_rate * c.population)
           / NULLIF(sum(c.population), 0))::numeric, 1)::double precision,
    round((sum(c.cleanliness_index * c.population)
           / NULLIF(sum(c.population), 0))::numeric, 1)::double precision,
    count(*) FILTER (WHERE c.pcgd_status = 'valide'),
    COALESCE(sum(r.ouvertes), 0)::bigint,
    COALESCE(sum(r.recentes), 0)::bigint,
    round(avg(r.delai_jours)::numeric, 1)::double precision,
    count(*) FILTER (WHERE c.donnees_source = 'mesure'),
    count(*) FILTER (WHERE c.donnees_source = 'declare'),
    count(*) FILTER (WHERE c.donnees_source = 'estime'),
    max(s.derniere_activite)
  FROM communes c
  JOIN statuts s ON s.commune_id = c.id
  LEFT JOIN reclamations r ON r.commune_id = c.id
  LEFT JOIN pese pe ON pe.commune_id = c.id
  GROUP BY c.gouvernorat
  ORDER BY c.gouvernorat;
$$;
GRANT EXECUTE ON FUNCTION app.tableau_gouvernorats() TO siipi_app;
COMMENT ON FUNCTION app.tableau_gouvernorats() IS
  'Tableau de bord national par gouvernorat (lot 4a). Les tonnages de référence sont donnés par provenance (estimé, déclaré, mesuré) et le tonnage pesé à part : un tonnage estimé ne s''additionne jamais à un tonnage pesé. Moyennes pondérées par la population, en double précision.';

-- ---------------------------------------------------------------------------
-- 4. Les contours des gouvernorats
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS app.contours_gouvernorats(double precision);
CREATE FUNCTION app.contours_gouvernorats(p_tolerance double precision DEFAULT 0.005)
  RETURNS TABLE (gouvernorat text, communes bigint, geojson text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT c.gouvernorat, count(*),
         ST_AsGeoJSON(ST_SimplifyPreserveTopology(ST_Union(ST_MakeValid(c.boundary_geom)),
                                                  LEAST(GREATEST(COALESCE(p_tolerance, 0.005), 0), 0.05)), 5)
    FROM communes c
   WHERE c.deleted_at IS NULL AND NOT c.est_demo AND c.boundary_geom IS NOT NULL
   GROUP BY c.gouvernorat
   ORDER BY c.gouvernorat
$$;
GRANT EXECUTE ON FUNCTION app.contours_gouvernorats(double precision) TO siipi_app;
COMMENT ON FUNCTION app.contours_gouvernorats(double precision) IS
  'Les contours des gouvernorats, dissous à partir des communes réelles (lot 4a) : la carte nationale. Quelques secondes de calcul — l''API les garde en mémoire tant que le découpage ne change pas.';
