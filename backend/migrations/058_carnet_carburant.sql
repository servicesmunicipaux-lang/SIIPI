-- =========================================================================
-- 058 — Carnet de bord, bons de carburant, quota et ratio de consommation
-- (lot 16.3). Référentiel du dépôt municipal § 1.1-1.3 (diapos 38, 42-45, 52).
--
-- Le carnet de bord est « le premier manque à combler » : sans lui, aucun
-- coût par engin n'est calculable. Le référentiel en tire le ratio mensuel
--     consommation / (kilomètres parcourus ou heures de fonctionnement)
-- que SIIPI exprime d'abord en LITRES AUX 100 KM (L/100 km), l'unité que lit
-- un chef de parc ; en litres par heure pour les engins à compteur horaire.
--
--   1. `carnets_de_bord` : une sortie par engin et par séance, compteur à la
--      sortie et au retour. La distance (ou la durée) parcourue est une
--      colonne CALCULÉE par la base — jamais saisie, donc jamais arrangée.
--   2. Les bons de carburant passent par le registre scellé du lot 16.2 :
--      `app.emettre_bon_carburant()` émet le bon numéroté ET enregistre le
--      plein, dans la même transaction. Annuler le bon retire le plein ; un
--      plein sous bon ne se retire pas autrement.
--   3. `quotas_carburant` : la quantité mensuelle allouée à chaque engin,
--      datée — un quota change à une date, il ne se réécrit pas.
--   4. `app.consommation_engins()` : par engin et par mois, litres, distance,
--      L/100 km, écart au quota. Une source absente donne NULL, jamais 0
--      (règle d'or 1.1) : sans carnet, pas de ratio ; sans quota, pas d'écart.
--   5. « À vérifier » : l'écart au quota, le compteur qui recule, la sortie
--      jamais rentrée. La plateforme CONSTATE : le référentiel lit une hausse
--      de consommation d'abord comme un indicateur d'avarie (diapo 42), pas
--      comme un abus. Aucun ratio par chauffeur, aucun classement.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. L'unité du compteur de chaque engin
-- -------------------------------------------------------------------------
-- Les engins lourds de chantier ont un compteur horaire : c'est le point de
-- départ, posé UNE fois, à la création de la colonne. Une migration rejouée
-- ne doit pas écraser ce que la commune a corrigé engin par engin.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'vehicules' AND column_name = 'unite_compteur') THEN
    ALTER TABLE vehicules ADD COLUMN unite_compteur TEXT NOT NULL DEFAULT 'km';
    UPDATE vehicules SET unite_compteur = 'heures' WHERE categorie = 'engin_lourd';
  END IF;
END
$$;
ALTER TABLE vehicules DROP CONSTRAINT IF EXISTS vehicules_unite_compteur;
ALTER TABLE vehicules ADD CONSTRAINT vehicules_unite_compteur CHECK (unite_compteur IN ('km', 'heures'));
COMMENT ON COLUMN vehicules.unite_compteur IS
  'Ce que mesure le compteur de l''engin : km (camions, bennes, tracteurs routiers) ou heures (chargeuses, niveleuses…). Décide du ratio : L/100 km ou L/heure. Modifiable par la commune.';

-- -------------------------------------------------------------------------
-- 2. Le carnet de bord
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS carnets_de_bord (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id       TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    vehicule_id      TEXT NOT NULL REFERENCES vehicules(id) ON DELETE CASCADE,
    jour             DATE NOT NULL,
    seance           TEXT NOT NULL CHECK (seance IN ('matin', 'apres_midi', 'nuit')),
    chauffeur_id     UUID REFERENCES personnel(id) ON DELETE SET NULL,
    circuit_id       UUID REFERENCES circuits(id) ON DELETE SET NULL,
    heure_sortie     TIME,
    heure_retour     TIME,
    compteur_sortie  NUMERIC(12, 1) NOT NULL CHECK (compteur_sortie >= 0),
    compteur_retour  NUMERIC(12, 1),
    parcouru         NUMERIC(12, 1) GENERATED ALWAYS AS (compteur_retour - compteur_sortie) STORED,
    bon_pesee_numero TEXT,
    tonnage_t        NUMERIC(8, 3) CHECK (tonnage_t IS NULL OR tonnage_t >= 0),
    observation      TEXT,
    saisi_par        UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at       TIMESTAMPTZ,
    deleted_by       UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT carnets_compteur_retour CHECK (compteur_retour IS NULL OR compteur_retour >= compteur_sortie)
);
COMMENT ON TABLE carnets_de_bord IS
  'Carnet de bord (دفتر الجولان, référentiel diapo 38) : une ligne par engin et par séance, rempli à la sortie et au retour. Source du ratio de consommation (L/100 km) et des responsabilités en cas d''incident.';
