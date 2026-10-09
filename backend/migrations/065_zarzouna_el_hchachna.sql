-- =============================================================================
-- 065 — D-FNCT-3 : Zarzouna rattachée à Bizerte, El Hchachna commune à part
-- entière (décision de la FNCT du 9 octobre 2026).
--
-- LE CALQUE ÉTAIT JUSTE, LE RÉFÉRENTIEL NON. La couche officielle des limites
-- (seed/data/decoupage_communal.geojson.gz, 350 entités) porte El Hchachna
-- (code 1727, gouvernorat de Bizerte, « Nouvelle ») et ne porte pas Zarzouna.
-- La table des communes, elle, avait Zarzouna — sans contour, et sans aucune
-- donnée — et n'avait pas El Hchachna. C'est elle qu'on corrige.
--
-- RIEN NE S'EFFACE (règle d'or 1.4). Une commune rattachée à une autre n'est
-- pas supprimée : elle est retirée (deleted_at), avec la commune qui la reçoit
-- et le motif. Ses données, s'il y en a, passent à la commune qui la reçoit ;
-- son historique (journal d'audit) reste à son nom.
--
-- Une commune retirée disparaît de TOUTE l'API d'un coup : la politique de
-- lecture de `communes` (RLS forcée) ne la montre plus. Les trois fonctions
-- SECURITY DEFINER qui listent ou comptent des communes — statut_communes (dont
-- dépend tableau_gouvernorats), frontieres_communes — et enregistrer_adresse,
-- qui ne doit plus accepter une commune retirée, sont reprises ici : elles
-- s'exécutent avec les droits de leur propriétaire et ne voient pas la politique.
-- =============================================================================

-- 1. Le retrait d'une commune ----------------------------------------------------

ALTER TABLE communes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE communes ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE communes ADD COLUMN IF NOT EXISTS fusionnee_dans TEXT REFERENCES communes(id);
ALTER TABLE communes ADD COLUMN IF NOT EXISTS motif_retrait TEXT;

ALTER TABLE communes DROP CONSTRAINT IF EXISTS communes_retrait_motive;
ALTER TABLE communes ADD CONSTRAINT communes_retrait_motive
  CHECK (deleted_at IS NULL OR length(btrim(COALESCE(motif_retrait, ''))) >= 5);
ALTER TABLE communes DROP CONSTRAINT IF EXISTS communes_fusion_retiree;
ALTER TABLE communes ADD CONSTRAINT communes_fusion_retiree
  CHECK (fusionnee_dans IS NULL OR deleted_at IS NOT NULL);
ALTER TABLE communes DROP CONSTRAINT IF EXISTS communes_fusion_pas_soi;
ALTER TABLE communes ADD CONSTRAINT communes_fusion_pas_soi
  CHECK (fusionnee_dans IS NULL OR fusionnee_dans <> id);

COMMENT ON COLUMN communes.deleted_at IS
  'Retrait d''une commune du référentiel (fusion, erreur de liste). La ligne reste : son historique et ses références y renvoient. Une commune retirée n''apparaît plus dans l''API (politique communes_select).';
COMMENT ON COLUMN communes.fusionnee_dans IS
  'La commune qui reçoit une commune retirée par rattachement — Zarzouna → Bizerte (Nord & Centre), D-FNCT-3.';
COMMENT ON COLUMN communes.motif_retrait IS
  'Le motif et la source du retrait (texte, décision, arrêté). Exigé en base dès qu''une commune est retirée.';

-- Ce que voit l'API : les communes du référentiel, pas celles qui en sont sorties.
DROP POLICY IF EXISTS communes_select ON communes;
CREATE POLICY communes_select ON communes FOR SELECT
  USING (app.is_authenticated() AND deleted_at IS NULL);
DROP POLICY IF EXISTS communes_update ON communes;
CREATE POLICY communes_update ON communes FOR UPDATE
  USING (deleted_at IS NULL AND app.can_write_commune(id))
  WITH CHECK (app.can_write_commune(id));

-- 2. Les fonctions qui s'exécutent hors de la politique ------------------------

-- Corps repris de la migration 055, à une condition près : la commune retirée.
CREATE OR REPLACE FUNCTION app.statut_communes()
 RETURNS TABLE(commune_id text, statut text, derniere_activite timestamp with time zone, ecritures_30j bigint, a_des_pesees boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
   -- Une commune retirée du référentiel (065) non plus.
   WHERE NOT c.est_demo AND c.deleted_at IS NULL;
$function$;

-- Corps repris de la migration 025, à une condition près.
CREATE OR REPLACE FUNCTION app.frontieres_communes(p_communes text[] DEFAULT NULL::text[], p_tolerance double precision DEFAULT 0.001)
 RETURNS TABLE(id text, name text, name_ar text, gouvernorat text, code_municipalite integer, population integer, area_km2 double precision, is_pilot boolean, boundary_source text, frontiere json)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT c.id, c.name, c.name_ar, c.gouvernorat, c.code_municipalite,
         c.population, c.area_km2::double precision, c.is_pilot, c.boundary_source,
         ST_AsGeoJSON(
           CASE WHEN p_tolerance > 0
                THEN ST_SimplifyPreserveTopology(c.boundary_geom, p_tolerance)
                ELSE c.boundary_geom END
         )::json
    FROM communes c
   WHERE c.boundary_geom IS NOT NULL
     AND c.deleted_at IS NULL
     AND (p_communes IS NULL OR c.id = ANY (p_communes))
     -- L'annuaire des communes est lisible par tout utilisateur authentifié
     -- (migration 013) : les limites administratives le sont donc aussi.
     -- Elles ne disent rien de l'activité d'une commune.
     AND app.is_authenticated()
   ORDER BY c.gouvernorat, c.name
$function$;

-- Corps repris de la migration 021, à une condition près : un citoyen ne
-- déclare pas son adresse dans une commune qui n'existe plus.
CREATE OR REPLACE FUNCTION app.enregistrer_adresse(p_commune text, p_adresse text, p_lat double precision, p_lng double precision)
 RETURNS TABLE(citizen_id uuid, commune_id text, adresse text, zone_id uuid, lat double precision, lng double precision)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_citizen uuid;
  v_zone    uuid;
BEGIN
  v_citizen := app.my_citizen_id();
  IF v_citizen IS NULL THEN
    RAISE EXCEPTION 'PROFIL_CITOYEN_INTROUVABLE' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM communes c WHERE c.id = p_commune AND c.deleted_at IS NULL) THEN
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
$function$;

-- 3. Rattacher une commune à une autre ------------------------------------------
--
-- Les points de collecte, circuits et pesées passent à la commune qui reçoit
-- (D-FNCT-3). Toute AUTRE donnée encore rattachée à la commune retirée — un
-- engin, un agent, un citoyen, une réclamation… — fait refuser le rattachement,
-- avec la liste : la décider est l'affaire d'une personne, pas d'un script
-- (règle d'or 1.5). Le journal d'audit reste au nom de la commune retirée : il
-- dit ce qui s'est passé, et où.
--
-- Réservée à l'exploitant (migration, psql) : aucun droit pour l'application.
CREATE OR REPLACE FUNCTION app.rattacher_commune(p_source text, p_cible text, p_motif text)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_table   record;
  v_n       bigint;
  v_restes  text := '';
  v_deplace jsonb := '{}'::jsonb;
  v_auteur  uuid;
BEGIN
  IF p_source = p_cible THEN
    RAISE EXCEPTION 'RATTACHEMENT_SOI: une commune ne se rattache pas à elle-même.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM communes WHERE id = p_source AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'RATTACHEMENT_SOURCE: commune « % » inconnue ou déjà retirée.', p_source;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM communes WHERE id = p_cible AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'RATTACHEMENT_CIBLE: commune « % » inconnue ou retirée.', p_cible;
  END IF;
  IF length(btrim(COALESCE(p_motif, ''))) < 5 THEN
    RAISE EXCEPTION 'RATTACHEMENT_MOTIF: le motif et la source du rattachement sont exigés.';
  END IF;

  -- Ce qui ne passe pas d'office : tout le reste, compté table par table.
  FOR v_table IN
    SELECT c.table_name
      FROM information_schema.columns c
      JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
     WHERE c.table_schema = 'public' AND c.column_name = 'commune_id' AND t.table_type = 'BASE TABLE'
       AND c.table_name NOT IN ('points_collecte', 'circuits', 'pesees', 'audit_log', 'access_log', 'communes')
     ORDER BY c.table_name
  LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE commune_id = $1', v_table.table_name) INTO v_n USING p_source;
    IF v_n > 0 THEN
      v_restes := v_restes || format('%s : %s ; ', v_table.table_name, v_n);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM users WHERE commune_id = p_source) THEN
    v_restes := v_restes || format('users : %s ; ', (SELECT count(*) FROM users WHERE commune_id = p_source));
  END IF;
  IF v_restes <> '' THEN
    RAISE EXCEPTION 'RATTACHEMENT_DONNEES: la commune « % » porte encore des données à décider une à une — %', p_source, v_restes;
  END IF;

  -- Dans l'ordre que les contrôles exigent : le circuit d'abord, puis ses
  -- points, puis les pesées qui le nomment.
  UPDATE circuits SET commune_id = p_cible WHERE commune_id = p_source;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_deplace := v_deplace || jsonb_build_object('circuits', v_n);
  UPDATE points_collecte SET commune_id = p_cible WHERE commune_id = p_source;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_deplace := v_deplace || jsonb_build_object('points_collecte', v_n);
  UPDATE pesees SET commune_id = p_cible WHERE commune_id = p_source;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_deplace := v_deplace || jsonb_build_object('pesees', v_n);

  -- L'identité technique des scripts (00000000-…) n'est pas un compte : on
  -- n'écrit un auteur que s'il en est un (piège déjà rencontré au lot 17.3).
  SELECT id INTO v_auteur FROM users WHERE id = app.current_user_id();
  UPDATE communes
     SET deleted_at = now(), deleted_by = v_auteur, fusionnee_dans = p_cible,
         motif_retrait = p_motif, activee = false, updated_at = now()
   WHERE id = p_source;

  RETURN v_deplace;
END;
$$;
REVOKE ALL ON FUNCTION app.rattacher_commune(text, text, text) FROM PUBLIC;
COMMENT ON FUNCTION app.rattacher_commune(text, text, text) IS
  'Rattache une commune à une autre (D-FNCT-3) : circuits, points de collecte et pesées passent à la commune qui reçoit ; toute autre donnée fait refuser, avec la liste ; la commune rattachée est retirée, jamais effacée. Réservée à l''exploitant.';

-- 4. Le registre des corrections du référentiel ---------------------------------
--
-- Ce que l'observatoire affiche (Paramètres nationaux) : quelle correction,
-- quelle décision, quelle source. Une table et non un texte d'écran : la
-- prochaine correction s'y ajoute sans toucher au code.
CREATE TABLE IF NOT EXISTS corrections_referentiel (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    decision      TEXT NOT NULL,
    nature        TEXT NOT NULL,
    commune_id    TEXT NOT NULL REFERENCES communes(id),
    commune_cible TEXT REFERENCES communes(id),
    source        TEXT NOT NULL,
    decidee_le    DATE NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT corrections_nature_valide CHECK (nature IN ('rattachee', 'creee')),
    CONSTRAINT corrections_cible_rattachement CHECK ((nature = 'rattachee') = (commune_cible IS NOT NULL)),
    CONSTRAINT corrections_source_citee CHECK (length(btrim(source)) >= 5),
    CONSTRAINT corrections_une_fois UNIQUE (decision, commune_id)
);
COMMENT ON TABLE corrections_referentiel IS
  'Les corrections apportées au référentiel des communes par décision de la FNCT (rattachement, création), avec leur source. Montrées dans l''observatoire, Paramètres nationaux. Écrites par migration seulement.';
ALTER TABLE corrections_referentiel ENABLE ROW LEVEL SECURITY;
ALTER TABLE corrections_referentiel FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS corrections_referentiel_select ON corrections_referentiel;
CREATE POLICY corrections_referentiel_select ON corrections_referentiel FOR SELECT USING (app.is_authenticated());
GRANT SELECT ON corrections_referentiel TO siipi_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON corrections_referentiel FROM siipi_app;

-- Les noms des communes d'une correction, y compris celle qui a été retirée,
-- que la politique de `communes` ne montre plus.
CREATE OR REPLACE FUNCTION app.corrections_referentiel()
  RETURNS TABLE (decision text, nature text, commune text, commune_ar text, gouvernorat text,
                 cible text, cible_ar text, source text, decidee_le date)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT r.decision, r.nature, c.name, c.name_ar, c.gouvernorat, k.name, k.name_ar, r.source, r.decidee_le
    FROM corrections_referentiel r
    JOIN communes c ON c.id = r.commune_id
    LEFT JOIN communes k ON k.id = r.commune_cible
   WHERE app.is_authenticated()
   -- Le rattachement avant la création : c'est l'ordre de la décision.
   ORDER BY r.decidee_le DESC, r.nature DESC, c.name
$$;
GRANT EXECUTE ON FUNCTION app.corrections_referentiel() TO siipi_app;

-- 5. La décision D-FNCT-3 ------------------------------------------------------

-- El Hchachna, d'après la couche officielle (code 1727, « Nouvelle »,
-- 18 797 habitants, 4 secteurs). Le point et la superficie sont calculés sur son
-- contour officiel (ST_PointOnSurface, ST_Area) ; le contour lui-même est posé
-- par `npm run import:decoupage`, qui la connaît désormais
-- (seed/data/appariement_communes.json). Sur une base neuve, le seed la crée
-- aussi : ON CONFLICT, rien ne double.
INSERT INTO communes (id, name, name_ar, gouvernorat, code_gouvernorat, code_municipalite, population,
                      nb_secteurs, type_commune, lat, lng, area_km2, notes)
