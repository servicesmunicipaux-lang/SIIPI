-- ============================================================================
-- 090 — Le coût de collecte, par engin et par circuit (lot C)
-- docs/specs_metier/DECISIONS_2026-10-20.md, complément du 26/10/2026 (lot C) ;
-- docs/specs_metier/sources/GUIDE_TADAEEM_LECTURE.md (G7 à G11) ; méthode du
-- coût complet (lot 17.5) : Z = A + B + C + D.
--
--   A  charges directes  personnel, carburant, entretien, redevance ANGeD
--   B  amortissement     des engins
--   C + D  frais indirects (parc, administration) : seulement ceux d'une étude de
--          coût complet de la commune (17.5) ; AUCUN FORFAIT (G9) — un « 20 % de
--          frais généraux » se lirait comme un chiffre réel.
--
-- LE RÉEL D'ABORD. Chaque composante vient d'un registre de SIIPI ; un ratio du
-- guide ne la remplace que s'il n'y a pas de registre, et elle le dit
-- (« ratio du guide », « prix du guide »). Sans l'un ni l'autre, la composante est
-- absente, et le total n'existe pas : jamais calculé sur un 0.
--
-- Les décisions du 26/10/2026 :
--   G7  la masse salariale saisie est la rémunération publique du budget, charges
--       comprises : aucun taux de charges ajouté ;
--   G8  durée d'amortissement = la plus grande de la durée de référence (10 ans)
--       et de l'âge de l'engin (§ 2.4.4) ;
--   G10 aucun ratio de lubrifiants : ils sont dans l'entretien ;
--   G11 le prix du gasoil est un paramètre national daté, jamais 1,825 figé ;
--   un engin reçu en don n'est pas amorti ; un prix d'achat absent prend le prix
--   indicatif du Tableau 3, dit « prix du guide ».
--
-- UN ATTELAGE EST UNE UNITÉ. Le prix du guide pour un « tracteur et remorque
-- agricole » couvre les deux : le coût d'un engin de circuit compte le tracteur et
-- sa remorque attelée ensemble, au prix réel des deux s'ils sont connus, sinon au
-- prix du guide de l'unité.
--
-- Le coût à la tonne ne se rapporte qu'au PESÉ, et seulement quand tous les
-- voyages attendus du circuit sont pesés (même règle que le taux de collecte, K).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Un engin reçu en don
-- ---------------------------------------------------------------------------
ALTER TABLE vehicules ADD COLUMN IF NOT EXISTS acquis_par_don BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN vehicules.acquis_par_don IS
  'L''engin a été reçu en don : il n''est pas amorti (la commune ne l''a pas payé). Son entretien, lui, se compte.';

-- ---------------------------------------------------------------------------
-- 2. Les paramètres nationaux du coût (lot 17.3 : datés, sourcés, tenus par la FNCT)
-- ---------------------------------------------------------------------------
INSERT INTO definitions_parametres_nationaux (code, nature, unite, borne_min, borne_max, libelle_fr, libelle_ar, description, ordre) VALUES
  ('prix_gasoil', 'nombre', 'TND/l', 0, 20,
   'Prix du gasoil', 'سعر الغازوال',
   'Prix à la pompe, à la date de chaque estimation. Ne sert qu''à estimer le carburant d''un engin sans plein enregistré (consommation du guide par séance).', 40),
  ('taux_entretien_neuf', 'nombre', '%', 0, 100,
   'Entretien d''un engin neuf (% du prix d''achat par an)', 'صيانة معدة جديدة (% من سعر الشراء سنويًا)',
   'Ratio du guide, faute d''intervention enregistrée : de ce taux pour un engin neuf au taux de fin de vie à 10 ans, en ligne droite.', 50),
  ('taux_entretien_fin_de_vie', 'nombre', '%', 0, 100,
   'Entretien d''un engin en fin de vie (% du prix d''achat par an)', 'صيانة معدة في آخر عمرها (% من سعر الشراء سنويًا)',
   'Ratio du guide, atteint à 10 ans d''âge et au-delà.', 51),
  ('duree_amortissement_engins', 'nombre', 'ans', 1, 50,
   'Durée d''amortissement des engins', 'مدة استهلاك المعدات',
   'Durée de référence ; un engin plus âgé s''amortit sur son âge (décision du 26/10/2026).', 52)
