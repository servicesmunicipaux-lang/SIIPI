-- ============================================================================
-- 098 — Jalon G, lot G1 : les listes nationales des déchets assimilés et les
-- grilles tarifaires des communes (docs/specs_metier/SPEC_G_assimiles_conventions.md
-- § 1, § 3.3, § 7 ; décisions du 4 novembre 2026).
--
-- 1. Trois listes nationales datées s'ajoutent à celles de 091, tenues par la
--    FNCT : les catégories d'activité des établissements (avec les unités
--    d'échelle du WaCT qu'elles admettent), les flux de déchets assimilés (avec le
--    marqueur « dangereux » : un tel flux va vers sa filière, jamais dans une
--    convention) et la base légale des conventions (avec la date de publication
--    au JORT). Un texte publié dont l'application attend un événement (le
--    décret-loi n° 4 du 30 septembre 2026 attend la proclamation des résultats
--    des élections municipales) s'inscrit SANS date d'application : il n'est
--    jamais « en vigueur » tant qu'elle n'est pas fixée, et elle se fixe une
--    seule fois, avec sa pièce. SIIPI ne la déduit pas.
-- 2. Les grilles tarifaires d'une commune : une par arrêté, avec sa
--    délibération, sa date d'effet et l'approbation de la tutelle. Une grille
--    n'est applicable qu'approuvée ; approuvée, elle est figée, ses lignes et
--    ses majorations avec elle. Deux grilles approuvées ne se chevauchent jamais.
--
-- Aucun montant n'est calculé ici : l'assiette vient au lot G6. Ce lot ne touche
-- ni aux établissements (G2) ni aux conventions (G4).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Les listes nationales des assimilés
-- ---------------------------------------------------------------------------
ALTER TABLE elements_listes_nationales DROP CONSTRAINT IF EXISTS elements_liste_valide;
ALTER TABLE elements_listes_nationales ADD CONSTRAINT elements_liste_valide CHECK (liste IN (
  'pieces_carte_precollecteur', 'jalons_accompagnement',
  'categories_activite_assimiles', 'flux_assimiles', 'base_legale_assimiles'));

ALTER TABLE elements_listes_nationales ADD COLUMN IF NOT EXISTS unites_echelle TEXT[];
ALTER TABLE elements_listes_nationales ADD COLUMN IF NOT EXISTS dangereux BOOLEAN;
ALTER TABLE elements_listes_nationales ADD COLUMN IF NOT EXISTS date_publication DATE;
ALTER TABLE elements_listes_nationales ADD COLUMN IF NOT EXISTS reference_effet TEXT;

COMMENT ON COLUMN elements_listes_nationales.unites_echelle IS
  'Catégories d''activité seulement : les unités d''échelle du WaCT que la catégorie admet (chambre, lit, chaise, table, etal, m2, eleve, employe). Un établissement en choisit une (lot G2) ; le ratio de production d''une campagne de pesée s''exprime par cette unité.';
COMMENT ON COLUMN elements_listes_nationales.dangereux IS
  'Flux assimilés seulement : vrai pour un flux à orienter vers sa filière (huiles, solvants, déchets de soins…) ; une convention de propreté ne le couvre jamais (lot G4).';
COMMENT ON COLUMN elements_listes_nationales.date_publication IS
  'Base légale seulement : la date de publication au JORT, distincte de la date d''application (date_effet). La référence de publication est dans « reference ».';
COMMENT ON COLUMN elements_listes_nationales.reference_effet IS
  'Base légale seulement : la pièce qui a fixé une date d''application restée vide à l''inscription du texte (proclamation, arrêté). Vide quand la date était connue dès l''inscription.';

-- Une date d'application vide n'est admise que pour un texte de la base légale.
ALTER TABLE elements_listes_nationales ALTER COLUMN date_effet DROP NOT NULL;
ALTER TABLE elements_listes_nationales DROP CONSTRAINT IF EXISTS elements_date_attendue;
ALTER TABLE elements_listes_nationales ADD CONSTRAINT elements_date_attendue
  CHECK (date_effet IS NOT NULL OR liste = 'base_legale_assimiles');
ALTER TABLE elements_listes_nationales DROP CONSTRAINT IF EXISTS elements_fin_apres_effet;
ALTER TABLE elements_listes_nationales ADD CONSTRAINT elements_fin_apres_effet
  CHECK (date_fin IS NULL OR (date_effet IS NOT NULL AND date_fin > date_effet));
