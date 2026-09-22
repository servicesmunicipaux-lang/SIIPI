-- ============================================================================
-- 026_periode_validite_circuits.sql
--
-- Deux défauts découverts en testant réellement l'espace prestataire, et non
-- en relisant le code : ils ne se voient qu'une fois un premier circuit créé.
--
-- 1. UN CIRCUIT CRÉÉ AUJOURD'HUI ARRIVAIT AVEC UN PASSIF.
--    « Mon dossier » confrontait le registre du prestataire aux jours de
--    passage prévus sur les 30 derniers jours — sans se demander si le
--    circuit existait à ces dates. Le circuit « Centre-ville Houmt Souk »,
--    créé le 16 septembre, affichait aussitôt 14 passages « à déclarer »
--    remontant au 17 août. Un outil censé arbitrer un désaccord contractuel
--    ne peut pas fabriquer lui-même la faute qu'il prétend constater : au
--    premier regard du prestataire, il perd toute autorité.
--
--    On pose donc la période de validité du circuit. date_debut est la date à
--    partir de laquelle le circuit est dû — au départ celle de sa création,
--    rectifiable par la commune quand elle saisit après coup un circuit qui
--    tourne depuis des mois. date_fin clôt un circuit sans l'effacer : une
--    tournée qui s'arrête en fin de contrat cesse d'être attendue, et les
--    passages déjà constatés restent lisibles.
--
-- 2. UN PRESTATAIRE VOYAIT LES CIRCUITS QU'IL N'EXPLOITE PAS.
--    confrontation_passages admettait « app.can_read_commune », qui inclut le
--    gestionnaire prestataire pour toute commune où il est sous contrat. Le
--    prestataire de Houmt Souk se voyait donc imputer les circuits de la
--    régie communale. Double défaut : cloisonnement (il lit l'organisation
--    interne de la commune) et imputation (on lui compte des manquements qui
--    ne le concernent pas). La commune voit tous ses circuits ; le
--    prestataire, les siens.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Période de validité
-- ---------------------------------------------------------------------------

ALTER TABLE circuits ADD COLUMN IF NOT EXISTS date_debut DATE;
ALTER TABLE circuits ADD COLUMN IF NOT EXISTS date_fin   DATE;

-- Rattrapage des circuits déjà saisis : ils ne sont dus qu'à partir du jour où
-- ils ont été enregistrés. Rien avant, faute de savoir quoi que ce soit avant.
UPDATE circuits SET date_debut = created_at::date WHERE date_debut IS NULL;

ALTER TABLE circuits ALTER COLUMN date_debut SET DEFAULT CURRENT_DATE;
ALTER TABLE circuits ALTER COLUMN date_debut SET NOT NULL;

ALTER TABLE circuits DROP CONSTRAINT IF EXISTS circuits_periode_coherente;
ALTER TABLE circuits ADD  CONSTRAINT circuits_periode_coherente
  CHECK (date_fin IS NULL OR date_fin >= date_debut);

COMMENT ON COLUMN circuits.date_debut IS
  'Date à partir de laquelle le circuit est dû. Aucun passage n''est attendu avant : un circuit saisi aujourd''hui ne crée pas de manquements rétroactifs.';
COMMENT ON COLUMN circuits.date_fin IS
  'Date de fin de service, NULL si le circuit court toujours. Clôt les attentes sans effacer l''historique constaté.';

-- ---------------------------------------------------------------------------
-- 2. La confrontation : période de validité + cloisonnement du prestataire
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.confrontation_passages(
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
       -- La commune voit tous ses circuits, le prestataire uniquement ceux
       -- qui lui sont confiés. On n'emploie PAS app.can_read_commune ici :
       -- elle ouvrirait au prestataire les circuits de la régie communale et
       -- des confrères, et lui imputerait leurs passages.
       AND (app.is_fnct()
            OR app.can_write_commune(c.commune_id)
            OR c.prestataire_id = app.current_user_id())
  ),
  attendus AS (
    SELECT cv.id, cv.nom, cv.commune_id, cv.prestataire_nom, j.jour::date AS jour
      FROM circuits_vus cv
      CROSS JOIN generate_series(
             GREATEST(p_depuis, cv.date_debut),
             LEAST(p_jusqua, COALESCE(cv.date_fin, p_jusqua)),
             interval '1 day') AS j(jour)
     WHERE EXTRACT(ISODOW FROM j.jour)::smallint = ANY (cv.jours_passage)
  )
  SELECT
    a.id, a.nom, a.commune_id, a.prestataire_nom, a.jour,
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
         ON d.circuit_id = a.id AND d.date_passage = a.jour AND d.deleted_at IS NULL
  LEFT JOIN controles_terrain ct
         ON ct.circuit_id = a.id AND ct.date_controle = a.jour AND ct.deleted_at IS NULL
  LEFT JOIN LATERAL (
    SELECT x.type FROM incidents x
     WHERE x.circuit_id = a.id AND x.date_incident = a.jour AND x.deleted_at IS NULL
     ORDER BY x.created_at LIMIT 1
  ) i ON true
  ORDER BY a.jour DESC, a.nom;
