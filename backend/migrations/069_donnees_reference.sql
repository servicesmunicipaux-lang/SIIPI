-- ===========================================================================
-- Migration 069 — Refonte, lot 2a : trois données de référence
-- (docs/specs_metier/SPEC_refonte_indicateurs_saisie.md § 2.3 ; décisions D5
-- et D6 du 9 octobre 2026)
--
--   a) le PORTEUR d'un projet (D5) : commune, association ou autre. Un projet
--      associatif n'est qu'un projet dont le porteur est une association ;
--   b) le PCGD devient une donnée, plus seulement un fichier déposé ;
--   c) la CARACTÉRISATION des déchets (D6), personnalisable par la commune,
--      avec la moyenne nationale de l'ANGeD comme valeur de repli.
--
-- LA COMPOSITION RETENUE N'EST JAMAIS INVENTÉE. Tant que la FNCT n'a pas saisi
-- la moyenne nationale, une commune sans étude n'a pas de composition : elle
-- est « non renseignée » (règle d'or 1.1), pas remplie d'une répartition
-- supposée.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- a) Le porteur d'un projet
-- ---------------------------------------------------------------------------

ALTER TABLE publications ADD COLUMN IF NOT EXISTS projet_porteur TEXT;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS projet_porteur_nom TEXT;

-- La nature « communal | associatif » d'origine devient le porteur, puis
-- disparaît : deux colonnes qui disent la même chose finiraient par se
-- contredire.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'publications' AND column_name = 'projet_nature') THEN
    UPDATE publications
       SET projet_porteur = CASE projet_nature WHEN 'communal' THEN 'commune'
                                               WHEN 'associatif' THEN 'association' END
     WHERE type = 'projet' AND projet_porteur IS NULL AND projet_nature IS NOT NULL;
    -- Un projet associatif d'origine n'avait pas de nom de porteur : on le dit
    -- plutôt que d'en inventer un.
    UPDATE publications SET projet_porteur_nom = 'Association (nom à préciser)'
     WHERE type = 'projet' AND projet_porteur = 'association' AND projet_porteur_nom IS NULL;
  END IF;
END $$;

ALTER TABLE publications DROP CONSTRAINT IF EXISTS publications_projet_nature_valide;
ALTER TABLE publications DROP CONSTRAINT IF EXISTS publications_champs_projet;
ALTER TABLE publications DROP COLUMN IF EXISTS projet_nature;

ALTER TABLE publications DROP CONSTRAINT IF EXISTS publications_projet_porteur_valide;
ALTER TABLE publications ADD CONSTRAINT publications_projet_porteur_valide CHECK (
  projet_porteur IS NULL OR projet_porteur IN ('commune', 'association', 'autre'));
-- Un porteur autre que la commune se nomme : « une association » ne dit pas
-- laquelle.
ALTER TABLE publications DROP CONSTRAINT IF EXISTS publications_porteur_nomme;
ALTER TABLE publications ADD CONSTRAINT publications_porteur_nomme CHECK (
  projet_porteur IS NULL OR projet_porteur = 'commune' OR length(btrim(coalesce(projet_porteur_nom, ''))) > 0);
ALTER TABLE publications ADD CONSTRAINT publications_champs_projet CHECK (
  type = 'projet' OR (projet_porteur IS NULL AND projet_porteur_nom IS NULL AND projet_etat IS NULL));

COMMENT ON COLUMN publications.projet_porteur IS
  'Qui porte le projet (D5) : commune, association ou autre. Un projet associatif est un projet dont le porteur est une association.';
COMMENT ON COLUMN publications.projet_porteur_nom IS
  'Le nom du porteur, obligatoire quand ce n''est pas la commune.';

-- ---------------------------------------------------------------------------
-- b) Le PCGD
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pcgd (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id      TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    statut          TEXT NOT NULL,
    annee_adoption  SMALLINT,
    horizon         SMALLINT,
    bureau_etudes   TEXT,
    -- Le document lui-même, déposé dans « Rapports et études ».
    rapport_id      UUID REFERENCES rapports_etudes(id) ON DELETE SET NULL,
    observation     TEXT,
    saisi_par       UUID REFERENCES users(id) ON DELETE SET NULL,
    saisi_le        TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT pcgd_statut_valide CHECK (statut IN ('en_preparation', 'adopte', 'en_revision')),
    -- Un PCGD adopté l'a été une année : sans elle, « adopté » n'affirme rien.
    CONSTRAINT pcgd_adopte_date CHECK (statut <> 'adopte' OR annee_adoption IS NOT NULL),
    CONSTRAINT pcgd_annees CHECK (annee_adoption IS NULL OR annee_adoption BETWEEN 2000 AND 2100),
    CONSTRAINT pcgd_horizon CHECK (horizon IS NULL OR (horizon BETWEEN 2000 AND 2100
                                    AND (annee_adoption IS NULL OR horizon >= annee_adoption)))
);

