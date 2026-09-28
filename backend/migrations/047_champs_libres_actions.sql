-- ===========================================================================
-- Migration 047 — Jalon 6 : champs libres, étiquettes et actions planifiées
--                 sur les points de collecte (TDR §3.2.3)
--
-- B3.4 — le tableau attributaire avec champs libres : une commune ajoute
--        elle-même une colonne (« accès camion », « nombre de bacs »,
--        « riverain à prévenir »…) et la renseigne point par point ou par lot.
-- B3.5 — la planification d'actions et le filtrage par étiquettes : on
--        étiquette des points (« déchets verts », « marché du jeudi »), on
--        filtre dessus, et on planifie une action sur la sélection — une
--        campagne de déchets verts le 12 octobre sur ces trente points — dont
--        on suit l'avancement point par point.
--
-- LA CONDITION DU CAHIER DES CHARGES : tout cela sans développeur. Une colonne
-- libre ne peut donc pas être une colonne SQL — ajouter une colonne à une
-- table est une migration, pas un geste d'administrateur municipal. Les
-- définitions vivent dans `champs_points` (une ligne par champ et par
-- commune), et les valeurs dans `points_collecte.attributs`, un objet JSON
-- indexé par l'identifiant du champ.
--
-- POURQUOI L'IDENTIFIANT ET NON LE LIBELLÉ. Renommer « accès camion » en
-- « accès poids lourd » ne doit rien perdre ni rien réécrire : la valeur est
-- attachée au champ, pas à son nom du moment.
--
-- POURQUOI SUR LE POINT ET NON DANS UNE TABLE À PART. Les valeurs et les
-- étiquettes sont des propriétés du point : les écrire sur sa ligne les fait
-- entrer dans son historique (journal d'audit, migration 014), que l'onglet
-- « Historique » du circuit affiche. Une table de valeurs aurait eu son propre
-- journal, lu nulle part.
--
-- CE JOURNAL MANQUAIT. L'onglet « Historique » lisait les lignes d'audit de
-- points_collecte depuis la migration 028, mais aucun déclencheur ne les
-- écrivait : seules les modifications du circuit y figuraient. Il est posé
-- ici (section 5), faute de quoi « qui a mis ce point à accès camion = non,
-- et quand » resterait sans réponse.
--
-- LE TYPE D'UN CHAMP NE CHANGE PAS. Passer « nombre de bacs » de nombre à
-- texte laisserait en base des valeurs d'un type que le champ ne déclare
-- plus. On crée un autre champ ; l'ancien se retire.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Les définitions de champs (B3.4)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS champs_points (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id   TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,

    libelle      TEXT NOT NULL,
    -- Le portail est bilingue : un champ sans libellé arabe s'affiche en
    -- français plutôt que de ne pas s'afficher.
    libelle_ar   TEXT,
    type         TEXT NOT NULL,
    -- Les choix proposés, pour un champ « liste » seulement.
    options      TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
    -- Rang de la colonne dans le tableau.
    ordre        INTEGER NOT NULL DEFAULT 0,

    created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at   TIMESTAMPTZ,
    deleted_by   UUID REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT champs_points_type_valide CHECK (type IN ('texte', 'nombre', 'oui_non', 'liste', 'date')),
    CONSTRAINT champs_points_libelle_non_vide CHECK (length(btrim(libelle)) > 0),
    -- Une liste sans choix ne se renseigne pas ; des choix sur un autre type
    -- ne serviraient à rien et laisseraient croire le contraire.
    CONSTRAINT champs_points_options_coherentes CHECK (
      (type = 'liste' AND cardinality(options) > 0) OR (type <> 'liste' AND cardinality(options) = 0))
);

-- Deux colonnes « Accès camion » dans le même tableau : on ne saurait plus
-- laquelle on filtre.
CREATE UNIQUE INDEX IF NOT EXISTS idx_champs_points_libelle_unique
  ON champs_points (commune_id, lower(btrim(libelle))) WHERE deleted_at IS NULL;

COMMENT ON TABLE champs_points IS
  'Champs libres du tableau des points (TDR §3.2.3, B3.4), définis par la commune elle-même. Les valeurs sont dans points_collecte.attributs, indexées par l''identifiant du champ. Le type ne change pas après création.';

