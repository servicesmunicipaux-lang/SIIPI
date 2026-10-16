-- =========================================================================
-- 078 — Les districts de la FNCT : le découpage officiel (décision D-FNCT-2,
-- 16 octobre 2026).
--
-- Le décret n° 2023-589 du 21 septembre 2023 répartit les 24 gouvernorats en
-- cinq districts. Jusqu'ici, les tables existaient (migration 050) et restaient
-- vides : « aucune liste n'est supposée ». La FNCT a tranché : c'est la liste
-- du décret. Elle reste modifiable par la FNCT (PUT /kpi/districts), qui cite
-- alors la pièce qui fonde le changement.
--
-- LES TABLES DE 050 SONT GARDÉES. `districts_fnct` (code, nom, nom_ar, ordre)
-- et `gouvernorats_district` (gouvernorat → district) sont déjà celles que lisent
-- les indicateurs nationaux (/kpi/national, /kpi/repartition), le suivi du
-- déploiement et les agrégats WaPla. Une seconde table « districts » ferait deux
-- vérités. Le gouvernorat n'a pas de table à lui dans SIIPI : il est le texte
-- porté par chaque commune (référentiel de découpage), et c'est ce texte qui
-- sert de clé.
--
-- LES NOMS DES GOUVERNORATS VIVENT ICI, ET NULLE PART DANS LE CODE. Ils sont
-- écrits comme le référentiel des communes les écrit (« Manouba », sans
-- article) ; la campagne `districts` vérifie qu'aucun gouvernorat d'une commune
-- réelle ne reste sans district.
--
-- Le découpage n'est posé que sur une base où la FNCT n'a encore défini aucun
-- district : rejouée, ou sur une base où elle en aurait défini d'autres, la
-- migration ne réécrit rien.
-- =========================================================================

-- Le code officiel s'écrit en majuscules (D1 à D5).
ALTER TABLE districts_fnct DROP CONSTRAINT IF EXISTS districts_fnct_code;
ALTER TABLE districts_fnct ADD CONSTRAINT districts_fnct_code CHECK (code ~ '^[A-Za-z0-9_-]{1,40}$');

ALTER TABLE districts_fnct ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE districts_fnct DROP CONSTRAINT IF EXISTS districts_fnct_source;
ALTER TABLE districts_fnct ADD CONSTRAINT districts_fnct_source CHECK (source IS NULL OR length(btrim(source)) >= 5);
COMMENT ON COLUMN districts_fnct.source IS
  'La pièce qui fonde le district et le rattachement de ses gouvernorats (décret, décision de la FNCT). Exigée par l''API à chaque définition.';
COMMENT ON TABLE districts_fnct IS
  'Les districts de la FNCT. Depuis D-FNCT-2 (migration 078) : les cinq districts du décret n° 2023-589 du 21 septembre 2023, modifiables par la FNCT seule, avec leur source.';

DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM districts_fnct) OR EXISTS (SELECT 1 FROM gouvernorats_district) THEN
    RAISE NOTICE 'Districts déjà définis par la FNCT : le découpage du décret n''est pas posé.';
    RETURN;
  END IF;

  INSERT INTO districts_fnct (code, nom, nom_ar, ordre, source) VALUES
    ('D1', 'District 1', 'الإقليم الأول',  1, 'Décret n° 2023-589 du 21 septembre 2023'),
    ('D2', 'District 2', 'الإقليم الثاني', 2, 'Décret n° 2023-589 du 21 septembre 2023'),
    ('D3', 'District 3', 'الإقليم الثالث', 3, 'Décret n° 2023-589 du 21 septembre 2023'),
    ('D4', 'District 4', 'الإقليم الرابع', 4, 'Décret n° 2023-589 du 21 septembre 2023'),
    ('D5', 'District 5', 'الإقليم الخامس', 5, 'Décret n° 2023-589 du 21 septembre 2023');

  INSERT INTO gouvernorats_district (gouvernorat, district_code) VALUES
    ('Bizerte', 'D1'), ('Béja', 'D1'), ('Jendouba', 'D1'), ('Le Kef', 'D1'),
    ('Tunis', 'D2'), ('Ariana', 'D2'), ('Ben Arous', 'D2'), ('Zaghouan', 'D2'), ('Manouba', 'D2'), ('Nabeul', 'D2'),
    ('Siliana', 'D3'), ('Sousse', 'D3'), ('Kasserine', 'D3'), ('Kairouan', 'D3'), ('Monastir', 'D3'), ('Mahdia', 'D3'),
    ('Gafsa', 'D4'), ('Sfax', 'D4'), ('Sidi Bouzid', 'D4'), ('Tozeur', 'D4'),
    ('Kébili', 'D5'), ('Gabès', 'D5'), ('Tataouine', 'D5'), ('Médenine', 'D5');
END
$migration$;

-- Un gouvernorat qui ne figure pas au référentiel des communes serait un
-- rattachement mort : la base le dit à qui migre, sans échouer (sur une base
-- neuve, les communes ne sont importées qu'après les migrations).
DO $controle$
DECLARE
  v_orphelins text;
BEGIN
  SELECT string_agg(DISTINCT c.gouvernorat, ', ' ORDER BY c.gouvernorat) INTO v_orphelins
    FROM communes c
   WHERE NOT c.est_demo AND c.deleted_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM gouvernorats_district gd WHERE gd.gouvernorat = c.gouvernorat);
  IF v_orphelins IS NOT NULL AND EXISTS (SELECT 1 FROM districts_fnct) THEN
    RAISE NOTICE 'Gouvernorats sans district : %', v_orphelins;
  END IF;
END
$controle$;
