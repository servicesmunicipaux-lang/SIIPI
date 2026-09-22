-- ===========================================================================
-- Migration 044 — Le socle de notification (Jalon 2, lot 1)
--
-- Décision retenue avec la FNCT (feuille de route § 7.2) : un seul canal
-- pour ce lot, le PUSH WEB (Web Push API + VAPID). Aucun fournisseur externe
-- à payer ni à choisir — la clé qui identifie le serveur auprès des
-- navigateurs est générée une fois et vaut pour toujours, comme un certificat
-- auto-signé. Le SMS reste ouvert (colonne `canal` de `envois_notification`
-- l'accepte déjà) mais n'est pas câblé : c'est une décision distincte, liée à
-- celle de l'inscription citoyenne par téléphone (M1).
--
-- POLITIQUE DE RETRY : une seule tentative. Un échec est consigné
-- immédiatement, jamais réessayé en silence — voir `notifications_envoyees`.
--
-- CE QUI EXISTAIT DÉJÀ ET QUE CETTE MIGRATION NE TOUCHE PAS :
-- `envois_notification` (migration 035) reste l'AGRÉGAT affiché à l'écran
-- Communication — trois compteurs, jamais une liste (voir l'en-tête de
-- communication.routes.ts). Cette migration ajoute ce qui manquait pour que
-- l'envoi soit réel plutôt qu'un compteur qui ment :
--
--   `push_souscriptions`    — l'endpoint du navigateur d'un citoyen, qu'il
--                             enregistre lui-même en acceptant les
--                             notifications. Aucune commune n'y a accès :
--                             ce n'est pas un registre, c'est un renvoi
--                             technique vers UN téléphone.
--   `notifications_envoyees` — une ligne par TENTATIVE d'envoi individuelle,
--                             avec son issue. Ce n'est PAS un fichier de
--                             destinataires consultable par une commune : la
--                             lecture est réservée à la FNCT (supervision du
--                             pipeline d'envoi) et au citoyen concerné
--                             (ce qu'il a reçu). Une commune continue de ne
--                             voir que l'agrégat de `envois_notification`.
--
-- LE CIBLAGE RESTE EN SQL, JAMAIS CÔTÉ APPLICATIF. Les deux fonctions
-- `app.souscriptions_citoyen` et `app.souscriptions_publication` sont
-- SECURITY DEFINER et ne sont appelées que par le service d'émission
-- (backend/src/services/notifications.ts) : leur résultat sert à composer
-- des appels Web Push et à écrire le journal, jamais à répondre à une requête
-- HTTP. Aucune route ne les expose : c'est le même principe que
-- `app.compter_destinataires`, appliqué à l'envoi plutôt qu'au comptage.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS push_souscriptions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    citoyen_id  UUID NOT NULL REFERENCES citoyens(id) ON DELETE CASCADE,

    -- Les trois champs qu'exige la Push API : l'URL du service du navigateur,
    -- et les deux clés qui chiffrent la charge utile pour lui seul.
    endpoint    TEXT NOT NULL,
    p256dh      TEXT NOT NULL,
    auth        TEXT NOT NULL,
    -- Diagnostic seulement (« Chrome sur Android », etc.) — jamais lu pour
    -- décider quoi que ce soit.
    user_agent  TEXT,

    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Un même navigateur qui se réabonne remplace son ancien enregistrement,
    -- il ne le double pas.
    CONSTRAINT push_souscriptions_unique UNIQUE (citoyen_id, endpoint)
);

COMMENT ON TABLE push_souscriptions IS
  'Les endpoints Push API des navigateurs d''un citoyen. Purement technique : aucune commune n''y a accès, seul le service d''émission (SECURITY DEFINER) et le citoyen lui-même.';

-- Suppression PHYSIQUE, et c'est une exception délibérée à la suppression
-- logique générale de la plateforme : ce n'est ni une pièce de dossier ni une
-- preuve, seulement un renvoi technique qu'un nouvel abonnement recrée sans
-- perte d'information. Le garder après désabonnement ferait persister l'envoi
-- vers un navigateur qui a explicitement demandé à ne plus recevoir.
ALTER TABLE push_souscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_souscriptions FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_souscriptions_select ON push_souscriptions;
CREATE POLICY push_souscriptions_select ON push_souscriptions FOR SELECT
  USING (citoyen_id = app.my_citizen_id());

DROP POLICY IF EXISTS push_souscriptions_insert ON push_souscriptions;
CREATE POLICY push_souscriptions_insert ON push_souscriptions FOR INSERT
  WITH CHECK (citoyen_id = app.my_citizen_id());

DROP POLICY IF EXISTS push_souscriptions_delete ON push_souscriptions;
CREATE POLICY push_souscriptions_delete ON push_souscriptions FOR DELETE
  USING (citoyen_id = app.my_citizen_id());

-- Un navigateur qui se réabonne (clés renouvelées par le navigateur
-- lui-même) met à jour sa fiche via ON CONFLICT ... DO UPDATE plutôt que
-- d'en accumuler une seconde. PostgreSQL exige une politique UPDATE pour
-- planifier cette clause MÊME quand aucun conflit ne survient au premier
-- abonnement : sans elle, le tout premier POST échouait déjà (42501).
DROP POLICY IF EXISTS push_souscriptions_update ON push_souscriptions;
CREATE POLICY push_souscriptions_update ON push_souscriptions FOR UPDATE
  USING (citoyen_id = app.my_citizen_id())
  WITH CHECK (citoyen_id = app.my_citizen_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON push_souscriptions TO siipi_app;
REVOKE TRUNCATE ON push_souscriptions FROM siipi_app;

-- ---------------------------------------------------------------------------
-- Le journal d'envoi individuel.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS notifications_envoyees (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id   TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    -- Conservé même si le citoyen est retiré ensuite : la ligne reste la
    -- preuve qu'un envoi a été tenté à une date donnée.
    citoyen_id   UUID REFERENCES citoyens(id) ON DELETE SET NULL,

    -- Pourquoi cet envoi a eu lieu, et vers quoi il pointe (un ticket ou une
    -- publication selon le contexte) — sans contrainte de clé étrangère,
    -- puisque la table référencée dépend du contexte.
    contexte     TEXT NOT NULL,
    reference_id UUID,

    canal        TEXT NOT NULL DEFAULT 'push',
    titre        TEXT NOT NULL,
    corps        TEXT NOT NULL,

    statut       TEXT NOT NULL,
    -- Le détail de l'échec, pour un diagnostic — jamais affiché à un agent
    -- communal, seulement à la FNCT qui supervise le pipeline.
    erreur       TEXT,

    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT notifications_contexte_valide CHECK (contexte IN
      ('decision_reclamation', 'invitation_sondage', 'notification_ciblee')),
    -- SMS et courriel restent hors de portée de la contrainte tant qu'aucun
    -- fournisseur n'est branché : une ligne qui prétendrait un envoi SMS
    -- réussi serait un mensonge que rien ne soutient encore.
    CONSTRAINT notifications_canal_valide CHECK (canal = 'push'),
    CONSTRAINT notifications_statut_valide CHECK (statut IN
      ('livre', 'echec', 'non_abonne', 'sans_souscription'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_envoyees_commune
  ON notifications_envoyees (commune_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_envoyees_citoyen
  ON notifications_envoyees (citoyen_id) WHERE citoyen_id IS NOT NULL;

COMMENT ON TABLE notifications_envoyees IS
  'Une ligne par tentative d''envoi individuelle (une seule tentative, jamais de reprise silencieuse). N''EST PAS un fichier de destinataires : lecture réservée à la FNCT (supervision) et au citoyen concerné.';
COMMENT ON COLUMN notifications_envoyees.statut IS
  'livre : accepté par le service push du navigateur. echec : rejeté (endpoint expiré, etc.), consigné et non silencieux. non_abonne : le citoyen a désactivé les notifications. sans_souscription : opt-in mais aucun navigateur enregistré.';

ALTER TABLE notifications_envoyees ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications_envoyees FORCE  ROW LEVEL SECURITY;

-- Lecture : la FNCT (supervision du pipeline), et le citoyen concerné pour ce
-- qui lui a été envoyé. PAS la commune — elle continue de lire l'agrégat de
-- `envois_notification`, jamais qui a reçu quoi.
DROP POLICY IF EXISTS notifications_envoyees_select ON notifications_envoyees;
CREATE POLICY notifications_envoyees_select ON notifications_envoyees FOR SELECT
  USING (app.is_fnct() OR citoyen_id = app.my_citizen_id());

-- Écriture : toujours déclenchée par un geste communal déjà autorisé
-- (accepter/refuser un ticket, envoyer une publication) — la même garde que
-- l'action qui la cause.
DROP POLICY IF EXISTS notifications_envoyees_insert ON notifications_envoyees;
CREATE POLICY notifications_envoyees_insert ON notifications_envoyees FOR INSERT
  WITH CHECK (app.can_write_commune(commune_id));

GRANT SELECT, INSERT ON notifications_envoyees TO siipi_app;
REVOKE UPDATE, DELETE, TRUNCATE ON notifications_envoyees FROM siipi_app;

-- ---------------------------------------------------------------------------
-- Le ciblage, en SQL, réservé au service d'émission.
--
-- Ces deux fonctions ne sont JAMAIS appelées par une route qui renvoie leur
-- résultat à un client : uniquement par backend/src/services/notifications.ts,
-- pour composer les appels Web Push et écrire le journal. C'est le même
-- principe que app.compter_destinataires (035), appliqué à l'envoi plutôt
-- qu'au comptage — la commune sait COMBIEN via l'écran, jamais QUI.
-- ---------------------------------------------------------------------------

-- Le cas d'une décision sur UN ticket : un seul citoyen, déjà connu de
-- l'appelant (tickets.citizen_id). `abonne` distingue l'opt-out du simple
-- « aucun navigateur enregistré » — la même ligne existe dans les deux cas
-- (LEFT JOIN), seul le contenu diffère.
CREATE OR REPLACE FUNCTION app.souscriptions_citoyen(p_citoyen uuid)
  RETURNS TABLE (abonne boolean, endpoint text, p256dh text, auth text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT c.notifications, s.endpoint, s.p256dh, s.auth
    FROM citoyens c
    LEFT JOIN push_souscriptions s ON s.citoyen_id = c.id
   WHERE c.id = p_citoyen AND c.deleted_at IS NULL
$$;

COMMENT ON FUNCTION app.souscriptions_citoyen(uuid) IS
  'Réservée au service d''émission (notifications.ts) pour une notification 1-à-1 (décision de réclamation). Jamais exposée par une route.';

GRANT EXECUTE ON FUNCTION app.souscriptions_citoyen(uuid) TO siipi_app;

-- Le cas d'une publication : le même ciblage que app.compter_destinataires
-- (035), mais qui rend une ligne par citoyen visé — jamais un total. Le
-- résultat ne quitte le service d'émission pour nulle part d'autre.
CREATE OR REPLACE FUNCTION app.souscriptions_publication(p_publication uuid)
  RETURNS TABLE (citoyen_id uuid, abonne boolean, endpoint text, p256dh text, auth text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  WITH pub AS (
    SELECT commune_id, perimetre_type, zone_ids, circuit_ids, perimetre, cible_types
      FROM publications WHERE id = p_publication AND deleted_at IS NULL
  ),
  inscrits AS (
    SELECT c.id, c.zone_id, c.position, c.notifications, c.type_foyer
      FROM citoyens c, pub
     WHERE c.commune_id = pub.commune_id AND c.deleted_at IS NULL
  ),
  vises AS (
    SELECT i.id, i.notifications
      FROM inscrits i, pub
     WHERE CASE pub.perimetre_type
             WHEN 'commune'  THEN true
             WHEN 'zones'    THEN i.zone_id = ANY (pub.zone_ids)
             WHEN 'circuits' THEN i.zone_id IN (
                                    SELECT ci.zone_id FROM circuits ci
                                     WHERE ci.id = ANY (pub.circuit_ids)
                                       AND ci.zone_id IS NOT NULL)
             WHEN 'polygone' THEN i.position IS NOT NULL
                                  AND ST_Contains(pub.perimetre, i.position)
             ELSE false
           END
       AND (pub.cible_types IS NULL OR i.type_foyer IS NULL OR i.type_foyer = ANY (pub.cible_types))
  )
  SELECT v.id, v.notifications, s.endpoint, s.p256dh, s.auth
    FROM vises v
    LEFT JOIN push_souscriptions s ON s.citoyen_id = v.id
$$;

COMMENT ON FUNCTION app.souscriptions_publication(uuid) IS
  'Réservée au service d''émission (notifications.ts) pour l''envoi réel d''une publication. Reproduit le ciblage de app.compter_destinataires (035) mais rend une ligne par citoyen visé, jamais un total : à ne JAMAIS exposer par une route.';

GRANT EXECUTE ON FUNCTION app.souscriptions_publication(uuid) TO siipi_app;
