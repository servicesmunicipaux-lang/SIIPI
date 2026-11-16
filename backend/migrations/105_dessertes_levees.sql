-- ============================================================================
-- 105 — Jalon G, lot G5a : les dessertes et les levées des établissements
--
-- Décisions de Nacer du 12 novembre 2026 (G5, n° 1 à 6) :
--
--   * LA DESSERTE est datée : un établissement est relié à un point d'arrêt d'un
--     circuit, du … au … ; une seule à la fois par établissement. « Desservi » se
--     CALCULE : la desserte qui couvre le jour. La fin du circuit, le retrait du
--     point ou du circuit l'arrêtent aussi — c'est calculé, aucune date n'est
--     réécrite (app.fin_desserte). Un établissement sans circuit n'a pas de
--     desserte (forfait ou apport volontaire).
--
--   * LA LEVÉE constatée d'un établissement desservi : la commune la saisit au
--     portail, et elle est VALIDÉE D'EMBLÉE (c'est elle qui décide) ; le
--     prestataire du circuit la PROPOSE ; un export Kobo s'importe en
--     PROPOSITIONS. La commune valide une proposition ou l'écarte avec un motif.
--     Une levée validée ne s'efface jamais : elle s'annule avec un motif. Une
--     proposition écartée reste en base.
--
--   * Ce qu'une levée porte et ce que la base refuse tient en UNE fonction,
--     app._examiner_levee, utilisée par le déclencheur, par la validation et par
--     l'aperçu de l'import : établissement de la commune, jour passé, établissement
--     ouvert ce jour-là, desserte du jour, circuit de la desserte, voyage du
--     circuit, convention signée en vigueur ce jour-là, flux de ses termes en
--     vigueur ce jour-là (app.termes_convention), aucune autre levée du même flux
--     au même voyage le même jour. La convention et le conteneur se DÉDUISENT : le
--     non-chevauchement des conventions (G4a) n'en laisse qu'une par jour.
--
--   * Le prestataire, pour ses seuls circuits, voit la feuille du jour
--     (app.feuille_levees) : établissements desservis, point, conteneur, flux et
--     levées par semaine — jamais la convention, son tarif ni un montant. Il ne
--     lit pas la table des levées : il passe par la feuille, et propose par
--     app.enregistrer_levees, comme la commune saisit et importe. Pour lui, ce qui
--     n'est pas sur sa feuille est INTROUVABLE (404) : une levée qu'il propose ne
--     lui apprend rien d'une convention. La FNCT lit, n'écrit rien.
--
--   * Une même levée physique ne se compte qu'une fois : l'unicité porte sur
--     l'établissement, le flux, le jour et le voyage, pas sur la convention (une
--     résiliation antidatée suivie d'une convention nouvelle ne rouvre pas la
--     case). Les écritures d'une commune passent sous un même verrou consultatif.
--
-- LA PLATEFORME CONSTATE : une levée validée qu'un avenant, une résiliation ou un
-- circuit écourté laissent ensuite hors des termes ou hors de la desserte n'est ni
-- effacée ni corrigée ; elle est signalée « à revoir » (app.levee_a_revoir).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Les dessertes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dessertes_commerces (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id    TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    commerce_id   UUID NOT NULL REFERENCES commerces(id) ON DELETE CASCADE,
    circuit_id    UUID NOT NULL REFERENCES circuits(id) ON DELETE CASCADE,
    point_id      UUID NOT NULL REFERENCES points_collecte(id) ON DELETE CASCADE,
    date_debut    DATE NOT NULL,
    date_fin      DATE,
    observation   TEXT,
    saisi_par     UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    provenance    TEXT NOT NULL DEFAULT 'reel',
    deleted_at    TIMESTAMPTZ,
    deleted_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT dessertes_periode CHECK (date_debut >= DATE '2000-01-01' AND (date_fin IS NULL OR date_fin >= date_debut)),
    CONSTRAINT dessertes_observation CHECK (observation IS NULL OR length(observation) <= 1000),
    CONSTRAINT dessertes_provenance CHECK (provenance IN ('reel', 'simule'))
);
CREATE INDEX IF NOT EXISTS idx_dessertes_commerce ON dessertes_commerces (commerce_id, date_debut) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_dessertes_circuit ON dessertes_commerces (circuit_id, date_debut) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_dessertes_commune ON dessertes_commerces (commune_id) WHERE deleted_at IS NULL;

