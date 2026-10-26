-- ============================================================================
-- 089 — Les indicateurs du guide de référence (lot K)
-- docs/specs_metier/DECISIONS_2026-10-20.md, complément du 26/10/2026 (lot K) ;
-- docs/specs_metier/sources/GUIDE_TADAEEM_LECTURE.md (§ 1.2.7, G6).
--
-- Cinq indicateurs de performance de la collecte. Quatre entrent ici ; le coût à la
-- tonne existe déjà (COUT_TONNE, sur le pesé), il ne change pas.
--
--   TAUX_COLLECTE         collecté ÷ produit — MESURÉ seulement quand TOUS les
--                         voyages attendus de la période sont pesés : un pesé
--                         partiel divisé par toute la production montrerait une
--                         collecte faussement basse.
--   TAUX_COLLECTE_ESTIME  la même chose pour une commune qui ne pèse RIEN : la
--                         fourchette estimée (17.2) ÷ produit, dite estimée. Un
--                         mois mêlé (une part pesée, une part non) n'a ni l'un ni
--                         l'autre : « non renseigné », il manque des pesées.
--   TAUX_REMPLISSAGE      pesé ÷ capacité de la benne pleine (volume × densité),
--                         sur les seuls voyages pesés, en fourchette.
--   TAUX_COUVERTURE       population des secteurs desservis ÷ population : mesuré
--                         quand chaque secteur a sa population et que des circuits
--                         y sont rattachés ; sinon déclaré par la commune.
--   POINTS_NOIRS          points noirs non résorbés : mesuré dès qu'un inventaire
--                         existe ; sinon déclaré (« inventaire fait le … : aucun »).
--                         Un zéro sans inventaire n'existe pas.
--
-- UNE ESTIMATION N'EST JAMAIS AJOUTÉE À UNE PESÉE, pas plus dans un taux que dans
-- un total : le taux de collecte mesuré ne lit que le pesé, l'estimé que l'estimé.
--
-- Les deux calculs existants (_mesures_kpi_periode, _mesures_kpi_auto_periode,
-- migration 070) et app.source_tenue gardent leur corps, renommé « _base » ; les
-- fonctions du même nom l'appellent et ajoutent les indicateurs du guide. Les
-- appelants (fiche annuelle, séries, tableau national) n'ont rien à changer. Une
-- migration qui voudrait réécrire l'un de ces calculs réécrit le « _base ».
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. La résorption d'un point noir : datée, jamais un effacement
-- ---------------------------------------------------------------------------
ALTER TABLE points_collecte ADD COLUMN IF NOT EXISTS resorbe_le DATE;
ALTER TABLE points_collecte DROP CONSTRAINT IF EXISTS points_collecte_resorption;
ALTER TABLE points_collecte ADD CONSTRAINT points_collecte_resorption
  CHECK (resorbe_le IS NULL OR (type = 'point_noir' AND resorbe_le >= DATE '2000-01-01'));
COMMENT ON COLUMN points_collecte.resorbe_le IS
  'Pour un point noir : le jour où il a été résorbé. Le point reste à l''inventaire, daté ; le supprimer effacerait qu''il a existé. Vide : toujours là.';

-- ---------------------------------------------------------------------------
-- 2. Un indicateur en fourchette
-- ---------------------------------------------------------------------------
ALTER TABLE indicateurs_kpi ADD COLUMN IF NOT EXISTS fourchette BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN indicateurs_kpi.fourchette IS
  'La valeur est une fourchette : « valeur » en est la borne basse, detail.valeur_max la haute (une densité est une plage). L''écran montre les deux ; aucun point milieu n''est calculé, il afficherait une précision que la mesure n''a pas.';

-- ---------------------------------------------------------------------------
-- 3. Les calculs partagés par les mesures et par « ce qui manque »
-- ---------------------------------------------------------------------------
-- Ils ne filtrent pas par droit d'accès : ce sont les fonctions publiques qui
-- leur passent les communes autorisées. Aucun droit pour siipi_app.

