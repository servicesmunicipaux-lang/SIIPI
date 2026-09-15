-- ============================================================================
-- 016_observatoire_national.sql
--
-- De quoi alimenter le portail national : provenance des données et suivi du
-- déploiement.
--
-- Deux besoins exprimés par la FNCT pour le tableau de bord national :
--
-- 1. PROVENANCE. Les valeurs des 350 communes mêlent aujourd'hui des données
--    réelles (communes suivies, communes pilotes) et des estimations. Un
--    observatoire national qui présente les unes comme les autres n'est pas
--    défendable devant l'ANGeD ou le ministère. Chaque commune porte donc
--    désormais la provenance de ses données, et l'interface l'affiche.
--
--    Effet secondaire recherché : une commune qui voit sa fiche marquée
--    « estimé » a une raison concrète de saisir ses vraies données. C'est le
--    meilleur levier d'adoption disponible.
--
-- 2. DÉPLOIEMENT. Avant d'être un tableau de bord de la propreté, le portail
--    national est un tableau de bord de l'adoption : qui saisit, qui ne saisit
--    pas. Le TDR (§3.1.2, A2.5) le formule déjà en badges — vert = active,
--    orange = incomplète (aucune saisie ni donnée ANGeD), gris = désactivée.
--
--    Ce statut n'est pas saisi à la main : il se déduit du journal d'audit
--    (migration 014), qui enregistre déjà toute écriture avec sa commune. Une
--    commune est active si quelqu'un y a écrit quelque chose. Aucun risque
--    d'oubli de mise à jour, et aucune donnée en double.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Provenance des données communales
-- ---------------------------------------------------------------------------

ALTER TABLE communes
  ADD COLUMN IF NOT EXISTS donnees_source TEXT NOT NULL DEFAULT 'estime',
  ADD COLUMN IF NOT EXISTS donnees_qualifiees_le TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS donnees_qualifiees_par UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS activee BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE communes DROP CONSTRAINT IF EXISTS communes_donnees_source_check;
ALTER TABLE communes ADD CONSTRAINT communes_donnees_source_check
  CHECK (donnees_source IN ('estime', 'declare', 'mesure'));

COMMENT ON COLUMN communes.donnees_source IS
  'Provenance des indicateurs : estime (ordre de grandeur, à remplacer) | declare (saisi par la commune) | mesure (issu des pesées ANGeD importées).';
COMMENT ON COLUMN communes.activee IS
  'Commune désactivée sur la plateforme (badge gris du TDR §3.1.2 A2.5). Ne la supprime pas : le référentiel des 350 communes est réglementaire.';

-- La valeur par défaut « estime » est le choix honnête : une donnée n'est
-- réputée fiable que lorsque quelqu'un l'a qualifiée comme telle.

