-- ============================================================================
-- 028_module2_circuits_points_collecte.sql
--
-- Module 2 — Gestion des circuits, taillé sur les données réelles de
-- Dar Chaabane El Fehri (dossier PCGD, collecte de mai 2024).
--
-- Ce que le registre officiel de la commune impose et que le schéma ne savait
-- pas dire — « كشف حول مسالك رفع الفضلات 2024 », 8 circuits ménagers :
--
--   1. MODE DE COLLECTE. Six circuits en porte-à-porte (باب/باب), deux en
--      conteneurs (حاويات). Ce n'est pas un détail de libellé : en porte-à-
--      porte le camion s'arrête devant chaque foyer et les « points » sont des
--      repères de tournée ; en conteneurs il dessert des points fixes qui ont
--      une identité, un volume et un état. Les deux ne se contrôlent pas de la
--      même façon. Les relevés GPS le confirment : 183 points étiquetés
--      « porte à porte » contre 40 « point de collecte ».
--
--   2. VOYAGES PAR JOUR. Les six circuits tractés font DEUX voyages par jour,
--      les deux bennes tasseuses un seul. Le modèle ne connaissait qu'un
--      passage par circuit et par jour : pour six circuits sur huit, il aurait
--      compté la moitié du service rendu, et le tableau contractuel aurait
--      affiché un prestataire à 50 % alors qu'il fait son travail. Les noms
--      des relevés terrain le disent aussi : « voyage 1 », « voyage 2 ».
--      C'est le même piège que la période de service (migration 026), traité
--      cette fois avant qu'il ne produise un chiffre faux.
--
--   3. DURÉE, LONGUEUR ET ÉQUIPE DÉCLARÉES. Le registre annonce 27 à 60 km et
--      4 à 5 h par circuit, deux agents par engin. Ces valeurs sont des
--      DÉCLARATIONS de la commune, pas des mesures : le seul relevé GPS
--      disponible donne 5,75 km en 1 h 28 pour un voyage. L'écart est trop
--      grand pour être arbitré ici. On stocke donc la déclaration comme telle,
--      sans la corriger et sans la confondre avec l'observé, et l'interface
--      pourra un jour montrer les deux côte à côte. Une donnée déclarée qu'on
--      présente comme mesurée est une donnée fausse.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Ce que le registre communal ajoute au circuit
-- ---------------------------------------------------------------------------

ALTER TABLE circuits
  ADD COLUMN IF NOT EXISTS mode_collecte        TEXT,
  ADD COLUMN IF NOT EXISTS voyages_par_jour     SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS duree_prevue_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS longueur_declaree_km NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS taille_equipe        SMALLINT,
  ADD COLUMN IF NOT EXISTS trace_source         TEXT;

UPDATE circuits SET mode_collecte = 'conteneurs' WHERE mode_collecte IS NULL;
ALTER TABLE circuits ALTER COLUMN mode_collecte SET DEFAULT 'porte_a_porte';
ALTER TABLE circuits ALTER COLUMN mode_collecte SET NOT NULL;

ALTER TABLE circuits DROP CONSTRAINT IF EXISTS circuits_mode_collecte_valide;
ALTER TABLE circuits ADD  CONSTRAINT circuits_mode_collecte_valide
  CHECK (mode_collecte IN ('porte_a_porte', 'conteneurs', 'mixte'));

ALTER TABLE circuits DROP CONSTRAINT IF EXISTS circuits_voyages_valides;
ALTER TABLE circuits ADD  CONSTRAINT circuits_voyages_valides
  CHECK (voyages_par_jour BETWEEN 1 AND 6);

ALTER TABLE circuits DROP CONSTRAINT IF EXISTS circuits_trace_source_valide;
ALTER TABLE circuits ADD  CONSTRAINT circuits_trace_source_valide
  CHECK (trace_source IS NULL OR trace_source IN ('kmz_prevu', 'gps_observe', 'saisie'));

