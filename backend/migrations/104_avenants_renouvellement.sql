-- =============================================================================
-- 104 — Jalon G, lot G4b : les avenants et le renouvellement des conventions de
-- propreté (SPEC_G § 3.4 ; décisions du 11 novembre 2026, les neuf propositions
-- de G4b).
--
-- UN AVENANT EST UNE PIÈCE DE LA CONVENTION, PAS UNE NOUVELLE CONVENTION. La
-- convention garde son numéro (CV-…) ; ses avenants sont numérotés 1, 2, 3… à
-- leur signature. Les termes en vigueur à une date sont ceux du dernier avenant
-- signé qui a pris effet à cette date, sinon ceux d'origine (app.termes_convention).
-- M2-2 ne change pas : l'établissement reste sous la même convention.
--
-- UN AVENANT NE CHANGE QUE LES DÉCHETS COUVERTS (flux, conteneur, levées, volume)
-- et l'observation. Ni l'établissement, ni les dates, ni la grille, ni le tarif :
-- une fin anticipée est une résiliation, un tarif nouveau vient au renouvellement.
-- Il suit le cycle de la convention (brouillon, instruit, signé), avec la version
-- lue ; signé, il émet le document scellé « avenant_convention » (AV-…), qui ne
-- s'annule pas : une erreur se corrige par un nouvel avenant.
--
-- LE RENOUVELLEMENT EST UNE NOUVELLE CONVENTION, reliée à la précédente
-- (convention_precedente_id) : elle commence le lendemain de sa fin, pour un an,
-- reprend les termes en vigueur à cette fin, et repasse par l'instruction avec la
-- grille en vigueur à son début. Une seule par convention ; la précédente est
-- signée et non résiliée. Une reprise après une interruption est une convention
-- nouvelle, pas un renouvellement.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Le renouvellement : le lien avec la convention précédente
-- ---------------------------------------------------------------------------
ALTER TABLE conventions_commerciales ADD COLUMN IF NOT EXISTS convention_precedente_id UUID REFERENCES conventions_commerciales(id);
-- Un seul renouvellement par convention ; un brouillon de renouvellement retiré
-- laisse la place à un autre.
CREATE UNIQUE INDEX IF NOT EXISTS uq_conventions_renouvellement ON conventions_commerciales (convention_precedente_id)
  WHERE convention_precedente_id IS NOT NULL AND deleted_at IS NULL;
COMMENT ON COLUMN conventions_commerciales.convention_precedente_id IS
  'Renouvellement : la convention renouvelée (signée, non résiliée), dont celle-ci prend la suite le lendemain de sa fin. Posé par app.renouveler_convention, jamais modifié. Une seule par convention.';

-- ---------------------------------------------------------------------------
-- 2. L'avenant
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS avenants_convention (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    convention_id         UUID NOT NULL REFERENCES conventions_commerciales(id) ON DELETE CASCADE,
    commune_id            TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    numero                SMALLINT,
    statut                TEXT NOT NULL,
    date_effet            DATE NOT NULL,
    observation           TEXT,
    instruit_le           TIMESTAMPTZ,
    instruit_par          UUID REFERENCES users(id) ON DELETE SET NULL,
    date_signature        DATE,
    reference_signature   TEXT,
    document_id           UUID REFERENCES documents_emis(id),
    signe_le              TIMESTAMPTZ,
    signe_par             UUID REFERENCES users(id) ON DELETE SET NULL,
    saisi_par             UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at            TIMESTAMPTZ,
    deleted_by            UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT avenants_statut CHECK (statut IN ('brouillon', 'instruit', 'signe')),
    CONSTRAINT avenants_instruction CHECK ((statut = 'brouillon') = (instruit_le IS NULL)),
    -- Signé : son numéro, son document, sa date, sa pièce — entiers.
    CONSTRAINT avenants_signature_entiere CHECK (
      ((statut = 'signe') = (document_id IS NOT NULL))
      AND ((document_id IS NULL) = (numero IS NULL)) AND ((document_id IS NULL) = (date_signature IS NULL))
      AND ((document_id IS NULL) = (signe_le IS NULL))
      AND (date_signature IS NULL OR length(btrim(COALESCE(reference_signature, ''))) >= 3)),
    CONSTRAINT avenants_numero CHECK (numero IS NULL OR numero >= 1),
    CONSTRAINT avenants_date CHECK (date_effet >= DATE '2000-01-01'),
    CONSTRAINT avenants_observation CHECK (observation IS NULL OR length(observation) <= 1000)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_avenants_numero ON avenants_convention (convention_id, numero) WHERE numero IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_avenants_document ON avenants_convention (document_id) WHERE document_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_avenants_convention ON avenants_convention (convention_id) WHERE deleted_at IS NULL;
COMMENT ON TABLE avenants_convention IS
  'Les avenants d''une convention de propreté signée (lot G4b) : ils ne changent que les déchets couverts (lignes) et l''observation, à compter de leur date d''effet. brouillon → instruit → signe ; signé, il porte son numéro (1, 2, 3… par convention) et son document scellé avenant_convention (AV-…), et ne se modifie plus. Une erreur se corrige par un nouvel avenant.';
COMMENT ON COLUMN avenants_convention.numero IS 'Le rang de l''avenant dans sa convention, attribué à la signature sous verrou de la convention : 1, 2, 3…, sans trou (un brouillon retiré n''en consomme aucun).';
COMMENT ON COLUMN avenants_convention.date_effet IS
  'Le premier jour où les termes de l''avenant s''appliquent : dans la période de la convention, après la date d''effet du dernier avenant signé.';
COMMENT ON COLUMN avenants_convention.document_id IS 'Le document scellé « avenant_convention » (AV-…), émis à la signature par app.signer_avenant.';

-- Les lignes d'un avenant : la liste COMPLÈTE des déchets couverts à compter de sa
-- date d'effet (jamais une différence), dans la table des lignes de la convention.
ALTER TABLE lignes_convention ADD COLUMN IF NOT EXISTS avenant_id UUID REFERENCES avenants_convention(id) ON DELETE CASCADE;
COMMENT ON COLUMN lignes_convention.avenant_id IS
  'Vide : une ligne des termes d''origine de la convention. Renseigné : une ligne de l''avenant, qui donne la liste complète des déchets couverts à compter de sa date d''effet.';
DROP INDEX IF EXISTS uq_ligne_convention_flux;
CREATE UNIQUE INDEX IF NOT EXISTS uq_ligne_convention_flux ON lignes_convention (convention_id, flux_code)
  WHERE deleted_at IS NULL AND avenant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_ligne_avenant_flux ON lignes_convention (avenant_id, flux_code)
  WHERE deleted_at IS NULL AND avenant_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Le document scellé « avenant_convention »
-- ---------------------------------------------------------------------------
ALTER TABLE documents_emis DROP CONSTRAINT IF EXISTS documents_emis_type_document_check;
ALTER TABLE documents_emis ADD CONSTRAINT documents_emis_type_document_check
  CHECK (type_document IN ('ordre_mission', 'bon_carburant', 'bon_travail', 'declaration_panne', 'carte_precollecteur',
                           'convention_proprete', 'avenant_convention'));
ALTER TABLE documents_emis DROP CONSTRAINT IF EXISTS documents_emis_objet_type_check;
ALTER TABLE documents_emis ADD CONSTRAINT documents_emis_objet_type_check
  CHECK (objet_type IS NULL OR objet_type IN ('vehicule', 'circuit', 'personnel', 'intervention', 'acteur_informel', 'convention', 'avenant'));
DO $$
BEGIN
  IF pg_get_expr((SELECT adbin FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
                   WHERE d.adrelid = 'documents_emis'::regclass AND a.attname = 'numero_affiche'), 'documents_emis'::regclass)
     NOT LIKE '%avenant_convention%' THEN
    ALTER TABLE documents_emis DROP COLUMN numero_affiche;
    ALTER TABLE documents_emis ADD COLUMN numero_affiche TEXT GENERATED ALWAYS AS (
      CASE type_document
        WHEN 'ordre_mission'       THEN 'OM'
        WHEN 'bon_carburant'       THEN 'BC'
        WHEN 'bon_travail'         THEN 'BT'
        WHEN 'declaration_panne'   THEN 'DP'
        WHEN 'carte_precollecteur' THEN 'CP'
        WHEN 'convention_proprete' THEN 'CV'
        WHEN 'avenant_convention'  THEN 'AV'
      END || '-' || exercice || '-' || lpad(numero::text, 5, '0')
    ) STORED;
  END IF;
END
$$;
COMMENT ON COLUMN documents_emis.numero_affiche IS
  'Numéro tel qu''imprimé : préfixe du type (OM, BC, BT, DP, CP, CV, AV), exercice, numéro sur cinq chiffres. Calculé, jamais saisi.';
COMMENT ON TABLE documents_emis IS
  'Registre des documents opposables (lot 16.2) : ordre de mission (D3), bon de sortie carburant (D7), bon de travail (D11), fiche de déclaration de panne (D9), carte de pré-collecteur (18.2, émise par app.accorder_carte seulement), convention de propreté (G4a, émise par app.signer_convention seulement), avenant à une convention (G4b, émis par app.signer_avenant seulement). Numéro continu, jamais réutilisé ; contenu figé ; seule l''annulation motivée est permise, sauf pour une convention et un avenant. Ne s''écrit que par app.emettre_document() et app.annuler_document().';

-- Le document d'une convention ou d'un avenant ne s'annule pas : la convention se
-- résilie, un avenant erroné se corrige par un nouvel avenant ; le texte signé reste.
CREATE OR REPLACE FUNCTION app.garder_document_convention() RETURNS trigger
  LANGUAGE plpgsql AS
$$
BEGIN
  IF NEW.type_document = 'convention_proprete' AND NEW.statut IS DISTINCT FROM OLD.statut THEN
    RAISE EXCEPTION 'DOCUMENT_CONVENTION: le texte d''une convention signée ne s''annule pas ; résiliez la convention.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.type_document = 'avenant_convention' AND NEW.statut IS DISTINCT FROM OLD.statut THEN
    RAISE EXCEPTION 'DOCUMENT_CONVENTION: le texte d''un avenant signé ne s''annule pas ; un nouvel avenant le corrige.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

-- Le document d'une convention naît de sa signature, celui d'un avenant de la
-- sienne, et de rien d'autre : il désigne une convention (un avenant) instruit de
-- la même commune, qui n'a pas encore de document.
CREATE OR REPLACE FUNCTION app.controler_naissance_document_convention() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
  IF NEW.type_document = 'convention_proprete' AND NOT (
       NEW.objet_type = 'convention'
       AND EXISTS (SELECT 1 FROM conventions_commerciales cv
                    WHERE cv.id::text = NEW.objet_id AND cv.commune_id = NEW.commune_id
                      AND cv.statut = 'instruite' AND cv.document_id IS NULL AND cv.deleted_at IS NULL)) THEN
    RAISE EXCEPTION 'DOCUMENT_CONVENTION: le document d''une convention naît de sa signature (app.signer_convention), jamais d''une émission directe.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.type_document = 'avenant_convention' AND NOT (
       NEW.objet_type = 'avenant'
       AND EXISTS (SELECT 1 FROM avenants_convention a
                    WHERE a.id::text = NEW.objet_id AND a.commune_id = NEW.commune_id
                      AND a.statut = 'instruit' AND a.document_id IS NULL AND a.deleted_at IS NULL)) THEN
    RAISE EXCEPTION 'DOCUMENT_CONVENTION: le document d''un avenant naît de sa signature (app.signer_avenant), jamais d''une émission directe.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

