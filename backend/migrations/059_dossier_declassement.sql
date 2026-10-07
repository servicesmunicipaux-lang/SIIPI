-- =========================================================================
-- 059 — Le dossier de déclassement (lot 16.4). Référentiel du dépôt
-- municipal § 1.4 (طرح المعدات, diapos 83 à 85).
--
-- Ce n'est pas une fiche, c'est une PROCÉDURE : des conditions, des pièces,
-- un circuit. SIIPI instruit ; la commune propose, l'administration accorde,
-- les Domaines de l'État et l'Agence de contrôle technique donnent leur avis,
-- l'adjudication cède l'engin. La plateforme ne déclasse rien.
--
--   1. `immobilisations_engins` : les périodes où un engin n'a pas pu servir,
--      datées. Elles s'ouvrent et se ferment d'elles-mêmes quand l'état de
--      l'engin change (migration 032), et se saisissent pour le passé. Le
--      registre des engins ne gardait que l'état du jour : le « nombre de
--      jours d'immobilisation dans l'année » qu'exige le dossier n'avait
--      aucune source.
--   2. `app.constat_declassement()` : par engin, le cumul des dépenses
--      d'entretien rapporté à la valeur d'achat, et le seuil de 80 % AFFICHÉ
--      — atteint, non atteint, indéterminé, non calculable ; l'âge en années
--      décimales ; le rapport de rendement (jours d'immobilisation / jours
--      travaillés au carnet de bord). Une source absente rend NULL, jamais 0.
--   3. `dossiers_declassement` : motifs (les cinq conditions de la diapo 83),
--      rapport détaillé, coût estimatif de la réparation, et le constat FIGÉ
--      au jour de la proposition — les chiffres qu'on a présentés à
--      l'administration ne bougent plus quand une facture arrive ensuite.
--   4. `etapes_declassement` : le circuit, dans son ordre, tenu par la base.
--   5. `pieces_declassement` : les pièces jointes (stockage, migration 041).
--   6. « À vérifier » : l'engin à réformer sans dossier, l'engin adjugé qui
--      figure encore au parc, le motif « 80 % » que le cumul enregistré
--      contredit.
--
-- Le prix et la date de mise en circulation existent depuis la migration 032
-- (`valeur_achat_tnd`, `date_premiere_circulation`) : aucune colonne n'est
-- ajoutée aux engins.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 0. Qui instruit un dossier
-- -------------------------------------------------------------------------
-- Proposer un engin au déclassement, inscrire une étape du circuit, joindre
-- une pièce : des actes de la commune, donc de son admin. La FNCT lit, elle
-- ne décide pas à la place d'une commune (CLAUDE.md § 6).
CREATE OR REPLACE FUNCTION app.peut_instruire_declassement(p_commune text) RETURNS boolean
  LANGUAGE sql STABLE AS
$$ SELECT app.current_role_name() = 'admin_commune' AND p_commune = ANY (app.mes_communes()) $$;
GRANT EXECUTE ON FUNCTION app.peut_instruire_declassement(text) TO siipi_app;

-- -------------------------------------------------------------------------
-- 1. Les périodes d'immobilisation
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS immobilisations_engins (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id   TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    vehicule_id  TEXT NOT NULL REFERENCES vehicules(id) ON DELETE CASCADE,
    debut        DATE NOT NULL,
    fin          DATE,
    motif        TEXT,
    origine      TEXT NOT NULL DEFAULT 'saisie',
    saisi_par    UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at   TIMESTAMPTZ,
    deleted_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT immobilisations_fin_apres_debut CHECK (fin IS NULL OR fin >= debut),
    CONSTRAINT immobilisations_origine_valide CHECK (origine IN ('saisie', 'etat_engin'))
);
COMMENT ON TABLE immobilisations_engins IS
  'Périodes où un engin n''a pas pu servir (panne, attente de pièces, à réformer). Source des « jours d''immobilisation dans l''année » du rapport de rendement (dossier de déclassement, référentiel diapo 83). Deux périodes d''un même engin ne se chevauchent pas.';
COMMENT ON COLUMN immobilisations_engins.fin IS
  'Dernier jour d''immobilisation, compris. Vide tant que l''engin n''est pas remis en service.';
COMMENT ON COLUMN immobilisations_engins.origine IS
  'saisie : inscrite à la main (historique, ou panne connue). etat_engin : ouverte ou fermée d''elle-même quand l''état de l''engin a changé (en_service ↔ en_panne / a_reformer).';
CREATE INDEX IF NOT EXISTS idx_immobilisations_engin
  ON immobilisations_engins (vehicule_id, debut) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_immobilisations_commune ON immobilisations_engins;
CREATE TRIGGER trg_immobilisations_commune BEFORE INSERT OR UPDATE OF vehicule_id, commune_id ON immobilisations_engins
  FOR EACH ROW EXECUTE FUNCTION app.controler_commune_engin();

-- Une période porte sur ce qui a eu lieu, et un engin n'est pas deux fois
-- immobilisé le même jour : deux périodes qui se chevauchent compteraient ces
-- jours deux fois dans le rapport de rendement.
CREATE OR REPLACE FUNCTION app.controler_immobilisation() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_j date := (now() AT TIME ZONE 'Africa/Tunis')::date;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  -- Avant le chevauchement : un intervalle à l'envers ne se construit même pas.
  IF NEW.fin < NEW.debut THEN
    RAISE EXCEPTION 'IMMOBILISATION_DATES: la fin d''une immobilisation ne peut pas précéder son début.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.debut > v_j OR NEW.fin > v_j THEN
    RAISE EXCEPTION 'IMMOBILISATION_AVENIR: une immobilisation porte sur ce qui a eu lieu ; ni son début ni sa fin ne peuvent être dans l''avenir.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM immobilisations_engins i
              WHERE i.vehicule_id = NEW.vehicule_id AND i.id <> NEW.id AND i.deleted_at IS NULL
                AND daterange(i.debut, i.fin, '[]') && daterange(NEW.debut, NEW.fin, '[]')) THEN
    RAISE EXCEPTION 'IMMOBILISATION_CHEVAUCHEMENT: cette période chevauche une autre immobilisation du même engin.'
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_controler_immobilisation ON immobilisations_engins;
CREATE TRIGGER trg_controler_immobilisation BEFORE INSERT OR UPDATE ON immobilisations_engins
  FOR EACH ROW EXECUTE FUNCTION app.controler_immobilisation();