CREATE INDEX IF NOT EXISTS idx_pcgd_commune ON pcgd (commune_id) WHERE deleted_at IS NULL;

COMMENT ON TABLE pcgd IS
  'Le plan communal de gestion des déchets comme donnée (refonte, lot 2a) : statut, année d''adoption, horizon, bureau d''études, et le document déposé dans « Rapports et études ».';
COMMENT ON COLUMN pcgd.horizon IS 'Année d''horizon du plan (par exemple 2030), jamais antérieure à son adoption.';

-- ---------------------------------------------------------------------------
-- c) La caractérisation des déchets
-- ---------------------------------------------------------------------------

-- La nomenclature des fractions : provisoire (§ 2.3), à aligner sur celle des
-- études ANGeD que la FNCT fournira. Une table, pour que l'alignement soit une
-- mise à jour de données et non une migration.
CREATE TABLE IF NOT EXISTS fractions_reference (
    code        TEXT PRIMARY KEY,
    libelle_fr  TEXT NOT NULL,
    libelle_ar  TEXT NOT NULL,
    ordre       SMALLINT NOT NULL DEFAULT 0,
    CONSTRAINT fractions_code CHECK (code ~ '^[a-z_]{2,40}$')
);

INSERT INTO fractions_reference (code, libelle_fr, libelle_ar, ordre) VALUES
  ('organiques', 'Organiques', 'المواد العضوية', 1),
  ('papier_carton', 'Papier et carton', 'الورق والورق المقوى', 2),
  ('plastiques', 'Plastiques', 'البلاستيك', 3),
  ('verre', 'Verre', 'البلور', 4),
  ('metaux', 'Métaux', 'المعادن', 5),
  ('textiles', 'Textiles', 'النسيج', 6),
  ('fines_autres', 'Fines et autres', 'المواد الدقيقة وغيرها', 7)
ON CONFLICT (code) DO NOTHING;

COMMENT ON TABLE fractions_reference IS
  'Nomenclature des fractions de la caractérisation. Provisoire (SPEC_refonte § 2.3) : à aligner sur celle des études ANGeD, fournie par la FNCT.';

CREATE TABLE IF NOT EXISTS caracterisations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- NULL : la moyenne nationale de l'ANGeD.
    commune_id      TEXT REFERENCES communes(id) ON DELETE CASCADE,
    niveau_source   TEXT NOT NULL,
    annee           SMALLINT NOT NULL,
    methode         TEXT,
    saison          TEXT,
    rapport_id      UUID REFERENCES rapports_etudes(id) ON DELETE SET NULL,
    pcgd_id         UUID REFERENCES pcgd(id) ON DELETE SET NULL,
    saisi_par       UUID REFERENCES users(id) ON DELETE SET NULL,
    saisi_le        TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT caracterisations_niveau CHECK (niveau_source IN
      ('moyenne_nationale_anged', 'etude_anged_commune', 'pcgd', 'autre_etude')),
    -- La moyenne nationale n'appartient à aucune commune ; une étude communale
    -- appartient toujours à une.
    CONSTRAINT caracterisations_national CHECK ((niveau_source = 'moyenne_nationale_anged') = (commune_id IS NULL)),
    CONSTRAINT caracterisations_annee CHECK (annee BETWEEN 1990 AND 2100),
    CONSTRAINT caracterisations_saison CHECK (saison IS NULL OR saison IN ('annuelle', 'ete', 'hiver', 'autre'))
);

CREATE TABLE IF NOT EXISTS fractions_caracterisation (
    caracterisation_id  UUID NOT NULL REFERENCES caracterisations(id) ON DELETE CASCADE,
    fraction            TEXT NOT NULL REFERENCES fractions_reference(code),
    pourcentage         NUMERIC(5, 2) NOT NULL,
    PRIMARY KEY (caracterisation_id, fraction),
    CONSTRAINT fractions_pourcentage CHECK (pourcentage >= 0 AND pourcentage <= 100)
);

CREATE INDEX IF NOT EXISTS idx_caracterisations_commune ON caracterisations (commune_id, annee) WHERE deleted_at IS NULL;

COMMENT ON TABLE caracterisations IS
  'Composition des déchets (D6) : une étude ANGeD de la commune, son PCGD, une autre étude, ou la moyenne nationale de l''ANGeD (commune_id NULL, saisie par la FNCT seule). Les fractions totalisent 100 % à ±1 près, contrôlé par la base.';