COMMENT ON COLUMN carnets_de_bord.parcouru IS
  'Kilomètres (ou heures, selon vehicules.unite_compteur) parcourus pendant la séance. CALCULÉ par la base depuis les deux compteurs : jamais saisi.';
COMMENT ON COLUMN carnets_de_bord.compteur_retour IS
  'Vide tant que l''engin n''est pas rentré. Jamais inférieur au compteur de sortie.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_carnet_seance
  ON carnets_de_bord (vehicule_id, jour, seance) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_carnets_commune_jour ON carnets_de_bord (commune_id, jour) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_carnets_commune ON carnets_de_bord;
CREATE TRIGGER trg_carnets_commune BEFORE INSERT OR UPDATE OF vehicule_id, commune_id ON carnets_de_bord
  FOR EACH ROW EXECUTE FUNCTION app.controler_commune_engin();

-- Le chauffeur et le circuit d'une sortie appartiennent à la commune de
-- l'engin : sinon le carnet attribuerait une responsabilité à quelqu'un
-- d'une autre commune.
CREATE OR REPLACE FUNCTION app.controler_carnet() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
  IF NEW.chauffeur_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM personnel WHERE id = NEW.chauffeur_id AND commune_id = NEW.commune_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'CARNET_CHAUFFEUR: le chauffeur n''appartient pas à la commune de l''engin.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.circuit_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM circuits WHERE id = NEW.circuit_id AND commune_id = NEW.commune_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'CARNET_CIRCUIT: le circuit n''appartient pas à la commune de l''engin.' USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_controler_carnet ON carnets_de_bord;
CREATE TRIGGER trg_controler_carnet BEFORE INSERT OR UPDATE ON carnets_de_bord
  FOR EACH ROW EXECUTE FUNCTION app.controler_carnet();

-- Le compteur de l'engin suit le carnet, à la hausse seulement, comme il suit
-- déjà les pleins et l'entretien. Pour les seuls compteurs kilométriques :
-- un compteur horaire n'est pas un kilométrage.
CREATE OR REPLACE FUNCTION app.relever_compteur_carnet() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
  IF NEW.deleted_at IS NULL THEN
    UPDATE vehicules
       SET kilometrage = GREATEST(NEW.compteur_sortie, COALESCE(NEW.compteur_retour, NEW.compteur_sortie))::integer,
           kilometrage_le = NEW.jour
     WHERE id = NEW.vehicule_id AND unite_compteur = 'km'
       AND (kilometrage IS NULL OR kilometrage < GREATEST(NEW.compteur_sortie, COALESCE(NEW.compteur_retour, NEW.compteur_sortie)));
  END IF;
  RETURN NULL;
END
$$;
DROP TRIGGER IF EXISTS trg_relever_compteur_carnet ON carnets_de_bord;
CREATE TRIGGER trg_relever_compteur_carnet AFTER INSERT OR UPDATE OF compteur_sortie, compteur_retour ON carnets_de_bord
  FOR EACH ROW EXECUTE FUNCTION app.relever_compteur_carnet();

