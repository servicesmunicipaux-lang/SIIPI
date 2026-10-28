-- =========================================================================
-- 091 — Les règles du secteur informel en paramètres nationaux (lot I1,
-- préalable de 18.2 et 18.3 ; décision du 28/10/2026).
-- docs/specs_metier/02-projet-decret-tri-source-art13-14.md.
--
-- ON N'ATTEND PLUS L'ARTICLE 13, MAIS ON NE L'ÉCRIT PAS DANS LE CODE. La
-- carte de pré-collecteur et la période transitoire se construisent sur le
-- projet de décret ; chacune de ses règles — durées, date de départ, pièces
-- exigées, étapes d'accompagnement — est une donnée nationale datée, posée
-- PROVISOIRE et rattachée au projet. Quand le texte paraît, la FNCT ajoute la
-- valeur officielle avec sa date d'effet ; aucun déploiement n'est nécessaire,
-- et ce qui a été décidé avant garde la règle de son jour.
--
-- La date de départ de la période transitoire n'a AUCUNE valeur ici : le
-- projet ne la donne pas. Sans elle, rien ne se décompte (règle 1.1) — on ne
-- prend pas la date du jour à sa place.
--
-- L'interrupteur `cadre_secteur_informel_actif` (migration 064) reste ce
-- qu'il est : tant qu'il est éteint, aucune commune n'écrit. Les règles, elles,
-- se paramètrent d'avance : c'est l'objet de ce lot.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Une date peut être un paramètre national ; un nombre peut être entier
-- -------------------------------------------------------------------------
ALTER TABLE definitions_parametres_nationaux
  ADD COLUMN IF NOT EXISTS rubrique TEXT NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS entier   BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN definitions_parametres_nationaux.rubrique IS
  'La rubrique de l''écran de la FNCT où le paramètre se règle : general, ou secteur_informel (les règles du projet de décret, à côté de l''interrupteur du cadre).';
COMMENT ON COLUMN definitions_parametres_nationaux.entier IS
  'Le paramètre est un nombre entier (une durée en mois) : « 12,5 mois » de validité n''a pas de sens et serait refusé.';

ALTER TABLE definitions_parametres_nationaux DROP CONSTRAINT IF EXISTS definitions_nature_valide;
ALTER TABLE definitions_parametres_nationaux ADD CONSTRAINT definitions_nature_valide
  CHECK (nature IN ('nombre', 'texte', 'date'));
ALTER TABLE definitions_parametres_nationaux DROP CONSTRAINT IF EXISTS definitions_rubrique_valide;
ALTER TABLE definitions_parametres_nationaux ADD CONSTRAINT definitions_rubrique_valide
  CHECK (rubrique IN ('general', 'secteur_informel'));

ALTER TABLE valeurs_parametres_nationaux ADD COLUMN IF NOT EXISTS valeur_date DATE;
COMMENT ON COLUMN valeurs_parametres_nationaux.valeur_date IS
  'Pour un paramètre de nature date (la date de départ de la période transitoire) : la date elle-même. Elle se distingue de date_effet, le jour où cette valeur s''applique.';

-- Définition reprise de la migration 060, la nature date et les entiers en plus.
CREATE OR REPLACE FUNCTION app.controler_valeur_parametre() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_def definitions_parametres_nationaux;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Seul le retrait passe : retire_le, retire_par et motif_retrait, une fois.
    IF OLD.retire_le IS NOT NULL
       OR (to_jsonb(NEW) - 'retire_le' - 'retire_par' - 'motif_retrait')
          IS DISTINCT FROM (to_jsonb(OLD) - 'retire_le' - 'retire_par' - 'motif_retrait') THEN
      RAISE EXCEPTION 'PARAMETRE_FIGE: une valeur nationale ne se réécrit pas ; ajoutez-en une avec sa date d''effet, ou retirez celle-ci avec un motif.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO v_def FROM definitions_parametres_nationaux WHERE code = NEW.code;
  IF v_def.nature = 'nombre' THEN
    IF NEW.valeur_nombre IS NULL OR NEW.valeur_fr IS NOT NULL OR NEW.valeur_ar IS NOT NULL OR NEW.valeur_date IS NOT NULL THEN
      RAISE EXCEPTION 'PARAMETRE_NATURE: « % » attend un nombre, et seulement un nombre.', v_def.libelle_fr
        USING ERRCODE = 'check_violation';
    END IF;
    IF (v_def.borne_min IS NOT NULL AND NEW.valeur_nombre <= v_def.borne_min)
       OR (v_def.borne_max IS NOT NULL AND NEW.valeur_nombre >= v_def.borne_max) THEN
      RAISE EXCEPTION 'PARAMETRE_BORNES: « % » doit être strictement compris entre % et % %.',
        v_def.libelle_fr, v_def.borne_min, v_def.borne_max, COALESCE(v_def.unite, '')
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_def.entier AND NEW.valeur_nombre <> trunc(NEW.valeur_nombre) THEN
      RAISE EXCEPTION 'PARAMETRE_ENTIER: « % » attend un nombre entier de %.', v_def.libelle_fr, COALESCE(v_def.unite, 'unités')
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF v_def.nature = 'date' THEN
    IF NEW.valeur_date IS NULL OR NEW.valeur_nombre IS NOT NULL OR NEW.valeur_fr IS NOT NULL OR NEW.valeur_ar IS NOT NULL THEN
      RAISE EXCEPTION 'PARAMETRE_NATURE: « % » attend une date, et seulement une date.', v_def.libelle_fr
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.valeur_date < DATE '2000-01-01' THEN
      RAISE EXCEPTION 'PARAMETRE_BORNES: « % » ne peut pas précéder l''an 2000.', v_def.libelle_fr
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF NEW.valeur_nombre IS NOT NULL OR NEW.valeur_date IS NOT NULL
       OR length(btrim(COALESCE(NEW.valeur_fr, ''))) = 0 OR length(btrim(COALESCE(NEW.valeur_ar, ''))) = 0 THEN
      RAISE EXCEPTION 'PARAMETRE_NATURE: « % » attend un intitulé en français ET en arabe.', v_def.libelle_fr
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

