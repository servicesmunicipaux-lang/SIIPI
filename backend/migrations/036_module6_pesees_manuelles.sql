-- ============================================================================
-- 036_module6_pesees_manuelles.sql
--
-- Rubrique 4 du cahier des charges — Pesées et traçabilité, PREMIER VOLET :
-- la saisie manuelle depuis le portail municipal.
--
-- CE QUE CE MODULE FAIT, ET CE QU'IL NE FAIT PAS. L'interopérabilité avec la
-- plateforme de l'ANGeD n'est pas possible aujourd'hui. Ni l'import de leurs
-- classeurs (B4.1) ni le recoupement avec leurs chiffres (B4.3) ne sont donc
-- construits ici. Ce qui l'est : rattacher un pesage saisi à la main au
-- CIRCUIT qui l'a produit (B4.2), l'historique (B4.4) et le registre
-- numérique (B4.5).
--
-- POURQUOI UNE TABLE NEUVE PLUTÔT QUE D'ÉTENDRE `pesees_anged`. Celle-ci est
-- bâtie autour d'un `ticket_number_anged` NOT NULL UNIQUE : un bon de pesée
-- émis par le pont-bascule de l'ANGeD. Une saisie communale n'a pas de ticket
-- ANGeD, et l'y forcer obligerait à en fabriquer — c'est-à-dire à inventer
-- l'identifiant d'un document qui n'existe pas. `pesees_anged` reste ce
-- qu'elle est ; le registre communal vit à côté.
--
-- MAIS LES DEUX DOIVENT POUVOIR SE PARLER PLUS TARD. La colonne `source` est
-- là pour cela, dès aujourd'hui, alors même qu'elle ne prend qu'une seule
-- valeur. Le jour où l'ANGeD ouvrira ses données, elles se déversent dans
-- cette table avec source = 'anged', et le recoupement demandé au B4.3
-- devient une REQUÊTE — pas une migration, pas une reprise de l'existant,
-- pas un arbitrage sur ce qu'on fait des lignes déjà saisies.
--
-- LE POIDS QUE L'AGENT SAISIT EST LE POIDS NET. Le brut et la tare ne sont
-- demandés que s'il a le bon du pont-bascule sous les yeux ; sinon il n'a
-- qu'un chiffre, et lui réclamer trois cases dont deux qu'il devra inventer
-- est le meilleur moyen d'obtenir des tares fantaisistes. Quand les trois
-- sont donnés, la base vérifie qu'ils s'accordent.
-- ============================================================================

