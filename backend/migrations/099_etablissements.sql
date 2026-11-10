-- =============================================================================
-- 099 — Jalon G, lot G2a : les établissements (docs/specs_metier/SPEC_G_assimiles_conventions.md
-- § 0, § 0bis, § 3.1 ; décisions du 4 novembre 2026, G-3 et G-4).
--
-- La table `commerces` (051, indicateur M2-2) devient le registre des
-- établissements : catégorie d'activité de la liste nationale datée (098),
-- matricule fiscal, secteur, position relevée, unité d'échelle du WaCT,
-- statut avec sa fermeture. L'écran dit « Établissements » ; la table garde son
-- nom, que les indicateurs de 051 et 070 lisent.
--
-- UN ÉTABLISSEMENT N'EST JAMAIS SUPPRIMÉ (G-4) : il est fermé, avec sa date et
-- son motif. `commerces` sort de la liste blanche de app.supprimer, et la base
-- refuse qu'on pose sa date de retrait.
--
-- L'IDENTITÉ EST SÉPARÉE (G-3) : le nom du responsable, son téléphone et
-- l'empreinte de son CIN vivent dans `identites_commerces`, sur le modèle des
-- pré-collecteurs (056) — lue par le seul directeur, chaque lecture journalisée,
-- hors du journal d'audit, et **aucune écriture tant que la FNCT n'a pas déclaré
-- l'hébergement accrédité et que la commune n'a pas son récépissé INPDP**. Le
-- CIN en clair n'est jamais écrit : l'empreinte se calcule dans l'API.
--
-- Écriture : le directeur de la commune ; la FNCT lit (comme les grilles, 098).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Les colonnes
-- ---------------------------------------------------------------------------
ALTER TABLE commerces ADD COLUMN IF NOT EXISTS categorie_activite TEXT;
ALTER TABLE commerces ADD COLUMN IF NOT EXISTS matricule_fiscal TEXT;
ALTER TABLE commerces ADD COLUMN IF NOT EXISTS zone_id UUID REFERENCES zones_collecte(id) ON DELETE SET NULL;
ALTER TABLE commerces ADD COLUMN IF NOT EXISTS geom geometry(Point, 4326);
ALTER TABLE commerces ADD COLUMN IF NOT EXISTS precision_m NUMERIC(7, 1);
ALTER TABLE commerces ADD COLUMN IF NOT EXISTS unite_echelle TEXT;
ALTER TABLE commerces ADD COLUMN IF NOT EXISTS valeur_echelle NUMERIC(12, 2);
ALTER TABLE commerces ADD COLUMN IF NOT EXISTS surface_m2 NUMERIC(12, 2);
ALTER TABLE commerces ADD COLUMN IF NOT EXISTS statut TEXT NOT NULL DEFAULT 'actif';
ALTER TABLE commerces ADD COLUMN IF NOT EXISTS ferme_le DATE;
ALTER TABLE commerces ADD COLUMN IF NOT EXISTS motif_statut TEXT;
-- Les lignes d'avant ce lot n'ont pas de source : « antérieur », dit tel.
ALTER TABLE commerces ADD COLUMN IF NOT EXISTS source_creation TEXT NOT NULL DEFAULT 'anterieur';
ALTER TABLE commerces ADD COLUMN IF NOT EXISTS produit_dangereux BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE commerces ADD COLUMN IF NOT EXISTS saisi_par UUID REFERENCES users(id) ON DELETE SET NULL;

-- Un établissement inactif d'avant ce lot n'a ni date ni motif de fermeture :
-- SIIPI ne les invente pas. Il passe « à vérifier », et la commune confirme la
-- fermeture avec sa date — ou le rouvre.
UPDATE commerces
   SET statut = 'a_verifier',
       motif_statut = 'Inactif avant le jalon G : la fermeture et sa date restent à confirmer.'
 WHERE statut = 'actif' AND actif IS FALSE
   AND EXISTS (SELECT 1 FROM pg_attribute
                WHERE attrelid = 'commerces'::regclass AND attname = 'actif' AND attgenerated = '');

-- `actif` devient le statut lu : M2-2 (051, 070) et la complétude (073) le
-- lisent sans changer. Calculé, il ne peut plus contredire le statut.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute
              WHERE attrelid = 'commerces'::regclass AND attname = 'actif' AND attgenerated = '' AND NOT attisdropped) THEN
    ALTER TABLE commerces DROP COLUMN actif;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute
                  WHERE attrelid = 'commerces'::regclass AND attname = 'actif' AND NOT attisdropped) THEN
    ALTER TABLE commerces ADD COLUMN actif BOOLEAN GENERATED ALWAYS AS (statut = 'actif') STORED;
  END IF;
