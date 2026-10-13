-- =========================================================================
-- 073 — La complétude de la commune : « Ma commune dans SIIPI » (refonte,
-- lot 5 ; docs/specs_metier/SPEC_refonte_indicateurs_saisie.md § 2.4).
--
-- Une liste des données de référence qui font de SIIPI la référence de la
-- commune — population, périmètre, secteurs, circuits, parc, personnel, PCGD,
-- caractérisation, contacts — et des registres tenus ce mois-ci. Chaque élément
-- est « présent » ou « à ajouter », dit où il se complète, et quels indicateurs
-- il débloque (lus dans les dépendances du lot 3a, jamais recopiés).
--
-- CE N'EST PAS UNE NOTE. La fonction ne rend aucun total, aucun pourcentage,
-- aucun rang, et elle ne porte que sur UNE commune : il n'existe pas de vue qui
-- les compare. Une note de complétude recréerait, par une autre porte, le
-- palmarès retiré au lot 1.
--
-- Un registre où l'absence de ligne est une bonne nouvelle n'est pas dans la
-- liste : un mois sans accident du travail ne doit pas s'afficher « à ajouter »,
-- ce serait inviter la commune à en inventer un.
-- =========================================================================

-- ---------------------------------------------------------------------------
-- 1. Le catalogue des éléments
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS elements_completude (
    code        TEXT PRIMARY KEY,
    rubrique    TEXT NOT NULL,
    ordre       SMALLINT NOT NULL CHECK (ordre > 0),
    libelle_fr  TEXT NOT NULL,
    libelle_ar  TEXT NOT NULL,
    aide_fr     TEXT NOT NULL,
    aide_ar     TEXT NOT NULL,
    nature      TEXT NOT NULL,
    cible       TEXT NOT NULL,
    CONSTRAINT elements_completude_rubrique CHECK (rubrique IN ('reference', 'registre_mois')),
    -- Un élément se complète toujours par la commune : un formulaire du
    -- registre d'ajout, un écran du portail ou un paramètre. Rien ici n'attend
    -- les citoyens ou la FNCT.
    CONSTRAINT elements_completude_nature CHECK (nature IN ('formulaire', 'ecran', 'parametre')),
    CONSTRAINT elements_completude_ordre UNIQUE (rubrique, ordre)
);
COMMENT ON TABLE elements_completude IS
  'Les données de référence et les registres du mois qui composent « Ma commune dans SIIPI » (refonte, lot 5). Une liste de choses à faire, pas une note : aucun poids, aucun total.';
COMMENT ON COLUMN elements_completude.rubrique IS
  '« reference » : une donnée qui se pose une fois et se tient à jour (population, circuits, parc…). « registre_mois » : un registre qui se tient chaque mois (pesées, carburant, pointage…).';
COMMENT ON COLUMN elements_completude.aide_fr IS 'Ce qu''est l''élément et à quoi il sert, en une phrase, pour le directeur qui le découvre.';
COMMENT ON COLUMN elements_completude.cible IS
  'Selon la nature : le type du formulaire d''ajout (web/src/composants/ajout/appels-creation.json), l''écran du portail communal, ou le paramètre de la commune.';

CREATE TABLE IF NOT EXISTS sources_elements_completude (
    element TEXT NOT NULL REFERENCES elements_completude(code) ON DELETE CASCADE,
    source  TEXT NOT NULL REFERENCES sources_indicateurs(code),
    PRIMARY KEY (element, source)
);
COMMENT ON TABLE sources_elements_completude IS
  'Les sources de données (sources_indicateurs, lot 3a) qu''un élément de complétude alimente : les indicateurs qu''il débloque s''en déduisent par dependances_indicateurs. Un élément sans source (périmètre, PCGD, caractérisation…) ne débloque aucun indicateur ; il sert ailleurs, et son aide le dit.';

