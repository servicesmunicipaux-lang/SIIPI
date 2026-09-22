-- ===========================================================================
-- Migration 041 — Le stockage des fichiers
--
-- Six tables portent depuis longtemps une colonne `photo_url`, et rien n'a
-- jamais stocké d'octets. La conséquence est plus large qu'elle n'en a l'air :
-- la preuve de traitement d'une réclamation (B5.1.3), la photo qui accompagne
-- un signalement (M4), celle d'une suggestion de point (M3.1), le constat de
-- terrain, et les documents d'un projet (B5.3.3) attendent tous cette brique.
--
-- CE QUI EST STOCKÉ, ET CE QUI NE L'EST PAS. Les octets vont sur un volume
-- disque, jamais en base : une photo de téléphone pèse trois mégaoctets, et
-- une base qu'on sauvegarde chaque nuit n'est pas un entrepôt d'images. La
-- base garde la FICHE du fichier — son type réel, sa taille, son empreinte,
-- qui l'a déposé, pour quelle commune — et le chemin relatif qui mène aux
-- octets. Une fiche sans octets se répare ; des octets sans fiche ne sont plus
-- que des déchets anonymes sur un disque.
--
-- LE TYPE EST CELUI DES OCTETS, PAS CELUI QUE LE CLIENT ANNONCE. La colonne
-- `type_mime` est renseignée par le service de dépôt d'après la signature
-- binaire du fichier. Un exécutable renommé « photo.jpg » n'entre pas.
--
-- POURQUOI UNE VISIBILITÉ EXPLICITE. Une photo de réclamation montre une rue,
-- parfois une cour, parfois une personne. Elle n'est pas publique par défaut,
-- et le citoyen qui l'a envoyée doit pouvoir la revoir sans que la commune
-- voisine y accède. Trois niveaux, et le niveau est porté par le fichier
-- lui-même plutôt que déduit d'un lien qu'aucune politique de sécurité ne peut
-- suivre :
--
--   commune   — le service de la commune, ses prestataires rattachés, la FNCT.
--               C'est le niveau par défaut, et le plus courant.
--   citoyen   — le même monde, PLUS un citoyen nommément désigné. C'est ce qui
--               permet à l'auteur d'une réclamation de voir la photo « après
--               traitement » que la commune a déposée, sans ouvrir l'album de
--               la commune à tous les citoyens.
--   publique  — visible de tous, y compris sans compte. Uniquement sur
--               décision de la commune (migration 021 : `photo_publique`),
--               jamais par défaut, jamais à l'initiative du déposant.
--
-- Le déposant relit toujours ce qu'il a déposé, quel que soit le niveau : sans
-- cela, un citoyen ne pourrait pas vérifier la photo qu'il vient d'envoyer.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS fichiers (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id             TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,

    -- Ce que la personne a déposé, tel qu'elle l'a nommé. Sert à proposer un
    -- nom au téléchargement ; ne sert JAMAIS à construire un chemin.
    nom_original           TEXT NOT NULL,
    -- Déduit des octets. Voir services/fichiers.ts.
    type_mime              TEXT NOT NULL,
    taille_octets          INTEGER NOT NULL,
    -- Empreinte du contenu. Deux dépôts du même fichier se reconnaissent, et
    -- une altération sur le disque se constate.
    sha256                 TEXT NOT NULL,
    -- Chemin RELATIF à la racine de stockage : <commune>/<aaaa>/<mm>/<id>.<ext>.
    -- Relatif, pour que déplacer le volume n'oblige pas à réécrire la base.
    chemin_relatif         TEXT NOT NULL,

    visibilite             TEXT NOT NULL DEFAULT 'commune',
    -- Citoyen autorisé à lire, quand visibilite = 'citoyen'. C'est le lien
    -- explicite qui remplace un raisonnement sur les tables qui pointent vers
    -- ce fichier — raisonnement qu'une politique de sécurité ne peut pas
    -- tenir.
    destinataire_citoyen_id UUID REFERENCES citoyens(id) ON DELETE SET NULL,

    -- À quoi ce fichier était destiné au moment du dépôt. Sert à s'y retrouver
    -- et à mesurer l'occupation par usage, pas à contrôler un accès.
    usage                  TEXT,

    televerse_par          UUID REFERENCES users(id),
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at             TIMESTAMPTZ,
    deleted_by             UUID REFERENCES users(id),

    CONSTRAINT fichiers_visibilite_valide CHECK (
      visibilite IN ('commune', 'citoyen', 'publique')),
    -- Une visibilité « citoyen » sans citoyen désigné ne veut rien dire : elle
    -- serait strictement équivalente à « commune », en donnant l'impression
    -- qu'un citoyen y a accès.
    CONSTRAINT fichiers_destinataire_coherent CHECK (
      visibilite <> 'citoyen' OR destinataire_citoyen_id IS NOT NULL),
    CONSTRAINT fichiers_type_autorise CHECK (
      type_mime IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
    CONSTRAINT fichiers_taille_plausible CHECK (
      taille_octets > 0 AND taille_octets <= 8 * 1024 * 1024),
    CONSTRAINT fichiers_usage_valide CHECK (usage IS NULL OR usage IN (
      'reclamation', 'preuve_traitement', 'constat_terrain', 'passage',
      'incident', 'suggestion_point', 'document_projet', 'enlevement', 'autre'))
);

CREATE INDEX IF NOT EXISTS idx_fichiers_commune
  ON fichiers (commune_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fichiers_deposant
  ON fichiers (televerse_par) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fichiers_empreinte
  ON fichiers (commune_id, sha256) WHERE deleted_at IS NULL;

COMMENT ON TABLE fichiers IS
  'Fiche d''un fichier déposé. Les octets vivent sur le volume de stockage ; la base porte le type réel, l''empreinte, le déposant et la visibilité. Sans fiche, des octets sur un disque ne sont plus que des déchets anonymes.';
COMMENT ON COLUMN fichiers.type_mime IS
  'Type déduit de la SIGNATURE BINAIRE au dépôt, jamais de ce que le client annonce. Un exécutable renommé « photo.jpg » ne franchit pas cette colonne.';
COMMENT ON COLUMN fichiers.visibilite IS
  'commune | citoyen | publique. « publique » ne s''obtient que par une décision explicite de la commune, jamais à l''initiative du déposant.';
COMMENT ON COLUMN fichiers.destinataire_citoyen_id IS
  'Citoyen autorisé à lire ce fichier lorsque visibilite = ''citoyen''. C''est ainsi que l''auteur d''une réclamation voit la photo « après traitement » sans que l''album de la commune s''ouvre à tous.';
COMMENT ON COLUMN fichiers.chemin_relatif IS
  'Chemin relatif à la racine de stockage. Relatif, pour que déplacer le volume n''oblige pas à réécrire la base.';

-- ---------------------------------------------------------------------------
-- Cloisonnement
-- ---------------------------------------------------------------------------

ALTER TABLE fichiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE fichiers FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fichiers_select ON fichiers;
CREATE POLICY fichiers_select ON fichiers FOR SELECT
  USING (
    deleted_at IS NULL
    AND (
      visibilite = 'publique'
      OR app.can_read_commune(commune_id)
      -- Le déposant relit toujours ce qu'il a déposé. Sans cette ligne, un
      -- citoyen ne pourrait pas vérifier la photo qu'il vient d'envoyer.
      OR televerse_par = app.current_user_id()
      OR (visibilite = 'citoyen' AND destinataire_citoyen_id = app.my_citizen_id())
    )
  );

-- Déposer : pour une commune où l'on écrit, ou — pour un citoyen — la sienne.
-- Un citoyen n'a pas de droit d'écriture sur sa commune au sens des registres,
-- et c'est normal : il ne modifie rien. Il ajoute une pièce à son propre
-- signalement.
DROP POLICY IF EXISTS fichiers_insert ON fichiers;
CREATE POLICY fichiers_insert ON fichiers FOR INSERT
  WITH CHECK (
    televerse_par = app.current_user_id()
    AND (
      app.can_write_commune(commune_id)
      OR (app.current_role_name() = 'citoyen'
          AND app.my_citizen_id() IS NOT NULL
          AND commune_id = app.current_commune())
    )
  );

-- Modifier une fiche, c'est en changer la visibilité — décision de la commune,
-- jamais du déposant. Un citoyen ne peut pas rendre sa propre photo publique.
DROP POLICY IF EXISTS fichiers_update ON fichiers;
CREATE POLICY fichiers_update ON fichiers FOR UPDATE
  USING (app.can_write_commune(commune_id))
  WITH CHECK (app.can_write_commune(commune_id));

GRANT SELECT, INSERT, UPDATE ON fichiers TO siipi_app;
REVOKE DELETE, TRUNCATE ON fichiers FROM siipi_app;

-- ---------------------------------------------------------------------------
-- Retrait
--
-- Logique, comme partout : la réclamation d'il y a six mois garde la trace de
-- la pièce qui l'accompagnait. Les octets, eux, restent sur le volume — les
-- effacer est une opération distincte, qui relève d'une purge datée et non du
-- geste d'un utilisateur. Tant qu'elle n'existe pas, mieux vaut un disque qui
-- grossit qu'une preuve qui disparaît d'un clic.
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
                     'personnel', 'fichiers') THEN
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
-- Occupation du volume, par commune et par usage. Un stockage de fichiers sans
-- moyen de savoir ce qu'il contient devient, en deux ans, un disque plein que
-- personne n'ose toucher.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.occupation_fichiers(p_commune text)
  RETURNS TABLE (usage text, nombre bigint, octets bigint)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT coalesce(f.usage, 'autre'), count(*), sum(f.taille_octets)
    FROM fichiers f
   WHERE f.commune_id = p_commune AND f.deleted_at IS NULL
   GROUP BY 1
   ORDER BY 3 DESC
$$;

COMMENT ON FUNCTION app.occupation_fichiers(text) IS
  'Ce que le volume porte pour une commune, par usage. Les fiches retirées n''y figurent pas, alors que leurs octets occupent encore le disque : l''écart entre les deux est la mesure de ce qu''une purge libérerait.';

GRANT EXECUTE ON FUNCTION app.occupation_fichiers(text) TO siipi_app;