-- L'état de l'engin tient le registre à jour. La date est celle que porte
-- l'état (`etat_depuis`, que l'écran du parc pose à aujourd'hui à défaut) ;
-- un engin CRÉÉ en panne sans date n'ouvre rien : sa panne a commencé un jour
-- que personne n'a noté, et l'inventer fabriquerait le chiffre le plus
-- sensible du dossier.
CREATE OR REPLACE FUNCTION app.suivre_immobilisation() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_j          date := (now() AT TIME ZONE 'Africa/Tunis')::date;
  v_jour       date;
  v_arret      boolean := NEW.etat IN ('en_panne', 'a_reformer');
  v_etait      boolean := TG_OP = 'UPDATE' AND OLD.etat IN ('en_panne', 'a_reformer');
  v_ouverte    uuid;
  v_derniere   immobilisations_engins;
BEGIN
  IF NEW.deleted_at IS NOT NULL OR (TG_OP = 'UPDATE' AND NEW.etat IS NOT DISTINCT FROM OLD.etat) THEN
    RETURN NULL;
  END IF;
  v_jour := LEAST(COALESCE(NEW.etat_depuis, v_j), v_j);
  SELECT id INTO v_ouverte FROM immobilisations_engins
   WHERE vehicule_id = NEW.id AND fin IS NULL AND deleted_at IS NULL;

  IF v_arret AND NOT v_etait THEN
    IF (TG_OP = 'INSERT' AND NEW.etat_depuis IS NULL) OR v_ouverte IS NOT NULL THEN
      RETURN NULL;
    END IF;
    SELECT * INTO v_derniere FROM immobilisations_engins
     WHERE vehicule_id = NEW.id AND deleted_at IS NULL ORDER BY debut DESC LIMIT 1;
    IF v_derniere.id IS NOT NULL AND v_derniere.fin >= v_jour THEN
      -- Retombé en panne avant la fin inscrite de la précédente : c'est la
      -- même immobilisation qui reprend, pas une seconde qui la chevaucherait.
      UPDATE immobilisations_engins SET fin = NULL WHERE id = v_derniere.id;
    ELSE
      INSERT INTO immobilisations_engins (commune_id, vehicule_id, debut, motif, origine, saisi_par)
      VALUES (NEW.commune_id, NEW.id, v_jour, NEW.motif_immobilisation, 'etat_engin', app.current_user_id());
    END IF;
  ELSIF v_etait AND NOT v_arret AND v_ouverte IS NOT NULL THEN
    -- Remis en service (ou réformé, ce qui le sort du parc) le jour v_jour :
    -- le dernier jour d'immobilisation est la veille.
    UPDATE immobilisations_engins SET fin = GREATEST(debut, LEAST(v_jour - 1, v_j)) WHERE id = v_ouverte;
  END IF;
  RETURN NULL;
END
$$;
DROP TRIGGER IF EXISTS trg_suivre_immobilisation ON vehicules;
CREATE TRIGGER trg_suivre_immobilisation AFTER INSERT OR UPDATE OF etat ON vehicules
  FOR EACH ROW EXECUTE FUNCTION app.suivre_immobilisation();

