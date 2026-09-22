-- ============================================================================
-- 035_module5_communication_ciblee.sql
--
-- Module 5 — Communication & relation citoyen : le socle de ciblage.
--
-- POURQUOI UNE SEULE TABLE POUR TROIS CHOSES. Le cahier des charges décrit
-- trois fonctions séparées — sondages (5.2), projets (5.3), notifications
-- ciblées (5.4). Elles font toutes les trois exactement la même chose :
-- publier quelque chose vers les citoyens d'un périmètre. Trois tables
-- auraient donné trois façons de dessiner un périmètre, trois façons de
-- compter les destinataires, et trois occasions de se tromper. Le périmètre
-- est écrit une fois ; ce qu'on y publie change.
--
-- CE QUE LE DÉCOUPAGE PERMET RÉELLEMENT. La base connaît deux choses sur le
-- domicile d'un citoyen : un point (`citoyens.position`) et la zone de
-- collecte qui le contient (`citoyens.zone_id`). Le ciblage s'appuie sur les
-- deux, mais PAS de la même façon selon ce qu'on vise — voir la fonction
-- app.destinataires() plus bas, où ce choix est expliqué ligne à ligne.
--
-- CE QUE L'ADMINISTRATEUR NE VOIT JAMAIS. Le nombre de destinataires, oui.
-- La liste, non. Un agent communal n'a aucun besoin opérationnel de savoir
-- QUI habite dans le polygone qu'il vient de dessiner : il a besoin de savoir
-- COMBIEN, pour juger si son message part au bon endroit. Les fonctions de
-- ce module rendent des comptes, jamais des noms ni des positions
-- (décret-loi n° 2022-54).
--
-- CE QUE LA COMMUNE DOIT SAVOIR, ET QU'ON LUI DIT. Un citoyen sans adresse
-- enregistrée n'est dans aucun périmètre géographique. Il existe, il a un
-- compte, et il ne recevra rien. Ce nombre est rendu à côté du nombre de
-- destinataires, parce qu'une commune qui croit toucher tout le monde alors
-- qu'un tiers de ses inscrits n'a pas d'adresse prend une décision sur un
-- chiffre faux.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Le type de foyer, que la base ne connaissait pas.
--
--    Le cahier des charges demande un ciblage « par type (ménage, commerce) ».
--    Rien dans `citoyens` ne le portait. On l'ajoute ici, facultatif : un
--    citoyen qui ne l'a pas renseigné reste joignable par tout ciblage qui ne
--    filtre pas sur le type — l'absence d'information ne doit pas l'exclure.
-- ----------------------------------------------------------------------------

ALTER TABLE citoyens ADD COLUMN IF NOT EXISTS type_foyer TEXT;

ALTER TABLE citoyens DROP CONSTRAINT IF EXISTS citoyens_type_foyer_valide;
ALTER TABLE citoyens ADD  CONSTRAINT citoyens_type_foyer_valide CHECK (
  type_foyer IS NULL OR type_foyer IN ('menage', 'commerce', 'administration', 'industrie'));

COMMENT ON COLUMN citoyens.type_foyer IS
  'Nature du point desservi, déclarée par le citoyen. Facultative : ne pas la connaître n''exclut jamais d''un ciblage, seule une exclusion explicite le fait.';

