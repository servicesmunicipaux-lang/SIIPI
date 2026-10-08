-- =========================================================================
-- 064 — Le registre communal des acteurs informels (lot 18.1).
-- Projet de décret sur le tri à la source, article 13.1 :
-- docs/specs_metier/02-projet-decret-tri-source-art13-14.md.
--
-- LE TEXTE EST UN PROJET, NON EN VIGUEUR. Tout ce lot est derrière le
-- paramètre national `cadre_secteur_informel_actif`, FAUX par défaut : tant
-- qu'il l'est, la base refuse d'inscrire un acteur, de le catégoriser ou de
-- dater sa démarche. Seule la FNCT l'active, en citant la pièce qui le fonde
-- (la publication du texte) — comme l'hébergement des identités (migration 056).
--
-- UN SEUL REGISTRE. Le registre des pré-collecteurs du lot 16.1 (`barbechas`)
-- EST le registre des acteurs informels : il porte déjà l'identifiant communal
-- pseudonyme, et sa table d'identité séparée (nom, empreinte du CIN, lecture
-- par le seul admin de la commune, journalisée). Un second registre aurait
-- demandé une seconde table d'identité à protéger.
--
-- LA CATÉGORIE SE DÉDUIT DE FAITS. Le projet distingue le pré-collecteur
-- (« aucun local », « n'achète pas à d'autres pré-collecteurs ») de
-- l'intermédiaire (achète aux pré-collecteurs, stocke, dispose EN GÉNÉRAL d'un
-- local et de véhicules motorisés). La commune déclare une catégorie et
-- renseigne les faits ; SIIPI en tire la catégorie que les faits impliquent et
-- SIGNALE l'écart (« À vérifier ») — il ne corrige pas la déclaration.
--
-- LA DÉMARCHE DE FORMALISATION SE DATE. Pendant la période transitoire,
-- l'activité est permise à qui a « entamé une démarche de formalisation auprès
-- de la commune » : c'est la date de cette démarche, et sa pièce, qui font
-- courir le droit d'exercer. Un historique, jamais réécrit.
--
-- Ce que ce lot ne fait PAS : aucune géolocalisation d'un acteur (ligne
-- rouge 3), aucun suivi individuel de rendement, aucun paiement ; la carte de
-- pré-collecteur (18.2) et la période transitoire (18.3) attendent l'article
-- 13 et la date de départ.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. L'interrupteur national
-- -------------------------------------------------------------------------
INSERT INTO parametres_nationaux (cle, valeur)
VALUES ('cadre_secteur_informel_actif', 'false')
ON CONFLICT (cle) DO NOTHING;

ALTER TABLE parametres_nationaux DROP CONSTRAINT IF EXISTS parametres_nationaux_secteur_informel;
ALTER TABLE parametres_nationaux ADD CONSTRAINT parametres_nationaux_secteur_informel
  CHECK (cle <> 'cadre_secteur_informel_actif'
         OR valeur = 'false'
         OR (valeur = 'true' AND length(btrim(COALESCE(reference, ''))) > 0));
ALTER TABLE parametres_nationaux DROP CONSTRAINT IF EXISTS parametres_nationaux_secteur_informel_booleen;
ALTER TABLE parametres_nationaux ADD CONSTRAINT parametres_nationaux_secteur_informel_booleen
  CHECK (cle <> 'cadre_secteur_informel_actif' OR valeur IN ('true', 'false'));

CREATE OR REPLACE FUNCTION app.cadre_secteur_informel_actif() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$ SELECT COALESCE((SELECT valeur FROM parametres_nationaux WHERE cle = 'cadre_secteur_informel_actif'), 'false') = 'true' $$;
COMMENT ON FUNCTION app.cadre_secteur_informel_actif() IS
  'Vrai seulement quand la FNCT a activé le cadre du secteur informel (projet de décret, art. 13.1), en citant la pièce qui le fonde. Faux par défaut : le registre des acteurs informels est alors fermé en écriture.';
GRANT EXECUTE ON FUNCTION app.cadre_secteur_informel_actif() TO siipi_app;

-- -------------------------------------------------------------------------
-- 2. Le registre : catégorie déclarée, faits, et la catégorie qu'ils impliquent
-- -------------------------------------------------------------------------
ALTER TABLE barbechas
  ADD COLUMN IF NOT EXISTS categorie          TEXT,
  ADD COLUMN IF NOT EXISTS dispose_local      BOOLEAN,
  ADD COLUMN IF NOT EXISTS achete_aux_pairs   BOOLEAN,
  ADD COLUMN IF NOT EXISTS vehicule_motorise  BOOLEAN,
  ADD COLUMN IF NOT EXISTS faits_releves_le   DATE;

