-- ============================================================================
-- 054_commune_declaree_citoyen.sql
--
-- Étape S0 (v0.15.2) — « sa commune », pour un citoyen, est celle de son
-- adresse déclarée.
--
-- LE DÉFAUT. Deux politiques d'écriture ouvertes au citoyen — proposer un
-- point de collecte (points_suggeres, migration 042) et déposer une photo
-- (fichiers, migration 041) — exigeaient commune_id = app.current_commune(),
-- c'est-à-dire la commune portée par le COMPTE (users.commune_id). Or un
-- citoyen qui s'inscrit lui-même (POST /citizens/register) n'a pas de commune
-- sur son compte : il la déclare avec son adresse (POST /citoyen/adresse),
-- qui l'écrit sur son profil (citoyens.commune_id). Tout citoyen inscrit par
-- l'application se voyait donc refuser ces deux actions — « Action hors du
-- périmètre de votre commune » — dans la commune même où il habite.
--
-- POURQUOI PERSONNE NE L'A VU. La campagne suggestions cherchait un compte
-- citoyen existant sur la commune et, faute d'en trouver, s'arrêtait en
-- succès sans rien vérifier (« campagne sans objet », code 0). Sur une base
-- où seul le compte de démonstration existait, elle ne testait rien.
--
-- LA CORRECTION. La commune déclarée compte, À CÔTÉ de celle du compte : un
-- citoyen propose un point ou dépose une photo dans l'une ou l'autre, jamais
-- ailleurs. La fonction est SECURITY DEFINER pour lire le profil du citoyen
-- courant quelle que soit la politique de lecture de citoyens, et elle ne
-- rend que celui-là.
-- ============================================================================

CREATE OR REPLACE FUNCTION app.commune_declaree_citoyen() RETURNS TEXT
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT c.commune_id
    FROM citoyens c
   WHERE c.user_id = app.current_user_id()
     AND c.deleted_at IS NULL
$$;

COMMENT ON FUNCTION app.commune_declaree_citoyen() IS
  'Commune de l''adresse déclarée par le citoyen courant (citoyens.commune_id). Un citoyen inscrit par l''application n''a pas de commune sur son compte : c''est celle-ci qui est « sa commune ».';

GRANT EXECUTE ON FUNCTION app.commune_declaree_citoyen() TO siipi_app;

DROP POLICY IF EXISTS points_suggeres_insert ON points_suggeres;
CREATE POLICY points_suggeres_insert ON points_suggeres FOR INSERT
  WITH CHECK (
    app.can_write_commune(commune_id)
    OR (app.current_role_name() = 'citoyen'
        AND citoyen_id = app.my_citizen_id()
        AND (commune_id = app.current_commune() OR commune_id = app.commune_declaree_citoyen())
        AND statut = 'en_attente')
  );

DROP POLICY IF EXISTS fichiers_insert ON fichiers;
CREATE POLICY fichiers_insert ON fichiers FOR INSERT
  WITH CHECK (
    televerse_par = app.current_user_id()
    AND (
      app.can_write_commune(commune_id)
      OR (app.current_role_name() = 'citoyen'
          AND app.my_citizen_id() IS NOT NULL
          AND (commune_id = app.current_commune() OR commune_id = app.commune_declaree_citoyen()))
    )
  );
