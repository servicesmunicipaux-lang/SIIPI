-- ===========================================================================
-- Migration 046 — Jalon 5 : la maintenance des engins (GMAO, TDR §3.2.2)
--
-- B2.2 — l'historique des interventions : date, type, coût, kilométrage.
-- B2.3 — les alertes d'entretien : un plan (« vidange tous les 10 000 km ou
--        tous les six mois ») et, pour chaque plan, une échéance calculée
--        depuis la dernière intervention du même type.
--
-- LE KILOMÉTRAGE MANQUAIT. La fiche d'un engin (migration 032) ne portait
-- aucun compteur : une alerte « au kilomètre » n'avait rien à comparer. Il est
-- ajouté ici, avec sa date de relevé — un kilométrage sans date ne permet pas
-- de savoir s'il est encore vrai. Il se met à jour de lui-même quand une
-- intervention en porte un plus élevé, et ne recule jamais par ce biais : une
-- intervention ancienne saisie après coup ne doit pas rajeunir le compteur.
--
-- L'ÉCHÉANCE N'EST PAS STOCKÉE. Elle se calcule (app.echeances_entretien) à
-- partir de la dernière intervention : une échéance écrite en base serait une
-- seconde vérité, qu'une intervention saisie ou retirée laisserait fausse.
-- C'est ce qui fait qu'une alerte disparaît d'elle-même dès que l'intervention
-- est saisie — le test de validation du jalon.
--
-- QUI VOIT QUOI. Des coûts et des pannes : la commune et la FNCT. Un
-- prestataire voit les engins affectés à ses zones (migration 027), pas leur
-- carnet d'entretien ni ce qu'il coûte à la commune.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Le compteur
-- ---------------------------------------------------------------------------

ALTER TABLE vehicules ADD COLUMN IF NOT EXISTS kilometrage INTEGER;
ALTER TABLE vehicules ADD COLUMN IF NOT EXISTS kilometrage_le DATE;

ALTER TABLE vehicules DROP CONSTRAINT IF EXISTS vehicules_kilometrage_positif;
ALTER TABLE vehicules ADD  CONSTRAINT vehicules_kilometrage_positif CHECK (kilometrage IS NULL OR kilometrage >= 0);

COMMENT ON COLUMN vehicules.kilometrage IS
  'Dernier kilométrage connu (ou heures moteur pour un engin sans odomètre, à préciser dans les notes). Relevé à l''écran, ou relevé à la hausse par une intervention qui en porte un plus élevé.';
COMMENT ON COLUMN vehicules.kilometrage_le IS
  'Date du dernier relevé : un kilométrage sans date ne dit pas s''il est encore vrai.';

-- ---------------------------------------------------------------------------
-- 2. Les interventions (B2.2)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS interventions_maintenance (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id         TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    vehicule_id        TEXT NOT NULL REFERENCES vehicules(id) ON DELETE CASCADE,

    date_intervention  DATE NOT NULL,
    type               TEXT NOT NULL,
    -- Préventive : prévue par un plan d'entretien. Corrective : une panne.
    -- La distinction nourrira l'axe 3 des KPI (part du curatif dans le coût).
    nature             TEXT NOT NULL DEFAULT 'corrective',
    description        TEXT,
    -- En dinars, au millime : la monnaie tunisienne compte trois décimales.
    cout_tnd           NUMERIC(12, 3),
    kilometrage        INTEGER,
    -- Le garage ou l'atelier, déclaré en texte libre comme l'auteur d'un rapport.
    prestataire        TEXT,

    created_by         UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at         TIMESTAMPTZ,
    deleted_by         UUID REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT interventions_type_valide CHECK (type IN (
      'vidange', 'revision', 'pneumatiques', 'freinage', 'hydraulique',
      'electricite', 'carrosserie', 'controle_technique', 'reparation', 'autre')),
    CONSTRAINT interventions_nature_valide CHECK (nature IN ('preventive', 'corrective')),
    CONSTRAINT interventions_cout_positif CHECK (cout_tnd IS NULL OR cout_tnd >= 0),
    CONSTRAINT interventions_km_positif CHECK (kilometrage IS NULL OR kilometrage >= 0)
);

