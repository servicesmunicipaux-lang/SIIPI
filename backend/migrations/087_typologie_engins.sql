-- ============================================================================
-- 087 — La typologie des engins de collecte (lot T)
-- docs/specs_metier/DECISIONS_2026-10-20.md, complément du 25/10/2026 (lot T) ;
-- référence métier : docs/specs_metier/sources/guide_tadaeem_collecte_dma.pdf.
--
-- Le moteur volumétrique (17.2) et le taux de remplissage ont besoin de deux
-- choses que le parc ne disait pas : la CLASSE de l'engin de collecte (une benne
-- tasseuse ne se remplit pas comme une benne basculante) et son VOLUME, avec ce
-- qui le garantit. La colonne capacity_m3 existait depuis la migration 003 ;
-- aucun engin réel ne la portait.
--
-- RIEN N'EST DEVINÉ. Aucun engin existant ne reçoit de classe ici : le type du
-- parc (« camion », « remorque ») ne dit pas si c'est une benne basculante ou un
-- pick-up, une remorque agricole ou compactrice. La commune choisit ; l'écran lui
-- propose la classe évidente, il ne l'enregistre pas à sa place.
--
-- L'ATTELAGE. Pour un tracteur et sa remorque, la benne est la remorque : la
-- classe et le volume se portent sur elle, et le tracteur les reprend par
-- attele_a. Un tracteur ne reçoit jamais de classe. Sans remorque attelée, ou
-- avec plusieurs, le volume du tracteur est inconnu : SIIPI ne choisit pas.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Le référentiel des classes, national, en lecture seule
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS classes_engins (
    code               TEXT PRIMARY KEY,
    libelle_fr         TEXT NOT NULL,
    libelle_ar         TEXT NOT NULL,
    compactant         BOOLEAN NOT NULL,
    volume_ref_min_m3  NUMERIC(6,2),
    volume_ref_max_m3  NUMERIC(6,2),
    types_compatibles  TEXT[] NOT NULL,
    source             TEXT NOT NULL,
    ordre              SMALLINT NOT NULL,
    CONSTRAINT classes_engins_code CHECK (code ~ '^[a-z_]{1,40}$'),
    CONSTRAINT classes_engins_plage CHECK (
      (volume_ref_min_m3 IS NULL) = (volume_ref_max_m3 IS NULL)
      AND (volume_ref_min_m3 IS NULL OR (volume_ref_min_m3 > 0 AND volume_ref_min_m3 <= volume_ref_max_m3))),
    CONSTRAINT classes_engins_types CHECK (cardinality(types_compatibles) > 0)
);
COMMENT ON TABLE classes_engins IS
  'Les classes d''engins de collecte des DMA, référentiel national (lot T). Lecture seule pour l''application : une classe nouvelle demande une densité (17.2), donc une migration.';
COMMENT ON COLUMN classes_engins.compactant IS
  'L''engin tasse-t-il les déchets ? Une benne tasseuse les tasse, une benne basculante non : la densité retenue en dépend.';
COMMENT ON COLUMN classes_engins.volume_ref_min_m3 IS
  'Plage de volume de référence de la classe (min). Un volume hors plage est signalé dans « À vérifier », jamais refusé : une benne rehaussée de ridelles en sort légitimement. Vide si la référence ne donne pas de plage.';
COMMENT ON COLUMN classes_engins.types_compatibles IS
  'Les types du parc (vehicules.type) qui peuvent porter cette classe. La base refuse une classe portée par un type absent de la liste (une niveleuse ne devient pas une benne tasseuse).';
COMMENT ON COLUMN classes_engins.source IS
  'D''où vient la classe et sa plage de volume.';

