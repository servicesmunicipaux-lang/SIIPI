-- ===========================================================================
-- Migration 050 — Jalon 8 : le tableau de bord KPI 5 axes, la grille du
--                 Concours national de propreté, et la préparation au décret
--                 sur le tri à la source (TDR §3.2.10, A2.3, A3.1, A3.3, B7.4)
--
-- LA RÈGLE D'OR : UNE DONNÉE MANQUANTE N'EST PAS UN ZÉRO. Tout ce qui suit est
-- construit pour qu'un indicateur sans source reste « non renseigné » :
--   - une valeur saisie est une LIGNE (valeurs_kpi) ; pas de ligne, pas de
--     valeur — jamais un 0 par défaut ;
--   - une mesure calculée rend NULL quand le module qui la nourrit n'a jamais
--     servi dans la commune (aucun contrôle terrain, aucune réclamation…) ;
--   - la note d'une commune ne se calcule que sur ce qui est renseigné, et
--     le nombre d'indicateurs évalués s'affiche à côté (« 14/19 »).
--
-- DEUX SORTES D'INDICATEURS.
--   - Calculés : ce que SIIPI mesure déjà — contrôles terrain, réclamations,
--     entretien du parc, publications, pesées, usage de la plateforme.
--   - Saisis : ce que SIIPI ne voit pas — mètres linéaires balayés, bennes
--     bâchées, dotation en EPI, marchés, cimetières, abattoir, conventions…
--     Ils se déclarent dans la FICHE D'ÉVALUATION annuelle de la commune, que
--     la FNCT valide. Le classement officiel ne retient que les fiches
--     validées : une note déclarée par la commune elle-même n'est pas une
--     note de concours.
--
-- LE BARÈME EST UNE DONNÉE, PAS DU CODE. La répartition des 100 points entre
-- les 19 indicateurs du Concours est celle de la grille ministérielle ; elle
-- est rangée dans indicateurs_kpi.points et se modifie par la FNCT. Les
-- valeurs posées ici sont PROVISOIRES (parametres_kpi.bareme_provisoire = 1) :
-- l'écran le dit tant que la FNCT ne les a pas confirmées.
--
-- LES DISTRICTS FNCT SONT UNE DONNÉE, PAS UNE HYPOTHÈSE. Aucune liste
-- officielle n'est disponible dans le dépôt (FEUILLE_DE_ROUTE §7) : la table
-- existe, vide ; la FNCT la remplit et rattache les 24 gouvernorats. Tant
-- qu'elle ne l'a pas fait, la vue par district le dit — elle n'invente pas.
--
-- LE DÉCRET DMA N'EST PAS EN VIGUEUR. Les indicateurs de préparation au tri à
-- la source (famille « dma ») mesurent une maturité ; ils n'entrent pas dans
-- la note du Concours et ne pénalisent personne (parametres_kpi.dma_en_vigueur
-- = 0).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Le catalogue des indicateurs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS indicateurs_kpi (
    code          TEXT PRIMARY KEY,
    -- concours : l'un des 19 indicateurs de la grille ministérielle ;
    -- dma : préparation au tri à la source ; donnee : une saisie qui nourrit
    -- un axe sans être notée (heures de formation, carburant…).
    famille       TEXT NOT NULL,
    module        TEXT,
    axe           SMALLINT NOT NULL,
    libelle_fr    TEXT NOT NULL,
    libelle_ar    TEXT NOT NULL,
    description   TEXT NOT NULL,
    -- calcule : SIIPI le mesure ; saisi : la fiche d'évaluation le porte.
    mode          TEXT NOT NULL,
    -- Pour un indicateur saisi : ratio (valeur / cible), taux (0 à 100 %),
    -- nombre ou montant (une donnée, sans note).
    saisie        TEXT,
    libelle_valeur TEXT,
    libelle_cible  TEXT,
    unite         TEXT,
    points        NUMERIC(6, 2),
    ordre         SMALLINT NOT NULL DEFAULT 0,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by    UUID REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT indicateurs_kpi_famille CHECK (famille IN ('concours', 'dma', 'donnee')),
    CONSTRAINT indicateurs_kpi_axe CHECK (axe BETWEEN 1 AND 5),
    CONSTRAINT indicateurs_kpi_mode CHECK (mode IN ('calcule', 'saisi')),
    CONSTRAINT indicateurs_kpi_saisie CHECK (
      (mode = 'calcule' AND saisie IS NULL) OR (mode = 'saisi' AND saisie IN ('ratio', 'taux', 'nombre', 'montant'))),
    CONSTRAINT indicateurs_kpi_points CHECK (
      (famille = 'concours' AND points IS NOT NULL AND points >= 0) OR (famille <> 'concours' AND points IS NULL))
);

COMMENT ON TABLE indicateurs_kpi IS
  'Catalogue des indicateurs du tableau de bord (TDR §3.2.10) : les 19 du Concours national de propreté (famille concours, barème dans points), la préparation au décret DMA (famille dma) et les données saisies qui nourrissent un axe (famille donnee). Le barème se modifie par la FNCT.';

INSERT INTO indicateurs_kpi
  (code, famille, module, axe, libelle_fr, libelle_ar, description, mode, saisie, libelle_valeur, libelle_cible, unite, points, ordre)
