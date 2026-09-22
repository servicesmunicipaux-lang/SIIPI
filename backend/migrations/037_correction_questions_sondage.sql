-- ============================================================================
-- 037_correction_questions_sondage.sql
--
-- Un défaut trouvé en lançant la plateforme, pas en la relisant.
--
-- CE QUI S'EST PASSÉ. La migration 035 révoque DELETE sur les cinq tables du
-- module 5, au motif qu'un registre ne perd pas de lignes. Le motif est juste
-- pour `publications`, `sondage_reponses`, `envois_notification` et
-- `publication_documents` : ce sont des écrits.
--
-- Il ne l'est PAS pour `sondage_questions`. La route qui remplace un
-- questionnaire efface les questions précédentes avant d'écrire les nouvelles,
-- et la base la refusait — SQLSTATE 42501, rendu en 403 par l'API. Un
-- questionnaire était donc impossible à composer depuis l'interface. Le test
-- l'a vu ; aucune relecture ne l'aurait vu.
--
-- POURQUOI C'EST SANS DANGER. La route refuse déjà (409) de toucher à un
-- sondage qui a reçu la moindre réponse — modifier une question déjà répondue
-- changerait rétroactivement le sens des réponses. Une question effaçable est
-- donc, par construction, une question que personne n'a jamais vue.
--
-- Les réponses, elles, restent inviolables : DELETE y demeure révoqué.
-- ============================================================================

GRANT DELETE ON sondage_questions TO siipi_app;

COMMENT ON TABLE sondage_questions IS
  'Questions d''un sondage. Seule table du module 5 où siipi_app peut effacer : la route refuse de modifier un questionnaire ayant reçu une réponse, donc une question effaçable est une question que personne n''a vue. Les réponses, elles, ne s''effacent jamais.';
