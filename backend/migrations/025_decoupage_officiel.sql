-- 025_decoupage_officiel.sql
--
-- Le découpage communal officiel des 350 communes.
--
-- Jusqu'ici la plateforme ne connaissait de chaque commune qu'un POINT
-- (lat/lng) et une frontière optionnelle issue d'OpenStreetMap, restée vide
-- faute d'appariement fiable. Un système national de gestion des déchets qui
-- ne sait pas où s'arrête une commune ne peut ni afficher un territoire, ni
-- vérifier qu'un signalement tombe bien chez elle, ni additionner des
-- surfaces. C'est un socle, pas une décoration.
--
-- Cette migration pose trois choses :
--   1. les identifiants OFFICIELS (code municipalité, code gouvernorat)
--   2. la traçabilité des frontières : d'où elles viennent, qui les a
--      modifiées, quand
--   3. la règle qui réserve leur modification à la FNCT
--
-- =========================================================================
-- 1. Identifiants officiels
--
-- La plateforme s'est construite sur des identifiants lisibles
-- (« medenine_djerba_houmt_souk ») : commodes pour lire une URL, inutiles
-- pour échanger avec l'INS, l'ANGeD ou le ministère, qui ne connaissent que
-- le code municipalité. Les deux coexistent désormais — l'identifiant interne
-- reste la clé, le code officiel devient la clé d'échange.
-- =========================================================================

ALTER TABLE communes
    ADD COLUMN IF NOT EXISTS code_municipalite INTEGER,
    ADD COLUMN IF NOT EXISTS code_gouvernorat  INTEGER,
    ADD COLUMN IF NOT EXISTS nb_secteurs       INTEGER,
    -- « Nouvelle » désigne les communes créées lors de l'extension du
    -- découpage communal à tout le territoire (2016). Elles n'ont souvent ni
    -- service de propreté constitué ni parc roulant : les confondre avec les
    -- communes historiques fausserait toute comparaison de performance.
    ADD COLUMN IF NOT EXISTS type_commune      TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_communes_code_municipalite
    ON communes (code_municipalite) WHERE code_municipalite IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_communes_code_gouvernorat ON communes (code_gouvernorat);

COMMENT ON COLUMN communes.code_municipalite IS
  'Code officiel de la municipalité. Clé d''échange avec l''INS, l''ANGeD et le ministère ; l''identifiant textuel reste la clé interne.';
COMMENT ON COLUMN communes.type_commune IS
  'Nouvelle (créée en 2016) | Ancienne. Une commune nouvelle sans service constitué ne se compare pas à une commune historique.';

-- =========================================================================
-- 2. Provenance et traçabilité de la frontière
--
-- Une frontière communale n'est pas une donnée neutre : elle décide de ce qui
-- relève de quelle commune. Savoir d'où vient le tracé affiché, et qui l'a
-- modifié, fait partie de la donnée elle-même.
-- =========================================================================

ALTER TABLE communes
    ADD COLUMN IF NOT EXISTS boundary_source TEXT
        CHECK (boundary_source IN ('officiel', 'osm', 'corrige_fnct')),
    ADD COLUMN IF NOT EXISTS boundary_maj_le  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS boundary_maj_par UUID REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN communes.boundary_source IS
  'officiel : couche nationale importée. corrige_fnct : tracé rectifié à la main depuis l''annuaire. osm : ancien import OpenStreetMap.';

-- =========================================================================
-- 3. Qui peut déplacer une frontière
--
-- La FNCT, et elle seule. Une commune qui pourrait redessiner sa propre
-- limite pourrait s'attribuer un quartier voisin — et avec lui ses
-- signalements, ses tonnages et ses indicateurs.
--
-- La règle est posée par un DÉCLENCHEUR et non par l'API : les politiques RLS
-- de PostgreSQL s'appliquent à la ligne entière, pas colonne par colonne, et
-- la commune doit continuer à modifier sa fiche (téléphone, e-mail, mode de
-- gestion). Le déclencheur est le seul endroit où « cette colonne-ci, non »
-- peut s'exprimer et ne pas se contourner en écrivant une autre requête.
-- =========================================================================

CREATE OR REPLACE FUNCTION app.proteger_frontiere() RETURNS trigger
  LANGUAGE plpgsql AS
