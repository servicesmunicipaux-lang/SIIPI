-- =========================================================================
-- 062 — Le rejeu du coût complet d'un bureau d'études (lot 17.5).
-- FEUILLE_DE_ROUTE § jalon 12, méthode du skill pcgd-cout-complet-methodologie.
--
-- Un PCGD publie un coût complet (M'hamdia 2025 : 1 914 830 DT, « 155 DT/t »).
-- SIIPI ne le recopie pas comme une vérité : il range les chiffres DÉCLARÉS
-- par le bureau d'études, rejoue la méthode
--
--     Z = (A + B) + (C + D)
--     A  charges directes réelles      B  dotation aux amortissements
--     C  quote-part du parc municipal  D  quote-part de l'administration
--
-- et montre où les chiffres publiés ne se recoupent pas : le dénominateur de
-- chaque ratio, les totaux qui diffèrent d'un tableau à l'autre, les postes
-- absents. Il NE TRANCHE PAS : un écart se demande au bureau d'études.
--
--   1. `etudes_cout_complet` : une étude, pour une commune et un exercice ;
--      provenance imposée « declare_bureau_etudes ».
--   2. `valeurs_cout_complet` : ce que l'étude déclare — postes, totaux,
--      ratios publiés (avec leur numérateur quand le rapport le donne),
--      ventilation par flux. Un poste dont le montant est NULL est un poste
--      que le rapport ne donne pas : « non renseigné », jamais 0. Deux
--      versions d'un même chiffre (un tableau dit 521 444, un autre 524 444)
--      se rangent toutes les deux ; une seule est « retenue » pour le calcul,
--      l'autre reste visible.
--   3. `constats_lecture_cout_complet` : ce que la lecture a relevé et que
--      SIIPI ne sait pas recalculer (un millésime « 2017 » dans le titre d'un
--      tableau de 2025).
--
-- Le calcul vit dans l'API (services/coutComplet.ts), sur ces lignes : il ne
-- stocke aucun résultat, qui serait une seconde vérité.
--
-- AUCUNE DONNÉE NOMINATIVE : des agrégats par poste et par service. Le jeu
-- réel de M'hamdia reste hors du dépôt public (accord de la commune et du
-- bureau d'études non vérifié) ; il se charge localement.
-- =========================================================================

CREATE TABLE IF NOT EXISTS etudes_cout_complet (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id         TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    exercice           INTEGER NOT NULL,
    document           TEXT NOT NULL,
    bureau_etudes      TEXT,
    lu_le              DATE,
    tonnage_pese_t     NUMERIC(12, 2),
    tonnage_source     TEXT,
    population         INTEGER,
    population_source  TEXT,
    menages            INTEGER,
    provenance         TEXT NOT NULL DEFAULT 'declare_bureau_etudes',
    importe_par        UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at         TIMESTAMPTZ,
    deleted_by         UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT etudes_exercice_plausible CHECK (exercice BETWEEN 2000 AND 2100),
    CONSTRAINT etudes_document_renseigne CHECK (length(btrim(document)) > 0),
    -- Un chiffre recopié d'un rapport n'est ni une pesée, ni une saisie de la
    -- commune : il le dit, et ne peut pas dire autre chose.
    CONSTRAINT etudes_provenance_declaree CHECK (provenance = 'declare_bureau_etudes'),
    CONSTRAINT etudes_tonnage_positif CHECK (tonnage_pese_t IS NULL OR tonnage_pese_t > 0),
    CONSTRAINT etudes_population_positive CHECK (population IS NULL OR population > 0),
    CONSTRAINT etudes_menages_positifs CHECK (menages IS NULL OR menages > 0)
);
COMMENT ON TABLE etudes_cout_complet IS
  'Une étude de coût complet (PCGD, diagnostic d''un bureau d''études) pour une commune et un exercice. Ses chiffres sont DÉCLARÉS par le bureau d''études ; SIIPI les rejoue (Z = (A+B)+(C+D)) et montre les écarts, sans les trancher. Jamais une source de vérité permanente : l''administrateur peut retirer l''étude et la recharger.';
COMMENT ON COLUMN etudes_cout_complet.tonnage_pese_t IS
  'Tonnage PESÉ de l''exercice tel que l''étude le cite (bases de pesée). Sert à retrouver le dénominateur implicite de chaque coût à la tonne.';
COMMENT ON COLUMN etudes_cout_complet.provenance IS
  'Toujours declare_bureau_etudes : les chiffres viennent du rapport, non recalculés ni mesurés par SIIPI.';
CREATE UNIQUE INDEX IF NOT EXISTS uq_etude_cout_complet
  ON etudes_cout_complet (commune_id, exercice, document) WHERE deleted_at IS NULL;

-- -------------------------------------------------------------------------
-- La nomenclature : ce que chaque code veut dire, et dans quel bloc il compte
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.bloc_poste_cout(p_code text) RETURNS text
  LANGUAGE sql IMMUTABLE AS
$$
  SELECT CASE
    WHEN p_code IN ('personnel', 'charges_patronales', 'engins', 'transfert_decharge', 'redevance_anged',
                    'sous_traitance', 'interets_dette', 'assurance', 'habillement', 'taxes_circulation',
                    'autres_directes') THEN 'A'
    WHEN p_code = 'amortissement' THEN 'B'
    WHEN p_code = 'qp_parc' THEN 'C'
    WHEN p_code IN ('qp_siege', 'qp_direction', 'qp_administration') THEN 'D'
  END
$$;
COMMENT ON FUNCTION app.bloc_poste_cout(text) IS
  'Bloc de la formule du coût complet : A charges directes réelles, B amortissements, C quote-part du parc, D quote-part de l''administration (siège, direction du service). NULL : code inconnu.';
GRANT EXECUTE ON FUNCTION app.bloc_poste_cout(text) TO siipi_app;

CREATE TABLE IF NOT EXISTS valeurs_cout_complet (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    etude_id    UUID NOT NULL REFERENCES etudes_cout_complet(id) ON DELETE CASCADE,
    commune_id  TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    nature      TEXT NOT NULL,
    code        TEXT NOT NULL,
    montant     NUMERIC(14, 3),
    numerateur  NUMERIC(14, 3),
    pas_arrondi NUMERIC(10, 4),
    retenue     BOOLEAN NOT NULL DEFAULT true,
    reference   TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT valeurs_cout_nature CHECK (nature IN ('poste', 'total', 'ratio', 'flux')),
    CONSTRAINT valeurs_cout_code CHECK (
      (nature = 'poste' AND app.bloc_poste_cout(code) IS NOT NULL)
      OR (nature = 'total' AND code IN ('sous_total_hors_amortissement', 'total_direct', 'total_indirect', 'cout_total'))
      OR (nature = 'ratio' AND code IN (
            'cout_par_tonne', 'cout_direct_par_tonne', 'cout_indirect_par_tonne', 'personnel_par_tonne',
            'engins_par_tonne', 'transfert_par_tonne', 'amortissement_par_tonne', 'maintenance_par_tonne',
            'gasoil_par_tonne', 'cout_par_jour', 'cout_direct_par_jour', 'cout_indirect_par_jour',
            'cout_par_habitant', 'cout_par_menage', 'cout_par_habitat'))
      OR (nature = 'flux' AND code IN ('dma', 'demolition', 'balayage', 'campagnes_proprete'))),
    CONSTRAINT valeurs_cout_montant_positif CHECK (montant IS NULL OR montant >= 0),
    -- Seul un poste peut être déclaré absent (montant NULL) : un total, un
    -- ratio ou un flux absents ne se rangent pas, ils ne sont pas là.
    CONSTRAINT valeurs_cout_absence_poste CHECK (montant IS NOT NULL OR nature = 'poste'),
    CONSTRAINT valeurs_cout_ratio_positif CHECK (nature <> 'ratio' OR montant > 0),
    -- Le numérateur d'un ratio, quand le rapport le donne à part (« maintenance
    -- 257 990 DT, soit 11,7 DT/t »). Il n'a de sens que pour un ratio.
    CONSTRAINT valeurs_cout_numerateur CHECK (numerateur IS NULL OR (nature = 'ratio' AND numerateur > 0)),
    -- Un ratio publié est arrondi : « 155 » couvre 154,5 à 155,5. Sans son pas
    -- d'arrondi, on ne saurait pas si un écart vient de l'arrondi ou du
    -- dénominateur.
    CONSTRAINT valeurs_cout_pas_arrondi CHECK (
      (nature = 'ratio') = (pas_arrondi IS NOT NULL) AND (pas_arrondi IS NULL OR pas_arrondi > 0))
);
COMMENT ON TABLE valeurs_cout_complet IS
  'Ce qu''une étude de coût complet déclare : postes (blocs A à D), totaux, ratios publiés, ventilation par flux. Montant NULL d''un poste : le rapport ne le donne pas (non renseigné, jamais 0). Plusieurs lignes pour un même code : plusieurs versions publiées du même chiffre ; une seule est retenue pour le calcul, les autres restent visibles. Ne se modifie pas : on recharge l''étude.';
