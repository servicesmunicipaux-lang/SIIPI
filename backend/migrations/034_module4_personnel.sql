-- ============================================================================
-- 034_module4_personnel.sql   —   Module 4 : les gens qui font le travail.
--
-- CE QUE DIT LE DOSSIER DE DAR CHAABANE. Le fichier « كتلة أجور عملة النظافة
-- 2021-2022-2023-2024 » et l'organigramme municipal disent trois choses qui
-- déterminent tout ce module :
--
--   1. Le service compte SOIXANTE ouvriers et UN cadre technique — un seul,
--      un technicien principal. Soixante et une personnes, un encadrant. Cela
--      signifie que la plateforme n'aura jamais une équipe de saisie : elle
--      aura une personne, qui a par ailleurs un service à faire tourner. Tout
--      ce qui demande plus de deux minutes par jour ne sera pas fait.
--
--   2. Les ouvriers sont des agents titulaires classés — classes 4 à 8,
--      échelons 3 à 8 — pas de la main-d'œuvre journalière. Leur carrière est
--      gérée par l'administration des affaires administratives (مصلحة الموارد
--      البشرية), PAS par le service propreté. Le service propreté ne possède
--      donc pas ces données et n'a aucune raison de les ressaisir ici.
--
--   3. La masse salariale du service est connue et suivie année par année :
--      1 168 566 TND (2021), 1 276 629 (2022), 1 282 224 (2023), 1 324 500
--      (2024). Soit +13,3 % en trois ans à effectif constant (61 → 63 → 60).
--      C'est un indicateur de service, pas une donnée individuelle.
--
-- CE QUE CE MODULE EST, ET N'EST PAS. Ce n'est pas un logiciel de paie et ce
-- n'est pas un dossier du personnel. C'est un registre d'AFFECTATION
-- OPÉRATIONNELLE : qui est affecté à quel circuit, qui était là ce matin,
-- combien de personnes le service peut aligner demain. Le décret-loi n° 2022-54
-- impose la minimisation : on ne collecte que ce qui sert à l'exploitation.
--
-- EN CONSÉQUENCE, ET DÉLIBÉRÉMENT, CE SCHÉMA N'A PAS :
--   • de numéro de CIN, ni de téléphone, ni d'adresse ;
--   • de salaire individuel — la masse salariale existe au niveau du SERVICE
--     et à l'année, jamais par personne ;
--   • aucun champ de santé. Le vocabulaire des absences ci-dessous a été écrit
--     pour cela : il distingue congé, repos, formation, absence justifiée et
--     absence non justifiée. Il ne comporte pas « maladie », et ne doit jamais
--     en comporter : une commune qui remplit tous les jours la case « maladie »
--     en face d'un nom constitue, sans le vouloir, un dossier médical. Une
--     absence pour raison de santé se saisit en « absence justifiée », ce qui
--     est exactement ce dont l'exploitation a besoin de savoir.
--   • aucune évaluation ni notation d'agent.
--
-- Les noms d'agents chargés en test sont fictifs, de même format et de même
-- longueur que les vrais. Les grades, classes et échelons, eux, sont réels :
-- ils ne désignent personne.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. La fiche d'affectation d'un agent.
-- ----------------------------------------------------------------------------

ALTER TABLE personnel ADD COLUMN IF NOT EXISTS grade            TEXT;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS classe           SMALLINT;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS echelon          SMALLINT;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS statut           TEXT NOT NULL DEFAULT 'titulaire';
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS service          TEXT NOT NULL DEFAULT 'proprete';
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS affectation      TEXT;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS date_recrutement DATE;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS date_depart      DATE;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS permis           TEXT[];
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS observation      TEXT;

COMMENT ON COLUMN personnel.grade IS
  'Grade statutaire tel qu''il figure au registre de la commune (عامل, تقني رئيس...). Sert à lire l''effectif, pas à calculer une paie.';
COMMENT ON COLUMN personnel.classe IS
  'صنف — classe statutaire (4 à 8 pour les ouvriers de propreté à Dar Chaabane). Aucune valeur monétaire n''en est dérivée ici.';
COMMENT ON COLUMN personnel.permis IS
  'Catégories de permis détenues. Donnée d''exploitation : elle seule dit qui peut conduire quel engin.';
COMMENT ON COLUMN personnel.observation IS
  'Note d''exploitation libre. Ne doit contenir aucune information de santé ni d''appréciation sur la personne.';