COMMENT ON COLUMN caracterisations.niveau_source IS
  'moyenne_nationale_anged (FNCT) · etude_anged_commune · pcgd · autre_etude. app.caracterisation_retenue() préfère, dans cet ordre : étude ANGeD de la commune, PCGD, autre étude, moyenne nationale.';

-- La somme des fractions, contrôlée à la fin de la transaction : une
-- caractérisation s'écrit en plusieurs lignes, et c'est l'ensemble qui doit
-- faire 100 % — pas chaque étape.
CREATE OR REPLACE FUNCTION app.controler_somme_caracterisation() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$fn$
DECLARE
  v_id uuid;
  v_somme numeric;
  v_n integer;
BEGIN
  -- Un IF, pas un CASE : PL/pgSQL résout chaque champ de NEW à la préparation,
  -- et « NEW.caracterisation_id » n'existe pas quand la ligne est une caractérisation.
  IF TG_TABLE_NAME = 'caracterisations' THEN
    v_id := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    v_id := OLD.caracterisation_id;
  ELSE
    v_id := NEW.caracterisation_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM caracterisations WHERE id = v_id AND deleted_at IS NULL) THEN
    RETURN NULL;
  END IF;
  SELECT coalesce(sum(pourcentage), 0), count(*) INTO v_somme, v_n
    FROM fractions_caracterisation WHERE caracterisation_id = v_id;
  IF v_n = 0 OR v_somme < 99 OR v_somme > 101 THEN
    RAISE EXCEPTION 'CARACTERISATION_SOMME: les fractions totalisent % %% ; elles doivent faire 100 %% (à 1 près).', v_somme;
  END IF;
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_somme_caracterisation ON caracterisations;
CREATE CONSTRAINT TRIGGER trg_somme_caracterisation AFTER INSERT OR UPDATE ON caracterisations
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.controler_somme_caracterisation();
DROP TRIGGER IF EXISTS trg_somme_fractions ON fractions_caracterisation;
CREATE CONSTRAINT TRIGGER trg_somme_fractions AFTER INSERT OR UPDATE OR DELETE ON fractions_caracterisation
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.controler_somme_caracterisation();

-- ---------------------------------------------------------------------------
-- Cloisonnement
-- ---------------------------------------------------------------------------

ALTER TABLE pcgd ENABLE ROW LEVEL SECURITY;
ALTER TABLE pcgd FORCE  ROW LEVEL SECURITY;
ALTER TABLE caracterisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE caracterisations FORCE  ROW LEVEL SECURITY;
ALTER TABLE fractions_caracterisation ENABLE ROW LEVEL SECURITY;
ALTER TABLE fractions_caracterisation FORCE  ROW LEVEL SECURITY;
ALTER TABLE fractions_reference ENABLE ROW LEVEL SECURITY;
ALTER TABLE fractions_reference FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fractions_reference_select ON fractions_reference;
CREATE POLICY fractions_reference_select ON fractions_reference FOR SELECT USING (app.is_authenticated());
DROP POLICY IF EXISTS fractions_reference_fnct ON fractions_reference;
CREATE POLICY fractions_reference_fnct ON fractions_reference FOR ALL USING (app.is_fnct()) WITH CHECK (app.is_fnct());

-- La commune tient son PCGD et ses études ; la FNCT les lit (la commune
-- décide, CLAUDE.md § 6), et ne saisit que la moyenne nationale.
DROP POLICY IF EXISTS pcgd_select ON pcgd;
CREATE POLICY pcgd_select ON pcgd FOR SELECT USING (deleted_at IS NULL AND app.can_read_commune(commune_id));
DROP POLICY IF EXISTS pcgd_insert ON pcgd;
CREATE POLICY pcgd_insert ON pcgd FOR INSERT WITH CHECK (app.can_write_commune(commune_id) AND NOT app.is_fnct());
DROP POLICY IF EXISTS pcgd_update ON pcgd;
CREATE POLICY pcgd_update ON pcgd FOR UPDATE
  USING (app.can_write_commune(commune_id) AND NOT app.is_fnct())
  WITH CHECK (app.can_write_commune(commune_id) AND NOT app.is_fnct());

DROP POLICY IF EXISTS caracterisations_select ON caracterisations;
CREATE POLICY caracterisations_select ON caracterisations FOR SELECT
  USING (deleted_at IS NULL AND (commune_id IS NULL AND app.is_authenticated() OR app.can_read_commune(commune_id)));
DROP POLICY IF EXISTS caracterisations_insert ON caracterisations;
CREATE POLICY caracterisations_insert ON caracterisations FOR INSERT
  WITH CHECK ((commune_id IS NULL AND app.is_fnct())
              OR (commune_id IS NOT NULL AND app.can_write_commune(commune_id) AND NOT app.is_fnct()));

