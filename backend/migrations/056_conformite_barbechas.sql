-- =========================================================================
-- 056 — Conformité du registre des pré-collecteurs (barbechas), lot 16.1.
-- docs/specs_metier/SPEC_v0.16.md, réserves R1 à R3.
--
-- La table `barbechas` (migration 008, héritée du prototype) portait le CIN,
-- le nom, un statut d'assurance maladie, un revenu individuel et un lien vers
-- un compte. Aucune de ces colonnes n'avait de finalité dans un outil de
-- propreté, et deux d'entre elles (le CIN, la santé) sont précisément ce que
-- CLAUDE.md § 2 interdit de stocker.
--
--   1. `barbechas` ne garde que le pseudonyme (`id_precollecteur`), la zone,
--      la commune, le véhicule et le cumul pesé. CIN, assurance maladie,
--      revenu individuel et lien de compte sont supprimés ; le nom sort de la
--      table. C'est de la PSEUDONYMISATION, pas de l'anonymisation : tant que
--      la table d'identité relie le pseudonyme à une personne, la donnée reste
--      personnelle (R1).
--   2. `donnees_personnelles_barbechas` : le nom, et l'EMPREINTE du CIN
--      (HMAC-SHA256 calculé dans l'API avec une clé hors de la base ; le CIN
--      en clair n'est jamais écrit). Lue par le seul admin de la commune —
--      pas par la FNCT, qui n'a pas de finalité à connaître l'identité d'un
--      pré-collecteur. La base REFUSE toute écriture tant que l'hébergement
--      n'est pas déclaré accrédité par la FNCT, et pour une commune sans
--      récépissé de déclaration INPDP (R3).
--   3. Le revenu ne se lit plus qu'agrégé par zone et par mois, recalculé
--      depuis les livraisons, et masqué sous cinq pré-collecteurs (décision
--      de Nacer Boukhris du 02/10/2026).
--   4. Le journal d'audit gardait le nom et le CIN dans sa copie des lignes :
--      ils en sont retirés aussi.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Les paramètres qui conditionnent l'identité
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS parametres_nationaux (
    cle         TEXT PRIMARY KEY,
    valeur      TEXT NOT NULL,
    reference   TEXT,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by  UUID REFERENCES users(id) ON DELETE SET NULL
);
COMMENT ON TABLE parametres_nationaux IS
  'Paramètres nationaux fixés par la FNCT (lecture : tout utilisateur authentifié ; écriture : FNCT). Une valeur qui conditionne la loi se date et se référence.';
COMMENT ON COLUMN parametres_nationaux.reference IS
  'La pièce qui fonde la valeur (arrêté, convention d''hébergement…). Obligatoire pour accréditer l''hébergement des identités.';

INSERT INTO parametres_nationaux (cle, valeur)
VALUES ('hebergement_pii_accredite', 'false')
ON CONFLICT (cle) DO NOTHING;

ALTER TABLE parametres_nationaux ENABLE ROW LEVEL SECURITY;
ALTER TABLE parametres_nationaux FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS parametres_nationaux_select ON parametres_nationaux;
CREATE POLICY parametres_nationaux_select ON parametres_nationaux FOR SELECT USING (app.is_authenticated());
DROP POLICY IF EXISTS parametres_nationaux_update ON parametres_nationaux;
CREATE POLICY parametres_nationaux_update ON parametres_nationaux FOR UPDATE
  USING (app.is_fnct()) WITH CHECK (app.is_fnct());
GRANT SELECT, UPDATE ON parametres_nationaux TO siipi_app;

ALTER TABLE parametres_nationaux DROP CONSTRAINT IF EXISTS parametres_nationaux_hebergement_reference;
ALTER TABLE parametres_nationaux ADD CONSTRAINT parametres_nationaux_hebergement_reference
  CHECK (cle <> 'hebergement_pii_accredite' OR valeur = 'false' OR (valeur = 'true' AND length(btrim(COALESCE(reference, ''))) > 0));
ALTER TABLE parametres_nationaux DROP CONSTRAINT IF EXISTS parametres_nationaux_hebergement_booleen;
ALTER TABLE parametres_nationaux ADD CONSTRAINT parametres_nationaux_hebergement_booleen
  CHECK (cle <> 'hebergement_pii_accredite' OR valeur IN ('true', 'false'));

ALTER TABLE parametres_commune ADD COLUMN IF NOT EXISTS recepisse_inpdp TEXT;
ALTER TABLE parametres_commune ADD COLUMN IF NOT EXISTS recepisse_inpdp_date DATE;
ALTER TABLE parametres_commune DROP CONSTRAINT IF EXISTS parametres_recepisse_complet;
ALTER TABLE parametres_commune ADD CONSTRAINT parametres_recepisse_complet
  CHECK ((recepisse_inpdp IS NULL AND recepisse_inpdp_date IS NULL)
      OR (length(btrim(recepisse_inpdp)) > 0 AND recepisse_inpdp_date IS NOT NULL));
COMMENT ON COLUMN parametres_commune.recepisse_inpdp IS
  'Numéro du récépissé de déclaration du traitement auprès de l''INPDP (loi organique n° 2004-63). Sans lui, la commune ne peut enregistrer aucune identité de pré-collecteur.';

-- -------------------------------------------------------------------------
-- 2. La table d'identité
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS donnees_personnelles_barbechas (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbecha_id   UUID NOT NULL REFERENCES barbechas(id) ON DELETE CASCADE,
    commune_id    TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    nom_complet   TEXT NOT NULL CHECK (length(btrim(nom_complet)) > 0),
    empreinte_cin TEXT CHECK (empreinte_cin IS NULL OR empreinte_cin ~ '^[0-9a-f]{64}$'),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at    TIMESTAMPTZ,
    deleted_by    UUID REFERENCES users(id) ON DELETE SET NULL
);
COMMENT ON TABLE donnees_personnelles_barbechas IS
  'Identité des pré-collecteurs, séparée du registre pseudonyme (lot 16.1, R1-R3). Lue par le seul admin de la commune (pas la FNCT), chaque lecture journalisée par l''API. Écriture refusée sans hébergement accrédité ni récépissé INPDP. Hors du journal d''audit des écritures, qui en recopierait le contenu.';
COMMENT ON COLUMN donnees_personnelles_barbechas.empreinte_cin IS
  'HMAC-SHA256 du CIN normalisé, sous une clé de commune dérivée d''un secret hors de la base (variable SIIPI_SECRET_IDENTITES). Sert au seul dédoublonnage. Le CIN en clair n''est jamais écrit ni journalisé. Une rotation du secret arrête le dédoublonnage aux inscriptions faites sous l''ancienne clé.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_identite_barbecha
  ON donnees_personnelles_barbechas (barbecha_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_identite_empreinte_cin
  ON donnees_personnelles_barbechas (commune_id, empreinte_cin) WHERE deleted_at IS NULL AND empreinte_cin IS NOT NULL;

-- Les garde-fous de R3, en base : un écran qui oublierait la règle ne
-- l'ouvrirait pas pour autant.
CREATE OR REPLACE FUNCTION app.controler_identite_barbecha()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
  -- Retirer une identité reste toujours possible, accréditation révoquée ou
  -- non : le garde-fou empêche d'ÉCRIRE une identité, jamais de l'effacer.
  IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF COALESCE((SELECT valeur FROM parametres_nationaux WHERE cle = 'hebergement_pii_accredite'), 'false') <> 'true' THEN
    RAISE EXCEPTION 'IDENTITE_HEBERGEMENT: les identités ne s''enregistrent pas tant que la FNCT n''a pas déclaré l''hébergement accrédité.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM parametres_commune
                  WHERE commune_id = NEW.commune_id AND recepisse_inpdp IS NOT NULL) THEN
    RAISE EXCEPTION 'IDENTITE_RECEPISSE: la commune % n''a pas enregistré son récépissé de déclaration INPDP.', NEW.commune_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM barbechas WHERE id = NEW.barbecha_id AND commune_id = NEW.commune_id) THEN
    RAISE EXCEPTION 'IDENTITE_COMMUNE: le pré-collecteur n''appartient pas à la commune %.', NEW.commune_id
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_controler_identite_barbecha ON donnees_personnelles_barbechas;
CREATE TRIGGER trg_controler_identite_barbecha
  BEFORE INSERT OR UPDATE ON donnees_personnelles_barbechas
  FOR EACH ROW EXECUTE FUNCTION app.controler_identite_barbecha();