CREATE INDEX IF NOT EXISTS idx_interventions_vehicule
  ON interventions_maintenance (vehicule_id, type, date_intervention DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_interventions_commune
  ON interventions_maintenance (commune_id, date_intervention DESC) WHERE deleted_at IS NULL;

COMMENT ON TABLE interventions_maintenance IS
  'Carnet d''entretien des engins (TDR §3.2.2, B2.2). Une ligne par intervention, préventive ou corrective, avec son coût et le kilométrage relevé. Lecture et écriture : la commune et la FNCT.';

-- ---------------------------------------------------------------------------
-- 3. Les plans d'entretien (B2.3)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS plans_entretien (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id         TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    vehicule_id        TEXT NOT NULL REFERENCES vehicules(id) ON DELETE CASCADE,

    -- Le type d'intervention qui « solde » le plan : la dernière intervention
    -- de ce type sur cet engin fait repartir le compte.
    type               TEXT NOT NULL,
    libelle            TEXT,
    intervalle_km      INTEGER,
    intervalle_jours   INTEGER,
    -- « Avant l'échéance » : à partir de combien de kilomètres ou de jours
    -- restants l'entretien passe « à prévoir ».
    seuil_alerte_km    INTEGER NOT NULL DEFAULT 1000,
    seuil_alerte_jours INTEGER NOT NULL DEFAULT 30,
    -- Point de départ tant qu'aucune intervention de ce type n'est saisie :
    -- « dernière vidange le 3 mars, à 182 000 km ». À défaut, la date de
    -- création du plan et le kilométrage connu à ce moment.
    reference_date     DATE NOT NULL DEFAULT CURRENT_DATE,
    reference_km       INTEGER,

    created_by         UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at         TIMESTAMPTZ,
    deleted_by         UUID REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT plans_type_valide CHECK (type IN (
      'vidange', 'revision', 'pneumatiques', 'freinage', 'hydraulique',
      'electricite', 'carrosserie', 'controle_technique', 'reparation', 'autre')),
    -- Un plan sans intervalle ne déclencherait jamais rien.
    CONSTRAINT plans_un_intervalle CHECK (intervalle_km IS NOT NULL OR intervalle_jours IS NOT NULL),
    CONSTRAINT plans_intervalles_positifs CHECK (
      (intervalle_km IS NULL OR intervalle_km > 0) AND (intervalle_jours IS NULL OR intervalle_jours > 0)),
    CONSTRAINT plans_seuils_positifs CHECK (seuil_alerte_km >= 0 AND seuil_alerte_jours >= 0),
    CONSTRAINT plans_reference_km_positive CHECK (reference_km IS NULL OR reference_km >= 0)
);

CREATE INDEX IF NOT EXISTS idx_plans_entretien_commune
  ON plans_entretien (commune_id) WHERE deleted_at IS NULL;

COMMENT ON TABLE plans_entretien IS
  'Plans d''entretien périodique (B2.3) : un type d''intervention, un intervalle en kilomètres et/ou en jours, un seuil d''alerte. L''échéance n''est pas stockée : elle se calcule depuis la dernière intervention du même type (app.echeances_entretien).';

-- ---------------------------------------------------------------------------
-- 4. Garde-fous en base : une intervention ou un plan appartient à la commune
--    de son engin. Sans cela, une commune pourrait inscrire une panne, et un
--    coût, sur l'engin d'une autre. SECURITY DEFINER : la vérification doit
--    voir l'engin même si la RLS le cache à l'appelant.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.controler_commune_engin() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_commune text;
BEGIN
  SELECT commune_id INTO v_commune FROM vehicules WHERE id = NEW.vehicule_id AND deleted_at IS NULL;
  IF v_commune IS NULL THEN
    RAISE EXCEPTION 'ENGIN_INCONNU: %', NEW.vehicule_id;
  END IF;
  IF v_commune <> NEW.commune_id THEN
    RAISE EXCEPTION 'ENGIN_AUTRE_COMMUNE' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_interventions_commune ON interventions_maintenance;
CREATE TRIGGER trg_interventions_commune BEFORE INSERT OR UPDATE OF vehicule_id, commune_id ON interventions_maintenance
  FOR EACH ROW EXECUTE FUNCTION app.controler_commune_engin();
DROP TRIGGER IF EXISTS trg_plans_commune ON plans_entretien;
CREATE TRIGGER trg_plans_commune BEFORE INSERT OR UPDATE OF vehicule_id, commune_id ON plans_entretien
  FOR EACH ROW EXECUTE FUNCTION app.controler_commune_engin();

-- Le compteur de l'engin suit, à la hausse seulement, les kilométrages saisis.
CREATE OR REPLACE FUNCTION app.relever_kilometrage() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
  IF NEW.kilometrage IS NOT NULL AND NEW.deleted_at IS NULL THEN
    UPDATE vehicules
       SET kilometrage = NEW.kilometrage,
           kilometrage_le = NEW.date_intervention
     WHERE id = NEW.vehicule_id
       AND (kilometrage IS NULL OR kilometrage < NEW.kilometrage);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_interventions_kilometrage ON interventions_maintenance;
CREATE TRIGGER trg_interventions_kilometrage AFTER INSERT OR UPDATE OF kilometrage ON interventions_maintenance
  FOR EACH ROW EXECUTE FUNCTION app.relever_kilometrage();

