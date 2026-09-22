-- ===========================================================================
-- Migration 043 — Rapports et études (TDR §3.2.9)
--
-- La feuille de route le dit sans détour : « Rien, mais le stockage de
-- fichiers est prêt à le porter. » Cette migration ouvre exactement ce qui
-- manquait — une fiche de métadonnées par document (titre, catégorie, auteur,
-- date) — et rien de plus : le dépôt des octets reste celui de la migration
-- 041, POST /fichiers, comme pour tout le reste de la plateforme.
--
-- POURQUOI UNE TABLE À PART, ET NON DES COLONNES SUR `fichiers`. La table
-- `fichiers` porte ce qui est vrai de N'IMPORTE QUEL dépôt : type, taille,
-- empreinte, visibilité. Un titre, une catégorie d'étude et un auteur
-- déclaré n'ont de sens que pour un rapport — les ajouter à `fichiers`
-- obligerait chaque photo de réclamation à porter trois colonnes vides.
-- C'est exactement le rapport qu'entretient déjà `publication_documents`
-- (migration 035) avec les pièces jointes d'un projet, et cette table suit
-- le même calque.
--
-- POURQUOI DOCX / XLSX / PPTX N'ÉTAIENT PAS DÉJÀ ACCEPTÉS. Le stockage
-- (migration 041) ne reconnaissait que des images et des PDF : un plafond de
-- 8 Mo et quatre signatures binaires suffisaient à tout ce qui existait
-- alors. Un rapport d'étude dépasse cela couramment — une présentation avec
-- quelques images intégrées franchit vite les 8 Mo. Les contraintes de
-- `fichiers` sont donc élargies ici, mais SEULEMENT pour l'usage
-- « rapport_etude » : une preuve de traitement de réclamation en .pptx n'a
-- aucun sens, et desserrer la règle pour tout le monde aurait ouvert cette
-- porte partout plutôt que là où elle sert.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Le stockage accepte désormais les documents Office, et un plafond plus haut
-- — l'un et l'autre réservés à l'usage « rapport_etude ».
-- ---------------------------------------------------------------------------

ALTER TABLE fichiers DROP CONSTRAINT IF EXISTS fichiers_usage_valide;
ALTER TABLE fichiers ADD  CONSTRAINT fichiers_usage_valide CHECK (usage IS NULL OR usage IN (
  'reclamation', 'preuve_traitement', 'constat_terrain', 'passage',
  'incident', 'suggestion_point', 'document_projet', 'enlevement',
  'rapport_etude', 'autre'));

ALTER TABLE fichiers DROP CONSTRAINT IF EXISTS fichiers_type_autorise;
ALTER TABLE fichiers ADD  CONSTRAINT fichiers_type_autorise CHECK (
  type_mime IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
  OR (usage = 'rapport_etude' AND type_mime IN (
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation')));

ALTER TABLE fichiers DROP CONSTRAINT IF EXISTS fichiers_taille_plausible;
ALTER TABLE fichiers ADD  CONSTRAINT fichiers_taille_plausible CHECK (
  taille_octets > 0
  AND taille_octets <= (CASE WHEN usage = 'rapport_etude' THEN 50 ELSE 8 END) * 1024 * 1024);

COMMENT ON CONSTRAINT fichiers_type_autorise ON fichiers IS
  'Images et PDF pour tout usage ; documents Word/Excel/PowerPoint réservés à un rapport ou une étude (usage rapport_etude) — une preuve de traitement de réclamation en .pptx n''aurait pas de sens.';
COMMENT ON CONSTRAINT fichiers_taille_plausible ON fichiers IS
  '8 Mo par défaut ; 50 Mo pour un rapport ou une étude, qui peut porter une présentation avec des images intégrées.';

-- ---------------------------------------------------------------------------
-- La fiche d'un rapport ou d'une étude.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS rapports_etudes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id      TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,

    titre           TEXT NOT NULL,
    categorie       TEXT NOT NULL DEFAULT 'autre',
    -- Déclaré en texte libre, comme le nom d'une proposition citoyenne : ce
    -- n'est pas toujours un compte au sens de la plateforme (bureau d'études
    -- externe, direction régionale).
    auteur          TEXT,
    date_document   DATE,

    -- Le fichier lui-même a déjà été déposé par POST /fichiers ; cette fiche
    -- n'en retient que le pointeur et un extrait des métadonnées utiles à
    -- l'affichage de la liste sans un aller-retour supplémentaire.
    fichier_url     TEXT NOT NULL,
    nom_fichier     TEXT NOT NULL,
    type_mime       TEXT,
    taille_octets   INTEGER,

    depose_par      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT rapports_etudes_categorie_valide CHECK (categorie IN (
      'etude_technique', 'rapport_activite', 'audit', 'plan_action', 'autre'))
);

CREATE INDEX IF NOT EXISTS idx_rapports_etudes_commune
  ON rapports_etudes (commune_id, created_at DESC) WHERE deleted_at IS NULL;

COMMENT ON TABLE rapports_etudes IS
  'Métadonnées des rapports et études déposés par une commune (TDR §3.2.9). Le fichier lui-même vit dans la table fichiers (migration 041) ; cette fiche porte ce qui n''a de sens que pour un rapport — titre, catégorie, auteur déclaré, date.';
COMMENT ON COLUMN rapports_etudes.auteur IS
  'Déclaré en texte libre : un bureau d''études externe ou une direction régionale n''a pas de compte sur la plateforme.';

-- ---------------------------------------------------------------------------
-- Cloisonnement — le même que pour les documents de projet (migration 035) :
-- la commune écrit, la FNCT et les prestataires rattachés lisent.
-- ---------------------------------------------------------------------------

ALTER TABLE rapports_etudes ENABLE ROW LEVEL SECURITY;
ALTER TABLE rapports_etudes FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rapports_etudes_select ON rapports_etudes;
CREATE POLICY rapports_etudes_select ON rapports_etudes FOR SELECT
  USING (deleted_at IS NULL AND app.can_read_commune(commune_id));

DROP POLICY IF EXISTS rapports_etudes_insert ON rapports_etudes;
CREATE POLICY rapports_etudes_insert ON rapports_etudes FOR INSERT
  WITH CHECK (app.can_write_commune(commune_id));

DROP POLICY IF EXISTS rapports_etudes_update ON rapports_etudes;
CREATE POLICY rapports_etudes_update ON rapports_etudes FOR UPDATE
  USING (app.can_write_commune(commune_id))
  WITH CHECK (app.can_write_commune(commune_id));

GRANT SELECT, INSERT, UPDATE ON rapports_etudes TO siipi_app;
REVOKE DELETE, TRUNCATE ON rapports_etudes FROM siipi_app;

-- ---------------------------------------------------------------------------
-- Retrait — logique, comme partout : app.supprimer() porte déjà tout ce qu'il
-- faut (cloisonnement, horodatage, auteur du retrait) ; il suffit de lui
-- ouvrir cette table.
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
                     'rapports_etudes') THEN
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