END
$$;

-- « Antérieur » ne qualifie que les lignes d'avant ce lot, posées ci-dessus par le
-- défaut. Laissé en place, il dispenserait de catégorie toute inscription qui
-- omettrait sa source (un import, un écrivain futur) et la daterait à tort d'avant
-- le jalon G. Une inscription nouvelle dit donc sa source, et le déclencheur refuse
-- « antérieur ».
ALTER TABLE commerces ALTER COLUMN source_creation DROP DEFAULT;

-- ---------------------------------------------------------------------------
-- 2. Les règles qui tiennent en une ligne
-- ---------------------------------------------------------------------------
ALTER TABLE commerces DROP CONSTRAINT IF EXISTS commerces_statut_valide;
ALTER TABLE commerces ADD CONSTRAINT commerces_statut_valide CHECK (statut IN ('actif', 'ferme', 'a_verifier'));
-- Fermé : avec sa date, et seulement fermé. Rouvert : la date part, l'historique
-- reste au journal d'audit.
ALTER TABLE commerces DROP CONSTRAINT IF EXISTS commerces_fermeture_datee;
ALTER TABLE commerces ADD CONSTRAINT commerces_fermeture_datee CHECK ((statut = 'ferme') = (ferme_le IS NOT NULL));
ALTER TABLE commerces DROP CONSTRAINT IF EXISTS commerces_fermeture_plausible;
ALTER TABLE commerces ADD CONSTRAINT commerces_fermeture_plausible CHECK (ferme_le IS NULL OR ferme_le >= DATE '2000-01-01');
-- Le motif du dernier changement de statut : exigé pour « fermé » et « à
-- vérifier » ; gardé à la réouverture, qui a le sien.
ALTER TABLE commerces DROP CONSTRAINT IF EXISTS commerces_statut_motive;
ALTER TABLE commerces ADD CONSTRAINT commerces_statut_motive
  CHECK (statut = 'actif' OR length(btrim(COALESCE(motif_statut, ''))) >= 5);
ALTER TABLE commerces DROP CONSTRAINT IF EXISTS commerces_source_valide;
ALTER TABLE commerces ADD CONSTRAINT commerces_source_valide
  CHECK (source_creation IN ('anterieur', 'saisie', 'import_tcl', 'open_data', 'kobo'));
-- La catégorie est obligatoire, sauf pour une ligne d'avant ce lot : elle n'en
-- avait pas, et SIIPI ne la devine pas.
ALTER TABLE commerces DROP CONSTRAINT IF EXISTS commerces_categorie_activite_requise;
ALTER TABLE commerces ADD CONSTRAINT commerces_categorie_activite_requise
  CHECK (categorie_activite IS NOT NULL OR source_creation = 'anterieur');
-- Le matricule fiscal tunisien, normalisé (majuscules, sans espace ni barre) :
-- sept chiffres et la lettre clé, puis, quand le fichier les donne, le code TVA,
-- le code catégorie et le numéro d'établissement secondaire (1234567A/A/M/000).
ALTER TABLE commerces DROP CONSTRAINT IF EXISTS commerces_matricule_format;
ALTER TABLE commerces ADD CONSTRAINT commerces_matricule_format
  CHECK (matricule_fiscal IS NULL OR matricule_fiscal ~ '^[0-9]{7}[A-Z]([A-Z]{2}[0-9]{3})?$');
ALTER TABLE commerces DROP CONSTRAINT IF EXISTS commerces_echelle_entiere;
ALTER TABLE commerces ADD CONSTRAINT commerces_echelle_entiere
  CHECK ((unite_echelle IS NULL) = (valeur_echelle IS NULL) AND (valeur_echelle IS NULL OR valeur_echelle > 0));
ALTER TABLE commerces DROP CONSTRAINT IF EXISTS commerces_surface_positive;
ALTER TABLE commerces ADD CONSTRAINT commerces_surface_positive CHECK (surface_m2 IS NULL OR surface_m2 > 0);
-- Une position n'existe que relevée, avec sa précision, et en Tunisie.
ALTER TABLE commerces DROP CONSTRAINT IF EXISTS commerces_position_relevee;
ALTER TABLE commerces ADD CONSTRAINT commerces_position_relevee
  CHECK ((geom IS NULL) = (precision_m IS NULL) AND (precision_m IS NULL OR (precision_m > 0 AND precision_m <= 1000)));