-- ----------------------------------------------------------------------------
-- 2. La publication : le socle commun.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS publications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id      TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    type            TEXT NOT NULL,        -- sondage | projet | notification

    titre_fr        TEXT NOT NULL,
    titre_ar        TEXT,
    contenu_fr      TEXT,
    contenu_ar      TEXT,

    -- --- Le périmètre ------------------------------------------------------
    perimetre_type  TEXT NOT NULL DEFAULT 'commune',  -- commune | zones | circuits | polygone
    zone_ids        UUID[],
    circuit_ids     UUID[],
    perimetre       geometry(MultiPolygon, 4326),
    cible_types     TEXT[],               -- NULL = tous les types de foyer

    -- --- Le cycle de vie ---------------------------------------------------
    statut          TEXT NOT NULL DEFAULT 'brouillon', -- brouillon | publiee | close | archivee
    date_debut      DATE,
    date_fin        DATE,
    publiee_le      TIMESTAMPTZ,
    publiee_par     UUID REFERENCES users(id) ON DELETE SET NULL,

    -- --- Propre aux projets ------------------------------------------------
    projet_nature   TEXT,                 -- communal | associatif
    projet_etat     TEXT,                 -- en_preparation | actif | termine
    visible_citoyen BOOLEAN NOT NULL DEFAULT true,

    -- --- Marquage des contenus d'essai -------------------------------------
    --
    -- Un sondage d'exemple qu'un élu prendrait pour une consultation réelle
    -- est un incident, pas une gêne. Le drapeau est en base, pas seulement
    -- dans l'intitulé : l'interface s'en sert pour l'afficher comme tel, et
    -- la publication vers les citoyens le refuse (voir le déclencheur).
    est_exemple     BOOLEAN NOT NULL DEFAULT false,

    cree_par        UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT publications_type_valide CHECK (type IN ('sondage', 'projet', 'notification')),
    CONSTRAINT publications_statut_valide CHECK (statut IN ('brouillon', 'publiee', 'close', 'archivee')),
    CONSTRAINT publications_perimetre_type_valide CHECK (perimetre_type IN ('commune', 'zones', 'circuits', 'polygone')),
    CONSTRAINT publications_projet_nature_valide CHECK (
      projet_nature IS NULL OR projet_nature IN ('communal', 'associatif')),
    CONSTRAINT publications_projet_etat_valide CHECK (
      projet_etat IS NULL OR projet_etat IN ('en_preparation', 'actif', 'termine')),
    CONSTRAINT publications_periode_coherente CHECK (
      date_fin IS NULL OR date_debut IS NULL OR date_fin >= date_debut),

    -- Un périmètre doit être renseigné conformément à son type. Sans cela, un
    -- ciblage « zones » aux zone_ids vides toucherait zéro personne en
    -- silence, et l'agent croirait avoir envoyé son message.
    CONSTRAINT publications_perimetre_renseigne CHECK (
      CASE perimetre_type
        WHEN 'commune'  THEN true
        WHEN 'zones'    THEN zone_ids    IS NOT NULL AND cardinality(zone_ids)    > 0
        WHEN 'circuits' THEN circuit_ids IS NOT NULL AND cardinality(circuit_ids) > 0
        WHEN 'polygone' THEN perimetre   IS NOT NULL
      END),

    -- Les champs de projet n'ont de sens que sur un projet.
    CONSTRAINT publications_champs_projet CHECK (
      type = 'projet' OR (projet_nature IS NULL AND projet_etat IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_publications_commune_type
  ON publications (commune_id, type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_publications_statut
  ON publications (commune_id, statut) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_publications_perimetre
  ON publications USING GIST (perimetre);

COMMENT ON TABLE publications IS
  'Socle commun aux sondages, projets et notifications ciblées : un contenu bilingue, un périmètre, un cycle de vie. Trois tables auraient donné trois façons de dessiner un périmètre et trois occasions de se tromper.';
COMMENT ON COLUMN publications.est_exemple IS
  'Contenu de démonstration. Ne peut pas être publié vers les citoyens : un sondage d''exemple pris pour une consultation réelle est un incident, pas une gêne.';
COMMENT ON COLUMN publications.cible_types IS
  'Types de foyer visés. NULL = tous, y compris ceux qui n''ont pas renseigné leur type — ne pas savoir n''exclut pas.';

-- ----------------------------------------------------------------------------
-- 3. Ce qui ne peut pas partir vers les citoyens.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.controler_publication() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.statut = 'publiee' AND NEW.est_exemple THEN
    RAISE EXCEPTION 'PUBLICATION_EXEMPLE'
      USING ERRCODE = 'check_violation',
            HINT = 'Un contenu marqué « exemple » ne peut pas être publié vers les citoyens. Retirez le marquage si ce contenu est réel.';
  END IF;

  -- Les zones et circuits cités doivent appartenir à la commune. Un périmètre
  -- qui désigne le secteur d'une autre commune ne toucherait personne, et
  -- l'agent n'en saurait rien.
  IF NEW.perimetre_type = 'zones' AND EXISTS (
       SELECT 1 FROM unnest(NEW.zone_ids) z(id)
        WHERE NOT EXISTS (SELECT 1 FROM zones_collecte zc
                           WHERE zc.id = z.id AND zc.commune_id = NEW.commune_id
                             AND zc.deleted_at IS NULL)) THEN
    RAISE EXCEPTION 'ZONE_HORS_COMMUNE'
      USING ERRCODE = 'check_violation',
            HINT = 'Une des zones visées n''appartient pas à cette commune.';
  END IF;

  IF NEW.perimetre_type = 'circuits' AND EXISTS (
       SELECT 1 FROM unnest(NEW.circuit_ids) c(id)
        WHERE NOT EXISTS (SELECT 1 FROM circuits ci
                           WHERE ci.id = c.id AND ci.commune_id = NEW.commune_id
                             AND ci.deleted_at IS NULL)) THEN
    RAISE EXCEPTION 'CIRCUIT_HORS_COMMUNE'
      USING ERRCODE = 'check_violation',
            HINT = 'Un des circuits visés n''appartient pas à cette commune.';
  END IF;

  -- Publier, c'est dater. Sans horodatage, l'historique ne vaut rien.
  IF NEW.statut = 'publiee' AND NEW.publiee_le IS NULL THEN
    NEW.publiee_le := now();
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_publications_controle ON publications;
CREATE TRIGGER trg_publications_controle
  BEFORE INSERT OR UPDATE ON publications
  FOR EACH ROW EXECUTE FUNCTION app.controler_publication();

-- ----------------------------------------------------------------------------
-- 4. Les trois usages du socle.
-- ----------------------------------------------------------------------------

-- 4.1 — Le questionnaire (5.2)

CREATE TABLE IF NOT EXISTS sondage_questions (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    publication_id UUID NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
    ordre          SMALLINT NOT NULL DEFAULT 1,
    libelle_fr     TEXT NOT NULL,
    libelle_ar     TEXT,
    type           TEXT NOT NULL DEFAULT 'choix_unique',
    -- Les réponses proposées, dans les deux langues. Un tableau plutôt qu'une
    -- table : une option n'existe pas hors de sa question, et on ne s'y réfère
    -- jamais de l'extérieur.
    options_fr     TEXT[],
    options_ar     TEXT[],
    obligatoire    BOOLEAN NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT sondage_question_type_valide CHECK (type IN ('choix_unique', 'choix_multiple', 'texte', 'note')),
    -- Une question à choix sans choix n'est pas une question.
    CONSTRAINT sondage_question_options_coherentes CHECK (
      type NOT IN ('choix_unique', 'choix_multiple')
      OR (options_fr IS NOT NULL AND cardinality(options_fr) >= 2)),
    -- Deux langues, deux listes de même longueur, sinon l'arabophone voit
    -- des options décalées d'un cran par rapport à ce qu'il croit cocher.
    CONSTRAINT sondage_question_options_alignees CHECK (
      options_ar IS NULL OR options_fr IS NULL
      OR cardinality(options_ar) = cardinality(options_fr))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sondage_question_ordre
  ON sondage_questions (publication_id, ordre);

COMMENT ON CONSTRAINT sondage_question_options_alignees ON sondage_questions IS
  'Les listes FR et AR doivent avoir la même longueur : décalées d''un cran, l''arabophone ne coche pas ce qu''il croit cocher, et le dépouillement est faux sans que personne ne le voie.';

CREATE TABLE IF NOT EXISTS sondage_reponses (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id    UUID NOT NULL REFERENCES sondage_questions(id) ON DELETE CASCADE,
    publication_id UUID NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
    citoyen_id     UUID REFERENCES citoyens(id) ON DELETE SET NULL,
    -- La zone au moment de la réponse. Fige le découpage tel qu'il était :
    -- un redécoupage six mois plus tard ne doit pas réécrire l'origine
    -- géographique des réponses déjà données.
    zone_id        UUID REFERENCES zones_collecte(id) ON DELETE SET NULL,
    choix          SMALLINT[],
    texte          TEXT,
    note           SMALLINT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT sondage_reponse_note_bornee CHECK (note IS NULL OR note BETWEEN 0 AND 10)
);

-- Un citoyen répond une fois par question. Les réponses anonymes (citoyen_id
-- nul après suppression du compte) échappent à la règle : elles restent au
-- dépouillement, sans plus désigner personne.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sondage_reponse_unique
  ON sondage_reponses (question_id, citoyen_id) WHERE citoyen_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sondage_reponse_publication ON sondage_reponses (publication_id);

COMMENT ON TABLE sondage_reponses IS
  'Réponses aux sondages. La suppression d''un compte citoyen détache la réponse (citoyen_id devient NULL) au lieu de l''effacer : le dépouillement d''une consultation close ne doit pas changer parce que quelqu''un s''est désinscrit.';
COMMENT ON COLUMN sondage_reponses.zone_id IS
  'Zone du répondant au moment de la réponse. Figée : un redécoupage ultérieur ne doit pas réécrire l''origine géographique de réponses déjà données.';

-- 4.2 — Les documents d'un projet (5.3)

CREATE TABLE IF NOT EXISTS publication_documents (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    publication_id UUID NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
    nom            TEXT NOT NULL,
    url            TEXT NOT NULL,
    type_mime      TEXT,
    taille_octets  INTEGER,
    depose_par     UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT publication_document_taille_positive CHECK (
      taille_octets IS NULL OR taille_octets > 0)
);

CREATE INDEX IF NOT EXISTS idx_publication_documents ON publication_documents (publication_id);

COMMENT ON TABLE publication_documents IS
  'Pièces jointes d''un projet. Ne porte qu''une URL : le stockage des fichiers sur volume disque reste à câbler, et cette table sera prête quand il le sera.';

-- 4.3 — L'historique des envois (5.4)
--
-- Ce que le cahier des charges demande : « date, périmètre, nombre de
-- destinataires ». Pas la liste — et c'est la bonne lecture. Un envoi se
-- justifie par son périmètre et son volume ; savoir nominativement qui a reçu
-- quoi ne sert aucune opération et constitue un fichier de destinataires.

CREATE TABLE IF NOT EXISTS envois_notification (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    publication_id      UUID NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
    commune_id          TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    canal               TEXT NOT NULL DEFAULT 'push',
    destinataires       INTEGER NOT NULL,
    -- Combien étaient dans le périmètre mais n'ont pas été joints, et pourquoi.
    -- Une commune qui croit toucher tout le monde prend ses décisions sur un
    -- chiffre faux.
    sans_adresse        INTEGER NOT NULL DEFAULT 0,
    desabonnes          INTEGER NOT NULL DEFAULT 0,
    perimetre_resume    TEXT,
    envoye_par          UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT envoi_canal_valide CHECK (canal IN ('push', 'sms', 'email')),
    CONSTRAINT envoi_comptes_positifs CHECK (
      destinataires >= 0 AND sans_adresse >= 0 AND desabonnes >= 0)
);

CREATE INDEX IF NOT EXISTS idx_envois_publication ON envois_notification (publication_id);
CREATE INDEX IF NOT EXISTS idx_envois_commune ON envois_notification (commune_id, created_at DESC);

COMMENT ON TABLE envois_notification IS
  'Traçabilité des envois : date, périmètre, volumes. Jamais la liste des destinataires — un envoi se justifie par son périmètre et son volume ; la liste nominative ne sert aucune opération et constitue un fichier de destinataires.';

-- ----------------------------------------------------------------------------
-- 5. Qui est dans le périmètre.
--
-- LE CHOIX QUI COMPTE, ET POURQUOI. Deux façons de dire qu'un citoyen est
-- « dans » un périmètre :
--
--   • par sa ZONE (`citoyens.zone_id`) — ce que la commune a elle-même
--     découpé, et ce que le citoyen sait de lui-même : « j'habite le secteur
--     Chate2 ». Stable dans le temps.
--   • par son POINT (`citoyens.position`) — précis au mètre, mais c'est la
--     position d'un domicile.
--
-- On se sert du point UNIQUEMENT quand l'agent a dessiné un polygone, parce
-- qu'alors il n'existe aucune autre façon de répondre : le polygone qu'il
-- vient de tracer ne correspond à aucune zone du découpage. Pour tout le
-- reste — commune entière, zones, circuits — on interroge `zone_id`, qui
-- suffit et n'exige pas de relire les coordonnées de chaque domicile.
--
-- Ce n'est pas de la prudence décorative : `citoyens.position` est
-- explicitement documentée comme donnée à caractère personnel, et une
-- fonction qui la balaie à chaque notification est une fonction qu'on finira
-- par appeler pour autre chose.
--
-- CE QUE LA FONCTION REND. Trois nombres, jamais une liste :
--   joignables    — recevront le message
--   sans_adresse  — inscrits dans la commune, sans domicile renseigné : hors
--                   de tout périmètre géographique, invisibles au ciblage
--   desabonnes    — dans le périmètre, mais ont refusé les notifications
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.compter_destinataires(
    p_commune        text,
    p_perimetre_type text,
    p_zone_ids       uuid[]    DEFAULT NULL,
    p_circuit_ids    uuid[]    DEFAULT NULL,
    p_perimetre      geometry  DEFAULT NULL,
    p_cible_types    text[]    DEFAULT NULL
  )
  RETURNS TABLE (
    joignables   integer,
    sans_adresse integer,
    desabonnes   integer
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  WITH inscrits AS (
    SELECT c.id, c.zone_id, c.position, c.notifications, c.type_foyer
      FROM citoyens c
     WHERE c.commune_id = p_commune
       AND c.deleted_at IS NULL
  ),
  vises AS (
    SELECT i.*,
           CASE p_perimetre_type
             WHEN 'commune'  THEN true
             WHEN 'zones'    THEN i.zone_id = ANY (p_zone_ids)
             -- Un circuit n'a pas de contour : il dessert une zone. On passe
             -- donc par la zone du circuit, ce qui est aussi la façon dont la
             -- commune en parle — « la tournée du secteur 3 ».
             WHEN 'circuits' THEN i.zone_id IN (
                                    SELECT ci.zone_id FROM circuits ci
                                     WHERE ci.id = ANY (p_circuit_ids)
                                       AND ci.zone_id IS NOT NULL)
             WHEN 'polygone' THEN i.position IS NOT NULL
                                  AND ST_Contains(p_perimetre, i.position)
             ELSE false
           END AS dans_perimetre,
           -- Ne pas avoir renseigné son type n'exclut pas : l'absence
           -- d'information n'est pas une réponse négative.
           (p_cible_types IS NULL
            OR i.type_foyer IS NULL
            OR i.type_foyer = ANY (p_cible_types)) AS du_bon_type
      FROM inscrits i
  )
  SELECT
    count(*) FILTER (WHERE dans_perimetre AND du_bon_type AND notifications)::integer,
    -- « Sans adresse » n'a de sens que pour un ciblage géographique : sur la
    -- commune entière, personne n'est écarté faute d'adresse.
    CASE WHEN p_perimetre_type = 'commune' THEN 0
         ELSE count(*) FILTER (WHERE zone_id IS NULL AND position IS NULL)::integer
    END,
    count(*) FILTER (WHERE dans_perimetre AND du_bon_type AND NOT notifications)::integer
    FROM vises
$$;

COMMENT ON FUNCTION app.compter_destinataires(text, text, uuid[], uuid[], geometry, text[]) IS
  'Combien de citoyens un périmètre touche — et combien il rate. Rend trois nombres, jamais une liste : un agent communal a besoin de savoir COMBIEN pour juger si son message part au bon endroit, jamais QUI.';

GRANT EXECUTE ON FUNCTION app.compter_destinataires(text, text, uuid[], uuid[], geometry, text[]) TO siipi_app;

-- Le même décompte, pour une publication déjà enregistrée.
CREATE OR REPLACE FUNCTION app.destinataires_publication(p_publication uuid)
  RETURNS TABLE (joignables integer, sans_adresse integer, desabonnes integer)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT d.* FROM publications p
    CROSS JOIN LATERAL app.compter_destinataires(
      p.commune_id, p.perimetre_type, p.zone_ids, p.circuit_ids, p.perimetre, p.cible_types) d
   WHERE p.id = p_publication AND p.deleted_at IS NULL
$$;

GRANT EXECUTE ON FUNCTION app.destinataires_publication(uuid) TO siipi_app;

-- ----------------------------------------------------------------------------
-- 6. Ce que le citoyen voit.
--
-- Le miroir exact du ciblage, côté citoyen, et rien de plus : il voit les
-- publications de SA commune dont le périmètre le contient. Il ne voit ni les
-- brouillons, ni les exemples, ni ce qui n'a pas encore commencé ou qui est
-- terminé — ni, pour les projets, ceux que la commune n'a pas rendus visibles.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.publications_citoyen(p_type text DEFAULT NULL)
  RETURNS TABLE (
    id           uuid,
    type         text,
    titre_fr     text,
    titre_ar     text,
    contenu_fr   text,
    contenu_ar   text,
    date_debut   date,
    date_fin     date,
    projet_etat  text,
    publiee_le   timestamptz,
    a_repondu    boolean
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT p.id, p.type, p.titre_fr, p.titre_ar, p.contenu_fr, p.contenu_ar,
         p.date_debut, p.date_fin, p.projet_etat, p.publiee_le,
         EXISTS (SELECT 1 FROM sondage_reponses r
                  WHERE r.publication_id = p.id AND r.citoyen_id = app.my_citizen_id())
    FROM publications p
    JOIN citoyens c ON c.id = app.my_citizen_id()
   WHERE p.commune_id = c.commune_id
     AND p.deleted_at IS NULL
     AND p.statut = 'publiee'
     AND NOT p.est_exemple
     AND (p_type IS NULL OR p.type = p_type)
     AND (p.type <> 'projet' OR p.visible_citoyen)
     AND (p.date_debut IS NULL OR p.date_debut <= CURRENT_DATE)
     AND (p.date_fin   IS NULL OR p.date_fin   >= CURRENT_DATE)
     AND CASE p.perimetre_type
           WHEN 'commune'  THEN true
           WHEN 'zones'    THEN c.zone_id = ANY (p.zone_ids)
           WHEN 'circuits' THEN c.zone_id IN (SELECT ci.zone_id FROM circuits ci
                                               WHERE ci.id = ANY (p.circuit_ids)
                                                 AND ci.zone_id IS NOT NULL)
           WHEN 'polygone' THEN c.position IS NOT NULL
                                AND ST_Contains(p.perimetre, c.position)
           ELSE false
         END
     AND (p.cible_types IS NULL OR c.type_foyer IS NULL OR c.type_foyer = ANY (p.cible_types))
   ORDER BY p.publiee_le DESC NULLS LAST
$$;

COMMENT ON FUNCTION app.publications_citoyen(text) IS
  'Le miroir exact du ciblage, côté citoyen. SECURITY DEFINER : le citoyen n''a pas le droit de lire la table des publications (il y verrait les brouillons de sa commune), mais il a le droit de savoir ce qui s''adresse à lui.';

GRANT EXECUTE ON FUNCTION app.publications_citoyen(text) TO siipi_app;

-- ----------------------------------------------------------------------------
-- 7. Le dépouillement.
--
-- Rendu par question et par option, avec le compte des réponses. Aucune
-- réponse individuelle n'en sort : le résultat d'un sondage est un agrégat,
-- et le lire autrement serait lire l'opinion de quelqu'un.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.depouillement_sondage(p_publication uuid)
  RETURNS TABLE (
    question_id   uuid,
    ordre         smallint,
    libelle_fr    text,
    libelle_ar    text,
    type          text,
    option_rang   integer,
    option_fr     text,
    option_ar     text,
    reponses      bigint,
    note_moyenne  numeric
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT q.id, q.ordre, q.libelle_fr, q.libelle_ar, q.type,
         o.rang,
         CASE WHEN o.rang IS NOT NULL THEN q.options_fr[o.rang] END,
         CASE WHEN o.rang IS NOT NULL AND q.options_ar IS NOT NULL THEN q.options_ar[o.rang] END,
         CASE
           WHEN q.type IN ('choix_unique', 'choix_multiple')
             THEN (SELECT count(*) FROM sondage_reponses r
                    WHERE r.question_id = q.id AND o.rang = ANY (r.choix))
           ELSE (SELECT count(*) FROM sondage_reponses r WHERE r.question_id = q.id)
         END,
         CASE WHEN q.type = 'note'
              THEN (SELECT round(avg(r.note), 2) FROM sondage_reponses r
                     WHERE r.question_id = q.id AND r.note IS NOT NULL)
         END
    FROM sondage_questions q
    LEFT JOIN LATERAL (
      SELECT generate_series(1, cardinality(q.options_fr)) AS rang
       WHERE q.options_fr IS NOT NULL
    ) o ON true
   WHERE q.publication_id = p_publication
   ORDER BY q.ordre, o.rang
$$;

COMMENT ON FUNCTION app.depouillement_sondage(uuid) IS
  'Résultat d''un sondage, par question et par option. Aucune réponse individuelle n''en sort : le résultat d''une consultation est un agrégat, et le lire autrement serait lire l''opinion de quelqu''un.';

GRANT EXECUTE ON FUNCTION app.depouillement_sondage(uuid) TO siipi_app;

-- ----------------------------------------------------------------------------
-- 8. RLS — même règle que partout.
--
-- Une nuance propre à ce module : le citoyen doit pouvoir DÉPOSER une réponse
-- de sondage sans pour autant lire la table des publications. Les deux droits
-- sont séparés : lecture par la fonction SECURITY DEFINER ci-dessus, écriture
-- par une politique qui ne l'autorise qu'à écrire pour lui-même.
-- ----------------------------------------------------------------------------

ALTER TABLE publications           ENABLE ROW LEVEL SECURITY;
ALTER TABLE publications           FORCE  ROW LEVEL SECURITY;
ALTER TABLE sondage_questions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sondage_questions      FORCE  ROW LEVEL SECURITY;
ALTER TABLE sondage_reponses       ENABLE ROW LEVEL SECURITY;
ALTER TABLE sondage_reponses       FORCE  ROW LEVEL SECURITY;
ALTER TABLE publication_documents  ENABLE ROW LEVEL SECURITY;
ALTER TABLE publication_documents  FORCE  ROW LEVEL SECURITY;
ALTER TABLE envois_notification    ENABLE ROW LEVEL SECURITY;
ALTER TABLE envois_notification    FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS publications_select ON publications;
CREATE POLICY publications_select ON publications FOR SELECT
  USING (app.is_fnct() OR app.can_write_commune(commune_id));

DROP POLICY IF EXISTS publications_ecriture ON publications;
CREATE POLICY publications_ecriture ON publications FOR ALL
  USING      (app.can_write_commune(commune_id))
  WITH CHECK (app.can_write_commune(commune_id));

DROP POLICY IF EXISTS sondage_questions_select ON sondage_questions;
CREATE POLICY sondage_questions_select ON sondage_questions FOR SELECT
  USING (EXISTS (SELECT 1 FROM publications p
                  WHERE p.id = publication_id
                    AND (app.is_fnct() OR app.can_write_commune(p.commune_id))));

DROP POLICY IF EXISTS sondage_questions_ecriture ON sondage_questions;
CREATE POLICY sondage_questions_ecriture ON sondage_questions FOR ALL
  USING      (EXISTS (SELECT 1 FROM publications p
                       WHERE p.id = publication_id AND app.can_write_commune(p.commune_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM publications p
                       WHERE p.id = publication_id AND app.can_write_commune(p.commune_id)));

-- La commune lit les réponses de ses propres sondages ; le citoyen lit les
-- siennes. Personne d'autre.
DROP POLICY IF EXISTS sondage_reponses_select ON sondage_reponses;
CREATE POLICY sondage_reponses_select ON sondage_reponses FOR SELECT
  USING (citoyen_id = app.my_citizen_id()
         OR EXISTS (SELECT 1 FROM publications p
                     WHERE p.id = publication_id
                       AND (app.is_fnct() OR app.can_write_commune(p.commune_id))));

-- Le citoyen n'écrit que pour lui-même. `WITH CHECK` seul : il ne doit pas
-- pouvoir modifier une réponse déposée par quelqu'un d'autre, ni en déposer
-- une au nom d'un tiers.
DROP POLICY IF EXISTS sondage_reponses_depot ON sondage_reponses;
CREATE POLICY sondage_reponses_depot ON sondage_reponses FOR INSERT
  WITH CHECK (citoyen_id = app.my_citizen_id());

DROP POLICY IF EXISTS publication_documents_select ON publication_documents;
CREATE POLICY publication_documents_select ON publication_documents FOR SELECT
  USING (EXISTS (SELECT 1 FROM publications p
                  WHERE p.id = publication_id
                    AND (app.is_fnct() OR app.can_write_commune(p.commune_id))));

DROP POLICY IF EXISTS publication_documents_ecriture ON publication_documents;
CREATE POLICY publication_documents_ecriture ON publication_documents FOR ALL
  USING      (EXISTS (SELECT 1 FROM publications p
                       WHERE p.id = publication_id AND app.can_write_commune(p.commune_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM publications p
                       WHERE p.id = publication_id AND app.can_write_commune(p.commune_id)));

DROP POLICY IF EXISTS envois_select ON envois_notification;
CREATE POLICY envois_select ON envois_notification FOR SELECT
  USING (app.is_fnct() OR app.can_write_commune(commune_id));

DROP POLICY IF EXISTS envois_ecriture ON envois_notification;
CREATE POLICY envois_ecriture ON envois_notification FOR ALL
  USING      (app.can_write_commune(commune_id))
  WITH CHECK (app.can_write_commune(commune_id));

GRANT SELECT, INSERT, UPDATE ON publications, sondage_questions,
                                publication_documents, envois_notification TO siipi_app;
GRANT SELECT, INSERT          ON sondage_reponses TO siipi_app;
REVOKE DELETE, TRUNCATE       ON publications, sondage_questions, sondage_reponses,
                                publication_documents, envois_notification FROM siipi_app;

-- ----------------------------------------------------------------------------
-- 9. Ce que ce module fait apparaître d'incohérent.
--
-- Deux branches ajoutées à app.incoherences_commune, dans un domaine nouveau.
-- Elles ne portent pas sur des contradictions entre registres, cette fois,
-- mais sur des messages qui ne parviendront à personne — la forme de panne la
-- plus silencieuse qui soit : l'agent a fait son travail, l'écran n'a rien
-- dit, et le message n'est jamais arrivé.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.incoherences_communication(p_commune text)
  RETURNS TABLE (
    gravite     text,
    domaine     text,
    sujet       text,
    sujet_id    text,
    constat     text,
    quoi_faire  text
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  -- 1. Une publication en ligne qui ne touche personne.
  SELECT 'bloquant', 'communication', p.titre_fr, p.id::text,
         'Publiée, mais son périmètre ne contient aucun citoyen inscrit.',
         'Élargir le périmètre, ou vérifier que les citoyens de ce secteur ont renseigné leur adresse.'
    FROM publications p
    CROSS JOIN LATERAL app.destinataires_publication(p.id) d
   WHERE p.commune_id = p_commune AND p.deleted_at IS NULL
     AND p.statut = 'publiee' AND NOT p.est_exemple
     AND d.joignables = 0

  UNION ALL

  -- 2. Beaucoup d'inscrits sans adresse : le ciblage géographique est aveugle
  --    pour eux, quoi qu'on fasse.
  SELECT 'avertissement', 'communication', 'Adresses citoyennes', p_commune,
         format('%s citoyen(s) inscrit(s) sur %s n''ont pas d''adresse : aucun ciblage par secteur ne les atteint.',
                count(*) FILTER (WHERE c.zone_id IS NULL AND c.position IS NULL),
                count(*)),
         'Inviter les citoyens à renseigner leur adresse, ou publier vers la commune entière.'
    FROM citoyens c
   WHERE c.commune_id = p_commune AND c.deleted_at IS NULL
  HAVING count(*) > 0
     AND count(*) FILTER (WHERE c.zone_id IS NULL AND c.position IS NULL) * 4 > count(*)

  UNION ALL

  -- 3. Un sondage clos que personne n'a dépouillé — sans réponse aucune.
  SELECT 'information', 'communication', p.titre_fr, p.id::text,
         'Sondage terminé sans aucune réponse.',
         'Vérifier le périmètre retenu et la période : un sondage sans réponse n''informe sur rien.'
    FROM publications p
   WHERE p.commune_id = p_commune AND p.deleted_at IS NULL
     AND p.type = 'sondage' AND NOT p.est_exemple
     AND (p.statut = 'close' OR (p.date_fin IS NOT NULL AND p.date_fin < CURRENT_DATE))
     AND NOT EXISTS (SELECT 1 FROM sondage_reponses r WHERE r.publication_id = p.id)

  ORDER BY 1, 3
$$;

COMMENT ON FUNCTION app.incoherences_communication(text) IS
  'Les messages qui ne parviendront à personne. La panne la plus silencieuse qui soit : l''agent a fait son travail, l''écran n''a rien dit, et rien n''est arrivé.';

GRANT EXECUTE ON FUNCTION app.incoherences_communication(text) TO siipi_app;


-- ----------------------------------------------------------------------------
-- 10. Une seule porte pour « ce qui ne colle pas ».
--
-- LE PROBLÈME QUE CETTE SECTION RÈGLE. À chaque module, des contrôles
-- s'ajoutent : circuits et parc en 033, personnel en 034, communication ici.
-- Jusqu'à présent, chacun s'entassait dans le corps d'une seule fonction qu'il
-- fallait recopier en entier pour y ajouter trois lignes. Au troisième module,
-- c'est la garantie qu'un jour une branche disparaîtra dans une recopie.
--
-- On sépare donc :
--   app.incoherences_registres()     — les douze contrôles de 033 et 034,
--                                      inchangés, simplement renommés
--   app.incoherences_communication() — les trois de ce module
--   app.incoherences_commune()       — l'union des deux, et rien d'autre
--
-- Le prochain module ajoutera SA fonction et UNE ligne à l'union. Il n'aura
-- rien à recopier, donc rien à perdre.
--
-- Le panneau « À vérifier » du constat du matin lit app.incoherences_commune :
-- il montre désormais les trois domaines sans qu'une ligne du front change.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.incoherences_registres(p_commune text)
  RETURNS TABLE (
    gravite     text,
    domaine     text,   -- circuits | parc | personnel
    sujet       text,
    sujet_id    text,
    constat     text,
    quoi_faire  text
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  -- 1. Un circuit confié à un engin qui ne roule pas.
  SELECT 'bloquant', 'circuits', c.nom, c.id::text,
         format('L''engin %s (%s) est déclaré %s à l''inventaire.',
                v.registration, v.marque,
                CASE v.etat WHEN 'en_panne' THEN 'en panne'
                            WHEN 'a_reformer' THEN 'en panne, à réformer'
                            ELSE 'réformé' END),
         'Vérifier quel engin assure réellement ce circuit, ou suspendre le circuit.'
    FROM circuits c
    JOIN vehicules v ON v.id = c.vehicule_id
   WHERE c.commune_id = p_commune AND c.deleted_at IS NULL AND c.actif
     AND v.deleted_at IS NULL AND v.etat <> 'en_service'

  UNION ALL

  -- 2. Une immatriculation citée par un circuit, introuvable au parc.
  SELECT 'avertissement', 'circuits', c.nom, c.id::text,
         format('L''immatriculation %s ne correspond à aucun engin du parc.', c.vehicule_immat),
         'Corriger l''immatriculation au registre des circuits, ou inscrire l''engin à l''inventaire.'
    FROM circuits c
   WHERE c.commune_id = p_commune AND c.deleted_at IS NULL AND c.actif
     AND c.vehicule_immat IS NOT NULL AND btrim(c.vehicule_immat) <> ''
     AND c.vehicule_id IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM vehicules v
        WHERE v.commune_id = p_commune AND v.deleted_at IS NULL
          AND regexp_replace(v.registration, '\D', '', 'g')
              = regexp_replace(c.vehicule_immat, '\D', '', 'g'))

  UNION ALL

  -- 3. Un circuit actif sans aucun arrêt enregistré.
  SELECT 'information', 'circuits', c.nom, c.id::text,
         'Aucun point de collecte enregistré.',
         'Importer la trace et les points, ou saisir au moins les arrêts principaux.'
    FROM circuits c
   WHERE c.commune_id = p_commune AND c.deleted_at IS NULL AND c.actif
     AND NOT EXISTS (SELECT 1 FROM points_collecte pc WHERE pc.circuit_id = c.id)

  UNION ALL

  -- 4. Un engin immobilisé sans motif écrit.
  SELECT 'avertissement', 'parc', v.registration, v.id::text,
         'Engin immobilisé sans motif renseigné.',
         'Indiquer la panne ou la raison de l''immobilisation.'
    FROM vehicules v
   WHERE v.commune_id = p_commune AND v.deleted_at IS NULL
     AND v.etat IN ('en_panne', 'a_reformer')
     AND (v.motif_immobilisation IS NULL OR btrim(v.motif_immobilisation) = '')

  UNION ALL

  -- 5. Un engin immobilisé dont on ignore depuis quand.
  SELECT 'information', 'parc', v.registration, v.id::text,
         'Engin immobilisé sans date de début.',
         'Dater l''immobilisation : sans cela, la durée d''arrêt ne peut pas être suivie.'
    FROM vehicules v
   WHERE v.commune_id = p_commune AND v.deleted_at IS NULL
     AND v.etat IN ('en_panne', 'a_reformer') AND v.etat_depuis IS NULL

  UNION ALL

  -- 6. Un engin en état de marche que personne n'a affecté.
  SELECT 'information', 'parc', v.registration, v.id::text,
         'Engin en service affecté à aucun circuit.',
         'Affecter l''engin, ou noter son emploi réel (réserve, appui, atelier).'
    FROM vehicules v
   WHERE v.commune_id = p_commune AND v.deleted_at IS NULL
     AND v.etat = 'en_service' AND v.type <> 'remorque'
     AND NOT EXISTS (SELECT 1 FROM circuits c
                      WHERE c.deleted_at IS NULL AND c.actif
                        AND (c.vehicule_id = v.id
                             OR regexp_replace(COALESCE(c.vehicule_immat, ''), '\D', '', 'g')
                                = regexp_replace(v.registration, '\D', '', 'g')))

  UNION ALL

  -- 7. Un circuit actif sans exécutant NI engin.
  SELECT 'avertissement', 'circuits', c.nom, c.id::text,
         'Ni exécutant ni engin renseignés.',
         'Désigner la régie ou un prestataire, et l''engin affecté.'
    FROM circuits c
   WHERE c.commune_id = p_commune AND c.deleted_at IS NULL AND c.actif
     AND c.prestataire_id IS NULL AND c.vehicule_id IS NULL
     AND (c.vehicule_code IS NULL OR btrim(c.vehicule_code) = '')

  UNION ALL

  -- 8. Un circuit en régie sans personne affectée.
  --    Bloquant : la tournée est censée partir, et le registre ne dit pas
  --    qui la fait. C'est l'écart que le dossier de Dar Chaabane laisse
  --    ouvert — deux feuilles du registre annoncent 48 et 39 agents, la
  --    paie en compte 60. Aucun des trois chiffres ne dit QUI fait QUOI.
  SELECT 'bloquant', 'personnel', c.nom, c.id::text,
         'Circuit en régie sans aucun agent affecté.',
         'Affecter l''équipe, ou indiquer le prestataire qui exécute le circuit.'
    FROM circuits c
   WHERE c.commune_id = p_commune AND c.deleted_at IS NULL AND c.actif
     AND c.prestataire_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM circuit_equipe ce
                      WHERE ce.circuit_id = c.id AND ce.date_fin IS NULL)

  UNION ALL

  -- 9. Un circuit motorisé sans chauffeur désigné.
  SELECT 'avertissement', 'personnel', c.nom, c.id::text,
         'Équipe affectée, mais aucun chauffeur désigné.',
         'Désigner le chauffeur : c''est lui qui répond de l''engin.'
    FROM circuits c
   WHERE c.commune_id = p_commune AND c.deleted_at IS NULL AND c.actif
     AND c.prestataire_id IS NULL
     AND (c.vehicule_id IS NOT NULL
          OR (c.vehicule_immat IS NOT NULL AND btrim(c.vehicule_immat) <> ''))
     AND EXISTS (SELECT 1 FROM circuit_equipe ce
                  WHERE ce.circuit_id = c.id AND ce.date_fin IS NULL)
     AND NOT EXISTS (SELECT 1 FROM circuit_equipe ce
                      WHERE ce.circuit_id = c.id AND ce.date_fin IS NULL
                        AND ce.role = 'chauffeur')

  UNION ALL

  -- 10. L'équipe affectée ne correspond pas à la taille annoncée à la fiche.
  --     Information seulement : la fiche peut être en retard sur le terrain,
  --     ou l'inverse. On ne préjuge pas de laquelle des deux a raison.
  SELECT 'information', 'personnel', c.nom, c.id::text,
         format('Fiche : équipe de %s. Affectés : %s.', c.taille_equipe, e.n),
         'Mettre la fiche à jour, ou compléter l''équipe.'
    FROM circuits c
    JOIN LATERAL (SELECT count(*) AS n FROM circuit_equipe ce
                   WHERE ce.circuit_id = c.id AND ce.date_fin IS NULL) e ON true
   WHERE c.commune_id = p_commune AND c.deleted_at IS NULL AND c.actif
     AND c.taille_equipe IS NOT NULL AND c.taille_equipe > 0
     AND e.n > 0 AND e.n <> c.taille_equipe

  UNION ALL

  -- 11. Deux circuits dont les HORAIRES se chevauchent pour le même agent.
  --     Un agent peut servir deux secteurs le même jour — matin puis
  --     après-midi, comme le camion 02 214 147. Il ne peut pas être aux deux
  --     endroits à la même heure.
  SELECT 'bloquant', 'personnel', p.nom_complet, p.id::text,
         format('Affecté à « %s » (%s-%s) et à « %s » (%s-%s) : les horaires se chevauchent.',
                c1.nom, c1.heure_depart, c1.heure_fin,
                c2.nom, c2.heure_depart, c2.heure_fin),
         'Corriger l''une des deux affectations, ou ajuster les horaires des circuits.'
    FROM circuit_equipe a
    JOIN circuit_equipe b ON b.personnel_id = a.personnel_id AND b.circuit_id > a.circuit_id
                         AND b.date_fin IS NULL
    JOIN circuits  c1 ON c1.id = a.circuit_id
    JOIN circuits  c2 ON c2.id = b.circuit_id
    JOIN personnel p  ON p.id  = a.personnel_id
   WHERE a.date_fin IS NULL
     AND p.commune_id = p_commune AND p.deleted_at IS NULL AND p.actif
     AND c1.deleted_at IS NULL AND c1.actif
     AND c2.deleted_at IS NULL AND c2.actif
     AND c1.heure_depart IS NOT NULL AND c1.heure_fin IS NOT NULL
     AND c2.heure_depart IS NOT NULL AND c2.heure_fin IS NOT NULL
     AND c1.jours_passage && c2.jours_passage
     AND (c1.heure_depart, c1.heure_fin) OVERLAPS (c2.heure_depart, c2.heure_fin)

  UNION ALL

  -- 12. Un chauffeur affecté qui n'a pas de permis enregistré.
  SELECT 'information', 'personnel', p.nom_complet, p.id::text,
         'Désigné chauffeur, aucune catégorie de permis enregistrée.',
         'Saisir les catégories détenues : c''est ce qui dit qui peut conduire quel engin.'
    FROM personnel p
   WHERE p.commune_id = p_commune AND p.deleted_at IS NULL AND p.actif
     AND (p.permis IS NULL OR cardinality(p.permis) = 0)
     AND EXISTS (SELECT 1 FROM circuit_equipe ce
                  WHERE ce.personnel_id = p.id AND ce.date_fin IS NULL
                    AND ce.role = 'chauffeur')

  ORDER BY 1, 2, 3
$$;

COMMENT ON FUNCTION app.incoherences_registres(text) IS
  'Les douze contrôles qui recoupent les registres : circuits, parc, personnel. Appelée par app.incoherences_commune, jamais directement par l''API.';

GRANT EXECUTE ON FUNCTION app.incoherences_registres(text) TO siipi_app;

CREATE OR REPLACE FUNCTION app.incoherences_commune(p_commune text)
  RETURNS TABLE (
    gravite     text,
    domaine     text,
    sujet       text,
    sujet_id    text,
    constat     text,
    quoi_faire  text
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  -- L'ordre est celui de la GRAVITÉ, pas celui de l'alphabet.
  --
  -- Jusqu'ici le tri portait sur la colonne texte : « avertissement » passait
  -- donc AVANT « bloquant », et le plus grave arrivait au milieu de la liste.
  -- Sur un panneau que le chef de service parcourt en trente secondes le
  -- matin, c'est exactement l'inverse de ce qu'il faut.
  SELECT gravite, domaine, sujet, sujet_id, constat, quoi_faire
    FROM (
      SELECT * FROM app.incoherences_registres(p_commune)
      UNION ALL
      SELECT * FROM app.incoherences_communication(p_commune)
    ) tout
   ORDER BY CASE gravite WHEN 'bloquant' THEN 0
                         WHEN 'avertissement' THEN 1
                         ELSE 2 END,
            domaine, sujet
$$;

COMMENT ON FUNCTION app.incoherences_commune(text) IS
  'Tout ce qui ne colle pas dans une commune, tous domaines confondus. Union de fonctions par domaine : le prochain module ajoute la sienne et une ligne ici, sans rien recopier. Ne corrige rien — une plateforme qui nettoierait ces écarts seule ferait disparaître le seul signal disponible sur la qualité des données.';

GRANT EXECUTE ON FUNCTION app.incoherences_commune(text) TO siipi_app;
