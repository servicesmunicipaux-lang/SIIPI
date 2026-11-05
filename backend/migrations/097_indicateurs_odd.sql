-- ============================================================================
-- 097 — Les indicateurs ODD (décisions du 4 novembre 2026, § 3 ;
-- docs/specs_metier/DECISIONS_2026-11-04.md).
--
-- Cinq indicateurs, regroupés sous « Indicateurs ODD » (famille odd, axe 3) :
--   ODD_11_6_1_A   taux de collecte des déchets municipaux — CALCULÉ : le pesé de
--                  la période sur le gisement ménager PLUS le gisement assimilé.
--                  Le numérateur suit TAUX_COLLECTE (tous les voyages attendus
--                  pesés, sinon rien). Avant le jalon G, le gisement assimilé est
--                  le seul proxy national (part des assimilés dans les déchets
--                  municipaux) : la valeur est toujours ESTIMÉE.
--   ODD_12_3_1_B   indice de gaspillage alimentaire des ménages — une
--                  APPROXIMATION : production spécifique × part organique de la
--                  caractérisation retenue (qui compte aussi les déchets verts).
--                  Une valeur déclarée d'après une étude la remplace.
--   ODD_11_6_1_B, ODD_12_5_1, FUITE_PLASTIQUE — jamais calculés : déclarés par
--                  la commune d'après une étude, avec sa source et sa date.
--
-- TAUX_COLLECTE ne change pas : il rapporte le pesé au seul gisement ménager.
-- Le mot « WaCT » n'est pas un nom d'indicateur : c'est la provenance du proxy.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. La famille, et la source exigée
-- ---------------------------------------------------------------------------
ALTER TABLE indicateurs_kpi DROP CONSTRAINT IF EXISTS indicateurs_kpi_famille;
ALTER TABLE indicateurs_kpi ADD CONSTRAINT indicateurs_kpi_famille CHECK (famille IN ('indicateur', 'dma', 'donnee', 'odd'));

ALTER TABLE indicateurs_kpi ADD COLUMN IF NOT EXISTS exige_source BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN indicateurs_kpi.exige_source IS
  'Une déclaration de cet indicateur porte la source et la date de l''étude dont elle vient ; la base refuse l''une sans l''autre. Une valeur ODD sans sa pièce ne se discute pas.';

ALTER TABLE declarations_indicateurs ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE declarations_indicateurs ADD COLUMN IF NOT EXISTS date_reference DATE;
COMMENT ON COLUMN declarations_indicateurs.source IS
  'L''étude, le rapport ou le registre dont vient la valeur (« Étude de caractérisation ANGeD 2025 »…). Exigée pour un indicateur marqué exige_source.';
COMMENT ON COLUMN declarations_indicateurs.date_reference IS
  'La date de l''étude dont vient la valeur — pas celle de la saisie (saisi_le). Exigée pour un indicateur marqué exige_source ; jamais dans l''avenir (jour de Tunis).';

-- La règle est celle de 068, plus la source et la date. Une déclaration qu'on
-- retire n'est pas contrôlée : une déclaration ancienne, sans source, doit
-- pouvoir partir.
CREATE OR REPLACE FUNCTION app.controler_declaration() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$fn$
DECLARE
  i indicateurs_kpi%ROWTYPE;