-- La production théorique de la période, en kg : kg/hab/j × population, jour par
-- jour (la population de saison en saison, comme le ratio retenu du lot 17.1),
-- jusqu'à aujourd'hui. NULL sans repère ou sans population.
CREATE OR REPLACE FUNCTION app._production_theorique_kg(p_commune text, p_debut date, p_fin date)
  RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  WITH r AS (
    SELECT COALESCE(p.population_permanente, NULLIF(c.population, 0)) AS permanente,
           p.population_saisonniere, p.saison_debut_mois, p.saison_fin_mois,
           p.production_theorique_kg_hab_j AS theorique
      FROM communes c LEFT JOIN parametres_commune p ON p.commune_id = c.id
     WHERE c.id = p_commune
  )
  SELECT sum(r.theorique * CASE WHEN r.population_saisonniere IS NOT NULL
                                     AND app.mois_en_saison(extract(month FROM j)::int, r.saison_debut_mois, r.saison_fin_mois)
                                    THEN r.population_saisonniere ELSE r.permanente END)
    FROM r, generate_series(p_debut, LEAST(p_fin, (now() AT TIME ZONE 'Africa/Tunis')::date), interval '1 day') AS j
   WHERE r.theorique > 0 AND r.permanente > 0
$$;

-- Les voyages attendus de la période (règle de app.pesees_attendues : jours de
-- passage, voyages du jour, période de validité, régie), et ceux qui sont pesés.
CREATE OR REPLACE FUNCTION app._voyages_periode(p_commune text, p_debut date, p_fin date)
  RETURNS TABLE (attendus integer, peses integer)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT count(*)::integer, count(p.id)::integer
    FROM circuits c
    CROSS JOIN LATERAL generate_series(GREATEST(p_debut, c.date_debut),
                                       LEAST(p_fin, COALESCE(c.date_fin, p_fin), (now() AT TIME ZONE 'Africa/Tunis')::date),
                                       interval '1 day') AS j
    CROSS JOIN LATERAL generate_series(1, GREATEST(COALESCE(c.voyages_par_jour, 1), 1)) AS v(voyage)
    LEFT JOIN pesees p ON p.circuit_id = c.id AND p.date_pesee = j::date AND p.voyage = v.voyage AND p.deleted_at IS NULL
   WHERE c.commune_id = p_commune AND c.deleted_at IS NULL AND c.actif AND c.prestataire_id IS NULL
     AND extract(isodow FROM j)::smallint = ANY (c.jours_passage)
$$;

