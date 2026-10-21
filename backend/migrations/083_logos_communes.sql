-- =============================================================================
-- 083 — Les logos des communes (jalon D, lot D1)
--
-- LE BESOIN (docs/specs_metier/SPEC_D_pret_a_presenter.md, D1). Chaque commune
-- dépose son logo elle-même, depuis son portail ; la FNCT le dépose en secours
-- pour n'importe quelle commune, depuis l'annuaire national. Le logo s'affiche
-- en tête du portail de la commune.
--
-- UN FICHIER DÉPOSÉ, PAS UNE ADRESSE. La colonne communes.logo_url (001)
-- n'était alimentée par rien, et PATCH /communes/:id y acceptait n'importe
-- quelle URL : une image tirée d'un autre site à chaque ouverture du portail.
-- Le logo devient un fichier du stockage existant (041), usage « logo_commune »,
-- reconnu par ses octets, ses métadonnées retirées. La colonne est gardée
-- (rien ne s'efface) et déclarée obsolète.
--
-- LE SVG, POUR CE SEUL USAGE, ET STATIQUE. Un logo est souvent vectoriel. Le
-- SVG reste refusé pour tout autre usage ; pour un logo, il n'est accepté que
-- sans contenu actif (script, attribut on…, javascript:, objet étranger, lien
-- externe) — refusé plutôt que réécrit : la plateforme constate, elle ne
-- corrige pas le fichier d'une commune (règle 1.5). Il est servi sous une
-- politique de sécurité fermée.
--
-- L'HISTORIQUE (règle 1.4). Remplacer un logo retire l'ancien (retire_le) et
-- inscrit le nouveau, dans la même transaction : rien ne s'efface, un seul logo
-- en vigueur par commune — la base le tient. Dépôt et retrait passent au
-- journal d'audit.
-- =============================================================================

-- 1. L'usage « logo_commune » du stockage de fichiers.
ALTER TABLE fichiers DROP CONSTRAINT IF EXISTS fichiers_usage_valide;
ALTER TABLE fichiers ADD  CONSTRAINT fichiers_usage_valide CHECK (usage IS NULL OR usage IN (
  'reclamation', 'preuve_traitement', 'constat_terrain', 'passage',
  'incident', 'suggestion_point', 'document_projet', 'enlevement',
  'rapport_etude', 'declassement', 'logo_commune', 'autre'));

ALTER TABLE fichiers DROP CONSTRAINT IF EXISTS fichiers_type_autorise;
ALTER TABLE fichiers ADD  CONSTRAINT fichiers_type_autorise CHECK (
  -- Un logo est une image, et rien d'autre ; le SVG n'est ouvert qu'à lui.
  CASE WHEN usage = 'logo_commune'
       THEN type_mime IN ('image/jpeg', 'image/png', 'image/webp', 'image/svg+xml')
       ELSE type_mime IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
         OR (usage = 'rapport_etude' AND type_mime IN (
               'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
               'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
               'application/vnd.openxmlformats-officedocument.presentationml.presentation'))
  END);

ALTER TABLE fichiers DROP CONSTRAINT IF EXISTS fichiers_taille_plausible;
ALTER TABLE fichiers ADD  CONSTRAINT fichiers_taille_plausible CHECK (
  taille_octets > 0
  AND taille_octets <= (CASE usage WHEN 'rapport_etude' THEN 50 * 1024 WHEN 'logo_commune' THEN 1024 ELSE 8 * 1024 END) * 1024);

COMMENT ON CONSTRAINT fichiers_type_autorise ON fichiers IS
  'Images et PDF pour tout usage ; documents Word/Excel/PowerPoint réservés à un rapport ou une étude (rapport_etude) ; un logo de commune (logo_commune) est une image — JPEG, PNG, WebP ou SVG statique, le SVG n''étant ouvert qu''à cet usage.';
COMMENT ON CONSTRAINT fichiers_taille_plausible ON fichiers IS
  '8 Mo par défaut ; 50 Mo pour un rapport ou une étude ; 1 Mo pour un logo de commune.';

-- 2. Le logo d'une commune, et son historique.
CREATE TABLE IF NOT EXISTS logos_communes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id  TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    fichier_id  UUID NOT NULL REFERENCES fichiers(id),
    depose_par  UUID,
    depose_le   TIMESTAMPTZ NOT NULL DEFAULT now(),
    retire_le   TIMESTAMPTZ,
    retire_par  UUID,
    CONSTRAINT logos_communes_retrait CHECK (retire_le IS NOT NULL OR retire_par IS NULL),
    CONSTRAINT logos_communes_chronologie CHECK (retire_le IS NULL OR retire_le >= depose_le)
);
-- Un seul logo en vigueur par commune : un second dépôt sans retrait du
-- premier est refusé par la base, pas seulement par l'écran.
CREATE UNIQUE INDEX IF NOT EXISTS logos_communes_en_vigueur
    ON logos_communes (commune_id) WHERE retire_le IS NULL;