ON CONFLICT (code) DO NOTHING;

INSERT INTO valeurs_parametres_nationaux (code, date_effet, valeur_nombre, provisoire, reference)
SELECT v.code, DATE '2000-01-01', v.valeur, false, v.reference
  FROM (VALUES
    ('taux_entretien_neuf', 6::numeric, 'Guide d''optimisation de la collecte des DMA en Tunisie (USAID TADAEEM, MALE), § 2.4.4 : 6 % pour un engin neuf'),
    ('taux_entretien_fin_de_vie', 14::numeric, 'Guide d''optimisation de la collecte des DMA en Tunisie (USAID TADAEEM, MALE), § 2.4.4 : 14 % en fin de vie'),
    ('duree_amortissement_engins', 10::numeric, 'Guide d''optimisation de la collecte des DMA en Tunisie (USAID TADAEEM, MALE), Tableau 3 : 10 ans')
  ) AS v(code, valeur, reference)
 WHERE NOT EXISTS (SELECT 1 FROM valeurs_parametres_nationaux x WHERE x.code = v.code);

-- ---------------------------------------------------------------------------
-- 3. Les références du guide par classe d'engin (Tableau 3, consommation par séance)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS references_cout_engins (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    classe          TEXT NOT NULL REFERENCES classes_engins(code),
    tranche_m3      NUMRANGE,
    prix_neuf_tnd   NUMERIC(12, 2),
    conso_l_seance  NUMERIC(6, 1),
    date_effet      DATE NOT NULL,
    source          TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    retire_le       TIMESTAMPTZ,
    motif_retrait   TEXT,
    CONSTRAINT references_cout_positifs CHECK ((prix_neuf_tnd IS NULL OR prix_neuf_tnd > 0) AND (conso_l_seance IS NULL OR conso_l_seance > 0)),
    CONSTRAINT references_cout_utile CHECK (prix_neuf_tnd IS NOT NULL OR conso_l_seance IS NOT NULL),
    CONSTRAINT references_cout_source CHECK (length(btrim(source)) > 0)
);
COMMENT ON TABLE references_cout_engins IS
  'Les valeurs indicatives du guide par classe d''engin et tranche de volume (lot C) : prix neuf (Tableau 3) et consommation de gasoil par séance. Elles ne servent qu''à défaut du prix d''achat réel ou d''un plein enregistré, et le coût le dit.';
COMMENT ON COLUMN references_cout_engins.tranche_m3 IS
  'La tranche de volume de la benne : chaque modèle du guide (benne tasseuse de 7, 12, 16, 20 m³…) couvre les volumes jusqu''au sien. Vide : tout volume.';

ALTER TABLE references_cout_engins ENABLE ROW LEVEL SECURITY;
ALTER TABLE references_cout_engins FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS references_cout_engins_select ON references_cout_engins;
CREATE POLICY references_cout_engins_select ON references_cout_engins FOR SELECT USING (app.is_authenticated());
GRANT SELECT ON references_cout_engins TO siipi_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON references_cout_engins FROM siipi_app;