ALTER TABLE commerces DROP CONSTRAINT IF EXISTS commerces_position_tunisie;
ALTER TABLE commerces ADD CONSTRAINT commerces_position_tunisie
  CHECK (geom IS NULL OR (ST_X(geom) BETWEEN 7.5 AND 11.7 AND ST_Y(geom) BETWEEN 30.2 AND 37.6));

CREATE UNIQUE INDEX IF NOT EXISTS uq_commerces_matricule
  ON commerces (commune_id, matricule_fiscal) WHERE deleted_at IS NULL AND matricule_fiscal IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commerces_commune_statut ON commerces (commune_id, statut) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_commerces_geom ON commerces USING gist (geom) WHERE geom IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Les règles qui demandent la base : liste nationale du jour, secteur de la
--    commune, date de fermeture passée, aucune suppression
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.controler_etablissement() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_unites text[];
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'ETABLISSEMENT_JAMAIS_SUPPRIME: un établissement recensé ne se supprime pas ; il se ferme, avec sa date et son motif.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.source_creation = 'anterieur' THEN
    RAISE EXCEPTION 'SOURCE_ANTERIEURE: une inscription nouvelle dit sa source (saisie, import TCL, open data, Kobo) ; « antérieur » ne qualifie que les fiches d''avant le jalon G.'
      USING ERRCODE = 'check_violation';
  END IF;
  -- La catégorie et son unité : vérifiées contre la liste nationale du jour, à
  -- l'inscription et quand elles changent — jamais réécrites quand la liste change
  -- ensuite. Une catégorie fermée plus tard reste celle que l'établissement avait :
  -- on corrige son adresse ou on retire son unité sans le reclasser. Seule une
  -- unité nouvelle se lit dans la liste du jour, qui ne la connaît plus.
  IF NEW.categorie_activite IS NULL THEN
    IF NEW.unite_echelle IS NOT NULL THEN
      RAISE EXCEPTION 'UNITE_ECHELLE: une unité d''échelle suppose une catégorie d''activité.' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF TG_OP = 'INSERT' OR NEW.categorie_activite IS DISTINCT FROM OLD.categorie_activite THEN
    SELECT e.unites_echelle INTO v_unites
      FROM app.liste_nationale('categories_activite_assimiles', app.jour_tunis()) e
     WHERE e.code = NEW.categorie_activite;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CATEGORIE_INCONNUE: « % » n''est pas une catégorie d''activité en vigueur (liste nationale de la FNCT).', NEW.categorie_activite
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.unite_echelle IS NOT NULL AND NOT (NEW.unite_echelle = ANY (COALESCE(v_unites, ARRAY[]::text[]))) THEN
      RAISE EXCEPTION 'UNITE_ECHELLE: l''unité « % » n''est pas une unité d''échelle de la catégorie « % ».', NEW.unite_echelle, NEW.categorie_activite
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.unite_echelle IS NOT NULL AND NEW.unite_echelle IS DISTINCT FROM OLD.unite_echelle THEN
    SELECT e.unites_echelle INTO v_unites
      FROM app.liste_nationale('categories_activite_assimiles', app.jour_tunis()) e
     WHERE e.code = NEW.categorie_activite;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'UNITE_ECHELLE: la catégorie « % » n''est plus en vigueur : son unité d''échelle se garde ou se retire, elle ne se change pas.', NEW.categorie_activite
        USING ERRCODE = 'check_violation';
    END IF;
    IF NOT (NEW.unite_echelle = ANY (COALESCE(v_unites, ARRAY[]::text[]))) THEN
      RAISE EXCEPTION 'UNITE_ECHELLE: l''unité « % » n''est pas une unité d''échelle de la catégorie « % ».', NEW.unite_echelle, NEW.categorie_activite
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.zone_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.zone_id IS DISTINCT FROM OLD.zone_id)
     AND NOT EXISTS (SELECT 1 FROM zones_collecte z WHERE z.id = NEW.zone_id AND z.commune_id = NEW.commune_id AND z.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'SECTEUR_AUTRE_COMMUNE: ce secteur n''est pas un secteur de la commune.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.ferme_le IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.ferme_le IS DISTINCT FROM OLD.ferme_le)
     AND NEW.ferme_le > app.jour_tunis() THEN
    RAISE EXCEPTION 'FERMETURE_FUTURE: une fermeture s''enregistre une fois constatée ; sa date n''est pas dans l''avenir.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.source_creation IS DISTINCT FROM OLD.source_creation THEN
    RAISE EXCEPTION 'SOURCE_FIGEE: la source d''un établissement est celle de son inscription.' USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_controler_etablissement ON commerces;
CREATE TRIGGER trg_controler_etablissement BEFORE INSERT OR UPDATE ON commerces
  FOR EACH ROW EXECUTE FUNCTION app.controler_etablissement();

-- ---------------------------------------------------------------------------
-- 4. Qui écrit : le directeur de la commune ; la FNCT lit
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS commerces_insert ON commerces;
CREATE POLICY commerces_insert ON commerces FOR INSERT WITH CHECK (app.peut_emettre_document(commune_id));
DROP POLICY IF EXISTS commerces_update ON commerces;
CREATE POLICY commerces_update ON commerces FOR UPDATE
  USING (deleted_at IS NULL AND app.peut_emettre_document(commune_id))
  WITH CHECK (app.peut_emettre_document(commune_id));
REVOKE DELETE, TRUNCATE ON commerces FROM siipi_app;

-- ---------------------------------------------------------------------------
-- 5. L'identité, séparée
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS identites_commerces (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commerce_id      UUID NOT NULL REFERENCES commerces(id) ON DELETE CASCADE,
    commune_id       TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    nom_responsable  TEXT NOT NULL CHECK (length(btrim(nom_responsable)) > 0),
    -- Huit chiffres, sans indicatif ni séparateur.
    telephone        TEXT CHECK (telephone IS NULL OR telephone ~ '^[0-9]{8}$'),
    empreinte_cin    TEXT CHECK (empreinte_cin IS NULL OR empreinte_cin ~ '^[0-9a-f]{64}$'),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at       TIMESTAMPTZ,
    deleted_by       UUID REFERENCES users(id) ON DELETE SET NULL
);
COMMENT ON TABLE identites_commerces IS
  'Identité du responsable d''un établissement (jalon G, lot G2a ; décision G-3), séparée du registre : nom, téléphone, empreinte du CIN. Lue par le seul directeur de la commune (pas la FNCT), chaque lecture journalisée par l''API. Écriture refusée sans hébergement accrédité ni récépissé INPDP. Hors du journal d''audit des écritures, qui en recopierait le contenu.';
COMMENT ON COLUMN identites_commerces.empreinte_cin IS
  'HMAC-SHA256 du CIN normalisé, sous une clé de commune dérivée de SIIPI_SECRET_IDENTITES (services/identites.ts), comme pour les pré-collecteurs. Le CIN en clair n''est jamais écrit ni journalisé. Une même personne peut tenir plusieurs établissements : l''empreinte n''est pas unique.';
COMMENT ON COLUMN identites_commerces.telephone IS 'Téléphone du responsable, huit chiffres. Donnée personnelle : lue par le seul directeur, chaque lecture journalisée.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_identite_commerce
  ON identites_commerces (commerce_id) WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION app.controler_identite_commerce()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
  -- Retirer une identité reste toujours possible : la garde empêche d'ÉCRIRE une
  -- identité, jamais de l'effacer.
  IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF COALESCE((SELECT valeur FROM parametres_nationaux WHERE cle = 'hebergement_pii_accredite'), 'false') <> 'true' THEN
    RAISE EXCEPTION 'IDENTITE_HEBERGEMENT: les identités ne s''enregistrent pas tant que la FNCT n''a pas déclaré l''hébergement accrédité.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM parametres_commune
                  WHERE commune_id = NEW.commune_id AND recepisse_inpdp IS NOT NULL) THEN
    RAISE EXCEPTION 'IDENTITE_RECEPISSE: la commune % n''a pas enregistré son récépissé de déclaration INPDP.', NEW.commune_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM commerces WHERE id = NEW.commerce_id AND commune_id = NEW.commune_id) THEN
    RAISE EXCEPTION 'IDENTITE_COMMUNE: l''établissement n''appartient pas à la commune %.', NEW.commune_id
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_controler_identite_commerce ON identites_commerces;
CREATE TRIGGER trg_controler_identite_commerce
  BEFORE INSERT OR UPDATE ON identites_commerces
  FOR EACH ROW EXECUTE FUNCTION app.controler_identite_commerce();

