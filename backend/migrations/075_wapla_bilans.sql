-- =========================================================================
-- 075 — Les bilans WaPla : les entrées, le calcul, le niveau de fiabilité
-- (lot W2b ; docs/specs_metier/SPEC_wapla_couche_planification.md § 3.1, § 6).
--
-- UN BILAN = une commune, un exercice. Il naît de l'amorce (W2a) : chaque
-- entrée que SIIPI tient y entre avec sa provenance ; la commune complète le
-- reste. Le calcul (moteur corrigé, backend/src/wapla/moteur.ts) se fait dans
-- l'API ; la base garde le résultat, la version du moteur qui l'a produit, et
-- le niveau de fiabilité. Toucher une entrée rend le résultat caduc : il est
-- retiré, et le bilan revient au brouillon — un chiffre ne survit pas aux
-- entrées qui l'ont produit.
--
-- LE NIVEAU DE FIABILITÉ (SPEC § 3.1), tranché ici pour ce que la note laissait
-- ouvert :
-- - les trois entrées CLÉS sont le gisement (waste_in), le taux de collecte
--   (tc_1) et la destination des tonnages collectés (la part de chaque procédé
--   actif : tc_4 compostage, tc_5 centre de tri, tc_22 incinération) ;
-- - le calcul attend que la commune ait traité chacune (une valeur, ou la
--   valeur par défaut de l'UNIDO gardée exprès) : SPEC § 6 ;
-- - une clé gardée à sa valeur par défaut UNIDO → « illustratif » (visible par
--   la commune seule) ;
-- - sinon, la part des entrées COMPTÉES (wapla.cles_entrees, rôle « comptee »)
--   restée par défaut — ou issue de la seule moyenne nationale pour la
--   composition — au moins égale au seuil de la FNCT → « indicatif » ; en
--   dessous → « étayé ». Les facteurs techniques de l'outil (facteurs
--   d'émission du Toolkit, coefficients de dégradation…) ne comptent pas.
--
-- PAS DE JOURNAL D'AUDIT DE SIIPI ICI, exprès. Le déploiement national
-- (app._saisies_communales, lot 4a) compte les écritures de la commune au
-- journal : une saisie WaPla y ferait passer une commune pour « active » dans
-- SIIPI — SIIPI dépendrait de la couche. Les tables de la couche gardent leur
-- propre trace (qui, quand).
-- =========================================================================

-- ---------------------------------------------------------------------------
-- 1. Les réglages de la FNCT
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS wapla.reglages (
    cle         TEXT PRIMARY KEY,
    valeur      NUMERIC NOT NULL,
    libelle     TEXT NOT NULL,
    modifie_par UUID,
    modifie_le  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT reglages_seuil CHECK (cle <> 'seuil_defauts_etaye' OR valeur BETWEEN 0 AND 1)
);
COMMENT ON TABLE wapla.reglages IS 'Les réglages de la couche WaPla, tenus par la FNCT (SPEC § 9).';
INSERT INTO wapla.reglages (cle, valeur, libelle) VALUES
  ('seuil_defauts_etaye', 0.30,
   'Part des entrées comptées restées à la valeur par défaut de l''UNIDO au-delà de laquelle un bilan n''est plus « étayé » mais « indicatif » (0 à 1).')
ON CONFLICT (cle) DO NOTHING;
ALTER TABLE wapla.reglages ENABLE ROW LEVEL SECURITY;
ALTER TABLE wapla.reglages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reglages_lecture ON wapla.reglages;
CREATE POLICY reglages_lecture ON wapla.reglages FOR SELECT USING (app.is_authenticated());
DROP POLICY IF EXISTS reglages_fnct ON wapla.reglages;
CREATE POLICY reglages_fnct ON wapla.reglages FOR UPDATE USING (app.is_fnct()) WITH CHECK (app.is_fnct());
GRANT SELECT ON wapla.reglages TO siipi_app;
GRANT UPDATE (valeur, modifie_par, modifie_le) ON wapla.reglages TO siipi_app;
REVOKE INSERT, DELETE, TRUNCATE ON wapla.reglages FROM siipi_app;

-- ---------------------------------------------------------------------------
-- 2. Le rôle de chaque entrée dans le niveau de fiabilité
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS wapla.cles_entrees (
    cle    TEXT PRIMARY KEY,
    role   TEXT NOT NULL,
    groupe TEXT NOT NULL,
    ordre  SMALLINT NOT NULL,
    CONSTRAINT cles_entrees_role CHECK (role IN ('cle', 'comptee'))
);
COMMENT ON TABLE wapla.cles_entrees IS
  'Les entrées du moteur qui comptent dans le niveau de fiabilité d''un bilan (SPEC § 3.1) : les trois CLÉS (gisement, taux de collecte, destination) et les entrées COMPTÉES dans la part « par défaut ». Une entrée absente de cette table est un facteur technique de l''outil : elle ne compte pas.';
COMMENT ON COLUMN wapla.cles_entrees.groupe IS
  'L''entrée de planification à laquelle la clé appartient (SPEC § 3.2) : la destination des tonnages regroupe tc_4, tc_5 et tc_22, dont seule compte la part d''un procédé actif.';
INSERT INTO wapla.cles_entrees (cle, role, groupe, ordre) VALUES
  ('waste_in', 'cle', 'gisement', 1),
  ('tc_1', 'cle', 'taux_collecte', 2),
  ('tc_4', 'cle', 'destination', 3), ('tc_5', 'cle', 'destination', 4), ('tc_22', 'cle', 'destination', 5),
  ('tc_2', 'comptee', 'recyclables_a_la_source', 10),
  ('tc_6', 'comptee', 'non_collecte', 11), ('tc_35', 'comptee', 'non_collecte', 12),
  ('ghg_1', 'comptee', 'gasoil', 13),
  ('cost_1', 'comptee', 'cout_collecte', 14),
  ('cost_5', 'comptee', 'cout_decharge', 15),
  ('ghg_5', 'comptee', 'composition', 16), ('ghg_6', 'comptee', 'composition', 17),
  ('ghg_14', 'comptee', 'composition', 18), ('ghg_15', 'comptee', 'composition', 19),
  ('ghg_3', 'comptee', 'composition', 20), ('ghg_11', 'comptee', 'composition', 21), ('ghg_18', 'comptee', 'composition', 22),
  ('APY', 'comptee', 'climat', 23), ('ATY', 'comptee', 'climat', 24),
  ('ghg_4', 'comptee', 'gestion_decharge', 25), ('ghg_19', 'comptee', 'gestion_decharge', 26)
ON CONFLICT (cle) DO UPDATE SET role = EXCLUDED.role, groupe = EXCLUDED.groupe, ordre = EXCLUDED.ordre;
ALTER TABLE wapla.cles_entrees ENABLE ROW LEVEL SECURITY;
ALTER TABLE wapla.cles_entrees FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cles_entrees_lecture ON wapla.cles_entrees;
CREATE POLICY cles_entrees_lecture ON wapla.cles_entrees FOR SELECT USING (app.is_authenticated());
GRANT SELECT ON wapla.cles_entrees TO siipi_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON wapla.cles_entrees FROM siipi_app;

-- ---------------------------------------------------------------------------
-- 3. Les bilans
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS wapla.bilans (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- La commune de démonstration retirée (app.retirer_jeu_demo) emporte ses
    -- bilans : une pesée simulée n'est l'historique de rien (règle 1.4).
    commune_id     TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    exercice       INTEGER NOT NULL,
    statut         TEXT NOT NULL DEFAULT 'brouillon',
    version_moteur TEXT,
    resultat       JSONB,
    niveau         TEXT,
    fiabilite      JSONB,
    calcule_le     TIMESTAMPTZ,
    calcule_par    UUID,
    cree_le        TIMESTAMPTZ NOT NULL DEFAULT now(),
    cree_par       UUID,
    deleted_at     TIMESTAMPTZ,
    deleted_by     UUID,
    CONSTRAINT bilans_exercice CHECK (exercice BETWEEN 2000 AND 2100),
    CONSTRAINT bilans_statut CHECK (statut IN ('brouillon', 'calcule')),
    CONSTRAINT bilans_niveau CHECK (niveau IS NULL OR niveau IN ('etaye', 'indicatif', 'illustratif')),
    -- Un bilan calculé porte tout ce qui le rend relisible : le résultat, la
    -- version du moteur, le niveau, et quand. Un brouillon n'en porte rien.
    CONSTRAINT bilans_calcul_complet CHECK (
      (statut = 'calcule') = (resultat IS NOT NULL AND version_moteur IS NOT NULL AND niveau IS NOT NULL
                              AND fiabilite IS NOT NULL AND calcule_le IS NOT NULL)
      AND (statut = 'calcule' OR (resultat IS NULL AND version_moteur IS NULL AND niveau IS NULL AND fiabilite IS NULL AND calcule_le IS NULL))),
    CONSTRAINT bilans_commune_id_unique UNIQUE (id, commune_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS bilans_un_par_exercice ON wapla.bilans (commune_id, exercice) WHERE deleted_at IS NULL;
COMMENT ON TABLE wapla.bilans IS
  'Les bilans WaPla d''une commune (lot W2b) : une estimation de planification par exercice (« Estimation de planification — méthode UNIDO WaPla »), jamais une mesure. Aucun chiffre de SIIPI n''en dépend.';
COMMENT ON COLUMN wapla.bilans.resultat IS 'Le résultat du moteur, tel qu''il l''a rendu (flux, uPOPs, GES, climat, coûts), avec la version du moteur à côté.';
COMMENT ON COLUMN wapla.bilans.niveau IS
  'étayé : peut entrer dans un agrégat national (lot W5) ; indicatif : visible par la commune et la FNCT, hors agrégats ; illustratif : visible par la commune seule (la base le tient).';
COMMENT ON COLUMN wapla.bilans.fiabilite IS 'Le détail du niveau : les clés et les entrées comptées restées par défaut, leur part, et le seuil appliqué.';

-- ---------------------------------------------------------------------------
-- 4. Les entrées d'un bilan
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS wapla.entrees (
    bilan_id   UUID NOT NULL,
    commune_id TEXT NOT NULL,
    cle        TEXT NOT NULL,
    valeur     JSONB NOT NULL,
    provenance TEXT NOT NULL,
    source     TEXT,
    detail     JSONB,
    saisi_le   TIMESTAMPTZ NOT NULL DEFAULT now(),
    saisi_par  UUID,
    PRIMARY KEY (bilan_id, cle),
    -- La commune de l'entrée est celle de son bilan : la règle de lecture
    -- s'applique sans jointure, et ne peut pas mentir.
    FOREIGN KEY (bilan_id, commune_id) REFERENCES wapla.bilans (id, commune_id) ON DELETE CASCADE,
    CONSTRAINT entrees_valeur CHECK (jsonb_typeof(valeur) IN ('number', 'boolean')),
    CONSTRAINT entrees_provenance CHECK (provenance IN ('siipi_mesure', 'siipi_declare', 'saisie_commune', 'reference_tunisienne', 'defaut_wapla')),
    -- Une valeur venue de SIIPI ou d'une référence dit d'où elle vient.
    CONSTRAINT entrees_source CHECK (provenance IN ('saisie_commune', 'defaut_wapla') OR btrim(COALESCE(source, '')) <> '')
);
COMMENT ON TABLE wapla.entrees IS
  'Les entrées d''un bilan WaPla, chacune avec sa provenance (SPEC § 3.1) : lue dans SIIPI (mesurée ou déclarée), saisie par la commune, référence tunisienne, ou valeur par défaut de l''UNIDO gardée exprès. Une entrée absente vaut la valeur par défaut de l''outil.';
COMMENT ON COLUMN wapla.entrees.cle IS 'L''identifiant de l''entrée dans le moteur (waste_in, tc_1, ghg_19…), tel que l''outil d''origine le nomme.';
COMMENT ON COLUMN wapla.entrees.detail IS 'Ce que l''amorce savait de la valeur : mois pesés, étude, niveau de la caractérisation (une moyenne nationale n''est pas propre à la commune)…';

-- Toucher une entrée rend le résultat caduc.
CREATE OR REPLACE FUNCTION wapla._entree_modifiee() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$fn$
BEGIN
  UPDATE wapla.bilans
     SET statut = 'brouillon', resultat = NULL, version_moteur = NULL, niveau = NULL, fiabilite = NULL,
         calcule_le = NULL, calcule_par = NULL
   WHERE id = NEW.bilan_id AND statut = 'calcule';
  RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION wapla._entree_modifiee() FROM PUBLIC;
DROP TRIGGER IF EXISTS entree_modifiee ON wapla.entrees;
CREATE TRIGGER entree_modifiee AFTER INSERT OR UPDATE ON wapla.entrees FOR EACH ROW EXECUTE FUNCTION wapla._entree_modifiee();

-- ---------------------------------------------------------------------------
-- 5. Qui lit, qui écrit
-- ---------------------------------------------------------------------------
--
-- La commune tient ses bilans ; la FNCT les lit, sauf les illustratifs
-- (SPEC § 3.1 : visibles par la commune seule) ; elle n'y écrit rien.

ALTER TABLE wapla.bilans ENABLE ROW LEVEL SECURITY;
ALTER TABLE wapla.bilans FORCE ROW LEVEL SECURITY;
ALTER TABLE wapla.entrees ENABLE ROW LEVEL SECURITY;
ALTER TABLE wapla.entrees FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bilans_lecture ON wapla.bilans;
CREATE POLICY bilans_lecture ON wapla.bilans FOR SELECT
  USING (deleted_at IS NULL AND app.can_read_commune(commune_id)
         AND (NOT app.is_fnct() OR niveau IS DISTINCT FROM 'illustratif'));
DROP POLICY IF EXISTS bilans_ajout ON wapla.bilans;
CREATE POLICY bilans_ajout ON wapla.bilans FOR INSERT
  WITH CHECK (app.can_write_commune(commune_id) AND NOT app.is_fnct());
DROP POLICY IF EXISTS bilans_calcul ON wapla.bilans;
CREATE POLICY bilans_calcul ON wapla.bilans FOR UPDATE
  USING (deleted_at IS NULL AND app.can_write_commune(commune_id) AND NOT app.is_fnct())
  WITH CHECK (deleted_at IS NULL AND app.can_write_commune(commune_id) AND NOT app.is_fnct());
GRANT SELECT, INSERT ON wapla.bilans TO siipi_app;
GRANT UPDATE (statut, version_moteur, resultat, niveau, fiabilite, calcule_le, calcule_par) ON wapla.bilans TO siipi_app;
REVOKE DELETE, TRUNCATE ON wapla.bilans FROM siipi_app;

DROP POLICY IF EXISTS entrees_lecture ON wapla.entrees;
CREATE POLICY entrees_lecture ON wapla.entrees FOR SELECT
  USING (EXISTS (SELECT 1 FROM wapla.bilans b WHERE b.id = bilan_id));
DROP POLICY IF EXISTS entrees_ajout ON wapla.entrees;
CREATE POLICY entrees_ajout ON wapla.entrees FOR INSERT
  WITH CHECK (app.can_write_commune(commune_id) AND NOT app.is_fnct()
              AND EXISTS (SELECT 1 FROM wapla.bilans b WHERE b.id = bilan_id));
DROP POLICY IF EXISTS entrees_saisie ON wapla.entrees;
CREATE POLICY entrees_saisie ON wapla.entrees FOR UPDATE
  USING (app.can_write_commune(commune_id) AND NOT app.is_fnct())
  WITH CHECK (app.can_write_commune(commune_id) AND NOT app.is_fnct());
GRANT SELECT, INSERT ON wapla.entrees TO siipi_app;
GRANT UPDATE (valeur, provenance, source, detail, saisi_le, saisi_par) ON wapla.entrees TO siipi_app;
-- Une entrée ne s'efface pas : revenir à la valeur par défaut est une saisie.
REVOKE DELETE, TRUNCATE ON wapla.entrees FROM siipi_app;

-- Le retrait d'un bilan est logique, et passe par une fonction : la règle de
-- lecture cache les bilans retirés, et PostgreSQL refuse qu'une mise à jour
-- produise une ligne que l'appelant ne pourrait plus lire.
CREATE OR REPLACE FUNCTION wapla.retirer_bilan(p_bilan uuid) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$fn$
DECLARE
  v_commune text;
BEGIN
  SELECT commune_id INTO v_commune FROM wapla.bilans WHERE id = p_bilan AND deleted_at IS NULL;
  IF v_commune IS NULL OR NOT app.can_write_commune(v_commune) OR app.is_fnct() THEN
    RETURN false;
  END IF;
  UPDATE wapla.bilans SET deleted_at = now(), deleted_by = app.current_user_id() WHERE id = p_bilan;
  RETURN true;
END;
$fn$;
REVOKE ALL ON FUNCTION wapla.retirer_bilan(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wapla.retirer_bilan(uuid) TO siipi_app;
COMMENT ON FUNCTION wapla.retirer_bilan(uuid) IS
  'Retire un bilan (suppression logique, règle d''or 1.4) : la commune seule ; faux pour un bilan introuvable ou hors de son périmètre.';
