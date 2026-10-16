-- =========================================================================
-- 079 — Les indicateurs de communication (B5.5.4 : délai, volumétrie, taux).
--
-- Une commune qui écrit à ses habitants doit savoir si ses messages arrivent,
-- s'ils sont lus, combien d'habitants elle ne peut pas joindre, et en combien
-- de temps elle répond aux points que les citoyens lui proposent. Tout se lit
-- dans ce que la plateforme consigne déjà : les publications (035), les envois
-- et leurs volumes (035), chaque tentative d'envoi individuelle (044), les
-- réponses aux sondages (035), les points proposés (042).
--
-- RIEN N'EST NOMINATIF. La fonction ne rend que des comptes et des rapports :
-- elle lit les envois individuels liés à une publication, que la commune ne
-- voit pas (044 : les voir reconstituerait qui habite un périmètre), et n'en
-- rend que des totaux sur la période — d'où SECURITY DEFINER, et un contrôle
-- d'accès écrit ici.
--
-- UN TAUX SANS DÉNOMINATEUR N'EST PAS ZÉRO (règle d'or 1.1) : sans envoi, il
-- n'y a pas de taux de livraison — il est null, et l'écran dit « non
-- renseigné ». Les volumes, eux, sont des comptes exacts de ce que la
-- plateforme a consigné elle-même : 0 envoi est une mesure, pas une absence.
--
-- LA PÉRIODE est en dates de Tunis (règle d'or 1.3), bornes comprises.
-- =========================================================================

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
  notifs AS (
    SELECT n.statut, n.lu FROM notifications_citoyen n
     WHERE n.commune_id = p_commune
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
  'Indicateurs de communication d''une commune sur une période de Tunis (B5.5.4) : volumes (publications, envois, destinataires joints ou non, envois individuels par issue, points proposés, répondants), délais (décision sur un point proposé, en heures, médiane ; points en attente) et taux (livraison, lecture, portée, validation des points, participation aux sondages). Que des totaux, jamais une ligne par citoyen. Un taux sans dénominateur est null, jamais 0. FNCT, ou directeur de la commune ; sinon « introuvable ».';