INSERT INTO references_cout_engins (classe, tranche_m3, prix_neuf_tnd, conso_l_seance, date_effet, source)
SELECT v.classe, v.tranche::numrange, v.prix, v.conso, DATE '2000-01-01',
       'Guide d''optimisation de la collecte des DMA en Tunisie (USAID TADAEEM, MALE), ' || v.ref
  FROM (VALUES
    ('benne_tasseuse', '[7,8]', 187000, 18, 'Tableau 3 (BT7) et consommation par séance (BT7)'),
    ('benne_tasseuse', '(8,12]', 270000, 22, 'Tableau 3 (BT12) et consommation par séance (BT12)'),
    ('benne_tasseuse', '(12,16]', 380000, 32, 'Tableau 3 (BT16) et consommation par séance (BT16)'),
    ('benne_tasseuse', '(16,22]', 420000, NULL, 'Tableau 3 (BT20) ; pas de consommation donnée'),
    ('benne_basculante', '(,6.5]', 85000, 15, 'Tableau 3 (Cbb3,5) et consommation par séance (Cbb3,5)'),
    ('benne_basculante', '(6.5,)', NULL, 20, 'consommation par séance (Cbb7) ; pas de prix donné'),
    ('pick_up', NULL, 65000, 10, 'Tableau 3 (pick-up) et consommation par séance'),
    ('tracteur_remorque_agricole', NULL, 60000, 10, 'Tableau 3 (Tag) et consommation par séance'),
    ('ampli_roll', NULL, 500000, 35, 'Tableau 3 (camion ampli-roll) et consommation par séance')
  ) AS v(classe, tranche, prix, conso, ref)
 WHERE NOT EXISTS (SELECT 1 FROM references_cout_engins r
                    WHERE r.classe = v.classe AND r.tranche_m3 IS NOT DISTINCT FROM v.tranche::numrange);

CREATE OR REPLACE FUNCTION app.reference_cout_engin(p_classe text, p_volume numeric, p_jour date)
  RETURNS TABLE (prix_neuf_tnd numeric, conso_l_seance numeric, source text)
  LANGUAGE sql STABLE SET search_path = public, pg_temp SET jit = off AS
$$
  SELECT r.prix_neuf_tnd, r.conso_l_seance, r.source
    FROM references_cout_engins r
   WHERE r.classe = p_classe AND r.retire_le IS NULL AND r.date_effet <= p_jour
     AND (r.tranche_m3 IS NULL OR r.tranche_m3 @> p_volume)
   ORDER BY r.date_effet DESC, r.created_at DESC
   LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION app.reference_cout_engin(text, numeric, date) TO siipi_app;

-- ---------------------------------------------------------------------------
-- 4. Le coût de chaque engin de circuit sur la période (avant ventilation)
-- ---------------------------------------------------------------------------
-- Les composantes annuelles (amortissement, entretien au ratio) se rapportent aux
-- jours de la période ; la période s'arrête à aujourd'hui.
CREATE OR REPLACE FUNCTION app._cout_engins(p_commune text, p_debut date, p_fin date)
  RETURNS TABLE (
    vehicule_id text, immat text, classe text, volume_m3 numeric, membres text[], age_ans integer,
    valeur_tnd numeric, valeur_provenance text, duree_ans numeric,
    amortissement_tnd numeric, amortissement_provenance text,
    entretien_tnd numeric, entretien_provenance text,
    carburant_tnd numeric, carburant_provenance text, seances integer)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp SET jit = off AS