-- -------------------------------------------------------------------------
-- 2. Le constat par engin
-- -------------------------------------------------------------------------
-- LES DÉPENSES sont celles de l'entretien et de la réparation (carnet de la
-- GMAO, migration 046), depuis l'acquisition. Le carburant n'en est pas : il
-- est une dépense d'exploitation, pas de remise en état, et le compter ferait
-- franchir le seuil à tout camion qui roule beaucoup.
--
-- LE SEUIL DE 80 % s'affiche, il ne décide de rien :
--   atteint         — le cumul enregistré atteint 80 % de la valeur d'achat ;
--   non_atteint     — il ne l'atteint pas, et toutes les interventions ont un coût ;
--   indetermine     — il ne l'atteint pas, mais des interventions n'ont pas de
--                     coût : le cumul réel peut être plus haut ;
--   non_calculable  — pas de valeur d'achat, ou la commune ne tient pas le
--                     carnet d'entretien.
--
-- UN REGISTRE TENU dit 0 ; un registre absent dit NULL (règle d'or 1.1). Une
-- commune « tient » le carnet d'entretien dès qu'elle y a inscrit une
-- intervention ; le registre des immobilisations, dès une période ; le carnet
-- de bord, dès une sortie dans l'année. Un engin immobilisé aujourd'hui sans
-- période ouverte a une immobilisation de début inconnu : ses jours sont NULL.
CREATE OR REPLACE FUNCTION app.constat_declassement(p_commune text, p_annee integer, p_vehicule text DEFAULT NULL)
  RETURNS TABLE (
    vehicule_id                  text,
    registration                 text,
    type_engin                   text,
    categorie                    text,
    marque                       text,
    etat                         text,
    date_premiere_circulation    date,
    age_annees                   numeric,
    valeur_achat_tnd             numeric,
    cumul_depenses_tnd           numeric,
    interventions                integer,
    interventions_sans_cout      integer,
    part_depenses_pct            numeric,
    seuil_80                     text,
    pannes_12_mois               integer,
    annee                        integer,
    jours_immobilisation         integer,
    debut_immobilisation_inconnu boolean,
    jours_travailles             integer,
    rapport_rendement            numeric
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  WITH bornes AS (
    SELECT make_date(p_annee, 1, 1) AS debut, make_date(p_annee + 1, 1, 1) AS fin,
           (now() AT TIME ZONE 'Africa/Tunis')::date AS j
  ),
  tenue AS (
    SELECT EXISTS (SELECT 1 FROM interventions_maintenance i
                    WHERE i.commune_id = p_commune AND i.deleted_at IS NULL) AS depenses,
           EXISTS (SELECT 1 FROM immobilisations_engins m
                    WHERE m.commune_id = p_commune AND m.deleted_at IS NULL) AS immobilisations,
           EXISTS (SELECT 1 FROM carnets_de_bord c, bornes b
                    WHERE c.commune_id = p_commune AND c.deleted_at IS NULL
                      AND c.jour >= b.debut AND c.jour < b.fin) AS carnets
  ),
  depenses AS (
    SELECT i.vehicule_id, sum(i.cout_tnd) AS cumul, count(*)::int AS n,
           count(*) FILTER (WHERE i.cout_tnd IS NULL)::int AS sans_cout,
           count(*) FILTER (WHERE i.nature = 'corrective' AND i.date_intervention > b.j - 365)::int AS pannes
      FROM interventions_maintenance i, bornes b
     WHERE i.commune_id = p_commune AND i.deleted_at IS NULL
     GROUP BY i.vehicule_id
  ),
  immobilisations AS (
    -- Les jours de l'année, bornés à aujourd'hui : une période encore ouverte
    -- compte jusqu'à ce jour, pas jusqu'au 31 décembre.
    SELECT m.vehicule_id,
           sum(GREATEST(0, LEAST(COALESCE(m.fin, b.j), b.fin - 1, b.j) - GREATEST(m.debut, b.debut) + 1))::int AS jours,
           bool_or(m.fin IS NULL) AS ouverte
      FROM immobilisations_engins m, bornes b
     WHERE m.commune_id = p_commune AND m.deleted_at IS NULL
     GROUP BY m.vehicule_id
  ),
  travail AS (
    SELECT c.vehicule_id, count(DISTINCT c.jour)::int AS jours
      FROM carnets_de_bord c, bornes b
     WHERE c.commune_id = p_commune AND c.deleted_at IS NULL
       AND c.jour >= b.debut AND c.jour < b.fin
     GROUP BY c.vehicule_id
  )
  SELECT v.id, v.registration, v.type, v.categorie, v.marque, v.etat, v.date_premiere_circulation,
         CASE WHEN v.date_premiere_circulation IS NOT NULL
              THEN round((b.j - v.date_premiere_circulation)::numeric / 365.25, 1) END,
         v.valeur_achat_tnd,
         CASE WHEN t.depenses THEN COALESCE(d.cumul, 0) END,
         CASE WHEN t.depenses THEN COALESCE(d.n, 0) END,
         CASE WHEN t.depenses THEN COALESCE(d.sans_cout, 0) END,
         CASE WHEN t.depenses AND v.valeur_achat_tnd > 0
              THEN round(100 * COALESCE(d.cumul, 0) / v.valeur_achat_tnd, 1) END,
         CASE WHEN NOT t.depenses OR COALESCE(v.valeur_achat_tnd, 0) <= 0 THEN 'non_calculable'
              WHEN COALESCE(d.cumul, 0) >= 0.8 * v.valeur_achat_tnd THEN 'atteint'
              WHEN COALESCE(d.sans_cout, 0) > 0 THEN 'indetermine'
              ELSE 'non_atteint' END,
         CASE WHEN t.depenses THEN COALESCE(d.pannes, 0) END,
         p_annee,
         CASE WHEN t.immobilisations AND NOT x.inconnu THEN COALESCE(im.jours, 0) END,
         x.inconnu,
         CASE WHEN t.carnets THEN COALESCE(tr.jours, 0) END,
         CASE WHEN t.immobilisations AND NOT x.inconnu AND tr.jours > 0
              THEN round(COALESCE(im.jours, 0)::numeric / tr.jours, 2) END
    FROM vehicules v
    CROSS JOIN bornes b
    CROSS JOIN tenue t
    LEFT JOIN depenses d         ON d.vehicule_id = v.id
    LEFT JOIN immobilisations im ON im.vehicule_id = v.id
    LEFT JOIN travail tr         ON tr.vehicule_id = v.id
    CROSS JOIN LATERAL (SELECT v.etat IN ('en_panne', 'a_reformer') AND NOT COALESCE(im.ouverte, false) AS inconnu) x
   WHERE v.commune_id = p_commune AND v.deleted_at IS NULL
     -- Les coûts d'un engin : la commune et la FNCT (comme le carnet d'entretien, migration 046).
     AND app.can_write_commune(p_commune)
     AND ((p_vehicule IS NULL AND v.etat <> 'reforme') OR v.id = p_vehicule)
   ORDER BY 13 DESC NULLS LAST, 2
$$;
COMMENT ON FUNCTION app.constat_declassement(text, integer, text) IS
  'Par engin : âge (années décimales), valeur d''achat, cumul des dépenses d''entretien et part de la valeur d''achat, seuil de 80 % affiché (atteint | non_atteint | indetermine | non_calculable), pannes des 12 derniers mois ; pour l''année p_annee, jours d''immobilisation, jours travaillés (carnet de bord) et leur rapport. Une source non tenue rend NULL, jamais 0. Ne décide rien.';
GRANT EXECUTE ON FUNCTION app.constat_declassement(text, integer, text) TO siipi_app;

-- -------------------------------------------------------------------------
-- 3. Le dossier
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dossiers_declassement (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id                  TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    vehicule_id                 TEXT NOT NULL REFERENCES vehicules(id) ON DELETE CASCADE,
    date_proposition            DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'Africa/Tunis')::date),
    motifs                      TEXT[] NOT NULL,
    expose                      TEXT NOT NULL,
    cout_reparation_estime_tnd  NUMERIC(12, 3),
    annee_rendement             INTEGER NOT NULL,
    constat                     JSONB NOT NULL,
    statut                      TEXT NOT NULL DEFAULT 'en_cours',
    cree_par                    UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT dossiers_motifs_valides CHECK (
      cardinality(motifs) > 0
      AND motifs <@ ARRAY['depenses_80', 'pannes_repetees', 'reparation_excessive', 'service_degrade', 'mauvais_usage']::text[]),
    CONSTRAINT dossiers_expose_renseigne CHECK (length(btrim(expose)) >= 20),
    CONSTRAINT dossiers_cout_positif CHECK (cout_reparation_estime_tnd IS NULL OR cout_reparation_estime_tnd >= 0),
    CONSTRAINT dossiers_statut_valide CHECK (statut IN ('en_cours', 'adjuge', 'sans_suite')),
    CONSTRAINT dossiers_annee_plausible CHECK (annee_rendement BETWEEN 2000 AND 2100)
);
COMMENT ON TABLE dossiers_declassement IS
  'Dossier de déclassement d''un engin (ملف طرح المعدات, référentiel diapos 83-85) : une procédure, pas une fiche. La commune propose et motive ; le circuit (etapes_declassement) dit où en est l''autorisation. Ne s''efface pas : un dossier abandonné se clôt « sans suite », avec son motif.';
