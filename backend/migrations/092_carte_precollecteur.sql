-- =========================================================================
-- 092 — La carte de pré-collecteur (lot I2, 18.2 ; décisions du 28/10/2026).
-- docs/specs_metier/02-projet-decret-tri-source-art13-14.md, art. 13.1.
--
-- UNE CARTE NAÎT D'UNE DÉCISION, JAMAIS D'UNE SAISIE. La commune enregistre la
-- demande, ses pièces et les zones d'accès ; son directeur accorde ou refuse.
-- L'accord est UNE fonction (app.accorder_carte) qui vérifie tout, puis émet la
-- carte comme document scellé de 16.2 (migration 057), dans la même
-- transaction : un numéro attribué l'est à une carte entière, ou pas du tout.
--
-- LES RÈGLES SONT DES DONNÉES (lot I1, migration 091). La liste des pièces est
-- celle EN VIGUEUR À LA DATE DE LA DEMANDE ; la validité, la durée en vigueur
-- LE JOUR DE LA DÉCISION. Sans durée en vigueur, l'accord est refusé : la base
-- n'invente pas une validité.
--
-- AUCUN NOM DANS LA CARTE SCELLÉE (décision 2 du 28/10/2026). Le contenu
-- porte le pseudonyme, les zones et les dates ; le nom s'ajoute à
-- l'impression, pour le seul directeur de la commune, depuis la table
-- d'identité (migration 056), et la lecture est journalisée.
--
-- GRATUITE : aucune colonne de paiement, de montant ou de frais (ligne rouge 5).
-- Pièces : une date et une référence, jamais le scan — l'original reste au
-- dossier papier de la commune (décision du 28/10/2026).
--
-- Tout est derrière l'interrupteur `cadre_secteur_informel_actif` (064).
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Le registre des documents accueille la carte
-- -------------------------------------------------------------------------
ALTER TABLE documents_emis DROP CONSTRAINT IF EXISTS documents_emis_type_document_check;
ALTER TABLE documents_emis ADD CONSTRAINT documents_emis_type_document_check
  CHECK (type_document IN ('ordre_mission', 'bon_carburant', 'bon_travail', 'declaration_panne', 'carte_precollecteur'));
ALTER TABLE documents_emis DROP CONSTRAINT IF EXISTS documents_emis_objet_type_check;
ALTER TABLE documents_emis ADD CONSTRAINT documents_emis_objet_type_check
  CHECK (objet_type IS NULL OR objet_type IN ('vehicule', 'circuit', 'personnel', 'intervention', 'acteur_informel'));

-- Le préfixe du numéro affiché : PostgreSQL 16 ne sait pas changer
-- l'expression d'une colonne générée ; elle se reconstruit, sans toucher à
-- aucune ligne (la réécriture de la table ne déclenche aucun déclencheur de
-- ligne). Rejouée, la migration ne la refait pas : le test porte sur le texte
-- de l'expression.
DO $$
BEGIN
  IF pg_get_expr((SELECT adbin FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
                   WHERE d.adrelid = 'documents_emis'::regclass AND a.attname = 'numero_affiche'), 'documents_emis'::regclass)
     NOT LIKE '%carte_precollecteur%' THEN
    ALTER TABLE documents_emis DROP COLUMN numero_affiche;
    ALTER TABLE documents_emis ADD COLUMN numero_affiche TEXT GENERATED ALWAYS AS (
      CASE type_document
        WHEN 'ordre_mission'       THEN 'OM'
        WHEN 'bon_carburant'       THEN 'BC'
        WHEN 'bon_travail'         THEN 'BT'
        WHEN 'declaration_panne'   THEN 'DP'
        WHEN 'carte_precollecteur' THEN 'CP'
      END || '-' || exercice || '-' || lpad(numero::text, 5, '0')
    ) STORED;
  END IF;
END
$$;
COMMENT ON COLUMN documents_emis.numero_affiche IS
  'Numéro tel qu''imprimé : préfixe du type (OM, BC, BT, DP, CP), exercice, numéro sur cinq chiffres. Calculé, jamais saisi.';
COMMENT ON TABLE documents_emis IS
  'Registre des documents opposables (lot 16.2) : ordre de mission (D3), bon de sortie carburant (D7), bon de travail (D11), fiche de déclaration de panne (D9), carte de pré-collecteur (18.2, émise par app.accorder_carte seulement). Numéro continu, jamais réutilisé ; contenu figé ; seule l''annulation motivée est permise. Ne s''écrit que par app.emettre_document() et app.annuler_document().';