-- -------------------------------------------------------------------------
-- 2. Les durées et la date de départ (projet de décret, art. 13.1)
-- -------------------------------------------------------------------------
-- Les bornes sont exclusives (060) : 0 < durée < 121 mois, soit 1 à 120.
INSERT INTO definitions_parametres_nationaux
  (code, nature, unite, borne_min, borne_max, libelle_fr, libelle_ar, description, ordre, rubrique, entier) VALUES
  ('informel_validite_carte_mois', 'nombre', 'mois', 0, 121,
   'Validité de la carte de pré-collecteur', 'مدة صلوحية بطاقة المجمّع الأولي',
   'Durée de validité d''une carte, comptée de sa délivrance ; la durée en vigueur le jour de la décision fixe la fin de la carte, et une carte délivrée ne change plus.', 100, 'secteur_informel', true),
  ('informel_duree_agrement_mois', 'nombre', 'mois', 0, 121,
   'Durée de l''agrément d''un intermédiaire', 'مدة اعتماد الوسيط',
   'Durée de référence d''un agrément délivré par l''éco-organisme. SIIPI n''agrée pas : il enregistre l''échéance portée par l''agrément et signale un écart avec cette durée.', 110, 'secteur_informel', true),
  ('informel_duree_periode_transitoire_mois', 'nombre', 'mois', 0, 121,
   'Durée de la période transitoire', 'مدة الفترة الانتقالية',
   'Pendant la période, l''activité est permise à qui a entamé une démarche de formalisation auprès de la commune.', 120, 'secteur_informel', true),
  ('informel_delai_etalonnage_mois', 'nombre', 'mois', 0, 61,
   'Délai d''étalonnage après la période transitoire', 'أجل معايرة أدوات الوزن بعد الفترة الانتقالية',
   'Les instruments de pesée sont étalonnés dans ce délai, compté de la fin de la période transitoire.', 130, 'secteur_informel', true),
  ('informel_debut_periode_transitoire', 'date', NULL, NULL, NULL,
   'Date de départ de la période transitoire', 'تاريخ بداية الفترة الانتقالية',
   'Aucune valeur tant que le texte ne la fixe pas : sans elle, aucune échéance ne se calcule.', 95, 'secteur_informel', false)
ON CONFLICT (code) DO NOTHING;

-- Les durées du projet, PROVISOIRES. Posées une fois : si la FNCT les a
-- retirées ou remplacées, une migration rejouée ne les remet pas. Leur date
-- d'effet est celle où le projet a été communiqué à la FNCT.
INSERT INTO valeurs_parametres_nationaux (code, date_effet, valeur_nombre, provisoire, reference)
SELECT d.code, DATE '2026-09-30', d.valeur, true,
       'Projet de décret sur le tri à la source (texte communiqué le 30/09/2026), art. 13.1 — non en vigueur.'
  FROM (VALUES ('informel_validite_carte_mois', 12),
               ('informel_duree_agrement_mois', 24),
               ('informel_duree_periode_transitoire_mois', 36),
               ('informel_delai_etalonnage_mois', 6)) AS d(code, valeur)
 WHERE NOT EXISTS (SELECT 1 FROM valeurs_parametres_nationaux v WHERE v.code = d.code);

