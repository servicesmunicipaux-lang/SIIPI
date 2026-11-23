-- ============================================================================
-- 106 — Jalon G, lot G5b : les campagnes de pesée et les densités des assimilés
--
-- Décisions de Nacer du 12 novembre 2026 (G5, n° 7 à 11) :
--
--   * UNE CAMPAGNE GÉNÉRIQUE, d'établissements ou de ménages : brouillon →
--     ouverte → close ; aucun lien avec un circuit ni un engin. Les pesées se
--     saisissent au portail ou s'importent d'un export Kobo. Pour les ménages, le
--     modèle et ses refus seulement : un code posé par la base (jamais un nom, un
--     numéro de téléphone ou de CIN), le nombre d'habitants, la tranche de revenu ;
--     aucune adresse, aucun secteur, aucun texte libre.
--
--   * UNE PESÉE vise exactement un établissement ou un ménage, selon l'objet de la
--     campagne ; elle porte le poids, la durée de production couverte, le contenant
--     et son volume, le remplissage observé ; le jour de la campagne se calcule.
--     La catégorie, l'unité et la valeur d'échelle de l'établissement y sont
--     FIGÉES au jour de sa saisie : changées ensuite, elles ne réécrivent rien. Un
--     instantané des établissements est pris à l'ouverture de la campagne : un
--     changement en cours de campagne se constate à la clôture, quel que soit
--     l'ordre des saisies (un export Kobo importé après coup compris).
--
--   * LE CALCUL À LA CLÔTURE, jamais saisi (app.calculer_campagne), figé :
--       - les pesées d'un même jour s'additionnent (deux bacs, un jour) ;
--       - kg/jour/unité d'échelle (le ratio du WaCT), par catégorie et unité ;
--       - poids d'une levée (le poids observé), par catégorie et volume de contenant ;
--       - kg/m³ (somme des poids / somme des volumes de déchets), par catégorie ;
--       - 1er quartile, médiane, 3e quartile (percentile_cont) ; seuil atteint si
--         n ≥ le seuil national daté `seuil_echantillon_pesee` (10) ;
--       - chaque établissement écarté l'est avec sa raison ;
--       - ménages : la première pesée de chacun n'est jamais comptée ; une tranche
--         de moins de 5 ménages est masquée.
--     Témoin indépendant : tests/pesees_attendus.py.
--
--   * LES DENSITÉS DES ASSIMILÉS (kg/m³), à part de la grille : par commune, ou
--     nationales (FNCT) ; ne se réécrivent pas, se retirent avec motif ; la commune
--     adopte la densité que sa campagne propose (seuil atteint) ; SIIPI n'en pose
--     aucune. Le tonnage estimé d'une convention — volume des termes × densité, en
--     fourchette, « tous flux confondus » — se montre dans son détail, jamais dans
--     une assiette, et n'existe que si rien ne manque.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Le seuil d'échantillon, paramètre national daté
-- ---------------------------------------------------------------------------
INSERT INTO definitions_parametres_nationaux
  (code, nature, unite, borne_min, borne_max, libelle_fr, libelle_ar, description, ordre, rubrique, entier) VALUES
  ('seuil_echantillon_pesee', 'nombre', 'établissements', 2, 1001,
   'Seuil d''échantillon d''une campagne de pesée', 'عتبة العيّنة في حملة الوزن',
   'Nombre d''établissements pesés par catégorie au-dessous duquel une campagne de pesée ne propose aucune densité ni aucun ratio.',
   80, 'general', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO valeurs_parametres_nationaux (code, date_effet, valeur_nombre, provisoire, reference)
SELECT 'seuil_echantillon_pesee', DATE '2000-01-01', 10, false,
       'Décision de la FNCT du 12/11/2026 (jalon G, G5 n° 10) : 10 établissements par catégorie'
 WHERE NOT EXISTS (SELECT 1 FROM valeurs_parametres_nationaux x WHERE x.code = 'seuil_echantillon_pesee');

-- ---------------------------------------------------------------------------
-- 2. Les campagnes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campagnes_pesee (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id      TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    objet           TEXT NOT NULL,
    intitule        TEXT NOT NULL,
    protocole       TEXT,
    date_debut      DATE NOT NULL,
    date_fin        DATE NOT NULL,
    statut          TEXT NOT NULL DEFAULT 'brouillon',
    ouverte_le      TIMESTAMPTZ,
    ouverte_par     UUID REFERENCES users(id) ON DELETE SET NULL,
    close_le        TIMESTAMPTZ,
    close_par       UUID REFERENCES users(id) ON DELETE SET NULL,
    seuil_applique  INTEGER,
    observation     TEXT,
    saisi_par       UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    provenance      TEXT NOT NULL DEFAULT 'reel',
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT campagnes_objet CHECK (objet IN ('etablissements', 'menages')),
    CONSTRAINT campagnes_statut CHECK (statut IN ('brouillon', 'ouverte', 'close')),
    CONSTRAINT campagnes_intitule CHECK (length(btrim(intitule)) BETWEEN 3 AND 200),
    CONSTRAINT campagnes_textes CHECK ((protocole IS NULL OR length(protocole) <= 2000) AND (observation IS NULL OR length(observation) <= 1000)),
    -- Une campagne dure au plus soixante et un jours : au-delà, ce n'est plus une campagne mais un suivi.
    CONSTRAINT campagnes_periode CHECK (date_debut >= DATE '2000-01-01' AND date_fin >= date_debut AND date_fin <= date_debut + 60),
    CONSTRAINT campagnes_ouverture CHECK ((statut = 'brouillon') = (ouverte_le IS NULL)),
    CONSTRAINT campagnes_cloture CHECK ((statut = 'close') = (close_le IS NOT NULL) AND (statut = 'close') = (seuil_applique IS NOT NULL)),
    CONSTRAINT campagnes_provenance CHECK (provenance IN ('reel', 'simule'))
);
CREATE INDEX IF NOT EXISTS idx_campagnes_pesee_commune ON campagnes_pesee (commune_id, date_debut DESC) WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION app.controler_campagne_pesee()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_derniere date;
BEGIN
  IF NOT app.peut_emettre_document(NEW.commune_id) THEN
    RAISE EXCEPTION 'CAMPAGNE_HORS_PERIMETRE' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.statut <> 'brouillon' OR NEW.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'CAMPAGNE_NAISSANCE: une campagne naît brouillon.' USING ERRCODE = 'check_violation';
    END IF;
    NEW.saisi_par := app.current_user_id();
    NEW.created_at := now();
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
  IF to_jsonb(NEW) = to_jsonb(OLD) THEN
    RETURN NEW;
  END IF;
  IF NEW.commune_id IS DISTINCT FROM OLD.commune_id OR NEW.objet IS DISTINCT FROM OLD.objet
     OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.saisi_par IS DISTINCT FROM OLD.saisi_par THEN
    RAISE EXCEPTION 'CAMPAGNE_FIGEE: une campagne garde sa commune et son objet.' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.statut = 'close' OR OLD.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'CAMPAGNE_FIGEE: une campagne close est figée, avec ses pesées et ses résultats.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.deleted_at IS NOT NULL AND OLD.statut <> 'brouillon' THEN
    RAISE EXCEPTION 'CAMPAGNE_FIGEE: seule une campagne en brouillon se retire ; une campagne ouverte se clôt.' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT ((OLD.statut = NEW.statut) OR (OLD.statut = 'brouillon' AND NEW.statut = 'ouverte') OR (OLD.statut = 'ouverte' AND NEW.statut = 'close')) THEN
    RAISE EXCEPTION 'CAMPAGNE_TRANSITION: une campagne va du brouillon à l''ouverture, puis à la clôture.' USING ERRCODE = 'check_violation';
  END IF;
  -- Ouverte : seules la fin prévue (prolonger ou écourter) et l'observation changent,
  -- et la fin ne passe jamais avant une pesée déjà faite.
  IF OLD.statut = 'ouverte' AND NEW.statut = 'ouverte' THEN
    IF (to_jsonb(NEW) - ARRAY['date_fin', 'observation', 'updated_at']) <> (to_jsonb(OLD) - ARRAY['date_fin', 'observation', 'updated_at']) THEN
      RAISE EXCEPTION 'CAMPAGNE_FIGEE: une campagne ouverte ne change plus que sa fin prévue et son observation.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.date_fin IS DISTINCT FROM OLD.date_fin THEN
    SELECT max(p.date_pesee) INTO v_derniere FROM pesees_campagne p WHERE p.campagne_id = NEW.id AND p.statut = 'valide';
    IF v_derniere IS NOT NULL AND NEW.date_fin < v_derniere THEN
      RAISE EXCEPTION 'CAMPAGNE_PESEES_APRES: une pesée du % est enregistrée ; la campagne finit au plus tôt ce jour-là.', to_char(v_derniere, 'DD/MM/YYYY')
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_controler_campagne_pesee ON campagnes_pesee;
CREATE TRIGGER trg_controler_campagne_pesee BEFORE INSERT OR UPDATE ON campagnes_pesee
  FOR EACH ROW EXECUTE FUNCTION app.controler_campagne_pesee();

-- ---------------------------------------------------------------------------
-- 3. Les ménages d'un échantillon : un code, des habitants, une tranche — rien d'autre
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS menages_echantillon (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campagne_id     UUID NOT NULL REFERENCES campagnes_pesee(id) ON DELETE CASCADE,
    commune_id      TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    rang            INTEGER NOT NULL,
    code            TEXT GENERATED ALWAYS AS ('M-' || lpad(rang::text, 3, '0')) STORED,
    habitants       SMALLINT NOT NULL,
    tranche_revenu  TEXT NOT NULL,
    saisi_par       UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    provenance      TEXT NOT NULL DEFAULT 'reel',
    CONSTRAINT menages_habitants CHECK (habitants BETWEEN 1 AND 30),
    CONSTRAINT menages_tranche CHECK (tranche_revenu IN ('bas', 'moyen', 'eleve')),
    CONSTRAINT menages_rang CHECK (rang BETWEEN 1 AND 9999),
    CONSTRAINT menages_provenance CHECK (provenance IN ('reel', 'simule'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_menages_rang ON menages_echantillon (campagne_id, rang);

-- Le code d'un ménage, la base le pose (M-001, M-002…) sous le verrou de la campagne :
-- il ne se saisit jamais, et ne peut donc porter ni un nom, ni un numéro de
-- téléphone, ni un numéro de CIN.
CREATE OR REPLACE FUNCTION app.controler_menage()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v campagnes_pesee;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'MENAGE_FIGE: un ménage de l''échantillon ne se modifie pas.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v FROM campagnes_pesee WHERE id = NEW.campagne_id AND deleted_at IS NULL FOR SHARE;
  IF v.id IS NULL OR NOT app.peut_emettre_document(v.commune_id) THEN
    RAISE EXCEPTION 'CAMPAGNE_HORS_PERIMETRE' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v.objet <> 'menages' THEN
    RAISE EXCEPTION 'MENAGE_CAMPAGNE: cette campagne pèse des établissements, pas des ménages.' USING ERRCODE = 'check_violation';
  END IF;
  IF v.statut = 'close' THEN
    RAISE EXCEPTION 'CAMPAGNE_FIGEE: une campagne close est figée.' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('menages:' || NEW.campagne_id::text));
  NEW.commune_id := v.commune_id;
  NEW.rang := COALESCE((SELECT max(m.rang) FROM menages_echantillon m WHERE m.campagne_id = NEW.campagne_id), 0) + 1;
  NEW.saisi_par := app.current_user_id();
  NEW.created_at := now();
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_controler_menage ON menages_echantillon;
CREATE TRIGGER trg_controler_menage BEFORE INSERT OR UPDATE ON menages_echantillon
  FOR EACH ROW EXECUTE FUNCTION app.controler_menage();

-- ---------------------------------------------------------------------------
-- 4. Les imports Kobo des pesées : le journal et la correspondance gardée
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS imports_pesees (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id         TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    campagne_id        UUID NOT NULL REFERENCES campagnes_pesee(id) ON DELETE CASCADE,
    nom_fichier        TEXT NOT NULL,
    empreinte_fichier  TEXT NOT NULL,
    correspondance     JSONB NOT NULL,
    nb_enregistrees    INTEGER NOT NULL,
    nb_deja_recues     INTEGER NOT NULL,
    nb_erreurs         INTEGER NOT NULL,
    saisi_par          UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    provenance         TEXT NOT NULL DEFAULT 'reel',
    deleted_at         TIMESTAMPTZ,
    deleted_by         UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT imports_pesees_nom CHECK (length(btrim(nom_fichier)) BETWEEN 1 AND 255),
    CONSTRAINT imports_pesees_empreinte CHECK (empreinte_fichier ~ '^[0-9a-f]{64}$'),
    CONSTRAINT imports_pesees_correspondance CHECK (jsonb_typeof(correspondance) = 'object'),
    CONSTRAINT imports_pesees_comptes CHECK (nb_enregistrees >= 1 AND nb_deja_recues >= 0 AND nb_erreurs >= 0),
    CONSTRAINT imports_pesees_provenance CHECK (provenance IN ('reel', 'simule'))
);
CREATE INDEX IF NOT EXISTS idx_imports_pesees_campagne ON imports_pesees (campagne_id, created_at DESC);
DROP TRIGGER IF EXISTS trg_import_journalise ON imports_pesees;
CREATE TRIGGER trg_import_journalise BEFORE UPDATE ON imports_pesees
  FOR EACH ROW EXECUTE FUNCTION app.refuser_modification_import();

CREATE TABLE IF NOT EXISTS modeles_import_pesees (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id      TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    correspondance  JSONB NOT NULL,
    saisi_par       UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    provenance      TEXT NOT NULL DEFAULT 'reel',
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT modeles_import_pesees_correspondance CHECK (jsonb_typeof(correspondance) = 'object'),
    CONSTRAINT modeles_import_pesees_provenance CHECK (provenance IN ('reel', 'simule'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_modeles_import_pesees ON modeles_import_pesees (commune_id) WHERE deleted_at IS NULL;

-- Les établissements de la commune tels qu'ils étaient à l'ouverture d'une campagne :
-- écrit par app.ouvrir_campagne, jamais par l'application, jamais réécrit.
CREATE TABLE IF NOT EXISTS instantanes_campagne (
    campagne_id          UUID NOT NULL REFERENCES campagnes_pesee(id) ON DELETE CASCADE,
    commune_id           TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    commerce_id          UUID NOT NULL REFERENCES commerces(id) ON DELETE CASCADE,
    categorie_activite   TEXT,
    unite_echelle        TEXT,
    valeur_echelle       NUMERIC(12, 2),
    provenance           TEXT NOT NULL DEFAULT 'reel',
    PRIMARY KEY (campagne_id, commerce_id),
    CONSTRAINT instantanes_campagne_provenance CHECK (provenance IN ('reel', 'simule'))
);

-- ---------------------------------------------------------------------------
-- 5. Les pesées
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pesees_campagne (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campagne_id          UUID NOT NULL REFERENCES campagnes_pesee(id) ON DELETE CASCADE,
    commune_id           TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    commerce_id          UUID REFERENCES commerces(id) ON DELETE CASCADE,
    menage_id            UUID REFERENCES menages_echantillon(id) ON DELETE CASCADE,
    date_pesee           DATE NOT NULL,
    jour_campagne        SMALLINT NOT NULL,
    poids_kg             NUMERIC(10, 3) NOT NULL,
    duree_jours          NUMERIC NOT NULL,
    contenant            TEXT,
    volume_litres        NUMERIC(8, 1),
    remplissage_pct      NUMERIC(5, 1),
    -- L'établissement tel qu'il était le jour où la pesée a été saisie.
    categorie_activite   TEXT,
    unite_echelle        TEXT,
    valeur_echelle       NUMERIC(12, 2),
    source               TEXT NOT NULL,
    cle_envoi            TEXT NOT NULL,
    statut               TEXT NOT NULL DEFAULT 'valide',
    annulee_le           TIMESTAMPTZ,
    annulee_par          UUID REFERENCES users(id) ON DELETE SET NULL,
    motif_annulation     TEXT,
    import_id            UUID REFERENCES imports_pesees(id) ON DELETE CASCADE,
    import_ligne         INTEGER,
    saisi_par            UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    provenance           TEXT NOT NULL DEFAULT 'reel',
    CONSTRAINT pesees_campagne_cible CHECK ((commerce_id IS NULL) <> (menage_id IS NULL)),
    CONSTRAINT pesees_campagne_poids CHECK (poids_kg > 0 AND poids_kg <= 5000),
    CONSTRAINT pesees_campagne_duree CHECK (duree_jours > 0 AND duree_jours <= 31),
    CONSTRAINT pesees_campagne_volume CHECK (volume_litres IS NULL OR (volume_litres > 0 AND volume_litres <= 30000)),
    CONSTRAINT pesees_campagne_remplissage CHECK (remplissage_pct IS NULL OR (remplissage_pct > 0 AND remplissage_pct <= 100)),
    CONSTRAINT pesees_campagne_contenant CHECK (contenant IS NULL OR length(btrim(contenant)) BETWEEN 1 AND 60),
    -- Une pesée de ménage ne porte que son poids et sa durée : aucun texte où glisser un nom.
    CONSTRAINT pesees_campagne_menage CHECK (menage_id IS NULL OR (contenant IS NULL AND volume_litres IS NULL AND remplissage_pct IS NULL)),
    CONSTRAINT pesees_campagne_jour CHECK (jour_campagne BETWEEN 1 AND 61),
    CONSTRAINT pesees_campagne_source CHECK (source IN ('portail', 'kobo')),
    CONSTRAINT pesees_campagne_cle CHECK (length(btrim(cle_envoi)) BETWEEN 1 AND 200),
    CONSTRAINT pesees_campagne_statut CHECK (statut IN ('valide', 'annulee')),
    CONSTRAINT pesees_campagne_annulation CHECK ((statut = 'annulee') = (annulee_le IS NOT NULL)
                                                 AND (statut <> 'annulee' OR length(btrim(COALESCE(motif_annulation, ''))) >= 5)),
    CONSTRAINT pesees_campagne_import CHECK ((source = 'kobo') = (import_id IS NOT NULL)
                                             AND (import_id IS NULL) = (import_ligne IS NULL)
                                             AND (import_ligne IS NULL OR import_ligne >= 2)),
    CONSTRAINT pesees_campagne_provenance CHECK (provenance IN ('reel', 'simule'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pesees_campagne_cle ON pesees_campagne (commune_id, cle_envoi);
CREATE INDEX IF NOT EXISTS idx_pesees_campagne ON pesees_campagne (campagne_id, date_pesee);

CREATE OR REPLACE FUNCTION app.controler_pesee_campagne()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v        campagnes_pesee;
  v_co     record;
  v_duree  numeric;
  v_jour   text := to_char(NEW.date_pesee, 'DD/MM/YYYY');
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Seule l'annulation, une fois, avec son motif ; le reste ne se réécrit pas.
    IF OLD.statut = 'valide' AND NEW.statut = 'annulee'
       AND (to_jsonb(NEW) - ARRAY['statut', 'annulee_le', 'annulee_par', 'motif_annulation'])
         = (to_jsonb(OLD) - ARRAY['statut', 'annulee_le', 'annulee_par', 'motif_annulation']) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'PESEE_FIGEE: une pesée ne se réécrit pas ; elle s''annule avec un motif tant que la campagne est ouverte.' USING ERRCODE = 'check_violation';
  END IF;

  -- La campagne d'abord, verrouillée en lecture : sa clôture concurrente attend.
  SELECT * INTO v FROM campagnes_pesee WHERE id = NEW.campagne_id AND deleted_at IS NULL FOR SHARE;
  IF v.id IS NULL OR NOT app.peut_emettre_document(v.commune_id) THEN
    RAISE EXCEPTION 'CAMPAGNE_HORS_PERIMETRE' USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.commune_id := v.commune_id;
  IF v.statut <> 'ouverte' THEN
    RAISE EXCEPTION 'PESEE_CAMPAGNE: une pesée s''enregistre dans une campagne ouverte (celle-ci est %).',
      CASE v.statut WHEN 'brouillon' THEN 'en brouillon' ELSE 'close' END USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.date_pesee > app.jour_tunis() THEN
    RAISE EXCEPTION 'PESEE_FUTURE: une pesée se constate après coup : le % n''est pas encore arrivé.', v_jour USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.date_pesee < v.date_debut OR NEW.date_pesee > v.date_fin THEN
    RAISE EXCEPTION 'PESEE_PERIODE: la campagne court du % au % : le % n''en fait pas partie (prolongez-la si la pesée a eu lieu après).',
      to_char(v.date_debut, 'DD/MM/YYYY'), to_char(v.date_fin, 'DD/MM/YYYY'), v_jour USING ERRCODE = 'check_violation';
  END IF;
  NEW.jour_campagne := (NEW.date_pesee - v.date_debut) + 1;

  IF v.objet = 'etablissements' THEN
    IF NEW.commerce_id IS NULL OR NEW.menage_id IS NOT NULL THEN
      RAISE EXCEPTION 'PESEE_CIBLE: une campagne d''établissements pèse un établissement, et lui seul.' USING ERRCODE = 'check_violation';
    END IF;
    SELECT c.nom, c.statut, c.ferme_le, c.categorie_activite, c.unite_echelle, c.valeur_echelle INTO v_co
      FROM commerces c WHERE c.id = NEW.commerce_id AND c.commune_id = v.commune_id AND c.deleted_at IS NULL;
    IF v_co.nom IS NULL THEN
      RAISE EXCEPTION 'PESEE_ETABLISSEMENT: cet établissement n''est pas inscrit dans la commune.' USING ERRCODE = 'check_violation';
    END IF;
    IF v_co.statut = 'ferme' AND v_co.ferme_le <= NEW.date_pesee THEN
      RAISE EXCEPTION 'ETABLISSEMENT_FERME: « % » est fermé depuis le %.', v_co.nom, to_char(v_co.ferme_le, 'DD/MM/YYYY') USING ERRCODE = 'check_violation';
    END IF;
    IF v_co.categorie_activite IS NULL THEN
      RAISE EXCEPTION 'PESEE_CATEGORIE_REQUISE: « % » n''a pas de catégorie d''activité ; donnez-la-lui avant de le peser.', v_co.nom USING ERRCODE = 'check_violation';
    END IF;
    NEW.categorie_activite := v_co.categorie_activite;
    NEW.unite_echelle := v_co.unite_echelle;
    NEW.valeur_echelle := v_co.valeur_echelle;
  ELSE
    IF NEW.menage_id IS NULL OR NEW.commerce_id IS NOT NULL THEN
      RAISE EXCEPTION 'PESEE_CIBLE: une campagne de ménages pèse un ménage de son échantillon, et lui seul.' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM menages_echantillon m WHERE m.id = NEW.menage_id AND m.campagne_id = v.id) THEN
      RAISE EXCEPTION 'PESEE_CIBLE: ce ménage n''est pas de l''échantillon de cette campagne.' USING ERRCODE = 'check_violation';
    END IF;
    NEW.categorie_activite := NULL; NEW.unite_echelle := NULL; NEW.valeur_echelle := NULL;
  END IF;

  -- Un bac de 240 L ne pèse pas une tonne : au-delà de 2 000 kg/m³ (la borne des
  -- densités), c'est un remplissage saisi en fraction (0,5 pour 50 %) ou un volume
  -- faux, qui fausserait toute la densité de la catégorie.
  IF NEW.volume_litres > 0 AND NEW.remplissage_pct > 0
     AND NEW.poids_kg / (NEW.volume_litres / 1000 * NEW.remplissage_pct / 100) > 2000 THEN
    RAISE EXCEPTION 'PESEE_DENSITE: % kg dans % L remplis à % %% font plus de 2 000 kg/m³ : le remplissage se dit en pourcentage (50, et non 0,5) ; vérifiez le volume.',
      trim_scale(NEW.poids_kg), trim_scale(NEW.volume_litres), trim_scale(NEW.remplissage_pct) USING ERRCODE = 'check_violation';
  END IF;

  -- Plusieurs bacs le même jour : une seule durée pour ce jour, sinon le jour
  -- compterait deux fois dans la production. Le couple (cible, jour) est verrouillé :
  -- deux saisies concurrentes (portail et import) ne se voient pas sans lui.
  PERFORM pg_advisory_xact_lock(hashtext('pesee-jour:' || NEW.campagne_id::text || ':'
                                         || COALESCE(NEW.commerce_id, NEW.menage_id)::text || ':' || NEW.date_pesee::text));
  SELECT p.duree_jours INTO v_duree FROM pesees_campagne p
   WHERE p.campagne_id = NEW.campagne_id AND p.statut = 'valide' AND p.date_pesee = NEW.date_pesee
     AND p.commerce_id IS NOT DISTINCT FROM NEW.commerce_id AND p.menage_id IS NOT DISTINCT FROM NEW.menage_id
   LIMIT 1;
  IF v_duree IS NOT NULL AND v_duree <> NEW.duree_jours THEN
    RAISE EXCEPTION 'PESEE_DUREE_DU_JOUR: une pesée du % de cette cible couvre déjà % jour(s) ; les pesées d''un même jour couvrent la même durée.',
      v_jour, trim_scale(v_duree) USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.import_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM imports_pesees i WHERE i.id = NEW.import_id AND i.campagne_id = NEW.campagne_id) THEN
    RAISE EXCEPTION 'PESEE_SOURCE: une pesée importée appartient à la campagne de son import.' USING ERRCODE = 'check_violation';
  END IF;
  NEW.statut := 'valide';
  NEW.annulee_le := NULL; NEW.annulee_par := NULL; NEW.motif_annulation := NULL;
  NEW.saisi_par := app.current_user_id();
  NEW.created_at := now();
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_controler_pesee_campagne ON pesees_campagne;
CREATE TRIGGER trg_controler_pesee_campagne BEFORE INSERT OR UPDATE ON pesees_campagne
  FOR EACH ROW EXECUTE FUNCTION app.controler_pesee_campagne();

-- Toute pesée naît ici, en lot entier ou pas du tout ; une clé déjà reçue avec le
-- même contenu est rendue « déjà reçue », avec un autre contenu le lot est refusé.
CREATE OR REPLACE FUNCTION app.enregistrer_pesees(p_campagne uuid, p_source text, p_lignes jsonb, p_import uuid DEFAULT NULL)
  RETURNS TABLE (n integer, id uuid, deja_recue boolean)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
#variable_conflict use_column
DECLARE
  v_commune text;
  v_l       record;
  v_ex      pesees_campagne;
  v_new     pesees_campagne;
BEGIN
  SELECT c.commune_id INTO v_commune FROM campagnes_pesee c WHERE c.id = p_campagne AND c.deleted_at IS NULL;
  IF v_commune IS NULL OR NOT app.peut_emettre_document(v_commune) THEN
    RAISE EXCEPTION 'CAMPAGNE_HORS_PERIMETRE' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_lignes IS NULL OR jsonb_typeof(p_lignes) <> 'array' OR jsonb_array_length(p_lignes) = 0 THEN
    RAISE EXCEPTION 'PESEE_AUCUNE: aucune pesée à enregistrer.' USING ERRCODE = 'check_violation';
  END IF;
  -- Les écritures d'une commune se suivent : un lot renvoyé deux fois en même temps
  -- (double clic, nouvel essai après une coupure) trouve le premier enregistré et le
  -- rend « déjà reçu », au lieu d'échouer sur l'index des clés.
  PERFORM pg_advisory_xact_lock(hashtext('pesees:' || v_commune));
  FOR v_l IN
    SELECT * FROM jsonb_to_recordset(p_lignes)
      AS x(n integer, commerce uuid, menage uuid, jour date, poids numeric, duree numeric, contenant text, volume numeric,
           remplissage numeric, cle text, ligne integer)
     ORDER BY x.n
  LOOP
    SELECT * INTO v_ex FROM pesees_campagne p WHERE p.commune_id = v_commune AND p.cle_envoi = v_l.cle;
    IF v_ex.id IS NOT NULL THEN
      IF v_ex.campagne_id = p_campagne AND v_ex.commerce_id IS NOT DISTINCT FROM v_l.commerce AND v_ex.menage_id IS NOT DISTINCT FROM v_l.menage
         AND v_ex.date_pesee = v_l.jour AND v_ex.poids_kg = round(v_l.poids, 3) AND v_ex.duree_jours = v_l.duree
         -- La durée, le volume et le remplissage sont les dénominateurs des ratios : une
         -- soumission corrigée sur l'un d'eux n'est pas « déjà reçue ».
         AND v_ex.volume_litres IS NOT DISTINCT FROM round(v_l.volume, 1)
         AND v_ex.remplissage_pct IS NOT DISTINCT FROM round(v_l.remplissage, 1)
         AND v_ex.contenant IS NOT DISTINCT FROM NULLIF(btrim(v_l.contenant), '') THEN
        RETURN QUERY SELECT v_l.n, v_ex.id, true;
        CONTINUE;
      END IF;
      RAISE EXCEPTION 'PESEE_CLE_REUTILISEE: la clé d''envoi « % » a déjà servi à une autre pesée (soumission modifiée après coup ?) ; rien n''est enregistré.',
        v_l.cle USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO pesees_campagne (campagne_id, commune_id, commerce_id, menage_id, date_pesee, jour_campagne, poids_kg, duree_jours,
                                 contenant, volume_litres, remplissage_pct, source, cle_envoi, import_id, import_ligne)
    VALUES (p_campagne, v_commune, v_l.commerce, v_l.menage, v_l.jour, 1, v_l.poids, v_l.duree,
            NULLIF(btrim(v_l.contenant), ''), v_l.volume, v_l.remplissage, p_source, v_l.cle, p_import,
            CASE WHEN p_import IS NOT NULL THEN v_l.ligne END)
    RETURNING * INTO v_new;
    RETURN QUERY SELECT v_l.n, v_new.id, false;
  END LOOP;
END
$$;
REVOKE ALL ON FUNCTION app.enregistrer_pesees(uuid, text, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.enregistrer_pesees(uuid, text, jsonb, uuid) TO siipi_app;

CREATE OR REPLACE FUNCTION app.annuler_pesee(p_id uuid, p_motif text)
  RETURNS pesees_campagne LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_c  campagnes_pesee;
  v    pesees_campagne;
BEGIN
  SELECT c.* INTO v_c FROM campagnes_pesee c JOIN pesees_campagne p ON p.campagne_id = c.id WHERE p.id = p_id FOR SHARE OF c;
  IF v_c.id IS NULL OR NOT app.peut_emettre_document(v_c.commune_id) THEN
    RAISE EXCEPTION 'PESEE_INTROUVABLE' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO v FROM pesees_campagne WHERE id = p_id FOR UPDATE;
  IF v_c.statut <> 'ouverte' THEN
    RAISE EXCEPTION 'CAMPAGNE_FIGEE: une campagne close est figée, avec ses pesées.' USING ERRCODE = 'check_violation';
  END IF;
  IF v.statut <> 'valide' THEN
    RAISE EXCEPTION 'PESEE_DEJA_ANNULEE: cette pesée est déjà annulée.' USING ERRCODE = 'check_violation';
  END IF;
  IF length(btrim(COALESCE(p_motif, ''))) < 5 THEN
    RAISE EXCEPTION 'PESEE_MOTIF: une pesée s''annule avec son motif (5 caractères au moins).' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE pesees_campagne SET statut = 'annulee', annulee_le = now(), annulee_par = app.current_user_id(), motif_annulation = btrim(p_motif)
   WHERE id = p_id RETURNING * INTO v;
  RETURN v;
END
$$;
REVOKE ALL ON FUNCTION app.annuler_pesee(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.annuler_pesee(uuid, text) TO siipi_app;

-- ---------------------------------------------------------------------------
-- 6. Les résultats figés à la clôture
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS resultats_campagne (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campagne_id   UUID NOT NULL REFERENCES campagnes_pesee(id) ON DELETE CASCADE,
    commune_id    TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    groupe        TEXT NOT NULL,
    sous_groupe   TEXT NOT NULL DEFAULT '',
    indicateur    TEXT NOT NULL,
    n             INTEGER NOT NULL,
    -- La précision des mesures : un ratio au m² vaut quelques millièmes.
    q1            NUMERIC(20, 6),
    mediane       NUMERIC(20, 6),
    q3            NUMERIC(20, 6),
    seuil_atteint BOOLEAN,
    masque        BOOLEAN NOT NULL DEFAULT false,
    provenance    TEXT NOT NULL DEFAULT 'reel',
    CONSTRAINT resultats_indicateur CHECK (indicateur IN ('kg_jour_unite', 'kg_levee', 'kg_m3', 'kg_hab_jour')),
    CONSTRAINT resultats_masque CHECK (NOT masque OR (q1 IS NULL AND mediane IS NULL AND q3 IS NULL)),
    CONSTRAINT resultats_provenance CHECK (provenance IN ('reel', 'simule'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_resultats_campagne ON resultats_campagne (campagne_id, groupe, sous_groupe, indicateur);

-- La valeur de chaque établissement ou ménage, pour chaque indicateur : ce dont les
-- quartiles sont faits, lisible.
CREATE TABLE IF NOT EXISTS mesures_campagne (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campagne_id   UUID NOT NULL REFERENCES campagnes_pesee(id) ON DELETE CASCADE,
    commune_id    TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    commerce_id   UUID REFERENCES commerces(id) ON DELETE CASCADE,
    menage_id     UUID REFERENCES menages_echantillon(id) ON DELETE CASCADE,
    groupe        TEXT NOT NULL,
    sous_groupe   TEXT NOT NULL DEFAULT '',
    indicateur    TEXT NOT NULL,
    valeur        NUMERIC(18, 6),
    raison_ecart  TEXT,
    provenance    TEXT NOT NULL DEFAULT 'reel',
    CONSTRAINT mesures_cible CHECK ((commerce_id IS NULL) <> (menage_id IS NULL)),
    CONSTRAINT mesures_valeur_ou_ecart CHECK ((valeur IS NULL) <> (raison_ecart IS NULL)),
    CONSTRAINT mesures_raison CHECK (raison_ecart IS NULL OR raison_ecart IN
      ('sans_unite', 'echelle_modifiee', 'categorie_modifiee', 'sans_volume', 'sans_volume_ou_remplissage', 'une_seule_pesee', 'aucune_pesee')),
    CONSTRAINT mesures_provenance CHECK (provenance IN ('reel', 'simule'))
);
CREATE INDEX IF NOT EXISTS idx_mesures_campagne ON mesures_campagne (campagne_id, indicateur, groupe);

-- Le calcul de la clôture. Rien n'y est saisi : tout vient des pesées valides, et
-- des catégories, unités et valeurs d'échelle figées sur elles. Interne : appelé par
-- app.clore_campagne, sous le verrou de la campagne.
CREATE OR REPLACE FUNCTION app.calculer_campagne(p_campagne uuid, p_seuil integer, p_masque integer DEFAULT 5)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v campagnes_pesee;
BEGIN
  SELECT * INTO v FROM campagnes_pesee WHERE id = p_campagne;
  DELETE FROM mesures_campagne WHERE campagne_id = p_campagne;
  DELETE FROM resultats_campagne WHERE campagne_id = p_campagne;

  IF v.objet = 'etablissements' THEN
    -- Par établissement : sa catégorie (une seule, sinon écarté de tout), son unité et
    -- sa valeur d'échelle (les mêmes à chaque pesée, sinon écarté du ratio par unité).
    DROP TABLE IF EXISTS _pc_p, _pc_e, _pc_j, _pc_jm;
    CREATE TEMP TABLE _pc_p ON COMMIT DROP AS
      SELECT * FROM pesees_campagne WHERE campagne_id = p_campagne AND statut = 'valide' AND commerce_id IS NOT NULL;
    -- Une pesée fige l'établissement tel qu'il est le jour où elle est SAISIE. Un
    -- export Kobo importé après un changement donnerait la nouvelle valeur à toutes
    -- les pesées d'avant : l'instantané pris à l'ouverture entre donc dans le compte
    -- des valeurs, et le changement se voit quel que soit l'ordre des saisies.
    CREATE TEMP TABLE _pc_e ON COMMIT DROP AS
      SELECT x.commerce_id,
             min(x.categorie_activite) FILTER (WHERE x.pesee) AS categorie,
             count(DISTINCT x.categorie_activite) AS n_categories,
             bool_or(x.unite_echelle IS NULL) FILTER (WHERE x.pesee) AS sans_unite,
             count(DISTINCT x.unite_echelle) AS n_unites,
             count(DISTINCT x.valeur_echelle) AS n_valeurs,
             min(x.unite_echelle) FILTER (WHERE x.pesee) AS unite,
             min(x.valeur_echelle) FILTER (WHERE x.pesee) AS valeur
        FROM (SELECT commerce_id, categorie_activite, unite_echelle, valeur_echelle, true AS pesee FROM _pc_p
              UNION ALL
              SELECT i.commerce_id, i.categorie_activite, i.unite_echelle, i.valeur_echelle, false
                FROM instantanes_campagne i
               WHERE i.campagne_id = p_campagne AND i.commerce_id IN (SELECT commerce_id FROM _pc_p)) x
       GROUP BY x.commerce_id;
    -- Un jour, un poids : les bacs du même jour s'additionnent, leur durée commune compte une fois.
    CREATE TEMP TABLE _pc_j ON COMMIT DROP AS
      SELECT commerce_id, date_pesee, sum(poids_kg) AS poids, max(duree_jours) AS duree FROM _pc_p GROUP BY commerce_id, date_pesee;

    -- kg/jour/unité d'échelle
    INSERT INTO mesures_campagne (campagne_id, commune_id, commerce_id, groupe, sous_groupe, indicateur, valeur, raison_ecart)
    SELECT p_campagne, v.commune_id, e.commerce_id, e.categorie,
           CASE WHEN e.n_categories > 1 OR e.sans_unite THEN '' ELSE e.unite END,
           'kg_jour_unite',
           CASE WHEN e.n_categories = 1 AND NOT e.sans_unite AND e.n_unites = 1 AND e.n_valeurs = 1
                THEN (SELECT (sum(j.poids) / sum(j.duree))::double precision FROM _pc_j j WHERE j.commerce_id = e.commerce_id) / e.valeur::double precision END,
           CASE WHEN e.n_categories > 1 THEN 'categorie_modifiee'
                WHEN e.sans_unite THEN 'sans_unite'
                WHEN e.n_unites > 1 OR e.n_valeurs > 1 THEN 'echelle_modifiee' END
      FROM _pc_e e;

    -- Poids d'une levée, par volume de contenant (le poids observé)
    INSERT INTO mesures_campagne (campagne_id, commune_id, commerce_id, groupe, sous_groupe, indicateur, valeur, raison_ecart)
    SELECT p_campagne, v.commune_id, e.commerce_id, e.categorie, trim_scale(p.volume_litres)::text, 'kg_levee',
           avg(p.poids_kg::double precision), NULL
      FROM _pc_e e JOIN _pc_p p ON p.commerce_id = e.commerce_id
     WHERE e.n_categories = 1 AND p.volume_litres IS NOT NULL
     GROUP BY e.commerce_id, e.categorie, p.volume_litres;
    INSERT INTO mesures_campagne (campagne_id, commune_id, commerce_id, groupe, sous_groupe, indicateur, valeur, raison_ecart)
    SELECT p_campagne, v.commune_id, e.commerce_id, e.categorie, '', 'kg_levee', NULL,
           CASE WHEN e.n_categories > 1 THEN 'categorie_modifiee' ELSE 'sans_volume' END
      FROM _pc_e e
     WHERE e.n_categories > 1 OR NOT EXISTS (SELECT 1 FROM _pc_p p WHERE p.commerce_id = e.commerce_id AND p.volume_litres IS NOT NULL);

    -- kg/m³ : somme des poids / somme des volumes de déchets
    INSERT INTO mesures_campagne (campagne_id, commune_id, commerce_id, groupe, sous_groupe, indicateur, valeur, raison_ecart)
    SELECT p_campagne, v.commune_id, e.commerce_id, e.categorie, '', 'kg_m3',
           CASE WHEN e.n_categories = 1 AND x.volume > 0 THEN x.poids / x.volume END,
           CASE WHEN e.n_categories > 1 THEN 'categorie_modifiee'
                WHEN x.volume IS NULL OR x.volume = 0 THEN 'sans_volume_ou_remplissage' END
      FROM _pc_e e
      LEFT JOIN LATERAL (
        SELECT sum(p.poids_kg)::double precision AS poids,
               sum(p.volume_litres::double precision / 1000 * p.remplissage_pct::double precision / 100) AS volume
          FROM _pc_p p WHERE p.commerce_id = e.commerce_id AND p.volume_litres IS NOT NULL AND p.remplissage_pct IS NOT NULL) x ON true;

    INSERT INTO resultats_campagne (campagne_id, commune_id, groupe, sous_groupe, indicateur, n, q1, mediane, q3, seuil_atteint, masque)
    SELECT p_campagne, v.commune_id, m.groupe, m.sous_groupe, m.indicateur, count(*),
           percentile_cont(0.25) WITHIN GROUP (ORDER BY m.valeur::double precision),
           percentile_cont(0.5) WITHIN GROUP (ORDER BY m.valeur::double precision),
           percentile_cont(0.75) WITHIN GROUP (ORDER BY m.valeur::double precision),
           count(*) >= p_seuil, false
      FROM mesures_campagne m
     WHERE m.campagne_id = p_campagne AND m.valeur IS NOT NULL
     GROUP BY m.groupe, m.sous_groupe, m.indicateur;
  ELSE
    -- Ménages : la première journée pesée de chacun porte ce qui s'était accumulé
    -- avant la campagne ; elle n'est jamais comptée.
    DROP TABLE IF EXISTS _pc_jm;
    CREATE TEMP TABLE _pc_jm ON COMMIT DROP AS
      SELECT p.menage_id, p.date_pesee, sum(p.poids_kg) AS poids, max(p.duree_jours) AS duree
        FROM pesees_campagne p WHERE p.campagne_id = p_campagne AND p.statut = 'valide' AND p.menage_id IS NOT NULL
       GROUP BY p.menage_id, p.date_pesee;
    INSERT INTO mesures_campagne (campagne_id, commune_id, menage_id, groupe, sous_groupe, indicateur, valeur, raison_ecart)
    SELECT p_campagne, v.commune_id, m.id, m.tranche_revenu, '', 'kg_hab_jour',
           CASE WHEN x.duree > 0 THEN x.poids / (m.habitants * x.duree) END,
           CASE WHEN d.premier IS NULL THEN 'aucune_pesee'
                WHEN x.duree IS NULL OR x.duree = 0 THEN 'une_seule_pesee' END
      FROM menages_echantillon m
      -- Un ménage inscrit et jamais pesé est écarté avec sa raison, pas oublié.
      LEFT JOIN LATERAL (SELECT min(j.date_pesee) AS premier FROM _pc_jm j WHERE j.menage_id = m.id) d ON true
      LEFT JOIN LATERAL (
        SELECT sum(j.poids)::double precision AS poids, sum(j.duree)::double precision AS duree
          FROM _pc_jm j WHERE j.menage_id = m.id AND j.date_pesee > d.premier) x ON true
     WHERE m.campagne_id = p_campagne;
    -- Une tranche de moins de p_masque ménages ne se publie pas : elle désignerait des foyers.
    INSERT INTO resultats_campagne (campagne_id, commune_id, groupe, sous_groupe, indicateur, n, q1, mediane, q3, seuil_atteint, masque)
    SELECT p_campagne, v.commune_id, m.groupe, '', 'kg_hab_jour', count(*),
           CASE WHEN count(*) >= p_masque THEN percentile_cont(0.25) WITHIN GROUP (ORDER BY m.valeur::double precision) END,
           CASE WHEN count(*) >= p_masque THEN percentile_cont(0.5) WITHIN GROUP (ORDER BY m.valeur::double precision) END,
           CASE WHEN count(*) >= p_masque THEN percentile_cont(0.75) WITHIN GROUP (ORDER BY m.valeur::double precision) END,
           NULL, count(*) < p_masque
      FROM mesures_campagne m
     WHERE m.campagne_id = p_campagne AND m.valeur IS NOT NULL
     GROUP BY m.groupe;
  END IF;
END
$$;
REVOKE ALL ON FUNCTION app.calculer_campagne(uuid, integer, integer) FROM PUBLIC;

-- Les gestes de la campagne, sous verrou, avec la version lue (le xmin).
CREATE OR REPLACE FUNCTION app._campagne_a_traiter(p_id uuid, p_version text)
  RETURNS campagnes_pesee LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v campagnes_pesee;
  v_version text;
BEGIN
  SELECT * INTO v FROM campagnes_pesee c WHERE c.id = p_id AND c.deleted_at IS NULL FOR UPDATE;
  SELECT c.xmin::text INTO v_version FROM campagnes_pesee c WHERE c.id = p_id;
  IF v.id IS NULL OR NOT app.peut_emettre_document(v.commune_id) THEN
    RAISE EXCEPTION 'CAMPAGNE_INTROUVABLE' USING ERRCODE = 'no_data_found';
  END IF;
  IF p_version IS DISTINCT FROM v_version THEN
    RAISE EXCEPTION 'CAMPAGNE_VERSION: cette campagne a changé depuis que vous l''avez ouverte ; elle est à jour, recommencez.'
      USING ERRCODE = 'serialization_failure';
  END IF;
  RETURN v;
END
$$;
REVOKE ALL ON FUNCTION app._campagne_a_traiter(uuid, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.ouvrir_campagne(p_id uuid, p_version text)
  RETURNS campagnes_pesee LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v campagnes_pesee;
BEGIN
  v := app._campagne_a_traiter(p_id, p_version);
  IF v.statut <> 'brouillon' THEN
    RAISE EXCEPTION 'CAMPAGNE_TRANSITION: seule une campagne en brouillon s''ouvre.' USING ERRCODE = 'check_violation';
  END IF;
  -- Les établissements de la commune tels qu'ils sont à l'ouverture : la référence
  -- à laquelle chaque pesée se compare à la clôture (voir app.calculer_campagne).
  IF v.objet = 'etablissements' THEN
    INSERT INTO instantanes_campagne (campagne_id, commune_id, commerce_id, categorie_activite, unite_echelle, valeur_echelle)
    SELECT p_id, c.commune_id, c.id, c.categorie_activite, c.unite_echelle, c.valeur_echelle
      FROM commerces c WHERE c.commune_id = v.commune_id AND c.deleted_at IS NULL
    ON CONFLICT (campagne_id, commerce_id) DO NOTHING;
  END IF;
  UPDATE campagnes_pesee SET statut = 'ouverte', ouverte_le = now(), ouverte_par = app.current_user_id() WHERE id = p_id RETURNING * INTO v;
  RETURN v;
END
$$;

CREATE OR REPLACE FUNCTION app.clore_campagne(p_id uuid, p_version text)
  RETURNS campagnes_pesee LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v       campagnes_pesee;
  v_seuil numeric;
BEGIN
  v := app._campagne_a_traiter(p_id, p_version);
  IF v.statut <> 'ouverte' THEN
    RAISE EXCEPTION 'CAMPAGNE_TRANSITION: seule une campagne ouverte se clôt.' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pesees_campagne p WHERE p.campagne_id = p_id AND p.statut = 'valide') THEN
    RAISE EXCEPTION 'CAMPAGNE_VIDE: aucune pesée valide : une campagne sans pesée ne se clôt pas (retirez-la, ou pesez).' USING ERRCODE = 'check_violation';
  END IF;
  SELECT valeur_nombre INTO v_seuil FROM app.parametre_national('seuil_echantillon_pesee', app.jour_tunis());
  IF v_seuil IS NULL THEN
    RAISE EXCEPTION 'CAMPAGNE_SEUIL_ABSENT: le seuil d''échantillon national n''est pas fixé aujourd''hui ; la FNCT le fixe dans les paramètres nationaux.'
      USING ERRCODE = 'check_violation';
  END IF;
  PERFORM app.calculer_campagne(p_id, v_seuil::integer);
  UPDATE campagnes_pesee SET statut = 'close', close_le = now(), close_par = app.current_user_id(), seuil_applique = v_seuil::integer
   WHERE id = p_id RETURNING * INTO v;
  RETURN v;
END
$$;
REVOKE ALL ON FUNCTION app.ouvrir_campagne(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.clore_campagne(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.ouvrir_campagne(uuid, text) TO siipi_app;
GRANT EXECUTE ON FUNCTION app.clore_campagne(uuid, text) TO siipi_app;

-- ---------------------------------------------------------------------------
-- 7. Les densités des assimilés (kg/m³)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS densites_assimiles (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id          TEXT REFERENCES communes(id) ON DELETE CASCADE,
    categorie_activite  TEXT NOT NULL,
    densite_min         NUMERIC(10, 3) NOT NULL,
    densite_max         NUMERIC(10, 3) NOT NULL,
    mediane             NUMERIC(10, 3),
    source              TEXT NOT NULL,
    campagne_id         UUID REFERENCES campagnes_pesee(id) ON DELETE CASCADE,
    reference           TEXT,
    date_effet          DATE NOT NULL,
    saisi_par           UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    retire_le           TIMESTAMPTZ,
    retire_par          UUID REFERENCES users(id) ON DELETE SET NULL,
    motif_retrait       TEXT,
    provenance          TEXT NOT NULL DEFAULT 'reel',
    CONSTRAINT densites_assimiles_bornes CHECK (densite_min > 0 AND densite_min <= densite_max AND densite_max <= 2000
                                               AND (mediane IS NULL OR (mediane >= densite_min AND mediane <= densite_max))),
    CONSTRAINT densites_assimiles_source CHECK (source IN ('campagne', 'tadaeem', 'defaut')),
    -- Une densité de campagne vient d'une campagne de la commune ; une autre cite sa pièce.
    CONSTRAINT densites_assimiles_origine CHECK ((source = 'campagne') = (campagne_id IS NOT NULL)
                                                AND (source = 'campagne' OR length(btrim(COALESCE(reference, ''))) >= 5)
                                                AND (source <> 'campagne' OR commune_id IS NOT NULL)),
    CONSTRAINT densites_assimiles_date CHECK (date_effet >= DATE '2000-01-01'),
    CONSTRAINT densites_assimiles_retrait CHECK (retire_le IS NULL OR length(btrim(COALESCE(motif_retrait, ''))) >= 5),
    CONSTRAINT densites_assimiles_provenance CHECK (provenance IN ('reel', 'simule'))
);
-- Une seule valeur vivante par commune (ou pour le pays), catégorie et date d'effet.
CREATE UNIQUE INDEX IF NOT EXISTS uq_densites_assimiles ON densites_assimiles (commune_id, categorie_activite, date_effet)
  NULLS NOT DISTINCT WHERE retire_le IS NULL;

CREATE OR REPLACE FUNCTION app.controler_densite_assimiles()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Le pays : la FNCT. Une commune : son directeur. Jamais l'un à la place de l'autre.
    IF NOT ((NEW.commune_id IS NULL AND app.is_fnct()) OR (NEW.commune_id IS NOT NULL AND app.peut_emettre_document(NEW.commune_id))) THEN
      RAISE EXCEPTION 'DENSITE_HORS_PERIMETRE' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM app.liste_nationale('categories_activite_assimiles', NEW.date_effet) l WHERE l.code = NEW.categorie_activite) THEN
      RAISE EXCEPTION 'DENSITE_CATEGORIE: « % » n''est pas une catégorie d''activité en vigueur le %.', NEW.categorie_activite, to_char(NEW.date_effet, 'DD/MM/YYYY')
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.retire_le := NULL; NEW.retire_par := NULL; NEW.motif_retrait := NULL;
    NEW.saisi_par := app.current_user_id();
    NEW.created_at := now();
    RETURN NEW;
  END IF;
  -- Une valeur ne se réécrit pas : elle se retire, une fois, avec son motif.
  IF OLD.retire_le IS NULL AND NEW.retire_le IS NOT NULL
     AND (to_jsonb(NEW) - ARRAY['retire_le', 'retire_par', 'motif_retrait']) = (to_jsonb(OLD) - ARRAY['retire_le', 'retire_par', 'motif_retrait']) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'DENSITE_FIGEE: une densité ne se réécrit pas ; retirez-la avec un motif et saisissez la bonne.' USING ERRCODE = 'check_violation';
END
$$;
DROP TRIGGER IF EXISTS trg_controler_densite_assimiles ON densites_assimiles;
CREATE TRIGGER trg_controler_densite_assimiles BEFORE INSERT OR UPDATE ON densites_assimiles
  FOR EACH ROW EXECUTE FUNCTION app.controler_densite_assimiles();

-- L'adoption : la densité que la campagne propose (catégorie au seuil atteint) devient
-- celle de la commune, du jour de la clôture (à Tunis) ; le 1er et le 3e quartile
-- en sont les bornes.
CREATE OR REPLACE FUNCTION app.adopter_densite(p_campagne uuid, p_categorie text)
  RETURNS densites_assimiles LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v      campagnes_pesee;
  r      resultats_campagne;
  v_jour date;
  v_ex   densites_assimiles;
  d      densites_assimiles;
BEGIN
  SELECT * INTO v FROM campagnes_pesee WHERE id = p_campagne AND deleted_at IS NULL FOR SHARE;
  IF v.id IS NULL OR NOT app.peut_emettre_document(v.commune_id) THEN
    RAISE EXCEPTION 'CAMPAGNE_INTROUVABLE' USING ERRCODE = 'no_data_found';
  END IF;
  IF v.statut <> 'close' THEN
    RAISE EXCEPTION 'DENSITE_ADOPTION: une densité s''adopte d''une campagne close.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO r FROM resultats_campagne
   WHERE campagne_id = p_campagne AND groupe = p_categorie AND sous_groupe = '' AND indicateur = 'kg_m3';
  IF r.id IS NULL THEN
    RAISE EXCEPTION 'DENSITE_ADOPTION: la campagne n''a mesuré aucune densité pour « % ».', p_categorie USING ERRCODE = 'check_violation';
  END IF;
  IF NOT r.seuil_atteint THEN
    RAISE EXCEPTION 'DENSITE_SOUS_SEUIL: « % » n''a que % établissement(s) pesé(s), sous le seuil de % : la campagne ne propose pas de densité.',
      p_categorie, r.n, v.seuil_applique USING ERRCODE = 'check_violation';
  END IF;
  v_jour := (v.close_le AT TIME ZONE 'Africa/Tunis')::date;
  SELECT * INTO v_ex FROM densites_assimiles
   WHERE commune_id = v.commune_id AND categorie_activite = p_categorie AND date_effet = v_jour AND retire_le IS NULL;
  IF v_ex.id IS NOT NULL THEN
    RAISE EXCEPTION 'DENSITE_EXISTANTE: une densité de « % » vaut déjà dans la commune depuis le % (source : %) ; retirez-la d''abord, avec son motif.',
      p_categorie, to_char(v_jour, 'DD/MM/YYYY'), v_ex.source USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO densites_assimiles (commune_id, categorie_activite, densite_min, densite_max, mediane, source, campagne_id, date_effet)
  VALUES (v.commune_id, p_categorie, round(r.q1, 3), round(r.q3, 3), round(r.mediane, 3), 'campagne', p_campagne, v_jour)
  RETURNING * INTO d;
  RETURN d;
END
$$;

CREATE OR REPLACE FUNCTION app.retirer_densite(p_id uuid, p_motif text)
  RETURNS densites_assimiles LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  d densites_assimiles;
BEGIN
  SELECT * INTO d FROM densites_assimiles WHERE id = p_id FOR UPDATE;
  IF d.id IS NULL OR NOT ((d.commune_id IS NULL AND app.is_fnct()) OR (d.commune_id IS NOT NULL AND app.peut_emettre_document(d.commune_id))) THEN
    RAISE EXCEPTION 'DENSITE_INTROUVABLE' USING ERRCODE = 'no_data_found';
  END IF;
  IF d.retire_le IS NOT NULL THEN
    RAISE EXCEPTION 'DENSITE_FIGEE: cette densité est déjà retirée.' USING ERRCODE = 'check_violation';
  END IF;
  IF length(btrim(COALESCE(p_motif, ''))) < 5 THEN
    RAISE EXCEPTION 'DENSITE_MOTIF: une densité se retire avec son motif (5 caractères au moins).' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE densites_assimiles SET retire_le = now(), retire_par = app.current_user_id(), motif_retrait = btrim(p_motif)
   WHERE id = p_id RETURNING * INTO d;
  RETURN d;
END
$$;
REVOKE ALL ON FUNCTION app.adopter_densite(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.retirer_densite(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.adopter_densite(uuid, text) TO siipi_app;
GRANT EXECUTE ON FUNCTION app.retirer_densite(uuid, text) TO siipi_app;

-- La densité d'une catégorie un jour donné : celle de la commune (la dernière date
-- d'effet passée, non retirée), sinon celle du pays. Une seule définition.
CREATE OR REPLACE FUNCTION app._densite_assimiles(p_commune text, p_categorie text, p_date date)
  RETURNS densites_assimiles LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT d.* FROM densites_assimiles d
   WHERE (d.commune_id = p_commune OR d.commune_id IS NULL) AND d.categorie_activite = p_categorie
     AND d.retire_le IS NULL AND d.date_effet <= p_date
   ORDER BY (d.commune_id IS NULL), d.date_effet DESC, d.created_at DESC
   LIMIT 1
$$;
REVOKE ALL ON FUNCTION app._densite_assimiles(text, text, date) FROM PUBLIC;

-- Le tonnage estimé des levées validées d'une convention sur une période : pour
-- chaque levée, le volume de déchets de son flux dans les termes du jour × la
-- densité de la catégorie de la convention ce jour-là (« tous flux confondus »),
-- en fourchette. Le total n'existe que si rien ne manque : une levée sans volume
-- dans ses termes ou sans densité le rend « non renseigné », et le dit. Jamais
-- additionné à une pesée, jamais dans une assiette.
CREATE OR REPLACE FUNCTION app.tonnage_estime_convention(p_convention uuid, p_debut date, p_fin date)
  RETURNS TABLE (levees integer, sans_volume integer, sans_densite integer, kg_min numeric, kg_max numeric, densites jsonb)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
#variable_conflict use_column
DECLARE
  v_conv record;
BEGIN
  SELECT cv.id, cv.commune_id, lg.categorie_code AS categorie INTO v_conv
    FROM conventions_commerciales cv LEFT JOIN lignes_grille lg ON lg.id = cv.ligne_grille_id
   WHERE cv.id = p_convention AND cv.deleted_at IS NULL;
  IF v_conv.id IS NULL OR NOT app.can_write_commune(v_conv.commune_id) THEN
    RETURN;
  END IF;
  RETURN QUERY
  WITH l AS (
    SELECT lv.id, lv.date_levee,
           (SELECT t.volume_litres FROM app.termes_convention(lv.convention_id, lv.date_levee) t WHERE t.flux_code = lv.flux_code) AS volume,
           app._densite_assimiles(v_conv.commune_id, v_conv.categorie, lv.date_levee) AS d
      FROM levees lv
     WHERE lv.convention_id = p_convention AND lv.statut = 'validee' AND lv.date_levee BETWEEN p_debut AND p_fin
  ), s AS (
    SELECT count(*)::int AS nb,
           count(*) FILTER (WHERE l.volume IS NULL)::int AS nv,
           count(*) FILTER (WHERE (l.d).id IS NULL)::int AS nd,
           sum(l.volume / 1000 * (l.d).densite_min) AS mn,
           sum(l.volume / 1000 * (l.d).densite_max) AS mx,
           COALESCE(jsonb_agg(DISTINCT jsonb_build_object('id', (l.d).id, 'source', (l.d).source, 'portee',
                      CASE WHEN (l.d).commune_id IS NULL THEN 'nationale' ELSE 'commune' END,
                      'densite_min', (l.d).densite_min, 'densite_max', (l.d).densite_max, 'date_effet', (l.d).date_effet))
                    FILTER (WHERE (l.d).id IS NOT NULL), '[]'::jsonb) AS ds
      FROM l
  )
  SELECT s.nb, s.nv, s.nd,
         CASE WHEN s.nb > 0 AND s.nv = 0 AND s.nd = 0 THEN round(s.mn, 1) END,
         CASE WHEN s.nb > 0 AND s.nv = 0 AND s.nd = 0 THEN round(s.mx, 1) END,
         s.ds
    FROM s;
END
$$;
REVOKE ALL ON FUNCTION app.tonnage_estime_convention(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.tonnage_estime_convention(uuid, date, date) TO siipi_app;

-- ---------------------------------------------------------------------------
-- 8. Provenance, audit, cloisonnement, droits
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['campagnes_pesee', 'menages_echantillon', 'imports_pesees', 'modeles_import_pesees', 'pesees_campagne',
                           'resultats_campagne', 'mesures_campagne', 'instantanes_campagne'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_provenance ON %I', t);
    EXECUTE format('CREATE TRIGGER trg_provenance BEFORE INSERT OR UPDATE OF provenance ON %I FOR EACH ROW EXECUTE FUNCTION app.controler_provenance()', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE DELETE, TRUNCATE ON %I FROM siipi_app', t);
  END LOOP;
  -- Le calcul de la clôture écrit ses résultats d'un coup : ce ne sont pas des gestes à journaliser un à un.
  FOREACH t IN ARRAY ARRAY['campagnes_pesee', 'menages_echantillon', 'imports_pesees', 'modeles_import_pesees', 'pesees_campagne', 'densites_assimiles'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%s ON %I', t, t);
    EXECUTE format('CREATE TRIGGER trg_audit_%s AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement()', t, t);
  END LOOP;
END $$;

-- La campagne : le directeur écrit, la FNCT lit ; un prestataire ne voit rien.
DROP POLICY IF EXISTS campagnes_pesee_select ON campagnes_pesee;
CREATE POLICY campagnes_pesee_select ON campagnes_pesee FOR SELECT USING (deleted_at IS NULL AND app.can_write_commune(commune_id));
DROP POLICY IF EXISTS campagnes_pesee_insert ON campagnes_pesee;
CREATE POLICY campagnes_pesee_insert ON campagnes_pesee FOR INSERT WITH CHECK (app.peut_emettre_document(commune_id));
DROP POLICY IF EXISTS campagnes_pesee_update ON campagnes_pesee;
CREATE POLICY campagnes_pesee_update ON campagnes_pesee FOR UPDATE
  USING (deleted_at IS NULL AND app.peut_emettre_document(commune_id)) WITH CHECK (app.peut_emettre_document(commune_id));
GRANT SELECT ON campagnes_pesee TO siipi_app;
REVOKE INSERT, UPDATE ON campagnes_pesee FROM siipi_app;
GRANT INSERT (commune_id, objet, intitule, protocole, date_debut, date_fin, observation, provenance) ON campagnes_pesee TO siipi_app;
GRANT UPDATE (intitule, protocole, date_debut, date_fin, observation) ON campagnes_pesee TO siipi_app;

-- Les ménages et leurs mesures : le directeur seul. La FNCT lit les résultats par
-- tranche, jamais un ménage.
DROP POLICY IF EXISTS menages_echantillon_select ON menages_echantillon;
CREATE POLICY menages_echantillon_select ON menages_echantillon FOR SELECT USING (app.peut_emettre_document(commune_id));
DROP POLICY IF EXISTS menages_echantillon_insert ON menages_echantillon;
CREATE POLICY menages_echantillon_insert ON menages_echantillon FOR INSERT WITH CHECK (app.peut_emettre_document(commune_id));
GRANT SELECT ON menages_echantillon TO siipi_app;
REVOKE INSERT, UPDATE ON menages_echantillon FROM siipi_app;
GRANT INSERT (campagne_id, commune_id, habitants, tranche_revenu, provenance) ON menages_echantillon TO siipi_app;

-- Les pesées : lues par la commune et la FNCT (celles d'un ménage, par le directeur
-- seul) ; écrites par app.enregistrer_pesees et app.annuler_pesee.
DROP POLICY IF EXISTS pesees_campagne_select ON pesees_campagne;
CREATE POLICY pesees_campagne_select ON pesees_campagne FOR SELECT
  USING (CASE WHEN menage_id IS NULL THEN app.can_write_commune(commune_id) ELSE app.peut_emettre_document(commune_id) END);
GRANT SELECT ON pesees_campagne TO siipi_app;
REVOKE INSERT, UPDATE ON pesees_campagne FROM siipi_app;

DROP POLICY IF EXISTS mesures_campagne_select ON mesures_campagne;
CREATE POLICY mesures_campagne_select ON mesures_campagne FOR SELECT
  USING (CASE WHEN menage_id IS NULL THEN app.can_write_commune(commune_id) ELSE app.peut_emettre_document(commune_id) END);
GRANT SELECT ON mesures_campagne TO siipi_app;
REVOKE INSERT, UPDATE ON mesures_campagne FROM siipi_app;

DROP POLICY IF EXISTS instantanes_campagne_select ON instantanes_campagne;
CREATE POLICY instantanes_campagne_select ON instantanes_campagne FOR SELECT USING (app.can_write_commune(commune_id));
GRANT SELECT ON instantanes_campagne TO siipi_app;
REVOKE INSERT, UPDATE ON instantanes_campagne FROM siipi_app;

-- Les effectifs d'une campagne : des comptes, qui ne désignent aucun ménage. Lus sous
-- la RLS, la FNCT trouverait « 0 ménage, 0 pesée » dans une campagne de ménages qui en
-- compte des dizaines, un zéro posé à la place d'une donnée qu'elle ne lit pas.
CREATE OR REPLACE FUNCTION app.effectifs_campagne(p_id uuid)
  RETURNS TABLE (pesees integer, etablissements integer, menages integer)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT (SELECT count(*)::int FROM pesees_campagne p WHERE p.campagne_id = c.id AND p.statut = 'valide'),
         (SELECT count(DISTINCT p.commerce_id)::int FROM pesees_campagne p WHERE p.campagne_id = c.id AND p.statut = 'valide'),
         (SELECT count(*)::int FROM menages_echantillon m WHERE m.campagne_id = c.id)
    FROM campagnes_pesee c
   WHERE c.id = p_id AND c.deleted_at IS NULL AND app.can_write_commune(c.commune_id)
$$;
REVOKE ALL ON FUNCTION app.effectifs_campagne(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.effectifs_campagne(uuid) TO siipi_app;

-- Les écartés, comptés par raison : pour les ménages aussi, des comptes seulement.
CREATE OR REPLACE FUNCTION app.ecartes_campagne(p_id uuid)
  RETURNS TABLE (groupe text, indicateur text, raison text, nombre integer)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT m.groupe, m.indicateur, m.raison_ecart, count(*)::int
    FROM mesures_campagne m JOIN campagnes_pesee c ON c.id = m.campagne_id
   WHERE m.campagne_id = p_id AND m.raison_ecart IS NOT NULL AND c.deleted_at IS NULL AND app.can_write_commune(c.commune_id)
   GROUP BY m.groupe, m.indicateur, m.raison_ecart
   ORDER BY m.groupe, m.indicateur, m.raison_ecart
$$;
REVOKE ALL ON FUNCTION app.ecartes_campagne(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.ecartes_campagne(uuid) TO siipi_app;

DROP POLICY IF EXISTS resultats_campagne_select ON resultats_campagne;
CREATE POLICY resultats_campagne_select ON resultats_campagne FOR SELECT USING (app.can_write_commune(commune_id));
GRANT SELECT ON resultats_campagne TO siipi_app;
REVOKE INSERT, UPDATE ON resultats_campagne FROM siipi_app;

DROP POLICY IF EXISTS imports_pesees_select ON imports_pesees;
CREATE POLICY imports_pesees_select ON imports_pesees FOR SELECT USING (deleted_at IS NULL AND app.can_write_commune(commune_id));
DROP POLICY IF EXISTS imports_pesees_insert ON imports_pesees;
CREATE POLICY imports_pesees_insert ON imports_pesees FOR INSERT WITH CHECK (app.peut_emettre_document(commune_id));
GRANT SELECT, INSERT ON imports_pesees TO siipi_app;
REVOKE UPDATE ON imports_pesees FROM siipi_app;

DROP POLICY IF EXISTS modeles_import_pesees_select ON modeles_import_pesees;
CREATE POLICY modeles_import_pesees_select ON modeles_import_pesees FOR SELECT USING (deleted_at IS NULL AND app.can_write_commune(commune_id));
DROP POLICY IF EXISTS modeles_import_pesees_insert ON modeles_import_pesees;
CREATE POLICY modeles_import_pesees_insert ON modeles_import_pesees FOR INSERT WITH CHECK (app.peut_emettre_document(commune_id));
DROP POLICY IF EXISTS modeles_import_pesees_update ON modeles_import_pesees;
CREATE POLICY modeles_import_pesees_update ON modeles_import_pesees FOR UPDATE
  USING (deleted_at IS NULL AND app.peut_emettre_document(commune_id)) WITH CHECK (app.peut_emettre_document(commune_id));
GRANT SELECT, INSERT ON modeles_import_pesees TO siipi_app;
REVOKE UPDATE ON modeles_import_pesees FROM siipi_app;
GRANT UPDATE (correspondance, saisi_par, updated_at) ON modeles_import_pesees TO siipi_app;

-- Les densités : les nationales se lisent par tout compte authentifié (le tonnage
-- estimé d'une commune s'y replie) ; celles d'une commune par la commune et la FNCT.
ALTER TABLE densites_assimiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE densites_assimiles FORCE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_provenance ON densites_assimiles;
DROP POLICY IF EXISTS densites_assimiles_select ON densites_assimiles;
CREATE POLICY densites_assimiles_select ON densites_assimiles FOR SELECT
  USING ((commune_id IS NULL AND app.is_authenticated()) OR app.can_write_commune(commune_id));
DROP POLICY IF EXISTS densites_assimiles_insert ON densites_assimiles;
CREATE POLICY densites_assimiles_insert ON densites_assimiles FOR INSERT
  WITH CHECK ((commune_id IS NULL AND app.is_fnct()) OR (commune_id IS NOT NULL AND app.peut_emettre_document(commune_id)));
GRANT SELECT ON densites_assimiles TO siipi_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON densites_assimiles FROM siipi_app;
GRANT INSERT (commune_id, categorie_activite, densite_min, densite_max, mediane, source, reference, date_effet) ON densites_assimiles TO siipi_app;

-- ---------------------------------------------------------------------------
-- 9. Le retrait d'une campagne en brouillon : app.supprimer (dernière version, 105)
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
  -- pas (G-4, 099). Une levée non plus : elle s'écarte ou s'annule (105). Une
  -- pesée de campagne s'annule (106).
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
                     'grilles_tarifaires', 'avenants_convention', 'dessertes_commerces',
                     'campagnes_pesee') THEN
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
  -- desserte posée à tort, une campagne de pesée en brouillon, par le directeur qui
  -- les enregistre (une grille approuvée, une convention ou un avenant instruits ou
  -- signés, une desserte qui a servi, une campagne ouverte ne se retirent pas : leur
  -- règle le refuse).
  IF p_table IN ('donnees_personnelles_barbechas', 'identites_commerces') THEN
    IF NOT app.peut_voir_identite(v_commune) THEN
      RAISE EXCEPTION 'ACCES_REFUSE' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF p_table IN ('etapes_declassement', 'pieces_declassement') THEN
    IF NOT app.peut_instruire_declassement(v_commune) THEN
      RAISE EXCEPTION 'ACCES_REFUSE' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF p_table IN ('demandes_carte_precollecteur', 'pieces_demande_carte', 'jalons_acteurs', 'agrements_intermediaires',
                    'grilles_tarifaires', 'conventions_commerciales', 'avenants_convention', 'dessertes_commerces',
                    'campagnes_pesee') THEN
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
-- 10. Ce que l'administrateur lira dans dix ans
-- ---------------------------------------------------------------------------
COMMENT ON TABLE campagnes_pesee IS
  'Les campagnes de pesée (jalon G, lot G5b) : d''établissements ou de ménages, brouillon → ouverte → close, sans lien avec un circuit ni un engin. La clôture calcule et fige les résultats (app.calculer_campagne). Le directeur écrit, la FNCT lit.';
COMMENT ON COLUMN campagnes_pesee.seuil_applique IS 'Le seuil d''échantillon national en vigueur le jour de la clôture, figé avec les résultats.';
COMMENT ON TABLE menages_echantillon IS
  'Les ménages d''une campagne de pesée : un code posé par la base (M-001…), le nombre d''habitants, la tranche de revenu. Ni nom, ni adresse, ni secteur, ni position : un ménage ne doit pouvoir être désigné par personne.';
COMMENT ON TABLE pesees_campagne IS
  'Les pesées d''une campagne : un établissement ou un ménage, le poids, la durée de production couverte (jours), le contenant, son volume et le remplissage observé. La catégorie, l''unité et la valeur d''échelle de l''établissement y sont figées au jour de sa saisie, et comparées à la clôture à l''instantané pris à l''ouverture. Ne se réécrit pas ; s''annule avec un motif tant que la campagne est ouverte.';
COMMENT ON COLUMN pesees_campagne.jour_campagne IS 'Le rang du jour dans la campagne, calculé par la base (date de la pesée − début + 1).';
COMMENT ON COLUMN pesees_campagne.duree_jours IS 'La production que le poids couvre, en jours (une demi-journée : 0,5). Les pesées d''un même jour couvrent la même durée.';
COMMENT ON TABLE instantanes_campagne IS
  'Les établissements de la commune tels qu''ils étaient à l''ouverture d''une campagne de pesée (catégorie, unité et valeur d''échelle) : la référence de la clôture, qui écarte un établissement changé en cours de campagne même si ses pesées ont été saisies après le changement. Écrit par app.ouvrir_campagne seule.';
COMMENT ON FUNCTION app.effectifs_campagne(uuid) IS
  'Les effectifs d''une campagne (pesées valides, établissements pesés, ménages de l''échantillon), pour la commune et la FNCT : des comptes, sans aucune ligne de ménage.';
COMMENT ON FUNCTION app.ecartes_campagne(uuid) IS
  'Les écartés du calcul d''une campagne, comptés par groupe, indicateur et raison ; pour les ménages, des comptes seulement.';
COMMENT ON TABLE resultats_campagne IS
  'Les résultats figés d''une campagne close : par catégorie (et unité d''échelle, ou volume de contenant) ou par tranche de revenu, n, 1er quartile, médiane, 3e quartile, seuil atteint ; une tranche de moins de 5 ménages est masquée.';
COMMENT ON TABLE mesures_campagne IS
  'La valeur de chaque établissement ou ménage pour chaque indicateur d''une campagne close, ou la raison de son écart : ce dont les quartiles sont faits.';
COMMENT ON TABLE densites_assimiles IS
  'Les densités des déchets assimilés (kg/m³), par catégorie d''activité : de la commune, ou du pays (FNCT). Ne se réécrivent pas ; se retirent avec un motif. Une densité de campagne est adoptée par la commune (1er et 3e quartile). SIIPI n''en pose aucune.';
COMMENT ON FUNCTION app.tonnage_estime_convention(uuid, date, date) IS
  'Le tonnage estimé des levées validées d''une convention sur une période : volume de déchets des termes × densité de la catégorie, en fourchette, tous flux confondus. Aucun total si une levée manque de volume ou de densité. Jamais additionné à une pesée, jamais dans une assiette.';
