-- ===========================================================================
-- Migration 048 — Jalon 7, lot 1 : les paramètres (TDR §3.2.6)
--
-- B6.2 — préférences de notification et seuils ;
-- B6.4 — format de date ;
-- B6.6 — unités de mesure.
--
-- DEUX NIVEAUX, PARCE QUE CE SONT DEUX QUESTIONS DIFFÉRENTES.
--   - Ce que CHACUN préfère voir : sa langue, son format de date, ses unités,
--     les alertes qu'il veut qu'on lui remonte. C'est une affaire personnelle :
--     le directeur et son adjoint n'ont pas à se mettre d'accord sur le fait
--     d'afficher les tonnages en tonnes ou en kilogrammes. Rangé sur le compte
--     (users.preferences), il suit la personne d'un poste à l'autre.
--   - Ce que LA COMMUNE décide : au bout de combien de jours une réclamation
--     non traitée devient un retard, quel préavis par défaut pour l'entretien
--     des engins. C'est une règle de service, la même pour toute l'équipe, et
--     elle se lit dans les alertes de tous (parametres_commune).
--
-- UN SEUIL QUI NE DÉCLENCHE RIEN N'EST PAS UN SEUIL. Les seuils de la commune
-- alimentent donc une nouvelle fonction de contrôle, branchée sur le panneau
-- « À vérifier » du constat du matin (migration 036, « une ligne de plus à
-- l'union ») : réclamations en attente au-delà du délai, entretiens en retard,
-- actions planifiées dépassées. Et les préférences d'alerte de chacun règlent
-- ce que ce panneau lui montre.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Les préférences de chacun (B6.2, B6.4, B6.6)
-- ---------------------------------------------------------------------------

ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_preferences_objet;
ALTER TABLE users ADD  CONSTRAINT users_preferences_objet CHECK (jsonb_typeof(preferences) = 'object');

COMMENT ON COLUMN users.preferences IS
  'Préférences personnelles (TDR §3.2.6) : langue, formatDate, unites { masse, volume, surface }, alertes { domainesMasques, graviteMin }. Une clé absente vaut la valeur par défaut ; le contenu est contrôlé par l''API (PUT /comptes/moi/preferences).';

-- La connexion rend les préférences avec le compte : sans elles, l'écran
-- s'afficherait d'abord dans les formats par défaut, puis changerait sous les
-- yeux de la personne au premier rechargement.
DROP FUNCTION IF EXISTS app.find_user_for_login(text);

CREATE FUNCTION app.find_user_for_login(p_email text)
  RETURNS TABLE (
    id uuid, email text, password_hash text, full_name text,
    role text, commune_id text, is_active boolean,
    mot_de_passe_provisoire boolean, preferences jsonb
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$ SELECT u.id, u.email, u.password_hash, u.full_name, u.role, u.commune_id,
          (u.is_active AND u.deleted_at IS NULL) AS is_active,
          u.mot_de_passe_provisoire, u.preferences
     FROM users u
    WHERE u.email = lower(p_email) $$;

GRANT EXECUTE ON FUNCTION app.find_user_for_login(text) TO siipi_app;

-- ---------------------------------------------------------------------------
-- 2. Les seuils de la commune (B6.2)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS parametres_commune (
    -- Un identifiant propre, pour que le journal d'audit rattache chaque
    -- changement de règle à sa ligne.
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id                TEXT NOT NULL UNIQUE REFERENCES communes(id) ON DELETE CASCADE,

    -- Une réclamation reçue, assignée ou en cours depuis plus de N jours
    -- remonte dans « À vérifier ».
    delai_reclamation_jours   INTEGER NOT NULL DEFAULT 7,
    -- Préavis proposé par défaut à chaque nouveau plan d'entretien (Jalon 5) :
    -- « à prévoir » à 1 000 km ou 30 jours de l'échéance.
    seuil_entretien_km        INTEGER NOT NULL DEFAULT 1000,
    seuil_entretien_jours     INTEGER NOT NULL DEFAULT 30,
    -- Une action planifiée sur des points (Jalon 6) dont la date est passée
    -- remonte dans « À vérifier ».
    alerter_actions_retard    BOOLEAN NOT NULL DEFAULT true,

    updated_by                UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT parametres_delai_reclamation CHECK (delai_reclamation_jours BETWEEN 1 AND 90),
    CONSTRAINT parametres_seuil_km CHECK (seuil_entretien_km BETWEEN 0 AND 100000),
    CONSTRAINT parametres_seuil_jours CHECK (seuil_entretien_jours BETWEEN 0 AND 365)
);

COMMENT ON TABLE parametres_commune IS
  'Règles de service d''une commune (TDR §3.2.6, B6.2) : délai d''alerte des réclamations, préavis d''entretien par défaut, alerte des actions en retard. Sans ligne, les valeurs par défaut s''appliquent. Lecture et écriture : la commune et la FNCT.';

DROP TRIGGER IF EXISTS trg_parametres_commune_updated_at ON parametres_commune;
CREATE TRIGGER trg_parametres_commune_updated_at BEFORE UPDATE ON parametres_commune
  FOR EACH ROW EXECUTE FUNCTION zones_collecte_set_updated_at();
DROP TRIGGER IF EXISTS trg_audit_parametres_commune ON parametres_commune;
CREATE TRIGGER trg_audit_parametres_commune AFTER INSERT OR UPDATE OR DELETE ON parametres_commune
  FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement();

ALTER TABLE parametres_commune ENABLE ROW LEVEL SECURITY;
ALTER TABLE parametres_commune FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS parametres_commune_select ON parametres_commune;
CREATE POLICY parametres_commune_select ON parametres_commune FOR SELECT
  USING (app.can_write_commune(commune_id));
DROP POLICY IF EXISTS parametres_commune_insert ON parametres_commune;
CREATE POLICY parametres_commune_insert ON parametres_commune FOR INSERT
  WITH CHECK (app.can_write_commune(commune_id));
DROP POLICY IF EXISTS parametres_commune_update ON parametres_commune;
CREATE POLICY parametres_commune_update ON parametres_commune FOR UPDATE
  USING (app.can_write_commune(commune_id))
  WITH CHECK (app.can_write_commune(commune_id));

GRANT SELECT, INSERT, UPDATE ON parametres_commune TO siipi_app;
REVOKE DELETE, TRUNCATE ON parametres_commune FROM siipi_app;

-- ---------------------------------------------------------------------------
-- 3. Ce que les seuils déclenchent
--
-- Même forme que les autres fonctions de contrôle (migrations 033 à 036), et
-- même rang dans l'union. Une ligne par sujet, pas par réclamation : quarante
-- réclamations en retard font UN avis qui les compte, pas quarante lignes qui
-- noieraient les engins en panne.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.incoherences_seuils(p_commune text)
  RETURNS TABLE (
    gravite     text,
    domaine     text,   -- reclamations | parc | points
    sujet       text,
    sujet_id    text,
    constat     text,
    quoi_faire  text
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  WITH p AS (
    SELECT COALESCE(pc.delai_reclamation_jours, 7) AS delai,
           COALESCE(pc.alerter_actions_retard, true) AS actions
      FROM (SELECT 1) un
      LEFT JOIN parametres_commune pc ON pc.commune_id = p_commune
  ),
  -- Aujourd'hui à Tunis (UTC+1, sans heure d'été).
  auj AS (SELECT (now() AT TIME ZONE 'Africa/Tunis')::date AS jour),
  reclamations AS (
    SELECT count(*) AS n,
           max(extract(day FROM now() - t.created_at))::int AS plus_ancienne
      FROM tickets t, p
     WHERE t.commune_id = p_commune AND t.deleted_at IS NULL
       AND t.status IN ('recu', 'assigne', 'en_cours')
       AND t.created_at < now() - make_interval(days => p.delai)
  )

  -- 1. Les réclamations qui attendent au-delà du délai fixé par la commune.
  SELECT CASE WHEN r.plus_ancienne >= 3 * p.delai THEN 'bloquant' ELSE 'avertissement' END,
         'reclamations', 'Réclamations', NULL::text,
         format('%s réclamation(s) attendent depuis plus de %s jours (la plus ancienne : %s jours).',
                r.n, p.delai, r.plus_ancienne),
         'Les traiter ou les assigner. Le délai d''alerte se règle dans Paramètres.'
    FROM reclamations r, p
   WHERE r.n > 0

  UNION ALL

  -- 2. Les entretiens en retard (Jalon 5), comptés ici pour le constat du
  --    matin ; le détail est dans l'écran Parc.
  SELECT 'avertissement', 'parc', 'Entretien des engins', NULL::text,
         format('%s entretien(s) en retard, dont %s.', count(*),
                string_agg(DISTINCT e.registration, ', ')),
         'Voir le bandeau d''échéances de l''écran Parc, et saisir les interventions faites.'
    FROM app.echeances_entretien(p_commune) e
   WHERE e.statut = 'en_retard'
  HAVING count(*) > 0

  UNION ALL

  -- 3. Les actions planifiées sur des points (Jalon 6) dont la date est passée.
  SELECT 'avertissement', 'points', a.titre, a.id::text,
         format('Action prévue %s, toujours planifiée : %s point(s) fait(s) sur %s.',
                CASE WHEN a.date_fin IS NULL THEN 'le ' || to_char(a.date_prevue, 'DD/MM/YYYY')
                     ELSE 'jusqu''au ' || to_char(a.date_fin, 'DD/MM/YYYY') END,
                (SELECT count(*) FROM actions_points ap WHERE ap.action_id = a.id AND ap.fait_le IS NOT NULL),
                (SELECT count(*) FROM actions_points ap WHERE ap.action_id = a.id)),
         'La terminer, l''annuler, ou en reporter la date (onglet Points › Actions planifiées).'
    FROM actions_planifiees a, p, auj
   WHERE p.actions AND a.commune_id = p_commune AND a.deleted_at IS NULL
     AND a.statut = 'planifiee' AND COALESCE(a.date_fin, a.date_prevue) < auj.jour
$$;

COMMENT ON FUNCTION app.incoherences_seuils(text) IS
  'Ce que les seuils de la commune (parametres_commune) font remonter au panneau « À vérifier » : réclamations en attente au-delà du délai, entretiens en retard, actions planifiées dépassées.';

GRANT EXECUTE ON FUNCTION app.incoherences_seuils(text) TO siipi_app;

-- Une ligne de plus à l'union, comme la migration 036 l'avait prévu.
CREATE OR REPLACE FUNCTION app.incoherences_commune(p_commune text)
  RETURNS TABLE (
    gravite     text,
    domaine     text,
    sujet       text,
    sujet_id    text,
    constat     text,
    quoi_faire  text
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT gravite, domaine, sujet, sujet_id, constat, quoi_faire
    FROM (
      SELECT * FROM app.incoherences_registres(p_commune)
      UNION ALL
      SELECT * FROM app.incoherences_communication(p_commune)
      UNION ALL
      SELECT * FROM app.incoherences_pesees(p_commune)
      UNION ALL
      SELECT * FROM app.incoherences_seuils(p_commune)
    ) tout
   ORDER BY CASE gravite WHEN 'bloquant' THEN 0
                         WHEN 'avertissement' THEN 1
                         ELSE 2 END,
            domaine, sujet
$$;

GRANT EXECUTE ON FUNCTION app.incoherences_commune(text) TO siipi_app;