COMMENT ON COLUMN dossiers_declassement.motifs IS
  'Conditions de proposition invoquées (diapo 83) : depenses_80 (cumul des dépenses ≥ 80 % du prix d''acquisition), pannes_repetees, reparation_excessive (coût de réparation excessif au regard du gain attendu), service_degrade, mauvais_usage.';
COMMENT ON COLUMN dossiers_declassement.expose IS
  'Le rapport détaillé qui ouvre le circuit : ce que la commune constate et pourquoi elle propose l''engin.';
COMMENT ON COLUMN dossiers_declassement.constat IS
  'Le constat de app.constat_declassement() FIGÉ au jour de la proposition : les chiffres présentés à l''administration ne bougent plus quand une facture arrive ensuite. Le constat du jour se lit à côté.';
COMMENT ON COLUMN dossiers_declassement.annee_rendement IS
  'L''année du rapport de rendement (jours d''immobilisation / jours travaillés). Par défaut, celle de la proposition.';
COMMENT ON COLUMN dossiers_declassement.statut IS
  'en_cours | adjuge | sans_suite. Posé par le circuit (etapes_declassement), jamais écrit par l''application.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_dossier_declassement_ouvert
  ON dossiers_declassement (vehicule_id) WHERE statut = 'en_cours';
CREATE INDEX IF NOT EXISTS idx_dossiers_declassement_commune
  ON dossiers_declassement (commune_id, date_proposition DESC);

DROP TRIGGER IF EXISTS trg_dossiers_declassement_commune ON dossiers_declassement;
CREATE TRIGGER trg_dossiers_declassement_commune BEFORE INSERT OR UPDATE OF vehicule_id, commune_id ON dossiers_declassement
  FOR EACH ROW EXECUTE FUNCTION app.controler_commune_engin();

CREATE OR REPLACE FUNCTION app.preparer_dossier_declassement() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_j     date := (now() AT TIME ZONE 'Africa/Tunis')::date;
  v_etat  text;
BEGIN
  IF NEW.date_proposition > v_j THEN
    RAISE EXCEPTION 'DOSSIER_AVENIR: la date de proposition ne peut pas être dans l''avenir.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT etat INTO v_etat FROM vehicules WHERE id = NEW.vehicule_id AND deleted_at IS NULL;
  IF v_etat = 'reforme' THEN
    RAISE EXCEPTION 'DOSSIER_ENGIN_REFORME: cet engin est déjà réformé.' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM dossiers_declassement WHERE vehicule_id = NEW.vehicule_id AND statut = 'adjuge') THEN
    RAISE EXCEPTION 'DOSSIER_DEJA_ADJUGE: cet engin a déjà été adjugé ; passez-le à l''état « réformé ».' USING ERRCODE = 'check_violation';
  END IF;
  NEW.statut := 'en_cours';
  NEW.annee_rendement := COALESCE(NEW.annee_rendement, extract(year FROM NEW.date_proposition)::int);
  NEW.cree_par := app.current_user_id();
  -- Le constat est celui de la base, au moment de la proposition : ce que
  -- l'appelant aurait fourni est ignoré.
  SELECT to_jsonb(c) INTO NEW.constat
    FROM app.constat_declassement(NEW.commune_id, NEW.annee_rendement, NEW.vehicule_id) c;
  IF NEW.constat IS NULL THEN
    RAISE EXCEPTION 'ENGIN_INCONNU: %', NEW.vehicule_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_preparer_dossier_declassement ON dossiers_declassement;
CREATE TRIGGER trg_preparer_dossier_declassement BEFORE INSERT ON dossiers_declassement
  FOR EACH ROW EXECUTE FUNCTION app.preparer_dossier_declassement();