-- La période effective d'une desserte : elle commence au plus tôt avec le circuit,
-- et finit à la plus proche de sa propre fin, de la fin du circuit, du jour (de
-- Tunis) du retrait du point ou du circuit — ce jour-là compris —, avec sa raison
-- (NULL : sans fin). Une seule définition, pour la feuille, les contrôles et
-- l'écran. Elle lit le point et le circuit même retirés (d'où SECURITY DEFINER :
-- sous les droits du directeur, la politique de lecture les cacherait, et la
-- desserte paraîtrait ouverte), et ne rend rien hors du périmètre de l'appelant.
-- Une desserte que la fin du circuit ou le retrait du point a arrêtée reste ouverte
-- en base : l'écran la dit « à clôturer », la commune la clôt (rien n'est réécrit).
CREATE OR REPLACE FUNCTION app.fin_desserte(p_desserte uuid)
  RETURNS TABLE (debut date, fin date, raison text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT GREATEST(d.date_debut, c.date_debut), f.fin, f.raison
    FROM dessertes_commerces d
    JOIN circuits c ON c.id = d.circuit_id
    JOIN points_collecte p ON p.id = d.point_id
    LEFT JOIN LATERAL (
      SELECT x.fin, x.raison
        FROM (VALUES
          (d.date_fin, 'date', 1),
          (c.date_fin, 'circuit_echu', 2),
          ((c.deleted_at AT TIME ZONE 'Africa/Tunis')::date, 'circuit_retire', 3),
          ((p.deleted_at AT TIME ZONE 'Africa/Tunis')::date, 'point_retire', 4)
        ) AS x(fin, raison, rang)
       WHERE x.fin IS NOT NULL
       ORDER BY x.fin, x.rang
       LIMIT 1
    ) f ON true
   WHERE d.id = p_desserte
     AND (app.can_write_commune(d.commune_id) OR d.circuit_id = ANY (app.mes_circuits()))
$$;
REVOKE ALL ON FUNCTION app.fin_desserte(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fin_desserte(uuid) TO siipi_app;

-- La desserte vivante d'un établissement qui couvre un jour (au plus une : le
-- non-chevauchement le tient). Interne : appelée par les fonctions qui ont déjà
-- vérifié le périmètre.
CREATE OR REPLACE FUNCTION app._desserte_a_la_date(p_commerce uuid, p_date date)
  RETURNS TABLE (desserte_id uuid, circuit_id uuid, point_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT d.id, d.circuit_id, d.point_id
    FROM dessertes_commerces d
    JOIN circuits c ON c.id = d.circuit_id
    JOIN points_collecte p ON p.id = d.point_id
   WHERE d.commerce_id = p_commerce
     AND d.deleted_at IS NULL
     AND GREATEST(d.date_debut, c.date_debut) <= p_date
     AND p_date <= LEAST(COALESCE(d.date_fin, 'infinity'::date), COALESCE(c.date_fin, 'infinity'::date),
                         COALESCE((c.deleted_at AT TIME ZONE 'Africa/Tunis')::date, 'infinity'::date),
                         COALESCE((p.deleted_at AT TIME ZONE 'Africa/Tunis')::date, 'infinity'::date))
   ORDER BY d.date_debut DESC
   LIMIT 1
$$;
REVOKE ALL ON FUNCTION app._desserte_a_la_date(uuid, date) FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.controler_desserte()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_commerce  record;
  v_point     record;
  v_circuit   record;
  v_autre     record;
  v_derniere  date;
BEGIN
  -- Le périmètre d'abord : hors de lui, rien n'existe (un refus renseignerait).
  IF NOT app.peut_emettre_document(NEW.commune_id) THEN
    RAISE EXCEPTION 'DESSERTE_HORS_PERIMETRE' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF to_jsonb(NEW) = to_jsonb(OLD) THEN
      RETURN NEW;
    END IF;
    IF NEW.commune_id IS DISTINCT FROM OLD.commune_id OR NEW.commerce_id IS DISTINCT FROM OLD.commerce_id
       OR NEW.circuit_id IS DISTINCT FROM OLD.circuit_id OR NEW.point_id IS DISTINCT FROM OLD.point_id
       OR NEW.date_debut IS DISTINCT FROM OLD.date_debut OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.saisi_par IS DISTINCT FROM OLD.saisi_par THEN
      RAISE EXCEPTION 'DESSERTE_FIGEE: une desserte ne change ni d''établissement, ni de point, ni de début ; clôturez-la et ouvrez-en une autre.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'DESSERTE_FIGEE: une desserte retirée ne se modifie plus.' USING ERRCODE = 'check_violation';
    END IF;
    -- Retirée : seulement si aucune levée ne s'y rattache ; sinon elle se clôt.
    IF NEW.deleted_at IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM levees l WHERE l.desserte_id = NEW.id) THEN
        RAISE EXCEPTION 'DESSERTE_LEVEES: des levées s''y rattachent ; une desserte qui a servi se clôt (date de fin), elle ne se retire pas.'
          USING ERRCODE = 'check_violation';
      END IF;
      RETURN NEW;
    END IF;
    NEW.updated_at := now();
    IF NEW.date_fin IS NOT DISTINCT FROM OLD.date_fin THEN
      RETURN NEW;
    END IF;
  END IF;

  -- L'établissement, verrouillé : deux dessertes posées en même temps se suivent.
  SELECT c.id, c.commune_id, c.statut, c.ferme_le, c.nom INTO v_commerce
    FROM commerces c WHERE c.id = NEW.commerce_id AND c.deleted_at IS NULL FOR UPDATE;
  IF v_commerce.id IS NULL OR v_commerce.commune_id <> NEW.commune_id THEN
    RAISE EXCEPTION 'DESSERTE_HORS_PERIMETRE' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'DESSERTE_FIGEE: une desserte naît vivante.' USING ERRCODE = 'check_violation';
    END IF;
    IF v_commerce.statut = 'ferme' AND v_commerce.ferme_le <= NEW.date_debut THEN
      RAISE EXCEPTION 'ETABLISSEMENT_FERME: « % » est fermé depuis le % : il n''est plus desservi.',
        v_commerce.nom, to_char(v_commerce.ferme_le, 'DD/MM/YYYY') USING ERRCODE = 'check_violation';
    END IF;
    SELECT p.id, p.commune_id, p.circuit_id, p.type, p.deleted_at INTO v_point
      FROM points_collecte p WHERE p.id = NEW.point_id;
    IF v_point.id IS NULL OR v_point.commune_id <> NEW.commune_id OR v_point.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'DESSERTE_POINT: ce point d''arrêt n''existe pas (ou plus) dans la commune ; choisissez un point vivant du circuit.'
        USING ERRCODE = 'check_violation';
    END IF;
    -- Un repère de tournée, ou un point noir, n'est pas un arrêt où l'on vide un bac.
    IF v_point.type IN ('centre_transfert', 'parc_municipal', 'debut_collecte', 'fin_collecte', 'point_noir') THEN
      RAISE EXCEPTION 'DESSERTE_POINT_TYPE: ce point est un repère de tournée (début, fin, centre de transfert, parc) ou un point noir, pas un arrêt où l''on lève un bac ; choisissez un arrêt.'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.circuit_id := v_point.circuit_id;
    SELECT c.id, c.nom, c.date_debut, c.date_fin, c.deleted_at INTO v_circuit FROM circuits c WHERE c.id = NEW.circuit_id;
    IF v_circuit.id IS NULL OR v_circuit.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'DESSERTE_POINT: le circuit de ce point est retiré ; choisissez un point d''un circuit en service.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.date_debut < v_circuit.date_debut OR (v_circuit.date_fin IS NOT NULL AND NEW.date_debut > v_circuit.date_fin) THEN
      RAISE EXCEPTION 'DESSERTE_CIRCUIT_PERIODE: le circuit « % » court du % au % : la desserte commence dans cette période.',
        v_circuit.nom, to_char(v_circuit.date_debut, 'DD/MM/YYYY'), COALESCE(to_char(v_circuit.date_fin, 'DD/MM/YYYY'), '…')
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.saisi_par := app.current_user_id();
    NEW.created_at := now();
    NEW.updated_at := now();
  ELSE
    -- Une fin ne passe jamais avant une levée déjà rattachée (proposée ou validée).
    SELECT max(l.date_levee) INTO v_derniere
      FROM levees l WHERE l.desserte_id = NEW.id AND l.statut IN ('proposee', 'validee');
    IF NEW.date_fin IS NOT NULL AND v_derniere IS NOT NULL AND NEW.date_fin < v_derniere THEN
      RAISE EXCEPTION 'DESSERTE_LEVEES_APRES: une levée du % s''y rattache ; la desserte finit au plus tôt ce jour-là (annulez ou écartez d''abord les levées d''après).',
        to_char(v_derniere, 'DD/MM/YYYY') USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Une seule desserte à la fois par établissement, sur les dates ENREGISTRÉES : une
  -- desserte que le retrait de son point a arrêtée se clôt d'abord (l'écran propose
  -- sa fin effective), puis la suivante s'ouvre le lendemain. Comparer aux fins
  -- calculées laisserait deux dessertes se rouvrir ensemble si le circuit était
  -- prolongé ensuite.
  SELECT d.date_debut, d.date_fin, c.nom AS circuit INTO v_autre
    FROM dessertes_commerces d JOIN circuits c ON c.id = d.circuit_id
   WHERE d.commerce_id = NEW.commerce_id AND d.deleted_at IS NULL AND d.id <> NEW.id
     AND d.date_debut <= COALESCE(NEW.date_fin, 'infinity'::date)
     AND NEW.date_debut <= COALESCE(d.date_fin, 'infinity'::date)
   ORDER BY d.date_debut LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'DESSERTE_CHEVAUCHEMENT: « % » est déjà desservi par le circuit « % » du % au % ; clôturez cette desserte avant d''en ouvrir une autre.',
      v_commerce.nom, v_autre.circuit, to_char(v_autre.date_debut, 'DD/MM/YYYY'), COALESCE(to_char(v_autre.date_fin, 'DD/MM/YYYY'), '…')
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_controler_desserte ON dessertes_commerces;
CREATE TRIGGER trg_controler_desserte BEFORE INSERT OR UPDATE ON dessertes_commerces
  FOR EACH ROW EXECUTE FUNCTION app.controler_desserte();

