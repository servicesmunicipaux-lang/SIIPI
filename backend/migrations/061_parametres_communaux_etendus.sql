-- =========================================================================
-- 061 — Les paramètres communaux étendus (lot 17.1, FEUILLE_DE_ROUTE § 10.3).
--
-- UNE COMMUNE CÔTIÈRE TRIPLE EN ÉTÉ. Le ratio kilo par habitant et par jour
-- (migration 036) divisait le tonnage du mois par la population du
-- recensement, toute l'année. En juillet à Djerba, il rapporte les déchets de
-- trois fois plus de personnes à la seule population permanente : le ratio
-- triple, et on conclut à un problème de collecte là où il n'y a que des
-- estivants. Faux cinq mois par an.
--
-- Trois réglages, qui s'ajoutent à parametres_commune (migration 048) :
--   1. la population permanente que la commune retient, avec sa source — à
--      défaut, celle du recensement (communes.population), dite comme telle ;
--   2. la population présente en saison, et les mois de la saison ;
--   3. la production spécifique théorique (kg/hab/jour), avec sa source : le
--      repère auquel on compare le pesé.
--
-- `app.production_specifique()` rend, par mois, les deux ratios côte à côte :
-- sur la population permanente, et — pour un mois de saison — sur la
-- population présente. Elle dit lequel elle retient, et l'écart au théorique.
-- Elle ne « corrige » rien : un écart s'affiche, il ne se lisse pas.
--
-- Ce que l'on n'invente pas : sans population saisonnière déclarée, aucun
-- mois n'est « de saison » ; sans production théorique, aucun écart ; sans
-- population du tout, aucun ratio (NULL, jamais 0).
-- =========================================================================

ALTER TABLE parametres_commune
  ADD COLUMN IF NOT EXISTS population_permanente          INTEGER,
  ADD COLUMN IF NOT EXISTS population_permanente_source   TEXT,
  ADD COLUMN IF NOT EXISTS population_saisonniere         INTEGER,
  ADD COLUMN IF NOT EXISTS saison_debut_mois              SMALLINT,
  ADD COLUMN IF NOT EXISTS saison_fin_mois                SMALLINT,
  ADD COLUMN IF NOT EXISTS production_theorique_kg_hab_j  NUMERIC(5, 3),
  ADD COLUMN IF NOT EXISTS production_theorique_source    TEXT;

COMMENT ON COLUMN parametres_commune.population_permanente IS
  'Population permanente que la commune retient (estimation plus récente que le recensement, par exemple). Vide : on retient communes.population, le recensement, et l''écran le dit.';
COMMENT ON COLUMN parametres_commune.population_permanente_source IS
  'D''où vient la population permanente retenue (« INS, estimation 2025 », « état civil »…). Obligatoire avec elle : un chiffre sans source ne se discute pas.';
COMMENT ON COLUMN parametres_commune.population_saisonniere IS
  'Population PRÉSENTE en saison (permanents compris, estivants en plus) — jamais inférieure à la population permanente.';
COMMENT ON COLUMN parametres_commune.saison_debut_mois IS
  'Premier mois de la saison (1 à 12). La saison peut chevaucher l''année : de novembre (11) à février (2).';
COMMENT ON COLUMN parametres_commune.saison_fin_mois IS
  'Dernier mois de la saison, compris (1 à 12).';
COMMENT ON COLUMN parametres_commune.production_theorique_kg_hab_j IS
  'Production spécifique théorique, en kg par habitant et par jour : le repère auquel se compare le pesé. Une étude, un PCGD, une moyenne régionale — avec sa source.';
COMMENT ON COLUMN parametres_commune.production_theorique_source IS
  'D''où vient la production théorique (PCGD, étude de caractérisation…). Obligatoire avec elle.';

ALTER TABLE parametres_commune DROP CONSTRAINT IF EXISTS parametres_population_permanente;
ALTER TABLE parametres_commune ADD  CONSTRAINT parametres_population_permanente CHECK (
  population_permanente IS NULL
  OR (population_permanente BETWEEN 1 AND 5000000
      AND length(btrim(COALESCE(population_permanente_source, ''))) > 0));

-- La saison va d'un bloc : une population saisonnière sans ses mois ne dit pas
-- quand elle s'applique, des mois sans population ne disent pas combien.
ALTER TABLE parametres_commune DROP CONSTRAINT IF EXISTS parametres_saison_complete;
-- Les IS NOT NULL ne sont pas redondants : « NULL BETWEEN 1 AND 12 » vaut
-- NULL, et une contrainte qui vaut NULL est SATISFAITE — des mois sans
-- population passeraient.
ALTER TABLE parametres_commune ADD  CONSTRAINT parametres_saison_complete CHECK (
  (population_saisonniere IS NULL AND saison_debut_mois IS NULL AND saison_fin_mois IS NULL)
  OR (population_saisonniere IS NOT NULL AND saison_debut_mois IS NOT NULL AND saison_fin_mois IS NOT NULL
      AND population_saisonniere BETWEEN 1 AND 10000000
      AND saison_debut_mois BETWEEN 1 AND 12
      AND saison_fin_mois BETWEEN 1 AND 12));

ALTER TABLE parametres_commune DROP CONSTRAINT IF EXISTS parametres_production_theorique;
ALTER TABLE parametres_commune ADD  CONSTRAINT parametres_production_theorique CHECK (
  production_theorique_kg_hab_j IS NULL
  OR (production_theorique_kg_hab_j > 0 AND production_theorique_kg_hab_j < 5
      AND length(btrim(COALESCE(production_theorique_source, ''))) > 0));

