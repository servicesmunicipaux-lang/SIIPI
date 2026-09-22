-- ============================================================================
-- 020_prestataires_passages_incidents.sql
--
-- Le prestataire privé devient un acteur à part entière, et non plus seulement
-- une partie évaluée.
--
-- CE QUE CETTE MIGRATION CORRIGE
--
-- Le contrôle terrain (migration 019) donne à la commune un constat opposable :
-- « ce circuit a été fait / partiellement fait / non fait ». C'était la réponse
-- au directeur de propreté, qui veut prouver un manquement.
--
-- Mais le prestataire a le besoin symétrique : « si mon camion est passé, je
-- veux que ça se voie — pas que ça reste ma parole contre celle du citoyen ».
-- Il ne demande pas à modifier le verdict de la commune : il demande son propre
-- registre.
--
-- D'où DEUX déclarations indépendantes sur le même événement :
--   - la déclaration de passage, écrite par le prestataire depuis le terrain ;
--   - le constat de contrôle, écrit par la commune.
--
-- Toute la valeur est dans leur confrontation. Quand elles concordent,
-- l'affaire est réglée. Quand elles divergent, on n'a plus « ma parole contre
-- la sienne » mais un désaccord daté, localisé et photographié sur un circuit
-- précis — donc arbitrable. C'est ce que produit app.confrontation_passages().
--
-- SUR LA VALEUR PROBANTE
--
-- Qui saisit physiquement la déclaration depuis le camion reste à trancher
-- avec un prestataire réel. Plutôt que d'attendre cette décision, la table
-- enregistre COMMENT chaque déclaration a été faite : depuis le terrain ou
-- depuis le bureau, avec une position relevée par l'appareil, saisie à la main
-- ou absente, et sous quel compte. Une déclaration saisie le soir au bureau
-- n'a pas la même force qu'un relevé horodaté sur place — le système le dit
-- au lieu de le laisser supposer.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Un prestataire peut travailler pour plusieurs communes
--
-- Jusqu'ici, un compte était rattaché à EXACTEMENT une commune (users.commune_id),
-- et tout le cloisonnement reposait dessus. Un prestataire opérant sur trois
-- communes aurait eu besoin de trois comptes — donc de comptes partagés en
-- pratique, donc d'actions non attribuables dans le journal d'audit.
--
-- La table porte aussi la référence du contrat et ses dates : le prestataire
-- demande de la visibilité sur son propre contrat, et un rattachement échu ne
-- doit plus donner accès à rien.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS utilisateur_communes (
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    commune_id         TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    contrat_reference  TEXT,
    date_debut         DATE,
    date_fin           DATE,
    actif              BOOLEAN NOT NULL DEFAULT true,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, commune_id)
);

CREATE INDEX IF NOT EXISTS idx_utilisateur_communes_commune ON utilisateur_communes (commune_id);

COMMENT ON TABLE utilisateur_communes IS
  'Rattachement d''un compte à plusieurs communes (prestataire sous contrat avec plusieurs communes). Complète users.commune_id, qui reste le rattachement principal.';

-- Reprise de l'existant : chaque prestataire déjà rattaché à une commune garde
-- ce rattachement sous la nouvelle forme, sans rupture.
INSERT INTO utilisateur_communes (user_id, commune_id)
SELECT u.id, u.commune_id
  FROM users u
 WHERE u.role = 'gestionnaire_prestataire'
   AND u.commune_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Communes sur lesquelles l'utilisateur courant a des droits. Une seule
-- fonction à changer, et toutes les politiques de cloisonnement en héritent.
CREATE OR REPLACE FUNCTION app.mes_communes() RETURNS text[]
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT ARRAY(
    SELECT DISTINCT c FROM (
      SELECT app.current_commune() AS c
      UNION
      SELECT uc.commune_id
        FROM utilisateur_communes uc
       WHERE uc.user_id = app.current_user_id()
         AND uc.actif
         AND (uc.date_debut IS NULL OR uc.date_debut <= CURRENT_DATE)
         AND (uc.date_fin   IS NULL OR uc.date_fin   >= CURRENT_DATE)
    ) s
    WHERE c IS NOT NULL
  );
$$;

COMMENT ON FUNCTION app.mes_communes() IS
  'Communes accessibles à l''utilisateur courant. Un rattachement échu ne donne plus accès à rien.';

-- Les deux fonctions de droits s'appuient désormais sur cet ensemble. Le
-- comportement est identique pour un utilisateur mono-commune.
CREATE OR REPLACE FUNCTION app.can_write_commune(p_commune text) RETURNS boolean
  LANGUAGE sql STABLE AS
