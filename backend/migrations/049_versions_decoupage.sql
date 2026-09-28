-- ===========================================================================
-- Migration 049 — Jalon 7, lot 2 : le découpage validé et versionné
--                 (TDR §3.2.8 — C2.5 et C2.6)
--
-- C2.5 — la validation par le Super Admin FNCT ;
-- C2.6 — l'historique, et le retour à une version précédente.
--
-- CE QUI EST VALIDÉ, C'EST UN ÉTAT COMPLET. Une commune ne propose pas « ce
-- polygone-ci » : elle propose son découpage — son périmètre et l'ensemble de
-- ses secteurs — tel qu'elle veut qu'il soit. La FNCT le compare à l'état en
-- vigueur et l'accepte ou le refuse d'un bloc. C'est ce qui permet de revenir
-- en arrière : une version est une photographie qu'on sait réappliquer, pas
-- une suite de retouches dont il faudrait rejouer l'ordre.
--
-- UNE VERSION VALIDÉE EST CE QUI A ÉTÉ APPLIQUÉ. À la validation, la version
-- enregistre l'état effectivement obtenu (périmètre et secteurs). La restaurer
-- redonne exactement cet état, y compris les identifiants des secteurs : les
-- engins, les circuits et les adresses citoyennes rattachés à un secteur le
-- retrouvent (un secteur retiré n'est jamais effacé, migration 015).
--
-- LA PREMIÈRE MODIFICATION PHOTOGRAPHIE D'ABORD L'EXISTANT. Avant d'appliquer
-- quoi que ce soit à une commune qui n'a encore aucune version, l'état présent
-- est figé en version 1 (« initiale ») : sans elle, le premier changement
-- n'aurait pas de « version précédente » où revenir.
--
-- QUI FAIT QUOI.
--   - La commune propose (une proposition en attente à la fois), retire sa
--     proposition, ou propose de revenir à une version antérieure.
--   - La FNCT valide ou refuse, motif à l'appui ; elle peut aussi corriger ou
--     restaurer directement — ce qui crée une version, comme le reste.
--   - Le prestataire ne voit ni les propositions ni l'historique.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS versions_decoupage (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id         TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,

    -- Numéro attribué à la validation : 1, 2, 3… par commune. Nul tant que la
    -- version n'est pas validée (une proposition refusée n'a pas de numéro).
    numero             INTEGER,
    statut             TEXT NOT NULL DEFAULT 'soumise',
    origine            TEXT NOT NULL DEFAULT 'proposition',
    -- Vrai pour une action directe de la FNCT (correction, restauration) :
    -- elle est validée dans la même transaction, et ne bloque donc pas une
    -- proposition de la commune en attente.
    directe            BOOLEAN NOT NULL DEFAULT false,

    -- Le périmètre proposé. perimetre_modifie = false : la proposition ne
    -- touche que les secteurs, et le périmètre en vigueur au moment de la
    -- validation est conservé (une correction FNCT intervenue entre-temps
    -- n'est pas défaite).
    perimetre          geometry(MultiPolygon, 4326),
    perimetre_modifie  BOOLEAN NOT NULL DEFAULT false,
    -- Même règle pour les secteurs : zones_modifiees = false, une proposition
    -- qui ne touche que le périmètre laisse les secteurs en vigueur tels
    -- qu'ils seront au moment de la validation.
    zones_modifiees    BOOLEAN NOT NULL DEFAULT true,
    -- L'ensemble des secteurs, chacun avec son identifiant :
    -- [{ id, name, code, description, color, collection_frequency,
    --    estimated_population, geometry (GeoJSON) }]
    zones              JSONB NOT NULL DEFAULT '[]'::jsonb,

    note               TEXT,
    motif_refus        TEXT,
    restaure_de        UUID REFERENCES versions_decoupage(id) ON DELETE SET NULL,

    soumise_par        UUID REFERENCES users(id) ON DELETE SET NULL,
    soumise_le         TIMESTAMPTZ NOT NULL DEFAULT now(),
    decidee_par        UUID REFERENCES users(id) ON DELETE SET NULL,
    decidee_le         TIMESTAMPTZ,

    CONSTRAINT versions_decoupage_statut_valide CHECK (statut IN ('soumise', 'validee', 'refusee', 'retiree')),
    CONSTRAINT versions_decoupage_origine_valide CHECK (origine IN ('initiale', 'proposition', 'correction_fnct', 'restauration')),
    CONSTRAINT versions_decoupage_zones_tableau CHECK (jsonb_typeof(zones) = 'array'),
    CONSTRAINT versions_decoupage_numero_si_validee CHECK ((statut = 'validee') = (numero IS NOT NULL)),
    CONSTRAINT versions_decoupage_motif_si_refus CHECK (statut <> 'refusee' OR length(btrim(coalesce(motif_refus, ''))) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_versions_decoupage_numero
  ON versions_decoupage (commune_id, numero) WHERE numero IS NOT NULL;
-- Une proposition en attente à la fois : deux propositions concurrentes
-- obligeraient la FNCT à deviner laquelle la commune veut vraiment.
CREATE UNIQUE INDEX IF NOT EXISTS idx_versions_decoupage_une_en_attente
  ON versions_decoupage (commune_id) WHERE statut = 'soumise' AND NOT directe;
CREATE INDEX IF NOT EXISTS idx_versions_decoupage_statut
  ON versions_decoupage (statut, soumise_le);

COMMENT ON TABLE versions_decoupage IS
  'Versions du découpage d''une commune (TDR §3.2.8, C2.5/C2.6) : propositions soumises à la FNCT, puis états validés numérotés, chacun réapplicable. Une version validée enregistre l''état effectivement obtenu.';

DROP TRIGGER IF EXISTS trg_audit_versions_decoupage ON versions_decoupage;
CREATE TRIGGER trg_audit_versions_decoupage AFTER INSERT OR UPDATE OR DELETE ON versions_decoupage
  FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement();

ALTER TABLE versions_decoupage ENABLE ROW LEVEL SECURITY;
ALTER TABLE versions_decoupage FORCE  ROW LEVEL SECURITY;

-- La commune et la FNCT lisent ; la commune propose et retire ; seule la FNCT
-- décide (le contrôle est dans app.valider_version_decoupage et dans la
-- politique de mise à jour).
DROP POLICY IF EXISTS versions_decoupage_select ON versions_decoupage;
CREATE POLICY versions_decoupage_select ON versions_decoupage FOR SELECT
  USING (app.can_write_commune(commune_id));
DROP POLICY IF EXISTS versions_decoupage_insert ON versions_decoupage;
CREATE POLICY versions_decoupage_insert ON versions_decoupage FOR INSERT
  WITH CHECK (app.can_write_commune(commune_id) AND statut = 'soumise' AND (NOT directe OR app.is_fnct()));
DROP POLICY IF EXISTS versions_decoupage_update ON versions_decoupage;
CREATE POLICY versions_decoupage_update ON versions_decoupage FOR UPDATE
  USING (app.can_write_commune(commune_id) AND statut = 'soumise')
  -- Hors FNCT, une proposition ne peut que se retirer.
  WITH CHECK (app.is_fnct() OR (app.can_write_commune(commune_id) AND statut = 'retiree'));

GRANT SELECT, INSERT, UPDATE ON versions_decoupage TO siipi_app;
REVOKE DELETE, TRUNCATE ON versions_decoupage FROM siipi_app;

-- ---------------------------------------------------------------------------
-- La photographie de l'état en vigueur
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.secteurs_en_vigueur(p_commune text) RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', z.id, 'name', z.name, 'code', z.code, 'description', z.description,
           'color', z.color, 'collection_frequency', z.collection_frequency,
           'estimated_population', z.estimated_population,
           'geometry', ST_AsGeoJSON(z.geom)::jsonb) ORDER BY z.name), '[]'::jsonb)
    FROM zones_collecte z
   WHERE z.commune_id = p_commune AND z.deleted_at IS NULL