-- -------------------------------------------------------------------------
-- 2. La demande, ses zones, ses pièces
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS demandes_carte_precollecteur (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id           TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    acteur_id            UUID NOT NULL REFERENCES barbechas(id) ON DELETE CASCADE,
    date_demande         DATE NOT NULL,
    carte_precedente_id  UUID REFERENCES documents_emis(id),
    decision             TEXT,
    date_decision        DATE,
    motif_refus          TEXT,
    document_id          UUID UNIQUE REFERENCES documents_emis(id),
    date_debut           DATE,
    date_fin             DATE,
    retrait_le           DATE,
    motif_retrait        TEXT,
    retrait_par          UUID REFERENCES users(id) ON DELETE SET NULL,
    decide_par           UUID REFERENCES users(id) ON DELETE SET NULL,
    saisi_par            UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at           TIMESTAMPTZ,
    deleted_by           UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT demandes_carte_decision_valide CHECK (decision IS NULL OR decision IN ('accordee', 'refusee')),
    -- Une décision est entière : un refus a son motif et pas de carte ; un
    -- accord a sa carte et ses dates.
    CONSTRAINT demandes_carte_decision_complete CHECK (
      (decision IS NULL AND date_decision IS NULL AND motif_refus IS NULL AND document_id IS NULL AND date_debut IS NULL AND date_fin IS NULL)
      OR (decision = 'refusee' AND date_decision IS NOT NULL AND length(btrim(COALESCE(motif_refus, ''))) >= 5
          AND document_id IS NULL AND date_debut IS NULL AND date_fin IS NULL)
      OR (decision = 'accordee' AND date_decision IS NOT NULL AND motif_refus IS NULL
          AND document_id IS NOT NULL AND date_debut IS NOT NULL AND date_fin IS NOT NULL AND date_fin >= date_debut)),
    CONSTRAINT demandes_carte_decision_apres_demande CHECK (date_decision IS NULL OR date_decision >= date_demande),
    CONSTRAINT demandes_carte_retrait_motive CHECK (
      (retrait_le IS NULL AND motif_retrait IS NULL)
      OR (decision = 'accordee' AND retrait_le IS NOT NULL AND length(btrim(COALESCE(motif_retrait, ''))) >= 5))
);
COMMENT ON TABLE demandes_carte_precollecteur IS
  'Demandes de carte de pré-collecteur (projet de décret, art. 13.1 ; lot 18.2) : la demande, puis la décision du directeur de la commune — accord (la carte, document scellé de documents_emis, et ses dates) ou refus motivé. Une carte se retire, motivée ; elle ne se modifie pas. Gratuite : aucune colonne de paiement.';
COMMENT ON COLUMN demandes_carte_precollecteur.date_demande IS
  'Jour du dépôt de la demande : la liste des pièces exigées est celle en vigueur ce jour-là (app.liste_nationale).';
COMMENT ON COLUMN demandes_carte_precollecteur.carte_precedente_id IS
  'Pour un renouvellement : la carte renouvelée. La nouvelle carte commence le lendemain de la fin de celle-ci si elle est encore valable (décision du 28/10/2026) : un acteur n''a jamais deux cartes valables.';
COMMENT ON COLUMN demandes_carte_precollecteur.date_fin IS
  'Dernier jour de validité, fixé à l''accord par la durée en vigueur le jour de la décision (paramètre informel_validite_carte_mois) ; recopié de la carte scellée pour les recherches.';
COMMENT ON COLUMN demandes_carte_precollecteur.retrait_le IS
  'Jour du retrait de la carte, motivé : elle a valu jusqu''à la veille. Un retrait n''est pas une annulation (une erreur d''émission, app.annuler_document) : la carte a existé.';

-- Une seule demande en attente par acteur.
CREATE UNIQUE INDEX IF NOT EXISTS uq_demande_carte_en_attente
  ON demandes_carte_precollecteur (acteur_id) WHERE decision IS NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_demandes_carte_commune ON demandes_carte_precollecteur (commune_id, date_demande) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS zones_demande_carte (
    demande_id  UUID NOT NULL REFERENCES demandes_carte_precollecteur(id) ON DELETE CASCADE,
    zone_id     UUID NOT NULL REFERENCES zones_collecte(id),
    commune_id  TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (demande_id, zone_id)
);
COMMENT ON TABLE zones_demande_carte IS
  'Les secteurs de la commune où la carte donne accès aux points d''apport et au porte-à-porte. Fixés avec la demande : une erreur se corrige en retirant la demande et en la refaisant, avant la décision.';

CREATE TABLE IF NOT EXISTS pieces_demande_carte (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    demande_id  UUID NOT NULL REFERENCES demandes_carte_precollecteur(id) ON DELETE CASCADE,
    commune_id  TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    piece_code  TEXT NOT NULL,
    date_piece  DATE NOT NULL,
    reference   TEXT CHECK (reference IS NULL OR length(reference) <= 200),
    saisi_par   UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMPTZ,
    deleted_by  UUID REFERENCES users(id) ON DELETE SET NULL
);
COMMENT ON TABLE pieces_demande_carte IS
  'Les attestations reçues avec une demande de carte : le code de la pièce (liste nationale pieces_carte_precollecteur en vigueur à la date de la demande), sa date, sa référence. Jamais le document lui-même : l''original reste au dossier papier de la commune.';
