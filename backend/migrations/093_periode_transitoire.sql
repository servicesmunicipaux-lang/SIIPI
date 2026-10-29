-- =========================================================================
-- 093 — La période transitoire du secteur informel (lot I3, 18.3).
-- Projet de décret sur le tri à la source, art. 13 — NON EN VIGUEUR.
-- Décisions du 28/10/2026 (DECISIONS_2026-10-20.md, compléments).
--
-- LES RÈGLES SONT DES PARAMÈTRES. Le départ et la durée de la période, le
-- délai d'étalonnage, la durée d'un agrément et la liste des étapes
-- d'accompagnement sont ceux du lot I1 (migration 091) : datés, tenus par la
-- FNCT. Rien ici n'écrit une durée ou une date de l'article 13. Sans date de
-- départ, aucun état ni aucun avis ne se calcule : une échéance inventée
-- serait lue comme vraie.
--
-- SIIPI CONSTATE, IL NE BLOQUE PAS. Après la période, un acteur dont la
-- démarche n'est pas formalisée est « à régulariser » : un avertissement dans
-- « À vérifier », jamais un refus.
--
-- SIIPI N'AGRÉE PAS. Un agrément d'intermédiaire est délivré par un
-- organisme ; la commune en enregistre l'organisme, la référence, la date de
-- délivrance et l'échéance que porte la pièce. Une échéance qui s'écarte de la
-- durée nationale en vigueur est signalée, jamais corrigée.
--
-- LA CONVERSION EST DÉCLARÉE. Les tonnes détournées sont les livraisons du
-- registre des acteurs : elles ne s'additionnent jamais au tonnage pesé des
-- circuits. La redevance évitée suppose que ces tonnes seraient parties en
-- décharge (décision 1 du 28/10) ; les voyages économisés se comptent au poids
-- moyen d'un voyage pesé du même mois, sans repli sur un autre (décision 2).
--
-- La FNCT voit des agrégats par gouvernorat, sans rang ni ligne par commune ;
-- tout compte de 1 à 4 acteurs y est masqué (décision 6), et les tonnes ne s'y
-- lisent que par mois clos de commune non masquée. Le masquage vaut pour ce que
-- la vue nationale et le bilan publient : la FNCT lit par ailleurs, commune par
-- commune, la situation pseudonyme de chaque acteur, comme le registre de 18.1.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Les étapes d'accompagnement, acteur par acteur
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jalons_acteurs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id   TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    acteur_id    UUID NOT NULL REFERENCES barbechas(id) ON DELETE CASCADE,
    jalon_code   TEXT NOT NULL,
    date_jalon   DATE NOT NULL,
    reference    TEXT,
    observation  TEXT,
    saisi_par    UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at   TIMESTAMPTZ,
    deleted_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT jalons_acteurs_reference_courte CHECK (reference IS NULL OR length(reference) <= 200),
    CONSTRAINT jalons_acteurs_observation_courte CHECK (observation IS NULL OR length(observation) <= 1000)
);
COMMENT ON TABLE jalons_acteurs IS
  'Les étapes d''accompagnement franchies par un acteur informel pendant la période transitoire (projet de décret, art. 13 ; lot I3) : formation, statut, régularisation… L''étape doit figurer dans la liste nationale « jalons_accompagnement » en vigueur à sa date. Un historique : une étape ne se réécrit pas ; saisie à tort, elle se retire.';
COMMENT ON COLUMN jalons_acteurs.jalon_code IS
  'Code d''un élément de la liste nationale « jalons_accompagnement » (elements_listes_nationales) en vigueur à date_jalon. Le code reste stable quand la FNCT ferme un élément et en ouvre un nouveau sous le même code.';
COMMENT ON COLUMN jalons_acteurs.reference IS
  'La pièce qui atteste l''étape (attestation de formation, numéro d''inscription…) : sa référence, jamais le document lui-même.';
CREATE UNIQUE INDEX IF NOT EXISTS uq_jalon_acteur ON jalons_acteurs (acteur_id, jalon_code) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_jalons_acteurs_commune ON jalons_acteurs (commune_id) WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION app.controler_jalon_acteur() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_entamee date;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) - 'deleted_at' - 'deleted_by') IS DISTINCT FROM (to_jsonb(OLD) - 'deleted_at' - 'deleted_by') THEN
      RAISE EXCEPTION 'JALON_FIGE: une étape ne se réécrit pas ; retirez-la et inscrivez la bonne.' USING ERRCODE = 'check_violation';
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
  IF NEW.date_jalon > app.jour_tunis() THEN
    RAISE EXCEPTION 'JALON_AVENIR: une étape s''inscrit quand elle a été franchie ; sa date ne peut pas être dans l''avenir.' USING ERRCODE = 'check_violation';
  END IF;
  -- La liste du jour de l'étape : une étape que le texte a ajoutée depuis ne
  -- vaut pas pour le passé, une étape qu'il a retirée vaut pour ce qu'elle a été.
  IF NOT EXISTS (SELECT 1 FROM app.liste_nationale('jalons_accompagnement', NEW.date_jalon) WHERE code = NEW.jalon_code) THEN
    RAISE EXCEPTION 'JALON_INCONNU: cette étape ne figure pas dans la liste nationale des étapes d''accompagnement en vigueur le %.',
      to_char(NEW.date_jalon, 'DD/MM/YYYY') USING ERRCODE = 'check_violation';
  END IF;
  -- L'accompagnement suit la démarche entamée auprès de la commune.
  SELECT min(date_statut) INTO v_entamee FROM demarches_formalisation
   WHERE acteur_id = NEW.acteur_id AND deleted_at IS NULL AND statut = 'demarche_entamee';
  IF v_entamee IS NULL OR v_entamee > NEW.date_jalon THEN
    RAISE EXCEPTION 'JALON_PREALABLE: une étape d''accompagnement suit une démarche entamée auprès de la commune, inscrite à une date antérieure ou égale.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_controler_jalon_acteur ON jalons_acteurs;