-- Ce qui a été présenté ne se réécrit pas. Les motifs, le rapport et le coût
-- estimatif se corrigent tant qu'aucune étape n'est inscrite ; dès que le
-- dossier est entre les mains de l'administration, il est figé. Le statut ne
-- bouge que par le circuit, et une seule fois.
CREATE OR REPLACE FUNCTION app.proteger_dossier_declassement() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
  IF (NEW.commune_id, NEW.vehicule_id, NEW.date_proposition, NEW.annee_rendement, NEW.constat, NEW.cree_par, NEW.created_at)
     IS DISTINCT FROM (OLD.commune_id, OLD.vehicule_id, OLD.date_proposition, OLD.annee_rendement, OLD.constat, OLD.cree_par, OLD.created_at) THEN
    RAISE EXCEPTION 'DOSSIER_FIGE: l''engin, la date de proposition et le constat d''un dossier ne se modifient pas.' USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW.motifs, NEW.expose, NEW.cout_reparation_estime_tnd) IS DISTINCT FROM (OLD.motifs, OLD.expose, OLD.cout_reparation_estime_tnd)
     AND (OLD.statut <> 'en_cours'
          OR EXISTS (SELECT 1 FROM etapes_declassement WHERE dossier_id = OLD.id AND deleted_at IS NULL)) THEN
    RAISE EXCEPTION 'DOSSIER_FIGE: le dossier est engagé dans le circuit d''autorisation ; il ne se modifie plus.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.statut IS DISTINCT FROM OLD.statut AND OLD.statut <> 'en_cours' THEN
    RAISE EXCEPTION 'DOSSIER_CLOS: ce dossier est clos.' USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_proteger_dossier_declassement ON dossiers_declassement;
CREATE TRIGGER trg_proteger_dossier_declassement BEFORE UPDATE ON dossiers_declassement
  FOR EACH ROW EXECUTE FUNCTION app.proteger_dossier_declassement();

-- -------------------------------------------------------------------------
-- 4. Le circuit d'autorisation (diapo 83)
-- -------------------------------------------------------------------------
--   accord_commune           accord de l'administration communale
--   avis_domaines            constat et avis des Domaines de l'État (أملاك الدولة)
--   avis_controle_technique  constat et avis de l'Agence de contrôle technique (وكالة الفحص الفني)
--   publicite_legale         publicité légale de la vente
--   adjudication             pli fermé ou enchère publique — clôt le dossier
--   sans_suite               abandon, avec son motif — clôt le dossier
CREATE TABLE IF NOT EXISTS etapes_declassement (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id         TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    dossier_id         UUID NOT NULL REFERENCES dossiers_declassement(id) ON DELETE CASCADE,
    etape              TEXT NOT NULL,
    date_etape         DATE NOT NULL,
    sens               TEXT,
    reference          TEXT,
    observation        TEXT,
    mode_adjudication  TEXT,
    montant_adjuge_tnd NUMERIC(12, 3),
    saisi_par          UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at         TIMESTAMPTZ,
    deleted_by         UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT etapes_etape_valide CHECK (etape IN (
      'accord_commune', 'avis_domaines', 'avis_controle_technique', 'publicite_legale', 'adjudication', 'sans_suite')),
    CONSTRAINT etapes_sens_valide CHECK (sens IS NULL OR sens IN ('favorable', 'defavorable')),
    -- Un accord ou un avis sans son sens ne dit rien ; une publicité qui en
    -- porterait un ne voudrait rien dire.
    CONSTRAINT etapes_sens_requis CHECK (
      (etape IN ('accord_commune', 'avis_domaines', 'avis_controle_technique')) = (sens IS NOT NULL)),
    CONSTRAINT etapes_mode_adjudication CHECK (
      (etape = 'adjudication') = (mode_adjudication IS NOT NULL)
      AND (mode_adjudication IS NULL OR mode_adjudication IN ('pli_ferme', 'enchere_publique'))),
    CONSTRAINT etapes_montant_adjuge CHECK (
      montant_adjuge_tnd IS NULL OR (etape = 'adjudication' AND montant_adjuge_tnd >= 0)),
    -- Un dossier ne s'abandonne pas sans dire pourquoi.
    CONSTRAINT etapes_motif_sans_suite CHECK (
      etape <> 'sans_suite' OR length(btrim(COALESCE(observation, ''))) >= 5)
);
COMMENT ON TABLE etapes_declassement IS
  'Le circuit d''autorisation d''un dossier de déclassement (diapo 83), une ligne par étape, dans l''ordre que la base impose : accord de la commune, avis des Domaines et du contrôle technique, publicité légale, adjudication. Une étape ne se modifie pas ; la dernière se retire tant que le dossier est en cours.';
COMMENT ON COLUMN etapes_declassement.reference IS
  'Numéro de la décision, du procès-verbal ou de l''avis, tel que le document le porte.';
CREATE UNIQUE INDEX IF NOT EXISTS uq_etape_declassement
  ON etapes_declassement (dossier_id, etape) WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION app.controler_etape_declassement() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_j     date := (now() AT TIME ZONE 'Africa/Tunis')::date;
  v_d     dossiers_declassement;
  v_der   date;
  v_ok    boolean := true;
  v_quoi  text;