COMMENT ON COLUMN valeurs_cout_complet.retenue IS
  'La version qui entre dans le calcul quand le rapport en publie plusieurs. Une seule par code ; les autres sont des écarts à montrer.';
COMMENT ON COLUMN valeurs_cout_complet.reference IS
  'Où le chiffre se lit dans le rapport : tableau, figure, page.';
COMMENT ON COLUMN valeurs_cout_complet.pas_arrondi IS
  'Pour un ratio : le pas auquel le rapport l''a arrondi (1 pour « 155 », 0,1 pour « 11,7 »). Le dénominateur implicite est alors un intervalle, et un écart n''est constaté que hors de cet intervalle — jamais par une tolérance arbitraire.';
COMMENT ON COLUMN valeurs_cout_complet.numerateur IS
  'Pour un ratio dont le numérateur n''est ni un poste ni un total de l''étude (maintenance, gasoil) : le montant que le rapport divise. Permet de retrouver le dénominateur implicite.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_valeur_cout_retenue
  ON valeurs_cout_complet (etude_id, nature, code) WHERE retenue;
CREATE INDEX IF NOT EXISTS idx_valeurs_cout_etude ON valeurs_cout_complet (etude_id);

CREATE TABLE IF NOT EXISTS constats_lecture_cout_complet (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    etude_id    UUID NOT NULL REFERENCES etudes_cout_complet(id) ON DELETE CASCADE,
    commune_id  TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    code        TEXT NOT NULL,
    sujet       TEXT NOT NULL,
    constat     TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT constats_cout_code CHECK (code ~ '^E[0-9]{1,2}$'),
    CONSTRAINT constats_cout_texte CHECK (length(btrim(sujet)) > 0 AND length(btrim(constat)) > 0)
);
COMMENT ON TABLE constats_lecture_cout_complet IS
  'Ce que la lecture du rapport a relevé et que SIIPI ne sait pas recalculer (un millésime erroné dans un titre, un détail introuvable). Recopié tel quel, avec son code d''écart.';