CREATE TRIGGER trg_controler_jalon_acteur BEFORE INSERT OR UPDATE ON jalons_acteurs
  FOR EACH ROW EXECUTE FUNCTION app.controler_jalon_acteur();
DROP TRIGGER IF EXISTS trg_audit_jalons_acteurs ON jalons_acteurs;
CREATE TRIGGER trg_audit_jalons_acteurs AFTER INSERT OR UPDATE OR DELETE ON jalons_acteurs
  FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement();

ALTER TABLE jalons_acteurs ENABLE ROW LEVEL SECURITY;
ALTER TABLE jalons_acteurs FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS jalons_acteurs_select ON jalons_acteurs;
CREATE POLICY jalons_acteurs_select ON jalons_acteurs FOR SELECT
  USING (deleted_at IS NULL AND app.can_read_commune(commune_id));
-- Le directeur de la commune accompagne ; la FNCT lit (comme pour la carte).
DROP POLICY IF EXISTS jalons_acteurs_insert ON jalons_acteurs;
CREATE POLICY jalons_acteurs_insert ON jalons_acteurs FOR INSERT
  WITH CHECK (app.peut_emettre_document(commune_id));
DROP POLICY IF EXISTS jalons_acteurs_update ON jalons_acteurs;
CREATE POLICY jalons_acteurs_update ON jalons_acteurs FOR UPDATE
  USING (deleted_at IS NULL AND app.peut_emettre_document(commune_id)) WITH CHECK (app.peut_emettre_document(commune_id));
GRANT SELECT, INSERT ON jalons_acteurs TO siipi_app;
-- Les privilèges par défaut donnent UPDATE à toute table neuve : le retrait
-- passe par app.supprimer, jamais par un UPDATE de l'application.
REVOKE UPDATE, DELETE, TRUNCATE ON jalons_acteurs FROM siipi_app;

-- -------------------------------------------------------------------------
-- 2. Les agréments des intermédiaires : enregistrés, jamais délivrés
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agrements_intermediaires (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id       TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    acteur_id        UUID NOT NULL REFERENCES barbechas(id) ON DELETE CASCADE,
    organisme        TEXT NOT NULL,
    reference        TEXT NOT NULL,
    date_delivrance  DATE NOT NULL,
    date_echeance    DATE NOT NULL,
    observation      TEXT,
    saisi_par        UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at       TIMESTAMPTZ,
    deleted_by       UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT agrements_organisme_nomme CHECK (length(btrim(organisme)) BETWEEN 3 AND 200),
    CONSTRAINT agrements_reference_donnee CHECK (length(btrim(reference)) BETWEEN 1 AND 200),
    CONSTRAINT agrements_echeance_apres CHECK (date_echeance > date_delivrance),
    CONSTRAINT agrements_observation_courte CHECK (observation IS NULL OR length(observation) <= 1000)
);
COMMENT ON TABLE agrements_intermediaires IS
  'Les agréments des acteurs déclarés intermédiaires (projet de décret, art. 13 ; lot I3), tels que l''organisme qui les délivre les a délivrés : organisme, référence, délivrance, échéance portée par la pièce. SIIPI ne délivre aucun agrément ; il en signale l''échéance, et l''écart avec la durée nationale en vigueur. Aucune ligne ne se réécrit.';
COMMENT ON COLUMN agrements_intermediaires.date_echeance IS
  'L''échéance écrite sur l''agrément, recopiée telle quelle. Comparée à la durée nationale en vigueur à la délivrance (informel_duree_agrement_mois) : un écart est un avis, jamais une correction.';