-- L'estimation de la commune entière sur la période (17.2), complète ou non. Elle
-- n'est complète que si chaque circuit ménager qui a des voyages attendus
-- s'estime, qu'aucun n'est pesé, et qu'aucun circuit ménager n'est confié à un
-- prestataire (ses tonnages ne s'estiment pas : le taux serait trop bas).
CREATE OR REPLACE FUNCTION app._estimation_periode(p_commune text, p_debut date, p_fin date)
  RETURNS TABLE (complete boolean, tonnage_min_t numeric, tonnage_max_t numeric, circuits integer)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  WITH mois AS (
    SELECT m::date AS m FROM generate_series(date_trunc('month', p_debut), p_fin, interval '1 month') AS m
  ), lignes AS (
    SELECT t.* FROM mois CROSS JOIN LATERAL app.tonnage_estime(p_commune, mois.m) t
     WHERE t.type_dechet = 'menager' AND t.voyages_attendus > 0
  )
  SELECT COALESCE(count(*) > 0
                  AND bool_and(l.manque IS NULL AND l.voyages_peses = 0)
                  AND sum(l.tonnage_max_t) > 0
                  AND NOT EXISTS (SELECT 1 FROM pesees p WHERE p.commune_id = p_commune AND p.deleted_at IS NULL
                                     AND p.type_dechet = 'menager' AND p.date_pesee BETWEEN p_debut AND p_fin)
                  AND NOT EXISTS (SELECT 1 FROM circuits c WHERE c.commune_id = p_commune AND c.deleted_at IS NULL
                                     AND c.actif AND c.prestataire_id IS NOT NULL AND c.type_dechet = 'menager'), false),
         sum(l.tonnage_min_t), sum(l.tonnage_max_t), count(DISTINCT l.circuit_id)::integer
    FROM lignes l
$$;

-- Le remplissage : les voyages pesés (ménagers) d'un engin dont on connaît la
-- benne et la densité du jour ; le pesé, et la capacité de la benne pleine.
CREATE OR REPLACE FUNCTION app._remplissage_periode(p_commune text, p_debut date, p_fin date)
  RETURNS TABLE (voyages integer, pese_t numeric, capacite_min_t numeric, capacite_max_t numeric)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT count(*)::integer, sum(p.poids_net_kg) / 1000, sum(t.volume_m3 * d.densite_min), sum(t.volume_m3 * d.densite_max)
    FROM pesees p
    JOIN circuits c ON c.id = p.circuit_id
    CROSS JOIN LATERAL app.engin_de_travail(COALESCE(p.vehicule_id, c.vehicule_id)) t
    CROSS JOIN LATERAL app.densite_retenue(t.classe, t.volume_m3, p.date_pesee) d
   WHERE p.commune_id = p_commune AND p.deleted_at IS NULL AND p.type_dechet = 'menager'
     AND p.date_pesee BETWEEN p_debut AND p_fin AND t.manque IS NULL
$$;

-- La couverture, aujourd'hui : complète quand la commune a des secteurs, chacun
-- avec sa population, au moins un desservi par un circuit actif, et une population.
CREATE OR REPLACE FUNCTION app._couverture(p_commune text)
  RETURNS TABLE (complete boolean, secteurs integer, secteurs_desservis integer, population_desservie numeric, population_totale numeric)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  WITH z AS (
    SELECT z.estimated_population AS pop,
           EXISTS (SELECT 1 FROM circuits c WHERE c.zone_id = z.id AND c.deleted_at IS NULL AND c.actif) AS desservi
      FROM zones_collecte z
     WHERE z.commune_id = p_commune AND z.deleted_at IS NULL AND z.status = 'active'
  ), tot AS (
    SELECT COALESCE(pc.population_permanente, NULLIF(c.population, 0))::numeric AS pop
      FROM communes c LEFT JOIN parametres_commune pc ON pc.commune_id = c.id WHERE c.id = p_commune
  )
  SELECT COALESCE(count(*) > 0 AND bool_and(z.pop > 0) AND bool_or(z.desservi) AND (SELECT pop FROM tot) > 0, false),
         count(*)::integer, (count(*) FILTER (WHERE z.desservi))::integer,
         sum(z.pop) FILTER (WHERE z.desservi), (SELECT pop FROM tot)
    FROM z
$$;

-- L'inventaire des points noirs à une date : relevés avant elle, non supprimés ;
-- ceux qui ne sont pas résorbés à cette date.
CREATE OR REPLACE FUNCTION app._points_noirs(p_commune text, p_fin date)
  RETURNS TABLE (inventaire integer, non_resorbes integer, resorbes integer)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT count(*)::integer,
         (count(*) FILTER (WHERE p.resorbe_le IS NULL OR p.resorbe_le > p_fin))::integer,
         (count(*) FILTER (WHERE p.resorbe_le <= p_fin))::integer
    FROM points_collecte p
   WHERE p.commune_id = p_commune AND p.deleted_at IS NULL AND p.type = 'point_noir'
     AND (p.created_at AT TIME ZONE 'Africa/Tunis')::date <= p_fin
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['app._production_theorique_kg(text, date, date)', 'app._voyages_periode(text, date, date)',
                           'app._estimation_periode(text, date, date)', 'app._remplissage_periode(text, date, date)',
                           'app._couverture(text)', 'app._points_noirs(text, date)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Les mesures du guide
-- ---------------------------------------------------------------------------
-- Seules les communes qui ont un circuit en régie se calculent : les 350 communes
-- de la fiche nationale n'ont pas à dérouler chaque jour de l'année pour rien.
CREATE OR REPLACE FUNCTION app._mesures_guide_periode(p_debut date, p_fin date, p_communes text[])
  RETURNS TABLE (commune_id text, code text, valeur numeric, note numeric, detail jsonb)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  WITH cv AS (
    SELECT c.id FROM communes c
     WHERE c.id = ANY (p_communes)
       AND EXISTS (SELECT 1 FROM circuits ci WHERE ci.commune_id = c.id AND ci.deleted_at IS NULL AND ci.actif)
  ), calc AS (
    SELECT cv.id,
           app._production_theorique_kg(cv.id, p_debut, p_fin) AS produit_kg,
           (SELECT sum(p.poids_net_kg) FROM pesees p WHERE p.commune_id = cv.id AND p.deleted_at IS NULL
               AND p.type_dechet = 'menager' AND p.date_pesee BETWEEN p_debut AND p_fin) AS pese_kg,
           v.attendus, v.peses,
           e.complete, e.tonnage_min_t, e.tonnage_max_t, e.circuits,
           r.voyages AS voyages_remplissage, r.pese_t AS pese_remplissage_t, r.capacite_min_t, r.capacite_max_t
      FROM cv
      CROSS JOIN LATERAL app._voyages_periode(cv.id, p_debut, p_fin) v
      CROSS JOIN LATERAL app._estimation_periode(cv.id, p_debut, p_fin) e
      CROSS JOIN LATERAL app._remplissage_periode(cv.id, p_debut, p_fin) r
  )
  SELECT c.id, 'TAUX_COLLECTE', round(100 * c.pese_kg / c.produit_kg, 1), NULL::numeric,
         jsonb_build_object('collecte_t', round(c.pese_kg / 1000, 3), 'produit_t', round(c.produit_kg / 1000, 3),
                            'voyages_attendus', c.attendus, 'voyages_peses', c.peses)
    FROM calc c
   WHERE c.attendus > 0 AND c.peses = c.attendus AND c.pese_kg > 0 AND c.produit_kg > 0
  UNION ALL
  SELECT c.id, 'TAUX_COLLECTE_ESTIME', round(100 * c.tonnage_min_t * 1000 / c.produit_kg, 1), NULL::numeric,
         jsonb_build_object('valeur_max', round(100 * c.tonnage_max_t * 1000 / c.produit_kg, 1),
                            'estime_min_t', c.tonnage_min_t, 'estime_max_t', c.tonnage_max_t,
                            'produit_t', round(c.produit_kg / 1000, 3), 'circuits', c.circuits)
    FROM calc c
   WHERE c.complete AND c.produit_kg > 0
  UNION ALL
  SELECT c.id, 'TAUX_REMPLISSAGE', round(100 * c.pese_remplissage_t / c.capacite_max_t, 1), NULL::numeric,
         jsonb_build_object('valeur_max', round(100 * c.pese_remplissage_t / c.capacite_min_t, 1),
                            'voyages', c.voyages_remplissage, 'pese_t', round(c.pese_remplissage_t, 3),
                            'capacite_min_t', round(c.capacite_min_t, 3), 'capacite_max_t', round(c.capacite_max_t, 3))
    FROM calc c
   WHERE c.voyages_remplissage > 0
$$;
REVOKE ALL ON FUNCTION app._mesures_guide_periode(date, date, text[]) FROM PUBLIC;

-- Les deux indicateurs déclarables, quand le registre les mesure.
CREATE OR REPLACE FUNCTION app._mesures_guide_auto_periode(p_debut date, p_fin date, p_communes text[])
  RETURNS TABLE (commune_id text, code text, valeur numeric, note numeric, detail jsonb)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT c.id, 'TAUX_COUVERTURE', round(100 * k.population_desservie / k.population_totale, 1),
         LEAST(1, k.population_desservie / k.population_totale),
         jsonb_build_object('secteurs', k.secteurs, 'secteurs_desservis', k.secteurs_desservis,
                            'population_desservie', k.population_desservie, 'population_totale', k.population_totale)
    FROM communes c CROSS JOIN LATERAL app._couverture(c.id) k
   WHERE c.id = ANY (p_communes) AND k.complete
  UNION ALL
  SELECT c.id, 'POINTS_NOIRS', n.non_resorbes::numeric, NULL::numeric,
         jsonb_build_object('inventaire', n.inventaire, 'resorbes', n.resorbes)
    FROM communes c CROSS JOIN LATERAL app._points_noirs(c.id, p_fin) n
   WHERE c.id = ANY (p_communes) AND n.inventaire > 0
$$;
REVOKE ALL ON FUNCTION app._mesures_guide_auto_periode(date, date, text[]) FROM PUBLIC;

-- Les calculs de la migration 070 gardent leur corps sous un autre nom ; les
-- fonctions du même nom y ajoutent ceux du guide.
DO $$
BEGIN
  IF to_regprocedure('app._mesures_kpi_periode_base(date, date, text[])') IS NULL THEN
    ALTER FUNCTION app._mesures_kpi_periode(date, date, text[]) RENAME TO _mesures_kpi_periode_base;
  END IF;
  IF to_regprocedure('app._mesures_kpi_auto_periode_base(date, date, text[])') IS NULL THEN
    ALTER FUNCTION app._mesures_kpi_auto_periode(date, date, text[]) RENAME TO _mesures_kpi_auto_periode_base;
  END IF;
  IF to_regprocedure('app._source_tenue_base(text, text, date, date, text)') IS NULL THEN
    ALTER FUNCTION app.source_tenue(text, text, date, date, text) RENAME TO _source_tenue_base;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app._mesures_kpi_periode(p_debut date, p_fin date, p_communes text[])
  RETURNS TABLE (commune_id text, code text, valeur numeric, note numeric, detail jsonb)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT * FROM app._mesures_kpi_periode_base(p_debut, p_fin, p_communes)
  UNION ALL
  SELECT * FROM app._mesures_guide_periode(p_debut, p_fin, p_communes)
$$;
REVOKE ALL ON FUNCTION app._mesures_kpi_periode(date, date, text[]) FROM PUBLIC;

CREATE OR REPLACE FUNCTION app._mesures_kpi_auto_periode(p_debut date, p_fin date, p_communes text[])
  RETURNS TABLE (commune_id text, code text, valeur numeric, note numeric, detail jsonb)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT * FROM app._mesures_kpi_auto_periode_base(p_debut, p_fin, p_communes)
  UNION ALL
  SELECT * FROM app._mesures_guide_auto_periode(p_debut, p_fin, p_communes)
$$;
REVOKE ALL ON FUNCTION app._mesures_kpi_auto_periode(date, date, text[]) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 5. Le catalogue, les sources, les dépendances
-- ---------------------------------------------------------------------------
INSERT INTO indicateurs_kpi (code, famille, module, axe, libelle_fr, libelle_ar, description, mode, saisie,
                             libelle_valeur, libelle_cible, unite, ordre) VALUES
  ('TAUX_COLLECTE', 'donnee', NULL, 1, 'Taux de collecte', 'نسبة الجمع',
   'Tonnage ménager pesé, sur la production théorique de la période (kg/hab/j × population). Seulement quand tous les voyages attendus sont pesés : un pesé partiel donnerait un taux faussement bas.',
   'calcule', NULL, NULL, NULL, '%', 72),
  ('TAUX_COLLECTE_ESTIME', 'donnee', NULL, 1, 'Taux de collecte estimé', 'نسبة الجمع المقدَّرة',
   'Pour une commune qui ne pèse aucun voyage : le tonnage estimé (volume × densité, benne pleine), en fourchette, sur la production théorique. Une estimation, jamais additionnée à un pesé.',
   'calcule', NULL, NULL, NULL, '%', 73),
  ('TAUX_REMPLISSAGE', 'donnee', NULL, 1, 'Taux de remplissage des engins', 'نسبة امتلاء المعدات',
   'Tonnage des voyages pesés, sur la capacité de la benne pleine (volume × densité du jour), en fourchette. Au-delà de 100 % : benne surchargée, ou volume, classe ou densité à vérifier.',
   'calcule', NULL, NULL, NULL, '%', 74),
  ('TAUX_COUVERTURE', 'donnee', NULL, 1, 'Taux de couverture', 'نسبة التغطية',
   'Population des secteurs desservis par un circuit, sur la population de la commune. Mesuré quand chaque secteur a sa population ; sinon, déclaré par la commune.',
   'saisi', 'taux', 'Population desservie (%)', NULL, '%', 75),
  ('POINTS_NOIRS', 'donnee', NULL, 1, 'Points noirs', 'النقاط السوداء',
   'Dépôts sauvages relevés et non résorbés en fin de période. Mesuré dès qu''un inventaire existe ; sinon, déclaré (« inventaire fait : aucun point noir » se déclare 0, avec sa date en commentaire).',
   'saisi', 'nombre', 'Points noirs', NULL, 'points', 76)
ON CONFLICT (code) DO NOTHING;

UPDATE indicateurs_kpi SET granularite = 'mensuelle' WHERE code IN ('TAUX_COLLECTE', 'TAUX_COLLECTE_ESTIME', 'TAUX_REMPLISSAGE', 'POINTS_NOIRS');
UPDATE indicateurs_kpi SET granularite = 'actuelle' WHERE code = 'TAUX_COUVERTURE';
UPDATE indicateurs_kpi SET fourchette = true WHERE code IN ('TAUX_COLLECTE_ESTIME', 'TAUX_REMPLISSAGE');
UPDATE indicateurs_kpi k SET description_ar = v.texte FROM (VALUES
  ('TAUX_COLLECTE', 'الكميات المنزلية الموزونة، من الإنتاج النظري للفترة (كغ/ساكن/يوم × عدد السكان). فقط إذا وُزنت كل الرحلات المنتظرة: الوزن الجزئي يعطي نسبة منخفضة خطأً.'),
  ('TAUX_COLLECTE_ESTIME', 'لبلدية لا تزن أي رحلة: الكمية المقدَّرة (الحجم × الكثافة، بصندوق ممتلئ) في شكل مجال، من الإنتاج النظري. تقدير لا يُضاف أبدًا إلى الموزون.'),
  ('TAUX_REMPLISSAGE', 'كميات الرحلات الموزونة، من سعة الصندوق الممتلئ (الحجم × كثافة اليوم)، في شكل مجال. أكثر من 100 %: صندوق محمّل فوق طاقته، أو حجم أو صنف أو كثافة للتثبّت.'),
  ('TAUX_COUVERTURE', 'سكان القطاعات المخدومة بدورة، من سكان البلدية. يُقاس إذا كان لكل قطاع عدد سكانه؛ وإلا تصرّح به البلدية.'),
  ('POINTS_NOIRS', 'المصبات العشوائية المسجلة وغير المزالة في آخر الفترة. يُقاس بمجرد وجود جرد؛ وإلا يُصرَّح به («تم الجرد: لا نقطة سوداء» يُصرَّح به 0 مع تاريخه في التعليق).')
) AS v(code, texte)
WHERE k.code = v.code;

INSERT INTO sources_indicateurs (code, libelle_fr, libelle_ar, nature, cible) VALUES
  ('voyages_tous_peses', 'Tous les voyages attendus de la période pesés', 'كل الرحلات المنتظرة للفترة موزونة', 'ecran', 'pesees'),
  ('production_theorique', 'Production théorique (kg/hab/j)', 'الإنتاج النظري (كغ/ساكن/يوم)', 'parametre', 'population'),
  ('estimation_complete', 'Chaque circuit ménager estimable (engin classé et mesuré), aucun voyage pesé', 'كل دورة منزلية قابلة للتقدير (معدة مصنّفة ومقيسة) دون أي رحلة موزونة', 'ecran', 'parc'),
  ('voyages_peses_benne', 'Voyages pesés d''un engin dont la benne est classée et mesurée', 'رحلات موزونة لمعدة صندوقها مصنّف ومقيس', 'ecran', 'parc'),
  ('secteurs_peuples', 'Secteurs avec leur population, desservis par des circuits', 'قطاعات بعدد سكانها، تخدمها دورات', 'ecran', 'decoupage'),
  ('points_noirs', 'Inventaire des points noirs', 'جرد النقاط السوداء', 'ecran', 'points')
ON CONFLICT (code) DO UPDATE SET libelle_fr = EXCLUDED.libelle_fr, libelle_ar = EXCLUDED.libelle_ar,
                                 nature = EXCLUDED.nature, cible = EXCLUDED.cible;

DELETE FROM dependances_indicateurs
 WHERE indicateur_code IN ('TAUX_COLLECTE', 'TAUX_COLLECTE_ESTIME', 'TAUX_REMPLISSAGE', 'TAUX_COUVERTURE', 'POINTS_NOIRS');
INSERT INTO dependances_indicateurs (indicateur_code, groupe, ordre, source, declare_code) VALUES
  ('TAUX_COLLECTE', 1, 1, 'voyages_tous_peses', NULL),
  ('TAUX_COLLECTE', 2, 1, 'production_theorique', NULL),
  ('TAUX_COLLECTE', 3, 1, 'population', NULL),
  ('TAUX_COLLECTE_ESTIME', 1, 1, 'estimation_complete', NULL),
  ('TAUX_COLLECTE_ESTIME', 2, 1, 'production_theorique', NULL),
  ('TAUX_COLLECTE_ESTIME', 3, 1, 'population', NULL),
  ('TAUX_REMPLISSAGE', 1, 1, 'voyages_peses_benne', NULL),
  ('TAUX_COUVERTURE', 1, 1, 'secteurs_peuples', NULL), ('TAUX_COUVERTURE', 1, 2, 'declaration', 'TAUX_COUVERTURE'),
  ('TAUX_COUVERTURE', 2, 1, 'population', NULL), ('TAUX_COUVERTURE', 2, 2, 'declaration', 'TAUX_COUVERTURE'),
  ('POINTS_NOIRS', 1, 1, 'points_noirs', NULL), ('POINTS_NOIRS', 1, 2, 'declaration', 'POINTS_NOIRS');

-- « Ma commune dans SIIPI » (lot 5) : l'élément qui complète chaque source. Les
-- points noirs restent dehors, exprès : toutes les communes n'en ont pas, et celle
-- qui n'en a aucun le déclare.
INSERT INTO sources_elements_completude (element, source)
SELECT v.element, v.source FROM (VALUES
  ('population', 'production_theorique'),
  ('pesees', 'voyages_tous_peses'),
  ('pesees', 'voyages_peses_benne'), ('parc', 'voyages_peses_benne'),
  ('parc', 'estimation_complete'), ('circuits', 'estimation_complete'),
  ('secteurs', 'secteurs_peuples')
) AS v(element, source)
ON CONFLICT (element, source) DO NOTHING;

-- Une source tenue : les conditions reprennent celles des calculs ci-dessus, pour
-- que « non renseigné » et « il manque quelque chose » aillent toujours ensemble.
CREATE OR REPLACE FUNCTION app.source_tenue(p_commune text, p_source text, p_debut date, p_fin date, p_declare text DEFAULT NULL)
  RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$fn$
BEGIN
  RETURN CASE p_source
    WHEN 'voyages_tous_peses' THEN
      EXISTS (SELECT 1 FROM app._voyages_periode(p_commune, p_debut, p_fin) v WHERE v.attendus > 0 AND v.peses = v.attendus)
      AND EXISTS (SELECT 1 FROM pesees p WHERE p.commune_id = p_commune AND p.deleted_at IS NULL
                     AND p.type_dechet = 'menager' AND p.poids_net_kg > 0 AND p.date_pesee BETWEEN p_debut AND p_fin)
    WHEN 'production_theorique' THEN
      EXISTS (SELECT 1 FROM parametres_commune pc WHERE pc.commune_id = p_commune AND pc.production_theorique_kg_hab_j > 0)
    WHEN 'estimation_complete' THEN
      EXISTS (SELECT 1 FROM circuits ci WHERE ci.commune_id = p_commune AND ci.deleted_at IS NULL AND ci.actif)
      AND COALESCE((SELECT e.complete FROM app._estimation_periode(p_commune, p_debut, p_fin) e), false)
    WHEN 'voyages_peses_benne' THEN
      EXISTS (SELECT 1 FROM circuits ci WHERE ci.commune_id = p_commune AND ci.deleted_at IS NULL AND ci.actif)
      AND COALESCE((SELECT r.voyages > 0 FROM app._remplissage_periode(p_commune, p_debut, p_fin) r), false)
    WHEN 'secteurs_peuples' THEN COALESCE((SELECT k.complete FROM app._couverture(p_commune) k), false)
    WHEN 'points_noirs' THEN COALESCE((SELECT n.inventaire > 0 FROM app._points_noirs(p_commune, p_fin) n), false)
    ELSE app._source_tenue_base(p_commune, p_source, p_debut, p_fin, p_declare)
  END;
END;
$fn$;
REVOKE ALL ON FUNCTION app.source_tenue(text, text, date, date, text) FROM PUBLIC;
COMMENT ON FUNCTION app.source_tenue(text, text, date, date, text) IS
  'Interne : la source de données est-elle tenue par la commune sur la période ? Les sources du guide (lot K) ici, les autres dans app._source_tenue_base (lot 3a).';

-- ---------------------------------------------------------------------------
-- 6. Le repère du gouvernorat : jamais pour une fourchette
-- ---------------------------------------------------------------------------
-- La moyenne des bornes basses se lirait comme la moyenne des communes. Une
-- fourchette n'a pas de repère.
CREATE OR REPLACE FUNCTION app.reference_gouvernorat(p_commune text, p_code text, p_debut date, p_fin date, p_pas text)
  RETURNS TABLE (periode_debut date, periode_fin date, moyenne numeric, communes integer)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$fn$
DECLARE
  v_seuil integer := COALESCE((SELECT valeur FROM parametres_kpi WHERE cle = 'seuil_reference_gouvernorat'), 5)::int;
BEGIN
  PERFORM app._controler_serie(p_code, p_debut, p_fin, p_pas);
  IF NOT app.can_read_commune(p_commune) THEN RETURN; END IF;
  IF (SELECT fourchette FROM indicateurs_kpi WHERE code = p_code) THEN RETURN; END IF;
  RETURN QUERY
    SELECT s.periode_debut, s.periode_fin, round(avg(s.valeur), 3), count(*)::int
      FROM app._serie(ARRAY(SELECT c.id FROM communes c JOIN communes moi ON moi.id = p_commune
                             WHERE c.gouvernorat = moi.gouvernorat AND c.deleted_at IS NULL AND NOT c.est_demo),
                      p_code, p_debut, p_fin, p_pas) s
     GROUP BY s.periode_debut, s.periode_fin
    HAVING count(*) >= v_seuil
     ORDER BY s.periode_debut;
END;
$fn$;
GRANT EXECUTE ON FUNCTION app.reference_gouvernorat(text, text, date, date, text) TO siipi_app;

-- ---------------------------------------------------------------------------
-- 7. « À vérifier » : des voyages pesés au-delà de la benne pleine
-- ---------------------------------------------------------------------------
-- Définition reprise de la migration 088, le remplissage en plus.
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
  UNION ALL
  -- Un voyage pesé plus lourd que la benne pleine, à la densité haute : la benne
  -- était surchargée, ou son volume, sa classe ou la pesée sont à vérifier.
  SELECT 'information', 'parc', b.immat, b.porteur,
         format('%s voyage(s) pesé(s) au-delà de la benne pleine (%s m³ à %s t/m³ au plus) sur les 30 derniers jours.',
                b.voyages, replace(trim_scale(b.volume)::text, '.', ','), replace(trim_scale(b.dmax)::text, '.', ',')),
         'Vérifier le volume ou la classe de la benne, ou les pesées. SIIPI ne corrige rien : il signale l''écart.'
    FROM (
      SELECT t.porteur_id AS porteur, t.porteur_immat AS immat, t.volume_m3 AS volume, max(d.densite_max) AS dmax, count(*) AS voyages
        FROM pesees p
        JOIN circuits c ON c.id = p.circuit_id
        CROSS JOIN LATERAL app.engin_de_travail(COALESCE(p.vehicule_id, c.vehicule_id)) t
        CROSS JOIN LATERAL app.densite_retenue(t.classe, t.volume_m3, p.date_pesee) d
       WHERE p.commune_id = p_commune AND p.deleted_at IS NULL AND p.type_dechet = 'menager' AND t.manque IS NULL
         AND p.date_pesee > (now() AT TIME ZONE 'Africa/Tunis')::date - 30
         AND p.poids_net_kg / 1000 > t.volume_m3 * d.densite_max
         AND app.can_read_commune(p_commune)
       GROUP BY t.porteur_id, t.porteur_immat, t.volume_m3
    ) b
$$;
GRANT EXECUTE ON FUNCTION app.incoherences_volumetrie(text) TO siipi_app;

-- ---------------------------------------------------------------------------
-- 8. Pas de compilation à la volée pour ces calculs
-- ---------------------------------------------------------------------------
-- Leurs requêtes enchaînent des fonctions dont le planificateur surestime le coût :
-- il décide de compiler (JIT), et la compilation coûte des secondes là où le calcul
-- coûte des millisecondes. Constaté : le tonnage estimé d'un mois (17.2) en 3,4 s
-- avec la compilation, 33 ms sans ; la fiche annuelle d'une commune en une minute.
-- Le réglage vaut pour la fonction et ce qu'elle appelle ; le reste de la base garde
-- le sien.
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
      'app.tonnage_estime(text, date)', 'app.densite_retenue(text, numeric, date)', 'app.engin_de_travail(text)',
      'app._production_theorique_kg(text, date, date)', 'app._voyages_periode(text, date, date)',
      'app._estimation_periode(text, date, date)', 'app._remplissage_periode(text, date, date)',
      'app._couverture(text)', 'app._points_noirs(text, date)',
      'app._mesures_guide_periode(date, date, text[])', 'app._mesures_guide_auto_periode(date, date, text[])',
      'app._mesures_kpi_periode(date, date, text[])', 'app._mesures_kpi_auto_periode(date, date, text[])',
      'app.source_tenue(text, text, date, date, text)', 'app.incoherences_volumetrie(text)', 'app.incoherences_engins(text)'] LOOP
    EXECUTE format('ALTER FUNCTION %s SET jit = off', f);
  END LOOP;
END $$;
