-- 021_espace_citoyen_horaires.sql
--
-- Espace citoyen : les horaires d'abord, la réclamation ensuite.
--
-- Le module citoyen construit jusqu'ici ne savait faire qu'une chose : se
-- plaindre. Or un citoyen n'installe pas une application pour se plaindre — il
-- l'installe pour savoir QUAND SORTIR SES POUBELLES. L'horaire est ce qui fait
-- ouvrir l'application ; la réclamation est ce qu'on y fait une fois qu'elle
-- est ouverte. Construire la seconde sans le premier, c'est construire un
-- service que personne ne lance.
--
-- Cette migration pose quatre choses :
--   1. l'adresse du citoyen, et le lien qui manquait : adresse → zone → circuit
--   2. les annonces de collecte (jour férié, panne, report) : l'exception
--   3. les horaires calculés, y compris le prochain passage
--   4. la carte publique des signalements, dépersonnalisée
--
-- =========================================================================
-- 1. L'adresse du citoyen
--
-- Sans adresse, la question « quand passe-t-on chez moi ? » n'a pas de
-- réponse : la commune a des circuits, le citoyen a un compte, et rien ne
-- relie les deux. Le point géographique sert à retrouver la zone de collecte
-- qui le contient ; l'adresse en texte reste ce que le citoyen reconnaît.
-- =========================================================================

ALTER TABLE citoyens
    ADD COLUMN IF NOT EXISTS commune_id    TEXT REFERENCES communes(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS adresse       TEXT,
    ADD COLUMN IF NOT EXISTS position      geometry(Point, 4326),
    ADD COLUMN IF NOT EXISTS zone_id       UUID REFERENCES zones_collecte(id) ON DELETE SET NULL,
    -- Le citoyen choisit d'être prévenu ou non. Par défaut oui : quelqu'un qui
    -- renseigne son adresse demande implicitement qu'on lui dise quand on passe.
    ADD COLUMN IF NOT EXISTS notifications BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS adresse_maj   TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_citoyens_commune  ON citoyens (commune_id);
CREATE INDEX IF NOT EXISTS idx_citoyens_position ON citoyens USING GIST (position);

COMMENT ON COLUMN citoyens.position IS
  'Domicile déclaré. Donnée à caractère personnel : n''est jamais exposée par les vues publiques (décret-loi 2022-54).';
COMMENT ON COLUMN citoyens.zone_id IS
  'Zone de collecte contenant le domicile, résolue par app.resoudre_zone(). NULL si la commune n''a pas encore découpé son territoire.';

-- Résolution adresse → zone. Fonction SECURITY DEFINER : zones_collecte est
-- protégée par RLS et un citoyen n'a pas le droit de lire le découpage
-- opérationnel de sa commune. Il a en revanche le droit de savoir dans quelle
-- zone il habite — c'est exactement ce que cette fonction lui rend, et rien
-- de plus : un identifiant, pas le polygone.
CREATE OR REPLACE FUNCTION app.resoudre_zone(p_commune text, p_lat double precision, p_lng double precision)
  RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT z.id
    FROM zones_collecte z
   WHERE z.commune_id = p_commune
     AND z.status = 'active'
     AND z.deleted_at IS NULL
     AND p_lat IS NOT NULL AND p_lng IS NOT NULL
     AND ST_Contains(z.geom, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326))
   -- Les zones peuvent se chevaucher (un secteur spécialisé tracé à
   -- l'intérieur d'un secteur général, ou deux découpages successifs mal
   -- nettoyés). On retient la plus petite qui contient le point : c'est la
   -- plus spécifique, et surtout c'est un choix REPRODUCTIBLE — sans tri, le
   -- même citoyen pouvait changer de zone d'une requête à l'autre.
   ORDER BY ST_Area(z.geom)
   LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION app.resoudre_zone(text, double precision, double precision) TO siipi_app;

-- Enregistrement de l'adresse par le citoyen lui-même. SECURITY DEFINER pour
-- la même raison : la résolution de zone traverse une table qu'il ne lit pas.
-- La fonction n'écrit que sur SA propre ligne — l'identifiant vient du
-- contexte de session, jamais du client.
CREATE OR REPLACE FUNCTION app.enregistrer_adresse(
    p_commune text, p_adresse text, p_lat double precision, p_lng double precision
  )
  RETURNS TABLE (citizen_id uuid, commune_id text, adresse text, zone_id uuid,
                 lat double precision, lng double precision)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS
$fn$
DECLARE
  v_citizen uuid;
  v_zone    uuid;
BEGIN
  v_citizen := app.my_citizen_id();
  IF v_citizen IS NULL THEN
    RAISE EXCEPTION 'PROFIL_CITOYEN_INTROUVABLE' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM communes c WHERE c.id = p_commune) THEN
    RAISE EXCEPTION 'COMMUNE_INCONNUE: %', p_commune USING ERRCODE = 'foreign_key_violation';
  END IF;

  v_zone := app.resoudre_zone(p_commune, p_lat, p_lng);

  UPDATE citoyens c
     SET commune_id  = p_commune,
         adresse     = p_adresse,
         position    = CASE WHEN p_lat IS NULL OR p_lng IS NULL THEN NULL
                            ELSE ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326) END,
         zone_id     = v_zone,
         adresse_maj = now()
   WHERE c.id = v_citizen;

  RETURN QUERY
    SELECT c.id, c.commune_id, c.adresse, c.zone_id,
           ST_Y(c.position)::double precision, ST_X(c.position)::double precision
      FROM citoyens c WHERE c.id = v_citizen;
END;
$fn$;

GRANT EXECUTE ON FUNCTION app.enregistrer_adresse(text, text, double precision, double precision) TO siipi_app;

-- =========================================================================
-- 2. Annonces de collecte — l'exception
--
-- « Alerte en cas de changement exceptionnel » (persona citoyen). Un jour
-- férié, une panne de benne, une route coupée : le calendrier théorique ne
-- suffit pas. Sans ce canal, la commune prévient par affichage municipal et
-- page Facebook, et le citoyen découvre au pied de son immeuble.
--
-- Une annonce porte sur un circuit, ou sur toute la commune (circuit_id NULL).
-- =========================================================================

