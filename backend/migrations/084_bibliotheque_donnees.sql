-- ============================================================================
-- 084 — La bibliothèque nationale des données (jalon D, lot D4)
-- docs/specs_metier/SPEC_D_pret_a_presenter.md, D4.
--
-- Un catalogue de tout ce que SIIPI réunit, commune par commune : neuf éléments — le PCGD, les
-- études et rapports, les études de coût complet, la caractérisation des déchets, la population,
-- les pesées, les circuits, les points relevés, les réclamations.
--
-- LECTURE SEULE. Cette fonction ne crée rien : elle rend visible ce qui existe déjà. Elle ne donne
-- accès à AUCUN fichier — un rapport est listé (titre, auteur, année), jamais ouvert d'ici ; les
-- fichiers restent dans leur commune. Ce qu'une commune n'a pas déposé n'a pas de ligne : « aucune
-- commune n'a de PCGD » se lit par l'absence, jamais par un zéro posé à sa place (règle d'or 1.1).
--
-- UNE LIGNE PAR DOCUMENT, UNE LIGNE PAR COMMUNE POUR LE RESTE. Un PCGD, un rapport, une étude de coût
-- sont des documents : chacun a son titre, son auteur, son année. Une caractérisation aussi. La
-- population, les pesées, les circuits, les points et les réclamations sont des séries ou des
-- références sans titre : une ligne par commune, avec leur nombre et leur période. Les pesées
-- gardent leur NATURE (« pesé ») : elles ne se mélangent jamais à une estimation. La population dit
-- si elle est déclarée par la commune ou estimée (référentiel national).
--
-- Seules les communes réelles comptent (ni le jeu de démonstration, ni une commune retirée) et,
-- pour les tables qui le portent, seules les lignes de provenance « réel » : une pesée simulée
-- n'est la pesée de personne.
--
-- La fonction s'exécute avec les droits de l'appelant (la sécurité par ligne s'applique) ; la route
-- qui la sert est réservée à la FNCT.
-- ============================================================================

DROP FUNCTION IF EXISTS app.bibliotheque_lignes();

CREATE FUNCTION app.bibliotheque_lignes()
  RETURNS TABLE (
    element        text,
    commune_id     text,
    intitule       text,
    annee          integer,
    auteur         text,
    statut         text,
    nature         text,
    nombre         bigint,
    premiere       date,
    derniere       date,
    mois_couverts  integer
  )
  LANGUAGE sql STABLE SET search_path = public, pg_temp AS
$$
  WITH c AS (SELECT id FROM communes WHERE NOT est_demo AND deleted_at IS NULL)

  -- 1. Le PCGD : un par ligne, avec son statut et son bureau d'études.
  SELECT 'pcgd'::text, p.commune_id, 'PCGD' || COALESCE(' ' || p.annee_adoption::text, ''),
         p.annee_adoption::integer, p.bureau_etudes, p.statut, NULL::text, 1::bigint,
         NULL::date, (p.saisi_le AT TIME ZONE 'Africa/Tunis')::date, NULL::integer
    FROM pcgd p JOIN c ON c.id = p.commune_id
   WHERE p.deleted_at IS NULL

  UNION ALL

  -- 2. Les études et rapports : la dernière version de chaque document (une version remplacée
  --    n'est pas un second rapport).
  SELECT 'rapports_etudes', r.commune_id, r.titre, extract(year FROM r.date_document)::integer, r.auteur,
         r.categorie, NULL, 1, NULL, r.date_document, NULL
    FROM rapports_etudes r JOIN c ON c.id = r.commune_id
   WHERE r.deleted_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM rapports_etudes n
                      WHERE n.document_id IS NOT DISTINCT FROM r.document_id AND r.document_id IS NOT NULL
                        AND n.version > r.version AND n.deleted_at IS NULL)

  UNION ALL

  -- 3. Les études de coût complet d'un bureau d'études. Leur « provenance » dit de qui vient l'étude
  --    (« declare_bureau_etudes »), pas si elle est réelle ou simulée : on ne la filtre pas.
  SELECT 'cout_complet', e.commune_id, e.document, e.exercice, e.bureau_etudes, NULL, NULL, 1,
         NULL, e.lu_le, NULL
    FROM etudes_cout_complet e JOIN c ON c.id = e.commune_id
   WHERE e.deleted_at IS NULL

  UNION ALL

  -- 4. La caractérisation des déchets propre à une commune (la moyenne nationale de l'ANGeD
  --    n'appartient à aucune commune : elle n'est pas une donnée de commune). Le niveau de la
  --    source est dit dans `statut`.
  SELECT 'caracterisation', ca.commune_id, ca.niveau_source, ca.annee::integer, NULL, ca.niveau_source, NULL, 1,
         NULL, (ca.saisi_le AT TIME ZONE 'Africa/Tunis')::date, NULL
    FROM caracterisations ca JOIN c ON c.id = ca.commune_id
   WHERE ca.deleted_at IS NULL AND ca.commune_id IS NOT NULL

  UNION ALL

  -- 5. La population : celle que la commune a déclarée, sinon celle du référentiel national — dite
  --    « estimée ». Une commune sans aucune des deux n'a pas de ligne.
  SELECT 'population', cm.id, NULL, NULL, NULL, NULL,
         CASE WHEN pc.population_permanente IS NOT NULL THEN 'declaree' ELSE 'estimee' END,
         COALESCE(pc.population_permanente, cm.population)::bigint,
         NULL, (pc.updated_at AT TIME ZONE 'Africa/Tunis')::date, NULL
    FROM communes cm
    LEFT JOIN parametres_commune pc ON pc.commune_id = cm.id AND pc.provenance = 'reel'
   WHERE NOT cm.est_demo AND cm.deleted_at IS NULL
     AND COALESCE(pc.population_permanente, cm.population) IS NOT NULL

  UNION ALL

  -- 6. Les pesées : leur nombre, la période couverte et le nombre de mois où il y en a. Toutes
  --    sont des pesées réelles ; le tonnage n'est PAS additionné ici.
  SELECT 'pesees', p.commune_id, NULL, NULL, NULL, NULL, 'pese', count(*),
         min(p.date_pesee), max(p.date_pesee), count(DISTINCT date_trunc('month', p.date_pesee))::integer
    FROM pesees p JOIN c ON c.id = p.commune_id
   WHERE p.deleted_at IS NULL AND p.provenance = 'reel'
   GROUP BY p.commune_id

  UNION ALL

  -- 7. Les circuits relevés.
  SELECT 'circuits', ci.commune_id, NULL, NULL, NULL, NULL, NULL, count(*),
         min((ci.created_at AT TIME ZONE 'Africa/Tunis')::date), max((ci.updated_at AT TIME ZONE 'Africa/Tunis')::date), NULL
    FROM circuits ci JOIN c ON c.id = ci.commune_id
   WHERE ci.deleted_at IS NULL AND ci.provenance = 'reel'
   GROUP BY ci.commune_id

  UNION ALL

  -- 8. Les points relevés (arrêts, bacs, dépôts) sur le terrain.
  SELECT 'points', pt.commune_id, NULL, NULL, NULL, NULL, NULL, count(*),
         min((pt.created_at AT TIME ZONE 'Africa/Tunis')::date), max((pt.updated_at AT TIME ZONE 'Africa/Tunis')::date), NULL
    FROM points_collecte pt JOIN c ON c.id = pt.commune_id
   WHERE pt.deleted_at IS NULL AND pt.provenance = 'reel'
   GROUP BY pt.commune_id

  UNION ALL

  -- 9. Les réclamations reçues : leur nombre et la période, sans le détail d'aucune.
  SELECT 'reclamations', t.commune_id, NULL, NULL, NULL, NULL, NULL, count(*),
         min((t.created_at AT TIME ZONE 'Africa/Tunis')::date), max((t.created_at AT TIME ZONE 'Africa/Tunis')::date), NULL
    FROM tickets t JOIN c ON c.id = t.commune_id
   WHERE t.deleted_at IS NULL AND t.provenance = 'reel'
   GROUP BY t.commune_id
$$;

COMMENT ON FUNCTION app.bibliotheque_lignes() IS
  'La bibliothèque nationale des données (jalon D, lot D4) : ce que SIIPI réunit, élément par élément et commune par commune — documents (une ligne chacun) et séries ou références (une ligne par commune). Lecture seule, aucun accès aux fichiers. Communes réelles et lignes de provenance « réel » seulement. Droits de l''appelant.';

GRANT EXECUTE ON FUNCTION app.bibliotheque_lignes() TO siipi_app;