ALTER TABLE barbechas DROP CONSTRAINT IF EXISTS barbechas_categorie_valide;
ALTER TABLE barbechas ADD CONSTRAINT barbechas_categorie_valide
  CHECK (categorie IS NULL OR categorie IN ('pre_collecteur', 'intermediaire'));
-- Des faits sans date ne disent pas quand ils étaient vrais.
ALTER TABLE barbechas DROP CONSTRAINT IF EXISTS barbechas_faits_dates;
ALTER TABLE barbechas ADD CONSTRAINT barbechas_faits_dates
  CHECK ((dispose_local IS NULL AND achete_aux_pairs IS NULL AND vehicule_motorise IS NULL) OR faits_releves_le IS NOT NULL);

COMMENT ON TABLE barbechas IS
  'Registre communal des acteurs informels (pré-collecteurs depuis le lot 16.1, intermédiaires depuis le lot 18.1) : identifiant communal PSEUDONYME, zone, catégorie déclarée et faits qui la fondent. L''identité (nom, empreinte du CIN) vit à part (donnees_personnelles_barbechas), lue par le seul admin de la commune.';
COMMENT ON COLUMN barbechas.categorie IS
  'Catégorie DÉCLARÉE par la commune : pre_collecteur | intermediaire (projet de décret, définitions). La catégorie que les faits impliquent se calcule (app.categorie_impliquee) ; un écart se signale, il ne se corrige pas.';
COMMENT ON COLUMN barbechas.dispose_local IS
  'L''acteur dispose d''un local ou d''un terrain de stockage. Le pré-collecteur n''en a « aucun ». NULL : non renseigné.';
COMMENT ON COLUMN barbechas.achete_aux_pairs IS
  'L''acteur achète à d''autres pré-collecteurs. Le pré-collecteur « n''achète pas » ; c''est ce que fait l''intermédiaire. NULL : non renseigné.';
COMMENT ON COLUMN barbechas.vehicule_motorise IS
  'L''acteur utilise un véhicule motorisé — indice, pas critère : l''intermédiaire en a « en général ». NULL : non renseigné.';
COMMENT ON COLUMN barbechas.faits_releves_le IS
  'Date à laquelle les faits ont été relevés : ils changent, et un registre doit dire quand il les a constatés.';

CREATE OR REPLACE FUNCTION app.categorie_impliquee(p_local boolean, p_achat boolean) RETURNS text
  LANGUAGE sql IMMUTABLE AS
$$
  SELECT CASE
    WHEN p_local IS TRUE OR p_achat IS TRUE THEN 'intermediaire'
    -- Les deux faits décisifs connus et négatifs : un pré-collecteur.
    WHEN p_local IS FALSE AND p_achat IS FALSE THEN 'pre_collecteur'
  END
$$;
COMMENT ON FUNCTION app.categorie_impliquee(boolean, boolean) IS
  'La catégorie que les faits impliquent, d''après les définitions du projet de décret : intermédiaire dès qu''il y a local ou achat aux pairs ; pré-collecteur quand ni l''un ni l''autre ; NULL quand un fait décisif manque. Le véhicule motorisé n''est qu''un indice.';
GRANT EXECUTE ON FUNCTION app.categorie_impliquee(boolean, boolean) TO siipi_app;

-- Le registre se ferme avec le cadre : ni inscription, ni catégorie, ni faits
-- tant que le texte n'est pas en vigueur. Ce qui existait avant (16.1 : le
-- pseudonyme, la zone, les livraisons) reste modifiable.
CREATE OR REPLACE FUNCTION app.controler_registre_informel() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
  IF (TG_OP = 'INSERT' AND (NEW.categorie, NEW.dispose_local, NEW.achete_aux_pairs, NEW.vehicule_motorise) IS DISTINCT FROM (NULL::text, NULL::boolean, NULL::boolean, NULL::boolean))
     OR (TG_OP = 'UPDATE' AND (NEW.categorie, NEW.dispose_local, NEW.achete_aux_pairs, NEW.vehicule_motorise, NEW.faits_releves_le)
                              IS DISTINCT FROM (OLD.categorie, OLD.dispose_local, OLD.achete_aux_pairs, OLD.vehicule_motorise, OLD.faits_releves_le)) THEN
    IF NOT app.cadre_secteur_informel_actif() THEN
      RAISE EXCEPTION 'CADRE_INACTIF: le cadre du secteur informel n''est pas en vigueur (projet de décret) ; la FNCT l''active quand le texte est publié.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.faits_releves_le > (now() AT TIME ZONE 'Africa/Tunis')::date THEN
      RAISE EXCEPTION 'FAITS_AVENIR: des faits se relèvent quand ils sont constatés ; la date ne peut pas être dans l''avenir.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_controler_registre_informel ON barbechas;
