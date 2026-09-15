-- ============================================================================
-- 013_rls_cloisonnement.sql
--
-- Cloisonnement des données entre les 350 communes, appliqué PAR LA BASE
-- (Row-Level Security de PostgreSQL) et non plus seulement par le code de
-- l'API.
--
-- Pourquoi : jusqu'ici l'isolation reposait sur un filtre écrit à la main dans
-- chaque route. Un filtre oublié = fuite silencieuse. Vérifié avant cette
-- migration : le directeur de Sfax pouvait lire les réclamations et la flotte
-- de La Marsa, un compte citoyen pouvait lire le découpage communal de
-- n'importe quelle commune, et un directeur pouvait enregistrer une note
-- "5 Axes" pour une autre commune que la sienne.
--
-- Règle de gouvernance retenue par la FNCT :
--   - cloisonnement STRICT des données opérationnelles (flotte, conteneurs,
--     pesées, réclamations, découpage, personnel) ;
--   - MAIS annuaire des communes et scores "5 Axes" visibles par toutes les
--     communes authentifiées, pour permettre la comparaison et l'émulation
--     entre communes (mission d'observatoire national de la FNCT).
--
-- Principe de fonctionnement : l'API déclare, au début de chaque transaction,
-- qui est l'utilisateur courant (app.user_id / app.role / app.commune_id).
-- Les politiques ci-dessous lisent ces variables. Si elles ne sont PAS
-- positionnées, aucune ligne n'est visible : le défaut est le refus.
--
-- FORCE ROW LEVEL SECURITY est activé pour que les politiques s'appliquent
-- aussi au propriétaire des tables (sans quoi PostgreSQL le laisse passer).
-- Les scripts de migration et de seed positionnent explicitement le contexte
-- super_admin_fnct pour pouvoir écrire.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS app;

COMMENT ON SCHEMA app IS
  'Fonctions de contexte et de sécurité de la plateforme SIIPI (cloisonnement RLS).';

-- ---------------------------------------------------------------------------
-- 0. Rôle d'exécution de l'API
--
-- PIÈGE À CONNAÎTRE : PostgreSQL n'applique JAMAIS les politiques RLS à un
-- super-utilisateur, même avec FORCE ROW LEVEL SECURITY. Or l'image Docker
-- postgis/postgis crée POSTGRES_USER (siipi_admin) en super-utilisateur.
-- Laisser l'API se connecter avec ce compte reviendrait à écrire tout ce
-- fichier sans le moindre effet — et sans aucun message d'erreur.
--
-- Solution retenue : un rôle 'siipi_app' sans privilège particulier, dont
-- l'API endosse l'identité au début de chaque transaction (SET LOCAL ROLE,
-- voir src/db.ts). Aucun mot de passe ni connexion supplémentaire à gérer :
-- ce rôle ne peut pas se connecter directement (NOLOGIN), il sert uniquement
-- à faire retomber les requêtes de l'API sous le coup des politiques.
--
-- Les migrations et le seed, eux, ne changent pas de rôle et conservent donc
-- les droits d'administration nécessaires.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'siipi_app') THEN
    CREATE ROLE siipi_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  ELSE
    ALTER ROLE siipi_app NOSUPERUSER NOBYPASSRLS;
  END IF;
  -- Permet au compte de l'API d'endosser ce rôle le temps d'une transaction.
  EXECUTE format('GRANT siipi_app TO %I', current_user);
END $$;

COMMENT ON ROLE siipi_app IS
  'Identité sous laquelle s''exécutent les requêtes de l''API SIIPI. Sans privilège : les politiques RLS s''y appliquent pleinement.';

-- ---------------------------------------------------------------------------
-- 1. Contexte de la requête courante
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.current_role_name() RETURNS text
  LANGUAGE sql STABLE AS
$$ SELECT COALESCE(NULLIF(current_setting('app.role', true), ''), 'anonyme') $$;

CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS uuid
  LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app.current_commune() RETURNS text
  LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.commune_id', true), '') $$;

CREATE OR REPLACE FUNCTION app.is_authenticated() RETURNS boolean
  LANGUAGE sql STABLE AS
$$ SELECT app.current_user_id() IS NOT NULL $$;

CREATE OR REPLACE FUNCTION app.is_fnct() RETURNS boolean
  LANGUAGE sql STABLE AS
$$ SELECT app.current_role_name() = 'super_admin_fnct' $$;

-- Droit d'agir sur une commune donnée : la FNCT partout, l'Admin Commune
-- uniquement sur la sienne.
CREATE OR REPLACE FUNCTION app.can_write_commune(p_commune text) RETURNS boolean
  LANGUAGE sql STABLE AS
$$ SELECT app.is_fnct()
       OR (app.current_role_name() = 'admin_commune'
           AND p_commune IS NOT NULL
           AND p_commune = app.current_commune()) $$;

-- Lecture des données opérationnelles d'une commune : FNCT, Admin Commune de
-- cette commune, ou Gestionnaire Prestataire opérant dans cette commune.
CREATE OR REPLACE FUNCTION app.can_read_commune(p_commune text) RETURNS boolean
  LANGUAGE sql STABLE AS
$$ SELECT app.is_fnct()
       OR (app.current_role_name() IN ('admin_commune', 'gestionnaire_prestataire')
           AND p_commune IS NOT NULL
           AND p_commune = app.current_commune()) $$;

-- ---------------------------------------------------------------------------
-- 2. Fonctions de rattachement (SECURITY DEFINER : elles interrogent des
--    tables elles-mêmes protégées par RLS, ce qui provoquerait une récursion
--    infinie si elles s'exécutaient avec les droits de l'appelant).
-- ---------------------------------------------------------------------------

-- Zones de collecte attribuées au prestataire connecté (TDR §3.2.11 / B7.2 :
-- « le Gestionnaire Prestataire ne voit que les données liées à ses zones »).
CREATE OR REPLACE FUNCTION app.my_zone_ids() RETURNS uuid[]
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$ SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
     FROM zones_collecte
    WHERE assigned_prestataire_id = app.current_user_id() $$;

-- Profil citoyen de l'utilisateur connecté.
CREATE OR REPLACE FUNCTION app.my_citizen_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$ SELECT id FROM citoyens WHERE user_id = app.current_user_id() $$;

-- ---------------------------------------------------------------------------
-- 3. Flux anonymes autorisés (connexion et inscription citoyenne)
--
--    Ces deux opérations ont lieu AVANT qu'un utilisateur ne soit identifié :
--    aucune politique RLS ne peut les couvrir. Elles passent donc par deux
--    fonctions SECURITY DEFINER, volontairement étroites, qui sont les seules
--    portes d'entrée anonymes de la plateforme.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.find_user_for_login(p_email text)
  RETURNS TABLE (
    id uuid, email text, password_hash text, full_name text,
    role text, commune_id text, is_active boolean
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$ SELECT u.id, u.email, u.password_hash, u.full_name, u.role, u.commune_id, u.is_active
     FROM users u
    WHERE u.email = lower(p_email) $$;

COMMENT ON FUNCTION app.find_user_for_login(text) IS
  'Seule lecture de users autorisée sans authentification. Utilisée uniquement par POST /auth/login.';

CREATE OR REPLACE FUNCTION app.register_citizen(
    p_email text, p_password_hash text, p_full_name text, p_phone text
  )
  RETURNS TABLE (user_id uuid, citizen_id uuid, email text, full_name text)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_user_id uuid;
  v_citizen_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM users u WHERE u.email = lower(p_email)) THEN
    RAISE EXCEPTION 'EMAIL_DEJA_UTILISE' USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO users (email, password_hash, full_name, phone, role)
  VALUES (lower(p_email), p_password_hash, p_full_name, p_phone, 'citoyen')
  RETURNING users.id INTO v_user_id;

  INSERT INTO citoyens (user_id) VALUES (v_user_id)
  RETURNING citoyens.id INTO v_citizen_id;

  RETURN QUERY SELECT v_user_id, v_citizen_id, lower(p_email), p_full_name;
END;
$$;

COMMENT ON FUNCTION app.register_citizen(text, text, text, text) IS
  'Seule écriture autorisée sans authentification. Crée un compte citoyen et son profil. Utilisée uniquement par POST /citizens/register.';

-- ---------------------------------------------------------------------------
-- 4. Activation du cloisonnement
-- ---------------------------------------------------------------------------

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'communes', 'users', 'vehicules', 'conteneurs', 'tickets', 'pesees_anged',
    'citoyens', 'citizen_badges', 'citizen_rewards', 'barbechas',
    'barbecha_deliveries', 'five_axis_scores', 'zones_collecte'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Politiques — Référentiel partagé (visible par toutes les communes)
-- ---------------------------------------------------------------------------

-- Annuaire des 350 communes : consultable par tout utilisateur authentifié
-- (TDR §3.1.2 — tableau national des communes ; émulation entre communes).
CREATE POLICY communes_select ON communes FOR SELECT
  USING (app.is_authenticated());

CREATE POLICY communes_update ON communes FOR UPDATE
  USING (app.can_write_commune(id)) WITH CHECK (app.can_write_commune(id));

CREATE POLICY communes_insert ON communes FOR INSERT
  WITH CHECK (app.is_fnct());

CREATE POLICY communes_delete ON communes FOR DELETE
  USING (app.is_fnct());

-- Scores "5 Axes" : consultables par toutes les communes (comparaison
-- nationale), modifiables uniquement par la commune concernée et la FNCT.
CREATE POLICY five_axis_select ON five_axis_scores FOR SELECT
  USING (app.is_authenticated());

CREATE POLICY five_axis_write ON five_axis_scores FOR ALL
  USING (app.can_write_commune(commune_id))
  WITH CHECK (app.can_write_commune(commune_id));

-- ---------------------------------------------------------------------------
-- 6. Politiques — Comptes utilisateurs
-- ---------------------------------------------------------------------------

CREATE POLICY users_select ON users FOR SELECT
  USING (
    app.is_fnct()
    OR id = app.current_user_id()
    OR (app.current_role_name() = 'admin_commune'
        AND commune_id IS NOT NULL
        AND commune_id = app.current_commune())
  );

CREATE POLICY users_write ON users FOR ALL
  USING (app.can_write_commune(commune_id))
  WITH CHECK (app.can_write_commune(commune_id));

-- ---------------------------------------------------------------------------
-- 7. Politiques — Données opérationnelles (cloisonnement strict)
-- ---------------------------------------------------------------------------

-- Flotte : le prestataire ne voit que les engins affectés à ses zones.
CREATE POLICY vehicules_select ON vehicules FOR SELECT
  USING (
    app.is_fnct()
    OR (app.current_role_name() = 'admin_commune' AND commune_id = app.current_commune())
    OR (app.current_role_name() = 'gestionnaire_prestataire'
        AND zone_id IS NOT NULL AND zone_id = ANY (app.my_zone_ids()))
  );

CREATE POLICY vehicules_write ON vehicules FOR ALL
  USING (app.can_write_commune(commune_id)
         OR (app.current_role_name() = 'gestionnaire_prestataire'
             AND zone_id IS NOT NULL AND zone_id = ANY (app.my_zone_ids())))
  WITH CHECK (app.can_write_commune(commune_id)
         OR (app.current_role_name() = 'gestionnaire_prestataire'
             AND zone_id IS NOT NULL AND zone_id = ANY (app.my_zone_ids())));

-- Conteneurs et pesées : pas encore rattachés à une zone dans le schéma, donc
-- cloisonnés au niveau de la commune. À affiner (rattachement à une zone)
-- quand le module GMAO/waypoints sera construit.
CREATE POLICY conteneurs_select ON conteneurs FOR SELECT
  USING (app.can_read_commune(commune_id));
CREATE POLICY conteneurs_write ON conteneurs FOR ALL
  USING (app.can_write_commune(commune_id))
  WITH CHECK (app.can_write_commune(commune_id));

CREATE POLICY pesees_select ON pesees_anged FOR SELECT
  USING (app.can_read_commune(commune_id));
CREATE POLICY pesees_write ON pesees_anged FOR ALL
  USING (app.can_write_commune(commune_id))
  WITH CHECK (app.can_write_commune(commune_id));

-- Découpage communal : lecture par la commune (le prestataire doit pouvoir
-- situer ses tournées), écriture réservée à l'Admin Commune et à la FNCT.
CREATE POLICY zones_select ON zones_collecte FOR SELECT
  USING (app.can_read_commune(commune_id));
CREATE POLICY zones_write ON zones_collecte FOR ALL
  USING (app.can_write_commune(commune_id))
  WITH CHECK (app.can_write_commune(commune_id));

-- Réclamations : la commune, le prestataire à qui elle a été transférée, et
-- le citoyen qui l'a déposée (TDR §5, matrice des rôles).
CREATE POLICY tickets_select ON tickets FOR SELECT
  USING (
    app.is_fnct()
    OR (app.current_role_name() = 'admin_commune' AND commune_id = app.current_commune())
    OR (app.current_role_name() = 'gestionnaire_prestataire'
        AND assigned_prestataire_id = app.current_user_id())
    OR (app.current_role_name() = 'citoyen' AND citizen_id = app.my_citizen_id())
  );

CREATE POLICY tickets_insert ON tickets FOR INSERT
  WITH CHECK (
    app.is_fnct()
    OR (app.current_role_name() = 'citoyen' AND citizen_id = app.my_citizen_id())
  );

CREATE POLICY tickets_update ON tickets FOR UPDATE
  USING (
    app.can_write_commune(commune_id)
    OR (app.current_role_name() = 'gestionnaire_prestataire'
        AND assigned_prestataire_id = app.current_user_id())
  )
  WITH CHECK (
    app.can_write_commune(commune_id)
    OR (app.current_role_name() = 'gestionnaire_prestataire'
        AND assigned_prestataire_id = app.current_user_id())
  );

CREATE POLICY tickets_delete ON tickets FOR DELETE
  USING (app.can_write_commune(commune_id));

-- ---------------------------------------------------------------------------
-- 8. Politiques — Données personnelles des citoyens
--    Le citoyen ne voit que son propre profil. Aucune commune n'a accès à la
--    base des comptes citoyens (les réclamations portent déjà le nom et le
--    téléphone déclarés par le citoyen pour ce signalement précis).
-- ---------------------------------------------------------------------------

CREATE POLICY citoyens_select ON citoyens FOR SELECT
  USING (app.is_fnct() OR user_id = app.current_user_id());
CREATE POLICY citoyens_write ON citoyens FOR ALL
  USING (app.is_fnct() OR user_id = app.current_user_id())
  WITH CHECK (app.is_fnct() OR user_id = app.current_user_id());

CREATE POLICY badges_select ON citizen_badges FOR SELECT
  USING (app.is_fnct() OR citizen_id = app.my_citizen_id());
CREATE POLICY badges_write ON citizen_badges FOR ALL
  USING (app.is_fnct()) WITH CHECK (app.is_fnct());

CREATE POLICY rewards_select ON citizen_rewards FOR SELECT
  USING (app.is_fnct() OR citizen_id = app.my_citizen_id());
CREATE POLICY rewards_write ON citizen_rewards FOR ALL
  USING (app.is_fnct() OR citizen_id = app.my_citizen_id())
  WITH CHECK (app.is_fnct() OR citizen_id = app.my_citizen_id());

-- ---------------------------------------------------------------------------
-- 9. Politiques — GDMA / Barbéchas
--    Module hérité du prototype, absent du TDR officiel : cloisonné à la
--    commune en attendant l'arbitrage de la FNCT sur son maintien.
-- ---------------------------------------------------------------------------

CREATE POLICY barbechas_select ON barbechas FOR SELECT
  USING (app.can_read_commune(commune_id) OR user_id = app.current_user_id());
CREATE POLICY barbechas_write ON barbechas FOR ALL
  USING (app.can_write_commune(commune_id))
  WITH CHECK (app.can_write_commune(commune_id));

CREATE POLICY barbecha_deliveries_select ON barbecha_deliveries FOR SELECT
  USING (
    app.is_fnct()
    OR barbecha_id IN (SELECT id FROM barbechas)  -- filtré à son tour par la politique ci-dessus
  );
CREATE POLICY barbecha_deliveries_write ON barbecha_deliveries FOR ALL
  USING (app.is_fnct() OR barbecha_id IN (SELECT id FROM barbechas))
  WITH CHECK (app.is_fnct() OR barbecha_id IN (SELECT id FROM barbechas));

-- ---------------------------------------------------------------------------
-- 10. Privilèges du rôle d'exécution
--
-- siipi_app n'a aucun droit implicite : on lui accorde exactement ce dont
-- l'API a besoin (lire/écrire les tables métier, appeler les deux fonctions
-- des flux anonymes). Ce sont ensuite les politiques ci-dessus qui décident,
-- ligne par ligne, de ce qu'il voit réellement.
-- ---------------------------------------------------------------------------

GRANT USAGE ON SCHEMA public TO siipi_app;
GRANT USAGE ON SCHEMA app    TO siipi_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO siipi_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO siipi_app;

-- Les tables créées par les migrations futures seront couvertes automatiquement.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO siipi_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO siipi_app;

-- Le suivi des migrations n'est lisible et modifiable que par l'administrateur.
REVOKE ALL ON schema_migrations FROM siipi_app;

GRANT EXECUTE ON FUNCTION app.find_user_for_login(text) TO siipi_app;
GRANT EXECUTE ON FUNCTION app.register_citizen(text, text, text, text) TO siipi_app;
