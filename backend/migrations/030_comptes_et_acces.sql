-- ============================================================================
-- 030_comptes_et_acces.sql
--
-- Gestion des comptes depuis l'application, par la commune elle-même.
--
-- Ce que remplace ce module : jusqu'ici, chaque compte naissait dans un
-- fichier de démarrage. Cela ne tient pas — ni à 350 communes, ni devant la
-- réalité, où c'est le cadre du service propreté qui sait qui entre et qui
-- part. Un référentiel des accès tenu par des développeurs est un référentiel
-- faux le lendemain de la livraison.
--
-- Deux règles, et une faille refermée.
--
-- 1. LA FAILLE. « users_insert » n'autorisait l'écriture que dans sa propre
--    commune — ce qui est juste — mais ne disait RIEN du rôle. Un
--    administrateur communal pouvait donc créer un compte
--    « super_admin_fnct » rattaché à sa commune, se connecter avec, et lire
--    les 350 communes. L'élévation de privilège tenait en une requête, et
--    aucun test ne la cherchait.
--
--    Le garde-fou est posé ICI, dans un déclencheur, et non dans l'API : une
--    règle qu'on contourne en écrivant une autre requête n'est pas une règle.
--
-- 2. LE MOT DE PASSE PROVISOIRE. Quand un cadre crée le compte d'un agent, il
--    doit lui transmettre quelque chose. Si ce quelque chose reste le mot de
--    passe définitif, le cadre connaît durablement les identifiants de ses
--    subordonnés, et la trace d'une action n'engage plus personne. Le mot de
--    passe créé est donc marqué provisoire : son porteur doit en choisir un
--    autre avant de faire quoi que ce soit.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Mot de passe provisoire
-- ---------------------------------------------------------------------------

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS mot_de_passe_provisoire BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cree_par UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS derniere_connexion TIMESTAMPTZ;

COMMENT ON COLUMN users.mot_de_passe_provisoire IS
  'Le mot de passe a été fixé par un tiers : son porteur doit le remplacer avant toute autre action. Sans cela, le créateur du compte resterait en mesure d''agir au nom de son subordonné.';
COMMENT ON COLUMN users.cree_par IS
  'Qui a ouvert ce compte. Une habilitation sans auteur ne se révise pas.';

-- ---------------------------------------------------------------------------
-- 2. Nul ne s'octroie un rôle supérieur au sien
--
-- La règle vaut à la création comme à la modification, et elle vaut quelle que
-- soit la voie employée — API, script, psql. Seule la FNCT crée de la FNCT.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.controler_attribution_role() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
  -- Les migrations et les fichiers de démarrage s'exécutent hors session
  -- applicative : ils ne sont pas concernés.
  IF app.current_role_name() = 'anonyme' THEN
    RETURN NEW;
  END IF;

  IF app.is_fnct() THEN
    RETURN NEW;
  END IF;

  IF NEW.role = 'super_admin_fnct' THEN
    RAISE EXCEPTION 'ROLE_RESERVE_FNCT'
      USING ERRCODE = 'insufficient_privilege',
            HINT = 'Seule la FNCT peut créer ou promouvoir un compte national.';
  END IF;

  -- Un compte communal est nécessairement rattaché à une commune : sans
  -- rattachement, il échapperait au cloisonnement au lieu d'y être soumis.
  IF NEW.commune_id IS NULL THEN
    RAISE EXCEPTION 'COMMUNE_REQUISE'
      USING ERRCODE = 'insufficient_privilege',
            HINT = 'Un compte créé par une commune doit être rattaché à cette commune.';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.role = 'super_admin_fnct' THEN
    RAISE EXCEPTION 'ROLE_RESERVE_FNCT'
      USING ERRCODE = 'insufficient_privilege',
            HINT = 'Un compte national ne se modifie pas depuis une commune.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_controler_attribution_role ON users;
CREATE TRIGGER trg_controler_attribution_role
  BEFORE INSERT OR UPDATE OF role, commune_id ON users
  FOR EACH ROW EXECUTE FUNCTION app.controler_attribution_role();

COMMENT ON FUNCTION app.controler_attribution_role() IS
  'Empêche une commune de créer ou de promouvoir un compte national. Posé en déclencheur et non dans l''API : une règle contournable par une autre requête n''en est pas une.';

-- ---------------------------------------------------------------------------
-- 3. Lecture des comptes
--
-- La politique de lecture existante autorise déjà un administrateur à voir les
-- comptes de ses communes (migration 027). On la laisse telle quelle ; ce qui
-- manquait était la possibilité d'en CRÉER depuis l'application.
--
-- La suppression reste logique : un compte effacé emporterait avec lui
-- l'imputabilité de tout ce qu'il a saisi.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS users_update ON users;
CREATE POLICY users_update ON users FOR UPDATE
  USING (
    deleted_at IS NULL
    AND (
      app.can_write_commune(commune_id)
      -- Chacun peut modifier son propre compte : c'est ce qui permet de
      -- remplacer un mot de passe provisoire sans dépendre d'un tiers.
      OR id = app.current_user_id()
    )
  )
  WITH CHECK (app.can_write_commune(commune_id) OR id = app.current_user_id());

-- ---------------------------------------------------------------------------
-- 4. La connexion doit savoir si le mot de passe est provisoire
--
-- Sans cela, l'agent qui reçoit son mot de passe dicté par son cadre pourrait
-- le garder indéfiniment, et le cadre resterait durablement en mesure d'agir
-- en son nom. La colonne remonte donc jusqu'à l'écran de connexion.
--
-- La suppression logique entre aussi dans cette porte : un compte supprimé
-- restait connectable, puisque la fonction ne regardait que « is_active ».
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS app.find_user_for_login(text);

CREATE FUNCTION app.find_user_for_login(p_email text)
  RETURNS TABLE (
    id uuid, email text, password_hash text, full_name text,
    role text, commune_id text, is_active boolean,
    mot_de_passe_provisoire boolean
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$ SELECT u.id, u.email, u.password_hash, u.full_name, u.role, u.commune_id,
          (u.is_active AND u.deleted_at IS NULL) AS is_active,
          u.mot_de_passe_provisoire
     FROM users u
    WHERE u.email = lower(p_email) $$;

GRANT EXECUTE ON FUNCTION app.find_user_for_login(text) TO siipi_app;

-- Horodatage de la dernière connexion : c'est ce qui permet à un cadre de voir
-- qu'un compte ouvert il y a six mois n'a jamais servi, et de le fermer.
CREATE OR REPLACE FUNCTION app.enregistrer_connexion(p_user uuid) RETURNS void
  LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS
$$ UPDATE users SET derniere_connexion = now() WHERE id = p_user $$;

GRANT EXECUTE ON FUNCTION app.enregistrer_connexion(uuid) TO siipi_app;