-- La commune d'une valeur ou d'un constat est celle de son étude : sans ce
-- contrôle, la RLS lirait une commune déclarée par l'appelant.
CREATE OR REPLACE FUNCTION app.controler_ligne_etude_cout() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'ETUDE_FIGEE: une étude se recharge, elle ne se corrige pas ligne à ligne.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT commune_id INTO NEW.commune_id FROM etudes_cout_complet WHERE id = NEW.etude_id AND deleted_at IS NULL;
  IF NEW.commune_id IS NULL THEN
    RAISE EXCEPTION 'ETUDE_INCONNUE: %', NEW.etude_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_controler_valeur_cout ON valeurs_cout_complet;
CREATE TRIGGER trg_controler_valeur_cout BEFORE INSERT OR UPDATE ON valeurs_cout_complet
  FOR EACH ROW EXECUTE FUNCTION app.controler_ligne_etude_cout();
DROP TRIGGER IF EXISTS trg_controler_constat_cout ON constats_lecture_cout_complet;
CREATE TRIGGER trg_controler_constat_cout BEFORE INSERT OR UPDATE ON constats_lecture_cout_complet
  FOR EACH ROW EXECUTE FUNCTION app.controler_ligne_etude_cout();

-- -------------------------------------------------------------------------
-- Cloisonnement : des coûts, donc la commune et la FNCT (comme le carnet
-- d'entretien, migration 046). Lecture et chargement ; ni modification, ni
-- effacement par l'application — une étude se retire (app.supprimer).
-- -------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['etudes_cout_complet', 'valeurs_cout_complet', 'constats_lecture_cout_complet'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'trg_audit_' || t, t);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement()', 'trg_audit_' || t, t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (app.can_write_commune(commune_id))', t || '_insert', t);
    EXECUTE format('GRANT SELECT, INSERT ON %I TO siipi_app', t);
    EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON %I FROM siipi_app', t);
  END LOOP;