-- -------------------------------------------------------------------------
-- 3. Les listes nationales datées : pièces exigées, étapes d'accompagnement
-- -------------------------------------------------------------------------
-- Une liste change à une date, comme un tarif : une pièce s'ajoute, une autre
-- cesse d'être exigée. Ce qui cesse se FERME (date_fin, avec sa pièce) ; ce
-- qui a été saisi à tort se RETIRE (avec un motif). Ce sont deux gestes
-- différents : une demande déposée hier a été jugée sur la liste d'hier, une
-- erreur de saisie n'a jamais été la règle.
CREATE TABLE IF NOT EXISTS elements_listes_nationales (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    liste          TEXT NOT NULL,
    code           TEXT NOT NULL,
    libelle_fr     TEXT NOT NULL,
    libelle_ar     TEXT NOT NULL,
    ordre          INTEGER NOT NULL DEFAULT 0,
    date_effet     DATE NOT NULL,
    date_fin       DATE,
    reference_fin  TEXT,
    provisoire     BOOLEAN NOT NULL DEFAULT true,
    reference      TEXT,
    saisi_par      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    retire_le      TIMESTAMPTZ,
    retire_par     UUID REFERENCES users(id) ON DELETE SET NULL,
    motif_retrait  TEXT,
    CONSTRAINT elements_liste_valide CHECK (liste IN ('pieces_carte_precollecteur', 'jalons_accompagnement')),
    CONSTRAINT elements_code_valide CHECK (code ~ '^[a-z][a-z0-9_]{2,60}$'),
    CONSTRAINT elements_libelles_bilingues CHECK (length(btrim(libelle_fr)) > 0 AND length(btrim(libelle_ar)) > 0),
    CONSTRAINT elements_date_plausible CHECK (date_effet >= DATE '2000-01-01'),
    CONSTRAINT elements_fin_apres_effet CHECK (date_fin IS NULL OR date_fin > date_effet),
    CONSTRAINT elements_fin_referencee CHECK (date_fin IS NULL OR length(btrim(COALESCE(reference_fin, ''))) >= 5),
    CONSTRAINT elements_officiel_reference CHECK (provisoire OR length(btrim(COALESCE(reference, ''))) > 0),
    CONSTRAINT elements_retrait_motive CHECK (retire_le IS NULL OR length(btrim(COALESCE(motif_retrait, ''))) >= 5)
);
COMMENT ON TABLE elements_listes_nationales IS
  'Les listes nationales datées du secteur informel, tenues par la FNCT : les pièces exigées pour une carte de pré-collecteur, les étapes d''accompagnement d''un acteur. Un élément s''applique de date_effet à la veille de date_fin ; il ne se réécrit pas. Ce qui cesse se ferme (date_fin et sa pièce) ; ce qui a été saisi à tort se retire (motif) et reste lisible.';
COMMENT ON COLUMN elements_listes_nationales.liste IS
  'pieces_carte_precollecteur : les attestations sans lesquelles une carte ne s''accorde pas (à la date de la demande) ; jalons_accompagnement : les étapes de formalisation suivies acteur par acteur.';
COMMENT ON COLUMN elements_listes_nationales.code IS
  'Identifiant stable de l''élément dans sa liste (minuscules, chiffres, tiret bas). Les pièces et étapes enregistrées par les communes s''y réfèrent.';
COMMENT ON COLUMN elements_listes_nationales.date_fin IS
  'Premier jour où l''élément ne s''applique plus (le texte a changé) ; NULL : toujours en vigueur. Se fixe une fois, avec la pièce qui le fonde (reference_fin).';
COMMENT ON COLUMN elements_listes_nationales.provisoire IS
  'Vrai tant que l''élément repose sur le projet de décret, non sur un texte publié. Un élément officiel cite sa pièce.';

-- Un seul élément ouvert par code : une pièce qui revient après avoir cessé
-- est une nouvelle ligne, une fois l'ancienne fermée.
CREATE UNIQUE INDEX IF NOT EXISTS uq_element_liste_ouvert
  ON elements_listes_nationales (liste, code) WHERE retire_le IS NULL AND date_fin IS NULL;
CREATE INDEX IF NOT EXISTS idx_elements_liste ON elements_listes_nationales (liste, ordre, date_effet);