VALUES
  -- Module 1 — propreté urbaine et service de collecte
  ('M1-1', 'concours', 'M1', 1, 'Balayage des voies principales', 'كنس الطرقات الرئيسية',
   'Mètres linéaires balayés par jour en centre-ville et sur les voies principales, rapportés à l''objectif fixé selon la taille de la commune.',
   'saisi', 'ratio', 'Mètres linéaires balayés par jour', 'Objectif (mètres linéaires par jour)', 'ml/j', 8, 11),
  ('M1-2', 'concours', 'M1', 1, 'Couverture des circuits et respect des horaires', 'تغطية الدورات واحترام المواعيد',
   'Contrôles terrain de l''année : un passage « fait » compte pour 1, « partiel » pour ½, « non fait » pour 0. Non renseigné sans aucun contrôle.',
   'calcule', NULL, NULL, NULL, '%', 8, 12),
  ('M1-3', 'concours', 'M1', 2, 'Propreté générale, information et mesures dissuasives', 'النظافة العامة والإعلام والإجراءات الردعية',
   'Trois tiers : un calendrier de collecte publié (au moins un circuit actif avec ses jours de passage) ; une information régulière (annonces et notifications publiées, quatre par an pour le plein) ; une consultation (au moins un sondage ou un projet publié). Non renseigné si la commune n''a jamais utilisé ces modules.',
   'calcule', NULL, NULL, NULL, '%', 6, 13),
  ('M1-4', 'concours', 'M1', 1, 'Désherbage et balayage des caniveaux', 'إزالة الأعشاب وتنظيف المجاري',
   'Taux de réalisation du programme de désherbage et de curage des caniveaux (les actions planifiées de l''onglet Points peuvent servir de pièce).',
   'saisi', 'taux', 'Taux de réalisation', NULL, '%', 5, 14),
  ('M1-5', 'concours', 'M1', 3, 'Décharges temporaires, déchets verts et DDC', 'المصبات الوقتية والفضلات الخضراء وفضلات البناء',
   'Demandes d''enlèvement de déchets verts et de déchets de démolition de l''année traitées (réalisées ou orientées vers un collecteur agréé), sur les demandes non annulées.',
   'calcule', NULL, NULL, NULL, '%', 5, 15),
  ('M1-6', 'concours', 'M1', 5, 'Équipements de protection et bien-être des ouvriers', 'معدات الوقاية وظروف عمل العمال',
   'Ouvriers dotés d''équipements de protection individuelle et les portant, rapportés à l''effectif ouvrier.',
   'saisi', 'ratio', 'Ouvriers dotés et équipés', 'Effectif ouvrier', 'ouvriers', 5, 16),
  ('M1-7', 'concours', 'M1', 1, 'Maintenance et lavage des engins et conteneurs', 'صيانة وغسل المعدات والحاويات',
   'Plans d''entretien (Jalon 5) qui ne sont pas en retard, sur les plans évaluables. Non renseigné sans plan d''entretien. Le lavage n''est pas encore tracé par la plateforme.',
   'calcule', NULL, NULL, NULL, '%', 5, 17),
  ('M1-8', 'concours', 'M1', 3, 'Exploitation de la décharge et prévention des incendies', 'استغلال المصب والوقاية من الحرائق',
   'Mode d''exploitation de la décharge finale quand la commune la contrôle, et plan de prévention des incendies. Si la décharge est contrôlée par l''ANGeD, ses points passent sur le bâchage des bennes (M1-9).',
   'saisi', 'taux', 'Taux de conformité', NULL, '%', 5, 18),
  ('M1-9', 'concours', 'M1', 1, 'Bâchage des bennes pendant le transport', 'تغطية الشاحنات أثناء النقل',
   'Bennes basculantes couvertes pendant le transport vers la décharge ou le centre de transfert, rapportées aux bennes basculantes du parc.',
   'saisi', 'ratio', 'Bennes bâchées', 'Bennes basculantes', 'bennes', 4, 19),
  ('M1-10', 'concours', 'M1', 3, 'Innovation et partenariats pour la durabilité', 'التجديد والشراكات من أجل الاستدامة',
   'Projets innovants et partenariats internationaux ou associatifs. Sans aucune expérience innovante, ses points passent sur la propreté générale et la communication (M1-3).',
   'saisi', 'taux', 'Appréciation', NULL, '%', 4, 20),
  -- Module 2 — espaces et équipements spécifiques
  ('M2-1', 'concours', 'M2', 1, 'Espaces verts et places publiques', 'المساحات الخضراء والساحات العمومية',
   'Propreté des espaces verts et des places, équipement en petits conteneurs.',
   'saisi', 'taux', 'Appréciation', NULL, '%', 4, 21),
  ('M2-2', 'concours', 'M2', 4, 'Conventions de propreté avec commerces et institutions', 'اتفاقيات النظافة مع المحلات والمؤسسات',
   'Établissements (commerces, institutions publiques) couverts par une convention de propreté, sur les établissements ciblés.',
   'saisi', 'ratio', 'Établissements conventionnés', 'Établissements ciblés', 'établissements', 4, 22),
  ('M2-3', 'concours', 'M2', 1, 'Cimetières', 'المقابر',
   'Propreté et entretien des cimetières.',
   'saisi', 'taux', 'Appréciation', NULL, '%', 4, 23),
  ('M2-4', 'concours', 'M2', 1, 'Marchés municipaux', 'الأسواق البلدية',
   'Propreté des marchés municipaux et collecte de leurs déchets.',
   'saisi', 'taux', 'Appréciation', NULL, '%', 4, 24),
  ('M2-5', 'concours', 'M2', 1, 'Abattoirs', 'المسالخ',
   'Propreté des abattoirs municipaux. Sans abattoir municipal, l''indicateur est « sans objet » et sort du calcul sans pénaliser la commune.',
   'saisi', 'taux', 'Appréciation', NULL, '%', 4, 25),
  -- Module 3 — citoyens, participation, gouvernance
  ('M3-1', 'concours', 'M3', 2, 'Traitement des réclamations', 'معالجة الإبلاغات',
   'Moitié : réclamations de l''année résolues (hors rejetées) ; moitié : résolues dans le délai fixé par la commune (Paramètres). Non renseigné sans réclamation.',
   'calcule', NULL, NULL, NULL, '%', 8, 31),
  ('M3-2', 'concours', 'M3', 2, 'Participation citoyenne, jeunesse et associations', 'المشاركة المواطنية والشباب والجمعيات',
   'Événements et compétitions avec la jeunesse, les scouts et les associations locales, rapportés à l''objectif annuel.',
   'saisi', 'ratio', 'Événements réalisés', 'Objectif annuel', 'événements', 5, 32),
  ('M3-3', 'concours', 'M3', 2, 'Digitalisation du service de propreté', 'رقمنة خدمة النظافة',
   'Modules de SIIPI réellement utilisés dans l''année, sur six : circuits et arrêts, contrôles terrain, pesées, réclamations traitées, présences du personnel, inventaire du parc. Non renseigné tant que la commune n''a utilisé aucun de ces modules.',
   'calcule', NULL, NULL, NULL, '%', 6, 33),
  ('M3-4', 'concours', 'M3', 2, 'Partenariat intercommunal et comités de quartier', 'الشراكة بين البلديات ولجان الأحياء',
   'Conventions intercommunales et comités de quartier actifs, rapportés à l''objectif (par exemple le nombre de quartiers).',
   'saisi', 'ratio', 'Conventions et comités actifs', 'Objectif', 'comités', 6, 34),
  -- Préparation au décret DMA (tri à la source) — dispositif d'anticipation
  ('DMA-1', 'dma', NULL, 3, 'Conteneurs normalisés déployés', 'الحاويات المطابقة للمواصفات',
   'Conteneurs aux couleurs du futur décret (vert : organique, bleu : sec, rouge : dangereux) déployés, sur le parc de conteneurs.',
   'saisi', 'ratio', 'Conteneurs normalisés', 'Parc de conteneurs', 'conteneurs', NULL, 41),
  ('DMA-2', 'dma', NULL, 3, 'Zones pilotes de pré-collecte séparée', 'مناطق نموذجية للجمع المنفصل',
   'Secteurs où la pré-collecte séparée est expérimentée, sur les secteurs de la commune.',
   'saisi', 'ratio', 'Secteurs pilotes', 'Secteurs de la commune', 'secteurs', NULL, 42),
  ('DMA-3', 'dma', NULL, 3, 'Campagnes de sensibilisation au tri', 'حملات التحسيس بالفرز',
   'Campagnes de sensibilisation au tri réalisées dans l''année, sur l''objectif.',
   'saisi', 'ratio', 'Campagnes réalisées', 'Objectif annuel', 'campagnes', NULL, 43),
  ('DMA-4', 'dma', NULL, 3, 'Part des tonnages collectés séparément', 'نسبة الكميات المجمعة بصفة منفصلة',
   'Pesées « tri » et « déchets verts » de l''année, sur l''ensemble des pesées. Non renseigné sans pesée.',
   'calcule', NULL, NULL, NULL, '%', NULL, 44),
  -- Données saisies qui nourrissent un axe
  ('RH-FORMATION', 'donnee', NULL, 5, 'Heures de formation', 'ساعات التكوين',
   'Heures de formation suivies par le personnel du service dans l''année.', 'saisi', 'nombre', 'Heures', NULL, 'h', NULL, 51),
  ('RH-ACCIDENTS', 'donnee', NULL, 5, 'Accidents du travail', 'حوادث الشغل',
   'Accidents du travail déclarés dans l''année. Zéro se saisit : une case vide veut dire « non renseigné », pas « aucun accident ».',
   'saisi', 'nombre', 'Accidents', NULL, 'accidents', NULL, 52),
  ('ECO-CARBURANT', 'donnee', NULL, 4, 'Dépenses de carburant', 'مصاريف المحروقات',
   'Dépenses de carburant du service de propreté dans l''année.', 'saisi', 'montant', 'Montant', NULL, 'TND', NULL, 53),
  ('ECO-DECHARGE', 'donnee', NULL, 4, 'Redevances de mise en décharge et de pesée', 'معاليم الإيداع بالمصب والوزن',
   'Redevances payées dans l''année pour la mise en décharge, le transfert et la pesée.', 'saisi', 'montant', 'Montant', NULL, 'TND', NULL, 54),
  -- Mesures calculées par SIIPI, sans note : elles se lisent dans leur unité.
  ('TONNAGE_T', 'donnee', NULL, 1, 'Tonnage pesé', 'الكميات الموزونة',
   'Somme des pesées de l''année (module Pesées).', 'calcule', NULL, NULL, NULL, 't', NULL, 61),
  ('KG_HAB_J', 'donnee', NULL, 1, 'Production par habitant', 'الإنتاج لكل ساكن',
   'Kilogrammes pesés par habitant et par jour, rapportés aux seuls mois pesés.', 'calcule', NULL, NULL, NULL, 'kg/hab/j', NULL, 62),
  ('CIRCUITS', 'donnee', NULL, 1, 'Circuits enregistrés', 'الدورات المسجلة',
   'Circuits de collecte enregistrés dans la plateforme.', 'calcule', NULL, NULL, NULL, 'circuits', NULL, 63),
  ('RECLAMATIONS', 'donnee', NULL, 2, 'Réclamations reçues', 'الإبلاغات الواردة',
   'Réclamations reçues dans l''année, hors rejetées.', 'calcule', NULL, NULL, NULL, 'réclamations', NULL, 64),
  ('DELAI_MOYEN_J', 'donnee', NULL, 2, 'Délai moyen de résolution', 'متوسط أجل المعالجة',
   'Délai moyen entre la réception et la résolution des réclamations résolues de l''année.', 'calcule', NULL, NULL, NULL, 'jours', NULL, 65),
  ('MASSE_SALARIALE', 'donnee', NULL, 4, 'Masse salariale du service', 'كتلة الأجور للمصلحة',
   'Masse salariale déclarée pour le service de propreté (module Personnel).', 'calcule', NULL, NULL, NULL, 'TND', NULL, 66),
  ('COUT_MAINTENANCE', 'donnee', NULL, 4, 'Coût de maintenance des engins', 'كلفة صيانة المعدات',
   'Somme des interventions de l''année (Jalon 5). Non renseigné si une intervention n''a pas de coût : une somme partielle se lirait comme complète.', 'calcule', NULL, NULL, NULL, 'TND', NULL, 67),
  ('COUT_TONNE', 'donnee', NULL, 4, 'Coût global à la tonne', 'الكلفة الجملية للطن',
   'Masse salariale, carburant, maintenance et redevances, rapportés aux jours pesés, divisés par le tonnage pesé. Non renseigné tant qu''une de ces quatre composantes manque.', 'calcule', NULL, NULL, NULL, 'TND/t', NULL, 68),
  ('EFFECTIF_OUVRIERS', 'donnee', NULL, 5, 'Effectif ouvrier', 'عدد العمال',
   'Ouvriers du service de propreté déclarés pour l''année (module Personnel).', 'calcule', NULL, NULL, NULL, 'ouvriers', NULL, 69),
  ('ENCADREMENT', 'donnee', NULL, 5, 'Ratio d''encadrement', 'نسبة التأطير',
   'Agents d''encadrement par ouvrier.', 'calcule', NULL, NULL, NULL, 'par ouvrier', NULL, 70),
  ('ABSENTEISME', 'donnee', NULL, 5, 'Absentéisme', 'التغيب',
   'Absences hors congés, repos, formation et détachement, sur les journées saisies au pointage.', 'calcule', NULL, NULL, NULL, '%', NULL, 71)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Les paramètres nationaux (A3.3) — seuils d'alerte et état du barème
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS parametres_kpi (
    cle         TEXT PRIMARY KEY,
    valeur      NUMERIC NOT NULL,
    libelle     TEXT NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by  UUID REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO parametres_kpi (cle, valeur, libelle) VALUES
  ('reclamation_delai_heures', 48, 'Une réclamation en attente depuis plus de ce nombre d''heures est signalée à la FNCT.'),
  ('taux_resolution_min', 80, 'Taux de résolution des réclamations (%) en dessous duquel la commune est signalée.'),
  ('bachage_min', 80, 'Taux de bâchage des bennes (%) en dessous duquel la commune est signalée.'),
  ('maintenance_min', 80, 'Part des plans d''entretien à jour (%) en dessous de laquelle la commune est signalée.'),
  ('couverture_classement_min', 60, 'Part des points du Concours renseignés (%) en dessous de laquelle une commune n''est pas classée.'),
  ('bareme_provisoire', 1, 'Vaut 1 tant que la FNCT n''a pas confirmé le barème des 19 indicateurs.'),
  ('dma_en_vigueur', 0, 'Vaut 1 quand le décret sur le tri à la source sera en vigueur.')
ON CONFLICT (cle) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Les districts FNCT — vides tant que la FNCT ne les a pas définis
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS districts_fnct (
    code        TEXT PRIMARY KEY,
    nom         TEXT NOT NULL,
    nom_ar      TEXT,
    ordre       SMALLINT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT districts_fnct_code CHECK (code ~ '^[a-z0-9_-]{1,40}$'),
    CONSTRAINT districts_fnct_nom CHECK (length(btrim(nom)) > 0)
);

CREATE TABLE IF NOT EXISTS gouvernorats_district (
    gouvernorat    TEXT PRIMARY KEY,
    district_code  TEXT NOT NULL REFERENCES districts_fnct(code) ON DELETE CASCADE,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE districts_fnct IS
  'Les districts de la FNCT, définis par elle : aucune liste n''est posée par défaut, pour ne pas en inventer une.';

-- ---------------------------------------------------------------------------
-- 4. La fiche d'évaluation annuelle et ses valeurs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS evaluations_kpi (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id                TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    annee                     SMALLINT NOT NULL,
    statut                    TEXT NOT NULL DEFAULT 'brouillon',
    -- Ce qui décide des règles de reventilation du Concours. NULL : pas
    -- encore dit — la règle ne s'applique pas, et l'indicateur reste à saisir.
    a_abattoir                BOOLEAN,
    decharge_controlee_anged  BOOLEAN,
    experience_innovante      BOOLEAN,
    -- Qui suit les réclamations (M3-1) : une information, pas une note.
    agent_reclamations        BOOLEAN,
    motif_renvoi              TEXT,
    soumise_par               UUID REFERENCES users(id) ON DELETE SET NULL,
    soumise_le                TIMESTAMPTZ,
    validee_par               UUID REFERENCES users(id) ON DELETE SET NULL,
    validee_le                TIMESTAMPTZ,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT evaluations_kpi_statut CHECK (statut IN ('brouillon', 'soumise', 'validee')),
    CONSTRAINT evaluations_kpi_annee CHECK (annee BETWEEN 2020 AND 2100),
    CONSTRAINT evaluations_kpi_unique UNIQUE (commune_id, annee)
);

CREATE TABLE IF NOT EXISTS valeurs_kpi (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evaluation_id    UUID NOT NULL REFERENCES evaluations_kpi(id) ON DELETE CASCADE,
    commune_id       TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    indicateur_code  TEXT NOT NULL REFERENCES indicateurs_kpi(code),
    valeur           NUMERIC(16, 3) NOT NULL,
    cible            NUMERIC(16, 3),
    commentaire      TEXT,
    saisi_par        UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT valeurs_kpi_unique UNIQUE (evaluation_id, indicateur_code),
    CONSTRAINT valeurs_kpi_positives CHECK (valeur >= 0 AND (cible IS NULL OR cible > 0))
);

CREATE INDEX IF NOT EXISTS idx_valeurs_kpi_commune ON valeurs_kpi (commune_id);

COMMENT ON TABLE valeurs_kpi IS
  'Valeurs saisies de la fiche d''évaluation. Une valeur absente est une ligne absente : jamais un zéro par défaut.';

-- La valeur, la fiche et la commune vont ensemble ; une fiche validée ne se
-- retouche plus (la FNCT la rouvre d'abord).
CREATE OR REPLACE FUNCTION app.controler_valeur_kpi() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  e evaluations_kpi%ROWTYPE;
BEGIN
  SELECT * INTO e FROM evaluations_kpi WHERE id = COALESCE(NEW.evaluation_id, OLD.evaluation_id);
  IF TG_OP <> 'DELETE' AND e.commune_id <> NEW.commune_id THEN
    RAISE EXCEPTION 'FICHE_AUTRE_COMMUNE' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF e.statut = 'validee' THEN
    RAISE EXCEPTION 'FICHE_VALIDEE';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_valeurs_kpi_controle ON valeurs_kpi;
CREATE TRIGGER trg_valeurs_kpi_controle BEFORE INSERT OR UPDATE OR DELETE ON valeurs_kpi
  FOR EACH ROW EXECUTE FUNCTION app.controler_valeur_kpi();

DROP TRIGGER IF EXISTS trg_evaluations_kpi_updated_at ON evaluations_kpi;
CREATE TRIGGER trg_evaluations_kpi_updated_at BEFORE UPDATE ON evaluations_kpi
  FOR EACH ROW EXECUTE FUNCTION zones_collecte_set_updated_at();

DROP TRIGGER IF EXISTS trg_audit_evaluations_kpi ON evaluations_kpi;
CREATE TRIGGER trg_audit_evaluations_kpi AFTER INSERT OR UPDATE OR DELETE ON evaluations_kpi
  FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement();
DROP TRIGGER IF EXISTS trg_audit_valeurs_kpi ON valeurs_kpi;
CREATE TRIGGER trg_audit_valeurs_kpi AFTER INSERT OR UPDATE OR DELETE ON valeurs_kpi
  FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement();
DROP TRIGGER IF EXISTS trg_audit_indicateurs_kpi ON indicateurs_kpi;
CREATE TRIGGER trg_audit_indicateurs_kpi AFTER UPDATE ON indicateurs_kpi
  FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement();

-- ---------------------------------------------------------------------------
-- 5. Cloisonnement
--
-- Catalogue, paramètres et districts : lus par tout compte authentifié,
-- écrits par la FNCT. Fiches et valeurs : la commune et la FNCT ; seule la
-- FNCT valide (contrôlé dans la politique de mise à jour).
-- ---------------------------------------------------------------------------

ALTER TABLE indicateurs_kpi       ENABLE ROW LEVEL SECURITY;
ALTER TABLE indicateurs_kpi       FORCE  ROW LEVEL SECURITY;
ALTER TABLE parametres_kpi        ENABLE ROW LEVEL SECURITY;
ALTER TABLE parametres_kpi        FORCE  ROW LEVEL SECURITY;
ALTER TABLE districts_fnct        ENABLE ROW LEVEL SECURITY;
ALTER TABLE districts_fnct        FORCE  ROW LEVEL SECURITY;
ALTER TABLE gouvernorats_district ENABLE ROW LEVEL SECURITY;
ALTER TABLE gouvernorats_district FORCE  ROW LEVEL SECURITY;
ALTER TABLE evaluations_kpi       ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluations_kpi       FORCE  ROW LEVEL SECURITY;
ALTER TABLE valeurs_kpi           ENABLE ROW LEVEL SECURITY;
ALTER TABLE valeurs_kpi           FORCE  ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['indicateurs_kpi', 'parametres_kpi', 'districts_fnct', 'gouvernorats_district'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (app.is_authenticated())', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_fnct', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (app.is_fnct()) WITH CHECK (app.is_fnct())', t || '_fnct', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS evaluations_kpi_select ON evaluations_kpi;
CREATE POLICY evaluations_kpi_select ON evaluations_kpi FOR SELECT USING (app.can_write_commune(commune_id));
DROP POLICY IF EXISTS evaluations_kpi_insert ON evaluations_kpi;
CREATE POLICY evaluations_kpi_insert ON evaluations_kpi FOR INSERT
  WITH CHECK (app.can_write_commune(commune_id) AND statut = 'brouillon');
DROP POLICY IF EXISTS evaluations_kpi_update ON evaluations_kpi;
CREATE POLICY evaluations_kpi_update ON evaluations_kpi FOR UPDATE
  USING (app.can_write_commune(commune_id) AND (statut <> 'validee' OR app.is_fnct()))
  -- Hors FNCT, une fiche ne devient jamais « validée ».
  WITH CHECK (app.can_write_commune(commune_id) AND (statut <> 'validee' OR app.is_fnct()));

DROP POLICY IF EXISTS valeurs_kpi_tout ON valeurs_kpi;
CREATE POLICY valeurs_kpi_tout ON valeurs_kpi FOR ALL
  USING (app.can_write_commune(commune_id)) WITH CHECK (app.can_write_commune(commune_id));

GRANT SELECT ON indicateurs_kpi, parametres_kpi, districts_fnct, gouvernorats_district TO siipi_app;
GRANT INSERT, UPDATE, DELETE ON districts_fnct, gouvernorats_district TO siipi_app;
GRANT UPDATE ON indicateurs_kpi, parametres_kpi TO siipi_app;
GRANT SELECT, INSERT, UPDATE ON evaluations_kpi TO siipi_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON valeurs_kpi TO siipi_app;
REVOKE TRUNCATE ON indicateurs_kpi, parametres_kpi, districts_fnct, gouvernorats_district, evaluations_kpi, valeurs_kpi FROM siipi_app;

-- ---------------------------------------------------------------------------
-- 6. Ce que SIIPI mesure lui-même, pour une année, commune par commune
--
-- SECURITY DEFINER, restreinte aux communes que l'appelant peut lire comme
-- commune ou comme FNCT (app.can_write_commune) : la fonction ne rend rien
-- qu'un tableau de la commune ne rendrait déjà.
--
-- Chaque mesure est NULL quand sa source n'existe pas pour la commune. Une
-- ligne par (commune, code) : valeur (la mesure dans son unité), note (entre
-- 0 et 1, pour les indicateurs notés), detail (de quoi relire le calcul).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.mesures_kpi(p_annee integer)
  RETURNS TABLE (commune_id text, code text, valeur numeric, note numeric, detail jsonb)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  WITH bornes AS (
    SELECT make_date(p_annee, 1, 1) AS debut,
           LEAST(make_date(p_annee, 12, 31), (now() AT TIME ZONE 'Africa/Tunis')::date) AS fin
  ),
  communes_vues AS (
    SELECT c.id, c.population, c.activee FROM communes c WHERE app.can_write_commune(c.id)
  ),

  -- M1-2 : les contrôles terrain de l'année.
  controles AS (
    SELECT ct.commune_id,
           count(*) AS n,
           count(*) FILTER (WHERE ct.etat = 'fait') AS faits,
           count(*) FILTER (WHERE ct.etat = 'partiel') AS partiels
      FROM controles_terrain ct, bornes b
     WHERE ct.deleted_at IS NULL AND ct.date_controle BETWEEN b.debut AND b.fin
     GROUP BY ct.commune_id
  ),

  -- M1-3 : calendrier, information, consultation.
  calendrier AS (
    SELECT ci.commune_id, bool_or(ci.actif AND cardinality(ci.jours_passage) > 0) AS publie, count(*) AS circuits
      FROM circuits ci WHERE ci.deleted_at IS NULL GROUP BY ci.commune_id
  ),
  information AS (
    SELECT x.commune_id, sum(x.n) AS n
      FROM (
        SELECT a.commune_id, count(*) AS n FROM annonces_collecte a, bornes b
         WHERE a.deleted_at IS NULL AND a.publiee AND a.created_at::date BETWEEN b.debut AND b.fin GROUP BY a.commune_id
        UNION ALL
        SELECT p.commune_id, count(*) FROM publications p, bornes b
         WHERE p.deleted_at IS NULL AND p.type = 'notification' AND p.publiee_le IS NOT NULL
           AND NOT p.est_exemple AND p.publiee_le::date BETWEEN b.debut AND b.fin GROUP BY p.commune_id
      ) x GROUP BY x.commune_id
  ),
  consultation AS (
    SELECT p.commune_id, count(*) AS n FROM publications p, bornes b
     WHERE p.deleted_at IS NULL AND p.type IN ('sondage', 'projet') AND p.publiee_le IS NOT NULL
       AND NOT p.est_exemple AND p.publiee_le::date BETWEEN b.debut AND b.fin
     GROUP BY p.commune_id
  ),
  -- Une commune qui n'a jamais publié ni circuit ni annonce ni publication
  -- n'est pas « à zéro » : elle n'utilise pas ces modules.
  communication_utilisee AS (
    SELECT id AS commune_id FROM communes_vues cv
     WHERE EXISTS (SELECT 1 FROM circuits ci WHERE ci.commune_id = cv.id AND ci.deleted_at IS NULL)
        OR EXISTS (SELECT 1 FROM annonces_collecte a WHERE a.commune_id = cv.id AND a.deleted_at IS NULL)
        OR EXISTS (SELECT 1 FROM publications p WHERE p.commune_id = cv.id AND p.deleted_at IS NULL AND NOT p.est_exemple)
  ),

  -- M1-5 : les demandes de déchets verts et de démolition.
  enlevements AS (
    SELECT d.commune_id,
           count(*) FILTER (WHERE d.statut <> 'annulee') AS n,
           count(*) FILTER (WHERE d.statut IN ('realisee', 'orientee_collecteur')) AS traitees
      FROM demandes_enlevement d, bornes b
     WHERE d.deleted_at IS NULL AND d.type_dechet IN ('vert', 'ddc') AND d.created_at::date BETWEEN b.debut AND b.fin
     GROUP BY d.commune_id
  ),

  -- M1-7 : les plans d'entretien évaluables (« à vérifier » ne l'est pas).
  entretien AS (
    SELECT cv.id AS commune_id,
           count(*) FILTER (WHERE e.statut IN ('a_jour', 'a_prevoir', 'en_retard')) AS n,
           count(*) FILTER (WHERE e.statut IN ('a_jour', 'a_prevoir')) AS a_jour
      FROM communes_vues cv
      CROSS JOIN LATERAL app.echeances_entretien(cv.id) e
     WHERE EXISTS (SELECT 1 FROM plans_entretien pe WHERE pe.commune_id = cv.id AND pe.deleted_at IS NULL)
     GROUP BY cv.id
  ),

  -- M3-1 : les réclamations de l'année, et leur délai.
  reclamations AS (
    SELECT t.commune_id,
           count(*) FILTER (WHERE t.status <> 'rejete') AS n,
           count(*) FILTER (WHERE t.status = 'resolu') AS resolues,
           count(*) FILTER (WHERE t.status = 'resolu' AND t.resolved_at IS NOT NULL
                              AND t.resolved_at - t.created_at <= make_interval(days => COALESCE(pc.delai_reclamation_jours, 7))) AS dans_delai,
           avg(extract(epoch FROM t.resolved_at - t.created_at) / 86400)
             FILTER (WHERE t.status = 'resolu' AND t.resolved_at IS NOT NULL) AS delai_moyen_j,
           max(COALESCE(pc.delai_reclamation_jours, 7)) AS delai
      FROM tickets t
      CROSS JOIN bornes b
      LEFT JOIN parametres_commune pc ON pc.commune_id = t.commune_id
     WHERE t.deleted_at IS NULL AND t.created_at::date BETWEEN b.debut AND b.fin
     GROUP BY t.commune_id
  ),

  -- M3-3 : les modules réellement utilisés dans l'année.
  usage AS (
    SELECT cv.id AS commune_id, cv.activee,
           EXISTS (SELECT 1 FROM points_collecte pt JOIN circuits ci ON ci.id = pt.circuit_id
                    WHERE pt.commune_id = cv.id AND pt.deleted_at IS NULL AND ci.deleted_at IS NULL) AS u_circuits,
           EXISTS (SELECT 1 FROM controles_terrain ct, bornes b WHERE ct.commune_id = cv.id AND ct.deleted_at IS NULL
                      AND ct.date_controle BETWEEN b.debut AND b.fin) AS u_controles,
           EXISTS (SELECT 1 FROM pesees pe, bornes b WHERE pe.commune_id = cv.id AND pe.deleted_at IS NULL
                      AND pe.date_pesee BETWEEN b.debut AND b.fin) AS u_pesees,
           EXISTS (SELECT 1 FROM tickets t, bornes b WHERE t.commune_id = cv.id AND t.deleted_at IS NULL AND t.status = 'resolu'
                      AND t.resolved_at::date BETWEEN b.debut AND b.fin) AS u_reclamations,
           EXISTS (SELECT 1 FROM presences pr, bornes b WHERE pr.commune_id = cv.id AND pr.jour BETWEEN b.debut AND b.fin) AS u_presences,
           EXISTS (SELECT 1 FROM vehicules v WHERE v.commune_id = cv.id AND v.deleted_at IS NULL) AS u_parc
      FROM communes_vues cv
  ),

  -- Tonnages : les pesées de l'année ; le ratio par habitant se rapporte aux
  -- seuls mois pesés, comme le coût à la tonne du module 6 — diviser les
  -- pesées d'un mois par une année entière le rendrait douze fois trop bas.
  pesees_an AS (
    SELECT pe.commune_id,
           sum(pe.poids_net_kg) AS kg,
           sum(pe.poids_net_kg) FILTER (WHERE pe.type_dechet IN ('tri', 'vert')) AS kg_separe,
           count(DISTINCT date_trunc('month', pe.date_pesee)) AS mois
      FROM pesees pe, bornes b
     WHERE pe.deleted_at IS NULL AND pe.date_pesee BETWEEN b.debut AND b.fin
     GROUP BY pe.commune_id
  ),
  jours_pesees AS (
    SELECT pe.commune_id,
           sum(LEAST((m + interval '1 month')::date - 1, b.fin) - m::date + 1) AS jours
      FROM (SELECT DISTINCT commune_id, date_trunc('month', date_pesee) AS m FROM pesees, bornes b
             WHERE deleted_at IS NULL AND date_pesee BETWEEN b.debut AND b.fin) pe, bornes b
     GROUP BY pe.commune_id
  ),

  -- Axe 4 et 5 : effectifs, masse salariale, maintenance, présences.
  effectifs AS (
    SELECT es.commune_id, sum(es.effectif_ouvriers) AS ouvriers, sum(es.effectif_encadrement) AS encadrement,
           sum(es.masse_salariale_tnd) AS masse
      FROM effectifs_service es
     WHERE es.annee = p_annee AND es.service = 'proprete'
     GROUP BY es.commune_id
  ),
  maintenance AS (
    SELECT im.commune_id, count(*) AS n, sum(im.cout_tnd) AS cout, count(im.cout_tnd) AS n_cout
      FROM interventions_maintenance im, bornes b
     WHERE im.deleted_at IS NULL AND im.date_intervention BETWEEN b.debut AND b.fin
     GROUP BY im.commune_id
  ),
  presences_an AS (
    SELECT pr.commune_id, count(*) AS n,
           count(*) FILTER (WHERE NOT pr.present AND COALESCE(pr.motif_absence, 'autre') NOT IN ('conge', 'repos', 'formation', 'detachement')) AS absences
      FROM presences pr, bornes b
     WHERE pr.jour BETWEEN b.debut AND b.fin
     GROUP BY pr.commune_id
  )

  -- Les indicateurs notés du Concours et de la préparation DMA.
  SELECT c.commune_id, 'M1-2', round(100.0 * (c.faits + 0.5 * c.partiels) / c.n, 1),
         (c.faits + 0.5 * c.partiels)::numeric / c.n,
         jsonb_build_object('controles', c.n, 'faits', c.faits, 'partiels', c.partiels)
    FROM controles c JOIN communes_vues cv ON cv.id = c.commune_id WHERE c.n > 0
  UNION ALL
  SELECT u.commune_id, 'M1-3',
         round(100 * (CASE WHEN COALESCE(ca.publie, false) THEN 1 ELSE 0 END
                      + LEAST(COALESCE(i.n, 0), 4) / 4.0
                      + CASE WHEN COALESCE(co.n, 0) > 0 THEN 1 ELSE 0 END) / 3.0, 1),
         (CASE WHEN COALESCE(ca.publie, false) THEN 1 ELSE 0 END
          + LEAST(COALESCE(i.n, 0), 4) / 4.0
          + CASE WHEN COALESCE(co.n, 0) > 0 THEN 1 ELSE 0 END) / 3.0,
         jsonb_build_object('calendrier_publie', COALESCE(ca.publie, false), 'informations', COALESCE(i.n, 0),
                            'consultations', COALESCE(co.n, 0))
    FROM communication_utilisee u
    LEFT JOIN calendrier ca ON ca.commune_id = u.commune_id
    LEFT JOIN information i ON i.commune_id = u.commune_id
    LEFT JOIN consultation co ON co.commune_id = u.commune_id
  UNION ALL
  SELECT e.commune_id, 'M1-5', round(100.0 * e.traitees / e.n, 1), e.traitees::numeric / e.n,
         jsonb_build_object('demandes', e.n, 'traitees', e.traitees)
    FROM enlevements e JOIN communes_vues cv ON cv.id = e.commune_id WHERE e.n > 0
  UNION ALL
  SELECT m.commune_id, 'M1-7', round(100.0 * m.a_jour / m.n, 1), m.a_jour::numeric / m.n,
         jsonb_build_object('plans', m.n, 'a_jour', m.a_jour)
    FROM entretien m WHERE m.n > 0
  UNION ALL
  SELECT r.commune_id, 'M3-1', round(100.0 * r.resolues / r.n, 1),
         (r.resolues::numeric / r.n + CASE WHEN r.resolues > 0 THEN r.dans_delai::numeric / r.resolues ELSE 0 END) / 2,
         jsonb_build_object('reclamations', r.n, 'resolues', r.resolues, 'dans_delai', r.dans_delai,
                            'delai_jours', r.delai, 'delai_moyen_jours', round(r.delai_moyen_j, 1))
    FROM reclamations r JOIN communes_vues cv ON cv.id = r.commune_id WHERE r.n > 0
  UNION ALL
  SELECT u.commune_id, 'M3-3',
         round(100 * (u.u_circuits::int + u.u_controles::int + u.u_pesees::int + u.u_reclamations::int
                      + u.u_presences::int + u.u_parc::int) / 6.0, 1),
         (u.u_circuits::int + u.u_controles::int + u.u_pesees::int + u.u_reclamations::int
          + u.u_presences::int + u.u_parc::int) / 6.0,
         jsonb_build_object('circuits', u.u_circuits, 'controles', u.u_controles, 'pesees', u.u_pesees,
                            'reclamations', u.u_reclamations, 'presences', u.u_presences, 'parc', u.u_parc)
    -- Une commune qui n'a jamais rien saisi n'est pas « digitalisée à 0 % » :
    -- on ne sait rien de ses outils. La mesure attend un premier usage.
    FROM usage u
   WHERE u.activee AND (u.u_circuits OR u.u_controles OR u.u_pesees OR u.u_reclamations OR u.u_presences OR u.u_parc)
  UNION ALL
  SELECT p.commune_id, 'DMA-4', round(100 * COALESCE(p.kg_separe, 0) / p.kg, 1), COALESCE(p.kg_separe, 0) / p.kg,
         jsonb_build_object('kg', p.kg, 'kg_separe', COALESCE(p.kg_separe, 0))
    FROM pesees_an p JOIN communes_vues cv ON cv.id = p.commune_id WHERE p.kg > 0

  -- Les mesures qui nourrissent les axes sans être notées.
  UNION ALL
  SELECT p.commune_id, 'TONNAGE_T', round(p.kg / 1000, 3), NULL, jsonb_build_object('mois_peses', p.mois)
    FROM pesees_an p JOIN communes_vues cv ON cv.id = p.commune_id WHERE p.kg > 0
  UNION ALL
  SELECT p.commune_id, 'KG_HAB_J', round(p.kg / cv.population / j.jours, 3), NULL,
         jsonb_build_object('jours_couverts', j.jours, 'population', cv.population)
    FROM pesees_an p JOIN communes_vues cv ON cv.id = p.commune_id JOIN jours_pesees j ON j.commune_id = p.commune_id
   WHERE p.kg > 0 AND cv.population > 0 AND j.jours > 0
  UNION ALL
  SELECT ca.commune_id, 'CIRCUITS', ca.circuits, NULL, '{}'::jsonb
    FROM calendrier ca JOIN communes_vues cv ON cv.id = ca.commune_id
  UNION ALL
  SELECT r.commune_id, 'RECLAMATIONS', r.n, NULL, '{}'::jsonb
    FROM reclamations r JOIN communes_vues cv ON cv.id = r.commune_id WHERE r.n > 0
  UNION ALL
  SELECT r.commune_id, 'DELAI_MOYEN_J', round(r.delai_moyen_j, 1), NULL, '{}'::jsonb
    FROM reclamations r JOIN communes_vues cv ON cv.id = r.commune_id WHERE r.delai_moyen_j IS NOT NULL
  UNION ALL
  SELECT e.commune_id, 'MASSE_SALARIALE', e.masse, NULL, '{}'::jsonb
    FROM effectifs e JOIN communes_vues cv ON cv.id = e.commune_id WHERE e.masse IS NOT NULL
  UNION ALL
  SELECT e.commune_id, 'EFFECTIF_OUVRIERS', e.ouvriers, NULL, '{}'::jsonb
    FROM effectifs e JOIN communes_vues cv ON cv.id = e.commune_id WHERE e.ouvriers IS NOT NULL
  UNION ALL
  SELECT e.commune_id, 'ENCADREMENT', round(e.encadrement::numeric / e.ouvriers, 3), NULL,
         jsonb_build_object('encadrement', e.encadrement, 'ouvriers', e.ouvriers)
    FROM effectifs e JOIN communes_vues cv ON cv.id = e.commune_id WHERE e.ouvriers > 0 AND e.encadrement IS NOT NULL
  UNION ALL
  -- Un coût de maintenance ne se donne que si CHAQUE intervention de l'année
  -- porte son coût : une somme de coûts partiels se lirait comme complète.
  SELECT m.commune_id, 'COUT_MAINTENANCE', m.cout, NULL, jsonb_build_object('interventions', m.n)
    FROM maintenance m JOIN communes_vues cv ON cv.id = m.commune_id WHERE m.n > 0 AND m.n_cout = m.n
  UNION ALL
  SELECT p.commune_id, 'ABSENTEISME', round(100.0 * p.absences / p.n, 1), NULL,
         jsonb_build_object('jours_saisis', p.n, 'absences', p.absences)
    FROM presences_an p JOIN communes_vues cv ON cv.id = p.commune_id WHERE p.n > 0
$$;

COMMENT ON FUNCTION app.mesures_kpi(integer) IS
  'Ce que SIIPI mesure lui-même pour une année, commune par commune (celles que l''appelant peut lire). Une mesure dont la source n''existe pas n''a pas de ligne : jamais un zéro par défaut.';

GRANT EXECUTE ON FUNCTION app.mesures_kpi(integer) TO siipi_app;

-- ---------------------------------------------------------------------------
-- 7. « À vérifier » : ce que le tableau de bord signale à la commune (A3.3)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.incoherences_kpi(p_commune text)
  RETURNS TABLE (gravite text, domaine text, sujet text, sujet_id text, constat text, quoi_faire text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  WITH an AS (SELECT extract(year FROM (now() AT TIME ZONE 'Africa/Tunis'))::int AS annee),
       fiche AS (
         SELECT e.* FROM evaluations_kpi e, an WHERE e.commune_id = p_commune AND e.annee = an.annee
       ),
       seuil AS (SELECT valeur FROM parametres_kpi WHERE cle = 'bachage_min')
  -- 1. La fiche d'évaluation de l'année n'est pas soumise.
  SELECT 'information', 'kpi', format('Fiche d''évaluation %s', an.annee), NULL::text,
         CASE WHEN f.id IS NULL THEN 'La fiche d''évaluation de l''année n''est pas commencée.'
              ELSE format('La fiche d''évaluation est en brouillon : %s indicateur(s) saisi(s).',
                          (SELECT count(*) FROM valeurs_kpi v WHERE v.evaluation_id = f.id)) END,
         'La compléter et la soumettre à la FNCT (onglet Indicateurs).'
    FROM an LEFT JOIN fiche f ON true
   WHERE f.id IS NULL OR f.statut = 'brouillon'
  UNION ALL
  -- 2. Le bâchage déclaré est sous le seuil national.
  SELECT 'avertissement', 'kpi', 'Bâchage des bennes', NULL::text,
         format('%s %% des bennes basculantes sont bâchées pendant le transport (seuil : %s %%).',
                round(100 * v.valeur / v.cible), round(s.valeur)),
         'Équiper les bennes de bâches, et le déclarer dans la fiche d''évaluation.'
    FROM fiche f JOIN valeurs_kpi v ON v.evaluation_id = f.id AND v.indicateur_code = 'M1-9', seuil s
   WHERE v.cible > 0 AND 100 * v.valeur / v.cible < s.valeur
$$;

GRANT EXECUTE ON FUNCTION app.incoherences_kpi(text) TO siipi_app;

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
    ) tout
   ORDER BY CASE gravite WHEN 'bloquant' THEN 0
                         WHEN 'avertissement' THEN 1
                         ELSE 2 END,
            domaine, sujet
$$;

GRANT EXECUTE ON FUNCTION app.incoherences_commune(text) TO siipi_app;