$$;

GRANT EXECUTE ON FUNCTION app.secteurs_en_vigueur(text) TO siipi_app;

/** Fige l'état présent en version 1 si la commune n'a encore aucune version. */
CREATE OR REPLACE FUNCTION app.figer_version_initiale(p_commune text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
  IF EXISTS (SELECT 1 FROM versions_decoupage WHERE commune_id = p_commune AND statut = 'validee') THEN
    RETURN;
  END IF;
  INSERT INTO versions_decoupage
    (commune_id, numero, statut, origine, directe, perimetre, perimetre_modifie, zones, note, soumise_par, soumise_le, decidee_le)
  SELECT c.id, 1, 'validee', 'initiale', true, c.boundary_geom, true, app.secteurs_en_vigueur(c.id),
         'État du découpage avant la première modification enregistrée par la plateforme.',
         NULL, COALESCE(c.boundary_maj_le, now()), now()
    FROM communes c WHERE c.id = p_commune;
END;
$$;

-- ---------------------------------------------------------------------------
-- La validation : appliquer une version, puis la numéroter
--
-- SECURITY DEFINER : un secteur retiré doit pouvoir être rétabli (la RLS de
-- zones_collecte ne laisse modifier que les secteurs vivants), et le
-- périmètre n'est modifiable que par la FNCT (déclencheur de la migration
-- 025, qui voit toujours l'identité de l'appelant). Le premier contrôle de la
-- fonction est donc celui du rôle.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.valider_version_decoupage(p_version uuid) RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v        versions_decoupage%ROWTYPE;
  z        jsonb;
  v_ids    uuid[];
  v_numero integer;
