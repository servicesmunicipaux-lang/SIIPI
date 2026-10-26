-- ============================================================================
-- 088 — Le moteur volumétrique (lot 17.2)
-- docs/specs_metier/DECISIONS_2026-10-20.md, compléments du 25/10/2026 ;
-- SPEC_v0.16.md, R4 ; docs/specs_metier/sources/GUIDE_TADAEEM_LECTURE.md (G1 à G3).
--
-- Une commune sans pont-bascule n'a aucun tonnage. Le guide de référence donne la
-- méthode : volume de la benne × densité des déchets dans cet équipement. Ce lot la
-- pose, avec trois garde-fous.
--
-- UNE ESTIMATION N'EST PAS UNE PESÉE. Le moteur n'estime que les voyages attendus
-- qui n'ont pas été pesés, et rend le pesé à côté, jamais additionné. Un total qui
-- mêlerait les deux afficherait comme mesuré ce qui ne l'est pas.
--
-- UNE FOURCHETTE, PAS UN CHIFFRE. La densité est une plage (0,20 – 0,25 pour une
-- benne basculante) ; le tonnage aussi. Un chiffre à la décimale afficherait une
-- précision que la méthode n'a pas.
--
-- BENNE PLEINE. Le moteur calcule la capacité de la benne, remplie : c'est la
-- formule du guide, et c'est écrit à l'écran. Le taux de remplissage réel (pesé ÷
-- capacité) viendra des indicateurs ; aucun taux par défaut n'est inventé ici.
--
-- Rien ne s'estime sans tout ce qu'il faut : un circuit sans engin, un engin sans
-- classe ou sans volume, un tracteur sans remorque, une benne tasseuse de moins de
-- 7 m³ (la seule tranche sans densité), un flux autre que les DMA rendent « ce qui
-- manque », jamais 0. Un engin qui ne tasse pas et que la référence ne cite pas
-- (pick-up, ampli-roll) prend la fourchette des non-compactants (décision du
-- 26/10/2026) ; un engin dont la classe n'est pas dite reste « non renseigné » :
-- on ne sait pas s'il tasse.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. La matrice des densités, nationale et datée
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS densites_reference (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flux            TEXT NOT NULL DEFAULT 'dma',
    equipement      TEXT NOT NULL,
    tranche_m3      NUMRANGE,
    densite_min     NUMERIC(5, 3) NOT NULL,
    densite_max     NUMERIC(5, 3) NOT NULL,
    date_effet      DATE NOT NULL,
    source          TEXT NOT NULL,
    saisi_par       UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    retire_le       TIMESTAMPTZ,
    retire_par      UUID REFERENCES users(id) ON DELETE SET NULL,
    motif_retrait   TEXT,
    CONSTRAINT densites_flux CHECK (flux IN ('dma')),
    CONSTRAINT densites_bornes CHECK (densite_min > 0 AND densite_min <= densite_max AND densite_max <= 2),
    CONSTRAINT densites_source CHECK (length(btrim(source)) > 0),
    CONSTRAINT densites_date_plausible CHECK (date_effet >= DATE '2000-01-01'),
    CONSTRAINT densites_tranche CHECK (tranche_m3 IS NULL OR NOT isempty(tranche_m3)),
    CONSTRAINT densites_retrait_motive CHECK (
      retire_le IS NULL OR length(btrim(COALESCE(motif_retrait, ''))) >= 5)
);
COMMENT ON TABLE densites_reference IS
  'La matrice des densités des déchets par équipement (lot 17.2), nationale, tenue par la FNCT. Une valeur ne se réécrit pas : une autre s''ajoute, avec sa date d''effet et sa source. La valeur d''un jour, pour un équipement et une tranche, est la dernière dont la date d''effet le précède. Une valeur saisie à tort se retire, avec son motif, et reste lisible.';
COMMENT ON COLUMN densites_reference.equipement IS
  'Une classe d''engin (classes_engins.code), ou poubelles_conteneurs pour la pré-collecte.';