ALTER TABLE elements_completude ENABLE ROW LEVEL SECURITY;
ALTER TABLE elements_completude FORCE ROW LEVEL SECURITY;
ALTER TABLE sources_elements_completude ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources_elements_completude FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS elements_completude_lecture ON elements_completude;
CREATE POLICY elements_completude_lecture ON elements_completude FOR SELECT USING (app.is_authenticated());
DROP POLICY IF EXISTS sources_elements_completude_lecture ON sources_elements_completude;
CREATE POLICY sources_elements_completude_lecture ON sources_elements_completude FOR SELECT USING (app.is_authenticated());
GRANT SELECT ON elements_completude, sources_elements_completude TO siipi_app;
REVOKE INSERT, UPDATE, DELETE ON elements_completude, sources_elements_completude FROM siipi_app;

INSERT INTO elements_completude (code, rubrique, ordre, libelle_fr, libelle_ar, aide_fr, aide_ar, nature, cible) VALUES
  ('population', 'reference', 1, 'Population de la commune', 'عدد سكان البلدية',
   'La population permanente, avec sa source. Elle rapporte le tonnage à l''habitant.',
   'عدد السكان القارين مع مصدره. يُنسب إليه الوزن لكل ساكن.', 'parametre', 'population'),
  ('perimetre', 'reference', 2, 'Périmètre communal', 'حدود البلدية',
   'Le contour de la commune sur la carte. Il vient du découpage officiel ; la commune en propose la correction.',
   'حدود البلدية على الخريطة. تأتي من التقسيم الرسمي، وتقترح البلدية تصحيحها.', 'ecran', 'decoupage'),
  ('secteurs', 'reference', 3, 'Secteurs de collecte', 'قطاعات الجمع',
   'Les secteurs dessinés sur la carte. Ils rangent les circuits, les points et les réclamations par quartier.',
   'القطاعات المرسومة على الخريطة. تُرتّب المسالك والنقاط والإبلاغات حسب الحي.', 'ecran', 'decoupage'),
  ('circuits', 'reference', 4, 'Circuits de collecte', 'مسالك الجمع',
   'Les tournées de collecte et leurs horaires. Les citoyens les consultent ; les contrôles terrain s''y rattachent.',
   'جولات الجمع ومواقيتها. يطّلع عليها المواطنون وتُربط بها المراقبة الميدانية.', 'formulaire', 'circuit'),
  ('parc', 'reference', 5, 'Parc d''engins', 'حظيرة المعدات',
   'Les engins du service, un par un. Le carburant, l''entretien et le déclassement s''y rattachent.',
   'معدات المصلحة واحدة واحدة. تُربط بها المحروقات والصيانة والإسقاط.', 'formulaire', 'engin'),
  ('plans_entretien', 'reference', 6, 'Plans d''entretien des engins', 'مخططات صيانة المعدات',
   'Pour chaque engin, l''entretien à prévoir (kilomètres ou jours). Les échéances en retard s''affichent d''elles-mêmes.',
   'لكل معدة، الصيانة المبرمجة (بالكيلومترات أو بالأيام). تظهر الآجال المتأخرة من تلقاء نفسها.', 'ecran', 'parc'),
  ('agents', 'reference', 7, 'Agents de terrain', 'أعوان الميدان',
   'Les agents du service de la propreté : chauffeurs, ripeurs, balayeurs, chefs d''équipe.',
   'أعوان مصلحة النظافة: سواق وعمال جمع وكناسون ورؤساء فرق.', 'formulaire', 'agent'),
  ('effectifs', 'reference', 8, 'Effectif du service pour l''année', 'عدد أعوان المصلحة للسنة',
   'Le nombre d''ouvriers et d''agents d''encadrement du service, pour l''année en cours.',
   'عدد العمال وأعوان التأطير بالمصلحة للسنة الجارية.', 'ecran', 'personnel'),
  ('masse_salariale', 'reference', 9, 'Masse salariale du service pour l''année', 'كتلة أجور المصلحة للسنة',
   'Le coût du personnel du service sur l''année, en un seul montant : jamais un salaire individuel.',
   'كلفة أعوان المصلحة على السنة في مبلغ واحد: ولا أجر فردي أبدًا.', 'ecran', 'personnel'),
  ('objectif_balayage', 'reference', 10, 'Objectif de balayage', 'هدف الكنس',
   'Les mètres linéaires à balayer chaque jour. Le balayage réalisé s''y compare.',
   'عدد الأمتار الطولية التي يجب كنسها كل يوم. يُقارن بها الكنس المنجز.', 'parametre', 'objectif_balayage'),
  ('commerces', 'reference', 11, 'Registre des commerces', 'سجل المحلات',
   'Les commerces suivis par le service (conventions de propreté, collecte des déchets assimilés).',
   'المحلات التي تتابعها المصلحة (اتفاقيات النظافة، جمع الفضلات المشابهة).', 'formulaire', 'commerce'),
  ('pcgd', 'reference', 12, 'Plan communal de gestion des déchets (PCGD)', 'المخطط البلدي للتصرف في النفايات',
   'Le PCGD de la commune : statut, année d''adoption, horizon, bureau d''études. Sa caractérisation des déchets en découle.',
   'المخطط البلدي للبلدية: وضعيته وسنة المصادقة والأفق ومكتب الدراسات. يُستخرج منه تصنيف النفايات.', 'formulaire', 'pcgd'),
  ('caracterisation', 'reference', 13, 'Caractérisation des déchets de la commune', 'تصنيف نفايات البلدية',
   'La composition des déchets mesurée pour la commune. Sans elle, la moyenne nationale de l''ANGeD sert de repli.',
   'تركيبة النفايات المقيسة للبلدية. في غيابها يُعتمد المعدل الوطني للوكالة.', 'formulaire', 'caracterisation'),
  ('contacts', 'reference', 14, 'Carnet de contacts', 'دفتر جهات الاتصال',
   'Les interlocuteurs du service : prestataires, associations, administrations.',
   'محاورو المصلحة: المتعهدون والجمعيات والإدارات.', 'formulaire', 'contact'),
  ('pesees', 'registre_mois', 1, 'Pesées', 'الأوزان',
   'Les tonnages pesés à la décharge ou au centre de transfert.',
   'الكميات الموزونة بالمصب أو بمركز التحويل.', 'ecran', 'pesees'),
  ('carburant', 'registre_mois', 2, 'Registre carburant', 'سجل المحروقات',
   'Les pleins de carburant, engin par engin.',
   'عمليات التزوّد بالمحروقات، معدة بمعدة.', 'formulaire', 'plein-carburant'),
  ('presences', 'registre_mois', 3, 'Pointage des agents', 'تسجيل حضور الأعوان',
   'Les présences et absences des agents, jour par jour.',
   'حضور الأعوان وغيابهم، يومًا بيوم.', 'ecran', 'personnel'),
  ('fins_de_poste', 'registre_mois', 4, 'Fins de poste', 'نهاية المناوبة',
   'Le retour de chaque engin en fin de tournée, benne bâchée ou non.',
   'عودة كل معدة في آخر الجولة، والحاوية مغطاة أم لا.', 'formulaire', 'fin-de-poste'),
  ('controles', 'registre_mois', 5, 'Contrôles terrain', 'المراقبة الميدانية',
   'Les constats faits sur le terrain le long des circuits.',
   'المعاينات الميدانية على طول المسالك.', 'ecran', 'constat'),
  ('maintenance', 'registre_mois', 6, 'Interventions d''entretien', 'تدخلات الصيانة',
   'Les interventions sur les engins, chacune avec son coût.',
   'التدخلات على المعدات، كل منها بكلفته.', 'ecran', 'parc'),
  ('balayage', 'registre_mois', 7, 'Nettoyages terminés', 'عمليات التنظيف المنجزة',
   'Les nettoyages réalisés, avec les mètres linéaires balayés.',
   'عمليات التنظيف المنجزة مع الأمتار الطولية المكنوسة.', 'ecran', 'registres')
