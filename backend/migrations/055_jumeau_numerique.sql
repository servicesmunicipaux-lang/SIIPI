-- =========================================================================
-- 055 — Le jumeau numérique (lot S1, FEUILLE_DE_ROUTE.md § 6bis).
--
-- Trois mois d'activité simulée, chargés dans une commune de démonstration
-- fictive, pour éprouver la plateforme en attendant qu'une commune s'en serve.
-- Un jeu simulé qui se confond avec le réel est pire que pas de jeu : la
-- démonstration fictive de Djerba a été retirée à la v0.13.0 pour cette
-- raison. Les garde-fous sont donc ICI, dans la base, et pas seulement dans
-- l'écran qui charge le jeu :
--
--   1. communes.est_demo marque la commune de démonstration ; il ne se
--      modifie pas — une commune réelle ne devient pas une démonstration, et
--      l'inverse ;
--   2. chaque table que le jeu remplit porte `provenance` (reel | simule).
--      Toute ligne écrite dans une commune de démonstration devient
--      « simule », même saisie à la main pendant une démonstration ; une
--      ligne « simule » est REFUSÉE dans une commune réelle ;
--   3. la commune de démonstration sort de toute agrégation nationale :
--      statut de déploiement (et donc tableau par gouvernorat), carte
--      publique ; les routes nationales l'écartent aussi (KPI, annuaire) ;
--   4. app.retirer_jeu_demo() efface la commune de démonstration et tout ce
--      qu'elle contient. C'est l'exception assumée à la règle « rien ne
--      s'efface » (CLAUDE.md § 1.4) : la suppression logique protège
--      l'historique réel, et une pesée simulée n'est l'historique de rien.
--      La fonction refuse toute commune réelle.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. La commune de démonstration
-- -------------------------------------------------------------------------
ALTER TABLE communes ADD COLUMN IF NOT EXISTS est_demo BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN communes.est_demo IS
  'Commune de démonstration fictive (jumeau numérique, lot S1). Exclue de l''observatoire national, du concours et de toute agrégation nationale. Fixé à la création, ne se modifie pas.';

CREATE OR REPLACE FUNCTION app.proteger_est_demo()
  RETURNS trigger LANGUAGE plpgsql AS
$$
BEGIN
  IF NEW.est_demo IS DISTINCT FROM OLD.est_demo THEN
    RAISE EXCEPTION 'Une commune réelle ne devient pas une commune de démonstration, ni l''inverse (commune %).', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_proteger_est_demo ON communes;
CREATE TRIGGER trg_proteger_est_demo
  BEFORE UPDATE OF est_demo ON communes
  FOR EACH ROW EXECUTE FUNCTION app.proteger_est_demo();

