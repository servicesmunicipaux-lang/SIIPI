-- =========================================================================
-- 095 — Les rattachements au jour de Tunis, et le prestataire d'une commune.
-- Constats de la relecture de la v0.15.86 (02/11/2026).
--
-- 1. LE JOUR DE TUNIS (règle 1.3). app.mes_communes() (020) bornait un
--    rattachement par CURRENT_DATE, la date de la session — UTC dans l'image.
--    Entre minuit et une heure à Tunis, un rattachement échu la veille donnait
--    encore accès, et un rattachement qui commence aujourd'hui ne le donnait
--    pas encore. La borne est désormais app.jour_tunis() (092).
--
-- 2. LE PRESTATAIRE D'UNE COMMUNE. Affecter un prestataire à un secteur, ou lui
--    transférer une réclamation, exigeait que sa commune PRINCIPALE soit celle
--    du secteur ou de la réclamation : un prestataire sous contrat avec une
--    seconde commune (utilisateur_communes, 020 et 022) n'y était jamais
--    affectable. Et le directeur ne lit pas la fiche d'un compte dont la commune
--    principale est une autre (users_select, 027) : la route répondait alors
--    « n'est pas un Gestionnaire Prestataire », ce qui était faux.
--    app.prestataire_de_commune() dit, pour l'appelant qui peut écrire la
--    commune, si un compte est un prestataire actif rattaché à cette commune au
--    jour de Tunis — par sa commune principale ou par un contrat en cours — et
--    rend son nom, que l'affectation recopie. Elle ne rend rien à un appelant
--    qui ne peut pas écrire la commune : elle ne sert pas à sonder les comptes.
--
-- 3. UN CONTRAT ÉCHU NE DONNE PLUS RIEN (voir plus bas, avant my_zone_ids).
-- =========================================================================

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
         AND (uc.date_debut IS NULL OR uc.date_debut <= app.jour_tunis())
         AND (uc.date_fin   IS NULL OR uc.date_fin   >= app.jour_tunis())
    ) s
    WHERE c IS NOT NULL
  );
$$;

COMMENT ON FUNCTION app.mes_communes() IS
  'Communes accessibles à l''utilisateur courant : sa commune principale et ses rattachements actifs au jour de Tunis (095). Un rattachement échu ne donne plus accès à rien.';

CREATE OR REPLACE FUNCTION app.prestataires_de_commune(p_commune text)
  RETURNS TABLE (id uuid, full_name text, email text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT u.id, u.full_name, u.email
    FROM users u
   WHERE u.role = 'gestionnaire_prestataire'
     AND u.is_active
     AND u.deleted_at IS NULL
     AND app.can_write_commune(p_commune)
     AND (u.commune_id = p_commune
          OR EXISTS (SELECT 1 FROM utilisateur_communes uc
                      WHERE uc.user_id = u.id
                        AND uc.commune_id = p_commune
                        AND uc.actif
                        AND (uc.date_debut IS NULL OR uc.date_debut <= app.jour_tunis())
                        AND (uc.date_fin   IS NULL OR uc.date_fin   >= app.jour_tunis())));
$$;

COMMENT ON FUNCTION app.prestataires_de_commune(text) IS
  'Les gestionnaires prestataires actifs rattachés à p_commune au jour de Tunis (commune principale ou contrat en cours), pour un appelant qui peut écrire p_commune ; sinon aucune ligne. La liste que la commune propose pour une affectation (095).';

CREATE OR REPLACE FUNCTION app.prestataire_de_commune(p_user uuid, p_commune text)
  RETURNS TABLE (id uuid, full_name text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$ SELECT p.id, p.full_name FROM app.prestataires_de_commune(p_commune) p WHERE p.id = p_user $$;

COMMENT ON FUNCTION app.prestataire_de_commune(uuid, text) IS
  'Le compte p_user s''il figure parmi app.prestataires_de_commune(p_commune) ; sinon aucune ligne. Sert à l''affectation d''un secteur et au transfert d''une réclamation (095).';

REVOKE ALL ON FUNCTION app.prestataires_de_commune(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.prestataire_de_commune(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.prestataires_de_commune(text) TO siipi_app;
GRANT EXECUTE ON FUNCTION app.prestataire_de_commune(uuid, text) TO siipi_app;

-- 3. UN CONTRAT ÉCHU NE DONNE PLUS RIEN. Un prestataire affecté par contrat à
--    une réclamation ou à un secteur gardait, après la fin du contrat, la
--    réclamation (tickets_select et tickets_update ne lisaient que
--    assigned_prestataire_id) et les engins du secteur (app.my_zone_ids() ne
--    lisait que zones_collecte.assigned_prestataire_id). Ces droits passent
--    désormais aussi par app.mes_communes() : la commune doit être la sienne,
--    principale ou par un contrat en cours.

CREATE OR REPLACE FUNCTION app.my_zone_ids() RETURNS uuid[]
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$ SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
     FROM zones_collecte
    WHERE assigned_prestataire_id = app.current_user_id()
      AND commune_id = ANY (app.mes_communes()) $$;

COMMENT ON FUNCTION app.my_zone_ids() IS
  'Les secteurs confiés au prestataire connecté, dans les seules communes de son périmètre (app.mes_communes) : un contrat échu ne donne plus les engins de ses anciens secteurs (095).';

DROP POLICY IF EXISTS tickets_select ON tickets;
CREATE POLICY tickets_select ON tickets FOR SELECT
  USING (
    deleted_at IS NULL
    AND (
      app.can_write_commune(commune_id)
      OR (app.current_role_name() = 'gestionnaire_prestataire'
          AND assigned_prestataire_id = app.current_user_id()
          AND commune_id = ANY (app.mes_communes()))
      OR (app.current_role_name() = 'citoyen' AND citizen_id = app.my_citizen_id())
    )
  );

DROP POLICY IF EXISTS tickets_update ON tickets;
CREATE POLICY tickets_update ON tickets FOR UPDATE
  USING (
    deleted_at IS NULL
    AND (
      app.can_write_commune(commune_id)
      OR (app.current_role_name() = 'gestionnaire_prestataire'
          AND assigned_prestataire_id = app.current_user_id()
          AND commune_id = ANY (app.mes_communes()))
    )
  )
  WITH CHECK (
    app.can_write_commune(commune_id)
    OR (app.current_role_name() = 'gestionnaire_prestataire'
        AND assigned_prestataire_id = app.current_user_id()
        AND commune_id = ANY (app.mes_communes()))
  );