COMMENT ON COLUMN densites_reference.tranche_m3 IS
  'La tranche de volume de la benne à laquelle la densité s''applique ([7,8] : de 7 à 8 m³ ; (8,) : plus de 8 m³). Vide : tout volume. Un volume hors de toute tranche n''a pas de densité, donc pas d''estimation.';
COMMENT ON COLUMN densites_reference.densite_min IS
  'Densité en t/m³, borne basse. Égale à la borne haute quand la référence ne donne qu''une valeur.';
COMMENT ON COLUMN densites_reference.densite_max IS
  'Densité en t/m³, borne haute.';
COMMENT ON COLUMN densites_reference.source IS
  'La référence et le tableau d''où vient la valeur, et la décision qui l''a retenue.';

-- Ce qu'une contrainte ne sait pas dire, parce qu'il faut lire d'autres lignes ou
-- une autre table : l'équipement existe ; une tranche nouvelle ne chevauche pas une
-- tranche existante de cet équipement (une révision reprend la même tranche) ; et
-- une benne qui tasse reste plus dense que toute benne qui ne tasse pas.
CREATE OR REPLACE FUNCTION app.controler_densite() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public, pg_temp AS
$$
DECLARE
  v_compactant boolean;
  v_conflit    text;
BEGIN
  IF NEW.equipement = 'poubelles_conteneurs' THEN
    v_compactant := false;
  ELSE
    SELECT compactant INTO v_compactant FROM classes_engins WHERE code = NEW.equipement;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'L''équipement % n''existe pas : une classe de classes_engins, ou poubelles_conteneurs.', NEW.equipement
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF EXISTS (
       SELECT 1 FROM densites_reference d
        WHERE d.id <> NEW.id AND d.retire_le IS NULL
          AND d.flux = NEW.flux AND d.equipement = NEW.equipement
          AND d.tranche_m3 IS DISTINCT FROM NEW.tranche_m3
          AND (d.tranche_m3 IS NULL OR NEW.tranche_m3 IS NULL OR d.tranche_m3 && NEW.tranche_m3)) THEN
    RAISE EXCEPTION 'La tranche de volume % chevauche une autre tranche de l''équipement % : une révision reprend la même tranche.',
      COALESCE(NEW.tranche_m3::text, 'tout volume'), NEW.equipement
      USING ERRCODE = '23514';
  END IF;

  -- La comparaison se fait sur la matrice en vigueur à la date d'effet de la valeur.
  WITH en_vigueur AS (
    SELECT DISTINCT ON (d.equipement, d.tranche_m3) d.equipement, d.densite_min, d.densite_max,
           CASE WHEN d.equipement = 'poubelles_conteneurs' THEN false ELSE k.compactant END AS compactant
      FROM densites_reference d
      LEFT JOIN classes_engins k ON k.code = d.equipement
     WHERE d.flux = NEW.flux AND d.retire_le IS NULL AND d.date_effet <= NEW.date_effet
     ORDER BY d.equipement, d.tranche_m3, d.date_effet DESC, d.created_at DESC
  )
  SELECT format('%s (%s à %s t/m³) n''est pas plus dense que %s (%s à %s t/m³)',
                c.equipement, c.densite_min, c.densite_max, n.equipement, n.densite_min, n.densite_max)
    INTO v_conflit
    FROM en_vigueur c, en_vigueur n
   WHERE c.compactant AND NOT n.compactant AND c.densite_min <= n.densite_max
   LIMIT 1;
  IF v_conflit IS NOT NULL THEN
    RAISE EXCEPTION 'Une benne qui tasse doit rester plus dense que toute benne qui ne tasse pas : %.', v_conflit
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS densites_reference_controle ON densites_reference;
CREATE CONSTRAINT TRIGGER densites_reference_controle
  AFTER INSERT ON densites_reference
  FOR EACH ROW EXECUTE FUNCTION app.controler_densite();