-- -------------------------------------------------------------------------
-- 2. La provenance de chaque ligne
-- -------------------------------------------------------------------------
-- SECURITY DEFINER : la commune doit être lue quel que soit le rôle de
-- l'appelant, sans quoi une écriture d'un rôle restreint passerait le
-- contrôle faute d'avoir vu la commune.
CREATE OR REPLACE FUNCTION app.controler_provenance()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_demo boolean;
BEGIN
  SELECT c.est_demo INTO v_demo FROM communes c WHERE c.id = NEW.commune_id;
  IF COALESCE(v_demo, false) THEN
    NEW.provenance := 'simule';
  ELSIF NEW.provenance = 'simule' THEN
    RAISE EXCEPTION 'Donnée simulée refusée : % n''est pas une commune de démonstration.', NEW.commune_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'vehicules', 'personnel', 'circuits', 'points_collecte', 'presences', 'pesees', 'tickets',
    'fins_de_poste', 'fuel_logs', 'incidents', 'incidents_travail', 'actions_planifiees', 'poi',
    'publications', 'dotations_epi', 'controles_terrain', 'effectifs_service', 'parametres_commune'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS provenance TEXT NOT NULL DEFAULT ''reel''', t);
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', t, t || '_provenance_valide');
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (provenance IN (''reel'', ''simule''))', t, t || '_provenance_valide');
    EXECUTE format('COMMENT ON COLUMN %I.provenance IS %L', t,
      'reel : saisi ou importé pour une commune réelle. simule : jeu de démonstration (jumeau numérique, migration 055) — imposé dans une commune de démonstration, refusé ailleurs. Une ligne simulée ne s''additionne jamais au réel.');
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'trg_provenance_' || t, t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF commune_id, provenance ON %I
                      FOR EACH ROW EXECUTE FUNCTION app.controler_provenance()', 'trg_provenance_' || t, t);
  END LOOP;
END
$$;

-- -------------------------------------------------------------------------
-- 3. Hors de toute agrégation nationale
-- -------------------------------------------------------------------------
-- Le statut de déploiement nourrit /observatoire/deploiement ET le tableau
-- par gouvernorat (app.tableau_gouvernorats le joint) : l'en exclure suffit
-- aux deux. Définition reprise de la migration 016, seule la clause WHERE
-- est nouvelle.
CREATE OR REPLACE FUNCTION app.statut_communes()
  RETURNS TABLE (
    commune_id          text,
    statut              text,
    derniere_activite   timestamptz,
    ecritures_30j       bigint,
    a_des_pesees        boolean
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  WITH activite AS (
    SELECT a.commune_id,
           max(a.changed_at) AS derniere,
           count(*) FILTER (WHERE a.changed_at > now() - interval '30 days') AS recentes
      FROM audit_log a
     WHERE a.commune_id IS NOT NULL
       -- Les écritures des scripts d'administration (identité technique
       -- 00000000-…) ne comptent pas comme de l'usage (voir migration 016).
       AND a.changed_by IS NOT NULL
       AND a.changed_by <> '00000000-0000-0000-0000-000000000000'::uuid
     GROUP BY a.commune_id
  ),
  pesees AS (
    SELECT p.commune_id, true AS presentes
      FROM pesees_anged p
     WHERE p.deleted_at IS NULL
     GROUP BY p.commune_id
  )
  SELECT c.id,
         CASE
           WHEN NOT c.activee                                    THEN 'desactivee'
           WHEN a.derniere IS NOT NULL OR p.presentes             THEN 'active'
           ELSE 'incomplete'
         END,
         a.derniere,
         COALESCE(a.recentes, 0),
         COALESCE(p.presentes, false)
    FROM communes c
    LEFT JOIN activite a ON a.commune_id = c.id
    LEFT JOIN pesees   p ON p.commune_id = c.id
   -- La commune de démonstration n'est pas déployée : elle n'existe pas.
   WHERE NOT c.est_demo;
$$;

-- La carte publique nationale (aucune commune demandée) l'écarte ; demandée
-- nommément, elle reste consultable pour la démonstration. Définition reprise
-- de la migration 021, seule la dernière condition est nouvelle.
CREATE OR REPLACE FUNCTION app.carte_publique(
    p_commune text DEFAULT NULL,
    p_depuis  date DEFAULT NULL
  )
  RETURNS TABLE (
    id          uuid,
    commune_id  text,
    categorie   text,
    statut      text,
    titre       text,
    lat         double precision,
    lng         double precision,
    photo_url   text,
    signale_le  date,
    resolu_le   date,
    delai_jours integer
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT t.id,
         t.commune_id,
         t.category,
         t.status,
         t.title,
         -- Arrondi à 0,001° (≈ 110 m) ICI, pas à l'affichage (migration 021).
         ST_Y(ST_SnapToGrid(t.geom, 0.001))::double precision,
         ST_X(ST_SnapToGrid(t.geom, 0.001))::double precision,
         CASE WHEN t.photo_publique THEN t.photo_url END,
         t.created_at::date,
         t.resolved_at::date,
         CASE WHEN t.resolved_at IS NOT NULL
              THEN EXTRACT(day FROM t.resolved_at - t.created_at)::integer END
    FROM tickets t
    JOIN communes c ON c.id = t.commune_id
   WHERE t.deleted_at IS NULL
     AND t.geom IS NOT NULL
     AND c.activee
     AND (p_commune IS NULL OR t.commune_id = p_commune)
     AND (p_depuis  IS NULL OR t.created_at::date >= p_depuis)
     AND (p_commune IS NOT NULL OR NOT c.est_demo)
   ORDER BY t.created_at DESC
   LIMIT 2000
$$;

-- -------------------------------------------------------------------------
-- 4. Les réponses de sondage simulées
-- -------------------------------------------------------------------------
-- La politique d'insertion de sondage_reponses n'ouvre la table qu'à un
-- citoyen répondant pour lui-même : c'est voulu, et le jeu ne crée aucun
-- compte citoyen. Cette fonction est la seule autre porte, et elle est
-- étroite : la FNCT, sur une publication d'une commune de démonstration.
CREATE OR REPLACE FUNCTION app.charger_reponses_demo(p_publication uuid, p_reponses jsonb)
  RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_demo boolean;
  v_n integer;
BEGIN
  IF NOT app.is_fnct() THEN
    RAISE EXCEPTION 'Seule la FNCT charge le jeu de démonstration.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT c.est_demo INTO v_demo
    FROM publications p JOIN communes c ON c.id = p.commune_id
   WHERE p.id = p_publication;
  IF NOT COALESCE(v_demo, false) THEN
    RAISE EXCEPTION 'Réponses simulées refusées : la publication n''appartient pas à une commune de démonstration.'
      USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO sondage_reponses (question_id, publication_id, choix, note)
  SELECT q.id, p_publication, x.choix, x.note
    FROM jsonb_to_recordset(p_reponses) AS x(question smallint, choix smallint[], note smallint)
    JOIN sondage_questions q ON q.publication_id = p_publication AND q.ordre = x.question;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END
$$;

COMMENT ON FUNCTION app.charger_reponses_demo(uuid, jsonb) IS
  'Réponses de sondage du jeu de démonstration, sans compte citoyen. FNCT seulement, et seulement sur une publication d''une commune de démonstration.';

GRANT EXECUTE ON FUNCTION app.charger_reponses_demo(uuid, jsonb) TO siipi_app;

-- -------------------------------------------------------------------------
-- 5. Le retrait
-- -------------------------------------------------------------------------
-- Toutes les tables d'une commune lui sont liées par ON DELETE CASCADE :
-- effacer la commune de démonstration emporte tout ce qu'elle contient,
-- équipes et réponses de sondage comprises (leurs tables suivent le circuit
-- et la publication). Le journal d'audit garde la trace des écritures et de
-- leur effacement : il n'est pas lié à la commune.
CREATE OR REPLACE FUNCTION app.retirer_jeu_demo(p_commune text)
  RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_demo boolean;
  v_lignes integer;
BEGIN
  IF NOT app.is_fnct() THEN
    RAISE EXCEPTION 'Seule la FNCT retire le jeu de démonstration.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT est_demo INTO v_demo FROM communes WHERE id = p_commune;
  IF v_demo IS NULL THEN
    RETURN 0;  -- rien à retirer : déjà retiré, ou jamais chargé
  END IF;
  IF NOT v_demo THEN
    RAISE EXCEPTION 'Retrait refusé : % est une commune réelle. Seule une commune de démonstration se retire.', p_commune
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT (SELECT count(*) FROM pesees WHERE commune_id = p_commune)
       + (SELECT count(*) FROM presences WHERE commune_id = p_commune)
       + (SELECT count(*) FROM tickets WHERE commune_id = p_commune)
    INTO v_lignes;
  DELETE FROM communes WHERE id = p_commune AND est_demo;
  RETURN v_lignes;
END
$$;

COMMENT ON FUNCTION app.retirer_jeu_demo(text) IS
  'Efface la commune de démonstration et tout ce qu''elle contient (FNCT seulement). Refuse une commune réelle. Rend le nombre de pesées, présences et réclamations effacées. Exception assumée à la suppression logique : rien de ce qui est effacé n''a eu lieu.';

GRANT EXECUTE ON FUNCTION app.retirer_jeu_demo(text) TO siipi_app;
