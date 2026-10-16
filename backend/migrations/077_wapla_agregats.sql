-- =========================================================================
-- 077 — Les agrégats nationaux des bilans WaPla (lot W5 ; docs/specs_metier/
-- SPEC_wapla_couche_planification.md § 5 et § 6, observatoire de la FNCT).
--
-- CE QUI ENTRE DANS UN AGRÉGAT est une règle, et elle vit ici, pas dans
-- l'écran : un bilan CALCULÉ, de niveau ÉTAYÉ, non retiré, d'une commune
-- RÉELLE (ni la commune de démonstration, ni une commune retirée du
-- référentiel). Un bilan indicatif reste lisible par la FNCT, un bilan
-- illustratif par la commune seule (075) : ni l'un ni l'autre n'entre dans un
-- agrégat. Un brouillon non plus — une saisie a rendu son résultat caduc.
--
-- « N COMMUNES SUR M » : chaque agrégat dit sur combien de communes il porte.
-- M compte les communes réelles du territoire, qu'elles aient un bilan ou non ;
-- un territoire sans bilan étayé n'a pas de chiffre (règle d'or 1.1), il a
-- « 0 commune sur M ».
--
-- AUCUN CLASSEMENT : ces fonctions ne rendent aucune ligne par commune à
-- l'écran ni aucun rang ; l'API additionne par gouvernorat et par district et
-- ne rend que ces sommes, dans l'ordre alphabétique.
--
-- Les grandeurs additionnées (décharge, brûlage, GES, uPOPs) se lisent dans le
-- résultat du moteur par l'API, avec la même définition que la comparaison des
-- scénarios (src/wapla/comparaison.ts) : une seule définition, pas deux.
--
-- La couche lit SIIPI (communes, districts de la FNCT) ; SIIPI ne lit
-- toujours rien de la couche.
-- =========================================================================

DROP FUNCTION IF EXISTS wapla.bilans_agregeables(integer);
CREATE FUNCTION wapla.bilans_agregeables(p_exercice integer)
  RETURNS TABLE (commune_id text, gouvernorat text, district text, resultat jsonb)
  LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS
$fn$
BEGIN
  -- Les agrégats sont l'affaire de l'observatoire national. Une commune lit
  -- ses propres bilans ; elle n'a pas à lire ceux des autres, même additionnés.
  IF NOT app.is_fnct() THEN
    RAISE EXCEPTION 'AGREGAT_FNCT: les agrégats nationaux WaPla sont réservés à la FNCT.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
    SELECT b.commune_id, c.gouvernorat, gd.district_code, b.resultat
      FROM wapla.bilans b
      JOIN communes c ON c.id = b.commune_id
      LEFT JOIN gouvernorats_district gd ON gd.gouvernorat = c.gouvernorat
     WHERE b.exercice = p_exercice
       AND b.statut = 'calcule'
       AND b.niveau = 'etaye'
       AND b.deleted_at IS NULL
       AND NOT c.est_demo
       AND c.deleted_at IS NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION wapla.bilans_agregeables(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wapla.bilans_agregeables(integer) TO siipi_app;
COMMENT ON FUNCTION wapla.bilans_agregeables(integer) IS
  'Les bilans qui entrent dans un agrégat national (lot W5, FNCT seule) : calculés, étayés, non retirés, d''une commune réelle — ni la commune de démonstration, ni une commune retirée. Un bilan indicatif ou illustratif n''y entre jamais. Droits de l''appelant : les règles de lecture de wapla.bilans valent aussi.';

DROP FUNCTION IF EXISTS wapla.communes_par_gouvernorat();
CREATE FUNCTION wapla.communes_par_gouvernorat()
  RETURNS TABLE (gouvernorat text, district text, communes bigint)
  LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS
$fn$
BEGIN
  IF NOT app.is_fnct() THEN
    RAISE EXCEPTION 'AGREGAT_FNCT: les agrégats nationaux WaPla sont réservés à la FNCT.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
    SELECT c.gouvernorat, gd.district_code, count(*)
      FROM communes c
      LEFT JOIN gouvernorats_district gd ON gd.gouvernorat = c.gouvernorat
     WHERE NOT c.est_demo AND c.deleted_at IS NULL
     GROUP BY c.gouvernorat, gd.district_code;
END;
$fn$;
REVOKE ALL ON FUNCTION wapla.communes_par_gouvernorat() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wapla.communes_par_gouvernorat() TO siipi_app;
COMMENT ON FUNCTION wapla.communes_par_gouvernorat() IS
  'Le « M » de « N communes sur M » (lot W5, FNCT seule) : les communes réelles de chaque gouvernorat, avec leur district FNCT (ou aucun), qu''elles aient un bilan WaPla ou non. Ni la commune de démonstration, ni les communes retirées.';