ALTER TABLE identites_commerces ENABLE ROW LEVEL SECURITY;
ALTER TABLE identites_commerces FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS identite_commerce_select ON identites_commerces;
CREATE POLICY identite_commerce_select ON identites_commerces FOR SELECT
  USING (deleted_at IS NULL AND app.peut_voir_identite(commune_id));
DROP POLICY IF EXISTS identite_commerce_insert ON identites_commerces;
CREATE POLICY identite_commerce_insert ON identites_commerces FOR INSERT
  WITH CHECK (app.peut_voir_identite(commune_id));
DROP POLICY IF EXISTS identite_commerce_update ON identites_commerces;
CREATE POLICY identite_commerce_update ON identites_commerces FOR UPDATE
  USING (deleted_at IS NULL AND app.peut_voir_identite(commune_id))
  WITH CHECK (app.peut_voir_identite(commune_id));
GRANT SELECT, INSERT, UPDATE ON identites_commerces TO siipi_app;
REVOKE DELETE, TRUNCATE ON identites_commerces FROM siipi_app;

-- Le journal des consultations dit aussi quels établissements ont vu leur
-- identité exposée.
ALTER TABLE access_log ADD COLUMN IF NOT EXISTS commerce_ids UUID[] NOT NULL DEFAULT ARRAY[]::uuid[];
COMMENT ON COLUMN access_log.commerce_ids IS
  'Établissements dont l''identité du responsable a été exposée par la requête (jalon G, lot G2a).';