-- Une valeur ne se réécrit pas : seul le retrait se pose, une fois.
CREATE OR REPLACE FUNCTION app.densite_inchangee() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public, pg_temp AS
$$
BEGIN
  IF OLD.retire_le IS NOT NULL
     OR (NEW.flux, NEW.equipement, NEW.tranche_m3, NEW.densite_min, NEW.densite_max, NEW.date_effet, NEW.source, NEW.saisi_par, NEW.created_at)
        IS DISTINCT FROM
        (OLD.flux, OLD.equipement, OLD.tranche_m3, OLD.densite_min, OLD.densite_max, OLD.date_effet, OLD.source, OLD.saisi_par, OLD.created_at) THEN
    RAISE EXCEPTION 'Une densité ne se réécrit pas : ajoutez une valeur datée, ou retirez celle-ci avec son motif.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS densites_reference_inchangee ON densites_reference;
CREATE TRIGGER densites_reference_inchangee
  BEFORE UPDATE ON densites_reference
  FOR EACH ROW EXECUTE FUNCTION app.densite_inchangee();

ALTER TABLE densites_reference ENABLE ROW LEVEL SECURITY;
ALTER TABLE densites_reference FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS densites_reference_select ON densites_reference;
CREATE POLICY densites_reference_select ON densites_reference FOR SELECT USING (app.is_authenticated());
DROP POLICY IF EXISTS densites_reference_insert ON densites_reference;
CREATE POLICY densites_reference_insert ON densites_reference FOR INSERT WITH CHECK (app.is_fnct());
DROP POLICY IF EXISTS densites_reference_update ON densites_reference;
CREATE POLICY densites_reference_update ON densites_reference FOR UPDATE
  USING (app.is_fnct() AND retire_le IS NULL) WITH CHECK (app.is_fnct());
GRANT SELECT, INSERT ON densites_reference TO siipi_app;
GRANT UPDATE (retire_le, retire_par, motif_retrait) ON densites_reference TO siipi_app;
REVOKE DELETE, TRUNCATE ON densites_reference FROM siipi_app;

-- La matrice validée le 25/10/2026. Sa date d'effet est celle d'avant toute donnée :
-- la référence n'a pas de date, et un mois passé doit pouvoir s'estimer avec elle.
INSERT INTO densites_reference (flux, equipement, tranche_m3, densite_min, densite_max, date_effet, source)
SELECT v.flux, v.equipement, v.tranche::numrange, v.dmin, v.dmax, DATE '2000-01-01', v.source
  FROM (VALUES
    ('dma', 'benne_tasseuse', '[7,8]', 0.35, 0.35,
     'Guide d''optimisation de la collecte des DMA en Tunisie (USAID TADAEEM, MALE), Tableaux 2 et 11 (benne tasseuse de 7 m³), classe de 7 à 8 m³ du Tableau 10 ; décision du 25/10/2026'),
    ('dma', 'benne_tasseuse', '(8,)', 0.5, 0.5,
     'Guide d''optimisation de la collecte des DMA en Tunisie (USAID TADAEEM, MALE), Tableaux 2 et 11 (benne tasseuse de plus de 7 m³), au-delà de 8 m³ ; décision du 25/10/2026'),
    ('dma', 'tracteur_remorque_compactrice', NULL, 0.3, 0.3,
     'Guide d''optimisation de la collecte des DMA en Tunisie (USAID TADAEEM, MALE), Tableaux 2 et 11 ; décision du 25/10/2026'),
    ('dma', 'benne_basculante', NULL, 0.20, 0.25,
     'Guide d''optimisation de la collecte des DMA en Tunisie (USAID TADAEEM, MALE) : 0,2 aux Tableaux 2 et Annexe 14, 0,25 au Tableau 11 ; fourchette, décision du 25/10/2026'),
    ('dma', 'tracteur_remorque_agricole', NULL, 0.20, 0.25,
     'Guide d''optimisation de la collecte des DMA en Tunisie (USAID TADAEEM, MALE) : 0,2 aux Tableaux 2 et Annexe 14, 0,25 au Tableau 11 ; fourchette, décision du 25/10/2026'),
    ('dma', 'poubelles_conteneurs', NULL, 0.20, 0.25,
     'Guide d''optimisation de la collecte des DMA en Tunisie (USAID TADAEEM, MALE) : 0,2 aux Tableaux 2 et Annexe 14, 0,25 au Tableau 11 ; fourchette, décision du 25/10/2026 (pré-collecte, non utilisée par l''estimation)'),
    -- Absents des tableaux de densité du guide, mais non compactants : décision du
    -- 26/10/2026, la fourchette des engins qui ne tassent pas.
    ('dma', 'pick_up', NULL, 0.20, 0.25,
     'Engin non compactant, absent des tableaux de densité du guide d''optimisation de la collecte des DMA en Tunisie (USAID TADAEEM, MALE) : fourchette des non-compactants (Tableaux 2, 11, Annexe 14) ; décision du 26/10/2026'),
    ('dma', 'ampli_roll', NULL, 0.20, 0.25,
     'Engin non compactant, absent des tableaux de densité du guide d''optimisation de la collecte des DMA en Tunisie (USAID TADAEEM, MALE) : fourchette des non-compactants (Tableaux 2, 11, Annexe 14) ; décision du 26/10/2026')
  ) AS v(flux, equipement, tranche, dmin, dmax, source)
 WHERE NOT EXISTS (SELECT 1 FROM densites_reference d
                    WHERE d.flux = v.flux AND d.equipement = v.equipement
                      AND d.tranche_m3 IS NOT DISTINCT FROM v.tranche::numrange);

