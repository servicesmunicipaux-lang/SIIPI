-- ===========================================================================
-- Migration 051 — Jalon 8, lot 2 : l'automatisation des sources KPI
--
-- Le Jalon 8 a posé la fiche d'évaluation : ce que SIIPI ne voyait pas, la
-- commune le déclarait. Ce lot fait VOIR à SIIPI une partie de ce qu'elle
-- déclarait, par des registres tenus au fil de l'eau :
--   - des LIEUX (points d'intérêt) — marchés, cimetières, abattoirs, écoles,
--     centres de santé — et des actions de NETTOYAGE qui s'y rattachent, avec
--     les mètres linéaires réalisés (M1-1, M2-3, M2-4, M2-5) ;
--   - les PLEINS DE CARBURANT des engins (coût global à la tonne) ;
--   - la FIN DE POSTE du chauffeur, avec « benne bâchée avant transit » (M1-9) ;
--   - la DOTATION EN EPI (M1-6) et le JOURNAL DES INCIDENTS du travail (axe 5) ;
--   - les COMMERCES et leurs CONVENTIONS de propreté (M2-2).
--
-- LA FUSION : MESURÉ, SINON DÉCLARÉ, SINON NON RENSEIGNÉ. La fiche déclarative
-- reste en place (retrait prévu après douze mois de recette). Pour chaque
-- indicateur, la mesure prime ; en son absence la déclaration prend le
-- relais ; sans l'une ni l'autre, « non renseigné ». La fusion se fait dans
-- services/kpi5Axes.ts ; ici, on ne produit que les mesures.
--
-- UN REGISTRE VIDE N'EST PAS UN ZÉRO. Une mesure n'est produite que si le
-- registre qui la nourrit est TENU pour la commune et la période : aucune
-- fin de poste saisie ne veut pas dire « 0 % de bennes bâchées », aucune
-- ligne au journal des incidents ne veut pas dire « zéro accident ». Dans
-- ces cas-là, la mesure est absente et la déclaration reprend la main.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Les lieux (points d'intérêt)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS poi (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id   TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    nom          TEXT NOT NULL,
    type         TEXT NOT NULL,
    geom         geometry(Point, 4326) NOT NULL,
    -- Le secteur de collecte où il se trouve, déduit de la position quand on
    -- ne le précise pas.
    zone_id      UUID REFERENCES zones_collecte(id) ON DELETE SET NULL,
    adresse      TEXT,
    actif        BOOLEAN NOT NULL DEFAULT true,
    created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at   TIMESTAMPTZ,
    deleted_by   UUID REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT poi_type_valide CHECK (type IN ('marche', 'cimetiere', 'abattoir', 'ecole', 'sante', 'autre')),
    CONSTRAINT poi_nom_non_vide CHECK (length(btrim(nom)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_poi_commune ON poi (commune_id, type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_poi_geom ON poi USING gist (geom);

COMMENT ON TABLE poi IS
  'Lieux de la commune (marchés, cimetières, abattoirs, écoles, santé) où la propreté se suit par des actions de nettoyage. Les abattoirs ne sortent jamais par la route publique.';

CREATE OR REPLACE FUNCTION app.poi_avant_ecriture() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
  IF NEW.zone_id IS NULL THEN
    SELECT z.id INTO NEW.zone_id FROM zones_collecte z
     WHERE z.commune_id = NEW.commune_id AND z.deleted_at IS NULL AND ST_Contains(z.geom, NEW.geom)
     ORDER BY ST_Area(z.geom) LIMIT 1;
  ELSIF NOT EXISTS (SELECT 1 FROM zones_collecte WHERE id = NEW.zone_id AND commune_id = NEW.commune_id) THEN
    RAISE EXCEPTION 'SECTEUR_AUTRE_COMMUNE' USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_poi_avant_ecriture ON poi;
CREATE TRIGGER trg_poi_avant_ecriture BEFORE INSERT OR UPDATE OF geom, zone_id, commune_id ON poi
  FOR EACH ROW EXECUTE FUNCTION app.poi_avant_ecriture();

-- ---------------------------------------------------------------------------
-- 2. Les actions de nettoyage, rattachées à un lieu
-- ---------------------------------------------------------------------------

ALTER TABLE actions_planifiees ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'generale';
ALTER TABLE actions_planifiees ADD COLUMN IF NOT EXISTS poi_id UUID REFERENCES poi(id) ON DELETE SET NULL;
ALTER TABLE actions_planifiees ADD COLUMN IF NOT EXISTS metres_lineaires NUMERIC(12, 1);

ALTER TABLE actions_planifiees DROP CONSTRAINT IF EXISTS actions_planifiees_type_valide;
ALTER TABLE actions_planifiees ADD  CONSTRAINT actions_planifiees_type_valide CHECK (type IN ('generale', 'nettoyage'));
ALTER TABLE actions_planifiees DROP CONSTRAINT IF EXISTS actions_planifiees_ml_positifs;
ALTER TABLE actions_planifiees ADD  CONSTRAINT actions_planifiees_ml_positifs CHECK (metres_lineaires IS NULL OR metres_lineaires >= 0);

CREATE INDEX IF NOT EXISTS idx_actions_planifiees_poi ON actions_planifiees (poi_id) WHERE deleted_at IS NULL;

COMMENT ON COLUMN actions_planifiees.metres_lineaires IS
  'Mètres linéaires nettoyés, saisis à la clôture d''une action de nettoyage : la source mesurée du balayage (M1-1).';

-- Le lieu est de la commune de l'action.
CREATE OR REPLACE FUNCTION app.controler_poi_action() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
  IF NEW.poi_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM poi WHERE id = NEW.poi_id AND commune_id = NEW.commune_id) THEN
    RAISE EXCEPTION 'LIEU_AUTRE_COMMUNE' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_actions_planifiees_poi ON actions_planifiees;
CREATE TRIGGER trg_actions_planifiees_poi BEFORE INSERT OR UPDATE OF poi_id, commune_id ON actions_planifiees
  FOR EACH ROW EXECUTE FUNCTION app.controler_poi_action();

-- ---------------------------------------------------------------------------
-- 3. Les pleins de carburant (coût global à la tonne)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS fuel_logs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id   TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    vehicule_id  TEXT NOT NULL REFERENCES vehicules(id) ON DELETE CASCADE,
    date_plein   DATE NOT NULL,
    litres       NUMERIC(10, 2) NOT NULL,
    montant_tnd  NUMERIC(12, 3) NOT NULL,
    kilometrage  INTEGER,
    saisi_par    UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at   TIMESTAMPTZ,
    deleted_by   UUID REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT fuel_logs_litres CHECK (litres > 0 AND litres < 2000),
    CONSTRAINT fuel_logs_montant CHECK (montant_tnd >= 0),
    CONSTRAINT fuel_logs_km CHECK (kilometrage IS NULL OR kilometrage >= 0)
);

CREATE INDEX IF NOT EXISTS idx_fuel_logs_commune ON fuel_logs (commune_id, date_plein) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_fuel_logs_commune ON fuel_logs;
CREATE TRIGGER trg_fuel_logs_commune BEFORE INSERT OR UPDATE OF vehicule_id, commune_id ON fuel_logs
  FOR EACH ROW EXECUTE FUNCTION app.controler_commune_engin();

-- Un plein qui porte un kilométrage plus élevé relève le compteur, à la
-- hausse seulement — comme une intervention d'entretien (migration 046).
CREATE OR REPLACE FUNCTION app.relever_kilometrage_plein() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
  IF NEW.kilometrage IS NOT NULL AND NEW.deleted_at IS NULL THEN
    UPDATE vehicules SET kilometrage = NEW.kilometrage, kilometrage_le = NEW.date_plein
     WHERE id = NEW.vehicule_id AND (kilometrage IS NULL OR kilometrage < NEW.kilometrage);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_fuel_logs_kilometrage ON fuel_logs;
CREATE TRIGGER trg_fuel_logs_kilometrage AFTER INSERT OR UPDATE OF kilometrage ON fuel_logs
  FOR EACH ROW EXECUTE FUNCTION app.relever_kilometrage_plein();

-- ---------------------------------------------------------------------------
-- 4. La fin de poste du chauffeur (M1-9)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS fins_de_poste (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id     TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    vehicule_id    TEXT NOT NULL REFERENCES vehicules(id) ON DELETE CASCADE,
    circuit_id     UUID REFERENCES circuits(id) ON DELETE SET NULL,
    chauffeur_id   UUID REFERENCES personnel(id) ON DELETE SET NULL,
    jour           DATE NOT NULL,
    -- La question obligatoire : ni vide, ni « on verra ». Oui ou non.
    benne_bachee   BOOLEAN NOT NULL,
    observation    TEXT,
    saisi_par      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at     TIMESTAMPTZ,
    deleted_by     UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_fins_de_poste_commune ON fins_de_poste (commune_id, jour) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_fins_de_poste_commune ON fins_de_poste;
CREATE TRIGGER trg_fins_de_poste_commune BEFORE INSERT OR UPDATE OF vehicule_id, commune_id ON fins_de_poste
  FOR EACH ROW EXECUTE FUNCTION app.controler_commune_engin();

COMMENT ON TABLE fins_de_poste IS
  'Check-list de fin de poste d''un engin : « benne bâchée avant transit » est obligatoire. Le taux de oui nourrit le bâchage (M1-9).';

-- ---------------------------------------------------------------------------
-- 5. La dotation en EPI (M1-6) et le journal des incidents du travail (axe 5)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS dotations_epi (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id           TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    personnel_id         UUID NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
    type_epi             TEXT NOT NULL,
    date_remise          DATE NOT NULL,
    -- Échéance de renouvellement : passée, la dotation n'est plus en cours.
    date_renouvellement  DATE,
    saisi_par            UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at           TIMESTAMPTZ,
    deleted_by           UUID REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT dotations_epi_type CHECK (type_epi IN ('gants', 'chaussures', 'gilet', 'tenue', 'masque', 'casque', 'lunettes', 'kit_complet', 'autre')),
    CONSTRAINT dotations_epi_periode CHECK (date_renouvellement IS NULL OR date_renouvellement >= date_remise)
);

CREATE INDEX IF NOT EXISTS idx_dotations_epi_commune ON dotations_epi (commune_id, personnel_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS incidents_travail (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id     TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    personnel_id   UUID REFERENCES personnel(id) ON DELETE SET NULL,
    date_incident  DATE NOT NULL,
    type           TEXT NOT NULL,
    gravite        TEXT NOT NULL,
    jours_arret    INTEGER,
    description    TEXT,
    saisi_par      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at     TIMESTAMPTZ,
    deleted_by     UUID REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT incidents_travail_type CHECK (type IN ('accident', 'presque_accident', 'agression', 'maladie_professionnelle', 'autre')),
    CONSTRAINT incidents_travail_gravite CHECK (gravite IN ('benin', 'avec_arret', 'grave')),
    CONSTRAINT incidents_travail_jours CHECK (jours_arret IS NULL OR jours_arret >= 0)
);

CREATE INDEX IF NOT EXISTS idx_incidents_travail_commune ON incidents_travail (commune_id, date_incident) WHERE deleted_at IS NULL;

-- L'agent est de la commune de la ligne.
CREATE OR REPLACE FUNCTION app.controler_commune_agent() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
  IF NEW.personnel_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM personnel WHERE id = NEW.personnel_id AND commune_id = NEW.commune_id) THEN
    RAISE EXCEPTION 'AGENT_AUTRE_COMMUNE' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dotations_epi_agent ON dotations_epi;
CREATE TRIGGER trg_dotations_epi_agent BEFORE INSERT OR UPDATE OF personnel_id, commune_id ON dotations_epi
  FOR EACH ROW EXECUTE FUNCTION app.controler_commune_agent();
DROP TRIGGER IF EXISTS trg_incidents_travail_agent ON incidents_travail;
CREATE TRIGGER trg_incidents_travail_agent BEFORE INSERT OR UPDATE OF personnel_id, commune_id ON incidents_travail
  FOR EACH ROW EXECUTE FUNCTION app.controler_commune_agent();

-- ---------------------------------------------------------------------------
-- 6. Les commerces et leurs conventions de propreté (M2-2)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS commerces (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id   TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    nom          TEXT NOT NULL,
    -- commerce ou institution publique : les deux se conventionnent.
    categorie    TEXT NOT NULL DEFAULT 'commerce',
    activite     TEXT,
    adresse      TEXT,
    actif        BOOLEAN NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at   TIMESTAMPTZ,
    deleted_by   UUID REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT commerces_categorie CHECK (categorie IN ('commerce', 'institution')),
    CONSTRAINT commerces_nom_non_vide CHECK (length(btrim(nom)) > 0)
);

CREATE TABLE IF NOT EXISTS conventions_commerciales (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id      TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    commerce_id     UUID NOT NULL REFERENCES commerces(id) ON DELETE CASCADE,
    type            TEXT NOT NULL,
    date_debut      DATE NOT NULL,
    date_fin        DATE,
    tonnage_estime  NUMERIC(10, 3),
    observation     TEXT,
    saisi_par       UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT conventions_type CHECK (type IN ('collecte', 'nettoyage', 'tri', 'autre')),
    CONSTRAINT conventions_periode CHECK (date_fin IS NULL OR date_fin >= date_debut),
    CONSTRAINT conventions_tonnage CHECK (tonnage_estime IS NULL OR tonnage_estime >= 0)
);

CREATE INDEX IF NOT EXISTS idx_conventions_commerce ON conventions_commerciales (commerce_id) WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION app.controler_commune_commerce() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM commerces WHERE id = NEW.commerce_id AND commune_id = NEW.commune_id) THEN
    RAISE EXCEPTION 'COMMERCE_AUTRE_COMMUNE' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conventions_commerce ON conventions_commerciales;
CREATE TRIGGER trg_conventions_commerce BEFORE INSERT OR UPDATE OF commerce_id, commune_id ON conventions_commerciales
  FOR EACH ROW EXECUTE FUNCTION app.controler_commune_commerce();

-- ---------------------------------------------------------------------------
-- 7. Journal et cloisonnement
--
-- Les lieux se lisent comme les autres données de terrain de la commune (le
-- prestataire y voit ceux de ses communes) ; tout le reste — carburant,
-- fins de poste, EPI, incidents, commerces, conventions — est l'affaire de la
-- commune et de la FNCT.
-- ---------------------------------------------------------------------------

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['poi', 'fuel_logs', 'fins_de_poste', 'dotations_epi', 'incidents_travail', 'commerces', 'conventions_commerciales'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'trg_audit_' || t, t);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement()', 'trg_audit_' || t, t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (deleted_at IS NULL AND %s)', t || '_select', t,
                   CASE WHEN t = 'poi' THEN 'app.can_read_commune(commune_id)' ELSE 'app.can_write_commune(commune_id)' END);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (app.can_write_commune(commune_id))', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (deleted_at IS NULL AND app.can_write_commune(commune_id)) WITH CHECK (app.can_write_commune(commune_id))', t || '_update', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO siipi_app', t);
    EXECUTE format('REVOKE DELETE, TRUNCATE ON %I FROM siipi_app', t);
  END LOOP;
END $$;

-- Retrait logique : app.supprimer() s'ouvre aux nouveaux registres.
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
                     'incidents_travail', 'commerces', 'conventions_commerciales') THEN
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

-- ---------------------------------------------------------------------------
-- 8. La route publique des lieux : marchés et cimetières seulement
--
-- SECURITY DEFINER, comme la carte publique des signalements : ce n'est pas
-- la table qui s'ouvre, c'est une fonction qui n'en laisse sortir que les
-- marchés et les cimetières d'UNE commune, avec leur état de propreté. Les
-- abattoirs (et les autres types) n'en sortent jamais.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.lieux_publics(p_commune text)
  RETURNS TABLE (id uuid, nom text, type text, lat double precision, lng double precision,
                 dernier_nettoyage date, prochain_nettoyage date, etat text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  WITH auj AS (SELECT (now() AT TIME ZONE 'Africa/Tunis')::date AS jour)
  SELECT p.id, p.nom, p.type, ST_Y(p.geom), ST_X(p.geom), n.dernier, n.prochain,
         CASE WHEN n.dernier IS NULL AND n.prochain IS NULL THEN 'non_renseigne'
              WHEN n.dernier IS NOT NULL AND n.dernier >= auj.jour - 7 THEN 'propre'
              WHEN n.prochain IS NOT NULL THEN 'nettoyage_prevu'
              ELSE 'a_surveiller' END
    FROM poi p
    CROSS JOIN auj
    LEFT JOIN LATERAL (
      SELECT max(COALESCE(a.terminee_le::date, a.date_prevue)) FILTER (WHERE a.statut = 'terminee') AS dernier,
             min(a.date_prevue) FILTER (WHERE a.statut = 'planifiee' AND a.date_prevue >= auj.jour) AS prochain
        FROM actions_planifiees a
       WHERE a.poi_id = p.id AND a.type = 'nettoyage' AND a.deleted_at IS NULL
    ) n ON true
   WHERE p_commune IS NOT NULL AND p.commune_id = p_commune
     AND p.deleted_at IS NULL AND p.actif AND p.type IN ('marche', 'cimetiere')
   ORDER BY p.type, p.nom
$$;

COMMENT ON FUNCTION app.lieux_publics(text) IS
  'Les marchés et cimetières d''une commune, avec leur état de propreté, pour l''application citoyenne. Aucun autre type de lieu — jamais un abattoir.';

GRANT EXECUTE ON FUNCTION app.lieux_publics(text) TO siipi_app;

-- ---------------------------------------------------------------------------
-- 9. Les mesures automatiques des indicateurs jusqu'ici déclarés
--
-- Même forme que app.mesures_kpi (migration 050), mêmes communes visibles.
-- La cible d'un ratio, quand elle est connue de la plateforme, est rendue
-- dans detail.cible. Une ligne n'existe que si le registre est tenu.
-- ---------------------------------------------------------------------------

ALTER TABLE parametres_commune ADD COLUMN IF NOT EXISTS objectif_balayage_ml_j NUMERIC(10, 1);
ALTER TABLE parametres_commune DROP CONSTRAINT IF EXISTS parametres_objectif_balayage;
ALTER TABLE parametres_commune ADD  CONSTRAINT parametres_objectif_balayage CHECK (objectif_balayage_ml_j IS NULL OR objectif_balayage_ml_j > 0);
COMMENT ON COLUMN parametres_commune.objectif_balayage_ml_j IS
  'Objectif de balayage (mètres linéaires par jour) selon la taille de la commune : la cible du balayage mesuré (M1-1).';

CREATE OR REPLACE FUNCTION app.mesures_kpi_auto(p_annee integer)
  RETURNS TABLE (commune_id text, code text, valeur numeric, note numeric, detail jsonb)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  WITH bornes AS (
    SELECT make_date(p_annee, 1, 1) AS debut,
           LEAST(make_date(p_annee, 12, 31), (now() AT TIME ZONE 'Africa/Tunis')::date) AS fin
  ),
  communes_vues AS (SELECT c.id FROM communes c WHERE app.can_write_commune(c.id)),

  -- M1-1 : les mètres linéaires des nettoyages terminés, par jour, depuis le
  -- premier nettoyage mesuré de l'année (rapporter à l'année entière une
  -- mesure commencée en septembre la diluerait).
  balayage AS (
    SELECT a.commune_id, sum(a.metres_lineaires) AS ml, min(a.date_prevue) AS depuis, count(*) AS n
      FROM actions_planifiees a, bornes b
     WHERE a.deleted_at IS NULL AND a.type = 'nettoyage' AND a.statut = 'terminee'
       AND a.metres_lineaires IS NOT NULL AND a.date_prevue BETWEEN b.debut AND b.fin
     GROUP BY a.commune_id
  ),

  -- M2-3, M2-4, M2-5 : les nettoyages échus sur les lieux d'un type.
  lieux AS (
    SELECT a.commune_id, p.type,
           count(*) AS echus,
           count(*) FILTER (WHERE a.statut = 'terminee') AS faits
      FROM actions_planifiees a JOIN poi p ON p.id = a.poi_id AND p.deleted_at IS NULL, bornes b
     WHERE a.deleted_at IS NULL AND a.type = 'nettoyage' AND a.statut <> 'annulee'
       AND a.date_prevue BETWEEN b.debut AND b.fin
       AND p.type IN ('cimetiere', 'marche', 'abattoir')
     GROUP BY a.commune_id, p.type
  ),

  -- M1-9 : les fins de poste de la période.
  bachage AS (
    SELECT f.commune_id, count(*) AS n, count(*) FILTER (WHERE f.benne_bachee) AS bachees
      FROM fins_de_poste f, bornes b
     WHERE f.deleted_at IS NULL AND f.jour BETWEEN b.debut AND b.fin
     GROUP BY f.commune_id
  ),

  -- M1-6 : les agents de terrain dotés d'EPI en cours à la fin de la période,
  -- sur l'effectif de terrain — seulement si le registre est tenu.
  terrain AS (
    SELECT pe.commune_id, count(*) AS effectif
      FROM personnel pe
     WHERE pe.deleted_at IS NULL AND pe.actif AND COALESCE(pe.service, 'proprete') = 'proprete'
       AND pe.fonction IN ('chauffeur', 'agent', 'chef_equipe', 'agent_balayage', 'ripeur',
                           'tractoriste', 'jardinier', 'agent_hygiene', 'mecanicien')
     GROUP BY pe.commune_id
  ),
  dotes AS (
    SELECT d.commune_id, count(DISTINCT d.personnel_id) AS dotes
      FROM dotations_epi d JOIN personnel pe ON pe.id = d.personnel_id AND pe.deleted_at IS NULL AND pe.actif, bornes b
     WHERE d.deleted_at IS NULL AND d.date_remise <= b.fin
       AND (d.date_renouvellement IS NULL OR d.date_renouvellement >= b.fin)
     GROUP BY d.commune_id
  ),
  registre_epi AS (
    SELECT DISTINCT d.commune_id FROM dotations_epi d, bornes b WHERE d.deleted_at IS NULL AND d.date_remise <= b.fin
  ),

  -- M2-2 : les commerces sous convention active pendant la période.
  commerces_actifs AS (
    SELECT c.commune_id, count(*) AS cibles FROM commerces c WHERE c.deleted_at IS NULL AND c.actif GROUP BY c.commune_id
  ),
  conventionnes AS (
    SELECT cv.commune_id, count(DISTINCT cv.commerce_id) AS n
      FROM conventions_commerciales cv JOIN commerces c ON c.id = cv.commerce_id AND c.deleted_at IS NULL AND c.actif, bornes b
     WHERE cv.deleted_at IS NULL AND cv.date_debut <= b.fin AND (cv.date_fin IS NULL OR cv.date_fin >= b.debut)
     GROUP BY cv.commune_id
  ),

  -- Carburant et incidents du travail.
  carburant AS (
    SELECT f.commune_id, sum(f.montant_tnd) AS montant, sum(f.litres) AS litres, count(*) AS n
      FROM fuel_logs f, bornes b
     WHERE f.deleted_at IS NULL AND f.date_plein BETWEEN b.debut AND b.fin
     GROUP BY f.commune_id
  ),
  incidents AS (
    SELECT i.commune_id, count(*) AS lignes,
           count(*) FILTER (WHERE i.type = 'accident') AS accidents,
           sum(COALESCE(i.jours_arret, 0)) FILTER (WHERE i.type = 'accident') AS jours_arret
      FROM incidents_travail i, bornes b
     WHERE i.deleted_at IS NULL AND i.date_incident BETWEEN b.debut AND b.fin
     GROUP BY i.commune_id
  )

  SELECT b.commune_id, 'M1-1', round(b.ml / (bo.fin - b.depuis + 1), 1),
         CASE WHEN pc.objectif_balayage_ml_j > 0 THEN LEAST(1, b.ml / (bo.fin - b.depuis + 1) / pc.objectif_balayage_ml_j) END,
         jsonb_build_object('cible', pc.objectif_balayage_ml_j, 'metres', b.ml, 'jours', bo.fin - b.depuis + 1, 'nettoyages', b.n)
    FROM balayage b JOIN communes_vues cv ON cv.id = b.commune_id CROSS JOIN bornes bo
    LEFT JOIN parametres_commune pc ON pc.commune_id = b.commune_id
  UNION ALL
  SELECT l.commune_id, CASE l.type WHEN 'cimetiere' THEN 'M2-3' WHEN 'marche' THEN 'M2-4' ELSE 'M2-5' END,
         round(100.0 * l.faits / l.echus, 1), l.faits::numeric / l.echus,
         jsonb_build_object('nettoyages_echus', l.echus, 'faits', l.faits)
    FROM lieux l JOIN communes_vues cv ON cv.id = l.commune_id WHERE l.echus > 0
  UNION ALL
  SELECT x.commune_id, 'M1-9', x.bachees, x.bachees::numeric / x.n,
         jsonb_build_object('cible', x.n, 'fins_de_poste', x.n)
    FROM bachage x JOIN communes_vues cv ON cv.id = x.commune_id WHERE x.n > 0
  UNION ALL
  SELECT t.commune_id, 'M1-6', COALESCE(d.dotes, 0), LEAST(1, COALESCE(d.dotes, 0)::numeric / t.effectif),
         jsonb_build_object('cible', t.effectif)
    FROM terrain t JOIN communes_vues cv ON cv.id = t.commune_id
    JOIN registre_epi r ON r.commune_id = t.commune_id
    LEFT JOIN dotes d ON d.commune_id = t.commune_id
   WHERE t.effectif > 0
  UNION ALL
  SELECT ca.commune_id, 'M2-2', COALESCE(n.n, 0), LEAST(1, COALESCE(n.n, 0)::numeric / ca.cibles),
         jsonb_build_object('cible', ca.cibles)
    FROM commerces_actifs ca JOIN communes_vues cv ON cv.id = ca.commune_id
    LEFT JOIN conventionnes n ON n.commune_id = ca.commune_id
   WHERE ca.cibles > 0
  UNION ALL
  SELECT c.commune_id, 'ECO-CARBURANT', c.montant, NULL, jsonb_build_object('pleins', c.n, 'litres', c.litres)
    FROM carburant c JOIN communes_vues cv ON cv.id = c.commune_id WHERE c.n > 0
  UNION ALL
  -- Un journal tenu cette année, même sans accident, dit « 0 accident ». Un
  -- journal vide ne dit rien.
  SELECT i.commune_id, 'RH-ACCIDENTS', i.accidents, NULL,
         jsonb_build_object('lignes_au_journal', i.lignes, 'jours_arret', COALESCE(i.jours_arret, 0))
    FROM incidents i JOIN communes_vues cv ON cv.id = i.commune_id WHERE i.lignes > 0
$$;

COMMENT ON FUNCTION app.mesures_kpi_auto(integer) IS
  'Les mesures automatiques des indicateurs jusqu''ici déclarés (balayage, cimetières, marchés, abattoirs, bâchage, EPI, conventions, carburant, accidents). Une ligne n''existe que si le registre qui la nourrit est tenu : un registre vide n''est pas un zéro.';

GRANT EXECUTE ON FUNCTION app.mesures_kpi_auto(integer) TO siipi_app;
