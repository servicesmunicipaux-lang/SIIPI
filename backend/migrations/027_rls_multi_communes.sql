-- ============================================================================
-- 027_rls_multi_communes.sql
--
-- Sept politiques de cloisonnement supposaient encore qu'un agent communal ne
-- relève que d'UNE commune : « commune_id = app.current_commune() », c'est-à-
-- dire sa commune principale, et elle seule.
--
-- La migration 022 a pourtant introduit le rattachement multiple
-- (utilisateur_communes) et app.mes_communes(), et l'API sait depuis lors
-- servir une commune demandée. Le travail est resté à mi-chemin : seul le
-- prestataire en a bénéficié. Un directeur rattaché à deux communes peut donc
-- choisir la seconde dans l'interface, l'API interroge bien la base — et les
-- politiques de lecture, silencieusement, ne renvoient rien. Pas d'erreur, pas
-- de refus : un écran vide. C'est la pire forme de panne, celle qu'on prend
-- pour une absence de données.
--
-- Le défaut porte à conséquence ici plus qu'ailleurs : la mutualisation
-- intercommunale — un agent, un marché, plusieurs communes — est l'objet même
-- de la plateforme. Une structure intercommunale qui ne sait pas représenter
-- un agent servant deux communes ne représente pas son propre sujet.
--
-- Correction : app.can_write_commune(), qui couvre la FNCT et l'ensemble des
-- rattachements en cours de validité. Pour un agent mono-commune — l'immense
-- majorité — le comportement est rigoureusement identique.
-- ============================================================================

-- --- Circuits ---------------------------------------------------------------
DROP POLICY IF EXISTS circuits_select ON circuits;
CREATE POLICY circuits_select ON circuits FOR SELECT
  USING (
    deleted_at IS NULL
    AND (
      app.can_write_commune(commune_id)
      OR (app.current_role_name() = 'gestionnaire_prestataire'
          AND prestataire_id = app.current_user_id())
    )
  );

-- --- Constats terrain -------------------------------------------------------
DROP POLICY IF EXISTS controles_select ON controles_terrain;
CREATE POLICY controles_select ON controles_terrain FOR SELECT
  USING (
    deleted_at IS NULL
    AND (
      app.can_write_commune(commune_id)
      OR (app.current_role_name() = 'gestionnaire_prestataire'
          AND circuit_id IN (SELECT id FROM circuits WHERE prestataire_id = app.current_user_id()))
    )
  );

-- --- Réclamations -----------------------------------------------------------
DROP POLICY IF EXISTS tickets_select ON tickets;
CREATE POLICY tickets_select ON tickets FOR SELECT
  USING (
    deleted_at IS NULL
    AND (
      app.can_write_commune(commune_id)
      OR (app.current_role_name() = 'gestionnaire_prestataire'
          AND assigned_prestataire_id = app.current_user_id())
      OR (app.current_role_name() = 'citoyen' AND citizen_id = app.my_citizen_id())
    )
  );

-- --- Engins -----------------------------------------------------------------
DROP POLICY IF EXISTS vehicules_select ON vehicules;
CREATE POLICY vehicules_select ON vehicules FOR SELECT
  USING (
    deleted_at IS NULL
    AND (
      app.can_write_commune(commune_id)
      OR (app.current_role_name() = 'gestionnaire_prestataire'
          AND zone_id IS NOT NULL
          AND zone_id = ANY (app.my_zone_ids()))
    )
  );

-- --- Comptes ----------------------------------------------------------------
-- Un agent voit toujours son propre compte, quelle que soit sa commune : sans
-- cette branche, un utilisateur sans rattachement valide ne pourrait plus lire
-- sa propre fiche et l'application se fermerait sur lui.
DROP POLICY IF EXISTS users_select ON users;
CREATE POLICY users_select ON users FOR SELECT
  USING (
    deleted_at IS NULL
    AND (
      app.is_fnct()
      OR id = app.current_user_id()
      OR (commune_id IS NOT NULL AND app.can_write_commune(commune_id))
    )
  );

-- --- Journal d'audit --------------------------------------------------------
DROP POLICY IF EXISTS audit_log_select ON audit_log;
CREATE POLICY audit_log_select ON audit_log FOR SELECT
  USING (
    app.is_fnct()
    OR (commune_id IS NOT NULL AND app.can_write_commune(commune_id))
  );

-- --- Journal des consultations de données personnelles -----------------------
-- Une consultation peut concerner plusieurs communes à la fois (un export, une
-- recherche nationale). L'agent la voit dès qu'UNE de ses communes y figure —
-- l'opérateur && teste le recoupement de deux tableaux.
DROP POLICY IF EXISTS access_log_select ON access_log;
CREATE POLICY access_log_select ON access_log FOR SELECT
  USING (
    app.is_fnct()
    OR (app.current_role_name() = 'admin_commune'
        AND communes_concernees IS NOT NULL
        AND app.mes_communes() && communes_concernees)
    OR (app.current_role_name() = 'citoyen' AND app.my_citizen_id() = ANY (citizen_ids))
  );
