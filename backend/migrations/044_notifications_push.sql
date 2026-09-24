-- ===========================================================================
-- Migration 044 — Le socle de notification (Jalon 2 : lot 1 + M6)
--
-- Décision retenue avec l'utilisateur (feuille de route § 7.2) : un seul
-- canal pour ce lot, le PUSH WEB (Web Push API + VAPID). Aucun fournisseur
-- externe à payer ni à choisir — la clé qui identifie le serveur auprès des
-- navigateurs est générée une fois et vaut pour toujours, comme un certificat
-- auto-signé. Le SMS reste ouvert dans le modèle (colonnes `canal`) mais
-- n'est pas câblé : décision distincte, liée à l'inscription citoyenne par
-- téléphone (M1).
--
-- POLITIQUE DE RETRY AUTOMATIQUE : une seule tentative. Un échec est
-- consigné immédiatement, jamais réessayé en silence. Un agent peut en
-- revanche RELANCER MANUELLEMENT un envoi échoué (colonne `tentatives`,
-- fonction de service `renvoyerNotification` — voir notifications.ts) :
-- l'automatisme ne retente pas, une personne le peut.
--
-- CE QUI EXISTAIT DÉJÀ ET QUE CETTE MIGRATION NE TOUCHE PAS :
-- `envois_notification` (migration 035) reste l'AGRÉGAT affiché à l'écran
-- Communication — trois compteurs, jamais une liste (voir l'en-tête de
-- communication.routes.ts). Cette migration ajoute ce qui manquait pour que
-- l'envoi soit réel plutôt qu'un compteur qui ment, ET l'historique côté
-- citoyen (M6) :
--
--   `push_souscriptions`     — l'endpoint du navigateur d'un citoyen, qu'il
--                              enregistre lui-même. Aucune commune n'y a
--                              accès : ce n'est pas un registre, c'est un
--                              renvoi technique vers UN téléphone.
--   `preferences_notification` — ce que CE citoyen veut recevoir, par canal
--                              et par type. Absence de ligne = valeur par
--                              défaut (tout activé) : on ne force personne à
--                              visiter un écran de réglages avant de recevoir
--                              ce pour quoi il s'est inscrit.
--   `notifications_citoyen`  — une ligne par TENTATIVE d'envoi individuelle,
--                              avec son issue — MÊME quand rien n'a été
--                              envoyé (désabonné, préférence désactivée,
--                              aucun navigateur) : c'est justement ce qui
--                              nourrit l'écran « Mes notifications » et son
--                              compteur de non-lus, qui doivent refléter tout
--                              ce qui s'est passé, pas seulement les envois
--                              réussis.
--
--                              Lecture : la FNCT (supervision), le citoyen
--                              concerné (son historique), et — SEULEMENT
--                              pour une décision de réclamation, jamais pour
--                              une publication — la commune qui la traite :
--                              elle connaît déjà ce citoyen par le ticket
--                              qu'elle instruit (nom, téléphone déjà
--                              affichés), retenir cette seule ligne ne lui
--                              apprend donc rien de plus. Un envoi lié à une
--                              publication resterait invisible d'une commune :
--                              le voir reconstituerait qui se trouve dans un
--                              périmètre, exactement ce que l'agrégat de
--                              envois_notification est construit pour
--                              éviter.
--
-- LE CIBLAGE RESTE EN SQL, JAMAIS CÔTÉ APPLICATIF. Les deux fonctions
-- `app.souscriptions_citoyen` et `app.souscriptions_publication` sont
-- SECURITY DEFINER et ne sont appelées que par le service d'émission
-- (backend/src/services/notifications.ts) : leur résultat sert à composer
-- des appels Web Push et à écrire le journal, jamais à répondre à une requête
-- HTTP. Aucune route ne les expose : c'est le même principe que
-- `app.compter_destinataires`, appliqué à l'envoi plutôt qu'au comptage.
--
-- LEÇON RETENUE EN COURS DE ROUTE (voir CHANGELOG) : un INSERT ... ON
-- CONFLICT ... DO UPDATE sur une table RLS exige une politique UPDATE MÊME
-- quand aucun conflit ne survient — PostgreSQL vérifie les permissions de
-- toutes les clauses de la requête au moment de la planifier, pas seulement
-- de celles qu'elle exécute. `push_souscriptions_update` existe pour cette
-- seule raison.
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
-- Préférences : ce que CE citoyen veut recevoir, par canal et par type.
--
-- Table creuse : l'ABSENCE de ligne pour (citoyen, canal, type) vaut
-- « activé ». On ne stocke que les exceptions — un citoyen qui n'a jamais
-- ouvert l'écran Préférences reçoit tout ce pour quoi il s'est inscrit,
-- plutôt que rien tant qu'il n'a pas coché des cases.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS preferences_notification (
    citoyen_id  UUID NOT NULL REFERENCES citoyens(id) ON DELETE CASCADE,
    canal       TEXT NOT NULL,
    type        TEXT NOT NULL,
    active      BOOLEAN NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (citoyen_id, canal, type),
    CONSTRAINT preferences_canal_valide CHECK (canal IN ('push', 'sms', 'email')),
    CONSTRAINT preferences_type_valide CHECK (type IN
      ('decision_reclamation', 'invitation_sondage', 'notification_ciblee'))
);