DO $$
BEGIN
  -- Le vocabulaire des fonctions de 028 ne couvrait que la collecte motorisée.
  -- Le terrain en a davantage : balayeurs, tractoristes, jardiniers, atelier.
  ALTER TABLE personnel DROP CONSTRAINT IF EXISTS personnel_fonction_valide;
  ALTER TABLE personnel ADD  CONSTRAINT personnel_fonction_valide CHECK (fonction IN (
    'chauffeur', 'agent', 'chef_equipe', 'agent_balayage', 'encadrement',
    'ripeur', 'tractoriste', 'mecanicien', 'jardinier',
    'agent_hygiene', 'magasinier', 'gardien', 'administratif'
  ));
END $$;

ALTER TABLE personnel DROP CONSTRAINT IF EXISTS personnel_statut_valide;
ALTER TABLE personnel ADD  CONSTRAINT personnel_statut_valide CHECK (statut IN (
  'titulaire', 'contractuel', 'occasionnel', 'mise_a_disposition', 'prestataire'
));

ALTER TABLE personnel DROP CONSTRAINT IF EXISTS personnel_service_valide;
ALTER TABLE personnel ADD  CONSTRAINT personnel_service_valide CHECK (service IN (
  'proprete', 'espaces_verts', 'hygiene', 'atelier', 'administratif'
));

ALTER TABLE personnel DROP CONSTRAINT IF EXISTS personnel_affectation_valide;
ALTER TABLE personnel ADD  CONSTRAINT personnel_affectation_valide CHECK (
  affectation IS NULL OR affectation IN (
    'circuit', 'balayage', 'point_fixe', 'atelier', 'encadrement', 'administratif'
  ));

ALTER TABLE personnel DROP CONSTRAINT IF EXISTS personnel_classe_plausible;
ALTER TABLE personnel ADD  CONSTRAINT personnel_classe_plausible CHECK (
  classe IS NULL OR classe BETWEEN 1 AND 15);

ALTER TABLE personnel DROP CONSTRAINT IF EXISTS personnel_echelon_plausible;
ALTER TABLE personnel ADD  CONSTRAINT personnel_echelon_plausible CHECK (
  echelon IS NULL OR echelon BETWEEN 1 AND 30);

ALTER TABLE personnel DROP CONSTRAINT IF EXISTS personnel_carriere_coherente;
ALTER TABLE personnel ADD  CONSTRAINT personnel_carriere_coherente CHECK (
  date_depart IS NULL OR date_recrutement IS NULL OR date_depart >= date_recrutement);

CREATE INDEX IF NOT EXISTS idx_personnel_commune_service
  ON personnel (commune_id, service) WHERE deleted_at IS NULL AND actif;

-- Le matricule, quand la commune en tient un, doit rester unique chez elle.
CREATE UNIQUE INDEX IF NOT EXISTS idx_personnel_matricule_unique
  ON personnel (commune_id, matricule)
  WHERE matricule IS NOT NULL AND btrim(matricule) <> '' AND deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- 2. L'effectif et le coût, au niveau du SERVICE et de l'ANNÉE.
--
--    C'est ici, et nulle part ailleurs, que vit l'argent. Une ligne par
--    commune, par année, par service. Aucune jointure ne peut redescendre de
--    cette table vers une personne : il n'y a pas de clé pour le faire.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS effectifs_service (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id               TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    annee                    SMALLINT NOT NULL,
    service                  TEXT NOT NULL DEFAULT 'proprete',

    effectif_ouvriers        SMALLINT,
    effectif_encadrement     SMALLINT,
    effectif_contractuels    SMALLINT,

    masse_salariale_tnd          NUMERIC(14,3),
    masse_salariale_ouvriers_tnd NUMERIC(14,3),

    source                   TEXT,        -- d'où vient le chiffre, en clair
    observation              TEXT,
    saisi_par                UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT effectifs_annee_plausible  CHECK (annee BETWEEN 2000 AND 2100),
    CONSTRAINT effectifs_service_valide   CHECK (service IN (
      'proprete', 'espaces_verts', 'hygiene', 'atelier', 'administratif')),
    CONSTRAINT effectifs_positifs CHECK (
      COALESCE(effectif_ouvriers, 0) >= 0
      AND COALESCE(effectif_encadrement, 0) >= 0
      AND COALESCE(effectif_contractuels, 0) >= 0
      AND COALESCE(masse_salariale_tnd, 0) >= 0
      AND COALESCE(masse_salariale_ouvriers_tnd, 0) >= 0),
    -- La part ouvrière ne peut pas dépasser le total quand les deux sont connus.
    CONSTRAINT effectifs_part_ouvriere_coherente CHECK (
      masse_salariale_tnd IS NULL OR masse_salariale_ouvriers_tnd IS NULL
      OR masse_salariale_ouvriers_tnd <= masse_salariale_tnd)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_effectifs_service_unique
  ON effectifs_service (commune_id, annee, service);

