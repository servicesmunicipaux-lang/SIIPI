-- ============================================================================
-- 015_suppression_logique.sql
--
-- Suppression logique : plus rien n'est effacé de la base par l'application.
--
-- Pourquoi : un registre réglementaire (TDR §3.2.4 B4.5) et un historique du
-- découpage communal avec retour arrière (TDR §3.2.8 C2.6) sont incompatibles
-- avec un DELETE. Une pesée effacée par erreur, un secteur de collecte
-- supprimé par un agent : sans conservation, rien ne permet de revenir en
-- arrière ni de prouver ce qui existait. Le journal d'audit (migration 014)
-- garde la trace de l'opération, mais pas les lignes rattachées.
--
-- Principe : une colonne deleted_at par table. Les politiques de lecture
-- masquent les lignes supprimées, donc l'API ne les voit plus — sans qu'aucune
-- route n'ait à ajouter « AND deleted_at IS NULL ». Le privilège SQL DELETE
-- est retiré à l'API : même une requête écrite par erreur ne peut plus effacer
-- une ligne.
--
-- La restauration d'une ligne supprimée reste une opération d'administration
-- (accès direct à la base), volontairement : c'est un acte rare, qui doit être
-- décidé, pas un bouton dans une interface.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Colonnes de suppression
--
-- communes est exclue : le référentiel des 350 communes est fixé par la
-- réglementation, une commune ne se supprime pas depuis la plateforme.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
  tables_concernees text[] := ARRAY[
    'users', 'vehicules', 'conteneurs', 'tickets', 'pesees_anged',
    'zones_collecte', 'barbechas', 'barbecha_deliveries', 'five_axis_scores',
    'citoyens'
  ];