CREATE OR REPLACE FUNCTION app.controler_element_liste() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_fige jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.retire_le IS NOT NULL OR NEW.date_fin IS NOT NULL THEN
      RAISE EXCEPTION 'ELEMENT_NAISSANCE: un élément s''inscrit ouvert ; il se ferme ou se retire ensuite.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  -- Une écriture identique (la remise en état d'une table par une campagne)
  -- ne change rien : elle passe.
  IF to_jsonb(NEW) = to_jsonb(OLD) THEN
    RETURN NEW;
  END IF;
  IF OLD.retire_le IS NOT NULL THEN
    RAISE EXCEPTION 'ELEMENT_FIGE: cet élément est retiré ; il reste lisible tel quel.' USING ERRCODE = 'check_violation';
  END IF;
  v_fige := to_jsonb(NEW) - 'date_fin' - 'reference_fin' - 'retire_le' - 'retire_par' - 'motif_retrait';
  IF v_fige IS DISTINCT FROM (to_jsonb(OLD) - 'date_fin' - 'reference_fin' - 'retire_le' - 'retire_par' - 'motif_retrait') THEN
    RAISE EXCEPTION 'ELEMENT_FIGE: un élément de liste ne se réécrit pas ; fermez-le à une date et ajoutez-en un autre, ou retirez-le s''il était faux.'
      USING ERRCODE = 'check_violation';
  END IF;
  -- La fin se fixe une fois.
  IF OLD.date_fin IS NOT NULL AND (NEW.date_fin, NEW.reference_fin) IS DISTINCT FROM (OLD.date_fin, OLD.reference_fin) THEN
    RAISE EXCEPTION 'ELEMENT_FERME: cet élément est déjà fermé au %.', to_char(OLD.date_fin, 'DD/MM/YYYY')
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_controler_element_liste ON elements_listes_nationales;
CREATE TRIGGER trg_controler_element_liste BEFORE INSERT OR UPDATE ON elements_listes_nationales
  FOR EACH ROW EXECUTE FUNCTION app.controler_element_liste();

DROP TRIGGER IF EXISTS trg_audit_elements_listes_nationales ON elements_listes_nationales;
CREATE TRIGGER trg_audit_elements_listes_nationales AFTER INSERT OR UPDATE OR DELETE ON elements_listes_nationales
  FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement();

-- Lire : tout utilisateur authentifié — une commune voit les pièces qu'on lui
-- demande. Écrire : la FNCT seule.
ALTER TABLE elements_listes_nationales ENABLE ROW LEVEL SECURITY;
ALTER TABLE elements_listes_nationales FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS elements_listes_nationales_select ON elements_listes_nationales;
CREATE POLICY elements_listes_nationales_select ON elements_listes_nationales FOR SELECT
  USING (app.is_authenticated());
DROP POLICY IF EXISTS elements_listes_nationales_insert ON elements_listes_nationales;
CREATE POLICY elements_listes_nationales_insert ON elements_listes_nationales FOR INSERT
  WITH CHECK (app.is_fnct());
DROP POLICY IF EXISTS elements_listes_nationales_update ON elements_listes_nationales;
CREATE POLICY elements_listes_nationales_update ON elements_listes_nationales FOR UPDATE
  USING (app.is_fnct() AND retire_le IS NULL) WITH CHECK (app.is_fnct());
GRANT SELECT, INSERT ON elements_listes_nationales TO siipi_app;
-- Les privilèges par défaut du schéma donnent UPDATE sur toute table : on le
-- retire, puis on ne rend que les colonnes de la fin et du retrait.
REVOKE UPDATE ON elements_listes_nationales FROM siipi_app;
GRANT UPDATE (date_fin, reference_fin, retire_le, retire_par, motif_retrait) ON elements_listes_nationales TO siipi_app;
REVOKE DELETE, TRUNCATE ON elements_listes_nationales FROM siipi_app;

-- Les éléments du projet, PROVISOIRES, posés une fois par liste.
INSERT INTO elements_listes_nationales (liste, code, libelle_fr, libelle_ar, ordre, date_effet, provisoire, reference)
SELECT e.liste, e.code, e.fr, e.ar, e.ordre, DATE '2026-09-30', true,
       'Projet de décret sur le tri à la source (texte communiqué le 30/09/2026), art. 13.1 — non en vigueur.'
  FROM (VALUES
    ('pieces_carte_precollecteur', 'declaration_activite_simplifiee', 'Déclaration d''activité simplifiée', 'تصريح مبسّط بالنشاط', 10),
    ('pieces_carte_precollecteur', 'engagement_hygiene_securite', 'Engagement d''hygiène et de sécurité', 'التزام بقواعد الصحة والسلامة', 20),
    ('pieces_carte_precollecteur', 'acceptation_accompagnement', 'Acceptation de l''accompagnement progressif', 'قبول المرافقة التدريجية', 30),
    ('jalons_accompagnement', 'formation', 'Formation', 'تكوين', 10),
    ('jalons_accompagnement', 'statut_auto_entrepreneur', 'Statut d''auto-entrepreneur', 'نظام المبادر الذاتي', 20),
    ('jalons_accompagnement', 'regularisation_fiscale', 'Régularisation fiscale', 'تسوية الوضعية الجبائية', 30),
    ('jalons_accompagnement', 'immatriculation_vehicules', 'Immatriculation des véhicules', 'تسجيل العربات', 40),
    ('jalons_accompagnement', 'signature_cahier_charges', 'Signature du cahier des charges', 'إمضاء كراس الشروط', 50),
    ('jalons_accompagnement', 'etalonnage_instruments', 'Étalonnage des instruments de pesée', 'معايرة أدوات الوزن', 60)
  ) AS e(liste, code, fr, ar, ordre)
 WHERE NOT EXISTS (SELECT 1 FROM elements_listes_nationales x WHERE x.liste = e.liste);

