-- =========================================================================
-- 081 — Le courriel (décision du 16 octobre 2026 : « courriel d'abord, SMS
-- plus tard » ; B1.2, B5.4.3).
--
-- SUR DEMANDE (réponse de l'utilisateur du 16/10/2026). Un citoyen ne reçoit
-- un courriel que pour un type de notification où il l'a activé : pour le
-- canal « email », une préférence ABSENTE vaut « désactivé » — à l'inverse du
-- push, où l'abonnement du navigateur tient déjà lieu de consentement. Le
-- branchement du courriel ne déclenche donc aucune vague d'envois.
--
-- LE JOURNAL. Chaque courriel tenté est une ligne de notifications_citoyen sur
-- le canal « email » : livre (accepté par le serveur SMTP), echec, ou
-- non_configure (aucun serveur désigné : rien n'est parti, et c'est dit).
-- L'historique du citoyen et les indicateurs du push restent ceux du push ; les
-- courriels ont leur propre compte (app.indicateurs_communication, ci-dessous).
--
-- LES ADRESSES ne sortent que vers le service d'envoi : les deux fonctions
-- ci-dessous, SECURITY DEFINER, ne sont appelées par aucune route.
-- =========================================================================

ALTER TABLE notifications_citoyen DROP CONSTRAINT IF EXISTS notifications_canal_valide;
ALTER TABLE notifications_citoyen ADD CONSTRAINT notifications_canal_valide CHECK (canal IN ('push', 'email'));
ALTER TABLE notifications_citoyen DROP CONSTRAINT IF EXISTS notifications_statut_valide;
ALTER TABLE notifications_citoyen ADD CONSTRAINT notifications_statut_valide CHECK (statut IN
  ('livre', 'echec', 'non_abonne', 'non_souhaite', 'sans_souscription', 'non_configure'));
COMMENT ON COLUMN notifications_citoyen.canal IS
  'push (le canal immédiat, celui de l''historique « Mes notifications ») ou email (081 : seulement pour un type que le citoyen a activé). Le SMS n''est pas émis (décision du 16/10/2026).';

COMMENT ON TABLE preferences_notification IS
  'Préférences de notification par canal et par type, propres à un citoyen. Push : une ligne absente vaut « activé ». Courriel (081) : une ligne absente vaut « désactivé » — le citoyen le demande, type par type. SMS : non émis.';

DROP FUNCTION IF EXISTS app.courriels_publication(uuid, text);
CREATE FUNCTION app.courriels_publication(p_publication uuid, p_type text)
  RETURNS TABLE (citoyen_id uuid, courriel text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  -- Le ciblage est celui du push (app.souscriptions_publication), une ligne par
  -- citoyen ; puis le consentement au courriel pour ce type, et une adresse.
  SELECT DISTINCT s.citoyen_id, u.email
    FROM app.souscriptions_publication(p_publication, p_type) s
    JOIN citoyens c ON c.id = s.citoyen_id AND c.deleted_at IS NULL
    JOIN users u ON u.id = c.user_id AND u.deleted_at IS NULL AND u.is_active
    JOIN preferences_notification p
      ON p.citoyen_id = s.citoyen_id AND p.canal = 'email' AND p.type = p_type AND p.active
   WHERE s.abonne
$$;
REVOKE ALL ON FUNCTION app.courriels_publication(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.courriels_publication(uuid, text) TO siipi_app;
COMMENT ON FUNCTION app.courriels_publication(uuid, text) IS
  'Réservée au service d''envoi (notifications.ts) : les citoyens du périmètre d''une publication qui ont activé le courriel pour ce type, et leur adresse. À ne JAMAIS exposer par une route.';

DROP FUNCTION IF EXISTS app.courriel_citoyen(uuid, text);
CREATE FUNCTION app.courriel_citoyen(p_citoyen uuid, p_type text)
  RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT u.email
    FROM citoyens c
    JOIN users u ON u.id = c.user_id AND u.deleted_at IS NULL AND u.is_active
    JOIN preferences_notification p ON p.citoyen_id = c.id AND p.canal = 'email' AND p.type = p_type AND p.active
   WHERE c.id = p_citoyen AND c.deleted_at IS NULL AND c.notifications
$$;
REVOKE ALL ON FUNCTION app.courriel_citoyen(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.courriel_citoyen(uuid, text) TO siipi_app;
COMMENT ON FUNCTION app.courriel_citoyen(uuid, text) IS
  'Réservée au service d''envoi : l''adresse d''un citoyen qui a activé le courriel pour ce type, ou NULL. À ne JAMAIS exposer par une route.';

-- Les indicateurs de communication (079) : le push et le courriel, à part.
DROP FUNCTION IF EXISTS app.indicateurs_communication(text, date, date);
CREATE FUNCTION app.indicateurs_communication(p_commune text, p_debut date, p_fin date)
  RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$fn$
DECLARE
  v jsonb;
BEGIN
  IF p_debut IS NULL OR p_fin IS NULL OR p_debut > p_fin THEN
    RAISE EXCEPTION 'COMMUNICATION_BORNES: le début doit précéder la fin.' USING ERRCODE = 'check_violation';
  END IF;
  -- La FNCT, ou le directeur de la commune (ses rattachements compris). Une
  -- commune hors du périmètre est introuvable, pas « refusée ».
  IF NOT (app.is_fnct() OR (app.current_role_name() = 'admin_commune' AND p_commune = ANY (app.mes_communes())))
     OR NOT EXISTS (SELECT 1 FROM communes c WHERE c.id = p_commune AND c.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'COMMUNICATION_INTROUVABLE: commune introuvable.' USING ERRCODE = 'no_data_found';
  END IF;

  WITH
  pubs AS (
    SELECT p.type FROM publications p
     WHERE p.commune_id = p_commune AND p.deleted_at IS NULL AND NOT p.est_exemple
       AND p.publiee_le IS NOT NULL
       AND (p.publiee_le AT TIME ZONE 'Africa/Tunis')::date BETWEEN p_debut AND p_fin
  ),
  envois AS (
    SELECT e.* FROM envois_notification e
      JOIN publications p ON p.id = e.publication_id AND NOT p.est_exemple
     WHERE e.commune_id = p_commune
       AND (e.created_at AT TIME ZONE 'Africa/Tunis')::date BETWEEN p_debut AND p_fin
  ),
  -- Les envois individuels PUSH : le canal immédiat, celui de l'historique du
  -- citoyen. Les courriels (081) sont comptés à part, plus bas.
  notifs AS (
    SELECT n.statut, n.lu FROM notifications_citoyen n
     WHERE n.commune_id = p_commune AND n.canal = 'push'
       AND (n.date_envoi AT TIME ZONE 'Africa/Tunis')::date BETWEEN p_debut AND p_fin
  ),
  courriels AS (
    SELECT n.statut FROM notifications_citoyen n
     WHERE n.commune_id = p_commune AND n.canal = 'email'
       AND (n.date_envoi AT TIME ZONE 'Africa/Tunis')::date BETWEEN p_debut AND p_fin
  ),
  sugg_recues AS (
    SELECT 1 FROM points_suggeres s
     WHERE s.commune_id = p_commune AND s.deleted_at IS NULL
       AND (s.created_at AT TIME ZONE 'Africa/Tunis')::date BETWEEN p_debut AND p_fin
  ),
  sugg_decidees AS (
    SELECT s.statut, extract(epoch FROM s.decide_le - s.created_at) / 3600.0 AS heures
      FROM points_suggeres s
     WHERE s.commune_id = p_commune AND s.deleted_at IS NULL AND s.decide_le IS NOT NULL
       AND s.statut IN ('valide', 'refuse')
       AND (s.decide_le AT TIME ZONE 'Africa/Tunis')::date BETWEEN p_debut AND p_fin
  ),
  sugg_attente AS (
    SELECT count(*) AS n, max(now() - s.created_at) AS plus_ancienne
      FROM points_suggeres s
     WHERE s.commune_id = p_commune AND s.deleted_at IS NULL AND s.statut = 'en_attente'
  ),
  -- Participation : pour chaque sondage envoyé dans la période, les répondants
  -- distincts sur les destinataires de son plus grand envoi — renvoyer un sondage
  -- ne double pas le nombre de foyers invités.
  sondages AS (
    SELECT e.publication_id, max(e.destinataires) AS invites,
           (SELECT count(DISTINCT r.citoyen_id) FROM sondage_reponses r
             WHERE r.publication_id = e.publication_id AND r.citoyen_id IS NOT NULL) AS repondants
      FROM envois e JOIN publications p ON p.id = e.publication_id AND p.type = 'sondage'
     GROUP BY e.publication_id
  ),
  repondants AS (
    SELECT count(DISTINCT r.citoyen_id) AS n FROM sondage_reponses r
      JOIN publications p ON p.id = r.publication_id AND p.commune_id = p_commune AND NOT p.est_exemple
     WHERE r.citoyen_id IS NOT NULL
       AND (r.created_at AT TIME ZONE 'Africa/Tunis')::date BETWEEN p_debut AND p_fin
  ),
  c AS (
    SELECT
      (SELECT count(*) FILTER (WHERE type = 'notification') FROM pubs) AS pub_notification,
      (SELECT count(*) FILTER (WHERE type = 'sondage') FROM pubs) AS pub_sondage,
      (SELECT count(*) FILTER (WHERE type = 'projet') FROM pubs) AS pub_projet,
      (SELECT count(*) FROM envois) AS envois,
      (SELECT COALESCE(sum(destinataires), 0) FROM envois) AS destinataires,
      (SELECT COALESCE(sum(sans_adresse), 0) FROM envois) AS sans_adresse,
      (SELECT COALESCE(sum(desabonnes), 0) FROM envois) AS desabonnes,
      (SELECT count(*) FROM notifs) AS n_total,
      (SELECT count(*) FILTER (WHERE statut = 'livre') FROM notifs) AS n_livre,
      (SELECT count(*) FILTER (WHERE statut = 'echec') FROM notifs) AS n_echec,
      (SELECT count(*) FILTER (WHERE statut = 'non_abonne') FROM notifs) AS n_non_abonne,
      (SELECT count(*) FILTER (WHERE statut = 'non_souhaite') FROM notifs) AS n_non_souhaite,
      (SELECT count(*) FILTER (WHERE statut = 'sans_souscription') FROM notifs) AS n_sans_souscription,
      (SELECT count(*) FILTER (WHERE statut = 'livre' AND lu) FROM notifs) AS n_lu,
      (SELECT count(*) FROM courriels) AS c_total,
      (SELECT count(*) FILTER (WHERE statut = 'livre') FROM courriels) AS c_envoye,
      (SELECT count(*) FILTER (WHERE statut = 'echec') FROM courriels) AS c_echec,
      (SELECT count(*) FILTER (WHERE statut = 'non_configure') FROM courriels) AS c_non_configure,
      (SELECT count(*) FROM sugg_recues) AS sugg_recues,
      (SELECT count(*) FROM sugg_decidees) AS sugg_decidees,
      (SELECT count(*) FILTER (WHERE statut = 'valide') FROM sugg_decidees) AS sugg_validees,
      (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY heures) FROM sugg_decidees) AS delai_mediane_h,
      (SELECT n FROM sugg_attente) AS attente_n,
      (SELECT extract(day FROM plus_ancienne)::int FROM sugg_attente) AS attente_jours,
      (SELECT COALESCE(sum(repondants), 0) FROM sondages) AS part_repondants,
      (SELECT COALESCE(sum(invites), 0) FROM sondages) AS part_invites,
      (SELECT n FROM repondants) AS repondants
  )
  SELECT jsonb_build_object(
    'commune_id', p_commune,
    'periode', jsonb_build_object('debut', p_debut::text, 'fin', p_fin::text),
    'volumetrie', jsonb_build_object(
      'publications', jsonb_build_object('notification', pub_notification, 'sondage', pub_sondage, 'projet', pub_projet),
      'envois', envois,
      'destinataires', destinataires,
      'sans_adresse', sans_adresse,
      'desabonnes', desabonnes,
      'envois_individuels', jsonb_build_object(
        'total', n_total, 'livre', n_livre, 'echec', n_echec, 'non_abonne', n_non_abonne,
        'non_souhaite', n_non_souhaite, 'sans_souscription', n_sans_souscription),
      'courriels', jsonb_build_object(
        'total', c_total, 'envoye', c_envoye, 'echec', c_echec, 'non_configure', c_non_configure),
      'suggestions_recues', sugg_recues,
      'repondants_sondage', repondants),
    'delais', jsonb_build_object(
      'decision_suggestion_h', jsonb_build_object(
        'mediane', CASE WHEN sugg_decidees = 0 THEN NULL ELSE round(delai_mediane_h::numeric, 1) END,
        'decisions', sugg_decidees),
      'suggestions_en_attente', jsonb_build_object('nombre', attente_n, 'plus_ancienne_jours', attente_jours)),
    'taux', jsonb_build_object(
      'livraison', jsonb_build_object('numerateur', n_livre, 'denominateur', n_livre + n_echec,
        'valeur', CASE WHEN n_livre + n_echec = 0 THEN NULL ELSE round(n_livre::numeric / (n_livre + n_echec), 4) END),
      'lecture', jsonb_build_object('numerateur', n_lu, 'denominateur', n_livre,
        'valeur', CASE WHEN n_livre = 0 THEN NULL ELSE round(n_lu::numeric / n_livre, 4) END),
      'portee', jsonb_build_object('numerateur', destinataires, 'denominateur', destinataires + sans_adresse + desabonnes,
        'valeur', CASE WHEN destinataires + sans_adresse + desabonnes = 0 THEN NULL
                       ELSE round(destinataires::numeric / (destinataires + sans_adresse + desabonnes), 4) END),
      'validation_suggestions', jsonb_build_object('numerateur', sugg_validees, 'denominateur', sugg_decidees,
        'valeur', CASE WHEN sugg_decidees = 0 THEN NULL ELSE round(sugg_validees::numeric / sugg_decidees, 4) END),
      'participation_sondages', jsonb_build_object('numerateur', part_repondants, 'denominateur', part_invites,
        'valeur', CASE WHEN part_invites = 0 THEN NULL ELSE round(part_repondants::numeric / part_invites, 4) END)))
    INTO v
    FROM c;
  RETURN v;
END;
$fn$;
REVOKE ALL ON FUNCTION app.indicateurs_communication(text, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.indicateurs_communication(text, date, date) TO siipi_app;
COMMENT ON FUNCTION app.indicateurs_communication(text, date, date) IS
  'Indicateurs de communication d''une commune sur une période de Tunis (B5.5.4 ; 081 : push et courriel comptés à part) : volumes (publications, envois, destinataires joints ou non, envois individuels push par issue, courriels par issue, points proposés, répondants), délais (décision sur un point proposé, en heures, médiane ; points en attente) et taux (livraison, lecture, portée, validation des points, participation aux sondages). Que des totaux, jamais une ligne par citoyen. Un taux sans dénominateur est null, jamais 0. FNCT, ou directeur de la commune ; sinon « introuvable ».';