-- Chaque attribut n'appartient qu'à sa liste ; une catégorie admet au moins une unité.
ALTER TABLE elements_listes_nationales DROP CONSTRAINT IF EXISTS elements_attributs_par_liste;
ALTER TABLE elements_listes_nationales ADD CONSTRAINT elements_attributs_par_liste CHECK (
  ((liste = 'categories_activite_assimiles') = (unites_echelle IS NOT NULL))
  AND ((liste = 'flux_assimiles') = (dangereux IS NOT NULL))
  AND (liste = 'base_legale_assimiles' OR (date_publication IS NULL AND reference_effet IS NULL)));
ALTER TABLE elements_listes_nationales DROP CONSTRAINT IF EXISTS elements_unites_valides;
ALTER TABLE elements_listes_nationales ADD CONSTRAINT elements_unites_valides CHECK (
  unites_echelle IS NULL
  OR (cardinality(unites_echelle) > 0
      AND unites_echelle <@ ARRAY['chambre', 'lit', 'chaise', 'table', 'etal', 'm2', 'eleve', 'employe']::text[]));
ALTER TABLE elements_listes_nationales DROP CONSTRAINT IF EXISTS elements_publication_plausible;
ALTER TABLE elements_listes_nationales ADD CONSTRAINT elements_publication_plausible CHECK (
  date_publication IS NULL OR (date_publication >= DATE '1956-01-01' AND (date_effet IS NULL OR date_effet >= date_publication)));

COMMENT ON TABLE elements_listes_nationales IS
  'Les listes nationales datées tenues par la FNCT : pour le secteur informel, les pièces d''une carte de pré-collecteur et les étapes d''accompagnement (091) ; pour les déchets assimilés, les catégories d''activité, les flux et la base légale des conventions (098). Un élément s''applique de date_effet à la veille de date_fin ; il ne se réécrit pas. Ce qui cesse se ferme (date_fin et sa pièce) ; ce qui a été saisi à tort se retire (motif) et reste lisible. Un texte de la base légale peut s''inscrire sans date d''application : il n''est alors jamais en vigueur, et la date se fixe une fois, avec sa pièce (reference_effet).';
COMMENT ON COLUMN elements_listes_nationales.liste IS
  'pieces_carte_precollecteur et jalons_accompagnement (secteur informel, 091) ; categories_activite_assimiles, flux_assimiles et base_legale_assimiles (déchets assimilés, 098).';
COMMENT ON COLUMN elements_listes_nationales.date_effet IS
  'Premier jour où l''élément s''applique. Vide pour un texte de la base légale publié dont l''application attend un événement : il n''est alors jamais en vigueur.';

-- Le contrôle de 091, plus une transition : la date d'application d'un texte
-- inscrit sans elle se fixe une seule fois, avec sa pièce. Tout le reste est figé.
CREATE OR REPLACE FUNCTION app.controler_element_liste() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_fige jsonb;
  v_libres text[] := ARRAY['date_fin', 'reference_fin', 'retire_le', 'retire_par', 'motif_retrait'];
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.retire_le IS NOT NULL OR NEW.date_fin IS NOT NULL THEN
      RAISE EXCEPTION 'ELEMENT_NAISSANCE: un élément s''inscrit ouvert ; il se ferme ou se retire ensuite.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.reference_effet IS NOT NULL THEN
      RAISE EXCEPTION 'ELEMENT_NAISSANCE: la pièce d''une date d''application ne s''inscrit qu''en la fixant, après coup.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  -- Une écriture identique (la remise en état d'une table par une campagne)
  -- ne change rien : elle passe.
  IF to_jsonb(NEW) = to_jsonb(OLD) THEN
    RETURN NEW;
  END IF;
  IF OLD.retire_le IS NOT NULL THEN
    RAISE EXCEPTION 'ELEMENT_FIGE: cet élément est retiré ; il reste lisible tel quel.' USING ERRCODE = 'check_violation';
  END IF;
  -- La date d'application attendue : de vide à une date, une fois, avec sa pièce.
  IF OLD.date_effet IS NULL THEN
    v_libres := v_libres || ARRAY['date_effet', 'reference_effet'];
    IF NEW.date_effet IS NOT NULL AND length(btrim(COALESCE(NEW.reference_effet, ''))) < 5 THEN
      RAISE EXCEPTION 'ELEMENT_EFFET: une date d''application se fixe avec la pièce qui la fonde (proclamation, arrêté).'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.date_effet IS NULL AND NEW.reference_effet IS NOT NULL THEN
      RAISE EXCEPTION 'ELEMENT_EFFET: une pièce sans date d''application ne fixe rien.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  v_fige := to_jsonb(NEW) - v_libres;
  IF v_fige IS DISTINCT FROM (to_jsonb(OLD) - v_libres) THEN
    RAISE EXCEPTION 'ELEMENT_FIGE: un élément de liste ne se réécrit pas ; fermez-le à une date et ajoutez-en un autre, ou retirez-le s''il était faux.'
      USING ERRCODE = 'check_violation';
  END IF;
  -- La fin se fixe une fois.
  IF OLD.date_fin IS NOT NULL AND (NEW.date_fin, NEW.reference_fin) IS DISTINCT FROM (OLD.date_fin, OLD.reference_fin) THEN
    RAISE EXCEPTION 'ELEMENT_FERME: cet élément est déjà fermé au %.', to_char(OLD.date_fin, 'DD/MM/YYYY')
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