-- ---------------------------------------------------------------------------
-- 2. La densité d'une benne, un jour donné
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.densite_retenue(p_classe text, p_volume numeric, p_jour date)
  RETURNS TABLE (densite_id uuid, densite_min numeric, densite_max numeric, source text)
  LANGUAGE sql STABLE SET search_path = public, pg_temp AS
$$
  SELECT d.id, d.densite_min, d.densite_max, d.source
    FROM densites_reference d
   WHERE d.flux = 'dma' AND d.equipement = p_classe AND d.retire_le IS NULL
     AND d.date_effet <= p_jour
     AND (d.tranche_m3 IS NULL OR d.tranche_m3 @> p_volume)
   ORDER BY d.date_effet DESC, d.created_at DESC
   LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION app.densite_retenue(text, numeric, date) TO siipi_app;
COMMENT ON FUNCTION app.densite_retenue(text, numeric, date) IS
  'La densité en vigueur ce jour-là pour une classe d''engin et un volume de benne, ou rien : une benne tasseuse de moins de 7 m³ n''a pas de densité.';

-- ---------------------------------------------------------------------------
-- 3. Le tonnage estimé d'un mois, circuit par circuit
-- ---------------------------------------------------------------------------
-- Les voyages attendus sont ceux de app.pesees_attendues (jours de passage, voyages
-- par jour, période de validité, régie seulement), jusqu'à aujourd'hui. Ceux qui
-- ont une pesée sont comptés pesés et ne s'estiment pas. Les droits sont ceux de
-- l'appelant : une commune hors de son périmètre ne rend rien.
CREATE OR REPLACE FUNCTION app.tonnage_estime(p_commune text, p_mois date)
  RETURNS TABLE (
    circuit_id          uuid,
    circuit             text,
    type_dechet         text,
    vehicule_immat      text,
    porteur_immat       text,
    classe              text,
    volume_m3           numeric,
    volume_provenance   text,
    densite_min         numeric,
    densite_max         numeric,
    densite_source      text,
    voyages_attendus    integer,
    voyages_peses       integer,
    voyages_estimes     integer,
    tonnage_min_t       numeric,
    tonnage_max_t       numeric,
    tonnage_pese_t      numeric,
    manque              text
  )
  LANGUAGE sql STABLE SET search_path = public, pg_temp AS
