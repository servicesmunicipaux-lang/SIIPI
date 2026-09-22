-- ============================================================================
-- 018_types_numeriques.sql
--
-- Les indicateurs du tableau de bord national sortent en NUMERIC, un type que
-- le pilote PostgreSQL transmet sous forme de CHAÎNE pour ne pas perdre de
-- précision. Le contrat d'API les annonce pourtant comme des nombres, et le
-- front-end typé les traite comme tels : « 87.1 » arrivait donc en texte, se
-- triait dans l'ordre alphabétique et se concaténait au lieu de s'additionner.
--
-- La migration 016 avait déjà réglé le cas des entiers 64 bits côté client.
-- Ici le problème est réglé à la source : les indicateurs calculés sortent en
-- double précision, qui traverse JSON comme un nombre. Les colonnes NUMERIC
-- des tables ne sont pas touchées — un montant en dinars reste un NUMERIC.
-- ============================================================================

DROP FUNCTION IF EXISTS app.tableau_gouvernorats();

CREATE FUNCTION app.tableau_gouvernorats()
  RETURNS TABLE (
    gouvernorat               text,
    communes                  bigint,
    communes_actives          bigint,
    communes_incompletes      bigint,
    communes_desactivees      bigint,
    population                bigint,
    tonnage_jour              double precision,
    production_kg_hab_jour    double precision,
    taux_collecte             double precision,
    indice_proprete           double precision,
    pcgd_valides              bigint,
    reclamations_ouvertes     bigint,
    reclamations_30j          bigint,
    delai_traitement_jours    double precision,
    communes_donnees_mesurees bigint,
    communes_donnees_estimees bigint,
    derniere_activite         timestamptz
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
  )
  SELECT
    c.gouvernorat,
    count(*),
    count(*) FILTER (WHERE s.statut = 'active'),
    count(*) FILTER (WHERE s.statut = 'incomplete'),
    count(*) FILTER (WHERE s.statut = 'desactivee'),
    sum(c.population)::bigint,
    round(sum(c.waste_tons_per_day)::numeric, 1)::double precision,
    round((sum(c.waste_tons_per_day) * 1000
           / NULLIF(sum(c.population), 0))::numeric, 3)::double precision,
    round((sum(c.collection_rate * c.population)
           / NULLIF(sum(c.population), 0))::numeric, 1)::double precision,
    round((sum(c.cleanliness_index * c.population)
           / NULLIF(sum(c.population), 0))::numeric, 1)::double precision,
    count(*) FILTER (WHERE c.pcgd_status = 'valide'),
    COALESCE(sum(r.ouvertes), 0)::bigint,
    COALESCE(sum(r.recentes), 0)::bigint,
    round(avg(r.delai_jours)::numeric, 1)::double precision,
    count(*) FILTER (WHERE c.donnees_source = 'mesure'),
    count(*) FILTER (WHERE c.donnees_source = 'estime'),
    max(s.derniere_activite)
  FROM communes c
  JOIN statuts s ON s.commune_id = c.id
  LEFT JOIN reclamations r ON r.commune_id = c.id
  GROUP BY c.gouvernorat
  ORDER BY c.gouvernorat;
$$;

COMMENT ON FUNCTION app.tableau_gouvernorats() IS
  'Tableau de bord national par gouvernorat. Moyennes pondérées par la population, indicateurs en double précision pour traverser JSON comme des nombres.';

GRANT EXECUTE ON FUNCTION app.tableau_gouvernorats() TO siipi_app;