END
$$;
CREATE POLICY etudes_cout_complet_select ON etudes_cout_complet FOR SELECT
  USING (deleted_at IS NULL AND app.can_write_commune(commune_id));
-- Une valeur ou un constat d'une étude retirée ne se lit plus.
CREATE POLICY valeurs_cout_complet_select ON valeurs_cout_complet FOR SELECT
  USING (app.can_write_commune(commune_id)
         AND EXISTS (SELECT 1 FROM etudes_cout_complet e WHERE e.id = etude_id AND e.deleted_at IS NULL));
CREATE POLICY constats_lecture_cout_complet_select ON constats_lecture_cout_complet FOR SELECT
  USING (app.can_write_commune(commune_id)
         AND EXISTS (SELECT 1 FROM etudes_cout_complet e WHERE e.id = etude_id AND e.deleted_at IS NULL));
DROP POLICY IF EXISTS etudes_cout_complet_update ON etudes_cout_complet;
CREATE POLICY etudes_cout_complet_update ON etudes_cout_complet FOR UPDATE
  USING (deleted_at IS NULL AND app.can_write_commune(commune_id)) WITH CHECK (app.can_write_commune(commune_id));

-- -------------------------------------------------------------------------
-- Retrait logique : une étude retirée disparaît des écrans, ses lignes restent.
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
                     'donnees_personnelles_barbechas',
                     'carnets_de_bord', 'quotas_carburant',
                     'immobilisations_engins', 'etapes_declassement', 'pieces_declassement',
                     'etudes_cout_complet') THEN
    RAISE EXCEPTION 'TABLE_NON_SUPPRIMABLE: %', p_table;
  END IF;

  EXECUTE format('SELECT commune_id FROM %I WHERE id::text = $1 AND deleted_at IS NULL', p_table)
     INTO v_commune USING p_id;

  IF v_commune IS NULL THEN
    RETURN false;
  END IF;

  -- L'identité se retire comme elle se lit : par le seul admin de la commune.
  -- Le circuit d'un dossier de déclassement et ses pièces, comme ils s'inscrivent.
  IF p_table = 'donnees_personnelles_barbechas' THEN
    IF NOT app.peut_voir_identite(v_commune) THEN
      RAISE EXCEPTION 'ACCES_REFUSE' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF p_table IN ('etapes_declassement', 'pieces_declassement') THEN
    IF NOT app.peut_instruire_declassement(v_commune) THEN
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