CREATE OR REPLACE FUNCTION app.enregistrer_acces_identites_commerces(p_endpoint text, p_commerces uuid[], p_commune text)
  RETURNS void
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  INSERT INTO access_log (user_id, user_role, commune_id, endpoint, records_count, communes_concernees, commerce_ids)
  VALUES (app.current_user_id(), app.current_role_name(), app.current_commune(), p_endpoint,
          cardinality(p_commerces), ARRAY[p_commune], p_commerces);
$$;
REVOKE ALL ON FUNCTION app.enregistrer_acces_identites_commerces(text, uuid[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.enregistrer_acces_identites_commerces(text, uuid[], text) TO siipi_app;

-- Le statut de l'identifiant se calcule : le matricule s'il est là, le CIN si
-- une empreinte est enregistrée, sinon « à compléter ». Une colonne le dirait
-- deux fois, et finirait par contredire la table d'identité. La fonction ne rend
-- que le statut, jamais l'identité : la FNCT et l'écran de liste le lisent sans
-- lire l'identité.
CREATE OR REPLACE FUNCTION app.statut_identifiant_commerce(p_commerce uuid)
  RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT CASE
           WHEN c.matricule_fiscal IS NOT NULL THEN 'matricule'
           WHEN EXISTS (SELECT 1 FROM identites_commerces i
                         WHERE i.commerce_id = c.id AND i.deleted_at IS NULL AND i.empreinte_cin IS NOT NULL) THEN 'cin'
           ELSE 'a_completer'
         END
    FROM commerces c
   WHERE c.id = p_commerce AND app.can_write_commune(c.commune_id)
$$;
REVOKE ALL ON FUNCTION app.statut_identifiant_commerce(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.statut_identifiant_commerce(uuid) TO siipi_app;

-- ---------------------------------------------------------------------------
-- 6. app.supprimer : `commerces` en sort, l'identité y entre
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.supprimer(p_table text, p_id text)
  RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$function$
DECLARE
  v_commune text;
BEGIN
  -- `commerces` n'y est plus : un établissement se ferme, il ne se supprime
  -- pas (G-4, 099).
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
                     'incidents_travail', 'conventions_commerciales',
                     'donnees_personnelles_barbechas', 'identites_commerces',
                     'carnets_de_bord', 'quotas_carburant',
                     'immobilisations_engins', 'etapes_declassement', 'pieces_declassement',
                     'etudes_cout_complet', 'demarches_formalisation',
                     'demandes_carte_precollecteur', 'pieces_demande_carte',
                     'jalons_acteurs', 'agrements_intermediaires',
                     'grilles_tarifaires') THEN
    RAISE EXCEPTION 'TABLE_NON_SUPPRIMABLE: %', p_table;
  END IF;

  EXECUTE format('SELECT commune_id FROM %I WHERE id::text = $1 AND deleted_at IS NULL', p_table)
     INTO v_commune USING p_id;

  IF v_commune IS NULL THEN
    RETURN false;
  END IF;

  -- L'identité se retire comme elle se lit : par le seul admin de la commune.
  -- Le circuit d'un dossier de déclassement et ses pièces, comme ils s'inscrivent.
  -- Une demande de carte et ses pièces, une étape d'accompagnement, un agrément
  -- et un projet de grille tarifaire, par le directeur qui les enregistre (une
  -- grille approuvée ne se retire pas : sa règle le refuse).
  IF p_table IN ('donnees_personnelles_barbechas', 'identites_commerces') THEN
    IF NOT app.peut_voir_identite(v_commune) THEN
      RAISE EXCEPTION 'ACCES_REFUSE' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF p_table IN ('etapes_declassement', 'pieces_declassement') THEN
    IF NOT app.peut_instruire_declassement(v_commune) THEN
      RAISE EXCEPTION 'ACCES_REFUSE' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF p_table IN ('demandes_carte_precollecteur', 'pieces_demande_carte', 'jalons_acteurs', 'agrements_intermediaires',
                    'grilles_tarifaires') THEN
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
$function$;

-- ---------------------------------------------------------------------------
-- 7. La documentation que lira l'administrateur
-- ---------------------------------------------------------------------------
COMMENT ON TABLE commerces IS
  'Les établissements de la commune — commerces, institutions, services (jalon G ; l''écran dit « Établissements »). Recensés par l''import de la liste TCL, l''import d''un fichier open data, le recensement Kobo ou la saisie ; jamais supprimés : fermés, avec leur date et leur motif. Le directeur écrit, la FNCT lit.';
COMMENT ON COLUMN commerces.nom IS 'Raison sociale (ou enseigne quand la raison sociale manque). Obligatoire.';
COMMENT ON COLUMN commerces.activite IS 'L''activité telle que la source la donne (libellé du fichier, déclaration) ; la catégorie retenue est categorie_activite.';
COMMENT ON COLUMN commerces.categorie_activite IS
  'Code de la liste nationale datée categories_activite_assimiles (098), vérifié en vigueur à l''inscription et à chaque changement. Vide seulement pour une ligne antérieure au jalon G.';
COMMENT ON COLUMN commerces.matricule_fiscal IS
  'Matricule fiscal normalisé (majuscules, sans espace ni barre) : 7 chiffres et la lettre clé, puis, s''ils sont connus, code TVA, code catégorie et numéro d''établissement secondaire. Unique dans la commune.';
COMMENT ON COLUMN commerces.zone_id IS 'Secteur de la commune où se trouve l''établissement.';
COMMENT ON COLUMN commerces.geom IS 'Position relevée (WGS 84), jamais déduite de l''adresse ; en Tunisie.';
COMMENT ON COLUMN commerces.precision_m IS 'Précision de la position relevée, en mètres ; présente si et seulement si la position l''est.';
COMMENT ON COLUMN commerces.unite_echelle IS 'Unité d''échelle du WaCT (chambres, chaises, étals, m²…), parmi celles que la catégorie admet.';
COMMENT ON COLUMN commerces.valeur_echelle IS 'Nombre d''unités d''échelle (ex. 40 chambres).';
COMMENT ON COLUMN commerces.surface_m2 IS 'Surface, en m², quand elle est connue ; sert aux majorations d''une grille qui le prévoit.';
COMMENT ON COLUMN commerces.statut IS 'actif · ferme (avec ferme_le et motif_statut) · a_verifier (avec motif_statut). Un établissement ne se supprime jamais.';
COMMENT ON COLUMN commerces.ferme_le IS 'Date de fermeture constatée : présente si et seulement si le statut est « ferme » ; jamais dans l''avenir.';
COMMENT ON COLUMN commerces.motif_statut IS 'Motif du dernier changement de statut (fermeture, vérification, réouverture). L''historique des changements est au journal d''audit.';
COMMENT ON COLUMN commerces.source_creation IS 'D''où vient l''inscription : anterieur (avant le jalon G), saisie, import_tcl, open_data, kobo. Figée.';
COMMENT ON COLUMN commerces.produit_dangereux IS 'Déclaratif : l''établissement produit un flux dangereux, à orienter vers sa filière ; jamais couvert par une convention.';
COMMENT ON COLUMN commerces.actif IS 'Calculé : statut = actif. Lu par l''indicateur M2-2 (051, 070) et la complétude (073).';
COMMENT ON FUNCTION app.statut_identifiant_commerce(uuid) IS
  'Le statut de l''identifiant d''un établissement : matricule, cin (une empreinte est enregistrée) ou a_completer. Ne rend jamais l''identité elle-même.';