COMMENT ON TABLE preferences_notification IS
  'Préférences de notification par canal et par type, propres à un citoyen. Une ligne absente vaut "activé" : on ne fait taire que ce qu''on a explicitement demandé à taire. SMS est accepté par la contrainte pour cohérence du modèle, mais aucun canal autre que push n''est actuellement émis (voir services/notifications.ts).';

ALTER TABLE preferences_notification ENABLE ROW LEVEL SECURITY;
ALTER TABLE preferences_notification FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS preferences_notification_select ON preferences_notification;
CREATE POLICY preferences_notification_select ON preferences_notification FOR SELECT
  USING (citoyen_id = app.my_citizen_id());

DROP POLICY IF EXISTS preferences_notification_insert ON preferences_notification;
CREATE POLICY preferences_notification_insert ON preferences_notification FOR INSERT
  WITH CHECK (citoyen_id = app.my_citizen_id());

-- Même raison que push_souscriptions_update : la route enregistre les
-- préférences par UPSERT (ON CONFLICT ... DO UPDATE).
DROP POLICY IF EXISTS preferences_notification_update ON preferences_notification;
CREATE POLICY preferences_notification_update ON preferences_notification FOR UPDATE
  USING (citoyen_id = app.my_citizen_id())
  WITH CHECK (citoyen_id = app.my_citizen_id());

GRANT SELECT, INSERT, UPDATE ON preferences_notification TO siipi_app;
REVOKE DELETE, TRUNCATE ON preferences_notification FROM siipi_app;

