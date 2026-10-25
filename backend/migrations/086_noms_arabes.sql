-- ============================================================================
-- 086 — Les noms arabes de douze communes, corrigés par décision (D-NOMS-AR-1)
-- docs/specs_metier/DECISIONS_2026-10-20.md § 6 et son complément du 25/10/2026 ;
-- docs/specs_metier/sources/sig/NOMS_ARABES_A_VALIDER.md.
--
-- 44 noms arabes différaient entre SIIPI et la carte du conseiller SIG (relevé du
-- 16/10/2026). Nacer a tranché cas par cas le 25/10/2026 : 12 corrigés (groupe A),
-- 24 gardés tels quels (groupe C), 8 en attente d'une source officielle (groupe B).
-- Seuls les 12 sont touchés ici, et chacun n'est corrigé que s'il porte encore le
-- nom constaté : une base où la FNCT aurait déjà changé ce nom n'est pas réécrite.
--
-- RIEN NE S'EFFACE. L'ancien nom reste lisible : dans corrections_referentiel
-- (ancien et nouveau nom, décision, source, date), que l'observatoire montre dans
-- Paramètres nationaux, et au journal d'audit, que le déclencheur de `communes`
-- alimente à chaque correction.
--
-- Sur une base neuve, les communes n'existent pas encore quand cette migration
-- passe : le seed les écrit ensuite, avec les noms corrigés et leurs corrections
-- (seed/data/communes_350.json) — l'état final est le même.
-- ============================================================================

ALTER TABLE corrections_referentiel ADD COLUMN IF NOT EXISTS ancien_nom TEXT;
ALTER TABLE corrections_referentiel ADD COLUMN IF NOT EXISTS nouveau_nom TEXT;
COMMENT ON COLUMN corrections_referentiel.ancien_nom IS
  'Pour une correction de nom (nature nom_arabe) : le nom que portait la commune avant la décision. Il ne s''efface pas.';
COMMENT ON COLUMN corrections_referentiel.nouveau_nom IS
  'Pour une correction de nom (nature nom_arabe) : le nom retenu par la décision.';

ALTER TABLE corrections_referentiel DROP CONSTRAINT IF EXISTS corrections_nature_valide;
ALTER TABLE corrections_referentiel ADD CONSTRAINT corrections_nature_valide
  CHECK (nature IN ('rattachee', 'creee', 'nom_arabe'));
ALTER TABLE corrections_referentiel DROP CONSTRAINT IF EXISTS corrections_nom_complet;
ALTER TABLE corrections_referentiel ADD CONSTRAINT corrections_nom_complet
  CHECK ((nature = 'nom_arabe') = (ancien_nom IS NOT NULL AND nouveau_nom IS NOT NULL AND ancien_nom <> nouveau_nom));

COMMENT ON TABLE corrections_referentiel IS
  'Les corrections apportées au référentiel des communes par décision de la FNCT (rattachement, création, nom arabe), avec leur source ; pour un nom, l''ancien et le nouveau. Montrées dans l''observatoire, Paramètres nationaux. Écrites par migration (ou par le seed sur une base neuve) seulement.';

-- La lecture rend aussi l'ancien et le nouveau nom : le type de retour change.
DROP FUNCTION IF EXISTS app.corrections_referentiel();
CREATE FUNCTION app.corrections_referentiel()
  RETURNS TABLE (decision text, nature text, commune text, commune_ar text, gouvernorat text,
                 cible text, cible_ar text, source text, decidee_le date, ancien_nom text, nouveau_nom text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT r.decision, r.nature, c.name, c.name_ar, c.gouvernorat, k.name, k.name_ar, r.source, r.decidee_le,
         r.ancien_nom, r.nouveau_nom
    FROM corrections_referentiel r
    JOIN communes c ON c.id = r.commune_id
    LEFT JOIN communes k ON k.id = r.commune_cible
   WHERE app.is_authenticated()
   -- Le rattachement avant la création : c'est l'ordre de la décision.
   ORDER BY r.decidee_le DESC, r.nature DESC, c.name
$$;
GRANT EXECUTE ON FUNCTION app.corrections_referentiel() TO siipi_app;

-- Les douze corrections (groupe A), là où la commune porte encore le nom constaté.
DO $$
DECLARE
  k record;
BEGIN
  FOR k IN SELECT * FROM (VALUES
    ('nabeul_tazarka',                            'تزغران',            'تازركة'),
    ('nabeul_tazghrane_boukrim_zaouiet_el_mgaiez', 'تزغران بوكريم',      'تزغران بوكريم زاوية المقايز'),
    ('tunis_tunis_capitale',                      'بلدية تونس',        'تونس'),
    ('tunis_sidi_bou_said',                       'سيدي بو سعيد',      'سيدي بوسعيد'),
    ('monastir_bembla_el_mnara',                  'بمبلة المنارة',     'بنبلة المنارة'),
    ('monastir_el_masdour_menzel_harb',           'المسدور منزل حرب',  'المصدور منزل حرب'),
    ('monastir_cherahil',                         'شراحيل',            'الشراحيل'),
    ('mahdia_tlelsa',                             'تلايلسة',           'التلالسة'),
    ('kairouan_el_alaa',                          'العلاء',            'العلا'),
    ('kairouan_nasrallah',                        'نصرالله',           'نصر الله'),
    ('medenine_ben_guerdane',                     'بنقردان',           'بن قردان'),
    ('tataouine_bir_lahmar',                      'بئر لحمر',          'بئر الأحمر')
  ) AS t(id, ancien, nouveau) LOOP
    IF EXISTS (SELECT 1 FROM communes WHERE id = k.id AND name_ar = k.ancien) THEN
      UPDATE communes SET name_ar = k.nouveau WHERE id = k.id AND name_ar = k.ancien;
    END IF;
    IF EXISTS (SELECT 1 FROM communes WHERE id = k.id AND name_ar = k.nouveau) THEN
      INSERT INTO corrections_referentiel (decision, nature, commune_id, source, decidee_le, ancien_nom, nouveau_nom)
      VALUES ('D-NOMS-AR-1', 'nom_arabe', k.id,
              'Décision de Nacer (FNCT) du 25/10/2026, d''après les écarts avec la carte du conseiller SIG du 16/10/2026',
              DATE '2026-10-25', k.ancien, k.nouveau)
      ON CONFLICT (decision, commune_id) DO NOTHING;
    END IF;
  END LOOP;
END $$;
