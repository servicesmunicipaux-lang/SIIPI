#!/usr/bin/env bash
# =============================================================================
# skill:versions-fantomes — les versions du découpage nées d'une campagne de
# tests (JC-009, JC-010), en LECTURE SEULE.
#
# CE QUE CET OUTIL CHERCHE, ET POURQUOI. Une correction directe de la FNCT
# (secteur ou limite) fige l'état présent en « version 1 » si la commune n'a
# aucune version, puis inscrit la correction en version suivante. Faite par une
# campagne dans une commune réelle, même effacée ensuite, elle laisse dans
# l'historique du découpage des versions validées qui n'ont jamais eu lieu —
# dont une « correction de périmètre » attribuée à la FNCT. Rien ne les
# distingue à l'écran d'une version réelle.
#
# L'heure qui fait foi est l'INSERTION de la version au journal d'audit
# (soumise_le d'une version « initiale » date l'état figé, pas sa création).
# Signatures recherchées, dans la même commune, à 60 s près de cette insertion :
#   - un secteur d'essai inséré ou modifié : « TEST zone citoyen … » (ancienne
#     campagne citoyen), « Secteur temporaire … » / code « TMP-… »
#     (suppression), « TEST-J7 … » (versions-decoupage interrompue) ;
#   - une correction de périmètre de la FNCT faite avec le compte de
#     démonstration admin.national@siipi.tn, la limite officielle ayant été
#     reposée après elle (decoupage) ;
#   - pour une version « initiale » : une version-sœur fantôme créée à 60 s
#     près (c'est la correction d'essai qui l'a fait figer).
#
# Il ne retire rien. Depuis la v0.15.51, aucune campagne n'en crée plus
# (tests/outils/communes_reelles.sh le prouve), et l'inventaire du 23/10/2026
# n'en a trouvé dans aucune base. Une version signalée ici se montre à la FNCT,
# qui décide (DECISIONS_2026-10-20.md, § 1 et son complément du 23/10/2026).
#
# À lancer sur toute base avant une recette ou une mise en production :
#   bash scripts/skills/versions-fantomes.sh
# Code de sortie non nul dès qu'une version est « fantôme » ou « à examiner ».
# =============================================================================
set -u
# DC peut nommer le compose d'un serveur (installer.sh : --env-file, -p, -f docker-compose.prod.yml).
if [ -z "${DC:-}" ]; then DC="docker compose"; docker compose version >/dev/null 2>&1 || DC="docker-compose"; fi
PSQL="$DC exec -T db psql -v ON_ERROR_STOP=1 -qX -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"

REQUETE="
WITH v AS (
  SELECT v.*, u.email AS soumise_par_email,
         (SELECT min(a.changed_at) FROM audit_log a
           WHERE a.table_name = 'versions_decoupage' AND a.operation = 'INSERT' AND a.record_id = v.id::text) AS cree_le
    FROM versions_decoupage v LEFT JOIN users u ON u.id = v.soumise_par
),
s AS (
  SELECT v.*,
    (SELECT string_agg(DISTINCT CASE
                 WHEN a.new_data->>'name' LIKE 'TEST zone citoyen%' THEN 'citoyen'
                 WHEN a.new_data->>'name' LIKE 'Secteur temporaire%' OR a.new_data->>'code' LIKE 'TMP-%' THEN 'suppression'
                 WHEN a.new_data->>'name' LIKE 'TEST-J7%' THEN 'versions-decoupage'
                 ELSE 'secteur TEST' END, ',')
       FROM audit_log a
      WHERE v.cree_le IS NOT NULL AND a.table_name = 'zones_collecte' AND a.commune_id = v.commune_id
        AND a.operation IN ('INSERT', 'UPDATE')
        AND (a.new_data->>'name' LIKE 'TEST%' OR a.new_data->>'name' LIKE 'Secteur temporaire%' OR a.new_data->>'code' LIKE 'TMP-%')
        AND a.changed_at BETWEEN v.cree_le - interval '60 seconds' AND v.cree_le + interval '60 seconds') AS secteur_essai,
    (v.origine = 'correction_fnct' AND v.note LIKE 'Périmètre corrigé%' AND v.soumise_par_email = 'admin.national@siipi.tn'
     AND EXISTS (SELECT 1 FROM communes c WHERE c.id = v.commune_id AND c.boundary_source = 'officiel'
                   AND c.boundary_maj_le > v.cree_le)) AS perimetre_essai
    FROM v
),
r AS (
  SELECT s.*,
    (s.origine = 'initiale' AND EXISTS (
       SELECT 1 FROM s w WHERE w.commune_id = s.commune_id AND w.id <> s.id AND w.cree_le IS NOT NULL AND s.cree_le IS NOT NULL
         AND abs(extract(epoch FROM w.cree_le - s.cree_le)) <= 60
         AND (w.secteur_essai IS NOT NULL OR w.perimetre_essai))) AS soeur_fantome
    FROM s
)
SELECT r.commune_id, r.numero, r.origine, r.statut,
       to_char(r.cree_le AT TIME ZONE 'Africa/Tunis', 'YYYY-MM-DD HH24:MI:SS') AS creee_heure_tunis,
       left(coalesce(r.note, ''), 50) AS note,
       CASE
         WHEN r.cree_le IS NULL THEN 'à examiner (insertion absente du journal)'
         WHEN r.perimetre_essai THEN 'fantôme — decoupage (périmètre corrigé avec le compte de démonstration, limite officielle reposée)'
         WHEN r.secteur_essai IS NOT NULL THEN 'fantôme — secteur d''essai (' || r.secteur_essai || ')'
         WHEN r.soeur_fantome THEN 'fantôme — version initiale figée par une correction d''essai'
         ELSE 'légitime présumée'
       END AS verdict,
       r.id
  FROM r
 ORDER BY r.commune_id, r.numero NULLS LAST, r.cree_le"

printf '\n\033[1m%s\033[0m\n' "Versions du découpage nées d'une campagne de tests (lecture seule)"
# Une transaction en lecture seule : l'outil ne peut rien écrire, même modifié par erreur.
sortie=$($PSQL -P pager=off -c "BEGIN READ ONLY" -c "$REQUETE" -c "ROLLBACK" 2>&1) || { echo "$sortie"; exit 2; }
echo "$sortie"
total=$($PSQL -tA -c "SELECT count(*) FROM versions_decoupage")
signalees=$(printf '%s\n' "$sortie" | grep -cE 'fantôme|à examiner')
echo "  versions, toutes communes : $total — fantômes ou à examiner : $signalees"
if [ "$signalees" -gt 0 ]; then
  printf '  \033[31m✗\033[0m %s\n' "à montrer à la FNCT, qui décide ; rien n'est retiré ici"
  exit 1
fi
printf '  \033[32m✓\033[0m %s\n' "aucune version fantôme"