BEGIN
  SELECT * INTO v_d FROM dossiers_declassement WHERE id = NEW.dossier_id FOR UPDATE;
  IF v_d.id IS NULL THEN
    RAISE EXCEPTION 'DOSSIER_INCONNU: %', NEW.dossier_id USING ERRCODE = 'check_violation';
  END IF;
  NEW.commune_id := v_d.commune_id;
  IF v_d.statut <> 'en_cours' THEN
    RAISE EXCEPTION 'DOSSIER_CLOS: ce dossier est clos ; aucune étape ne s''y ajoute.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.date_etape > v_j THEN
    RAISE EXCEPTION 'ETAPE_AVENIR: une étape s''inscrit quand elle a eu lieu ; sa date ne peut pas être dans l''avenir.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.date_etape < v_d.date_proposition THEN
    RAISE EXCEPTION 'ETAPE_DATE: une étape ne peut pas précéder la proposition du dossier (%).', to_char(v_d.date_proposition, 'DD/MM/YYYY')
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT max(date_etape) INTO v_der FROM etapes_declassement WHERE dossier_id = NEW.dossier_id AND deleted_at IS NULL;
  IF NEW.date_etape < v_der THEN
    RAISE EXCEPTION 'ETAPE_DATE: une étape ne peut pas précéder la dernière étape inscrite (%).', to_char(v_der, 'DD/MM/YYYY')
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.etape IN ('avis_domaines', 'avis_controle_technique') THEN
    v_ok := EXISTS (SELECT 1 FROM etapes_declassement WHERE dossier_id = NEW.dossier_id AND deleted_at IS NULL
                       AND etape = 'accord_commune' AND sens = 'favorable');
    v_quoi := 'l''accord favorable de l''administration communale';
  ELSIF NEW.etape = 'publicite_legale' THEN
    v_ok := (SELECT count(*) FROM etapes_declassement WHERE dossier_id = NEW.dossier_id AND deleted_at IS NULL
               AND etape IN ('avis_domaines', 'avis_controle_technique') AND sens = 'favorable') = 2;
    v_quoi := 'les avis favorables des Domaines de l''État et du contrôle technique';
  ELSIF NEW.etape = 'adjudication' THEN
    v_ok := EXISTS (SELECT 1 FROM etapes_declassement WHERE dossier_id = NEW.dossier_id AND deleted_at IS NULL
                       AND etape = 'publicite_legale');
    v_quoi := 'la publicité légale';
  END IF;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'ETAPE_PREALABLE: cette étape suppose %.', v_quoi USING ERRCODE = 'check_violation';
  END IF;
  NEW.saisi_par := app.current_user_id();
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_controler_etape_declassement ON etapes_declassement;
CREATE TRIGGER trg_controler_etape_declassement BEFORE INSERT ON etapes_declassement
  FOR EACH ROW EXECUTE FUNCTION app.controler_etape_declassement();

-- L'adjudication et l'abandon closent le dossier. L'engin, lui, reste tel que
-- la commune le déclare : le passer « réformé » est son geste (« À vérifier »
-- le lui rappelle), pas celui de la plateforme.
CREATE OR REPLACE FUNCTION app.clore_dossier_declassement() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
  IF NEW.etape = 'adjudication' THEN
    UPDATE dossiers_declassement SET statut = 'adjuge' WHERE id = NEW.dossier_id;
  ELSIF NEW.etape = 'sans_suite' THEN
    UPDATE dossiers_declassement SET statut = 'sans_suite' WHERE id = NEW.dossier_id;
  END IF;
  RETURN NULL;
END
$$;
DROP TRIGGER IF EXISTS trg_clore_dossier_declassement ON etapes_declassement;
CREATE TRIGGER trg_clore_dossier_declassement AFTER INSERT ON etapes_declassement
  FOR EACH ROW EXECUTE FUNCTION app.clore_dossier_declassement();

-- Une étape ne se modifie pas. Elle se retire (saisie à tort) tant que le
-- dossier est en cours et qu'aucune étape ne s'appuie sur elle.
CREATE OR REPLACE FUNCTION app.proteger_etape_declassement() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_statut text;
  v_dependantes text[];
BEGIN
  IF (to_jsonb(NEW) - 'deleted_at' - 'deleted_by') IS DISTINCT FROM (to_jsonb(OLD) - 'deleted_at' - 'deleted_by')
     OR OLD.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'ETAPE_FIGEE: une étape inscrite ne se modifie pas ; retirez-la et inscrivez-la de nouveau.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT statut INTO v_statut FROM dossiers_declassement WHERE id = OLD.dossier_id;
  IF v_statut <> 'en_cours' THEN
    RAISE EXCEPTION 'DOSSIER_CLOS: ce dossier est clos ; son circuit ne se modifie plus.' USING ERRCODE = 'check_violation';
  END IF;
  v_dependantes := CASE OLD.etape
    WHEN 'accord_commune' THEN ARRAY['avis_domaines', 'avis_controle_technique', 'publicite_legale']
    WHEN 'avis_domaines' THEN ARRAY['publicite_legale']
    WHEN 'avis_controle_technique' THEN ARRAY['publicite_legale']
    ELSE ARRAY[]::text[] END;
  IF EXISTS (SELECT 1 FROM etapes_declassement WHERE dossier_id = OLD.dossier_id AND deleted_at IS NULL
                AND id <> OLD.id AND etape = ANY (v_dependantes)) THEN
    RAISE EXCEPTION 'ETAPE_DEPENDANTE: une étape suivante s''appuie sur celle-ci ; retirez-la d''abord.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_proteger_etape_declassement ON etapes_declassement;
CREATE TRIGGER trg_proteger_etape_declassement BEFORE UPDATE ON etapes_declassement
  FOR EACH ROW EXECUTE FUNCTION app.proteger_etape_declassement();

-- -------------------------------------------------------------------------
-- 5. Les pièces jointes (stockage, migration 041)
-- -------------------------------------------------------------------------
ALTER TABLE fichiers DROP CONSTRAINT IF EXISTS fichiers_usage_valide;
ALTER TABLE fichiers ADD  CONSTRAINT fichiers_usage_valide CHECK (usage IS NULL OR usage IN (
  'reclamation', 'preuve_traitement', 'constat_terrain', 'passage',
  'incident', 'suggestion_point', 'document_projet', 'enlevement',
  'rapport_etude', 'declassement', 'autre'));