DROP POLICY IF EXISTS fractions_select ON fractions_caracterisation;
CREATE POLICY fractions_select ON fractions_caracterisation FOR SELECT
  USING (EXISTS (SELECT 1 FROM caracterisations c WHERE c.id = caracterisation_id));
DROP POLICY IF EXISTS fractions_insert ON fractions_caracterisation;
CREATE POLICY fractions_insert ON fractions_caracterisation FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM caracterisations c WHERE c.id = caracterisation_id
                        AND ((c.commune_id IS NULL AND app.is_fnct())
                             OR (c.commune_id IS NOT NULL AND app.can_write_commune(c.commune_id) AND NOT app.is_fnct()))));

GRANT SELECT ON fractions_reference TO siipi_app;
GRANT SELECT, INSERT, UPDATE ON pcgd TO siipi_app;
GRANT SELECT, INSERT ON caracterisations, fractions_caracterisation TO siipi_app;
REVOKE DELETE, TRUNCATE ON pcgd, caracterisations, fractions_caracterisation FROM siipi_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON fractions_reference FROM siipi_app;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pcgd', 'caracterisations', 'fractions_caracterisation'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'trg_audit_' || t, t);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement()', 'trg_audit_' || t, t);
  END LOOP;
END $$;

-- Le retrait d'une référence est logique, et passe par une fonction : la
-- politique de lecture cache les lignes retirées, et PostgreSQL refuse qu'une
-- mise à jour produise une ligne que l'appelant ne pourrait plus lire.
CREATE OR REPLACE FUNCTION app.retirer_reference(p_table text, p_id uuid) RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS
$fn$
DECLARE
  v_commune text;
  v_existe boolean;
BEGIN
  IF p_table NOT IN ('pcgd', 'caracterisations') THEN
    RAISE EXCEPTION 'TABLE_NON_SUPPRIMABLE: %', p_table;
  END IF;
  EXECUTE format('SELECT true, commune_id FROM %I WHERE id = $1 AND deleted_at IS NULL', p_table)
     INTO v_existe, v_commune USING p_id;
  IF v_existe IS NULL THEN
    RETURN false;
  END IF;
  IF (v_commune IS NULL AND NOT app.is_fnct())
     OR (v_commune IS NOT NULL AND (app.is_fnct() OR NOT app.can_write_commune(v_commune))) THEN
    RAISE EXCEPTION 'ACCES_REFUSE' USING ERRCODE = 'insufficient_privilege';
  END IF;
  EXECUTE format('UPDATE %I SET deleted_at = now(), deleted_by = $2 WHERE id = $1', p_table)
    USING p_id, app.current_user_id();
  RETURN true;
END;
$fn$;

REVOKE ALL ON FUNCTION app.retirer_reference(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.retirer_reference(text, uuid) TO siipi_app;

-- ---------------------------------------------------------------------------
-- La composition retenue
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.caracterisation_retenue(p_commune text, p_date date DEFAULT NULL)
  RETURNS TABLE (caracterisation_id uuid, niveau_source text, annee smallint, commune_id text,
                 methode text, saison text, fractions jsonb)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  WITH jour AS (SELECT coalesce(p_date, (now() AT TIME ZONE 'Africa/Tunis')::date) AS d),
       candidates AS (
         SELECT c.*,
                CASE c.niveau_source WHEN 'etude_anged_commune' THEN 1 WHEN 'pcgd' THEN 2
                                     WHEN 'autre_etude' THEN 3 ELSE 4 END AS rang
           FROM caracterisations c, jour
          WHERE c.deleted_at IS NULL
            AND (c.commune_id = p_commune OR c.commune_id IS NULL)
            -- Une étude postérieure à la date demandée n'existait pas encore.
            AND c.annee <= extract(year FROM jour.d)
       )
  SELECT c.id, c.niveau_source, c.annee, c.commune_id, c.methode, c.saison,
         (SELECT jsonb_agg(jsonb_build_object('fraction', f.fraction, 'pourcentage', f.pourcentage) ORDER BY r.ordre)
            FROM fractions_caracterisation f JOIN fractions_reference r ON r.code = f.fraction
           WHERE f.caracterisation_id = c.id)
    FROM candidates c
   -- On ne rend rien d'une commune qu'on ne peut pas lire.
   WHERE app.can_read_commune(p_commune)
   ORDER BY c.rang, c.annee DESC, c.saisi_le DESC
   LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION app.caracterisation_retenue(text, date) TO siipi_app;

COMMENT ON FUNCTION app.caracterisation_retenue(text, date) IS
  'La composition des déchets retenue pour une commune à une date (D6) : la source la plus précise, puis la plus récente — étude ANGeD de la commune, PCGD, autre étude, moyenne nationale ANGeD. Rendue avec son niveau et son année. Aucune ligne si rien n''existe : jamais une composition supposée.';
