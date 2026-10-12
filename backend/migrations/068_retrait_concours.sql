-- ===========================================================================
-- Migration 068 — Refonte, lot 1 : retrait du Concours
-- (docs/specs_metier/SPEC_refonte_indicateurs_saisie.md § 1 ; décisions D1 et
-- D3 du 9 octobre 2026)
--
-- CE QUI PART. Le barème (indicateurs_kpi.points), la famille « concours », la
-- fiche d'évaluation annuelle et son circuit brouillon → soumise → validée
-- (evaluations_kpi), les valeurs qui y étaient rattachées (valeurs_kpi), les
-- paramètres du classement. Cette migration est la seule, avec les migrations
-- déjà appliquées qu'on ne réécrit pas, à nommer le Concours : elle doit dire
-- ce qu'elle retire.
--
-- CE QUI RESTE. Les 19 indicateurs, leurs calculs et leurs identifiants
-- internes (M1-1…, jamais affichés : les renommer casserait les valeurs déjà
-- liées). Ils ne forment plus une famille « concours » mais « indicateur ».
--
-- RIEN DE RÉEL NE SE PERD. Chaque valeur saisie est recopiée, avec son auteur
-- et sa date, dans declarations_indicateurs AVANT que ses tables ne partent ;
-- le profil de la commune (abattoir, décharge contrôlée par l'ANGeD) passe dans
-- parametres_commune. Seuls disparaissent la note, le statut de validation et le
-- classement : ils ne correspondent plus à aucune règle. Au 12 octobre 2026, la
-- base principale ne portait aucune fiche (vérifié avant d'écrire cette
-- migration) ; le journal d'audit garde de toute façon chaque ligne retirée.
--
-- UNE VALEUR DÉCLARÉE SUFFIT (D3). Plus de validation par la FNCT : une
-- déclaration vaut dès qu'elle est enregistrée, avec le badge « déclaré », qui
-- l'a saisie et quand. La FNCT peut la commenter ; elle ne la bloque pas, et ne
-- la saisit pas à la place de la commune — la base le tient.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Les déclarations des indicateurs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS declarations_indicateurs (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id        TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    indicateur_code   TEXT NOT NULL REFERENCES indicateurs_kpi(code),
    annee             SMALLINT NOT NULL,
    -- NULL : la déclaration porte sur l'année entière. Un mois : sur ce mois
    -- seul (les séries du lot 3).
    mois              SMALLINT,
    valeur            NUMERIC(16, 3) NOT NULL,
    cible             NUMERIC(16, 3),
    commentaire       TEXT,
    saisi_par         UUID REFERENCES users(id) ON DELETE SET NULL,
    saisi_le          TIMESTAMPTZ NOT NULL DEFAULT now(),
    commentaire_fnct  TEXT,
    commente_par      UUID REFERENCES users(id) ON DELETE SET NULL,
    commente_le       TIMESTAMPTZ,
    deleted_at        TIMESTAMPTZ,
    deleted_by        UUID REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT declarations_annee CHECK (annee BETWEEN 2020 AND 2100),
    CONSTRAINT declarations_mois CHECK (mois IS NULL OR mois BETWEEN 1 AND 12),
    CONSTRAINT declarations_positives CHECK (valeur >= 0 AND (cible IS NULL OR cible > 0)),
    CONSTRAINT declarations_commentaire_date CHECK (commentaire_fnct IS NULL OR commente_le IS NOT NULL)
);

-- Une seule déclaration en vigueur par commune, indicateur et période. Une
-- correction REMPLACE la précédente (le journal d'audit garde l'ancienne) ; un
-- retrait est logique (règle d'or 1.4).
CREATE UNIQUE INDEX IF NOT EXISTS uq_declaration_en_vigueur
  ON declarations_indicateurs (commune_id, indicateur_code, annee, coalesce(mois, 0))
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_declarations_annee
  ON declarations_indicateurs (annee, commune_id) WHERE deleted_at IS NULL;

COMMENT ON TABLE declarations_indicateurs IS
  'Valeurs déclarées par la commune pour les indicateurs que SIIPI ne mesure pas (refonte, lot 1 ; D3). Une déclaration vaut dès qu''elle est enregistrée, sans validation : elle s''affiche avec le badge « déclaré », son auteur et sa date. Une valeur absente est une ligne absente, jamais un zéro.';
COMMENT ON COLUMN declarations_indicateurs.mois IS
  'NULL : l''année entière. 1 à 12 : ce mois seul.';
COMMENT ON COLUMN declarations_indicateurs.commentaire_fnct IS
  'Le commentaire de la FNCT sur la valeur déclarée. Il ne la bloque pas et ne la modifie pas (D3) ; il ne s''écrit que par app.commenter_declaration().';

-- ---------------------------------------------------------------------------
-- 2. Recopie des valeurs de la fiche d'évaluation, puis du profil de la commune
-- ---------------------------------------------------------------------------

ALTER TABLE parametres_commune ADD COLUMN IF NOT EXISTS a_abattoir BOOLEAN;
ALTER TABLE parametres_commune ADD COLUMN IF NOT EXISTS decharge_controlee_anged BOOLEAN;

COMMENT ON COLUMN parametres_commune.a_abattoir IS
  'La commune a-t-elle un abattoir municipal ? Non : l''indicateur des abattoirs (M2-5) est « sans objet » pour elle. NULL : pas encore dit — l''indicateur reste à renseigner.';
COMMENT ON COLUMN parametres_commune.decharge_controlee_anged IS
  'La décharge finale est-elle contrôlée par l''ANGeD ? Oui : l''exploitation de la décharge (M1-8) ne dépend pas de la commune, l''indicateur est « sans objet ». NULL : pas encore dit.';

DO $$
BEGIN
  IF to_regclass('public.valeurs_kpi') IS NOT NULL THEN
    INSERT INTO declarations_indicateurs
      (commune_id, indicateur_code, annee, valeur, cible, commentaire, saisi_par, saisi_le)
    SELECT v.commune_id, v.indicateur_code, e.annee, v.valeur, v.cible, v.commentaire, v.saisi_par, v.updated_at
      FROM valeurs_kpi v
      JOIN evaluations_kpi e ON e.id = v.evaluation_id
     WHERE NOT EXISTS (
       SELECT 1 FROM declarations_indicateurs d
        WHERE d.commune_id = v.commune_id AND d.indicateur_code = v.indicateur_code
          AND d.annee = e.annee AND d.mois IS NULL AND d.deleted_at IS NULL);
  END IF;

  IF to_regclass('public.evaluations_kpi') IS NOT NULL THEN
    -- Le profil le plus récent dit par la commune ; ce qu'elle a déjà dit
    -- ailleurs n'est pas écrasé.
    INSERT INTO parametres_commune (commune_id, a_abattoir, decharge_controlee_anged)
    SELECT DISTINCT ON (e.commune_id) e.commune_id, e.a_abattoir, e.decharge_controlee_anged
      FROM evaluations_kpi e
     WHERE e.a_abattoir IS NOT NULL OR e.decharge_controlee_anged IS NOT NULL
     ORDER BY e.commune_id, e.annee DESC
    ON CONFLICT (commune_id) DO UPDATE
       SET a_abattoir = coalesce(parametres_commune.a_abattoir, EXCLUDED.a_abattoir),
           decharge_controlee_anged = coalesce(parametres_commune.decharge_controlee_anged, EXCLUDED.decharge_controlee_anged);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Les règles d'une déclaration, tenues par la base
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.controler_declaration() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$fn$
DECLARE
  i indicateurs_kpi%ROWTYPE;
BEGIN
  SELECT * INTO i FROM indicateurs_kpi WHERE code = NEW.indicateur_code;
  IF i.mode <> 'saisi' THEN
    RAISE EXCEPTION 'DECLARATION_INDICATEUR_CALCULE: « % » est calculé par la plateforme : il ne se déclare pas.', i.libelle_fr;
  END IF;
  IF i.saisie = 'taux' AND NEW.valeur > 100 THEN
    RAISE EXCEPTION 'DECLARATION_TAUX: « % » est un taux : 100 %% au plus.', i.libelle_fr;
  END IF;
  IF i.saisie = 'ratio' AND NEW.cible IS NULL THEN
    RAISE EXCEPTION 'DECLARATION_CIBLE: « % » se rapporte à une cible : %.', i.libelle_fr, coalesce(i.libelle_cible, 'cible requise');
  END IF;
  -- Le commentaire de la FNCT ne passe que par app.commenter_declaration().
  IF TG_OP = 'UPDATE' AND NEW.commentaire_fnct IS DISTINCT FROM OLD.commentaire_fnct
     AND current_setting('app.commentaire_fnct', true) IS DISTINCT FROM 'oui' THEN
    RAISE EXCEPTION 'DECLARATION_COMMENTAIRE_FNCT: le commentaire de la FNCT ne s''écrit que par la FNCT.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_controler_declaration ON declarations_indicateurs;
CREATE TRIGGER trg_controler_declaration BEFORE INSERT OR UPDATE ON declarations_indicateurs
  FOR EACH ROW EXECUTE FUNCTION app.controler_declaration();

DROP TRIGGER IF EXISTS trg_audit_declarations_indicateurs ON declarations_indicateurs;
CREATE TRIGGER trg_audit_declarations_indicateurs AFTER INSERT OR UPDATE OR DELETE ON declarations_indicateurs
  FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement();

-- ---------------------------------------------------------------------------
-- 4. Cloisonnement : la commune déclare, la FNCT lit et commente
-- ---------------------------------------------------------------------------

ALTER TABLE declarations_indicateurs ENABLE ROW LEVEL SECURITY;
ALTER TABLE declarations_indicateurs FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS declarations_select ON declarations_indicateurs;
CREATE POLICY declarations_select ON declarations_indicateurs FOR SELECT
  USING (deleted_at IS NULL AND app.can_write_commune(commune_id));
-- La commune décide, la plateforme instruit (CLAUDE.md § 6) : la FNCT ne
-- déclare pas une valeur à la place de la commune.
DROP POLICY IF EXISTS declarations_insert ON declarations_indicateurs;
CREATE POLICY declarations_insert ON declarations_indicateurs FOR INSERT
  WITH CHECK (app.can_write_commune(commune_id) AND NOT app.is_fnct());
DROP POLICY IF EXISTS declarations_update ON declarations_indicateurs;
CREATE POLICY declarations_update ON declarations_indicateurs FOR UPDATE
  USING (app.can_write_commune(commune_id) AND NOT app.is_fnct())
  WITH CHECK (app.can_write_commune(commune_id) AND NOT app.is_fnct());

GRANT SELECT, INSERT, UPDATE ON declarations_indicateurs TO siipi_app;
REVOKE DELETE, TRUNCATE ON declarations_indicateurs FROM siipi_app;

-- Le retrait d'une déclaration est logique. Il passe par une fonction : la
-- politique de lecture cache les lignes retirées, et PostgreSQL refuse qu'une
-- mise à jour produise une ligne que l'appelant ne pourrait plus lire. Mêmes
-- règles que l'écriture : la commune, jamais la FNCT à sa place.
CREATE OR REPLACE FUNCTION app.retirer_declaration(p_commune text, p_code text, p_annee integer)
  RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS
$fn$
BEGIN
  IF app.is_fnct() OR NOT app.can_write_commune(p_commune) THEN
    RAISE EXCEPTION 'ACCES_REFUSE' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE declarations_indicateurs SET deleted_at = now(), deleted_by = app.current_user_id()
   WHERE commune_id = p_commune AND indicateur_code = p_code AND annee = p_annee
     AND mois IS NULL AND deleted_at IS NULL;
  RETURN FOUND;
END;
$fn$;

REVOKE ALL ON FUNCTION app.retirer_declaration(text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.retirer_declaration(text, text, integer) TO siipi_app;

CREATE OR REPLACE FUNCTION app.commenter_declaration(p_id uuid, p_commentaire text)
  RETURNS declarations_indicateurs
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS
$fn$
DECLARE
  d declarations_indicateurs;
BEGIN
  IF NOT app.is_fnct() THEN
    RAISE EXCEPTION 'COMMENTAIRE_RESERVE_FNCT: seule la FNCT commente une déclaration.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM set_config('app.commentaire_fnct', 'oui', true);
  UPDATE declarations_indicateurs
     SET commentaire_fnct = NULLIF(btrim(p_commentaire), ''),
         commente_par = CASE WHEN NULLIF(btrim(p_commentaire), '') IS NULL THEN NULL ELSE app.current_user_id() END,
         commente_le = CASE WHEN NULLIF(btrim(p_commentaire), '') IS NULL THEN NULL ELSE now() END
   WHERE id = p_id AND deleted_at IS NULL
  RETURNING * INTO d;
  PERFORM set_config('app.commentaire_fnct', '', true);
  IF d.id IS NULL THEN
    RAISE EXCEPTION 'DECLARATION_INTROUVABLE: aucune déclaration en vigueur ne porte cet identifiant.';
  END IF;
  RETURN d;
END;
$fn$;

REVOKE ALL ON FUNCTION app.commenter_declaration(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.commenter_declaration(uuid, text) TO siipi_app;

-- ---------------------------------------------------------------------------
-- 5. Le retrait
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS valeurs_kpi;
DROP TABLE IF EXISTS evaluations_kpi;
DROP FUNCTION IF EXISTS app.controler_valeur_kpi();

ALTER TABLE indicateurs_kpi DROP CONSTRAINT IF EXISTS indicateurs_kpi_points;
ALTER TABLE indicateurs_kpi DROP CONSTRAINT IF EXISTS indicateurs_kpi_famille;
UPDATE indicateurs_kpi SET famille = 'indicateur' WHERE famille = 'concours';
ALTER TABLE indicateurs_kpi ADD CONSTRAINT indicateurs_kpi_famille CHECK (famille IN ('indicateur', 'dma', 'donnee'));
ALTER TABLE indicateurs_kpi DROP COLUMN IF EXISTS points;

-- Les descriptions qui renvoyaient à la redistribution des points disent
-- désormais ce que le profil de la commune change : rien d'autre que « sans
-- objet ».
UPDATE indicateurs_kpi SET description =
  'Mode d''exploitation de la décharge finale quand la commune la contrôle, et plan de prévention des incendies. Si la décharge est contrôlée par l''ANGeD, l''indicateur est « sans objet » pour la commune.'
 WHERE code = 'M1-8';
UPDATE indicateurs_kpi SET description =
  'Projets innovants et partenariats internationaux ou associatifs pour la durabilité du service.'
 WHERE code = 'M1-10';
UPDATE indicateurs_kpi SET description =
  'Propreté des abattoirs municipaux. Sans abattoir municipal, l''indicateur est « sans objet » pour la commune.'
 WHERE code = 'M2-5';

COMMENT ON TABLE indicateurs_kpi IS
  'Catalogue des indicateurs du tableau de bord (TDR §3.2.10) : les 19 indicateurs de propreté (famille indicateur), la préparation au décret DMA (famille dma) et les données qui nourrissent un axe (famille donnee). L''identifiant (M1-1…) est interne et ne s''affiche pas.';
COMMENT ON COLUMN indicateurs_kpi.module IS
  'Regroupement interne d''origine (M1, M2, M3), conservé pour les identifiants ; il ne s''affiche plus. Les indicateurs se lisent par axe.';

DELETE FROM parametres_kpi WHERE cle IN ('couverture_classement_min', 'bareme_provisoire');

-- ---------------------------------------------------------------------------
-- 6. « À vérifier » : les déclarations remplacent la fiche
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.incoherences_kpi(p_commune text)
  RETURNS TABLE (gravite text, domaine text, sujet text, sujet_id text, constat text, quoi_faire text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  WITH an AS (SELECT extract(year FROM (now() AT TIME ZONE 'Africa/Tunis'))::int AS annee),
       seuil AS (SELECT valeur FROM parametres_kpi WHERE cle = 'bachage_min')
  -- Le bâchage déclaré est sous le seuil national.
  SELECT 'avertissement', 'kpi', 'Bâchage des bennes', NULL::text,
         format('%s %% des bennes basculantes sont bâchées pendant le transport (seuil : %s %%).',
                round(100 * d.valeur / d.cible), round(s.valeur)),
         'Équiper les bennes de bâches, et mettre à jour la déclaration (onglet Indicateurs).'
    FROM declarations_indicateurs d, an, seuil s
   WHERE d.commune_id = p_commune AND d.indicateur_code = 'M1-9' AND d.deleted_at IS NULL
     AND d.annee = an.annee AND d.mois IS NULL
     AND d.cible > 0 AND 100 * d.valeur / d.cible < s.valeur
$$;

GRANT EXECUTE ON FUNCTION app.incoherences_kpi(text) TO siipi_app;
