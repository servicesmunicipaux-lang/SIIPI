-- =============================================================================
-- 103 — Jalon G, lot G4a : les conventions de propreté
--
-- SPEC_G § 1 et § 3.4 ; décisions du 4 novembre 2026 et du 11 novembre 2026
-- (les neuf propositions de G4, la base légale pré-remplie). Une convention lie un
-- établissement (G2) à la grille tarifaire approuvée (G1) ; elle devient un
-- document scellé à sa signature.
--
--   brouillon → instruite → signée → (résiliée)
--
-- « Active », « à venir » et « expirée » se CALCULENT d'après les dates : aucun
-- passage de nuit ne les écrit, qui pourrait ne pas tourner et laisser en base
-- une convention « active » échue. Une convention signée ne se modifie plus.
--
-- Les gestes passent par des fonctions de la base, sous verrou, qui vérifient
-- tout au moment même : l'instruction (grille approuvée en vigueur au début,
-- tarif pour la catégorie, au moins un flux de la liste nationale et aucun
-- dangereux, établissement non fermé, aucun chevauchement), la signature (la même
-- chose, plus une base légale en vigueur le jour de la signature ; émission du
-- document scellé « convention_proprete », préfixe CV), la résiliation (date et
-- motif). Aucun montant n'est calculé : le document cite le tarif de la grille et
-- l'arrêté ; le montant dû vient de l'assiette (G6).
--
-- La base légale : la loi existe sans attendre la FNCT. Les quatre textes connus
-- s'inscrivent ici (décision du 11 novembre 2026), provisoires ; la FNCT fixe la
-- date d'application du décret-loi n° 4 de 2026, en ajoute, en ferme ou en retire.
-- Quand elle fixe cette date, la loi organique n° 2018-29, qu'il abroge, prend
-- fin le même jour : le lien est une donnée (`abroge_par`), pas du code.
--
-- Le registre simple d'avant G4 (051) reste lisible, en lecture seule, compté par
-- M2-2 comme avant ; aucune convention ne s'y ajoute plus.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. La base légale : l'abrogation tenue comme une donnée, et les textes connus
-- ---------------------------------------------------------------------------
ALTER TABLE elements_listes_nationales ADD COLUMN IF NOT EXISTS abroge_par UUID REFERENCES elements_listes_nationales(id);
ALTER TABLE elements_listes_nationales DROP CONSTRAINT IF EXISTS elements_abroge_par_liste;
ALTER TABLE elements_listes_nationales ADD CONSTRAINT elements_abroge_par_liste
  CHECK (abroge_par IS NULL OR liste = 'base_legale_assimiles');
COMMENT ON COLUMN elements_listes_nationales.abroge_par IS
  'Base légale seulement : le texte qui abroge celui-ci. Quand la date d''application du texte abrogeant se fixe, ce texte-ci prend fin le même jour (fin posée par la base, avec sa pièce). Posé à l''inscription, figé ensuite.';

-- Quand la date d'application d'un texte se fixe (de vide à une date), les textes
-- qu'il abroge prennent fin ce jour-là. Un texte déjà fermé, ou retiré, n'est pas
-- touché : sa fin a été fixée une fois, avec sa propre pièce.
CREATE OR REPLACE FUNCTION app.appliquer_abrogations() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
  IF NEW.liste = 'base_legale_assimiles' AND OLD.date_effet IS NULL AND NEW.date_effet IS NOT NULL THEN
    UPDATE elements_listes_nationales a
       SET date_fin = NEW.date_effet,
           reference_fin = left('Abrogé par ' || NEW.libelle_fr || ', applicable le '
                                || to_char(NEW.date_effet, 'DD/MM/YYYY') || ' (' || NEW.reference_effet || ')', 500)
     WHERE a.abroge_par = NEW.id AND a.date_fin IS NULL AND a.retire_le IS NULL
       AND a.date_effet IS NOT NULL AND a.date_effet < NEW.date_effet;
  END IF;
  RETURN NULL;
END
$$;
DROP TRIGGER IF EXISTS trg_appliquer_abrogations ON elements_listes_nationales;
CREATE TRIGGER trg_appliquer_abrogations AFTER UPDATE OF date_effet ON elements_listes_nationales
  FOR EACH ROW EXECUTE FUNCTION app.appliquer_abrogations();

-- Les textes connus (décision du 11 novembre 2026), provisoires jusqu'à leur
-- vérification au JORT par la FNCT. Chacun s'inscrit s'il n'y est pas déjà :
-- rejouée, la migration n'ajoute rien, et un texte que la FNCT aurait inscrit
-- elle-même sous ce code n'est pas doublé.
INSERT INTO elements_listes_nationales (liste, code, libelle_fr, libelle_ar, ordre, date_effet, date_publication, provisoire, reference)
SELECT 'base_legale_assimiles', t.code, t.fr, t.ar, t.ordre, t.effet, t.publication, true, t.reference
  FROM (VALUES
    ('loi_1996_41', 'Loi n° 96-41 du 10 juin 1996, relative aux déchets et au contrôle de leur gestion et de leur élimination',
     'القانون عدد 41 لسنة 1996 المؤرخ في 10 جوان 1996 المتعلق بالنفايات وبمراقبة التصرف فيها وإزالتها',
     10, DATE '1996-06-10', DATE '1996-06-10', 'JORT du 10 juin 1996 — date donnée par la FNCT le 11/11/2026, à vérifier au JORT'),
    ('code_fiscalite_locale', 'Code de la fiscalité locale',
     'مجلة الجباية المحلية',
     20, DATE '1997-02-03', DATE '1997-02-03', 'JORT du 3 février 1997 — date donnée par la FNCT le 11/11/2026, à vérifier au JORT'),
    ('lo_2018_29', 'Loi organique n° 2018-29 du 9 mai 2018, relative au Code des collectivités locales',
     'القانون الأساسي عدد 29 لسنة 2018 المؤرخ في 9 ماي 2018 المتعلق بمجلة الجماعات المحلية',
     30, DATE '2018-05-09', DATE '2018-05-09', 'JORT du 9 mai 2018 — date donnée par la FNCT le 11/11/2026, à vérifier au JORT ; abrogée par l''article 139 du décret-loi n° 4 de 2026')
  ) AS t(code, fr, ar, ordre, effet, publication, reference)
 WHERE NOT EXISTS (SELECT 1 FROM elements_listes_nationales x WHERE x.liste = 'base_legale_assimiles' AND x.code = t.code);

-- Le décret-loi n° 4 de 2026 : publié, applicable après la proclamation des
-- résultats des élections municipales (article 136). Sa date d'application reste
-- vide ; la FNCT la fixe, avec sa pièce.
INSERT INTO elements_listes_nationales (liste, code, libelle_fr, libelle_ar, ordre, date_effet, date_publication, provisoire, reference)
SELECT 'base_legale_assimiles', 'dl_2026_4',
       'Décret-loi n° 4 du 30 septembre 2026, relatif aux conseils municipaux',
       'المرسوم عدد 4 المؤرخ في 30 سبتمبر 2026 المتعلق بالمجالس البلدية',
       40, NULL, DATE '2026-09-30', true,
       'JORT n° 96 du 30 septembre 2026 ; applicable après la proclamation des résultats des élections municipales (article 136) — date d''application à fixer par la FNCT'
 WHERE NOT EXISTS (SELECT 1 FROM elements_listes_nationales x WHERE x.liste = 'base_legale_assimiles' AND x.code = 'dl_2026_4');

-- Le lien d'abrogation se pose sur la loi organique, si elle n'en a pas encore.
-- `abroge_par` est figé par le contrôle des éléments (098) : on ne le pose que
-- dans la transaction de la migration, sous un drapeau que le contrôle connaît.
CREATE OR REPLACE FUNCTION app.controler_element_liste() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_fige jsonb;
  v_libres text[] := ARRAY['date_fin', 'reference_fin', 'retire_le', 'retire_par', 'motif_retrait'];
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.retire_le IS NOT NULL OR NEW.date_fin IS NOT NULL THEN
      RAISE EXCEPTION 'ELEMENT_NAISSANCE: un élément s''inscrit ouvert ; il se ferme ou se retire ensuite.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.reference_effet IS NOT NULL THEN
      RAISE EXCEPTION 'ELEMENT_NAISSANCE: la pièce d''une date d''application ne s''inscrit qu''en la fixant, après coup.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF to_jsonb(NEW) = to_jsonb(OLD) THEN
    RETURN NEW;
  END IF;
  IF OLD.retire_le IS NOT NULL THEN
    RAISE EXCEPTION 'ELEMENT_FIGE: cet élément est retiré ; il reste lisible tel quel.' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.date_effet IS NULL THEN
    v_libres := v_libres || ARRAY['date_effet', 'reference_effet'];
    IF NEW.date_effet IS NOT NULL AND length(btrim(COALESCE(NEW.reference_effet, ''))) < 5 THEN
      RAISE EXCEPTION 'ELEMENT_EFFET: une date d''application se fixe avec la pièce qui la fonde (proclamation, arrêté).'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.date_effet IS NULL AND NEW.reference_effet IS NOT NULL THEN
      RAISE EXCEPTION 'ELEMENT_EFFET: une pièce sans date d''application ne fixe rien.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  -- Le lien d'abrogation : posé une fois, par la migration qui inscrit les textes.
  IF OLD.abroge_par IS NULL AND current_setting('app.pose_abrogation', true) = 'oui' THEN
    v_libres := v_libres || ARRAY['abroge_par'];
  END IF;
  v_fige := to_jsonb(NEW) - v_libres;
  IF v_fige IS DISTINCT FROM (to_jsonb(OLD) - v_libres) THEN
    RAISE EXCEPTION 'ELEMENT_FIGE: un élément de liste ne se réécrit pas ; fermez-le à une date et ajoutez-en un autre, ou retirez-le s''il était faux.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.date_fin IS NOT NULL AND (NEW.date_fin, NEW.reference_fin) IS DISTINCT FROM (OLD.date_fin, OLD.reference_fin) THEN
    RAISE EXCEPTION 'ELEMENT_FERME: cet élément est déjà fermé au %.', to_char(OLD.date_fin, 'DD/MM/YYYY')
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