DROP TRIGGER IF EXISTS trg_interventions_updated_at ON interventions_maintenance;
CREATE TRIGGER trg_interventions_updated_at BEFORE UPDATE ON interventions_maintenance
  FOR EACH ROW EXECUTE FUNCTION zones_collecte_set_updated_at();
DROP TRIGGER IF EXISTS trg_plans_updated_at ON plans_entretien;
CREATE TRIGGER trg_plans_updated_at BEFORE UPDATE ON plans_entretien
  FOR EACH ROW EXECUTE FUNCTION zones_collecte_set_updated_at();

DROP TRIGGER IF EXISTS trg_audit_interventions ON interventions_maintenance;
CREATE TRIGGER trg_audit_interventions AFTER INSERT OR UPDATE OR DELETE ON interventions_maintenance
  FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement();
DROP TRIGGER IF EXISTS trg_audit_plans ON plans_entretien;
CREATE TRIGGER trg_audit_plans AFTER INSERT OR UPDATE OR DELETE ON plans_entretien
  FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement();

-- ---------------------------------------------------------------------------
-- 5. Cloisonnement : la commune et la FNCT.
-- ---------------------------------------------------------------------------

ALTER TABLE interventions_maintenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE interventions_maintenance FORCE  ROW LEVEL SECURITY;
ALTER TABLE plans_entretien ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans_entretien FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS interventions_select ON interventions_maintenance;
CREATE POLICY interventions_select ON interventions_maintenance FOR SELECT
  USING (deleted_at IS NULL AND app.can_write_commune(commune_id));
DROP POLICY IF EXISTS interventions_insert ON interventions_maintenance;
CREATE POLICY interventions_insert ON interventions_maintenance FOR INSERT
  WITH CHECK (app.can_write_commune(commune_id));
DROP POLICY IF EXISTS interventions_update ON interventions_maintenance;
CREATE POLICY interventions_update ON interventions_maintenance FOR UPDATE
  USING (deleted_at IS NULL AND app.can_write_commune(commune_id))
  WITH CHECK (app.can_write_commune(commune_id));

DROP POLICY IF EXISTS plans_select ON plans_entretien;
CREATE POLICY plans_select ON plans_entretien FOR SELECT
  USING (deleted_at IS NULL AND app.can_write_commune(commune_id));
DROP POLICY IF EXISTS plans_insert ON plans_entretien;
CREATE POLICY plans_insert ON plans_entretien FOR INSERT
  WITH CHECK (app.can_write_commune(commune_id));
DROP POLICY IF EXISTS plans_update ON plans_entretien;
CREATE POLICY plans_update ON plans_entretien FOR UPDATE
  USING (deleted_at IS NULL AND app.can_write_commune(commune_id))
  WITH CHECK (app.can_write_commune(commune_id));

GRANT SELECT, INSERT, UPDATE ON interventions_maintenance, plans_entretien TO siipi_app;
REVOKE DELETE, TRUNCATE ON interventions_maintenance, plans_entretien FROM siipi_app;

-- ---------------------------------------------------------------------------
-- 6. Les échéances (B2.3)
--
-- SECURITY INVOKER (le défaut) : la fonction lit sous la RLS de l'appelant, et
-- n'ouvre donc rien que les tables n'ouvraient pas déjà.
--
-- Pour chaque plan actif d'un engin qui n'est pas réformé :
--   - dernière exécution = la dernière intervention du même type sur cet
--     engin, postérieure ou égale à la date de référence du plan ; à défaut,
--     la référence du plan elle-même ;
--   - échéance = dernière exécution + intervalle (en jours et/ou en km) ;
--   - statut = « en_retard » si l'une des échéances est dépassée,
--     « a_prevoir » si l'une entre dans le seuil d'alerte, « a_verifier »
--     si l'échéance au kilomètre ne peut pas être évaluée (pas de relevé de
--     compteur), « a_jour » sinon. Le premier des deux compteurs à échoir
--     décide.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.echeances_entretien(p_commune text)
  RETURNS TABLE (
    plan_id          uuid,
    vehicule_id      text,
    registration     text,
    type_engin       text,
    type             text,
    libelle          text,
    derniere_date    date,
    dernier_km       integer,
    km_actuel        integer,
    km_releve_le     date,
    echeance_date    date,
    echeance_km      integer,
    jours_restants   integer,
    km_restants      integer,
    statut           text
  )
  LANGUAGE sql STABLE SET search_path = public, pg_temp AS
