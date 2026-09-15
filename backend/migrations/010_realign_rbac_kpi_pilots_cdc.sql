-- 010_realign_rbac_kpi_pilots_cdc.sql
--
-- Réalignement de la fondation technique sur le cahier des charges (CDC) officiel
-- FNCT/ANGeD, tel que fourni par le client. Trois corrections, appliquées en
-- migration séparée (plutôt qu'en modifiant 002/009 déjà appliquées) pour
-- respecter le principe "les migrations déjà appliquées ne se modifient pas" :
--
--   1. RBAC : les 5 rôles provisoires du prototype backend sont remplacés par
--      les 4 rôles officiels définis dans la matrice de permissions du CDC.
--   2. KPI "5 Axes" : les 5 axes provisoires sont remplacés par les 5 axes
--      officiels du CDC (section 3.2.10).
--   3. Communes pilotes : le CDC (section 1.2) prévoit explicitement une
--      approche MVP itérative sur 2 communes pilotes. Les données importées au
--      départ marquaient à tort 9 communes comme "pilote" (héritage du
--      prototype) ; on les ramène à exactement 2.

-- ============================================================================
-- 1. RBAC — 4 rôles officiels du CDC
--    Super Admin FNCT · Admin Commune · Gestionnaire Prestataire (privé) · Citoyen
--
--    'field_agent' (agent de terrain) et 'gdma_actor' (acteur GDMA/Barbécha)
--    n'existent pas dans la matrice RBAC du CDC : ce ne sont pas des rôles de
--    connexion distincts. Les comptes existants avec ces rôles sont reclassés
--    en 'admin_commune' (la gestion du personnel de terrain relève de la
--    rubrique "Personnel & Planification" du portail Admin Commune, §B1 du CDC).
-- ============================================================================

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

UPDATE users SET role = 'admin_commune'    WHERE role IN ('field_agent', 'gdma_actor');
UPDATE users SET role = 'super_admin_fnct' WHERE role = 'national_admin';
UPDATE users SET role = 'admin_commune'    WHERE role = 'municipal_manager';
UPDATE users SET role = 'citoyen'          WHERE role = 'citizen';

ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN (
    'super_admin_fnct',         -- FNCT / ANGeD — portail national, tutelle, validation
    'admin_commune',            -- Directeur des services municipaux — portail municipal complet
    'gestionnaire_prestataire', -- Entreprise privée de collecte sous contrat — accès restreint à sa commune/zone
    'citoyen'                   -- Citoyen — application mobile
));

COMMENT ON COLUMN users.role IS
  'Rôle RBAC officiel (CDC FNCT §5 — matrice de permissions) : super_admin_fnct | admin_commune | gestionnaire_prestataire | citoyen.';

-- ============================================================================
-- 2. KPI "5 Axes" — axes officiels du CDC (§3.2.10)
--    Axe 1 Efficacité opérationnelle · Axe 2 Qualité de service ·
--    Axe 3 Performance environnementale · Axe 4 Performance économique ·
--    Axe 5 Sécurité et Ressources Humaines
--
--    Le prototype backend initial utilisait 5 axes provisoires (gouvernance,
--    couverture, flotte, engagement citoyen, financier) qui ne correspondent
--    pas à la nomenclature du CDC. Aucune donnée réelle n'a encore été produite
--    sur ce module (uniquement des jeux de test) : la table est recréée avec la
--    bonne nomenclature plutôt que migrée colonne par colonne.
-- ============================================================================

DROP TABLE IF EXISTS five_axis_scores;

CREATE TABLE five_axis_scores (
    id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commune_id                      TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
    efficacite_operationnelle       NUMERIC(5,2) NOT NULL, -- Axe 1 : taux de collecte, respect des tournées, disponibilité flotte...
    qualite_service                 NUMERIC(5,2) NOT NULL, -- Axe 2 : délai de traitement réclamations, indice de propreté, satisfaction...
    performance_environnementale    NUMERIC(5,2) NOT NULL, -- Axe 3 : taux de valorisation/tri, conformité PCGD, écarts de pesée...
    performance_economique          NUMERIC(5,2) NOT NULL, -- Axe 4 : coût par habitant, taux de recouvrement TCL, exécution budgétaire...
    securite_rh                     NUMERIC(5,2) NOT NULL, -- Axe 5 : accidents du travail, couverture sociale, formation du personnel...
    overall_score                   NUMERIC(5,2) GENERATED ALWAYS AS (
                                        (efficacite_operationnelle + qualite_service + performance_environnementale
                                         + performance_economique + securite_rh) / 5.0
                                     ) STORED,
    computed_at                     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_five_axis_commune ON five_axis_scores (commune_id, computed_at DESC);

COMMENT ON TABLE five_axis_scores IS
  'Évaluations "5 Axes" par commune — nomenclature officielle CDC FNCT §3.2.10.';

-- ============================================================================
-- 3. Communes pilotes — exactement 2 (CDC §1.2 : approche MVP itérative)
--    Choix : La Marsa (déjà instrumentée avec flotte/conteneurs/tickets de
--    démonstration) + Sfax (deuxième commune pilote, diversité géographique/
--    taille). Ce choix est un exemple pour la démonstration ; à confirmer avec
--    la FNCT pour le choix définitif des 2 communes pilotes réelles.
-- ============================================================================

UPDATE communes SET is_pilot = false;
UPDATE communes SET is_pilot = true WHERE id IN ('tunis_la_marsa', 'sfax_sfax_ville_medina');