INSERT INTO classes_engins (code, libelle_fr, libelle_ar, compactant, volume_ref_min_m3, volume_ref_max_m3, types_compatibles, source, ordre) VALUES
  ('benne_tasseuse', 'Camion à benne tasseuse', 'شاحنة ضاغطة', true, 7, 22,
   ARRAY['benne_tasseuse', 'autre'],
   'Guide d''optimisation de la collecte des DMA en Tunisie (USAID TADAEEM, MALE), Tableau 10 : bennes de 7 à 8 m³ et de 12 à 22 m³', 1),
  ('benne_basculante', 'Camion à benne basculante (Cbb)', 'شاحنة ذات صندوق قلاب', false, 6, 8,
   ARRAY['camion', 'autre'],
   'Guide d''optimisation de la collecte des DMA en Tunisie (USAID TADAEEM, MALE), Tableau 10 (6 m³ pour un PTAC de 3,5 t) et § 2.2.1 (jusqu''à 8 m³ avec ridelles)', 2),
  ('pick_up', 'Camionnette pick-up à benne basculante', 'شاحنة خفيفة ذات صندوق قلاب', false, 2.5, 2.5,
   ARRAY['camion', 'autre'],
   'Guide d''optimisation de la collecte des DMA en Tunisie (USAID TADAEEM, MALE), Tableau 10 : benne basculante de 2,5 m³', 3),
  ('tracteur_remorque_agricole', 'Tracteur et remorque agricole (Tag)', 'جرار ومجرورة فلاحية', false, 4, 8,
   ARRAY['remorque', 'tracteur_remorque', 'autre'],
   'Guide d''optimisation de la collecte des DMA en Tunisie (USAID TADAEEM, MALE), Tableau 5 (remorques de 4 à 8 m³) et § 2.2.1 (jusqu''à 8 m³ avec ridelles)', 4),
  ('tracteur_remorque_compactrice', 'Tracteur et remorque compactrice', 'جرار ومجرورة ضاغطة', true, NULL, NULL,
   ARRAY['remorque', 'tracteur_remorque', 'autre'],
   'Guide d''optimisation de la collecte des DMA en Tunisie (USAID TADAEEM, MALE), Tableaux 2 et 11 ; aucune plage de volume', 5),
  ('ampli_roll', 'Camion ampli-roll et caisson', 'شاحنة ذات ذراع وحاوية', false, NULL, NULL,
   ARRAY['camion_ampliroll', 'autre'],
   'Guide d''optimisation de la collecte des DMA en Tunisie (USAID TADAEEM, MALE), Tableau 3 (un seul caisson cité, de 30 m³ : pas de plage)', 6)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE classes_engins ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes_engins FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS classes_engins_select ON classes_engins;
CREATE POLICY classes_engins_select ON classes_engins FOR SELECT USING (app.is_authenticated());
GRANT SELECT ON classes_engins TO siipi_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON classes_engins FROM siipi_app;

-- ---------------------------------------------------------------------------
-- 2. L'engin : sa classe, son volume et ce qui le garantit
-- ---------------------------------------------------------------------------
ALTER TABLE vehicules
  ADD COLUMN IF NOT EXISTS classe_collecte   TEXT REFERENCES classes_engins(code),
  ADD COLUMN IF NOT EXISTS volume_provenance TEXT;

ALTER TABLE vehicules DROP CONSTRAINT IF EXISTS vehicules_volume_positif;
ALTER TABLE vehicules ADD  CONSTRAINT vehicules_volume_positif CHECK (capacity_m3 IS NULL OR capacity_m3 > 0);
ALTER TABLE vehicules DROP CONSTRAINT IF EXISTS vehicules_volume_provenance_valide;
ALTER TABLE vehicules ADD  CONSTRAINT vehicules_volume_provenance_valide
  CHECK (volume_provenance IS NULL OR (volume_provenance IN ('constructeur', 'mesure', 'declare') AND capacity_m3 IS NOT NULL));

COMMENT ON COLUMN vehicules.capacity_m3 IS
  'Volume de la benne (m³). Pour un attelage, il se porte sur la remorque. Vide = non renseigné, jamais zéro.';
COMMENT ON COLUMN vehicules.classe_collecte IS
  'Classe de collecte (classes_engins). Jamais déduite du type : la commune la choisit. Un tracteur n''en porte pas, sa remorque oui.';
