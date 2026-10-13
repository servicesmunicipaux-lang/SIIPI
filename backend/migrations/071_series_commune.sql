-- =========================================================================
-- 071 — Toutes les séries mensuelles d'une commune, en un passage (refonte,
-- lot 3b ; SPEC_refonte_indicateurs_saisie.md § 3.3).
--
-- L'écran des indicateurs montre, sur chaque carte, une petite courbe de douze
-- mois. Demander les dix-neuf séries une à une recalculerait chaque mois dix-
-- neuf fois. app.series_commune calcule chaque mois une seule fois, pour tous
-- les indicateurs de granularité mensuelle, avec les mêmes règles que
-- app.serie_indicateur (migration 070) : une ligne par mois qui a une valeur,
-- aucune sinon ; la mesure prime sur la déclaration mensuelle.
-- =========================================================================

CREATE OR REPLACE FUNCTION app._series_mensuelles(p_communes text[], p_debut date, p_fin date)
  RETURNS TABLE (commune_id text, code text, periode_debut date, periode_fin date, valeur numeric, note numeric, source text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  WITH aujourdhui AS (SELECT (now() AT TIME ZONE 'Africa/Tunis')::date AS j),
  periodes AS (
    SELECT d::date AS debut, LEAST((d + interval '1 month')::date - 1, a.j) AS fin
      FROM aujourdhui a,
           generate_series(date_trunc('month', p_debut::timestamp), p_fin::timestamp, interval '1 month') d
     WHERE d::date <= a.j
  ),
  mensuels AS (SELECT code, saisie FROM indicateurs_kpi WHERE granularite = 'mensuelle'),
  mesures AS (
    SELECT m.commune_id, m.code, pe.debut, pe.fin, m.valeur, m.note
      FROM periodes pe
      CROSS JOIN LATERAL (
        SELECT * FROM app._mesures_kpi_periode(pe.debut, pe.fin, p_communes)
        UNION ALL
        SELECT * FROM app._mesures_kpi_auto_periode(pe.debut, pe.fin, p_communes)
      ) m
      JOIN mensuels k ON k.code = m.code
  ),
  -- Les déclarations mensuelles, de tout indicateur : une commune qui déclare
  -- par mois a une série mensuelle, quelle que soit la granularité du calcul.
  declarees AS (
    SELECT d.commune_id, d.indicateur_code AS code, pe.debut, pe.fin, d.valeur,
           CASE k.saisie WHEN 'ratio' THEN LEAST(1, d.valeur / NULLIF(d.cible, 0)) WHEN 'taux' THEN d.valeur / 100 END AS note
      FROM periodes pe
      JOIN declarations_indicateurs d
        ON d.commune_id = ANY(p_communes) AND d.deleted_at IS NULL
       AND d.annee = extract(year FROM pe.debut) AND d.mois = extract(month FROM pe.debut)
      JOIN indicateurs_kpi k ON k.code = d.indicateur_code
  )
  SELECT m.commune_id, m.code, m.debut, m.fin, m.valeur, m.note, 'mesure' FROM mesures m
  UNION ALL
  SELECT d.commune_id, d.code, d.debut, d.fin, d.valeur, d.note, 'declare' FROM declarees d
   WHERE NOT EXISTS (SELECT 1 FROM mesures m WHERE m.commune_id = d.commune_id AND m.code = d.code AND m.debut = d.debut)
$$;
REVOKE ALL ON FUNCTION app._series_mensuelles(text[], date, date) FROM PUBLIC;

DROP FUNCTION IF EXISTS app.series_commune(text, date, date);
CREATE FUNCTION app.series_commune(p_commune text, p_debut date, p_fin date)
  RETURNS TABLE (code text, periode_debut date, periode_fin date, valeur numeric, note numeric, source text)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$fn$
BEGIN
  IF p_debut IS NULL OR p_fin IS NULL OR p_debut > p_fin THEN
    RAISE EXCEPTION 'SERIE_BORNES: le début doit précéder la fin.';
  END IF;
  IF p_fin > (p_debut + interval '24 months')::date THEN
    RAISE EXCEPTION 'SERIE_ETENDUE: les séries d''une commune couvrent au plus 24 mois.';
  END IF;
  IF NOT app.can_read_commune(p_commune) THEN RETURN; END IF;
  RETURN QUERY
    SELECT s.code, s.periode_debut, s.periode_fin, s.valeur, s.note, s.source
      FROM app._series_mensuelles(ARRAY[p_commune], p_debut, p_fin) s
     ORDER BY s.code, s.periode_debut;
END;
$fn$;
GRANT EXECUTE ON FUNCTION app.series_commune(text, date, date) TO siipi_app;
COMMENT ON FUNCTION app.series_commune(text, date, date) IS
  'Les séries mensuelles de tous les indicateurs d''une commune (refonte, lot 3b) : les petites courbes des cartes. Mêmes règles que app.serie_indicateur — un mois sans donnée n''a pas de ligne — en calculant chaque mois une seule fois. Au plus 24 mois.';