COMMENT ON COLUMN circuits.mode_collecte IS
  'porte_a_porte (باب/باب) | conteneurs (حاويات) | mixte. Détermine la nature des points : repères de tournée ou points fixes desservis.';
COMMENT ON COLUMN circuits.voyages_par_jour IS
  'Rotations prévues par jour de passage. Un tracteur qui vide sa remorque deux fois fait deux voyages : les compter pour un seul passage sous-estime le service rendu de moitié.';
COMMENT ON COLUMN circuits.duree_prevue_minutes IS
  'Durée DÉCLARÉE par la commune, non mesurée. À ne jamais présenter comme un temps constaté.';
COMMENT ON COLUMN circuits.longueur_declaree_km IS
  'Longueur DÉCLARÉE au registre communal. Les relevés GPS donnent des ordres de grandeur très différents : l''écart s''arbitre avec la commune, pas dans la base.';
COMMENT ON COLUMN circuits.trace_source IS
  'kmz_prevu (tracé dessiné, itinéraire prévu) | gps_observe (relevé terrain) | saisie. Le tracé sert à l''affichage, jamais à une règle métier.';

-- ---------------------------------------------------------------------------
-- 2. Points de collecte
--
-- Distincts des conteneurs (table conteneurs) : un conteneur est un bien
-- inventorié, un point de collecte est une étape d'une tournée. Un point peut
-- désigner un conteneur, mais en porte-à-porte il n'en désigne aucun.
--
-- Le type reprend le vocabulaire que les agents ont réellement employé sur le
-- terrain — relevé dans les étiquettes des fichiers GPS — plutôt qu'une
-- nomenclature inventée ici. Traduire le terrain dans un vocabulaire qu'il
-- n'emploie pas, c'est perdre l'information à la première saisie.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS points_collecte (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    circuit_id    UUID NOT NULL REFERENCES circuits(id) ON DELETE CASCADE,
    commune_id    TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,

    -- Ordre de passage. La commune confirme que l'ordre d'apparition dans le
    -- fichier est fiable ; les horodatages des relevés le vérifient, car ils
    -- sont strictement croissants dans cet ordre.
    -- Rang de la rotation à laquelle appartient le point. En porte-à-porte
    -- avec deux voyages, le camion ne couvre pas les mêmes rues au premier et
    -- au second : ranger tous les arrêts dans une seule suite mélangerait deux
    -- itinéraires distincts. Le relevé du 21 mai 2024 le montre directement —
    -- il porte deux repères « début collecte » (07:31 et 09:21) séparés par un
    -- passage au centre de transfert à 08:59.
    voyage        SMALLINT NOT NULL DEFAULT 1,
    ordre         INTEGER NOT NULL,
    nom           TEXT,
    type          TEXT NOT NULL DEFAULT 'porte_a_porte',

    geom          geometry(Point, 4326) NOT NULL,
    -- Précision du relevé, en mètres. Conservée parce qu'elle décide de ce
    -- qu'on peut faire du point : à 3 m on désigne une porte, à 20 m un côté
    -- de rue. L'effacer reviendrait à prêter au point une exactitude qu'il n'a
    -- pas. Les relevés de Dar Chaabane vont de 3,2 m à 20,4 m.
    precision_m   NUMERIC(6,2),

    -- Heure relevée sur le terrain, telle qu'enregistrée. Nulle tant qu'aucune
    -- tournée n'a été suivie au GPS.
    heure_observee TIME,
    -- Heure attendue, saisie ou corrigée par la commune. Sert au planning
    -- (B1.6) tant qu'aucune observation n'existe. Les deux coexistent : on ne
    -- remplace jamais une mesure par une estimation, ni l'inverse.
    heure_estimee  TIME,

    -- Notes des agents, telles qu'écrites : « point non collecté »,
    -- « mayodekhlouch lel 7ay ». C'est le terrain qui parle ; on ne le
    -- normalise pas.
    observation   TEXT,
    source        TEXT NOT NULL DEFAULT 'saisie',

    actif         BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at    TIMESTAMPTZ,
    deleted_by    UUID REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT points_collecte_type_valide CHECK (type IN (
      'porte_a_porte',        -- porte à porte
      'point_de_collecte',    -- point de collecte (conteneur desservi)
      'debut_collecte',       -- début collecte
      'fin_collecte',         -- fin collecte
      'point_noir',           -- point noir
      'centre_transfert',     -- centre de transfert
      'hors_conteneur',       -- dépôt hors conteneur
      'parc_municipal',       -- parc municipal
      'autre'
    )),
    CONSTRAINT points_collecte_source_valide CHECK (source IN ('import_kml', 'saisie')),
    CONSTRAINT points_collecte_ordre_positif CHECK (ordre > 0),
    CONSTRAINT points_collecte_voyage_valide CHECK (voyage BETWEEN 1 AND 6)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_points_collecte_ordre
  ON points_collecte (circuit_id, voyage, ordre) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_points_collecte_circuit
  ON points_collecte (circuit_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_points_collecte_geom
  ON points_collecte USING GIST (geom);

COMMENT ON TABLE points_collecte IS
  'Étapes d''une tournée, dans leur ordre de passage. À ne pas confondre avec la table conteneurs, qui inventorie des biens.';
COMMENT ON COLUMN points_collecte.type IS
  'Vocabulaire relevé sur le terrain à Dar Chaabane (étiquettes des fichiers GPS), non une nomenclature inventée.';
COMMENT ON COLUMN points_collecte.voyage IS
  'Rotation à laquelle l''arrêt appartient. Déduite des repères « début collecte » du relevé quand ils s''y trouvent, 1 sinon.';
COMMENT ON COLUMN points_collecte.heure_observee IS
  'Heure constatée lors d''un suivi GPS. Ne jamais la renseigner à partir d''une estimation.';

-- ---------------------------------------------------------------------------
-- 3. Personnel — amorce minimale pour le module 4
--
-- Le module 2 a besoin de nommer un chauffeur et une équipe ; il n'a pas
-- besoin de gérer les carrières. On pose donc le strict nécessaire, en
-- laissant la place au module 4 sans rien préjuger.
--
-- Protection des données (décret-loi 2022-54) : ni CIN, ni téléphone, ni
-- salaire ici. Ces informations existent dans les fichiers de la commune ;
-- elles n'ont aucune utilité pour affecter un agent à une tournée, et la
-- minimisation veut qu'on ne les collecte pas plutôt qu'on les protège.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS personnel (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id  TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    matricule   TEXT,
    nom_complet TEXT NOT NULL,
    fonction    TEXT NOT NULL DEFAULT 'agent',
    actif       BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMPTZ,
    deleted_by  UUID REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT personnel_fonction_valide CHECK (fonction IN (
      'chauffeur', 'agent', 'chef_equipe', 'agent_balayage', 'encadrement'
    ))
);

CREATE INDEX IF NOT EXISTS idx_personnel_commune
  ON personnel (commune_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_personnel_matricule
  ON personnel (commune_id, matricule) WHERE matricule IS NOT NULL AND deleted_at IS NULL;

COMMENT ON TABLE personnel IS
  'Amorce du module 4. Ni CIN, ni téléphone, ni salaire : affecter un agent à une tournée n''en a pas besoin (décret-loi 2022-54, minimisation).';

-- ---------------------------------------------------------------------------
-- 4. Équipe affectée à un circuit
--
-- Une affectation est datée : elle dit qui conduisait ce circuit à telle
-- période. Sans les dates, on ne saurait répondre à « qui était sur le circuit
-- 3 le 12 mars », qui est précisément la question qu'on pose quand quelque
-- chose s'est mal passé.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS circuit_equipe (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    circuit_id   UUID NOT NULL REFERENCES circuits(id) ON DELETE CASCADE,
    personnel_id UUID NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
    role         TEXT NOT NULL DEFAULT 'agent',
    date_debut   DATE NOT NULL DEFAULT CURRENT_DATE,
    date_fin     DATE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT circuit_equipe_role_valide CHECK (role IN ('chauffeur', 'agent', 'chef_equipe')),
    CONSTRAINT circuit_equipe_periode_coherente CHECK (date_fin IS NULL OR date_fin >= date_debut)
);

CREATE INDEX IF NOT EXISTS idx_circuit_equipe_circuit ON circuit_equipe (circuit_id);
CREATE INDEX IF NOT EXISTS idx_circuit_equipe_personnel ON circuit_equipe (personnel_id);

-- Un seul chauffeur à la fois sur un circuit : deux chauffeurs simultanés est
-- une erreur de saisie, pas une organisation.
CREATE UNIQUE INDEX IF NOT EXISTS idx_circuit_equipe_chauffeur_unique
  ON circuit_equipe (circuit_id) WHERE role = 'chauffeur' AND date_fin IS NULL;

COMMENT ON TABLE circuit_equipe IS
  'Affectations datées. Les dates permettent de répondre à « qui était sur ce circuit ce jour-là », qui est la question posée quand un incident survient.';

-- ---------------------------------------------------------------------------
-- 5. Cloisonnement — par can_write_commune(), conformément à la migration 027
-- ---------------------------------------------------------------------------

ALTER TABLE points_collecte ENABLE ROW LEVEL SECURITY;
ALTER TABLE points_collecte FORCE  ROW LEVEL SECURITY;
ALTER TABLE personnel       ENABLE ROW LEVEL SECURITY;
ALTER TABLE personnel       FORCE  ROW LEVEL SECURITY;
ALTER TABLE circuit_equipe  ENABLE ROW LEVEL SECURITY;
ALTER TABLE circuit_equipe  FORCE  ROW LEVEL SECURITY;

-- Points de collecte : la commune écrit, le prestataire chargé du circuit lit
-- (il lui faut la liste des arrêts), personne d'autre.
DROP POLICY IF EXISTS points_collecte_select ON points_collecte;
CREATE POLICY points_collecte_select ON points_collecte FOR SELECT
  USING (
    deleted_at IS NULL
    AND (
      app.can_write_commune(commune_id)
      OR (app.current_role_name() = 'gestionnaire_prestataire'
          AND circuit_id = ANY (app.mes_circuits()))
    )
  );

DROP POLICY IF EXISTS points_collecte_ecriture ON points_collecte;
CREATE POLICY points_collecte_ecriture ON points_collecte FOR ALL
  USING (app.can_write_commune(commune_id))
  WITH CHECK (app.can_write_commune(commune_id));

-- Personnel : affaire interne à la commune. Un prestataire privé n'a pas à
-- lire la liste nominative des agents municipaux.
DROP POLICY IF EXISTS personnel_select ON personnel;
CREATE POLICY personnel_select ON personnel FOR SELECT
  USING (deleted_at IS NULL AND app.can_write_commune(commune_id));

DROP POLICY IF EXISTS personnel_ecriture ON personnel;
CREATE POLICY personnel_ecriture ON personnel FOR ALL
  USING (app.can_write_commune(commune_id))
  WITH CHECK (app.can_write_commune(commune_id));

DROP POLICY IF EXISTS circuit_equipe_select ON circuit_equipe;
CREATE POLICY circuit_equipe_select ON circuit_equipe FOR SELECT
  USING (EXISTS (SELECT 1 FROM circuits c
                  WHERE c.id = circuit_id AND app.can_write_commune(c.commune_id)));

DROP POLICY IF EXISTS circuit_equipe_ecriture ON circuit_equipe;
CREATE POLICY circuit_equipe_ecriture ON circuit_equipe FOR ALL
  USING (EXISTS (SELECT 1 FROM circuits c
                  WHERE c.id = circuit_id AND app.can_write_commune(c.commune_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM circuits c
                  WHERE c.id = circuit_id AND app.can_write_commune(c.commune_id)));

GRANT SELECT, INSERT, UPDATE ON points_collecte, personnel, circuit_equipe TO siipi_app;
REVOKE DELETE, TRUNCATE ON points_collecte, personnel, circuit_equipe FROM siipi_app;
