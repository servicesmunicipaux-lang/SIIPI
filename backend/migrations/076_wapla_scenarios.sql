-- =========================================================================
-- 076 — Les scénarios WaPla (lot W4a ; docs/specs_metier/
-- SPEC_wapla_couche_planification.md § 5 et § 6, point 3).
--
-- UN SCÉNARIO est une copie d'un bilan CALCULÉ (le statu quo), dont la commune
-- change les hypothèses : une part envoyée au compostage, un centre de tri
-- activé, un investissement. Le calcul (moteur corrigé, dans l'API) le compare
-- au statu quo sur ce que la note de cadrage nomme : tonnes mises en décharge,
-- tonnes brûlées à l'air libre, t CO₂-éq, mg TEQ, écart de coût. Le résultat du
-- statu quo est COPIÉ dans le scénario au moment du calcul : recalculer le
-- bilan plus tard ne change pas la comparaison d'un scénario.
--
-- L'ÉCART DE COÛT (SPEC § 5) ne porte que sur ce que le scénario AJOUTE : un
-- procédé qui ne reçoit rien dans le statu quo et reçoit des déchets dans le
-- scénario (compostage, tri, incinération) — son annuité, son exploitation,
-- moins ses recettes. Un procédé déjà en service garde son coût dans celui de
-- SIIPI (coût complet, lot 17.5) : WaPla ne le recalcule pas. Les coûts d'un
-- procédé ajouté qui ne sont pas saisis rendent l'écart « non renseigné ».
--
-- UN SCÉNARIO FIGÉ ne change plus (règle d'or 1.4) : ses entrées, son
-- résultat, la version du moteur qui l'a calculé, sa comparaison. La base le
-- tient — ni l'API, ni un changement des références de la FNCT, ni un nouveau
-- calcul du bilan ne le touchent. Il ne peut qu'être retiré, logiquement.
-- =========================================================================

CREATE TABLE IF NOT EXISTS wapla.scenarios (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bilan_id       UUID NOT NULL,
    commune_id     TEXT NOT NULL,
    nom            TEXT NOT NULL,
    description    TEXT,
    statut         TEXT NOT NULL DEFAULT 'brouillon',
    version_moteur TEXT,
    resultat       JSONB,
    statu_quo      JSONB,
    comparaison    JSONB,
    calcule_le     TIMESTAMPTZ,
    calcule_par    UUID,
    fige_le        TIMESTAMPTZ,
    fige_par       UUID,
    cree_le        TIMESTAMPTZ NOT NULL DEFAULT now(),
    cree_par       UUID,
    deleted_at     TIMESTAMPTZ,
    deleted_by     UUID,
    FOREIGN KEY (bilan_id, commune_id) REFERENCES wapla.bilans (id, commune_id) ON DELETE CASCADE,
    CONSTRAINT scenarios_nom CHECK (btrim(nom) <> '' AND length(nom) <= 120),
    CONSTRAINT scenarios_statut CHECK (statut IN ('brouillon', 'calcule', 'fige')),
    -- Calculé ou figé : tout ce qui rend la comparaison relisible est là.
    CONSTRAINT scenarios_calcul_complet CHECK (
      (statut = 'brouillon') = (resultat IS NULL AND statu_quo IS NULL AND comparaison IS NULL AND version_moteur IS NULL AND calcule_le IS NULL)),
    CONSTRAINT scenarios_fige CHECK ((statut = 'fige') = (fige_le IS NOT NULL)),
    CONSTRAINT scenarios_commune_id_unique UNIQUE (id, commune_id)
);
COMMENT ON TABLE wapla.scenarios IS
  'Les scénarios d''un bilan WaPla (lot W4a) : une copie des entrées du statu quo, des hypothèses de la commune, et la comparaison au statu quo. Une estimation de planification ; aucun chiffre de SIIPI n''en dépend.';
COMMENT ON COLUMN wapla.scenarios.statu_quo IS 'Le résultat du bilan (statu quo) tel qu''il était au calcul du scénario : la comparaison ne bouge pas si le bilan est recalculé ensuite.';
COMMENT ON COLUMN wapla.scenarios.comparaison IS
  'Statu quo, scénario et écart pour les tonnes mises en décharge, les tonnes brûlées à l''air libre, les t CO₂-éq, les mg TEQ ; et l''écart de coût de ce que le scénario ajoute (SPEC § 5), ou ce qui lui manque.';
COMMENT ON COLUMN wapla.scenarios.fige_le IS 'Un scénario figé ne change plus : la base refuse toute modification (règle d''or 1.4).';

CREATE TABLE IF NOT EXISTS wapla.entrees_scenario (
    scenario_id UUID NOT NULL,
    commune_id  TEXT NOT NULL,
    cle         TEXT NOT NULL,
    valeur      JSONB NOT NULL,
    provenance  TEXT NOT NULL,
    source      TEXT,
    detail      JSONB,
    saisi_le    TIMESTAMPTZ NOT NULL DEFAULT now(),
    saisi_par   UUID,
    PRIMARY KEY (scenario_id, cle),
    FOREIGN KEY (scenario_id, commune_id) REFERENCES wapla.scenarios (id, commune_id) ON DELETE CASCADE,
    CONSTRAINT entrees_scenario_valeur CHECK (jsonb_typeof(valeur) IN ('number', 'boolean')),
    -- Ce qui vient du statu quo garde sa provenance ; ce que la commune y
    -- change est une hypothèse de scénario, et le dit.
    CONSTRAINT entrees_scenario_provenance CHECK (provenance IN ('siipi_mesure', 'siipi_declare', 'saisie_commune', 'reference_tunisienne', 'defaut_wapla', 'hypothese_scenario'))
);
COMMENT ON TABLE wapla.entrees_scenario IS
  'Les entrées d''un scénario : copiées du bilan avec leur provenance, ou changées par la commune (« hypothese_scenario »). Une entrée absente vaut la valeur par défaut de l''outil.';

-- Un scénario figé ne change plus, ni lui ni ses entrées.
CREATE OR REPLACE FUNCTION wapla._scenario_fige() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public, pg_temp AS
$fn$
BEGIN
  IF TG_TABLE_NAME = 'scenarios' THEN
    IF OLD.statut = 'fige' AND (to_jsonb(NEW) - 'deleted_at' - 'deleted_by') IS DISTINCT FROM (to_jsonb(OLD) - 'deleted_at' - 'deleted_by') THEN
      RAISE EXCEPTION 'SCENARIO_FIGE: ce scénario est figé, il ne change plus. Copiez-le dans un nouveau scénario.';
    END IF;
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM wapla.scenarios s WHERE s.id = COALESCE(NEW.scenario_id, OLD.scenario_id) AND s.statut = 'fige') THEN
    RAISE EXCEPTION 'SCENARIO_FIGE: ce scénario est figé, ses entrées ne changent plus. Copiez-le dans un nouveau scénario.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$fn$;
DROP TRIGGER IF EXISTS scenario_fige ON wapla.scenarios;
CREATE TRIGGER scenario_fige BEFORE UPDATE ON wapla.scenarios FOR EACH ROW EXECUTE FUNCTION wapla._scenario_fige();
DROP TRIGGER IF EXISTS entree_scenario_figee ON wapla.entrees_scenario;
CREATE TRIGGER entree_scenario_figee BEFORE INSERT OR UPDATE OR DELETE ON wapla.entrees_scenario FOR EACH ROW EXECUTE FUNCTION wapla._scenario_fige();

-- Toucher une hypothèse rend le calcul du scénario caduc (comme pour un bilan).
CREATE OR REPLACE FUNCTION wapla._entree_scenario_modifiee() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$fn$
BEGIN
  UPDATE wapla.scenarios
     SET statut = 'brouillon', resultat = NULL, statu_quo = NULL, comparaison = NULL, version_moteur = NULL,
         calcule_le = NULL, calcule_par = NULL
   WHERE id = NEW.scenario_id AND statut = 'calcule';
  RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION wapla._entree_scenario_modifiee() FROM PUBLIC;
DROP TRIGGER IF EXISTS entree_scenario_modifiee ON wapla.entrees_scenario;
CREATE TRIGGER entree_scenario_modifiee AFTER INSERT OR UPDATE ON wapla.entrees_scenario FOR EACH ROW EXECUTE FUNCTION wapla._entree_scenario_modifiee();

-- Qui lit, qui écrit : comme les bilans. La FNCT lit les scénarios des bilans
-- qu'elle peut lire (pas ceux d'un bilan illustratif) ; elle n'écrit rien.
ALTER TABLE wapla.scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE wapla.scenarios FORCE ROW LEVEL SECURITY;
ALTER TABLE wapla.entrees_scenario ENABLE ROW LEVEL SECURITY;
ALTER TABLE wapla.entrees_scenario FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scenarios_lecture ON wapla.scenarios;
CREATE POLICY scenarios_lecture ON wapla.scenarios FOR SELECT
  USING (deleted_at IS NULL AND EXISTS (SELECT 1 FROM wapla.bilans b WHERE b.id = bilan_id));