-- La population présente en saison compte les permanents : elle ne peut pas
-- leur être inférieure. La comparaison se fait à la population permanente
-- RETENUE, déclarée ou, à défaut, celle du recensement.
CREATE OR REPLACE FUNCTION app.controler_population_saison() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_permanente integer;
BEGIN
  IF NEW.population_saisonniere IS NULL THEN
    RETURN NEW;
  END IF;
  v_permanente := COALESCE(NEW.population_permanente,
                           (SELECT NULLIF(population, 0) FROM communes WHERE id = NEW.commune_id));
  IF v_permanente IS NOT NULL AND NEW.population_saisonniere < v_permanente THEN
    RAISE EXCEPTION 'PARAMETRES_SAISON: La population présente en saison (%) ne peut pas être inférieure à la population permanente retenue (%) : elle la comprend.',
      NEW.population_saisonniere, v_permanente
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_controler_population_saison ON parametres_commune;
CREATE TRIGGER trg_controler_population_saison BEFORE INSERT OR UPDATE ON parametres_commune
  FOR EACH ROW EXECUTE FUNCTION app.controler_population_saison();

-- Un mois est-il de saison ? La saison peut chevaucher le changement d'année.
CREATE OR REPLACE FUNCTION app.mois_en_saison(p_mois integer, p_debut integer, p_fin integer)
  RETURNS boolean LANGUAGE sql IMMUTABLE AS
$$
  SELECT CASE
           WHEN p_debut IS NULL OR p_fin IS NULL THEN false
           WHEN p_debut <= p_fin THEN p_mois BETWEEN p_debut AND p_fin
           ELSE p_mois >= p_debut OR p_mois <= p_fin
         END
$$;
GRANT EXECUTE ON FUNCTION app.mois_en_saison(integer, integer, integer) TO siipi_app;

-- -------------------------------------------------------------------------
-- La production spécifique, par mois
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.production_specifique(p_commune text, p_annee integer DEFAULT NULL)
  RETURNS TABLE (
    annee                  integer,
    mois                   integer,
    tonnes                 numeric,
    jours                  integer,
    population_permanente  integer,
    source_population      text,
    kg_hab_j_permanente    numeric,
    en_saison              boolean,
    population_saisonniere integer,
    kg_hab_j_saison        numeric,
    kg_hab_j_retenu        numeric,
    production_theorique   numeric,
    ecart_theorique_pct    numeric
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  WITH reglages AS (
    SELECT COALESCE(p.population_permanente, NULLIF(c.population, 0)) AS permanente,
           CASE WHEN p.population_permanente IS NOT NULL THEN 'declaree'
                WHEN NULLIF(c.population, 0) IS NOT NULL THEN 'recensement' END AS source,
           p.population_saisonniere, p.saison_debut_mois, p.saison_fin_mois,
           p.production_theorique_kg_hab_j AS theorique
      FROM communes c
      LEFT JOIN parametres_commune p ON p.commune_id = c.id
     WHERE c.id = p_commune
  ),
  mois AS (
    SELECT EXTRACT(year FROM p.date_pesee)::integer AS annee,
           EXTRACT(month FROM p.date_pesee)::integer AS mois,
           sum(p.poids_net_kg) AS kg,
           EXTRACT(day FROM (date_trunc('month', min(p.date_pesee)) + interval '1 month - 1 day'))::integer AS jours
      FROM pesees p
     WHERE p.commune_id = p_commune AND p.deleted_at IS NULL
       AND (p_annee IS NULL OR EXTRACT(year FROM p.date_pesee)::integer = p_annee)
       AND app.can_read_commune(p_commune)
     GROUP BY 1, 2
  ),
  calcul AS (
    SELECT m.*, r.*,
           -- Pas de saison sans population de saison : les mois seuls ne
           -- disent pas combien de personnes produisent les déchets.
           (r.population_saisonniere IS NOT NULL
            AND app.mois_en_saison(m.mois, r.saison_debut_mois, r.saison_fin_mois)) AS saison,
           CASE WHEN r.permanente > 0 THEN round(m.kg / r.permanente / m.jours, 3) END AS kg_perm,
           CASE WHEN r.population_saisonniere IS NOT NULL
                 AND app.mois_en_saison(m.mois, r.saison_debut_mois, r.saison_fin_mois)
                THEN round(m.kg / r.population_saisonniere / m.jours, 3) END AS kg_saison
      FROM mois m CROSS JOIN reglages r
  )
  SELECT annee, mois, round(kg / 1000.0, 3), jours,
         permanente, source, kg_perm,
         saison, CASE WHEN saison THEN population_saisonniere END, kg_saison,
         -- En saison, le ratio retenu est celui de la population présente :
         -- c'est elle qui produit les déchets du mois.
         COALESCE(kg_saison, kg_perm),
         theorique,
         CASE WHEN theorique IS NOT NULL AND COALESCE(kg_saison, kg_perm) IS NOT NULL
              THEN round(100 * (COALESCE(kg_saison, kg_perm) - theorique) / theorique, 1) END
    FROM calcul
   ORDER BY annee, mois
$$;
COMMENT ON FUNCTION app.production_specifique(text, integer) IS
  'Par mois : tonnage pesé, kg/hab/jour sur la population permanente retenue (déclarée, sinon recensement) et — pour un mois de saison — sur la population présente ; le ratio retenu (celui de la saison quand elle s''applique) et son écart à la production théorique. Une population ou un repère absents rendent NULL, jamais 0.';
GRANT EXECUTE ON FUNCTION app.production_specifique(text, integer) TO siipi_app;
