-- ============================================================================
-- 107 — Jalon G, lot G7a : les manquements des établissements (constats)
--
-- Décisions de Nacer du 23 novembre 2026 (propositions G7 n° 1 à 7, et trois
-- précisions) :
--
--   * LA COMMUNE CONSTATE. Un constat vise un établissement de la commune, à une
--     date, d'un type de la liste (dépôt hors conteneur, conteneur non conforme,
--     débordement, tri non respecté, absence de convention, autre — décrit).
--     Il se saisit au plus D jours après les faits, D étant le paramètre national
--     daté `delai_saisie_constat_assimile` (30) ; sans valeur en vigueur, la saisie
--     est refusée, jamais faite sans limite. Une photo s'y joint dans le même délai.
--
--   * UN ÉTABLISSEMENT FERMÉ le jour des faits ne se constate pas (P1). La table
--     `commerces` ne garde que son dernier statut : les périodes de fermeture sont
--     tenues ici, datées (`fermetures_commerces`), alimentées par le geste de statut
--     de 099 et amorcées depuis l'état présent et le journal d'audit. Une fermeture
--     inscrite APRÈS un constat, datée d'avant les faits, ne réécrit rien : le
--     constat devient « à revoir » (app.constat_a_revoir), la commune tranche.
--
--   * L'AUTOMATE : constaté → levé | classé sans suite | annulé ; levé → constaté
--     (levée annulée, avec son motif) | annulé ; classé → annulé ; annulé est figé.
--     Un constat qui porte une sanction valide ne se classe ni ne s'annule.
--
--   * LA SANCTION (P2) : un arrêté, un procès-verbal ou autre, avec la référence
--     que le document porte et sa date ; AUCUN MONTANT. Une seule valide à la fois ;
--     elle s'annule avec un motif, une nouvelle peut suivre ; l'historique reste.
--
--   * L'AUTEUR (P3) : aucune colonne ne le porte, aucune route ne le rend. Le
--     journal d'audit (app.enregistrer_changement) garde, pour chaque geste —
--     création, changement de statut, annulation, photo, sanction —, le compte qui
--     l'a fait. Les photos vivent dans `fichiers` (usage `constat_assimile`) dont
--     la colonne `televerse_par` sert aux politiques RLS : elle reste, mais ne sort
--     par aucune route pour cet usage.
--
--   * DONNÉES PERSONNELLES (loi organique n° 2004-63, minimisation et finalité) :
--     le constat vise l'établissement, jamais une personne. Les champs libres sont
--     courts et refusent ce qui a la forme d'un CIN ou d'un téléphone (huit
--     chiffres) avant toute écriture : le texte n'atteint jamais le journal.
--
-- Le directeur écrit ; la FNCT lit ; un prestataire ne voit rien, photos comprises.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Le délai de saisie, paramètre national daté
-- ---------------------------------------------------------------------------
-- Les bornes d'un paramètre sont strictes (060) : 0 et 366 laissent de 1 à 365 jours.
INSERT INTO definitions_parametres_nationaux
  (code, nature, unite, borne_min, borne_max, libelle_fr, libelle_ar, description, ordre, rubrique, entier) VALUES
  ('delai_saisie_constat_assimile', 'nombre', 'jours', 0, 366,
   'Délai de saisie d''un constat de manquement', 'أجل تسجيل معاينة الإخلال',
   'Nombre de jours après les faits au-delà duquel un constat de manquement d''un établissement (et ses photos) ne se saisit plus.',
   90, 'general', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO valeurs_parametres_nationaux (code, date_effet, valeur_nombre, provisoire, reference)
SELECT 'delai_saisie_constat_assimile', DATE '2000-01-01', 30, false,
       'Décision du 23/11/2026 (jalon G, G7, précision P1) : 30 jours après les faits'
 WHERE NOT EXISTS (SELECT 1 FROM valeurs_parametres_nationaux x WHERE x.code = 'delai_saisie_constat_assimile');

-- ---------------------------------------------------------------------------
-- 2. Les gardes partagées
-- ---------------------------------------------------------------------------
-- Huit chiffres ou plus qui se suivent : la forme d'un CIN ou d'un téléphone.
-- MÊME RÈGLE, CARACTÈRE POUR CARACTÈRE, que contientUnIdentifiant
-- (src/services/importPersonnel.ts) :
--   1. les chiffres arabes-indiens (٠-٩), persans (۰-۹) et pleine chasse (０-９)
--      deviennent des chiffres ASCII : un numéro tapé au clavier arabe est le même ;
--   2. seuls les ESPACES entre deux chiffres (espace insécable compris) sont
--      retirés : « 98 123 456 » redevient huit chiffres ;
--   3. points, tirets et barres obliques ne sont jamais joints : une date
--      (23.11.2026, 2026-11-23, 23/11/2026) ou un numéro d'arrêté (2026-1234)
--      reste permis.
CREATE OR REPLACE FUNCTION app._texte_sans_identifiant(p_texte text) RETURNS boolean
  LANGUAGE sql IMMUTABLE AS
$$ SELECT p_texte IS NULL OR regexp_replace(
     translate(p_texte, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹０１２３４５６７８９', '012345678901234567890123456789'),
     '(?<=[0-9])[[:space:]' || chr(160) || chr(8199) || chr(8239) || ']+(?=[0-9])', '', 'g') !~ '[0-9]{8}' $$;

CREATE OR REPLACE FUNCTION app._refuser_identifiant(p_texte text, p_champ text) RETURNS void
  LANGUAGE plpgsql IMMUTABLE AS
$$
BEGIN
  IF NOT app._texte_sans_identifiant(p_texte) THEN
    RAISE EXCEPTION 'CONSTAT_IDENTIFIANT: le champ « % » semble porter un numéro de CIN ou de téléphone (huit chiffres) : SIIPI ne le garde jamais (loi organique n° 2004-63). Décrivez le manquement sans nommer ni identifier de personne.', p_champ
      USING ERRCODE = 'check_violation';
  END IF;
END
$$;

-- Une seule définition du délai, pour le constat et pour ses photos. Le délai est
-- celui du jour de la saisie : la FNCT le règle, la commune ne le contourne pas.
CREATE OR REPLACE FUNCTION app._controler_delai_constat(p_date date, p_quoi text) RETURNS void
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_delai numeric;
  v_ecart integer := app.jour_tunis() - p_date;
BEGIN
  SELECT valeur_nombre INTO v_delai FROM app.parametre_national('delai_saisie_constat_assimile', app.jour_tunis());
  IF v_delai IS NULL THEN
    RAISE EXCEPTION 'CONSTAT_DELAI_ABSENT: le délai de saisie des constats n''est pas fixé aujourd''hui ; la FNCT le fixe dans les paramètres nationaux.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_ecart > v_delai THEN
    IF p_quoi = 'photo' THEN
      RAISE EXCEPTION 'CONSTAT_DELAI_PHOTO: constaté le %, il y a % jours : une photo se joint au plus % jours après les faits.',
        to_char(p_date, 'DD/MM/YYYY'), v_ecart, trim_scale(v_delai) USING ERRCODE = 'check_violation';
    END IF;
    RAISE EXCEPTION 'CONSTAT_DELAI: constaté le %, il y a % jours : un constat se saisit au plus % jours après les faits.',
      to_char(p_date, 'DD/MM/YYYY'), v_ecart, trim_scale(v_delai) USING ERRCODE = 'check_violation';
  END IF;
END
$$;
REVOKE ALL ON FUNCTION app._controler_delai_constat(date, text) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 3. Les périodes de fermeture des établissements
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fermetures_commerces (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id   TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    commerce_id  UUID NOT NULL REFERENCES commerces(id) ON DELETE CASCADE,
    ferme_le     DATE NOT NULL,
    rouvert_le   DATE,
    origine      TEXT NOT NULL DEFAULT 'geste',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fermetures_commerces_periode CHECK (rouvert_le IS NULL OR rouvert_le >= ferme_le),
    CONSTRAINT fermetures_commerces_origine CHECK (origine IN ('geste', 'etat_initial', 'journal_audit'))
);
-- Une période saisie à tort se retire (avec son motif) ou se corrige (avec le
-- sien) : elle ne s'efface jamais, et le journal d'audit garde ce qu'elle était.
ALTER TABLE fermetures_commerces ADD COLUMN IF NOT EXISTS retiree_le TIMESTAMPTZ;
ALTER TABLE fermetures_commerces ADD COLUMN IF NOT EXISTS motif_retrait TEXT;
ALTER TABLE fermetures_commerces ADD COLUMN IF NOT EXISTS corrigee_le TIMESTAMPTZ;
ALTER TABLE fermetures_commerces ADD COLUMN IF NOT EXISTS motif_correction TEXT;
ALTER TABLE fermetures_commerces DROP CONSTRAINT IF EXISTS fermetures_commerces_retrait;
ALTER TABLE fermetures_commerces ADD CONSTRAINT fermetures_commerces_retrait CHECK (
  (retiree_le IS NULL) = (motif_retrait IS NULL)
  AND (motif_retrait IS NULL OR length(btrim(motif_retrait)) BETWEEN 5 AND 300)
  AND (retiree_le IS NULL OR rouvert_le IS NOT NULL));
ALTER TABLE fermetures_commerces DROP CONSTRAINT IF EXISTS fermetures_commerces_correction;
ALTER TABLE fermetures_commerces ADD CONSTRAINT fermetures_commerces_correction CHECK (
  (corrigee_le IS NULL) = (motif_correction IS NULL)
  AND (motif_correction IS NULL OR length(btrim(motif_correction)) BETWEEN 5 AND 300));
DROP INDEX IF EXISTS uq_fermetures_commerces_ouverte;
CREATE UNIQUE INDEX uq_fermetures_commerces_ouverte ON fermetures_commerces (commerce_id) WHERE rouvert_le IS NULL AND retiree_le IS NULL;
CREATE INDEX IF NOT EXISTS idx_fermetures_commerces ON fermetures_commerces (commerce_id, ferme_le);

-- L'amorce, une fois : les périodes closes que le journal d'audit connaît, puis la
-- fermeture en cours de chaque établissement fermé aujourd'hui. Ce que le journal
-- ne connaît pas reste inconnu ; rien n'est deviné.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM fermetures_commerces) THEN
    INSERT INTO fermetures_commerces (commune_id, commerce_id, ferme_le, rouvert_le, origine)
    SELECT co.commune_id, co.id, d.ferme_le, greatest(d.rouvert, d.ferme_le), 'journal_audit'
      FROM (SELECT a.record_id, (a.new_data ->> 'ferme_le')::date AS ferme_le,
                   (SELECT (b.changed_at AT TIME ZONE 'Africa/Tunis')::date
                      FROM audit_log b
                     WHERE b.table_name = 'commerces' AND b.record_id = a.record_id AND b.id > a.id
                       AND b.operation = 'UPDATE' AND b.old_data ->> 'statut' = 'ferme'
                       AND b.new_data ->> 'statut' IS DISTINCT FROM 'ferme'
                     ORDER BY b.id LIMIT 1) AS rouvert
              FROM audit_log a
             WHERE a.table_name = 'commerces' AND a.operation IN ('INSERT', 'UPDATE')
               AND a.new_data ->> 'statut' = 'ferme' AND a.new_data ->> 'ferme_le' IS NOT NULL
               AND (a.operation = 'INSERT' OR a.old_data ->> 'statut' IS DISTINCT FROM 'ferme')) d
      JOIN commerces co ON co.id::text = d.record_id
     WHERE d.rouvert IS NOT NULL;
    INSERT INTO fermetures_commerces (commune_id, commerce_id, ferme_le, rouvert_le, origine)
    SELECT c.commune_id, c.id, c.ferme_le, NULL, 'etat_initial'
      FROM commerces c WHERE c.statut = 'ferme' AND c.ferme_le IS NOT NULL;
  END IF;
END
$$;

-- Le geste de statut de 099 tient les périodes : fermer en ouvre une, rouvrir (ou
-- passer « à vérifier ») la clôt au jour de l'inscription — la table commerces n'a
-- aucune date métier de réouverture. La date d'une fermeture en cours, corrigée par
-- app.corriger_fermeture, est reportée sur commerces, et revient ici à l'identique.
CREATE OR REPLACE FUNCTION app.tenir_fermetures_commerce()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.statut = 'ferme' AND NEW.ferme_le IS NOT NULL THEN
      INSERT INTO fermetures_commerces (commune_id, commerce_id, ferme_le) VALUES (NEW.commune_id, NEW.id, NEW.ferme_le);
    END IF;
    RETURN NULL;
  END IF;
  IF OLD.statut IS DISTINCT FROM 'ferme' AND NEW.statut = 'ferme' THEN
    INSERT INTO fermetures_commerces (commune_id, commerce_id, ferme_le) VALUES (NEW.commune_id, NEW.id, NEW.ferme_le);
  ELSIF OLD.statut = 'ferme' AND NEW.statut IS DISTINCT FROM 'ferme' THEN
    UPDATE fermetures_commerces SET rouvert_le = greatest(app.jour_tunis(), ferme_le)
     WHERE commerce_id = NEW.id AND rouvert_le IS NULL AND retiree_le IS NULL;
  ELSIF NEW.statut = 'ferme' AND NEW.ferme_le IS DISTINCT FROM OLD.ferme_le THEN
    UPDATE fermetures_commerces SET ferme_le = NEW.ferme_le
     WHERE commerce_id = NEW.id AND rouvert_le IS NULL AND retiree_le IS NULL AND ferme_le IS DISTINCT FROM NEW.ferme_le;
  END IF;
  RETURN NULL;
END
$$;
DROP TRIGGER IF EXISTS trg_tenir_fermetures_commerce ON commerces;
CREATE TRIGGER trg_tenir_fermetures_commerce AFTER INSERT OR UPDATE OF statut, ferme_le ON commerces
  FOR EACH ROW EXECUTE FUNCTION app.tenir_fermetures_commerce();

-- La période de fermeture qui couvre un jour, s'il y en a une. Une période retirée
-- (saisie à tort) ne couvre rien.
CREATE OR REPLACE FUNCTION app._fermeture_au(p_commerce uuid, p_jour date)
  RETURNS TABLE (ferme_le date, rouvert_le date)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT f.ferme_le, f.rouvert_le FROM fermetures_commerces f
   WHERE f.commerce_id = p_commerce AND f.retiree_le IS NULL
     AND f.ferme_le <= p_jour AND (f.rouvert_le IS NULL OR p_jour < f.rouvert_le)
   ORDER BY f.ferme_le DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION app._fermeture_au(uuid, date) FROM PUBLIC;

-- Les gestes de correction d'une période : le directeur seul (la FNCT lit), sous le
-- verrou de l'établissement (celui du geste de statut) puis de la période, avec la
-- version lue (le xmin de la période).
CREATE OR REPLACE FUNCTION app._fermeture_a_traiter(p_id uuid, p_version text)
  RETURNS fermetures_commerces LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v fermetures_commerces;
  v_commerce uuid;
  v_version text;
BEGIN
  SELECT f.commerce_id INTO v_commerce FROM fermetures_commerces f WHERE f.id = p_id;
  PERFORM 1 FROM commerces c WHERE c.id = v_commerce FOR UPDATE;
  SELECT * INTO v FROM fermetures_commerces f WHERE f.id = p_id FOR UPDATE;
  IF v.id IS NULL OR NOT app.peut_emettre_document(v.commune_id) THEN
    RAISE EXCEPTION 'FERMETURE_INTROUVABLE' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT f.xmin::text INTO v_version FROM fermetures_commerces f WHERE f.id = p_id;
  IF p_version IS DISTINCT FROM v_version THEN
    RAISE EXCEPTION 'FERMETURE_VERSION: cette période a changé depuis que vous l''avez ouverte ; elle est à jour, recommencez.'
      USING ERRCODE = 'serialization_failure';
  END IF;
  IF v.retiree_le IS NOT NULL THEN
    RAISE EXCEPTION 'FERMETURE_RETIREE: cette période est déjà retirée ; elle reste à l''historique.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN v;
END
$$;
REVOKE ALL ON FUNCTION app._fermeture_a_traiter(uuid, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION app._motif_fermeture(p_motif text) RETURNS text
  LANGUAGE plpgsql IMMUTABLE AS
$$
BEGIN
  IF length(btrim(COALESCE(p_motif, ''))) NOT BETWEEN 5 AND 300 THEN
    RAISE EXCEPTION 'FERMETURE_MOTIF: une période de fermeture se retire ou se corrige avec son motif (de 5 à 300 caractères).' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT app._texte_sans_identifiant(p_motif) THEN
    RAISE EXCEPTION 'CONSTAT_IDENTIFIANT: le champ « motif » semble porter un numéro de CIN ou de téléphone (huit chiffres) : SIIPI ne le garde jamais (loi organique n° 2004-63). Décrivez le fait sans nommer ni identifier de personne.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN btrim(p_motif);
END
$$;

-- Retirer : une période close seulement. Une fermeture en cours se défait en
-- rouvrant d'abord l'établissement : sinon la période contredirait son statut.
CREATE OR REPLACE FUNCTION app.retirer_fermeture(p_id uuid, p_version text, p_motif text)
  RETURNS fermetures_commerces LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v fermetures_commerces;
  v_motif text;
BEGIN
  v := app._fermeture_a_traiter(p_id, p_version);
  IF v.rouvert_le IS NULL THEN
    RAISE EXCEPTION 'FERMETURE_EN_COURS: cette fermeture est en cours : rouvrez d''abord l''établissement, puis retirez la période si elle était fausse.'
      USING ERRCODE = 'check_violation';
  END IF;
  v_motif := app._motif_fermeture(p_motif);
  UPDATE fermetures_commerces SET retiree_le = now(), motif_retrait = v_motif WHERE id = p_id RETURNING * INTO v;
  RETURN v;
END
$$;

-- Corriger : les dates d'une période, passées, sans chevaucher une autre période ;
-- celles d'une fermeture en cours sont reportées sur l'établissement.
CREATE OR REPLACE FUNCTION app.corriger_fermeture(p_id uuid, p_version text, p_ferme_le date, p_rouvert_le date, p_motif text)
  RETURNS fermetures_commerces LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v fermetures_commerces;
  v_motif text;
  v_autre fermetures_commerces;
BEGIN
  v := app._fermeture_a_traiter(p_id, p_version);
  v_motif := app._motif_fermeture(p_motif);
  IF p_ferme_le IS NULL OR p_ferme_le > app.jour_tunis() OR p_ferme_le < DATE '2000-01-01' THEN
    RAISE EXCEPTION 'FERMETURE_DATES: une fermeture se date d''un jour passé (ou d''aujourd''hui), après l''an 2000.' USING ERRCODE = 'check_violation';
  END IF;
  IF (v.rouvert_le IS NULL) <> (p_rouvert_le IS NULL) THEN
    RAISE EXCEPTION 'FERMETURE_DATES: %', CASE WHEN v.rouvert_le IS NULL
      THEN 'une fermeture en cours n''a pas de réouverture : rouvrez l''établissement par son statut.'
      ELSE 'une période close garde une date de réouverture.' END USING ERRCODE = 'check_violation';
  END IF;
  IF p_rouvert_le IS NOT NULL AND (p_rouvert_le < p_ferme_le OR p_rouvert_le > app.jour_tunis()) THEN
    RAISE EXCEPTION 'FERMETURE_DATES: la réouverture suit la fermeture et n''est pas dans l''avenir.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_autre FROM fermetures_commerces f
   WHERE f.commerce_id = v.commerce_id AND f.id <> v.id AND f.retiree_le IS NULL
     AND daterange(f.ferme_le, f.rouvert_le, '[)') && daterange(p_ferme_le, p_rouvert_le, '[)')
   LIMIT 1;
  IF v_autre.id IS NOT NULL THEN
    RAISE EXCEPTION 'FERMETURE_CHEVAUCHEMENT: ces dates chevauchent une autre période de fermeture (du %) ; corrigez ou retirez-la d''abord.',
      to_char(v_autre.ferme_le, 'DD/MM/YYYY') || COALESCE(' au ' || to_char(v_autre.rouvert_le, 'DD/MM/YYYY'), ', en cours')
      USING ERRCODE = 'check_violation';
  END IF;
  IF v.rouvert_le IS NULL THEN
    -- La fermeture en cours : l'établissement porte la même date, dans la même transaction.
    UPDATE commerces SET ferme_le = p_ferme_le WHERE id = v.commerce_id AND statut = 'ferme';
  END IF;
  UPDATE fermetures_commerces SET ferme_le = p_ferme_le, rouvert_le = p_rouvert_le, corrigee_le = now(), motif_correction = v_motif
   WHERE id = p_id RETURNING * INTO v;
  RETURN v;
END
$$;
REVOKE ALL ON FUNCTION app.retirer_fermeture(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.corriger_fermeture(uuid, text, date, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.retirer_fermeture(uuid, text, text) TO siipi_app;
GRANT EXECUTE ON FUNCTION app.corriger_fermeture(uuid, text, date, date, text) TO siipi_app;

-- ---------------------------------------------------------------------------
-- 4. Les fichiers : l'usage « constat_assimile », jamais public
-- ---------------------------------------------------------------------------
ALTER TABLE fichiers DROP CONSTRAINT IF EXISTS fichiers_usage_valide;
ALTER TABLE fichiers ADD  CONSTRAINT fichiers_usage_valide CHECK (usage IS NULL OR usage IN (
  'reclamation', 'preuve_traitement', 'constat_terrain', 'passage',
  'incident', 'suggestion_point', 'document_projet', 'enlevement',
  'rapport_etude', 'declassement', 'logo_commune', 'constat_assimile', 'autre'));

ALTER TABLE fichiers DROP CONSTRAINT IF EXISTS fichiers_type_autorise;
ALTER TABLE fichiers ADD  CONSTRAINT fichiers_type_autorise CHECK (
  -- Un logo est une image, et rien d'autre ; le SVG n'est ouvert qu'à lui. La
  -- photo d'un constat est une photo : ni PDF, ni SVG.
  CASE WHEN usage = 'logo_commune'
       THEN type_mime IN ('image/jpeg', 'image/png', 'image/webp', 'image/svg+xml')
       WHEN usage = 'constat_assimile'
       THEN type_mime IN ('image/jpeg', 'image/png', 'image/webp')
       ELSE type_mime IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
         OR (usage = 'rapport_etude' AND type_mime IN (
               'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
               'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
               'application/vnd.openxmlformats-officedocument.presentationml.presentation'))
  END);

-- La photo d'un manquement montre un commerce identifiable, parfois des personnes :
-- elle reste au service, jamais publique ni adressée à un citoyen.
ALTER TABLE fichiers DROP CONSTRAINT IF EXISTS fichiers_constat_prive;
ALTER TABLE fichiers ADD  CONSTRAINT fichiers_constat_prive
  CHECK (usage IS DISTINCT FROM 'constat_assimile' OR (visibilite = 'commune' AND destinataire_citoyen_id IS NULL)) NOT VALID;
ALTER TABLE fichiers VALIDATE CONSTRAINT fichiers_constat_prive;

-- Le dépôt : par le directeur seul, qui seul constate (la FNCT lit).
CREATE OR REPLACE FUNCTION app.controler_depot_photo_constat()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
  IF NEW.usage = 'constat_assimile' AND NOT app.peut_emettre_document(NEW.commune_id) THEN
    RAISE EXCEPTION 'PHOTO_CONSTAT_DEPOT' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Le nom d'une photo de constat est posé par le serveur, jamais repris de
  -- l'appareil : « PV_CIN_0XXXXXXX.jpg » resterait sinon cinq ans au journal.
  IF NEW.usage = 'constat_assimile' AND NEW.nom_original !~ ('^constat-' || NEW.id::text || '\.(jpg|png|webp)$') THEN
    RAISE EXCEPTION 'PHOTO_CONSTAT_NOM: le nom d''une photo de constat est posé par le serveur (constat-<identifiant>.<type>).'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_controler_depot_photo_constat ON fichiers;
CREATE TRIGGER trg_controler_depot_photo_constat BEFORE INSERT ON fichiers
  FOR EACH ROW EXECUTE FUNCTION app.controler_depot_photo_constat();

-- Sa visibilité ne se règle pas, même à l'identique : la FNCT, qui lit, n'écrit
-- rien sur une pièce communale, et un geste « sans effet » laisserait sa ligne au
-- journal. Son usage ne change pas non plus (ni vers lui, ni depuis lui).
CREATE OR REPLACE FUNCTION app.proteger_visibilite_photo_constat()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
  IF (NEW.usage IS DISTINCT FROM OLD.usage AND 'constat_assimile' IN (NEW.usage, OLD.usage))
     OR OLD.usage = 'constat_assimile'
     OR EXISTS (SELECT 1 FROM photos_constats_assimiles p WHERE p.fichier_id = OLD.id) THEN
    RAISE EXCEPTION 'PHOTO_CONSTAT_VISIBILITE: la photo d''un constat de manquement reste au service de la commune ; elle ne se publie pas et ne s''adresse à aucun citoyen.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

-- Ni retirée : le constat pointerait vers des octets que plus personne ne lit.
CREATE OR REPLACE FUNCTION app.proteger_fichier_photo_constat()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
     AND EXISTS (SELECT 1 FROM photos_constats_assimiles p WHERE p.fichier_id = OLD.id) THEN
    RAISE EXCEPTION 'FICHIER_PHOTO_CONSTAT: ce fichier est une photo d''un constat de manquement ; une photo de constat ne se retire jamais (annulez le constat, avec un motif, si elle est erronée).'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

-- La lecture : pour cet usage, la commune et la FNCT seulement. Le texte est celui
-- de 096, la seule restriction ajoutée : ni la branche publique, ni celle des
-- lecteurs (qui comprend le prestataire), ni celles du déposant et du citoyen.
DROP POLICY IF EXISTS fichiers_select ON fichiers;
CREATE POLICY fichiers_select ON fichiers FOR SELECT
  USING (
    deleted_at IS NULL
    AND CASE WHEN usage = 'constat_assimile' THEN app.can_write_commune(commune_id)
             ELSE (
               visibilite = 'publique'
               OR app.can_read_commune(commune_id)
               OR (televerse_par = app.current_user_id()
                   AND (app.current_role_name() = 'citoyen' OR commune_id = ANY (app.mes_communes())))
               OR (visibilite = 'citoyen' AND destinataire_citoyen_id = app.my_citizen_id())
             )
        END
  );

-- ---------------------------------------------------------------------------
-- 5. Les constats
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS constats_assimiles (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id              TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    commerce_id             UUID NOT NULL REFERENCES commerces(id) ON DELETE CASCADE,
    date_constat            DATE NOT NULL,
    type                    TEXT NOT NULL,
    description             TEXT,
    statut                  TEXT NOT NULL DEFAULT 'constate',
    leve_le                 DATE,
    observation_levee       TEXT,
    levee_annulee_le        TIMESTAMPTZ,
    motif_annulation_levee  TEXT,
    classe_le               TIMESTAMPTZ,
    motif_classement        TEXT,
    annule_le               TIMESTAMPTZ,
    motif_annulation        TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    provenance              TEXT NOT NULL DEFAULT 'reel',
    CONSTRAINT constats_assimiles_type CHECK (type IN ('depot_hors_conteneur', 'conteneur_non_conforme', 'debordement',
                                                       'tri_non_respecte', 'absence_convention', 'autre')),
    CONSTRAINT constats_assimiles_statut CHECK (statut IN ('constate', 'leve', 'classe', 'annule')),
    CONSTRAINT constats_assimiles_date CHECK (date_constat >= DATE '2000-01-01'),
    CONSTRAINT constats_assimiles_description CHECK (description IS NULL OR length(btrim(description)) BETWEEN 1 AND 500),
    CONSTRAINT constats_assimiles_autre_description CHECK (type <> 'autre' OR description IS NOT NULL),
    CONSTRAINT constats_assimiles_textes CHECK (
      (observation_levee IS NULL OR length(btrim(observation_levee)) BETWEEN 1 AND 300)
      AND (motif_annulation_levee IS NULL OR length(btrim(motif_annulation_levee)) BETWEEN 5 AND 300)
      AND (motif_classement IS NULL OR length(btrim(motif_classement)) BETWEEN 5 AND 300)
      AND (motif_annulation IS NULL OR length(btrim(motif_annulation)) BETWEEN 5 AND 300)),
    -- Chaque statut avec ses colonnes : une levée datée, un classement et une
    -- annulation datés et motivés. Un constat annulé garde la trace de ce qu'il était.
    CONSTRAINT constats_assimiles_statut_colonnes CHECK (
      (statut <> 'leve' OR leve_le IS NOT NULL)
      AND (leve_le IS NULL OR statut IN ('leve', 'annule'))
      AND (observation_levee IS NULL OR leve_le IS NOT NULL)
      AND ((classe_le IS NULL) = (motif_classement IS NULL))
      AND (statut <> 'classe' OR classe_le IS NOT NULL)
      AND (classe_le IS NULL OR statut IN ('classe', 'annule'))
      AND (leve_le IS NULL OR classe_le IS NULL)
      AND ((statut = 'annule') = (annule_le IS NOT NULL))
      AND ((annule_le IS NULL) = (motif_annulation IS NULL))
      AND ((levee_annulee_le IS NULL) = (motif_annulation_levee IS NULL))),
    CONSTRAINT constats_assimiles_levee_date CHECK (leve_le IS NULL OR leve_le >= date_constat),
    CONSTRAINT constats_assimiles_provenance CHECK (provenance IN ('reel', 'simule'))
);
CREATE INDEX IF NOT EXISTS idx_constats_assimiles_commune ON constats_assimiles (commune_id, date_constat DESC);
CREATE INDEX IF NOT EXISTS idx_constats_assimiles_commerce ON constats_assimiles (commerce_id, date_constat DESC);

-- ---------------------------------------------------------------------------
-- 6. Les sanctions (déclarées ici : le constat les consulte)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sanctions_constats (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id        TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    constat_id        UUID NOT NULL REFERENCES constats_assimiles(id) ON DELETE CASCADE,
    nature            TEXT NOT NULL,
    reference         TEXT NOT NULL,
    date_decision     DATE NOT NULL,
    observation       TEXT,
    statut            TEXT NOT NULL DEFAULT 'valide',
    annulee_le        TIMESTAMPTZ,
    motif_annulation  TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    provenance        TEXT NOT NULL DEFAULT 'reel',
    CONSTRAINT sanctions_constats_nature CHECK (nature IN ('arrete', 'proces_verbal', 'autre')),
    -- La référence du document, telle qu'il la porte : lettres, chiffres, « / - . ° »
    -- et espaces ; jamais un nom en phrase.
    CONSTRAINT sanctions_constats_reference CHECK (length(btrim(reference)) BETWEEN 3 AND 200
                                                   AND reference ~ '^[[:alnum:][:space:]°/.()_-]+$'),
    CONSTRAINT sanctions_constats_observation CHECK (observation IS NULL OR length(btrim(observation)) BETWEEN 1 AND 300),
    CONSTRAINT sanctions_constats_statut CHECK (statut IN ('valide', 'annulee')),
    CONSTRAINT sanctions_constats_statut_colonnes CHECK ((statut = 'annulee') = (annulee_le IS NOT NULL)
                                                         AND (annulee_le IS NULL) = (motif_annulation IS NULL)
                                                         AND (motif_annulation IS NULL OR length(btrim(motif_annulation)) BETWEEN 5 AND 300)),
    CONSTRAINT sanctions_constats_provenance CHECK (provenance IN ('reel', 'simule'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sanctions_constats_valide ON sanctions_constats (constat_id) WHERE statut = 'valide';
CREATE INDEX IF NOT EXISTS idx_sanctions_constats ON sanctions_constats (constat_id, created_at);

CREATE OR REPLACE FUNCTION app.controler_constat_assimile()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_co   record;
  v_f    record;
  v_s    record;
  v_mobiles text[] := ARRAY['statut', 'leve_le', 'observation_levee', 'levee_annulee_le', 'motif_annulation_levee',
                            'classe_le', 'motif_classement', 'annule_le', 'motif_annulation', 'updated_at'];
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT app.peut_emettre_document(NEW.commune_id) THEN
      RAISE EXCEPTION 'CONSTAT_HORS_PERIMETRE' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT c.nom, c.commune_id INTO v_co FROM commerces c WHERE c.id = NEW.commerce_id AND c.deleted_at IS NULL;
    IF v_co.nom IS NULL OR v_co.commune_id IS DISTINCT FROM NEW.commune_id THEN
      RAISE EXCEPTION 'CONSTAT_ETABLISSEMENT: cet établissement n''est pas inscrit dans la commune ; choisissez-le dans son registre.' USING ERRCODE = 'check_violation';
    END IF;
    PERFORM app._refuser_identifiant(NEW.description, 'description');
    IF NEW.date_constat > app.jour_tunis() THEN
      RAISE EXCEPTION 'CONSTAT_FUTUR: un manquement se constate après les faits : le % n''est pas encore arrivé.', to_char(NEW.date_constat, 'DD/MM/YYYY')
        USING ERRCODE = 'check_violation';
    END IF;
    PERFORM app._controler_delai_constat(NEW.date_constat, 'constat');
    SELECT * INTO v_f FROM app._fermeture_au(NEW.commerce_id, NEW.date_constat);
    IF v_f.ferme_le IS NOT NULL THEN
      IF v_f.rouvert_le IS NULL THEN
        RAISE EXCEPTION 'CONSTAT_ETABLISSEMENT_FERME: « % » est fermé depuis le % : un constat ne vise pas un établissement fermé le jour des faits (%).',
          v_co.nom, to_char(v_f.ferme_le, 'DD/MM/YYYY'), to_char(NEW.date_constat, 'DD/MM/YYYY') USING ERRCODE = 'check_violation';
      END IF;
      RAISE EXCEPTION 'CONSTAT_ETABLISSEMENT_FERME: « % » était fermé du % au % : un constat ne vise pas un établissement fermé le jour des faits (%).',
        v_co.nom, to_char(v_f.ferme_le, 'DD/MM/YYYY'), to_char(v_f.rouvert_le, 'DD/MM/YYYY'), to_char(NEW.date_constat, 'DD/MM/YYYY')
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.statut := 'constate';
    NEW.leve_le := NULL; NEW.observation_levee := NULL; NEW.levee_annulee_le := NULL; NEW.motif_annulation_levee := NULL;
    NEW.classe_le := NULL; NEW.motif_classement := NULL; NEW.annule_le := NULL; NEW.motif_annulation := NULL;
    NEW.created_at := now();
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF to_jsonb(NEW) = to_jsonb(OLD) THEN
    RETURN NEW;
  END IF;
  IF NOT app.peut_emettre_document(OLD.commune_id) THEN
    RAISE EXCEPTION 'CONSTAT_HORS_PERIMETRE' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (to_jsonb(NEW) - v_mobiles) <> (to_jsonb(OLD) - v_mobiles) THEN
    RAISE EXCEPTION 'CONSTAT_FIGE: un constat garde son établissement, sa date, son type et sa description ; s''il est erroné, il s''annule avec un motif.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.statut = 'annule' THEN
    RAISE EXCEPTION 'CONSTAT_FIGE: un constat annulé est figé.' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT ((OLD.statut = 'constate' AND NEW.statut IN ('leve', 'classe', 'annule'))
          OR (OLD.statut = 'leve' AND NEW.statut IN ('constate', 'annule'))
          OR (OLD.statut = 'classe' AND NEW.statut = 'annule')) THEN
    RAISE EXCEPTION 'CONSTAT_TRANSITION: un constat « constaté » se lève, se classe ou s''annule ; un constat levé s''annule, ou sa levée s''annule ; un constat classé ne peut plus que s''annuler.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.statut = 'leve' THEN
    IF NEW.leve_le > app.jour_tunis() THEN
      RAISE EXCEPTION 'CONSTAT_LEVEE_A_VENIR: levé le % : une levée ne se date pas après aujourd''hui (%).',
        to_char(NEW.leve_le, 'DD/MM/YYYY'), to_char(app.jour_tunis(), 'DD/MM/YYYY') USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.leve_le < OLD.date_constat THEN
      RAISE EXCEPTION 'CONSTAT_LEVEE_AVANT: la levée suit le constat : levé le %, constaté le %.',
        to_char(NEW.leve_le, 'DD/MM/YYYY'), to_char(OLD.date_constat, 'DD/MM/YYYY') USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.statut IN ('classe', 'annule') THEN
    SELECT s.reference, s.date_decision INTO v_s FROM sanctions_constats s WHERE s.constat_id = OLD.id AND s.statut = 'valide';
    IF v_s.reference IS NOT NULL THEN
      RAISE EXCEPTION 'CONSTAT_SANCTION_VALIDE: ce constat porte une sanction valide (référence %, du %) : annulez d''abord la sanction, avec son motif, avant de le %.',
        v_s.reference, to_char(v_s.date_decision, 'DD/MM/YYYY'), CASE NEW.statut WHEN 'classe' THEN 'classer sans suite' ELSE 'annuler' END
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.statut = 'constate' AND (NEW.motif_annulation_levee IS NULL OR NEW.levee_annulee_le IS NOT DISTINCT FROM OLD.levee_annulee_le) THEN
    RAISE EXCEPTION 'CONSTAT_MOTIF: une levée s''annule avec son motif.' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM app._refuser_identifiant(NEW.observation_levee, 'observation de la levée');
  PERFORM app._refuser_identifiant(NEW.motif_annulation_levee, 'motif de l''annulation de la levée');
  PERFORM app._refuser_identifiant(NEW.motif_classement, 'motif du classement');
  PERFORM app._refuser_identifiant(NEW.motif_annulation, 'motif de l''annulation');
  NEW.updated_at := now();
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_controler_constat_assimile ON constats_assimiles;
CREATE TRIGGER trg_controler_constat_assimile BEFORE INSERT OR UPDATE ON constats_assimiles
  FOR EACH ROW EXECUTE FUNCTION app.controler_constat_assimile();

CREATE OR REPLACE FUNCTION app.controler_sanction_constat()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_c constats_assimiles;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NOT app.peut_emettre_document(OLD.commune_id) THEN
      RAISE EXCEPTION 'SANCTION_INTROUVABLE' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF OLD.statut = 'valide' AND NEW.statut = 'annulee'
       AND (to_jsonb(NEW) - ARRAY['statut', 'annulee_le', 'motif_annulation']) = (to_jsonb(OLD) - ARRAY['statut', 'annulee_le', 'motif_annulation']) THEN
      PERFORM app._refuser_identifiant(NEW.motif_annulation, 'motif de l''annulation');
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'SANCTION_FIGEE: une sanction ne se réécrit pas ; elle s''annule avec un motif, et une nouvelle peut être enregistrée.'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_c FROM constats_assimiles WHERE id = NEW.constat_id FOR UPDATE;
  IF v_c.id IS NULL OR NOT app.peut_emettre_document(v_c.commune_id) THEN
    RAISE EXCEPTION 'CONSTAT_INTROUVABLE' USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.commune_id := v_c.commune_id;
  IF v_c.statut NOT IN ('constate', 'leve') THEN
    RAISE EXCEPTION 'SANCTION_STATUT_CONSTAT: un constat % ne reçoit pas de sanction.', CASE v_c.statut WHEN 'classe' THEN 'classé sans suite' ELSE 'annulé' END
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.date_decision > app.jour_tunis() THEN
    RAISE EXCEPTION 'SANCTION_DATE: une décision se date du jour où elle a été prise : le % n''est pas encore arrivé.', to_char(NEW.date_decision, 'DD/MM/YYYY')
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.date_decision < v_c.date_constat THEN
    RAISE EXCEPTION 'SANCTION_DATE: la décision suit le constat : décidée le %, constaté le %.',
      to_char(NEW.date_decision, 'DD/MM/YYYY'), to_char(v_c.date_constat, 'DD/MM/YYYY') USING ERRCODE = 'check_violation';
  END IF;
  PERFORM app._refuser_identifiant(NEW.observation, 'observation');
  NEW.statut := 'valide';
  NEW.annulee_le := NULL; NEW.motif_annulation := NULL;
  NEW.created_at := now();
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_controler_sanction_constat ON sanctions_constats;
CREATE TRIGGER trg_controler_sanction_constat BEFORE INSERT OR UPDATE ON sanctions_constats
  FOR EACH ROW EXECUTE FUNCTION app.controler_sanction_constat();

-- ---------------------------------------------------------------------------
-- 7. Les photos d'un constat
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS photos_constats_assimiles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id  TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    constat_id  UUID NOT NULL REFERENCES constats_assimiles(id) ON DELETE CASCADE,
    fichier_id  UUID NOT NULL REFERENCES fichiers(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    provenance  TEXT NOT NULL DEFAULT 'reel',
    CONSTRAINT photos_constats_assimiles_provenance CHECK (provenance IN ('reel', 'simule'))
);
-- Une photo est la pièce d'un seul constat.
CREATE UNIQUE INDEX IF NOT EXISTS uq_photos_constats_fichier ON photos_constats_assimiles (fichier_id);
CREATE INDEX IF NOT EXISTS idx_photos_constats ON photos_constats_assimiles (constat_id, created_at);

-- Joindre une photo fait partie de la saisie du constat : même délai, constat
-- encore « constaté », sous le verrou du constat (le compte de dix tient).
CREATE OR REPLACE FUNCTION app.controler_photo_constat()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_c constats_assimiles;
  v_f record;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'PHOTO_FIGEE: une photo de constat ne se modifie ni ne se retire.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_c FROM constats_assimiles WHERE id = NEW.constat_id FOR UPDATE;
  IF v_c.id IS NULL OR NOT app.peut_emettre_document(v_c.commune_id) THEN
    RAISE EXCEPTION 'CONSTAT_INTROUVABLE' USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.commune_id := v_c.commune_id;
  SELECT f.commune_id, f.usage, f.visibilite, f.deleted_at INTO v_f FROM fichiers f WHERE f.id = NEW.fichier_id;
  IF v_f.commune_id IS NULL OR v_f.commune_id <> v_c.commune_id OR v_f.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'PHOTO_COMMUNE: ce fichier n''est pas une photo déposée pour la commune du constat ; déposez-la d''abord (usage « constat_assimile »).'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_f.usage IS DISTINCT FROM 'constat_assimile' OR v_f.visibilite <> 'commune' THEN
    RAISE EXCEPTION 'PHOTO_USAGE: ce fichier a été déposé pour un autre usage ; la photo d''un constat se dépose avec l''usage « constat_assimile ».'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_c.statut <> 'constate' THEN
    RAISE EXCEPTION 'PHOTO_STATUT: une photo se joint à un constat « constaté » (celui-ci est %).',
      CASE v_c.statut WHEN 'leve' THEN 'levé' WHEN 'classe' THEN 'classé sans suite' ELSE 'annulé' END USING ERRCODE = 'check_violation';
  END IF;
  PERFORM app._controler_delai_constat(v_c.date_constat, 'photo');
  IF (SELECT count(*) FROM photos_constats_assimiles p WHERE p.constat_id = v_c.id) >= 10 THEN
    RAISE EXCEPTION 'PHOTO_MAX: un constat porte 10 photos au plus.' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM photos_constats_assimiles p WHERE p.fichier_id = NEW.fichier_id) THEN
    RAISE EXCEPTION 'PHOTO_DEJA_JOINTE: cette photo est déjà jointe à un constat.' USING ERRCODE = 'check_violation';
  END IF;
  NEW.created_at := now();
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_controler_photo_constat ON photos_constats_assimiles;
CREATE TRIGGER trg_controler_photo_constat BEFORE INSERT OR UPDATE ON photos_constats_assimiles
  FOR EACH ROW EXECUTE FUNCTION app.controler_photo_constat();

-- Les deux gardes du fichier, posées une fois la table des photos créée.
DROP TRIGGER IF EXISTS trg_proteger_visibilite_photo_constat ON fichiers;
CREATE TRIGGER trg_proteger_visibilite_photo_constat BEFORE UPDATE OF visibilite, destinataire_citoyen_id, usage ON fichiers
  FOR EACH ROW EXECUTE FUNCTION app.proteger_visibilite_photo_constat();
DROP TRIGGER IF EXISTS trg_proteger_fichier_photo_constat ON fichiers;
CREATE TRIGGER trg_proteger_fichier_photo_constat BEFORE UPDATE OF deleted_at ON fichiers
  FOR EACH ROW EXECUTE FUNCTION app.proteger_fichier_photo_constat();

-- ---------------------------------------------------------------------------
-- 8. Les gestes : sous le verrou du constat, avec la version lue (le xmin)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app._constat_a_traiter(p_id uuid, p_version text)
  RETURNS constats_assimiles LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v constats_assimiles;
  v_version text;
BEGIN
  SELECT * INTO v FROM constats_assimiles c WHERE c.id = p_id FOR UPDATE;
  IF v.id IS NULL OR NOT app.peut_emettre_document(v.commune_id) THEN
    RAISE EXCEPTION 'CONSTAT_INTROUVABLE' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT c.xmin::text INTO v_version FROM constats_assimiles c WHERE c.id = p_id;
  IF p_version IS DISTINCT FROM v_version THEN
    RAISE EXCEPTION 'CONSTAT_VERSION: ce constat a changé depuis que vous l''avez ouvert ; il est à jour, recommencez.'
      USING ERRCODE = 'serialization_failure';
  END IF;
  RETURN v;
END
$$;
REVOKE ALL ON FUNCTION app._constat_a_traiter(uuid, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION app._motif_constat(p_motif text, p_quoi text) RETURNS text
  LANGUAGE plpgsql IMMUTABLE AS
$$
BEGIN
  IF length(btrim(COALESCE(p_motif, ''))) NOT BETWEEN 5 AND 300 THEN
    RAISE EXCEPTION 'CONSTAT_MOTIF: % se motive (de 5 à 300 caractères).', p_quoi USING ERRCODE = 'check_violation';
  END IF;
  RETURN btrim(p_motif);
END
$$;

CREATE OR REPLACE FUNCTION app.lever_constat(p_id uuid, p_version text, p_date date, p_observation text)
  RETURNS constats_assimiles LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v constats_assimiles;
BEGIN
  v := app._constat_a_traiter(p_id, p_version);
  IF v.statut <> 'constate' THEN
    RAISE EXCEPTION 'CONSTAT_TRANSITION: seul un constat « constaté » se lève.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_date IS NULL THEN
    RAISE EXCEPTION 'CONSTAT_LEVEE_A_VENIR: une levée se date.' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE constats_assimiles SET statut = 'leve', leve_le = p_date, observation_levee = NULLIF(btrim(COALESCE(p_observation, '')), '')
   WHERE id = p_id RETURNING * INTO v;
  RETURN v;
END
$$;

CREATE OR REPLACE FUNCTION app.annuler_levee(p_id uuid, p_version text, p_motif text)
  RETURNS constats_assimiles LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v constats_assimiles;
  v_motif text;
BEGIN
  v := app._constat_a_traiter(p_id, p_version);
  IF v.statut <> 'leve' THEN
    RAISE EXCEPTION 'CONSTAT_TRANSITION: seule la levée d''un constat levé s''annule.' USING ERRCODE = 'check_violation';
  END IF;
  v_motif := app._motif_constat(p_motif, 'l''annulation d''une levée');
  UPDATE constats_assimiles SET statut = 'constate', leve_le = NULL, observation_levee = NULL,
         levee_annulee_le = now(), motif_annulation_levee = v_motif
   WHERE id = p_id RETURNING * INTO v;
  RETURN v;
END
$$;

CREATE OR REPLACE FUNCTION app.classer_constat(p_id uuid, p_version text, p_motif text)
  RETURNS constats_assimiles LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v constats_assimiles;
  v_motif text;
BEGIN
  v := app._constat_a_traiter(p_id, p_version);
  IF v.statut <> 'constate' THEN
    RAISE EXCEPTION 'CONSTAT_TRANSITION: seul un constat « constaté » se classe sans suite (un constat levé ou classé ne peut plus que s''annuler).' USING ERRCODE = 'check_violation';
  END IF;
  v_motif := app._motif_constat(p_motif, 'un classement sans suite');
  UPDATE constats_assimiles SET statut = 'classe', classe_le = now(), motif_classement = v_motif WHERE id = p_id RETURNING * INTO v;
  RETURN v;
END
$$;

CREATE OR REPLACE FUNCTION app.annuler_constat(p_id uuid, p_version text, p_motif text)
  RETURNS constats_assimiles LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v constats_assimiles;
  v_motif text;
BEGIN
  v := app._constat_a_traiter(p_id, p_version);
  IF v.statut = 'annule' THEN
    RAISE EXCEPTION 'CONSTAT_FIGE: ce constat est déjà annulé.' USING ERRCODE = 'check_violation';
  END IF;
  v_motif := app._motif_constat(p_motif, 'une annulation');
  UPDATE constats_assimiles SET statut = 'annule', annule_le = now(), motif_annulation = v_motif WHERE id = p_id RETURNING * INTO v;
  RETURN v;
END
$$;

CREATE OR REPLACE FUNCTION app.enregistrer_sanction(p_constat uuid, p_version text, p_nature text, p_reference text,
                                                    p_date date, p_observation text)
  RETURNS sanctions_constats LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v  constats_assimiles;
  s  sanctions_constats;
BEGIN
  v := app._constat_a_traiter(p_constat, p_version);
  SELECT * INTO s FROM sanctions_constats x WHERE x.constat_id = p_constat AND x.statut = 'valide';
  IF s.id IS NOT NULL THEN
    RAISE EXCEPTION 'SANCTION_UNIQUE: ce constat porte déjà une sanction valide (référence %, du %) : annulez-la, avec son motif, avant d''en enregistrer une nouvelle.',
      s.reference, to_char(s.date_decision, 'DD/MM/YYYY') USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO sanctions_constats (constat_id, commune_id, nature, reference, date_decision, observation)
  VALUES (p_constat, v.commune_id, p_nature, btrim(p_reference), p_date, NULLIF(btrim(COALESCE(p_observation, '')), ''))
  RETURNING * INTO s;
  RETURN s;
END
$$;

-- Annuler une sanction : avec la version lue de la sanction (son xmin). Sans elle,
-- un écran resté ouvert annulerait une sanction déjà annulée puis remplacée.
DROP FUNCTION IF EXISTS app.annuler_sanction(uuid, text);
CREATE OR REPLACE FUNCTION app.annuler_sanction(p_id uuid, p_version text, p_motif text)
  RETURNS sanctions_constats LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_c  constats_assimiles;
  s    sanctions_constats;
  v_motif text;
  v_version text;
BEGIN
  -- Le constat d'abord, puis la sanction : l'ordre des verrous de tous les gestes.
  SELECT c.* INTO v_c FROM constats_assimiles c JOIN sanctions_constats x ON x.constat_id = c.id WHERE x.id = p_id FOR UPDATE OF c;
  IF v_c.id IS NULL OR NOT app.peut_emettre_document(v_c.commune_id) THEN
    RAISE EXCEPTION 'SANCTION_INTROUVABLE' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO s FROM sanctions_constats WHERE id = p_id FOR UPDATE;
  SELECT x.xmin::text INTO v_version FROM sanctions_constats x WHERE x.id = p_id;
  IF p_version IS DISTINCT FROM v_version THEN
    RAISE EXCEPTION 'SANCTION_VERSION: cette sanction a changé depuis que vous l''avez ouverte ; elle est à jour, recommencez.'
      USING ERRCODE = 'serialization_failure';
  END IF;
  IF s.statut <> 'valide' THEN
    RAISE EXCEPTION 'SANCTION_DEJA_ANNULEE: cette sanction est déjà annulée.' USING ERRCODE = 'check_violation';
  END IF;
  v_motif := app._motif_constat(p_motif, 'l''annulation d''une sanction');
  UPDATE sanctions_constats SET statut = 'annulee', annulee_le = now(), motif_annulation = v_motif WHERE id = p_id RETURNING * INTO s;
  RETURN s;
END
$$;

-- Joindre des photos : avec la version lue du constat. Un constat levé, classé ou
-- annulé entre-temps a changé de version : le geste est refusé (409) au lieu de
-- passer pour une pièce du constat tel qu'il était à l'écran.
CREATE OR REPLACE FUNCTION app.joindre_photos_constat(p_constat uuid, p_version text, p_fichiers uuid[])
  RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v constats_assimiles;
  f uuid;
BEGIN
  v := app._constat_a_traiter(p_constat, p_version);
  FOREACH f IN ARRAY COALESCE(p_fichiers, ARRAY[]::uuid[]) LOOP
    INSERT INTO photos_constats_assimiles (constat_id, fichier_id) VALUES (p_constat, f);
  END LOOP;
  RETURN COALESCE(array_length(p_fichiers, 1), 0);
END
$$;

REVOKE ALL ON FUNCTION app.lever_constat(uuid, text, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.annuler_levee(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.classer_constat(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.annuler_constat(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.enregistrer_sanction(uuid, text, text, text, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.annuler_sanction(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.joindre_photos_constat(uuid, text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lever_constat(uuid, text, date, text) TO siipi_app;
GRANT EXECUTE ON FUNCTION app.annuler_levee(uuid, text, text) TO siipi_app;
GRANT EXECUTE ON FUNCTION app.classer_constat(uuid, text, text) TO siipi_app;
GRANT EXECUTE ON FUNCTION app.annuler_constat(uuid, text, text) TO siipi_app;
GRANT EXECUTE ON FUNCTION app.enregistrer_sanction(uuid, text, text, text, date, text) TO siipi_app;
GRANT EXECUTE ON FUNCTION app.annuler_sanction(uuid, text, text) TO siipi_app;
GRANT EXECUTE ON FUNCTION app.joindre_photos_constat(uuid, text, uuid[]) TO siipi_app;

-- ---------------------------------------------------------------------------
-- 8 bis. L'historique d'un constat : chaque geste, daté, jamais réécrit
-- ---------------------------------------------------------------------------
-- La ligne du constat ne garde que son dernier état : une levée annulée efface sa
-- date, une seconde annulation remplace le motif de la première. L'historique les
-- garde toutes, dans l'ordre. Il est écrit par la base au moment même du geste
-- (déclencheur AFTER du constat, dans la transaction de la fonction qui le fait),
-- jamais par l'application ; il ne porte pas d'auteur (il est au journal d'audit).
CREATE TABLE IF NOT EXISTS historique_constats_assimiles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ordre       BIGINT GENERATED ALWAYS AS IDENTITY,
    commune_id  TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    constat_id  UUID NOT NULL REFERENCES constats_assimiles(id) ON DELETE CASCADE,
    geste       TEXT NOT NULL,
    date_effet  DATE,
    texte       TEXT,
    origine     TEXT NOT NULL DEFAULT 'geste',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    provenance  TEXT NOT NULL DEFAULT 'reel',
    CONSTRAINT historique_constats_geste CHECK (geste IN ('constate', 'leve', 'levee_annulee', 'classe', 'annule')),
    CONSTRAINT historique_constats_date CHECK ((geste IN ('constate', 'leve')) = (date_effet IS NOT NULL)),
    CONSTRAINT historique_constats_origine CHECK (origine IN ('geste', 'etat_initial')),
    CONSTRAINT historique_constats_provenance CHECK (provenance IN ('reel', 'simule'))
);
CREATE INDEX IF NOT EXISTS idx_historique_constats ON historique_constats_assimiles (constat_id, ordre);

CREATE OR REPLACE FUNCTION app.tenir_historique_constat()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO historique_constats_assimiles (commune_id, constat_id, geste, date_effet)
    VALUES (NEW.commune_id, NEW.id, 'constate', NEW.date_constat);
    RETURN NULL;
  END IF;
  IF NEW.statut IS NOT DISTINCT FROM OLD.statut THEN
    RETURN NULL;
  END IF;
  INSERT INTO historique_constats_assimiles (commune_id, constat_id, geste, date_effet, texte)
  VALUES (NEW.commune_id, NEW.id,
          CASE WHEN NEW.statut = 'constate' THEN 'levee_annulee' ELSE NEW.statut END,
          CASE WHEN NEW.statut = 'leve' THEN NEW.leve_le END,
          CASE NEW.statut WHEN 'leve' THEN NEW.observation_levee WHEN 'constate' THEN NEW.motif_annulation_levee
                          WHEN 'classe' THEN NEW.motif_classement ELSE NEW.motif_annulation END);
  RETURN NULL;
END
$$;
DROP TRIGGER IF EXISTS trg_tenir_historique_constat ON constats_assimiles;
CREATE TRIGGER trg_tenir_historique_constat AFTER INSERT OR UPDATE OF statut ON constats_assimiles
  FOR EACH ROW EXECUTE FUNCTION app.tenir_historique_constat();

-- Une ligne d'historique ne se réécrit pas. (Son effacement n'est offert à personne
-- par l'application ; seul celui des communes de test, par les campagnes, l'emporte.)
CREATE OR REPLACE FUNCTION app.refuser_reecriture_historique()
  RETURNS trigger LANGUAGE plpgsql AS
$$
BEGIN
  RAISE EXCEPTION 'HISTORIQUE_FIGE: l''historique d''un constat ne se réécrit pas.' USING ERRCODE = 'check_violation';
END
$$;
DROP TRIGGER IF EXISTS trg_historique_fige ON historique_constats_assimiles;
CREATE TRIGGER trg_historique_fige BEFORE UPDATE ON historique_constats_assimiles
  FOR EACH ROW EXECUTE FUNCTION app.refuser_reecriture_historique();

-- L'amorce, une fois, depuis l'état présent des constats qui existeraient déjà :
-- ce que la ligne ne garde plus (une levée annulée avant celle-ci) reste au journal.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM historique_constats_assimiles) THEN
    INSERT INTO historique_constats_assimiles (commune_id, constat_id, geste, date_effet, texte, origine, created_at)
    SELECT x.commune_id, x.id, g.geste, g.date_effet, g.texte, 'etat_initial', g.le
      FROM constats_assimiles x
      CROSS JOIN LATERAL (VALUES
        (1, 'constate', x.date_constat, NULL::text, x.created_at),
        (2, CASE WHEN x.levee_annulee_le IS NOT NULL THEN 'levee_annulee' END, NULL::date, x.motif_annulation_levee, x.levee_annulee_le),
        (3, CASE WHEN x.leve_le IS NOT NULL THEN 'leve' END, x.leve_le, x.observation_levee, x.updated_at),
        (4, CASE WHEN x.classe_le IS NOT NULL THEN 'classe' END, NULL::date, x.motif_classement, x.classe_le),
        (5, CASE WHEN x.annule_le IS NOT NULL THEN 'annule' END, NULL::date, x.motif_annulation, x.annule_le)
      ) AS g(rang, geste, date_effet, texte, le)
     WHERE g.geste IS NOT NULL
     ORDER BY x.id, g.rang;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 9. « À revoir » : une fermeture inscrite après coup qui couvre les faits
-- ---------------------------------------------------------------------------
-- Calculé, jamais écrit : le constat et sa sanction ne bougent pas, la commune
-- vérifie la fermeture ou annule le constat (règle 1.5). La période de fermeture
-- reste connue après une réouverture : le constat reste à revoir.
CREATE OR REPLACE FUNCTION app.constat_a_revoir(p_id uuid)
  RETURNS TABLE (code text, message text, message_ar text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT 'CONSTAT_ETABLISSEMENT_FERME_DEPUIS',
         format('L''établissement est enregistré fermé %s, ce qui couvre les faits du %s%s : vérifiez la période de fermeture (la corriger ou la retirer, depuis la fiche de l''établissement), ou annulez le constat%s.',
                CASE WHEN f.rouvert_le IS NULL THEN 'depuis le ' || to_char(f.ferme_le, 'DD/MM/YYYY')
                     ELSE 'du ' || to_char(f.ferme_le, 'DD/MM/YYYY') || ' au ' || to_char(f.rouvert_le, 'DD/MM/YYYY') END,
                to_char(k.date_constat, 'DD/MM/YYYY'),
                CASE WHEN s.reference IS NOT NULL THEN format(' ; une sanction valide le vise (référence %s, du %s)', s.reference, to_char(s.date_decision, 'DD/MM/YYYY')) ELSE '' END,
                CASE WHEN s.reference IS NOT NULL THEN ' après avoir annulé la sanction' ELSE '' END),
         format('المؤسسة مسجّلة مغلقة %s، وهي فترة تشمل وقائع %s%s: تحقّقوا من فترة الغلق (بتصحيحها أو سحبها من بطاقة المؤسسة) أو ألغوا المعاينة%s.',
                CASE WHEN f.rouvert_le IS NULL THEN 'منذ ' || to_char(f.ferme_le, 'DD/MM/YYYY')
                     ELSE 'من ' || to_char(f.ferme_le, 'DD/MM/YYYY') || ' إلى ' || to_char(f.rouvert_le, 'DD/MM/YYYY') END,
                to_char(k.date_constat, 'DD/MM/YYYY'),
                CASE WHEN s.reference IS NOT NULL THEN format('؛ وتتعلّق بها عقوبة سارية (المرجع %s بتاريخ %s)', s.reference, to_char(s.date_decision, 'DD/MM/YYYY')) ELSE '' END,
                CASE WHEN s.reference IS NOT NULL THEN ' بعد إلغاء العقوبة' ELSE '' END)
    FROM constats_assimiles k
    CROSS JOIN LATERAL app._fermeture_au(k.commerce_id, k.date_constat) f
    LEFT JOIN sanctions_constats s ON s.constat_id = k.id AND s.statut = 'valide'
   WHERE k.id = p_id AND k.statut IN ('constate', 'leve') AND app.can_write_commune(k.commune_id)
$$;
REVOKE ALL ON FUNCTION app.constat_a_revoir(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.constat_a_revoir(uuid) TO siipi_app;

-- ---------------------------------------------------------------------------
-- 10. Provenance, audit, cloisonnement, droits
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['constats_assimiles', 'photos_constats_assimiles', 'sanctions_constats', 'historique_constats_assimiles'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_provenance ON %I', t);
    EXECUTE format('CREATE TRIGGER trg_provenance BEFORE INSERT OR UPDATE OF provenance ON %I FOR EACH ROW EXECUTE FUNCTION app.controler_provenance()', t);
  END LOOP;
  -- P3 : chaque geste, son statut d'avant et d'après, et le compte qui l'a fait ;
  -- de même pour le retrait ou la correction d'une période de fermeture.
  FOREACH t IN ARRAY ARRAY['constats_assimiles', 'photos_constats_assimiles', 'sanctions_constats', 'fermetures_commerces'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%s ON %I', t, t);
    EXECUTE format('CREATE TRIGGER trg_audit_%s AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement()', t, t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['constats_assimiles', 'photos_constats_assimiles', 'sanctions_constats', 'fermetures_commerces', 'historique_constats_assimiles'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON %I FROM siipi_app', t);
    EXECUTE format('GRANT SELECT ON %I TO siipi_app', t);
  END LOOP;
END $$;

-- La commune et la FNCT lisent ; un prestataire ne voit rien. Le directeur seul écrit.
DROP POLICY IF EXISTS constats_assimiles_select ON constats_assimiles;
CREATE POLICY constats_assimiles_select ON constats_assimiles FOR SELECT USING (app.can_write_commune(commune_id));
DROP POLICY IF EXISTS constats_assimiles_insert ON constats_assimiles;
CREATE POLICY constats_assimiles_insert ON constats_assimiles FOR INSERT WITH CHECK (app.peut_emettre_document(commune_id));
GRANT INSERT (commune_id, commerce_id, date_constat, type, description, provenance) ON constats_assimiles TO siipi_app;

DROP POLICY IF EXISTS photos_constats_assimiles_select ON photos_constats_assimiles;
CREATE POLICY photos_constats_assimiles_select ON photos_constats_assimiles FOR SELECT USING (app.can_write_commune(commune_id));
DROP POLICY IF EXISTS photos_constats_assimiles_insert ON photos_constats_assimiles;
CREATE POLICY photos_constats_assimiles_insert ON photos_constats_assimiles FOR INSERT WITH CHECK (app.peut_emettre_document(commune_id));
GRANT INSERT (constat_id, fichier_id) ON photos_constats_assimiles TO siipi_app;

-- L'historique : lu comme le constat, écrit par la base seule.
DROP POLICY IF EXISTS historique_constats_assimiles_select ON historique_constats_assimiles;
CREATE POLICY historique_constats_assimiles_select ON historique_constats_assimiles FOR SELECT USING (app.can_write_commune(commune_id));

-- Les sanctions s'écrivent par app.enregistrer_sanction et app.annuler_sanction seules.
DROP POLICY IF EXISTS sanctions_constats_select ON sanctions_constats;
CREATE POLICY sanctions_constats_select ON sanctions_constats FOR SELECT USING (app.can_write_commune(commune_id));

-- Les périodes de fermeture : lues comme les établissements (la commune et la FNCT ;
-- un prestataire ne voit rien), écrites par la base seule.
DROP POLICY IF EXISTS fermetures_commerces_select ON fermetures_commerces;
CREATE POLICY fermetures_commerces_select ON fermetures_commerces FOR SELECT USING (app.can_write_commune(commune_id));

-- Une photo de constat peut-elle servir de preuve ailleurs ? Jamais : une route qui
-- adresse un fichier à un citoyen (la preuve de traitement d'une réclamation) le
-- demande ici AVANT toute écriture, quel que soit ce que l'appelant lit du fichier.
CREATE OR REPLACE FUNCTION app.est_photo_constat(p_fichier uuid, p_commune text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT EXISTS (SELECT 1 FROM fichiers f WHERE f.id = p_fichier AND f.commune_id = p_commune
                    AND (f.usage = 'constat_assimile' OR EXISTS (SELECT 1 FROM photos_constats_assimiles p WHERE p.fichier_id = f.id)))
$$;
REVOKE ALL ON FUNCTION app.est_photo_constat(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.est_photo_constat(uuid, text) TO siipi_app;

-- ---------------------------------------------------------------------------
-- 11. Ce que l'administrateur lira dans dix ans
-- ---------------------------------------------------------------------------
COMMENT ON TABLE constats_assimiles IS
  'Les manquements constatés d''un établissement (jalon G, lot G7a) : la commune constate, au plus N jours après les faits (paramètre national daté delai_saisie_constat_assimile), jamais sur un établissement fermé le jour des faits. Constaté → levé | classé sans suite | annulé ; levé → constaté (levée annulée) | annulé ; classé → annulé ; annulé est figé. Aucune colonne d''auteur : le compte de chaque geste est au journal d''audit seulement. Ne s''efface jamais.';
COMMENT ON COLUMN constats_assimiles.description IS 'Décrit le fait, jamais la personne : 500 caractères au plus, rien qui ait la forme d''un CIN ou d''un téléphone. Obligatoire pour le type « autre ».';
COMMENT ON COLUMN constats_assimiles.observation_levee IS 'Décrit le fait, jamais la personne (300 caractères au plus).';
COMMENT ON COLUMN constats_assimiles.levee_annulee_le IS 'La dernière annulation d''une levée (levée saisie à tort) ; le constat redevient « constaté », la levée annulée reste au journal d''audit.';
COMMENT ON COLUMN constats_assimiles.motif_annulation_levee IS 'Le motif de la dernière annulation de levée. Décrit le fait, jamais la personne.';
COMMENT ON COLUMN constats_assimiles.motif_classement IS 'Pourquoi le constat est classé sans suite. Décrit le fait, jamais la personne.';
COMMENT ON COLUMN constats_assimiles.motif_annulation IS 'Pourquoi le constat est annulé (saisi à tort). Décrit le fait, jamais la personne.';
COMMENT ON TABLE photos_constats_assimiles IS
  'Les photos d''un constat : des fichiers d''usage « constat_assimile » de la même commune, 10 au plus, jointes dans le délai de saisie à un constat « constaté ». Jamais retirées, jamais publiques ; l''auteur du dépôt (fichiers.televerse_par) ne sort par aucune route pour cet usage.';
COMMENT ON TABLE historique_constats_assimiles IS
  'L''historique de chaque constat, dans l''ordre (ordre) : constaté (date des faits), levé (date et observation), levée annulée (motif), classé (motif), annulé (motif). Écrit par la base au moment du geste (app.tenir_historique_constat), jamais par l''application, jamais réécrit ; aucun auteur (il est au journal d''audit). Une levée annulée puis refaite y garde ses deux dates et ses deux motifs.';
COMMENT ON COLUMN historique_constats_assimiles.date_effet IS 'La date des faits (constaté) ou de la levée (levé) ; aucune pour les autres gestes, datés par created_at.';
COMMENT ON COLUMN historique_constats_assimiles.texte IS 'L''observation de la levée, ou le motif du geste. Décrit le fait, jamais la personne.';
COMMENT ON COLUMN historique_constats_assimiles.origine IS 'geste : écrit au moment du geste ; etat_initial : amorcé par la migration 107 depuis la ligne du constat.';
COMMENT ON TABLE sanctions_constats IS
  'Les décisions prises sur un constat : arrêté, procès-verbal ou autre, avec la référence que le document porte et sa date. Aucun montant. Une seule valide par constat ; elle s''annule avec un motif, une nouvelle peut suivre, l''historique reste.';
COMMENT ON COLUMN sanctions_constats.reference IS 'Le numéro du document tel qu''il le porte (lettres, chiffres, « / - . ° »), jamais un nom.';
COMMENT ON TABLE fermetures_commerces IS
  'Les périodes de fermeture des établissements, tenues par la base depuis le geste de statut (app.tenir_fermetures_commerce) : commerces ne garde que son dernier statut. rouvert_le est le jour où la commune a inscrit la réouverture (aucune date métier n''existe). Amorcée par la migration 107 depuis l''état présent (etat_initial) et le journal d''audit (journal_audit) ; ce que le journal ne connaît pas reste inconnu. Une période saisie à tort se retire (retiree_le, motif_retrait) ou se corrige (corrigee_le, motif_correction) par le directeur : rien ne s''efface, l''auteur est au journal d''audit. Une période retirée ne couvre plus rien.';
COMMENT ON COLUMN fermetures_commerces.retiree_le IS 'Le retrait d''une période close saisie à tort (app.retirer_fermeture) : elle reste lisible, et ne couvre plus aucun jour.';
COMMENT ON COLUMN fermetures_commerces.corrigee_le IS 'La dernière correction des dates (app.corriger_fermeture) ; les dates d''avant sont au journal d''audit.';
COMMENT ON COLUMN fichiers.nom_original IS 'Le nom donné par la personne qui dépose, pour proposer un nom au téléchargement ; il ne construit jamais un chemin. Pour une photo de constat (constat_assimile), il est posé par le serveur (constat-<identifiant>.<type>) et ne vient jamais de l''appareil.';
COMMENT ON FUNCTION app.constat_a_revoir(uuid) IS
  'Un constat constaté ou levé qu''une période de fermeture couvre (inscrite après lui) : code, message en français et en arabe. Ne corrige rien, ne bloque rien.';
COMMENT ON FUNCTION app._texte_sans_identifiant(text) IS
  'Faux si le texte porte huit chiffres ou plus qui se suivent, une fois les chiffres arabes-indiens, persans et pleine chasse ramenés en ASCII et les espaces entre deux chiffres retirés : la forme d''un CIN ou d''un téléphone (loi organique n° 2004-63). Points, tirets et barres obliques ne joignent rien : dates et numéros d''arrêté restent permis.';
COMMENT ON CONSTRAINT fichiers_type_autorise ON fichiers IS
  'Images et PDF pour tout usage ; documents Word/Excel/PowerPoint réservés à un rapport ou une étude (rapport_etude) ; un logo de commune (logo_commune) est une image — JPEG, PNG, WebP ou SVG statique ; la photo d''un constat (constat_assimile) est une image JPEG, PNG ou WebP.';
COMMENT ON CONSTRAINT fichiers_constat_prive ON fichiers IS
  'La photo d''un constat de manquement reste au service de la commune : jamais publique, jamais adressée à un citoyen.';