-- ---------------------------------------------------------------------------
-- 2. Les imports Kobo des levées : le journal et la correspondance gardée
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS imports_levees (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id         TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    nom_fichier        TEXT NOT NULL,
    empreinte_fichier  TEXT NOT NULL,
    correspondance     JSONB NOT NULL,
    nb_proposees       INTEGER NOT NULL,
    nb_deja_recues     INTEGER NOT NULL,
    nb_erreurs         INTEGER NOT NULL,
    saisi_par          UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    provenance         TEXT NOT NULL DEFAULT 'reel',
    deleted_at         TIMESTAMPTZ,
    deleted_by         UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT imports_levees_nom CHECK (length(btrim(nom_fichier)) BETWEEN 1 AND 255),
    CONSTRAINT imports_levees_empreinte CHECK (empreinte_fichier ~ '^[0-9a-f]{64}$'),
    CONSTRAINT imports_levees_correspondance CHECK (jsonb_typeof(correspondance) = 'object'),
    CONSTRAINT imports_levees_comptes CHECK (nb_proposees >= 1 AND nb_deja_recues >= 0 AND nb_erreurs >= 0),
    CONSTRAINT imports_levees_provenance CHECK (provenance IN ('reel', 'simule'))
);
CREATE INDEX IF NOT EXISTS idx_imports_levees_commune ON imports_levees (commune_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_import_journalise ON imports_levees;
CREATE TRIGGER trg_import_journalise BEFORE UPDATE ON imports_levees
  FOR EACH ROW EXECUTE FUNCTION app.refuser_modification_import();

CREATE TABLE IF NOT EXISTS modeles_import_levees (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id      TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    correspondance  JSONB NOT NULL,
    saisi_par       UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    provenance      TEXT NOT NULL DEFAULT 'reel',
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT modeles_import_levees_correspondance CHECK (jsonb_typeof(correspondance) = 'object'),
    CONSTRAINT modeles_import_levees_provenance CHECK (provenance IN ('reel', 'simule'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_modeles_import_levees ON modeles_import_levees (commune_id) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Les levées
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS levees (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id        TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    convention_id     UUID NOT NULL REFERENCES conventions_commerciales(id) ON DELETE CASCADE,
    commerce_id       UUID NOT NULL REFERENCES commerces(id) ON DELETE CASCADE,
    desserte_id       UUID NOT NULL REFERENCES dessertes_commerces(id) ON DELETE CASCADE,
    circuit_id        UUID NOT NULL REFERENCES circuits(id) ON DELETE CASCADE,
    point_id          UUID NOT NULL REFERENCES points_collecte(id) ON DELETE CASCADE,
    flux_code         TEXT NOT NULL,
    conteneur_id      TEXT REFERENCES conteneurs(id),
    date_levee        DATE NOT NULL,
    heure_levee       TIME,
    voyage            SMALLINT NOT NULL,
    source            TEXT NOT NULL,
    cle_envoi         TEXT NOT NULL,
    statut            TEXT NOT NULL DEFAULT 'proposee',
    propose_par       UUID REFERENCES users(id) ON DELETE SET NULL,
    valide_le         TIMESTAMPTZ,
    valide_par        UUID REFERENCES users(id) ON DELETE SET NULL,
    ecartee_le        TIMESTAMPTZ,
    ecartee_par       UUID REFERENCES users(id) ON DELETE SET NULL,
    motif_ecart       TEXT,
    annulee_le        TIMESTAMPTZ,
    annulee_par       UUID REFERENCES users(id) ON DELETE SET NULL,
    motif_annulation  TEXT,
    import_id         UUID REFERENCES imports_levees(id) ON DELETE CASCADE,
    import_ligne      INTEGER,
    observation       TEXT,
    provenance        TEXT NOT NULL DEFAULT 'reel',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT levees_statut CHECK (statut IN ('proposee', 'validee', 'ecartee', 'annulee')),
    CONSTRAINT levees_source CHECK (source IN ('portail', 'prestataire', 'kobo')),
    CONSTRAINT levees_voyage CHECK (voyage BETWEEN 1 AND 6),
    CONSTRAINT levees_date CHECK (date_levee >= DATE '2000-01-01'),
    CONSTRAINT levees_cle CHECK (length(btrim(cle_envoi)) BETWEEN 1 AND 200),
    CONSTRAINT levees_observation CHECK (observation IS NULL OR length(observation) <= 500),
    -- Une validation est datée ; une levée annulée avait été validée.
    CONSTRAINT levees_validation CHECK ((statut IN ('validee', 'annulee')) = (valide_le IS NOT NULL)),
    CONSTRAINT levees_ecart CHECK ((statut = 'ecartee') = (ecartee_le IS NOT NULL)
                                   AND (statut <> 'ecartee' OR length(btrim(COALESCE(motif_ecart, ''))) >= 5)),
    CONSTRAINT levees_annulation CHECK ((statut = 'annulee') = (annulee_le IS NOT NULL)
                                        AND (statut <> 'annulee' OR length(btrim(COALESCE(motif_annulation, ''))) >= 5)),
    -- La saisie de la commune au portail est validée d'emblée : elle n'est jamais une proposition.
    CONSTRAINT levees_portail_validee CHECK (source <> 'portail' OR statut IN ('validee', 'annulee')),
    -- Une levée Kobo vient d'un import, et d'une ligne du fichier.
    CONSTRAINT levees_import CHECK ((source = 'kobo') = (import_id IS NOT NULL)
                                    AND (import_id IS NULL) = (import_ligne IS NULL)
                                    AND (import_ligne IS NULL OR import_ligne >= 2)),
    CONSTRAINT levees_provenance CHECK (provenance IN ('reel', 'simule'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_levees_cle ON levees (commune_id, cle_envoi);
-- Une même levée physique ne se compte qu'une fois : par établissement, flux, jour
-- et voyage — pas par convention, qu'une résiliation antidatée suivie d'une
-- convention nouvelle aurait laissée se doubler.
CREATE UNIQUE INDEX IF NOT EXISTS uq_levees_voyage ON levees (commerce_id, flux_code, date_levee, voyage)
  WHERE statut IN ('proposee', 'validee');
CREATE INDEX IF NOT EXISTS idx_levees_commune_date ON levees (commune_id, date_levee DESC);
CREATE INDEX IF NOT EXISTS idx_levees_circuit_date ON levees (circuit_id, date_levee);
CREATE INDEX IF NOT EXISTS idx_levees_desserte ON levees (desserte_id);
CREATE INDEX IF NOT EXISTS idx_levees_convention ON levees (convention_id, date_levee);
CREATE INDEX IF NOT EXISTS idx_levees_a_valider ON levees (commune_id, date_levee) WHERE statut = 'proposee';

-- La convention signée d'un établissement qui couvre un jour (au plus une : le
-- non-chevauchement de G4a le tient), sur sa période effective.
CREATE OR REPLACE FUNCTION app._convention_a_la_date(p_commerce uuid, p_date date)
  RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT cv.id
    FROM conventions_commerciales cv
   WHERE cv.commerce_id = p_commerce
     AND cv.nature = 'convention' AND cv.statut IN ('signee', 'resiliee') AND cv.deleted_at IS NULL
     AND cv.date_debut <= p_date
     AND p_date <= CASE WHEN cv.date_resiliation IS NOT NULL THEN LEAST(cv.date_fin, cv.date_resiliation - 1) ELSE cv.date_fin END
   ORDER BY cv.date_debut DESC
   LIMIT 1
$$;
REVOKE ALL ON FUNCTION app._convention_a_la_date(uuid, date) FROM PUBLIC;

-- Une ligne du registre d'avant le jalon G couvre-t-elle ce jour ? Elle compte pour
-- M2-2, mais n'a pas de termes : aucune levée ne s'y rattache, et on le dit.
CREATE OR REPLACE FUNCTION app._registre_a_la_date(p_commerce uuid, p_date date)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT EXISTS (SELECT 1 FROM conventions_commerciales cv
                  WHERE cv.commerce_id = p_commerce AND cv.nature = 'registre' AND cv.deleted_at IS NULL
                    AND cv.date_debut <= p_date AND (cv.date_fin IS NULL OR p_date <= cv.date_fin))
$$;
REVOKE ALL ON FUNCTION app._registre_a_la_date(uuid, date) FROM PUBLIC;

-- Ce qu'une levée doit être, en une fonction : rien ne l'écrit, elle juge. Un code
-- nul vaut accord, et rend ce que la levée déduit (convention, flux, conteneur,
-- desserte, circuit, point, voyage). Interne : ses appelants ont vérifié le
-- périmètre (et, pour un prestataire, que la levée est sur sa feuille).
--   p_flux NULL : le seul flux des termes du jour, sinon il faut le préciser ;
--   p_voyage NULL : 1 sur un circuit d'un seul voyage, sinon il faut le préciser
--     (jamais deviné) ;
--   p_exclure : la levée elle-même, quand on la ré-examine.
CREATE OR REPLACE FUNCTION app._examiner_levee(
    p_commune text, p_commerce uuid, p_flux text, p_date date, p_voyage smallint, p_circuit uuid, p_exclure uuid DEFAULT NULL)
  RETURNS TABLE (code text, message text, convention_id uuid, flux_code text, conteneur_id text,
                 desserte_id uuid, circuit_id uuid, point_id uuid, voyage smallint)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
#variable_conflict use_column
DECLARE
  v_commerce  record;
  v_desserte  record;
  v_circuit   record;
  v_conv      uuid;
  v_termes    record;
  v_nb        integer;
  v_voyage    smallint := p_voyage;
  v_autre     text;
  v_jour      text := to_char(p_date, 'DD/MM/YYYY');
BEGIN
  SELECT c.id, c.nom, c.statut, c.ferme_le INTO v_commerce
    FROM commerces c WHERE c.id = p_commerce AND c.commune_id = p_commune AND c.deleted_at IS NULL;
  IF v_commerce.id IS NULL THEN
    RETURN QUERY SELECT 'LEVEE_ETABLISSEMENT'::text, 'cet établissement n''est pas inscrit dans la commune.'::text,
      NULL::uuid, NULL::text, NULL::text, NULL::uuid, NULL::uuid, NULL::uuid, NULL::smallint;
    RETURN;
  END IF;
  IF p_date > app.jour_tunis() THEN
    RETURN QUERY SELECT 'LEVEE_FUTURE'::text, format('une levée se constate après coup : le %s n''est pas encore arrivé.', v_jour),
      NULL::uuid, NULL::text, NULL::text, NULL::uuid, NULL::uuid, NULL::uuid, NULL::smallint;
    RETURN;
  END IF;
  IF v_commerce.statut = 'ferme' AND v_commerce.ferme_le <= p_date THEN
    RETURN QUERY SELECT 'ETABLISSEMENT_FERME'::text,
      format('« %s » est fermé depuis le %s.', v_commerce.nom, to_char(v_commerce.ferme_le, 'DD/MM/YYYY')),
      NULL::uuid, NULL::text, NULL::text, NULL::uuid, NULL::uuid, NULL::uuid, NULL::smallint;
    RETURN;
  END IF;
  SELECT * INTO v_desserte FROM app._desserte_a_la_date(p_commerce, p_date);
  IF v_desserte.desserte_id IS NULL THEN
    RETURN QUERY SELECT 'LEVEE_SANS_DESSERTE'::text,
      format('« %s » n''est desservi par aucun circuit le %s : posez sa desserte, ou vérifiez la date.', v_commerce.nom, v_jour),
      NULL::uuid, NULL::text, NULL::text, NULL::uuid, NULL::uuid, NULL::uuid, NULL::smallint;
    RETURN;
  END IF;
  IF p_circuit IS NOT NULL AND p_circuit <> v_desserte.circuit_id THEN
    RETURN QUERY SELECT 'LEVEE_AUTRE_CIRCUIT'::text,
      format('le %s, « %s » est desservi par un autre circuit que celui-ci.', v_jour, v_commerce.nom),
      NULL::uuid, NULL::text, NULL::text, NULL::uuid, NULL::uuid, NULL::uuid, NULL::smallint;
    RETURN;
  END IF;
  SELECT c.voyages_par_jour, c.nom INTO v_circuit FROM circuits c WHERE c.id = v_desserte.circuit_id;
  IF v_voyage IS NULL THEN
    IF v_circuit.voyages_par_jour = 1 THEN
      v_voyage := 1;
    ELSE
      RETURN QUERY SELECT 'LEVEE_VOYAGE_A_PRECISER'::text,
        format('le circuit « %s » fait %s voyages par jour : précisez celui de la levée.', v_circuit.nom, v_circuit.voyages_par_jour),
        NULL::uuid, NULL::text, NULL::text, NULL::uuid, NULL::uuid, NULL::uuid, NULL::smallint;
      RETURN;
    END IF;
  END IF;
  IF v_voyage < 1 OR v_voyage > v_circuit.voyages_par_jour THEN
    RETURN QUERY SELECT 'LEVEE_VOYAGE'::text,
      format('le circuit « %s » fait %s voyage(s) par jour : le voyage %s n''existe pas.', v_circuit.nom, v_circuit.voyages_par_jour, v_voyage),
      NULL::uuid, NULL::text, NULL::text, NULL::uuid, NULL::uuid, NULL::uuid, NULL::smallint;
    RETURN;
  END IF;
  v_conv := app._convention_a_la_date(p_commerce, p_date);
  IF v_conv IS NULL THEN
    RETURN QUERY SELECT 'LEVEE_SANS_CONVENTION'::text,
      CASE WHEN app._registre_a_la_date(p_commerce, p_date)
        THEN format('« %s » figure au registre des conventions d''avant le jalon G, sans termes : aucune levée ne s''y rattache ; reprenez-la en convention de propreté.', v_commerce.nom)
        ELSE format('« %s » n''a aucune convention signée en vigueur le %s : une levée se rattache à une convention.', v_commerce.nom, v_jour) END,
      NULL::uuid, NULL::text, NULL::text, NULL::uuid, NULL::uuid, NULL::uuid, NULL::smallint;
    RETURN;
  END IF;
  IF p_flux IS NULL THEN
    SELECT count(*) INTO v_nb FROM app.termes_convention(v_conv, p_date);
    IF v_nb <> 1 THEN
      RETURN QUERY SELECT 'LEVEE_FLUX_A_PRECISER'::text,
        format('« %s » a %s flux sous convention le %s : précisez lequel a été levé.', v_commerce.nom, v_nb, v_jour),
        NULL::uuid, NULL::text, NULL::text, NULL::uuid, NULL::uuid, NULL::uuid, NULL::smallint;
      RETURN;
    END IF;
    SELECT t.flux_code, t.conteneur_id INTO v_termes FROM app.termes_convention(v_conv, p_date) t;
  ELSE
    SELECT t.flux_code, t.conteneur_id INTO v_termes FROM app.termes_convention(v_conv, p_date) t WHERE t.flux_code = p_flux;
    IF v_termes.flux_code IS NULL THEN
      RETURN QUERY SELECT 'LEVEE_FLUX'::text,
        format('le flux « %s » n''est pas prévu pour « %s » le %s.', p_flux, v_commerce.nom, v_jour),
        NULL::uuid, NULL::text, NULL::text, NULL::uuid, NULL::uuid, NULL::uuid, NULL::smallint;
      RETURN;
    END IF;
  END IF;
  SELECT l.statut INTO v_autre FROM levees l
   WHERE l.commerce_id = p_commerce AND l.flux_code = v_termes.flux_code AND l.date_levee = p_date
     AND l.voyage = v_voyage AND l.statut IN ('proposee', 'validee')
     AND (p_exclure IS NULL OR l.id <> p_exclure)
   LIMIT 1;
  IF v_autre IS NOT NULL THEN
    RETURN QUERY SELECT 'LEVEE_DOUBLON'::text,
      CASE WHEN v_autre = 'proposee'
        THEN format('une levée de « %s » (%s) est déjà proposée pour le voyage %s du %s : validez-la ou écartez-la.', v_commerce.nom, v_termes.flux_code, v_voyage, v_jour)
        ELSE format('une levée de « %s » (%s) est déjà enregistrée pour le voyage %s du %s.', v_commerce.nom, v_termes.flux_code, v_voyage, v_jour) END,
      NULL::uuid, NULL::text, NULL::text, NULL::uuid, NULL::uuid, NULL::uuid, NULL::smallint;
    RETURN;
  END IF;
  RETURN QUERY SELECT NULL::text, NULL::text, v_conv, v_termes.flux_code, v_termes.conteneur_id,
    v_desserte.desserte_id, v_desserte.circuit_id, v_desserte.point_id, v_voyage;
END
$$;
REVOKE ALL ON FUNCTION app._examiner_levee(text, uuid, text, date, smallint, uuid, uuid) FROM PUBLIC;

-- Les faits dont dépend l'examen d'une levée, verrouillés en lecture : les
-- conventions signées de l'établissement, puis ses dessertes (la convention avant le
-- reste, comme les gestes de G4 ; dans l'ordre des identifiants). Une résiliation,
-- une clôture ou un retrait concurrents prennent ces lignes en écriture : ils passent
-- avant ou après, jamais entre l'examen et l'écriture.
CREATE OR REPLACE FUNCTION app._verrouiller_faits_levee(p_commerce uuid)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
  PERFORM 1 FROM conventions_commerciales cv
   WHERE cv.commerce_id = p_commerce AND cv.nature = 'convention' AND cv.statut IN ('signee', 'resiliee') AND cv.deleted_at IS NULL
   ORDER BY cv.id FOR SHARE;
  PERFORM 1 FROM dessertes_commerces d
   WHERE d.commerce_id = p_commerce AND d.deleted_at IS NULL
   ORDER BY d.id FOR SHARE;
END
$$;
REVOKE ALL ON FUNCTION app._verrouiller_faits_levee(uuid) FROM PUBLIC;

-- Ce que la base avait déduit pour une levée ne tient plus : sa convention, sa
-- desserte, son circuit, son point ou son conteneur ne sont plus ceux que l'examen
-- de son jour rend aujourd'hui (une résiliation suivie d'une convention nouvelle, un
-- avenant qui change le conteneur, une desserte rouverte ailleurs).
CREATE OR REPLACE FUNCTION app._deduction_changee(
    v levees, p_convention uuid, p_desserte uuid, p_circuit uuid, p_point uuid, p_conteneur text)
  RETURNS boolean LANGUAGE sql IMMUTABLE AS
$$
  SELECT v.convention_id IS DISTINCT FROM p_convention OR v.desserte_id IS DISTINCT FROM p_desserte
      OR v.circuit_id IS DISTINCT FROM p_circuit OR v.point_id IS DISTINCT FROM p_point
      OR v.conteneur_id IS DISTINCT FROM p_conteneur
$$;
REVOKE ALL ON FUNCTION app._deduction_changee(levees, uuid, uuid, uuid, uuid, text) FROM PUBLIC;

-- L'aperçu d'un import : chaque ligne examinée comme le déclencheur l'examinera,
-- par le directeur de la commune seulement. Rien n'est écrit.
CREATE OR REPLACE FUNCTION app.examiner_levees(p_commune text, p_lignes jsonb)
  RETURNS TABLE (n integer, code text, message text, convention_id uuid, flux_code text, circuit_id uuid, voyage smallint)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
#variable_conflict use_column
BEGIN
  IF NOT app.peut_emettre_document(p_commune) THEN
    RAISE EXCEPTION 'LEVEE_HORS_PERIMETRE' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
    SELECT x.n, e.code, e.message, e.convention_id, e.flux_code, e.circuit_id, e.voyage
      FROM jsonb_to_recordset(p_lignes) AS x(n integer, commerce uuid, flux text, jour date, voyage smallint, circuit uuid)
      CROSS JOIN LATERAL app._examiner_levee(p_commune, x.commerce, x.flux, x.jour, x.voyage, x.circuit) e
     ORDER BY x.n;
END
$$;
REVOKE ALL ON FUNCTION app.examiner_levees(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.examiner_levees(text, jsonb) TO siipi_app;

CREATE OR REPLACE FUNCTION app.controler_levee()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_role     text := app.current_role_name();
  v_auteur   text;
  v_feuille  record;
  v_debut    date;
  v_examen   record;
BEGIN
  -- Le périmètre d'abord. Le directeur : sa commune. Le prestataire : ce que sa
  -- feuille montre ce jour-là (une desserte sur un de ses circuits, un
  -- établissement ouvert, une convention en vigueur) — hors d'elle, la levée est
  -- INTROUVABLE, et sa réponse ne lui apprend rien d'une convention.
  IF v_role = 'admin_commune' AND app.peut_emettre_document(NEW.commune_id) THEN
    v_auteur := 'commune';
  ELSIF v_role = 'gestionnaire_prestataire' THEN
    SELECT * INTO v_feuille FROM app._desserte_a_la_date(NEW.commerce_id, NEW.date_levee);
    IF v_feuille.desserte_id IS NULL OR NEW.circuit_id IS NULL OR v_feuille.circuit_id <> NEW.circuit_id
       OR NOT (NEW.circuit_id = ANY (app.mes_circuits()))
       OR NOT EXISTS (SELECT 1 FROM commerces c
                       WHERE c.id = NEW.commerce_id AND c.commune_id = NEW.commune_id AND c.deleted_at IS NULL
                         AND NOT (c.statut = 'ferme' AND c.ferme_le <= NEW.date_levee))
       OR app._convention_a_la_date(NEW.commerce_id, NEW.date_levee) IS NULL THEN
      RAISE EXCEPTION 'LEVEE_INTROUVABLE' USING ERRCODE = 'no_data_found';
    END IF;
    -- Pas avant son contrat avec la commune.
    SELECT uc.date_debut INTO v_debut FROM utilisateur_communes uc
     WHERE uc.user_id = app.current_user_id() AND uc.commune_id = NEW.commune_id;
    IF v_debut IS NOT NULL AND NEW.date_levee < v_debut THEN
      RAISE EXCEPTION 'LEVEE_HORS_CONTRAT: votre contrat avec la commune commence le % : une levée d''avant ne se propose pas.',
        to_char(v_debut, 'DD/MM/YYYY') USING ERRCODE = 'check_violation';
    END IF;
    v_auteur := 'prestataire';
  ELSE
    RAISE EXCEPTION 'LEVEE_HORS_PERIMETRE' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Qui écrit décide du statut : la commune au portail valide d'emblée ; le
  -- prestataire, et l'import d'un export Kobo, proposent.
  IF v_auteur = 'commune' AND NEW.source = 'portail' THEN
    NEW.statut := 'validee';
    NEW.valide_le := now();
    NEW.valide_par := app.current_user_id();
  ELSIF (v_auteur = 'commune' AND NEW.source = 'kobo') OR (v_auteur = 'prestataire' AND NEW.source = 'prestataire') THEN
    NEW.statut := 'proposee';
    NEW.valide_le := NULL;
    NEW.valide_par := NULL;
  ELSE
    RAISE EXCEPTION 'LEVEE_SOURCE: la commune saisit au portail ou importe un export Kobo ; le prestataire propose depuis sa feuille.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.import_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM imports_levees i WHERE i.id = NEW.import_id AND i.commune_id = NEW.commune_id) THEN
    RAISE EXCEPTION 'LEVEE_SOURCE: une levée importée appartient à la commune de son import.' USING ERRCODE = 'check_violation';
  END IF;
  NEW.ecartee_le := NULL; NEW.ecartee_par := NULL; NEW.motif_ecart := NULL;
  NEW.annulee_le := NULL; NEW.annulee_par := NULL; NEW.motif_annulation := NULL;
  NEW.propose_par := app.current_user_id();
  NEW.created_at := now();
  NEW.updated_at := now();

  -- Les conventions puis les dessertes de l'établissement, verrouillées AVANT
  -- l'examen (même ordre que les gestes de G4 : la convention avant le reste). Une
  -- résiliation, une clôture ou un retrait concurrents se suivent avec cette levée :
  -- s'ils sont passés, l'examen qui suit (une instruction nouvelle, donc un état
  -- nouveau) les voit et refuse ; sinon ils attendent, puis voient cette levée.
  -- Examiner d'abord et verrouiller ensuite laisserait une levée s'accrocher à une
  -- desserte close ou retirée entre les deux.
  PERFORM app._verrouiller_faits_levee(NEW.commerce_id);
  SELECT * INTO v_examen FROM app._examiner_levee(NEW.commune_id, NEW.commerce_id, NEW.flux_code, NEW.date_levee, NEW.voyage, NEW.circuit_id);
  IF v_examen.code IS NOT NULL THEN
    RAISE EXCEPTION '%: %', v_examen.code, v_examen.message USING ERRCODE = 'check_violation';
  END IF;
  NEW.convention_id := v_examen.convention_id;
  NEW.flux_code := v_examen.flux_code;
  NEW.conteneur_id := v_examen.conteneur_id;
  NEW.desserte_id := v_examen.desserte_id;
  NEW.circuit_id := v_examen.circuit_id;
  NEW.point_id := v_examen.point_id;
  NEW.voyage := v_examen.voyage;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_controler_levee ON levees;
CREATE TRIGGER trg_controler_levee BEFORE INSERT ON levees
  FOR EACH ROW EXECUTE FUNCTION app.controler_levee();

-- Une levée ne se réécrit pas : seuls ses gestes la font changer de statut
-- (proposée → validée ou écartée ; validée → annulée), et rien d'autre ne bouge.
CREATE OR REPLACE FUNCTION app.figer_levee()
  RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS
$$
DECLARE
  v_permis text[];
BEGIN
  IF OLD.statut = 'proposee' AND NEW.statut = 'validee' THEN
    v_permis := ARRAY['statut', 'valide_le', 'valide_par', 'updated_at'];
  ELSIF OLD.statut = 'proposee' AND NEW.statut = 'ecartee' THEN
    v_permis := ARRAY['statut', 'ecartee_le', 'ecartee_par', 'motif_ecart', 'updated_at'];
  ELSIF OLD.statut = 'validee' AND NEW.statut = 'annulee' THEN
    v_permis := ARRAY['statut', 'annulee_le', 'annulee_par', 'motif_annulation', 'updated_at'];
  ELSE
    RAISE EXCEPTION 'LEVEE_FIGEE: une levée % ne change plus ; une levée validée s''annule avec un motif, une proposition se valide ou s''écarte.',
      CASE OLD.statut WHEN 'proposee' THEN 'proposée' WHEN 'validee' THEN 'validée' WHEN 'ecartee' THEN 'écartée' ELSE 'annulée' END
      USING ERRCODE = 'check_violation';
  END IF;
  IF (to_jsonb(NEW) - v_permis) <> (to_jsonb(OLD) - v_permis) THEN
    RAISE EXCEPTION 'LEVEE_FIGEE: seul son statut change ; le reste d''une levée ne se réécrit pas.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_figer_levee ON levees;
CREATE TRIGGER trg_figer_levee BEFORE UPDATE ON levees
  FOR EACH ROW EXECUTE FUNCTION app.figer_levee();

-- ---------------------------------------------------------------------------
-- 4. Les écritures et les gestes
-- ---------------------------------------------------------------------------
-- Toute levée naît ici : saisie de la commune (portail), proposition du prestataire
-- depuis sa feuille, import d'un export Kobo. Un lot s'écrit en entier ou pas du
-- tout. Une clé déjà reçue avec le même contenu est rendue « déjà reçue » (un envoi
-- rejoué après une coupure ne crée rien) ; avec un autre contenu, le lot est refusé.
-- Les écritures d'une commune passent l'une après l'autre (verrou consultatif) :
-- un import et une saisie concurrents ne se heurtent pas à mi-chemin.
CREATE OR REPLACE FUNCTION app.enregistrer_levees(p_commune text, p_source text, p_lignes jsonb, p_import uuid DEFAULT NULL)
  RETURNS TABLE (n integer, id uuid, commerce_id uuid, flux_code text, date_levee date, voyage smallint, statut text, deja_recue boolean)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
#variable_conflict use_column
DECLARE
  v_role  text := app.current_role_name();
  v_l     record;
  v_ex    levees;
  v_new   levees;
BEGIN
  IF NOT ((v_role = 'admin_commune' AND app.peut_emettre_document(p_commune))
          OR (v_role = 'gestionnaire_prestataire' AND p_commune = ANY (app.mes_communes()))) THEN
    RAISE EXCEPTION 'LEVEE_HORS_PERIMETRE' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_lignes IS NULL OR jsonb_typeof(p_lignes) <> 'array' OR jsonb_array_length(p_lignes) = 0 THEN
    RAISE EXCEPTION 'LEVEE_AUCUNE: aucune levée à enregistrer.' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('levees:' || p_commune));
  FOR v_l IN
    SELECT * FROM jsonb_to_recordset(p_lignes)
      AS x(n integer, commerce uuid, flux text, jour date, voyage smallint, heure time, circuit uuid, cle text, ligne integer, observation text)
     ORDER BY x.n
  LOOP
    SELECT * INTO v_ex FROM levees l WHERE l.commune_id = p_commune AND l.cle_envoi = v_l.cle;
    IF v_ex.id IS NOT NULL THEN
      IF v_ex.commerce_id = v_l.commerce AND v_ex.date_levee = v_l.jour
         AND (v_l.flux IS NULL OR v_ex.flux_code = v_l.flux)
         AND (v_l.voyage IS NULL OR v_ex.voyage = v_l.voyage)
         AND (v_role = 'admin_commune' OR v_ex.circuit_id = ANY (app.mes_circuits())) THEN
        RETURN QUERY SELECT v_l.n, v_ex.id, v_ex.commerce_id, v_ex.flux_code, v_ex.date_levee, v_ex.voyage, v_ex.statut, true;
        CONTINUE;
      END IF;
      RAISE EXCEPTION 'LEVEE_CLE_REUTILISEE: la clé d''envoi « % » a déjà servi à une autre levée (soumission modifiée après coup ?) ; rien n''est enregistré.',
        v_l.cle USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO levees (commune_id, commerce_id, circuit_id, flux_code, date_levee, heure_levee, voyage, source, cle_envoi,
                        observation, import_id, import_ligne)
    VALUES (p_commune, v_l.commerce, v_l.circuit, v_l.flux, v_l.jour, v_l.heure, v_l.voyage, p_source, v_l.cle,
            NULLIF(btrim(v_l.observation), ''), p_import, CASE WHEN p_import IS NOT NULL THEN v_l.ligne END)
    RETURNING * INTO v_new;
    RETURN QUERY SELECT v_l.n, v_new.id, v_new.commerce_id, v_new.flux_code, v_new.date_levee, v_new.voyage, v_new.statut, false;
  END LOOP;
END
$$;
REVOKE ALL ON FUNCTION app.enregistrer_levees(text, text, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.enregistrer_levees(text, text, jsonb, uuid) TO siipi_app;

CREATE OR REPLACE FUNCTION app._levee_a_traiter(p_id uuid)
  RETURNS levees LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v levees;
BEGIN
  SELECT * INTO v FROM levees WHERE id = p_id FOR UPDATE;
  IF v.id IS NULL OR NOT app.peut_emettre_document(v.commune_id) THEN
    RAISE EXCEPTION 'LEVEE_INTROUVABLE' USING ERRCODE = 'no_data_found';
  END IF;
  RETURN v;
END
$$;
REVOKE ALL ON FUNCTION app._levee_a_traiter(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.valider_levees(p_ids uuid[])
  RETURNS SETOF levees LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_id      uuid;
  v         levees;
  v_examen  record;
BEGIN
  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN
    RAISE EXCEPTION 'LEVEE_AUCUNE: choisissez au moins une proposition.' USING ERRCODE = 'check_violation';
  END IF;
  -- Dans l'ordre des identifiants : deux lots concurrents verrouillent dans le même
  -- ordre. Un identifiant hors du périmètre rend tout le lot introuvable.
  FOR v_id IN SELECT DISTINCT u FROM unnest(p_ids) AS u ORDER BY u LOOP
    v := app._levee_a_traiter(v_id);
    IF v.statut <> 'proposee' THEN
      RAISE EXCEPTION 'LEVEE_DEJA_INSTRUITE: la levée du % de « % » n''est plus une proposition (elle est %) ; la liste est à jour.',
        to_char(v.date_levee, 'DD/MM/YYYY'), (SELECT c.nom FROM commerces c WHERE c.id = v.commerce_id),
        CASE v.statut WHEN 'validee' THEN 'validée' WHEN 'ecartee' THEN 'écartée' ELSE 'annulée' END
        USING ERRCODE = 'check_violation';
    END IF;
    -- Valider, c'est adopter la proposition pour SON jour, avec ce que la base sait
    -- aujourd'hui : ce qui a changé depuis (desserte close, convention résiliée, avenant
    -- qui change le conteneur…) se dit. Les faits sont verrouillés avant l'examen.
    PERFORM app._verrouiller_faits_levee(v.commerce_id);
    SELECT * INTO v_examen FROM app._examiner_levee(v.commune_id, v.commerce_id, v.flux_code, v.date_levee, v.voyage, v.circuit_id, v.id);
    IF v_examen.code IS NOT NULL THEN
      RAISE EXCEPTION '%: %', v_examen.code, v_examen.message USING ERRCODE = 'check_violation';
    END IF;
    IF app._deduction_changee(v, v_examen.convention_id, v_examen.desserte_id, v_examen.circuit_id, v_examen.point_id, v_examen.conteneur_id) THEN
      RAISE EXCEPTION 'LEVEE_A_REPROPOSER: la convention, la desserte ou les termes (conteneur) de la levée du % ont changé depuis sa proposition ; écartez-la et saisissez-la de nouveau.',
        to_char(v.date_levee, 'DD/MM/YYYY') USING ERRCODE = 'check_violation';
    END IF;
    UPDATE levees SET statut = 'validee', valide_le = now(), valide_par = app.current_user_id(), updated_at = now()
     WHERE id = v.id RETURNING * INTO v;
    RETURN NEXT v;
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION app.ecarter_levees(p_ids uuid[], p_motif text)
  RETURNS SETOF levees LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_id  uuid;
  v     levees;
BEGIN
  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN
    RAISE EXCEPTION 'LEVEE_AUCUNE: choisissez au moins une proposition.' USING ERRCODE = 'check_violation';
  END IF;
  IF length(btrim(COALESCE(p_motif, ''))) < 5 THEN
    RAISE EXCEPTION 'LEVEE_MOTIF: une proposition s''écarte avec son motif (5 caractères au moins).' USING ERRCODE = 'check_violation';
  END IF;
  FOR v_id IN SELECT DISTINCT u FROM unnest(p_ids) AS u ORDER BY u LOOP
    v := app._levee_a_traiter(v_id);
    IF v.statut <> 'proposee' THEN
      RAISE EXCEPTION 'LEVEE_DEJA_INSTRUITE: la levée du % de « % » n''est plus une proposition ; la liste est à jour.',
        to_char(v.date_levee, 'DD/MM/YYYY'), (SELECT c.nom FROM commerces c WHERE c.id = v.commerce_id) USING ERRCODE = 'check_violation';
    END IF;
    UPDATE levees SET statut = 'ecartee', ecartee_le = now(), ecartee_par = app.current_user_id(),
                      motif_ecart = btrim(p_motif), updated_at = now()
     WHERE id = v.id RETURNING * INTO v;
    RETURN NEXT v;
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION app.annuler_levee(p_id uuid, p_motif text)
  RETURNS levees LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v levees;
BEGIN
  v := app._levee_a_traiter(p_id);
  IF v.statut <> 'validee' THEN
    RAISE EXCEPTION 'LEVEE_DEJA_INSTRUITE: seule une levée validée s''annule ; celle-ci est %.',
      CASE v.statut WHEN 'proposee' THEN 'une proposition (écartez-la)' WHEN 'ecartee' THEN 'écartée' ELSE 'déjà annulée' END
      USING ERRCODE = 'check_violation';
  END IF;
  IF length(btrim(COALESCE(p_motif, ''))) < 5 THEN
    RAISE EXCEPTION 'LEVEE_MOTIF: une levée s''annule avec son motif (5 caractères au moins).' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE levees SET statut = 'annulee', annulee_le = now(), annulee_par = app.current_user_id(),
                    motif_annulation = btrim(p_motif), updated_at = now()
   WHERE id = v.id RETURNING * INTO v;
  RETURN v;
END
$$;

REVOKE ALL ON FUNCTION app.valider_levees(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.ecarter_levees(uuid[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.annuler_levee(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.valider_levees(uuid[]) TO siipi_app;
GRANT EXECUTE ON FUNCTION app.ecarter_levees(uuid[], text) TO siipi_app;
GRANT EXECUTE ON FUNCTION app.annuler_levee(uuid, text) TO siipi_app;

-- Ce qu'une levée proposée ou validée a perdu depuis, sans que rien ne la corrige :
-- l'examen de son jour rejoué avec ce que la base sait aujourd'hui (établissement
-- fermé après coup, desserte écourtée, point retiré, voyage supprimé, avenant,
-- résiliation…), ou une convention, une desserte qui ne sont plus les siennes. Une
-- seule définition : celle de l'examen. Rien à revoir : aucune ligne.
CREATE OR REPLACE FUNCTION app.levee_a_revoir(p_id uuid)
  RETURNS TABLE (code text, message text)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
#variable_conflict use_column
DECLARE
  v  levees;
  e  record;
BEGIN
  SELECT * INTO v FROM levees l WHERE l.id = p_id AND l.statut IN ('proposee', 'validee');
  IF v.id IS NULL OR NOT app.can_write_commune(v.commune_id) THEN
    RETURN;
  END IF;
  SELECT * INTO e FROM app._examiner_levee(v.commune_id, v.commerce_id, v.flux_code, v.date_levee, v.voyage, v.circuit_id, v.id);
  IF e.code IS NOT NULL THEN
    RETURN QUERY SELECT e.code, e.message;
  ELSIF app._deduction_changee(v, e.convention_id, e.desserte_id, e.circuit_id, e.point_id, e.conteneur_id) THEN
    RETURN QUERY SELECT 'LEVEE_A_REPROPOSER'::text,
      'sa convention, sa desserte ou les termes de ce jour (conteneur) ont changé depuis son enregistrement.'::text;
  END IF;
END
$$;
REVOKE ALL ON FUNCTION app.levee_a_revoir(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.levee_a_revoir(uuid) TO siipi_app;

-- ---------------------------------------------------------------------------
-- 5. La feuille du jour d'un circuit
-- ---------------------------------------------------------------------------
-- Pour chaque établissement desservi ce jour-là par le circuit, et chaque flux des
-- termes en vigueur de sa convention : le point, le conteneur, les levées par
-- semaine, et les levées déjà proposées ou validées ce jour. La commune (et la
-- FNCT, en lecture) voit aussi les établissements desservis sans convention ce
-- jour-là (« registre » : la convention d'avant le jalon G, sans termes ; « aucune »)
-- et les établissements fermés ; le prestataire du circuit ne voit que ce qu'il
-- peut proposer, sans identifiant de convention ni tarif.
CREATE OR REPLACE FUNCTION app.feuille_levees(p_circuit uuid, p_date date)
  RETURNS TABLE (
    desserte_id uuid, commerce_id uuid, etablissement text, adresse text, ferme boolean,
    point_id uuid, point_nom text, point_voyage smallint, point_ordre integer, point_retire boolean,
    convention_id uuid, etat_convention text,
    flux_code text, flux_fr text, flux_ar text, conteneur_id text, conteneur_code text,
    levees_par_semaine smallint, volume_litres numeric, levees jsonb)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
#variable_conflict use_column
DECLARE
  v_commune     text;
  v_commune_vue boolean;
BEGIN
  SELECT c.commune_id INTO v_commune FROM circuits c WHERE c.id = p_circuit;
  IF v_commune IS NULL THEN
    RAISE EXCEPTION 'CIRCUIT_INTROUVABLE' USING ERRCODE = 'no_data_found';
  END IF;
  IF app.can_write_commune(v_commune) THEN
    v_commune_vue := true;
  ELSIF app.current_role_name() = 'gestionnaire_prestataire' AND p_circuit = ANY (app.mes_circuits()) THEN
    v_commune_vue := false;
  ELSE
    RAISE EXCEPTION 'CIRCUIT_INTROUVABLE' USING ERRCODE = 'no_data_found';
  END IF;

  RETURN QUERY
  WITH desservis AS (
    SELECT d.id AS d_id, d.commerce_id AS d_commerce, d.point_id AS d_point
      FROM dessertes_commerces d
     WHERE d.circuit_id = p_circuit AND d.deleted_at IS NULL
       AND EXISTS (SELECT 1 FROM app._desserte_a_la_date(d.commerce_id, p_date) x WHERE x.desserte_id = d.id)
  ), avec_convention AS (
    SELECT s.*, app._convention_a_la_date(s.d_commerce, p_date) AS d_conv FROM desservis s
  )
  SELECT a.d_id, a.d_commerce, co.nom, co.adresse,
         (co.statut = 'ferme' AND co.ferme_le <= p_date),
         a.d_point, p.nom, p.voyage, p.ordre, (p.deleted_at IS NOT NULL),
         CASE WHEN v_commune_vue THEN a.d_conv END,
         CASE WHEN a.d_conv IS NOT NULL THEN 'convention'
              WHEN app._registre_a_la_date(a.d_commerce, p_date) THEN 'registre'
              ELSE 'aucune' END,
         t.flux_code, f.libelle_fr, f.libelle_ar, t.conteneur_id, k.code,
         t.levees_par_semaine, t.volume_litres,
         COALESCE((SELECT jsonb_agg(jsonb_build_object('id', l.id, 'voyage', l.voyage, 'statut', l.statut, 'source', l.source,
                                                        'heure', to_char(l.heure_levee, 'HH24:MI'))
                                    ORDER BY l.voyage)
                     FROM levees l
                    WHERE l.commerce_id = a.d_commerce AND l.flux_code = t.flux_code AND l.date_levee = p_date
                      AND l.statut IN ('proposee', 'validee')), '[]'::jsonb)
    FROM avec_convention a
    JOIN commerces co ON co.id = a.d_commerce
    JOIN points_collecte p ON p.id = a.d_point
    LEFT JOIN LATERAL app.termes_convention(a.d_conv, p_date) t ON a.d_conv IS NOT NULL
    LEFT JOIN conteneurs k ON k.id = t.conteneur_id
    LEFT JOIN LATERAL (
      SELECT e.libelle_fr, e.libelle_ar FROM elements_listes_nationales e
       WHERE e.liste = 'flux_assimiles' AND e.code = t.flux_code AND e.retire_le IS NULL
       ORDER BY e.date_effet DESC LIMIT 1) f ON true
   WHERE v_commune_vue
      OR (t.flux_code IS NOT NULL AND NOT (co.statut = 'ferme' AND co.ferme_le <= p_date))
   ORDER BY p.voyage, p.ordre, co.nom, t.ordre, t.flux_code;
END
$$;
REVOKE ALL ON FUNCTION app.feuille_levees(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.feuille_levees(uuid, date) TO siipi_app;

-- ---------------------------------------------------------------------------
-- 6. Provenance, audit, cloisonnement, droits
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['dessertes_commerces', 'imports_levees', 'modeles_import_levees', 'levees'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_provenance ON %I', t);
    EXECUTE format('CREATE TRIGGER trg_provenance BEFORE INSERT OR UPDATE OF provenance ON %I FOR EACH ROW EXECUTE FUNCTION app.controler_provenance()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%s ON %I', t, t);
    EXECUTE format('CREATE TRIGGER trg_audit_%s AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement()', t, t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE DELETE, TRUNCATE ON %I FROM siipi_app', t);
  END LOOP;
END $$;

-- Les dessertes : le directeur écrit, la FNCT lit ; le prestataire passe par la feuille.
DROP POLICY IF EXISTS dessertes_commerces_select ON dessertes_commerces;
CREATE POLICY dessertes_commerces_select ON dessertes_commerces FOR SELECT
  USING (deleted_at IS NULL AND app.can_write_commune(commune_id));
DROP POLICY IF EXISTS dessertes_commerces_insert ON dessertes_commerces;
CREATE POLICY dessertes_commerces_insert ON dessertes_commerces FOR INSERT
  WITH CHECK (app.peut_emettre_document(commune_id));
DROP POLICY IF EXISTS dessertes_commerces_update ON dessertes_commerces;
CREATE POLICY dessertes_commerces_update ON dessertes_commerces FOR UPDATE
  USING (deleted_at IS NULL AND app.peut_emettre_document(commune_id)) WITH CHECK (app.peut_emettre_document(commune_id));
GRANT SELECT ON dessertes_commerces TO siipi_app;
REVOKE INSERT, UPDATE ON dessertes_commerces FROM siipi_app;
GRANT INSERT (commune_id, commerce_id, point_id, date_debut, date_fin, observation, provenance) ON dessertes_commerces TO siipi_app;
-- Une desserte se clôt (date de fin) et se commente ; son retrait passe par app.supprimer.
GRANT UPDATE (date_fin, observation) ON dessertes_commerces TO siipi_app;

-- Les levées : le directeur et la FNCT lisent la table ; le prestataire ne la lit
-- pas (sa feuille lui suffit, sans convention). Personne ne l'écrit directement :
-- tout passe par app.enregistrer_levees et les gestes, qui la gardent.
DROP POLICY IF EXISTS levees_select ON levees;
CREATE POLICY levees_select ON levees FOR SELECT USING (app.can_write_commune(commune_id));
DROP POLICY IF EXISTS levees_insert ON levees;
CREATE POLICY levees_insert ON levees FOR INSERT WITH CHECK (app.peut_emettre_document(commune_id));
GRANT SELECT ON levees TO siipi_app;
REVOKE INSERT, UPDATE ON levees FROM siipi_app;

-- Le journal des imports ne se modifie pas ; le modèle s'enregistre par un upsert,
-- qui exige la politique UPDATE même sans conflit (leçon de la v0.4.0).
DROP POLICY IF EXISTS imports_levees_select ON imports_levees;
CREATE POLICY imports_levees_select ON imports_levees FOR SELECT USING (deleted_at IS NULL AND app.can_write_commune(commune_id));
DROP POLICY IF EXISTS imports_levees_insert ON imports_levees;
CREATE POLICY imports_levees_insert ON imports_levees FOR INSERT WITH CHECK (app.peut_emettre_document(commune_id));
GRANT SELECT, INSERT ON imports_levees TO siipi_app;
REVOKE UPDATE ON imports_levees FROM siipi_app;

DROP POLICY IF EXISTS modeles_import_levees_select ON modeles_import_levees;
CREATE POLICY modeles_import_levees_select ON modeles_import_levees FOR SELECT USING (deleted_at IS NULL AND app.can_write_commune(commune_id));
DROP POLICY IF EXISTS modeles_import_levees_insert ON modeles_import_levees;
CREATE POLICY modeles_import_levees_insert ON modeles_import_levees FOR INSERT WITH CHECK (app.peut_emettre_document(commune_id));
DROP POLICY IF EXISTS modeles_import_levees_update ON modeles_import_levees;
CREATE POLICY modeles_import_levees_update ON modeles_import_levees FOR UPDATE
  USING (deleted_at IS NULL AND app.peut_emettre_document(commune_id)) WITH CHECK (app.peut_emettre_document(commune_id));
GRANT SELECT, INSERT ON modeles_import_levees TO siipi_app;
REVOKE UPDATE ON modeles_import_levees FROM siipi_app;
GRANT UPDATE (correspondance, saisi_par, updated_at) ON modeles_import_levees TO siipi_app;

-- ---------------------------------------------------------------------------
-- 7. Le retrait d'une desserte posée à tort : app.supprimer (dernière version, 104)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.supprimer(p_table text, p_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_commune text;
BEGIN
  -- `commerces` n'y est plus : un établissement se ferme, il ne se supprime
  -- pas (G-4, 099). Une levée non plus : elle s'écarte ou s'annule (105).
  IF p_table NOT IN ('users', 'vehicules', 'conteneurs', 'tickets',
                     'pesees_anged', 'zones_collecte', 'barbechas',
                     'five_axis_scores', 'circuits', 'controles_terrain',
                     'declarations_passage', 'incidents', 'annonces_collecte',
                     'collecteurs_agrees', 'demandes_enlevement',
                     'personnel', 'fichiers', 'points_suggeres',
                     'rapports_etudes', 'contacts',
                     'interventions_maintenance', 'plans_entretien',
                     'champs_points', 'etiquettes_points', 'actions_planifiees',
                     'poi', 'fuel_logs', 'fins_de_poste', 'dotations_epi',
                     'incidents_travail', 'conventions_commerciales',
                     'donnees_personnelles_barbechas', 'identites_commerces',
                     'carnets_de_bord', 'quotas_carburant',
                     'immobilisations_engins', 'etapes_declassement', 'pieces_declassement',
                     'etudes_cout_complet', 'demarches_formalisation',
                     'demandes_carte_precollecteur', 'pieces_demande_carte',
                     'jalons_acteurs', 'agrements_intermediaires',
                     'grilles_tarifaires', 'avenants_convention', 'dessertes_commerces') THEN
    RAISE EXCEPTION 'TABLE_NON_SUPPRIMABLE: %', p_table;
  END IF;

  EXECUTE format('SELECT commune_id FROM %I WHERE id::text = $1 AND deleted_at IS NULL', p_table)
     INTO v_commune USING p_id;

  IF v_commune IS NULL THEN
    RETURN false;
  END IF;

  -- L'identité se retire comme elle se lit : par le seul admin de la commune.
  -- Le circuit d'un dossier de déclassement et ses pièces, comme ils s'inscrivent.
  -- Une demande de carte et ses pièces, une étape d'accompagnement, un agrément,
  -- un projet de grille tarifaire, un brouillon de convention ou d'avenant, une
  -- desserte posée à tort, par le directeur qui les enregistre (une grille
  -- approuvée, une convention ou un avenant instruits ou signés, une desserte qui
  -- a servi ne se retirent pas : leur règle le refuse).
  IF p_table IN ('donnees_personnelles_barbechas', 'identites_commerces') THEN
    IF NOT app.peut_voir_identite(v_commune) THEN
      RAISE EXCEPTION 'ACCES_REFUSE' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF p_table IN ('etapes_declassement', 'pieces_declassement') THEN
    IF NOT app.peut_instruire_declassement(v_commune) THEN
      RAISE EXCEPTION 'ACCES_REFUSE' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF p_table IN ('demandes_carte_precollecteur', 'pieces_demande_carte', 'jalons_acteurs', 'agrements_intermediaires',
                    'grilles_tarifaires', 'conventions_commerciales', 'avenants_convention', 'dessertes_commerces') THEN
    IF NOT app.peut_emettre_document(v_commune) THEN
      RAISE EXCEPTION 'ACCES_REFUSE' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF NOT app.can_write_commune(v_commune) THEN
    RAISE EXCEPTION 'ACCES_REFUSE' USING ERRCODE = 'insufficient_privilege';
  END IF;

  EXECUTE format('UPDATE %I SET deleted_at = now(), deleted_by = $2 WHERE id::text = $1', p_table)
    USING p_id, app.current_user_id();

  RETURN true;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 8. Ce que l'administrateur lira dans dix ans
-- ---------------------------------------------------------------------------
COMMENT ON TABLE dessertes_commerces IS
  'La desserte d''un établissement (jalon G, lot G5a) : le point d''arrêt d''un circuit où ses bacs sont levés, du … au …. Une seule à la fois par établissement. Sa fin effective (app.fin_desserte) est la plus proche de sa date de fin, de la fin du circuit et du retrait du point ou du circuit — calculée, jamais réécrite. Se clôt ; ne se retire que si aucune levée ne s''y rattache.';
COMMENT ON COLUMN dessertes_commerces.circuit_id IS 'Le circuit du point, posé par la base à l''ouverture de la desserte.';
COMMENT ON COLUMN dessertes_commerces.date_fin IS 'Le dernier jour desservi (NULL : sans fin prévue). Jamais avant une levée déjà rattachée.';
COMMENT ON TABLE levees IS
  'Les levées constatées des établissements sous convention (jalon G, lot G5a). Toutes naissent par app.enregistrer_levees : la commune saisit au portail (validée d''emblée) ; le prestataire du circuit et l''import d''un export Kobo proposent, la commune valide ou écarte avec un motif. La convention, le conteneur, la desserte, le circuit et le point sont déduits par la base (app._examiner_levee). Une même levée (établissement, flux, jour, voyage) ne se compte qu''une fois. Ne s''efface jamais : une levée validée s''annule avec un motif. Le tonnage n''y figure pas : une levée se compte, elle ne se pèse pas.';
COMMENT ON COLUMN levees.source IS 'portail (saisie de la commune, validée d''emblée), prestataire (proposée depuis sa feuille), kobo (proposée par l''import d''un export Kobo).';
COMMENT ON COLUMN levees.cle_envoi IS 'La clé de l''envoi (identifiant de soumission Kobo, ou clé posée par l''écran) : une même clé reçue deux fois ne crée rien.';
COMMENT ON COLUMN levees.heure_levee IS 'L''heure de Tunis de la levée, quand l''appareil ou le fichier la donne.';
COMMENT ON COLUMN levees.voyage IS 'Le voyage du circuit, de 1 au nombre de voyages par jour du circuit.';
COMMENT ON COLUMN levees.import_ligne IS 'La ligne du fichier Kobo importé (la première ligne de données est la 2).';
COMMENT ON TABLE imports_levees IS
  'Chaque import validé d''un export Kobo de levées (lot G5a) : fichier (nom, empreinte SHA-256), correspondance des colonnes, comptes. Ne se modifie pas.';
COMMENT ON TABLE modeles_import_levees IS
  'La correspondance des colonnes retenue par la commune pour ses exports Kobo de levées ; proposée à l''import suivant, remplacée à chaque import validé.';
COMMENT ON FUNCTION app.feuille_levees(uuid, date) IS
  'La feuille du jour d''un circuit : établissements desservis, point, termes en vigueur (flux, conteneur, levées par semaine) et levées déjà proposées ou validées. Le prestataire du circuit n''y voit ni convention ni établissement sans convention.';
COMMENT ON FUNCTION app.levee_a_revoir(uuid) IS
  'Ce qu''une levée proposée ou validée a perdu depuis son enregistrement : l''examen de son jour rejoué avec ce que la base sait aujourd''hui (code et message), ou une convention, une desserte qui ne sont plus les siennes. Constaté, jamais corrigé.';
COMMENT ON FUNCTION app.enregistrer_levees(text, text, jsonb, uuid) IS
  'La seule entrée des levées : saisie du portail (directeur, validée d''emblée), proposition du prestataire depuis sa feuille, import Kobo (directeur, proposée). Un lot s''écrit en entier ou pas du tout ; une clé déjà reçue avec le même contenu est rendue « déjà reçue ».';