$$ SELECT app.is_fnct()
       OR (app.current_role_name() = 'admin_commune'
           AND p_commune IS NOT NULL
           AND p_commune = ANY (app.mes_communes())) $$;

CREATE OR REPLACE FUNCTION app.can_read_commune(p_commune text) RETURNS boolean
  LANGUAGE sql STABLE AS
$$ SELECT app.is_fnct()
       OR (app.current_role_name() IN ('admin_commune', 'gestionnaire_prestataire')
           AND p_commune IS NOT NULL
           AND p_commune = ANY (app.mes_communes())) $$;

ALTER TABLE utilisateur_communes ENABLE ROW LEVEL SECURITY;
ALTER TABLE utilisateur_communes FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS utilisateur_communes_select ON utilisateur_communes;
CREATE POLICY utilisateur_communes_select ON utilisateur_communes FOR SELECT
  USING (
    app.is_fnct()
    OR user_id = app.current_user_id()          -- son propre contrat
    OR app.can_write_commune(commune_id)        -- la commune voit ses prestataires
  );

DROP POLICY IF EXISTS utilisateur_communes_insert ON utilisateur_communes;
CREATE POLICY utilisateur_communes_insert ON utilisateur_communes FOR INSERT
  WITH CHECK (app.can_write_commune(commune_id));

DROP POLICY IF EXISTS utilisateur_communes_update ON utilisateur_communes;
CREATE POLICY utilisateur_communes_update ON utilisateur_communes FOR UPDATE
  USING (app.can_write_commune(commune_id)) WITH CHECK (app.can_write_commune(commune_id));

GRANT SELECT, INSERT, UPDATE ON utilisateur_communes TO siipi_app;
REVOKE DELETE, TRUNCATE ON utilisateur_communes FROM siipi_app;

-- Les circuits d'un prestataire, quelle que soit la commune.
CREATE OR REPLACE FUNCTION app.mes_circuits() RETURNS uuid[]
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$ SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
     FROM circuits
    WHERE prestataire_id = app.current_user_id()
      AND deleted_at IS NULL $$;

GRANT EXECUTE ON FUNCTION app.mes_communes()  TO siipi_app;
GRANT EXECUTE ON FUNCTION app.mes_circuits()  TO siipi_app;

-- ---------------------------------------------------------------------------
-- 2. Déclaration de passage — le registre du prestataire
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS declarations_passage (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    circuit_id      UUID NOT NULL REFERENCES circuits(id) ON DELETE CASCADE,
    commune_id      TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,

    date_passage    DATE NOT NULL DEFAULT CURRENT_DATE,
    heure_debut     TIMESTAMPTZ,
    heure_fin       TIMESTAMPTZ,
    statut          TEXT NOT NULL CHECK (statut IN ('effectue', 'partiel', 'impossible')),

    -- Conditions de la déclaration : c'est ce qui en fixe la valeur probante.
    -- Une saisie faite le soir au bureau n'a pas la force d'un relevé horodaté
    -- sur place, et le système doit le dire plutôt que de le laisser supposer.
    mode_saisie     TEXT NOT NULL DEFAULT 'terrain'
                      CHECK (mode_saisie IN ('terrain', 'bureau')),
    position        geometry(Point, 4326),
    position_source TEXT NOT NULL DEFAULT 'absente'
                      CHECK (position_source IN ('appareil', 'saisie', 'absente')),

    declare_par     UUID REFERENCES users(id) ON DELETE SET NULL,
    -- Nom de l'agent, utile tant que les chauffeurs n'ont pas de compte
    -- individuel : sans lui, une déclaration faite sur un téléphone partagé
    -- n'est attribuable à personne.
    agent_nom       TEXT,

    photo_url       TEXT,
    remarque        TEXT,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT declarations_une_par_jour UNIQUE (circuit_id, date_passage)
);