ON CONFLICT (code) DO UPDATE SET rubrique = EXCLUDED.rubrique, ordre = EXCLUDED.ordre,
  libelle_fr = EXCLUDED.libelle_fr, libelle_ar = EXCLUDED.libelle_ar, aide_fr = EXCLUDED.aide_fr,
  aide_ar = EXCLUDED.aide_ar, nature = EXCLUDED.nature, cible = EXCLUDED.cible;

DELETE FROM sources_elements_completude;
INSERT INTO sources_elements_completude (element, source) VALUES
  ('population', 'population'),
  -- Un circuit suffit à la communication des horaires (M1-3) et à l'usage du
  -- numérique (M3-3) : c'est la règle du calcul (070), pas une approximation.
  ('circuits', 'circuits'), ('circuits', 'communication'), ('circuits', 'usage_numerique'),
  ('parc', 'usage_numerique'),
  ('plans_entretien', 'plans_entretien'),
  ('agents', 'agents_terrain'),
  ('effectifs', 'effectif_ouvriers'), ('effectifs', 'effectif_encadrement'),
  ('masse_salariale', 'masse_salariale'),
  ('objectif_balayage', 'objectif_balayage'),
  ('commerces', 'commerces'),
  ('pesees', 'pesees'),
  ('carburant', 'carburant'),
  ('presences', 'presences'),
  ('fins_de_poste', 'fins_de_poste'),
  ('controles', 'controles'),
  ('maintenance', 'maintenance'),
  ('balayage', 'balayage');

