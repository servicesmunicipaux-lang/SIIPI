-- ============================================================================
-- 031_fiche_identite_circuit.sql
--
-- La fiche d'identité d'un circuit, d'après « Optimisation des circuits de
-- collecte_DCEF.xlsx » — le relevé d'affectation du matériel établi par la
-- commune, une ligne par secteur.
--
-- CE QUE CE FICHIER APPORTE, et que la base ne savait pas dire :
--
--   1. LE SECTEUR. S01 à S07, avec un nom de quartier : Cité Gharbi, Jadid,
--      MC27, Barnousa, Chate2, Takadom, Mejdoub. C'est la réponse à une
--      question restée ouverte : le registre des circuits les nomme « مسلك
--      عدد 1 » à « عدد 8 », des numéros qui ne disent rien, tandis que les
--      relevés GPS portent ces noms de quartier. Le secteur est le chaînon
--      qui relie les deux, et sans lui personne ne sait quel relevé appartient
--      à quel circuit.
--
--   2. LE POSTE ET LES HORAIRES. Poste jour ou poste nuit, heure de départ,
--      heure de fin, lieu de déchargement. Un circuit de nuit et un circuit de
--      jour ne se contrôlent pas au même moment ; sans le poste, l'agent qui
--      fait sa tournée de constat le matin cherche des équipes parties la
--      veille au soir.
--
--   3. DEUX ENGINS, PAS UN. Le fichier distingue le véhicule de collecte
--      (BB1, TA1, CB01…) et le camion qui évacue vers le centre de transfert
--      (BT1, Ta01, PU01…). La base n'avait qu'un « vehicule_id ». Les deux ont
--      des rôles différents et des immatriculations différentes.
--
-- CE QUI N'EST PAS RANGÉ AVEC LE RESTE, ET POURQUOI.
--
--   Le fichier porte aussi des temps, des distances, un tonnage et une
--   consommation. Ce ne sont pas des propriétés du circuit : ce sont les
--   MESURES d'une campagne d'observation, faites tel jour, avec tel chauffeur
--   et telle circulation. Les ranger à côté du nom et du code laisserait croire
--   qu'un circuit « fait » 19,3 km, alors qu'il en a fait 19,3 ce jour-là.
--   Elles vivent donc dans leur propre groupe, avec la date de l'étude, et
--   l'interface le dit. C'est la même discipline que pour la longueur déclarée
--   au registre communal (migration 028), qui contredit déjà les relevés GPS
--   d'un facteur cinq : une plateforme qui sert à arbitrer des désaccords ne
--   peut pas mélanger ce qu'on lui a déclaré, ce qu'elle a mesuré, et ce qu'une
--   étude a observé un jour donné.
--
-- Tous ces champs sont facultatifs : une commune qui n'a pas fait d'étude
-- d'optimisation garde un circuit parfaitement utilisable.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Identité : secteur, poste, engins
-- ---------------------------------------------------------------------------

ALTER TABLE circuits
  ADD COLUMN IF NOT EXISTS secteur_code       TEXT,
  ADD COLUMN IF NOT EXISTS secteur_nom        TEXT,
  ADD COLUMN IF NOT EXISTS poste              TEXT,
  ADD COLUMN IF NOT EXISTS heure_depart       TIME,
  ADD COLUMN IF NOT EXISTS heure_fin          TIME,
  ADD COLUMN IF NOT EXISTS lieu_dechargement  TEXT,
  ADD COLUMN IF NOT EXISTS vehicule_code      TEXT,
  ADD COLUMN IF NOT EXISTS vehicule_immat     TEXT,
  ADD COLUMN IF NOT EXISTS engin_appui_code   TEXT,
  ADD COLUMN IF NOT EXISTS engin_appui_immat  TEXT;

ALTER TABLE circuits DROP CONSTRAINT IF EXISTS circuits_poste_valide;
ALTER TABLE circuits ADD  CONSTRAINT circuits_poste_valide
  CHECK (poste IS NULL OR poste IN ('jour', 'nuit', 'mixte'));

CREATE INDEX IF NOT EXISTS idx_circuits_secteur
  ON circuits (commune_id, secteur_code) WHERE deleted_at IS NULL;