-- Le seul admin de la commune : ni la FNCT, ni un prestataire, ni un citoyen.
CREATE OR REPLACE FUNCTION app.peut_voir_identite(p_commune text) RETURNS boolean
  LANGUAGE sql STABLE AS
$$ SELECT app.current_role_name() = 'admin_commune' AND p_commune = ANY (app.mes_communes()) $$;

ALTER TABLE donnees_personnelles_barbechas ENABLE ROW LEVEL SECURITY;
ALTER TABLE donnees_personnelles_barbechas FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS identite_select ON donnees_personnelles_barbechas;
CREATE POLICY identite_select ON donnees_personnelles_barbechas FOR SELECT
  USING (deleted_at IS NULL AND app.peut_voir_identite(commune_id));
DROP POLICY IF EXISTS identite_insert ON donnees_personnelles_barbechas;
CREATE POLICY identite_insert ON donnees_personnelles_barbechas FOR INSERT
  WITH CHECK (app.peut_voir_identite(commune_id));
DROP POLICY IF EXISTS identite_update ON donnees_personnelles_barbechas;
CREATE POLICY identite_update ON donnees_personnelles_barbechas FOR UPDATE
  USING (deleted_at IS NULL AND app.peut_voir_identite(commune_id))
  WITH CHECK (app.peut_voir_identite(commune_id));