CREATE TABLE IF NOT EXISTS pieces_declassement (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id   TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    dossier_id   UUID NOT NULL REFERENCES dossiers_declassement(id) ON DELETE CASCADE,
    fichier_id   UUID NOT NULL REFERENCES fichiers(id) ON DELETE CASCADE,
    nature       TEXT NOT NULL,
    ajoute_par   UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at   TIMESTAMPTZ,
    deleted_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT pieces_nature_valide CHECK (nature IN (
      'facture_acquisition', 'inventaire_depenses', 'rapport_rendement', 'devis_reparation',
      'decision_commune', 'avis_domaines', 'avis_controle_technique', 'publicite', 'pv_adjudication', 'autre'))
);
COMMENT ON TABLE pieces_declassement IS
  'Pièces d''un dossier de déclassement. Obligatoires (diapo 83) : facture d''acquisition, inventaire des dépenses depuis l''acquisition, rapport de rendement, coût estimatif de la réparation — les deux du milieu, SIIPI les calcule quand les registres sont tenus. Une pièce d''un dossier clos ne se retire plus.';
CREATE UNIQUE INDEX IF NOT EXISTS uq_piece_declassement
  ON pieces_declassement (dossier_id, fichier_id) WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION app.controler_piece_declassement() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_d dossiers_declassement;
BEGIN
  SELECT * INTO v_d FROM dossiers_declassement WHERE id = COALESCE(NEW.dossier_id, OLD.dossier_id);
  IF v_d.id IS NULL THEN
    RAISE EXCEPTION 'DOSSIER_INCONNU: %', NEW.dossier_id USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.commune_id := v_d.commune_id;
    IF NOT EXISTS (SELECT 1 FROM fichiers WHERE id = NEW.fichier_id AND commune_id = v_d.commune_id AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'PIECE_FICHIER: le fichier n''existe pas ou n''appartient pas à la commune du dossier.' USING ERRCODE = 'check_violation';
    END IF;
    NEW.ajoute_par := app.current_user_id();
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - 'deleted_at' - 'deleted_by') IS DISTINCT FROM (to_jsonb(OLD) - 'deleted_at' - 'deleted_by') THEN
    RAISE EXCEPTION 'PIECE_FIGEE: une pièce jointe ne se modifie pas ; retirez-la et joignez la bonne.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_d.statut <> 'en_cours' THEN
    RAISE EXCEPTION 'DOSSIER_CLOS: les pièces d''un dossier clos ne se retirent plus.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_controler_piece_declassement ON pieces_declassement;
CREATE TRIGGER trg_controler_piece_declassement BEFORE INSERT OR UPDATE ON pieces_declassement
  FOR EACH ROW EXECUTE FUNCTION app.controler_piece_declassement();