BEGIN
  SELECT * INTO i FROM indicateurs_kpi WHERE code = NEW.indicateur_code;
  IF i.mode <> 'saisi' THEN
    RAISE EXCEPTION 'DECLARATION_INDICATEUR_CALCULE: « % » est calculé par la plateforme : il ne se déclare pas.', i.libelle_fr;
  END IF;
  IF i.saisie = 'taux' AND NEW.valeur > 100 THEN
    RAISE EXCEPTION 'DECLARATION_TAUX: « % » est un taux : 100 %% au plus.', i.libelle_fr;
  END IF;
  IF i.saisie = 'ratio' AND NEW.cible IS NULL THEN
    RAISE EXCEPTION 'DECLARATION_CIBLE: « % » se rapporte à une cible : %.', i.libelle_fr, coalesce(i.libelle_cible, 'cible requise');
  END IF;
  IF NEW.deleted_at IS NULL THEN
    IF i.exige_source AND (length(btrim(coalesce(NEW.source, ''))) < 3 OR NEW.date_reference IS NULL) THEN
      RAISE EXCEPTION 'DECLARATION_SOURCE: « % » se déclare d''après une étude : citez sa source et sa date.', i.libelle_fr;
    END IF;
    IF NEW.date_reference IS NOT NULL
       AND (NEW.date_reference > app.jour_tunis() OR NEW.date_reference < DATE '2000-01-01') THEN
      RAISE EXCEPTION 'DECLARATION_DATE: la date de l''étude (%) doit être passée, et postérieure à 2000.', NEW.date_reference;
    END IF;
  END IF;
  -- Le commentaire de la FNCT ne passe que par app.commenter_declaration().
  IF TG_OP = 'UPDATE' AND NEW.commentaire_fnct IS DISTINCT FROM OLD.commentaire_fnct
     AND current_setting('app.commentaire_fnct', true) IS DISTINCT FROM 'oui' THEN
    RAISE EXCEPTION 'DECLARATION_COMMENTAIRE_FNCT: le commentaire de la FNCT ne s''écrit que par la FNCT.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 2. Le proxy des assimilés : un paramètre national daté (lot 17.3)
-- ---------------------------------------------------------------------------
-- Il ne sert qu'à l'estimation globale du gisement, jamais à une facturation
-- (décision du 4 novembre, § 1). Le jalon G le remplacera, commune par commune,
-- par une campagne de pesée ou une déclaration.
INSERT INTO definitions_parametres_nationaux (code, nature, unite, borne_min, borne_max, libelle_fr, libelle_ar, description, ordre) VALUES
  ('part_assimiles_proxy', 'nombre', '%', 0, 100,
   'Part des déchets assimilés dans les déchets municipaux (proxy)', 'نسبة النفايات المشابهة من النفايات البلدية (تقدير)',
   'À défaut de mesure, le gisement assimilé d''une commune vaut gisement ménager × part ÷ (100 − part). Sert à l''estimation globale du taux de collecte ODD 11.6.1, jamais à facturer.', 60)
ON CONFLICT (code) DO NOTHING;

INSERT INTO valeurs_parametres_nationaux (code, date_effet, valeur_nombre, provisoire, reference)
SELECT 'part_assimiles_proxy', DATE '2000-01-01', 30, false,
       'Proxy de l''outil Waste Wise Cities (WaCT, ONU-Habitat), retenu par la décision de la FNCT du 04/11/2026 (DECISIONS_2026-11-04.md § 1 et § 3.1)'
 WHERE NOT EXISTS (SELECT 1 FROM valeurs_parametres_nationaux x WHERE x.code = 'part_assimiles_proxy');

-- ---------------------------------------------------------------------------
-- 3. Les calculs
-- ---------------------------------------------------------------------------
-- La population retenue et sa provenance, comme dans app._production_theorique_kg
-- (lot 17.1) : la population permanente déclarée, sinon le recensement.
CREATE OR REPLACE FUNCTION app._population_retenue(p_commune text)
  RETURNS TABLE (population numeric, provenance text, population_saisonniere integer)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp SET jit = off AS
$$
  SELECT COALESCE(p.population_permanente, NULLIF(c.population, 0))::numeric,
         CASE WHEN p.population_permanente IS NOT NULL THEN p.population_permanente_source
              WHEN NULLIF(c.population, 0) IS NOT NULL THEN 'recensement' END,
         p.population_saisonniere
    FROM communes c LEFT JOIN parametres_commune p ON p.commune_id = c.id
   WHERE c.id = p_commune
$$;
REVOKE ALL ON FUNCTION app._population_retenue(text) FROM PUBLIC;