$$
  WITH base AS (
    SELECT p.*, v.registration, v.type AS type_engin, v.kilometrage AS km_actuel, v.kilometrage_le,
           derniere.date_intervention, derniere.kilometrage AS km_intervention
      FROM plans_entretien p
      JOIN vehicules v ON v.id = p.vehicule_id AND v.deleted_at IS NULL AND v.etat <> 'reforme'
      LEFT JOIN LATERAL (
        SELECT i.date_intervention, i.kilometrage
          FROM interventions_maintenance i
         WHERE i.vehicule_id = p.vehicule_id
           AND i.type = p.type
           AND i.deleted_at IS NULL
           AND i.date_intervention >= p.reference_date
         ORDER BY i.date_intervention DESC, i.kilometrage DESC NULLS LAST
         LIMIT 1
      ) derniere ON true
     WHERE p.deleted_at IS NULL AND p.commune_id = p_commune
  ),
  calcul AS (
    SELECT b.*,
           COALESCE(b.date_intervention, b.reference_date) AS d_date,
           -- Une intervention saisie SANS kilométrage rend l'échéance au
           -- kilomètre inconnue (l'écran le dit) : repartir de l'ancienne
           -- référence la ferait tomber trop tôt, à partir d'un point faux.
           CASE WHEN b.date_intervention IS NULL THEN b.reference_km ELSE b.km_intervention END AS d_km
      FROM base b
  ),
  echeance AS (
    SELECT c.*,
           CASE WHEN c.intervalle_jours IS NOT NULL THEN c.d_date + c.intervalle_jours END AS e_date,
           CASE WHEN c.intervalle_km IS NOT NULL AND c.d_km IS NOT NULL THEN c.d_km + c.intervalle_km END AS e_km
      FROM calcul c
  ),
  statut AS (
    SELECT e.*,
           CASE
             WHEN (e.e_date IS NOT NULL AND e.e_date < CURRENT_DATE)
               OR (e.e_km IS NOT NULL AND e.km_actuel IS NOT NULL AND e.km_actuel > e.e_km)
               THEN 'en_retard'
             WHEN (e.e_date IS NOT NULL AND e.e_date - CURRENT_DATE <= e.seuil_alerte_jours)
               OR (e.e_km IS NOT NULL AND e.km_actuel IS NOT NULL AND e.e_km - e.km_actuel <= e.seuil_alerte_km)
               THEN 'a_prevoir'
             -- Un plan au kilomètre qu'on ne peut pas évaluer — aucun relevé de
             -- compteur, ou dernière intervention saisie sans kilométrage — ne
             -- se dit pas « à jour » : ce serait rassurer sans rien savoir.
             WHEN e.intervalle_km IS NOT NULL AND (e.e_km IS NULL OR e.km_actuel IS NULL)
               THEN 'a_verifier'
             ELSE 'a_jour'
           END AS s
      FROM echeance e
  )
  SELECT e.id, e.vehicule_id, e.registration, e.type_engin, e.type, e.libelle,
         e.d_date, e.d_km, e.km_actuel, e.kilometrage_le,
         e.e_date, e.e_km,
         (e.e_date - CURRENT_DATE)::integer,
         CASE WHEN e.e_km IS NOT NULL AND e.km_actuel IS NOT NULL THEN e.e_km - e.km_actuel END,
         e.s
    FROM statut e
   ORDER BY array_position(ARRAY['en_retard', 'a_prevoir', 'a_verifier', 'a_jour'], e.s),
            e.e_date NULLS LAST, e.registration
$$;

COMMENT ON FUNCTION app.echeances_entretien(text) IS
  'Échéance de chaque plan d''entretien d''une commune, calculée depuis la dernière intervention du même type. Lit sous la RLS de l''appelant. Statut : en_retard, a_prevoir (dans le seuil d''alerte), a_verifier (échéance au kilomètre non évaluable faute de relevé), a_jour.';

GRANT EXECUTE ON FUNCTION app.echeances_entretien(text) TO siipi_app;

-- ---------------------------------------------------------------------------
-- 7. Retrait logique : app.supprimer() s'ouvre aux interventions et aux plans.
-- ---------------------------------------------------------------------------

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
                     'interventions_maintenance', 'plans_entretien') THEN
    RAISE EXCEPTION 'TABLE_NON_SUPPRIMABLE: %', p_table;
  END IF;

  EXECUTE format('SELECT commune_id FROM %I WHERE id::text = $1 AND deleted_at IS NULL', p_table)
     INTO v_commune USING p_id;

  IF v_commune IS NULL THEN
    RETURN false;
  END IF;

  IF NOT app.can_write_commune(v_commune) THEN
    RAISE EXCEPTION 'ACCES_REFUSE' USING ERRCODE = 'insufficient_privilege';
  END IF;

  EXECUTE format('UPDATE %I SET deleted_at = now(), deleted_by = $2 WHERE id::text = $1', p_table)
    USING p_id, app.current_user_id();

  RETURN true;
END;
$fn$;

GRANT EXECUTE ON FUNCTION app.supprimer(text, text) TO siipi_app;