CREATE INDEX IF NOT EXISTS idx_agrements_acteur ON agrements_intermediaires (acteur_id, date_echeance) WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION app.controler_agrement() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_acteur barbechas;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) - 'deleted_at' - 'deleted_by') IS DISTINCT FROM (to_jsonb(OLD) - 'deleted_at' - 'deleted_by') THEN
      RAISE EXCEPTION 'AGREMENT_FIGE: un agrément enregistré ne se réécrit pas ; retirez-le et enregistrez la bonne pièce.' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT app.cadre_secteur_informel_actif() THEN
    RAISE EXCEPTION 'CADRE_INACTIF: le cadre du secteur informel n''est pas en vigueur (projet de décret) ; la FNCT l''active quand le texte est publié.'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_acteur FROM barbechas WHERE id = NEW.acteur_id AND deleted_at IS NULL;
  IF v_acteur.id IS NULL THEN
    RAISE EXCEPTION 'ACTEUR_INCONNU: %', NEW.acteur_id USING ERRCODE = 'check_violation';
  END IF;
  NEW.commune_id := v_acteur.commune_id;
  IF v_acteur.categorie IS DISTINCT FROM 'intermediaire' THEN
    RAISE EXCEPTION 'AGREMENT_CATEGORIE: un agrément ne s''enregistre que pour un acteur déclaré intermédiaire.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.date_delivrance > app.jour_tunis() THEN
    RAISE EXCEPTION 'AGREMENT_AVENIR: un agrément s''enregistre quand il a été délivré ; sa date de délivrance ne peut pas être dans l''avenir.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_controler_agrement ON agrements_intermediaires;
CREATE TRIGGER trg_controler_agrement BEFORE INSERT OR UPDATE ON agrements_intermediaires
  FOR EACH ROW EXECUTE FUNCTION app.controler_agrement();
DROP TRIGGER IF EXISTS trg_audit_agrements_intermediaires ON agrements_intermediaires;
CREATE TRIGGER trg_audit_agrements_intermediaires AFTER INSERT OR UPDATE OR DELETE ON agrements_intermediaires
  FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement();

ALTER TABLE agrements_intermediaires ENABLE ROW LEVEL SECURITY;
ALTER TABLE agrements_intermediaires FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agrements_intermediaires_select ON agrements_intermediaires;
CREATE POLICY agrements_intermediaires_select ON agrements_intermediaires FOR SELECT
  USING (deleted_at IS NULL AND app.can_read_commune(commune_id));
DROP POLICY IF EXISTS agrements_intermediaires_insert ON agrements_intermediaires;
CREATE POLICY agrements_intermediaires_insert ON agrements_intermediaires FOR INSERT
  WITH CHECK (app.peut_emettre_document(commune_id));
DROP POLICY IF EXISTS agrements_intermediaires_update ON agrements_intermediaires;
CREATE POLICY agrements_intermediaires_update ON agrements_intermediaires FOR UPDATE
  USING (deleted_at IS NULL AND app.peut_emettre_document(commune_id)) WITH CHECK (app.peut_emettre_document(commune_id));
GRANT SELECT, INSERT ON agrements_intermediaires TO siipi_app;
REVOKE UPDATE, DELETE, TRUNCATE ON agrements_intermediaires FROM siipi_app;

