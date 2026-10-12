#!/usr/bin/env bash
# =============================================================================
# Refonte, lot 2a — les données de référence : le porteur d'un projet (D5), le
# PCGD, la caractérisation des déchets et la composition retenue (D6).
# docs/specs_metier/SPEC_refonte_indicateurs_saisie.md § 2.3 et § 2.5.
#
# Elle commence par ce que la plateforme REFUSE : une caractérisation à 97 % ou
# à 104 %, une fraction négative ou inconnue, une moyenne nationale saisie par
# une commune, une étude communale saisie par la FNCT, un PCGD « adopté » sans
# année, un projet associatif sans nom de porteur.
#
# Puis la règle de la composition retenue : la source la plus précise, puis la
# plus récente, toujours avec son origine — et rien quand rien n'existe.
#
#   docker compose exec -T api npm run test:references
# =============================================================================

set -u
cd "$(dirname "$0")/.." || exit 1
API="${API_URL:-http://localhost:4000}"
PSQL="psql -q -tA -h ${PGHOST:-localhost} -p ${PGPORT:-5432} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
pass=0; fail=0
T=$(mktemp -d)

tok() {
  curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"${2:-Siipi2026!}\"}" \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))" 2>/dev/null
}
sql()  { $PSQL -c "$1" 2>/dev/null | tr -d ' '; }
val()  { python3 -c "import json;d=json.load(open('$T/r.json'));print($1)" 2>/dev/null || echo erreur; }
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}
req() {
  curl -s -o "$T/r.json" -w '%{http_code}' -X "$1" -H "Authorization: Bearer ${4:-$T_DIR}" \
       -H 'Content-Type: application/json' ${3:+-d "$3"} "$API$2"
}
# fractions <organiques> <papier_carton> <plastiques> <verre> <metaux> <textiles> <fines_autres>
fractions() {
  printf '{"organiques":%s,"papier_carton":%s,"plastiques":%s,"verre":%s,"metaux":%s,"textiles":%s,"fines_autres":%s}' "$@"
}
retenue() { req GET "/references/caracterisation-retenue?communeId=$TC${1:+&date=$1}" >/dev/null; val "'None' if d is None else d['niveau_source'] + '|' + str(d['annee'])"; }

TC=test_references
COMMUNE_DIR="$TC"
. tests/outils/directeur_temporaire.sh
NATIONALES=""
nettoyer() {
  $PSQL -c "DELETE FROM caracterisations WHERE commune_id = '$TC';" \
        -c "DELETE FROM pcgd WHERE commune_id = '$TC';" \
        -c "DELETE FROM publications WHERE commune_id = '$TC';" >/dev/null 2>&1
  for n in $NATIONALES; do $PSQL -c "DELETE FROM caracterisations WHERE id = '$n';" >/dev/null 2>&1; done
}
fin() {
  nettoyer
  retirer_directeur_temporaire
  $PSQL -c "DELETE FROM communes WHERE id = '$TC';" >/dev/null 2>&1
  rm -rf "$T"
}
nettoyer
$PSQL -c "DELETE FROM communes WHERE id = '$TC';" >/dev/null 2>&1
$PSQL -c "INSERT INTO communes (id, name, name_ar, gouvernorat, population) VALUES ('$TC', 'TEST commune des références', 'TEST', 'TEST', 8000);" >/dev/null
directeur_temporaire "$TC"
trap fin EXIT
T_DIR=$(tok "$DIR_EMAIL" "$DIR_MDP")
T_FNCT=$(tok admin.national@siipi.tn)
[ -n "$T_DIR" ] && [ -n "$T_FNCT" ] || { echo "API injoignable sur $API" >&2; exit 1; }
FNCT_ID=$(sql "SELECT id FROM users WHERE email = 'admin.national@siipi.tn'")
AUTRE=$(sql "SELECT id FROM communes WHERE id <> '$TC' AND NOT est_demo AND deleted_at IS NULL ORDER BY id LIMIT 1")
CARAC="/references/caracterisations?communeId=$TC"

# -----------------------------------------------------------------------------
echo
echo "1. Ce que la plateforme REFUSE"
chk "une caractérisation à 97 % est refusée" 400 \
    "$(req POST "$CARAC" "{\"niveauSource\":\"autre_etude\",\"annee\":2024,\"fractions\":$(fractions 50 15 12 5 5 5 5)}")"
chk "une caractérisation à 104 % aussi" 400 \
    "$(req POST "$CARAC" "{\"niveauSource\":\"autre_etude\",\"annee\":2024,\"fractions\":$(fractions 57 15 12 5 5 5 5)}")"
chk "une fraction négative aussi" 400 \
    "$(req POST "$CARAC" "{\"niveauSource\":\"autre_etude\",\"annee\":2024,\"fractions\":$(fractions 60 15 12 5 5 8 -5)}")"
