-- ===========================================================================
-- Migration 045 — Jalon 3 : Contacts (TDR §3.2.7) et versionnement des
-- rapports et études (TDR §3.2.9, C3.6)
--
-- CONTACTS. L'annuaire de travail d'une commune : l'interlocuteur à l'ANGeD,
-- au gouvernorat, chez le prestataire, à l'association de quartier, chez le
-- fournisseur de conteneurs. Ce ne sont pas des comptes de la plateforme —
-- ces personnes n'y ont pas accès — mais des fiches, comme l'auteur déclaré
-- d'un rapport ou un collecteur agréé.
--
-- Des données personnelles de tiers (nom, téléphone, courriel) : la lecture
-- est donc réservée à la commune qui les tient et à la FNCT. Un prestataire
-- rattaché lit les circuits et les réclamations de la commune
-- (app.can_read_commune), mais pas son carnet d'adresses — rien dans sa
-- mission ne l'exige (décret-loi 2022-54, principe de minimisation).
--
-- VERSIONNEMENT. Une version 2 d'un rapport est une NOUVELLE ligne de
-- `rapports_etudes`, rattachée à la première par `document_id` et numérotée
-- par `version`. La version 1 n'est jamais écrasée : elle reste consultable,
-- datée (created_at) et imputée (depose_par). Même table plutôt qu'une table
-- de versions à part : le cloisonnement (RLS de la migration 043), la
-- suppression logique et le dépôt de fichier s'appliquent déjà à chaque
-- ligne, sans rien dupliquer.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Contacts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS contacts (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id    TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,

    nom_complet   TEXT NOT NULL,
    organisation  TEXT,
    fonction      TEXT,
    categorie     TEXT NOT NULL DEFAULT 'autre',
    telephone     TEXT,
    email         TEXT,
    notes         TEXT,

    created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at    TIMESTAMPTZ,
    deleted_by    UUID REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT contacts_categorie_valide CHECK (categorie IN (
      'administration', 'prestataire', 'association', 'fournisseur', 'elu', 'autre')),
    CONSTRAINT contacts_nom_non_vide CHECK (length(trim(nom_complet)) >= 2),
    -- Une fiche sans aucun moyen de joindre la personne n'est pas un contact.
    CONSTRAINT contacts_joignable CHECK (telephone IS NOT NULL OR email IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_contacts_commune
  ON contacts (commune_id, nom_complet) WHERE deleted_at IS NULL;

COMMENT ON TABLE contacts IS
  'Annuaire de travail d''une commune (TDR §3.2.7) : interlocuteurs externes, sans compte sur la plateforme. Lecture réservée à la commune et à la FNCT — un prestataire rattaché n''y a pas accès (minimisation, décret-loi 2022-54).';

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts FORCE  ROW LEVEL SECURITY;

-- can_write_commune et non can_read_commune : ce dernier ouvre aussi la
-- lecture aux prestataires rattachés, ce qu'on ne veut pas ici.
DROP POLICY IF EXISTS contacts_select ON contacts;
CREATE POLICY contacts_select ON contacts FOR SELECT
  USING (deleted_at IS NULL AND app.can_write_commune(commune_id));

DROP POLICY IF EXISTS contacts_insert ON contacts;
CREATE POLICY contacts_insert ON contacts FOR INSERT
  WITH CHECK (app.can_write_commune(commune_id));

DROP POLICY IF EXISTS contacts_update ON contacts;
CREATE POLICY contacts_update ON contacts FOR UPDATE
  USING (deleted_at IS NULL AND app.can_write_commune(commune_id))
  WITH CHECK (app.can_write_commune(commune_id));

GRANT SELECT, INSERT, UPDATE ON contacts TO siipi_app;
REVOKE DELETE, TRUNCATE ON contacts FROM siipi_app;

DROP TRIGGER IF EXISTS trg_audit_contacts ON contacts;
CREATE TRIGGER trg_audit_contacts AFTER INSERT OR UPDATE OR DELETE ON contacts
  FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement();

DROP TRIGGER IF EXISTS trg_contacts_updated_at ON contacts;
CREATE TRIGGER trg_contacts_updated_at BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION zones_collecte_set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Versionnement des rapports et études
-- ---------------------------------------------------------------------------

ALTER TABLE rapports_etudes ADD COLUMN IF NOT EXISTS document_id UUID;
ALTER TABLE rapports_etudes ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Chaque rapport existant devient la version 1 de son propre document.
UPDATE rapports_etudes SET document_id = id WHERE document_id IS NULL;
ALTER TABLE rapports_etudes ALTER COLUMN document_id SET NOT NULL;

ALTER TABLE rapports_etudes DROP CONSTRAINT IF EXISTS rapports_etudes_version_unique;
ALTER TABLE rapports_etudes ADD  CONSTRAINT rapports_etudes_version_unique UNIQUE (document_id, version);
ALTER TABLE rapports_etudes DROP CONSTRAINT IF EXISTS rapports_etudes_version_positive;
ALTER TABLE rapports_etudes ADD  CONSTRAINT rapports_etudes_version_positive CHECK (version >= 1);

CREATE INDEX IF NOT EXISTS idx_rapports_etudes_document
  ON rapports_etudes (document_id, version DESC);

COMMENT ON COLUMN rapports_etudes.document_id IS
  'Identifiant commun à toutes les versions d''un même document : l''id de sa version 1.';
COMMENT ON COLUMN rapports_etudes.version IS
  'Numéro de version, à partir de 1. Une nouvelle version est une nouvelle ligne : la précédente n''est jamais écrasée.';

-- Garde-fous tenus par la base et non par la route : une version 1 porte son
-- propre id comme document ; une version suivante rattache un document qui
-- existe, DANS LA MÊME COMMUNE — sans quoi une commune pourrait greffer sa
-- version sur le document d'une autre. SECURITY DEFINER : la vérification
-- doit voir la version 1 même si l'appelant n'y a plus accès par RLS.
CREATE OR REPLACE FUNCTION app.controler_version_rapport() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_commune text;
BEGIN
  IF NEW.document_id IS NULL THEN
    NEW.document_id := NEW.id;
  END IF;

  IF NEW.document_id = NEW.id THEN
    IF NEW.version <> 1 THEN
      RAISE EXCEPTION 'VERSION_INVALIDE: la première version d''un document est la version 1';
    END IF;
    RETURN NEW;
  END IF;

  SELECT commune_id INTO v_commune FROM rapports_etudes WHERE id = NEW.document_id;
  IF v_commune IS NULL THEN
    RAISE EXCEPTION 'DOCUMENT_INCONNU: %', NEW.document_id;
  END IF;
  IF v_commune <> NEW.commune_id THEN
    RAISE EXCEPTION 'DOCUMENT_AUTRE_COMMUNE' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rapports_etudes_version ON rapports_etudes;
CREATE TRIGGER trg_rapports_etudes_version BEFORE INSERT ON rapports_etudes
  FOR EACH ROW EXECUTE FUNCTION app.controler_version_rapport();

-- Le numéro suivant, compté sur TOUTES les versions — retirées comprises,
-- que la RLS cache à l'appelant : un numéro déjà attribué ne se réattribue
-- jamais, sans quoi la « version 3 » citée dans un courrier pourrait désigner
-- deux fichiers différents. N'expose qu'un entier, rien du contenu.
CREATE OR REPLACE FUNCTION app.prochaine_version_rapport(p_document uuid) RETURNS integer
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$ SELECT COALESCE(max(version), 0) + 1 FROM rapports_etudes WHERE document_id = p_document $$;

GRANT EXECUTE ON FUNCTION app.prochaine_version_rapport(uuid) TO siipi_app;

-- ---------------------------------------------------------------------------
-- 3. Retrait logique : app.supprimer() s'ouvre aux contacts.
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
                     'five_axis_scores', 'circuits', 'controles_terrain',
                     'declarations_passage', 'incidents', 'annonces_collecte',
                     'collecteurs_agrees', 'demandes_enlevement',
                     'personnel', 'fichiers', 'points_suggeres',
                     'rapports_etudes', 'contacts') THEN
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
