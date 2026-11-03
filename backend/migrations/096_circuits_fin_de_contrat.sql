-- =========================================================================
-- 096 — Un contrat échu ne donne plus ses circuits.
-- Suite de la v0.15.87 (095), relevée par sa relecture adversariale.
--
-- La 095 a fait passer par app.mes_communes() les droits qu'un prestataire tient
-- d'une réclamation transférée ou d'un secteur confié : un contrat échu
-- (utilisateur_communes, au jour de Tunis) n'en donne plus rien. Restaient ceux
-- qu'il tient d'un CIRCUIT confié (circuits.prestataire_id), ouverts depuis que
-- la migration 022 permet de confier un circuit à un prestataire rattaché en
-- second : après la fin du contrat, il lisait encore le circuit, ses points, ses
-- constats et ses déclarations, en écrivait de nouvelles, et le retrouvait dans
-- la confrontation et la performance. Le même gardien s'applique ici :
--   - app.mes_circuits(), qui porte les politiques des points et des
--     déclarations de passage ;
--   - circuits_select et controles_select, qui lisaient prestataire_id
--     directement ;
--   - incidents_select et incidents_update, qui laissaient l'auteur d'un
--     incident le lire et le modifier sans condition de périmètre ;
--   - app.confrontation_passages() et app.performance_prestataires(), qui
--     choisissent leurs circuits elles-mêmes (SECURITY DEFINER).
-- Rien n'est retiré à la commune ni à la FNCT : seule la branche du prestataire
-- (ou de l'auteur) gagne la condition « commune de son périmètre ».
-- =========================================================================

CREATE OR REPLACE FUNCTION app.mes_circuits() RETURNS uuid[]
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$ SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
     FROM circuits
    WHERE prestataire_id = app.current_user_id()
      AND deleted_at IS NULL
      AND commune_id = ANY (app.mes_communes()) $$;

COMMENT ON FUNCTION app.mes_circuits() IS
  'Les circuits confiés au prestataire connecté, dans les seules communes de son périmètre (app.mes_communes) : un contrat échu ne donne plus ses circuits (096).';

DROP POLICY IF EXISTS circuits_select ON circuits;
CREATE POLICY circuits_select ON circuits FOR SELECT
  USING (
    deleted_at IS NULL
    AND (
      app.can_write_commune(commune_id)
      OR (app.current_role_name() = 'gestionnaire_prestataire'
          AND prestataire_id = app.current_user_id()
          AND commune_id = ANY (app.mes_communes()))
    )
  );

DROP POLICY IF EXISTS controles_select ON controles_terrain;
CREATE POLICY controles_select ON controles_terrain FOR SELECT
  USING (
    deleted_at IS NULL
    AND (
      app.can_write_commune(commune_id)
      OR (app.current_role_name() = 'gestionnaire_prestataire'
          AND circuit_id = ANY (app.mes_circuits()))
    )
  );

-- L'auteur d'un incident (déclare_par) le lisait et le modifiait sans condition :
-- un prestataire, mais aussi un directeur, gardait la main sur les incidents
-- d'une commune qu'il ne sert plus.
DROP POLICY IF EXISTS incidents_select ON incidents;
CREATE POLICY incidents_select ON incidents FOR SELECT
  USING (
    deleted_at IS NULL
    AND (app.can_read_commune(commune_id)
         OR (declare_par = app.current_user_id() AND commune_id = ANY (app.mes_communes())))
  );

DROP POLICY IF EXISTS incidents_update ON incidents;
CREATE POLICY incidents_update ON incidents FOR UPDATE
  USING (
    deleted_at IS NULL
    AND (app.can_write_commune(commune_id)
         OR (declare_par = app.current_user_id() AND commune_id = ANY (app.mes_communes())))
  )
  WITH CHECK (
    app.can_write_commune(commune_id)
    OR (declare_par = app.current_user_id() AND commune_id = ANY (app.mes_communes()))
  );

-- Les deux fonctions suivantes sont reprises telles que la base les tient (029),
-- leur branche « prestataire » seule changée.

CREATE OR REPLACE FUNCTION app.confrontation_passages(p_commune text DEFAULT NULL::text, p_depuis date DEFAULT (CURRENT_DATE - 30), p_jusqua date DEFAULT CURRENT_DATE)
 RETURNS TABLE(circuit_id uuid, circuit_nom text, commune_id text, prestataire_nom text, jour date, voyage smallint, voyages_attendus smallint, declaration text, constat text, incident text, situation text, mode_saisie text, position_source text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH circuits_vus AS (
    SELECT c.*, u.full_name AS prestataire_nom
      FROM circuits c
      LEFT JOIN users u ON u.id = c.prestataire_id
     WHERE c.deleted_at IS NULL
       AND c.actif
       AND (p_commune IS NULL OR c.commune_id = p_commune)
       AND (app.is_fnct()
            OR app.can_write_commune(c.commune_id)
            OR (c.prestataire_id = app.current_user_id()
                AND c.commune_id = ANY (app.mes_communes())))
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
$function$
;

CREATE OR REPLACE FUNCTION app.performance_prestataires(p_commune text DEFAULT NULL::text, p_depuis date DEFAULT (CURRENT_DATE - 30), p_jusqua date DEFAULT CURRENT_DATE)
 RETURNS TABLE(prestataire_id uuid, prestataire_nom text, commune_id text, circuits bigint, passages_attendus bigint, controles_saisis bigint, controles_fait bigint, controles_partiel bigint, controles_non_fait bigint, taux_realisation double precision, taux_couverture double precision, reclamations_transferees bigint, reclamations_traitees bigint, delai_moyen_heures double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH circuits_vus AS (
    SELECT c.*
      FROM circuits c
     WHERE c.deleted_at IS NULL
       AND c.actif
       AND c.prestataire_id IS NOT NULL
       AND (p_commune IS NULL OR c.commune_id = p_commune)
       AND (app.is_fnct()
            OR app.can_write_commune(c.commune_id)
            OR (c.prestataire_id = app.current_user_id()
                AND c.commune_id = ANY (app.mes_communes())))
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
$function$
;
