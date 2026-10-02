-- =========================================================================
-- 057 — Les documents à numérotation scellée (lot 16.2).
-- docs/specs_metier/SPEC_v0.16.md § 4 ; référentiel du dépôt municipal § 2.1.
--
-- Un ordre de mission, un bon de sortie carburant, un bon de travail, une
-- fiche de déclaration de panne sont des pièces OPPOSABLES : leur valeur tient
-- à leur numéro. Un registre papier se feuillette ; un registre numérique doit
-- prouver ce qu'un registre papier montre de lui-même — qu'aucune page n'a été
-- arrachée, qu'aucune n'a été réécrite, qu'aucune n'a été glissée après coup.
-- C'est la base qui le garantit, pas l'écran :
--
--   1. NUMÉRO CONTINU par commune, par type et par exercice, attribué SOUS
--      VERROU dans la même transaction que le document : deux émissions
--      simultanées ne reçoivent jamais le même numéro, et une émission qui
--      échoue ne consomme pas le sien (pas de trou).
--   2. JAMAIS RÉUTILISÉ : un document annulé garde son numéro.
--   3. CONTENU FIGÉ : un document émis ne se modifie pas et ne s'efface pas
--      (pas même logiquement). Seule l'annulation est permise, avec un motif,
--      et elle ne touche à rien d'autre.
--   4. AUCUN NUMÉRO GLISSÉ : une ligne ne s'insère qu'avec le numéro que la
--      séquence vient d'attribuer — combler un trou est refusé.
--   5. Les trous se DÉTECTENT (app.trous_documents) : ils ne devraient pas
--      exister ; si une manipulation hors de l'application en crée un, la
--      plateforme le montre au lieu de le taire (règle d'or 1.5).
--
-- La MISE EN PAGE des quatre documents attend la validation des gabarits par
-- un chef de dépôt en exercice (SPEC § 6). Le contenu est donc conservé tel
-- qu'émis (JSON), avec son empreinte : l'impression viendra le relire, elle ne
-- le recalculera pas.
-- =========================================================================

CREATE TABLE IF NOT EXISTS sequences_documents (
    commune_id      TEXT     NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    type_document   TEXT     NOT NULL,
    exercice        SMALLINT NOT NULL CHECK (exercice BETWEEN 2000 AND 2100),
    dernier_numero  INTEGER  NOT NULL DEFAULT 0 CHECK (dernier_numero >= 0),
    PRIMARY KEY (commune_id, type_document, exercice)
);
COMMENT ON TABLE sequences_documents IS
  'Compteur de chaque registre de documents (commune × type × exercice). Ne s''écrit que par app.emettre_document(), sous verrou de ligne : c''est ce verrou qui rend la numérotation continue.';

CREATE TABLE IF NOT EXISTS documents_emis (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id         TEXT     NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    type_document      TEXT     NOT NULL CHECK (type_document IN ('ordre_mission', 'bon_carburant', 'bon_travail', 'declaration_panne')),
    exercice           SMALLINT NOT NULL,
    numero             INTEGER  NOT NULL CHECK (numero > 0),
    numero_affiche     TEXT GENERATED ALWAYS AS (
                         CASE type_document
                           WHEN 'ordre_mission'     THEN 'OM'
                           WHEN 'bon_carburant'     THEN 'BC'
                           WHEN 'bon_travail'       THEN 'BT'
                           WHEN 'declaration_panne' THEN 'DP'
                         END || '-' || exercice || '-' || lpad(numero::text, 5, '0')
                       ) STORED,
    contenu            JSONB    NOT NULL CHECK (jsonb_typeof(contenu) = 'object' AND contenu <> '{}'::jsonb),
    empreinte_contenu  TEXT     NOT NULL,
    objet_type         TEXT CHECK (objet_type IS NULL OR objet_type IN ('vehicule', 'circuit', 'personnel', 'intervention')),
    objet_id           TEXT,
    emis_le            TIMESTAMPTZ NOT NULL DEFAULT now(),
    emis_par           UUID REFERENCES users(id) ON DELETE SET NULL,
    statut             TEXT NOT NULL DEFAULT 'emis' CHECK (statut IN ('emis', 'annule')),
    annule_le          TIMESTAMPTZ,
    annule_par         UUID REFERENCES users(id) ON DELETE SET NULL,
    motif_annulation   TEXT,
    UNIQUE (commune_id, type_document, exercice, numero),
    CONSTRAINT documents_annulation_motivee CHECK (
      (statut = 'emis' AND annule_le IS NULL AND motif_annulation IS NULL)
      OR (statut = 'annule' AND annule_le IS NOT NULL AND length(btrim(COALESCE(motif_annulation, ''))) >= 5)
    ),
    CONSTRAINT documents_objet_complet CHECK ((objet_type IS NULL) = (objet_id IS NULL))
);
COMMENT ON TABLE documents_emis IS
  'Registre des documents opposables (lot 16.2) : ordre de mission (D3), bon de sortie carburant (D7), bon de travail (D11), fiche de déclaration de panne (D9). Numéro continu, jamais réutilisé ; contenu figé ; seule l''annulation motivée est permise. Ne s''écrit que par app.emettre_document() et app.annuler_document().';
COMMENT ON COLUMN documents_emis.numero_affiche IS
  'Numéro tel qu''imprimé : préfixe du type, exercice, rang sur cinq chiffres (BC-2026-00042).';
COMMENT ON COLUMN documents_emis.empreinte_contenu IS
  'SHA-256 du contenu à l''émission. Le contenu ne peut plus changer ; l''empreinte permet de le prouver sur une copie imprimée ou exportée.';
COMMENT ON COLUMN documents_emis.exercice IS
  'Année de l''émission, à l''heure de Tunis : un bon émis le 31 décembre à 23 h 30 appartient à l''exercice qui se termine.';

CREATE INDEX IF NOT EXISTS idx_documents_registre ON documents_emis (commune_id, type_document, exercice, numero);

-- -------------------------------------------------------------------------
-- Le contenu figé, l'effacement interdit
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.proteger_document()
  RETURNS trigger LANGUAGE plpgsql AS
$$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'DOCUMENT_SCELLE: un document émis ne s''efface pas (%). Annulez-le, avec un motif : son numéro restera au registre.', OLD.numero_affiche
      USING ERRCODE = 'check_violation';
  END IF;
  -- Seule transition permise : émis → annulé, et seules les colonnes de
  -- l'annulation changent. Comparer la ligne entière, privée de ces
  -- colonnes, ferme d'un coup toutes les autres modifications — y compris
  -- celles d'une colonne qu'on ajouterait plus tard. `numero_affiche` est
  -- écartée aussi : colonne générée, elle n'est pas encore calculée dans un
  -- déclencheur BEFORE (NULL dans NEW), et toute annulation passerait pour
  -- une réécriture du numéro.
  IF OLD.statut = 'annule' THEN
    RAISE EXCEPTION 'DOCUMENT_SCELLE: le document % est déjà annulé.', OLD.numero_affiche USING ERRCODE = 'check_violation';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['statut', 'annule_le', 'annule_par', 'motif_annulation', 'numero_affiche'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['statut', 'annule_le', 'annule_par', 'motif_annulation', 'numero_affiche'])
     OR NEW.statut <> 'annule' THEN
    RAISE EXCEPTION 'DOCUMENT_SCELLE: le document % ne se modifie pas ; seule son annulation, motivée, est permise.', OLD.numero_affiche
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_proteger_document ON documents_emis;
CREATE TRIGGER trg_proteger_document
  BEFORE UPDATE OR DELETE ON documents_emis
  FOR EACH ROW EXECUTE FUNCTION app.proteger_document();

-- Aucun numéro glissé : à l'insertion, le numéro doit être celui que la
-- séquence vient d'attribuer. Un INSERT direct (même d'un super-utilisateur)
-- qui voudrait combler un trou, ou devancer le compteur, est refusé.
CREATE OR REPLACE FUNCTION app.controler_numero_document()
  RETURNS trigger LANGUAGE plpgsql AS