BEGIN
  FOREACH t IN ARRAY tables_concernees LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE SET NULL', t);
    -- Index partiel : il n'indexe que les lignes vivantes, donc il reste petit
    -- et accélère les lectures courantes sans pénaliser les écritures.
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%1$s_actifs ON %1$I (id) WHERE deleted_at IS NULL', t);
    EXECUTE format('COMMENT ON COLUMN %I.deleted_at IS ''Suppression logique : la ligne est conservée mais devient invisible pour l''''application.''', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Les politiques de lecture masquent les lignes supprimées
--
-- On reprend les politiques de la migration 013 en leur ajoutant la condition.
-- Les remplacer ici plutôt que de filtrer dans les routes garantit qu'aucune
-- requête, présente ou future, ne peut ressortir une ligne supprimée.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS users_select ON users;
CREATE POLICY users_select ON users FOR SELECT
  USING (
    deleted_at IS NULL
    AND (
      app.is_fnct()
      OR id = app.current_user_id()
      OR (app.current_role_name() = 'admin_commune'
          AND commune_id IS NOT NULL
          AND commune_id = app.current_commune())
    )
  );

DROP POLICY IF EXISTS vehicules_select ON vehicules;
CREATE POLICY vehicules_select ON vehicules FOR SELECT
  USING (
    deleted_at IS NULL
    AND (
      app.is_fnct()
      OR (app.current_role_name() = 'admin_commune' AND commune_id = app.current_commune())
      OR (app.current_role_name() = 'gestionnaire_prestataire'
          AND zone_id IS NOT NULL AND zone_id = ANY (app.my_zone_ids()))
    )
  );

DROP POLICY IF EXISTS conteneurs_select ON conteneurs;
CREATE POLICY conteneurs_select ON conteneurs FOR SELECT
  USING (deleted_at IS NULL AND app.can_read_commune(commune_id));

DROP POLICY IF EXISTS pesees_select ON pesees_anged;
CREATE POLICY pesees_select ON pesees_anged FOR SELECT
  USING (deleted_at IS NULL AND app.can_read_commune(commune_id));

DROP POLICY IF EXISTS zones_select ON zones_collecte;
CREATE POLICY zones_select ON zones_collecte FOR SELECT
  USING (deleted_at IS NULL AND app.can_read_commune(commune_id));

DROP POLICY IF EXISTS tickets_select ON tickets;
CREATE POLICY tickets_select ON tickets FOR SELECT
  USING (
    deleted_at IS NULL
    AND (
      app.is_fnct()
      OR (app.current_role_name() = 'admin_commune' AND commune_id = app.current_commune())
      OR (app.current_role_name() = 'gestionnaire_prestataire'
          AND assigned_prestataire_id = app.current_user_id())
      OR (app.current_role_name() = 'citoyen' AND citizen_id = app.my_citizen_id())
    )
  );

DROP POLICY IF EXISTS five_axis_select ON five_axis_scores;
CREATE POLICY five_axis_select ON five_axis_scores FOR SELECT
  USING (deleted_at IS NULL AND app.is_authenticated());

DROP POLICY IF EXISTS citoyens_select ON citoyens;
CREATE POLICY citoyens_select ON citoyens FOR SELECT
  USING (deleted_at IS NULL AND (app.is_fnct() OR user_id = app.current_user_id()));

DROP POLICY IF EXISTS barbechas_select ON barbechas;
CREATE POLICY barbechas_select ON barbechas FOR SELECT
  USING (deleted_at IS NULL
         AND (app.can_read_commune(commune_id) OR user_id = app.current_user_id()));

DROP POLICY IF EXISTS barbecha_deliveries_select ON barbecha_deliveries;
CREATE POLICY barbecha_deliveries_select ON barbecha_deliveries FOR SELECT
  USING (deleted_at IS NULL
         AND (app.is_fnct() OR barbecha_id IN (SELECT id FROM barbechas)));

-- ---------------------------------------------------------------------------
-- 3. Retrait du privilège de suppression
--
-- L'API ne peut plus effacer de ligne, quelle que soit la requête qu'elle
-- émet. Une suppression demandée par un utilisateur se traduit par une mise à
-- jour de deleted_at — donc par une ligne dans le journal d'audit, avec son
-- auteur et son horodatage.
--
-- communes reste hors du dispositif (référentiel réglementaire) : la
-- suppression y est déjà réservée à la FNCT par la politique communes_delete.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'vehicules', 'conteneurs', 'tickets', 'pesees_anged',
    'zones_collecte', 'barbechas', 'barbecha_deliveries', 'five_axis_scores',
    'citoyens'
  ] LOOP
    EXECUTE format('REVOKE DELETE, TRUNCATE ON %I FROM siipi_app', t);
  END LOOP;
END $$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE DELETE ON TABLES FROM siipi_app;