CREATE OR REPLACE FUNCTION app.liste_nationale(p_liste text, p_date date)
  RETURNS SETOF elements_listes_nationales
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT * FROM elements_listes_nationales
   WHERE liste = p_liste AND retire_le IS NULL
     AND date_effet <= p_date AND (date_fin IS NULL OR date_fin > p_date)
   ORDER BY ordre, code
$$;
COMMENT ON FUNCTION app.liste_nationale(text, date) IS
  'Les éléments d''une liste nationale en vigueur à une date : entrés en vigueur, pas encore fermés, jamais retirés. Une demande se juge sur la liste du jour où elle a été déposée.';
GRANT EXECUTE ON FUNCTION app.liste_nationale(text, date) TO siipi_app;

-- -------------------------------------------------------------------------
-- 4. La période transitoire, telle que les paramètres la définissent
-- -------------------------------------------------------------------------
-- Les règles en vigueur à p_date (aujourd'hui par défaut) : si le texte
-- allonge la période, l'échéance suit. Une donnée manquante se nomme dans
-- « manque » ; l'échéance qui en dépend reste NULL — jamais une date
-- inventée.
CREATE OR REPLACE FUNCTION app.periode_transitoire(p_date date DEFAULT NULL)
  RETURNS TABLE (
    debut                 date,
    duree_mois            integer,
    fin                   date,
    delai_etalonnage_mois integer,
    fin_etalonnage        date,
    provisoire            boolean,
    manque                text[]
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  WITH jour AS (SELECT COALESCE(p_date, (now() AT TIME ZONE 'Africa/Tunis')::date) AS d),
  r AS (
    SELECT (SELECT v FROM jour j, app.parametre_national('informel_debut_periode_transitoire', j.d) v) AS debut,
           (SELECT v FROM jour j, app.parametre_national('informel_duree_periode_transitoire_mois', j.d) v) AS duree,
           (SELECT v FROM jour j, app.parametre_national('informel_delai_etalonnage_mois', j.d) v) AS delai
  ),
  b AS (
    SELECT (r.debut).valeur_date AS debut, (r.duree).valeur_nombre::int AS duree, (r.delai).valeur_nombre::int AS delai,
           COALESCE((r.debut).provisoire, false) OR COALESCE((r.duree).provisoire, false) OR COALESCE((r.delai).provisoire, false) AS provisoire
      FROM r
  ),
  f AS (
    -- Le dernier jour de la période : trois ans comptés d'un 1er janvier
    -- finissent le 31 décembre.
    SELECT b.*, (b.debut + make_interval(months => b.duree) - interval '1 day')::date AS fin FROM b
  )
  SELECT f.debut, f.duree, f.fin, f.delai,
         (f.fin + make_interval(months => f.delai))::date,
         f.provisoire,
         array_remove(ARRAY[
           CASE WHEN f.debut IS NULL THEN 'informel_debut_periode_transitoire' END,
           CASE WHEN f.duree IS NULL THEN 'informel_duree_periode_transitoire_mois' END,
           CASE WHEN f.delai IS NULL THEN 'informel_delai_etalonnage_mois' END], NULL)
    FROM f
$$;
COMMENT ON FUNCTION app.periode_transitoire(date) IS
  'La période transitoire du secteur informel selon les paramètres nationaux en vigueur à la date donnée (aujourd''hui par défaut) : départ, durée, dernier jour, délai et échéance d''étalonnage. Ce qui manque est nommé ; une échéance qui en dépend reste NULL. Provisoire si une règle repose sur le projet de décret.';
GRANT EXECUTE ON FUNCTION app.periode_transitoire(date) TO siipi_app;