-- ---------------------------------------------------------------------------
-- 4. Les règles : la convention (renouvellement), ses lignes (avenants), l'avenant
-- ---------------------------------------------------------------------------
-- La règle de 103, et le renouvellement : il prend la suite d'une convention
-- signée, non résiliée, de la même commune et du même établissement, le lendemain
-- de sa fin ; le lien ne se change pas.
CREATE OR REPLACE FUNCTION app.controler_convention() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_statut_commerce text;
  v_categorie text;
  v_precedente conventions_commerciales;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Hors du périmètre de l'appelant, la convention est introuvable, AVANT tout
    -- autre contrôle. Ce déclencheur (SECURITY DEFINER) passe avant la politique
    -- d'insertion : sans ce contrôle, le directeur d'une autre commune apprendrait
    -- qu'un établissement de celle-ci existe et qu'il est fermé (CLAUDE.md § 5).
    IF NOT app.peut_emettre_document(NEW.commune_id) THEN
      RAISE EXCEPTION 'CONVENTION_HORS_PERIMETRE: une convention se rédige par le directeur de la commune.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.nature IS DISTINCT FROM 'convention' THEN
      RAISE EXCEPTION 'REGISTRE_FERME: le registre simple d''avant le jalon G ne reçoit plus de ligne ; une convention s''inscrit comme convention.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.statut IS DISTINCT FROM 'brouillon' THEN
      RAISE EXCEPTION 'CONVENTION_NAISSANCE: une convention naît brouillon ; elle s''instruit et se signe ensuite.' USING ERRCODE = 'check_violation';
    END IF;
    -- Un établissement d'une autre commune, ou inexistant, est introuvable — avant
    -- tout autre contrôle : dire qu'il est fermé, ou sans catégorie, renseignerait
    -- sur son existence (CLAUDE.md § 5).
    SELECT c.statut, c.categorie_activite INTO v_statut_commerce, v_categorie
      FROM commerces c WHERE c.id = NEW.commerce_id AND c.commune_id = NEW.commune_id AND c.deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'COMMERCE_AUTRE_COMMUNE: établissement introuvable dans cette commune.' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_statut_commerce = 'ferme' THEN
      RAISE EXCEPTION 'ETABLISSEMENT_FERME: cet établissement est fermé ; rouvrez-le avant de lui proposer une convention.' USING ERRCODE = 'check_violation';
    END IF;
    IF v_categorie IS NULL THEN
      RAISE EXCEPTION 'CATEGORIE_REQUISE: l''établissement n''a pas de catégorie d''activité ; donnez-lui la sienne, le tarif en dépend.' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.convention_precedente_id IS NOT NULL THEN
      SELECT * INTO v_precedente FROM conventions_commerciales p
       WHERE p.id = NEW.convention_precedente_id AND p.commune_id = NEW.commune_id AND p.commerce_id = NEW.commerce_id
         AND p.nature = 'convention' AND p.deleted_at IS NULL;
      IF v_precedente.id IS NULL THEN
        RAISE EXCEPTION 'RENOUVELLEMENT_PRECEDENTE: un renouvellement prend la suite d''une convention du même établissement.'
          USING ERRCODE = 'check_violation';
      END IF;
      IF v_precedente.statut IS DISTINCT FROM 'signee' THEN
        RAISE EXCEPTION 'RENOUVELLEMENT_PRECEDENTE: seule une convention signée, non résiliée, se renouvelle (celle-ci est %) ; une reprise est une convention nouvelle.',
          v_precedente.statut USING ERRCODE = 'check_violation';
      END IF;
      IF NEW.date_debut IS DISTINCT FROM v_precedente.date_fin + 1 THEN
        RAISE EXCEPTION 'RENOUVELLEMENT_DATES: un renouvellement commence le lendemain de la fin de la convention renouvelée (le %).',
          to_char(v_precedente.date_fin + 1, 'DD/MM/YYYY') USING ERRCODE = 'check_violation';
      END IF;
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
  IF NEW.commune_id IS DISTINCT FROM OLD.commune_id OR NEW.commerce_id IS DISTINCT FROM OLD.commerce_id OR NEW.nature IS DISTINCT FROM OLD.nature
     OR NEW.convention_precedente_id IS DISTINCT FROM OLD.convention_precedente_id THEN
    RAISE EXCEPTION 'CONVENTION_FIGEE: une convention reste celle de son établissement, et un renouvellement celui de sa convention.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at AND OLD.statut <> 'brouillon' THEN
    RAISE EXCEPTION 'CONVENTION_FIGEE: seule une convention brouillon se retire ; une convention signée se résilie.' USING ERRCODE = 'check_violation';
  END IF;
  -- Un renouvellement garde son début : le lendemain de la fin de la convention renouvelée.
  IF NEW.convention_precedente_id IS NOT NULL AND NEW.date_debut IS DISTINCT FROM OLD.date_debut THEN
    SELECT * INTO v_precedente FROM conventions_commerciales p WHERE p.id = NEW.convention_precedente_id;
    IF NEW.date_debut IS DISTINCT FROM v_precedente.date_fin + 1 THEN
      RAISE EXCEPTION 'RENOUVELLEMENT_DATES: un renouvellement commence le lendemain de la fin de la convention renouvelée (le %).',
        to_char(v_precedente.date_fin + 1, 'DD/MM/YYYY') USING ERRCODE = 'check_violation';
    END IF;
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
    RAISE EXCEPTION 'CONVENTION_FIGEE: une convention signée ne se modifie plus ; un changement des déchets couverts est un avenant, une fin anticipée une résiliation.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.statut = 'resiliee' THEN
    RAISE EXCEPTION 'CONVENTION_FIGEE: une convention résiliée le reste.' USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