SELECT set_config('app.pose_abrogation', 'oui', true);
UPDATE elements_listes_nationales lo
   SET abroge_par = dl.id
  FROM elements_listes_nationales dl
 WHERE lo.liste = 'base_legale_assimiles' AND lo.code = 'lo_2018_29' AND lo.abroge_par IS NULL
   AND lo.retire_le IS NULL AND lo.date_fin IS NULL
   AND dl.liste = 'base_legale_assimiles' AND dl.code = 'dl_2026_4' AND dl.retire_le IS NULL;
SELECT set_config('app.pose_abrogation', '', true);

-- ---------------------------------------------------------------------------
-- 2. La convention : le registre de 051, étendu
-- ---------------------------------------------------------------------------
ALTER TABLE conventions_commerciales ADD COLUMN IF NOT EXISTS nature TEXT NOT NULL DEFAULT 'registre';
-- « registre » ne qualifie que les lignes d'avant ce lot : une convention nouvelle
-- dit ce qu'elle est (le déclencheur refuse un registre nouveau).
ALTER TABLE conventions_commerciales ALTER COLUMN nature DROP DEFAULT;
ALTER TABLE conventions_commerciales ADD COLUMN IF NOT EXISTS exercice SMALLINT;
ALTER TABLE conventions_commerciales ADD COLUMN IF NOT EXISTS statut TEXT;
ALTER TABLE conventions_commerciales ADD COLUMN IF NOT EXISTS grille_id UUID REFERENCES grilles_tarifaires(id);
ALTER TABLE conventions_commerciales ADD COLUMN IF NOT EXISTS ligne_grille_id UUID REFERENCES lignes_grille(id);
ALTER TABLE conventions_commerciales ADD COLUMN IF NOT EXISTS mode_tarification TEXT;
ALTER TABLE conventions_commerciales ADD COLUMN IF NOT EXISTS tarif NUMERIC(12, 3);
ALTER TABLE conventions_commerciales ADD COLUMN IF NOT EXISTS instruite_le TIMESTAMPTZ;
ALTER TABLE conventions_commerciales ADD COLUMN IF NOT EXISTS instruite_par UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE conventions_commerciales ADD COLUMN IF NOT EXISTS date_signature DATE;
ALTER TABLE conventions_commerciales ADD COLUMN IF NOT EXISTS reference_signature TEXT;
ALTER TABLE conventions_commerciales ADD COLUMN IF NOT EXISTS document_id UUID REFERENCES documents_emis(id);
ALTER TABLE conventions_commerciales ADD COLUMN IF NOT EXISTS signee_le TIMESTAMPTZ;
ALTER TABLE conventions_commerciales ADD COLUMN IF NOT EXISTS signee_par UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE conventions_commerciales ADD COLUMN IF NOT EXISTS date_resiliation DATE;
ALTER TABLE conventions_commerciales ADD COLUMN IF NOT EXISTS motif_resiliation TEXT;
ALTER TABLE conventions_commerciales ADD COLUMN IF NOT EXISTS reference_resiliation TEXT;
ALTER TABLE conventions_commerciales ADD COLUMN IF NOT EXISTS resiliee_le TIMESTAMPTZ;
ALTER TABLE conventions_commerciales ADD COLUMN IF NOT EXISTS resiliee_par UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE conventions_commerciales ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE conventions_commerciales DROP CONSTRAINT IF EXISTS conventions_nature;
ALTER TABLE conventions_commerciales ADD CONSTRAINT conventions_nature CHECK (nature IN ('registre', 'convention'));
ALTER TABLE conventions_commerciales DROP CONSTRAINT IF EXISTS conventions_statut;
ALTER TABLE conventions_commerciales ADD CONSTRAINT conventions_statut CHECK (
  (nature = 'registre' AND statut IS NULL)
  OR (nature = 'convention' AND statut IN ('brouillon', 'instruite', 'signee', 'resiliee')));
-- Une convention est annuelle : un exercice, une fin, au plus un an.
ALTER TABLE conventions_commerciales DROP CONSTRAINT IF EXISTS conventions_annuelle;
ALTER TABLE conventions_commerciales ADD CONSTRAINT conventions_annuelle CHECK (
  nature = 'registre'
  OR (date_fin IS NOT NULL AND exercice = extract(year FROM date_debut)
      AND date_fin < (date_debut + interval '1 year')::date AND date_debut >= DATE '2000-01-01'));
-- Instruite : la grille, sa ligne, le mode et le tarif sont posés ensemble.
ALTER TABLE conventions_commerciales DROP CONSTRAINT IF EXISTS conventions_tarif_pose;
ALTER TABLE conventions_commerciales ADD CONSTRAINT conventions_tarif_pose CHECK (
  ((grille_id IS NULL) = (ligne_grille_id IS NULL)) AND ((grille_id IS NULL) = (mode_tarification IS NULL))
  AND ((grille_id IS NULL) = (tarif IS NULL)) AND ((grille_id IS NULL) = (instruite_le IS NULL))
  AND (statut IS NULL OR (statut = 'brouillon') = (grille_id IS NULL)));
ALTER TABLE conventions_commerciales DROP CONSTRAINT IF EXISTS conventions_mode;
ALTER TABLE conventions_commerciales ADD CONSTRAINT conventions_mode CHECK (
  mode_tarification IS NULL OR mode_tarification IN ('forfait_annuel', 'forfait_mensuel', 'reel_levee', 'reel_poids'));
-- Signée : son document, sa date, sa pièce — entiers.
ALTER TABLE conventions_commerciales DROP CONSTRAINT IF EXISTS conventions_signature_entiere;
ALTER TABLE conventions_commerciales ADD CONSTRAINT conventions_signature_entiere CHECK (
  ((statut IN ('signee', 'resiliee')) = (document_id IS NOT NULL))
  AND ((document_id IS NULL) = (date_signature IS NULL)) AND ((document_id IS NULL) = (signee_le IS NULL))
  AND (date_signature IS NULL OR length(btrim(COALESCE(reference_signature, ''))) >= 3)
  AND (date_signature IS NULL OR date_signature >= DATE '2000-01-01'));
-- Résiliée : sa date d'effet, son motif, sa pièce — entiers, et dans la période.
ALTER TABLE conventions_commerciales DROP CONSTRAINT IF EXISTS conventions_resiliation_entiere;
ALTER TABLE conventions_commerciales ADD CONSTRAINT conventions_resiliation_entiere CHECK (
  ((statut = 'resiliee') = (date_resiliation IS NOT NULL)) AND ((date_resiliation IS NULL) = (resiliee_le IS NULL))
  AND (date_resiliation IS NULL OR (length(btrim(COALESCE(motif_resiliation, ''))) >= 5
                                    AND length(btrim(COALESCE(reference_resiliation, ''))) >= 3
                                    AND date_resiliation >= date_signature AND date_resiliation <= date_fin)));
CREATE UNIQUE INDEX IF NOT EXISTS uq_conventions_document ON conventions_commerciales (document_id) WHERE document_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conventions_commune_statut ON conventions_commerciales (commune_id, statut) WHERE deleted_at IS NULL;

COMMENT ON COLUMN conventions_commerciales.nature IS
  'registre : une ligne du registre simple d''avant le lot G4 (051), lisible, comptée par M2-2, jamais modifiée ; convention : une convention de propreté du jalon G, avec son cycle de vie.';
COMMENT ON COLUMN conventions_commerciales.statut IS
  'brouillon → instruite → signee → resiliee (convention seulement). « Active », « à venir » et « expirée » se calculent d''après les dates, jamais écrites.';
COMMENT ON COLUMN conventions_commerciales.exercice IS 'L''année de la date de début : une convention est annuelle (au plus un an).';
COMMENT ON COLUMN conventions_commerciales.grille_id IS 'La grille approuvée en vigueur à la date de début, retenue à l''instruction (app.instruire_convention).';
COMMENT ON COLUMN conventions_commerciales.ligne_grille_id IS 'La ligne de cette grille pour la catégorie d''activité de l''établissement.';
COMMENT ON COLUMN conventions_commerciales.mode_tarification IS 'Le mode de la ligne de grille, recopié à l''instruction et figé à la signature.';
COMMENT ON COLUMN conventions_commerciales.tarif IS 'Le tarif de la ligne de grille (DT par an, par mois, par levée ou par tonne selon le mode), recopié. Aucun montant dû n''est calculé ici (lot G6).';
COMMENT ON COLUMN conventions_commerciales.document_id IS 'Le document scellé « convention_proprete » (CV-…), émis à la signature par app.signer_convention.';
COMMENT ON COLUMN conventions_commerciales.date_signature IS 'Le jour de la signature par les deux parties ; pas dans l''avenir.';
COMMENT ON COLUMN conventions_commerciales.reference_signature IS 'La pièce de la signature (référence du dossier, du courrier, de l''exemplaire signé).';
COMMENT ON COLUMN conventions_commerciales.date_resiliation IS
  'Le premier jour sans convention : la convention couvre jusqu''à la veille. Entre la date de signature et la date de fin.';