REVOKE UPDATE ON elements_listes_nationales FROM siipi_app;
GRANT UPDATE (date_effet, reference_effet, date_fin, reference_fin, retire_le, retire_par, motif_retrait)
  ON elements_listes_nationales TO siipi_app;

-- La table a gagné des colonnes : la fonction qui la rend se redéclare.
CREATE OR REPLACE FUNCTION app.liste_nationale(p_liste text, p_date date)
  RETURNS SETOF elements_listes_nationales
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT * FROM elements_listes_nationales
   WHERE liste = p_liste AND retire_le IS NULL
     AND date_effet IS NOT NULL AND date_effet <= p_date AND (date_fin IS NULL OR date_fin > p_date)
   ORDER BY ordre, code
$$;
COMMENT ON FUNCTION app.liste_nationale(text, date) IS
  'Les éléments d''une liste nationale en vigueur à une date : entrés en vigueur, pas encore fermés, jamais retirés. Un texte sans date d''application n''est jamais en vigueur. Une demande se juge sur la liste du jour où elle a été déposée.';
GRANT EXECUTE ON FUNCTION app.liste_nationale(text, date) TO siipi_app;

-- Les catégories de départ : celles de la spécification, avec les unités du
-- WaCT. Une classification, pas un texte légal : elles valent dès 2000, pour
-- qu'un arrêté ancien puisse y être rapporté, et restent provisoires jusqu'à leur
-- validation par la FNCT. Les flux et la base légale ne sont pas posés : SIIPI
-- n'invente ni un flux ni une référence ; la FNCT les inscrit.
INSERT INTO elements_listes_nationales (liste, code, libelle_fr, libelle_ar, ordre, date_effet, provisoire, reference, unites_echelle)
SELECT 'categories_activite_assimiles', e.code, e.fr, e.ar, e.ordre, DATE '2000-01-01', true,
       'Liste de départ de la spécification du jalon G (§ 3.1), d''après les catégories et unités d''échelle du WaCT (ONU-Habitat, annexe 5) — à valider par la FNCT.',
       e.unites
  FROM (VALUES
    ('cafe', 'Café', 'مقهى', 10, ARRAY['chaise', 'table']),
    ('restaurant', 'Restaurant', 'مطعم', 20, ARRAY['chaise', 'table']),
    ('hotel', 'Hôtel', 'نزل', 30, ARRAY['chambre', 'lit']),
    ('superette', 'Supérette', 'مغازة صغيرة', 40, ARRAY['m2']),
    ('boulangerie', 'Boulangerie', 'مخبزة', 50, ARRAY['m2', 'employe']),
    ('marche', 'Marché', 'سوق', 60, ARRAY['etal']),
    ('bureau', 'Bureau', 'مكتب', 70, ARRAY['m2', 'employe']),
    ('ecole', 'École', 'مدرسة', 80, ARRAY['eleve', 'employe']),
    ('atelier', 'Atelier', 'ورشة', 90, ARRAY['m2', 'employe'])
  ) AS e(code, fr, ar, ordre, unites)
 WHERE NOT EXISTS (SELECT 1 FROM elements_listes_nationales x WHERE x.liste = 'categories_activite_assimiles');