$$
DECLARE
  v_dernier integer;
BEGIN
  SELECT dernier_numero INTO v_dernier FROM sequences_documents
   WHERE commune_id = NEW.commune_id AND type_document = NEW.type_document AND exercice = NEW.exercice;
  IF v_dernier IS NULL OR NEW.numero <> v_dernier THEN
    RAISE EXCEPTION 'DOCUMENT_NUMERO: le numéro % n''est pas celui que le registre vient d''attribuer (%). Un document s''émet par app.emettre_document(), jamais par un numéro choisi.',
      NEW.numero, COALESCE(v_dernier::text, 'aucun')
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.empreinte_contenu := encode(digest(NEW.contenu::text, 'sha256'), 'hex');
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_controler_numero_document ON documents_emis;
CREATE TRIGGER trg_controler_numero_document
  BEFORE INSERT ON documents_emis
  FOR EACH ROW EXECUTE FUNCTION app.controler_numero_document();

-- -------------------------------------------------------------------------
-- Émettre, annuler : les deux seules portes
-- -------------------------------------------------------------------------
-- Émettre un document de la commune est un acte de la commune : son admin,
-- pas la FNCT (CLAUDE.md § 6 : la FNCT ne décide pas à la place d'une commune).
CREATE OR REPLACE FUNCTION app.peut_emettre_document(p_commune text) RETURNS boolean
  LANGUAGE sql STABLE AS
$$ SELECT app.current_role_name() = 'admin_commune' AND p_commune = ANY (app.mes_communes()) $$;

CREATE OR REPLACE FUNCTION app.emettre_document(
    p_commune    text,
    p_type       text,
    p_contenu    jsonb,
    p_objet_type text DEFAULT NULL,
    p_objet_id   text DEFAULT NULL
  )
  RETURNS documents_emis
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_exercice smallint := extract(year FROM (now() AT TIME ZONE 'Africa/Tunis'))::smallint;
  v_numero   integer;
  v_doc      documents_emis;
BEGIN
  IF NOT app.peut_emettre_document(p_commune) THEN
    RAISE EXCEPTION 'ACCES_REFUSE' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- L'INSERT … ON CONFLICT DO UPDATE prend le verrou de la ligne du compteur
  -- jusqu'à la fin de la transaction : une seconde émission simultanée
  -- attend, puis lit le compteur déjà incrémenté. Si l'insertion du document
  -- échoue, la transaction entière est annulée, compteur compris : pas de
  -- numéro consommé pour rien.
  INSERT INTO sequences_documents (commune_id, type_document, exercice, dernier_numero)
  VALUES (p_commune, p_type, v_exercice, 1)
  ON CONFLICT (commune_id, type_document, exercice)
  DO UPDATE SET dernier_numero = sequences_documents.dernier_numero + 1
  RETURNING dernier_numero INTO v_numero;

  INSERT INTO documents_emis (commune_id, type_document, exercice, numero, contenu, empreinte_contenu,
                              objet_type, objet_id, emis_par)
  VALUES (p_commune, p_type, v_exercice, v_numero, p_contenu, '', p_objet_type, p_objet_id, app.current_user_id())
  RETURNING * INTO v_doc;
  RETURN v_doc;
END
$$;
COMMENT ON FUNCTION app.emettre_document(text, text, jsonb, text, text) IS
  'Émet un document opposable : numéro suivant du registre (commune × type × exercice), attribué sous verrou dans la même transaction. Réservé à l''admin de la commune.';

CREATE OR REPLACE FUNCTION app.annuler_document(p_id uuid, p_motif text)
  RETURNS documents_emis
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_commune text;
  v_doc     documents_emis;
BEGIN
  SELECT commune_id INTO v_commune FROM documents_emis WHERE id = p_id;
  -- Hors périmètre ou inexistant : même réponse, « introuvable ».
  IF v_commune IS NULL OR NOT (app.peut_emettre_document(v_commune) OR app.can_read_commune(v_commune)) THEN
    RAISE EXCEPTION 'DOCUMENT_INTROUVABLE' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT app.peut_emettre_document(v_commune) THEN
    RAISE EXCEPTION 'ACCES_REFUSE' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE documents_emis
     SET statut = 'annule', annule_le = now(), annule_par = app.current_user_id(), motif_annulation = btrim(p_motif)
   WHERE id = p_id
  RETURNING * INTO v_doc;
  RETURN v_doc;
END
$$;
COMMENT ON FUNCTION app.annuler_document(uuid, text) IS
  'Annule un document émis, avec un motif d''au moins cinq caractères. Le numéro reste au registre, le contenu reste lisible. Réservé à l''admin de la commune.';

-- -------------------------------------------------------------------------
-- La détection des trous
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.trous_documents(p_commune text)
  RETURNS TABLE (type_document text, exercice smallint, numero_manquant integer)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT s.type_document, s.exercice, n
    FROM sequences_documents s
    CROSS JOIN LATERAL generate_series(1, s.dernier_numero) AS n
   WHERE s.commune_id = p_commune
     AND app.can_read_commune(p_commune)
     AND NOT EXISTS (SELECT 1 FROM documents_emis d
                      WHERE d.commune_id = s.commune_id AND d.type_document = s.type_document
                        AND d.exercice = s.exercice AND d.numero = n)
   ORDER BY 1, 2, 3
$$;
COMMENT ON FUNCTION app.trous_documents(text) IS
  'Numéros attribués par le compteur sans document au registre. Ne devrait jamais rien rendre : s''il rend une ligne, une manipulation hors de l''application a eu lieu, et la plateforme le montre.';

-- -------------------------------------------------------------------------
-- Cloisonnement, droits, journal
-- -------------------------------------------------------------------------
ALTER TABLE sequences_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequences_documents FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sequences_documents_select ON sequences_documents;
CREATE POLICY sequences_documents_select ON sequences_documents FOR SELECT USING (app.can_read_commune(commune_id));

ALTER TABLE documents_emis ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents_emis FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS documents_emis_select ON documents_emis;
CREATE POLICY documents_emis_select ON documents_emis FOR SELECT USING (app.can_read_commune(commune_id));

-- Lecture seule pour l'application : émettre et annuler passent par les
-- deux fonctions ci-dessus, qui seules écrivent.
GRANT SELECT ON sequences_documents, documents_emis TO siipi_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON sequences_documents, documents_emis FROM siipi_app;
GRANT EXECUTE ON FUNCTION app.emettre_document(text, text, jsonb, text, text) TO siipi_app;
GRANT EXECUTE ON FUNCTION app.annuler_document(uuid, text) TO siipi_app;
GRANT EXECUTE ON FUNCTION app.trous_documents(text) TO siipi_app;

DROP TRIGGER IF EXISTS trg_audit_documents_emis ON documents_emis;
CREATE TRIGGER trg_audit_documents_emis
  AFTER INSERT OR UPDATE OR DELETE ON documents_emis
  FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement();