CREATE UNIQUE INDEX IF NOT EXISTS uq_piece_demande
  ON pieces_demande_carte (demande_id, piece_code) WHERE deleted_at IS NULL;

-- -------------------------------------------------------------------------
-- 3. Les gardes de la base
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.jour_tunis() RETURNS date
  LANGUAGE sql STABLE AS $$ SELECT (now() AT TIME ZONE 'Africa/Tunis')::date $$;
GRANT EXECUTE ON FUNCTION app.jour_tunis() TO siipi_app;

CREATE OR REPLACE FUNCTION app.controler_demande_carte() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_acteur barbechas;
  v_prec   documents_emis;
BEGIN
  IF NOT app.cadre_secteur_informel_actif() THEN
    RAISE EXCEPTION 'CADRE_INACTIF: le cadre du secteur informel n''est pas en vigueur (projet de décret) ; la FNCT l''active quand le texte est publié.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT * INTO v_acteur FROM barbechas WHERE id = NEW.acteur_id AND deleted_at IS NULL;
    IF v_acteur.id IS NULL THEN
      RAISE EXCEPTION 'ACTEUR_INCONNU: %', NEW.acteur_id USING ERRCODE = 'check_violation';
    END IF;
    NEW.commune_id := v_acteur.commune_id;
    IF NEW.decision IS NOT NULL OR NEW.retrait_le IS NOT NULL OR NEW.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'CARTE_DECISION: une demande s''enregistre sans décision ; elle se décide ensuite.' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.date_demande > app.jour_tunis() THEN
      RAISE EXCEPTION 'CARTE_DATE: une demande s''enregistre quand elle est déposée ; sa date ne peut pas être dans l''avenir.' USING ERRCODE = 'check_violation';
    END IF;
    IF v_acteur.categorie IS DISTINCT FROM 'pre_collecteur' THEN
      RAISE EXCEPTION 'CARTE_CATEGORIE: la carte est celle d''un pré-collecteur ; l''acteur % est %.', v_acteur.id_precollecteur,
        CASE v_acteur.categorie WHEN 'intermediaire' THEN 'déclaré intermédiaire' ELSE 'sans catégorie déclarée' END
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.carte_precedente_id IS NOT NULL THEN
      SELECT * INTO v_prec FROM documents_emis WHERE id = NEW.carte_precedente_id;
      IF v_prec.id IS NULL OR v_prec.type_document <> 'carte_precollecteur' OR v_prec.objet_id IS DISTINCT FROM NEW.acteur_id::text THEN
        RAISE EXCEPTION 'CARTE_PRECEDENTE: la carte à renouveler n''est pas une carte de cet acteur.' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE : une demande décidée ne bouge plus, sauf son retrait, une fois.
  -- Avant la décision, seul le retrait logique de la demande passe (app.supprimer),
  -- par le directeur de la commune.
  IF OLD.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'CARTE_FIGEE: cette demande est retirée.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.deleted_at IS NOT NULL THEN
    IF OLD.decision IS NOT NULL THEN
      RAISE EXCEPTION 'CARTE_DECIDEE: une demande décidée ne se retire pas ; une carte accordée se retire, motivée.' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT app.peut_emettre_document(OLD.commune_id) THEN
      RAISE EXCEPTION 'ACCES_REFUSE' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - ARRAY['decision', 'date_decision', 'motif_refus', 'document_id', 'date_debut', 'date_fin', 'decide_par',
                            'retrait_le', 'motif_retrait', 'retrait_par'])
     IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['decision', 'date_decision', 'motif_refus', 'document_id', 'date_debut', 'date_fin', 'decide_par',
                            'retrait_le', 'motif_retrait', 'retrait_par']) THEN
    RAISE EXCEPTION 'CARTE_FIGEE: une demande ne se réécrit pas ; retirez-la avant la décision et enregistrez-la de nouveau.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.decision IS NOT NULL
     AND (to_jsonb(NEW) - ARRAY['retrait_le', 'motif_retrait', 'retrait_par'])
         IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['retrait_le', 'motif_retrait', 'retrait_par']) THEN
    RAISE EXCEPTION 'CARTE_DECIDEE: la décision est prise ; elle ne se change pas.' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.retrait_le IS NOT NULL THEN
    RAISE EXCEPTION 'CARTE_RETIREE: cette carte est déjà retirée.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_controler_demande_carte ON demandes_carte_precollecteur;
CREATE TRIGGER trg_controler_demande_carte BEFORE INSERT OR UPDATE ON demandes_carte_precollecteur
  FOR EACH ROW EXECUTE FUNCTION app.controler_demande_carte();