$$
  WITH b AS (
    SELECT p_debut AS debut, LEAST(p_fin, (now() AT TIME ZONE 'Africa/Tunis')::date) AS fin
  ), j AS (
    SELECT b.*, (b.fin - b.debut + 1)::numeric AS jours,
           (SELECT valeur_nombre FROM app.parametre_national('prix_gasoil', b.fin)) AS prix_gasoil,
           (SELECT valeur_nombre FROM app.parametre_national('taux_entretien_neuf', b.fin)) AS taux_neuf,
           (SELECT valeur_nombre FROM app.parametre_national('taux_entretien_fin_de_vie', b.fin)) AS taux_fin,
           (SELECT valeur_nombre FROM app.parametre_national('duree_amortissement_engins', b.fin)) AS duree_ref
      FROM b
  ), unites AS (
    SELECT DISTINCT c.vehicule_id AS id
      FROM circuits c
     WHERE c.commune_id = p_commune AND c.deleted_at IS NULL AND c.actif AND c.prestataire_id IS NULL
       AND c.vehicule_id IS NOT NULL AND app.can_read_commune(p_commune)
  ), membres AS (
    SELECT u.id AS unite, v.*
      FROM unites u
      JOIN vehicules v ON v.deleted_at IS NULL
                      AND (v.id = u.id OR (v.attele_a = u.id AND EXISTS (SELECT 1 FROM vehicules t WHERE t.id = u.id AND t.type = 'tracteur')))
  ), par_unite AS (
    SELECT m.unite,
           array_agg(m.id ORDER BY m.id) AS ids,
           bool_and(m.acquis_par_don) AS tout_don,
           bool_and(m.valeur_achat_tnd IS NOT NULL OR m.acquis_par_don) AS valeurs_connues,
           bool_and(m.valeur_achat_tnd IS NOT NULL) AS prix_tous_connus,
           sum(m.valeur_achat_tnd) FILTER (WHERE NOT m.acquis_par_don) AS valeur_payee,
           sum(m.valeur_achat_tnd) AS valeur_totale
      FROM membres m GROUP BY m.unite
  ), base AS (
    SELECT u.id, v.registration, t.classe, t.volume_m3, pu.*,
           -- L'âge de l'engin moteur, sinon celui de sa remorque.
           extract(year FROM age(j.fin, COALESCE(v.date_premiere_circulation,
                   (SELECT min(m.date_premiere_circulation) FROM membres m WHERE m.unite = u.id))))::integer AS age,
           r.prix_neuf_tnd AS prix_guide, r.conso_l_seance,
           (SELECT count(*) FROM interventions_maintenance im WHERE im.vehicule_id = ANY (pu.ids) AND im.deleted_at IS NULL) AS interventions_jamais,
           (SELECT sum(im.cout_tnd) FROM interventions_maintenance im WHERE im.vehicule_id = ANY (pu.ids) AND im.deleted_at IS NULL
               AND im.date_intervention BETWEEN j.debut AND j.fin) AS entretien_reel,
           (SELECT count(*) FROM interventions_maintenance im WHERE im.vehicule_id = ANY (pu.ids) AND im.deleted_at IS NULL
               AND im.date_intervention BETWEEN j.debut AND j.fin AND im.cout_tnd IS NULL) AS interventions_sans_cout,
           (SELECT count(*) FROM fuel_logs f WHERE f.vehicule_id = ANY (pu.ids) AND f.deleted_at IS NULL
               AND f.date_plein BETWEEN j.debut AND j.fin) AS pleins,
           (SELECT sum(f.montant_tnd) FROM fuel_logs f WHERE f.vehicule_id = ANY (pu.ids) AND f.deleted_at IS NULL
               AND f.date_plein BETWEEN j.debut AND j.fin) AS carburant_reel,
           -- Les séances : les jours de passage d'au moins un circuit de l'engin.
           (SELECT count(DISTINCT d::date) FROM circuits c
              CROSS JOIN LATERAL generate_series(GREATEST(j.debut, c.date_debut), LEAST(j.fin, COALESCE(c.date_fin, j.fin)), interval '1 day') d
             WHERE c.vehicule_id = u.id AND c.commune_id = p_commune AND c.deleted_at IS NULL AND c.actif AND c.prestataire_id IS NULL
               AND extract(isodow FROM d)::smallint = ANY (c.jours_passage))::integer AS seances,
           j.jours, j.prix_gasoil, j.taux_neuf, j.taux_fin, j.duree_ref
      FROM unites u
      JOIN vehicules v ON v.id = u.id
      JOIN par_unite pu ON pu.unite = u.id
      CROSS JOIN j
      LEFT JOIN LATERAL app.engin_de_travail(u.id) t ON true
      LEFT JOIN LATERAL app.reference_cout_engin(t.classe, t.volume_m3, j.fin) r ON true
  ), calcul AS (
    SELECT b.*,
           CASE WHEN b.tout_don THEN 0
                WHEN b.valeurs_connues THEN COALESCE(b.valeur_payee, 0)
                ELSE b.prix_guide END AS valeur_amortie,
           CASE WHEN b.tout_don THEN 'don'
                WHEN b.valeurs_connues THEN 'reel'
                WHEN b.prix_guide IS NOT NULL THEN 'prix_guide' END AS valeur_prov,
           -- Le prix qui fonde le ratio d'entretien : un engin reçu en don s'entretient comme un autre.
           CASE WHEN b.prix_tous_connus THEN b.valeur_totale ELSE b.prix_guide END AS prix_entretien,
           GREATEST(b.duree_ref, COALESCE(b.age, 0)) AS duree
      FROM base b
  )
  SELECT c.id, c.registration, c.classe, c.volume_m3, c.ids, c.age,
         c.valeur_amortie, c.valeur_prov, c.duree,
         CASE WHEN c.valeur_prov = 'don' THEN 0
              WHEN c.valeur_amortie IS NOT NULL AND c.duree > 0 THEN round(c.valeur_amortie / c.duree * c.jours / 365, 3) END,
         CASE WHEN c.valeur_prov = 'don' OR (c.valeur_amortie IS NOT NULL AND c.duree > 0) THEN c.valeur_prov END,
         CASE WHEN c.interventions_jamais > 0 THEN
                CASE WHEN c.interventions_sans_cout > 0 THEN NULL ELSE COALESCE(c.entretien_reel, 0) END
              WHEN c.prix_entretien IS NOT NULL AND c.age IS NOT NULL AND c.taux_neuf IS NOT NULL AND c.taux_fin IS NOT NULL THEN
                round(c.prix_entretien * (c.taux_neuf + (c.taux_fin - c.taux_neuf) * LEAST(c.age, 10) / 10.0) / 100 * c.jours / 365, 3) END,
         CASE WHEN c.interventions_jamais > 0 THEN CASE WHEN c.interventions_sans_cout > 0 THEN NULL ELSE 'reel' END
              WHEN c.prix_entretien IS NOT NULL AND c.age IS NOT NULL AND c.taux_neuf IS NOT NULL AND c.taux_fin IS NOT NULL THEN 'ratio_guide' END,
         CASE WHEN c.pleins > 0 THEN c.carburant_reel
              WHEN c.seances = 0 THEN 0
              WHEN c.conso_l_seance IS NOT NULL AND c.prix_gasoil IS NOT NULL THEN round(c.conso_l_seance * c.seances * c.prix_gasoil, 3) END,
         CASE WHEN c.pleins > 0 THEN 'reel'
              WHEN c.seances = 0 THEN 'sans_activite'
              WHEN c.conso_l_seance IS NOT NULL AND c.prix_gasoil IS NOT NULL THEN 'ratio_guide' END,
         c.seances
    FROM calcul c
   ORDER BY c.registration