chk "une fraction inconnue aussi" 400 \
    "$(req POST "$CARAC" '{"niveauSource":"autre_etude","annee":2024,"fractions":{"organiques":60,"bois":40}}')"
chk "la base refuse une somme hors de 100 % ± 1, même en SQL direct" t \
    "$($PSQL -c "BEGIN; INSERT INTO caracterisations (id, commune_id, niveau_source, annee) VALUES ('11111111-1111-1111-1111-111111111111', '$TC', 'autre_etude', 2024);
                 INSERT INTO fractions_caracterisation VALUES ('11111111-1111-1111-1111-111111111111', 'organiques', 97); COMMIT;" 2>&1 \
       | grep -q 'CARACTERISATION_SOMME' && echo t || echo f)"
chk "et une caractérisation sans aucune fraction" t \
    "$($PSQL -c "INSERT INTO caracterisations (commune_id, niveau_source, annee) VALUES ('$TC', 'autre_etude', 2024);" 2>&1 \
       | grep -q 'CARACTERISATION_SOMME' && echo t || echo f)"
chk "une commune ne saisit pas une moyenne nationale (403)" 403 \
    "$(req POST "$CARAC" "{\"niveauSource\":\"moyenne_nationale_anged\",\"annee\":2022,\"fractions\":$(fractions 60 12 12 4 4 4 4)}")"
chk "… ni en SQL direct : la base le refuse" t \
    "$($PSQL -c "SET app.role = 'admin_commune'; SET app.user_id = '$DIR_ID'; SET app.commune_id = '$TC'; SET ROLE siipi_app;
                 INSERT INTO caracterisations (commune_id, niveau_source, annee) VALUES (NULL, 'moyenne_nationale_anged', 2022);" 2>&1 \
       | grep -q 'row-level security' && echo t || echo f)"
chk "la FNCT ne saisit pas une étude de la commune (403)" 403 \
    "$(req POST "$CARAC" "{\"niveauSource\":\"pcgd\",\"annee\":2024,\"fractions\":$(fractions 60 12 12 4 4 4 4)}" "$T_FNCT")"
chk "une moyenne nationale rattachée à une commune est refusée par la base" t \
    "$($PSQL -c "INSERT INTO caracterisations (commune_id, niveau_source, annee) VALUES ('$TC', 'moyenne_nationale_anged', 2022);" 2>&1 \
       | grep -q 'caracterisations_national' && echo t || echo f)"
chk "un PCGD « adopté » sans année est refusé" 400 "$(req POST "/references/pcgd?communeId=$TC" '{"statut":"adopte"}')"
chk "un horizon antérieur à l'adoption aussi" 400 "$(req POST "/references/pcgd?communeId=$TC" '{"statut":"adopte","anneeAdoption":2026,"horizon":2020}')"
chk "la FNCT ne saisit pas le PCGD de la commune" 403 "$(req POST "/references/pcgd?communeId=$TC" '{"statut":"en_preparation"}' "$T_FNCT")"
chk "un projet associatif sans nom de porteur est refusé" 400 \
    "$(req POST "/communication?communeId=$TC" '{"type":"projet","titreFr":"TEST-REF projet","projetPorteur":"association"}')"
chk "une commune ne lit pas les références d'une autre (404)" "404|404" \
    "$(req GET "/references/pcgd?communeId=$AUTRE")|$(req GET "/references/caracterisation-retenue?communeId=$AUTRE")"
chk "rien n'est entré" "0|0" \
    "$(sql "SELECT count(*) FROM caracterisations WHERE commune_id = '$TC'")|$(sql "SELECT count(*) FROM pcgd WHERE commune_id = '$TC'")"

# -----------------------------------------------------------------------------
echo
echo "2. Le porteur d'un projet (D5)"
chk "un projet porté par une association, nommée" "201|association|TEST-REF Association des jeunes" \
    "$(req POST "/communication?communeId=$TC" '{"type":"projet","titreFr":"TEST-REF projet associatif","projetPorteur":"association","projetPorteurNom":"TEST-REF Association des jeunes"}')|$(sql "SELECT projet_porteur FROM publications WHERE titre_fr = 'TEST-REF projet associatif'")|$($PSQL -c "SELECT projet_porteur_nom FROM publications WHERE titre_fr = 'TEST-REF projet associatif'")"
chk "un projet porté par la commune n'a pas besoin de nom" 201 \
    "$(req POST "/communication?communeId=$TC" '{"type":"projet","titreFr":"TEST-REF projet communal","projetPorteur":"commune"}')"
chk "l'ancienne « nature » n'existe plus : un seul champ dit qui porte le projet" 0 \
    "$(sql "SELECT count(*) FROM information_schema.columns WHERE table_name = 'publications' AND column_name = 'projet_nature'")"