-- ODD_11_6_1_A, sur les communes qui ont un circuit actif (comme TAUX_COLLECTE).
CREATE OR REPLACE FUNCTION app._mesures_odd_periode(p_debut date, p_fin date, p_communes text[])
  RETURNS TABLE (commune_id text, code text, valeur numeric, note numeric, detail jsonb)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp SET jit = off AS
$$
  WITH cv AS (
    SELECT c.id FROM communes c
     WHERE c.id = ANY (p_communes)
       AND EXISTS (SELECT 1 FROM circuits ci WHERE ci.commune_id = c.id AND ci.deleted_at IS NULL AND ci.actif)
  ), calc AS (
    SELECT cv.id,
           app._production_theorique_kg(cv.id, p_debut, p_fin) AS menager_kg,
           (SELECT sum(p.poids_net_kg) FROM pesees p WHERE p.commune_id = cv.id AND p.deleted_at IS NULL
               AND p.type_dechet = 'menager' AND p.date_pesee BETWEEN p_debut AND p_fin) AS pese_kg,
           v.attendus, v.peses,
           (SELECT x.valeur_nombre FROM app.parametre_national('part_assimiles_proxy', p_fin) x) AS part,
           pr.population, pr.provenance AS population_provenance, pr.population_saisonniere,
           pc.production_theorique_kg_hab_j AS production, pc.production_theorique_source AS production_source
      FROM cv
      CROSS JOIN LATERAL app._voyages_periode(cv.id, p_debut, p_fin) v
      CROSS JOIN LATERAL app._population_retenue(cv.id) pr
      LEFT JOIN parametres_commune pc ON pc.commune_id = cv.id
  ), gisement AS (
    SELECT c.*, c.menager_kg * c.part / (100 - c.part) AS assimile_kg FROM calc c
  )
  SELECT g.id, 'ODD_11_6_1_A', round(100 * g.pese_kg / (g.menager_kg + g.assimile_kg), 1), NULL::numeric,
         jsonb_build_object(
           'nature', 'estime',
           'collecte_t', round(g.pese_kg / 1000, 3),
           'gisement_menager_t', round(g.menager_kg / 1000, 3),
           'gisement_assimile_t', round(g.assimile_kg / 1000, 3),
           'gisement_total_t', round((g.menager_kg + g.assimile_kg) / 1000, 3),
           'provenance_collecte', 'pese',
           'provenance_assimiles', 'proxy',
           'part_assimiles_pct', g.part,
           'population', g.population, 'population_provenance', g.population_provenance,
           'population_saisonniere', g.population_saisonniere,
           'production_kg_hab_j', g.production, 'production_source', g.production_source,
           'voyages_attendus', g.attendus, 'voyages_peses', g.peses)
    FROM gisement g
   WHERE g.attendus > 0 AND g.peses = g.attendus AND g.pese_kg > 0 AND g.menager_kg > 0 AND g.part IS NOT NULL
$$;
REVOKE ALL ON FUNCTION app._mesures_odd_periode(date, date, text[]) FROM PUBLIC;

-- ODD_12_3_1_B : rien pour une commune qui a déclaré l'indicateur pour l'année —
-- la déclaration, faite d'après une étude, remplace l'approximation. La règle
-- est ici, et pas dans l'ordre de lecture des valeurs : la fiche, les séries et
-- la vue nationale la suivent toutes.
CREATE OR REPLACE FUNCTION app._mesures_odd_auto_periode(p_debut date, p_fin date, p_communes text[])
  RETURNS TABLE (commune_id text, code text, valeur numeric, note numeric, detail jsonb)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp SET jit = off AS