-- ---------------------------------------------------------------------------
-- 2. Les étiquettes (B3.5)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS etiquettes_points (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id   TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    nom          TEXT NOT NULL,
    -- Une couleur parmi une palette fixe : c'est ce qui la rend lisible sur la
    -- carte et dans le tableau, et une couleur libre finirait illisible.
    couleur      TEXT NOT NULL DEFAULT 'ardoise',

    created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at   TIMESTAMPTZ,
    deleted_by   UUID REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT etiquettes_points_nom_non_vide CHECK (length(btrim(nom)) > 0),
    CONSTRAINT etiquettes_points_couleur_valide CHECK (couleur IN (
      'ardoise', 'rouge', 'orange', 'ambre', 'vert', 'emeraude', 'bleu', 'violet', 'rose'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_etiquettes_points_nom_unique
  ON etiquettes_points (commune_id, lower(btrim(nom))) WHERE deleted_at IS NULL;

COMMENT ON TABLE etiquettes_points IS
  'Étiquettes des points de collecte (B3.5), propres à chaque commune. Un point porte la liste de ses étiquettes (points_collecte.etiquettes).';

-- ---------------------------------------------------------------------------
-- 3. Les valeurs et les étiquettes, sur le point
-- ---------------------------------------------------------------------------

ALTER TABLE points_collecte ADD COLUMN IF NOT EXISTS attributs  JSONB  NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE points_collecte ADD COLUMN IF NOT EXISTS etiquettes UUID[] NOT NULL DEFAULT ARRAY[]::uuid[];

ALTER TABLE points_collecte DROP CONSTRAINT IF EXISTS points_collecte_attributs_objet;
ALTER TABLE points_collecte ADD  CONSTRAINT points_collecte_attributs_objet CHECK (jsonb_typeof(attributs) = 'object');

-- Le filtre par étiquette (« @> ») et par valeur de champ passent par ces index.
CREATE INDEX IF NOT EXISTS idx_points_collecte_etiquettes
  ON points_collecte USING gin (etiquettes) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_points_collecte_attributs
  ON points_collecte USING gin (attributs jsonb_path_ops) WHERE deleted_at IS NULL;

COMMENT ON COLUMN points_collecte.attributs IS
  'Valeurs des champs libres (B3.4) : { "<id du champ>": valeur }. Le type de chaque valeur est celui du champ, contrôlé par l''API ; une clé absente est une case vide.';
COMMENT ON COLUMN points_collecte.etiquettes IS
  'Étiquettes du point (B3.5), identifiants de etiquettes_points de la même commune. Une étiquette retirée n''est plus affichée ni filtrée, mais son identifiant reste lisible dans l''historique.';

-- Une étiquette appartient à la commune du point. Sans ce contrôle, une
-- commune pourrait poser sur ses points l'étiquette d'une autre, et la
-- retrouver ensuite dans ses filtres. SECURITY DEFINER : la vérification doit
-- voir l'étiquette même si la RLS la cache à l'appelant.
CREATE OR REPLACE FUNCTION app.controler_etiquettes_point() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
  IF cardinality(NEW.etiquettes) > 0 AND EXISTS (
       SELECT 1 FROM unnest(NEW.etiquettes) AS e(id)
        WHERE NOT EXISTS (
          SELECT 1 FROM etiquettes_points t
           WHERE t.id = e.id AND t.commune_id = NEW.commune_id
             -- Une étiquette retirée peut rester sur un point (elle n'est
             -- plus lue), mais on ne la pose plus.
             AND (t.deleted_at IS NULL OR (TG_OP = 'UPDATE' AND e.id = ANY (OLD.etiquettes)))))
  THEN
    RAISE EXCEPTION 'ETIQUETTE_AUTRE_COMMUNE' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_points_collecte_etiquettes ON points_collecte;
CREATE TRIGGER trg_points_collecte_etiquettes BEFORE INSERT OR UPDATE OF etiquettes, commune_id ON points_collecte
  FOR EACH ROW EXECUTE FUNCTION app.controler_etiquettes_point();

-- ---------------------------------------------------------------------------
-- 4. Les actions planifiées (B3.5)
--
-- Une action vise un ensemble de points arrêté au moment où on la planifie
-- (« ces trente points-là »), pas une étiquette : une étiquette posée demain
-- sur un trente et unième point ne doit pas l'ajouter en silence à une
-- campagne déjà annoncée aux riverains. On ajoute un point à une action en
-- le disant.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS actions_planifiees (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id   TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,

    titre        TEXT NOT NULL,
    description  TEXT,
    date_prevue  DATE NOT NULL,
    -- Une campagne peut durer plusieurs jours.
    date_fin     DATE,
    -- Qui la mène : un service, une équipe, un prestataire — en texte libre.
    responsable  TEXT,
    statut       TEXT NOT NULL DEFAULT 'planifiee',
    terminee_le  TIMESTAMPTZ,

    created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at   TIMESTAMPTZ,
    deleted_by   UUID REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT actions_planifiees_titre_non_vide CHECK (length(btrim(titre)) > 0),
    CONSTRAINT actions_planifiees_statut_valide CHECK (statut IN ('planifiee', 'terminee', 'annulee')),
    CONSTRAINT actions_planifiees_periode CHECK (date_fin IS NULL OR date_fin >= date_prevue)
);

CREATE INDEX IF NOT EXISTS idx_actions_planifiees_commune
  ON actions_planifiees (commune_id, date_prevue) WHERE deleted_at IS NULL;

COMMENT ON TABLE actions_planifiees IS
  'Actions planifiées sur des points de collecte (B3.5) : une campagne de déchets verts, un remplacement de bacs, une sensibilisation. L''avancement se lit point par point (actions_points).';

CREATE TABLE IF NOT EXISTS actions_points (
    -- Un identifiant propre, pour que le journal d'audit rattache chaque
    -- ajout, retrait ou « fait » à sa ligne.
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_id    UUID NOT NULL REFERENCES actions_planifiees(id) ON DELETE CASCADE,
    point_id     UUID NOT NULL REFERENCES points_collecte(id) ON DELETE CASCADE,
    commune_id   TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    fait_le      TIMESTAMPTZ,
    fait_par     UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT actions_points_unique UNIQUE (action_id, point_id)
);

CREATE INDEX IF NOT EXISTS idx_actions_points_point ON actions_points (point_id);

-- L'action et le point sont de la commune de la ligne.
CREATE OR REPLACE FUNCTION app.controler_commune_action_point() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM actions_planifiees WHERE id = NEW.action_id AND commune_id = NEW.commune_id)
     OR NOT EXISTS (SELECT 1 FROM points_collecte WHERE id = NEW.point_id AND commune_id = NEW.commune_id) THEN
    RAISE EXCEPTION 'ACTION_AUTRE_COMMUNE' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_actions_points_commune ON actions_points;
CREATE TRIGGER trg_actions_points_commune BEFORE INSERT OR UPDATE OF action_id, point_id, commune_id ON actions_points
  FOR EACH ROW EXECUTE FUNCTION app.controler_commune_action_point();

-- ---------------------------------------------------------------------------
-- 5. Horodatage et journal
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_champs_points_updated_at ON champs_points;
CREATE TRIGGER trg_champs_points_updated_at BEFORE UPDATE ON champs_points
  FOR EACH ROW EXECUTE FUNCTION zones_collecte_set_updated_at();
DROP TRIGGER IF EXISTS trg_etiquettes_points_updated_at ON etiquettes_points;
CREATE TRIGGER trg_etiquettes_points_updated_at BEFORE UPDATE ON etiquettes_points
  FOR EACH ROW EXECUTE FUNCTION zones_collecte_set_updated_at();
DROP TRIGGER IF EXISTS trg_actions_planifiees_updated_at ON actions_planifiees;
CREATE TRIGGER trg_actions_planifiees_updated_at BEFORE UPDATE ON actions_planifiees
  FOR EACH ROW EXECUTE FUNCTION zones_collecte_set_updated_at();

DROP TRIGGER IF EXISTS trg_audit_points_collecte ON points_collecte;
CREATE TRIGGER trg_audit_points_collecte AFTER INSERT OR UPDATE OR DELETE ON points_collecte
  FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement();
DROP TRIGGER IF EXISTS trg_audit_champs_points ON champs_points;
CREATE TRIGGER trg_audit_champs_points AFTER INSERT OR UPDATE OR DELETE ON champs_points
  FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement();
DROP TRIGGER IF EXISTS trg_audit_etiquettes_points ON etiquettes_points;
CREATE TRIGGER trg_audit_etiquettes_points AFTER INSERT OR UPDATE OR DELETE ON etiquettes_points
  FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement();
DROP TRIGGER IF EXISTS trg_audit_actions_planifiees ON actions_planifiees;
CREATE TRIGGER trg_audit_actions_planifiees AFTER INSERT OR UPDATE OR DELETE ON actions_planifiees
  FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement();
DROP TRIGGER IF EXISTS trg_audit_actions_points ON actions_points;
CREATE TRIGGER trg_audit_actions_points AFTER INSERT OR UPDATE OR DELETE ON actions_points
  FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement();

-- ---------------------------------------------------------------------------
-- 6. Cloisonnement
--
-- Les définitions de champs et les étiquettes se lisent comme les points :
-- le prestataire chargé d'un circuit en lit les arrêts (migration 028), il
-- doit pouvoir lire le nom des colonnes et des étiquettes qu'il y voit. Seule
-- la commune (et la FNCT) les écrit. Les actions planifiées sont l'affaire de
-- la commune.
-- ---------------------------------------------------------------------------

ALTER TABLE champs_points       ENABLE ROW LEVEL SECURITY;
ALTER TABLE champs_points       FORCE  ROW LEVEL SECURITY;
ALTER TABLE etiquettes_points   ENABLE ROW LEVEL SECURITY;
ALTER TABLE etiquettes_points   FORCE  ROW LEVEL SECURITY;
ALTER TABLE actions_planifiees  ENABLE ROW LEVEL SECURITY;
ALTER TABLE actions_planifiees  FORCE  ROW LEVEL SECURITY;
ALTER TABLE actions_points      ENABLE ROW LEVEL SECURITY;
ALTER TABLE actions_points      FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS champs_points_select ON champs_points;
CREATE POLICY champs_points_select ON champs_points FOR SELECT
  USING (deleted_at IS NULL AND app.can_read_commune(commune_id));
DROP POLICY IF EXISTS champs_points_insert ON champs_points;
CREATE POLICY champs_points_insert ON champs_points FOR INSERT
  WITH CHECK (app.can_write_commune(commune_id));
DROP POLICY IF EXISTS champs_points_update ON champs_points;
CREATE POLICY champs_points_update ON champs_points FOR UPDATE
  USING (deleted_at IS NULL AND app.can_write_commune(commune_id))
  WITH CHECK (app.can_write_commune(commune_id));

DROP POLICY IF EXISTS etiquettes_points_select ON etiquettes_points;
CREATE POLICY etiquettes_points_select ON etiquettes_points FOR SELECT
  USING (deleted_at IS NULL AND app.can_read_commune(commune_id));
DROP POLICY IF EXISTS etiquettes_points_insert ON etiquettes_points;
CREATE POLICY etiquettes_points_insert ON etiquettes_points FOR INSERT
  WITH CHECK (app.can_write_commune(commune_id));
DROP POLICY IF EXISTS etiquettes_points_update ON etiquettes_points;
CREATE POLICY etiquettes_points_update ON etiquettes_points FOR UPDATE
  USING (deleted_at IS NULL AND app.can_write_commune(commune_id))
  WITH CHECK (app.can_write_commune(commune_id));

DROP POLICY IF EXISTS actions_planifiees_select ON actions_planifiees;
CREATE POLICY actions_planifiees_select ON actions_planifiees FOR SELECT
  USING (deleted_at IS NULL AND app.can_write_commune(commune_id));
DROP POLICY IF EXISTS actions_planifiees_insert ON actions_planifiees;
CREATE POLICY actions_planifiees_insert ON actions_planifiees FOR INSERT
  WITH CHECK (app.can_write_commune(commune_id));
DROP POLICY IF EXISTS actions_planifiees_update ON actions_planifiees;
CREATE POLICY actions_planifiees_update ON actions_planifiees FOR UPDATE
  USING (deleted_at IS NULL AND app.can_write_commune(commune_id))
  WITH CHECK (app.can_write_commune(commune_id));

-- Le lien action ↔ point se retire vraiment : c'est un lien, pas une donnée,
-- et le journal d'audit garde la trace de son retrait.
DROP POLICY IF EXISTS actions_points_tout ON actions_points;
CREATE POLICY actions_points_tout ON actions_points FOR ALL
  USING (app.can_write_commune(commune_id))
  WITH CHECK (app.can_write_commune(commune_id));

GRANT SELECT, INSERT, UPDATE ON champs_points, etiquettes_points, actions_planifiees TO siipi_app;
REVOKE DELETE, TRUNCATE ON champs_points, etiquettes_points, actions_planifiees FROM siipi_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON actions_points TO siipi_app;
REVOKE TRUNCATE ON actions_points FROM siipi_app;

-- ---------------------------------------------------------------------------
-- 7. Retrait logique : app.supprimer() s'ouvre aux champs, aux étiquettes et
--    aux actions.
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
                     'interventions_maintenance', 'plans_entretien',
                     'champs_points', 'etiquettes_points', 'actions_planifiees') THEN
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