BEGIN
  IF NOT app.is_fnct() THEN
    RAISE EXCEPTION 'VALIDATION_RESERVEE_FNCT' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v FROM versions_decoupage WHERE id = p_version FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VERSION_INCONNUE';
  END IF;
  IF v.statut <> 'soumise' THEN
    RAISE EXCEPTION 'VERSION_DEJA_DECIDEE: %', v.statut;
  END IF;

  PERFORM app.figer_version_initiale(v.commune_id);

  -- 1. Le périmètre.
  IF v.perimetre_modifie THEN
    UPDATE communes
       SET boundary_geom = v.perimetre,
           boundary_source = CASE WHEN v.perimetre IS NULL THEN NULL ELSE 'corrige_fnct' END
     WHERE id = v.commune_id
       AND boundary_geom IS DISTINCT FROM v.perimetre;
  END IF;

  -- 2. Les secteurs : ceux de la version sont posés (créés, modifiés ou
  --    rétablis sous leur identifiant) ; les autres secteurs vivants sont
  --    retirés — logiquement, jamais effacés.
  IF v.zones_modifiees THEN
  v_ids := ARRAY(SELECT (e ->> 'id')::uuid FROM jsonb_array_elements(v.zones) e);

  FOR z IN SELECT * FROM jsonb_array_elements(v.zones) LOOP
    IF EXISTS (SELECT 1 FROM zones_collecte WHERE id = (z ->> 'id')::uuid AND commune_id <> v.commune_id) THEN
      RAISE EXCEPTION 'SECTEUR_AUTRE_COMMUNE: %', z ->> 'id' USING ERRCODE = 'insufficient_privilege';
    END IF;
    INSERT INTO zones_collecte
      (id, commune_id, name, code, description, color, collection_frequency, estimated_population, geom, created_by)
    VALUES ((z ->> 'id')::uuid, v.commune_id, z ->> 'name', z ->> 'code', z ->> 'description',
            COALESCE(z ->> 'color', '#2563eb'), z ->> 'collection_frequency',
            (z ->> 'estimated_population')::integer,
            ST_SetSRID(ST_Multi(ST_GeomFromGeoJSON(z ->> 'geometry')), 4326), v.soumise_par)
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name, code = EXCLUDED.code, description = EXCLUDED.description,
      color = EXCLUDED.color, collection_frequency = EXCLUDED.collection_frequency,
      estimated_population = EXCLUDED.estimated_population, geom = EXCLUDED.geom,
      deleted_at = NULL, deleted_by = NULL;
  END LOOP;

  UPDATE zones_collecte
     SET deleted_at = now(), deleted_by = app.current_user_id()
   WHERE commune_id = v.commune_id AND deleted_at IS NULL AND id <> ALL (v_ids);
  END IF;

  -- 3. La version enregistre ce qui a effectivement été obtenu.
  SELECT COALESCE(max(numero), 0) + 1 INTO v_numero FROM versions_decoupage WHERE commune_id = v.commune_id;
  UPDATE versions_decoupage
     SET statut = 'validee', numero = v_numero,
         decidee_par = app.current_user_id(), decidee_le = now(),
         perimetre = (SELECT boundary_geom FROM communes WHERE id = v.commune_id),
         zones = app.secteurs_en_vigueur(v.commune_id)
   WHERE id = v.id;

  RETURN v_numero;