$$;

GRANT EXECUTE ON FUNCTION app.confrontation_passages(text, date, date) TO siipi_app;

-- ---------------------------------------------------------------------------
-- 3. La performance contractuelle : même période, et multi-commune
--
-- Deux corrections de même famille. La période de validité d'abord : sans
-- elle, le taux de réalisation d'un circuit récent est écrasé par des
-- passages jamais dus. Le multi-commune ensuite : la fonction testait
-- « c.commune_id = app.current_commune() », c'est-à-dire la seule commune
-- principale ; un directeur rattaché à deux communes n'en voyait qu'une.
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
           count(*) AS passages
      FROM circuits_vus cv
      CROSS JOIN generate_series(
             GREATEST(p_depuis, cv.date_debut),
             LEAST(p_jusqua, COALESCE(cv.date_fin, p_jusqua)),
             interval '1 day') AS j(jour)
     WHERE EXTRACT(ISODOW FROM j.jour)::smallint = ANY (cv.jours_passage)
     GROUP BY cv.id
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
    -- Taux de réalisation : sur ce qui a été CONTRÔLÉ, la part faite. Un
    -- partiel compte pour moitié : ni un passage tenu, ni un passage manqué.
    CASE WHEN COALESCE(sum(co.saisis), 0) = 0 THEN NULL
         ELSE round(((COALESCE(sum(co.fait), 0) + 0.5 * COALESCE(sum(co.partiel), 0))
                     / sum(co.saisis)::numeric) * 100, 1)::double precision END,
    -- Taux de couverture : la part des passages dus qui a été contrôlée. Sans
    -- lui, un taux de réalisation de 100 % sur deux contrôles se lirait comme
    -- un mois parfait.
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

-- ---------------------------------------------------------------------------
-- 4. Les horaires annonces au citoyen suivent la meme regle
--
-- Un circuit qui ne commence que le mois prochain, ou qui s'est arrete, ne
-- doit pas figurer au calendrier d'un riverain. C'est le meme defaut vu par
-- l'autre bout : la il fabriquait une faute, ici il ferait attendre un camion
-- qui ne viendra pas.
--
-- La fonction est reprise telle quelle de la migration 021 : seules la
-- selection des circuits, les bornes du calendrier et la branche « report »
-- changent. Le reste — resolution de zone, annonces, bilinguisme — est
-- inchange.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.horaires_citoyen(p_jours integer DEFAULT 14)
  RETURNS TABLE (
    circuit_id       uuid,
    circuit_nom      text,
    type_dechet      text,
    jours_passage    smallint[],
    precision_source text,
    prochain_passage date,
    annonce_type     text,
    annonce_message  text,
    -- Le message arabe voyage à côté du français : le front choisit selon la
    -- langue affichée. Renvoyer le seul français obligerait l'application à
    -- montrer un texte français dans une interface arabe — exactement ce que
    -- le bilinguisme du TDR cherche à éviter.
    annonce_message_ar text,
    annonce_date     date
  )
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$fn$
DECLARE
  v_citizen uuid;
  v_commune text;
  v_zone    uuid;
  v_precision text;