$$
  WITH base AS (
    SELECT c.id, pc.production_theorique_kg_hab_j AS production, pc.production_theorique_source AS production_source,
           pr.population, pr.provenance AS population_provenance,
           cr.niveau_source, cr.annee AS caracterisation_annee,
           (SELECT (f->>'pourcentage')::numeric FROM jsonb_array_elements(cr.fractions) f
             WHERE f->>'fraction' = 'organiques') AS organiques
      FROM communes c
      JOIN parametres_commune pc ON pc.commune_id = c.id
      CROSS JOIN LATERAL app._population_retenue(c.id) pr
      CROSS JOIN LATERAL app.caracterisation_retenue(c.id, p_fin) cr
     WHERE c.id = ANY (p_communes)
       AND NOT EXISTS (SELECT 1 FROM declarations_indicateurs d
                        WHERE d.commune_id = c.id AND d.indicateur_code = 'ODD_12_3_1_B' AND d.deleted_at IS NULL
                          AND d.annee = extract(year FROM p_debut))
  )
  SELECT b.id, 'ODD_12_3_1_B', round(b.production * b.organiques / 100, 3), NULL::numeric,
         jsonb_build_object(
           'nature', 'approximation',
           'total_t_j', round(b.population * b.production * b.organiques / 100 / 1000, 3),
           'production_kg_hab_j', b.production, 'production_source', b.production_source,
           'part_organiques_pct', b.organiques,
           'caracterisation_niveau', b.niveau_source, 'caracterisation_annee', b.caracterisation_annee,
           'population', b.population, 'population_provenance', b.population_provenance)
    FROM base b
   WHERE b.production > 0 AND b.population > 0 AND b.organiques IS NOT NULL
$$;
REVOKE ALL ON FUNCTION app._mesures_odd_auto_periode(date, date, text[]) FROM PUBLIC;

-- Les fonctions du même nom ajoutent les ODD aux calculs de 070 et du guide (089).
CREATE OR REPLACE FUNCTION app._mesures_kpi_periode(p_debut date, p_fin date, p_communes text[])
  RETURNS TABLE (commune_id text, code text, valeur numeric, note numeric, detail jsonb)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp SET jit = off AS
$$
  SELECT * FROM app._mesures_kpi_periode_base(p_debut, p_fin, p_communes)
  UNION ALL
  SELECT * FROM app._mesures_guide_periode(p_debut, p_fin, p_communes)
  UNION ALL
  SELECT * FROM app._mesures_odd_periode(p_debut, p_fin, p_communes)
$$;
REVOKE ALL ON FUNCTION app._mesures_kpi_periode(date, date, text[]) FROM PUBLIC;

CREATE OR REPLACE FUNCTION app._mesures_kpi_auto_periode(p_debut date, p_fin date, p_communes text[])
  RETURNS TABLE (commune_id text, code text, valeur numeric, note numeric, detail jsonb)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp SET jit = off AS
$$
  SELECT * FROM app._mesures_kpi_auto_periode_base(p_debut, p_fin, p_communes)
  UNION ALL
  SELECT * FROM app._mesures_guide_auto_periode(p_debut, p_fin, p_communes)
  UNION ALL
  SELECT * FROM app._mesures_odd_auto_periode(p_debut, p_fin, p_communes)