-- Une zone et une pièce s'ajoutent à une demande en attente, de la même commune.
CREATE OR REPLACE FUNCTION app.controler_annexe_demande_carte() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_demande demandes_carte_precollecteur;
BEGIN
  IF NOT app.cadre_secteur_informel_actif() THEN
    RAISE EXCEPTION 'CADRE_INACTIF: le cadre du secteur informel n''est pas en vigueur (projet de décret) ; la FNCT l''active quand le texte est publié.'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_demande FROM demandes_carte_precollecteur WHERE id = NEW.demande_id AND deleted_at IS NULL;
  IF v_demande.id IS NULL THEN
    RAISE EXCEPTION 'DEMANDE_INCONNUE: %', NEW.demande_id USING ERRCODE = 'check_violation';
  END IF;
  IF v_demande.decision IS NOT NULL THEN
    RAISE EXCEPTION 'CARTE_DECIDEE: la demande est décidée ; ses pièces et ses zones ne changent plus.' USING ERRCODE = 'check_violation';
  END IF;

  IF TG_TABLE_NAME = 'zones_demande_carte' THEN
    IF TG_OP <> 'INSERT' THEN
      RAISE EXCEPTION 'CARTE_FIGEE: une zone ne se modifie pas.' USING ERRCODE = 'check_violation';
    END IF;
    NEW.commune_id := v_demande.commune_id;
    IF NOT EXISTS (SELECT 1 FROM zones_collecte WHERE id = NEW.zone_id AND commune_id = v_demande.commune_id AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'CARTE_ZONE: ce secteur n''est pas un secteur de la commune.' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- pieces_demande_carte
  IF TG_OP = 'UPDATE' THEN
    IF OLD.deleted_at IS NOT NULL
       OR (to_jsonb(NEW) - 'deleted_at' - 'deleted_by') IS DISTINCT FROM (to_jsonb(OLD) - 'deleted_at' - 'deleted_by') THEN
      RAISE EXCEPTION 'CARTE_FIGEE: une pièce ne se réécrit pas ; retirez-la et enregistrez la bonne.' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  NEW.commune_id := v_demande.commune_id;
  IF NEW.date_piece > app.jour_tunis() THEN
    RAISE EXCEPTION 'CARTE_DATE: une pièce se date du jour où elle a été établie ; pas dans l''avenir.' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM app.liste_nationale('pieces_carte_precollecteur', v_demande.date_demande) WHERE code = NEW.piece_code) THEN
    RAISE EXCEPTION 'CARTE_PIECE: « % » n''est pas une pièce exigée le %, jour de la demande.', NEW.piece_code, to_char(v_demande.date_demande, 'DD/MM/YYYY')
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_controler_zones_demande_carte ON zones_demande_carte;
CREATE TRIGGER trg_controler_zones_demande_carte BEFORE INSERT OR UPDATE ON zones_demande_carte
  FOR EACH ROW EXECUTE FUNCTION app.controler_annexe_demande_carte();
DROP TRIGGER IF EXISTS trg_controler_pieces_demande_carte ON pieces_demande_carte;
CREATE TRIGGER trg_controler_pieces_demande_carte BEFORE INSERT OR UPDATE ON pieces_demande_carte
  FOR EACH ROW EXECUTE FUNCTION app.controler_annexe_demande_carte();

DROP TRIGGER IF EXISTS trg_audit_demandes_carte ON demandes_carte_precollecteur;
CREATE TRIGGER trg_audit_demandes_carte AFTER INSERT OR UPDATE OR DELETE ON demandes_carte_precollecteur
  FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement();
DROP TRIGGER IF EXISTS trg_audit_pieces_demande_carte ON pieces_demande_carte;
CREATE TRIGGER trg_audit_pieces_demande_carte AFTER INSERT OR UPDATE OR DELETE ON pieces_demande_carte
  FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement();
DROP TRIGGER IF EXISTS trg_audit_zones_demande_carte ON zones_demande_carte;
CREATE TRIGGER trg_audit_zones_demande_carte AFTER INSERT OR UPDATE OR DELETE ON zones_demande_carte
  FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement();

-- Lire : la commune et la FNCT (can_read_commune). Écrire : le seul
-- directeur de la commune — la carte est un acte de la commune.
ALTER TABLE demandes_carte_precollecteur ENABLE ROW LEVEL SECURITY;
ALTER TABLE demandes_carte_precollecteur FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS demandes_carte_select ON demandes_carte_precollecteur;
CREATE POLICY demandes_carte_select ON demandes_carte_precollecteur FOR SELECT
  USING (deleted_at IS NULL AND app.can_read_commune(commune_id));
DROP POLICY IF EXISTS demandes_carte_insert ON demandes_carte_precollecteur;
CREATE POLICY demandes_carte_insert ON demandes_carte_precollecteur FOR INSERT
  WITH CHECK (app.peut_emettre_document(commune_id));

ALTER TABLE zones_demande_carte ENABLE ROW LEVEL SECURITY;
ALTER TABLE zones_demande_carte FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS zones_demande_carte_select ON zones_demande_carte;
CREATE POLICY zones_demande_carte_select ON zones_demande_carte FOR SELECT
  USING (app.can_read_commune(commune_id));
