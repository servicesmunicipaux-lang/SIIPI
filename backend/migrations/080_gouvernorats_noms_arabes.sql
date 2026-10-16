-- =========================================================================
-- 080 — Les noms arabes des gouvernorats (lot 16.2).
--
-- L'en-tête d'un document administratif tunisien porte, en arabe, « ولاية … ».
-- Le référentiel des communes ne connaît le gouvernorat qu'en français (le
-- texte porté par chaque commune, migration 025). Les noms arabes vivent ici,
-- comme donnée — et nulle part dans le code (D-FNCT-2 : aucun nom de
-- gouvernorat écrit dans le code ; la campagne `districts` le vérifie).
--
-- Clé : le gouvernorat tel que l'écrit le référentiel des communes. Lisible par
-- tout compte authentifié (ce sont des noms publics) ; écrit par la FNCT seule.
-- =========================================================================

CREATE TABLE IF NOT EXISTS gouvernorats_noms (
    gouvernorat TEXT PRIMARY KEY,
    nom_ar      TEXT NOT NULL CHECK (length(btrim(nom_ar)) > 0),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE gouvernorats_noms IS
  'Le nom arabe de chaque gouvernorat, pour l''en-tête bilingue des documents administratifs (lot 16.2). Clé : le gouvernorat tel que l''écrit le référentiel des communes.';

ALTER TABLE gouvernorats_noms ENABLE ROW LEVEL SECURITY;
ALTER TABLE gouvernorats_noms FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gouvernorats_noms_lecture ON gouvernorats_noms;
CREATE POLICY gouvernorats_noms_lecture ON gouvernorats_noms FOR SELECT USING (app.is_authenticated());
DROP POLICY IF EXISTS gouvernorats_noms_fnct ON gouvernorats_noms;
CREATE POLICY gouvernorats_noms_fnct ON gouvernorats_noms FOR ALL USING (app.is_fnct()) WITH CHECK (app.is_fnct());
GRANT SELECT, INSERT, UPDATE ON gouvernorats_noms TO siipi_app;

INSERT INTO gouvernorats_noms (gouvernorat, nom_ar) VALUES
  ('Ariana', 'أريانة'), ('Béja', 'باجة'), ('Ben Arous', 'بن عروس'), ('Bizerte', 'بنزرت'),
  ('Gabès', 'قابس'), ('Gafsa', 'قفصة'), ('Jendouba', 'جندوبة'), ('Kairouan', 'القيروان'),
  ('Kasserine', 'القصرين'), ('Kébili', 'قبلي'), ('Le Kef', 'الكاف'), ('Mahdia', 'المهدية'),
  ('Manouba', 'منوبة'), ('Médenine', 'مدنين'), ('Monastir', 'المنستير'), ('Nabeul', 'نابل'),
  ('Sfax', 'صفاقس'), ('Sidi Bouzid', 'سيدي بوزيد'), ('Siliana', 'سليانة'), ('Sousse', 'سوسة'),
  ('Tataouine', 'تطاوين'), ('Tozeur', 'توزر'), ('Tunis', 'تونس'), ('Zaghouan', 'زغوان')
ON CONFLICT (gouvernorat) DO NOTHING;
