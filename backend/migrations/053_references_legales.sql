-- ============================================================================
-- 053_references_legales.sql
--
-- Étape S0 (v0.15.2) — la bonne référence légale dans les commentaires de la
-- base.
--
-- Cinq commentaires de table ou de colonne citaient le décret-loi n° 2022-54,
-- qui porte sur la cybercriminalité. Le texte qui régit les données à
-- caractère personnel est la loi organique n° 2004-63 du 27 juillet 2004,
-- appliquée par l'INPDP (CLAUDE.md § 2).
--
-- POURQUOI UNE MIGRATION, ALORS QUE LES FICHIERS 014, 021, 028, 034 ET 045
-- SONT CORRIGÉS AUSSI. Le migrateur ne relit jamais une migration déjà
-- appliquée (il ne suivait que son nom jusqu'à la v0.15.2). Corriger le
-- fichier ne change donc que les bases CRÉÉES après la correction ; une base
-- déjà en service garderait l'ancien texte, et les deux divergeraient en
-- silence. Cette migration porte le même texte sur les bases existantes. Sur
-- une base neuve, elle réécrit à l'identique ce que les fichiers corrigés
-- viennent de poser : elle est sans effet, et rejouable.
--
-- Les textes ci-dessous sont ceux des fichiers corrigés, mot pour mot.
-- ============================================================================

COMMENT ON TABLE access_log IS
  'Journal des consultations de données personnelles de citoyens (loi organique 2004-63). En ajout seul.';

COMMENT ON COLUMN citoyens.position IS
  'Domicile déclaré. Donnée à caractère personnel : n''est jamais exposée par les vues publiques (loi organique 2004-63).';

COMMENT ON TABLE personnel IS
  'Amorce du module 4. Ni CIN, ni téléphone, ni salaire : affecter un agent à une tournée n''en a pas besoin (loi organique 2004-63, minimisation).';

COMMENT ON TABLE effectifs_service IS
  'Effectif et masse salariale du service, par année. Niveau service uniquement : aucune ligne ne désigne une personne, et aucune clé ne permet d''y redescendre. C''est la traduction en base de la minimisation exigée par la loi organique 2004-63.';

COMMENT ON TABLE contacts IS
  'Annuaire de travail d''une commune (TDR §3.2.7) : interlocuteurs externes, sans compte sur la plateforme. Lecture réservée à la commune et à la FNCT — un prestataire rattaché n''y a pas accès (minimisation, loi organique 2004-63).';