-- ---------------------------------------------------------------------------
-- Le journal d'envoi individuel — aussi l'historique « Mes notifications ».
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS notifications_citoyen (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id   TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    -- Conservé même si le citoyen est retiré ensuite : la ligne reste la
    -- preuve qu'un envoi a été tenté à une date donnée.
    citoyen_id   UUID REFERENCES citoyens(id) ON DELETE SET NULL,

    -- Pourquoi cet envoi a eu lieu, et vers quoi il pointe (un ticket ou une
    -- publication selon le type) — sans contrainte de clé étrangère, puisque
    -- la table référencée dépend du type.
    type         TEXT NOT NULL,
    reference_id UUID,

    canal        TEXT NOT NULL DEFAULT 'push',
    titre        TEXT NOT NULL,
    corps        TEXT NOT NULL,
    -- Libre, structuré : par exemple {"lien": "/reclamations/<id>"}. Sert à
    -- l'écran « Mes notifications » pour ouvrir la bonne page au clic, sans
    -- avoir à faire porter une colonne par usage futur.
    metadata     JSONB,

    lu           BOOLEAN NOT NULL DEFAULT false,

    statut       TEXT NOT NULL,
    -- Le détail de l'échec, pour un diagnostic — jamais affiché à un agent
    -- communal, seulement à la FNCT qui supervise le pipeline.
    erreur       TEXT,
    -- Nombre de tentatives, la première comprise. Une relance manuelle
    -- l'incrémente ; l'automatisme, lui, ne retente jamais (une seule
    -- tentative — voir l'en-tête de cette migration).
    tentatives   INTEGER NOT NULL DEFAULT 1,

    date_envoi   TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT notifications_type_valide CHECK (type IN
      ('decision_reclamation', 'invitation_sondage', 'notification_ciblee')),
    -- SMS et courriel restent hors de portée de la contrainte tant qu'aucun
    -- fournisseur n'est branché : une ligne qui prétendrait un envoi SMS
    -- réussi serait un mensonge que rien ne soutient encore.
    CONSTRAINT notifications_canal_valide CHECK (canal = 'push'),
    CONSTRAINT notifications_statut_valide CHECK (statut IN
      ('livre', 'echec', 'non_abonne', 'non_souhaite', 'sans_souscription')),
    CONSTRAINT notifications_tentatives_positives CHECK (tentatives >= 1)
);

CREATE INDEX IF NOT EXISTS idx_notifications_citoyen_commune
  ON notifications_citoyen (commune_id, date_envoi DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_citoyen_citoyen
  ON notifications_citoyen (citoyen_id, date_envoi DESC) WHERE citoyen_id IS NOT NULL;
-- Le compteur de non-lus se lit à chaque ouverture de l'application citoyenne :
-- un index partiel, restreint aux lignes qui comptent réellement pour lui.
CREATE INDEX IF NOT EXISTS idx_notifications_citoyen_non_lues
  ON notifications_citoyen (citoyen_id) WHERE NOT lu;

COMMENT ON TABLE notifications_citoyen IS
  'Une ligne par tentative d''envoi individuelle — MÊME quand rien n''a été envoyé (désabonné, préférence désactivée, aucun navigateur) : c''est l''historique "Mes notifications" du citoyen, qui doit refléter tout ce qui s''est passé. Lecture réservée à la FNCT, au citoyen concerné, et — pour une décision de réclamation seulement — à la commune qui l''a prise (voir l''en-tête de cette migration).';
COMMENT ON COLUMN notifications_citoyen.statut IS
  'livre : accepté par le service push du navigateur. echec : rejeté (endpoint expiré, etc.), consigné et non silencieux, relançable manuellement. non_abonne : le citoyen a désactivé les notifications (réglage global). non_souhaite : ce type précis est désactivé dans ses préférences. sans_souscription : opt-in mais aucun navigateur enregistré.';
COMMENT ON COLUMN notifications_citoyen.tentatives IS
  'La première tentative automatique compte pour 1. Une relance manuelle (agent, statut echec uniquement) l''incrémente — l''automatisme, lui, n''en fait jamais qu''une.';

ALTER TABLE notifications_citoyen ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications_citoyen FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_citoyen_select ON notifications_citoyen;
CREATE POLICY notifications_citoyen_select ON notifications_citoyen FOR SELECT
  USING (
    app.is_fnct()
    OR citoyen_id = app.my_citizen_id()
    -- Décision de réclamation SEULEMENT : la commune connaît déjà ce citoyen
    -- par le ticket qu'elle instruit (nom, téléphone déjà affichés) — cette
    -- ligne ne lui apprend rien de plus. Un envoi lié à une publication reste
    -- invisible : le voir reconstituerait qui se trouve dans un périmètre.
    OR (type = 'decision_reclamation' AND app.can_write_commune(commune_id))
  );

-- Écriture initiale : toujours déclenchée par un geste communal déjà autorisé
-- (accepter/refuser un ticket, envoyer une publication) — la même garde que
-- l'action qui la cause.
DROP POLICY IF EXISTS notifications_citoyen_insert ON notifications_citoyen;
CREATE POLICY notifications_citoyen_insert ON notifications_citoyen FOR INSERT
  WITH CHECK (app.can_write_commune(commune_id));

-- Deux mises à jour distinctes, deux publics distincts : le citoyen ne
-- touche jamais qu'à sa propre case "lu" (c'est ce que la route envoie, la
-- politique ne fait que borner LA LIGNE) ; une relance manuelle suit la même
-- règle de lecture qu'au-dessus — la commune ne relance que ses décisions de
-- réclamation, la FNCT peut relancer n'importe quoi.
DROP POLICY IF EXISTS notifications_citoyen_update_lu ON notifications_citoyen;
CREATE POLICY notifications_citoyen_update_lu ON notifications_citoyen FOR UPDATE
  USING (citoyen_id = app.my_citizen_id())
  WITH CHECK (citoyen_id = app.my_citizen_id());

DROP POLICY IF EXISTS notifications_citoyen_update_retry ON notifications_citoyen;
CREATE POLICY notifications_citoyen_update_retry ON notifications_citoyen FOR UPDATE
  USING (app.is_fnct() OR (type = 'decision_reclamation' AND app.can_write_commune(commune_id)))
  WITH CHECK (app.is_fnct() OR (type = 'decision_reclamation' AND app.can_write_commune(commune_id)));

GRANT SELECT, INSERT, UPDATE ON notifications_citoyen TO siipi_app;
REVOKE DELETE, TRUNCATE ON notifications_citoyen FROM siipi_app;

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
-- l'appelant (tickets.citizen_id). `abonne` distingue l'opt-out global (le
-- réglage historique `citoyens.notifications`) de `souhaite`, la préférence
-- fine pour CE type précis — les deux sont vérifiés, dans cet ordre, avant
-- de considérer qu'une souscription existe.
CREATE OR REPLACE FUNCTION app.souscriptions_citoyen(p_citoyen uuid, p_type text)
  RETURNS TABLE (abonne boolean, souhaite boolean, endpoint text, p256dh text, auth text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT c.notifications,
         COALESCE(p.active, true),
         s.endpoint, s.p256dh, s.auth
    FROM citoyens c
    LEFT JOIN preferences_notification p
           ON p.citoyen_id = c.id AND p.canal = 'push' AND p.type = p_type
    LEFT JOIN push_souscriptions s ON s.citoyen_id = c.id
   WHERE c.id = p_citoyen AND c.deleted_at IS NULL
$$;

COMMENT ON FUNCTION app.souscriptions_citoyen(uuid, text) IS
  'Réservée au service d''émission (notifications.ts) pour une notification 1-à-1 (décision de réclamation). Jamais exposée par une route.';

GRANT EXECUTE ON FUNCTION app.souscriptions_citoyen(uuid, text) TO siipi_app;

-- Le cas d'une publication : le même ciblage que app.compter_destinataires
-- (035), mais qui rend une ligne par citoyen visé — jamais un total. Le
-- résultat ne quitte le service d'émission pour nulle part d'autre.
CREATE OR REPLACE FUNCTION app.souscriptions_publication(p_publication uuid, p_type text)
  RETURNS TABLE (citoyen_id uuid, abonne boolean, souhaite boolean, endpoint text, p256dh text, auth text)
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
  SELECT v.id, v.notifications,
         COALESCE(p.active, true),
         s.endpoint, s.p256dh, s.auth
    FROM vises v
    LEFT JOIN preferences_notification p
           ON p.citoyen_id = v.id AND p.canal = 'push' AND p.type = p_type
    LEFT JOIN push_souscriptions s ON s.citoyen_id = v.id
$$;

COMMENT ON FUNCTION app.souscriptions_publication(uuid, text) IS
  'Réservée au service d''émission (notifications.ts) pour l''envoi réel d''une publication. Reproduit le ciblage de app.compter_destinataires (035) mais rend une ligne par citoyen visé, jamais un total : à ne JAMAIS exposer par une route.';

GRANT EXECUTE ON FUNCTION app.souscriptions_publication(uuid, text) TO siipi_app;