-- Une ligne d'origine s'écrit dans une convention brouillon ; une ligne d'avenant
-- dans un avenant brouillon de la même convention.
CREATE OR REPLACE FUNCTION app.controler_ligne_convention() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_conv conventions_commerciales;
  v_avenant avenants_convention;
  v_dangereux boolean;
BEGIN
  -- La convention, puis l'avenant, sont verrouillés (toujours dans cet ordre) : une
  -- ligne ne s'écrit pas pendant qu'ils s'instruisent ou se signent.
  SELECT * INTO v_conv FROM conventions_commerciales WHERE id = NEW.convention_id FOR UPDATE;
  IF v_conv.id IS NULL OR v_conv.commune_id IS DISTINCT FROM NEW.commune_id THEN
    RAISE EXCEPTION 'CONVENTION_AUTRE: cette ligne n''appartient pas à une convention de la commune.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.avenant_id IS NULL THEN
    IF v_conv.statut IS DISTINCT FROM 'brouillon' THEN
      RAISE EXCEPTION 'CONVENTION_FIGEE: les lignes d''une convention % ne se modifient plus ; un changement des déchets couverts est un avenant.',
        COALESCE(v_conv.statut, 'du registre') USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    SELECT * INTO v_avenant FROM avenants_convention WHERE id = NEW.avenant_id FOR UPDATE;
    IF v_avenant.id IS NULL OR v_avenant.convention_id IS DISTINCT FROM NEW.convention_id OR v_avenant.commune_id IS DISTINCT FROM NEW.commune_id THEN
      RAISE EXCEPTION 'CONVENTION_AUTRE: cette ligne n''appartient pas à un avenant de cette convention.' USING ERRCODE = 'check_violation';
    END IF;
    IF v_avenant.statut IS DISTINCT FROM 'brouillon' THEN
      RAISE EXCEPTION 'AVENANT_FIGE: les lignes d''un avenant % ne se modifient plus.', CASE v_avenant.statut WHEN 'signe' THEN 'signé' ELSE v_avenant.statut END
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.convention_id, NEW.commune_id, NEW.avenant_id, NEW.flux_code, NEW.conteneur_id, NEW.levees_par_semaine, NEW.volume_litres, NEW.ordre)
       IS DISTINCT FROM (OLD.convention_id, OLD.commune_id, OLD.avenant_id, OLD.flux_code, OLD.conteneur_id, OLD.levees_par_semaine, OLD.volume_litres, OLD.ordre) THEN
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
    -- Un conteneur retiré n'est plus en service : une ligne nouvelle ne le vise pas
    -- (il finirait imprimé dans un document scellé).
    IF NEW.conteneur_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM conteneurs k WHERE k.id = NEW.conteneur_id
                                                     AND k.commune_id = NEW.commune_id AND k.deleted_at IS NULL) THEN
      RAISE EXCEPTION 'CONTENEUR_AUTRE_COMMUNE: ce conteneur n''est pas un conteneur en service de la commune.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

-- Un conteneur retiré depuis l'écriture d'une ligne : refusé à l'instruction et à la
-- signature, en le nommant (le document scellé l'imprimerait).
CREATE OR REPLACE FUNCTION app._conteneur_retire(p_convention uuid, p_avenant uuid) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT k.code FROM lignes_convention lc JOIN conteneurs k ON k.id = lc.conteneur_id
   WHERE lc.convention_id = p_convention AND lc.avenant_id IS NOT DISTINCT FROM p_avenant AND lc.deleted_at IS NULL
     AND k.deleted_at IS NOT NULL
   LIMIT 1
$$;
REVOKE ALL ON FUNCTION app._conteneur_retire(uuid, uuid) FROM PUBLIC;

-- Une convention qui accepte un avenant : en cours (pas expirée), et sans
-- renouvellement en préparation — un avenant signé après la rédaction du
-- renouvellement laisserait celui-ci avec des termes qui ne sont plus ceux de la
-- fin. Un renouvellement déjà signé est un contrat à part : il ne bloque rien.
CREATE OR REPLACE FUNCTION app._avenant_permis(p_conv conventions_commerciales) RETURNS void
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
  IF p_conv.date_fin < app.jour_tunis() THEN
    RAISE EXCEPTION 'AVENANT_CONVENTION: la convention est expirée depuis le % ; un avenant ne modifie qu''une convention en cours.',
      to_char(p_conv.date_fin + 1, 'DD/MM/YYYY') USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM conventions_commerciales r
              WHERE r.convention_precedente_id = p_conv.id AND r.deleted_at IS NULL AND r.statut IN ('brouillon', 'instruite')) THEN
    RAISE EXCEPTION 'AVENANT_RENOUVELLEMENT: un renouvellement de cette convention est en préparation ; retirez-le, signez l''avenant, puis renouvelez de nouveau — il reprendra les termes à jour.'
      USING ERRCODE = 'check_violation';
  END IF;