GRANT SELECT, INSERT, UPDATE ON donnees_personnelles_barbechas TO siipi_app;

-- Le journal des consultations sait désormais dire aussi quels
-- pré-collecteurs ont été exposés.
ALTER TABLE access_log ADD COLUMN IF NOT EXISTS precollecteur_ids UUID[] NOT NULL DEFAULT ARRAY[]::uuid[];
COMMENT ON COLUMN access_log.precollecteur_ids IS
  'Pré-collecteurs (barbechas) dont l''identité a été exposée par la requête (lot 16.1).';

CREATE OR REPLACE FUNCTION app.enregistrer_acces_identites(p_endpoint text, p_barbechas uuid[], p_commune text)
  RETURNS void
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  INSERT INTO access_log (user_id, user_role, commune_id, endpoint, records_count, communes_concernees, precollecteur_ids)
  VALUES (app.current_user_id(), app.current_role_name(), app.current_commune(), p_endpoint,
          cardinality(p_barbechas), ARRAY[p_commune], p_barbechas);
$$;
GRANT EXECUTE ON FUNCTION app.enregistrer_acces_identites(text, uuid[], text) TO siipi_app;

-- -------------------------------------------------------------------------
-- 3. Le registre pseudonyme
-- -------------------------------------------------------------------------
-- Les politiques de 015 lisent `user_id` : elles se refont d'abord, sans lui.
DROP POLICY IF EXISTS barbechas_select ON barbechas;
CREATE POLICY barbechas_select ON barbechas FOR SELECT
  USING (deleted_at IS NULL AND app.can_read_commune(commune_id));

DO $$
DECLARE
  v_noms integer := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'barbechas' AND column_name = 'name') THEN
    EXECUTE 'SELECT count(*) FROM barbechas WHERE name IS NOT NULL' INTO v_noms;
    -- Les noms ne sont PAS recopiés dans la table d'identité : elle refuse
    -- toute écriture tant que l'hébergement n'est pas accrédité, et ce refus
    -- vaut aussi pour la migration. Ceux qui existaient venaient du jeu de
    -- démonstration (seed.ts) ; un vrai nom se ressaisira par l'écran, le jour
    -- où la loi le permettra.
    RAISE NOTICE '[056] % nom(s) de pré-collecteur retiré(s) du registre pseudonyme.', v_noms;
  END IF;
END
$$;

ALTER TABLE barbechas DROP COLUMN IF EXISTS cin;
ALTER TABLE barbechas DROP COLUMN IF EXISTS health_insurance_status;
ALTER TABLE barbechas DROP COLUMN IF EXISTS earnings_this_month_tnd;
ALTER TABLE barbechas DROP COLUMN IF EXISTS user_id;
ALTER TABLE barbechas DROP COLUMN IF EXISTS name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'barbechas' AND column_name = 'code_id') THEN
    ALTER TABLE barbechas RENAME COLUMN code_id TO id_precollecteur;
  END IF;
END
$$;

COMMENT ON TABLE barbechas IS
  'Registre PSEUDONYME des pré-collecteurs (lot 16.1). Aucune donnée d''identité : elle vit dans donnees_personnelles_barbechas, lue par le seul admin de la commune.';
