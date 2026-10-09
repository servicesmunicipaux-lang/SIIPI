-- ===========================================================================
-- Migration 066 — Conservation des photos (décision FNCT D-FNCT-4, 9 octobre 2026)
--
-- LA DÉCISION. Les textes, dates, statuts et localisations des réclamations sont
-- conservés indéfiniment ; rien ici n'y touche. Seules les photos lourdes
-- changent de forme : à 36 mois, chacune est recompressée (JPEG qualité 70,
-- 500 Ko au plus) ; la version compressée reste en ligne, indéfiniment, et
-- l'original part dans l'archive froide — où il est conservé, lui aussi, sans
-- limite (réponse de l'utilisateur du 9 octobre 2026). Un administrateur de la
-- FNCT peut en demander la restauration, servie sous 48 heures.
--
-- CE QUI N'EST JAMAIS FAIT. Aucune fiche n'est effacée ni réécrite : nom,
-- type, taille, empreinte, déposant, date et visibilité restent ceux du dépôt.
-- La compression AJOUTE des colonnes — où vivent les octets compressés, quand,
-- combien ils pèsent — elle n'en remplace aucune. Aucun original n'est
-- supprimé : il est copié dans l'archive, relu, comparé à l'empreinte de sa
-- fiche, et ce n'est qu'alors qu'il quitte le volume courant. Si la copie
-- diffère, la photo n'est pas touchée et l'écart est consigné (règle d'or 1.5).
--
-- QUI ÉCRIT. La tâche de conservation, et elle seule, avec les droits
-- d'administration de la base. L'application perd le droit de modifier les
-- colonnes d'une fiche, à l'exception de la visibilité : une route qui
-- voudrait « marquer compressée » une photo encore entière ne le pourrait pas.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Paramètres — des valeurs, pas des constantes du code (comme en 014)
-- ---------------------------------------------------------------------------

INSERT INTO app_parametres (cle, valeur, description) VALUES
  ('medias.delai_compression', '36 months',
   'Âge d''une photo à partir duquel elle est recompressée et son original archivé à froid (D-FNCT-4, 9 octobre 2026).'),
  ('medias.qualite_jpeg', '70',
   'Qualité JPEG de la version compressée (D-FNCT-4).'),
  ('medias.taille_max_compressee_ko', '500',
   'Poids maximal de la version compressée, en kilooctets : au-delà, l''image est réduite jusqu''à passer sous ce seuil (D-FNCT-4).'),
  ('medias.delai_restauration', '48 hours',
   'Délai dans lequel un original archivé est restauré après la demande de la FNCT (D-FNCT-4). Affiché comme échéance ; une demande qui le dépasse est signalée en retard.')
ON CONFLICT (cle) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Ce que la compression ajoute à une fiche
-- ---------------------------------------------------------------------------

ALTER TABLE fichiers ADD COLUMN IF NOT EXISTS compressee_le            TIMESTAMPTZ;
ALTER TABLE fichiers ADD COLUMN IF NOT EXISTS chemin_compresse         TEXT;
ALTER TABLE fichiers ADD COLUMN IF NOT EXISTS taille_compressee_octets INTEGER;
ALTER TABLE fichiers ADD COLUMN IF NOT EXISTS sha256_compresse         TEXT;
ALTER TABLE fichiers ADD COLUMN IF NOT EXISTS chemin_archive           TEXT;
ALTER TABLE fichiers ADD COLUMN IF NOT EXISTS original_restaure_le     TIMESTAMPTZ;

-- Les quatre renseignements de la compression vont ensemble : une photo
-- « compressée » sans chemin vers sa version compressée, ou sans original
-- archivé, serait une promesse que rien ne tient.
ALTER TABLE fichiers DROP CONSTRAINT IF EXISTS fichiers_compression_complete;
ALTER TABLE fichiers ADD CONSTRAINT fichiers_compression_complete CHECK (
  (compressee_le IS NULL AND chemin_compresse IS NULL AND taille_compressee_octets IS NULL
     AND sha256_compresse IS NULL AND chemin_archive IS NULL)
  OR
  (compressee_le IS NOT NULL AND chemin_compresse IS NOT NULL AND taille_compressee_octets > 0
     AND sha256_compresse IS NOT NULL AND chemin_archive IS NOT NULL));

-- Seule une image se compresse : un PDF ou un document Office n'est pas une
-- photo lourde, et la décision ne le vise pas.
ALTER TABLE fichiers DROP CONSTRAINT IF EXISTS fichiers_compression_image;
ALTER TABLE fichiers ADD CONSTRAINT fichiers_compression_image CHECK (
  compressee_le IS NULL OR type_mime IN ('image/jpeg', 'image/png', 'image/webp'));

ALTER TABLE fichiers DROP CONSTRAINT IF EXISTS fichiers_restauration_apres_compression;
ALTER TABLE fichiers ADD CONSTRAINT fichiers_restauration_apres_compression CHECK (
  original_restaure_le IS NULL OR compressee_le IS NOT NULL);

COMMENT ON COLUMN fichiers.compressee_le IS
  'Date de la compression de conservation (D-FNCT-4). NULL : la photo est entière sur le volume courant. Renseignée : la version compressée est servie, l''original est dans l''archive froide.';
COMMENT ON COLUMN fichiers.chemin_compresse IS
  'Chemin relatif, sur le volume courant, de la version compressée (toujours un JPEG). type_mime, taille_octets et sha256 restent ceux de l''ORIGINAL : la fiche du dépôt n''est jamais réécrite.';
COMMENT ON COLUMN fichiers.taille_compressee_octets IS
  'Poids de la version compressée, au plus le seuil medias.taille_max_compressee_ko au moment de la compression.';
COMMENT ON COLUMN fichiers.sha256_compresse IS
  'Empreinte de la version compressée. Sert d''ETag et permet de constater une altération sur le disque.';
COMMENT ON COLUMN fichiers.chemin_archive IS
  'Chemin relatif de l''original dans l''archive froide (SIIPI_ARCHIVE_DIR). L''original y est conservé sans limite de durée ; son empreinte est sha256.';
COMMENT ON COLUMN fichiers.original_restaure_le IS
  'Date à laquelle l''original a été restauré depuis l''archive froide, sur demande de la FNCT. Il est alors relisible par la FNCT seule ; la version compressée reste celle servie à tous.';

CREATE INDEX IF NOT EXISTS idx_fichiers_a_compresser
  ON fichiers (created_at) WHERE compressee_le IS NULL;

-- L'application ne modifie plus que la visibilité d'une fiche. Le retrait passe
-- par app.supprimer(), qui s'exécute avec les droits de son propriétaire.
REVOKE UPDATE ON fichiers FROM siipi_app;
GRANT UPDATE (visibilite, destinataire_citoyen_id) ON fichiers TO siipi_app;

-- Les fichiers n'étaient pas au journal d'audit. La compression et la
-- restauration le sont désormais, comme tout ce qui arrive à une fiche.
DROP TRIGGER IF EXISTS trg_audit_fichiers ON fichiers;
CREATE TRIGGER trg_audit_fichiers AFTER INSERT OR UPDATE OR DELETE ON fichiers
  FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement();

-- Le volume courant porte la version compressée, plus l'original : c'est ce
-- qu'il faut compter pour savoir ce que le disque contient (commentaire de 041).
CREATE OR REPLACE FUNCTION app.occupation_fichiers(p_commune text)
  RETURNS TABLE (usage text, nombre bigint, octets bigint)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT coalesce(f.usage, 'autre'), count(*),
         sum(CASE WHEN f.compressee_le IS NULL OR f.original_restaure_le IS NOT NULL
                  THEN f.taille_octets ELSE 0 END
             + coalesce(f.taille_compressee_octets, 0))
    FROM fichiers f
   WHERE f.commune_id = p_commune AND f.deleted_at IS NULL
   GROUP BY 1
   ORDER BY 3 DESC
$$;

COMMENT ON FUNCTION app.occupation_fichiers(text) IS
  'Ce que le volume courant porte pour une commune, par usage : l''original tant qu''il n''est pas archivé (ou après restauration), plus la version compressée. Les fiches retirées n''y figurent pas.';

-- ---------------------------------------------------------------------------
-- 3. Les passages de la tâche mensuelle
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS passages_conservation_medias (
    id                   BIGSERIAL PRIMARY KEY,
    debut                TIMESTAMPTZ NOT NULL DEFAULT now(),
    fin                  TIMESTAMPTZ,
    declenche_par        TEXT NOT NULL,
    -- NULL : le passage national, celui du mois. Une commune : un passage
    -- restreint, lancé à la main (la campagne de tests s'en sert), qui ne
    -- compte pas comme le passage du mois.
    perimetre            TEXT,
    statut               TEXT NOT NULL DEFAULT 'en_cours',
    motif_refus          TEXT,
    photos_eligibles     INTEGER NOT NULL DEFAULT 0,
    photos_compressees   INTEGER NOT NULL DEFAULT 0,
    octets_avant         BIGINT  NOT NULL DEFAULT 0,
    octets_apres         BIGINT  NOT NULL DEFAULT 0,
    -- Une photo que la tâche n'a pas pu traiter : son identifiant et la raison.
    -- Constatée, jamais « réparée » : elle reste entière et sera reprise.
    anomalies            JSONB   NOT NULL DEFAULT '[]'::jsonb,
    CONSTRAINT passages_declencheur_valide CHECK (declenche_par IN ('planificateur', 'commande')),
    CONSTRAINT passages_statut_valide CHECK (statut IN ('en_cours', 'termine', 'refuse')),
    -- Un refus sans motif n'apprend rien à celui qui doit le lever.
    CONSTRAINT passages_refus_motive CHECK (statut <> 'refuse' OR motif_refus IS NOT NULL),
    CONSTRAINT passages_fin_coherente CHECK (statut = 'en_cours' OR fin IS NOT NULL)
);

COMMENT ON TABLE passages_conservation_medias IS
  'Un passage de la tâche de conservation des photos (D-FNCT-4) : combien de photos avaient l''âge, combien ont été compressées, les octets libérés, et les anomalies constatées. Un passage « refusé » n''a touché à rien (archive froide absente, par exemple).';

ALTER TABLE passages_conservation_medias ENABLE ROW LEVEL SECURITY;
ALTER TABLE passages_conservation_medias FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS passages_conservation_select ON passages_conservation_medias;
CREATE POLICY passages_conservation_select ON passages_conservation_medias FOR SELECT
  USING (app.current_role_name() = 'super_admin_fnct');
-- Lecture seule pour l'application : les privilèges par défaut (migration 013)
-- lui donneraient aussi l'écriture, que seule la politique arrêterait.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON passages_conservation_medias FROM siipi_app;
GRANT SELECT ON passages_conservation_medias TO siipi_app;

-- ---------------------------------------------------------------------------
-- 4. Les demandes de restauration d'un original
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS demandes_restauration (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fichier_id             UUID NOT NULL REFERENCES fichiers(id) ON DELETE CASCADE,
    commune_id             TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    motif                  TEXT NOT NULL,
    demandee_par           UUID REFERENCES users(id) ON DELETE SET NULL,
    demandee_le            TIMESTAMPTZ NOT NULL DEFAULT now(),
    echeance               TIMESTAMPTZ NOT NULL,
    statut                 TEXT NOT NULL DEFAULT 'demandee',
    restauree_le           TIMESTAMPTZ,
    tentatives             INTEGER NOT NULL DEFAULT 0,
    derniere_tentative_le  TIMESTAMPTZ,
    derniere_erreur        TEXT,
    CONSTRAINT restauration_motif_renseigne CHECK (length(btrim(motif)) >= 10),
    CONSTRAINT restauration_statut_valide CHECK (statut IN ('demandee', 'restauree')),
    CONSTRAINT restauration_date_coherente CHECK (statut <> 'restauree' OR restauree_le IS NOT NULL),
    CONSTRAINT restauration_echeance_apres CHECK (echeance > demandee_le)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_restauration_en_attente
  ON demandes_restauration (fichier_id) WHERE statut = 'demandee';

COMMENT ON TABLE demandes_restauration IS
  'Demande de la FNCT de restaurer l''original d''une photo compressée (D-FNCT-4). Servie par la tâche de conservation dès que l''archive froide est accessible ; l''échéance est la date de la demande plus medias.delai_restauration. Une tentative qui échoue (archive absente, original introuvable, empreinte différente) est consignée et la demande reste ouverte.';
COMMENT ON COLUMN demandes_restauration.derniere_erreur IS
  'La raison du dernier échec : archive_absente, original_introuvable ou empreinte_differente. Un original dont l''empreinte ne correspond plus à sa fiche n''est jamais restauré : l''écart se montre, il ne se corrige pas.';

ALTER TABLE demandes_restauration ENABLE ROW LEVEL SECURITY;
ALTER TABLE demandes_restauration FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS demandes_restauration_select ON demandes_restauration;
CREATE POLICY demandes_restauration_select ON demandes_restauration FOR SELECT
  USING (app.current_role_name() = 'super_admin_fnct');
-- Aucune politique d'écriture : une demande ne naît que par
-- app.demander_restauration(), qui en porte les règles.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON demandes_restauration FROM siipi_app;
GRANT SELECT ON demandes_restauration TO siipi_app;

DROP TRIGGER IF EXISTS trg_audit_demandes_restauration ON demandes_restauration;
CREATE TRIGGER trg_audit_demandes_restauration AFTER INSERT OR UPDATE OR DELETE ON demandes_restauration
  FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement();

CREATE OR REPLACE FUNCTION app.demander_restauration(p_fichier uuid, p_motif text)
  RETURNS demandes_restauration
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS
$fn$
DECLARE
  v_f fichiers;
  v_delai interval;
  v_d demandes_restauration;
BEGIN
  IF app.current_role_name() <> 'super_admin_fnct' THEN
    RAISE EXCEPTION 'RESTAURATION_RESERVEE_FNCT: seule la FNCT demande la restauration d''un original.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_f FROM fichiers WHERE id = p_fichier;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESTAURATION_FICHIER_INTROUVABLE: aucun fichier ne porte cet identifiant.';
  END IF;
  IF v_f.compressee_le IS NULL THEN
    RAISE EXCEPTION 'RESTAURATION_NON_COMPRESSEE: l''original de ce fichier est encore en ligne ; il n''y a rien à restaurer.';
  END IF;
  IF v_f.original_restaure_le IS NOT NULL THEN
    RAISE EXCEPTION 'RESTAURATION_DEJA_FAITE: l''original a déjà été restauré le %.', to_char(v_f.original_restaure_le AT TIME ZONE 'Africa/Tunis', 'DD/MM/YYYY');
  END IF;
  IF EXISTS (SELECT 1 FROM demandes_restauration WHERE fichier_id = p_fichier AND statut = 'demandee') THEN
    RAISE EXCEPTION 'RESTAURATION_DEJA_DEMANDEE: une demande est déjà ouverte pour ce fichier.';
  END IF;
  IF p_motif IS NULL OR length(btrim(p_motif)) < 10 THEN
    RAISE EXCEPTION 'RESTAURATION_MOTIF: le motif de la demande est obligatoire (dix caractères au moins).';
  END IF;

  SELECT valeur::interval INTO v_delai FROM app_parametres WHERE cle = 'medias.delai_restauration';
  INSERT INTO demandes_restauration (fichier_id, commune_id, motif, demandee_par, echeance)
  VALUES (p_fichier, v_f.commune_id, btrim(p_motif), app.current_user_id(),
          now() + coalesce(v_delai, interval '48 hours'))
  RETURNING * INTO v_d;
  RETURN v_d;
END;
$fn$;

REVOKE ALL ON FUNCTION app.demander_restauration(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.demander_restauration(uuid, text) TO siipi_app;

COMMENT ON FUNCTION app.demander_restauration(uuid, text) IS
  'Ouvre une demande de restauration de l''original d''une photo compressée. Réservée à la FNCT ; refuse une photo entière, une photo déjà restaurée, une demande en double, un motif vide.';