$fn$
BEGIN
  -- ST_OrderingEquals est trop strict (il distingue deux tracés identiques
  -- écrits dans un ordre différent) ; IS DISTINCT FROM sur la représentation
  -- binaire suffit à détecter une vraie tentative d'écriture.
  IF NEW.boundary_geom IS DISTINCT FROM OLD.boundary_geom AND NOT app.is_fnct() THEN
    RAISE EXCEPTION 'FRONTIERE_RESERVEE_FNCT'
      USING ERRCODE = 'insufficient_privilege',
            HINT = 'La modification des limites communales est réservée à la FNCT.';
  END IF;

  IF NEW.boundary_geom IS DISTINCT FROM OLD.boundary_geom THEN
    IF NEW.boundary_geom IS NULL THEN
      -- Plus de tracé, donc plus de provenance, plus de superficie et plus
      -- d'auteur : laisser ces colonnes garnies décrirait une limite qui
      -- n'existe plus.
      NEW.boundary_source  := NULL;
      NEW.boundary_maj_le  := NULL;
      NEW.boundary_maj_par := NULL;
      NEW.area_km2         := NULL;
    ELSE
      NEW.boundary_maj_le := now();
      -- L'identité technique des scripts (00000000-…) ne correspond à aucun
      -- compte : la renseigner ici violerait la clé étrangère et ferait
      -- échouer l'import national. Un import n'a pas d'auteur humain — c'est
      -- boundary_source qui porte sa provenance.
      NEW.boundary_maj_par := NULLIF(app.current_user_id(),
                                     '00000000-0000-0000-0000-000000000000'::uuid);

      -- Provenance : on fait confiance à ce que l'appelant DÉCLARE, et l'on ne
      -- suppose une correction manuelle que s'il n'a rien dit.
      --
      -- La première version comparait la nouvelle valeur à l'ancienne et
      -- forçait « corrigé FNCT » quand elles étaient identiques. Conséquence :
      -- relancer l'import national — un geste parfaitement normal après une
      -- mise à jour de la couche — réétiquetait les 349 limites officielles en
      -- « rectifiées à la main ». La provenance aurait menti sur l'ensemble du
      -- référentiel, et plus personne n'aurait su distinguer les vraies
      -- corrections.
      NEW.boundary_source := COALESCE(NEW.boundary_source, 'corrige_fnct');

      -- La superficie se recalcule depuis le tracé, jamais saisie à la main :
      -- une surface et une frontière qui se contredisent sont pires que pas de
      -- surface du tout.
      NEW.area_km2 := ROUND((ST_Area(NEW.boundary_geom::geography) / 1000000)::numeric, 2);
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_proteger_frontiere ON communes;
CREATE TRIGGER trg_proteger_frontiere
  BEFORE UPDATE ON communes
  FOR EACH ROW EXECUTE FUNCTION app.proteger_frontiere();

COMMENT ON FUNCTION app.proteger_frontiere() IS
  'Réserve la modification des limites communales à la FNCT, et maintient superficie et traçabilité en accord avec le tracé.';

-- =========================================================================
-- 4. Lecture des frontières
--
-- Le tracé officiel pèse plusieurs centaines de kilo-octets par commune. Les
-- envoyer tous, en pleine résolution, pour dessiner une carte nationale
-- reviendrait à transférer une vingtaine de méga-octets pour un écran de
-- 1 200 pixels de large — sur une connexion tunisienne moyenne, une minute
-- d'attente pour un résultat visuellement identique.
--
-- La fonction simplifie donc selon une tolérance demandée par l'appelant, en
-- degrés. ST_SimplifyPreserveTopology garantit qu'aucun polygone ne se
-- retourne ni ne se troue au passage.
-- =========================================================================

CREATE OR REPLACE FUNCTION app.frontieres_communes(
    p_communes text[] DEFAULT NULL,
    p_tolerance double precision DEFAULT 0.001
  )
  RETURNS TABLE (
    id text,
    name text,
    name_ar text,
    gouvernorat text,
    code_municipalite integer,
    population integer,
    area_km2 double precision,
    is_pilot boolean,
    boundary_source text,
    frontiere json
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT c.id, c.name, c.name_ar, c.gouvernorat, c.code_municipalite,
         c.population, c.area_km2::double precision, c.is_pilot, c.boundary_source,
         ST_AsGeoJSON(
           CASE WHEN p_tolerance > 0
                THEN ST_SimplifyPreserveTopology(c.boundary_geom, p_tolerance)
                ELSE c.boundary_geom END
         )::json
    FROM communes c
   WHERE c.boundary_geom IS NOT NULL
     AND (p_communes IS NULL OR c.id = ANY (p_communes))
     -- L'annuaire des communes est lisible par tout utilisateur authentifié
     -- (migration 013) : les limites administratives le sont donc aussi.
     -- Elles ne disent rien de l'activité d'une commune.
     AND app.is_authenticated()
   ORDER BY c.gouvernorat, c.name
$$;

GRANT EXECUTE ON FUNCTION app.frontieres_communes(text[], double precision) TO siipi_app;