-- -------------------------------------------------------------------------
-- 3. Le quota mensuel
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quotas_carburant (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id   TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    vehicule_id  TEXT NOT NULL REFERENCES vehicules(id) ON DELETE CASCADE,
    litres_mois  NUMERIC(10, 1) NOT NULL CHECK (litres_mois > 0 AND litres_mois < 100000),
    depuis       DATE NOT NULL,
    saisi_par    UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at   TIMESTAMPTZ,
    deleted_by   UUID REFERENCES users(id) ON DELETE SET NULL
);
COMMENT ON TABLE quotas_carburant IS
  'Quota mensuel de carburant par engin (référentiel diapos 43-44), daté : le quota d''un mois est celui en vigueur au premier jour du mois. Un nouveau quota s''ajoute avec sa date ; l''ancien reste, pour relire les mois passés.';
CREATE UNIQUE INDEX IF NOT EXISTS uq_quota_engin_depuis
  ON quotas_carburant (vehicule_id, depuis) WHERE deleted_at IS NULL;
DROP TRIGGER IF EXISTS trg_quotas_commune ON quotas_carburant;
CREATE TRIGGER trg_quotas_commune BEFORE INSERT OR UPDATE OF vehicule_id, commune_id ON quotas_carburant
  FOR EACH ROW EXECUTE FUNCTION app.controler_commune_engin();

-- -------------------------------------------------------------------------
-- 4. Les bons de carburant, par le registre scellé
-- -------------------------------------------------------------------------
ALTER TABLE fuel_logs ADD COLUMN IF NOT EXISTS document_id UUID REFERENCES documents_emis(id);
ALTER TABLE fuel_logs ADD COLUMN IF NOT EXISTS carburant TEXT;
ALTER TABLE fuel_logs DROP CONSTRAINT IF EXISTS fuel_logs_carburant;
ALTER TABLE fuel_logs ADD CONSTRAINT fuel_logs_carburant CHECK (carburant IS NULL OR carburant IN ('gasoil', 'essence'));
CREATE UNIQUE INDEX IF NOT EXISTS uq_fuel_logs_document ON fuel_logs (document_id) WHERE document_id IS NOT NULL;
COMMENT ON COLUMN fuel_logs.document_id IS
  'Le bon de sortie carburant numéroté (registre scellé, lot 16.2) qui justifie ce plein. Vide pour un plein saisi sans bon (achat en station, historique).';

CREATE OR REPLACE FUNCTION app.emettre_bon_carburant(
    p_commune    text,
    p_vehicule   text,
    p_date       date,
    p_litres     numeric,
    p_montant    numeric,
    p_carburant  text,
    p_compteur   numeric DEFAULT NULL,
    p_chauffeur  uuid DEFAULT NULL
  )
  RETURNS documents_emis
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_engin   vehicules;
  v_matricule text;
  v_doc     documents_emis;
BEGIN
  SELECT * INTO v_engin FROM vehicules WHERE id = p_vehicule AND commune_id = p_commune AND deleted_at IS NULL;
  IF v_engin.id IS NULL THEN
    RAISE EXCEPTION 'ENGIN_INCONNU: %', p_vehicule USING ERRCODE = 'check_violation';
  END IF;
  IF p_chauffeur IS NOT NULL THEN
    SELECT matricule INTO v_matricule FROM personnel WHERE id = p_chauffeur AND commune_id = p_commune AND deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CARNET_CHAUFFEUR: le chauffeur n''appartient pas à la commune de l''engin.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  -- Le bon d'abord : app.emettre_document() contrôle le rôle (admin de la
  -- commune) et attribue le numéro sous verrou. Le plein ensuite, dans la
  -- même transaction : si l'un échoue, l'autre n'a jamais existé.
  v_doc := app.emettre_document(
    p_commune, 'bon_carburant',
    jsonb_strip_nulls(jsonb_build_object(
      'engin', v_engin.registration, 'vehicule_id', v_engin.id, 'date', p_date,
      'carburant', p_carburant, 'litres', p_litres, 'montant_tnd', p_montant,
      'compteur', p_compteur, 'unite_compteur', v_engin.unite_compteur,
      'chauffeur_matricule', v_matricule)),
    'vehicule', p_vehicule);
  INSERT INTO fuel_logs (commune_id, vehicule_id, date_plein, litres, montant_tnd, kilometrage, carburant, document_id, saisi_par)
  VALUES (p_commune, p_vehicule, p_date, p_litres, p_montant,
          CASE WHEN v_engin.unite_compteur = 'km' THEN p_compteur::integer END,
          p_carburant, v_doc.id, app.current_user_id());
  RETURN v_doc;