-- ---------------------------------------------------------------------------
-- 2. Les grilles tarifaires
-- ---------------------------------------------------------------------------
-- Une commune les écrit (son directeur, comme un document qu'elle émet) ; la FNCT
-- les lit. Un prestataire ou un citoyen ne les voit pas.
CREATE TABLE IF NOT EXISTS grilles_tarifaires (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id                TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    intitule                  TEXT,
    reference_arrete          TEXT NOT NULL,
    date_arrete               DATE NOT NULL,
    reference_deliberation    TEXT,
    date_deliberation         DATE,
    date_effet                DATE NOT NULL,
    date_fin                  DATE,
    reference_fin             TEXT,
    date_approbation_tutelle  DATE,
    reference_approbation     TEXT,
    approuve_par              UUID REFERENCES users(id) ON DELETE SET NULL,
    approuve_le               TIMESTAMPTZ,
    provenance                TEXT NOT NULL DEFAULT 'reel',
    saisi_par                 UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at                TIMESTAMPTZ,
    deleted_by                UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT grilles_arrete_reference CHECK (length(btrim(reference_arrete)) >= 3),
    CONSTRAINT grilles_dates_plausibles CHECK (date_arrete >= DATE '2000-01-01' AND date_effet >= DATE '2000-01-01'
                                               AND (date_deliberation IS NULL OR date_deliberation >= DATE '2000-01-01')),
    CONSTRAINT grilles_fin_apres_effet CHECK (date_fin IS NULL OR date_fin > date_effet),
    -- Une approbation est entière : sa date, sa pièce, qui l'a enregistrée et quand.
    CONSTRAINT grilles_approbation_entiere CHECK (
      (date_approbation_tutelle IS NULL AND reference_approbation IS NULL AND approuve_par IS NULL AND approuve_le IS NULL)
      OR (date_approbation_tutelle IS NOT NULL AND length(btrim(COALESCE(reference_approbation, ''))) >= 3
          AND approuve_le IS NOT NULL AND date_approbation_tutelle >= date_arrete)),
    CONSTRAINT grilles_fin_referencee CHECK (
      date_fin IS NULL OR date_approbation_tutelle IS NULL OR length(btrim(COALESCE(reference_fin, ''))) >= 3),
    CONSTRAINT grilles_provenance_valide CHECK (provenance IN ('reel', 'simule'))
);
COMMENT ON TABLE grilles_tarifaires IS
  'Les grilles tarifaires des conventions de propreté d''une commune (lot G1) : une par arrêté municipal. Un projet se modifie ; une grille ne s''applique qu''approuvée par la tutelle (date et pièce, posées par app.approuver_grille), et elle est alors figée, ses lignes et majorations avec elle — seule sa date de fin se fixe ensuite, une fois. Deux grilles approuvées d''une commune ne se chevauchent jamais. Aucun montant n''y est calculé : il vient de l''assiette (lot G6).';
COMMENT ON COLUMN grilles_tarifaires.reference_arrete IS 'La référence de l''arrêté municipal qui fixe les tarifs (numéro, intitulé).';
COMMENT ON COLUMN grilles_tarifaires.reference_deliberation IS 'La délibération du conseil municipal qui l''a adoptée, si elle est connue.';
COMMENT ON COLUMN grilles_tarifaires.date_effet IS 'Premier jour où les tarifs s''appliquent, une fois approuvés.';
COMMENT ON COLUMN grilles_tarifaires.date_fin IS 'Premier jour où ils ne s''appliquent plus (un nouvel arrêté les remplace). Sur une grille approuvée, se fixe une fois, avec sa pièce (reference_fin).';
COMMENT ON COLUMN grilles_tarifaires.date_approbation_tutelle IS
  'La date de l''approbation par l''autorité de tutelle. Vide : la grille est un projet, elle ne produit aucune assiette. L''approbation porte sur l''arrêté ; une convention l''applique (décision du 4 novembre).';
COMMENT ON COLUMN grilles_tarifaires.reference_approbation IS 'La pièce de l''approbation de la tutelle (lettre, visa, référence).';

-- Une ligne : un tarif pour une catégorie d'activité. Son unité découle de son
-- mode — DT par an, par mois, par levée, par tonne — et n'est pas stockée à part,
-- où elle pourrait contredire le mode.
CREATE TABLE IF NOT EXISTS lignes_grille (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grille_id        UUID NOT NULL REFERENCES grilles_tarifaires(id) ON DELETE CASCADE,
    commune_id       TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    categorie_code   TEXT NOT NULL,
    mode             TEXT NOT NULL,
    tarif            NUMERIC(12, 3) NOT NULL,
    ordre            SMALLINT NOT NULL DEFAULT 0,
    provenance       TEXT NOT NULL DEFAULT 'reel',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at       TIMESTAMPTZ,
    deleted_by       UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT lignes_grille_mode CHECK (mode IN ('forfait_annuel', 'forfait_mensuel', 'reel_levee', 'reel_poids')),
    CONSTRAINT lignes_grille_tarif_positif CHECK (tarif > 0),
    CONSTRAINT lignes_grille_provenance CHECK (provenance IN ('reel', 'simule'))
);
COMMENT ON TABLE lignes_grille IS
  'Le tarif d''une catégorie d''activité dans une grille : un mode (forfait annuel, forfait mensuel, réel à la levée, réel au poids) et un montant en DT par an, par mois, par levée ou par tonne selon le mode. La catégorie est celle de la liste nationale en vigueur à la date d''effet de la grille. Une catégorie au plus par grille.';
COMMENT ON COLUMN lignes_grille.mode IS
  'forfait_annuel (DT/an) · forfait_mensuel (DT/mois) · reel_levee (DT par levée constatée) · reel_poids (DT par tonne réellement pesée). L''unité du tarif s''en déduit.';
CREATE UNIQUE INDEX IF NOT EXISTS uq_ligne_grille_categorie ON lignes_grille (grille_id, categorie_code) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_lignes_grille ON lignes_grille (grille_id) WHERE deleted_at IS NULL;

-- Une majoration : pour un critère, une tranche [borne_min ; borne_max[ et son
-- effet. Les tranches d'un même critère ne se chevauchent pas ; les critères
-- s'appliquent dans l'ordre que fixe la grille.
CREATE TABLE IF NOT EXISTS criteres_majoration (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ligne_id     UUID NOT NULL REFERENCES lignes_grille(id) ON DELETE CASCADE,
    commune_id   TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    critere      TEXT NOT NULL,
    borne_min    NUMERIC(12, 3) NOT NULL DEFAULT 0,
    borne_max    NUMERIC(12, 3),
    effet        TEXT NOT NULL,
    valeur       NUMERIC(12, 3) NOT NULL,
    ordre        SMALLINT NOT NULL,
    provenance   TEXT NOT NULL DEFAULT 'reel',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at   TIMESTAMPTZ,
    deleted_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT majoration_critere CHECK (critere IN ('surface_m2', 'frequence_hebdo', 'capacite_conteneur_l', 'nb_points_vente')),
    CONSTRAINT majoration_effet CHECK (effet IN ('coefficient', 'ajout')),
    CONSTRAINT majoration_tranche CHECK (borne_min >= 0 AND (borne_max IS NULL OR borne_max > borne_min)),
    CONSTRAINT majoration_valeur CHECK (valeur > 0),
    CONSTRAINT majoration_ordre CHECK (ordre >= 1),
    CONSTRAINT majoration_provenance CHECK (provenance IN ('reel', 'simule'))
);
COMMENT ON TABLE criteres_majoration IS
  'Les majorations d''une ligne de grille, paramétrées sans code : un critère (surface en m², fréquence hebdomadaire de collecte, capacité du conteneur en litres, nombre de points de vente), une tranche [borne_min ; borne_max[ (borne_max vide : sans plafond) et un effet — un coefficient multiplicatif, ou un ajout fixe en DT dans l''unité du tarif. Les critères s''appliquent dans leur ordre ; les tranches d''un même critère ne se chevauchent pas.';
COMMENT ON COLUMN criteres_majoration.ordre IS 'Le rang d''application du critère dans la ligne (1 d''abord) ; les tranches d''un même critère partagent leur rang.';
CREATE INDEX IF NOT EXISTS idx_criteres_majoration ON criteres_majoration (ligne_id) WHERE deleted_at IS NULL;

-- La grille : un projet se modifie et se retire ; approuvée, elle est figée, et
-- seule sa date de fin se fixe, une fois. L'approbation ne passe que par
-- app.approuver_grille, qui contrôle ce que l'écran ne peut pas garantir.
CREATE OR REPLACE FUNCTION app.controler_grille() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  v_approbation text[] := ARRAY['date_approbation_tutelle', 'reference_approbation', 'approuve_par', 'approuve_le'];
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.date_approbation_tutelle IS NOT NULL OR NEW.reference_approbation IS NOT NULL
       OR NEW.approuve_par IS NOT NULL OR NEW.approuve_le IS NOT NULL THEN
      RAISE EXCEPTION 'GRILLE_NAISSANCE: une grille naît projet ; l''approbation de la tutelle s''enregistre ensuite.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF to_jsonb(NEW) = to_jsonb(OLD) THEN
    RETURN NEW;
  END IF;
  IF OLD.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'GRILLE_RETIREE: cette grille est retirée.' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.date_approbation_tutelle IS NULL THEN
    -- Un projet : l'approbation ne s'écrit que par app.approuver_grille.
    IF NEW.date_approbation_tutelle IS NOT NULL
       AND current_setting('app.approbation_grille', true) IS DISTINCT FROM NEW.id::text THEN
      RAISE EXCEPTION 'GRILLE_APPROBATION: l''approbation de la tutelle s''enregistre par sa procédure, qui en contrôle la date et les lignes.'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
  -- Approuvée : rien ne bouge, sauf la date de fin, une fois.
  IF NEW.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'GRILLE_FIGEE: une grille approuvée ne se retire pas ; elle se clôt à une date.' USING ERRCODE = 'check_violation';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['date_fin', 'reference_fin', 'updated_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['date_fin', 'reference_fin', 'updated_at']) THEN
    RAISE EXCEPTION 'GRILLE_FIGEE: une grille approuvée ne se modifie plus ; un nouvel arrêté fait une nouvelle grille.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.date_fin IS NOT NULL THEN
    RAISE EXCEPTION 'GRILLE_CLOSE: cette grille est déjà close au %.', to_char(OLD.date_fin, 'DD/MM/YYYY') USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_controler_grille ON grilles_tarifaires;
CREATE TRIGGER trg_controler_grille BEFORE INSERT OR UPDATE ON grilles_tarifaires
  FOR EACH ROW EXECUTE FUNCTION app.controler_grille();

-- Les lignes : elles prennent la commune de leur grille ; une grille approuvée ou
-- retirée ne reçoit plus rien ; la catégorie est en vigueur à la date d'effet.
CREATE OR REPLACE FUNCTION app.controler_ligne_grille() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  g grilles_tarifaires%ROWTYPE;
BEGIN
  SELECT * INTO g FROM grilles_tarifaires WHERE id = NEW.grille_id;
  IF g.id IS NULL THEN
    RAISE EXCEPTION 'GRILLE_INTROUVABLE' USING ERRCODE = 'check_violation';
  END IF;
  IF g.date_approbation_tutelle IS NOT NULL THEN
    RAISE EXCEPTION 'GRILLE_FIGEE: une grille approuvée ne se modifie plus ; un nouvel arrêté fait une nouvelle grille.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF g.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'GRILLE_RETIREE: cette grille est retirée.' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) - ARRAY['deleted_at', 'deleted_by']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['deleted_at', 'deleted_by']) THEN
      RAISE EXCEPTION 'LIGNE_FIGEE: une ligne se retire et se remplace, elle ne se réécrit pas.' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  NEW.commune_id := g.commune_id;
  IF NOT EXISTS (SELECT 1 FROM app.liste_nationale('categories_activite_assimiles', g.date_effet) e
                  WHERE e.code = NEW.categorie_code) THEN
    RAISE EXCEPTION 'CATEGORIE_INCONNUE: « % » n''est pas une catégorie d''activité en vigueur au % (liste nationale de la FNCT).',
      NEW.categorie_code, to_char(g.date_effet, 'DD/MM/YYYY') USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_controler_ligne_grille ON lignes_grille;
CREATE TRIGGER trg_controler_ligne_grille BEFORE INSERT OR UPDATE ON lignes_grille
  FOR EACH ROW EXECUTE FUNCTION app.controler_ligne_grille();

-- Les majorations : même règle que les lignes, plus les tranches et l'ordre.
CREATE OR REPLACE FUNCTION app.controler_majoration() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  l lignes_grille%ROWTYPE;
  g grilles_tarifaires%ROWTYPE;
BEGIN
  SELECT * INTO l FROM lignes_grille WHERE id = NEW.ligne_id;
  SELECT * INTO g FROM grilles_tarifaires WHERE id = l.grille_id;
  IF g.date_approbation_tutelle IS NOT NULL THEN
    RAISE EXCEPTION 'GRILLE_FIGEE: une grille approuvée ne se modifie plus ; un nouvel arrêté fait une nouvelle grille.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF g.deleted_at IS NOT NULL OR l.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'GRILLE_RETIREE: cette ligne ou sa grille est retirée.' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) - ARRAY['deleted_at', 'deleted_by']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['deleted_at', 'deleted_by']) THEN
      RAISE EXCEPTION 'LIGNE_FIGEE: une majoration se retire et se remplace, elle ne se réécrit pas.' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  NEW.commune_id := l.commune_id;
  IF EXISTS (SELECT 1 FROM criteres_majoration m
              WHERE m.ligne_id = NEW.ligne_id AND m.deleted_at IS NULL AND m.critere = NEW.critere
                AND m.borne_min < COALESCE(NEW.borne_max, 'Infinity'::numeric)
                AND NEW.borne_min < COALESCE(m.borne_max, 'Infinity'::numeric)) THEN
    RAISE EXCEPTION 'MAJORATION_CHEVAUCHEMENT: deux tranches du critère « % » se chevauchent dans cette ligne.', NEW.critere
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM criteres_majoration m
              WHERE m.ligne_id = NEW.ligne_id AND m.deleted_at IS NULL
                AND ((m.critere = NEW.critere AND m.ordre <> NEW.ordre) OR (m.critere <> NEW.critere AND m.ordre = NEW.ordre))) THEN
    RAISE EXCEPTION 'MAJORATION_ORDRE: un critère a un seul rang d''application, et deux critères n''ont pas le même.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_controler_majoration ON criteres_majoration;
CREATE TRIGGER trg_controler_majoration BEFORE INSERT OR UPDATE ON criteres_majoration
  FOR EACH ROW EXECUTE FUNCTION app.controler_majoration();

-- Provenance (055) et journal d'audit, comme toute table communale.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['grilles_tarifaires', 'lignes_grille', 'criteres_majoration'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_provenance ON %I', t);
    EXECUTE format('CREATE TRIGGER trg_provenance BEFORE INSERT OR UPDATE OF provenance ON %I FOR EACH ROW EXECUTE FUNCTION app.controler_provenance()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%s ON %I', t, t);
    EXECUTE format('CREATE TRIGGER trg_audit_%s AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION app.enregistrer_changement()', t, t);
  END LOOP;
END $$;

-- Lire : la commune et la FNCT (jamais un prestataire). Écrire : le directeur de
-- la commune, dans son périmètre — la FNCT ne fixe pas les tarifs d'une commune.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['grilles_tarifaires', 'lignes_grille', 'criteres_majoration'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (deleted_at IS NULL AND app.can_write_commune(commune_id))', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (app.peut_emettre_document(commune_id))', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (deleted_at IS NULL AND app.peut_emettre_document(commune_id)) WITH CHECK (app.peut_emettre_document(commune_id))', t || '_update', t);
    EXECUTE format('GRANT SELECT, INSERT ON %I TO siipi_app', t);
    EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON %I FROM siipi_app', t);
  END LOOP;
END $$;
-- Ce qu'un projet laisse modifier, et le retrait des lignes d'un projet. Les
-- colonnes de l'approbation n'ont aucun droit : app.approuver_grille les écrit.
GRANT UPDATE (intitule, reference_arrete, date_arrete, reference_deliberation, date_deliberation,
              date_effet, date_fin, reference_fin, updated_at) ON grilles_tarifaires TO siipi_app;
GRANT UPDATE (deleted_at, deleted_by) ON lignes_grille TO siipi_app;
GRANT UPDATE (deleted_at, deleted_by) ON criteres_majoration TO siipi_app;

-- ---------------------------------------------------------------------------
-- 3. L'approbation, la grille en vigueur
-- ---------------------------------------------------------------------------
-- La commune enregistre l'approbation de la tutelle : elle ne la décide pas, elle
-- l'inscrit. La procédure verrouille la commune le temps de contrôler qu'aucune
-- autre grille approuvée ne couvre la même période — deux approbations
-- simultanées passeraient sinon toutes deux.
CREATE OR REPLACE FUNCTION app.approuver_grille(p_grille uuid, p_date date, p_reference text)
  RETURNS grilles_tarifaires
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  g grilles_tarifaires%ROWTYPE;
  v_autre grilles_tarifaires%ROWTYPE;
  v_categorie text;
BEGIN
  SELECT * INTO g FROM grilles_tarifaires WHERE id = p_grille AND deleted_at IS NULL;
  IF g.id IS NULL OR NOT app.peut_emettre_document(g.commune_id) THEN
    RAISE EXCEPTION 'GRILLE_INTROUVABLE' USING ERRCODE = 'no_data_found';
  END IF;
  PERFORM 1 FROM communes WHERE id = g.commune_id FOR UPDATE;
  SELECT * INTO g FROM grilles_tarifaires WHERE id = p_grille;
  IF g.date_approbation_tutelle IS NOT NULL THEN
    RAISE EXCEPTION 'GRILLE_DEJA_APPROUVEE: cette grille a été approuvée le %.', to_char(g.date_approbation_tutelle, 'DD/MM/YYYY')
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_date IS NULL OR p_date > app.jour_tunis() THEN
    RAISE EXCEPTION 'GRILLE_DATE_APPROBATION: l''approbation s''enregistre une fois reçue ; sa date n''est pas dans l''avenir.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_date < g.date_arrete THEN
    RAISE EXCEPTION 'GRILLE_DATE_APPROBATION: la tutelle n''approuve pas un arrêté avant qu''il soit pris (le %).', to_char(g.date_arrete, 'DD/MM/YYYY')
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM lignes_grille WHERE grille_id = g.id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'GRILLE_VIDE: une grille sans aucun tarif ne s''approuve pas.' USING ERRCODE = 'check_violation';
  END IF;
  -- La date d'effet a pu changer depuis la saisie des lignes : chaque catégorie
  -- doit être en vigueur à la date d'effet de la grille.
  SELECT l.categorie_code INTO v_categorie FROM lignes_grille l
   WHERE l.grille_id = g.id AND l.deleted_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM app.liste_nationale('categories_activite_assimiles', g.date_effet) e WHERE e.code = l.categorie_code)
   LIMIT 1;
  IF v_categorie IS NOT NULL THEN
    RAISE EXCEPTION 'CATEGORIE_INCONNUE: « % » n''est pas une catégorie d''activité en vigueur au %.', v_categorie, to_char(g.date_effet, 'DD/MM/YYYY')
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_autre FROM grilles_tarifaires o
   WHERE o.commune_id = g.commune_id AND o.id <> g.id AND o.deleted_at IS NULL AND o.date_approbation_tutelle IS NOT NULL
     AND o.date_effet < COALESCE(g.date_fin, 'infinity'::date) AND g.date_effet < COALESCE(o.date_fin, 'infinity'::date)
   LIMIT 1;
  IF v_autre.id IS NOT NULL THEN
    RAISE EXCEPTION 'GRILLE_CHEVAUCHEMENT: la grille « % », approuvée, couvre déjà cette période (depuis le %) ; close-la avant d''approuver celle-ci.',
      v_autre.reference_arrete, to_char(v_autre.date_effet, 'DD/MM/YYYY') USING ERRCODE = 'check_violation';
  END IF;
  PERFORM set_config('app.approbation_grille', g.id::text, true);
  UPDATE grilles_tarifaires
     SET date_approbation_tutelle = p_date, reference_approbation = btrim(p_reference),
         approuve_par = app.current_user_id(), approuve_le = now()
   WHERE id = g.id
   RETURNING * INTO g;
  PERFORM set_config('app.approbation_grille', '', true);
  RETURN g;