COMMENT ON COLUMN circuits.secteur_code IS
  'Code du secteur au relevé d''affectation (S01…). Chaînon entre le registre communal, qui numérote les circuits, et les relevés GPS, qui portent des noms de quartier.';
COMMENT ON COLUMN circuits.secteur_nom IS
  'Nom usuel du secteur — Cité Gharbi, Barnousa… C''est ainsi que les agents désignent la tournée, et ainsi que les fichiers de relevé sont nommés.';
COMMENT ON COLUMN circuits.poste IS
  'jour | nuit | mixte. Un circuit de nuit ne se contrôle pas le matin.';
COMMENT ON COLUMN circuits.vehicule_code IS
  'Engin de collecte (BB1, TA1, CB01…). Distinct de l''engin d''appui, qui évacue vers le centre de transfert.';
COMMENT ON COLUMN circuits.engin_appui_code IS
  'Engin d''évacuation vers le centre de transfert (BT1, Ta01, PU01…). Le relevé d''affectation en distingue deux par secteur ; n''en retenir qu''un perdrait la moitié de l''organisation.';

-- ---------------------------------------------------------------------------
-- 2. Étude d'optimisation — des MESURES, pas des propriétés
--
-- Chaque valeur est rattachée à la date de la campagne. Une mesure sans date
-- n'est pas une mesure : c'est un chiffre dont plus personne ne sait à quoi il
-- se rapportait, et qu'on finira par opposer à un prestataire.
-- ---------------------------------------------------------------------------

ALTER TABLE circuits
  ADD COLUMN IF NOT EXISTS etude_date                   DATE,
  ADD COLUMN IF NOT EXISTS etude_temps_parc_min         INTEGER,
  ADD COLUMN IF NOT EXISTS etude_temps_dechargement_min INTEGER,
  ADD COLUMN IF NOT EXISTS etude_temps_retour_min       INTEGER,
  ADD COLUMN IF NOT EXISTS etude_temps_collecte_min     INTEGER,
  ADD COLUMN IF NOT EXISTS etude_distance_parc_km       NUMERIC(7,2),
  ADD COLUMN IF NOT EXISTS etude_distance_dechargement_km NUMERIC(7,2),
  ADD COLUMN IF NOT EXISTS etude_distance_retour_km     NUMERIC(7,2),
  ADD COLUMN IF NOT EXISTS etude_distance_collecte_km   NUMERIC(7,2),
  ADD COLUMN IF NOT EXISTS etude_tonnage_t              NUMERIC(7,2),
  ADD COLUMN IF NOT EXISTS etude_consommation_l         NUMERIC(7,2);

COMMENT ON COLUMN circuits.etude_date IS
  'Date de la campagne d''observation dont proviennent les valeurs « etude_* ». Sans elle, ces chiffres deviennent des propriétés du circuit, ce qu''ils ne sont pas.';
COMMENT ON COLUMN circuits.etude_distance_collecte_km IS
  'Distance de collecte pure MESURÉE lors de la campagne. À ne pas confondre avec longueur_declaree_km, qui vient du registre communal et peut en différer d''un facteur cinq.';

-- ---------------------------------------------------------------------------
-- 3. Le tracé et les arrêts se posent séparément
--
-- Un circuit a un itinéraire ET des points de collecte, et les deux arrivent
-- dans des fichiers distincts : à Dar Chaabane, le KMZ « مسلك 2 » porte
-- l'itinéraire dessiné, le KML « GPSWpts » porte les arrêts relevés. Un import
-- unique qui devinait lequel des deux on lui donnait obligeait à faire
-- confiance à sa devinette. On garde donc trace de ce qui a été posé, et
-- quand : c'est ce qui permet à l'écran de dire « itinéraire importé le 3 mai,
-- arrêts jamais importés » plutôt que d'afficher deux cases vides identiques.
-- ---------------------------------------------------------------------------

ALTER TABLE circuits
  ADD COLUMN IF NOT EXISTS trace_importee_le   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trace_fichier       TEXT,
  ADD COLUMN IF NOT EXISTS points_importes_le  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS points_fichier      TEXT;

COMMENT ON COLUMN circuits.trace_fichier IS
  'Nom du fichier d''où vient le tracé. Six mois plus tard, « d''où sort cette ligne ? » est une question qu''on se pose vraiment.';