END
$$;
REVOKE ALL ON FUNCTION app._avenant_permis(conventions_commerciales) FROM PUBLIC;

-- L'avenant : né brouillon, dans le périmètre du directeur, sur une convention
-- signée de sa commune, en cours, dans sa période ; puis seules les transitions du cycle.
CREATE OR REPLACE FUNCTION app.controler_avenant() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_conv conventions_commerciales;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Hors du périmètre, introuvable, avant tout autre contrôle (comme une convention).
    IF NOT app.peut_emettre_document(NEW.commune_id) THEN
      RAISE EXCEPTION 'AVENANT_HORS_PERIMETRE: un avenant se rédige par le directeur de la commune.' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT * INTO v_conv FROM conventions_commerciales c
     WHERE c.id = NEW.convention_id AND c.commune_id = NEW.commune_id AND c.nature = 'convention' AND c.deleted_at IS NULL;
    IF v_conv.id IS NULL THEN
      RAISE EXCEPTION 'CONVENTION_INTROUVABLE' USING ERRCODE = 'no_data_found';
    END IF;
    IF NEW.statut IS DISTINCT FROM 'brouillon' OR NEW.numero IS NOT NULL OR NEW.document_id IS NOT NULL THEN
      RAISE EXCEPTION 'AVENANT_NAISSANCE: un avenant naît brouillon ; il s''instruit et se signe ensuite.' USING ERRCODE = 'check_violation';
    END IF;
    IF v_conv.statut IS DISTINCT FROM 'signee' THEN
      RAISE EXCEPTION 'AVENANT_CONVENTION: un avenant modifie une convention signée (celle-ci est %) ; un brouillon se corrige lui-même, une convention résiliée ne se modifie plus.',
        v_conv.statut USING ERRCODE = 'check_violation';
    END IF;
    PERFORM app._avenant_permis(v_conv);
    IF NEW.date_effet < v_conv.date_debut OR NEW.date_effet > v_conv.date_fin THEN
      RAISE EXCEPTION 'AVENANT_DATE: un avenant prend effet dans la période de sa convention (du % au %).',
        to_char(v_conv.date_debut, 'DD/MM/YYYY'), to_char(v_conv.date_fin, 'DD/MM/YYYY') USING ERRCODE = 'check_violation';
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF to_jsonb(NEW) = to_jsonb(OLD) THEN
    RETURN NEW;
  END IF;
  IF (NEW.convention_id, NEW.commune_id, NEW.saisi_par, NEW.created_at) IS DISTINCT FROM (OLD.convention_id, OLD.commune_id, OLD.saisi_par, OLD.created_at) THEN
    RAISE EXCEPTION 'AVENANT_FIGE: un avenant reste celui de sa convention.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at AND OLD.statut <> 'brouillon' THEN
    RAISE EXCEPTION 'AVENANT_FIGE: seul un avenant brouillon se retire ; un avenant signé se corrige par un nouvel avenant.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.statut IS DISTINCT FROM OLD.statut AND NOT (
       (OLD.statut = 'brouillon' AND NEW.statut = 'instruit') OR (OLD.statut = 'instruit' AND NEW.statut = 'brouillon')
       OR (OLD.statut = 'instruit' AND NEW.statut = 'signe')) THEN
    RAISE EXCEPTION 'AVENANT_TRANSITION: un avenant % ne devient pas %.', OLD.statut, NEW.statut USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.statut = 'signe' THEN
    RAISE EXCEPTION 'AVENANT_FIGE: un avenant signé ne se modifie plus ; un nouvel avenant le corrige.' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.statut <> 'brouillon' AND (NEW.date_effet, NEW.observation) IS DISTINCT FROM (OLD.date_effet, OLD.observation) THEN
    RAISE EXCEPTION 'AVENANT_FIGE: un avenant instruit ne se modifie plus ; reprenez-le en brouillon.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.date_effet IS DISTINCT FROM OLD.date_effet THEN
    SELECT * INTO v_conv FROM conventions_commerciales WHERE id = NEW.convention_id;
    IF NEW.date_effet < v_conv.date_debut OR NEW.date_effet > v_conv.date_fin THEN
      RAISE EXCEPTION 'AVENANT_DATE: un avenant prend effet dans la période de sa convention (du % au %).',
        to_char(v_conv.date_debut, 'DD/MM/YYYY'), to_char(v_conv.date_fin, 'DD/MM/YYYY') USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_controler_avenant ON avenants_convention;
CREATE TRIGGER trg_controler_avenant BEFORE INSERT OR UPDATE ON avenants_convention
  FOR EACH ROW EXECUTE FUNCTION app.controler_avenant();

-- ---------------------------------------------------------------------------
-- 5. Les termes en vigueur à une date
-- ---------------------------------------------------------------------------
-- Ceux du dernier avenant signé qui a pris effet à cette date, sinon ceux d'origine —
-- et RIEN hors de la période effective d'une convention signée (avant son début,
-- après sa fin ou la veille de sa résiliation, un brouillon, une convention
-- instruite) : rendre des lignes là ferait lire « couvert » ce qui ne l'est pas.
-- Une seule définition, pour l'écran, le renouvellement et, plus tard, l'assiette.
CREATE OR REPLACE FUNCTION app.termes_convention(p_convention uuid, p_date date)
  RETURNS TABLE (flux_code text, conteneur_id text, levees_par_semaine smallint, volume_litres numeric, ordre smallint, avenant_id uuid)
  LANGUAGE sql STABLE SET search_path = public, pg_temp AS
$$
  WITH dernier AS (
    SELECT a.id FROM avenants_convention a
     WHERE a.convention_id = p_convention AND a.statut = 'signe' AND a.deleted_at IS NULL AND a.date_effet <= p_date
     ORDER BY a.date_effet DESC, a.numero DESC LIMIT 1
  )
  SELECT lc.flux_code, lc.conteneur_id, lc.levees_par_semaine, lc.volume_litres, lc.ordre, lc.avenant_id
    FROM lignes_convention lc
    JOIN conventions_commerciales cv ON cv.id = lc.convention_id
   WHERE lc.convention_id = p_convention AND lc.deleted_at IS NULL
     AND lc.avenant_id IS NOT DISTINCT FROM (SELECT id FROM dernier)
     AND cv.nature = 'convention' AND cv.statut IN ('signee', 'resiliee') AND cv.deleted_at IS NULL
     AND p_date >= cv.date_debut
     AND p_date <= CASE WHEN cv.date_resiliation IS NOT NULL THEN LEAST(cv.date_fin, cv.date_resiliation - 1) ELSE cv.date_fin END
   ORDER BY lc.ordre, lc.flux_code
$$;
GRANT EXECUTE ON FUNCTION app.termes_convention(uuid, date) TO siipi_app;
COMMENT ON FUNCTION app.termes_convention(uuid, date) IS
  'Les déchets couverts par une convention à une date : les lignes du dernier avenant signé qui a pris effet ce jour-là ou avant, sinon les lignes d''origine ; rien hors de la période effective d''une convention signée (avant son début, après sa fin, à compter de sa résiliation). Droits de l''appelant.';