CREATE INDEX IF NOT EXISTS idx_declarations_commune ON declarations_passage (commune_id, date_passage DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_declarations_circuit ON declarations_passage (circuit_id, date_passage DESC) WHERE deleted_at IS NULL;

COMMENT ON TABLE declarations_passage IS
  'Registre du prestataire : preuve d''exécution d''une tournée. Symétrique du constat de la commune (controles_terrain), jamais confondu avec lui.';
COMMENT ON COLUMN declarations_passage.mode_saisie IS
  'terrain (sur place, pendant la tournée) | bureau (a posteriori). Détermine la valeur probante de la déclaration.';
COMMENT ON COLUMN declarations_passage.position_source IS
  'appareil (relevée par le téléphone) | saisie (indiquée à la main) | absente.';

-- ---------------------------------------------------------------------------
-- 3. Incidents de terrain — le canal qui manque
--
-- Accès bloqué, point saturé, panne : des faits qui ne relèvent pas de la
-- responsabilité du prestataire et qui EXPLIQUENT qu'un passage n'ait pas eu
-- lieu. Sans ce canal, la commune compte un « non fait » qui ne lui est pas
-- imputable, et le prestataire retourne à WhatsApp.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS incidents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id      TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    circuit_id      UUID REFERENCES circuits(id) ON DELETE SET NULL,

    date_incident   DATE NOT NULL DEFAULT CURRENT_DATE,
    type            TEXT NOT NULL CHECK (type IN (
                      'acces_bloque', 'point_sature', 'panne_vehicule',
                      'dechets_non_conformes', 'decharge_fermee', 'autre')),
    description     TEXT,
    photo_url       TEXT,
    position        geometry(Point, 4326),

    declare_par     UUID REFERENCES users(id) ON DELETE SET NULL,
    statut          TEXT NOT NULL DEFAULT 'ouvert'
                      CHECK (statut IN ('ouvert', 'pris_en_compte', 'clos')),
    reponse_commune TEXT,
    traite_par      UUID REFERENCES users(id) ON DELETE SET NULL,
    traite_le       TIMESTAMPTZ,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_incidents_commune ON incidents (commune_id, date_incident DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_incidents_circuit ON incidents (circuit_id, date_incident DESC) WHERE deleted_at IS NULL;

COMMENT ON TABLE incidents IS
  'Contraintes de terrain signalées par le prestataire. Un incident sur un circuit explique qu''un passage n''ait pas eu lieu : il doit être lu à côté du constat, pas séparément.';

-- ---------------------------------------------------------------------------
-- 4. Cloisonnement
--
-- Le prestataire écrit SES déclarations et SES incidents, sur SES circuits.
-- Il ne peut ni écrire ni modifier le constat de la commune. La commune lit
-- tout ce qui la concerne, répond aux incidents, mais ne réécrit pas le
-- registre du prestataire — sinon les deux sources cesseraient d'être
-- indépendantes, et leur confrontation ne prouverait plus rien.
-- ---------------------------------------------------------------------------

ALTER TABLE declarations_passage ENABLE ROW LEVEL SECURITY;
ALTER TABLE declarations_passage FORCE  ROW LEVEL SECURITY;
ALTER TABLE incidents            ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents            FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS declarations_select ON declarations_passage;
CREATE POLICY declarations_select ON declarations_passage FOR SELECT
  USING (
    deleted_at IS NULL
    AND (app.can_read_commune(commune_id) OR circuit_id = ANY (app.mes_circuits()))
  );

DROP POLICY IF EXISTS declarations_insert ON declarations_passage;
CREATE POLICY declarations_insert ON declarations_passage FOR INSERT
  WITH CHECK (
    app.is_fnct()
    OR (app.current_role_name() = 'gestionnaire_prestataire'
        AND circuit_id = ANY (app.mes_circuits()))
  );

DROP POLICY IF EXISTS declarations_update ON declarations_passage;
CREATE POLICY declarations_update ON declarations_passage FOR UPDATE
  USING (
    deleted_at IS NULL
    AND (app.is_fnct()
         OR (app.current_role_name() = 'gestionnaire_prestataire'
             AND circuit_id = ANY (app.mes_circuits())))
  )
  WITH CHECK (
    app.is_fnct()
    OR (app.current_role_name() = 'gestionnaire_prestataire'
        AND circuit_id = ANY (app.mes_circuits()))
  );

DROP POLICY IF EXISTS incidents_select ON incidents;
CREATE POLICY incidents_select ON incidents FOR SELECT
  USING (
    deleted_at IS NULL
    AND (app.can_read_commune(commune_id) OR declare_par = app.current_user_id())
  );

DROP POLICY IF EXISTS incidents_insert ON incidents;
CREATE POLICY incidents_insert ON incidents FOR INSERT
  WITH CHECK (app.can_read_commune(commune_id));

-- La commune répond, le prestataire corrige sa propre déclaration : les deux
-- peuvent écrire, sur des champs différents que l'API distingue.
DROP POLICY IF EXISTS incidents_update ON incidents;
CREATE POLICY incidents_update ON incidents FOR UPDATE
  USING (deleted_at IS NULL
         AND (app.can_write_commune(commune_id) OR declare_par = app.current_user_id()))
  WITH CHECK (app.can_write_commune(commune_id) OR declare_par = app.current_user_id());

REVOKE DELETE, TRUNCATE ON declarations_passage, incidents FROM siipi_app;

DROP TRIGGER IF EXISTS trg_audit_declarations_passage ON declarations_passage;
CREATE TRIGGER trg_audit_declarations_passage AFTER INSERT OR UPDATE OR DELETE ON declarations_passage
  FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement();

DROP TRIGGER IF EXISTS trg_audit_incidents ON incidents;
CREATE TRIGGER trg_audit_incidents AFTER INSERT OR UPDATE OR DELETE ON incidents
  FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement();

-- ---------------------------------------------------------------------------
-- 5. Confrontation des deux registres
--
-- Le cœur du module. Pour chaque circuit et chaque jour où un passage était
-- prévu, on met face à face ce que le prestataire a déclaré et ce que la
-- commune a constaté, et on qualifie la situation :
--
--   concordant     les deux disent la même chose — rien à arbitrer
--   divergent      les deux se contredisent — c'est là qu'il faut regarder
--   non_controle   le prestataire a déclaré, la commune n'a pas vérifié
--   non_declare    la commune a constaté, le prestataire n'a rien déclaré
--   silence        ni l'un ni l'autre — un passage prévu dont personne ne parle
--
-- La présence d'un incident ce jour-là est remontée : un « non fait » expliqué
-- par un accès bloqué n'est pas un manquement du prestataire.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.confrontation_passages(
    p_commune text DEFAULT NULL,
    p_depuis  date DEFAULT (CURRENT_DATE - 30),
    p_jusqua  date DEFAULT CURRENT_DATE
  )
  RETURNS TABLE (
    circuit_id        uuid,
    circuit_nom       text,
    commune_id        text,
    prestataire_nom   text,
    jour              date,
    declaration       text,
    constat           text,
    incident          text,
    situation         text,
    mode_saisie       text,
    position_source   text
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  WITH circuits_vus AS (
    SELECT c.*, u.full_name AS prestataire_nom
      FROM circuits c
      LEFT JOIN users u ON u.id = c.prestataire_id
     WHERE c.deleted_at IS NULL
       AND c.actif
       AND (p_commune IS NULL OR c.commune_id = p_commune)
       AND (app.is_fnct()
            OR app.can_read_commune(c.commune_id)
            OR c.prestataire_id = app.current_user_id())
  ),
  attendus AS (
    SELECT cv.id, cv.nom, cv.commune_id, cv.prestataire_nom, j.jour::date AS jour
      FROM circuits_vus cv
      CROSS JOIN generate_series(p_depuis, p_jusqua, interval '1 day') AS j(jour)
     WHERE EXTRACT(ISODOW FROM j.jour)::smallint = ANY (cv.jours_passage)
  )
  SELECT
    a.id, a.nom, a.commune_id, a.prestataire_nom, a.jour,
    d.statut, ct.etat, i.type,
    CASE
      WHEN d.statut IS NULL AND ct.etat IS NULL THEN 'silence'
      WHEN d.statut IS NULL                     THEN 'non_declare'
      WHEN ct.etat  IS NULL                     THEN 'non_controle'
      WHEN (d.statut = 'effectue'   AND ct.etat = 'fait')
        OR (d.statut = 'partiel'    AND ct.etat = 'partiel')
        OR (d.statut = 'impossible' AND ct.etat = 'non_fait') THEN 'concordant'
      ELSE 'divergent'
    END,
    d.mode_saisie, d.position_source
  FROM attendus a
  LEFT JOIN declarations_passage d
         ON d.circuit_id = a.id AND d.date_passage = a.jour AND d.deleted_at IS NULL
  LEFT JOIN controles_terrain ct
         ON ct.circuit_id = a.id AND ct.date_controle = a.jour AND ct.deleted_at IS NULL
  LEFT JOIN LATERAL (
    SELECT x.type FROM incidents x
     WHERE x.circuit_id = a.id AND x.date_incident = a.jour AND x.deleted_at IS NULL
     ORDER BY x.created_at LIMIT 1
  ) i ON true
  ORDER BY a.jour DESC, a.nom;
$$;

COMMENT ON FUNCTION app.confrontation_passages(text, date, date) IS
  'Met face à face le registre du prestataire et le constat de la commune. Les divergences deviennent des désaccords datés et arbitrables, au lieu d''une parole contre une autre.';

GRANT EXECUTE ON FUNCTION app.confrontation_passages(text, date, date) TO siipi_app;

-- ---------------------------------------------------------------------------
-- 6. Les nouvelles tables entrent dans la suppression logique
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
                     'declarations_passage', 'incidents') THEN
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
