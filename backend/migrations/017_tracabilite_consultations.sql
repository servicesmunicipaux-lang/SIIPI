-- ============================================================================
-- 017_tracabilite_consultations.sql
--
-- Rendre la consultation nationale redevable devant les communes.
--
-- La FNCT conserve l'accès complet aux données des 350 communes (TDR §5).
-- C'est un choix assumé — mais il rend la traçabilité des consultations plus
-- importante, pas moins : une commune doit pouvoir vérifier qui a consulté les
-- données personnelles de ses citoyens, y compris quand c'est la fédération.
--
-- Or le journal des accès (migration 014) enregistrait la commune de
-- L'UTILISATEUR, pas celle des données consultées. Pour un agent municipal les
-- deux coïncident, mais pour la FNCT la commune de rattachement est NULL :
-- une consultation nationale ne laissait donc aucune trace visible par la
-- commune concernée. Exactement l'inverse de ce qu'il faut.
--
-- Le journal enregistre désormais les communes CONCERNÉES par la consultation.
-- ============================================================================

ALTER TABLE access_log
  ADD COLUMN IF NOT EXISTS communes_concernees TEXT[] NOT NULL DEFAULT ARRAY[]::text[];

COMMENT ON COLUMN access_log.commune_id IS
  'Commune de rattachement de l''utilisateur qui consulte. NULL pour la FNCT.';
COMMENT ON COLUMN access_log.communes_concernees IS
  'Communes dont les données ont été exposées par cette requête. C''est ce champ qui permet à une commune de voir qui a consulté ses données.';

CREATE INDEX IF NOT EXISTS idx_access_log_communes_concernees
  ON access_log USING GIN (communes_concernees);

-- Nouvelle signature : la commune concernée n'est plus déduite de l'appelant.
DROP FUNCTION IF EXISTS app.enregistrer_acces(text, uuid[], integer);

CREATE OR REPLACE FUNCTION app.enregistrer_acces(
    p_endpoint text,
    p_citizen_ids uuid[],
    p_records_count integer,
    p_communes text[]
  ) RETURNS void
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  INSERT INTO access_log (user_id, user_role, commune_id, endpoint,
                          citizen_ids, records_count, communes_concernees)
  VALUES (app.current_user_id(), app.current_role_name(), app.current_commune(),
          p_endpoint, COALESCE(p_citizen_ids, ARRAY[]::uuid[]),
          COALESCE(p_records_count, 0), COALESCE(p_communes, ARRAY[]::text[]));
$$;

GRANT EXECUTE ON FUNCTION app.enregistrer_acces(text, uuid[], integer, text[]) TO siipi_app;

-- Une commune voit les consultations qui portent sur SES données, quel que
-- soit le rôle de celui qui a consulté — y compris la FNCT.
DROP POLICY IF EXISTS access_log_select ON access_log;
CREATE POLICY access_log_select ON access_log FOR SELECT
  USING (
    app.is_fnct()
    OR (app.current_role_name() = 'admin_commune'
        AND app.current_commune() IS NOT NULL
        AND app.current_commune() = ANY (communes_concernees))
    -- Un citoyen peut savoir qui a consulté ses propres données.
    OR (app.current_role_name() = 'citoyen'
        AND app.my_citizen_id() = ANY (citizen_ids))
  );