DROP POLICY IF EXISTS scenarios_ajout ON wapla.scenarios;
CREATE POLICY scenarios_ajout ON wapla.scenarios FOR INSERT
  WITH CHECK (app.can_write_commune(commune_id) AND NOT app.is_fnct() AND EXISTS (SELECT 1 FROM wapla.bilans b WHERE b.id = bilan_id));
DROP POLICY IF EXISTS scenarios_calcul ON wapla.scenarios;
CREATE POLICY scenarios_calcul ON wapla.scenarios FOR UPDATE
  USING (deleted_at IS NULL AND app.can_write_commune(commune_id) AND NOT app.is_fnct())
  WITH CHECK (deleted_at IS NULL AND app.can_write_commune(commune_id) AND NOT app.is_fnct());
GRANT SELECT, INSERT ON wapla.scenarios TO siipi_app;
GRANT UPDATE (statut, version_moteur, resultat, statu_quo, comparaison, calcule_le, calcule_par, fige_le, fige_par) ON wapla.scenarios TO siipi_app;
REVOKE DELETE, TRUNCATE ON wapla.scenarios FROM siipi_app;

DROP POLICY IF EXISTS entrees_scenario_lecture ON wapla.entrees_scenario;
CREATE POLICY entrees_scenario_lecture ON wapla.entrees_scenario FOR SELECT
  USING (EXISTS (SELECT 1 FROM wapla.scenarios s WHERE s.id = scenario_id));