-- ---------------------------------------------------------------------------
-- 6. Les gestes de la convention, mis au fait des avenants et du renouvellement
-- ---------------------------------------------------------------------------
-- La règle de 103 : seules les lignes d'origine comptent pour la convention, et un
-- renouvellement exige que sa convention précédente soit toujours signée.
CREATE OR REPLACE FUNCTION app._verifier_convention(p_conv conventions_commerciales, OUT grille uuid, OUT ligne_id uuid)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_commerce commerces;
  v_flux record;
  v_autre conventions_commerciales;
  v_ligne lignes_grille;
  v_statut_precedente text;
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
  IF p_conv.convention_precedente_id IS NOT NULL THEN
    -- Sous verrou : une résiliation de la précédente attend la fin de ce geste, ou le
    -- précède, et ce qui est lu ici est ce qui vaut.
    SELECT p.statut INTO v_statut_precedente FROM conventions_commerciales p WHERE p.id = p_conv.convention_precedente_id FOR UPDATE;
    IF v_statut_precedente IS DISTINCT FROM 'signee' THEN
      RAISE EXCEPTION 'RENOUVELLEMENT_PRECEDENTE: la convention renouvelée n''est plus signée (elle est %) ; retirez ce renouvellement et rédigez une convention nouvelle.',
        v_statut_precedente USING ERRCODE = 'check_violation';
    END IF;
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
  IF NOT EXISTS (SELECT 1 FROM lignes_convention lc WHERE lc.convention_id = p_conv.id AND lc.avenant_id IS NULL AND lc.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'LIGNES_ABSENTES: une convention couvre au moins un flux de déchets assimilés.' USING ERRCODE = 'check_violation';
  END IF;
  IF app._conteneur_retire(p_conv.id, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'CONTENEUR_RETIRE: le conteneur % a été retiré ; changez la ligne qui le vise.',
      app._conteneur_retire(p_conv.id, NULL) USING ERRCODE = 'check_violation';
  END IF;
  FOR v_flux IN
    SELECT lc.flux_code, e.code AS en_vigueur, e.dangereux
      FROM lignes_convention lc
      LEFT JOIN app.liste_nationale('flux_assimiles', app.jour_tunis()) e ON e.code = lc.flux_code
     WHERE lc.convention_id = p_conv.id AND lc.avenant_id IS NULL AND lc.deleted_at IS NULL
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

-- La liste des déchets couverts, telle qu'imprimée sur un document scellé.
CREATE OR REPLACE FUNCTION app._flux_imprimes(p_convention uuid, p_avenant uuid, p_date date) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT string_agg(
           e.libelle_fr || ' / ' || e.libelle_ar || ' — ' || lc.levees_par_semaine || ' levée(s) par semaine'
           || COALESCE(', ' || replace(trim(to_char(lc.volume_litres, 'FM9999990.0')), '.', ',') || ' L par levée', '')
           || COALESCE(', conteneur ' || k.code, ''),
           E'\n' ORDER BY lc.ordre, lc.flux_code)
    FROM lignes_convention lc
    JOIN app.liste_nationale('flux_assimiles', p_date) e ON e.code = lc.flux_code
    LEFT JOIN conteneurs k ON k.id = lc.conteneur_id
   WHERE lc.convention_id = p_convention AND lc.avenant_id IS NOT DISTINCT FROM p_avenant AND lc.deleted_at IS NULL
$$;
REVOKE ALL ON FUNCTION app._flux_imprimes(uuid, uuid, date) FROM PUBLIC;

-- La base légale du jour, telle qu'imprimée : intitulé et date du JORT, jamais la
-- note de travail de la FNCT.
CREATE OR REPLACE FUNCTION app._base_legale_imprimee(p_date date) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT string_agg(e.libelle_fr || COALESCE(' (JORT du ' || to_char(e.date_publication, 'DD/MM/YYYY') || ')', '')
                    || ' / ' || e.libelle_ar || COALESCE(' (' || to_char(e.date_publication, 'DD/MM/YYYY') || ')', ''),
                    E'\n' ORDER BY e.ordre, e.code)
    FROM app.liste_nationale('base_legale_assimiles', p_date) e
$$;
REVOKE ALL ON FUNCTION app._base_legale_imprimee(date) FROM PUBLIC;

-- La signature de 103, et la mention du renouvellement : le document d'une
-- convention qui en renouvelle une autre cite le numéro de celle-ci.
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
  v_precedent text;
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
  v_base := app._base_legale_imprimee(p_date);
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
  v_flux := app._flux_imprimes(v.id, NULL, p_date);
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
  IF v.convention_precedente_id IS NOT NULL THEN
    SELECT 'Renouvellement de / تجديد ' || d.numero_affiche INTO v_precedent
      FROM conventions_commerciales p JOIN documents_emis d ON d.id = p.document_id
     WHERE p.id = v.convention_precedente_id;
    IF v_precedent IS NULL THEN
      RAISE EXCEPTION 'DOCUMENT_INCOMPLET: la convention renouvelée n''a pas de document ; rien n''est signé.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  v_contenu := jsonb_strip_nulls(jsonb_build_object(
    'etablissement', v_commerce.nom,
    'matricule_fiscal', v_commerce.matricule_fiscal,
    'categorie', COALESCE(v_categorie, v_commerce.categorie_activite),
    'adresse', NULLIF(btrim(COALESCE(v_commerce.adresse, '')), ''),
    'type', CASE v.type WHEN 'collecte' THEN 'Collecte / جمع' WHEN 'nettoyage' THEN 'Nettoyage / تنظيف'
                        WHEN 'tri' THEN 'Tri / فرز' ELSE 'Autre / أخرى' END,
    'exercice', v.exercice::text,
    'renouvellement_de', v_precedent,
    'date_debut', to_char(v.date_debut, 'YYYY-MM-DD'),
    'date_fin', to_char(v.date_fin, 'YYYY-MM-DD'),
    'grille', concat_ws(' — ', NULLIF(btrim(COALESCE(v_grille.intitule, '')), ''),
                        'arrêté ' || v_grille.reference_arrete || ' du ' || to_char(v_grille.date_arrete, 'DD/MM/YYYY')
                        || ', approuvé le ' || to_char(v_grille.date_approbation_tutelle, 'DD/MM/YYYY') || ' (' || v_grille.reference_approbation || ')'),
    'tarif', v_tarif,
    'flux', v_flux,
    'base_legale', v_base,
    'date_signature', to_char(p_date, 'YYYY-MM-DD'),
    'reference_signature', btrim(p_reference),
    'observations', NULLIF(btrim(COALESCE(v.observation, '')), '')
  ));
  -- Les cases requises du gabarit (backend/src/documents/gabarits.ts), toutes
  -- présentes : un document scellé ne se corrige plus, une case vide y resterait.
  IF EXISTS (SELECT 1 FROM unnest(ARRAY['etablissement', 'categorie', 'type', 'exercice', 'date_debut', 'date_fin', 'grille',
                                        'tarif', 'flux', 'base_legale', 'date_signature', 'reference_signature']) k
              WHERE NOT (v_contenu ? k)) THEN
    RAISE EXCEPTION 'DOCUMENT_INCOMPLET: une case requise du document manque ; rien n''est signé.' USING ERRCODE = 'check_violation';
  END IF;
  v_doc := app.emettre_document(v.commune_id, 'convention_proprete', v_contenu, 'convention', v.id::text);
  UPDATE conventions_commerciales
     SET statut = 'signee', date_signature = p_date, reference_signature = btrim(p_reference), document_id = v_doc.id,
         signee_le = now(), signee_par = app.current_user_id()
   WHERE id = p_id RETURNING * INTO v;
  RETURN v;
