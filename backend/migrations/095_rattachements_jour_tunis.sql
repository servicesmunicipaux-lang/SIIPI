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

CREATE OR REPLACE FUNCTION app.prestataire_de_commune(p_user uuid, p_commune text)
  RETURNS TABLE (id uuid, full_name text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT u.id, u.full_name
    FROM users u
   WHERE u.id = p_user
     AND u.role = 'gestionnaire_prestataire'
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

COMMENT ON FUNCTION app.prestataire_de_commune(uuid, text) IS
  'Le compte p_user s''il est un gestionnaire prestataire actif rattaché à p_commune au jour de Tunis (commune principale ou contrat en cours), et seulement pour un appelant qui peut écrire p_commune ; sinon aucune ligne. Sert à l''affectation d''un secteur et au transfert d''une réclamation (095).';

REVOKE ALL ON FUNCTION app.prestataire_de_commune(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.prestataire_de_commune(uuid, text) TO siipi_app;