COMMENT ON COLUMN vehicules.volume_provenance IS
  'Ce qui garantit le volume : constructeur (fiche technique), mesure (longueur × largeur × hauteur de la benne), declare (dit par la commune sans plus). Vide si le volume l''est, ou pour un volume saisi avant le lot T.';

-- La classe doit convenir au type. Contrôlé par déclencheur, parce qu'une
-- contrainte CHECK ne lit pas une autre table ; le changement de type d'un engin
-- déjà classé passe par le même contrôle.
CREATE OR REPLACE FUNCTION app.controler_classe_engin() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public, pg_temp AS
$$
BEGIN
  IF NEW.classe_collecte IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM classes_engins k WHERE k.code = NEW.classe_collecte AND NEW.type = ANY (k.types_compatibles)) THEN
    RAISE EXCEPTION 'La classe de collecte % ne convient pas à un engin de type %.', NEW.classe_collecte, NEW.type
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS vehicules_classe_compatible ON vehicules;
CREATE TRIGGER vehicules_classe_compatible
  BEFORE INSERT OR UPDATE OF classe_collecte, type ON vehicules
  FOR EACH ROW EXECUTE FUNCTION app.controler_classe_engin();

-- ---------------------------------------------------------------------------
-- 3. L'engin de travail : ce qui porte la benne d'un engin
-- ---------------------------------------------------------------------------
-- Une ligne pour tout engin visible : la classe, le volume et sa provenance de la
-- benne qui travaille, l'engin qui les porte, et, s'il en manque, ce qui manque.
-- Lu par le parc (fiche de l'engin), « À vérifier », puis 17.2 et le taux de
-- remplissage. Les droits sont ceux de l'appelant.
CREATE OR REPLACE FUNCTION app.engin_de_travail(p_vehicule text)
  RETURNS TABLE (vehicule_id text, porteur_id text, porteur_immat text, classe text,
                 volume_m3 numeric, volume_provenance text, manque text)
  LANGUAGE sql STABLE SET search_path = public, pg_temp AS
$$
  WITH v AS (
    SELECT * FROM vehicules WHERE id = p_vehicule AND deleted_at IS NULL
  ), remorques AS (
    SELECT r.* FROM vehicules r, v
     WHERE v.type = 'tracteur' AND r.attele_a = v.id AND r.deleted_at IS NULL
  ), porteur AS (
    SELECT CASE
             WHEN v.type <> 'tracteur' THEN v.id
             WHEN (SELECT count(*) FROM remorques) = 1 THEN (SELECT id FROM remorques)
           END AS id,
           CASE
             WHEN v.type <> 'tracteur' THEN NULL
             WHEN (SELECT count(*) FROM remorques) = 0 THEN 'remorque_absente'
             WHEN (SELECT count(*) FROM remorques) > 1 THEN 'remorques_multiples'
           END AS manque_attelage
      FROM v
  )
  SELECT v.id, p.id, b.registration, b.classe_collecte, b.capacity_m3, b.volume_provenance,
         COALESCE(p.manque_attelage,
                  CASE WHEN b.classe_collecte IS NULL AND b.capacity_m3 IS NULL THEN 'classe_et_volume'
                       WHEN b.classe_collecte IS NULL THEN 'classe'
                       WHEN b.capacity_m3 IS NULL THEN 'volume' END)
    FROM v
    JOIN porteur p ON true
    LEFT JOIN vehicules b ON b.id = p.id
$$;
GRANT EXECUTE ON FUNCTION app.engin_de_travail(text) TO siipi_app;
COMMENT ON FUNCTION app.engin_de_travail(text) IS
  'La benne qui travaille pour un engin : lui-même, ou pour un tracteur la seule remorque attelée. manque : remorque_absente, remorques_multiples, classe, volume, classe_et_volume, ou vide. Ne choisit jamais entre deux remorques.';

-- ---------------------------------------------------------------------------
-- 4. « À vérifier » : ce que la typologie ne dit pas encore
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.incoherences_engins(p_commune text)
  RETURNS TABLE (gravite text, domaine text, sujet text, sujet_id text, constat text, quoi_faire text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  -- Un circuit dont on ne connaîtra pas le tonnage estimé.
  SELECT 'information', 'parc', c.nom, c.id::text,
         CASE t.manque
           WHEN 'remorque_absente' THEN format('Le tracteur %s n''a aucune remorque attelée : le volume de ce circuit est inconnu.', v.registration)
           WHEN 'remorques_multiples' THEN format('Plusieurs remorques sont attelées au tracteur %s : SIIPI ne choisit pas laquelle fait ce circuit.', v.registration)
           ELSE format('L''engin %s n''a pas de classe de collecte ou pas de volume : le tonnage de ce circuit ne pourra pas être estimé.', t.porteur_immat)
         END,
         CASE t.manque
           WHEN 'remorque_absente' THEN 'Indiquer, dans le parc, la remorque attelée à ce tracteur.'
           WHEN 'remorques_multiples' THEN 'Ne laisser attelée au tracteur que la remorque qui fait ce circuit.'
           ELSE 'Renseigner la classe et le volume de l''engin dans le parc (fiche de l''engin).'
         END
    FROM circuits c
    JOIN vehicules v ON v.id = c.vehicule_id AND v.deleted_at IS NULL
    CROSS JOIN LATERAL app.engin_de_travail(v.id) t
   WHERE c.commune_id = p_commune AND c.deleted_at IS NULL AND c.actif
     AND t.manque IS NOT NULL AND app.can_read_commune(p_commune)
  UNION ALL
  -- Un volume hors de la plage de référence de sa classe : signalé, jamais refusé.
  SELECT 'information', 'parc', v.registration, v.id,
         format('Volume de %s m³, hors de la plage de référence de la classe « %s » (%s à %s m³).',
                replace(trim_scale(v.capacity_m3)::text, '.', ','), k.libelle_fr,
                replace(trim_scale(k.volume_ref_min_m3)::text, '.', ','), replace(trim_scale(k.volume_ref_max_m3)::text, '.', ',')),
         'Vérifier le volume saisi. Un volume hors plage n''est pas une erreur (une benne rehaussée de ridelles, par exemple) : SIIPI le signale, il ne le change pas.'
    FROM vehicules v
    JOIN classes_engins k ON k.code = v.classe_collecte
   WHERE v.commune_id = p_commune AND v.deleted_at IS NULL AND v.capacity_m3 IS NOT NULL
     AND k.volume_ref_min_m3 IS NOT NULL
     AND (v.capacity_m3 < k.volume_ref_min_m3 OR v.capacity_m3 > k.volume_ref_max_m3)
     AND app.can_read_commune(p_commune)
$$;
GRANT EXECUTE ON FUNCTION app.incoherences_engins(text) TO siipi_app;

-- Le panneau « À vérifier » : définition reprise de la migration 064, la
-- famille des engins en plus.
CREATE OR REPLACE FUNCTION app.incoherences_commune(p_commune text)
  RETURNS TABLE (gravite text, domaine text, sujet text, sujet_id text, constat text, quoi_faire text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT gravite, domaine, sujet, sujet_id, constat, quoi_faire
    FROM (
      SELECT * FROM app.incoherences_registres(p_commune)
      UNION ALL
      SELECT * FROM app.incoherences_communication(p_commune)
      UNION ALL
      SELECT * FROM app.incoherences_pesees(p_commune)
      UNION ALL
      SELECT * FROM app.incoherences_seuils(p_commune)
      UNION ALL
      SELECT * FROM app.incoherences_kpi(p_commune)
      UNION ALL
      SELECT * FROM app.incoherences_carburant(p_commune)
      UNION ALL
      SELECT * FROM app.incoherences_declassement(p_commune)
      UNION ALL
      SELECT * FROM app.incoherences_acteurs_informels(p_commune)
      UNION ALL
      SELECT * FROM app.incoherences_engins(p_commune)
    ) tout
   ORDER BY CASE gravite WHEN 'bloquant' THEN 0
                         WHEN 'avertissement' THEN 1
                         ELSE 2 END,
            domaine, sujet
$$;
GRANT EXECUTE ON FUNCTION app.incoherences_commune(text) TO siipi_app;
