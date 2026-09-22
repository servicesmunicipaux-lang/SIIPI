-- 023_flux_occasionnels.sql
--
-- Déchets verts et déchets de construction : le flux que la plateforme
-- ignorait.
--
-- Jusqu'ici tout le modèle reposait sur une hypothèse : un circuit passe, à
-- jour fixe, devant chez vous. C'est vrai du flux ménager. Ce n'est pas vrai
-- des déchets verts ni des déchets de démolition et construction (DDC), pour
-- lesquels il n'existe, sauf exception, AUCUN circuit dédié dans les communes
-- tunisiennes.
--
-- « DDC » est le terme de la nomenclature tunisienne, et c'est lui qui est
-- employé partout ici : « gravats » désigne, au sens strict, les seuls
-- débris pierreux, alors que la filière couvre aussi bétons, plâtres, bois de
-- coffrage et terres d'excavation. Un système national se parle avec les mots
-- de sa réglementation, sous peine de ne pas pouvoir échanger ses données
-- avec l'ANGeD.
--
-- Ce que fait réellement un citoyen qui taille sa haie ou refait sa salle de
-- bain :
--   1. il appelle la commune, qui enlève contre paiement ; ou
--   2. il s'adresse à un collecteur agréé par l'ANGeD, selon le type ; et
--   3. il ne recourt PLUS au collecteur informel — c'est désormais illégal.
--
-- Le troisième point est ce qui rend ce module urgent. Une interdiction sans
-- alternative visible n'est pas appliquée : elle est contournée. Si
-- l'application répond « aucun passage prévu » à quelqu'un qui a trois mètres
-- cubes de DDC devant sa porte, elle le renvoie mécaniquement vers la
-- filière qu'on vient de lui interdire. Donner à voir la filière légale n'est
-- pas un supplément de confort ; c'est la condition pour que l'interdiction
-- tienne.
--
-- Deux objets, donc :
--   1. l'annuaire des collecteurs agréés, tenu par chaque commune
--   2. la demande d'enlèvement adressée à la commune
--
-- =========================================================================
-- 1. Collecteurs agréés
--
-- Tenu par chaque commune pour son territoire. C'est le choix assumé : la
-- FNCT ne dispose pas de la liste ANGeD sous forme exploitable, et une
-- commune sait qui intervient réellement chez elle. Le prix en est connu —
-- doublons entre communes voisines, et un même collecteur décrit de deux
-- manières. La colonne agrement_anged est ce qui permettra, le jour venu, de
-- rapprocher ces saisies d'un référentiel national : c'est la seule clé
-- commune entre 350 saisies indépendantes, et c'est pour cela qu'elle est là
-- dès maintenant.
-- =========================================================================

CREATE TABLE IF NOT EXISTS collecteurs_agrees (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id        TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,

    raison_sociale    TEXT NOT NULL,
    -- Référence de l'agrément ANGeD. Facultative : une commune peut connaître
    -- un collecteur avant d'avoir son numéro sous les yeux, et exiger le
    -- numéro pour enregistrer reviendrait à n'avoir aucun annuaire.
    agrement_anged    TEXT,
    agrement_valide_jusqua DATE,

    -- Types pris en charge. Un collecteur de DDC ne ramasse pas les
    -- déchets verts : proposer au citoyen un numéro qui ne correspond pas à
    -- son besoin, c'est le renvoyer au collecteur informel au deuxième appel.
    types_dechets     TEXT[] NOT NULL DEFAULT ARRAY[]::text[],

    telephone         TEXT,
    email             TEXT,
    adresse           TEXT,
    zone_intervention TEXT,
    tarif_indicatif   TEXT,

    actif             BOOLEAN NOT NULL DEFAULT true,
    remarque          TEXT,

    created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at        TIMESTAMPTZ,
    deleted_by        UUID REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT collecteurs_types_valides
      CHECK (types_dechets <@ ARRAY['vert', 'ddc', 'encombrant', 'metal', 'autre']::text[])
);