-- -------------------------------------------------------------------------
-- 3. La situation de chaque acteur face à la période transitoire
-- -------------------------------------------------------------------------
-- Tout se juge à la date demandée (aujourd'hui par défaut), sur les règles en
-- vigueur à cette date et sur les faits DATÉS DE CETTE DATE OU AVANT, tels
-- qu'ils sont inscrits aujourd'hui. Ce n'est pas une photographie de ce qu'on
-- lisait ce jour-là : une démarche inscrite après coup avec sa vraie date compte
-- au jour où elle a eu lieu, et une étape retirée parce qu'elle était fausse ne
-- compte plus. Une commune qui reporte ses dossiers papier le fait ainsi.
--
-- L'étalonnage se reconnaît à son code dans la liste nationale,
-- « etalonnage_instruments » : la FNCT qui change le libellé ou la date d'effet
-- de cette étape ferme l'élément et en ouvre un sous le MÊME code ; une étape
-- d'étalonnage ouverte sous un autre code ne lèverait pas l'avertissement.
CREATE OR REPLACE FUNCTION app.situation_transitoire(p_commune text, p_date date DEFAULT NULL)
  RETURNS TABLE (
    acteur_id               uuid,
    id_precollecteur        text,
    categorie               text,
    derniere_demarche       text,
    date_derniere_demarche  date,
    jalons_franchis         integer,
    jalons_en_vigueur       integer,
    agrement_echeance       date,
    agrement_valable        boolean,
    etalonnage_enregistre   boolean,
    etat                    text
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  WITH jour AS (SELECT COALESCE(p_date, app.jour_tunis()) AS d),
  p AS (SELECT t.* FROM jour j, app.periode_transitoire(j.d) t),
  -- Un code une fois : deux éléments du même code peuvent se chevaucher un jour,
  -- quand la FNCT ferme l'ancien après l'entrée en vigueur du nouveau.
  liste AS (SELECT DISTINCT l.code FROM jour j, app.liste_nationale('jalons_accompagnement', j.d) l),
  a AS (
    SELECT b.id, b.id_precollecteur, b.categorie,
           dem.statut, dem.date_statut,
           (SELECT count(*)::int FROM jalons_acteurs x, jour j
             WHERE x.acteur_id = b.id AND x.deleted_at IS NULL AND x.date_jalon <= j.d
               AND x.jalon_code IN (SELECT code FROM liste)) AS franchis,
           (SELECT max(g.date_echeance) FROM agrements_intermediaires g, jour j
             WHERE g.acteur_id = b.id AND g.deleted_at IS NULL AND g.date_delivrance <= j.d) AS echeance,
           EXISTS (SELECT 1 FROM jalons_acteurs x, jour j
                    WHERE x.acteur_id = b.id AND x.deleted_at IS NULL AND x.date_jalon <= j.d
                      AND x.jalon_code = 'etalonnage_instruments') AS etalonne
      FROM barbechas b
      LEFT JOIN LATERAL (
        SELECT f.statut, f.date_statut FROM demarches_formalisation f, jour j
         WHERE f.acteur_id = b.id AND f.deleted_at IS NULL AND f.date_statut <= j.d
         ORDER BY f.date_statut DESC, f.created_at DESC LIMIT 1
      ) dem ON true
     WHERE b.commune_id = p_commune AND b.deleted_at IS NULL
       AND app.can_read_commune(p_commune)
  )
  SELECT a.id, a.id_precollecteur, a.categorie, a.statut, a.date_statut,
         a.franchis, (SELECT count(*)::int FROM liste),
         CASE WHEN a.categorie = 'intermediaire' THEN a.echeance END,
         CASE WHEN a.categorie = 'intermediaire' THEN COALESCE(a.echeance >= j.d, false) END,
         CASE WHEN a.categorie = 'intermediaire' THEN a.etalonne END,
         CASE
           WHEN p.debut IS NULL THEN 'date_depart_non_fixee'
           WHEN p.fin IS NULL THEN 'regles_incompletes'
           WHEN a.statut = 'formalisee' THEN 'formalise'
           WHEN j.d < p.debut THEN 'avant_periode'
           WHEN j.d <= p.fin AND a.statut IN ('demarche_entamee', 'en_accompagnement') THEN 'peut_exercer'
           WHEN j.d <= p.fin THEN 'sans_demarche'
           ELSE 'a_regulariser'
         END
    FROM a, jour j, p
   ORDER BY a.id_precollecteur
$$;
COMMENT ON FUNCTION app.situation_transitoire(text, date) IS
  'Chaque acteur informel de la commune face à la période transitoire, à une date (aujourd''hui par défaut), d''après les règles en vigueur à cette date et les faits datés de cette date ou avant, tels qu''inscrits aujourd''hui : dernière étape de sa démarche, étapes d''accompagnement franchies sur celles de la liste en vigueur, agrément et étalonnage (intermédiaires ; l''étalonnage est l''étape de code etalonnage_instruments), et son état — date_depart_non_fixee | regles_incompletes (aucun état sans les règles), formalise, avant_periode, peut_exercer (démarche en cours), sans_demarche, a_regulariser (après la fin). Un constat, jamais un blocage.';
GRANT EXECUTE ON FUNCTION app.situation_transitoire(text, date) TO siipi_app;

-- -------------------------------------------------------------------------
-- 4. « À vérifier » : agréments, fin de période, étalonnage
-- -------------------------------------------------------------------------
-- 60 jours avant l'échéance d'un agrément : un délai de l'écran (décision 3 du
-- 28/10), pas une règle de l'article 13 — d'où une constante, pas un paramètre.
CREATE OR REPLACE FUNCTION app.incoherences_periode_transitoire(p_commune text)
  RETURNS TABLE (gravite text, domaine text, sujet text, sujet_id text, constat text, quoi_faire text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  WITH dernier AS (
    -- Le dernier agrément de chaque intermédiaire : celui qui court le plus loin.
    SELECT DISTINCT ON (g.acteur_id) g.*, b.id_precollecteur
      FROM agrements_intermediaires g
      JOIN barbechas b ON b.id = g.acteur_id AND b.deleted_at IS NULL AND b.categorie = 'intermediaire'
     WHERE g.commune_id = p_commune AND g.deleted_at IS NULL AND g.date_delivrance <= app.jour_tunis()
     ORDER BY g.acteur_id, g.date_echeance DESC, g.created_at DESC
  ),
  p AS (SELECT * FROM app.periode_transitoire(NULL))
  SELECT 'information', 'acteurs_informels', d.id_precollecteur, d.id::text,
         format('L''agrément %s expire le %s.', d.reference, to_char(d.date_echeance, 'DD/MM/YYYY')),
         'Si l''acteur poursuit son activité d''intermédiaire, enregistrer le renouvellement de son agrément dès que l''organisme l''a délivré.'
    FROM dernier d
   WHERE d.date_echeance BETWEEN app.jour_tunis() AND app.jour_tunis() + 60
     AND app.cadre_secteur_informel_actif() AND app.can_read_commune(p_commune)
  UNION ALL
  SELECT 'avertissement', 'acteurs_informels', d.id_precollecteur, d.id::text,
         format('L''agrément %s a expiré le %s.', d.reference, to_char(d.date_echeance, 'DD/MM/YYYY')),
         'Enregistrer le renouvellement de l''agrément s''il a été délivré. SIIPI n''agrée pas : il constate l''échéance.'
    FROM dernier d
   WHERE d.date_echeance < app.jour_tunis()
     AND app.cadre_secteur_informel_actif() AND app.can_read_commune(p_commune)
  UNION ALL
  -- Une échéance qui s'écarte de la durée en vigueur le jour de la délivrance :
  -- « n mois » finit la veille du même quantième, ou ce jour-là selon l'usage
  -- de l'organisme ; au-delà, l'écart se montre.
  SELECT 'information', 'acteurs_informels', b.id_precollecteur, g.id::text,
         format('L''agrément %s court jusqu''au %s ; la durée en vigueur à sa délivrance (%s mois) mène au %s.',
                g.reference, to_char(g.date_echeance, 'DD/MM/YYYY'), v.valeur_nombre::int,
                to_char((g.date_delivrance + make_interval(months => v.valeur_nombre::int) - interval '1 day')::date, 'DD/MM/YYYY')),
         'Vérifier la date d''échéance portée par l''agrément. SIIPI ne la corrige pas.'
    FROM agrements_intermediaires g
    -- Comme l'échéance : un acteur requalifié pré-collecteur n'a plus d'agrément
    -- à suivre ; ses agréments restent lisibles, sans avis.
    JOIN barbechas b ON b.id = g.acteur_id AND b.deleted_at IS NULL AND b.categorie = 'intermediaire'
    JOIN LATERAL app.parametre_national('informel_duree_agrement_mois', g.date_delivrance) v ON true
   WHERE g.commune_id = p_commune AND g.deleted_at IS NULL AND g.date_echeance >= app.jour_tunis()
     AND g.date_echeance NOT BETWEEN (g.date_delivrance + make_interval(months => v.valeur_nombre::int) - interval '1 day')::date
                                 AND (g.date_delivrance + make_interval(months => v.valeur_nombre::int))::date
     AND app.cadre_secteur_informel_actif() AND app.can_read_commune(p_commune)
  UNION ALL
  SELECT 'avertissement', 'acteurs_informels', s.id_precollecteur, s.acteur_id::text,
         format('La période transitoire a pris fin le %s ; la démarche de cet acteur n''est pas formalisée.', to_char(p.fin, 'DD/MM/YYYY')),
         'Régulariser la situation de l''acteur avec lui, ou inscrire l''aboutissement de sa démarche. SIIPI ne bloque rien : il constate.'
    FROM app.situation_transitoire(p_commune, NULL) s, p
   WHERE s.etat = 'a_regulariser' AND app.cadre_secteur_informel_actif()
  UNION ALL
  SELECT 'avertissement', 'acteurs_informels', s.id_precollecteur, s.acteur_id::text,
         format('L''échéance d''étalonnage des instruments de pesée (%s) est passée ; aucun étalonnage n''est enregistré.', to_char(p.fin_etalonnage, 'DD/MM/YYYY')),
         'Inscrire l''étalonnage dans l''accompagnement de l''acteur s''il a eu lieu.'
    FROM app.situation_transitoire(p_commune, NULL) s, p
   WHERE s.categorie = 'intermediaire' AND s.etalonnage_enregistre IS FALSE
     AND p.fin_etalonnage IS NOT NULL AND app.jour_tunis() > p.fin_etalonnage
     AND app.cadre_secteur_informel_actif()
$$;
COMMENT ON FUNCTION app.incoherences_periode_transitoire(text) IS
  'Les avis de la période transitoire (lot I3) : agrément qui expire dans 60 jours ou a expiré, échéance d''agrément qui s''écarte de la durée nationale en vigueur à sa délivrance, acteur à régulariser après la fin de la période, intermédiaire sans étalonnage après son échéance. Sans date de départ, aucun avis de période.';
GRANT EXECUTE ON FUNCTION app.incoherences_periode_transitoire(text) TO siipi_app;

-- Le panneau « À vérifier » : définition reprise de la migration 092, la
-- période transitoire en plus.
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
      UNION ALL
      SELECT * FROM app.incoherences_cartes_precollecteur(p_commune)
      UNION ALL
      SELECT * FROM app.incoherences_periode_transitoire(p_commune)
    ) tout
   ORDER BY CASE gravite WHEN 'bloquant' THEN 0
                         WHEN 'avertissement' THEN 1
                         ELSE 2 END,
            domaine, sujet
$$;
GRANT EXECUTE ON FUNCTION app.incoherences_commune(text) TO siipi_app;

-- -------------------------------------------------------------------------
-- 5. Le bilan de la conversion, mois par mois — déclaré
-- -------------------------------------------------------------------------
-- Un mois sans livraison n'a pas de ligne : c'est un trou, pas un zéro.
-- Une livraison antérieure à tout taux de redevance est comptée à part ; un
-- mois sans voyage pesé n'a pas de voyages économisés (NULL) — aucun repli sur
-- le poids d'un autre mois. Le voyage pesé de référence est celui d'un circuit,
-- en ordures ménagères : ce que les livraisons auraient alourdi.
-- Lue par la FNCT, une ligne de moins de 5 acteurs est masquée (décision 6).
CREATE OR REPLACE FUNCTION app.conversion_informel(p_commune text, p_annee integer)
  RETURNS TABLE (
    annee                 integer,
    mois                  integer,
    acteurs               integer,
    livraisons            integer,
    tonnes_detournees     numeric,
    tonnes_sans_taux      numeric,
    redevance_evitee_tnd  numeric,
    taux_appliques        numeric[],
    redevance_provisoire  boolean,
    voyages_peses         integer,
    poids_moyen_voyage_t  numeric,
    voyages_economises    numeric,
    masque                boolean
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  WITH l AS (
    SELECT d.barbecha_id, (d.delivered_at AT TIME ZONE 'Africa/Tunis')::date AS jour, d.weight_kg / 1000.0 AS t,
           v.valeur_nombre AS taux, v.provisoire
      FROM barbecha_deliveries d
      JOIN barbechas b ON b.id = d.barbecha_id AND b.deleted_at IS NULL AND b.commune_id = p_commune
      LEFT JOIN LATERAL app.parametre_national('redevance_anged', (d.delivered_at AT TIME ZONE 'Africa/Tunis')::date) v ON true
     WHERE d.deleted_at IS NULL
       AND EXTRACT(year FROM (d.delivered_at AT TIME ZONE 'Africa/Tunis'))::integer = p_annee
       AND app.can_read_commune(p_commune)
  ),
  m AS (
    SELECT EXTRACT(month FROM jour)::integer AS mois,
           count(DISTINCT barbecha_id)::integer AS acteurs,
           count(*)::integer AS livraisons,
           round(sum(t), 3) AS tonnes,
           round(COALESCE(sum(t) FILTER (WHERE taux IS NULL), 0), 3) AS sans_taux,
           -- Aucune tonne au taux connu : pas de montant (NULL), pas un zéro.
           round(sum(t * taux), 3) AS redevance,
           array_agg(DISTINCT taux ORDER BY taux) FILTER (WHERE taux IS NOT NULL) AS taux,
           COALESCE(bool_or(provisoire), false) AS provisoire
      FROM l GROUP BY 1
  ),
  v AS (
    SELECT EXTRACT(month FROM p.date_pesee)::integer AS mois, count(*)::integer AS voyages,
           avg(p.poids_net_kg) / 1000.0 AS moyen
      FROM pesees p
     WHERE p.commune_id = p_commune AND p.deleted_at IS NULL AND p.circuit_id IS NOT NULL
       AND p.type_dechet = 'menager' AND EXTRACT(year FROM p.date_pesee)::integer = p_annee
     GROUP BY 1
  ),
  r AS (
    SELECT m.*, COALESCE(v.voyages, 0) AS voyages, round(v.moyen, 3) AS moyen,
           round(m.tonnes / v.moyen, 1) AS economises,
           app.is_fnct() AND m.acteurs < 5 AS masque
      FROM m LEFT JOIN v ON v.mois = m.mois
  )
  SELECT p_annee, r.mois,
         CASE WHEN r.masque THEN NULL ELSE r.acteurs END,
         CASE WHEN r.masque THEN NULL ELSE r.livraisons END,
         CASE WHEN r.masque THEN NULL ELSE r.tonnes END,
         CASE WHEN r.masque THEN NULL ELSE r.sans_taux END,
         CASE WHEN r.masque THEN NULL ELSE r.redevance END,
         CASE WHEN r.masque THEN NULL ELSE r.taux END,
         r.provisoire,
         r.voyages, r.moyen,
         CASE WHEN r.masque THEN NULL ELSE r.economises END,
         r.masque
    FROM r
   ORDER BY r.mois
$$;
COMMENT ON FUNCTION app.conversion_informel(text, integer) IS
  'Le bilan de la conversion du secteur informel par mois (lot I3), en provenance DÉCLARÉE (le registre des livraisons des acteurs) : tonnes détournées, redevance ANGeD évitée au taux du jour de chaque livraison (hypothèse : ces tonnes seraient parties en décharge ; tonnes sans taux à part), voyages économisés au poids moyen d''un voyage pesé de circuit en ordures ménagères du même mois (NULL sans pesée). Jamais additionné au tonnage pesé. Lu par la FNCT, un mois de moins de 5 acteurs est masqué.';
GRANT EXECUTE ON FUNCTION app.conversion_informel(text, integer) TO siipi_app;

-- -------------------------------------------------------------------------
-- 6. La vue nationale : par gouvernorat, « N communes sur M », masquée sous 5
-- -------------------------------------------------------------------------
-- LES TONNES NE SE LISENT QUE PAR MOIS CLOS ET PAR COMMUNE NON MASQUÉE. Un cumul
-- à une date libre se soustrait d'un autre : deux lectures à deux jours d'écart
-- rendraient la livraison d'un seul acteur. Le gouvernorat ne publie donc que la
-- somme des mois civils CLOS de l'année du dernier mois clos, et seulement les
-- mois où une commune a eu au moins 5 acteurs livreurs — exactement les chiffres
-- que le bilan de chaque commune montre déjà à la FNCT. Rien ne s'y déduit par
-- différence qui ne soit déjà publié ; ce qui est écarté est compté (mois_masques).
--
-- Les effectifs (acteurs, cartes, démarches…) sont ceux du jour demandé. La FNCT
-- lit par ailleurs, commune par commune, la situation pseudonyme de chaque acteur
-- (registre du lot 18.1) : le masquage sous 5 vaut pour ce que la vue nationale
-- publie, pas pour ce registre.
DROP FUNCTION IF EXISTS app.secteur_informel_national(date);
CREATE FUNCTION app.secteur_informel_national(p_date date DEFAULT NULL)
  RETURNS TABLE (
    gouvernorat            text,
    gouvernorat_ar         text,
    communes_avec_acteurs  integer,
    communes               integer,
    acteurs                integer,
    cartes_valables        integer,
    demarches_en_cours     integer,
    formalises             integer,
    agrements_valables     integer,
    tonnes_detournees      numeric,
    tonnes_du              date,
    tonnes_au              date,
    mois_masques           integer,
    masques                text[]
  )
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
#variable_conflict use_column
DECLARE
  v_jour date := COALESCE(p_date, app.jour_tunis());
  -- Le dernier jour du dernier mois clos, et le 1er janvier de son année.
  v_au date := (date_trunc('month', COALESCE(p_date, app.jour_tunis())) - interval '1 day')::date;
  v_du date := date_trunc('year', (date_trunc('month', COALESCE(p_date, app.jour_tunis())) - interval '1 day'))::date;
BEGIN
  IF NOT app.is_fnct() THEN
    RAISE EXCEPTION 'ACCES_REFUSE' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  WITH c AS (
    SELECT co.id, co.gouvernorat FROM communes co WHERE NOT co.est_demo AND co.deleted_at IS NULL
  ),
  a AS (
    SELECT b.id, b.commune_id, b.categorie,
           (SELECT f.statut FROM demarches_formalisation f
             WHERE f.acteur_id = b.id AND f.deleted_at IS NULL AND f.date_statut <= v_jour
             ORDER BY f.date_statut DESC, f.created_at DESC LIMIT 1) AS statut,
           EXISTS (SELECT 1 FROM demandes_carte_precollecteur dc JOIN documents_emis e ON e.id = dc.document_id
                    WHERE dc.acteur_id = b.id AND dc.deleted_at IS NULL
                      AND app.etat_carte(dc, e.statut, v_jour) = 'valide') AS carte,
           EXISTS (SELECT 1 FROM agrements_intermediaires g
                    WHERE g.acteur_id = b.id AND g.deleted_at IS NULL
                      AND v_jour BETWEEN g.date_delivrance AND g.date_echeance) AS agrement
      FROM barbechas b JOIN c ON c.id = b.commune_id
     WHERE b.deleted_at IS NULL
  ),
  -- Une ligne par commune et par mois clos : ses livreurs et ses tonnes, comme
  -- le bilan de la commune (app.conversion_informel) les compte.
  cm AS (
    SELECT b.commune_id, date_trunc('month', (d.delivered_at AT TIME ZONE 'Africa/Tunis')) AS mois,
           count(DISTINCT d.barbecha_id) AS livreurs, sum(d.weight_kg) / 1000.0 AS t
      FROM barbecha_deliveries d
      JOIN barbechas b ON b.id = d.barbecha_id AND b.deleted_at IS NULL
      JOIN c ON c.id = b.commune_id
     WHERE d.deleted_at IS NULL
       AND (d.delivered_at AT TIME ZONE 'Africa/Tunis')::date BETWEEN v_du AND v_au
     GROUP BY 1, 2
  ),
  tg AS (
    SELECT c.gouvernorat,
           round(sum(cm.t) FILTER (WHERE cm.livreurs >= 5), 3) AS tonnes,
           count(*) FILTER (WHERE cm.livreurs < 5)::int AS masques
      FROM cm JOIN c ON c.id = cm.commune_id
     GROUP BY c.gouvernorat
  ),
  g AS (
    SELECT c.gouvernorat,
           count(DISTINCT a.commune_id)::int AS avec,
           count(DISTINCT c.id)::int AS total,
           count(a.id)::int AS acteurs,
           count(a.id) FILTER (WHERE a.carte)::int AS cartes,
           count(a.id) FILTER (WHERE a.statut IN ('demarche_entamee', 'en_accompagnement'))::int AS en_cours,
           count(a.id) FILTER (WHERE a.statut = 'formalisee')::int AS formalises,
           count(a.id) FILTER (WHERE a.categorie = 'intermediaire' AND a.agrement)::int AS agrements
      FROM c LEFT JOIN a ON a.commune_id = c.id
     GROUP BY c.gouvernorat
  )
  SELECT g.gouvernorat, n.nom_ar, g.avec, g.total,
         -- Sans aucun acteur inscrit dans le gouvernorat : non renseigné, pas 0.
         CASE WHEN g.avec = 0 OR g.acteurs BETWEEN 1 AND 4 THEN NULL ELSE g.acteurs END,
         CASE WHEN g.avec = 0 OR g.cartes BETWEEN 1 AND 4 THEN NULL ELSE g.cartes END,
         CASE WHEN g.avec = 0 OR g.en_cours BETWEEN 1 AND 4 THEN NULL ELSE g.en_cours END,
         CASE WHEN g.avec = 0 OR g.formalises BETWEEN 1 AND 4 THEN NULL ELSE g.formalises END,
         CASE WHEN g.avec = 0 OR g.agrements BETWEEN 1 AND 4 THEN NULL ELSE g.agrements END,
         -- Aucune livraison, ou rien que des mois masqués : NULL, jamais 0.
         tg.tonnes,
         v_du,
         v_au,
         COALESCE(tg.masques, 0),
         CASE WHEN g.avec = 0 THEN ARRAY[]::text[] ELSE array_remove(ARRAY[
           CASE WHEN g.acteurs BETWEEN 1 AND 4 THEN 'acteurs' END,
           CASE WHEN g.cartes BETWEEN 1 AND 4 THEN 'cartes_valables' END,
           CASE WHEN g.en_cours BETWEEN 1 AND 4 THEN 'demarches_en_cours' END,
           CASE WHEN g.formalises BETWEEN 1 AND 4 THEN 'formalises' END,
           CASE WHEN g.agrements BETWEEN 1 AND 4 THEN 'agrements_valables' END,
           CASE WHEN tg.tonnes IS NULL AND COALESCE(tg.masques, 0) > 0 THEN 'tonnes_detournees' END], NULL) END
    FROM g
    LEFT JOIN tg ON tg.gouvernorat = g.gouvernorat
    LEFT JOIN gouvernorats_noms n ON n.gouvernorat = g.gouvernorat
   ORDER BY g.gouvernorat;
END
$$;
COMMENT ON FUNCTION app.secteur_informel_national(date) IS
  'La vue nationale du secteur informel (lot I3, FNCT seule), par gouvernorat : communes qui ont des acteurs inscrits sur les communes réelles, acteurs inscrits, cartes valables, démarches en cours, formalisés, agréments valables au jour demandé — tout compte de 1 à 4 masqué (NULL, nommé dans « masques ») ; puis les tonnes détournées (déclarées) des mois civils clos de l''année du dernier mois clos (tonnes_du, tonnes_au), sommées sur les seuls mois où une commune a eu au moins 5 acteurs livreurs ; les mois écartés sont comptés (mois_masques). Un gouvernorat sans acteur n''a que des NULL. Aucun rang, aucune ligne par commune.';
REVOKE ALL ON FUNCTION app.secteur_informel_national(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.secteur_informel_national(date) TO siipi_app;

-- -------------------------------------------------------------------------
-- 7. Retrait logique : une étape ou un agrément saisis à tort
-- -------------------------------------------------------------------------
-- Définition reprise de la migration 092, les deux tables en plus, retirées
-- par le directeur qui les inscrit.
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
                     'etudes_cout_complet', 'demarches_formalisation',
                     'demandes_carte_precollecteur', 'pieces_demande_carte',
                     'jalons_acteurs', 'agrements_intermediaires') THEN
    RAISE EXCEPTION 'TABLE_NON_SUPPRIMABLE: %', p_table;
  END IF;

  EXECUTE format('SELECT commune_id FROM %I WHERE id::text = $1 AND deleted_at IS NULL', p_table)
     INTO v_commune USING p_id;

  IF v_commune IS NULL THEN
    RETURN false;
  END IF;

  -- L'identité se retire comme elle se lit : par le seul admin de la commune.
  -- Le circuit d'un dossier de déclassement et ses pièces, comme ils s'inscrivent.
  -- Une demande de carte et ses pièces, une étape d'accompagnement et un
  -- agrément, par le directeur qui les enregistre.
  IF p_table = 'donnees_personnelles_barbechas' THEN
    IF NOT app.peut_voir_identite(v_commune) THEN
      RAISE EXCEPTION 'ACCES_REFUSE' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF p_table IN ('etapes_declassement', 'pieces_declassement') THEN
    IF NOT app.peut_instruire_declassement(v_commune) THEN
      RAISE EXCEPTION 'ACCES_REFUSE' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF p_table IN ('demandes_carte_precollecteur', 'pieces_demande_carte', 'jalons_acteurs', 'agrements_intermediaires') THEN
    IF NOT app.peut_emettre_document(v_commune) THEN
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