CREATE TRIGGER trg_controler_registre_informel BEFORE INSERT OR UPDATE ON barbechas
  FOR EACH ROW EXECUTE FUNCTION app.controler_registre_informel();

-- L'identifiant d'un acteur inscrit par l'API : « <COMMUNE>-I<numéro> ».
-- Attribué par la base, jamais tiré du nom ni du CIN : un pseudonyme qui
-- dériverait de la personne n'en serait plus un.
CREATE OR REPLACE FUNCTION app.prochain_identifiant_acteur(p_commune text) RETURNS text
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  WITH prefixe AS (
    SELECT upper(regexp_replace(regexp_replace(p_commune, '^[a-z]+_', ''), '[^a-zA-Z0-9]+', '', 'g')) || '-I' AS p
  )
  SELECT p.p || lpad((COALESCE(max(substring(b.id_precollecteur FROM length(p.p) + 1)::int), 0) + 1)::text, 4, '0')
    FROM prefixe p
    LEFT JOIN barbechas b ON b.id_precollecteur LIKE p.p || '%' AND substring(b.id_precollecteur FROM length(p.p) + 1) ~ '^[0-9]+$'
   GROUP BY p.p
$$;
COMMENT ON FUNCTION app.prochain_identifiant_acteur(text) IS
  'Prochain identifiant pseudonyme d''un acteur informel de la commune (« MARSA-I0001 »). Attribué par la base, jamais dérivé de la personne.';
GRANT EXECUTE ON FUNCTION app.prochain_identifiant_acteur(text) TO siipi_app;

-- -------------------------------------------------------------------------
-- 3. La démarche de formalisation, datée
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS demarches_formalisation (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id   TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    acteur_id    UUID NOT NULL REFERENCES barbechas(id) ON DELETE CASCADE,
    statut       TEXT NOT NULL,
    date_statut  DATE NOT NULL,
    reference    TEXT,
    observation  TEXT,
    saisi_par    UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at   TIMESTAMPTZ,
    deleted_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT demarches_statut_valide CHECK (statut IN ('demarche_entamee', 'en_accompagnement', 'formalisee', 'interrompue')),
    -- La démarche entamée est la pièce qui fait courir le droit d'exercer :
    -- sans sa référence (récépissé de dépôt, numéro d'enregistrement), elle
    -- ne prouve rien.
    CONSTRAINT demarches_entamee_referencee CHECK (statut <> 'demarche_entamee' OR length(btrim(COALESCE(reference, ''))) > 0),
    CONSTRAINT demarches_interruption_motivee CHECK (statut <> 'interrompue' OR length(btrim(COALESCE(observation, ''))) >= 5)
);
COMMENT ON TABLE demarches_formalisation IS
  'Les étapes datées de la démarche de formalisation d''un acteur informel auprès de la commune (projet de décret, art. 13.1) : entamée (avec sa pièce), en accompagnement, formalisée, interrompue (avec son motif). Un historique : une étape ne se réécrit pas ; saisie à tort, elle se retire.';
COMMENT ON COLUMN demarches_formalisation.date_statut IS
  'Date de l''étape. Celle de la démarche entamée fait courir le droit d''exercer pendant la période transitoire.';
CREATE INDEX IF NOT EXISTS idx_demarches_acteur ON demarches_formalisation (acteur_id, date_statut) WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION app.controler_demarche_formalisation() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_derniere demarches_formalisation;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) - 'deleted_at' - 'deleted_by') IS DISTINCT FROM (to_jsonb(OLD) - 'deleted_at' - 'deleted_by') THEN
      RAISE EXCEPTION 'DEMARCHE_FIGEE: une étape ne se réécrit pas ; retirez-la et inscrivez la bonne.' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT app.cadre_secteur_informel_actif() THEN
    RAISE EXCEPTION 'CADRE_INACTIF: le cadre du secteur informel n''est pas en vigueur (projet de décret) ; la FNCT l''active quand le texte est publié.'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT commune_id INTO NEW.commune_id FROM barbechas WHERE id = NEW.acteur_id AND deleted_at IS NULL;
  IF NEW.commune_id IS NULL THEN
    RAISE EXCEPTION 'ACTEUR_INCONNU: %', NEW.acteur_id USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.date_statut > (now() AT TIME ZONE 'Africa/Tunis')::date THEN
    RAISE EXCEPTION 'DEMARCHE_AVENIR: une étape s''inscrit quand elle a eu lieu ; sa date ne peut pas être dans l''avenir.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_derniere FROM demarches_formalisation
   WHERE acteur_id = NEW.acteur_id AND deleted_at IS NULL
   ORDER BY date_statut DESC, created_at DESC LIMIT 1;
  IF v_derniere.id IS NOT NULL AND NEW.date_statut < v_derniere.date_statut THEN
    RAISE EXCEPTION 'DEMARCHE_DATE: une étape ne peut pas précéder la dernière inscrite (%).', to_char(v_derniere.date_statut, 'DD/MM/YYYY')
      USING ERRCODE = 'check_violation';
  END IF;
  -- On ne se dit pas formalisé, ni accompagné, sans avoir entamé la démarche.
  IF NEW.statut IN ('en_accompagnement', 'formalisee')
     AND NOT EXISTS (SELECT 1 FROM demarches_formalisation
                      WHERE acteur_id = NEW.acteur_id AND deleted_at IS NULL AND statut = 'demarche_entamee') THEN
    RAISE EXCEPTION 'DEMARCHE_PREALABLE: cette étape suppose une démarche entamée auprès de la commune.' USING ERRCODE = 'check_violation';
  END IF;
  -- Après une formalisation, plus rien ne s'inscrit : c'est l'aboutissement.
  IF v_derniere.statut = 'formalisee' THEN
    RAISE EXCEPTION 'DEMARCHE_ABOUTIE: la démarche de cet acteur est formalisée ; retirez cette étape si elle était fausse.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_controler_demarche_formalisation ON demarches_formalisation;