BEGIN
  v_citizen := app.my_citizen_id();
  IF v_citizen IS NULL THEN
    RETURN;
  END IF;

  SELECT c.commune_id, c.zone_id INTO v_commune, v_zone
    FROM citoyens c WHERE c.id = v_citizen;

  IF v_commune IS NULL THEN
    RETURN;  -- adresse non renseignée : le front doit la demander
  END IF;

  -- La zone ne compte que si des circuits y sont réellement rattachés :
  -- une zone dessinée mais non affectée renverrait une liste vide, et le
  -- citoyen conclurait qu'on ne passe jamais chez lui.
  IF v_zone IS NOT NULL AND EXISTS (
       SELECT 1 FROM circuits ci
        WHERE ci.zone_id = v_zone AND ci.actif AND ci.deleted_at IS NULL) THEN
    v_precision := 'zone';
  ELSE
    v_precision := 'commune';
    v_zone := NULL;
  END IF;

  RETURN QUERY
  WITH circuits_desservants AS (
    SELECT ci.id, ci.nom, ci.type_dechet, ci.jours_passage,
           ci.date_debut, ci.date_fin
      FROM circuits ci
     WHERE ci.commune_id = v_commune
       AND ci.actif
       AND ci.deleted_at IS NULL
       AND (v_zone IS NULL OR ci.zone_id = v_zone)
       -- Periode de service : un circuit qui ne demarre que le mois prochain,
       -- ou deja cloture, ne figure pas au calendrier d'un riverain.
       AND ci.date_debut <= CURRENT_DATE + p_jours
       AND (ci.date_fin IS NULL OR ci.date_fin >= CURRENT_DATE)
  ),
  -- Jours calendaires à venir où chaque circuit est prévu. EXTRACT(isodow)
  -- rend 1 pour lundi et 7 pour dimanche, exactement la convention retenue
  -- pour circuits.jours_passage (migration 019).
  passages_prevus AS (
    SELECT cd.id,
           j::date AS jour
      FROM circuits_desservants cd
      CROSS JOIN generate_series(
             GREATEST(CURRENT_DATE, cd.date_debut),
             LEAST(CURRENT_DATE + p_jours, COALESCE(cd.date_fin, CURRENT_DATE + p_jours)),
             INTERVAL '1 day') AS j
     WHERE EXTRACT(isodow FROM j)::smallint = ANY (cd.jours_passage)
  ),
  -- Une suppression annoncée retire le passage du calendrier : sinon le
  -- citoyen lirait « demain » alors que la commune a justement annoncé
  -- l'inverse, et l'annonce servirait à rien.
  passages_effectifs AS (
    SELECT pp.id, pp.jour
      FROM passages_prevus pp
     WHERE NOT EXISTS (
       SELECT 1 FROM annonces_collecte a
        WHERE a.commune_id = v_commune
          AND a.deleted_at IS NULL AND a.publiee
          AND a.type IN ('suppression', 'report')
          AND (a.circuit_id IS NULL OR a.circuit_id = pp.id)
          AND pp.jour BETWEEN a.date_debut AND a.date_fin)
    UNION
    -- Un report crée un passage à sa nouvelle date.
    SELECT cd.id, a.date_report
      FROM circuits_desservants cd
      JOIN annonces_collecte a
        ON a.commune_id = v_commune
       AND a.deleted_at IS NULL AND a.publiee
       AND a.type IN ('report', 'ajout')
       AND (a.circuit_id IS NULL OR a.circuit_id = cd.id)
     WHERE a.date_report IS NOT NULL
       AND a.date_report >= CURRENT_DATE
       AND a.date_report >= cd.date_debut
       AND (cd.date_fin IS NULL OR a.date_report <= cd.date_fin)
  )
  SELECT cd.id,
         cd.nom,
         cd.type_dechet,
         cd.jours_passage,
         v_precision,
         (SELECT min(pe.jour) FROM passages_effectifs pe WHERE pe.id = cd.id),
         a.type,
         a.message_fr,
         a.message_ar,
         a.date_debut
    FROM circuits_desservants cd
    LEFT JOIN LATERAL (
      SELECT an.type, an.message_fr, an.message_ar, an.date_debut
        FROM annonces_collecte an
       WHERE an.commune_id = v_commune
         AND an.deleted_at IS NULL AND an.publiee
         AND (an.circuit_id IS NULL OR an.circuit_id = cd.id)
         AND an.date_fin >= CURRENT_DATE
       ORDER BY an.date_debut
       LIMIT 1
    ) a ON true
   ORDER BY cd.nom;
END;
$fn$;

GRANT EXECUTE ON FUNCTION app.horaires_citoyen(integer) TO siipi_app;