-- ---------------------------------------------------------------------------
-- 2. Statut de déploiement, déduit de l'activité réelle
--
-- SECURITY DEFINER : la fonction lit le journal d'audit, cloisonné par
-- commune. Elle n'en ressort que des agrégats et un statut — jamais le détail
-- d'une écriture — et reste donc consultable par toute commune authentifiée,
-- conformément à la règle retenue pour l'annuaire et les indicateurs partagés.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.statut_communes()
  RETURNS TABLE (
    commune_id          text,
    statut              text,
    derniere_activite   timestamptz,
    ecritures_30j       bigint,
    a_des_pesees        boolean
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  WITH activite AS (
    SELECT a.commune_id,
           max(a.changed_at) AS derniere,
           count(*) FILTER (WHERE a.changed_at > now() - interval '30 days') AS recentes
      FROM audit_log a
     WHERE a.commune_id IS NOT NULL
       -- Les écritures des scripts d'administration (migrations, seed, imports)
       -- ne comptent pas comme de l'usage : elles s'exécutent sous l'identité
       -- technique 00000000-…, et sans cette exclusion les 350 communes
       -- apparaîtraient actives dès l'installation — ce qui viderait de son
       -- sens le tableau de bord de déploiement.
       AND a.changed_by IS NOT NULL
       AND a.changed_by <> '00000000-0000-0000-0000-000000000000'::uuid
     GROUP BY a.commune_id
  ),
  pesees AS (
    SELECT p.commune_id, true AS presentes
      FROM pesees_anged p
     WHERE p.deleted_at IS NULL
     GROUP BY p.commune_id
  )
  SELECT c.id,
         CASE
           WHEN NOT c.activee                                    THEN 'desactivee'
           WHEN a.derniere IS NOT NULL OR p.presentes             THEN 'active'
           ELSE 'incomplete'
         END,
         a.derniere,
         COALESCE(a.recentes, 0),
         COALESCE(p.presentes, false)
    FROM communes c
    LEFT JOIN activite a ON a.commune_id = c.id
    LEFT JOIN pesees   p ON p.commune_id = c.id;
$$;

COMMENT ON FUNCTION app.statut_communes() IS
  'Statut de déploiement par commune (TDR §3.1.2 A2.5), déduit du journal d''audit et des pesées. Agrégats seulement : ne divulgue aucune écriture.';

-- ---------------------------------------------------------------------------
-- 3. Tableau de bord par gouvernorat
--
-- Une seule requête pour tout l'écran national : l'interface n'a pas à
-- recomposer 24 gouvernorats à partir de 350 fiches.
--
-- Les moyennes sont PONDÉRÉES PAR LA POPULATION, pas arithmétiques. Une
-- moyenne simple donnerait le même poids à une commune de 2 000 habitants
-- qu'au Grand Tunis, et raconterait une autre histoire que la réalité vécue
-- par les habitants.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.tableau_gouvernorats()
  RETURNS TABLE (
    gouvernorat              text,
    communes                 bigint,
    communes_actives         bigint,
    communes_incompletes     bigint,
    communes_desactivees     bigint,
    population               bigint,
    tonnage_jour             numeric,
    production_kg_hab_jour   numeric,
    taux_collecte            numeric,
    indice_proprete          numeric,
    pcgd_valides             bigint,
    reclamations_ouvertes    bigint,
    reclamations_30j         bigint,
    delai_traitement_jours   numeric,
    communes_donnees_mesurees bigint,
    communes_donnees_estimees bigint,
    derniere_activite        timestamptz
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  WITH statuts AS (SELECT * FROM app.statut_communes()),
  reclamations AS (
    SELECT t.commune_id,
           count(*) FILTER (WHERE t.status IN ('recu', 'en_cours', 'assigne')) AS ouvertes,
           count(*) FILTER (WHERE t.created_at > now() - interval '30 days')   AS recentes,
           avg(EXTRACT(EPOCH FROM (t.resolved_at - t.created_at)) / 86400.0)
             FILTER (WHERE t.resolved_at IS NOT NULL)                          AS delai_jours
      FROM tickets t
     WHERE t.deleted_at IS NULL
     GROUP BY t.commune_id
  )
  SELECT
    c.gouvernorat,
    count(*)                                                          AS communes,
    count(*) FILTER (WHERE s.statut = 'active')                       AS communes_actives,
    count(*) FILTER (WHERE s.statut = 'incomplete')                   AS communes_incompletes,
    count(*) FILTER (WHERE s.statut = 'desactivee')                   AS communes_desactivees,
    sum(c.population)::bigint                                         AS population,
    round(sum(c.waste_tons_per_day)::numeric, 1)                      AS tonnage_jour,
    round((sum(c.waste_tons_per_day) * 1000
           / NULLIF(sum(c.population), 0))::numeric, 3)               AS production_kg_hab_jour,
    round((sum(c.collection_rate * c.population)
           / NULLIF(sum(c.population), 0))::numeric, 1)               AS taux_collecte,
    round((sum(c.cleanliness_index * c.population)
           / NULLIF(sum(c.population), 0))::numeric, 1)               AS indice_proprete,
    count(*) FILTER (WHERE c.pcgd_status = 'valide')                  AS pcgd_valides,
    COALESCE(sum(r.ouvertes), 0)::bigint                              AS reclamations_ouvertes,
    COALESCE(sum(r.recentes), 0)::bigint                              AS reclamations_30j,
    round(avg(r.delai_jours)::numeric, 1)                             AS delai_traitement_jours,
    count(*) FILTER (WHERE c.donnees_source = 'mesure')               AS communes_donnees_mesurees,
    count(*) FILTER (WHERE c.donnees_source = 'estime')               AS communes_donnees_estimees,
    max(s.derniere_activite)                                          AS derniere_activite
  FROM communes c
  JOIN statuts s ON s.commune_id = c.id
  LEFT JOIN reclamations r ON r.commune_id = c.id
  GROUP BY c.gouvernorat
  ORDER BY c.gouvernorat;
$$;

COMMENT ON FUNCTION app.tableau_gouvernorats() IS
  'Tableau de bord national par gouvernorat. Moyennes pondérées par la population.';

GRANT EXECUTE ON FUNCTION app.statut_communes()      TO siipi_app;
GRANT EXECUTE ON FUNCTION app.tableau_gouvernorats() TO siipi_app;

-- ---------------------------------------------------------------------------
-- 4. Index de soutien
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_audit_log_activite_commune
  ON audit_log (commune_id, changed_at DESC)
  WHERE commune_id IS NOT NULL
    AND changed_by IS NOT NULL
    AND changed_by <> '00000000-0000-0000-0000-000000000000'::uuid;

CREATE INDEX IF NOT EXISTS idx_communes_source ON communes (donnees_source);
