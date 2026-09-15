-- ============================================================================
-- 014_journal_audit.sql
--
-- Journal d'audit de la plateforme : qui a écrit quoi, quand, et qui a
-- consulté des données personnelles de citoyens.
--
-- Deux journaux distincts, parce qu'ils répondent à deux questions
-- différentes et n'ont pas la même volumétrie :
--
--   audit_log   — toute création, modification ou suppression de données
--                 métier, avec la valeur avant et après. C'est ce qui rend le
--                 registre de pesées opposable (TDR §3.2.4, B4.5) et ce qui
--                 permet de répondre à « qui a modifié ce tonnage ? ».
--
--   access_log  — les consultations de données personnelles de citoyens par
--                 un agent municipal ou un prestataire. C'est ce qui permet
--                 de répondre à « qui a consulté les données de ce citoyen ? »
--                 au titre du décret-loi n° 2022-54.
--
-- Le journal d'écriture est alimenté par des DÉCLENCHEURS SQL, pas par le
-- code de l'API : une écriture faite directement en base, par un script ou
-- par un futur module, est tracée de la même façon. Il n'existe aucun moyen
-- de modifier une donnée sans laisser de trace.
--
-- Les deux journaux sont en ajout seul : l'API peut les lire (selon le même
-- cloisonnement que le reste), jamais les modifier ni les effacer. Seule la
-- fonction de purge, exécutée avec les droits d'administration, peut y
-- supprimer des lignes.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Paramètres de conservation
--
-- Les durées sont des PARAMÈTRES, pas des constantes écrites dans le code :
-- une révision juridique se traduit par une mise à jour de ces lignes, sans
-- migration ni redéploiement.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app_parametres (
    cle          TEXT PRIMARY KEY,
    valeur       TEXT NOT NULL,
    description  TEXT,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO app_parametres (cle, valeur, description) VALUES
  ('audit.retention_ecritures', '5 years',
   'Durée de conservation du journal des écritures. 5 ans = un mandat municipal complet : on peut toujours remonter à la mandature qui a pris une décision.'),
  ('audit.retention_acces', '1 year',
   'Durée de conservation du journal des consultations de données personnelles. Volumétrie élevée et utilité décroissante : conservation courte, conformément au principe de minimisation.')
ON CONFLICT (cle) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Journal des écritures
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS audit_log (
    id              BIGSERIAL PRIMARY KEY,
    table_name      TEXT        NOT NULL,
    record_id       TEXT,
    operation       TEXT        NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    -- Permet de cloisonner le journal lui-même : une commune ne voit que son
    -- propre historique.
    commune_id      TEXT,
    changed_by      UUID,
    changed_by_role TEXT,
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    changed_fields  TEXT[],
    old_data        JSONB,
    new_data        JSONB
);

CREATE INDEX IF NOT EXISTS idx_audit_log_table_record ON audit_log (table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_commune      ON audit_log (commune_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_auteur       ON audit_log (changed_by, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_date         ON audit_log (changed_at DESC);

COMMENT ON TABLE audit_log IS
  'Journal des écritures, alimenté par déclencheurs. En ajout seul : aucune ligne ne peut être modifiée ni supprimée par l''API.';

-- ---------------------------------------------------------------------------
-- 3. Déclencheur d'audit
--
-- SECURITY DEFINER : le déclencheur doit pouvoir écrire dans audit_log même
-- lorsque l'utilisateur courant (siipi_app) n'y a aucun droit d'écriture.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.enregistrer_changement() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_old        jsonb;
  v_new        jsonb;
  v_champs     text[];
  v_ignores    text[] := COALESCE(TG_ARGV, ARRAY[]::text[]);
  v_commune    text;
  v_record_id  text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_new := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_old := NULL;
    v_new := to_jsonb(NEW);
  ELSE
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
  END IF;

  -- Un mot de passe, même haché, n'a rien à faire dans un journal conservé
  -- cinq ans : on le retire des deux côtés de la comparaison.
  v_old := v_old - 'password_hash';
  v_new := v_new - 'password_hash';

  IF TG_OP = 'UPDATE' THEN
    SELECT COALESCE(array_agg(cle ORDER BY cle), ARRAY[]::text[])
      INTO v_champs
      FROM jsonb_object_keys(v_new) AS cle
     WHERE v_new -> cle IS DISTINCT FROM v_old -> cle;

    -- Rien n'a changé : pas de ligne de journal.
    IF array_length(v_champs, 1) IS NULL THEN
      RETURN NULL;
    END IF;

    -- Mise à jour purement télématique (position GPS, niveau de carburant...) :
    -- ces écritures peuvent arriver toutes les quelques secondes par véhicule.
    -- Les journaliser noierait l'historique métier sous le bruit machine et
    -- ferait grossir la base sans rien prouver d'utile. Le déclencheur est
    -- déclaré avec la liste des colonnes à ignorer (voir section 4).
    IF v_champs <@ v_ignores THEN
      RETURN NULL;
    END IF;
  END IF;

  v_record_id := COALESCE(v_new ->> 'id', v_old ->> 'id');

  -- Rattachement du journal à une commune, pour que chaque commune ne voie que
  -- son propre historique. La table communes n'a pas de colonne commune_id :
  -- c'est son identifiant qui joue ce rôle.
  IF TG_TABLE_NAME = 'communes' THEN
    v_commune := v_record_id;
  ELSE
    v_commune := COALESCE(v_new ->> 'commune_id', v_old ->> 'commune_id');
  END IF;

  INSERT INTO audit_log (
    table_name, record_id, operation, commune_id,
    changed_by, changed_by_role, changed_fields, old_data, new_data
  ) VALUES (
    TG_TABLE_NAME, v_record_id, TG_OP, v_commune,
    app.current_user_id(), app.current_role_name(), v_champs, v_old, v_new
  );

  RETURN NULL; -- déclencheur AFTER : la valeur de retour est ignorée
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Pose des déclencheurs sur les tables métier
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
  tables_auditees text[] := ARRAY[
    'communes', 'users', 'conteneurs', 'tickets', 'pesees_anged',
    'citoyens', 'barbechas', 'barbecha_deliveries', 'five_axis_scores',
    'zones_collecte'
  ];
BEGIN
  FOREACH t IN ARRAY tables_auditees LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$s ON %1$I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON %1$I
         FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement()', t);
  END LOOP;

  -- La flotte reçoit le même déclencheur, en ignorant les champs alimentés en
  -- continu par la télématique embarquée.
  EXECUTE 'DROP TRIGGER IF EXISTS trg_audit_vehicules ON vehicules';
  EXECUTE
    'CREATE TRIGGER trg_audit_vehicules AFTER INSERT OR UPDATE OR DELETE ON vehicules
       FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement(
         ''lat'', ''lng'', ''geom'', ''current_speed_kmh'', ''fuel_level_percent'',
         ''current_weight_tons'', ''completed_stops'', ''last_update'', ''updated_at'')';
END $$;

-- ---------------------------------------------------------------------------
-- 5. Journal des consultations de données personnelles
--
-- Alimenté par l'API (et non par un déclencheur : une lecture SQL ne dit pas
-- pour quel usage ni depuis quel écran elle a lieu).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS access_log (
    id             BIGSERIAL PRIMARY KEY,
    accessed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id        UUID,
    user_role      TEXT,
    commune_id     TEXT,
    endpoint       TEXT        NOT NULL,
    -- Citoyens dont les données ont été exposées par cette requête.
    citizen_ids    UUID[]      NOT NULL DEFAULT ARRAY[]::uuid[],
    records_count  INTEGER     NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_access_log_date    ON access_log (accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_log_user    ON access_log (user_id, accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_log_commune ON access_log (commune_id, accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_log_citizen ON access_log USING GIN (citizen_ids);

COMMENT ON TABLE access_log IS
  'Journal des consultations de données personnelles de citoyens (décret-loi 2022-54). En ajout seul.';

-- Écriture réservée à cette fonction : l'API ne peut pas insérer directement,
-- donc pas davantage falsifier une entrée.
CREATE OR REPLACE FUNCTION app.enregistrer_acces(
    p_endpoint text, p_citizen_ids uuid[], p_records_count integer
  ) RETURNS void
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  INSERT INTO access_log (user_id, user_role, commune_id, endpoint, citizen_ids, records_count)
  VALUES (app.current_user_id(), app.current_role_name(), app.current_commune(),
          p_endpoint, COALESCE(p_citizen_ids, ARRAY[]::uuid[]), COALESCE(p_records_count, 0));
$$;

-- ---------------------------------------------------------------------------
-- 6. Purge
--
-- À exécuter périodiquement (tâche planifiée sur le serveur). La fonction lit
-- les durées dans app_parametres : aucune durée n'est écrite en dur ici.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.purger_journaux()
  RETURNS TABLE (journal text, lignes_supprimees bigint)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_retention_ecritures interval;
  v_retention_acces     interval;
  v_audit  bigint;
  v_access bigint;
BEGIN
  SELECT valeur::interval INTO v_retention_ecritures FROM app_parametres WHERE cle = 'audit.retention_ecritures';
  SELECT valeur::interval INTO v_retention_acces     FROM app_parametres WHERE cle = 'audit.retention_acces';

  DELETE FROM audit_log  WHERE changed_at  < now() - v_retention_ecritures;
  GET DIAGNOSTICS v_audit = ROW_COUNT;

  DELETE FROM access_log WHERE accessed_at < now() - v_retention_acces;
  GET DIAGNOSTICS v_access = ROW_COUNT;

  RETURN QUERY VALUES ('audit_log', v_audit), ('access_log', v_access);
END;
$$;

COMMENT ON FUNCTION app.purger_journaux() IS
  'Supprime les entrées de journal au-delà des durées définies dans app_parametres. À planifier (une fois par jour suffit).';

-- ---------------------------------------------------------------------------
-- 7. Cloisonnement et droits sur les journaux
-- ---------------------------------------------------------------------------

ALTER TABLE audit_log      ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log      FORCE  ROW LEVEL SECURITY;
ALTER TABLE access_log     ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_log     FORCE  ROW LEVEL SECURITY;
ALTER TABLE app_parametres ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_parametres FORCE  ROW LEVEL SECURITY;

-- Une commune consulte son propre historique ; la FNCT consulte tout.
CREATE POLICY audit_log_select ON audit_log FOR SELECT
  USING (
    app.is_fnct()
    OR (app.current_role_name() = 'admin_commune'
        AND commune_id IS NOT NULL
        AND commune_id = app.current_commune())
  );

CREATE POLICY access_log_select ON access_log FOR SELECT
  USING (
    app.is_fnct()
    OR (app.current_role_name() = 'admin_commune'
        AND commune_id IS NOT NULL
        AND commune_id = app.current_commune())
    -- Un citoyen peut savoir qui a consulté ses propres données.
    OR (app.current_role_name() = 'citoyen'
        AND app.my_citizen_id() = ANY (citizen_ids))
  );

CREATE POLICY parametres_select ON app_parametres FOR SELECT USING (app.is_fnct());
CREATE POLICY parametres_write  ON app_parametres FOR ALL
  USING (app.is_fnct()) WITH CHECK (app.is_fnct());

-- Aucune politique INSERT / UPDATE / DELETE sur les deux journaux : même avec
-- le privilège SQL, siipi_app ne peut pas y écrire. Seuls les déclencheurs et
-- app.enregistrer_acces, exécutés avec les droits d'administration, le font.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON audit_log  FROM siipi_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON access_log FROM siipi_app;
GRANT  SELECT ON audit_log  TO siipi_app;
GRANT  SELECT ON access_log TO siipi_app;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON app_parametres FROM siipi_app;
GRANT  SELECT ON app_parametres TO siipi_app;

GRANT EXECUTE ON FUNCTION app.enregistrer_acces(text, uuid[], integer) TO siipi_app;
REVOKE EXECUTE ON FUNCTION app.purger_journaux() FROM siipi_app;
