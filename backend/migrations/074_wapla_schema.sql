-- =========================================================================
-- 074 — La couche WaPla : son schéma, ses références, son amorce (lot W2a ;
-- docs/specs_metier/SPEC_wapla_couche_planification.md § 2 et § 3).
--
-- UNE COUCHE À PART. Tout ce qui est WaPla vit dans le schéma `wapla`. Il LIT
-- SIIPI ; SIIPI ne le lit jamais : aucune fonction `app.*`, aucune vue, aucun
-- déclencheur, aucune clé étrangère de SIIPI ne nomme un objet `wapla.*`. Si
-- l'on supprimait ce schéma, pas un chiffre de SIIPI ne bougerait — la campagne
-- `wapla` le vérifie (pg_depend, et le schéma supprimé le temps d'une
-- transaction).
--
-- CE LOT : les références tunisiennes (le climat par gouvernorat, tenu par la
-- FNCT, daté, avec sa source) et l'AMORCE — ce que SIIPI peut proposer pour
-- chaque entrée de WaPla, avec sa provenance. L'amorce ne calcule pas de
-- bilan, ne stocke rien, n'écrit nulle part ; elle s'exécute avec les droits
-- de l'appelant, et les règles de lecture de SIIPI s'y appliquent telles
-- quelles. Les bilans, leur calcul et leur niveau de fiabilité viennent au
-- lot W2b.
-- =========================================================================

CREATE SCHEMA IF NOT EXISTS wapla;
COMMENT ON SCHEMA wapla IS
  'Couche WaPla (estimations de planification, méthode UNIDO WaPla) : lit SIIPI, n''est jamais lue par SIIPI. Voir docs/specs_metier/SPEC_wapla_couche_planification.md.';
GRANT USAGE ON SCHEMA wapla TO siipi_app;

-- ---------------------------------------------------------------------------
-- 1. Les références tunisiennes
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS wapla.facteurs_reference (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code          TEXT NOT NULL,
    gouvernorat   TEXT NOT NULL,
    valeur        NUMERIC NOT NULL,
    source        TEXT NOT NULL,
    date_effet    DATE NOT NULL,
    saisi_par     UUID,
    saisi_le      TIMESTAMPTZ NOT NULL DEFAULT now(),
    retire_le     TIMESTAMPTZ,
    retire_par    UUID,
    motif_retrait TEXT,
    CONSTRAINT facteurs_reference_code CHECK (code IN ('precipitations_annuelles_mm', 'temperature_moyenne_c')),
    CONSTRAINT facteurs_reference_source CHECK (btrim(source) <> ''),
    -- Les bornes de la Tunisie, larges : une faute de frappe (2500 °C, 40 000 mm) est refusée.
    CONSTRAINT facteurs_reference_bornes CHECK (
         (code = 'precipitations_annuelles_mm' AND valeur BETWEEN 0 AND 3000)
      OR (code = 'temperature_moyenne_c' AND valeur BETWEEN -10 AND 40)),
    -- Rien ne s'efface : une valeur se retire, avec son motif (règle d'or 1.4).
    CONSTRAINT facteurs_reference_retrait CHECK ((retire_le IS NULL) = (motif_retrait IS NULL)),
    CONSTRAINT facteurs_reference_motif CHECK (motif_retrait IS NULL OR btrim(motif_retrait) <> '')
);
CREATE UNIQUE INDEX IF NOT EXISTS facteurs_reference_unique
    ON wapla.facteurs_reference (code, gouvernorat, date_effet) WHERE retire_le IS NULL;
COMMENT ON TABLE wapla.facteurs_reference IS
  'Les références tunisiennes de la couche WaPla (SPEC § 3.1, provenance « reference_tunisienne ») : les normales climatiques par gouvernorat (INM), tenues par la FNCT. Ce sont des hypothèses de planification, pas des paramètres réglementaires : elles n''entrent pas dans definitions_parametres_nationaux de SIIPI.';
COMMENT ON COLUMN wapla.facteurs_reference.code IS
  'precipitations_annuelles_mm (APY de l''outil) ou temperature_moyenne_c (ATY) : la classe climatique en découle, et avec elle la part de carbone dégradable du méthane.';