$$;
REVOKE ALL ON FUNCTION app._cout_engins(text, date, date) FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.cout_collecte_engins(p_commune text, p_debut date, p_fin date)
  RETURNS TABLE (
    vehicule_id text, immat text, classe text, volume_m3 numeric, membres text[], age_ans integer,
    valeur_tnd numeric, valeur_provenance text, duree_ans numeric,
    amortissement_tnd numeric, amortissement_provenance text,
    entretien_tnd numeric, entretien_provenance text,
    carburant_tnd numeric, carburant_provenance text, seances integer)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp SET jit = off AS
$$
  SELECT * FROM app._cout_engins(p_commune, p_debut, p_fin) WHERE app.can_read_commune(p_commune)
$$;
GRANT EXECUTE ON FUNCTION app.cout_collecte_engins(text, date, date) TO siipi_app;
COMMENT ON FUNCTION app.cout_collecte_engins(text, date, date) IS
  'Le coût de chaque engin de circuit (avec sa remorque attelée) sur la période : amortissement, entretien, carburant, chacun avec sa provenance (reel, ratio_guide, prix_guide, don) ou absent (NULL). Avant ventilation sur les circuits.';

-- ---------------------------------------------------------------------------
-- 5. Le coût de chaque circuit
-- ---------------------------------------------------------------------------
-- Le coût d'un engin se ventile sur ses circuits au prorata des kilomètres du
-- carnet de bord, sinon des voyages attendus. Le personnel : la masse salariale
-- de l'année, rapportée aux jours de la période, au prorata des jours de pointage
-- sur le circuit (sur tous les jours pointés), sinon de l'équipe du circuit (sur
-- l'effectif du service).
CREATE OR REPLACE FUNCTION app.cout_collecte_circuits(p_commune text, p_debut date, p_fin date)
  RETURNS TABLE (
    circuit_id uuid, circuit text, vehicule_immat text, cle_engin text,
    personnel_tnd numeric, personnel_cle text,
    carburant_tnd numeric, carburant_provenance text,
    entretien_tnd numeric, entretien_provenance text,
    amortissement_tnd numeric, amortissement_provenance text,
    redevance_tnd numeric,
    total_tnd numeric, pese_t numeric, voyages_attendus integer, voyages_peses integer, cout_tonne numeric,
    manque text[])
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp SET jit = off AS
$$
  WITH b AS (
    SELECT p_debut AS debut, LEAST(p_fin, (now() AT TIME ZONE 'Africa/Tunis')::date) AS fin
  ), cv AS (
    SELECT c.* FROM circuits c
     WHERE c.commune_id = p_commune AND c.deleted_at IS NULL AND c.actif AND c.prestataire_id IS NULL
       AND app.can_read_commune(p_commune)
  ), voy AS (
    SELECT c.id, count(*)::integer AS attendus, count(p.id)::integer AS peses
      FROM cv c CROSS JOIN b
      CROSS JOIN LATERAL generate_series(GREATEST(b.debut, c.date_debut), LEAST(b.fin, COALESCE(c.date_fin, b.fin)), interval '1 day') d
      CROSS JOIN LATERAL generate_series(1, GREATEST(COALESCE(c.voyages_par_jour, 1), 1)) v(voyage)
      LEFT JOIN pesees p ON p.circuit_id = c.id AND p.date_pesee = d::date AND p.voyage = v.voyage AND p.deleted_at IS NULL
     WHERE extract(isodow FROM d)::smallint = ANY (c.jours_passage)
     GROUP BY c.id
  ), engins AS (
    SELECT * FROM app._cout_engins(p_commune, p_debut, p_fin)
  ), km AS (
    SELECT cb.circuit_id, e.vehicule_id, sum(cb.parcouru) AS km
      FROM carnets_de_bord cb CROSS JOIN b
      JOIN engins e ON cb.vehicule_id = ANY (e.membres)
     WHERE cb.deleted_at IS NULL AND cb.circuit_id IS NOT NULL AND cb.parcouru IS NOT NULL
       AND cb.jour BETWEEN b.debut AND b.fin
     GROUP BY cb.circuit_id, e.vehicule_id
  ), parts AS (
    -- La part de chaque circuit dans le coût de son engin.
    SELECT c.id AS circuit_id, c.vehicule_id,
           CASE WHEN COALESCE((SELECT sum(k.km) FROM km k WHERE k.vehicule_id = c.vehicule_id), 0) > 0
                THEN 'km' ELSE 'voyages' END AS cle,
           CASE WHEN COALESCE((SELECT sum(k.km) FROM km k WHERE k.vehicule_id = c.vehicule_id), 0) > 0
                THEN COALESCE((SELECT k.km FROM km k WHERE k.vehicule_id = c.vehicule_id AND k.circuit_id = c.id), 0)
                     / (SELECT sum(k.km) FROM km k WHERE k.vehicule_id = c.vehicule_id)
                WHEN COALESCE((SELECT sum(v2.attendus) FROM cv c2 JOIN voy v2 ON v2.id = c2.id WHERE c2.vehicule_id = c.vehicule_id), 0) > 0
                THEN COALESCE((SELECT v.attendus FROM voy v WHERE v.id = c.id), 0)::numeric
                     / (SELECT sum(v2.attendus) FROM cv c2 JOIN voy v2 ON v2.id = c2.id WHERE c2.vehicule_id = c.vehicule_id)
                ELSE 0 END AS part
      FROM cv c WHERE c.vehicule_id IS NOT NULL
  ), personnel AS (
    SELECT (SELECT es.masse_salariale_tnd FROM effectifs_service es
             WHERE es.commune_id = p_commune AND es.service = 'proprete' AND es.annee = extract(year FROM b.debut)) AS masse_an,
           (SELECT COALESCE(es.effectif_ouvriers, 0) + COALESCE(es.effectif_encadrement, 0) FROM effectifs_service es
             WHERE es.commune_id = p_commune AND es.service = 'proprete' AND es.annee = extract(year FROM b.debut)) AS effectif,
           (SELECT count(*) FROM presences pr WHERE pr.commune_id = p_commune AND pr.present
               AND pr.jour BETWEEN b.debut AND b.fin) AS jours_pointes,
           (b.fin - b.debut + 1)::numeric / 365 AS fraction
      FROM b
  ), redevance AS (
    SELECT p.circuit_id, sum(p.poids_net_kg) / 1000 AS t, sum(p.poids_net_kg / 1000 * x.valeur_nombre) AS montant,
           count(*) FILTER (WHERE x.valeur_nombre IS NULL) AS sans_taux
      FROM pesees p CROSS JOIN b
      LEFT JOIN LATERAL app.parametre_national('redevance_anged', p.date_pesee) x ON true
     WHERE p.commune_id = p_commune AND p.deleted_at IS NULL AND p.date_pesee BETWEEN b.debut AND b.fin
       AND p.circuit_id IS NOT NULL
     GROUP BY p.circuit_id
  ), lignes AS (
    SELECT c.id, c.nom, v.registration, pa.cle,
           -- Personnel : pointage, sinon équipe ; sans masse salariale ni clé, absent.
           CASE WHEN pe.masse_an IS NULL THEN NULL
                WHEN pe.jours_pointes > 0 THEN round(pe.masse_an * pe.fraction
                     * (SELECT count(*) FROM presences pr CROSS JOIN b WHERE pr.circuit_id = c.id AND pr.present AND pr.jour BETWEEN b.debut AND b.fin)
                     / pe.jours_pointes, 3)
                WHEN pe.effectif > 0 THEN round(pe.masse_an * pe.fraction
                     * (SELECT count(*) FROM circuit_equipe ce CROSS JOIN b WHERE ce.circuit_id = c.id AND ce.date_debut <= b.fin
                          AND (ce.date_fin IS NULL OR ce.date_fin >= b.debut)) / pe.effectif, 3) END AS personnel,
           CASE WHEN pe.masse_an IS NULL THEN NULL WHEN pe.jours_pointes > 0 THEN 'pointage' WHEN pe.effectif > 0 THEN 'equipe' END AS personnel_cle,
           CASE WHEN c.vehicule_id IS NULL THEN NULL ELSE round(e.carburant_tnd * pa.part, 3) END AS carburant,
           e.carburant_provenance AS carburant_prov,
           CASE WHEN c.vehicule_id IS NULL THEN NULL ELSE round(e.entretien_tnd * pa.part, 3) END AS entretien,
           e.entretien_provenance AS entretien_prov,
           CASE WHEN c.vehicule_id IS NULL THEN NULL ELSE round(e.amortissement_tnd * pa.part, 3) END AS amortissement,
           e.amortissement_provenance AS amortissement_prov,
           CASE WHEN r.t IS NOT NULL AND r.sans_taux = 0 THEN round(r.montant, 3) END AS redevance,
           round(r.t, 3) AS pese_t, vo.attendus, vo.peses
      FROM cv c CROSS JOIN personnel pe
      LEFT JOIN vehicules v ON v.id = c.vehicule_id
      LEFT JOIN parts pa ON pa.circuit_id = c.id
      LEFT JOIN engins e ON e.vehicule_id = c.vehicule_id
      LEFT JOIN redevance r ON r.circuit_id = c.id
      LEFT JOIN voy vo ON vo.id = c.id
  )
  SELECT l.id, l.nom, l.registration, l.cle,
         l.personnel, l.personnel_cle,
         l.carburant, CASE WHEN l.carburant IS NOT NULL THEN l.carburant_prov END,
         l.entretien, CASE WHEN l.entretien IS NOT NULL THEN l.entretien_prov END,
         l.amortissement, CASE WHEN l.amortissement IS NOT NULL THEN l.amortissement_prov END,
         l.redevance,
         CASE WHEN m.manque = '{}' THEN l.personnel + l.carburant + l.entretien + l.amortissement + l.redevance END,
         l.pese_t, COALESCE(l.attendus, 0), COALESCE(l.peses, 0),
         -- La tonne pesée, et seulement quand tous les voyages attendus sont pesés.
         CASE WHEN m.manque = '{}' AND l.attendus > 0 AND l.peses = l.attendus AND l.pese_t > 0
              THEN round((l.personnel + l.carburant + l.entretien + l.amortissement + l.redevance) / l.pese_t, 3) END,
         m.manque
    FROM lignes l
    CROSS JOIN LATERAL (SELECT ARRAY(SELECT x FROM unnest(ARRAY[
             CASE WHEN l.personnel IS NULL THEN 'personnel' END,
             CASE WHEN l.registration IS NULL THEN 'engin' END,
             CASE WHEN l.registration IS NOT NULL AND l.carburant IS NULL THEN 'carburant' END,
             CASE WHEN l.registration IS NOT NULL AND l.entretien IS NULL THEN 'entretien' END,
             CASE WHEN l.registration IS NOT NULL AND l.amortissement IS NULL THEN 'amortissement' END,
             CASE WHEN l.redevance IS NULL THEN 'redevance' END]) x WHERE x IS NOT NULL) AS manque) m
   ORDER BY l.nom