END
$$;
COMMENT ON FUNCTION app.emettre_bon_carburant(text, text, date, numeric, numeric, text, numeric, uuid) IS
  'Émet un bon de sortie carburant numéroté (registre scellé) et enregistre le plein qu''il justifie, dans la même transaction. Réservé à l''admin de la commune.';
GRANT EXECUTE ON FUNCTION app.emettre_bon_carburant(text, text, date, numeric, numeric, text, numeric, uuid) TO siipi_app;

-- Annuler le bon retire le plein : un plein dont le bon est annulé n'a pas eu
-- lieu, et compter ses litres fausserait le ratio et le coût.
CREATE OR REPLACE FUNCTION app.retirer_plein_du_bon_annule() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
  IF NEW.statut = 'annule' AND OLD.statut = 'emis' AND NEW.type_document = 'bon_carburant' THEN
    UPDATE fuel_logs SET deleted_at = now(), deleted_by = NEW.annule_par
     WHERE document_id = NEW.id AND deleted_at IS NULL;
  END IF;
  RETURN NULL;
END
$$;
DROP TRIGGER IF EXISTS trg_retirer_plein_du_bon_annule ON documents_emis;
CREATE TRIGGER trg_retirer_plein_du_bon_annule AFTER UPDATE OF statut ON documents_emis
  FOR EACH ROW EXECUTE FUNCTION app.retirer_plein_du_bon_annule();

-- Et l'inverse est refusé : un plein justifié par un bon encore valable ne se
-- retire pas seul — le registre montrerait un bon sans plein.
CREATE OR REPLACE FUNCTION app.proteger_plein_sous_bon() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_bon documents_emis;
BEGIN
  IF NEW.document_id IS DISTINCT FROM OLD.document_id
     OR (OLD.document_id IS NOT NULL AND (NEW.litres, NEW.montant_tnd, NEW.vehicule_id, NEW.date_plein)
                                         IS DISTINCT FROM (OLD.litres, OLD.montant_tnd, OLD.vehicule_id, OLD.date_plein)) THEN
    RAISE EXCEPTION 'PLEIN_SOUS_BON: un plein justifié par un bon ne se modifie pas ; annulez le bon et émettez-en un autre.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.document_id IS NOT NULL AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    SELECT * INTO v_bon FROM documents_emis WHERE id = OLD.document_id;
    IF v_bon.statut = 'emis' THEN
      RAISE EXCEPTION 'PLEIN_SOUS_BON: ce plein est justifié par le bon %, toujours valable. Annulez le bon : le plein sera retiré avec lui.', v_bon.numero_affiche
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_proteger_plein_sous_bon ON fuel_logs;
CREATE TRIGGER trg_proteger_plein_sous_bon BEFORE UPDATE ON fuel_logs
  FOR EACH ROW EXECUTE FUNCTION app.proteger_plein_sous_bon();