CREATE INDEX IF NOT EXISTS idx_collecteurs_commune ON collecteurs_agrees (commune_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_collecteurs_types   ON collecteurs_agrees USING GIN (types_dechets);

COMMENT ON TABLE collecteurs_agrees IS
  'Annuaire des collecteurs agréés ANGeD, tenu par chaque commune pour son territoire. Contrepartie visible de l''interdiction du collecteur informel.';
COMMENT ON COLUMN collecteurs_agrees.agrement_anged IS
  'Référence de l''agrément ANGeD. Seule clé permettant de rapprocher un jour 350 annuaires communaux d''un référentiel national.';

-- =========================================================================
-- 2. Demande d'enlèvement
--
-- Le citoyen décrit et localise ; la commune répond avec un montant et une
-- date. La plateforme n'affiche AUCUN tarif de son propre chef : très peu de
-- communes disposent d'une grille officielle, et un prix affiché par le
-- système engagerait la commune sur un montant qu'elle n'a pas voté.
--
-- Le paiement reste hors plateforme — la commune enregistre ce qu'elle a
-- encaissé. Les colonnes sont toutefois posées dès maintenant pour qu'un
-- paiement en ligne (e-dinar, poste) puisse s'y greffer sans reprendre les
-- demandes déjà enregistrées.
-- =========================================================================

CREATE TABLE IF NOT EXISTS demandes_enlevement (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero            TEXT NOT NULL UNIQUE,
    commune_id        TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    citizen_id        UUID REFERENCES citoyens(id) ON DELETE SET NULL,

    type_dechet       TEXT NOT NULL
                        CHECK (type_dechet IN ('vert', 'ddc', 'encombrant', 'metal', 'autre')),
    -- Volume estimé par le citoyen, en mètres cubes. Une estimation de
    -- non-professionnel : elle sert à dimensionner la tournée, pas à facturer.
    volume_estime_m3  DOUBLE PRECISION,
    description       TEXT,
    photo_url         TEXT,

    adresse           TEXT,
    position          geometry(Point, 4326),
    -- Accessibilité du point d'enlèvement : une benne ne monte pas au
    -- troisième étage, et une ruelle de médina ne prend pas un camion-grue.
    -- Le savoir avant de se déplacer évite un aller-retour pour rien.
    acces             TEXT CHECK (acces IN ('rue', 'cour', 'etage', 'difficile')),

    statut            TEXT NOT NULL DEFAULT 'recue'
                        CHECK (statut IN ('recue', 'planifiee', 'realisee',
                                          'orientee_collecteur', 'refusee', 'annulee')),
    date_souhaitee    DATE,
    date_prevue       DATE,
    date_realisation  DATE,

    -- Réponse de la commune : montant annoncé, ou orientation vers un
    -- collecteur agréé quand elle ne prend pas ce type en charge.
    montant_dt        DOUBLE PRECISION,
    reponse_commune   TEXT,
    collecteur_id     UUID REFERENCES collecteurs_agrees(id) ON DELETE SET NULL,

    -- Paiement : hors plateforme aujourd'hui, mais tracé. paiement_reference
    -- accueillera l'identifiant d'une transaction en ligne le jour où elle
    -- existera, sans changer la forme de la table.
    paiement_statut   TEXT NOT NULL DEFAULT 'non_du'
                        CHECK (paiement_statut IN ('non_du', 'du', 'regle')),
    paiement_mode     TEXT CHECK (paiement_mode IN ('espece', 'en_ligne', 'virement', 'autre')),
    paiement_reference TEXT,
    paiement_le       TIMESTAMPTZ,

    traite_par        UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at        TIMESTAMPTZ,
    deleted_by        UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Un montant réglé sans montant annoncé n'a pas de sens : c'est de
    -- l'argent encaissé sans trace de ce qui le justifiait.
    CONSTRAINT demandes_paiement_coherent
      CHECK (paiement_statut <> 'regle' OR montant_dt IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_demandes_commune ON demandes_enlevement (commune_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_demandes_citoyen ON demandes_enlevement (citizen_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_demandes_statut  ON demandes_enlevement (commune_id, statut) WHERE deleted_at IS NULL;

COMMENT ON TABLE demandes_enlevement IS
  'Demande d''enlèvement occasionnel (déchets verts, déchets de démolition et construction, encombrants) adressée par un citoyen à sa commune. La commune répond par un montant et une date, ou oriente vers un collecteur agréé.';

-- Numérotation lisible, du même esprit que les réclamations : un numéro qu'on
-- peut citer au téléphone ou au guichet.
CREATE OR REPLACE FUNCTION app.numero_demande() RETURNS trigger
  LANGUAGE plpgsql AS
$fn$
BEGIN
  IF NEW.numero IS NULL OR NEW.numero = '' THEN
    NEW.numero := 'ENL-' || to_char(now(), 'YYYY') || '-' ||
                  lpad((floor(random() * 90000) + 10000)::int::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_numero_demande ON demandes_enlevement;
CREATE TRIGGER trg_numero_demande
  BEFORE INSERT ON demandes_enlevement
  FOR EACH ROW EXECUTE FUNCTION app.numero_demande();

-- =========================================================================
-- 3. Dépôt d'une demande par le citoyen
--
-- SECURITY DEFINER, comme l'enregistrement d'adresse : la fonction lit le
-- profil citoyen (table protégée) et n'écrit que pour le compte connecté.
-- L'identifiant du citoyen vient du contexte de session, jamais du client —
-- sinon n'importe qui déposerait une demande au nom d'un autre.
-- =========================================================================

CREATE OR REPLACE FUNCTION app.deposer_demande_enlevement(
    p_type text,
    p_volume double precision,
    p_description text,
    p_adresse text,
    p_lat double precision,
    p_lng double precision,
    p_acces text,
    p_date_souhaitee date,
    p_photo text
  )
  RETURNS TABLE (id uuid, numero text, commune_id text, statut text, created_at timestamptz)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS
$fn$
DECLARE
  v_citizen uuid;
  v_commune text;
  v_adresse text;
  v_id      uuid;
BEGIN
  v_citizen := app.my_citizen_id();
  IF v_citizen IS NULL THEN
    RAISE EXCEPTION 'PROFIL_CITOYEN_INTROUVABLE' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT c.commune_id, c.adresse INTO v_commune, v_adresse
    FROM citoyens c WHERE c.id = v_citizen;

  IF v_commune IS NULL THEN
    RAISE EXCEPTION 'ADRESSE_NON_RENSEIGNEE' USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO demandes_enlevement
    (commune_id, citizen_id, type_dechet, volume_estime_m3, description,
     adresse, position, acces, date_souhaitee, photo_url)
  VALUES
    (v_commune, v_citizen, p_type, p_volume, p_description,
     -- À défaut d'adresse saisie pour cette demande, celle du domicile : la
     -- plupart des enlèvements ont lieu devant chez soi.
     COALESCE(p_adresse, v_adresse),
     CASE WHEN p_lat IS NULL OR p_lng IS NULL THEN NULL
          ELSE ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326) END,
     p_acces, p_date_souhaitee, p_photo)
  RETURNING demandes_enlevement.id INTO v_id;

  RETURN QUERY
    SELECT d.id, d.numero, d.commune_id, d.statut, d.created_at
      FROM demandes_enlevement d WHERE d.id = v_id;
END;
$fn$;

GRANT EXECUTE ON FUNCTION app.deposer_demande_enlevement(
  text, double precision, text, text, double precision, double precision, text, date, text) TO siipi_app;

-- =========================================================================
-- 4. Cloisonnement
-- =========================================================================

ALTER TABLE collecteurs_agrees   ENABLE ROW LEVEL SECURITY;
ALTER TABLE collecteurs_agrees   FORCE  ROW LEVEL SECURITY;
ALTER TABLE demandes_enlevement  ENABLE ROW LEVEL SECURITY;
ALTER TABLE demandes_enlevement  FORCE  ROW LEVEL SECURITY;

-- L'annuaire d'une commune est lisible par TOUT utilisateur authentifié, et
-- pas seulement par ses habitants. C'est une entorse assumée au
-- cloisonnement : un collecteur agréé n'est pas une donnée opérationnelle
-- sensible, c'est un service public d'information. Une commune voisine qui
-- n'a pas encore fait son annuaire doit pouvoir voir celui d'à côté — c'est
-- ainsi qu'il se remplira. Les fiches désactivées, elles, restent chez leur
-- commune : un collecteur retiré de la liste ne doit pas continuer à
-- circuler.
DROP POLICY IF EXISTS collecteurs_select ON collecteurs_agrees;
CREATE POLICY collecteurs_select ON collecteurs_agrees FOR SELECT
  USING (
    deleted_at IS NULL
    AND app.is_authenticated()
    AND (actif OR app.can_read_commune(commune_id))
  );

DROP POLICY IF EXISTS collecteurs_insert ON collecteurs_agrees;
CREATE POLICY collecteurs_insert ON collecteurs_agrees FOR INSERT
  WITH CHECK (app.can_write_commune(commune_id));

DROP POLICY IF EXISTS collecteurs_update ON collecteurs_agrees;
CREATE POLICY collecteurs_update ON collecteurs_agrees FOR UPDATE
  USING (deleted_at IS NULL AND app.can_write_commune(commune_id))
  WITH CHECK (app.can_write_commune(commune_id));

-- Une demande d'enlèvement contient l'adresse précise d'un particulier, la
-- date à laquelle il attend un camion, et parfois une photo de sa cour. Elle
-- se lit strictement entre son auteur et sa commune.
--
-- On n'emploie PAS ici app.can_read_commune, qui inclut le prestataire privé
-- opérant dans la commune : ce serait ouvrir à une société privée le fichier
-- des adresses de tous les demandeurs, sans qu'aucune tâche le lui impose.
-- Le jour où une commune sous-traitera ces enlèvements, l'accès du
-- prestataire devra passer par une affectation explicite, demande par
-- demande — c'est-à-dire par une décision, pas par un effet de bord de son
-- rattachement (décret-loi 2022-54, principe de finalité).
DROP POLICY IF EXISTS demandes_select ON demandes_enlevement;
CREATE POLICY demandes_select ON demandes_enlevement FOR SELECT
  USING (
    deleted_at IS NULL
    AND (
      app.can_write_commune(commune_id)
      OR (app.current_role_name() = 'citoyen' AND citizen_id = app.my_citizen_id())
    )
  );

-- L'insertion passe par app.deposer_demande_enlevement pour un citoyen ; la
-- politique couvre la commune qui saisit une demande reçue au guichet ou par
-- téléphone — cas majoritaire au démarrage.
DROP POLICY IF EXISTS demandes_insert ON demandes_enlevement;
CREATE POLICY demandes_insert ON demandes_enlevement FOR INSERT
  WITH CHECK (app.can_write_commune(commune_id));

-- Seule la commune instruit. Le citoyen ne modifie pas sa demande après coup :
-- il en dépose une autre, et l'historique reste lisible.
DROP POLICY IF EXISTS demandes_update ON demandes_enlevement;
CREATE POLICY demandes_update ON demandes_enlevement FOR UPDATE
  USING (deleted_at IS NULL AND app.can_write_commune(commune_id))
  WITH CHECK (app.can_write_commune(commune_id));

REVOKE DELETE, TRUNCATE ON collecteurs_agrees, demandes_enlevement FROM siipi_app;
GRANT SELECT, INSERT, UPDATE ON collecteurs_agrees, demandes_enlevement TO siipi_app;

DROP TRIGGER IF EXISTS trg_audit_collecteurs ON collecteurs_agrees;
CREATE TRIGGER trg_audit_collecteurs AFTER INSERT OR UPDATE OR DELETE ON collecteurs_agrees
  FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement();

DROP TRIGGER IF EXISTS trg_audit_demandes ON demandes_enlevement;
CREATE TRIGGER trg_audit_demandes AFTER INSERT OR UPDATE OR DELETE ON demandes_enlevement
  FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement();

DROP TRIGGER IF EXISTS trg_collecteurs_updated_at ON collecteurs_agrees;
CREATE TRIGGER trg_collecteurs_updated_at BEFORE UPDATE ON collecteurs_agrees
  FOR EACH ROW EXECUTE FUNCTION zones_collecte_set_updated_at();

DROP TRIGGER IF EXISTS trg_demandes_updated_at ON demandes_enlevement;
CREATE TRIGGER trg_demandes_updated_at BEFORE UPDATE ON demandes_enlevement
  FOR EACH ROW EXECUTE FUNCTION zones_collecte_set_updated_at();

-- =========================================================================
-- 5. Suppression logique
-- =========================================================================

CREATE OR REPLACE FUNCTION app.lignes_supprimees()
  RETURNS TABLE (table_name text, record_id text, commune_id text,
                 deleted_at timestamptz, deleted_by uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$fn$
  WITH toutes AS (
    SELECT 'zones_collecte' AS t, z.id::text AS rid, z.commune_id, z.deleted_at, z.deleted_by FROM zones_collecte z WHERE z.deleted_at IS NOT NULL
    UNION ALL
    SELECT 'vehicules',            v.id::text, v.commune_id, v.deleted_at, v.deleted_by FROM vehicules            v WHERE v.deleted_at IS NOT NULL
    UNION ALL
    SELECT 'conteneurs',           c.id::text, c.commune_id, c.deleted_at, c.deleted_by FROM conteneurs           c WHERE c.deleted_at IS NOT NULL
    UNION ALL
    SELECT 'pesees_anged',         p.id::text, p.commune_id, p.deleted_at, p.deleted_by FROM pesees_anged         p WHERE p.deleted_at IS NOT NULL
    UNION ALL
    SELECT 'tickets',              k.id::text, k.commune_id, k.deleted_at, k.deleted_by FROM tickets              k WHERE k.deleted_at IS NOT NULL
    UNION ALL
    SELECT 'circuits',             q.id::text, q.commune_id, q.deleted_at, q.deleted_by FROM circuits             q WHERE q.deleted_at IS NOT NULL
    UNION ALL
    SELECT 'controles_terrain',    o.id::text, o.commune_id, o.deleted_at, o.deleted_by FROM controles_terrain    o WHERE o.deleted_at IS NOT NULL
    UNION ALL
    SELECT 'declarations_passage', d.id::text, d.commune_id, d.deleted_at, d.deleted_by FROM declarations_passage d WHERE d.deleted_at IS NOT NULL
    UNION ALL
    SELECT 'incidents',            i.id::text, i.commune_id, i.deleted_at, i.deleted_by FROM incidents            i WHERE i.deleted_at IS NOT NULL
    UNION ALL
    SELECT 'annonces_collecte',    a.id::text, a.commune_id, a.deleted_at, a.deleted_by FROM annonces_collecte    a WHERE a.deleted_at IS NOT NULL
    UNION ALL
    SELECT 'collecteurs_agrees',   g.id::text, g.commune_id, g.deleted_at, g.deleted_by FROM collecteurs_agrees   g WHERE g.deleted_at IS NOT NULL
    UNION ALL
    SELECT 'demandes_enlevement',  e.id::text, e.commune_id, e.deleted_at, e.deleted_by FROM demandes_enlevement  e WHERE e.deleted_at IS NOT NULL
  )
  SELECT t, rid, commune_id, deleted_at, deleted_by
    FROM toutes
   WHERE app.is_fnct()
      OR (app.current_role_name() = 'admin_commune' AND commune_id = app.current_commune())
   ORDER BY deleted_at DESC;
$fn$;

GRANT EXECUTE ON FUNCTION app.lignes_supprimees() TO siipi_app;

CREATE OR REPLACE FUNCTION app.supprimer(p_table text, p_id text)
  RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS
$fn$
DECLARE
  v_commune text;
BEGIN
  IF p_table NOT IN ('users', 'vehicules', 'conteneurs', 'tickets',
                     'pesees_anged', 'zones_collecte', 'barbechas',
                     'five_axis_scores', 'circuits', 'controles_terrain',
                     'declarations_passage', 'incidents', 'annonces_collecte',
                     'collecteurs_agrees', 'demandes_enlevement') THEN
    RAISE EXCEPTION 'TABLE_NON_SUPPRIMABLE: %', p_table;
  END IF;

  EXECUTE format('SELECT commune_id FROM %I WHERE id::text = $1 AND deleted_at IS NULL', p_table)
     INTO v_commune USING p_id;

  IF v_commune IS NULL THEN
    RETURN false;
  END IF;

  IF NOT app.can_write_commune(v_commune) THEN
    RAISE EXCEPTION 'ACCES_REFUSE' USING ERRCODE = 'insufficient_privilege';
  END IF;

  EXECUTE format('UPDATE %I SET deleted_at = now(), deleted_by = $2 WHERE id::text = $1', p_table)
    USING p_id, app.current_user_id();

  RETURN true;
END;
$fn$;

GRANT EXECUTE ON FUNCTION app.supprimer(text, text) TO siipi_app;