$$;
GRANT EXECUTE ON FUNCTION app.cout_collecte_circuits(text, date, date) TO siipi_app;
COMMENT ON FUNCTION app.cout_collecte_circuits(text, date, date) IS
  'Le coût direct de chaque circuit sur la période (A + B) : personnel, carburant, entretien, amortissement, redevance, chacun avec sa provenance ; le total seulement si rien ne manque ; le coût à la tonne pesée seulement si tous les voyages attendus sont pesés. « manque » dit ce qui empêche le total.';

-- ---------------------------------------------------------------------------
-- 6. Les frais indirects : seulement ceux d'une étude de coût complet (17.5)
-- ---------------------------------------------------------------------------
-- Quote-part du parc (C) et de l'administration (D) retenues par l'étude de
-- l'exercice, rapportées aux jours de la période. Sans étude, ou sans l'une des
-- deux, rien : aucun forfait.
CREATE OR REPLACE FUNCTION app.cout_collecte_indirects(p_commune text, p_debut date, p_fin date)
  RETURNS TABLE (etude_id uuid, document text, exercice integer, parc_tnd numeric, administration_tnd numeric, indirects_tnd numeric)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp SET jit = off AS
$$
  WITH b AS (
    SELECT (LEAST(p_fin, (now() AT TIME ZONE 'Africa/Tunis')::date) - p_debut + 1)::numeric AS jours,
           extract(year FROM p_debut)::int AS exercice
  ), e AS (
    SELECT et.* FROM etudes_cout_complet et, b
     WHERE et.commune_id = p_commune AND et.exercice = b.exercice AND app.can_read_commune(p_commune)
     ORDER BY et.created_at DESC LIMIT 1
  ), v AS (
    SELECT e.id,
           (SELECT sum(x.montant) FROM valeurs_cout_complet x WHERE x.etude_id = e.id AND x.nature = 'poste' AND x.retenue
               AND x.code = 'qp_parc' AND x.montant IS NOT NULL) AS parc,
           (SELECT sum(x.montant) FROM valeurs_cout_complet x WHERE x.etude_id = e.id AND x.nature = 'poste' AND x.retenue
               AND x.code IN ('qp_siege', 'qp_direction', 'qp_administration') AND x.montant IS NOT NULL) AS adm
      FROM e
  )
  SELECT e.id, e.document, e.exercice,
         round(v.parc * b.jours / 365, 3), round(v.adm * b.jours / 365, 3),
         CASE WHEN v.parc IS NOT NULL AND v.adm IS NOT NULL THEN round((v.parc + v.adm) * b.jours / 365, 3) END
    FROM e JOIN v ON v.id = e.id CROSS JOIN b
$$;
GRANT EXECUTE ON FUNCTION app.cout_collecte_indirects(text, date, date) TO siipi_app;