-- -------------------------------------------------------------------------
-- 5. La consommation par engin et par mois
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.consommation_engins(p_commune text, p_mois date)
  RETURNS TABLE (
    vehicule_id        text,
    registration       text,
    unite_compteur     text,
    quota_litres       numeric,
    litres             numeric,
    pleins             integer,
    parcouru           numeric,
    seances            integer,
    litres_100km       numeric,
    litres_heure       numeric,
    ecart_quota_litres numeric,
    ecart_quota_pct    numeric,
    sorties_ouvertes   integer
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  WITH mois AS (
    SELECT date_trunc('month', p_mois)::date AS debut,
           (date_trunc('month', p_mois) + interval '1 month')::date AS fin
  ),
  pleins AS (
    SELECT f.vehicule_id, sum(f.litres) AS litres, count(*)::int AS n
      FROM fuel_logs f, mois m
     WHERE f.commune_id = p_commune AND f.deleted_at IS NULL
       AND f.date_plein >= m.debut AND f.date_plein < m.fin
     GROUP BY f.vehicule_id
  ),
  carnets AS (
    SELECT c.vehicule_id,
           sum(c.parcouru) FILTER (WHERE c.compteur_retour IS NOT NULL) AS parcouru,
           count(*) FILTER (WHERE c.compteur_retour IS NOT NULL)::int AS seances,
           count(*) FILTER (WHERE c.compteur_retour IS NULL)::int AS ouvertes
      FROM carnets_de_bord c, mois m
     WHERE c.commune_id = p_commune AND c.deleted_at IS NULL
       AND c.jour >= m.debut AND c.jour < m.fin
     GROUP BY c.vehicule_id
  ),
  quotas AS (
    SELECT DISTINCT ON (q.vehicule_id) q.vehicule_id, q.litres_mois
      FROM quotas_carburant q, mois m
     WHERE q.commune_id = p_commune AND q.deleted_at IS NULL AND q.depuis <= m.debut
     ORDER BY q.vehicule_id, q.depuis DESC
  )
  SELECT v.id, v.registration, v.unite_compteur,
         q.litres_mois,
         p.litres,
         COALESCE(p.n, 0),
         -- Une séance de 0 km ne fait pas un ratio : le diviseur reste NULL.
         NULLIF(c.parcouru, 0),
         COALESCE(c.seances, 0),
         CASE WHEN v.unite_compteur = 'km' AND c.parcouru > 0 AND p.litres IS NOT NULL
              THEN round(p.litres / c.parcouru * 100, 1) END,
         CASE WHEN v.unite_compteur = 'heures' AND c.parcouru > 0 AND p.litres IS NOT NULL
              THEN round(p.litres / c.parcouru, 2) END,
         CASE WHEN q.litres_mois IS NOT NULL AND p.litres IS NOT NULL THEN p.litres - q.litres_mois END,
         CASE WHEN q.litres_mois IS NOT NULL AND p.litres IS NOT NULL
              THEN round(100 * (p.litres - q.litres_mois) / q.litres_mois, 1) END,
         COALESCE(c.ouvertes, 0)
    FROM vehicules v
    LEFT JOIN pleins p  ON p.vehicule_id = v.id
    LEFT JOIN carnets c ON c.vehicule_id = v.id
    LEFT JOIN quotas q  ON q.vehicule_id = v.id
   WHERE v.commune_id = p_commune AND v.deleted_at IS NULL
     AND app.can_read_commune(p_commune)
     AND (p.vehicule_id IS NOT NULL OR c.vehicule_id IS NOT NULL OR q.vehicule_id IS NOT NULL)
   ORDER BY v.registration
$$;
COMMENT ON FUNCTION app.consommation_engins(text, date) IS
  'Par engin, pour le mois de p_mois : litres (pleins), distance parcourue (carnets rentrés), L/100 km (ou L/heure), quota en vigueur au 1er du mois et écart. Une source absente rend NULL, jamais 0. Ratio mensuel du référentiel (diapo 44) : les litres d''un plein de fin de mois servent souvent le mois suivant — à lire sur plusieurs mois.';
GRANT EXECUTE ON FUNCTION app.consommation_engins(text, date) TO siipi_app;

-- -------------------------------------------------------------------------
-- 6. « À vérifier »
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.incoherences_carburant(p_commune text)
  RETURNS TABLE (gravite text, domaine text, sujet text, sujet_id text, constat text, quoi_faire text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  WITH aujourdhui AS (SELECT (now() AT TIME ZONE 'Africa/Tunis')::date AS j),
  mois AS (
    SELECT date_trunc('month', j)::date AS m FROM aujourdhui
    UNION ALL
    SELECT (date_trunc('month', j) - interval '1 month')::date FROM aujourdhui
  ),
  depassements AS (
    SELECT m.m, c.* FROM mois m CROSS JOIN LATERAL app.consommation_engins(p_commune, m.m) c
     WHERE c.ecart_quota_litres > 0
  ),
  carnets AS (
    SELECT c.*, v.registration,
           lag(c.compteur_retour) OVER (PARTITION BY c.vehicule_id
                                        ORDER BY c.jour, CASE c.seance WHEN 'matin' THEN 1 WHEN 'apres_midi' THEN 2 ELSE 3 END, c.created_at) AS retour_precedent
      FROM carnets_de_bord c JOIN vehicules v ON v.id = c.vehicule_id
     WHERE c.commune_id = p_commune AND c.deleted_at IS NULL
  )
  SELECT 'avertissement', 'carburant', d.registration, d.vehicule_id,
         format('%s : %s L consommés pour un quota de %s L (+%s %%).',
                to_char(d.m, 'MM/YYYY'), d.litres, d.quota_litres, d.ecart_quota_pct),
         'Vérifier l''état de l''engin : le référentiel lit une hausse de consommation d''abord comme un indicateur d''avarie (diapo 42). C''est un constat, pas une faute.'
    FROM depassements d
   WHERE app.can_read_commune(p_commune)
  UNION ALL
  SELECT 'information', 'carburant', c.registration, c.id::text,
         format('Le %s (%s), compteur à la sortie (%s) inférieur au compteur au retour précédent (%s).',
                to_char(c.jour, 'DD/MM/YYYY'), c.seance, c.compteur_sortie, c.retour_precedent),
         'Vérifier la saisie du carnet, ou consigner un changement de compteur dans l''observation.'
    FROM carnets c
   WHERE c.retour_precedent IS NOT NULL AND c.compteur_sortie < c.retour_precedent
     AND app.can_read_commune(p_commune)
  UNION ALL
  SELECT 'information', 'carburant', c.registration, c.id::text,
         format('Sortie du %s (%s) jamais rentrée au carnet.', to_char(c.jour, 'DD/MM/YYYY'), c.seance),
         'Saisir le compteur au retour : sans lui, la séance ne compte ni dans la distance ni dans le ratio.'
    FROM carnets c, aujourdhui a
   WHERE c.compteur_retour IS NULL AND c.jour < a.j - 1
     AND app.can_read_commune(p_commune)
$$;
GRANT EXECUTE ON FUNCTION app.incoherences_carburant(text) TO siipi_app;

-- Le panneau « À vérifier » : définition reprise de la migration 050, la
-- famille carburant en plus.
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
    ) tout
   ORDER BY CASE gravite WHEN 'bloquant' THEN 0
                         WHEN 'avertissement' THEN 1
                         ELSE 2 END,
            domaine, sujet
$$;
GRANT EXECUTE ON FUNCTION app.incoherences_commune(text) TO siipi_app;

-- -------------------------------------------------------------------------
-- 7. Cloisonnement, journal, retrait, jumeau numérique
-- -------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['carnets_de_bord', 'quotas_carburant'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'trg_audit_' || t, t);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement()', 'trg_audit_' || t, t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (deleted_at IS NULL AND app.can_read_commune(commune_id))', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (app.can_write_commune(commune_id))', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (deleted_at IS NULL AND app.can_write_commune(commune_id)) WITH CHECK (app.can_write_commune(commune_id))', t || '_update', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO siipi_app', t);
    -- Le jumeau numérique (migration 055) : provenance imposée en démo,
    -- refusée ailleurs.
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS provenance TEXT NOT NULL DEFAULT ''reel''', t);
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', t, t || '_provenance_valide');
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (provenance IN (''reel'', ''simule''))', t, t || '_provenance_valide');
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'trg_provenance_' || t, t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF commune_id, provenance ON %I
                      FOR EACH ROW EXECUTE FUNCTION app.controler_provenance()', 'trg_provenance_' || t, t);
  END LOOP;
END
$$;

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
                     'carnets_de_bord', 'quotas_carburant') THEN
    RAISE EXCEPTION 'TABLE_NON_SUPPRIMABLE: %', p_table;
  END IF;

  EXECUTE format('SELECT commune_id FROM %I WHERE id::text = $1 AND deleted_at IS NULL', p_table)
     INTO v_commune USING p_id;

  IF v_commune IS NULL THEN
    RETURN false;
  END IF;

  -- L'identité se retire comme elle se lit : par le seul admin de la commune.
  IF p_table = 'donnees_personnelles_barbechas' THEN
    IF NOT app.peut_voir_identite(v_commune) THEN
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
