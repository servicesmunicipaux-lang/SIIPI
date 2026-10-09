-- ===========================================================================
-- Migration 067 — Production, formation, développement (décision FNCT D-FNCT-5,
-- 9 octobre 2026)
--
-- LA CONTRAINTE. « Aucun compte de démonstration ne doit être accessible sur
-- une instance de production, même par erreur de configuration. » Une variable
-- d'environnement est une configuration : elle s'oublie, se recopie d'un
-- serveur à l'autre, se corrige « pour voir ». La base, elle, sait ce qu'elle
-- a été. C'est donc ELLE qui garde la nature de l'instance :
--
--   developpement — l'état d'une base neuve ; tout est permis, comme avant ;
--   production    — fixée la première fois que la base est servie en
--                   production ; DÉFINITIVE. Les comptes de démonstration y
--                   sont désactivés, la connexion ne les trouve plus, et la base
--                   refuse qu'on les réactive ;
--   formation     — fixée la première fois que la base est servie en mode
--                   formation ; DÉFINITIVE. Comptes de démonstration permis,
--                   bandeau rouge permanent ; jamais servie en production.
--
-- Une base de production servie par erreur avec FORMATION=true, ou avec une
-- configuration de développement, reste une base de production : l'API refuse
-- de démarrer dans le premier cas, et dans le second refuse les comptes de
-- démonstration comme en production.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS instance_siipi (
    id         BOOLEAN PRIMARY KEY DEFAULT true,
    nature     TEXT NOT NULL DEFAULT 'developpement',
    fixee_le   TIMESTAMPTZ,
    CONSTRAINT instance_ligne_unique CHECK (id),
    CONSTRAINT instance_nature_valide CHECK (nature IN ('developpement', 'formation', 'production')),
    CONSTRAINT instance_date_fixee CHECK (nature = 'developpement' OR fixee_le IS NOT NULL)
);