-- ---------------------------------------------------------------------------
-- 2. Un élément est-il présent ? (interne)
-- ---------------------------------------------------------------------------
--
-- « nombre » dit ce qu'il y a derrière un élément présent (circuits
-- enregistrés, habitants, pleins du mois…) ; il est vide quand l'élément est à
-- ajouter — l'écran dit « à ajouter », pas « 0 ». « annee » est celle de la
-- donnée (PCGD, caractérisation) ou l'année concernée (effectif, masse
-- salariale : celle du jour demandé, présente ou non).
--
-- Quand l'élément alimente un indicateur, sa présence est celle de la source
-- (app.source_tenue) : « présent » ici et « il manque » dans le panneau d'un
-- indicateur ne peuvent pas se contredire.

CREATE OR REPLACE FUNCTION app._element_completude(p_commune text, p_code text, p_jour date,
  OUT present boolean, OUT nombre bigint, OUT annee integer)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$fn$
DECLARE
  v_mois  date := date_trunc('month', p_jour)::date;
  v_an    date := date_trunc('year', p_jour)::date;
  v_annee int  := extract(year FROM p_jour)::int;
BEGIN
  CASE p_code
    WHEN 'population' THEN
      present := app.source_tenue(p_commune, 'population', v_an, p_jour);
      SELECT COALESCE(pc.population_permanente, NULLIF(c.population, 0)) INTO nombre
        FROM communes c LEFT JOIN parametres_commune pc ON pc.commune_id = c.id WHERE c.id = p_commune;
    WHEN 'perimetre' THEN
      SELECT c.boundary_geom IS NOT NULL INTO present FROM communes c WHERE c.id = p_commune;
    WHEN 'secteurs' THEN
      SELECT count(*) INTO nombre FROM zones_collecte z WHERE z.commune_id = p_commune AND z.deleted_at IS NULL;
      present := nombre > 0;
    WHEN 'circuits' THEN
      SELECT count(*) INTO nombre FROM circuits ci WHERE ci.commune_id = p_commune AND ci.deleted_at IS NULL;
      present := nombre > 0;
    WHEN 'parc' THEN
      SELECT count(*) INTO nombre FROM vehicules v WHERE v.commune_id = p_commune AND v.deleted_at IS NULL;
      present := nombre > 0;
    WHEN 'plans_entretien' THEN
      present := app.source_tenue(p_commune, 'plans_entretien', v_an, p_jour);
      SELECT count(*) INTO nombre FROM plans_entretien pe WHERE pe.commune_id = p_commune AND pe.deleted_at IS NULL;
    WHEN 'agents' THEN
      present := app.source_tenue(p_commune, 'agents_terrain', v_an, p_jour);
      SELECT count(*) INTO nombre FROM personnel pe WHERE pe.commune_id = p_commune AND pe.deleted_at IS NULL AND pe.actif
         AND COALESCE(pe.service, 'proprete') = 'proprete'
         AND pe.fonction IN ('chauffeur', 'agent', 'chef_equipe', 'agent_balayage', 'ripeur',
                             'tractoriste', 'jardinier', 'agent_hygiene', 'mecanicien');
    WHEN 'effectifs' THEN
      present := app.source_tenue(p_commune, 'effectif_ouvriers', v_an, p_jour)
             AND app.source_tenue(p_commune, 'effectif_encadrement', v_an, p_jour);
      SELECT es.effectif_ouvriers + COALESCE(es.effectif_encadrement, 0) INTO nombre
        FROM effectifs_service es WHERE es.commune_id = p_commune AND es.annee = v_annee AND es.service = 'proprete';
      annee := v_annee;
    WHEN 'masse_salariale' THEN
      present := app.source_tenue(p_commune, 'masse_salariale', v_an, p_jour);
      annee := v_annee;
    WHEN 'objectif_balayage' THEN
      present := app.source_tenue(p_commune, 'objectif_balayage', v_an, p_jour);
      SELECT pc.objectif_balayage_ml_j INTO nombre FROM parametres_commune pc WHERE pc.commune_id = p_commune;
    WHEN 'commerces' THEN
      present := app.source_tenue(p_commune, 'commerces', v_an, p_jour);
      SELECT count(*) INTO nombre FROM commerces c WHERE c.commune_id = p_commune AND c.deleted_at IS NULL AND c.actif;
    WHEN 'pcgd' THEN
      SELECT count(*) INTO nombre FROM pcgd p WHERE p.commune_id = p_commune AND p.deleted_at IS NULL;
      present := nombre > 0;
      SELECT p.annee_adoption INTO annee FROM pcgd p WHERE p.commune_id = p_commune AND p.deleted_at IS NULL
       ORDER BY p.saisi_le DESC LIMIT 1;
    WHEN 'caracterisation' THEN
      -- La moyenne nationale ne compte pas : c'est le repli, pas une étude de la commune.
      SELECT count(*) INTO nombre FROM caracterisations ca WHERE ca.commune_id = p_commune AND ca.deleted_at IS NULL;
      present := nombre > 0;
      SELECT max(ca.annee) INTO annee FROM caracterisations ca WHERE ca.commune_id = p_commune AND ca.deleted_at IS NULL;
    WHEN 'contacts' THEN
      SELECT count(*) INTO nombre FROM contacts co WHERE co.commune_id = p_commune AND co.deleted_at IS NULL;
      present := nombre > 0;
    -- Les registres du mois : du premier du mois au jour demandé.
    WHEN 'pesees' THEN
      present := app.source_tenue(p_commune, 'pesees', v_mois, p_jour);
      SELECT count(*) INTO nombre FROM pesees pe WHERE pe.commune_id = p_commune AND pe.deleted_at IS NULL
         AND pe.poids_net_kg > 0 AND pe.date_pesee BETWEEN v_mois AND p_jour;
    WHEN 'carburant' THEN
      present := app.source_tenue(p_commune, 'carburant', v_mois, p_jour);
      SELECT count(*) INTO nombre FROM fuel_logs f WHERE f.commune_id = p_commune AND f.deleted_at IS NULL
         AND f.date_plein BETWEEN v_mois AND p_jour;
    WHEN 'presences' THEN
      present := app.source_tenue(p_commune, 'presences', v_mois, p_jour);
      SELECT count(DISTINCT pr.jour) INTO nombre FROM presences pr WHERE pr.commune_id = p_commune
         AND pr.jour BETWEEN v_mois AND p_jour;
    WHEN 'fins_de_poste' THEN
      present := app.source_tenue(p_commune, 'fins_de_poste', v_mois, p_jour);
      SELECT count(*) INTO nombre FROM fins_de_poste f WHERE f.commune_id = p_commune AND f.deleted_at IS NULL
         AND f.jour BETWEEN v_mois AND p_jour;
    WHEN 'controles' THEN
      present := app.source_tenue(p_commune, 'controles', v_mois, p_jour);
      SELECT count(*) INTO nombre FROM controles_terrain ct WHERE ct.commune_id = p_commune AND ct.deleted_at IS NULL
         AND ct.date_controle BETWEEN v_mois AND p_jour;
    WHEN 'maintenance' THEN
      -- Une intervention sans coût ne tient pas le registre : le coût de
      -- maintenance ne se calcule pas sans lui (070).
      present := app.source_tenue(p_commune, 'maintenance', v_mois, p_jour);
      SELECT count(*) INTO nombre FROM interventions_maintenance im WHERE im.commune_id = p_commune AND im.deleted_at IS NULL
         AND im.date_intervention BETWEEN v_mois AND p_jour;
    WHEN 'balayage' THEN
      present := app.source_tenue(p_commune, 'balayage', v_mois, p_jour);
      SELECT count(*) INTO nombre FROM actions_planifiees a WHERE a.commune_id = p_commune AND a.deleted_at IS NULL
         AND a.type = 'nettoyage' AND a.statut = 'terminee' AND a.metres_lineaires IS NOT NULL
         AND a.date_prevue BETWEEN v_mois AND p_jour;
    ELSE
      RAISE EXCEPTION 'COMPLETUDE_ELEMENT_INCONNU: %', p_code;
  END CASE;
  present := COALESCE(present, false);
  IF NOT present THEN
    nombre := NULL;
  END IF;