END
$$;

-- Les lignes d'origine d'un brouillon (103), sans toucher à celles d'un avenant.
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
   WHERE convention_id = p_convention AND avenant_id IS NULL AND deleted_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END
$$;

-- Le renouvellement : une convention nouvelle, brouillon, qui commence le lendemain
-- de la fin de la précédente, pour un an, avec les termes en vigueur à cette fin.
-- Un flux qui n'est plus en vigueur (ou devenu dangereux) n'est pas repris : la
-- route le dit, rien n'est remplacé en silence.
CREATE OR REPLACE FUNCTION app.renouveler_convention(p_id uuid, p_version text)
  RETURNS conventions_commerciales
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v conventions_commerciales := app._convention_a_traiter(p_id, p_version);
  v_nouvelle conventions_commerciales;
  v_debut date;
BEGIN
  IF v.statut <> 'signee' THEN
    RAISE EXCEPTION 'RENOUVELLEMENT_PRECEDENTE: seule une convention signée, non résiliée, se renouvelle (celle-ci est %) ; une reprise est une convention nouvelle.',
      v.statut USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM conventions_commerciales r WHERE r.convention_precedente_id = v.id AND r.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'RENOUVELLEMENT_EXISTANT: cette convention a déjà son renouvellement ; ouvrez-le, ou retirez-le s''il n''est qu''un brouillon.'
      USING ERRCODE = 'check_violation';
  END IF;
  v_debut := v.date_fin + 1;
  INSERT INTO conventions_commerciales
    (commune_id, commerce_id, nature, statut, type, exercice, date_debut, date_fin, observation, convention_precedente_id, saisi_par)
  VALUES (v.commune_id, v.commerce_id, 'convention', 'brouillon', v.type, extract(year FROM v_debut), v_debut,
          (v_debut + interval '1 year')::date - 1, v.observation, v.id, app.current_user_id())
  RETURNING * INTO v_nouvelle;
  -- Un conteneur retiré depuis n'est pas repris : la ligne l'est, sans lui, et la
  -- route le nomme ; un conteneur en service suit sa ligne.
  INSERT INTO lignes_convention (convention_id, commune_id, flux_code, conteneur_id, levees_par_semaine, volume_litres, ordre)
  SELECT v_nouvelle.id, v.commune_id, t.flux_code,
         CASE WHEN k.id IS NOT NULL AND k.commune_id = v.commune_id AND k.deleted_at IS NULL THEN t.conteneur_id END,
         t.levees_par_semaine, t.volume_litres, t.ordre
    FROM app.termes_convention(v.id, v.date_fin) t
    JOIN app.liste_nationale('flux_assimiles', app.jour_tunis()) e ON e.code = t.flux_code AND NOT e.dangereux
    LEFT JOIN conteneurs k ON k.id = t.conteneur_id;
  RETURN v_nouvelle;
END
$$;
REVOKE ALL ON FUNCTION app.renouveler_convention(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.renouveler_convention(uuid, text) TO siipi_app;
COMMENT ON FUNCTION app.renouveler_convention(uuid, text) IS
  'Une convention signée, non résiliée, sans renouvellement → un brouillon qui commence le lendemain de sa fin, pour un an, avec les termes en vigueur à cette fin (les flux toujours en vigueur et non dangereux ; un conteneur retiré ne suit pas sa ligne). Il s''instruit avec la grille en vigueur à son début. Sous verrou, avec la version lue.';

-- ---------------------------------------------------------------------------
-- 7. Les gestes de l'avenant
-- ---------------------------------------------------------------------------
-- L'avenant, et sa convention, verrouillés (la convention d'abord, comme pour une
-- ligne), si le directeur les a dans son périmètre et que la version lue est la sienne.
CREATE OR REPLACE FUNCTION app._avenant_a_traiter(p_id uuid, p_version text)
  RETURNS avenants_convention
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  a avenants_convention;
  v_version text;
BEGIN
  SELECT * INTO a FROM avenants_convention x WHERE x.id = p_id AND x.deleted_at IS NULL;
  IF a.id IS NULL OR NOT (app.peut_emettre_document(a.commune_id) OR app.can_read_commune(a.commune_id)) THEN
    RAISE EXCEPTION 'AVENANT_INTROUVABLE' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT app.peut_emettre_document(a.commune_id) THEN
    RAISE EXCEPTION 'ACCES_REFUSE' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM 1 FROM conventions_commerciales c WHERE c.id = a.convention_id FOR UPDATE;
  SELECT * INTO a FROM avenants_convention x WHERE x.id = p_id AND x.deleted_at IS NULL FOR UPDATE;
  SELECT x.xmin::text INTO v_version FROM avenants_convention x WHERE x.id = p_id;
  IF a.id IS NULL THEN
    RAISE EXCEPTION 'AVENANT_INTROUVABLE' USING ERRCODE = 'no_data_found';
  END IF;
  IF p_version IS DISTINCT FROM v_version THEN
    RAISE EXCEPTION 'AVENANT_VERSION: l''avenant a changé depuis que vous l''avez ouvert ; relisez-le, puis recommencez.'
      USING ERRCODE = 'serialization_failure';
  END IF;
  RETURN a;
END
$$;
REVOKE ALL ON FUNCTION app._avenant_a_traiter(uuid, text) FROM PUBLIC;

-- Ce qu'un avenant doit tenir pour être instruit, et de nouveau signé.
CREATE OR REPLACE FUNCTION app._verifier_avenant(p_avenant avenants_convention)
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_conv conventions_commerciales;
  v_commerce commerces;
  v_dernier avenants_convention;
  v_flux record;