COMMENT ON COLUMN barbechas.id_precollecteur IS
  'Identifiant communal pseudonyme (BARB-<COMMUNE>-<ANNÉE>-NNNN). Le seul que voient les pesées, les bilans et les exports.';

-- Le déclencheur des livraisons ne cumule plus que le poids.
CREATE OR REPLACE FUNCTION barbecha_deliveries_apply() RETURNS TRIGGER AS $$
BEGIN
    UPDATE barbechas
       SET collected_total_kg = collected_total_kg + NEW.weight_kg
     WHERE id = NEW.barbecha_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -------------------------------------------------------------------------
-- 4. Le revenu, agrégé et seuillé
-- -------------------------------------------------------------------------
-- Par zone et par mois, depuis les livraisons. Sous cinq pré-collecteurs
-- distincts, le montant et le poids sont masqués (NULL) : dans une zone de
-- deux personnes, une moyenne est un revenu individuel. Le nombre de
-- participants, lui, reste affiché — il dit pourquoi le reste est masqué.
CREATE OR REPLACE FUNCTION app.revenus_precollecteurs(p_commune text, p_mois date)
  RETURNS TABLE (zone text, participants integer, livraisons integer, poids_kg numeric, montant_tnd numeric, masque boolean)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  WITH lignes AS (
    SELECT COALESCE(b.zone, '—') AS zone, b.id AS barbecha, d.weight_kg, d.amount_tnd
      FROM barbecha_deliveries d
      JOIN barbechas b ON b.id = d.barbecha_id AND b.deleted_at IS NULL
     WHERE d.deleted_at IS NULL
       AND b.commune_id = p_commune
       AND d.delivered_at >= date_trunc('month', p_mois)
       AND d.delivered_at <  date_trunc('month', p_mois) + interval '1 month'
  )
  SELECT l.zone,
         count(DISTINCT l.barbecha)::int,
         count(*)::int,
         CASE WHEN count(DISTINCT l.barbecha) >= 5 THEN sum(l.weight_kg) END,
         CASE WHEN count(DISTINCT l.barbecha) >= 5 THEN sum(l.amount_tnd) END,
         count(DISTINCT l.barbecha) < 5
    FROM lignes l
   WHERE app.can_read_commune(p_commune)
   GROUP BY l.zone
   ORDER BY l.zone
$$;
COMMENT ON FUNCTION app.revenus_precollecteurs(text, date) IS
  'Revenu des pré-collecteurs par zone et par mois, recalculé depuis les livraisons ; montant et poids masqués sous cinq participants distincts (décision du 02/10/2026). Remplace le revenu individuel supprimé.';
GRANT EXECUTE ON FUNCTION app.revenus_precollecteurs(text, date) TO siipi_app;

-- -------------------------------------------------------------------------
-- 5. Le journal d'audit ne garde plus l'identité
-- -------------------------------------------------------------------------
UPDATE audit_log
   SET old_data = old_data - ARRAY['cin', 'name', 'health_insurance_status', 'earnings_this_month_tnd', 'user_id'],
       new_data = new_data - ARRAY['cin', 'name', 'health_insurance_status', 'earnings_this_month_tnd', 'user_id'],
       changed_fields = ARRAY(SELECT f FROM unnest(changed_fields) f
                               WHERE f NOT IN ('cin', 'name', 'health_insurance_status', 'earnings_this_month_tnd', 'user_id'))
 WHERE table_name = 'barbechas'
   AND (old_data ?| ARRAY['cin', 'name', 'health_insurance_status', 'earnings_this_month_tnd', 'user_id']
     OR new_data ?| ARRAY['cin', 'name', 'health_insurance_status', 'earnings_this_month_tnd', 'user_id']);

-- -------------------------------------------------------------------------
-- 6. Retrait logique : l'identité aussi
-- -------------------------------------------------------------------------
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
                     'donnees_personnelles_barbechas') THEN
    RAISE EXCEPTION 'TABLE_NON_SUPPRIMABLE: %', p_table;
  END IF;

  EXECUTE format('SELECT commune_id FROM %I WHERE id::text = $1 AND deleted_at IS NULL', p_table)
     INTO v_commune USING p_id;

  IF v_commune IS NULL THEN
    RETURN false;
  END IF;

  -- L'identité se retire comme elle se lit : par le seul admin de la commune.
  IF p_table = 'donnees_personnelles_barbechas' THEN
    IF NOT app.peut_voir_identite(v_commune) THEN
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
