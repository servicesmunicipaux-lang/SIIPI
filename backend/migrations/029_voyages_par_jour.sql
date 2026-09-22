-- ============================================================================
-- 029_voyages_par_jour.sql
--
-- Conséquence directe du registre de Dar Chaabane : six circuits sur huit font
-- DEUX voyages par jour. Le registre des passages en connaissait un seul —
-- « declarations_une_par_jour », « controles_un_par_jour ».
--
-- Ce que cela produisait, si on n'y touchait pas : un prestataire qui vide sa
-- remorque deux fois dans la journée n'aurait pu déclarer qu'un passage sur
-- deux, et le tableau contractuel l'aurait affiché à 50 % de service rendu en
-- faisant intégralement son travail. C'est le défaut de la migration 026 dans
-- l'autre sens — là une faute inventée, ici un travail effacé — et il se
-- corrige avant d'avoir produit un seul chiffre, parce que les données de la
-- commune l'ont annoncé.
--
-- Le voyage devient donc une dimension du passage. Un circuit à un seul voyage
-- — le cas par défaut, et celui des deux bennes tasseuses — garde exactement
-- le comportement d'avant : voyage = 1, une ligne par jour.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Le voyage entre dans les deux registres
-- ---------------------------------------------------------------------------

ALTER TABLE declarations_passage
  ADD COLUMN IF NOT EXISTS voyage SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE controles_terrain
  ADD COLUMN IF NOT EXISTS voyage SMALLINT NOT NULL DEFAULT 1;

ALTER TABLE declarations_passage DROP CONSTRAINT IF EXISTS declarations_voyage_valide;
ALTER TABLE declarations_passage ADD  CONSTRAINT declarations_voyage_valide
  CHECK (voyage BETWEEN 1 AND 6);
ALTER TABLE controles_terrain DROP CONSTRAINT IF EXISTS controles_voyage_valide;
ALTER TABLE controles_terrain ADD  CONSTRAINT controles_voyage_valide
  CHECK (voyage BETWEEN 1 AND 6);

-- L'unicité porte désormais sur le voyage, pas sur la journée. Les index
-- d'origine portent des noms qui affirmaient « un par jour » : on les remplace
-- plutôt que d'en ajouter à côté, pour qu'aucune lecture du schéma ne laisse
-- croire à la règle ancienne.
-- Ce sont des CONTRAINTES d'unicité, pas de simples index : elles se retirent
-- par ALTER TABLE, et un DROP INDEX échouerait.
ALTER TABLE declarations_passage DROP CONSTRAINT IF EXISTS declarations_une_par_jour;
DROP INDEX IF EXISTS declarations_une_par_jour;
ALTER TABLE declarations_passage DROP CONSTRAINT IF EXISTS declarations_une_par_voyage;
ALTER TABLE declarations_passage ADD  CONSTRAINT declarations_une_par_voyage
  UNIQUE (circuit_id, date_passage, voyage);

ALTER TABLE controles_terrain DROP CONSTRAINT IF EXISTS controles_un_par_jour;
DROP INDEX IF EXISTS controles_un_par_jour;
ALTER TABLE controles_terrain DROP CONSTRAINT IF EXISTS controles_un_par_voyage;
ALTER TABLE controles_terrain ADD  CONSTRAINT controles_un_par_voyage
  UNIQUE (circuit_id, date_controle, voyage);

COMMENT ON COLUMN declarations_passage.voyage IS
  'Rang de la rotation dans la journée (1 = premier voyage). Un circuit à voyage unique garde toujours 1.';
COMMENT ON COLUMN controles_terrain.voyage IS
  'Rang de la rotation contrôlée. Le constat porte sur un voyage, pas sur la journée : un premier voyage fait et un second manqué ne sont pas « une journée partielle ».';

-- ---------------------------------------------------------------------------
-- 2. La confrontation attend un passage PAR VOYAGE
--
-- Deux bornes se cumulent maintenant : la période de service du circuit
-- (migration 026) et le nombre de rotations quotidiennes. Le reste de la
-- qualification — silence, non déclaré, non contrôlé, concordant, divergent —
-- est inchangé.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS app.confrontation_passages(text, date, date);