BEGIN
  SELECT * INTO v_conv FROM conventions_commerciales WHERE id = p_avenant.convention_id;
  IF v_conv.statut IS DISTINCT FROM 'signee' THEN
    RAISE EXCEPTION 'AVENANT_CONVENTION: la convention n''est plus signée (elle est %) ; un avenant ne modifie qu''une convention en cours.',
      v_conv.statut USING ERRCODE = 'check_violation';
  END IF;
  PERFORM app._avenant_permis(v_conv);
  SELECT * INTO v_commerce FROM commerces WHERE id = v_conv.commerce_id;
  IF v_commerce.statut = 'ferme' THEN
    RAISE EXCEPTION 'ETABLISSEMENT_FERME: « % » est fermé : résiliez la convention plutôt que de la modifier.', v_commerce.nom
      USING ERRCODE = 'check_violation';
  END IF;
  IF app._conteneur_retire(p_avenant.convention_id, p_avenant.id) IS NOT NULL THEN
    RAISE EXCEPTION 'CONTENEUR_RETIRE: le conteneur % a été retiré ; changez la ligne qui le vise.',
      app._conteneur_retire(p_avenant.convention_id, p_avenant.id) USING ERRCODE = 'check_violation';
  END IF;
  IF p_avenant.date_effet < v_conv.date_debut OR p_avenant.date_effet > v_conv.date_fin THEN
    RAISE EXCEPTION 'AVENANT_DATE: un avenant prend effet dans la période de sa convention (du % au %).',
      to_char(v_conv.date_debut, 'DD/MM/YYYY'), to_char(v_conv.date_fin, 'DD/MM/YYYY') USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_dernier FROM avenants_convention a
   WHERE a.convention_id = p_avenant.convention_id AND a.id <> p_avenant.id AND a.statut = 'signe' AND a.deleted_at IS NULL
   ORDER BY a.date_effet DESC LIMIT 1;
  IF v_dernier.id IS NOT NULL AND p_avenant.date_effet <= v_dernier.date_effet THEN
    RAISE EXCEPTION 'AVENANT_ORDRE: l''avenant n° % prend déjà effet le % ; celui-ci prend effet après lui.',
      v_dernier.numero, to_char(v_dernier.date_effet, 'DD/MM/YYYY') USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM lignes_convention lc WHERE lc.avenant_id = p_avenant.id AND lc.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'LIGNES_ABSENTES: un avenant donne la liste complète des déchets couverts : au moins un flux.' USING ERRCODE = 'check_violation';
  END IF;
  FOR v_flux IN
    SELECT lc.flux_code, e.code AS en_vigueur, e.dangereux
      FROM lignes_convention lc
      LEFT JOIN app.liste_nationale('flux_assimiles', app.jour_tunis()) e ON e.code = lc.flux_code
     WHERE lc.avenant_id = p_avenant.id AND lc.deleted_at IS NULL
  LOOP
    IF v_flux.en_vigueur IS NULL THEN
      RAISE EXCEPTION 'FLUX_INCONNU: le flux « % » n''est plus en vigueur ; remplacez-le.', v_flux.flux_code USING ERRCODE = 'check_violation';
    END IF;
    IF v_flux.dangereux THEN
      RAISE EXCEPTION 'FLUX_DANGEREUX: « % » est un flux dangereux : il va vers sa filière.', v_flux.flux_code USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
END
$$;
REVOKE ALL ON FUNCTION app._verifier_avenant(avenants_convention) FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.instruire_avenant(p_id uuid, p_version text)
  RETURNS avenants_convention
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  a avenants_convention := app._avenant_a_traiter(p_id, p_version);
BEGIN
  IF a.statut <> 'brouillon' THEN
    RAISE EXCEPTION 'AVENANT_TRANSITION: seul un avenant brouillon s''instruit (celui-ci est %).', a.statut USING ERRCODE = 'check_violation';
  END IF;
  PERFORM app._verifier_avenant(a);
  UPDATE avenants_convention SET statut = 'instruit', instruit_le = now(), instruit_par = app.current_user_id()
   WHERE id = p_id RETURNING * INTO a;
  RETURN a;
END
$$;

CREATE OR REPLACE FUNCTION app.reprendre_avenant(p_id uuid, p_version text)
  RETURNS avenants_convention
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  a avenants_convention := app._avenant_a_traiter(p_id, p_version);
BEGIN
  IF a.statut <> 'instruit' THEN
    RAISE EXCEPTION 'AVENANT_TRANSITION: seul un avenant instruit se reprend en brouillon (celui-ci est %).', a.statut USING ERRCODE = 'check_violation';
  END IF;
  UPDATE avenants_convention SET statut = 'brouillon', instruit_le = NULL, instruit_par = NULL
   WHERE id = p_id RETURNING * INTO a;
  RETURN a;
END
$$;

CREATE OR REPLACE FUNCTION app.signer_avenant(p_id uuid, p_version text, p_date date, p_reference text)
  RETURNS avenants_convention
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  a avenants_convention := app._avenant_a_traiter(p_id, p_version);
  v_conv conventions_commerciales;
  v_commerce commerces;
  v_numero_convention text;
  v_numero smallint;
  v_base text;
  v_flux text;
  v_contenu jsonb;
  v_doc documents_emis;
BEGIN
  IF a.statut <> 'instruit' THEN
    RAISE EXCEPTION 'AVENANT_TRANSITION: un avenant s''instruit avant de se signer (celui-ci est %).', a.statut USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_conv FROM conventions_commerciales WHERE id = a.convention_id;
  IF p_date IS NULL OR p_date > app.jour_tunis() THEN
    RAISE EXCEPTION 'SIGNATURE_DATE: une signature s''enregistre une fois faite ; sa date n''est pas dans l''avenir.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_date < (a.instruit_le AT TIME ZONE 'Africa/Tunis')::date OR p_date < v_conv.date_signature THEN
    RAISE EXCEPTION 'SIGNATURE_DATE: la signature de l''avenant suit son instruction (le %) et celle de la convention (le %).',
      to_char(a.instruit_le AT TIME ZONE 'Africa/Tunis', 'DD/MM/YYYY'), to_char(v_conv.date_signature, 'DD/MM/YYYY') USING ERRCODE = 'check_violation';
  END IF;
  IF length(btrim(COALESCE(p_reference, ''))) < 3 THEN
    RAISE EXCEPTION 'SIGNATURE_PIECE: la signature se cite par sa pièce (référence du dossier, de l''exemplaire signé).' USING ERRCODE = 'check_violation';
  END IF;
  -- Tout se vérifie de nouveau : la convention, l'ordre des avenants, les flux ont pu changer depuis l'instruction.
  PERFORM app._verifier_avenant(a);
  v_base := app._base_legale_imprimee(p_date);
  IF v_base IS NULL THEN
    RAISE EXCEPTION 'BASE_LEGALE_ABSENTE: aucun texte de la base légale n''est en vigueur le % ; la FNCT le tient dans les paramètres nationaux.',
      to_char(p_date, 'DD/MM/YYYY') USING ERRCODE = 'check_violation';
  END IF;
  v_flux := app._flux_imprimes(a.convention_id, a.id, p_date);
  IF v_flux IS NULL THEN
    RAISE EXCEPTION 'FLUX_INCONNU: un flux de l''avenant n''est pas en vigueur le % ; reprenez l''avenant en brouillon.',
      to_char(p_date, 'DD/MM/YYYY') USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_commerce FROM commerces WHERE id = v_conv.commerce_id;
  SELECT d.numero_affiche INTO v_numero_convention FROM documents_emis d WHERE d.id = v_conv.document_id;
  -- Le rang, sous le verrou de la convention (pris par _avenant_a_traiter) : sans trou,
  -- un brouillon retiré n'en consomme aucun.
  SELECT COALESCE(max(x.numero), 0) + 1 INTO v_numero FROM avenants_convention x WHERE x.convention_id = a.convention_id AND x.numero IS NOT NULL;
  v_contenu := jsonb_strip_nulls(jsonb_build_object(
    'convention', v_numero_convention,
    'avenant', v_numero::text,
    'etablissement', v_commerce.nom,
    'matricule_fiscal', v_commerce.matricule_fiscal,
    'adresse', NULLIF(btrim(COALESCE(v_commerce.adresse, '')), ''),
    'date_effet', to_char(a.date_effet, 'YYYY-MM-DD'),
    'date_fin', to_char(v_conv.date_fin, 'YYYY-MM-DD'),
    'flux', v_flux,
    'base_legale', v_base,
    'date_signature', to_char(p_date, 'YYYY-MM-DD'),
    'reference_signature', btrim(p_reference),
    'observations', NULLIF(btrim(COALESCE(a.observation, '')), '')
  ));
  -- Les cases requises du gabarit (backend/src/documents/gabarits.ts), toutes présentes.
  IF EXISTS (SELECT 1 FROM unnest(ARRAY['convention', 'avenant', 'etablissement', 'date_effet', 'date_fin', 'flux', 'base_legale',
                                        'date_signature', 'reference_signature']) k
              WHERE NOT (v_contenu ? k)) THEN
    RAISE EXCEPTION 'DOCUMENT_INCOMPLET: une case requise du document manque ; rien n''est signé.' USING ERRCODE = 'check_violation';
  END IF;
  v_doc := app.emettre_document(a.commune_id, 'avenant_convention', v_contenu, 'avenant', a.id::text);
  UPDATE avenants_convention
     SET statut = 'signe', numero = v_numero, date_signature = p_date, reference_signature = btrim(p_reference), document_id = v_doc.id,
         signe_le = now(), signe_par = app.current_user_id()
   WHERE id = p_id RETURNING * INTO a;
  RETURN a;