$$
  WITH bornes AS (
    SELECT date_trunc('month', p_mois)::date AS debut,
           LEAST((date_trunc('month', p_mois) + interval '1 month - 1 day')::date,
                 (now() AT TIME ZONE 'Africa/Tunis')::date) AS fin
  ), jours AS (
    SELECT j::date AS jour FROM bornes, generate_series(bornes.debut, bornes.fin, interval '1 day') AS j
  ), attendus AS (
    SELECT a.circuit_id, j.jour, a.voyage, a.pesee_id, a.poids_net_kg
      FROM jours j
      CROSS JOIN LATERAL app.pesees_attendues(p_commune, j.jour) a
  ), circuits_vus AS (
    SELECT c.id, c.nom, c.type_dechet, c.vehicule_id, c.vehicule_immat
      FROM circuits c
     WHERE c.commune_id = p_commune AND c.deleted_at IS NULL AND c.actif AND c.prestataire_id IS NULL
       AND app.can_read_commune(p_commune)
  ), par_circuit AS (
    SELECT cv.id,
           count(a.voyage)::integer                                   AS attendus,
           count(a.pesee_id)::integer                                 AS peses,
           (count(a.voyage) - count(a.pesee_id))::integer             AS a_estimer
      FROM circuits_vus cv
      LEFT JOIN attendus a ON a.circuit_id = cv.id
     GROUP BY cv.id
  ), pese AS (
    -- Tout ce que le circuit a fait peser dans le mois, voyage attendu ou non : c'est
    -- le pesé, rendu à côté de l'estimation, jamais ajouté à elle.
    SELECT p.circuit_id, round(sum(p.poids_net_kg) / 1000, 3) AS tonnes
      FROM pesees p, bornes b
     WHERE p.deleted_at IS NULL AND p.commune_id = p_commune
       AND p.date_pesee BETWEEN b.debut AND (date_trunc('month', p_mois) + interval '1 month - 1 day')::date
     GROUP BY p.circuit_id
  ), estimes AS (
    -- La densité du jour de chaque voyage non pesé : une révision de la matrice en
    -- cours de mois ne s'applique qu'aux voyages qui la suivent.
    SELECT a.circuit_id, sum(t.volume_m3 * d.densite_min) AS tmin, sum(t.volume_m3 * d.densite_max) AS tmax,
           count(d.densite_id) AS avec_densite, count(*) AS voyages
      FROM attendus a
      JOIN circuits_vus cv ON cv.id = a.circuit_id
      CROSS JOIN LATERAL app.engin_de_travail(cv.vehicule_id) t
      LEFT JOIN LATERAL app.densite_retenue(t.classe, t.volume_m3, a.jour) d ON true
     WHERE a.pesee_id IS NULL AND t.manque IS NULL
     GROUP BY a.circuit_id
  ), densite_fin AS (
    SELECT cv.id, d.*
      FROM circuits_vus cv
      CROSS JOIN bornes b
      LEFT JOIN LATERAL app.engin_de_travail(cv.vehicule_id) t ON true
      LEFT JOIN LATERAL app.densite_retenue(t.classe, t.volume_m3, b.fin) d ON true
  )
  SELECT cv.id, cv.nom, cv.type_dechet,
         COALESCE(v.registration, cv.vehicule_immat), t.porteur_immat, t.classe, t.volume_m3, t.volume_provenance,
         df.densite_min, df.densite_max, df.source,
         pc.attendus, pc.peses, pc.a_estimer,
         CASE WHEN m.manque IS NULL AND pc.a_estimer > 0 THEN round(e.tmin, 2) END,
         CASE WHEN m.manque IS NULL AND pc.a_estimer > 0 THEN round(e.tmax, 2) END,
         ps.tonnes,
         m.manque
    FROM circuits_vus cv
    JOIN par_circuit pc ON pc.id = cv.id
    LEFT JOIN vehicules v ON v.id = cv.vehicule_id AND v.deleted_at IS NULL
    LEFT JOIN LATERAL app.engin_de_travail(cv.vehicule_id) t ON true
    LEFT JOIN estimes e ON e.circuit_id = cv.id
    LEFT JOIN densite_fin df ON df.id = cv.id
    LEFT JOIN pese ps ON ps.circuit_id = cv.id
    CROSS JOIN LATERAL (SELECT CASE
             WHEN cv.type_dechet IS NULL THEN 'flux_non_renseigne'
             WHEN cv.type_dechet <> 'menager' THEN 'flux_sans_densite'
             WHEN cv.vehicule_id IS NULL OR v.id IS NULL THEN 'circuit_sans_engin'
             WHEN t.manque IS NOT NULL THEN t.manque
             WHEN pc.attendus = 0 THEN 'aucun_voyage_attendu'
             WHEN pc.a_estimer > 0 AND e.avec_densite < e.voyages THEN 'densite_absente'
           END AS manque) m
   ORDER BY cv.nom