COMMENT ON COLUMN wapla.facteurs_reference.date_effet IS 'La valeur vaut à partir de cette date ; un exercice lit la plus récente qui le précède.';
COMMENT ON COLUMN wapla.facteurs_reference.source IS 'D''où vient la valeur (« INM, normales 1991-2020 ») : obligatoire, un chiffre sans source ne se discute pas.';

ALTER TABLE wapla.facteurs_reference ENABLE ROW LEVEL SECURITY;
ALTER TABLE wapla.facteurs_reference FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS facteurs_reference_lecture ON wapla.facteurs_reference;
CREATE POLICY facteurs_reference_lecture ON wapla.facteurs_reference FOR SELECT USING (app.is_authenticated());
DROP POLICY IF EXISTS facteurs_reference_fnct_ajout ON wapla.facteurs_reference;
CREATE POLICY facteurs_reference_fnct_ajout ON wapla.facteurs_reference FOR INSERT WITH CHECK (app.is_fnct());
DROP POLICY IF EXISTS facteurs_reference_fnct_retrait ON wapla.facteurs_reference;
CREATE POLICY facteurs_reference_fnct_retrait ON wapla.facteurs_reference FOR UPDATE USING (app.is_fnct()) WITH CHECK (app.is_fnct());
GRANT SELECT, INSERT ON wapla.facteurs_reference TO siipi_app;
-- Une valeur ne se corrige pas : elle se retire (seules les colonnes du retrait s'écrivent), et ne s'efface jamais.
GRANT UPDATE (retire_le, retire_par, motif_retrait) ON wapla.facteurs_reference TO siipi_app;
REVOKE DELETE, TRUNCATE ON wapla.facteurs_reference FROM siipi_app;

-- ---------------------------------------------------------------------------
-- 2. L'amorce : ce que SIIPI propose pour chaque entrée de WaPla
-- ---------------------------------------------------------------------------
--
-- Une ligne par entrée (SPEC § 3.2), avec sa valeur — ou RIEN : une entrée que
-- SIIPI ne tient pas a une valeur vide et un « manque » qui dit pourquoi,
-- jamais un zéro (règle d'or 1.1). « cle » est l'identifiant de l'entrée dans
-- le moteur (backend/src/wapla/moteur.ts), sauf `dechets_collectes_t`, qui
-- n'en est pas une : c'est le tonnage pesé dont le taux de collecte se déduit.
--
-- Ce que l'amorce ne propose pas, et pourquoi :
-- - la destination des tonnages collectés : `pesees.destination` est un texte
--   libre, sans liste de codes ; la commune la saisit (lot W2b) ;
-- - le non-collecté (brûlé, au dépotoir, à l'eau) : aucune pesée possible ;
-- - la gestion de la décharge et le biogaz capté : un choix déclaré.

DROP FUNCTION IF EXISTS wapla.amorce_commune(text, integer);
CREATE FUNCTION wapla.amorce_commune(p_commune text, p_exercice integer)
  RETURNS TABLE (cle text, ordre smallint, valeur numeric, provenance text, source text, detail jsonb, manque text, ecart text)
  LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS
$fn$
#variable_conflict use_column
DECLARE
  v_debut date := make_date(p_exercice, 1, 1);
  v_fin   date := make_date(p_exercice, 12, 31);
  v_population numeric; v_source_population text;
  v_production numeric; v_source_production text;
  v_gisement numeric;
  v_collecte numeric; v_mois integer; v_pesees integer;
  v_litres numeric; v_pleins integer; v_engins integer; v_engins_avec integer;
  v_cout numeric; v_etude_id uuid; v_bureau text; v_document text;
  v_redevance numeric; v_provisoire boolean; v_sans_taux numeric;
  v_carac_id uuid; v_niveau text; v_annee_carac smallint; v_fractions jsonb;
  v_bio numeric; v_papier numeric; v_plastiques numeric;
  v_gouvernorat text; v_ref record;
BEGIN
  IF NOT app.can_read_commune(p_commune) THEN
    RETURN;
  END IF;

  -- Le gisement : population retenue × production théorique × 365 (17.1).
  SELECT COALESCE(pc.population_permanente, NULLIF(c.population, 0)),
         CASE WHEN pc.population_permanente IS NOT NULL THEN pc.population_permanente_source ELSE 'recensement (fiche de la commune)' END,
         pc.production_theorique_kg_hab_j, pc.production_theorique_source, c.gouvernorat
    INTO v_population, v_source_population, v_production, v_source_production, v_gouvernorat
    FROM communes c LEFT JOIN parametres_commune pc ON pc.commune_id = c.id
   WHERE c.id = p_commune;
  v_gisement := v_population * v_production * 365 / 1000;
  cle := 'waste_in'; ordre := 1; valeur := round(v_gisement, 3);
  provenance := CASE WHEN v_gisement IS NULL THEN NULL ELSE 'siipi_declare' END;
  source := 'parametres_commune : population retenue × production théorique × 365';
  detail := jsonb_build_object('population', v_population, 'source_population', v_source_population,
                               'production_kg_hab_j', v_production, 'source_production', v_source_production);
  manque := CASE WHEN v_population IS NULL THEN 'La population de la commune n''est pas renseignée.'
                 WHEN v_production IS NULL THEN 'La production théorique (kg par habitant et par jour) n''est pas renseignée dans les paramètres de la commune.' END;
  ecart := NULL;
  RETURN NEXT;

  -- Les déchets collectés : la somme des pesées ménagères de l'exercice.
  -- Un exercice pesé en partie le reste : la somme n'est pas extrapolée.
  SELECT sum(p.poids_net_kg) / 1000, count(DISTINCT date_trunc('month', p.date_pesee)), count(*)
    INTO v_collecte, v_mois, v_pesees
    FROM pesees p
   WHERE p.commune_id = p_commune AND p.deleted_at IS NULL AND p.type_dechet = 'menager'
     AND p.date_pesee BETWEEN v_debut AND v_fin;
  cle := 'dechets_collectes_t'; ordre := 2; valeur := round(v_collecte, 3);
  provenance := CASE WHEN v_collecte IS NULL THEN NULL ELSE 'siipi_mesure' END;
  source := format('pesees : déchets ménagers pesés en %s', p_exercice);
  detail := jsonb_build_object('mois_peses', v_mois, 'pesees', v_pesees);
  manque := CASE WHEN v_collecte IS NULL THEN format('Aucune pesée de déchets ménagers en %s.', p_exercice) END;
  ecart := CASE WHEN v_collecte IS NOT NULL AND v_mois < 12
                THEN format('%s mois pesés sur 12 : le tonnage n''est pas extrapolé.', v_mois) END;
  RETURN NEXT;

  -- Le taux de collecte : collecté / gisement. Au-delà de 1, c'est un écart
  -- à montrer (règle d'or 1.5), jamais un plafond silencieux.
  cle := 'tc_1'; ordre := 3;
  valeur := CASE WHEN v_collecte IS NOT NULL AND v_gisement > 0 THEN round(v_collecte / v_gisement, 6) END;
  provenance := CASE WHEN valeur IS NULL THEN NULL ELSE 'siipi_declare' END;
  source := 'déchets collectés (pesés) / gisement (déclaré)';
  detail := NULL;
  manque := CASE WHEN valeur IS NULL THEN 'Il faut le gisement et les pesées de l''exercice.' END;
  ecart := CASE WHEN valeur > 1
                THEN 'Le tonnage pesé dépasse le gisement : la population ou la production théorique est à revoir, ou des pesées d''une autre commune sont comptées.' END;
  RETURN NEXT;

  -- Le gasoil de collecte : les pleins des engins de la levée des déchets.
  SELECT count(*), count(*) FILTER (WHERE EXISTS (SELECT 1 FROM fuel_logs f WHERE f.vehicule_id = v.id AND f.deleted_at IS NULL
                                                    AND f.date_plein BETWEEN v_debut AND v_fin))
    INTO v_engins, v_engins_avec
    FROM vehicules v
   WHERE v.commune_id = p_commune AND v.deleted_at IS NULL AND v.domaine_emploi = 'Propreté (levée des déchets)';
  SELECT sum(f.litres), count(*) INTO v_litres, v_pleins
    FROM fuel_logs f JOIN vehicules v ON v.id = f.vehicule_id
   WHERE f.commune_id = p_commune AND f.deleted_at IS NULL AND f.date_plein BETWEEN v_debut AND v_fin
     AND v.deleted_at IS NULL AND v.domaine_emploi = 'Propreté (levée des déchets)';
  cle := 'ghg_1'; ordre := 4; valeur := round(v_litres, 3);
  provenance := CASE WHEN v_litres IS NULL THEN NULL ELSE 'siipi_mesure' END;
  source := format('fuel_logs : pleins de %s des engins « Propreté (levée des déchets) »', p_exercice);
  detail := jsonb_build_object('engins_collecte', v_engins, 'engins_avec_pleins', v_engins_avec, 'pleins', v_pleins);
  manque := CASE WHEN v_engins = 0 THEN 'Aucun engin n''est rattaché à la levée des déchets (domaine d''emploi) dans le parc.'
                 WHEN v_litres IS NULL THEN format('Le registre carburant n''a aucun plein en %s pour les engins de collecte.', p_exercice) END;
  ecart := CASE WHEN v_litres IS NOT NULL AND v_engins_avec < v_engins
                THEN format('Engins de collecte avec des pleins enregistrés : %s sur %s.', v_engins_avec, v_engins) END;
  RETURN NEXT;

  -- Le coût de collecte du statu quo : le coût complet de l'étude de
  -- l'exercice, tel qu'elle le publie (17.5). WaPla ne le recalcule pas (SPEC § 5).
  SELECT e.id, e.bureau_etudes, e.document INTO v_etude_id, v_bureau, v_document
    FROM etudes_cout_complet e
   WHERE e.commune_id = p_commune AND e.deleted_at IS NULL AND e.exercice = p_exercice
   ORDER BY e.lu_le DESC NULLS LAST, e.created_at DESC LIMIT 1;
  v_cout := NULL;
  IF v_etude_id IS NOT NULL THEN
    SELECT v.montant INTO v_cout FROM valeurs_cout_complet v
     WHERE v.etude_id = v_etude_id AND v.nature = 'total' AND v.code = 'cout_total' AND v.retenue;
  END IF;
  cle := 'cost_1'; ordre := 5; valeur := v_cout;
  provenance := CASE WHEN v_cout IS NULL THEN NULL ELSE 'siipi_declare' END;
  source := 'etudes_cout_complet : coût total publié par l''étude de l''exercice';
  detail := CASE WHEN v_etude_id IS NULL THEN NULL
                 ELSE jsonb_build_object('etude_id', v_etude_id, 'bureau_etudes', v_bureau, 'document', v_document) END;
  manque := CASE WHEN v_etude_id IS NULL THEN format('Aucune étude de coût complet pour %s.', p_exercice)
                 WHEN v_cout IS NULL THEN 'L''étude ne publie pas de coût total retenu.' END;
  ecart := NULL;
  RETURN NEXT;

  -- L'exploitation de la décharge : la redevance ANGeD de l'exercice, chaque
  -- pesée au taux de sa date (17.3). Provisoire, le résultat l'est aussi.
  SELECT sum(r.montant_tnd), bool_or(r.provisoire), sum(r.tonnes_sans_taux)
    INTO v_redevance, v_provisoire, v_sans_taux
    FROM app.redevance_anged(p_commune, p_exercice) r;
  cle := 'cost_5'; ordre := 6; valeur := round(v_redevance, 3);
  provenance := CASE WHEN v_redevance IS NULL THEN NULL ELSE 'siipi_declare' END;
  source := format('redevance ANGeD de %s, chaque pesée au taux de sa date', p_exercice);
  detail := jsonb_build_object('provisoire', COALESCE(v_provisoire, false), 'tonnes_sans_taux', v_sans_taux);
  manque := CASE WHEN v_redevance IS NULL THEN format('Aucune pesée taxable en %s, ou aucun taux de redevance en vigueur.', p_exercice) END;
  ecart := CASE WHEN v_redevance IS NOT NULL AND v_sans_taux > 0
                THEN format('%s t pesées avant tout taux de redevance ne sont pas comptées.', v_sans_taux) END;
  RETURN NEXT;

  -- La composition : la caractérisation retenue à la fin de l'exercice (lot 2a).
  SELECT r.caracterisation_id, r.niveau_source, r.annee, r.fractions INTO v_carac_id, v_niveau, v_annee_carac, v_fractions
    FROM app.caracterisation_retenue(p_commune, v_fin) r;
  SELECT max(CASE WHEN f->>'fraction' = 'organiques' THEN (f->>'pourcentage')::numeric END) / 100,
         max(CASE WHEN f->>'fraction' = 'papier_carton' THEN (f->>'pourcentage')::numeric END) / 100,
         max(CASE WHEN f->>'fraction' = 'plastiques' THEN (f->>'pourcentage')::numeric END) / 100
    INTO v_bio, v_papier, v_plastiques
    FROM jsonb_array_elements(COALESCE(v_fractions, '[]'::jsonb)) f;
  source := 'caracterisation_retenue : la composition la plus précise à la fin de l''exercice';
  detail := CASE WHEN v_carac_id IS NULL THEN NULL
                 ELSE jsonb_build_object('niveau_source', v_niveau, 'annee', v_annee_carac,
                                         'propre_a_la_commune', v_niveau <> 'moyenne_nationale_anged') END;
  ecart := CASE WHEN v_niveau = 'moyenne_nationale_anged'
                THEN 'Moyenne nationale ANGeD : aucune étude propre à la commune.' END;
  provenance := CASE WHEN v_carac_id IS NULL THEN NULL ELSE 'siipi_declare' END;
  manque := CASE WHEN v_carac_id IS NULL
                 THEN 'Aucune caractérisation des déchets, ni de la commune ni nationale.' END;
  -- La même composition vaut pour ce qui est mis en décharge, déposé au
  -- dépotoir, brûlé ou incinéré : SIIPI n'en tient pas d'autre.
  cle := 'ghg_6';  ordre := 7;  valeur := v_bio;        RETURN NEXT;
  cle := 'ghg_5';  ordre := 8;  valeur := v_papier;     RETURN NEXT;
  cle := 'ghg_15'; ordre := 9;  valeur := v_bio;        RETURN NEXT;
  cle := 'ghg_14'; ordre := 10; valeur := v_papier;     RETURN NEXT;
  cle := 'ghg_3';  ordre := 11; valeur := v_plastiques; RETURN NEXT;
  cle := 'ghg_11'; ordre := 12; valeur := v_plastiques; RETURN NEXT;
  cle := 'ghg_18'; ordre := 13; valeur := v_plastiques; RETURN NEXT;

  -- Le climat : les normales du gouvernorat, en vigueur à la fin de l'exercice.
  FOR v_ref IN
    SELECT k.code, k.cle_moteur, k.ordre_moteur, r.valeur, r.source AS source_ref, r.date_effet
      FROM (VALUES ('precipitations_annuelles_mm', 'APY', 14), ('temperature_moyenne_c', 'ATY', 15)) AS k(code, cle_moteur, ordre_moteur)
      LEFT JOIN LATERAL (
        SELECT f.valeur, f.source, f.date_effet FROM wapla.facteurs_reference f
         WHERE f.code = k.code AND f.gouvernorat = v_gouvernorat AND f.retire_le IS NULL AND f.date_effet <= v_fin
         ORDER BY f.date_effet DESC LIMIT 1) r ON true
  LOOP
    cle := v_ref.cle_moteur; ordre := v_ref.ordre_moteur; valeur := v_ref.valeur;
    provenance := CASE WHEN v_ref.valeur IS NULL THEN NULL ELSE 'reference_tunisienne' END;
    source := format('wapla.facteurs_reference : %s', COALESCE(v_ref.source_ref, 'normales du gouvernorat'));
    detail := CASE WHEN v_ref.valeur IS NULL THEN NULL
                   ELSE jsonb_build_object('gouvernorat', v_gouvernorat, 'date_effet', v_ref.date_effet) END;
    manque := CASE WHEN v_ref.valeur IS NULL
                   THEN format('La FNCT n''a pas encore saisi les normales climatiques du gouvernorat de %s.', v_gouvernorat) END;
    ecart := NULL;
    RETURN NEXT;
  END LOOP;
END;
$fn$;
COMMENT ON FUNCTION wapla.amorce_commune(text, integer) IS
  'L''amorce d''un bilan WaPla (lot W2a, SPEC § 3.2) : pour chaque entrée que SIIPI peut proposer, sa valeur et sa provenance (siipi_mesure, siipi_declare, reference_tunisienne), ou rien et ce qui manque. Lecture seule, avec les droits de l''appelant : les règles de lecture de SIIPI s''appliquent. Rien pour une commune hors du périmètre.';
GRANT EXECUTE ON FUNCTION wapla.amorce_commune(text, integer) TO siipi_app;
