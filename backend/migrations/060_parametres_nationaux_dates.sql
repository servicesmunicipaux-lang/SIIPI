-- =========================================================================
-- 060 — Les paramètres nationaux historisés (lot 17.3, SPEC_v0.16 § R5).
--
-- Trois valeurs que fixe l'échelon national, et qu'aucune commune ne doit
-- recopier : la redevance ANGeD de mise en décharge, le ministère de tutelle
-- et la formule d'en-tête des documents administratifs. Les porter commune par
-- commune créerait 350 copies, donc 350 occasions de diverger.
--
-- UN TARIF CHANGE À UNE DATE. Chaque valeur porte sa date d'effet ; elle ne se
-- réécrit pas, une nouvelle valeur s'ajoute. Le calcul applique la valeur EN
-- VIGUEUR À LA DATE DE LA PESÉE — jamais celle du jour où l'on calcule : un
-- relèvement du barème en juin ne renchérit pas les tonnes de mars.
--
-- UNE VALEUR OFFICIELLE CITE SA PIÈCE. La redevance de référence des PCGD
-- (6,516 TND/t, observée à Bargou en 2025) est posée ici, mais PROVISOIRE : le
-- barème officiel et sa date d'effet manquent (SPEC § 6). La base refuse une
-- valeur non provisoire sans référence.
--
-- La table `parametres_nationaux` (migration 056) reste ce qu'elle est : un
-- interrupteur (l'hébergement accrédité des identités), pas une valeur datée.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Ce que l'on peut paramétrer
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS definitions_parametres_nationaux (
    code        TEXT PRIMARY KEY,
    nature      TEXT NOT NULL,
    unite       TEXT,
    borne_min   NUMERIC,
    borne_max   NUMERIC,
    libelle_fr  TEXT NOT NULL,
    libelle_ar  TEXT NOT NULL,
    description TEXT NOT NULL,
    ordre       INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT definitions_nature_valide CHECK (nature IN ('nombre', 'texte'))
);
COMMENT ON TABLE definitions_parametres_nationaux IS
  'Les paramètres nationaux datés que la FNCT tient (lot 17.3) : leur nature (nombre ou texte bilingue), leur unité et leurs bornes. Ajouter un paramètre, c''est ajouter une ligne ici par une migration — pas une colonne ailleurs.';

INSERT INTO definitions_parametres_nationaux (code, nature, unite, borne_min, borne_max, libelle_fr, libelle_ar, description, ordre) VALUES
  ('redevance_anged', 'nombre', 'TND/t', 0, 1000,
   'Redevance ANGeD de mise en décharge', 'معلوم الإيداع بالمصب (الوكالة الوطنية للتصرف في النفايات)',
   'Montant par tonne pesée, appliqué au taux en vigueur à la date de la pesée.', 10),
  ('ministere_tutelle', 'texte', NULL, NULL, NULL,
   'Ministère de tutelle des communes', 'الوزارة المشرفة على البلديات',
   'Intitulé porté en tête des documents administratifs.', 20),
  ('entete_etat', 'texte', NULL, NULL, NULL,
   'Formule d''en-tête de l''État', 'عبارة رأس الوثيقة',
   'Première ligne de l''en-tête des documents administratifs.', 30)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE definitions_parametres_nationaux ENABLE ROW LEVEL SECURITY;
ALTER TABLE definitions_parametres_nationaux FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS definitions_parametres_nationaux_select ON definitions_parametres_nationaux;
CREATE POLICY definitions_parametres_nationaux_select ON definitions_parametres_nationaux FOR SELECT
  USING (app.is_authenticated());
GRANT SELECT ON definitions_parametres_nationaux TO siipi_app;

-- -------------------------------------------------------------------------
-- 2. Les valeurs, datées
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS valeurs_parametres_nationaux (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code           TEXT NOT NULL REFERENCES definitions_parametres_nationaux(code),
    date_effet     DATE NOT NULL,
    valeur_nombre  NUMERIC(14, 4),
    valeur_fr      TEXT,
    valeur_ar      TEXT,
    provisoire     BOOLEAN NOT NULL DEFAULT false,
    reference      TEXT,
    saisi_par      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    retire_le      TIMESTAMPTZ,
    retire_par     UUID REFERENCES users(id) ON DELETE SET NULL,
    motif_retrait  TEXT,
    CONSTRAINT valeurs_date_plausible CHECK (date_effet >= DATE '2000-01-01'),
    -- Une valeur officielle sans la pièce qui la fonde ne se distingue pas
    -- d'une valeur recopiée d'un rapport : elle reste provisoire.
    CONSTRAINT valeurs_officielle_referencee CHECK (
      provisoire OR length(btrim(COALESCE(reference, ''))) > 0),
    CONSTRAINT valeurs_retrait_motive CHECK (
      retire_le IS NULL OR length(btrim(COALESCE(motif_retrait, ''))) >= 5)
);
COMMENT ON TABLE valeurs_parametres_nationaux IS
  'Les valeurs des paramètres nationaux, chacune avec sa date d''effet. La valeur d''une date est la dernière dont la date d''effet la précède. Une valeur ne se réécrit pas : une autre s''ajoute. Une valeur saisie à tort se retire, avec son motif, et reste lisible.';
COMMENT ON COLUMN valeurs_parametres_nationaux.date_effet IS
  'Premier jour où la valeur s''applique. Peut être dans l''avenir : un barème publié d''avance.';
COMMENT ON COLUMN valeurs_parametres_nationaux.provisoire IS
  'Vrai tant que la valeur n''est pas fondée sur la pièce officielle (barème, arrêté). L''écran le dit à côté de chaque montant qui l''utilise.';
COMMENT ON COLUMN valeurs_parametres_nationaux.reference IS
  'La pièce qui fonde la valeur : barème, arrêté, circulaire. Obligatoire pour une valeur non provisoire.';
COMMENT ON COLUMN valeurs_parametres_nationaux.valeur_fr IS
  'Pour un paramètre de nature texte : l''intitulé en français. valeur_ar : en arabe. Les deux, toujours : un en-tête est bilingue.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_valeur_parametre_date
  ON valeurs_parametres_nationaux (code, date_effet) WHERE retire_le IS NULL;

-- La nature du paramètre décide des colonnes renseignées, et ses bornes de la
-- plage admise. Une seule vérification, pour tous les paramètres présents et
-- à venir.
CREATE OR REPLACE FUNCTION app.controler_valeur_parametre() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_def definitions_parametres_nationaux;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Seul le retrait passe : retire_le, retire_par et motif_retrait, une fois.
    IF OLD.retire_le IS NOT NULL
       OR (to_jsonb(NEW) - 'retire_le' - 'retire_par' - 'motif_retrait')
          IS DISTINCT FROM (to_jsonb(OLD) - 'retire_le' - 'retire_par' - 'motif_retrait') THEN
      RAISE EXCEPTION 'PARAMETRE_FIGE: une valeur nationale ne se réécrit pas ; ajoutez-en une avec sa date d''effet, ou retirez celle-ci avec un motif.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO v_def FROM definitions_parametres_nationaux WHERE code = NEW.code;
  IF v_def.nature = 'nombre' THEN
    IF NEW.valeur_nombre IS NULL OR NEW.valeur_fr IS NOT NULL OR NEW.valeur_ar IS NOT NULL THEN
      RAISE EXCEPTION 'PARAMETRE_NATURE: « % » attend un nombre, et seulement un nombre.', v_def.libelle_fr
        USING ERRCODE = 'check_violation';
    END IF;
    IF (v_def.borne_min IS NOT NULL AND NEW.valeur_nombre <= v_def.borne_min)
       OR (v_def.borne_max IS NOT NULL AND NEW.valeur_nombre >= v_def.borne_max) THEN
      RAISE EXCEPTION 'PARAMETRE_BORNES: « % » doit être strictement compris entre % et % %.',
        v_def.libelle_fr, v_def.borne_min, v_def.borne_max, COALESCE(v_def.unite, '')
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF NEW.valeur_nombre IS NOT NULL
       OR length(btrim(COALESCE(NEW.valeur_fr, ''))) = 0 OR length(btrim(COALESCE(NEW.valeur_ar, ''))) = 0 THEN
      RAISE EXCEPTION 'PARAMETRE_NATURE: « % » attend un intitulé en français ET en arabe.', v_def.libelle_fr
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_controler_valeur_parametre ON valeurs_parametres_nationaux;
CREATE TRIGGER trg_controler_valeur_parametre BEFORE INSERT OR UPDATE ON valeurs_parametres_nationaux
  FOR EACH ROW EXECUTE FUNCTION app.controler_valeur_parametre();

DROP TRIGGER IF EXISTS trg_audit_valeurs_parametres_nationaux ON valeurs_parametres_nationaux;
CREATE TRIGGER trg_audit_valeurs_parametres_nationaux AFTER INSERT OR UPDATE OR DELETE ON valeurs_parametres_nationaux
  FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement();

-- Lire : tout utilisateur authentifié — une commune lit le taux qu'on lui
-- applique. Écrire : la FNCT seule.
ALTER TABLE valeurs_parametres_nationaux ENABLE ROW LEVEL SECURITY;
ALTER TABLE valeurs_parametres_nationaux FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS valeurs_parametres_nationaux_select ON valeurs_parametres_nationaux;
CREATE POLICY valeurs_parametres_nationaux_select ON valeurs_parametres_nationaux FOR SELECT
  USING (app.is_authenticated());
DROP POLICY IF EXISTS valeurs_parametres_nationaux_insert ON valeurs_parametres_nationaux;
CREATE POLICY valeurs_parametres_nationaux_insert ON valeurs_parametres_nationaux FOR INSERT
  WITH CHECK (app.is_fnct());
DROP POLICY IF EXISTS valeurs_parametres_nationaux_update ON valeurs_parametres_nationaux;
CREATE POLICY valeurs_parametres_nationaux_update ON valeurs_parametres_nationaux FOR UPDATE
  USING (app.is_fnct() AND retire_le IS NULL) WITH CHECK (app.is_fnct());
GRANT SELECT, INSERT ON valeurs_parametres_nationaux TO siipi_app;
GRANT UPDATE (retire_le, retire_par, motif_retrait) ON valeurs_parametres_nationaux TO siipi_app;
REVOKE DELETE, TRUNCATE ON valeurs_parametres_nationaux FROM siipi_app;

-- La redevance de référence des PCGD, provisoire. Posée une fois : si la FNCT
-- l'a retirée ou remplacée, une migration rejouée ne la remet pas.
INSERT INTO valeurs_parametres_nationaux (code, date_effet, valeur_nombre, provisoire, reference)
SELECT 'redevance_anged', DATE '2025-01-01', 6.516, true,
       'Valeur de référence des PCGD (observée à Bargou, 2025). Provisoire : barème officiel ANGeD et date d''effet attendus.'
 WHERE NOT EXISTS (SELECT 1 FROM valeurs_parametres_nationaux WHERE code = 'redevance_anged');

-- -------------------------------------------------------------------------
-- 3. La valeur en vigueur à une date
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.parametre_national(p_code text, p_date date)
  RETURNS SETOF valeurs_parametres_nationaux
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT * FROM valeurs_parametres_nationaux
   WHERE code = p_code AND retire_le IS NULL AND date_effet <= p_date
   ORDER BY date_effet DESC
   LIMIT 1
$$;
COMMENT ON FUNCTION app.parametre_national(text, date) IS
  'La valeur d''un paramètre national en vigueur à une date : la dernière non retirée dont la date d''effet la précède ou l''égale. Aucune ligne si aucune ne s''applique encore.';
GRANT EXECUTE ON FUNCTION app.parametre_national(text, date) TO siipi_app;

-- -------------------------------------------------------------------------
-- 4. La redevance ANGeD, au taux de la date de chaque pesée
-- -------------------------------------------------------------------------
-- Par mois, au même grain que app.tonnage_mensuel (migration 036). Une pesée
-- antérieure à toute valeur de la redevance n'a pas de taux : son tonnage est
-- compté à part (tonnes_sans_taux) et le montant porte sur le reste — jamais un
-- taux d'aujourd'hui appliqué au passé. Un mois sans pesée n'a pas de ligne.
CREATE OR REPLACE FUNCTION app.redevance_anged(p_commune text, p_annee integer DEFAULT NULL)
  RETURNS TABLE (
    annee             integer,
    mois              integer,
    pesees            bigint,
    tonnes            numeric,
    tonnes_sans_taux  numeric,
    montant_tnd       numeric,
    taux_appliques    numeric[],
    provisoire        boolean
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  WITH lignes AS (
    SELECT p.date_pesee, p.poids_net_kg / 1000.0 AS t, v.valeur_nombre AS taux, v.provisoire
      FROM pesees p
      LEFT JOIN LATERAL app.parametre_national('redevance_anged', p.date_pesee) v ON true
     WHERE p.commune_id = p_commune AND p.deleted_at IS NULL
       AND (p_annee IS NULL OR EXTRACT(year FROM p.date_pesee)::integer = p_annee)
       AND app.can_read_commune(p_commune)
  )
  SELECT EXTRACT(year FROM date_pesee)::integer,
         EXTRACT(month FROM date_pesee)::integer,
         count(*),
         round(sum(t), 3),
         round(COALESCE(sum(t) FILTER (WHERE taux IS NULL), 0), 3),
         -- Aucune tonne taxable : pas de montant (NULL), pas un zéro.
         round(sum(t * taux), 3),
         array_agg(DISTINCT taux ORDER BY taux) FILTER (WHERE taux IS NOT NULL),
         COALESCE(bool_or(provisoire), false)
    FROM lignes
   GROUP BY 1, 2
   ORDER BY 1, 2
$$;
COMMENT ON FUNCTION app.redevance_anged(text, integer) IS
  'Redevance ANGeD par mois : chaque pesée au taux en vigueur à SA date (app.parametre_national). Tonnage sans taux (pesée antérieure à toute valeur) compté à part ; montant NULL s''il n''y a rien de taxable ; provisoire vrai si un taux provisoire a servi. L''assiette (tous les flux pesés) est à confirmer avec le barème officiel.';
GRANT EXECUTE ON FUNCTION app.redevance_anged(text, integer) TO siipi_app;