$$;
REVOKE ALL ON FUNCTION app._mesures_kpi_auto_periode(date, date, text[]) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 4. Le catalogue, les sources, les dépendances
-- ---------------------------------------------------------------------------
INSERT INTO indicateurs_kpi (code, famille, module, axe, libelle_fr, libelle_ar, description, mode, saisie,
                             libelle_valeur, libelle_cible, unite, ordre) VALUES
  ('ODD_11_6_1_A', 'odd', NULL, 3, 'Taux de collecte des déchets municipaux (ODD 11.6.1)', 'نسبة جمع النفايات البلدية (هدف التنمية المستدامة 11.6.1)',
   'Tonnage pesé de la période, sur le gisement ménager (production spécifique × population) plus le gisement assimilé. Seulement quand tous les voyages attendus sont pesés. Le gisement assimilé est estimé par le proxy national tant que la commune ne l''a pas mesuré : la valeur est alors estimée. Plus bas que le taux de collecte, qui ne compte que le gisement ménager.',
   'calcule', NULL, NULL, NULL, '%', 80),
  ('ODD_11_6_1_B', 'odd', NULL, 3, 'Déchets gérés en installations contrôlées (ODD 11.6.1)', 'النفايات المعالجة في منشآت مراقبة (هدف التنمية المستدامة 11.6.1)',
   'Part des déchets municipaux gérés dans des installations contrôlées. Jamais calculée : déclarée par la commune d''après une étude, avec sa source et sa date.',
   'saisi', 'taux', 'Déchets gérés en installations contrôlées (%)', NULL, '%', 81),
  ('ODD_12_3_1_B', 'odd', NULL, 3, 'Indice de gaspillage alimentaire des ménages (ODD 12.3.1 b)', 'مؤشر هدر الطعام لدى الأسر (هدف التنمية المستدامة 12.3.1 ب)',
   'Production spécifique × part des organiques de la caractérisation retenue. Une approximation : la fraction organique compte aussi les déchets verts, que l''indicateur exclut. Une valeur déclarée d''après une étude, avec sa source et sa date, la remplace.',
   'saisi', 'nombre', 'Gaspillage alimentaire des ménages (kg/hab/j)', NULL, 'kg/hab/j', 82),
  ('ODD_12_5_1', 'odd', NULL, 3, 'Taux de valorisation de la ville (ODD 12.5.1)', 'نسبة تثمين نفايات المدينة (هدف التنمية المستدامة 12.5.1)',
   'Part des déchets municipaux recyclés ou valorisés. Jamais calculée : déclarée par la commune d''après une étude, avec sa source et sa date.',
   'saisi', 'taux', 'Déchets valorisés (%)', NULL, '%', 83),
  ('FUITE_PLASTIQUE', 'odd', NULL, 3, 'Fuite de plastique dans l''environnement', 'تسرّب البلاستيك إلى المحيط',
   'Plastique qui échappe à la gestion des déchets, par habitant et par an. Jamais calculée : déclarée par la commune d''après une étude, avec sa source et sa date.',
   'saisi', 'nombre', 'Fuite de plastique (kg/hab/an)', NULL, 'kg/hab/an', 84)
ON CONFLICT (code) DO NOTHING;

UPDATE indicateurs_kpi SET granularite = 'mensuelle' WHERE code = 'ODD_11_6_1_A';
UPDATE indicateurs_kpi SET exige_source = true
 WHERE code IN ('ODD_11_6_1_B', 'ODD_12_3_1_B', 'ODD_12_5_1', 'FUITE_PLASTIQUE');
UPDATE indicateurs_kpi k SET description_ar = v.texte FROM (VALUES
  ('ODD_11_6_1_A', 'الكميات الموزونة خلال الفترة، من المخزون المنزلي (الإنتاج النوعي × عدد السكان) مضافًا إليه مخزون النفايات المشابهة. فقط إذا وُزنت كل الرحلات المنتظرة. يُقدَّر مخزون النفايات المشابهة بالنسبة الوطنية ما لم تقسه البلدية: القيمة إذن مقدَّرة. أقل من نسبة الجمع التي لا تحتسب إلا المخزون المنزلي.'),
  ('ODD_11_6_1_B', 'نسبة النفايات البلدية المعالجة في منشآت مراقبة. لا تُحتسب أبدًا: تصرّح بها البلدية استنادًا إلى دراسة، مع مصدرها وتاريخها.'),
  ('ODD_12_3_1_B', 'الإنتاج النوعي × نسبة المواد العضوية في التركيبة المعتمدة. تقريب: الجزء العضوي يشمل أيضًا الفضلات الخضراء التي لا يحتسبها المؤشر. تعوّضه قيمة مصرّح بها استنادًا إلى دراسة، مع مصدرها وتاريخها.'),
  ('ODD_12_5_1', 'نسبة النفايات البلدية المرسكلة أو المثمَّنة. لا تُحتسب أبدًا: تصرّح بها البلدية استنادًا إلى دراسة، مع مصدرها وتاريخها.'),
  ('FUITE_PLASTIQUE', 'البلاستيك الذي يفلت من التصرف في النفايات، لكل ساكن في السنة. لا يُحتسب أبدًا: تصرّح به البلدية استنادًا إلى دراسة، مع مصدرها وتاريخها.')
) AS v(code, texte)
WHERE k.code = v.code;