DROP POLICY IF EXISTS zones_demande_carte_insert ON zones_demande_carte;
CREATE POLICY zones_demande_carte_insert ON zones_demande_carte FOR INSERT
  WITH CHECK (app.peut_emettre_document(commune_id));

ALTER TABLE pieces_demande_carte ENABLE ROW LEVEL SECURITY;
ALTER TABLE pieces_demande_carte FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pieces_demande_carte_select ON pieces_demande_carte;
CREATE POLICY pieces_demande_carte_select ON pieces_demande_carte FOR SELECT
  USING (deleted_at IS NULL AND app.can_read_commune(commune_id));
DROP POLICY IF EXISTS pieces_demande_carte_insert ON pieces_demande_carte;
CREATE POLICY pieces_demande_carte_insert ON pieces_demande_carte FOR INSERT
  WITH CHECK (app.peut_emettre_document(commune_id));

-- Les mises à jour ne viennent que des fonctions de propriétaire (décision,
-- retrait, retrait logique) ; la politique les tient aussi pour un
-- propriétaire qui ne serait pas super-utilisateur (FORCE ROW LEVEL SECURITY).
DROP POLICY IF EXISTS demandes_carte_update ON demandes_carte_precollecteur;
CREATE POLICY demandes_carte_update ON demandes_carte_precollecteur FOR UPDATE
  USING (deleted_at IS NULL AND app.peut_emettre_document(commune_id)) WITH CHECK (app.peut_emettre_document(commune_id));
DROP POLICY IF EXISTS pieces_demande_carte_update ON pieces_demande_carte;
CREATE POLICY pieces_demande_carte_update ON pieces_demande_carte FOR UPDATE
  USING (deleted_at IS NULL AND app.peut_emettre_document(commune_id)) WITH CHECK (app.peut_emettre_document(commune_id));

-- La commune_id d'une zone ou d'une pièce est posée par le déclencheur depuis
-- la demande : la politique la lit après lui.
GRANT SELECT, INSERT ON demandes_carte_precollecteur, zones_demande_carte, pieces_demande_carte TO siipi_app;
-- Ni UPDATE ni DELETE pour l'application : une décision passe par
-- app.accorder_carte / app.refuser_carte / app.retirer_carte, un retrait
-- logique par app.supprimer — toutes de propriétaire.
REVOKE UPDATE, DELETE, TRUNCATE ON demandes_carte_precollecteur, zones_demande_carte, pieces_demande_carte FROM siipi_app;

-- -------------------------------------------------------------------------
-- 4. Accorder, refuser, retirer
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.accorder_carte(p_demande uuid, p_date date)
  RETURNS demandes_carte_precollecteur
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_d          demandes_carte_precollecteur;
  v_acteur     barbechas;
  v_manquantes text;
  v_zones      text;
  v_pieces     text;
  v_regle      valeurs_parametres_nationaux;
  v_en_cours   demandes_carte_precollecteur;
  v_num_prec   text;
  v_debut      date;
  v_fin        date;
  v_doc        documents_emis;