CREATE TABLE IF NOT EXISTS pesees (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id      TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,

    date_pesee      DATE NOT NULL DEFAULT CURRENT_DATE,

    -- --- Ce qui a produit ce tonnage ---------------------------------------
    --
    -- Le circuit peut être absent : un apport ponctuel — un dépôt sauvage
    -- évacué, une benne de DDC d'un chantier communal — n'appartient à aucune
    -- tournée. Mais alors il faut dire d'où il vient (voir la contrainte).
    circuit_id      UUID REFERENCES circuits(id) ON DELETE SET NULL,
    voyage          SMALLINT NOT NULL DEFAULT 1,

    vehicule_id     TEXT REFERENCES vehicules(id) ON DELETE SET NULL,
    -- L'engin peut ne pas être au parc : un camion loué, celui d'un
    -- prestataire. On garde l'immatriculation écrite telle quelle.
    vehicule_immat  TEXT,

    type_dechet     TEXT NOT NULL DEFAULT 'menager',

    -- --- Le poids ----------------------------------------------------------
    poids_net_kg    NUMERIC(10,2) NOT NULL,
    poids_brut_kg   NUMERIC(10,2),
    poids_tare_kg   NUMERIC(10,2),

    destination     TEXT,
    bon_numero      TEXT,
    observation     TEXT,

    -- --- D'où vient cette ligne --------------------------------------------
    source          TEXT NOT NULL DEFAULT 'saisie_communale',

    saisi_par       UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT pesee_voyage_positif CHECK (voyage >= 1),
    CONSTRAINT pesee_poids_positif  CHECK (poids_net_kg > 0),
    CONSTRAINT pesee_brut_tare_positifs CHECK (
      (poids_brut_kg IS NULL OR poids_brut_kg > 0)
      AND (poids_tare_kg IS NULL OR poids_tare_kg >= 0)),

    -- Le brut et la tare vont ensemble : l'un sans l'autre ne dit rien.
    CONSTRAINT pesee_brut_tare_ensemble CHECK (
      (poids_brut_kg IS NULL) = (poids_tare_kg IS NULL)),

    -- Quand les trois chiffres sont là, ils doivent s'accorder — à un kilo
    -- près, parce que les bons de pesée sont souvent arrondis.
    CONSTRAINT pesee_poids_coherents CHECK (
      poids_brut_kg IS NULL
      OR abs((poids_brut_kg - poids_tare_kg) - poids_net_kg) <= 1),

    -- Nomenclature de la migration 024 : « ddc » et non « gravats ». Un
    -- système national qui nomme ses flux autrement que sa réglementation ne
    -- pourra pas consolider ses tonnages par filière le jour venu.
    CONSTRAINT pesee_type_dechet_valide CHECK (type_dechet IN (
      'menager', 'vert', 'ddc', 'encombrant', 'metal', 'tri', 'autre')),

    CONSTRAINT pesee_source_valide CHECK (source IN (
      'saisie_communale', 'anged', 'prestataire')),

    -- Un tonnage sans circuit ET sans explication est un tonnage dont
    -- personne ne saura jamais d'où il vient. On exige l'un ou l'autre.
    CONSTRAINT pesee_origine_renseignee CHECK (
      circuit_id IS NOT NULL
      OR (observation IS NOT NULL AND btrim(observation) <> '')),

    -- Un engin, d'une façon ou d'une autre.
    CONSTRAINT pesee_engin_renseigne CHECK (
      vehicule_id IS NOT NULL
      OR (vehicule_immat IS NOT NULL AND btrim(vehicule_immat) <> ''))
);