END
$$;

-- Les lignes d'un avenant brouillon se retirent ensemble avant d'être remplacées
-- (une ligne retirée sort de la politique de lecture : par la base, comme en 103).
CREATE OR REPLACE FUNCTION app.retirer_lignes_avenant(p_avenant uuid)
  RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  a avenants_convention;
  n integer;
BEGIN
  SELECT * INTO a FROM avenants_convention WHERE id = p_avenant AND deleted_at IS NULL;
  IF a.id IS NULL OR NOT app.peut_emettre_document(a.commune_id) THEN
    RAISE EXCEPTION 'AVENANT_INTROUVABLE' USING ERRCODE = 'no_data_found';
  END IF;
  PERFORM 1 FROM conventions_commerciales c WHERE c.id = a.convention_id FOR UPDATE;
  SELECT * INTO a FROM avenants_convention WHERE id = p_avenant FOR UPDATE;
  IF a.statut IS DISTINCT FROM 'brouillon' THEN
    RAISE EXCEPTION 'AVENANT_FIGE: les lignes d''un avenant % ne se modifient plus.', CASE a.statut WHEN 'signe' THEN 'signé' ELSE a.statut END
      USING ERRCODE = 'check_violation';
  END IF;
  UPDATE lignes_convention SET deleted_at = now(), deleted_by = app.current_user_id()
   WHERE avenant_id = p_avenant AND deleted_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END
$$;

REVOKE ALL ON FUNCTION app.instruire_avenant(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.reprendre_avenant(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.signer_avenant(uuid, text, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.retirer_lignes_avenant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.instruire_avenant(uuid, text) TO siipi_app;
GRANT EXECUTE ON FUNCTION app.reprendre_avenant(uuid, text) TO siipi_app;
GRANT EXECUTE ON FUNCTION app.signer_avenant(uuid, text, date, text) TO siipi_app;
GRANT EXECUTE ON FUNCTION app.retirer_lignes_avenant(uuid) TO siipi_app;
COMMENT ON FUNCTION app.instruire_avenant(uuid, text) IS
  'Brouillon → instruit : la convention est signée et non résiliée, l''établissement n''est pas fermé, la date d''effet est dans la période et après le dernier avenant signé, au moins un flux en vigueur et aucun dangereux. Sous verrou de la convention et de l''avenant ; la version lue (xmin) est exigée.';
COMMENT ON FUNCTION app.signer_avenant(uuid, text, date, text) IS
  'Instruit → signé : tout se vérifie de nouveau, une base légale doit être en vigueur le jour de la signature ; attribue le numéro (sans trou) et émet le document scellé avenant_convention (AV-…) dans la même transaction.';

-- ---------------------------------------------------------------------------
-- 8. Cloisonnement : le directeur écrit, la FNCT lit, un prestataire ne voit rien
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  EXECUTE 'DROP TRIGGER IF EXISTS trg_audit_avenants_convention ON avenants_convention';
  EXECUTE 'CREATE TRIGGER trg_audit_avenants_convention AFTER INSERT OR UPDATE OR DELETE ON avenants_convention FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement()';
END $$;
ALTER TABLE avenants_convention ENABLE ROW LEVEL SECURITY;
ALTER TABLE avenants_convention FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS avenants_convention_select ON avenants_convention;
CREATE POLICY avenants_convention_select ON avenants_convention FOR SELECT USING (deleted_at IS NULL AND app.can_write_commune(commune_id));
DROP POLICY IF EXISTS avenants_convention_insert ON avenants_convention;
CREATE POLICY avenants_convention_insert ON avenants_convention FOR INSERT WITH CHECK (app.peut_emettre_document(commune_id));
DROP POLICY IF EXISTS avenants_convention_update ON avenants_convention;
CREATE POLICY avenants_convention_update ON avenants_convention FOR UPDATE
  USING (deleted_at IS NULL AND app.peut_emettre_document(commune_id)) WITH CHECK (app.peut_emettre_document(commune_id));
GRANT SELECT, INSERT ON avenants_convention TO siipi_app;
REVOKE UPDATE ON avenants_convention FROM siipi_app;
-- Ce que l'application écrit elle-même dans un brouillon ; le reste passe par les fonctions.
GRANT UPDATE (date_effet, observation) ON avenants_convention TO siipi_app;
REVOKE DELETE, TRUNCATE ON avenants_convention FROM siipi_app;

-- Le retrait d'un brouillon d'avenant : app.supprimer (dernière version, 103), par le directeur.
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
                     'grilles_tarifaires', 'avenants_convention') THEN
    RAISE EXCEPTION 'TABLE_NON_SUPPRIMABLE: %', p_table;
  END IF;

  EXECUTE format('SELECT commune_id FROM %I WHERE id::text = $1 AND deleted_at IS NULL', p_table)
     INTO v_commune USING p_id;

  IF v_commune IS NULL THEN
    RETURN false;
  END IF;

  -- L'identité se retire comme elle se lit : par le seul admin de la commune.
  -- Le circuit d'un dossier de déclassement et ses pièces, comme ils s'inscrivent.
  -- Une demande de carte et ses pièces, une étape d'accompagnement, un agrément,
  -- un projet de grille tarifaire, un brouillon de convention ou d'avenant, par le
  -- directeur qui les enregistre (une grille approuvée, une convention ou un
  -- avenant instruits ou signés ne se retirent pas : leur règle le refuse).
  IF p_table IN ('donnees_personnelles_barbechas', 'identites_commerces') THEN
    IF NOT app.peut_voir_identite(v_commune) THEN
      RAISE EXCEPTION 'ACCES_REFUSE' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF p_table IN ('etapes_declassement', 'pieces_declassement') THEN
    IF NOT app.peut_instruire_declassement(v_commune) THEN
      RAISE EXCEPTION 'ACCES_REFUSE' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF p_table IN ('demandes_carte_precollecteur', 'pieces_demande_carte', 'jalons_acteurs', 'agrements_intermediaires',
                    'grilles_tarifaires', 'conventions_commerciales', 'avenants_convention') THEN
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