DROP POLICY IF EXISTS entrees_scenario_ajout ON wapla.entrees_scenario;
CREATE POLICY entrees_scenario_ajout ON wapla.entrees_scenario FOR INSERT
  WITH CHECK (app.can_write_commune(commune_id) AND NOT app.is_fnct() AND EXISTS (SELECT 1 FROM wapla.scenarios s WHERE s.id = scenario_id));
DROP POLICY IF EXISTS entrees_scenario_saisie ON wapla.entrees_scenario;
CREATE POLICY entrees_scenario_saisie ON wapla.entrees_scenario FOR UPDATE
  USING (app.can_write_commune(commune_id) AND NOT app.is_fnct())
  WITH CHECK (app.can_write_commune(commune_id) AND NOT app.is_fnct());
GRANT SELECT, INSERT ON wapla.entrees_scenario TO siipi_app;
GRANT UPDATE (valeur, provenance, source, detail, saisi_le, saisi_par) ON wapla.entrees_scenario TO siipi_app;
REVOKE DELETE, TRUNCATE ON wapla.entrees_scenario FROM siipi_app;

-- Le retrait d'un scénario (figé ou non) est logique, par une fonction : la
-- règle de lecture cache les scénarios retirés.
CREATE OR REPLACE FUNCTION wapla.retirer_scenario(p_scenario uuid) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$fn$
DECLARE
  v_commune text;
BEGIN
  SELECT commune_id INTO v_commune FROM wapla.scenarios WHERE id = p_scenario AND deleted_at IS NULL;
  IF v_commune IS NULL OR NOT app.can_write_commune(v_commune) OR app.is_fnct() THEN
    RETURN false;
  END IF;
  UPDATE wapla.scenarios SET deleted_at = now(), deleted_by = app.current_user_id() WHERE id = p_scenario;
  RETURN true;
END;
$fn$;
REVOKE ALL ON FUNCTION wapla.retirer_scenario(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wapla.retirer_scenario(uuid) TO siipi_app;
COMMENT ON FUNCTION wapla.retirer_scenario(uuid) IS
  'Retire un scénario (suppression logique) : la commune seule ; un scénario figé se retire aussi, il ne se modifie pas.';