$$;
GRANT EXECUTE ON FUNCTION app.tonnage_estime(text, date) TO siipi_app;
COMMENT ON FUNCTION app.tonnage_estime(text, date) IS
  'Le tonnage estimé d''un mois, par circuit : voyages attendus jusqu''à aujourd''hui, dont pesés (non estimés) ; pour les autres, volume de la benne de travail × densité du jour, en fourchette, benne pleine. Le pesé est rendu à côté, jamais additionné. Sans tout ce qu''il faut, manque dit quoi, et les tonnages sont vides.';

-- ---------------------------------------------------------------------------
-- 4. « À vérifier » : une benne qui ne tiendrait pas dans sa charge utile
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.incoherences_volumetrie(p_commune text)
  RETURNS TABLE (gravite text, domaine text, sujet text, sujet_id text, constat text, quoi_faire text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT 'information', 'parc', v.registration, v.id,
         format('Benne de %s m³ à %s – %s t/m³ : de %s à %s t par voyage, au-delà de la charge utile de %s t.',
                replace(trim_scale(v.capacity_m3)::text, '.', ','),
                replace(trim_scale(d.densite_min)::text, '.', ','), replace(trim_scale(d.densite_max)::text, '.', ','),
                replace(trim_scale(round(v.capacity_m3 * d.densite_min, 2))::text, '.', ','),
                replace(trim_scale(round(v.capacity_m3 * d.densite_max, 2))::text, '.', ','),
                replace(trim_scale(v.charge_utile_t)::text, '.', ',')),
         'Vérifier le volume, la classe ou la charge utile de l''engin. SIIPI ne corrige pas l''estimation : il signale l''écart.'
    FROM vehicules v
    CROSS JOIN LATERAL app.densite_retenue(v.classe_collecte, v.capacity_m3, (now() AT TIME ZONE 'Africa/Tunis')::date) d
   WHERE v.commune_id = p_commune AND v.deleted_at IS NULL
     AND v.classe_collecte IS NOT NULL AND v.capacity_m3 IS NOT NULL AND v.charge_utile_t IS NOT NULL
     AND v.capacity_m3 * d.densite_min > v.charge_utile_t
     AND app.can_read_commune(p_commune)
$$;
GRANT EXECUTE ON FUNCTION app.incoherences_volumetrie(text) TO siipi_app;

-- Le panneau « À vérifier » : définition reprise de la migration 087, la
-- volumétrie en plus.
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
    ) tout
   ORDER BY CASE gravite WHEN 'bloquant' THEN 0
                         WHEN 'avertissement' THEN 1
                         ELSE 2 END,
            domaine, sujet
$$;
GRANT EXECUTE ON FUNCTION app.incoherences_commune(text) TO siipi_app;