CREATE INDEX IF NOT EXISTS logos_communes_commune ON logos_communes (commune_id, depose_le DESC);

COMMENT ON TABLE logos_communes IS
  'Le logo de chaque commune (jalon D, D1) et son historique : un logo remplacé ou retiré garde sa ligne, retire_le renseigné (règle 1.4). Un seul logo en vigueur par commune (index logos_communes_en_vigueur). Déposé par la commune ou, en secours, par la FNCT.';
COMMENT ON COLUMN logos_communes.fichier_id IS
  'Le fichier déposé (usage logo_commune) : ses octets, son type reconnu par ses premiers octets, son empreinte.';
COMMENT ON COLUMN logos_communes.retire_le IS
  'Quand le logo a cessé d''être en vigueur — remplacé par un autre, ou retiré. Vide : le logo en vigueur.';

-- Rien ne s'efface, et un logo retiré ne revient pas : on en dépose un nouveau.
CREATE OR REPLACE FUNCTION app.proteger_logo_commune() RETURNS trigger
  LANGUAGE plpgsql AS
$fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Une commune de test (« test… ») ou de démonstration s'efface avec tout ce
    -- qu'elle porte : son logo n'est l'historique de rien (même exception que le
    -- jeu de démonstration, règle 1.4). Une commune réelle, jamais.
    IF OLD.commune_id LIKE 'test%' OR EXISTS (SELECT 1 FROM communes c WHERE c.id = OLD.commune_id AND c.est_demo) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'LOGO_HISTORIQUE: un logo ne s''efface pas ; il se retire (règle 1.4).'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.commune_id IS DISTINCT FROM OLD.commune_id OR NEW.fichier_id IS DISTINCT FROM OLD.fichier_id
     OR NEW.depose_par IS DISTINCT FROM OLD.depose_par OR NEW.depose_le IS DISTINCT FROM OLD.depose_le THEN
    RAISE EXCEPTION 'LOGO_HISTORIQUE: un logo déposé ne se modifie pas ; on en dépose un nouveau.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.retire_le IS NOT NULL THEN
    RAISE EXCEPTION 'LOGO_HISTORIQUE: un logo retiré ne revient pas ; on le dépose à nouveau.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS trg_proteger_logo_commune ON logos_communes;
CREATE TRIGGER trg_proteger_logo_commune BEFORE UPDATE OR DELETE ON logos_communes
  FOR EACH ROW EXECUTE FUNCTION app.proteger_logo_commune();

ALTER TABLE logos_communes ENABLE ROW LEVEL SECURITY;
ALTER TABLE logos_communes FORCE ROW LEVEL SECURITY;
-- Un logo est l'identité publique d'une commune : tout compte le lit.
DROP POLICY IF EXISTS logos_communes_lecture ON logos_communes;
CREATE POLICY logos_communes_lecture ON logos_communes FOR SELECT USING (app.is_authenticated());
-- La commune pour elle-même, la FNCT pour toutes (app.can_write_commune).
DROP POLICY IF EXISTS logos_communes_depot ON logos_communes;
CREATE POLICY logos_communes_depot ON logos_communes FOR INSERT WITH CHECK (app.can_write_commune(commune_id));
DROP POLICY IF EXISTS logos_communes_retrait ON logos_communes;
CREATE POLICY logos_communes_retrait ON logos_communes FOR UPDATE
  USING (app.can_write_commune(commune_id)) WITH CHECK (app.can_write_commune(commune_id));
GRANT SELECT, INSERT ON logos_communes TO siipi_app;
GRANT UPDATE (retire_le, retire_par) ON logos_communes TO siipi_app;

DROP TRIGGER IF EXISTS trg_audit_logos_communes ON logos_communes;
CREATE TRIGGER trg_audit_logos_communes AFTER INSERT OR UPDATE OR DELETE ON logos_communes
  FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement();

-- 3. L'ancienne colonne, gardée et déclarée obsolète.
COMMENT ON COLUMN communes.logo_url IS
  'OBSOLÈTE depuis la migration 083 : jamais alimentée. Le logo d''une commune est un fichier déposé (table logos_communes, usage logo_commune), servi par GET /communes/{id}/logo.';
