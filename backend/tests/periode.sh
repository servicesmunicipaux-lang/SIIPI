#!/usr/bin/env bash
# =============================================================================
# Test de la période de service des circuits (migration 026).
#
# Deux défauts trouvés en testant l'espace prestataire sur la plateforme en
# marche, et qu'aucun test ne voyait parce qu'ils n'apparaissent qu'une fois un
# premier circuit créé :
#
#   1. Un circuit enregistré aujourd'hui arrivait avec un mois de passages
#      « non déclarés » remontant avant sa création. Un outil censé arbitrer un
#      désaccord contractuel ne peut pas fabriquer lui-même la faute qu'il
#      constate.
#   2. Un prestataire voyait — et se voyait imputer — les circuits de la régie
#      communale et de ses confrères dans la même commune.
#
#   docker compose run --rm api npm run test:periode
# =============================================================================

set -u
API="${API_URL:-http://localhost:4000}"
PSQL="psql -q -tA -h ${PGHOST:-localhost} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
pass=0; fail=0

tok() {
  curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"Siipi2026!\"}" \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))" 2>/dev/null
}
sql()  { $PSQL -c "$1" 2>/dev/null | tr -d ' '; }
code() { curl -s -o /tmp/siipi_per.json -w '%{http_code}' "$@"; }
val()  { python3 -c "import json;print(json.load(open('/tmp/siipi_per.json'))$1)" 2>/dev/null || echo erreur; }
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}
# Nombre de jours confrontés pour un circuit donné, vu par un utilisateur donné.
jours() {
  curl -s "$API/passages/confrontation?communeId=tunis_la_marsa" -H "Authorization: Bearer $1" \
    | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(sum(1 for x in d if x.get('circuit_nom') == '$2'))" 2>/dev/null || echo erreur
}

T_MARSA=$(tok directeur.marsa@siipi.tn)
T_PREST=$(tok prestataire.marsa@siipi.tn)
[ -n "$T_MARSA" ] || { echo "API injoignable sur $API" >&2; exit 1; }
PRESTATAIRE=$(sql "SELECT id FROM users WHERE email='prestataire.marsa@siipi.tn'")

nettoyer() {
  $PSQL -c "DELETE FROM controles_terrain WHERE circuit_id IN (SELECT id FROM circuits WHERE nom LIKE 'TEST periode%');
            DELETE FROM declarations_passage WHERE circuit_id IN (SELECT id FROM circuits WHERE nom LIKE 'TEST periode%');
            DELETE FROM circuits WHERE nom LIKE 'TEST periode%';" >/dev/null 2>&1
}
nettoyer

echo
echo "1. Un circuit créé aujourd'hui n'a pas de passé"
# Tous les jours de la semaine : sans borne, la confrontation sur 30 jours
# rendrait 31 lignes. Avec la borne, elle en rend une : aujourd'hui.
CODE=$(code -X POST "$API/circuits" -H "Authorization: Bearer $T_MARSA" -H 'Content-Type: application/json' \
  -d "{\"communeId\":\"tunis_la_marsa\",\"nom\":\"TEST periode neuf\",\"prestataireId\":\"$PRESTATAIRE\",\"joursPassage\":[1,2,3,4,5,6,7]}")
chk "le circuit est créé" 201 "$CODE"
C_NEUF=$(val "['id']")
chk "sa date de début est aujourd'hui" "$(date +%F)" "$(val "['date_debut']" | cut -c1-10)"
chk "un seul jour est attendu, celui d'aujourd'hui" 1 "$(jours "$T_MARSA" 'TEST periode neuf')"

echo
echo "2. Une tournée déjà en service se saisit avec sa vraie date de début"
DEBUT=$(date -d '-10 days' +%F 2>/dev/null || date -v-10d +%F)
code -X POST "$API/circuits" -H "Authorization: Bearer $T_MARSA" -H 'Content-Type: application/json' \
  -d "{\"communeId\":\"tunis_la_marsa\",\"nom\":\"TEST periode ancien\",\"prestataireId\":\"$PRESTATAIRE\",\"joursPassage\":[1,2,3,4,5,6,7],\"dateDebut\":\"$DEBUT\"}" >/dev/null
C_ANCIEN=$(val "['id']")
chk "onze jours sont attendus, du début à aujourd'hui" 11 "$(jours "$T_MARSA" 'TEST periode ancien')"

echo
echo "3. Une fin de contrat arrête les attentes sans effacer l'historique"
FIN=$(date -d '-5 days' +%F 2>/dev/null || date -v-5d +%F)
CODE=$(code -X PATCH "$API/circuits/$C_ANCIEN" -H "Authorization: Bearer $T_MARSA" -H 'Content-Type: application/json' \
  -d "{\"dateFin\":\"$FIN\"}")
chk "la commune pose la date de fin" 200 "$CODE"
chk "six jours restent attendus, plus aucun après" 6 "$(jours "$T_MARSA" 'TEST periode ancien')"

echo
echo "4. Le prestataire ne répond que de ses propres circuits"
code -X POST "$API/circuits" -H "Authorization: Bearer $T_MARSA" -H 'Content-Type: application/json' \
  -d "{\"communeId\":\"tunis_la_marsa\",\"nom\":\"TEST periode regie\",\"joursPassage\":[1,2,3,4,5,6,7]}" >/dev/null
chk "la commune voit le circuit de sa régie" 1 "$(jours "$T_MARSA" 'TEST periode regie')"
# Le défaut d'origine : can_read_commune ouvrait au prestataire tous les
# circuits des communes où il est sous contrat, régie comprise.
chk "le prestataire ne voit pas le circuit de la régie" 0 "$(jours "$T_PREST" 'TEST periode regie')"
chk "il voit bien le sien" 1 "$(jours "$T_PREST" 'TEST periode neuf')"

echo
echo "5. La performance contractuelle compte les mêmes passages"
ATTENDUS=$(curl -s "$API/circuits/performance?communeId=tunis_la_marsa" -H "Authorization: Bearer $T_MARSA" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(sum(x['passages_attendus'] for x in d if x['prestataire_nom']))" 2>/dev/null)
# 1 (circuit neuf) + 6 (circuit clos) = 7, la régie n'ayant pas de prestataire.
chk "les passages attendus sont bornés comme la confrontation" 7 "$ATTENDUS"

nettoyer

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