INSERT INTO instance_siipi (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE instance_siipi IS
  'Nature de l''instance servie par cette base (D-FNCT-5) : developpement, formation ou production. Une seule ligne. Production et formation sont définitives : une base de production ne redevient jamais autre chose, une base de formation ne sert jamais en production.';

CREATE OR REPLACE FUNCTION app.proteger_nature_instance() RETURNS trigger
  LANGUAGE plpgsql AS
$fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'NATURE_INSTANCE_DEFINITIVE: la nature de l''instance ne s''efface pas.';
  END IF;
  IF OLD.nature <> 'developpement' AND NEW.nature IS DISTINCT FROM OLD.nature THEN
    RAISE EXCEPTION 'NATURE_INSTANCE_DEFINITIVE: cette base est une base de %, définitivement.', OLD.nature;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_proteger_nature_instance ON instance_siipi;
CREATE TRIGGER trg_proteger_nature_instance BEFORE UPDATE OR DELETE ON instance_siipi
  FOR EACH ROW EXECUTE FUNCTION app.proteger_nature_instance();

DROP TRIGGER IF EXISTS trg_audit_instance_siipi ON instance_siipi;
CREATE TRIGGER trg_audit_instance_siipi AFTER INSERT OR UPDATE ON instance_siipi
  FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement();

-- L'application lit la nature ; elle ne l'écrit pas.
ALTER TABLE instance_siipi ENABLE ROW LEVEL SECURITY;
ALTER TABLE instance_siipi FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS instance_siipi_select ON instance_siipi;
CREATE POLICY instance_siipi_select ON instance_siipi FOR SELECT USING (true);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON instance_siipi FROM siipi_app;
GRANT SELECT ON instance_siipi TO siipi_app;

CREATE OR REPLACE FUNCTION app.nature_instance() RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$ SELECT coalesce((SELECT nature FROM instance_siipi WHERE id), 'developpement') $$;
GRANT EXECUTE ON FUNCTION app.nature_instance() TO siipi_app;

-- ---------------------------------------------------------------------------
-- Les comptes de démonstration, désignés en base
-- ---------------------------------------------------------------------------

ALTER TABLE users ADD COLUMN IF NOT EXISTS compte_demonstration BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN users.compte_demonstration IS
  'Compte créé par le jeu de démonstration, au mot de passe publié avec le code (D-FNCT-5). Sur une instance de production : désactivé, introuvable à la connexion, et sa réactivation est refusée par la base.';

-- La liste est celle de src/motDePassePublic.ts (COMPTES_DE_DEMONSTRATION) ; le
-- seed marque lui-même les comptes qu'il crée, cette ligne rattrape les bases
-- existantes.
UPDATE users SET compte_demonstration = true
 WHERE email IN ('admin.national@siipi.tn', 'directeur.marsa@siipi.tn', 'directeur.sfax@siipi.tn',
                 'prestataire.marsa@siipi.tn', 'directeur.houmtsouk@siipi.tn', 'directeur.midoun@siipi.tn',
                 'directeur.ajim@siipi.tn', 'prestataire.houmtsouk@siipi.tn', 'prestataire.midoun@siipi.tn',
                 'prestataire.ajim@siipi.tn', 'citoyen.demo@siipi.tn')
   AND NOT compte_demonstration;

CREATE OR REPLACE FUNCTION app.refuser_demonstration_en_production() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$fn$
BEGIN
  IF NEW.compte_demonstration AND NEW.is_active AND app.nature_instance() = 'production' THEN
    RAISE EXCEPTION 'COMPTE_DEMONSTRATION_EN_PRODUCTION: un compte de démonstration ne s''active pas sur une instance de production (D-FNCT-5).';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_refuser_demonstration_en_production ON users;
CREATE TRIGGER trg_refuser_demonstration_en_production
  BEFORE INSERT OR UPDATE OF is_active, compte_demonstration ON users
  FOR EACH ROW EXECUTE FUNCTION app.refuser_demonstration_en_production();

-- ---------------------------------------------------------------------------
-- Fixer la nature : réservé au serveur (aucun droit pour l'application)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.fixer_nature_instance(p_nature text) RETURNS text
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS
$fn$
DECLARE
  v_actuelle text := app.nature_instance();
BEGIN
  IF p_nature NOT IN ('formation', 'production') THEN
    RAISE EXCEPTION 'NATURE_INSTANCE_INVALIDE: seules « formation » et « production » se fixent.';
  END IF;
  IF v_actuelle = p_nature THEN
    RETURN v_actuelle;
  END IF;
  -- Le déclencheur refuse de quitter production ou formation.
  UPDATE instance_siipi SET nature = p_nature, fixee_le = now() WHERE id;
  IF p_nature = 'production' THEN
    UPDATE users SET is_active = false, updated_at = now()
     WHERE compte_demonstration AND is_active;
  END IF;
  RETURN p_nature;
END;
$fn$;

REVOKE ALL ON FUNCTION app.fixer_nature_instance(text) FROM PUBLIC;

COMMENT ON FUNCTION app.fixer_nature_instance(text) IS
  'Fixe la nature de l''instance au premier démarrage en production ou en formation. Définitif. En production, désactive les comptes de démonstration. Appelée par le serveur (src/instance.ts), jamais par l''application.';

-- ---------------------------------------------------------------------------
-- La connexion : en production, un compte de démonstration n'existe pas
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS app.find_user_for_login(text);

CREATE FUNCTION app.find_user_for_login(p_email text)
  RETURNS TABLE (
    id uuid, email text, password_hash text, full_name text,
    role text, commune_id text, is_active boolean,
    mot_de_passe_provisoire boolean, preferences jsonb, compte_demonstration boolean
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$ SELECT u.id, u.email, u.password_hash, u.full_name, u.role, u.commune_id,
          (u.is_active AND u.deleted_at IS NULL) AS is_active,
          u.mot_de_passe_provisoire, u.preferences, u.compte_demonstration
     FROM users u
    WHERE u.email = lower(p_email)
      AND NOT (u.compte_demonstration AND app.nature_instance() = 'production') $$;

GRANT EXECUTE ON FUNCTION app.find_user_for_login(text) TO siipi_app;
