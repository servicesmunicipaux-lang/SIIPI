-- ============================================================================
-- 019_circuits_controle_terrain.sql
--
-- Circuits de collecte et contrôle terrain quotidien.
--
-- Pourquoi ce module en premier dans l'espace communal : c'est le seul qui
-- CRÉE de la donnée. Tous les autres écrans en affichent. Un portail municipal
-- branché sur une commune où personne ne saisit rien affiche le même vide que
-- le tableau de bord national.
--
-- Le besoin exprimé par le directeur de propreté : « pouvoir prouver, chiffres
-- à l'appui, si un prestataire fait son travail — pas me fier aux coups de fil
-- des citoyens ».
--
-- Or la seule mesure objective dont la plateforme disposait jusqu'ici sur un
-- prestataire, ce sont justement les réclamations citoyennes. Cet indicateur
-- est trompeur : une commune sans application citoyenne déployée n'aura aucune
-- réclamation et son prestataire paraîtra parfait. Il mesure le déploiement de
-- l'application, pas la qualité du service.
--
-- Le contrôle terrain apporte une trace indépendante du citoyen, sans exiger
-- le moindre équipement : un agent coche, par circuit et par jour, fait /
-- partiellement fait / non fait. Dix secondes. C'est ce qui rend un tableau
-- contractuel opposable.
--
-- Deux autres sources de preuve sont prévues et viendront ensuite :
--   - le tonnage par circuit, quand l'import des fichiers de pesée ANGeD sera
--     construit (la colonne circuit_id est déjà posée sur les pesées ici) ;
--   - les traces GPS, qui dépendent de l'équipement des véhicules et d'une
--     clause contractuelle avant d'être une fonctionnalité.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Circuits de collecte
--
-- Un circuit n'est pas une zone : la zone est un territoire (découpage
-- communal, migration 012), le circuit est une tournée qui le parcourt. Une
-- zone peut être desservie par plusieurs circuits, et un circuit peut traverser
-- plusieurs zones — d'où un simple rattachement indicatif, pas une hiérarchie.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS circuits (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id      TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    nom             TEXT NOT NULL,
    code            TEXT,
    description     TEXT,

    -- Qui l'exécute : un prestataire privé, ou la régie communale si NULL.
    prestataire_id  UUID REFERENCES users(id) ON DELETE SET NULL,
    zone_id         UUID REFERENCES zones_collecte(id) ON DELETE SET NULL,
    vehicule_id     TEXT REFERENCES vehicules(id) ON DELETE SET NULL,

    -- Jours de passage prévus : 1 = lundi … 7 = dimanche. Un tableau plutôt
    -- qu'un libellé libre, pour que « le circuit aurait dû passer aujourd'hui »
    -- soit une question à laquelle la base sait répondre.
    jours_passage   SMALLINT[] NOT NULL DEFAULT ARRAY[]::smallint[],
    type_dechet     TEXT,

    actif           BOOLEAN NOT NULL DEFAULT true,
    trace           geometry(MultiLineString, 4326),

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT circuits_jours_valides
      CHECK (jours_passage <@ ARRAY[1,2,3,4,5,6,7]::smallint[])
);