BEGIN
  SELECT * INTO v_d FROM demandes_carte_precollecteur WHERE id = p_demande AND deleted_at IS NULL;
  -- Hors périmètre ou inexistante : même réponse.
  IF v_d.id IS NULL OR NOT app.can_read_commune(v_d.commune_id) THEN
    RAISE EXCEPTION 'DEMANDE_INCONNUE' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT app.peut_emettre_document(v_d.commune_id) THEN
    RAISE EXCEPTION 'ACCES_REFUSE' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app.cadre_secteur_informel_actif() THEN
    RAISE EXCEPTION 'CADRE_INACTIF: le cadre du secteur informel n''est pas en vigueur (projet de décret) ; la FNCT l''active quand le texte est publié.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_d.decision IS NOT NULL THEN
    RAISE EXCEPTION 'CARTE_DECIDEE: cette demande est déjà décidée.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_date < v_d.date_demande OR p_date > app.jour_tunis() THEN
    RAISE EXCEPTION 'CARTE_DATE: la décision se date entre le jour de la demande (%) et aujourd''hui.', to_char(v_d.date_demande, 'DD/MM/YYYY')
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_acteur FROM barbechas WHERE id = v_d.acteur_id AND deleted_at IS NULL;
  IF v_acteur.categorie IS DISTINCT FROM 'pre_collecteur' THEN
    RAISE EXCEPTION 'CARTE_CATEGORIE: la carte est celle d''un pré-collecteur ; l''acteur % est %.', v_acteur.id_precollecteur,
      CASE v_acteur.categorie WHEN 'intermediaire' THEN 'déclaré intermédiaire' ELSE 'sans catégorie déclarée' END
      USING ERRCODE = 'check_violation';
  END IF;

  -- Les pièces : la liste du jour de la DEMANDE, pas celle d'aujourd'hui.
  SELECT string_agg(l.libelle_fr, ' ; ' ORDER BY l.ordre) INTO v_manquantes
    FROM app.liste_nationale('pieces_carte_precollecteur', v_d.date_demande) l
   WHERE NOT EXISTS (SELECT 1 FROM pieces_demande_carte p
                      WHERE p.demande_id = v_d.id AND p.deleted_at IS NULL AND p.piece_code = l.code);
  IF v_manquantes IS NOT NULL THEN
    RAISE EXCEPTION 'CARTE_PIECES: il manque : %.', v_manquantes USING ERRCODE = 'check_violation';
  END IF;

  SELECT string_agg(z.name, ' ; ' ORDER BY z.name) INTO v_zones
    FROM zones_demande_carte zd JOIN zones_collecte z ON z.id = zd.zone_id
   WHERE zd.demande_id = v_d.id;
  IF v_zones IS NULL THEN
    RAISE EXCEPTION 'CARTE_ZONES: la carte donne accès à des secteurs ; la demande n''en nomme aucun.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_regle FROM app.parametre_national('informel_validite_carte_mois', p_date);
  IF v_regle.id IS NULL THEN
    RAISE EXCEPTION 'CARTE_REGLE: aucune durée de validité n''est en vigueur le % ; la FNCT la fixe dans les paramètres nationaux.', to_char(p_date, 'DD/MM/YYYY')
      USING ERRCODE = 'check_violation';
  END IF;

  -- La carte en cours de l'acteur : jamais deux cartes valables à la fois.
  SELECT d.* INTO v_en_cours
    FROM demandes_carte_precollecteur d JOIN documents_emis e ON e.id = d.document_id
   WHERE d.acteur_id = v_d.acteur_id AND d.deleted_at IS NULL AND d.decision = 'accordee'
     AND d.retrait_le IS NULL AND e.statut = 'emis' AND d.date_fin >= p_date
   ORDER BY d.date_fin DESC LIMIT 1;
  IF v_en_cours.id IS NOT NULL AND v_d.carte_precedente_id IS DISTINCT FROM v_en_cours.document_id THEN
    RAISE EXCEPTION 'CARTE_EN_COURS: l''acteur a déjà une carte valable jusqu''au % ; une nouvelle demande la renouvelle (« carte renouvelée »).',
      to_char(v_en_cours.date_fin, 'DD/MM/YYYY') USING ERRCODE = 'check_violation';
  END IF;
  v_debut := CASE WHEN v_en_cours.id IS NOT NULL THEN v_en_cours.date_fin + 1 ELSE p_date END;
  v_fin := (v_debut + make_interval(months => v_regle.valeur_nombre::int) - interval '1 day')::date;
  SELECT numero_affiche INTO v_num_prec FROM documents_emis WHERE id = v_d.carte_precedente_id;

  SELECT string_agg(format('%s — %s%s', l.libelle_fr, to_char(p.date_piece, 'DD/MM/YYYY'),
                           CASE WHEN p.reference IS NOT NULL THEN ' — ' || p.reference ELSE '' END),
                    E'\n' ORDER BY l.ordre)
    INTO v_pieces
    FROM pieces_demande_carte p
    JOIN app.liste_nationale('pieces_carte_precollecteur', v_d.date_demande) l ON l.code = p.piece_code
   WHERE p.demande_id = v_d.id AND p.deleted_at IS NULL;

  v_doc := app.emettre_document(
    v_d.commune_id, 'carte_precollecteur',
    jsonb_strip_nulls(jsonb_build_object(
      'identifiant', v_acteur.id_precollecteur,
      'zones', v_zones,
      'date_debut', v_debut::text,
      'date_fin', v_fin::text,
      'duree_mois', v_regle.valeur_nombre::int,
      'regle', COALESCE(v_regle.reference, '') || CASE WHEN v_regle.provisoire THEN ' (valeur provisoire)' ELSE '' END,
      'regle_provisoire', v_regle.provisoire,
      'date_demande', v_d.date_demande::text,
      'pieces', v_pieces,
      'carte_precedente', v_num_prec)),
    'acteur_informel', v_d.acteur_id::text);

  UPDATE demandes_carte_precollecteur
     SET decision = 'accordee', date_decision = p_date, document_id = v_doc.id,
         date_debut = v_debut, date_fin = v_fin, decide_par = app.current_user_id()
   WHERE id = v_d.id
  RETURNING * INTO v_d;
  RETURN v_d;
END
$$;
COMMENT ON FUNCTION app.accorder_carte(uuid, date) IS
  'Accorde une carte de pré-collecteur et l''émet, scellée, dans la même transaction : pré-collecteur déclaré, toutes les pièces exigées le jour de la demande, au moins un secteur, une durée de validité en vigueur le jour de la décision. Une carte encore valable n''est remplacée que par son renouvellement, qui commence le lendemain de sa fin. Réservé au directeur de la commune.';