CREATE TRIGGER trg_controler_demarche_formalisation BEFORE INSERT OR UPDATE ON demarches_formalisation
  FOR EACH ROW EXECUTE FUNCTION app.controler_demarche_formalisation();

DROP TRIGGER IF EXISTS trg_audit_demarches_formalisation ON demarches_formalisation;
CREATE TRIGGER trg_audit_demarches_formalisation AFTER INSERT OR UPDATE OR DELETE ON demarches_formalisation
  FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement();

ALTER TABLE demarches_formalisation ENABLE ROW LEVEL SECURITY;
ALTER TABLE demarches_formalisation FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS demarches_formalisation_select ON demarches_formalisation;
CREATE POLICY demarches_formalisation_select ON demarches_formalisation FOR SELECT
  USING (deleted_at IS NULL AND app.can_read_commune(commune_id));
DROP POLICY IF EXISTS demarches_formalisation_insert ON demarches_formalisation;
CREATE POLICY demarches_formalisation_insert ON demarches_formalisation FOR INSERT
  WITH CHECK (app.can_write_commune(commune_id));
DROP POLICY IF EXISTS demarches_formalisation_update ON demarches_formalisation;
CREATE POLICY demarches_formalisation_update ON demarches_formalisation FOR UPDATE
  USING (deleted_at IS NULL AND app.can_write_commune(commune_id)) WITH CHECK (app.can_write_commune(commune_id));
GRANT SELECT, INSERT ON demarches_formalisation TO siipi_app;
REVOKE UPDATE, DELETE, TRUNCATE ON demarches_formalisation FROM siipi_app;