CREATE FUNCTION app.confrontation_passages(
    p_commune text DEFAULT NULL,
    p_depuis  date DEFAULT (CURRENT_DATE - 30),
    p_jusqua  date DEFAULT CURRENT_DATE
  )
  RETURNS TABLE (
    circuit_id        uuid,
    circuit_nom       text,
    commune_id        text,
    prestataire_nom   text,
    jour              date,
    voyage            smallint,
    voyages_attendus  smallint,
    declaration       text,
    constat           text,
    incident          text,
    situation         text,
    mode_saisie       text,
    position_source   text
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  WITH circuits_vus AS (
    SELECT c.*, u.full_name AS prestataire_nom
      FROM circuits c
      LEFT JOIN users u ON u.id = c.prestataire_id
     WHERE c.deleted_at IS NULL
       AND c.actif
       AND (p_commune IS NULL OR c.commune_id = p_commune)
       AND (app.is_fnct()
            OR app.can_write_commune(c.commune_id)
            OR c.prestataire_id = app.current_user_id())
  ),
  attendus AS (
    SELECT cv.id, cv.nom, cv.commune_id, cv.prestataire_nom,
           j.jour::date AS jour,
           v.voyage::smallint AS voyage,
           cv.voyages_par_jour
      FROM circuits_vus cv
      CROSS JOIN generate_series(
             GREATEST(p_depuis, cv.date_debut),
             LEAST(p_jusqua, COALESCE(cv.date_fin, p_jusqua)),
             interval '1 day') AS j(jour)
      CROSS JOIN generate_series(1, cv.voyages_par_jour) AS v(voyage)
     WHERE EXTRACT(ISODOW FROM j.jour)::smallint = ANY (cv.jours_passage)
  )
  SELECT
    a.id, a.nom, a.commune_id, a.prestataire_nom, a.jour, a.voyage, a.voyages_par_jour,
    d.statut, ct.etat, i.type,
    CASE
      WHEN d.statut IS NULL AND ct.etat IS NULL THEN 'silence'
      WHEN d.statut IS NULL                     THEN 'non_declare'
      WHEN ct.etat  IS NULL                     THEN 'non_controle'
      WHEN (d.statut = 'effectue'   AND ct.etat = 'fait')
        OR (d.statut = 'partiel'    AND ct.etat = 'partiel')
        OR (d.statut = 'impossible' AND ct.etat = 'non_fait') THEN 'concordant'
      ELSE 'divergent'
    END,
    d.mode_saisie, d.position_source
  FROM attendus a
  LEFT JOIN declarations_passage d
         ON d.circuit_id = a.id AND d.date_passage = a.jour
        AND d.voyage = a.voyage AND d.deleted_at IS NULL
  LEFT JOIN controles_terrain ct
         ON ct.circuit_id = a.id AND ct.date_controle = a.jour
        AND ct.voyage = a.voyage AND ct.deleted_at IS NULL
  LEFT JOIN LATERAL (
    SELECT x.type FROM incidents x
     WHERE x.circuit_id = a.id AND x.date_incident = a.jour AND x.deleted_at IS NULL
     ORDER BY x.created_at LIMIT 1
  ) i ON true
  ORDER BY a.jour DESC, a.nom, a.voyage;
$$;

COMMENT ON FUNCTION app.confrontation_passages(text, date, date) IS
  'Met face à face le registre du prestataire et le constat de la commune, voyage par voyage et dans la période de service du circuit.';

GRANT EXECUTE ON FUNCTION app.confrontation_passages(text, date, date) TO siipi_app;

-- ---------------------------------------------------------------------------
-- 3. La performance contractuelle compte les mêmes voyages
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.performance_prestataires(
    p_commune text DEFAULT NULL,
    p_depuis  date DEFAULT (CURRENT_DATE - 30),
    p_jusqua  date DEFAULT CURRENT_DATE
  )
  RETURNS TABLE (
    prestataire_id        uuid,
    prestataire_nom       text,
    commune_id            text,
    circuits              bigint,
    passages_attendus     bigint,
    controles_saisis      bigint,
    controles_fait        bigint,
    controles_partiel     bigint,
    controles_non_fait    bigint,
    taux_realisation      double precision,
    taux_couverture       double precision,
    reclamations_transferees bigint,
    reclamations_traitees    bigint,
    delai_moyen_heures       double precision
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  WITH circuits_vus AS (
    SELECT c.*
      FROM circuits c
     WHERE c.deleted_at IS NULL
       AND c.actif
       AND c.prestataire_id IS NOT NULL
       AND (p_commune IS NULL OR c.commune_id = p_commune)
       AND (app.is_fnct()
            OR app.can_write_commune(c.commune_id)
            OR c.prestataire_id = app.current_user_id())
  ),
  attendus AS (
    SELECT cv.id AS circuit_id,
           count(*) * cv.voyages_par_jour AS passages
      FROM circuits_vus cv
      CROSS JOIN generate_series(
             GREATEST(p_depuis, cv.date_debut),
             LEAST(p_jusqua, COALESCE(cv.date_fin, p_jusqua)),
             interval '1 day') AS j(jour)
     WHERE EXTRACT(ISODOW FROM j.jour)::smallint = ANY (cv.jours_passage)
     GROUP BY cv.id, cv.voyages_par_jour
  ),
  constats AS (
    SELECT ct.circuit_id,
           count(*)                                        AS saisis,
           count(*) FILTER (WHERE ct.etat = 'fait')        AS fait,
           count(*) FILTER (WHERE ct.etat = 'partiel')     AS partiel,
           count(*) FILTER (WHERE ct.etat = 'non_fait')    AS non_fait
      FROM controles_terrain ct
     WHERE ct.deleted_at IS NULL
       AND ct.date_controle BETWEEN p_depuis AND p_jusqua
     GROUP BY ct.circuit_id
  ),
  reclamations AS (
    SELECT t.assigned_prestataire_id AS prestataire,
           count(*)                                          AS transferees,
           count(*) FILTER (WHERE t.status = 'resolu')        AS traitees,
           avg(EXTRACT(EPOCH FROM (t.resolved_at - t.accepted_at)) / 3600.0)
             FILTER (WHERE t.resolved_at IS NOT NULL)         AS delai_h
      FROM tickets t
     WHERE t.deleted_at IS NULL
       AND t.assigned_prestataire_id IS NOT NULL
       AND t.created_at::date BETWEEN p_depuis AND p_jusqua
     GROUP BY t.assigned_prestataire_id
  )
  SELECT
    cv.prestataire_id,
    u.full_name,
    cv.commune_id,
    count(DISTINCT cv.id)::bigint,
    COALESCE(sum(a.passages), 0)::bigint,
    COALESCE(sum(co.saisis), 0)::bigint,
    COALESCE(sum(co.fait), 0)::bigint,
    COALESCE(sum(co.partiel), 0)::bigint,
    COALESCE(sum(co.non_fait), 0)::bigint,
    CASE WHEN COALESCE(sum(co.saisis), 0) = 0 THEN NULL
         ELSE round(((COALESCE(sum(co.fait), 0) + 0.5 * COALESCE(sum(co.partiel), 0))
                     / sum(co.saisis)::numeric) * 100, 1)::double precision END,
    CASE WHEN COALESCE(sum(a.passages), 0) = 0 THEN NULL
         ELSE round((LEAST(COALESCE(sum(co.saisis), 0), sum(a.passages))
                     / sum(a.passages)::numeric) * 100, 1)::double precision END,
    COALESCE(max(r.transferees), 0)::bigint,
    COALESCE(max(r.traitees), 0)::bigint,
    round(max(r.delai_h)::numeric, 1)::double precision
  FROM circuits_vus cv
  JOIN users u          ON u.id = cv.prestataire_id
  LEFT JOIN attendus a  ON a.circuit_id = cv.id
  LEFT JOIN constats co ON co.circuit_id = cv.id
  LEFT JOIN reclamations r ON r.prestataire = cv.prestataire_id
  GROUP BY cv.prestataire_id, u.full_name, cv.commune_id
  ORDER BY u.full_name;
$$;

GRANT EXECUTE ON FUNCTION app.performance_prestataires(text, date, date) TO siipi_app;
