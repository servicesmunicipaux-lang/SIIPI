-- =============================================================================
-- 102 — Jalon G, lot G2b : l'import des établissements (liste TCL, open data)
--
-- SPEC_G § 3.2 ; décisions du 4 novembre 2026 (G-4 : l'import TCL est la base de
-- départ du recensement) et du 10 novembre 2026 : la commune dépose son fichier
-- TEL QU'IL EST ; l'écran propose la correspondance de ses colonnes, la commune
-- la corrige, et SIIPI la garde par commune et par type de fichier.
--
-- Trois tables, une colonne :
--   - imports_etablissements : chaque import validé, avec l'empreinte de son
--     fichier, sa correspondance et ses comptes ; un jeu open data porte sa
--     LICENCE et son PRODUCTEUR, sans quoi il ne s'importe pas ;
--   - modeles_import_etablissements : la correspondance des colonnes retenue, une
--     par commune et par type de fichier, proposée à l'import suivant ;
--   - correspondances_activites : l'activité du fichier → la catégorie de la
--     liste nationale, par commune ; une activité n'est jamais devinée ;
--   - commerces.import_id, import_ligne : l'import et la ligne d'où vient un
--     établissement. Relancer le même fichier ne recrée pas ce qu'il a déjà créé.
--
-- Rien ne s'efface : un import reste au journal, une correspondance se corrige
-- (l'ancienne valeur reste au journal d'audit), un modèle se remplace.
-- Le directeur écrit ; la FNCT lit ; un prestataire ne voit rien.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Le journal des imports
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS imports_etablissements (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id          TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    source              TEXT NOT NULL,
    nom_fichier         TEXT NOT NULL,
    empreinte_fichier   TEXT NOT NULL,
    licence             TEXT,
    producteur          TEXT,
    url_source          TEXT,
    precision_declaree  NUMERIC(7, 1),
    correspondance      JSONB NOT NULL,
    nb_crees            INTEGER NOT NULL DEFAULT 0,
    nb_a_verifier       INTEGER NOT NULL DEFAULT 0,
    nb_rattaches        INTEGER NOT NULL DEFAULT 0,
    nb_inchanges        INTEGER NOT NULL DEFAULT 0,
    nb_sans_categorie   INTEGER NOT NULL DEFAULT 0,
    nb_erreurs          INTEGER NOT NULL DEFAULT 0,
    saisi_par           UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    provenance          TEXT NOT NULL DEFAULT 'reel',
    deleted_at          TIMESTAMPTZ,
    deleted_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT imports_etab_source CHECK (source IN ('import_tcl', 'open_data')),
    CONSTRAINT imports_etab_empreinte CHECK (empreinte_fichier ~ '^[0-9a-f]{64}$'),
    CONSTRAINT imports_etab_nom_fichier CHECK (length(btrim(nom_fichier)) BETWEEN 1 AND 255),
    -- Un jeu open data ne s'importe pas sans sa licence ni son producteur : une
    -- donnée réutilisée dit d'où elle vient et à quelles conditions.
    CONSTRAINT imports_etab_licence CHECK (
      source <> 'open_data'
      OR (length(btrim(COALESCE(licence, ''))) BETWEEN 2 AND 200 AND length(btrim(COALESCE(producteur, ''))) BETWEEN 2 AND 200)),
    CONSTRAINT imports_etab_url CHECK (url_source IS NULL OR (url_source ~ '^https?://' AND length(url_source) <= 500)),
    CONSTRAINT imports_etab_precision CHECK (precision_declaree IS NULL OR (precision_declaree > 0 AND precision_declaree <= 1000)),
    CONSTRAINT imports_etab_comptes CHECK (
      nb_crees >= 0 AND nb_a_verifier >= 0 AND nb_rattaches >= 0 AND nb_inchanges >= 0 AND nb_sans_categorie >= 0 AND nb_erreurs >= 0),
    CONSTRAINT imports_etab_provenance CHECK (provenance IN ('reel', 'simule'))
);
CREATE INDEX IF NOT EXISTS idx_imports_etab_commune ON imports_etablissements (commune_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_imports_etab_empreinte ON imports_etablissements (commune_id, empreinte_fichier);

-- Un import ne disparaît qu'avec sa commune, où ses établissements partent aussi :
-- « SET NULL » heurterait le gel de l'import et la contrainte de sa ligne.
ALTER TABLE commerces ADD COLUMN IF NOT EXISTS import_id UUID REFERENCES imports_etablissements(id) ON DELETE CASCADE;
ALTER TABLE commerces ADD COLUMN IF NOT EXISTS import_ligne INTEGER;
ALTER TABLE commerces DROP CONSTRAINT IF EXISTS commerces_import_ligne;
ALTER TABLE commerces ADD CONSTRAINT commerces_import_ligne
  CHECK ((import_id IS NULL) = (import_ligne IS NULL) AND (import_ligne IS NULL OR import_ligne >= 2));
CREATE INDEX IF NOT EXISTS idx_commerces_import ON commerces (import_id) WHERE import_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. La correspondance des colonnes, gardée par commune et par type de fichier
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS modeles_import_etablissements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id      TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    source          TEXT NOT NULL,
    correspondance  JSONB NOT NULL,
    saisi_par       UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    provenance      TEXT NOT NULL DEFAULT 'reel',
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT modeles_import_source CHECK (source IN ('import_tcl', 'open_data')),
    CONSTRAINT modeles_import_objet CHECK (jsonb_typeof(correspondance) = 'object'),
    CONSTRAINT modeles_import_provenance CHECK (provenance IN ('reel', 'simule'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_modeles_import ON modeles_import_etablissements (commune_id, source) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3. L'activité du fichier → la catégorie de la liste nationale
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS correspondances_activites (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id           TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    -- La forme comparée (sans accent, casse ni ponctuation), calculée par l'API ;
    -- `activite` garde l'activité telle que le fichier l'écrit.
    activite_forme       TEXT NOT NULL,
    activite             TEXT NOT NULL,
    categorie_activite   TEXT NOT NULL,
    saisi_par            UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    provenance           TEXT NOT NULL DEFAULT 'reel',
    deleted_at           TIMESTAMPTZ,
    deleted_by           UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT corresp_activite_forme CHECK (length(activite_forme) BETWEEN 1 AND 200),
    CONSTRAINT corresp_activite_texte CHECK (length(btrim(activite)) BETWEEN 1 AND 200),
    CONSTRAINT corresp_activite_provenance CHECK (provenance IN ('reel', 'simule'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_correspondances_activites
  ON correspondances_activites (commune_id, activite_forme) WHERE deleted_at IS NULL;

-- La catégorie se choisit dans la liste nationale du jour, quand elle est posée
-- ou changée — jamais relue ensuite (une catégorie fermée plus tard ne réécrit
-- pas la correspondance : l'import dit alors qu'elle n'est plus en vigueur).
CREATE OR REPLACE FUNCTION app.controler_correspondance_activite() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'CORRESPONDANCE_JAMAIS_SUPPRIMEE: une correspondance se corrige, elle ne se supprime pas.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.activite_forme IS DISTINCT FROM OLD.activite_forme OR NEW.commune_id IS DISTINCT FROM OLD.commune_id) THEN
    RAISE EXCEPTION 'CORRESPONDANCE_ACTIVITE_FIGEE: une correspondance porte sur une activité ; pour une autre activité, une autre correspondance.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF (TG_OP = 'INSERT' OR NEW.categorie_activite IS DISTINCT FROM OLD.categorie_activite)
     AND NOT EXISTS (SELECT 1 FROM app.liste_nationale('categories_activite_assimiles', app.jour_tunis()) e
                      WHERE e.code = NEW.categorie_activite) THEN
    RAISE EXCEPTION 'CATEGORIE_INCONNUE: « % » n''est pas une catégorie d''activité en vigueur (liste nationale de la FNCT).', NEW.categorie_activite
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_controler_correspondance_activite ON correspondances_activites;
CREATE TRIGGER trg_controler_correspondance_activite BEFORE INSERT OR UPDATE ON correspondances_activites
  FOR EACH ROW EXECUTE FUNCTION app.controler_correspondance_activite();

-- Un modèle se remplace (c'est son objet) ; il ne change pas de commune ni de type.
CREATE OR REPLACE FUNCTION app.controler_modele_import() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.commune_id IS DISTINCT FROM OLD.commune_id OR NEW.source IS DISTINCT FROM OLD.source
                           OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at) THEN
    RAISE EXCEPTION 'MODELE_FIGE: un modèle reste celui de sa commune et de son type de fichier.' USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_controler_modele_import ON modeles_import_etablissements;
CREATE TRIGGER trg_controler_modele_import BEFORE INSERT OR UPDATE ON modeles_import_etablissements
  FOR EACH ROW EXECUTE FUNCTION app.controler_modele_import();

-- Un établissement importé garde son import et sa ligne : posés à l'inscription,
-- jamais réécrits (la source est figée par 099 pour la même raison).
CREATE OR REPLACE FUNCTION app.controler_import_commerce() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.import_id IS DISTINCT FROM OLD.import_id OR NEW.import_ligne IS DISTINCT FROM OLD.import_ligne) THEN
    RAISE EXCEPTION 'IMPORT_FIGE: l''import d''où vient un établissement est celui de son inscription.' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.import_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM imports_etablissements i
        WHERE i.id = NEW.import_id AND i.commune_id = NEW.commune_id AND i.source = NEW.source_creation) THEN
    RAISE EXCEPTION 'IMPORT_AUTRE: cet import n''est pas un import de cette commune, de ce type de fichier.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_controler_import_commerce ON commerces;
CREATE TRIGGER trg_controler_import_commerce BEFORE INSERT OR UPDATE ON commerces
  FOR EACH ROW EXECUTE FUNCTION app.controler_import_commerce();

-- Un import validé est un fait : il ne se modifie pas.
CREATE OR REPLACE FUNCTION app.refuser_modification_import() RETURNS trigger
  LANGUAGE plpgsql AS
$$
BEGIN
  RAISE EXCEPTION 'IMPORT_JOURNALISE: un import validé reste tel qu''il a été fait.' USING ERRCODE = 'check_violation';
END
$$;
DROP TRIGGER IF EXISTS trg_import_journalise ON imports_etablissements;
CREATE TRIGGER trg_import_journalise BEFORE UPDATE ON imports_etablissements
  FOR EACH ROW EXECUTE FUNCTION app.refuser_modification_import();

-- ---------------------------------------------------------------------------
-- 4. Provenance, audit, cloisonnement
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['imports_etablissements', 'modeles_import_etablissements', 'correspondances_activites'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_provenance ON %I', t);
    EXECUTE format('CREATE TRIGGER trg_provenance BEFORE INSERT OR UPDATE OF provenance ON %I FOR EACH ROW EXECUTE FUNCTION app.controler_provenance()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%s ON %I', t, t);
    EXECUTE format('CREATE TRIGGER trg_audit_%s AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement()', t, t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (deleted_at IS NULL AND app.can_write_commune(commune_id))', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (app.peut_emettre_document(commune_id))', t || '_insert', t);
    EXECUTE format('REVOKE DELETE, TRUNCATE ON %I FROM siipi_app', t);
  END LOOP;
END $$;

-- Le journal des imports ne se modifie pas : aucune politique UPDATE, aucun droit.
GRANT SELECT, INSERT ON imports_etablissements TO siipi_app;
REVOKE UPDATE ON imports_etablissements FROM siipi_app;

-- Le modèle et la correspondance s'enregistrent par un upsert : la politique
-- UPDATE est exigée même quand aucun conflit ne survient (leçon de la v0.4.0).
DROP POLICY IF EXISTS modeles_import_etablissements_update ON modeles_import_etablissements;
CREATE POLICY modeles_import_etablissements_update ON modeles_import_etablissements FOR UPDATE
  USING (deleted_at IS NULL AND app.peut_emettre_document(commune_id)) WITH CHECK (app.peut_emettre_document(commune_id));
GRANT SELECT, INSERT ON modeles_import_etablissements TO siipi_app;
-- Les droits par défaut (013) donnent UPDATE sur toute la table : on ne garde que les colonnes qui se corrigent.
REVOKE UPDATE ON modeles_import_etablissements FROM siipi_app;
GRANT UPDATE (correspondance, saisi_par) ON modeles_import_etablissements TO siipi_app;

DROP POLICY IF EXISTS correspondances_activites_update ON correspondances_activites;
CREATE POLICY correspondances_activites_update ON correspondances_activites FOR UPDATE
  USING (deleted_at IS NULL AND app.peut_emettre_document(commune_id)) WITH CHECK (app.peut_emettre_document(commune_id));
GRANT SELECT, INSERT ON correspondances_activites TO siipi_app;
-- Les droits par défaut (013) donnent UPDATE sur toute la table : on ne garde que les colonnes qui se corrigent.
REVOKE UPDATE ON correspondances_activites FROM siipi_app;
GRANT UPDATE (activite, categorie_activite, saisi_par) ON correspondances_activites TO siipi_app;

-- ---------------------------------------------------------------------------
-- 5. Ce que l'administrateur lira dans dix ans
-- ---------------------------------------------------------------------------
COMMENT ON TABLE imports_etablissements IS
  'Chaque import validé d''une liste d''établissements (TCL ou open data, lot G2b) : fichier (nom, empreinte SHA-256), correspondance des colonnes, comptes. Un jeu open data porte sa licence et son producteur. Ne se modifie pas.';
COMMENT ON COLUMN imports_etablissements.empreinte_fichier IS 'SHA-256 des octets du fichier : relancer le même fichier reconnaît les lignes déjà écrites (commerces.import_ligne).';
COMMENT ON COLUMN imports_etablissements.precision_declaree IS 'La précision (m) que la commune déclare pour les positions d''un fichier qui ne la porte pas ; sans elle, ces positions sont laissées de côté.';
COMMENT ON COLUMN imports_etablissements.correspondance IS 'Champ de SIIPI → en-tête du fichier, telle que la commune l''a validée.';
COMMENT ON COLUMN imports_etablissements.nb_sans_categorie IS 'Lignes laissées en attente : leur activité n''avait pas encore de catégorie.';
COMMENT ON TABLE modeles_import_etablissements IS
  'La correspondance des colonnes retenue par la commune, une par type de fichier (import_tcl, open_data) ; proposée à l''import suivant, remplacée à chaque import validé.';
COMMENT ON TABLE correspondances_activites IS
  'L''activité telle que le fichier de la commune l''écrit → la catégorie d''activité de la liste nationale. Une par activité et par commune ; se corrige, ne se supprime pas. Une activité sans correspondance n''est jamais devinée.';
COMMENT ON COLUMN correspondances_activites.activite_forme IS 'L''activité sans accent, casse ni ponctuation (calculée par l''API) : la clé de la correspondance.';
COMMENT ON COLUMN commerces.import_id IS 'L''import d''où vient l''établissement (lot G2b) ; posé à l''inscription, jamais réécrit.';
COMMENT ON COLUMN commerces.import_ligne IS 'La ligne du fichier importé (la première ligne de données est la 2).';