CREATE TABLE IF NOT EXISTS annonces_collecte (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id    TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    circuit_id    UUID REFERENCES circuits(id) ON DELETE CASCADE,

    type          TEXT NOT NULL CHECK (type IN (
                    'suppression',   -- pas de passage ce jour-là
                    'report',        -- passage déplacé à une autre date
                    'ajout',         -- passage supplémentaire
                    'information')), -- message sans effet sur le calendrier
    date_debut    DATE NOT NULL,
    date_fin      DATE NOT NULL,
    -- Pour un report : la date à laquelle le passage est déplacé.
    date_report   DATE,

    -- Bilingue : un service public tunisien s'adresse à ses administrés en
    -- arabe. Le front bascule selon la langue choisie, sans retraduire.
    message_fr    TEXT NOT NULL,
    message_ar    TEXT,

    publiee       BOOLEAN NOT NULL DEFAULT true,
    publiee_par   UUID REFERENCES users(id) ON DELETE SET NULL,

    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at    TIMESTAMPTZ,
    deleted_by    UUID REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT annonces_periode_coherente CHECK (date_fin >= date_debut),
    CONSTRAINT annonces_report_date CHECK (type <> 'report' OR date_report IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_annonces_commune ON annonces_collecte (commune_id, date_debut DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_annonces_circuit ON annonces_collecte (circuit_id, date_debut DESC) WHERE deleted_at IS NULL;

COMMENT ON TABLE annonces_collecte IS
  'Changements exceptionnels du calendrier de collecte, lisibles par les citoyens concernés. Une annonce de type report ou suppression modifie les horaires affichés.';

-- =========================================================================
-- 3. Les horaires
--
-- Ce que le citoyen voit : les circuits qui desservent son adresse, leurs
-- jours de passage, la date du prochain passage, et les annonces en cours.
--
-- Deux niveaux de précision, et la fonction dit lequel s'applique :
--   'zone'    le domicile tombe dans une zone de collecte, les circuits
--             affichés sont ceux de cette zone — c'est la bonne réponse
--   'commune' la commune n'a pas (encore) découpé son territoire, ou
--             l'adresse ne tombe dans aucune zone : on affiche tous les
--             circuits de la commune, en le disant
--
-- Afficher « commune » sans le dire serait pire que ne rien afficher : le
-- citoyen sortirait ses poubelles le mauvais jour en croyant l'information
-- exacte. Le front doit rendre cette nuance visible.
-- =========================================================================

CREATE OR REPLACE FUNCTION app.horaires_citoyen(p_jours integer DEFAULT 14)
  RETURNS TABLE (
    circuit_id       uuid,
    circuit_nom      text,
    type_dechet      text,
    jours_passage    smallint[],
    precision_source text,
    prochain_passage date,
    annonce_type     text,
    annonce_message  text,
    -- Le message arabe voyage à côté du français : le front choisit selon la
    -- langue affichée. Renvoyer le seul français obligerait l'application à
    -- montrer un texte français dans une interface arabe — exactement ce que
    -- le bilinguisme du TDR cherche à éviter.
    annonce_message_ar text,
    annonce_date     date
  )
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$fn$
DECLARE
  v_citizen uuid;
  v_commune text;
  v_zone    uuid;
  v_precision text;
BEGIN
  v_citizen := app.my_citizen_id();
  IF v_citizen IS NULL THEN
    RETURN;
  END IF;

  SELECT c.commune_id, c.zone_id INTO v_commune, v_zone
    FROM citoyens c WHERE c.id = v_citizen;

  IF v_commune IS NULL THEN
    RETURN;  -- adresse non renseignée : le front doit la demander
  END IF;

  -- La zone ne compte que si des circuits y sont réellement rattachés :
  -- une zone dessinée mais non affectée renverrait une liste vide, et le
  -- citoyen conclurait qu'on ne passe jamais chez lui.
  IF v_zone IS NOT NULL AND EXISTS (
       SELECT 1 FROM circuits ci
        WHERE ci.zone_id = v_zone AND ci.actif AND ci.deleted_at IS NULL) THEN
    v_precision := 'zone';
  ELSE
    v_precision := 'commune';
    v_zone := NULL;
  END IF;

  RETURN QUERY
  WITH circuits_desservants AS (
    SELECT ci.id, ci.nom, ci.type_dechet, ci.jours_passage
      FROM circuits ci
     WHERE ci.commune_id = v_commune
       AND ci.actif
       AND ci.deleted_at IS NULL
       AND (v_zone IS NULL OR ci.zone_id = v_zone)
  ),
  -- Jours calendaires à venir où chaque circuit est prévu. EXTRACT(isodow)
  -- rend 1 pour lundi et 7 pour dimanche, exactement la convention retenue
  -- pour circuits.jours_passage (migration 019).
  passages_prevus AS (
    SELECT cd.id,
           j::date AS jour
      FROM circuits_desservants cd
      CROSS JOIN generate_series(CURRENT_DATE, CURRENT_DATE + p_jours, INTERVAL '1 day') AS j
     WHERE EXTRACT(isodow FROM j)::smallint = ANY (cd.jours_passage)
  ),
  -- Une suppression annoncée retire le passage du calendrier : sinon le
  -- citoyen lirait « demain » alors que la commune a justement annoncé
  -- l'inverse, et l'annonce servirait à rien.
  passages_effectifs AS (
    SELECT pp.id, pp.jour
      FROM passages_prevus pp
     WHERE NOT EXISTS (
       SELECT 1 FROM annonces_collecte a
        WHERE a.commune_id = v_commune
          AND a.deleted_at IS NULL AND a.publiee
          AND a.type IN ('suppression', 'report')
          AND (a.circuit_id IS NULL OR a.circuit_id = pp.id)
          AND pp.jour BETWEEN a.date_debut AND a.date_fin)
    UNION
    -- Un report crée un passage à sa nouvelle date.
    SELECT cd.id, a.date_report
      FROM circuits_desservants cd
      JOIN annonces_collecte a
        ON a.commune_id = v_commune
       AND a.deleted_at IS NULL AND a.publiee
       AND a.type IN ('report', 'ajout')
       AND (a.circuit_id IS NULL OR a.circuit_id = cd.id)
     WHERE a.date_report IS NOT NULL
       AND a.date_report >= CURRENT_DATE
  )
  SELECT cd.id,
         cd.nom,
         cd.type_dechet,
         cd.jours_passage,
         v_precision,
         (SELECT min(pe.jour) FROM passages_effectifs pe WHERE pe.id = cd.id),
         a.type,
         a.message_fr,
         a.message_ar,
         a.date_debut
    FROM circuits_desservants cd
    LEFT JOIN LATERAL (
      SELECT an.type, an.message_fr, an.message_ar, an.date_debut
        FROM annonces_collecte an
       WHERE an.commune_id = v_commune
         AND an.deleted_at IS NULL AND an.publiee
         AND (an.circuit_id IS NULL OR an.circuit_id = cd.id)
         AND an.date_fin >= CURRENT_DATE
       ORDER BY an.date_debut
       LIMIT 1
    ) a ON true
   ORDER BY cd.nom;
END;
$fn$;

GRANT EXECUTE ON FUNCTION app.horaires_citoyen(integer) TO siipi_app;

-- =========================================================================
-- 4. La carte publique des signalements
--
-- Décision : couverture complète (tous les signalements, tous les statuts),
-- identification nulle.
--
-- Le décret-loi 2022-54 n'interdit pas de publier ; il impose de ne publier
-- que ce qui sert le but poursuivi. Le but ici est de montrer que les
-- signalements existent et qu'ils sont traités. Ce but n'a besoin ni du nom
-- du déclarant, ni de son téléphone, ni de sa description en texte libre
-- (où les gens écrivent spontanément « chez M. Y, au 12 »), ni de la
-- position au mètre près.
--
-- Trois garde-fous, inscrits ici et non dans le code applicatif — un
-- garde-fou qu'on peut contourner en écrivant une autre requête n'en est
-- pas un :
--
--   a) les colonnes personnelles ne sortent pas de la fonction
--   b) la position est arrondie à une grille de 0,001° (~110 m) : assez
--      pour voir le point noir dans sa rue, pas assez pour désigner une porte
--   c) la photo n'est publiée qu'après validation par la commune
-- =========================================================================