VALUES ('bizerte_el_hchachna', 'El Hchachna', 'الحشاشنة', 'Bizerte', 17, 1727, 18797,
        4, 'Nouvelle', 37.1465, 9.3315, 364.36,
        'Commune à part entière (décision FNCT D-FNCT-3, 9 octobre 2026). Source : Instance Prospective, arrêté conjoint en attente.')
ON CONFLICT (id) DO NOTHING;

-- Zarzouna : rattachée à Bizerte, là où elle existe encore comme commune.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM communes WHERE id = 'bizerte_zarzouna' AND deleted_at IS NULL)
     AND EXISTS (SELECT 1 FROM communes WHERE id = 'bizerte_bizerte_nord_centre' AND deleted_at IS NULL) THEN
    PERFORM app.rattacher_commune('bizerte_zarzouna', 'bizerte_bizerte_nord_centre',
      'Rattachée à la commune de Bizerte (décision FNCT D-FNCT-3, 9 octobre 2026). Source : Instance Prospective, arrêté conjoint en attente.');
  END IF;
END $$;

-- Le registre, quand les communes en sont là (sur une base neuve, Zarzouna
-- n'existe pas encore à cette étape : le seed l'écrit, déjà rattachée).
INSERT INTO corrections_referentiel (decision, nature, commune_id, commune_cible, source, decidee_le)
SELECT 'D-FNCT-3', 'creee', 'bizerte_el_hchachna', NULL, 'Instance Prospective, arrêté conjoint en attente', DATE '2026-10-09'
 WHERE EXISTS (SELECT 1 FROM communes WHERE id = 'bizerte_el_hchachna')
ON CONFLICT (decision, commune_id) DO NOTHING;
INSERT INTO corrections_referentiel (decision, nature, commune_id, commune_cible, source, decidee_le)
SELECT 'D-FNCT-3', 'rattachee', 'bizerte_zarzouna', 'bizerte_bizerte_nord_centre', 'Instance Prospective, arrêté conjoint en attente', DATE '2026-10-09'
 WHERE EXISTS (SELECT 1 FROM communes WHERE id = 'bizerte_zarzouna')
   AND EXISTS (SELECT 1 FROM communes WHERE id = 'bizerte_bizerte_nord_centre')
ON CONFLICT (decision, commune_id) DO NOTHING;