COMMENT ON TABLE effectifs_service IS
  'Effectif et masse salariale du service, par année. Niveau service uniquement : aucune ligne ne désigne une personne, et aucune clé ne permet d''y redescendre. C''est la traduction en base de la minimisation exigée par le décret-loi 2022-54.';
COMMENT ON COLUMN effectifs_service.source IS
  'Origine du chiffre en clair — « projet de budget communal », « compte administratif »... Un chiffre sans origine n''est pas opposable.';

-- ----------------------------------------------------------------------------
-- 3. La présence du jour.
--
--    Le seul relevé quotidien du module. Une case par agent et par jour, avec
--    un motif quand la personne n'est pas là. Le vocabulaire des motifs est
--    volontairement sans terme médical (voir l'en-tête).
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS presences (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id    TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    personnel_id  UUID NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
    jour          DATE NOT NULL DEFAULT CURRENT_DATE,
    present       BOOLEAN NOT NULL DEFAULT true,
    motif_absence TEXT,
    circuit_id    UUID REFERENCES circuits(id) ON DELETE SET NULL,
    voyage        SMALLINT NOT NULL DEFAULT 1,
    observation   TEXT,
    saisi_par     UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT presences_voyage_positif CHECK (voyage >= 1),
    CONSTRAINT presences_motif_valide CHECK (motif_absence IS NULL OR motif_absence IN (
      'conge', 'repos', 'formation', 'absence_justifiee',
      'absence_non_justifiee', 'detachement', 'autre'
    )),
    -- Un motif sans absence, ou une absence sans motif, ne veut rien dire.
    CONSTRAINT presences_motif_coherent CHECK (
      (present AND motif_absence IS NULL) OR (NOT present AND motif_absence IS NOT NULL)),
    -- Absent quelque part, on n'est sur aucun circuit.
    CONSTRAINT presences_absent_sans_circuit CHECK (present OR circuit_id IS NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_presences_unique
  ON presences (personnel_id, jour);
CREATE INDEX IF NOT EXISTS idx_presences_commune_jour ON presences (commune_id, jour);
CREATE INDEX IF NOT EXISTS idx_presences_circuit      ON presences (circuit_id, jour);

COMMENT ON TABLE presences IS
  'Relevé quotidien de présence, à usage d''exploitation. Le vocabulaire des motifs ne comporte volontairement aucun terme médical : une absence pour raison de santé se saisit « absence_justifiee », ce qui suffit à l''exploitation et évite de constituer un dossier médical à l''insu de la commune.';

-- ----------------------------------------------------------------------------
-- 4. Le rôle du chef d'équipe, et la cohérence des affectations.
-- ----------------------------------------------------------------------------

-- 028 imposait un seul chauffeur courant par circuit. Même règle pour le chef
-- d'équipe : deux chefs sur la même tournée, c'est une erreur de saisie.
CREATE UNIQUE INDEX IF NOT EXISTS idx_circuit_equipe_chef_unique
  ON circuit_equipe (circuit_id) WHERE role = 'chef_equipe' AND date_fin IS NULL;

-- On ne peut pas affecter un agent à un circuit d'une AUTRE commune que la
-- sienne. La RLS ne le dit pas : elle protège la lecture, pas la cohérence.
CREATE OR REPLACE FUNCTION app.controler_affectation_equipe() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_commune_agent   TEXT;
  v_commune_circuit TEXT;
BEGIN
  SELECT commune_id INTO v_commune_agent   FROM personnel WHERE id = NEW.personnel_id;
  SELECT commune_id INTO v_commune_circuit FROM circuits  WHERE id = NEW.circuit_id;

  IF v_commune_agent IS DISTINCT FROM v_commune_circuit THEN
    RAISE EXCEPTION 'AFFECTATION_HORS_COMMUNE'
      USING ERRCODE = 'check_violation',
            DETAIL  = format('L''agent relève de %s, le circuit de %s.',
                             COALESCE(v_commune_agent, '?'), COALESCE(v_commune_circuit, '?')),
            HINT    = 'Un agent ne peut être affecté qu''à un circuit de sa propre commune.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_circuit_equipe_commune ON circuit_equipe;
CREATE TRIGGER trg_circuit_equipe_commune
  BEFORE INSERT OR UPDATE ON circuit_equipe
  FOR EACH ROW EXECUTE FUNCTION app.controler_affectation_equipe();

-- Même règle pour la présence : la ligne appartient à la commune de l'agent.
CREATE OR REPLACE FUNCTION app.controler_presence() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_commune_agent   TEXT;
  v_commune_circuit TEXT;
BEGIN
  SELECT commune_id INTO v_commune_agent FROM personnel WHERE id = NEW.personnel_id;

  IF NEW.commune_id IS DISTINCT FROM v_commune_agent THEN
    RAISE EXCEPTION 'PRESENCE_HORS_COMMUNE'
      USING ERRCODE = 'check_violation',
            HINT    = 'La présence se saisit dans la commune de l''agent.';
  END IF;

  IF NEW.circuit_id IS NOT NULL THEN
    SELECT commune_id INTO v_commune_circuit FROM circuits WHERE id = NEW.circuit_id;
    IF v_commune_circuit IS DISTINCT FROM v_commune_agent THEN
      RAISE EXCEPTION 'PRESENCE_CIRCUIT_HORS_COMMUNE'
        USING ERRCODE = 'check_violation',
              HINT    = 'Le circuit indiqué ne relève pas de la commune de l''agent.';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_presences_commune ON presences;
CREATE TRIGGER trg_presences_commune
  BEFORE INSERT OR UPDATE ON presences
  FOR EACH ROW EXECUTE FUNCTION app.controler_presence();

-- ----------------------------------------------------------------------------
-- 5. RLS — même règle que partout : on voit ce qu'on a le droit d'écrire.
-- ----------------------------------------------------------------------------

ALTER TABLE effectifs_service ENABLE ROW LEVEL SECURITY;
ALTER TABLE effectifs_service FORCE  ROW LEVEL SECURITY;
ALTER TABLE presences         ENABLE ROW LEVEL SECURITY;
ALTER TABLE presences         FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS effectifs_service_select ON effectifs_service;
CREATE POLICY effectifs_service_select ON effectifs_service FOR SELECT
  USING (app.is_fnct() OR app.can_write_commune(commune_id));

DROP POLICY IF EXISTS effectifs_service_ecriture ON effectifs_service;
CREATE POLICY effectifs_service_ecriture ON effectifs_service FOR ALL
  USING      (app.can_write_commune(commune_id))
  WITH CHECK (app.can_write_commune(commune_id));

DROP POLICY IF EXISTS presences_select ON presences;
CREATE POLICY presences_select ON presences FOR SELECT
  USING (app.is_fnct() OR app.can_write_commune(commune_id));

DROP POLICY IF EXISTS presences_ecriture ON presences;
CREATE POLICY presences_ecriture ON presences FOR ALL
  USING      (app.can_write_commune(commune_id))
  WITH CHECK (app.can_write_commune(commune_id));

GRANT SELECT, INSERT, UPDATE ON effectifs_service, presences TO siipi_app;
REVOKE DELETE, TRUNCATE      ON effectifs_service, presences FROM siipi_app;

-- ----------------------------------------------------------------------------
-- 6. Ce que le responsable veut voir : l'effectif d'un coup d'œil.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.effectif_commune(p_commune text)
  RETURNS TABLE (
    service              text,
    fonction             text,
    statut               text,
    effectif             bigint,
    affectes_circuit     bigint
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT p.service, p.fonction, p.statut,
         count(*),
         count(*) FILTER (WHERE EXISTS (
           SELECT 1 FROM circuit_equipe ce
            WHERE ce.personnel_id = p.id AND ce.date_fin IS NULL))
    FROM personnel p
   WHERE p.commune_id = p_commune AND p.deleted_at IS NULL AND p.actif
   GROUP BY p.service, p.fonction, p.statut
   ORDER BY p.service, p.fonction, p.statut
$$;

COMMENT ON FUNCTION app.effectif_commune(text) IS
  'Effectif vivant d''une commune par service, fonction et statut, avec le nombre d''agents effectivement affectés à un circuit. L''écart entre les deux est la question que le module pose.';

GRANT EXECUTE ON FUNCTION app.effectif_commune(text) TO siipi_app;

-- ----------------------------------------------------------------------------
-- 7. L'équipe du jour, circuit par circuit.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.equipes_du_jour(p_commune text, p_jour date DEFAULT CURRENT_DATE)
  RETURNS TABLE (
    circuit_id     uuid,
    circuit        text,
    taille_prevue  smallint,
    affectes       bigint,
    presents       bigint,
    absents        bigint,
    chauffeur      boolean
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT c.id, c.nom, c.taille_equipe,
         count(ce.id),
         count(*) FILTER (WHERE pr.present),
         count(*) FILTER (WHERE pr.id IS NOT NULL AND NOT pr.present),
         bool_or(ce.role = 'chauffeur')
    FROM circuits c
    LEFT JOIN circuit_equipe ce
           ON ce.circuit_id = c.id
          AND ce.date_debut <= p_jour
          AND (ce.date_fin IS NULL OR ce.date_fin >= p_jour)
    LEFT JOIN presences pr
           ON pr.personnel_id = ce.personnel_id AND pr.jour = p_jour
   WHERE c.commune_id = p_commune AND c.deleted_at IS NULL AND c.actif
     AND c.date_debut <= p_jour
     AND (c.date_fin IS NULL OR c.date_fin >= p_jour)
   GROUP BY c.id, c.nom, c.taille_equipe
   ORDER BY c.nom
$$;

COMMENT ON FUNCTION app.equipes_du_jour(text, date) IS
  'Pour chaque circuit actif ce jour-là : la taille d''équipe prévue à la fiche, le nombre d''agents affectés, et combien ont été pointés présents. Un circuit sans chauffeur affecté est la première chose qu''un chef de service veut voir le matin.';

GRANT EXECUTE ON FUNCTION app.equipes_du_jour(text, date) TO siipi_app;

-- ----------------------------------------------------------------------------
-- 8. Le coût du service dans le temps.
--
--    Volontairement au niveau du service. Le coût à la tonne — le seul chiffre
--    qui permette réellement de comparer deux communes — attend le module des
--    pesées ; la colonne est là, vide, et le restera tant qu'on n'aura pas de
--    tonnage vérifié plutôt qu'estimé.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.cout_service(p_commune text, p_service text DEFAULT 'proprete')
  RETURNS TABLE (
    annee                  smallint,
    effectif_total         integer,
    masse_salariale_tnd    numeric,
    cout_moyen_agent_tnd   numeric,
    evolution_pct          numeric,
    source                 text
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT e.annee,
         (COALESCE(e.effectif_ouvriers, 0)
          + COALESCE(e.effectif_encadrement, 0)
          + COALESCE(e.effectif_contractuels, 0))::integer AS effectif_total,
         e.masse_salariale_tnd,
         CASE WHEN COALESCE(e.effectif_ouvriers, 0)
                   + COALESCE(e.effectif_encadrement, 0)
                   + COALESCE(e.effectif_contractuels, 0) > 0
              THEN round(e.masse_salariale_tnd
                         / (COALESCE(e.effectif_ouvriers, 0)
                            + COALESCE(e.effectif_encadrement, 0)
                            + COALESCE(e.effectif_contractuels, 0)), 3)
         END,
         CASE WHEN lag(e.masse_salariale_tnd) OVER (ORDER BY e.annee) > 0
              THEN round(100 * (e.masse_salariale_tnd
                                - lag(e.masse_salariale_tnd) OVER (ORDER BY e.annee))
                         / lag(e.masse_salariale_tnd) OVER (ORDER BY e.annee), 1)
         END,
         e.source
    FROM effectifs_service e
   WHERE e.commune_id = p_commune AND e.service = p_service
   ORDER BY e.annee
$$;

COMMENT ON FUNCTION app.cout_service(text, text) IS
  'Masse salariale du service par année, coût moyen par agent et évolution. Le coût à la tonne n''y figure pas tant que les pesées ne sont pas dans la base : un ratio calculé sur un tonnage estimé serait plus nuisible qu''utile.';

GRANT EXECUTE ON FUNCTION app.cout_service(text, text) TO siipi_app;

-- ----------------------------------------------------------------------------
-- 9. Les incohérences que le personnel fait apparaître.
--
--    On reprend app.incoherences_commune de la migration 033 et on lui ajoute
--    cinq branches. Comme en 033 : la fonction ne corrige rien. Elle pose des
--    questions à qui de droit.
--
--    Une règle qu'on N'ÉCRIT PAS ici, et c'est délibéré : « un agent affecté à
--    deux circuits le même jour ». À Dar Chaabane, le camion 02 214 147 dessert
--    Jadid le matin et Barnousa l'après-midi. Son équipe fait de même. Ce n'est
--    pas une anomalie, c'est l'organisation réelle. On ne signale la double
--    affectation que lorsque les HORAIRES des deux circuits se chevauchent,
--    c'est-à-dire lorsqu'elle est physiquement impossible.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.incoherences_commune(p_commune text)
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

COMMENT ON FUNCTION app.incoherences_commune(text) IS
  'Recoupe le registre des circuits, l''inventaire du parc et les affectations de personnel. Ne corrige rien : pose des questions à qui de droit. Une plateforme qui nettoierait ces écarts seule ferait disparaître le seul signal disponible sur la qualité des données.';

GRANT EXECUTE ON FUNCTION app.incoherences_commune(text) TO siipi_app;