CREATE INDEX IF NOT EXISTS idx_circuits_commune     ON circuits (commune_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_circuits_prestataire ON circuits (prestataire_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_circuits_trace       ON circuits USING GIST (trace);

COMMENT ON TABLE circuits IS
  'Tournées de collecte. Le tracé est importé (GPX/KML/GeoJSON) et non dessiné : le directeur de propreté n''est pas géomaticien.';
COMMENT ON COLUMN circuits.jours_passage IS
  'Jours de passage prévus, 1 = lundi … 7 = dimanche.';

-- ---------------------------------------------------------------------------
-- 2. Contrôle terrain
--
-- Une ligne par circuit et par jour. La contrainte d'unicité est volontaire :
-- deux agents qui contrôlent le même circuit le même jour doivent se corriger,
-- pas empiler deux vérités contradictoires dans un tableau contractuel.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS controles_terrain (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    circuit_id      UUID NOT NULL REFERENCES circuits(id) ON DELETE CASCADE,
    -- Dénormalisée : le cloisonnement se lit sur la ligne elle-même, sans
    -- jointure, et reste vrai même si la politique du circuit change.
    commune_id      TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,

    date_controle   DATE NOT NULL DEFAULT CURRENT_DATE,
    etat            TEXT NOT NULL CHECK (etat IN ('fait', 'partiel', 'non_fait')),
    remarque        TEXT,
    photo_url       TEXT,

    controle_par    UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT controles_un_par_jour UNIQUE (circuit_id, date_controle)
);

CREATE INDEX IF NOT EXISTS idx_controles_commune ON controles_terrain (commune_id, date_controle DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_controles_circuit ON controles_terrain (circuit_id, date_controle DESC) WHERE deleted_at IS NULL;

COMMENT ON TABLE controles_terrain IS
  'Constat quotidien par circuit. Trace de performance indépendante des réclamations citoyennes.';
COMMENT ON COLUMN controles_terrain.etat IS
  'fait | partiel | non_fait — constat de l''agent communal, opposable au prestataire.';

-- Le rattachement des pesées à un circuit, posé dès maintenant pour que
-- l'import des fichiers ANGeD puisse l'alimenter sans nouvelle migration.
ALTER TABLE pesees_anged
  ADD COLUMN IF NOT EXISTS circuit_id UUID REFERENCES circuits(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_pesees_circuit ON pesees_anged (circuit_id) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Cloisonnement
--
-- Le prestataire LIT ses circuits et les contrôles qui le concernent, mais
-- n'écrit ni les uns ni les autres : un constat de performance perdrait toute
-- valeur si la partie évaluée pouvait le modifier. Il peut en revanche le
-- voir — c'est la condition pour qu'il puisse le contester.
-- ---------------------------------------------------------------------------

ALTER TABLE circuits           ENABLE ROW LEVEL SECURITY;
ALTER TABLE circuits           FORCE  ROW LEVEL SECURITY;
ALTER TABLE controles_terrain  ENABLE ROW LEVEL SECURITY;
ALTER TABLE controles_terrain  FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS circuits_select ON circuits;
CREATE POLICY circuits_select ON circuits FOR SELECT
  USING (
    deleted_at IS NULL
    AND (
      app.is_fnct()
      OR (app.current_role_name() = 'admin_commune' AND commune_id = app.current_commune())
      OR (app.current_role_name() = 'gestionnaire_prestataire'
          AND prestataire_id = app.current_user_id())
    )
  );
DROP POLICY IF EXISTS circuits_insert ON circuits;
CREATE POLICY circuits_insert ON circuits FOR INSERT
  WITH CHECK (app.can_write_commune(commune_id));
DROP POLICY IF EXISTS circuits_update ON circuits;
CREATE POLICY circuits_update ON circuits FOR UPDATE
  USING (deleted_at IS NULL AND app.can_write_commune(commune_id))
  WITH CHECK (app.can_write_commune(commune_id));

DROP POLICY IF EXISTS controles_select ON controles_terrain;
CREATE POLICY controles_select ON controles_terrain FOR SELECT
  USING (
    deleted_at IS NULL
    AND (
      app.is_fnct()
      OR (app.current_role_name() = 'admin_commune' AND commune_id = app.current_commune())
      OR (app.current_role_name() = 'gestionnaire_prestataire'
          AND circuit_id IN (SELECT id FROM circuits WHERE prestataire_id = app.current_user_id()))
    )
  );
DROP POLICY IF EXISTS controles_insert ON controles_terrain;
CREATE POLICY controles_insert ON controles_terrain FOR INSERT
  WITH CHECK (app.can_write_commune(commune_id));
DROP POLICY IF EXISTS controles_update ON controles_terrain;
CREATE POLICY controles_update ON controles_terrain FOR UPDATE
  USING (deleted_at IS NULL AND app.can_write_commune(commune_id))
  WITH CHECK (app.can_write_commune(commune_id));

REVOKE DELETE, TRUNCATE ON circuits, controles_terrain FROM siipi_app;

-- ---------------------------------------------------------------------------
-- 4. Journal d'audit
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_audit_circuits ON circuits;
CREATE TRIGGER trg_audit_circuits AFTER INSERT OR UPDATE OR DELETE ON circuits
  FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement();

DROP TRIGGER IF EXISTS trg_audit_controles_terrain ON controles_terrain;
CREATE TRIGGER trg_audit_controles_terrain AFTER INSERT OR UPDATE OR DELETE ON controles_terrain
  FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement();

-- ---------------------------------------------------------------------------
-- 5. Performance des prestataires
--
-- La réponse à « est-ce que ce prestataire fait son travail ? ». Elle croise
-- trois sources et les garde SÉPARÉES plutôt que de les fondre dans une note
-- unique : un directeur qui arbitre un contrat doit voir sur quoi il s'appuie,
-- et un score agrégé masquerait qu'une commune sans application citoyenne n'a
-- tout simplement pas de réclamations.
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
       -- Le cloisonnement s'applique aussi à cette fonction : elle ne renvoie
       -- que ce que l'appelant a le droit de voir.
       AND (app.is_fnct()
            OR (app.current_role_name() = 'admin_commune' AND c.commune_id = app.current_commune())
            OR (app.current_role_name() = 'gestionnaire_prestataire' AND c.prestataire_id = app.current_user_id()))
  ),
  -- Nombre de passages prévus sur la période, d'après les jours de passage.
  attendus AS (
    SELECT cv.id AS circuit_id,
           count(*) AS passages
      FROM circuits_vus cv
      CROSS JOIN generate_series(p_depuis, p_jusqua, interval '1 day') AS j(jour)
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
    count(DISTINCT cv.id),
    COALESCE(sum(a.passages), 0)::bigint,
    COALESCE(sum(c.saisis), 0)::bigint,
    COALESCE(sum(c.fait), 0)::bigint,
    COALESCE(sum(c.partiel), 0)::bigint,
    COALESCE(sum(c.non_fait), 0)::bigint,
    -- Un passage partiel compte pour la moitié : ni réussite, ni échec.
    round((100.0 * (COALESCE(sum(c.fait), 0) + COALESCE(sum(c.partiel), 0) / 2.0)
           / NULLIF(COALESCE(sum(c.saisis), 0), 0))::numeric, 1)::double precision,
    -- Part des passages prévus qui ont effectivement été contrôlés : sans elle,
    -- un taux de réalisation de 100 % sur deux contrôles paraîtrait excellent.
    round((100.0 * COALESCE(sum(c.saisis), 0)
           / NULLIF(COALESCE(sum(a.passages), 0), 0))::numeric, 1)::double precision,
    COALESCE(max(r.transferees), 0)::bigint,
    COALESCE(max(r.traitees), 0)::bigint,
    round(max(r.delai_h)::numeric, 1)::double precision
  FROM circuits_vus cv
  JOIN users u        ON u.id = cv.prestataire_id
  LEFT JOIN attendus a ON a.circuit_id = cv.id
  LEFT JOIN constats c ON c.circuit_id = cv.id
  LEFT JOIN reclamations r ON r.prestataire = cv.prestataire_id
  GROUP BY cv.prestataire_id, u.full_name, cv.commune_id
  ORDER BY u.full_name;
$$;

COMMENT ON FUNCTION app.performance_prestataires(text, date, date) IS
  'Performance des prestataires sur une période : contrôles terrain, couverture du contrôle, et traitement des réclamations. Sources gardées séparées, jamais fondues en une note unique.';

GRANT EXECUTE ON FUNCTION app.performance_prestataires(text, date, date) TO siipi_app;

-- ---------------------------------------------------------------------------
-- 6. Les nouvelles tables entrent dans la liste des suppressions consultables
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.lignes_supprimees()
  RETURNS TABLE (table_name text, record_id text, commune_id text,
                 deleted_at timestamptz, deleted_by uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$fn$
  WITH toutes AS (
    SELECT 'zones_collecte' AS t, z.id::text AS rid, z.commune_id, z.deleted_at, z.deleted_by FROM zones_collecte z WHERE z.deleted_at IS NOT NULL
    UNION ALL
    SELECT 'vehicules',         v.id::text, v.commune_id, v.deleted_at, v.deleted_by FROM vehicules         v WHERE v.deleted_at IS NOT NULL
    UNION ALL
    SELECT 'conteneurs',        c.id::text, c.commune_id, c.deleted_at, c.deleted_by FROM conteneurs        c WHERE c.deleted_at IS NOT NULL
    UNION ALL
    SELECT 'pesees_anged',      p.id::text, p.commune_id, p.deleted_at, p.deleted_by FROM pesees_anged      p WHERE p.deleted_at IS NOT NULL
    UNION ALL
    SELECT 'tickets',           k.id::text, k.commune_id, k.deleted_at, k.deleted_by FROM tickets           k WHERE k.deleted_at IS NOT NULL
    UNION ALL
    SELECT 'circuits',          q.id::text, q.commune_id, q.deleted_at, q.deleted_by FROM circuits          q WHERE q.deleted_at IS NOT NULL
    UNION ALL
    SELECT 'controles_terrain', o.id::text, o.commune_id, o.deleted_at, o.deleted_by FROM controles_terrain o WHERE o.deleted_at IS NOT NULL
  )
  SELECT t, rid, commune_id, deleted_at, deleted_by
    FROM toutes
   WHERE app.is_fnct()
      OR (app.current_role_name() = 'admin_commune' AND commune_id = app.current_commune())
   ORDER BY deleted_at DESC;
$fn$;

GRANT EXECUTE ON FUNCTION app.lignes_supprimees() TO siipi_app;

-- ---------------------------------------------------------------------------
-- 7. Les nouvelles tables deviennent supprimables (logiquement)
--
-- app.supprimer (migration 015) travaille sur une liste blanche de tables :
-- sans cette mise à jour, supprimer un circuit échoue. La liste est explicite
-- à dessein — une table n'entre dans le dispositif que volontairement.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.supprimer(p_table text, p_id text)
  RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS
$fn$
DECLARE
  v_commune text;
BEGIN
  IF p_table NOT IN ('users', 'vehicules', 'conteneurs', 'tickets',
                     'pesees_anged', 'zones_collecte', 'barbechas',
                     'five_axis_scores', 'circuits', 'controles_terrain') THEN
    RAISE EXCEPTION 'TABLE_NON_SUPPRIMABLE: %', p_table;
  END IF;

  EXECUTE format('SELECT commune_id FROM %I WHERE id::text = $1 AND deleted_at IS NULL', p_table)
     INTO v_commune USING p_id;

  IF v_commune IS NULL THEN
    RETURN false;
  END IF;

  IF NOT app.can_write_commune(v_commune) THEN
    RAISE EXCEPTION 'ACCES_REFUSE' USING ERRCODE = 'insufficient_privilege';
  END IF;

  EXECUTE format('UPDATE %I SET deleted_at = now(), deleted_by = $2 WHERE id::text = $1', p_table)
    USING p_id, app.current_user_id();

  RETURN true;
END;
$fn$;

GRANT EXECUTE ON FUNCTION app.supprimer(text, text) TO siipi_app;