-- Un voyage d'un circuit donne UNE pesée par jour. Même règle que les
-- déclarations de passage (migration 029) : c'est la même unité de travail.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pesee_une_par_voyage
  ON pesees (circuit_id, date_pesee, voyage)
  WHERE circuit_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pesees_commune_date ON pesees (commune_id, date_pesee DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pesees_circuit      ON pesees (circuit_id, date_pesee) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pesees_vehicule     ON pesees (vehicule_id, date_pesee) WHERE deleted_at IS NULL;

COMMENT ON TABLE pesees IS
  'Registre communal des pesées, saisi depuis le portail. Distinct de pesees_anged, bâtie autour d''un ticket de pont-bascule qu''une saisie manuelle n''a pas. La colonne « source » existe dès maintenant pour que les données ANGeD, le jour où elles seront accessibles, se déversent ici sans migration : le recoupement du B4.3 devient alors une requête.';
COMMENT ON COLUMN pesees.poids_net_kg IS
  'Le seul poids obligatoire : c''est celui que l''agent a sous les yeux. Réclamer brut et tare quand il n''a pas le bon du pont-bascule produit des tares inventées.';
COMMENT ON COLUMN pesees.source IS
  'saisie_communale aujourd''hui, anged ou prestataire demain. La colonne n''a qu''une valeur pour l''instant, et c''est voulu : elle évite la migration du jour où il y en aura trois.';

-- ----------------------------------------------------------------------------
-- 2. Ce que la base refuse.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.controler_pesee() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_commune_circuit TEXT;
  v_commune_engin   TEXT;
  v_voyages         SMALLINT;
BEGIN
  IF NEW.circuit_id IS NOT NULL THEN
    SELECT c.commune_id, c.voyages_par_jour INTO v_commune_circuit, v_voyages
      FROM circuits c WHERE c.id = NEW.circuit_id;

    IF v_commune_circuit IS DISTINCT FROM NEW.commune_id THEN
      RAISE EXCEPTION 'PESEE_CIRCUIT_HORS_COMMUNE'
        USING ERRCODE = 'check_violation',
              HINT = 'Le circuit indiqué ne relève pas de cette commune.';
    END IF;

    -- Un circuit qui fait deux voyages par jour ne peut pas en produire un
    -- troisième. Si l'organisation a changé, c'est la fiche du circuit qu'il
    -- faut corriger — pas la pesée qu'il faut forcer.
    IF v_voyages IS NOT NULL AND NEW.voyage > v_voyages THEN
      RAISE EXCEPTION 'PESEE_VOYAGE_HORS_FICHE'
        USING ERRCODE = 'check_violation',
              DETAIL = format('La fiche du circuit annonce %s voyage(s) par jour ; pesée saisie pour le voyage %s.',
                              v_voyages, NEW.voyage),
              HINT = 'Corriger le voyage, ou mettre la fiche du circuit à jour.';
    END IF;
  END IF;

  IF NEW.vehicule_id IS NOT NULL THEN
    SELECT v.commune_id INTO v_commune_engin FROM vehicules v WHERE v.id = NEW.vehicule_id;
    IF v_commune_engin IS DISTINCT FROM NEW.commune_id THEN
      RAISE EXCEPTION 'PESEE_ENGIN_HORS_COMMUNE'
        USING ERRCODE = 'check_violation',
              HINT = 'L''engin indiqué ne relève pas de cette commune.';
    END IF;
  END IF;

  -- Une pesée datée de demain est une faute de frappe, pas une prévision.
  IF NEW.date_pesee > CURRENT_DATE THEN
    RAISE EXCEPTION 'PESEE_DANS_LE_FUTUR'
      USING ERRCODE = 'check_violation',
            HINT = 'Une pesée se constate, elle ne s''anticipe pas.';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_pesees_controle ON pesees;
CREATE TRIGGER trg_pesees_controle
  BEFORE INSERT OR UPDATE ON pesees
  FOR EACH ROW EXECUTE FUNCTION app.controler_pesee();

-- ----------------------------------------------------------------------------
-- 3. RLS.
-- ----------------------------------------------------------------------------

ALTER TABLE pesees ENABLE ROW LEVEL SECURITY;
ALTER TABLE pesees FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pesees_select ON pesees;
CREATE POLICY pesees_select ON pesees FOR SELECT
  USING (app.is_fnct() OR app.can_write_commune(commune_id));

DROP POLICY IF EXISTS pesees_ecriture ON pesees;
CREATE POLICY pesees_ecriture ON pesees FOR ALL
  USING      (app.can_write_commune(commune_id))
  WITH CHECK (app.can_write_commune(commune_id));

GRANT SELECT, INSERT, UPDATE ON pesees TO siipi_app;
REVOKE DELETE, TRUNCATE      ON pesees FROM siipi_app;

-- ----------------------------------------------------------------------------
-- 4. Les tonnages.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.tonnages_commune(
    p_commune text,
    p_depuis  date DEFAULT (CURRENT_DATE - 30),
    p_jusqua  date DEFAULT CURRENT_DATE
  )
  RETURNS TABLE (
    circuit_id    uuid,
    circuit       text,
    type_dechet   text,
    pesees        bigint,
    tonnage_t     numeric,
    moyenne_t     numeric
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT p.circuit_id,
         COALESCE(c.nom, 'Hors circuit'),
         p.type_dechet,
         count(*),
         round(sum(p.poids_net_kg) / 1000.0, 3),
         round(avg(p.poids_net_kg) / 1000.0, 3)
    FROM pesees p
    LEFT JOIN circuits c ON c.id = p.circuit_id
   WHERE p.commune_id = p_commune
     AND p.deleted_at IS NULL
     AND p.date_pesee BETWEEN p_depuis AND p_jusqua
   GROUP BY p.circuit_id, c.nom, p.type_dechet
   ORDER BY 5 DESC
$$;

COMMENT ON FUNCTION app.tonnages_commune(text, date, date) IS
  'Tonnage par circuit et par flux sur une période. « Hors circuit » regroupe les apports ponctuels, qui doivent porter une observation disant d''où ils viennent.';

GRANT EXECUTE ON FUNCTION app.tonnages_commune(text, date, date) TO siipi_app;

-- La saisonnalité, demandée à l'axe 1 des indicateurs. Rendue par mois, avec
-- la production spécifique en kg par habitant et par jour — le seul chiffre
-- qui permette de se comparer à une commune de taille différente.
CREATE OR REPLACE FUNCTION app.tonnage_mensuel(p_commune text, p_annee integer DEFAULT NULL)
  RETURNS TABLE (
    annee            integer,
    mois             integer,
    tonnage_t        numeric,
    pesees           bigint,
    kg_hab_jour      numeric
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT EXTRACT(year  FROM p.date_pesee)::integer,
         EXTRACT(month FROM p.date_pesee)::integer,
         round(sum(p.poids_net_kg) / 1000.0, 3),
         count(*),
         -- Population nulle ou inconnue : on rend NULL plutôt qu'une division
         -- par zéro déguisée en zéro kilo par habitant.
         CASE WHEN co.population > 0
              THEN round(sum(p.poids_net_kg)
                         / co.population
                         / EXTRACT(day FROM (date_trunc('month', p.date_pesee)
                                             + interval '1 month - 1 day')), 3)
         END
    FROM pesees p
    JOIN communes co ON co.id = p.commune_id
   WHERE p.commune_id = p_commune
     AND p.deleted_at IS NULL
     AND (p_annee IS NULL OR EXTRACT(year FROM p.date_pesee)::integer = p_annee)
   GROUP BY 1, 2, co.population, date_trunc('month', p.date_pesee)
   ORDER BY 1, 2
$$;

COMMENT ON FUNCTION app.tonnage_mensuel(text, integer) IS
  'Tonnage par mois et production spécifique (kg/hab/jour). Le ratio est NULL quand la population est inconnue : une division par zéro déguisée en « 0 kg/hab » serait pire que pas de chiffre du tout.';

GRANT EXECUTE ON FUNCTION app.tonnage_mensuel(text, integer) TO siipi_app;

-- ----------------------------------------------------------------------------
-- 5. Le coût à la tonne — la promesse du module 4, tenue.
--
-- La fonction app.cout_service rendait jusqu'ici la masse salariale et le coût
-- moyen par agent, avec cette note : « le coût à la tonne attend le registre
-- des pesées ; un ratio calculé sur un tonnage estimé serait plus nuisible
-- qu'utile ». Le registre existe maintenant, et le ratio se calcule sur des
-- tonnages CONSTATÉS.
--
-- LE PIÈGE, TROUVÉ EN ÉPROUVANT LA FONCTION. Diviser une année entière de
-- masse salariale par le tonnage d'un seul mois de pesées donne un coût à la
-- tonne délirant — 100 340 TND dans le jeu d'essai. L'arithmétique est juste ;
-- la comparaison ne l'est pas. Et ce genre de chiffre finit en capture d'écran
-- dans une réunion.
--
-- Les deux termes sont donc ramenés à la MÊME période : la masse salariale est
-- proratisée sur le nombre de mois où des pesées existent. Les salaires étant
-- à peu près uniformes d'un mois sur l'autre, le rapport est défendable. Le
-- nombre de mois couverts est rendu à côté, pour que l'interface puisse dire
-- « sur 3 mois de pesées » plutôt que de laisser croire à une année pleine.
--
-- Le ratio reste NULL tant qu'aucune pesée n'existe pour l'exercice : une case
-- vide se comprend, un 0 se cite.
-- ----------------------------------------------------------------------------

-- La signature de retour change (deux colonnes de plus) : PostgreSQL refuse
-- un CREATE OR REPLACE dans ce cas. On supprime d'abord, explicitement. La
-- permission d'exécution disparaît avec la fonction : elle est redonnée plus
-- bas, et c'est pour cela que ce GRANT n'est pas décoratif.
DROP FUNCTION IF EXISTS app.cout_service(text, text);

CREATE OR REPLACE FUNCTION app.cout_service(p_commune text, p_service text DEFAULT 'proprete')
  RETURNS TABLE (
    annee                  smallint,
    effectif_total         integer,
    masse_salariale_tnd    numeric,
    cout_moyen_agent_tnd   numeric,
    evolution_pct          numeric,
    tonnage_t              numeric,
    mois_pesees            integer,
    cout_tonne_tnd         numeric,
    source                 text
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  WITH tonnages AS (
    SELECT EXTRACT(year FROM p.date_pesee)::smallint AS annee,
           sum(p.poids_net_kg) / 1000.0 AS tonnes,
           count(DISTINCT date_trunc('month', p.date_pesee)) AS mois
      FROM pesees p
     WHERE p.commune_id = p_commune AND p.deleted_at IS NULL
     GROUP BY 1
  )
  SELECT e.annee,
         (COALESCE(e.effectif_ouvriers, 0)
          + COALESCE(e.effectif_encadrement, 0)
          + COALESCE(e.effectif_contractuels, 0))::integer,
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
         round(t.tonnes, 3),
         t.mois::integer,
         -- Coût SALARIAL à la tonne, et pas coût complet : ni le carburant ni
         -- la maintenance n'entrent encore en base. Le nom de la colonne le
         -- dit, et l'interface aussi — un ratio partiel présenté comme complet
         -- est un chiffre qu'on opposera un jour à la commune.
         --
         -- La masse salariale est ramenée aux mois effectivement pesés, sans
         -- quoi le premier mois de saisie afficherait un coût à la tonne
         -- douze fois trop élevé.
         CASE WHEN t.tonnes > 0 AND t.mois > 0
              THEN round(e.masse_salariale_tnd * t.mois / 12.0 / t.tonnes, 3)
         END,
         e.source
    FROM effectifs_service e
    LEFT JOIN tonnages t ON t.annee = e.annee
   WHERE e.commune_id = p_commune AND e.service = p_service
   ORDER BY e.annee
$$;

COMMENT ON FUNCTION app.cout_service(text, text) IS
  'Masse salariale par exercice, et coût SALARIAL à la tonne sur les mois effectivement pesés. Les deux termes portent sur la même période : diviser une année de salaires par un mois de pesées donnerait un ratio douze fois trop élevé, et ce genre de chiffre finit en capture d''écran. Ni carburant ni maintenance n''y entrent : ce n''est pas un coût complet.';

GRANT EXECUTE ON FUNCTION app.cout_service(text, text) TO siipi_app;

-- ----------------------------------------------------------------------------
-- 6. Ce que les pesées font apparaître.
--
-- Le contrôle qui compte ici est le premier : un tonnage supérieur à la charge
-- utile de l'engin. Le module 3 a enregistré la charge utile de chacun des
-- vingt-neuf engins de Dar Chaabane ; croiser les deux ne demande rien de
-- plus, et c'est le seul moyen de distinguer une faute de frappe — 12 000 kg
-- tapé au lieu de 1 200 — d'une surcharge réelle. Les deux appellent une
-- action, mais pas la même, et aucune ne se voit en lisant la liste.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.incoherences_pesees(p_commune text)
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
  -- 1. Un tonnage au-dessus de ce que l'engin peut porter.
  SELECT 'bloquant', 'pesees',
         format('%s — %s', to_char(p.date_pesee, 'DD/MM/YYYY'), v.registration),
         p.id::text,
         format('%s kg pesés sur un engin de %s t de charge utile.',
                trim(to_char(p.poids_net_kg, '999999')), v.charge_utile_t),
         'Vérifier la saisie : une décimale déplacée donne ce résultat. S''il s''agit d''une surcharge réelle, elle engage la commune.'
    FROM pesees p
    JOIN vehicules v ON v.id = p.vehicule_id
   WHERE p.commune_id = p_commune AND p.deleted_at IS NULL
     AND v.charge_utile_t IS NOT NULL AND v.charge_utile_t > 0
     AND p.poids_net_kg > v.charge_utile_t * 1000

  UNION ALL

  -- 2. Une pesée un jour où le circuit n'est pas censé passer.
  --    Avertissement et non blocage : les rattrapages après jour férié
  --    existent, et ils sont légitimes.
  SELECT 'avertissement', 'pesees',
         format('%s — %s', to_char(p.date_pesee, 'DD/MM/YYYY'), c.nom),
         p.id::text,
         'Pesée un jour où ce circuit n''est pas programmé.',
         'Rattrapage ? Alors le noter en observation. Sinon, corriger la date ou les jours de passage du circuit.'
    FROM pesees p
    JOIN circuits c ON c.id = p.circuit_id
   WHERE p.commune_id = p_commune AND p.deleted_at IS NULL
     AND c.deleted_at IS NULL
     AND cardinality(c.jours_passage) > 0
     AND NOT (EXTRACT(isodow FROM p.date_pesee)::smallint = ANY (c.jours_passage))
     AND (p.observation IS NULL OR btrim(p.observation) = '')

  UNION ALL

  -- 3. Une pesée attribuée à un engin que l'inventaire dit immobilisé.
  SELECT 'avertissement', 'pesees',
         format('%s — %s', to_char(p.date_pesee, 'DD/MM/YYYY'), v.registration),
         p.id::text,
         format('Engin déclaré %s à l''inventaire%s.',
                CASE v.etat WHEN 'en_panne' THEN 'en panne'
                            WHEN 'a_reformer' THEN 'en panne, à réformer'
                            ELSE 'réformé' END,
                CASE WHEN v.etat_depuis IS NOT NULL
                     THEN ' depuis le ' || to_char(v.etat_depuis, 'DD/MM/YYYY')
                     ELSE '' END),
         'Soit l''engin est reparti et l''inventaire n''a pas suivi, soit la pesée porte sur un autre engin.'
    FROM pesees p
    JOIN vehicules v ON v.id = p.vehicule_id
   WHERE p.commune_id = p_commune AND p.deleted_at IS NULL
     AND v.deleted_at IS NULL AND v.etat <> 'en_service'
     AND (v.etat_depuis IS NULL OR p.date_pesee >= v.etat_depuis)

  UNION ALL

  -- 4. Une immatriculation écrite à la main qui ne correspond à aucun engin.
  --    Même comparaison indifférente à la ponctuation qu'en migration 033 :
  --    trois services écrivent la même plaque de trois façons.
  SELECT 'information', 'pesees',
         format('%s — %s', to_char(p.date_pesee, 'DD/MM/YYYY'), p.vehicule_immat),
         p.id::text,
         'Immatriculation saisie à la main, introuvable au parc.',
         'Engin loué ou d''un prestataire ? Alors c''est normal. Sinon, l''inscrire à l''inventaire.'
    FROM pesees p
   WHERE p.commune_id = p_commune AND p.deleted_at IS NULL
     AND p.vehicule_id IS NULL
     AND p.vehicule_immat IS NOT NULL AND btrim(p.vehicule_immat) <> ''
     AND NOT EXISTS (
       SELECT 1 FROM vehicules v
        WHERE v.commune_id = p_commune AND v.deleted_at IS NULL
          AND regexp_replace(v.registration, '\D', '', 'g')
              = regexp_replace(p.vehicule_immat, '\D', '', 'g'))

  UNION ALL

  -- 5. Un circuit qui tourne et dont aucun tonnage n'est jamais enregistré.
  --    C'est le trou le plus coûteux du registre : sans lui, le tonnage
  --    communal est faux et personne ne voit de quel côté.
  SELECT 'avertissement', 'pesees', c.nom, c.id::text,
         'Circuit actif, aucune pesée enregistrée depuis trente jours.',
         'Saisir les pesées de ce circuit, ou indiquer qu''il ne passe pas au pont-bascule.'
    FROM circuits c
   WHERE c.commune_id = p_commune AND c.deleted_at IS NULL AND c.actif
     AND c.date_debut <= CURRENT_DATE - 30
     AND (c.date_fin IS NULL OR c.date_fin >= CURRENT_DATE)
     AND NOT EXISTS (
       SELECT 1 FROM pesees p
        WHERE p.circuit_id = c.id AND p.deleted_at IS NULL
          AND p.date_pesee >= CURRENT_DATE - 30)

  ORDER BY 1, 3
$$;

COMMENT ON FUNCTION app.incoherences_pesees(text) IS
  'Ce que le registre des pesées fait apparaître en le croisant avec le parc et les circuits. Le premier contrôle — tonnage au-dessus de la charge utile — est le seul moyen de distinguer une décimale déplacée d''une surcharge réelle : les deux appellent une action, mais pas la même.';

GRANT EXECUTE ON FUNCTION app.incoherences_pesees(text) TO siipi_app;

-- ----------------------------------------------------------------------------
-- 7. Une ligne de plus à l'union, et c'est tout.
--
-- C'est ce que la restructuration de la migration 035 promettait : un module
-- ajoute SA fonction de contrôle et UNE ligne ici. Rien à recopier, donc rien
-- à perdre. Le panneau « À vérifier » du constat du matin montre le nouveau
-- domaine sans qu'une ligne du front change.
-- ----------------------------------------------------------------------------

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
  SELECT gravite, domaine, sujet, sujet_id, constat, quoi_faire
    FROM (
      SELECT * FROM app.incoherences_registres(p_commune)
      UNION ALL
      SELECT * FROM app.incoherences_communication(p_commune)
      UNION ALL
      SELECT * FROM app.incoherences_pesees(p_commune)
    ) tout
   ORDER BY CASE gravite WHEN 'bloquant' THEN 0
                         WHEN 'avertissement' THEN 1
                         ELSE 2 END,
            domaine, sujet
$$;

GRANT EXECUTE ON FUNCTION app.incoherences_commune(text) TO siipi_app;

-- ----------------------------------------------------------------------------
-- 8. Ce qu'il reste à saisir aujourd'hui.
--
-- La leçon du module 4, appliquée ici. La feuille de pointage rend TOUT
-- l'effectif, pointé ou non, parce qu'un écran qui n'affiche que les lignes
-- déjà saisies ne montre jamais celles qu'on a oubliées. Une liste de pesées
-- a exactement le même défaut : elle montre ce qui a été pesé, jamais ce qui
-- manque.
--
-- Cette fonction rend donc l'inverse : chaque voyage attendu ce jour-là,
-- d'après les jours de passage et le nombre de voyages de la fiche, avec la
-- pesée en face quand elle existe. Le responsable voit ses trous, pas ses
-- réussites.
--
-- Un circuit confié à un prestataire en est exclu : ce n'est pas la commune
-- qui pèse ses tonnages.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.pesees_attendues(p_commune text, p_jour date DEFAULT CURRENT_DATE)
  RETURNS TABLE (
    circuit_id     uuid,
    circuit        text,
    voyage         smallint,
    type_dechet    text,
    vehicule_id    text,
    vehicule_immat text,
    pesee_id       uuid,
    poids_net_kg   numeric
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT c.id, c.nom, v.voyage::smallint, c.type_dechet,
         c.vehicule_id, COALESCE(vh.registration, c.vehicule_immat),
         p.id, p.poids_net_kg
    FROM circuits c
    CROSS JOIN LATERAL generate_series(1, GREATEST(COALESCE(c.voyages_par_jour, 1), 1)) AS v(voyage)
    LEFT JOIN vehicules vh ON vh.id = c.vehicule_id
    LEFT JOIN pesees p ON p.circuit_id = c.id
                      AND p.date_pesee = p_jour
                      AND p.voyage = v.voyage
                      AND p.deleted_at IS NULL
   WHERE c.commune_id = p_commune
     AND c.deleted_at IS NULL AND c.actif
     AND c.prestataire_id IS NULL
     AND c.date_debut <= p_jour
     AND (c.date_fin IS NULL OR c.date_fin >= p_jour)
     AND EXTRACT(isodow FROM p_jour)::smallint = ANY (c.jours_passage)
   ORDER BY c.nom, v.voyage
$$;

COMMENT ON FUNCTION app.pesees_attendues(text, date) IS
  'Les voyages attendus ce jour-là, avec la pesée en face quand elle existe. Rend les trous, pas les réussites : une liste des seules pesées saisies ne montre jamais ce qu''on a oublié de peser.';

GRANT EXECUTE ON FUNCTION app.pesees_attendues(text, date) TO siipi_app;