-- Et le fichier d'une pièce ne se retire pas par la porte des fichiers : le
-- dossier pointerait vers des octets que plus personne ne peut lire.
CREATE OR REPLACE FUNCTION app.proteger_fichier_piece() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
     AND EXISTS (SELECT 1 FROM pieces_declassement WHERE fichier_id = OLD.id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'FICHIER_PIECE_DECLASSEMENT: ce fichier est une pièce d''un dossier de déclassement ; retirez d''abord la pièce du dossier.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_proteger_fichier_piece ON fichiers;
CREATE TRIGGER trg_proteger_fichier_piece BEFORE UPDATE OF deleted_at ON fichiers
  FOR EACH ROW EXECUTE FUNCTION app.proteger_fichier_piece();

-- -------------------------------------------------------------------------
-- 6. « À vérifier »
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.incoherences_declassement(p_commune text)
  RETURNS TABLE (gravite text, domaine text, sujet text, sujet_id text, constat text, quoi_faire text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  WITH du_jour AS (
    SELECT * FROM app.constat_declassement(p_commune, extract(year FROM (now() AT TIME ZONE 'Africa/Tunis'))::int)
  )
  SELECT 'avertissement', 'declassement', v.registration, d.id::text,
         format('Adjugé le %s, l''engin figure toujours au parc (état « %s »).',
                to_char((SELECT max(e.date_etape) FROM etapes_declassement e
                          WHERE e.dossier_id = d.id AND e.etape = 'adjudication' AND e.deleted_at IS NULL), 'DD/MM/YYYY'),
                v.etat),
         'Passer l''engin à l''état « réformé » : tant qu''il ne l''est pas, il compte dans le taux de disponibilité et dans la valeur du parc.'
    FROM dossiers_declassement d JOIN vehicules v ON v.id = d.vehicule_id
   WHERE d.commune_id = p_commune AND d.statut = 'adjuge' AND v.deleted_at IS NULL AND v.etat <> 'reforme'
     AND app.can_write_commune(p_commune)
  UNION ALL
  SELECT 'information', 'declassement', v.registration, v.id,
         'Engin « à réformer » sans dossier de déclassement.',
         'Constituer le dossier (référentiel, diapo 83) : facture d''acquisition, inventaire des dépenses, rapport de rendement, coût estimatif de la réparation. Sans dossier, l''engin ne sortira pas de l''inventaire.'
    FROM vehicules v
   WHERE v.commune_id = p_commune AND v.deleted_at IS NULL AND v.etat = 'a_reformer'
     AND NOT EXISTS (SELECT 1 FROM dossiers_declassement d
                      WHERE d.vehicule_id = v.id AND d.statut IN ('en_cours', 'adjuge'))
     AND app.can_write_commune(p_commune)
  UNION ALL
  SELECT 'information', 'declassement', c.registration, d.id::text,
         format('Motif « dépenses ≥ 80 %% du prix d''acquisition » invoqué ; le cumul enregistré est de %s %% (%s TND pour une valeur d''achat de %s TND).',
                c.part_depenses_pct, c.cumul_depenses_tnd, c.valeur_achat_tnd),
         'Compléter l''inventaire des dépenses de l''engin (carnet d''entretien), ou retirer ce motif du dossier tant qu''il n''est pas engagé dans le circuit.'
    FROM dossiers_declassement d JOIN du_jour c ON c.vehicule_id = d.vehicule_id
   WHERE d.commune_id = p_commune AND d.statut = 'en_cours' AND 'depenses_80' = ANY (d.motifs)
     AND c.seuil_80 = 'non_atteint'
$$;
GRANT EXECUTE ON FUNCTION app.incoherences_declassement(text) TO siipi_app;

-- Le panneau « À vérifier » : définition reprise de la migration 058, la
-- famille déclassement en plus.
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
    ) tout
   ORDER BY CASE gravite WHEN 'bloquant' THEN 0
                         WHEN 'avertissement' THEN 1
                         ELSE 2 END,
            domaine, sujet
$$;
GRANT EXECUTE ON FUNCTION app.incoherences_commune(text) TO siipi_app;

-- -------------------------------------------------------------------------
-- 7. Cloisonnement, journal, jumeau numérique
-- -------------------------------------------------------------------------
-- Les périodes d'immobilisation se lisent comme l'état du parc (la commune,
-- ses prestataires, la FNCT). Un dossier porte des coûts : la commune et la
-- FNCT, comme le carnet d'entretien ; seul l'admin de la commune l'instruit.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['immobilisations_engins', 'dossiers_declassement', 'etapes_declassement', 'pieces_declassement'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'trg_audit_' || t, t);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement()', 'trg_audit_' || t, t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS provenance TEXT NOT NULL DEFAULT ''reel''', t);
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', t, t || '_provenance_valide');
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (provenance IN (''reel'', ''simule''))', t, t || '_provenance_valide');
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'trg_provenance_' || t, t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF commune_id, provenance ON %I
                      FOR EACH ROW EXECUTE FUNCTION app.controler_provenance()', 'trg_provenance_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_update', t);
  END LOOP;
END
$$;

CREATE POLICY immobilisations_engins_select ON immobilisations_engins FOR SELECT
  USING (deleted_at IS NULL AND app.can_read_commune(commune_id));
CREATE POLICY immobilisations_engins_insert ON immobilisations_engins FOR INSERT
  WITH CHECK (app.can_write_commune(commune_id));
CREATE POLICY immobilisations_engins_update ON immobilisations_engins FOR UPDATE
  USING (deleted_at IS NULL AND app.can_write_commune(commune_id))
  WITH CHECK (app.can_write_commune(commune_id));
GRANT SELECT, INSERT, UPDATE ON immobilisations_engins TO siipi_app;

CREATE POLICY dossiers_declassement_select ON dossiers_declassement FOR SELECT
  USING (app.can_write_commune(commune_id));
CREATE POLICY dossiers_declassement_insert ON dossiers_declassement FOR INSERT
  WITH CHECK (app.peut_instruire_declassement(commune_id));
CREATE POLICY dossiers_declassement_update ON dossiers_declassement FOR UPDATE
  USING (app.peut_instruire_declassement(commune_id))
  WITH CHECK (app.peut_instruire_declassement(commune_id));
-- Le statut et le constat ne s'écrivent pas par l'application : seul le
-- circuit pose le premier, seule la base calcule le second.
REVOKE UPDATE ON dossiers_declassement FROM siipi_app;
GRANT SELECT, INSERT ON dossiers_declassement TO siipi_app;
GRANT UPDATE (motifs, expose, cout_reparation_estime_tnd) ON dossiers_declassement TO siipi_app;

CREATE POLICY etapes_declassement_select ON etapes_declassement FOR SELECT
  USING (deleted_at IS NULL AND app.can_write_commune(commune_id));
CREATE POLICY etapes_declassement_insert ON etapes_declassement FOR INSERT
  WITH CHECK (app.peut_instruire_declassement(commune_id));
CREATE POLICY etapes_declassement_update ON etapes_declassement FOR UPDATE
  USING (deleted_at IS NULL AND app.peut_instruire_declassement(commune_id))
  WITH CHECK (app.peut_instruire_declassement(commune_id));

CREATE POLICY pieces_declassement_select ON pieces_declassement FOR SELECT
  USING (deleted_at IS NULL AND app.can_write_commune(commune_id));
CREATE POLICY pieces_declassement_insert ON pieces_declassement FOR INSERT
  WITH CHECK (app.peut_instruire_declassement(commune_id));
CREATE POLICY pieces_declassement_update ON pieces_declassement FOR UPDATE
  USING (deleted_at IS NULL AND app.peut_instruire_declassement(commune_id))
  WITH CHECK (app.peut_instruire_declassement(commune_id));

-- Une étape ou une pièce se retire par app.supprimer(), jamais par UPDATE direct.
GRANT SELECT, INSERT ON etapes_declassement, pieces_declassement TO siipi_app;
REVOKE UPDATE, DELETE, TRUNCATE ON etapes_declassement, pieces_declassement FROM siipi_app;
REVOKE DELETE, TRUNCATE ON immobilisations_engins, dossiers_declassement FROM siipi_app;

-- -------------------------------------------------------------------------
-- 8. Les immobilisations déjà connues
-- -------------------------------------------------------------------------
-- Un engin aujourd'hui en panne dont la commune a daté la panne ouvre sa
-- période. Sans date (l'inventaire de Dar Chaabane n'en donne aucune), rien
-- n'est ouvert : le rapport de rendement dira « début inconnu ».
INSERT INTO immobilisations_engins (commune_id, vehicule_id, debut, motif, origine)
SELECT v.commune_id, v.id, LEAST(v.etat_depuis, (now() AT TIME ZONE 'Africa/Tunis')::date), v.motif_immobilisation, 'etat_engin'
  FROM vehicules v
 WHERE v.deleted_at IS NULL AND v.etat IN ('en_panne', 'a_reformer') AND v.etat_depuis IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM immobilisations_engins i WHERE i.vehicule_id = v.id);

-- -------------------------------------------------------------------------
-- 9. Retrait logique
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
                     'immobilisations_engins', 'etapes_declassement', 'pieces_declassement') THEN
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