INSERT INTO sources_indicateurs (code, libelle_fr, libelle_ar, nature, cible) VALUES
  ('caracterisation', 'Caractérisation des déchets (part des organiques)', 'تصنيف النفايات (نسبة المواد العضوية)', 'formulaire', 'caracterisation'),
  ('part_assimiles', 'Part des assimilés dans les déchets municipaux (paramètre national)', 'نسبة النفايات المشابهة من النفايات البلدية (معيار وطني)', 'fnct', NULL)
ON CONFLICT (code) DO UPDATE SET libelle_fr = EXCLUDED.libelle_fr, libelle_ar = EXCLUDED.libelle_ar,
                                 nature = EXCLUDED.nature, cible = EXCLUDED.cible;

DELETE FROM dependances_indicateurs
 WHERE indicateur_code IN ('ODD_11_6_1_A', 'ODD_11_6_1_B', 'ODD_12_3_1_B', 'ODD_12_5_1', 'FUITE_PLASTIQUE');
INSERT INTO dependances_indicateurs (indicateur_code, groupe, ordre, source, declare_code) VALUES
  ('ODD_11_6_1_A', 1, 1, 'voyages_tous_peses', NULL),
  ('ODD_11_6_1_A', 2, 1, 'production_theorique', NULL),
  ('ODD_11_6_1_A', 3, 1, 'population', NULL),
  ('ODD_11_6_1_A', 4, 1, 'part_assimiles', NULL),
  ('ODD_12_3_1_B', 1, 1, 'production_theorique', NULL), ('ODD_12_3_1_B', 1, 2, 'declaration', 'ODD_12_3_1_B'),
  ('ODD_12_3_1_B', 2, 1, 'population', NULL), ('ODD_12_3_1_B', 2, 2, 'declaration', 'ODD_12_3_1_B'),
  ('ODD_12_3_1_B', 3, 1, 'caracterisation', NULL), ('ODD_12_3_1_B', 3, 2, 'declaration', 'ODD_12_3_1_B'),
  ('ODD_11_6_1_B', 1, 1, 'declaration', 'ODD_11_6_1_B'),
  ('ODD_12_5_1', 1, 1, 'declaration', 'ODD_12_5_1'),
  ('FUITE_PLASTIQUE', 1, 1, 'declaration', 'FUITE_PLASTIQUE');

-- « Ma commune dans SIIPI » : la caractérisation débloque désormais un indicateur.
INSERT INTO sources_elements_completude (element, source) VALUES ('caracterisation', 'caracterisation')
ON CONFLICT (element, source) DO NOTHING;

-- Une source tenue : les conditions reprennent celles des calculs ci-dessus, pour
-- que « non renseigné » et « il manque quelque chose » aillent toujours ensemble.
-- Le corps est celui de 089, plus les deux sources des ODD.
CREATE OR REPLACE FUNCTION app.source_tenue(p_commune text, p_source text, p_debut date, p_fin date, p_declare text DEFAULT NULL)
  RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp SET jit = off AS
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
    WHEN 'caracterisation' THEN
      EXISTS (SELECT 1 FROM app.caracterisation_retenue(p_commune, p_fin) cr, jsonb_array_elements(cr.fractions) f
               WHERE f->>'fraction' = 'organiques')
    WHEN 'part_assimiles' THEN EXISTS (SELECT 1 FROM app.parametre_national('part_assimiles_proxy', p_fin))
    ELSE app._source_tenue_base(p_commune, p_source, p_debut, p_fin, p_declare)
  END;
END;
$fn$;
REVOKE ALL ON FUNCTION app.source_tenue(text, text, date, date, text) FROM PUBLIC;