END;
$$;

COMMENT ON FUNCTION app.valider_version_decoupage(uuid) IS
  'Applique une version de découpage soumise (périmètre et secteurs), puis la numérote. Réservée à la FNCT. Fige d''abord l''état présent en version 1 si la commune n''en a aucune.';

GRANT EXECUTE ON FUNCTION app.valider_version_decoupage(uuid) TO siipi_app;
REVOKE EXECUTE ON FUNCTION app.figer_version_initiale(text) FROM PUBLIC;

/**
 * Enregistre l'état présent comme une version validée, après une correction
 * directe de la FNCT (périmètre ou secteur) : l'historique ne doit rien
 * ignorer de ce qui a changé. Appelée APRÈS l'écriture ; la version initiale,
 * elle, doit avoir été figée AVANT (app.avant_correction_fnct).
 */
CREATE OR REPLACE FUNCTION app.apres_correction_fnct(p_commune text, p_note text) RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_numero integer;
BEGIN
  IF NOT app.is_fnct() THEN
    RAISE EXCEPTION 'VALIDATION_RESERVEE_FNCT' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT COALESCE(max(numero), 0) + 1 INTO v_numero FROM versions_decoupage WHERE commune_id = p_commune;
  INSERT INTO versions_decoupage
    (commune_id, numero, statut, origine, directe, perimetre, perimetre_modifie, zones, note,
     soumise_par, decidee_par, decidee_le)
  SELECT c.id, v_numero, 'validee', 'correction_fnct', true, c.boundary_geom, true, app.secteurs_en_vigueur(c.id),
         p_note, app.current_user_id(), app.current_user_id(), now()
    FROM communes c WHERE c.id = p_commune;
  RETURN v_numero;
END;
$$;

CREATE OR REPLACE FUNCTION app.avant_correction_fnct(p_commune text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
  IF NOT app.is_fnct() THEN
    RAISE EXCEPTION 'VALIDATION_RESERVEE_FNCT' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM app.figer_version_initiale(p_commune);
END;
$$;

GRANT EXECUTE ON FUNCTION app.apres_correction_fnct(text, text) TO siipi_app;
GRANT EXECUTE ON FUNCTION app.avant_correction_fnct(text) TO siipi_app;

-- ---------------------------------------------------------------------------
-- Qui a décidé. La commune doit pouvoir lire le nom de l'agent de la FNCT qui
-- a validé ou refusé sa proposition — une décision sans auteur ne s'assume
-- pas — alors que la RLS de users (migration 030) lui cache la fiche des
-- comptes nationaux. Cette fonction ne rend que le nom, et seulement pour une
-- personne qui a soumis ou décidé une version que l'appelant peut lire.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.auteur_version(p_version uuid, p_user uuid) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT u.full_name
    FROM users u
    JOIN versions_decoupage v ON v.id = p_version AND p_user IN (v.soumise_par, v.decidee_par)
   WHERE u.id = p_user
     AND app.can_write_commune(v.commune_id)
$$;

GRANT EXECUTE ON FUNCTION app.auteur_version(uuid, uuid) TO siipi_app;
