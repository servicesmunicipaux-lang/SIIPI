-- ===========================================================================
-- Migration 042 — Les points de collecte proposés par les citoyens (M3.1)
--
-- Le cahier des charges tient en deux phrases : « Si un point est manquant,
-- l'utilisateur peut le proposer (géolocalisation + photo). Statut "En
-- attente" jusqu'à validation par l'administrateur. »
--
-- POURQUOI UNE TABLE À PART, ET NON UNE COLONNE « statut » SUR points_collecte.
-- Un point de collecte appartient à un CIRCUIT — la colonne est obligatoire,
-- et c'est juste : un arrêt sans tournée n'est desservi par personne. Or une
-- proposition citoyenne n'a précisément pas de circuit : c'est ce que le
-- citoyen demande à la commune de décider. La ranger dans points_collecte
-- obligerait soit à rendre circuit_id facultatif — et tout le module 2 devrait
-- alors se demander, partout, si un point est « vrai » —, soit à lui inventer
-- un circuit d'office. Deux tables, deux natures : une demande, et un arrêt.
--
-- CE QUE LA VALIDATION PRODUIT. Un point dans points_collecte, rattaché au
-- circuit choisi par la commune, avec sa provenance inscrite. La demande, elle,
-- est conservée et pointe vers le point créé : six mois plus tard, on peut
-- encore répondre à « qu'est devenue ma proposition ? ».
--
-- LE REFUS EXIGE UN MOTIF, comme pour une réclamation (B5.1.2). Un refus sans
-- motif est ce qui transforme un outil de participation en boîte noire, et la
-- fois suivante plus personne ne propose rien.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS points_suggeres (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id      TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    citoyen_id      UUID REFERENCES citoyens(id) ON DELETE SET NULL,

    -- Ce que le citoyen en dit, dans ses mots. « En face de la mosquée »,
    -- « derrière l'école ». On ne normalise pas : c'est ainsi qu'un agent
    -- retrouvera l'endroit.
    nom             TEXT,
    commentaire     TEXT,
    geom            geometry(Point, 4326) NOT NULL,
    -- Précision du relevé du téléphone, en mètres. À 5 m on désigne une porte,
    -- à 60 m un quartier : la commune doit savoir laquelle des deux elle lit.
    precision_m     NUMERIC(6,2),
    photo_url       TEXT,

    statut          TEXT NOT NULL DEFAULT 'en_attente',
    motif_refus     TEXT,
    decide_par      UUID REFERENCES users(id) ON DELETE SET NULL,
    decide_le       TIMESTAMPTZ,
    -- Le point réellement créé, quand la proposition a été retenue. C'est ce
    -- lien qui permet de répondre, six mois plus tard, à « qu'est devenue ma
    -- proposition ? ».
    point_collecte_id UUID REFERENCES points_collecte(id) ON DELETE SET NULL,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT points_suggeres_statut_valide CHECK (
      statut IN ('en_attente', 'valide', 'refuse')),
    -- Un refus sans motif est une boîte noire. La base le refuse, pour que
    -- personne n'ait à se fier à un écran pour l'imposer.
    CONSTRAINT points_suggeres_refus_motive CHECK (
      statut <> 'refuse' OR (motif_refus IS NOT NULL AND btrim(motif_refus) <> '')),
    -- Une proposition retenue désigne le point qu'elle a produit. Sans lui,
    -- « validée » ne veut rien dire de vérifiable.
    CONSTRAINT points_suggeres_validation_complete CHECK (
      statut <> 'valide' OR point_collecte_id IS NOT NULL),
    CONSTRAINT points_suggeres_decision_datee CHECK (
      statut = 'en_attente' OR decide_le IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_points_suggeres_commune
  ON points_suggeres (commune_id, statut, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_points_suggeres_citoyen
  ON points_suggeres (citoyen_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_points_suggeres_geom
  ON points_suggeres USING GIST (geom);

COMMENT ON TABLE points_suggeres IS
  'Points de collecte proposés par les citoyens (TDR M3.1). Une DEMANDE, distincte d''un arrêt de tournée : elle n''a pas de circuit, c''est précisément ce qu''elle demande à la commune de décider.';
COMMENT ON COLUMN points_suggeres.precision_m IS
  'Précision du relevé du téléphone, en mètres. À 5 m on désigne une porte, à 60 m un quartier — la commune doit savoir laquelle des deux elle lit.';
COMMENT ON COLUMN points_suggeres.point_collecte_id IS
  'Le point réellement créé lorsque la proposition a été retenue. C''est ce lien qui permet de répondre, six mois plus tard, à « qu''est devenue ma proposition ? ».';

-- ---------------------------------------------------------------------------
-- La provenance d'un point créé ainsi est inscrite dans points_collecte.
-- Sans cette valeur, un arrêt proposé par un habitant serait indiscernable
-- d'un arrêt relevé au GPS par le service — et la commune ne saurait plus
-- lequel de ses points repose sur une vérification de terrain.
-- ---------------------------------------------------------------------------

ALTER TABLE points_collecte DROP CONSTRAINT IF EXISTS points_collecte_source_valide;
ALTER TABLE points_collecte ADD  CONSTRAINT points_collecte_source_valide
  CHECK (source IN ('import_kml', 'saisie', 'suggestion_citoyen'));

COMMENT ON COLUMN points_collecte.source IS
  'import_kml | saisie | suggestion_citoyen. Un arrêt proposé par un habitant n''a pas la même valeur de preuve qu''un relevé GPS du service : la colonne garde la différence lisible.';

-- ---------------------------------------------------------------------------
-- Le point existant le plus proche d'une position.
--
-- Une proposition à quinze mètres d'un arrêt déjà desservi est un doublon, et
-- le citoyen qui l'a faite ne le sait pas — il ne voit pas la tournée. La
-- commune doit le voir AVANT de valider, sans avoir à chercher : l'écart en
-- mètres et le nom du point voisin suffisent à trancher en une seconde.
--
-- La fonction ne conclut pas. Elle mesure ; c'est la commune qui décide qu'un
-- point à vingt mètres est un doublon ou une deuxième benne légitime.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.point_voisin(p_commune text, p_geom geometry)
  RETURNS TABLE (
    point_id     uuid,
    nom          text,
    circuit_id   uuid,
    circuit      text,
    distance_m   numeric
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT pc.id, pc.nom, c.id, c.nom,
         round(ST_Distance(pc.geom::geography, p_geom::geography)::numeric, 1)
    FROM points_collecte pc
    JOIN circuits c ON c.id = pc.circuit_id AND c.deleted_at IS NULL
   WHERE pc.commune_id = p_commune AND pc.deleted_at IS NULL AND pc.actif
   ORDER BY pc.geom <-> p_geom
   LIMIT 1
$$;

COMMENT ON FUNCTION app.point_voisin(text, geometry) IS
  'Le point de collecte actif le plus proche d''une position, et sa distance en mètres. Sert à montrer un doublon probable AVANT de valider une proposition citoyenne. Mesure, ne conclut pas.';

GRANT EXECUTE ON FUNCTION app.point_voisin(text, geometry) TO siipi_app;

-- ---------------------------------------------------------------------------
-- Cloisonnement
--
-- Le citoyen voit SES propositions et rien d'autre : la liste des propositions
-- d'une commune dessine, par recoupement, où habitent ceux qui les ont faites.
-- ---------------------------------------------------------------------------

ALTER TABLE points_suggeres ENABLE ROW LEVEL SECURITY;
ALTER TABLE points_suggeres FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS points_suggeres_select ON points_suggeres;
CREATE POLICY points_suggeres_select ON points_suggeres FOR SELECT
  USING (
    deleted_at IS NULL
    AND (
      app.can_read_commune(commune_id)
      OR (app.current_role_name() = 'citoyen' AND citoyen_id = app.my_citizen_id())
    )
  );

DROP POLICY IF EXISTS points_suggeres_insert ON points_suggeres;
CREATE POLICY points_suggeres_insert ON points_suggeres FOR INSERT
  WITH CHECK (
    app.can_write_commune(commune_id)
    OR (app.current_role_name() = 'citoyen'
        AND citoyen_id = app.my_citizen_id()
        AND commune_id = app.current_commune()
        -- Une proposition naît « en attente ». Personne ne dépose une
        -- proposition déjà validée par elle-même.
        AND statut = 'en_attente')
  );

-- Décider appartient à la commune. Le citoyen ne modifie pas sa proposition
-- après coup : elle a été instruite, et une demande qui change sous les yeux
-- de celui qui l'instruit n'est plus une demande.
DROP POLICY IF EXISTS points_suggeres_update ON points_suggeres;
CREATE POLICY points_suggeres_update ON points_suggeres FOR UPDATE
  USING (app.can_write_commune(commune_id))
  WITH CHECK (app.can_write_commune(commune_id));

GRANT SELECT, INSERT, UPDATE ON points_suggeres TO siipi_app;
REVOKE DELETE, TRUNCATE ON points_suggeres FROM siipi_app;

-- ---------------------------------------------------------------------------
-- Retrait
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
                     'personnel', 'fichiers', 'points_suggeres') THEN
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