END
$$;
REVOKE ALL ON FUNCTION app.approuver_grille(uuid, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.approuver_grille(uuid, date, text) TO siipi_app;
COMMENT ON FUNCTION app.approuver_grille(uuid, date, text) IS
  'Enregistre l''approbation d''une grille par la tutelle (lot G1) : sa date (passée, après l''arrêté) et sa pièce. Refuse une grille sans tarif, une catégorie qui n''est pas en vigueur à la date d''effet, et une période déjà couverte par une autre grille approuvée de la commune. Introuvable hors du périmètre du directeur.';

-- La grille approuvée qui s'applique à une date (la convention la prendra à sa
-- date de début, lot G4). Rien sans grille approuvée : jamais un projet.
CREATE OR REPLACE FUNCTION app.grille_en_vigueur(p_commune text, p_date date)
  RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT g.id FROM grilles_tarifaires g
   WHERE g.commune_id = p_commune AND app.can_write_commune(p_commune)
     AND g.deleted_at IS NULL AND g.date_approbation_tutelle IS NOT NULL
     AND g.date_effet <= p_date AND (g.date_fin IS NULL OR g.date_fin > p_date)
$$;
REVOKE ALL ON FUNCTION app.grille_en_vigueur(text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.grille_en_vigueur(text, date) TO siipi_app;
COMMENT ON FUNCTION app.grille_en_vigueur(text, date) IS
  'La grille tarifaire approuvée d''une commune qui s''applique à une date, ou rien. Un projet ne s''applique jamais.';

-- ---------------------------------------------------------------------------
-- 4. Le retrait d'un projet : app.supprimer (dernière version, 093)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.supprimer(p_table text, p_id text)
  RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$function$
DECLARE
  v_commune text;
BEGIN
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
                     'incidents_travail', 'commerces', 'conventions_commerciales',
                     'donnees_personnelles_barbechas',
                     'carnets_de_bord', 'quotas_carburant',
                     'immobilisations_engins', 'etapes_declassement', 'pieces_declassement',
                     'etudes_cout_complet', 'demarches_formalisation',
                     'demandes_carte_precollecteur', 'pieces_demande_carte',
                     'jalons_acteurs', 'agrements_intermediaires',
                     'grilles_tarifaires') THEN
    RAISE EXCEPTION 'TABLE_NON_SUPPRIMABLE: %', p_table;
  END IF;

  EXECUTE format('SELECT commune_id FROM %I WHERE id::text = $1 AND deleted_at IS NULL', p_table)
     INTO v_commune USING p_id;

  IF v_commune IS NULL THEN
    RETURN false;
  END IF;

  -- L'identité se retire comme elle se lit : par le seul admin de la commune.
  -- Le circuit d'un dossier de déclassement et ses pièces, comme ils s'inscrivent.
  -- Une demande de carte et ses pièces, une étape d'accompagnement, un agrément
  -- et un projet de grille tarifaire, par le directeur qui les enregistre (une
  -- grille approuvée ne se retire pas : sa règle le refuse).
  IF p_table = 'donnees_personnelles_barbechas' THEN
    IF NOT app.peut_voir_identite(v_commune) THEN
      RAISE EXCEPTION 'ACCES_REFUSE' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF p_table IN ('etapes_declassement', 'pieces_declassement') THEN
    IF NOT app.peut_instruire_declassement(v_commune) THEN
      RAISE EXCEPTION 'ACCES_REFUSE' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF p_table IN ('demandes_carte_precollecteur', 'pieces_demande_carte', 'jalons_acteurs', 'agrements_intermediaires',
                    'grilles_tarifaires') THEN
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