GRANT EXECUTE ON FUNCTION app.accorder_carte(uuid, date) TO siipi_app;

CREATE OR REPLACE FUNCTION app.refuser_carte(p_demande uuid, p_date date, p_motif text)
  RETURNS demandes_carte_precollecteur
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_d demandes_carte_precollecteur;
BEGIN
  SELECT * INTO v_d FROM demandes_carte_precollecteur WHERE id = p_demande AND deleted_at IS NULL;
  IF v_d.id IS NULL OR NOT app.can_read_commune(v_d.commune_id) THEN
    RAISE EXCEPTION 'DEMANDE_INCONNUE' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT app.peut_emettre_document(v_d.commune_id) THEN
    RAISE EXCEPTION 'ACCES_REFUSE' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_d.decision IS NOT NULL THEN
    RAISE EXCEPTION 'CARTE_DECIDEE: cette demande est déjà décidée.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_date < v_d.date_demande OR p_date > app.jour_tunis() THEN
    RAISE EXCEPTION 'CARTE_DATE: la décision se date entre le jour de la demande (%) et aujourd''hui.', to_char(v_d.date_demande, 'DD/MM/YYYY')
      USING ERRCODE = 'check_violation';
  END IF;
  UPDATE demandes_carte_precollecteur
     SET decision = 'refusee', date_decision = p_date, motif_refus = btrim(p_motif), decide_par = app.current_user_id()
   WHERE id = v_d.id
  RETURNING * INTO v_d;
  RETURN v_d;
END
$$;
COMMENT ON FUNCTION app.refuser_carte(uuid, date, text) IS
  'Refuse une demande de carte, avec un motif d''au moins cinq caractères. Aucun document n''est émis. Réservé au directeur de la commune.';
GRANT EXECUTE ON FUNCTION app.refuser_carte(uuid, date, text) TO siipi_app;

CREATE OR REPLACE FUNCTION app.retirer_carte(p_demande uuid, p_date date, p_motif text)
  RETURNS demandes_carte_precollecteur
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_d demandes_carte_precollecteur;
BEGIN
  SELECT * INTO v_d FROM demandes_carte_precollecteur WHERE id = p_demande AND deleted_at IS NULL;
  IF v_d.id IS NULL OR NOT app.can_read_commune(v_d.commune_id) THEN
    RAISE EXCEPTION 'DEMANDE_INCONNUE' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT app.peut_emettre_document(v_d.commune_id) THEN
    RAISE EXCEPTION 'ACCES_REFUSE' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_d.decision IS DISTINCT FROM 'accordee' THEN
    RAISE EXCEPTION 'CARTE_NON_ACCORDEE: seule une carte accordée se retire.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_date < v_d.date_decision OR p_date > app.jour_tunis() THEN
    RAISE EXCEPTION 'CARTE_DATE: le retrait se date entre la décision (%) et aujourd''hui.', to_char(v_d.date_decision, 'DD/MM/YYYY')
      USING ERRCODE = 'check_violation';
  END IF;
  UPDATE demandes_carte_precollecteur
     SET retrait_le = p_date, motif_retrait = btrim(p_motif), retrait_par = app.current_user_id()
   WHERE id = v_d.id
  RETURNING * INTO v_d;
  RETURN v_d;
END
$$;
COMMENT ON FUNCTION app.retirer_carte(uuid, date, text) IS
  'Retire une carte accordée, à une date et pour un motif : elle a valu jusqu''à la veille. La carte reste au registre des documents, numéro compris. Réservé au directeur de la commune.';
GRANT EXECUTE ON FUNCTION app.retirer_carte(uuid, date, text) TO siipi_app;

-- -------------------------------------------------------------------------
-- 5. L'état des cartes à une date
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.etat_carte(d demandes_carte_precollecteur, p_statut_document text, p_date date) RETURNS text
  LANGUAGE sql IMMUTABLE AS
$$
  SELECT CASE
    WHEN d.decision IS NULL THEN 'demandee'
    WHEN d.decision = 'refusee' THEN 'refusee'
    WHEN p_statut_document = 'annule' THEN 'annulee'
    WHEN d.retrait_le IS NOT NULL AND d.retrait_le <= p_date THEN 'retiree'
    WHEN d.date_debut > p_date THEN 'a_venir'
    WHEN d.date_fin < p_date THEN 'expiree'
    ELSE 'valide'
  END
$$;
COMMENT ON FUNCTION app.etat_carte(demandes_carte_precollecteur, text, date) IS
  'L''état d''une demande de carte à une date : demandee, refusee, annulee (erreur d''émission), retiree (à partir du jour du retrait), a_venir (renouvellement qui n''a pas commencé), expiree, valide.';
GRANT EXECUTE ON FUNCTION app.etat_carte(demandes_carte_precollecteur, text, date) TO siipi_app;