ALTER TABLE tickets
    ADD COLUMN IF NOT EXISTS photo_publique BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS photo_validee_par UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS photo_validee_le  TIMESTAMPTZ;

COMMENT ON COLUMN tickets.photo_publique IS
  'Photo vérifiée par la commune (ni visage, ni plaque, ni intérieur privé) et publiable sur la carte citoyenne. Faux par défaut : la publication est un acte, pas un oubli.';

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
         -- ST_SnapToGrid ramène le point au nœud le plus proche d'une grille
         -- de 0,001° ≈ 110 m. L'arrondi est fait ICI, pas à l'affichage : une
         -- coordonnée exacte qui sort du serveur est publiée, quoi qu'en
         -- fasse le client.
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
   ORDER BY t.created_at DESC
   LIMIT 2000
$$;

COMMENT ON FUNCTION app.carte_publique(text, date) IS
  'Carte citoyenne des signalements. Couverture complète, identification nulle : ni nom, ni téléphone, ni description libre, position arrondie à ~110 m, photo seulement si validée par la commune.';

-- Accessible sans authentification : c'est une carte publique. La fonction
-- est la seule porte — la table tickets reste fermée par RLS.
GRANT EXECUTE ON FUNCTION app.carte_publique(text, date) TO siipi_app;

-- =========================================================================
-- 5. Cloisonnement des annonces
-- =========================================================================

ALTER TABLE annonces_collecte ENABLE ROW LEVEL SECURITY;
ALTER TABLE annonces_collecte FORCE  ROW LEVEL SECURITY;

-- Une annonce publiée s'adresse au public : tout utilisateur authentifié la
-- lit, y compris un citoyen d'une autre commune (il peut avoir une résidence
-- secondaire, ou consulter avant de déménager). Les brouillons restent chez
-- la commune qui les rédige.
DROP POLICY IF EXISTS annonces_select ON annonces_collecte;
CREATE POLICY annonces_select ON annonces_collecte FOR SELECT
  USING (
    deleted_at IS NULL
    AND (publiee OR app.can_read_commune(commune_id))
  );