# -----------------------------------------------------------------------------
echo
echo "3. La composition retenue — jamais inventée"
NB_NATIONALES=$(sql "SELECT count(*) FROM caracterisations WHERE commune_id IS NULL AND deleted_at IS NULL")
# Le témoin : sans étude de la commune, la composition retenue est la moyenne
# nationale si la FNCT en a saisi une, sinon rien.
chk "sans étude ni moyenne nationale, rien n'est retenu (et sinon, la moyenne nationale)" \
    "$([ "$NB_NATIONALES" = 0 ] && echo None || echo moyenne_nationale_anged)" "$(retenue | cut -d'|' -f1)"
chk "la FNCT saisit la moyenne nationale de l'ANGeD" 201 \
    "$(req POST /references/caracterisations "{\"niveauSource\":\"moyenne_nationale_anged\",\"annee\":2022,\"methode\":\"TEST-REF\",\"fractions\":$(fractions 62 11 11 4 3 4 5)}" "$T_FNCT")"
NATIONALES="$(val "d['id']")"
chk "une commune sans étude reçoit la moyenne nationale, étiquetée comme telle, avec son année" \
    "moyenne_nationale_anged|2022" "$(retenue)"
chk "… avec ses fractions, ordonnées" "62.0|5.0" \
    "$(val "str(float(d['fractions'][0]['pourcentage'])) + '|' + str(float(d['fractions'][-1]['pourcentage']))")"
chk "la commune déclare le PCGD de 2026, adopté" 201 \
    "$(req POST "/references/pcgd?communeId=$TC" '{"statut":"adopte","anneeAdoption":2026,"horizon":2035,"bureauEtudes":"TEST-REF Bureau"}')"
PCGD=$(val "d['id']")
chk "et sa caractérisation (99,5 % : dans la tolérance)" 201 \
    "$(req POST "$CARAC" "{\"niveauSource\":\"pcgd\",\"annee\":2026,\"pcgdId\":\"$PCGD\",\"saison\":\"annuelle\",\"fractions\":$(fractions 55 13 14 5 4 4 4.5)}")"
CAR_PCGD=$(val "d['id']")
chk "après l'ajout de son PCGD, la composition retenue est le PCGD" "pcgd|2026" "$(retenue)"
chk "à une date antérieure au PCGD, c'est encore la moyenne nationale" "moyenne_nationale_anged|2022" "$(retenue 2025-06-30)"
chk "une autre étude, plus récente, ne passe pas devant le PCGD (moins précise)" "201|pcgd|2026" \
    "$(req POST "$CARAC" "{\"niveauSource\":\"autre_etude\",\"annee\":2026,\"fractions\":$(fractions 50 15 15 5 5 5 5)}")|$(retenue)"
chk "une étude ANGeD de la commune, plus précise, passe devant" "201|etude_anged_commune|2025" \
    "$(req POST "$CARAC" "{\"niveauSource\":\"etude_anged_commune\",\"annee\":2025,\"fractions\":$(fractions 58 12 13 5 4 4 4)}")|$(retenue)"
CAR_ANGED=$(sql "SELECT id FROM caracterisations WHERE commune_id = '$TC' AND niveau_source = 'etude_anged_commune'")
chk "retirée (logiquement), elle cède la place au PCGD" "204|pcgd|2026" \
    "$(req DELETE "/references/caracterisations/$CAR_ANGED")|$(retenue)"
chk "la ligne retirée reste en base, datée" 1 \
    "$(sql "SELECT count(*) FROM caracterisations WHERE id = '$CAR_ANGED' AND deleted_at IS NOT NULL")"
chk "la commune ne retire pas la moyenne nationale" 403 "$(req DELETE "/references/caracterisations/$NATIONALES")"
req GET "/references/pcgd?communeId=$TC" >/dev/null
chk "le PCGD se lit avec son statut, son adoption et son horizon" "adopte|2026|2035" \
    "$(val "d[0]['statut'] + '|' + str(d[0]['annee_adoption']) + '|' + str(d[0]['horizon'])")"
chk "la FNCT lit la composition retenue de la commune" "200|pcgd" \
    "$(req GET "/references/caracterisation-retenue?communeId=$TC" "" "$T_FNCT")|$(val "d['niveau_source']")"

# -----------------------------------------------------------------------------
echo
echo "4. Le journal d'audit"
chk "le PCGD et la caractérisation sont au journal" "1|1" \
    "$(sql "SELECT count(*) FROM audit_log WHERE table_name = 'pcgd' AND record_id = '$PCGD' AND operation = 'INSERT'")|$(sql "SELECT count(*) FROM audit_log WHERE table_name = 'caracterisations' AND record_id = '$CAR_PCGD' AND operation = 'INSERT'")"

echo
echo "----------------------------------------------------------------"
printf '  %s réussis, %s échecs\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