END;
$fn$;
REVOKE ALL ON FUNCTION app._element_completude(text, text, date) FROM PUBLIC;
COMMENT ON FUNCTION app._element_completude(text, text, date) IS
  'Interne (lot 5) : un élément de « Ma commune dans SIIPI » est-il présent au jour donné, et ce qu''il y a derrière (nombre vide quand il est à ajouter). Les registres du mois portent sur le mois du jour donné, jusqu''à ce jour.';

-- ---------------------------------------------------------------------------
-- 3. La complétude d'une commune
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS app.completude_commune(text, date);
CREATE FUNCTION app.completude_commune(p_commune text, p_jour date)
  RETURNS TABLE (code text, rubrique text, ordre smallint, libelle_fr text, libelle_ar text,
                 aide_fr text, aide_ar text, nature text, cible text,
                 present boolean, nombre bigint, annee integer, indicateurs text[])
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT e.code, e.rubrique, e.ordre, e.libelle_fr, e.libelle_ar, e.aide_fr, e.aide_ar, e.nature, e.cible,
         x.present, x.nombre, x.annee,
         -- Les indicateurs qu'il débloque, dans l'ordre du catalogue.
         COALESCE((SELECT array_agg(k.code ORDER BY k.ordre, k.code)
                     FROM indicateurs_kpi k
                    WHERE EXISTS (SELECT 1 FROM dependances_indicateurs d
                                    JOIN sources_elements_completude s ON s.source = d.source
                                   WHERE s.element = e.code AND d.indicateur_code = k.code)), '{}')
    FROM elements_completude e
   CROSS JOIN LATERAL app._element_completude(p_commune, e.code, p_jour) x
   WHERE app.can_read_commune(p_commune)
   ORDER BY e.rubrique, e.ordre
$$;
GRANT EXECUTE ON FUNCTION app.completude_commune(text, date) TO siipi_app;
COMMENT ON FUNCTION app.completude_commune(text, date) IS
  '« Ma commune dans SIIPI » (refonte, lot 5 ; SPEC § 2.4) : chaque donnée de référence et chaque registre du mois, présent ou à ajouter, où il se complète, et les indicateurs qu''il débloque. Une commune à la fois, sans total ni pourcentage : une liste de choses à faire, pas une note. Rien pour une commune hors du périmètre de l''appelant.';