-- ---------------------------------------------------------------------------
-- 4. Consultation de ce qui a été supprimé
--
-- Les politiques de lecture masquent désormais les lignes supprimées : une
-- vue ordinaire serait donc toujours vide. Cette fonction s'exécute avec les
-- droits d'administration et applique elle-même le cloisonnement, pour qu'une
-- commune puisse retrouver ce qui a disparu de ses écrans et que la FNCT
-- puisse instruire une demande de restauration.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.lignes_supprimees()
  RETURNS TABLE (table_name text, record_id text, commune_id text,
                 deleted_at timestamptz, deleted_by uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$fn$
  WITH toutes AS (
    SELECT 'zones_collecte' AS t, z.id::text AS rid, z.commune_id, z.deleted_at, z.deleted_by FROM zones_collecte z WHERE z.deleted_at IS NOT NULL
    UNION ALL
    SELECT 'vehicules',    v.id::text, v.commune_id, v.deleted_at, v.deleted_by FROM vehicules    v WHERE v.deleted_at IS NOT NULL
    UNION ALL
    SELECT 'conteneurs',   c.id::text, c.commune_id, c.deleted_at, c.deleted_by FROM conteneurs   c WHERE c.deleted_at IS NOT NULL
    UNION ALL
    SELECT 'pesees_anged', p.id::text, p.commune_id, p.deleted_at, p.deleted_by FROM pesees_anged p WHERE p.deleted_at IS NOT NULL
    UNION ALL
    SELECT 'tickets',      k.id::text, k.commune_id, k.deleted_at, k.deleted_by FROM tickets      k WHERE k.deleted_at IS NOT NULL
  )
  SELECT t, rid, commune_id, deleted_at, deleted_by
    FROM toutes
   WHERE app.is_fnct()
      OR (app.current_role_name() = 'admin_commune' AND commune_id = app.current_commune())
   ORDER BY deleted_at DESC;
$fn$;

COMMENT ON FUNCTION app.lignes_supprimees() IS
  'Lignes supprimées logiquement, cloisonnées par commune. Sert à instruire une demande de restauration.';

GRANT EXECUTE ON FUNCTION app.lignes_supprimees() TO siipi_app;

-- ---------------------------------------------------------------------------
-- 5. Séparer lecture et écriture dans les politiques
--
-- PIÈGE : en PostgreSQL, une politique déclarée FOR ALL couvre aussi le
-- SELECT, et les politiques permissives se cumulent par OU. Les politiques
-- d'écriture de la migration 013 (« _write ... FOR ALL ») rendaient donc de
-- nouveau visibles les lignes que les politiques de lecture ci-dessus
-- venaient de masquer : une zone supprimée restait affichée à sa commune.
--
-- On les redéclare ici explicitement en INSERT et UPDATE. La lecture est
-- alors gouvernée par les seules politiques « _select », et il n'existe
-- aucune politique DELETE : l'effacement est impossible, même si le
-- privilège SQL était réaccordé un jour par erreur.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r record;
  -- table, condition d'écriture
  regles text[][] := ARRAY[
    ARRAY['users',               'app.can_write_commune(commune_id)'],
    ARRAY['conteneurs',          'app.can_write_commune(commune_id)'],
    ARRAY['pesees_anged',        'app.can_write_commune(commune_id)'],
    ARRAY['zones_collecte',      'app.can_write_commune(commune_id)'],
    ARRAY['barbechas',           'app.can_write_commune(commune_id)'],
    ARRAY['five_axis_scores',    'app.can_write_commune(commune_id)'],
    ARRAY['citoyens',            '(app.is_fnct() OR user_id = app.current_user_id())'],
    ARRAY['barbecha_deliveries', '(app.is_fnct() OR barbecha_id IN (SELECT id FROM barbechas))'],
    ARRAY['vehicules',           '(app.can_write_commune(commune_id) OR (app.current_role_name() = ''gestionnaire_prestataire'' AND zone_id IS NOT NULL AND zone_id = ANY (app.my_zone_ids())))']
  ];
  i int;
  t text;
  cond text;
BEGIN
  FOR i IN 1 .. array_length(regles, 1) LOOP
    t    := regles[i][1];
    cond := regles[i][2];

    -- Retire l'ancienne politique FOR ALL, quel que soit son nom.
    FOR r IN SELECT policyname FROM pg_policies
              WHERE tablename = t AND cmd = 'ALL'
    LOOP
      EXECUTE format('DROP POLICY %I ON %I', r.policyname, t);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY %1$s_insert ON %1$I FOR INSERT WITH CHECK (%2$s)', t, cond);
    -- Une ligne déjà supprimée n'est plus modifiable : sa restauration est un
    -- acte d'administration, pas une opération applicative.
    EXECUTE format(
      'CREATE POLICY %1$s_update ON %1$I FOR UPDATE USING (deleted_at IS NULL AND (%2$s))
         WITH CHECK (%2$s)', t, cond);
  END LOOP;
END $$;

-- citizen_badges et citizen_rewards n'ont pas de colonne deleted_at (données
-- de jeu, sans valeur probante) : leurs politiques UPDATE sont reprises sans
-- la condition.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename, policyname FROM pg_policies
            WHERE tablename IN ('citizen_badges', 'citizen_rewards') AND cmd = 'ALL'
  LOOP
    EXECUTE format('DROP POLICY %I ON %I', r.policyname, r.tablename);
  END LOOP;
END $$;

CREATE POLICY citizen_badges_insert ON citizen_badges FOR INSERT WITH CHECK (app.is_fnct());
CREATE POLICY citizen_rewards_insert ON citizen_rewards FOR INSERT
  WITH CHECK (app.is_fnct() OR citizen_id = app.my_citizen_id());
DROP POLICY IF EXISTS citizen_badges_update  ON citizen_badges;
DROP POLICY IF EXISTS citizen_rewards_update ON citizen_rewards;
CREATE POLICY citizen_badges_update ON citizen_badges FOR UPDATE
  USING (app.is_fnct()) WITH CHECK (app.is_fnct());
CREATE POLICY citizen_rewards_update ON citizen_rewards FOR UPDATE
  USING (app.is_fnct() OR citizen_id = app.my_citizen_id())
  WITH CHECK (app.is_fnct() OR citizen_id = app.my_citizen_id());

-- Les réclamations avaient déjà des politiques séparées : on ajoute seulement
-- la condition de non-suppression à la mise à jour.
DROP POLICY IF EXISTS tickets_update ON tickets;
CREATE POLICY tickets_update ON tickets FOR UPDATE
  USING (
    deleted_at IS NULL
    AND (
      app.can_write_commune(commune_id)
      OR (app.current_role_name() = 'gestionnaire_prestataire'
          AND assigned_prestataire_id = app.current_user_id())
    )
  )
  WITH CHECK (
    app.can_write_commune(commune_id)
    OR (app.current_role_name() = 'gestionnaire_prestataire'
        AND assigned_prestataire_id = app.current_user_id())
  );
DROP POLICY IF EXISTS tickets_delete ON tickets;

-- ---------------------------------------------------------------------------
-- 6. Fonction de suppression logique
--
-- PIÈGE : PostgreSQL applique les politiques de LECTURE à la ligne telle
-- qu'elle est APRÈS modification. Une simple mise à jour « SET deleted_at =
-- now() » est donc refusée : la ligne deviendrait invisible à celui-là même
-- qui la modifie. Vérifié sur PostgreSQL 16 — l'ajout d'une politique de
-- lecture permissive fait aussitôt passer la même requête.
--
-- La suppression logique passe donc par cette fonction, exécutée avec les
-- droits d'administration. Elle vérifie elle-même le droit d'écriture sur la
-- commune concernée, horodate et attribue la suppression. Avantage : une
-- seule implémentation pour tous les modules, impossible à contourner ou à
-- réécrire différemment d'un écran à l'autre.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.supprimer(p_table text, p_id text)
  RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_commune text;
BEGIN
  IF p_table NOT IN ('users', 'vehicules', 'conteneurs', 'tickets',
                     'pesees_anged', 'zones_collecte', 'barbechas',
                     'five_axis_scores') THEN
    RAISE EXCEPTION 'TABLE_NON_SUPPRIMABLE: %', p_table;
  END IF;

  EXECUTE format('SELECT commune_id FROM %I WHERE id::text = $1 AND deleted_at IS NULL', p_table)
     INTO v_commune USING p_id;

  -- Introuvable, ou déjà supprimée : rien à faire, et surtout pas d'erreur
  -- qui révélerait l'existence d'une ligne d'une autre commune.
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
$$;

COMMENT ON FUNCTION app.supprimer(text, text) IS
  'Suppression logique d''une ligne, avec vérification du droit d''écriture sur sa commune. Seule voie de suppression offerte à l''API.';

GRANT EXECUTE ON FUNCTION app.supprimer(text, text) TO siipi_app;