-- -------------------------------------------------------------------------
-- 6. « À vérifier » : une carte qui arrive à échéance
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.incoherences_cartes_precollecteur(p_commune text)
  RETURNS TABLE (gravite text, domaine text, sujet text, sujet_id text, constat text, quoi_faire text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT 'information', 'acteurs_informels', b.id_precollecteur, d.id::text,
         format('La carte %s expire le %s.', e.numero_affiche, to_char(d.date_fin, 'DD/MM/YYYY')),
         'Si l''acteur poursuit son activité, enregistrer sa demande de renouvellement.'
    FROM demandes_carte_precollecteur d
    JOIN documents_emis e ON e.id = d.document_id
    JOIN barbechas b ON b.id = d.acteur_id
   WHERE d.commune_id = p_commune AND d.deleted_at IS NULL AND d.decision = 'accordee'
     AND d.retrait_le IS NULL AND e.statut = 'emis'
     AND d.date_fin BETWEEN app.jour_tunis() AND app.jour_tunis() + 30
     -- Un renouvellement déjà demandé ou accordé : rien à signaler.
     AND NOT EXISTS (SELECT 1 FROM demandes_carte_precollecteur r
                      WHERE r.carte_precedente_id = d.document_id AND r.deleted_at IS NULL
                        AND r.decision IS DISTINCT FROM 'refusee')
     AND app.cadre_secteur_informel_actif() AND app.can_read_commune(p_commune)
$$;
GRANT EXECUTE ON FUNCTION app.incoherences_cartes_precollecteur(text) TO siipi_app;

-- Le panneau « À vérifier » : définition reprise de la migration 088, la
-- famille des cartes en plus.
CREATE OR REPLACE FUNCTION app.incoherences_commune(p_commune text)
  RETURNS TABLE (gravite text, domaine text, sujet text, sujet_id text, constat text, quoi_faire text)
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
      UNION ALL
      SELECT * FROM app.incoherences_kpi(p_commune)
      UNION ALL
      SELECT * FROM app.incoherences_carburant(p_commune)
      UNION ALL
      SELECT * FROM app.incoherences_declassement(p_commune)
      UNION ALL
      SELECT * FROM app.incoherences_acteurs_informels(p_commune)
      UNION ALL
      SELECT * FROM app.incoherences_engins(p_commune)
      UNION ALL
      SELECT * FROM app.incoherences_volumetrie(p_commune)
      UNION ALL
      SELECT * FROM app.incoherences_cartes_precollecteur(p_commune)
    ) tout
   ORDER BY CASE gravite WHEN 'bloquant' THEN 0
                         WHEN 'avertissement' THEN 1
                         ELSE 2 END,
            domaine, sujet
$$;
GRANT EXECUTE ON FUNCTION app.incoherences_commune(text) TO siipi_app;

-- -------------------------------------------------------------------------
-- 7. Retrait logique : une demande avant décision, une pièce reçue à tort
-- -------------------------------------------------------------------------
-- Définition reprise de la migration 064, les deux tables en plus. Les gardes
-- propres à la carte (pas après la décision, directeur seulement) sont dans
-- les déclencheurs des deux tables.
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
                     'rapports_etudes', 'contacts',
                     'interventions_maintenance', 'plans_entretien',
                     'champs_points', 'etiquettes_points', 'actions_planifiees',
                     'poi', 'fuel_logs', 'fins_de_poste', 'dotations_epi',
                     'incidents_travail', 'commerces', 'conventions_commerciales',
                     'donnees_personnelles_barbechas',
                     'carnets_de_bord', 'quotas_carburant',
                     'immobilisations_engins', 'etapes_declassement', 'pieces_declassement',
                     'etudes_cout_complet', 'demarches_formalisation',
                     'demandes_carte_precollecteur', 'pieces_demande_carte') THEN
    RAISE EXCEPTION 'TABLE_NON_SUPPRIMABLE: %', p_table;
  END IF;

  EXECUTE format('SELECT commune_id FROM %I WHERE id::text = $1 AND deleted_at IS NULL', p_table)
     INTO v_commune USING p_id;

  IF v_commune IS NULL THEN
    RETURN false;
  END IF;

  -- L'identité se retire comme elle se lit : par le seul admin de la commune.
  -- Le circuit d'un dossier de déclassement et ses pièces, comme ils s'inscrivent.
  -- Une demande de carte et ses pièces, par le directeur qui les enregistre.
  IF p_table = 'donnees_personnelles_barbechas' THEN
    IF NOT app.peut_voir_identite(v_commune) THEN
      RAISE EXCEPTION 'ACCES_REFUSE' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF p_table IN ('etapes_declassement', 'pieces_declassement') THEN
    IF NOT app.peut_instruire_declassement(v_commune) THEN
      RAISE EXCEPTION 'ACCES_REFUSE' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF p_table IN ('demandes_carte_precollecteur', 'pieces_demande_carte') THEN
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
$fn$;

GRANT EXECUTE ON FUNCTION app.supprimer(text, text) TO siipi_app;