DROP POLICY IF EXISTS annonces_insert ON annonces_collecte;
CREATE POLICY annonces_insert ON annonces_collecte FOR INSERT
  WITH CHECK (app.can_write_commune(commune_id));

DROP POLICY IF EXISTS annonces_update ON annonces_collecte;
CREATE POLICY annonces_update ON annonces_collecte FOR UPDATE
  USING (deleted_at IS NULL AND app.can_write_commune(commune_id))
  WITH CHECK (app.can_write_commune(commune_id));

REVOKE DELETE, TRUNCATE ON annonces_collecte FROM siipi_app;

DROP TRIGGER IF EXISTS trg_audit_annonces ON annonces_collecte;
CREATE TRIGGER trg_audit_annonces AFTER INSERT OR UPDATE OR DELETE ON annonces_collecte
  FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement();

DROP TRIGGER IF EXISTS trg_annonces_updated_at ON annonces_collecte;
CREATE TRIGGER trg_annonces_updated_at
  BEFORE UPDATE ON annonces_collecte
  FOR EACH ROW EXECUTE FUNCTION zones_collecte_set_updated_at();

-- =========================================================================
-- 6. Suppression logique : la table s'ajoute au registre existant
-- =========================================================================

CREATE OR REPLACE FUNCTION app.lignes_supprimees()
  RETURNS TABLE (table_name text, record_id text, commune_id text,
                 deleted_at timestamptz, deleted_by uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$fn$
  WITH toutes AS (
    SELECT 'zones_collecte' AS t, z.id::text AS rid, z.commune_id, z.deleted_at, z.deleted_by FROM zones_collecte z WHERE z.deleted_at IS NOT NULL
    UNION ALL
    SELECT 'vehicules',            v.id::text, v.commune_id, v.deleted_at, v.deleted_by FROM vehicules            v WHERE v.deleted_at IS NOT NULL
    UNION ALL
    SELECT 'conteneurs',           c.id::text, c.commune_id, c.deleted_at, c.deleted_by FROM conteneurs           c WHERE c.deleted_at IS NOT NULL
    UNION ALL
    SELECT 'pesees_anged',         p.id::text, p.commune_id, p.deleted_at, p.deleted_by FROM pesees_anged         p WHERE p.deleted_at IS NOT NULL
    UNION ALL
    SELECT 'tickets',              k.id::text, k.commune_id, k.deleted_at, k.deleted_by FROM tickets              k WHERE k.deleted_at IS NOT NULL
    UNION ALL
    SELECT 'circuits',             q.id::text, q.commune_id, q.deleted_at, q.deleted_by FROM circuits             q WHERE q.deleted_at IS NOT NULL
    UNION ALL
    SELECT 'controles_terrain',    o.id::text, o.commune_id, o.deleted_at, o.deleted_by FROM controles_terrain    o WHERE o.deleted_at IS NOT NULL
    UNION ALL
    SELECT 'declarations_passage', d.id::text, d.commune_id, d.deleted_at, d.deleted_by FROM declarations_passage d WHERE d.deleted_at IS NOT NULL
    UNION ALL
    SELECT 'incidents',            i.id::text, i.commune_id, i.deleted_at, i.deleted_by FROM incidents            i WHERE i.deleted_at IS NOT NULL
    UNION ALL
    SELECT 'annonces_collecte',    a.id::text, a.commune_id, a.deleted_at, a.deleted_by FROM annonces_collecte    a WHERE a.deleted_at IS NOT NULL
  )
  -- Le filtre est DANS la fonction, et non dans une politique : SECURITY
  -- DEFINER neutralise le RLS, donc sans cette clause le registre des
  -- suppressions serait le seul endroit de la plateforme où une commune
  -- verrait ce que ses voisines effacent.
  SELECT t, rid, commune_id, deleted_at, deleted_by
    FROM toutes
   WHERE app.is_fnct()
      OR (app.current_role_name() = 'admin_commune' AND commune_id = app.current_commune())
   ORDER BY deleted_at DESC;
$fn$;

GRANT EXECUTE ON FUNCTION app.lignes_supprimees() TO siipi_app;

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
                     'declarations_passage', 'incidents', 'annonces_collecte') THEN
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

GRANT SELECT, INSERT, UPDATE ON annonces_collecte TO siipi_app;