-- Les lignes : ce que la convention couvre.
CREATE TABLE IF NOT EXISTS lignes_convention (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    convention_id        UUID NOT NULL REFERENCES conventions_commerciales(id) ON DELETE CASCADE,
    commune_id           TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    flux_code            TEXT NOT NULL,
    conteneur_id         TEXT REFERENCES conteneurs(id),
    levees_par_semaine   SMALLINT NOT NULL,
    volume_litres        NUMERIC(8, 1),
    ordre                SMALLINT NOT NULL DEFAULT 0,
    provenance           TEXT NOT NULL DEFAULT 'reel',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at           TIMESTAMPTZ,
    deleted_by           UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT lignes_convention_levees CHECK (levees_par_semaine BETWEEN 1 AND 21),
    CONSTRAINT lignes_convention_volume CHECK (volume_litres IS NULL OR (volume_litres > 0 AND volume_litres <= 100000)),
    CONSTRAINT lignes_convention_provenance CHECK (provenance IN ('reel', 'simule'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ligne_convention_flux ON lignes_convention (convention_id, flux_code) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_lignes_convention ON lignes_convention (convention_id) WHERE deleted_at IS NULL;
COMMENT ON TABLE lignes_convention IS
  'Ce qu''une convention couvre : un flux de la liste nationale des déchets assimilés (jamais un flux dangereux, qui va vers sa filière), le conteneur affecté s''il y en a un, le nombre de levées par semaine et le volume estimé par levée. Se modifie tant que la convention est un brouillon, jamais ensuite.';
COMMENT ON COLUMN lignes_convention.flux_code IS 'Le code du flux dans la liste nationale (flux_assimiles), en vigueur et non dangereux le jour de l''écriture, et de nouveau à l''instruction et à la signature.';
COMMENT ON COLUMN lignes_convention.volume_litres IS 'Le volume estimé par levée, en litres ; une estimation, jamais une mesure.';

-- ---------------------------------------------------------------------------
-- 3. Le document scellé « convention_proprete »
-- ---------------------------------------------------------------------------
ALTER TABLE documents_emis DROP CONSTRAINT IF EXISTS documents_emis_type_document_check;
ALTER TABLE documents_emis ADD CONSTRAINT documents_emis_type_document_check
  CHECK (type_document IN ('ordre_mission', 'bon_carburant', 'bon_travail', 'declaration_panne', 'carte_precollecteur', 'convention_proprete'));
ALTER TABLE documents_emis DROP CONSTRAINT IF EXISTS documents_emis_objet_type_check;
ALTER TABLE documents_emis ADD CONSTRAINT documents_emis_objet_type_check
  CHECK (objet_type IS NULL OR objet_type IN ('vehicule', 'circuit', 'personnel', 'intervention', 'acteur_informel', 'convention'));
DO $$
BEGIN
  IF pg_get_expr((SELECT adbin FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
                   WHERE d.adrelid = 'documents_emis'::regclass AND a.attname = 'numero_affiche'), 'documents_emis'::regclass)
     NOT LIKE '%convention_proprete%' THEN
    ALTER TABLE documents_emis DROP COLUMN numero_affiche;
    ALTER TABLE documents_emis ADD COLUMN numero_affiche TEXT GENERATED ALWAYS AS (
      CASE type_document
        WHEN 'ordre_mission'       THEN 'OM'
        WHEN 'bon_carburant'       THEN 'BC'
        WHEN 'bon_travail'         THEN 'BT'
        WHEN 'declaration_panne'   THEN 'DP'
        WHEN 'carte_precollecteur' THEN 'CP'
        WHEN 'convention_proprete' THEN 'CV'
      END || '-' || exercice || '-' || lpad(numero::text, 5, '0')
    ) STORED;
  END IF;
END
$$;
COMMENT ON COLUMN documents_emis.numero_affiche IS
  'Numéro tel qu''imprimé : préfixe du type (OM, BC, BT, DP, CP, CV), exercice, numéro sur cinq chiffres. Calculé, jamais saisi.';
COMMENT ON TABLE documents_emis IS
  'Registre des documents opposables (lot 16.2) : ordre de mission (D3), bon de sortie carburant (D7), bon de travail (D11), fiche de déclaration de panne (D9), carte de pré-collecteur (18.2, émise par app.accorder_carte seulement), convention de propreté (G4, émise par app.signer_convention seulement). Numéro continu, jamais réutilisé ; contenu figé ; seule l''annulation motivée est permise. Ne s''écrit que par app.emettre_document() et app.annuler_document().';

-- Le document d'une convention ne s'annule pas : la convention signée se résilie,
-- et son texte reste tel qu'il a été signé. L'annuler laisserait une convention
-- « signée » sans document, ou un numéro du registre sans convention.
CREATE OR REPLACE FUNCTION app.garder_document_convention() RETURNS trigger
  LANGUAGE plpgsql AS
$$
BEGIN
  IF NEW.type_document = 'convention_proprete' AND NEW.statut IS DISTINCT FROM OLD.statut THEN
    RAISE EXCEPTION 'DOCUMENT_CONVENTION: le texte d''une convention signée ne s''annule pas ; résiliez la convention.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_garder_document_convention ON documents_emis;
CREATE TRIGGER trg_garder_document_convention BEFORE UPDATE ON documents_emis
  FOR EACH ROW EXECUTE FUNCTION app.garder_document_convention();

-- ---------------------------------------------------------------------------
-- 4. Les règles de la convention et de ses lignes
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.controler_convention() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_statut_commerce text;
  v_categorie text;
  v_editables text[] := ARRAY['type', 'date_debut', 'date_fin', 'exercice', 'observation', 'updated_at'];
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.nature IS DISTINCT FROM 'convention' THEN
      RAISE EXCEPTION 'REGISTRE_FERME: le registre simple d''avant le jalon G ne reçoit plus de ligne ; une convention s''inscrit comme convention.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.statut IS DISTINCT FROM 'brouillon' THEN
      RAISE EXCEPTION 'CONVENTION_NAISSANCE: une convention naît brouillon ; elle s''instruit et se signe ensuite.' USING ERRCODE = 'check_violation';
    END IF;
    SELECT c.statut, c.categorie_activite INTO v_statut_commerce, v_categorie
      FROM commerces c WHERE c.id = NEW.commerce_id AND c.deleted_at IS NULL;
    IF v_statut_commerce = 'ferme' THEN
      RAISE EXCEPTION 'ETABLISSEMENT_FERME: cet établissement est fermé ; rouvrez-le avant de lui proposer une convention.' USING ERRCODE = 'check_violation';
    END IF;
    IF v_categorie IS NULL THEN
      RAISE EXCEPTION 'CATEGORIE_REQUISE: l''établissement n''a pas de catégorie d''activité ; donnez-lui la sienne, le tarif en dépend.' USING ERRCODE = 'check_violation';
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF to_jsonb(NEW) = to_jsonb(OLD) THEN
    RETURN NEW;
  END IF;
  IF OLD.nature = 'registre' THEN
    RAISE EXCEPTION 'REGISTRE_FERME: le registre simple d''avant le jalon G se lit, il ne se modifie plus.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.commune_id IS DISTINCT FROM OLD.commune_id OR NEW.commerce_id IS DISTINCT FROM OLD.commerce_id OR NEW.nature IS DISTINCT FROM OLD.nature THEN
    RAISE EXCEPTION 'CONVENTION_FIGEE: une convention reste celle de son établissement.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at AND OLD.statut <> 'brouillon' THEN
    RAISE EXCEPTION 'CONVENTION_FIGEE: seule une convention brouillon se retire ; une convention signée se résilie.' USING ERRCODE = 'check_violation';
  END IF;
  -- Les transitions permises, et elles seules.
  IF NEW.statut IS DISTINCT FROM OLD.statut AND NOT (
       (OLD.statut = 'brouillon' AND NEW.statut = 'instruite') OR (OLD.statut = 'instruite' AND NEW.statut = 'brouillon')
       OR (OLD.statut = 'instruite' AND NEW.statut = 'signee') OR (OLD.statut = 'signee' AND NEW.statut = 'resiliee')) THEN
    RAISE EXCEPTION 'CONVENTION_TRANSITION: une convention % ne devient pas %.', OLD.statut, NEW.statut USING ERRCODE = 'check_violation';
  END IF;
  -- Le contenu ne bouge que dans un brouillon ; après la signature, seule la résiliation s'écrit.
  IF OLD.statut <> 'brouillon' AND (to_jsonb(NEW) - ARRAY['statut', 'grille_id', 'ligne_grille_id', 'mode_tarification', 'tarif',
       'instruite_le', 'instruite_par', 'date_signature', 'reference_signature', 'document_id', 'signee_le', 'signee_par',
       'date_resiliation', 'motif_resiliation', 'reference_resiliation', 'resiliee_le', 'resiliee_par', 'updated_at'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['statut', 'grille_id', 'ligne_grille_id', 'mode_tarification', 'tarif',
       'instruite_le', 'instruite_par', 'date_signature', 'reference_signature', 'document_id', 'signee_le', 'signee_par',
       'date_resiliation', 'motif_resiliation', 'reference_resiliation', 'resiliee_le', 'resiliee_par', 'updated_at']) THEN
    RAISE EXCEPTION 'CONVENTION_FIGEE: une convention % ne se modifie plus ; reprenez-la en brouillon (si elle n''est pas signée) ou résiliez-la.', OLD.statut
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.statut IN ('signee', 'resiliee') AND (to_jsonb(NEW) - ARRAY['statut', 'date_resiliation', 'motif_resiliation', 'reference_resiliation',
       'resiliee_le', 'resiliee_par', 'updated_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['statut', 'date_resiliation',
       'motif_resiliation', 'reference_resiliation', 'resiliee_le', 'resiliee_par', 'updated_at']) THEN
    RAISE EXCEPTION 'CONVENTION_FIGEE: une convention signée ne se modifie plus ; elle se résilie.' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.statut = 'resiliee' THEN
    RAISE EXCEPTION 'CONVENTION_FIGEE: une convention résiliée le reste.' USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_controler_convention ON conventions_commerciales;
CREATE TRIGGER trg_controler_convention BEFORE INSERT OR UPDATE ON conventions_commerciales
  FOR EACH ROW EXECUTE FUNCTION app.controler_convention();

CREATE OR REPLACE FUNCTION app.controler_ligne_convention() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_conv conventions_commerciales;
  v_dangereux boolean;
BEGIN
  -- La convention est verrouillée : une ligne ne s'écrit pas pendant qu'elle s'instruit ou se signe.
  SELECT * INTO v_conv FROM conventions_commerciales WHERE id = NEW.convention_id FOR UPDATE;
  IF v_conv.id IS NULL OR v_conv.commune_id IS DISTINCT FROM NEW.commune_id THEN
    RAISE EXCEPTION 'CONVENTION_AUTRE: cette ligne n''appartient pas à une convention de la commune.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_conv.statut IS DISTINCT FROM 'brouillon' THEN
    RAISE EXCEPTION 'CONVENTION_FIGEE: les lignes d''une convention % ne se modifient plus.', COALESCE(v_conv.statut, 'du registre')
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.convention_id, NEW.commune_id, NEW.flux_code, NEW.conteneur_id, NEW.levees_par_semaine, NEW.volume_litres, NEW.ordre)
       IS DISTINCT FROM (OLD.convention_id, OLD.commune_id, OLD.flux_code, OLD.conteneur_id, OLD.levees_par_semaine, OLD.volume_litres, OLD.ordre) THEN
    RAISE EXCEPTION 'LIGNE_FIGEE: une ligne se retire et se remplace, elle ne se réécrit pas.' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT e.dangereux INTO v_dangereux
      FROM app.liste_nationale('flux_assimiles', app.jour_tunis()) e WHERE e.code = NEW.flux_code;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'FLUX_INCONNU: « % » n''est pas un flux de déchets assimilés en vigueur (liste nationale de la FNCT).', NEW.flux_code
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_dangereux THEN
      RAISE EXCEPTION 'FLUX_DANGEREUX: « % » est un flux dangereux : il va vers sa filière, jamais dans une convention de propreté.', NEW.flux_code
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.conteneur_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM conteneurs k WHERE k.id = NEW.conteneur_id AND k.commune_id = NEW.commune_id) THEN
      RAISE EXCEPTION 'CONTENEUR_AUTRE_COMMUNE: ce conteneur n''est pas un conteneur de la commune.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_controler_ligne_convention ON lignes_convention;
CREATE TRIGGER trg_controler_ligne_convention BEFORE INSERT OR UPDATE ON lignes_convention
  FOR EACH ROW EXECUTE FUNCTION app.controler_ligne_convention();

-- ---------------------------------------------------------------------------
-- 5. Les gestes : instruire, reprendre, signer, résilier
-- ---------------------------------------------------------------------------
-- Ce qu'une convention doit tenir pour être instruite, et de nouveau signée.
-- Rend la grille et sa ligne retenues ; lève le refus nommé sinon.
CREATE OR REPLACE FUNCTION app._verifier_convention(p_conv conventions_commerciales, OUT grille uuid, OUT ligne_id uuid)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_commerce commerces;
  v_flux record;
  v_autre conventions_commerciales;
  v_ligne lignes_grille;
BEGIN
  -- L'établissement est verrouillé : deux conventions du même établissement ne
  -- s'instruisent ni ne se signent en même temps, et le chevauchement se juge sur
  -- ce que l'autre a déjà écrit.
  SELECT * INTO v_commerce FROM commerces WHERE id = p_conv.commerce_id FOR UPDATE;
  IF v_commerce.statut = 'ferme' THEN
    RAISE EXCEPTION 'ETABLISSEMENT_FERME: « % » est fermé : rouvrez-le, ou retirez ce brouillon.', v_commerce.nom USING ERRCODE = 'check_violation';
  END IF;
  IF v_commerce.categorie_activite IS NULL THEN
    RAISE EXCEPTION 'CATEGORIE_REQUISE: « % » n''a pas de catégorie d''activité ; le tarif en dépend.', v_commerce.nom USING ERRCODE = 'check_violation';
  END IF;
  grille := app.grille_en_vigueur(p_conv.commune_id, p_conv.date_debut);
  IF grille IS NULL THEN
    RAISE EXCEPTION 'GRILLE_ABSENTE: aucune grille tarifaire approuvée ne s''applique le % ; faites approuver l''arrêté, ou changez la date de début.',
      to_char(p_conv.date_debut, 'DD/MM/YYYY') USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_ligne FROM lignes_grille l
   WHERE l.grille_id = grille AND l.categorie_code = v_commerce.categorie_activite AND l.deleted_at IS NULL;
  ligne_id := v_ligne.id;
  IF ligne_id IS NULL THEN
    RAISE EXCEPTION 'TARIF_ABSENT: la grille en vigueur n''a pas de tarif pour la catégorie « % ».', v_commerce.categorie_activite
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM lignes_convention lc WHERE lc.convention_id = p_conv.id AND lc.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'LIGNES_ABSENTES: une convention couvre au moins un flux de déchets assimilés.' USING ERRCODE = 'check_violation';
  END IF;
  FOR v_flux IN
    SELECT lc.flux_code, e.code AS en_vigueur, e.dangereux
      FROM lignes_convention lc
      LEFT JOIN app.liste_nationale('flux_assimiles', app.jour_tunis()) e ON e.code = lc.flux_code
     WHERE lc.convention_id = p_conv.id AND lc.deleted_at IS NULL
  LOOP
    IF v_flux.en_vigueur IS NULL THEN
      RAISE EXCEPTION 'FLUX_INCONNU: le flux « % » n''est plus en vigueur ; remplacez-le.', v_flux.flux_code USING ERRCODE = 'check_violation';
    END IF;
    IF v_flux.dangereux THEN
      RAISE EXCEPTION 'FLUX_DANGEREUX: « % » est un flux dangereux : il va vers sa filière.', v_flux.flux_code USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  SELECT * INTO v_autre FROM conventions_commerciales o
   WHERE o.commerce_id = p_conv.commerce_id AND o.id <> p_conv.id AND o.deleted_at IS NULL
     AND o.nature = 'convention' AND o.statut IN ('signee', 'resiliee')
     AND o.date_debut <= p_conv.date_fin
     AND (CASE WHEN o.date_resiliation IS NOT NULL THEN LEAST(o.date_fin, o.date_resiliation - 1) ELSE o.date_fin END) >= p_conv.date_debut
     AND (o.date_resiliation IS NULL OR o.date_resiliation > o.date_debut)
   LIMIT 1;
  IF v_autre.id IS NOT NULL THEN
    RAISE EXCEPTION 'CHEVAUCHEMENT: une convention signée couvre déjà cet établissement du % au % ; résiliez-la, ou changez les dates.',
      to_char(v_autre.date_debut, 'DD/MM/YYYY'), to_char(v_autre.date_fin, 'DD/MM/YYYY') USING ERRCODE = 'check_violation';
  END IF;
END
$$;
REVOKE ALL ON FUNCTION app._verifier_convention(conventions_commerciales) FROM PUBLIC;

-- La convention, verrouillée, si le directeur l'a dans son périmètre et que la version lue est la sienne.
CREATE OR REPLACE FUNCTION app._convention_a_traiter(p_id uuid, p_version text)
  RETURNS conventions_commerciales
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v conventions_commerciales;
  v_version text;
BEGIN
  SELECT * INTO v FROM conventions_commerciales c
   WHERE c.id = p_id AND c.deleted_at IS NULL AND c.nature = 'convention' FOR UPDATE;
  SELECT c.xmin::text INTO v_version FROM conventions_commerciales c WHERE c.id = p_id;
  IF v.id IS NULL OR NOT (app.peut_emettre_document(v.commune_id) OR app.can_read_commune(v.commune_id)) THEN
    RAISE EXCEPTION 'CONVENTION_INTROUVABLE' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT app.peut_emettre_document(v.commune_id) THEN
    RAISE EXCEPTION 'ACCES_REFUSE' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_version IS DISTINCT FROM v_version THEN
    RAISE EXCEPTION 'CONVENTION_VERSION: la convention a changé depuis que vous l''avez ouverte ; relisez-la, puis recommencez.'
      USING ERRCODE = 'serialization_failure';
  END IF;
  RETURN v;
END
$$;
REVOKE ALL ON FUNCTION app._convention_a_traiter(uuid, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.instruire_convention(p_id uuid, p_version text)
  RETURNS conventions_commerciales
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v conventions_commerciales := app._convention_a_traiter(p_id, p_version);
  v_grille uuid;
  v_ligne_id uuid;
  v_ligne lignes_grille;
BEGIN
  IF v.statut <> 'brouillon' THEN
    RAISE EXCEPTION 'CONVENTION_TRANSITION: seule une convention brouillon s''instruit (celle-ci est %).', v.statut USING ERRCODE = 'check_violation';
  END IF;
  SELECT x.grille, x.ligne_id INTO v_grille, v_ligne_id FROM app._verifier_convention(v) x;
  SELECT * INTO v_ligne FROM lignes_grille WHERE id = v_ligne_id;
  UPDATE conventions_commerciales
     SET statut = 'instruite', grille_id = v_grille, ligne_grille_id = v_ligne.id, mode_tarification = v_ligne.mode,
         tarif = v_ligne.tarif, instruite_le = now(), instruite_par = app.current_user_id()
   WHERE id = p_id RETURNING * INTO v;
  RETURN v;
END
$$;

CREATE OR REPLACE FUNCTION app.reprendre_convention(p_id uuid, p_version text)
  RETURNS conventions_commerciales
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v conventions_commerciales := app._convention_a_traiter(p_id, p_version);
BEGIN
  IF v.statut <> 'instruite' THEN
    RAISE EXCEPTION 'CONVENTION_TRANSITION: seule une convention instruite se reprend en brouillon (celle-ci est %).', v.statut
      USING ERRCODE = 'check_violation';
  END IF;
  UPDATE conventions_commerciales
     SET statut = 'brouillon', grille_id = NULL, ligne_grille_id = NULL, mode_tarification = NULL, tarif = NULL,
         instruite_le = NULL, instruite_par = NULL
   WHERE id = p_id RETURNING * INTO v;
  RETURN v;
END
$$;

-- Un montant en dinars, tel qu'imprimé : « 1 200,000 DT ».
CREATE OR REPLACE FUNCTION app._dinars(p numeric) RETURNS text
  LANGUAGE sql IMMUTABLE AS
$$ SELECT replace(replace(to_char(p, 'FM999G999G999G990D000'), ',', ' '), '.', ',') || ' DT' $$;

CREATE OR REPLACE FUNCTION app.signer_convention(p_id uuid, p_version text, p_date date, p_reference text)
  RETURNS conventions_commerciales
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v conventions_commerciales := app._convention_a_traiter(p_id, p_version);
  v_grille_retenue uuid;
  v_ligne_retenue uuid;
  v_commerce commerces;
  v_grille grilles_tarifaires;
  v_categorie text;
  v_base text;
  v_flux text;
  v_tarif text;
  v_contenu jsonb;
  v_doc documents_emis;
BEGIN
  IF v.statut <> 'instruite' THEN
    RAISE EXCEPTION 'CONVENTION_TRANSITION: une convention s''instruit avant de se signer (celle-ci est %).', v.statut USING ERRCODE = 'check_violation';
  END IF;
  IF p_date IS NULL OR p_date > app.jour_tunis() THEN
    RAISE EXCEPTION 'SIGNATURE_DATE: une signature s''enregistre une fois faite ; sa date n''est pas dans l''avenir.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_date < (v.instruite_le AT TIME ZONE 'Africa/Tunis')::date THEN
    RAISE EXCEPTION 'SIGNATURE_DATE: la signature suit l''instruction (le %).', to_char(v.instruite_le AT TIME ZONE 'Africa/Tunis', 'DD/MM/YYYY')
      USING ERRCODE = 'check_violation';
  END IF;
  IF length(btrim(COALESCE(p_reference, ''))) < 3 THEN
    RAISE EXCEPTION 'SIGNATURE_PIECE: la signature se cite par sa pièce (référence du dossier, de l''exemplaire signé).' USING ERRCODE = 'check_violation';
  END IF;
  -- Tout se vérifie de nouveau : la grille, les flux, le chevauchement ont pu changer depuis l'instruction.
  SELECT x.grille, x.ligne_id INTO v_grille_retenue, v_ligne_retenue FROM app._verifier_convention(v) x;
  IF v_grille_retenue IS DISTINCT FROM v.grille_id OR v_ligne_retenue IS DISTINCT FROM v.ligne_grille_id THEN
    RAISE EXCEPTION 'GRILLE_CHANGEE: la grille qui s''applique n''est plus celle de l''instruction ; reprenez la convention en brouillon et instruisez-la de nouveau.'
      USING ERRCODE = 'check_violation';
  END IF;
  -- La base légale du jour de la signature, recopiée : jamais rattachée ensuite à un autre texte.
  -- Le document cite l'intitulé et la date du JORT ; la note de travail de la FNCT
  -- (« reference ») reste dans la liste nationale, elle n'est pas un texte opposable.
  SELECT string_agg(e.libelle_fr || COALESCE(' (JORT du ' || to_char(e.date_publication, 'DD/MM/YYYY') || ')', '')
                    || ' / ' || e.libelle_ar || COALESCE(' (' || to_char(e.date_publication, 'DD/MM/YYYY') || ')', ''),
                    E'\n' ORDER BY e.ordre, e.code)
    INTO v_base
    FROM app.liste_nationale('base_legale_assimiles', p_date) e;
  IF v_base IS NULL THEN
    RAISE EXCEPTION 'BASE_LEGALE_ABSENTE: aucun texte de la base légale n''est en vigueur le % ; la FNCT le tient dans les paramètres nationaux.',
      to_char(p_date, 'DD/MM/YYYY') USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_commerce FROM commerces WHERE id = v.commerce_id;
  SELECT * INTO v_grille FROM grilles_tarifaires WHERE id = v.grille_id;
  SELECT e.libelle_fr || ' / ' || e.libelle_ar INTO v_categorie
    FROM elements_listes_nationales e
   WHERE e.liste = 'categories_activite_assimiles' AND e.code = v_commerce.categorie_activite AND e.retire_le IS NULL
   ORDER BY e.date_effet DESC NULLS LAST LIMIT 1;
  SELECT string_agg(
           e.libelle_fr || ' / ' || e.libelle_ar || ' — ' || lc.levees_par_semaine || ' levée(s) par semaine'
           || COALESCE(', ' || replace(trim(to_char(lc.volume_litres, 'FM9999990.0')), '.', ',') || ' L par levée', '')
           || COALESCE(', conteneur ' || k.code, ''),
           E'\n' ORDER BY lc.ordre, lc.flux_code)
    INTO v_flux
    FROM lignes_convention lc
    JOIN app.liste_nationale('flux_assimiles', p_date) e ON e.code = lc.flux_code
    LEFT JOIN conteneurs k ON k.id = lc.conteneur_id
   WHERE lc.convention_id = v.id AND lc.deleted_at IS NULL;
  IF v_flux IS NULL THEN
    RAISE EXCEPTION 'FLUX_INCONNU: un flux de la convention n''est pas en vigueur le % ; reprenez la convention en brouillon.',
      to_char(p_date, 'DD/MM/YYYY') USING ERRCODE = 'check_violation';
  END IF;
  v_tarif := CASE v.mode_tarification
    WHEN 'forfait_annuel'  THEN 'Forfait annuel / جزافي سنوي — ' || app._dinars(v.tarif) || ' par an'
    WHEN 'forfait_mensuel' THEN 'Forfait mensuel / جزافي شهري — ' || app._dinars(v.tarif) || ' par mois'
    WHEN 'reel_levee'      THEN 'Au réel, par levée / حسب عدد الرفعات — ' || app._dinars(v.tarif) || ' par levée constatée'
    WHEN 'reel_poids'      THEN 'Au réel, au poids / حسب الوزن — ' || app._dinars(v.tarif) || ' par tonne pesée'
  END;
  v_contenu := jsonb_strip_nulls(jsonb_build_object(
    'etablissement', v_commerce.nom,
    'matricule_fiscal', v_commerce.matricule_fiscal,
    'categorie', COALESCE(v_categorie, v_commerce.categorie_activite),
    'adresse', NULLIF(btrim(COALESCE(v_commerce.adresse, '')), ''),
    'type', CASE v.type WHEN 'collecte' THEN 'Collecte / جمع' WHEN 'nettoyage' THEN 'Nettoyage / تنظيف'
                        WHEN 'tri' THEN 'Tri / فرز' ELSE 'Autre / أخرى' END,
    'exercice', v.exercice::text,
    'date_debut', to_char(v.date_debut, 'YYYY-MM-DD'),
    'date_fin', to_char(v.date_fin, 'YYYY-MM-DD'),
    'grille', v_grille.intitule || ' — arrêté ' || v_grille.reference_arrete || ' du ' || to_char(v_grille.date_arrete, 'DD/MM/YYYY')
              || ', approuvé le ' || to_char(v_grille.date_approbation_tutelle, 'DD/MM/YYYY') || ' (' || v_grille.reference_approbation || ')',
    'tarif', v_tarif,
    'flux', v_flux,
    'base_legale', v_base,
    'date_signature', to_char(p_date, 'YYYY-MM-DD'),
    'reference_signature', btrim(p_reference),
    'observations', NULLIF(btrim(COALESCE(v.observation, '')), '')
  ));
  v_doc := app.emettre_document(v.commune_id, 'convention_proprete', v_contenu, 'convention', v.id::text);
  UPDATE conventions_commerciales
     SET statut = 'signee', date_signature = p_date, reference_signature = btrim(p_reference), document_id = v_doc.id,
         signee_le = now(), signee_par = app.current_user_id()
   WHERE id = p_id RETURNING * INTO v;
  RETURN v;
END
$$;

CREATE OR REPLACE FUNCTION app.resilier_convention(p_id uuid, p_version text, p_date date, p_motif text, p_reference text)
  RETURNS conventions_commerciales
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v conventions_commerciales := app._convention_a_traiter(p_id, p_version);
BEGIN
  IF v.statut <> 'signee' THEN
    RAISE EXCEPTION 'CONVENTION_TRANSITION: seule une convention signée se résilie (celle-ci est %) ; un brouillon se retire.', v.statut
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_date IS NULL OR p_date < v.date_signature OR p_date > v.date_fin THEN
    RAISE EXCEPTION 'RESILIATION_DATE: la résiliation prend effet entre la signature (%) et la fin de la convention (%).',
      to_char(v.date_signature, 'DD/MM/YYYY'), to_char(v.date_fin, 'DD/MM/YYYY') USING ERRCODE = 'check_violation';
  END IF;
  IF length(btrim(COALESCE(p_motif, ''))) < 5 OR length(btrim(COALESCE(p_reference, ''))) < 3 THEN
    RAISE EXCEPTION 'RESILIATION_MOTIF: une résiliation dit son motif (5 caractères au moins) et cite sa pièce.' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE conventions_commerciales
     SET statut = 'resiliee', date_resiliation = p_date, motif_resiliation = btrim(p_motif), reference_resiliation = btrim(p_reference),
         resiliee_le = now(), resiliee_par = app.current_user_id()
   WHERE id = p_id RETURNING * INTO v;
  RETURN v;
END
$$;

REVOKE ALL ON FUNCTION app.instruire_convention(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.reprendre_convention(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.signer_convention(uuid, text, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.resilier_convention(uuid, text, date, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.instruire_convention(uuid, text) TO siipi_app;
GRANT EXECUTE ON FUNCTION app.reprendre_convention(uuid, text) TO siipi_app;
GRANT EXECUTE ON FUNCTION app.signer_convention(uuid, text, date, text) TO siipi_app;
GRANT EXECUTE ON FUNCTION app.resilier_convention(uuid, text, date, text, text) TO siipi_app;
COMMENT ON FUNCTION app.instruire_convention(uuid, text) IS
  'Brouillon → instruite : grille approuvée en vigueur au début, tarif de la catégorie, au moins un flux en vigueur et aucun dangereux, établissement non fermé, aucun chevauchement. Sous verrou de la convention et de l''établissement ; la version lue (xmin) est exigée.';
COMMENT ON FUNCTION app.signer_convention(uuid, text, date, text) IS
  'Instruite → signée : tout se vérifie de nouveau, une base légale doit être en vigueur le jour de la signature ; émet le document scellé convention_proprete (CV-…) dans la même transaction. Aucun montant dû n''est calculé.';
COMMENT ON FUNCTION app.resilier_convention(uuid, text, date, text, text) IS
  'Signée → résiliée : date d''effet entre la signature et la fin (la convention couvre jusqu''à la veille), motif et pièce. Le document scellé reste tel quel.';

-- ---------------------------------------------------------------------------
-- 6. Ce que M2-2 compte : une convention signée, sur sa période effective
-- ---------------------------------------------------------------------------
-- Une seule définition de « la convention compte » pour l'indicateur et les écrans :
-- une ligne du registre d'avant G4, ou une convention signée — résiliée, jusqu'à la
-- veille de sa résiliation. Un brouillon, une convention instruite, ne comptent pas.
CREATE OR REPLACE VIEW conventions_comptees WITH (security_invoker = true) AS
  SELECT cv.id, cv.commune_id, cv.commerce_id, cv.date_debut,
         CASE WHEN cv.date_resiliation IS NOT NULL THEN LEAST(cv.date_fin, cv.date_resiliation - 1) ELSE cv.date_fin END AS date_fin,
         cv.deleted_at
    FROM conventions_commerciales cv
   WHERE cv.nature = 'registre' OR cv.statut IN ('signee', 'resiliee');
COMMENT ON VIEW conventions_comptees IS
  'Les conventions qui comptent (M2-2, « sous convention ») : le registre d''avant le jalon G, et les conventions signées, sur leur période effective (une résiliation la termine la veille de sa date). Un brouillon ou une convention instruite n''y figurent pas.';
GRANT SELECT ON conventions_comptees TO siipi_app;

-- ---------------------------------------------------------------------------
-- 7. Cloisonnement : le directeur écrit, la FNCT lit, un prestataire ne voit rien
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS conventions_commerciales_insert ON conventions_commerciales;
CREATE POLICY conventions_commerciales_insert ON conventions_commerciales FOR INSERT WITH CHECK (app.peut_emettre_document(commune_id));
DROP POLICY IF EXISTS conventions_commerciales_update ON conventions_commerciales;
CREATE POLICY conventions_commerciales_update ON conventions_commerciales FOR UPDATE
  USING (deleted_at IS NULL AND app.peut_emettre_document(commune_id)) WITH CHECK (app.peut_emettre_document(commune_id));
-- Ce que l'application écrit elle-même dans un brouillon ; tout le reste passe par
-- les fonctions de la base (instruire, reprendre, signer, résilier).
REVOKE UPDATE ON conventions_commerciales FROM siipi_app;
GRANT UPDATE (type, date_debut, date_fin, exercice, observation) ON conventions_commerciales TO siipi_app;
REVOKE DELETE, TRUNCATE ON conventions_commerciales FROM siipi_app;

DO $$
BEGIN
  EXECUTE 'DROP TRIGGER IF EXISTS trg_provenance ON lignes_convention';
  EXECUTE 'CREATE TRIGGER trg_provenance BEFORE INSERT OR UPDATE OF provenance ON lignes_convention FOR EACH ROW EXECUTE FUNCTION app.controler_provenance()';
  EXECUTE 'DROP TRIGGER IF EXISTS trg_audit_lignes_convention ON lignes_convention';
  EXECUTE 'CREATE TRIGGER trg_audit_lignes_convention AFTER INSERT OR UPDATE OR DELETE ON lignes_convention FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement()';
END $$;
ALTER TABLE lignes_convention ENABLE ROW LEVEL SECURITY;
ALTER TABLE lignes_convention FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lignes_convention_select ON lignes_convention;
CREATE POLICY lignes_convention_select ON lignes_convention FOR SELECT USING (deleted_at IS NULL AND app.can_write_commune(commune_id));
DROP POLICY IF EXISTS lignes_convention_insert ON lignes_convention;
CREATE POLICY lignes_convention_insert ON lignes_convention FOR INSERT WITH CHECK (app.peut_emettre_document(commune_id));
DROP POLICY IF EXISTS lignes_convention_update ON lignes_convention;
CREATE POLICY lignes_convention_update ON lignes_convention FOR UPDATE
  USING (deleted_at IS NULL AND app.peut_emettre_document(commune_id)) WITH CHECK (app.peut_emettre_document(commune_id));
GRANT SELECT, INSERT ON lignes_convention TO siipi_app;
REVOKE UPDATE, DELETE, TRUNCATE ON lignes_convention FROM siipi_app;

-- Les lignes d'un brouillon se retirent ensemble, avant d'être remplacées : par la
-- base, car une ligne retirée sort de la politique de lecture, et PostgreSQL
-- refuserait à l'application de la faire sortir elle-même (comme pour les lignes
-- d'un projet de grille, 098). Rien ne s'efface : elles restent, retirées.
CREATE OR REPLACE FUNCTION app.retirer_lignes_convention(p_convention uuid)
  RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v conventions_commerciales;
  n integer;
BEGIN
  SELECT * INTO v FROM conventions_commerciales WHERE id = p_convention AND deleted_at IS NULL FOR UPDATE;
  IF v.id IS NULL OR NOT app.peut_emettre_document(v.commune_id) THEN
    RAISE EXCEPTION 'CONVENTION_INTROUVABLE' USING ERRCODE = 'no_data_found';
  END IF;
  IF v.statut IS DISTINCT FROM 'brouillon' THEN
    RAISE EXCEPTION 'CONVENTION_FIGEE: les lignes d''une convention % ne se modifient plus.', COALESCE(v.statut, 'du registre')
      USING ERRCODE = 'check_violation';
  END IF;
  UPDATE lignes_convention SET deleted_at = now(), deleted_by = app.current_user_id()
   WHERE convention_id = p_convention AND deleted_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END
$$;
REVOKE ALL ON FUNCTION app.retirer_lignes_convention(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.retirer_lignes_convention(uuid) TO siipi_app;

-- Le retrait d'un brouillon : app.supprimer (dernière version, 099), par le directeur.
CREATE OR REPLACE FUNCTION app.supprimer(p_table text, p_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_commune text;
BEGIN
  -- `commerces` n'y est plus : un établissement se ferme, il ne se supprime
  -- pas (G-4, 099).
  IF p_table NOT IN ('users', 'vehicules', 'conteneurs', 'tickets',
                     'pesees_anged', 'zones_collecte', 'barbechas',
                     'five_axis_scores', 'circuits', 'controles_terrain',
                     'declarations_passage', 'incidents', 'annonces_collecte',
                     'collecteurs_agrees', 'demandes_enlevement',
                     'personnel', 'fichiers', 'points_suggeres',
                     'rapports_etudes', 'contacts',
                     'interventions_maintenance', 'plans_entretien',
                     'champs_points', 'etiquettes_points', 'actions_planifiees',
                     'poi', 'fuel_logs', 'fins_de_poste', 'dotations_epi',
                     'incidents_travail', 'conventions_commerciales',
                     'donnees_personnelles_barbechas', 'identites_commerces',
                     'carnets_de_bord', 'quotas_carburant',
                     'immobilisations_engins', 'etapes_declassement', 'pieces_declassement',
                     'etudes_cout_complet', 'demarches_formalisation',
                     'demandes_carte_precollecteur', 'pieces_demande_carte',
                     'jalons_acteurs', 'agrements_intermediaires',
                     'grilles_tarifaires') THEN
    RAISE EXCEPTION 'TABLE_NON_SUPPRIMABLE: %', p_table;
  END IF;

  EXECUTE format('SELECT commune_id FROM %I WHERE id::text = $1 AND deleted_at IS NULL', p_table)
     INTO v_commune USING p_id;

  IF v_commune IS NULL THEN
    RETURN false;
  END IF;

  -- L'identité se retire comme elle se lit : par le seul admin de la commune.
  -- Le circuit d'un dossier de déclassement et ses pièces, comme ils s'inscrivent.
  -- Une demande de carte et ses pièces, une étape d'accompagnement, un agrément
  -- un projet de grille tarifaire et un brouillon de convention, par le directeur
  -- qui les enregistre (une grille approuvée, une convention instruite ou signée
  -- ne se retirent pas : leur règle le refuse).
  IF p_table IN ('donnees_personnelles_barbechas', 'identites_commerces') THEN
    IF NOT app.peut_voir_identite(v_commune) THEN
      RAISE EXCEPTION 'ACCES_REFUSE' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF p_table IN ('etapes_declassement', 'pieces_declassement') THEN
    IF NOT app.peut_instruire_declassement(v_commune) THEN
      RAISE EXCEPTION 'ACCES_REFUSE' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF p_table IN ('demandes_carte_precollecteur', 'pieces_demande_carte', 'jalons_acteurs', 'agrements_intermediaires',
                    'grilles_tarifaires', 'conventions_commerciales') THEN
    IF NOT app.peut_emettre_document(v_commune) THEN
      RAISE EXCEPTION 'ACCES_REFUSE' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF NOT app.can_write_commune(v_commune) THEN
    RAISE EXCEPTION 'ACCES_REFUSE' USING ERRCODE = 'insufficient_privilege';
  END IF;

  EXECUTE format('UPDATE %I SET deleted_at = now(), deleted_by = $2 WHERE id::text = $1', p_table)
    USING p_id, app.current_user_id();

  RETURN true;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 8. M2-2 lit les conventions qui comptent (dernière version des deux fonctions, 101)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app._mesures_kpi_auto_periode_base(p_debut date, p_fin date, p_communes text[])
 RETURNS TABLE(commune_id text, code text, valeur numeric, note numeric, detail jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH bornes AS (
    -- `annee` n'est renseignée que si la période est une année entière (jusqu'à
    -- aujourd'hui pour l'année en cours) : les effectifs sont annuels, et un
    -- mois ne porte pas la masse salariale d'une année.
    SELECT p_debut AS debut, p_fin AS fin,
           CASE WHEN p_debut = make_date(extract(year FROM p_debut)::int, 1, 1)
                 AND extract(year FROM p_fin) = extract(year FROM p_debut)
                 AND p_fin >= LEAST(make_date(extract(year FROM p_debut)::int, 12, 31), (now() AT TIME ZONE 'Africa/Tunis')::date)
                THEN extract(year FROM p_debut)::int END AS annee
  ),
  communes_vues AS (SELECT c.id FROM communes c WHERE c.id = ANY(p_communes)),

  -- M1-1 : les mètres linéaires des nettoyages terminés, par jour, depuis le
  -- premier nettoyage mesuré de l'année (rapporter à l'année entière une
  -- mesure commencée en septembre la diluerait).
  balayage AS (
    SELECT a.commune_id, sum(a.metres_lineaires) AS ml, min(a.date_prevue) AS depuis, count(*) AS n
      FROM actions_planifiees a, bornes b
     WHERE a.deleted_at IS NULL AND a.type = 'nettoyage' AND a.statut = 'terminee'
       AND a.metres_lineaires IS NOT NULL AND a.date_prevue BETWEEN b.debut AND b.fin
     GROUP BY a.commune_id
  ),

  -- M2-3, M2-4, M2-5 : les nettoyages échus sur les lieux d'un type.
  lieux AS (
    SELECT a.commune_id, p.type,
           count(*) AS echus,
           count(*) FILTER (WHERE a.statut = 'terminee') AS faits
      FROM actions_planifiees a JOIN poi p ON p.id = a.poi_id AND p.deleted_at IS NULL, bornes b
     WHERE a.deleted_at IS NULL AND a.type = 'nettoyage' AND a.statut <> 'annulee'
       AND a.date_prevue BETWEEN b.debut AND b.fin
       AND p.type IN ('cimetiere', 'marche', 'abattoir')
     GROUP BY a.commune_id, p.type
  ),

  -- M1-9 : les fins de poste de la période.
  bachage AS (
    SELECT f.commune_id, count(*) AS n, count(*) FILTER (WHERE f.benne_bachee) AS bachees
      FROM fins_de_poste f, bornes b
     WHERE f.deleted_at IS NULL AND f.jour BETWEEN b.debut AND b.fin
     GROUP BY f.commune_id
  ),

  -- M1-6 : les agents de terrain dotés d'EPI en cours à la fin de la période,
  -- sur l'effectif de terrain — seulement si le registre est tenu.
  terrain AS (
    SELECT pe.commune_id, count(*) AS effectif
      FROM personnel pe
     WHERE pe.deleted_at IS NULL AND pe.actif AND COALESCE(pe.service, 'proprete') = 'proprete'
       AND pe.fonction IN ('chauffeur', 'agent', 'chef_equipe', 'agent_balayage', 'ripeur',
                           'tractoriste', 'jardinier', 'agent_hygiene', 'mecanicien')
     GROUP BY pe.commune_id
  ),
  dotes AS (
    SELECT d.commune_id, count(DISTINCT d.personnel_id) AS dotes
      FROM dotations_epi d JOIN personnel pe ON pe.id = d.personnel_id AND pe.deleted_at IS NULL AND pe.actif, bornes b
     WHERE d.deleted_at IS NULL AND d.date_remise <= b.fin
       AND (d.date_renouvellement IS NULL OR d.date_renouvellement >= b.fin)
     GROUP BY d.commune_id
  ),
  registre_epi AS (
    SELECT DISTINCT d.commune_id FROM dotations_epi d, bornes b WHERE d.deleted_at IS NULL AND d.date_remise <= b.fin
  ),

  -- M2-2 : les établissements sous convention active pendant la période (100).
  -- « À vérifier » porte sur l'identité (un doublon probable), pas sur la
  -- convention : un établissement à vérifier qui a une convention reste compté,
  -- et le détail le dit (dont_a_verifier). Sans convention, il reste hors de la
  -- cible : un doublon probable ne la gonfle pas. Un fermé n'y est jamais.
  -- Une période ne connaît que les établissements inscrits au registre à sa fin
  -- (101, jour de Tunis) : sans cette borne, un établissement inscrit aujourd'hui
  -- entrait dans la cible de 2022, et l'année où le registre n'existait pas
  -- disait « 0 sous convention, mesuré ». Une convention datée d'avant
  -- l'inscription n'y ramène pas l'établissement : la cible de cette période-là
  -- (tous les établissements d'alors) n'est pas connue, et 1 sur 1 serait aussi
  -- faux que 0 sur 1.
  conventions_periode AS (
    SELECT DISTINCT c.commune_id, c.id, c.statut
      FROM conventions_comptees cv JOIN commerces c ON c.id = cv.commerce_id AND c.deleted_at IS NULL, bornes b
     WHERE cv.deleted_at IS NULL AND cv.date_debut <= b.fin AND (cv.date_fin IS NULL OR cv.date_fin >= b.debut)
       AND c.statut IN ('actif', 'a_verifier')
       AND (c.created_at AT TIME ZONE 'Africa/Tunis')::date <= b.fin
  ),
  commerces_actifs AS (
    SELECT x.commune_id, count(*) AS cibles
      FROM (SELECT c.commune_id, c.id FROM commerces c, bornes b
             WHERE c.deleted_at IS NULL AND c.statut = 'actif' AND (c.created_at AT TIME ZONE 'Africa/Tunis')::date <= b.fin
            UNION
            SELECT p.commune_id, p.id FROM conventions_periode p) x
     GROUP BY x.commune_id
  ),
  conventionnes AS (
    SELECT p.commune_id, count(*) AS n, count(*) FILTER (WHERE p.statut = 'a_verifier') AS a_verifier
      FROM conventions_periode p GROUP BY p.commune_id
  ),

  -- Carburant et incidents du travail.
  carburant AS (
    SELECT f.commune_id, sum(f.montant_tnd) AS montant, sum(f.litres) AS litres, count(*) AS n
      FROM fuel_logs f, bornes b
     WHERE f.deleted_at IS NULL AND f.date_plein BETWEEN b.debut AND b.fin
     GROUP BY f.commune_id
  ),
  incidents AS (
    SELECT i.commune_id, count(*) AS lignes,
           count(*) FILTER (WHERE i.type = 'accident') AS accidents,
           sum(COALESCE(i.jours_arret, 0)) FILTER (WHERE i.type = 'accident') AS jours_arret
      FROM incidents_travail i, bornes b
     WHERE i.deleted_at IS NULL AND i.date_incident BETWEEN b.debut AND b.fin
     GROUP BY i.commune_id
  )

  SELECT b.commune_id, 'M1-1', round(b.ml / (bo.fin - b.depuis + 1), 1),
         CASE WHEN pc.objectif_balayage_ml_j > 0 THEN LEAST(1, b.ml / (bo.fin - b.depuis + 1) / pc.objectif_balayage_ml_j) END,
         jsonb_build_object('cible', pc.objectif_balayage_ml_j, 'metres', b.ml, 'jours', bo.fin - b.depuis + 1, 'nettoyages', b.n)
    FROM balayage b JOIN communes_vues cv ON cv.id = b.commune_id CROSS JOIN bornes bo
    LEFT JOIN parametres_commune pc ON pc.commune_id = b.commune_id
  UNION ALL
  SELECT l.commune_id, CASE l.type WHEN 'cimetiere' THEN 'M2-3' WHEN 'marche' THEN 'M2-4' ELSE 'M2-5' END,
         round(100.0 * l.faits / l.echus, 1), l.faits::numeric / l.echus,
         jsonb_build_object('nettoyages_echus', l.echus, 'faits', l.faits)
    FROM lieux l JOIN communes_vues cv ON cv.id = l.commune_id WHERE l.echus > 0
  UNION ALL
  SELECT x.commune_id, 'M1-9', x.bachees, x.bachees::numeric / x.n,
         jsonb_build_object('cible', x.n, 'fins_de_poste', x.n)
    FROM bachage x JOIN communes_vues cv ON cv.id = x.commune_id WHERE x.n > 0
  UNION ALL
  SELECT t.commune_id, 'M1-6', COALESCE(d.dotes, 0), LEAST(1, COALESCE(d.dotes, 0)::numeric / t.effectif),
         jsonb_build_object('cible', t.effectif)
    FROM terrain t JOIN communes_vues cv ON cv.id = t.commune_id
    JOIN registre_epi r ON r.commune_id = t.commune_id
    LEFT JOIN dotes d ON d.commune_id = t.commune_id
   WHERE t.effectif > 0
  UNION ALL
  SELECT ca.commune_id, 'M2-2', COALESCE(n.n, 0), LEAST(1, COALESCE(n.n, 0)::numeric / ca.cibles),
         jsonb_build_object('cible', ca.cibles, 'sous_convention', COALESCE(n.n, 0), 'dont_a_verifier', COALESCE(n.a_verifier, 0))
    FROM commerces_actifs ca JOIN communes_vues cv ON cv.id = ca.commune_id
    LEFT JOIN conventionnes n ON n.commune_id = ca.commune_id
   WHERE ca.cibles > 0
  UNION ALL
  SELECT c.commune_id, 'ECO-CARBURANT', c.montant, NULL, jsonb_build_object('pleins', c.n, 'litres', c.litres)
    FROM carburant c JOIN communes_vues cv ON cv.id = c.commune_id WHERE c.n > 0
  UNION ALL
  -- Un journal tenu cette année, même sans accident, dit « 0 accident ». Un
  -- journal vide ne dit rien.
  SELECT i.commune_id, 'RH-ACCIDENTS', i.accidents, NULL,
         jsonb_build_object('lignes_au_journal', i.lignes, 'jours_arret', COALESCE(i.jours_arret, 0))
    FROM incidents i JOIN communes_vues cv ON cv.id = i.commune_id WHERE i.lignes > 0
$function$;

CREATE OR REPLACE FUNCTION app._source_tenue_base(p_commune text, p_source text, p_debut date, p_fin date, p_declare text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_annee int := extract(year FROM p_debut)::int;
BEGIN
  RETURN CASE p_source
    WHEN 'pesees' THEN EXISTS (SELECT 1 FROM pesees pe WHERE pe.commune_id = p_commune AND pe.deleted_at IS NULL
                                 AND pe.poids_net_kg > 0 AND pe.date_pesee BETWEEN p_debut AND p_fin)
    WHEN 'population' THEN EXISTS (SELECT 1 FROM communes c LEFT JOIN parametres_commune pc ON pc.commune_id = c.id
                                    WHERE c.id = p_commune AND COALESCE(pc.population_permanente, NULLIF(c.population, 0)) > 0)
    WHEN 'controles' THEN EXISTS (SELECT 1 FROM controles_terrain ct WHERE ct.commune_id = p_commune AND ct.deleted_at IS NULL
                                    AND ct.date_controle BETWEEN p_debut AND p_fin)
    WHEN 'communication' THEN EXISTS (SELECT 1 FROM circuits ci WHERE ci.commune_id = p_commune AND ci.deleted_at IS NULL)
                            OR EXISTS (SELECT 1 FROM annonces_collecte a WHERE a.commune_id = p_commune AND a.deleted_at IS NULL)
                            OR EXISTS (SELECT 1 FROM publications p WHERE p.commune_id = p_commune AND p.deleted_at IS NULL AND NOT p.est_exemple)
    WHEN 'enlevements' THEN EXISTS (SELECT 1 FROM demandes_enlevement d WHERE d.commune_id = p_commune AND d.deleted_at IS NULL
                                      AND d.type_dechet IN ('vert', 'ddc') AND d.statut <> 'annulee'
                                      AND d.created_at::date BETWEEN p_debut AND p_fin)
    WHEN 'plans_entretien' THEN EXISTS (SELECT 1 FROM plans_entretien pe WHERE pe.commune_id = p_commune AND pe.deleted_at IS NULL)
                              AND EXISTS (SELECT 1 FROM app.echeances_entretien(p_commune) e WHERE e.statut IN ('a_jour', 'a_prevoir', 'en_retard'))
    WHEN 'reclamations' THEN EXISTS (SELECT 1 FROM tickets t WHERE t.commune_id = p_commune AND t.deleted_at IS NULL
                                       AND t.status <> 'rejete' AND t.created_at::date BETWEEN p_debut AND p_fin)
    WHEN 'reclamations_resolues' THEN EXISTS (SELECT 1 FROM tickets t WHERE t.commune_id = p_commune AND t.deleted_at IS NULL
                                       AND t.status = 'resolu' AND t.resolved_at IS NOT NULL AND t.created_at::date BETWEEN p_debut AND p_fin)
    WHEN 'activation' THEN EXISTS (SELECT 1 FROM communes c WHERE c.id = p_commune AND c.activee)
    WHEN 'usage_numerique' THEN
         EXISTS (SELECT 1 FROM points_collecte pt JOIN circuits ci ON ci.id = pt.circuit_id
                  WHERE pt.commune_id = p_commune AND pt.deleted_at IS NULL AND ci.deleted_at IS NULL)
      OR EXISTS (SELECT 1 FROM controles_terrain ct WHERE ct.commune_id = p_commune AND ct.deleted_at IS NULL AND ct.date_controle BETWEEN p_debut AND p_fin)
      OR EXISTS (SELECT 1 FROM pesees pe WHERE pe.commune_id = p_commune AND pe.deleted_at IS NULL AND pe.date_pesee BETWEEN p_debut AND p_fin)
      OR EXISTS (SELECT 1 FROM tickets t WHERE t.commune_id = p_commune AND t.deleted_at IS NULL AND t.status = 'resolu'
                  AND t.resolved_at::date BETWEEN p_debut AND p_fin)
      OR EXISTS (SELECT 1 FROM presences pr WHERE pr.commune_id = p_commune AND pr.jour BETWEEN p_debut AND p_fin)
      OR EXISTS (SELECT 1 FROM vehicules v WHERE v.commune_id = p_commune AND v.deleted_at IS NULL)
    WHEN 'masse_salariale' THEN EXISTS (SELECT 1 FROM effectifs_service es WHERE es.commune_id = p_commune AND es.annee = v_annee
                                          AND es.service = 'proprete' AND es.masse_salariale_tnd IS NOT NULL)
    WHEN 'effectif_ouvriers' THEN EXISTS (SELECT 1 FROM effectifs_service es WHERE es.commune_id = p_commune AND es.annee = v_annee
                                          AND es.service = 'proprete' AND es.effectif_ouvriers > 0)
    WHEN 'effectif_encadrement' THEN EXISTS (SELECT 1 FROM effectifs_service es WHERE es.commune_id = p_commune AND es.annee = v_annee
                                          AND es.service = 'proprete' AND es.effectif_encadrement IS NOT NULL)
    WHEN 'maintenance' THEN EXISTS (SELECT 1 FROM interventions_maintenance im WHERE im.commune_id = p_commune AND im.deleted_at IS NULL
                                      AND im.date_intervention BETWEEN p_debut AND p_fin)
                       AND NOT EXISTS (SELECT 1 FROM interventions_maintenance im WHERE im.commune_id = p_commune AND im.deleted_at IS NULL
                                      AND im.date_intervention BETWEEN p_debut AND p_fin AND im.cout_tnd IS NULL)
    WHEN 'presences' THEN EXISTS (SELECT 1 FROM presences pr WHERE pr.commune_id = p_commune AND pr.jour BETWEEN p_debut AND p_fin)
    WHEN 'balayage' THEN EXISTS (SELECT 1 FROM actions_planifiees a WHERE a.commune_id = p_commune AND a.deleted_at IS NULL
                                   AND a.type = 'nettoyage' AND a.statut = 'terminee' AND a.metres_lineaires IS NOT NULL
                                   AND a.date_prevue BETWEEN p_debut AND p_fin)
    WHEN 'objectif_balayage' THEN EXISTS (SELECT 1 FROM parametres_commune pc WHERE pc.commune_id = p_commune AND pc.objectif_balayage_ml_j > 0)
    WHEN 'nettoyages_cimetieres' THEN EXISTS (SELECT 1 FROM actions_planifiees a JOIN poi p ON p.id = a.poi_id AND p.deleted_at IS NULL
                                   WHERE a.commune_id = p_commune AND a.deleted_at IS NULL AND a.type = 'nettoyage' AND a.statut <> 'annulee'
                                     AND a.date_prevue BETWEEN p_debut AND p_fin AND p.type = 'cimetiere')
    WHEN 'nettoyages_marches' THEN EXISTS (SELECT 1 FROM actions_planifiees a JOIN poi p ON p.id = a.poi_id AND p.deleted_at IS NULL
                                   WHERE a.commune_id = p_commune AND a.deleted_at IS NULL AND a.type = 'nettoyage' AND a.statut <> 'annulee'
                                     AND a.date_prevue BETWEEN p_debut AND p_fin AND p.type = 'marche')
    WHEN 'nettoyages_abattoirs' THEN EXISTS (SELECT 1 FROM actions_planifiees a JOIN poi p ON p.id = a.poi_id AND p.deleted_at IS NULL
                                   WHERE a.commune_id = p_commune AND a.deleted_at IS NULL AND a.type = 'nettoyage' AND a.statut <> 'annulee'
                                     AND a.date_prevue BETWEEN p_debut AND p_fin AND p.type = 'abattoir')
    WHEN 'fins_de_poste' THEN EXISTS (SELECT 1 FROM fins_de_poste f WHERE f.commune_id = p_commune AND f.deleted_at IS NULL
                                        AND f.jour BETWEEN p_debut AND p_fin)
    WHEN 'epi' THEN EXISTS (SELECT 1 FROM dotations_epi d WHERE d.commune_id = p_commune AND d.deleted_at IS NULL AND d.date_remise <= p_fin)
    WHEN 'agents_terrain' THEN EXISTS (SELECT 1 FROM personnel pe WHERE pe.commune_id = p_commune AND pe.deleted_at IS NULL AND pe.actif
                                         AND COALESCE(pe.service, 'proprete') = 'proprete'
                                         AND pe.fonction IN ('chauffeur', 'agent', 'chef_equipe', 'agent_balayage', 'ripeur',
                                                             'tractoriste', 'jardinier', 'agent_hygiene', 'mecanicien'))
    -- La même borne que M2-2 (101) : avant la première inscription, le registre
    -- n'est pas tenu, et la période dit « non renseigné ».
    WHEN 'commerces' THEN EXISTS (SELECT 1 FROM commerces c WHERE c.commune_id = p_commune AND c.deleted_at IS NULL AND c.statut = 'actif'
                                    AND (c.created_at AT TIME ZONE 'Africa/Tunis')::date <= p_fin)
                          OR EXISTS (SELECT 1 FROM conventions_comptees cv JOIN commerces c ON c.id = cv.commerce_id AND c.deleted_at IS NULL
                                      WHERE cv.commune_id = p_commune AND cv.deleted_at IS NULL AND c.statut = 'a_verifier'
                                        AND (c.created_at AT TIME ZONE 'Africa/Tunis')::date <= p_fin
                                        AND cv.date_debut <= p_fin AND (cv.date_fin IS NULL OR cv.date_fin >= p_debut))
    WHEN 'carburant' THEN EXISTS (SELECT 1 FROM fuel_logs f WHERE f.commune_id = p_commune AND f.deleted_at IS NULL
                                    AND f.date_plein BETWEEN p_debut AND p_fin)
    WHEN 'incidents' THEN EXISTS (SELECT 1 FROM incidents_travail i WHERE i.commune_id = p_commune AND i.deleted_at IS NULL
                                    AND i.date_incident BETWEEN p_debut AND p_fin)
    WHEN 'circuits' THEN EXISTS (SELECT 1 FROM circuits ci WHERE ci.commune_id = p_commune AND ci.deleted_at IS NULL)
    WHEN 'declaration' THEN EXISTS (SELECT 1 FROM declarations_indicateurs d WHERE d.commune_id = p_commune AND d.deleted_at IS NULL
                                      AND d.indicateur_code = p_declare AND d.annee = v_annee AND d.mois IS NULL)
    ELSE NULL
  END;
END;
$function$;