-- -------------------------------------------------------------------------
-- 4. « À vérifier » : la catégorie déclarée face aux faits
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.incoherences_acteurs_informels(p_commune text)
  RETURNS TABLE (gravite text, domaine text, sujet text, sujet_id text, constat text, quoi_faire text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT 'avertissement', 'acteurs_informels', b.id_precollecteur, b.id::text,
         CASE WHEN b.achete_aux_pairs THEN 'Déclaré pré-collecteur, mais achète à d''autres pré-collecteurs : relève de la catégorie intermédiaire.'
              ELSE 'Déclaré pré-collecteur, mais dispose d''un local de stockage : relève de la catégorie intermédiaire.' END,
         'Vérifier les faits relevés, ou la catégorie déclarée. SIIPI ne change pas la catégorie : il signale l''écart.'
    FROM barbechas b
   WHERE b.commune_id = p_commune AND b.deleted_at IS NULL
     AND b.categorie = 'pre_collecteur' AND app.categorie_impliquee(b.dispose_local, b.achete_aux_pairs) = 'intermediaire'
     AND app.cadre_secteur_informel_actif() AND app.can_read_commune(p_commune)
  UNION ALL
  SELECT 'information', 'acteurs_informels', b.id_precollecteur, b.id::text,
         'Déclaré intermédiaire, sans local ni achat à d''autres pré-collecteurs : rien ne le distingue d''un pré-collecteur.',
         'Vérifier les faits relevés, ou la catégorie déclarée.'
    FROM barbechas b
   WHERE b.commune_id = p_commune AND b.deleted_at IS NULL
     AND b.categorie = 'intermediaire' AND app.categorie_impliquee(b.dispose_local, b.achete_aux_pairs) = 'pre_collecteur'
     AND app.cadre_secteur_informel_actif() AND app.can_read_commune(p_commune)
  UNION ALL
  SELECT 'information', 'acteurs_informels', b.id_precollecteur, b.id::text,
         format('Catégorie non déclarée ; les faits relevés indiquent : %s.',
                CASE app.categorie_impliquee(b.dispose_local, b.achete_aux_pairs) WHEN 'intermediaire' THEN 'intermédiaire' ELSE 'pré-collecteur' END),
         'Déclarer la catégorie de l''acteur.'
    FROM barbechas b
   WHERE b.commune_id = p_commune AND b.deleted_at IS NULL
     AND b.categorie IS NULL AND app.categorie_impliquee(b.dispose_local, b.achete_aux_pairs) IS NOT NULL
     AND app.cadre_secteur_informel_actif() AND app.can_read_commune(p_commune)
$$;
GRANT EXECUTE ON FUNCTION app.incoherences_acteurs_informels(text) TO siipi_app;

-- Le panneau « À vérifier » : définition reprise de la migration 059, la
-- famille des acteurs informels en plus.
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
    ) tout
   ORDER BY CASE gravite WHEN 'bloquant' THEN 0
                         WHEN 'avertissement' THEN 1
                         ELSE 2 END,
            domaine, sujet
$$;
GRANT EXECUTE ON FUNCTION app.incoherences_commune(text) TO siipi_app;

-- -------------------------------------------------------------------------
-- 5. Retrait logique : une étape saisie à tort se retire
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.supprimer(p_table text, p_id text)
  RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS
$fn$
DECLARE
  v_commune text;
BEGIN
  IF p_table NOT IN ('users', 'vehicules', 'conteneurs', 'tickets',
                     'pesees_anged', 'zones_collecte', 'barbechas',
                     'five_axis_scores', 'circuits', 'controles_terrain',
                     'declarations_passage', 'incidents', 'annonces_collecte',
                     'collecteurs_agrees', 'demandes_enlevement',
                     'personnel', 'fichiers', 'points_suggeres',
                     'rapports_etudes', 'contacts',
                     'interventions_maintenance', 'plans_entretien',
                     'champs_points', 'etiquettes_points', 'actions_planifiees',
                     'poi', 'fuel_logs', 'fins_de_poste', 'dotations_epi',
                     'incidents_travail', 'commerces', 'conventions_commerciales',
                     'donnees_personnelles_barbechas',
                     'carnets_de_bord', 'quotas_carburant',
                     'immobilisations_engins', 'etapes_declassement', 'pieces_declassement',
                     'etudes_cout_complet', 'demarches_formalisation') THEN
    RAISE EXCEPTION 'TABLE_NON_SUPPRIMABLE: %', p_table;
  END IF;

  EXECUTE format('SELECT commune_id FROM %I WHERE id::text = $1 AND deleted_at IS NULL', p_table)
     INTO v_commune USING p_id;

  IF v_commune IS NULL THEN
    RETURN false;
  END IF;

  -- L'identité se retire comme elle se lit : par le seul admin de la commune.
  -- Le circuit d'un dossier de déclassement et ses pièces, comme ils s'inscrivent.
  IF p_table = 'donnees_personnelles_barbechas' THEN
    IF NOT app.peut_voir_identite(v_commune) THEN
      RAISE EXCEPTION 'ACCES_REFUSE' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF p_table IN ('etapes_declassement', 'pieces_declassement') THEN
    IF NOT app.peut_instruire_declassement(v_commune) THEN
      RAISE EXCEPTION 'ACCES_REFUSE' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF NOT app.can_write_commune(v_commune) THEN
    RAISE EXCEPTION 'ACCES_REFUSE' USING ERRCODE = 'insufficient_privilege';
  END IF;

  EXECUTE format('UPDATE %I SET deleted_at = now(), deleted_by = $2 WHERE id::text = $1', p_table)
    USING p_id, app.current_user_id();

  RETURN true;
END;
$fn$;

GRANT EXECUTE ON FUNCTION app.supprimer(text, text) TO siipi_app;
